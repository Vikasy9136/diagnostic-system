import {
  type InventoryItemMaster,
  type KitSerialRecord,
  type StockBatchRecord,
  type StockTransactionRecord,
  type TubeSerialRecord,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { DEV_DATA_STORE } from './devStore';

export interface InventoryDashboardSummary {
  valuation: {
    totalStockValuationInr: number;
    totalActiveSkus: number;
    totalStockUnits: number;
  };
  kits: {
    totalAssembled: number;
    warehouseKits: number;
    inTransitKits: number;
    availableWithPhleboKits: number;
    consumedKits: number;
  };
  tubes: {
    totalSerialized: number;
    withWarehouse: number;
    withPhlebo: number;
    collectedOrDelivered: number;
  };
  alerts: {
    lowStockItems: Array<{
      id: string;
      name: string;
      sku: string;
      currentStock: number;
      reorderLevel: number;
      unit: string;
    }>;
    expiringBatches: Array<{
      batchNumber: string;
      itemId: string;
      sku: string;
      expiryDate: string;
      daysUntilExpiry: number;
      currentQuantity: number;
      isExpired: boolean;
    }>;
  };
  recentTransactions: StockTransactionRecord[];
}

export async function getInventoryDashboardSummary(): Promise<InventoryDashboardSummary> {
  const { db, isMockMode } = initializeFirebase();
  const nowMs = Date.now();

  let items: InventoryItemMaster[] = [];
  let batches: StockBatchRecord[] = [];
  let kits: KitSerialRecord[] = [];
  let tubes: TubeSerialRecord[] = [];
  let transactions: StockTransactionRecord[] = [];

  if (!isMockMode && db) {
    const [itemsSnap, batchesSnap, kitsSnap, tubesSnap, txSnap] = await Promise.all([
      db.collection('inventory_items').get(),
      db.collection('inventory_batches').get(),
      db.collection('kit_serials').limit(500).get(),
      db.collection('tube_serials').limit(1000).get(),
      db.collection('stock_transactions').orderBy('timestamp', 'desc').limit(50).get(),
    ]);

    items = itemsSnap.docs.map((d) => d.data() as InventoryItemMaster);
    batches = batchesSnap.docs.map((d) => d.data() as StockBatchRecord);
    kits = kitsSnap.docs.map((d) => d.data() as KitSerialRecord);
    tubes = tubesSnap.docs.map((d) => d.data() as TubeSerialRecord);
    transactions = txSnap.docs.map((d) => d.data() as StockTransactionRecord);
  } else {
    items = Array.from(DEV_DATA_STORE.inventoryItems.values()) as InventoryItemMaster[];
    batches = Array.from(DEV_DATA_STORE.stockBatches.values()) as StockBatchRecord[];
    kits = Array.from(DEV_DATA_STORE.kitSerials.values()) as KitSerialRecord[];
    tubes = Array.from(DEV_DATA_STORE.tubeSerials.values()) as TubeSerialRecord[];
    transactions = DEV_DATA_STORE.stockTransactions.slice(-50).reverse();
  }

  // Stock Valuation calculation: sum(batch.availableQuantity * batch.unitCostInr)
  let totalStockValuationInr = 0;
  let totalStockUnits = 0;
  const itemStockMap = new Map<string, number>();

  for (const b of batches) {
    const qty = b.availableQuantity ?? 0;
    const price = b.unitCostInr ?? 0;
    totalStockUnits += qty;
    itemStockMap.set(b.itemId, (itemStockMap.get(b.itemId) || 0) + qty);
    if (qty > 0 && price > 0) {
      totalStockValuationInr += qty * price;
    }
  }

  // Kits breakdown
  const warehouseKits = kits.filter((k) => k.currentLocationType === 'CENTRAL_WAREHOUSE' && k.currentStatus === 'READY').length;
  const inTransitKits = kits.filter((k) => k.currentStatus === 'IN_TRANSIT' || k.currentStatus === 'ISSUED').length;
  const availableWithPhleboKits = kits.filter(
    (k) => k.currentLocationType === 'PHLEBOTOMIST' && (k.currentStatus === 'AVAILABLE_WITH_PHLEBO' || k.currentStatus === 'ISSUED')
  ).length;
  const consumedKits = kits.filter((k) => k.currentStatus === 'USED' || k.currentStatus === 'OPENED' || k.currentStatus === 'IN_USE').length;

  // Tubes breakdown
  const withWarehouseTubes = tubes.filter((t) => t.currentLocationType === 'WAREHOUSE').length;
  const withPhleboTubes = tubes.filter((t) => t.currentLocationType === 'PHLEBO').length;
  const collectedOrDeliveredTubes = tubes.filter(
    (t) =>
      t.currentLocationType === 'TESTING_LAB' ||
      t.currentStatus === 'SAMPLE_COLLECTED' ||
      t.currentStatus === 'HANDED_OVER_TO_LAB' ||
      t.currentStatus === 'RECEIVED_BY_LAB'
  ).length;

  // Low-Stock alerts
  const lowStockItems = items
    .filter((it) => (itemStockMap.get(it.id) || 0) <= (it.reorderLevel || it.minimumStock || 0))
    .map((it) => ({
      id: it.id,
      name: it.name,
      sku: it.sku,
      currentStock: itemStockMap.get(it.id) || 0,
      reorderLevel: it.reorderLevel || it.minimumStock || 0,
      unit: it.baseUnit,
    }));

  // Expiring Batches (within 90 days or already expired)
  const expiringBatches = batches
    .filter((b) => b.expiryDate && (b.availableQuantity ?? 0) > 0)
    .map((b) => {
      const expMs = new Date(b.expiryDate).getTime();
      const daysUntilExpiry = Math.round((expMs - nowMs) / 86400000);
      return {
        batchNumber: b.batchNumber,
        itemId: b.itemId,
        sku: b.itemSku,
        expiryDate: b.expiryDate,
        daysUntilExpiry,
        currentQuantity: b.availableQuantity ?? 0,
        isExpired: daysUntilExpiry <= 0,
      };
    })
    .filter((b) => b.daysUntilExpiry <= 90)
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  return {
    valuation: {
      totalStockValuationInr: Math.round(totalStockValuationInr * 100) / 100,
      totalActiveSkus: items.length,
      totalStockUnits,
    },
    kits: {
      totalAssembled: kits.length,
      warehouseKits,
      inTransitKits,
      availableWithPhleboKits,
      consumedKits,
    },
    tubes: {
      totalSerialized: tubes.length,
      withWarehouse: withWarehouseTubes,
      withPhlebo: withPhleboTubes,
      collectedOrDelivered: collectedOrDeliveredTubes,
    },
    alerts: {
      lowStockItems,
      expiringBatches,
    },
    recentTransactions: transactions.slice(0, 30),
  };
}

export async function getStockTransactionsLedger(filter?: {
  itemId?: string;
  batchNumber?: string;
  transactionType?: string;
  limit?: number;
  limitCount?: number;
}): Promise<StockTransactionRecord[]> {
  const { db, isMockMode } = initializeFirebase();
  const limit = filter?.limit || filter?.limitCount || 100;

  if (!isMockMode && db) {
    let q = db.collection('stock_transactions').orderBy('timestamp', 'desc');
    if (filter?.itemId) {
      q = q.where('itemId', '==', filter.itemId);
    }
    if (filter?.batchNumber) {
      q = q.where('batchNumber', '==', filter.batchNumber);
    }
    if (filter?.transactionType) {
      q = q.where('transactionType', '==', filter.transactionType);
    }
    const snap = await q.limit(limit).get();
    return snap.docs.map((d) => d.data() as StockTransactionRecord);
  }

  let list = [...DEV_DATA_STORE.stockTransactions].reverse();
  if (filter?.itemId) {
    list = list.filter((t) => t.itemId === filter.itemId);
  }
  if (filter?.batchNumber) {
    list = list.filter((t) => t.batchNumber === filter.batchNumber);
  }
  if (filter?.transactionType) {
    list = list.filter((t) => t.transactionType === filter.transactionType);
  }
  return list.slice(0, limit);
}
