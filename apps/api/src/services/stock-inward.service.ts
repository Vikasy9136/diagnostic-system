import * as admin from 'firebase-admin';
import {
  type InventoryPackageUnit,
  type StockBalanceRecord,
  type StockBatchRecord,
  type StockInwardItem,
  type StockInwardRecord,
  type StockTransactionRecord,
  deepCleanFirestorePayload,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { DEV_DATA_STORE } from './devStore';
import {
  DEFAULT_CENTRAL_WAREHOUSE,
  getCentralWarehouses,
  getInventoryItemById,
  getInventorySuppliers,
} from './inventory-master.service';

export interface InwardItemInput {
  itemId: string;
  scannedSupplierBarcode?: string;
  packageUnit: InventoryPackageUnit;
  packageQuantity: number;
  unitsPerPackage: number;
  batchNumber: string;
  mfgDate?: string;
  expiryDate: string;
  unitCostInr: number;
  warehouseLocationId?: string;
}

export interface ProcessStockInwardInput {
  supplierId: string;
  poNumber?: string;
  invoiceNumber?: string;
  warehouseId?: string;
  items: InwardItemInput[];
  notes?: string;
}

export interface ProcessStockInwardResult {
  success: boolean;
  inwardRecord: StockInwardRecord;
  transactions: StockTransactionRecord[];
  batches: StockBatchRecord[];
}

export async function processStockInward(
  input: ProcessStockInwardInput,
  actor: { uid: string; email: string }
): Promise<ProcessStockInwardResult> {
  const { db, isMockMode } = initializeFirebase();
  const now = new Date().toISOString();

  if (!input.items || input.items.length === 0) {
    throw new Error('At least one inventory item is required for stock inward.');
  }

  // Verify Supplier
  const suppliers = await getInventorySuppliers();
  const supplier = suppliers.find((s) => s.id === input.supplierId);
  const supplierName = supplier ? supplier.name : 'Direct Diagnostics Supplier';

  // Determine Central Warehouse
  const warehouses = await getCentralWarehouses();
  const targetWarehouse = warehouses.find((w) => w.id === input.warehouseId) || warehouses[0] || DEFAULT_CENTRAL_WAREHOUSE;
  const warehouseId = targetWarehouse.id;

  const inwardId = `INW-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const inwardNumber = `INW-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

  let totalPackages = 0;
  let totalBaseUnits = 0;
  let totalAmountInr = 0;

  const inwardItems: StockInwardItem[] = [];
  const batchesToCreate: StockBatchRecord[] = [];
  const transactionsToCreate: StockTransactionRecord[] = [];

  for (let i = 0; i < input.items.length; i++) {
    const raw = input.items[i];
    const itemMaster = await getInventoryItemById(raw.itemId);
    if (!itemMaster) {
      throw new Error(`Item ${raw.itemId} does not exist in master catalog.`);
    }

    const packageQty = Number(raw.packageQuantity);
    const unitsPerPkg = Number(raw.unitsPerPackage) || itemMaster.unitsPerPackage || 1;
    const baseQuantity = packageQty * unitsPerPkg;
    const costPerPackage = Number(raw.unitCostInr);
    const lineTotalCost = packageQty * costPerPackage;
    const costPerBaseUnit = unitsPerPkg > 0 ? costPerPackage / unitsPerPkg : costPerPackage;

    totalPackages += packageQty;
    totalBaseUnits += baseQuantity;
    totalAmountInr += lineTotalCost;

    const inwardItem: StockInwardItem = {
      itemId: itemMaster.id,
      itemName: itemMaster.name,
      sku: itemMaster.sku,
      category: itemMaster.category,
      scannedSupplierBarcode: raw.scannedSupplierBarcode,
      packageUnit: raw.packageUnit || itemMaster.purchasePackageUnit,
      packageQuantity: packageQty,
      unitsPerPackage: unitsPerPkg,
      totalBaseQuantity: baseQuantity,
      baseUnit: itemMaster.baseUnit,
      batchNumber: raw.batchNumber.trim(),
      mfgDate: raw.mfgDate,
      expiryDate: raw.expiryDate,
      unitCostInr: costPerPackage,
      totalCostInr: lineTotalCost,
      warehouseLocationId: raw.warehouseLocationId,
    };
    inwardItems.push(inwardItem);

    // Create / Update Batch
    const cleanBatch = raw.batchNumber.trim().replace(/[^A-Za-z0-9_-]/g, '-').toUpperCase();
    const batchId = `BATCH-${itemMaster.id}-${cleanBatch}`;
    const batchRecord: StockBatchRecord = {
      id: batchId,
      batchNumber: raw.batchNumber.trim(),
      itemId: itemMaster.id,
      itemSku: itemMaster.sku,
      supplierId: input.supplierId,
      supplierName,
      mfgDate: raw.mfgDate || now.split('T')[0],
      expiryDate: raw.expiryDate,
      initialQuantity: baseQuantity,
      availableQuantity: baseQuantity,
      reservedQuantity: 0,
      consumedQuantity: 0,
      warehouseId,
      locationId: raw.warehouseLocationId,
      unitCostInr: costPerBaseUnit,
      status: 'ACTIVE',
      receivedAt: now,
      updatedAt: now,
    };
    batchesToCreate.push(batchRecord);

    // Double-Entry Ledger Transaction
    const txId = `TX-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const txRecord: StockTransactionRecord = {
      id: txId,
      transactionType: 'INWARD_RECEIPT',
      itemId: itemMaster.id,
      itemSku: itemMaster.sku,
      batchId,
      batchNumber: raw.batchNumber.trim(),
      quantityDelta: baseQuantity,
      balanceAfter: baseQuantity,
      sourceLocation: `SUPPLIER:${input.supplierId}`,
      destinationLocation: `WAREHOUSE:${warehouseId}`,
      referenceId: inwardId,
      notes: `Inwarded from ${supplierName}. Invoice: ${input.invoiceNumber || 'N/A'}. Batch: ${raw.batchNumber}`,
      actorUid: actor.uid,
      actorEmail: actor.email,
      timestamp: now,
    };
    transactionsToCreate.push(txRecord);
  }

  const inwardRecord: StockInwardRecord = {
    id: inwardId,
    inwardNumber,
    supplierId: input.supplierId,
    supplierName,
    poNumber: input.poNumber,
    invoiceNumber: input.invoiceNumber,
    status: 'APPROVED',
    items: inwardItems,
    totalPackages,
    totalBaseUnits,
    totalAmountInr,
    warehouseId,
    submittedByUid: actor.uid,
    submittedByEmail: actor.email,
    approvedByUid: actor.uid,
    approvedByEmail: actor.email,
    approvedAt: now,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };

  // Perform updates in live Firestore or in dev store
  if (db && !isMockMode) {
    const batch = db.batch();

    // 1. Write Inward Record
    batch.set(db.collection('stockInwards').doc(inwardId), deepCleanFirestorePayload(inwardRecord));

    // 2. Write Batches
    for (const b of batchesToCreate) {
      batch.set(db.collection('stockBatches').doc(b.id), deepCleanFirestorePayload(b), { merge: true });
    }

    // 3. Write Transactions
    for (const tx of transactionsToCreate) {
      batch.set(db.collection('stockTransactions').doc(tx.id), deepCleanFirestorePayload(tx));
    }

    // 4. Update Warehouse Stock Balances
    for (const inItem of inwardItems) {
      const stockBalanceId = `BAL-${warehouseId}-${inItem.itemId}`;
      const stockBalanceRef = db.collection('warehouseStock').doc(stockBalanceId);

      // In Firestore batch, set or merge balance
      batch.set(
        stockBalanceRef,
        {
          id: stockBalanceId,
          warehouseId,
          itemId: inItem.itemId,
          itemSku: inItem.sku,
          category: inItem.category,
          unit: inItem.baseUnit,
          totalOnHand: admin.firestore.FieldValue.increment(inItem.totalBaseQuantity),
          totalAvailableLoose: admin.firestore.FieldValue.increment(inItem.totalBaseQuantity),
          lastUpdated: now,
        },
        { merge: true }
      );
    }

    await batch.commit();
  }

  // Update In-Memory Dev Store
  DEV_DATA_STORE.stockInwards.set(inwardId, inwardRecord);
  for (const b of batchesToCreate) {
    DEV_DATA_STORE.stockBatches.set(b.id, b);
  }
  for (const tx of transactionsToCreate) {
    DEV_DATA_STORE.stockTransactions.unshift(tx);
  }
  for (const inItem of inwardItems) {
    const stockBalanceId = `BAL-${warehouseId}-${inItem.itemId}`;
    const existing = DEV_DATA_STORE.warehouseStock.get(stockBalanceId) as StockBalanceRecord | undefined;
    const currentOnHand = existing ? existing.totalOnHand + inItem.totalBaseQuantity : inItem.totalBaseQuantity;
    const currentLoose = existing ? existing.totalAvailableLoose + inItem.totalBaseQuantity : inItem.totalBaseQuantity;
    DEV_DATA_STORE.warehouseStock.set(stockBalanceId, {
      id: stockBalanceId,
      warehouseId,
      itemId: inItem.itemId,
      itemSku: inItem.sku,
      category: inItem.category,
      totalOnHand: currentOnHand,
      totalAllocatedInKits: existing?.totalAllocatedInKits || 0,
      totalAvailableLoose: currentLoose,
      totalReserved: existing?.totalReserved || 0,
      unit: inItem.baseUnit,
      lastUpdated: now,
    });
  }

  return {
    success: true,
    inwardRecord,
    batches: batchesToCreate,
    transactions: transactionsToCreate,
  };
}

export async function getStockInwardHistory(limit = 50): Promise<StockInwardRecord[]> {
  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    try {
      const snap = await db.collection('stockInwards').orderBy('createdAt', 'desc').limit(limit).get();
      if (!snap.empty) {
        return snap.docs.map((doc) => doc.data() as StockInwardRecord);
      }
    } catch (err) {
      console.warn('Failed querying stockInwards from Firestore:', err);
    }
  }

  return Array.from(DEV_DATA_STORE.stockInwards.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export async function getStockBatches(itemId?: string): Promise<StockBatchRecord[]> {
  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    try {
      let q = db.collection('stockBatches') as FirebaseFirestore.Query;
      if (itemId) {
        q = q.where('itemId', '==', itemId);
      }
      q = q.where('status', '==', 'ACTIVE');
      const snap = await q.get();
      if (!snap.empty) {
        const list = snap.docs.map((doc) => doc.data() as StockBatchRecord);
        return list.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
      }
    } catch (err) {
      console.warn('Failed querying stockBatches from Firestore:', err);
    }
  }

  const all = Array.from(DEV_DATA_STORE.stockBatches.values());
  const filtered = itemId ? all.filter((b) => b.itemId === itemId && b.status === 'ACTIVE') : all.filter((b) => b.status === 'ACTIVE');
  return filtered.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
}

export async function getStockTransactions(limit = 100): Promise<StockTransactionRecord[]> {
  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    try {
      const snap = await db.collection('stockTransactions').orderBy('timestamp', 'desc').limit(limit).get();
      if (!snap.empty) {
        return snap.docs.map((doc) => doc.data() as StockTransactionRecord);
      }
    } catch (err) {
      console.warn('Failed querying stockTransactions from Firestore:', err);
    }
  }

  return (DEV_DATA_STORE.stockTransactions as StockTransactionRecord[]).slice(0, limit);
}

export async function getWarehouseStockBalances(warehouseId = 'WH-CENTRAL-MAIN'): Promise<StockBalanceRecord[]> {
  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    try {
      const snap = await db.collection('warehouseStock').where('warehouseId', '==', warehouseId).get();
      if (!snap.empty) {
        return snap.docs.map((doc) => doc.data() as StockBalanceRecord);
      }
    } catch (err) {
      console.warn('Failed querying warehouseStock from Firestore:', err);
    }
  }

  return Array.from(DEV_DATA_STORE.warehouseStock.values()).filter(
    (b: any) => b.warehouseId === warehouseId
  );
}
