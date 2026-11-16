import * as admin from 'firebase-admin';
import {
  type KitAssemblyBatchAllocation,
  type KitAssemblyRecord,
  type KitSerialRecord,
  type StockBalanceRecord,
  type StockBatchRecord,
  type StockTransactionRecord,
  type TubeSerialRecord,
  TubeType,
  deepCleanFirestorePayload,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { DEV_DATA_STORE } from './devStore';
import { getKitActiveBOM, getKitDefinitionById } from './kit-master.service';
import { getStockBatches } from './stock-inward.service';
import { generateKitSerialId, generateTubeSerialId } from './serialization.service';

export interface ComponentFeasibilityStatus {
  itemId: string;
  itemName: string;
  sku: string;
  requiredPerKit: number;
  totalRequired: number;
  availableLooseStock: number;
  deficit: number;
  hasSufficientStock: boolean;
}

export interface AssemblyFeasibilityResult {
  feasible: boolean;
  kitDefinitionId: string;
  kitCode: string;
  kitName: string;
  quantityToAssemble: number;
  components: ComponentFeasibilityStatus[];
  estimatedCostPerKitInr: number;
  estimatedTotalBatchCostInr: number;
  unmetRequirementsCount: number;
}

export interface ExecuteKitAssemblyInput {
  kitDefinitionId: string;
  quantityToAssemble: number;
  warehouseId?: string;
  notes?: string;
}

export interface ExecuteKitAssemblyResult {
  success: boolean;
  assemblyRecord: KitAssemblyRecord;
  allocatedBatches: KitAssemblyBatchAllocation[];
  transactions: StockTransactionRecord[];
  kitSerials?: KitSerialRecord[];
  tubeSerials?: TubeSerialRecord[];
}

/**
 * Validates stock availability of all BOM components before an assembly run
 */
export async function validateKitAssemblyFeasibility(
  kitDefinitionId: string,
  quantityToAssemble: number,
  warehouseId = 'WH-CENTRAL-MAIN'
): Promise<AssemblyFeasibilityResult> {
  const kit = await getKitDefinitionById(kitDefinitionId);
  if (!kit) {
    throw new Error(`Kit definition ${kitDefinitionId} not found.`);
  }

  const bom = await getKitActiveBOM(kitDefinitionId);
  if (!bom || !bom.components || bom.components.length === 0) {
    throw new Error(`No active Bill of Materials recipe found for ${kit.name}.`);
  }

  const { db, isMockMode } = initializeFirebase();
  const componentsStatus: ComponentFeasibilityStatus[] = [];
  let unmetCount = 0;

  for (const comp of bom.components) {
    const totalRequired = comp.quantity * quantityToAssemble;
    let availableLooseStock = 0;

    const balanceDocId = `BAL-${warehouseId}-${comp.itemId}`;

    if (db && !isMockMode) {
      try {
        const balSnap = await db.collection('warehouseStock').doc(balanceDocId).get();
        if (balSnap.exists) {
          const balData = balSnap.data() as StockBalanceRecord;
          availableLooseStock = balData.totalAvailableLoose ?? balData.totalOnHand ?? 0;
        }
      } catch (err) {
        console.warn(`Failed reading stock balance for ${comp.itemId}:`, err);
      }
    }

    if (availableLooseStock === 0) {
      const devBal = DEV_DATA_STORE.warehouseStock.get(balanceDocId) as StockBalanceRecord | undefined;
      availableLooseStock = devBal?.totalAvailableLoose ?? devBal?.totalOnHand ?? 0;
    }

    const deficit = Math.max(0, totalRequired - availableLooseStock);
    const hasSufficientStock = availableLooseStock >= totalRequired;
    if (!hasSufficientStock) unmetCount++;

    componentsStatus.push({
      itemId: comp.itemId,
      itemName: comp.itemName,
      sku: comp.sku,
      requiredPerKit: comp.quantity,
      totalRequired,
      availableLooseStock,
      deficit,
      hasSufficientStock,
    });
  }

  const feasible = unmetCount === 0;
  const estimatedCostPerKit = kit.estimatedCostPerKitInr || 35.0;
  const estimatedTotalBatchCost = estimatedCostPerKit * quantityToAssemble;

  return {
    feasible,
    kitDefinitionId: kit.id,
    kitCode: kit.kitCode,
    kitName: kit.name,
    quantityToAssemble,
    components: componentsStatus,
    estimatedCostPerKitInr: estimatedCostPerKit,
    estimatedTotalBatchCostInr: estimatedTotalBatchCost,
    unmetRequirementsCount: unmetCount,
  };
}

/**
 * Executes Central Warehouse Kit Assembly Run
 * Atomically allocates BOM components using FEFO and creates immutable deduction transactions.
 */
export async function executeKitAssembly(
  input: ExecuteKitAssemblyInput,
  actor: { uid: string; email: string }
): Promise<ExecuteKitAssemblyResult> {
  const warehouseId = input.warehouseId || 'WH-CENTRAL-MAIN';
  const qty = Number(input.quantityToAssemble);

  if (!qty || qty <= 0) {
    throw new Error('Quantity to assemble must be greater than zero.');
  }

  const feasibility = await validateKitAssemblyFeasibility(input.kitDefinitionId, qty, warehouseId);
  if (!feasibility.feasible) {
    const missing = feasibility.components
      .filter((c) => !c.hasSufficientStock)
      .map((c) => `${c.itemName} (Need ${c.totalRequired}, Available: ${c.availableLooseStock})`)
      .join('; ');
    throw new Error(`Insufficient loose central warehouse stock to assemble ${qty} kits. Missing: ${missing}`);
  }

  const kit = await getKitDefinitionById(input.kitDefinitionId);
  const bom = await getKitActiveBOM(input.kitDefinitionId);
  if (!kit || !bom) {
    throw new Error('Kit definition or active BOM recipe unavailable.');
  }

  const { db, isMockMode } = initializeFirebase();
  const now = new Date().toISOString();
  const assemblyId = `ASM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const assemblyCode = `ASM-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

  const allocatedBatches: KitAssemblyBatchAllocation[] = [];
  const transactionsToCreate: StockTransactionRecord[] = [];
  const batchUpdates: Array<{ batchId: string; deduct: number }> = [];
  let earliestComponentExpiry = '2099-12-31';
  let totalTubesSerialized = 0;

  for (const comp of bom.components) {
    let remainingNeeded = comp.quantity * qty;
    if (comp.isIndividuallySerialized) {
      totalTubesSerialized += comp.quantity * qty;
    }

    // Get active batches for this item in FEFO order (earliest expiry first)
    const activeBatches = await getStockBatches(comp.itemId);

    for (const lot of activeBatches) {
      if (remainingNeeded <= 0) break;
      const canTake = Math.min(lot.availableQuantity, remainingNeeded);
      if (canTake > 0) {
        remainingNeeded -= canTake;
        allocatedBatches.push({
          itemId: comp.itemId,
          batchId: lot.id,
          batchNumber: lot.batchNumber,
          quantityDeducted: canTake,
          expiryDate: lot.expiryDate,
        });

        batchUpdates.push({ batchId: lot.id, deduct: canTake });

        if (lot.expiryDate < earliestComponentExpiry) {
          earliestComponentExpiry = lot.expiryDate;
        }

        // Double-entry deduction transaction
        const txId = `TX-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        const txRecord: StockTransactionRecord = {
          id: txId,
          transactionType: 'KIT_ASSEMBLY_DEDUCTION',
          itemId: comp.itemId,
          itemSku: comp.sku,
          batchId: lot.id,
          batchNumber: lot.batchNumber,
          quantityDelta: -canTake,
          balanceAfter: Math.max(0, lot.availableQuantity - canTake),
          sourceLocation: `WAREHOUSE:${warehouseId}`,
          destinationLocation: `ASSEMBLY:${assemblyCode}`,
          referenceId: assemblyId,
          notes: `Deducted for Kit Assembly: ${qty}x ${kit.name} (${kit.kitCode})`,
          actorUid: actor.uid,
          actorEmail: actor.email,
          timestamp: now,
        };
        transactionsToCreate.push(txRecord);
      }
    }
  }

  // Generate serialized physical kit records and tube records (Milestone 4 Serialization Engine)
  const kitSerialsList: KitSerialRecord[] = [];
  const tubeSerialsList: TubeSerialRecord[] = [];
  let tubeCounter = 0;

  for (let k = 0; k < qty; k++) {
    const kitSerialId = generateKitSerialId(undefined, (Date.now() % 10000) + k);
    const kitRecord: KitSerialRecord = {
      id: kitSerialId,
      kitSerial: kitSerialId,
      barcode: kitSerialId,
      kitDefinitionId: kit.id,
      kitCode: kit.kitCode,
      kitName: kit.name,
      bomVersionId: bom.id,
      bomVersion: bom.version,
      assemblyId,
      assemblyBatch: assemblyCode,
      assembledAt: now,
      expiryDate: earliestComponentExpiry === '2099-12-31' ? '2028-12-31' : earliestComponentExpiry,
      currentStatus: 'READY',
      currentLocationType: 'CENTRAL_WAREHOUSE',
      currentLocationId: warehouseId,
      createdAt: now,
      updatedAt: now,
    };
    kitSerialsList.push(kitRecord);

    // Generate individual tube serials for each serialized tube in BOM
    for (const comp of bom.components) {
      if (comp.isIndividuallySerialized) {
        for (let t = 0; t < comp.quantity; t++) {
          const tubeSerialId = generateTubeSerialId(undefined, (Date.now() % 100000) + tubeCounter++);
          const lotAlloc = allocatedBatches.find((ab) => ab.itemId === comp.itemId);
          const tubeRecord: TubeSerialRecord = {
            id: tubeSerialId,
            tubeSerial: tubeSerialId,
            barcodeValue: tubeSerialId,
            supplierBarcodeRef: lotAlloc?.batchNumber || '',
            itemId: comp.itemId,
            sku: comp.sku,
            tubeType: comp.tubeType || TubeType.EDTA_LAVENDER,
            brand: 'BD Vacutainer Diagnostics',
            supplierName: 'Becton Dickinson India',
            supplierBatch: lotAlloc?.batchNumber || 'LOT-2026',
            expiryDate: lotAlloc?.expiryDate || '2028-12-31',
            parentKitId: kitSerialId,
            assemblyId,
            bomVersion: bom.version,
            currentStatus: 'SEALED_IN_KIT',
            currentLocationType: 'WAREHOUSE',
            currentLocationId: warehouseId,
            createdAt: now,
            createdBy: actor.email,
            updatedAt: now,
          };
          tubeSerialsList.push(tubeRecord);
        }
      }
    }
  }

  const assemblyRecord: KitAssemblyRecord = {
    id: assemblyId,
    assemblyCode,
    kitDefinitionId: kit.id,
    kitCode: kit.kitCode,
    kitName: kit.name,
    bomVersionId: bom.id,
    bomVersion: bom.version,
    plannedQuantity: qty,
    assembledQuantity: qty,
    allocatedBatches,
    generatedKitSerials: kitSerialsList.map((k) => k.kitSerial),
    totalTubesSerialized,
    status: 'COMPLETED',
    earliestComponentExpiry: earliestComponentExpiry === '2099-12-31' ? '2028-12-31' : earliestComponentExpiry,
    warehouseId,
    assembledByUid: actor.uid,
    assembledByEmail: actor.email,
    assembledAt: now,
    notes: input.notes || 'Central warehouse kit production run with automatic loose component deduction',
  };

  // Perform atomic updates
  if (db && !isMockMode) {
    const batch = db.batch();

    // 1. Write Assembly Record
    batch.set(db.collection('kitAssemblies').doc(assemblyId), deepCleanFirestorePayload(assemblyRecord));

    // 2. Write Ledger Transactions
    for (const tx of transactionsToCreate) {
      batch.set(db.collection('stockTransactions').doc(tx.id), deepCleanFirestorePayload(tx));
    }

    // 3. Update Batch Quantities
    for (const bUp of batchUpdates) {
      batch.update(db.collection('stockBatches').doc(bUp.batchId), {
        availableQuantity: admin.firestore.FieldValue.increment(-bUp.deduct),
        consumedQuantity: admin.firestore.FieldValue.increment(bUp.deduct),
        updatedAt: now,
      });
    }

    // 4. Update Warehouse Loose Stock Balances
    for (const comp of bom.components) {
      const deductTotal = comp.quantity * qty;
      const stockBalanceId = `BAL-${warehouseId}-${comp.itemId}`;
      batch.set(
        db.collection('warehouseStock').doc(stockBalanceId),
        {
          totalOnHand: admin.firestore.FieldValue.increment(-deductTotal),
          totalAvailableLoose: admin.firestore.FieldValue.increment(-deductTotal),
          totalAllocatedInKits: admin.firestore.FieldValue.increment(deductTotal),
          lastUpdated: now,
        },
        { merge: true }
      );
    }

    // 5. Write Generated Kit Serials
    for (const ks of kitSerialsList) {
      batch.set(db.collection('kitSerials').doc(ks.id), deepCleanFirestorePayload(ks));
    }

    // 6. Write Generated Tube Serials
    for (const ts of tubeSerialsList) {
      batch.set(db.collection('tubeSerials').doc(ts.id), deepCleanFirestorePayload(ts));
    }

    await batch.commit();
  }

  // Update In-Memory Store
  DEV_DATA_STORE.kitAssemblies.set(assemblyId, assemblyRecord);
  for (const tx of transactionsToCreate) {
    DEV_DATA_STORE.stockTransactions.unshift(tx);
  }
  for (const bUp of batchUpdates) {
    const lot = DEV_DATA_STORE.stockBatches.get(bUp.batchId) as StockBatchRecord | undefined;
    if (lot) {
      lot.availableQuantity = Math.max(0, lot.availableQuantity - bUp.deduct);
      lot.consumedQuantity = (lot.consumedQuantity || 0) + bUp.deduct;
      lot.updatedAt = now;
    }
  }
  for (const comp of bom.components) {
    const deductTotal = comp.quantity * qty;
    const stockBalanceId = `BAL-${warehouseId}-${comp.itemId}`;
    const bal = DEV_DATA_STORE.warehouseStock.get(stockBalanceId) as StockBalanceRecord | undefined;
    if (bal) {
      bal.totalOnHand = Math.max(0, bal.totalOnHand - deductTotal);
      bal.totalAvailableLoose = Math.max(0, bal.totalAvailableLoose - deductTotal);
      bal.totalAllocatedInKits = (bal.totalAllocatedInKits || 0) + deductTotal;
      bal.lastUpdated = now;
    }
  }
  for (const ks of kitSerialsList) {
    DEV_DATA_STORE.kitSerials.set(ks.id, ks);
  }
  for (const ts of tubeSerialsList) {
    DEV_DATA_STORE.tubeSerials.set(ts.id, ts);
  }

  return {
    success: true,
    assemblyRecord,
    allocatedBatches,
    transactions: transactionsToCreate,
    kitSerials: kitSerialsList,
    tubeSerials: tubeSerialsList,
  };
}

export async function getKitAssembliesHistory(limit = 50): Promise<KitAssemblyRecord[]> {
  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    try {
      const snap = await db.collection('kitAssemblies').orderBy('assembledAt', 'desc').limit(limit).get();
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as KitAssemblyRecord);
      }
    } catch (err) {
      console.warn('Failed querying kitAssemblies from Firestore:', err);
    }
  }

  return Array.from(DEV_DATA_STORE.kitAssemblies.values())
    .sort((a, b) => new Date(b.assembledAt).getTime() - new Date(a.assembledAt).getTime())
    .slice(0, limit);
}
