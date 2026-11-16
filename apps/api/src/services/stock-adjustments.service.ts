import {
  deepCleanFirestorePayload,
  type InventoryItemMaster,
  type StockAdjustmentRecord,
  type StockBatchRecord,
  type StockTransactionRecord,
  type StockTransactionType,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { AppError } from '../middleware/errorHandler';
import { DEV_DATA_STORE } from './devStore';

export type StockAdjustmentType = 'COUNT_RECONCILIATION' | 'DAMAGE' | 'LOSS' | 'EXPIRY' | 'SAMPLE_TESTING';

/**
 * Milestone 10: Adjustments, Damage, Expiry, and Returns write-offs
 * Invariant: Every stock movement generates an immutable StockTransactionRecord.
 */
export async function createStockAdjustment(params: {
  itemId: string;
  batchNumber: string;
  quantityDelta: number; // Negative for loss/damage/expiry write-off, positive for found/audit surplus
  adjustmentType: StockAdjustmentType;
  reason?: string;
  notes?: string;
  performedByEmail: string;
  performedByUid?: string;
  warehouseId?: string;
}): Promise<{
  success: boolean;
  adjustment: StockAdjustmentRecord;
  updatedStock: number;
  message: string;
}> {
  const {
    itemId,
    batchNumber,
    quantityDelta,
    adjustmentType,
    reason,
    notes,
    performedByEmail,
    performedByUid = 'admin-root',
    warehouseId = 'WH-CENTRAL-MAIN',
  } = params;
  const { db, isMockMode } = initializeFirebase();
  const now = new Date().toISOString();

  if (quantityDelta === 0) {
    throw new AppError('Quantity delta must be non-zero for stock adjustments.', 400, 'INVALID_DELTA');
  }

  // 1. Fetch Item & Batch
  let item: InventoryItemMaster | null = null;
  let batch: StockBatchRecord | null = null;

  if (!isMockMode && db) {
    const itemSnap = await db.collection('inventory_items').doc(itemId).get();
    if (itemSnap.exists) {
      item = itemSnap.data() as InventoryItemMaster;
    }
    const bSnap = await db.collection('inventory_batches').doc(batchNumber).get();
    if (bSnap.exists) {
      batch = bSnap.data() as StockBatchRecord;
    }
  } else {
    item = (DEV_DATA_STORE.inventoryItems.get(itemId) as InventoryItemMaster) || null;
    batch = (DEV_DATA_STORE.stockBatches.get(batchNumber) as StockBatchRecord) || null;
  }

  if (!item) {
    throw new AppError(`Inventory item ${itemId} not found.`, 404, 'ITEM_NOT_FOUND');
  }
  if (!batch) {
    throw new AppError(`Batch ${batchNumber} not found for item ${itemId}.`, 404, 'BATCH_NOT_FOUND');
  }

  const currentBatchQty = batch.availableQuantity ?? 0;
  const newBatchQty = currentBatchQty + quantityDelta;
  if (newBatchQty < 0) {
    throw new AppError(
      `Cannot adjust batch ${batchNumber} by ${quantityDelta}: current quantity is ${currentBatchQty}. Negative stock is prohibited.`,
      400,
      'INSUFFICIENT_STOCK'
    );
  }

  const adjId = `ADJ-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const adjustment: StockAdjustmentRecord = {
    id: adjId,
    adjustmentNumber: `ADJN-${Date.now().toString(36).toUpperCase()}`,
    warehouseId,
    itemId,
    itemSku: item.sku,
    batchId: batch.id,
    adjustmentType,
    quantityDelta,
    reason: reason || notes || `Stock adjustment (${adjustmentType})`,
    authorizedByUid: performedByUid,
    authorizedByEmail: performedByEmail,
    timestamp: now,
  };

  const txType: StockTransactionType =
    adjustmentType === 'DAMAGE'
      ? 'DAMAGE_WRITEOFF'
      : adjustmentType === 'EXPIRY'
      ? 'EXPIRED_WRITEOFF'
      : 'MANUAL_ADJUSTMENT';

  const txRecord: StockTransactionRecord = {
    id: `TX-${adjId}`,
    transactionType: txType,
    itemId,
    itemSku: item.sku,
    batchId: batch.id,
    batchNumber,
    quantityDelta,
    balanceAfter: newBatchQty,
    sourceLocation: quantityDelta < 0 ? warehouseId : 'ADJUSTMENT_SURPLUS',
    destinationLocation: quantityDelta < 0 ? `SCRAP_${adjustmentType}` : warehouseId,
    referenceId: adjId,
    notes: `Stock adjustment (${adjustmentType}): delta ${quantityDelta > 0 ? `+${quantityDelta}` : quantityDelta} ${item.baseUnit}. ${notes || ''}`.trim(),
    actorUid: performedByUid,
    actorEmail: performedByEmail,
    timestamp: now,
  };

  const updatedBatch: StockBatchRecord = {
    ...batch,
    availableQuantity: newBatchQty,
    updatedAt: now,
  };

  if (!isMockMode && db) {
    const writeBatch = db.batch();
    writeBatch.set(db.collection('stock_adjustments').doc(adjId), deepCleanFirestorePayload(adjustment));
    writeBatch.set(db.collection('stock_transactions').doc(txRecord.id), deepCleanFirestorePayload(txRecord));
    writeBatch.set(db.collection('inventory_batches').doc(batchNumber), deepCleanFirestorePayload(updatedBatch), { merge: true });
    await writeBatch.commit();
  } else {
    DEV_DATA_STORE.stockBatches.set(batchNumber, updatedBatch);
    DEV_DATA_STORE.stockTransactions.push(txRecord);
  }

  return {
    success: true,
    adjustment,
    updatedStock: newBatchQty,
    message: `Adjusted ${Math.abs(quantityDelta)} ${item.baseUnit} on batch ${batchNumber} (${adjustmentType}). New batch stock: ${newBatchQty} ${item.baseUnit}.`,
  };
}

/**
 * Returns list of recent stock adjustments
 */
export async function getStockAdjustments(options?: {
  itemId?: string;
  limit?: number;
}): Promise<StockAdjustmentRecord[]> {
  const { db, isMockMode } = initializeFirebase();
  const limitCount = options?.limit || 100;
  if (!isMockMode && db) {
    let q: FirebaseFirestore.Query = db.collection('stock_adjustments');
    if (options?.itemId) {
      q = q.where('itemId', '==', options.itemId);
    }
    const snap = await q.orderBy('timestamp', 'desc').limit(limitCount).get();
    return snap.docs.map((d) => d.data() as StockAdjustmentRecord);
  }
  return [];
}
