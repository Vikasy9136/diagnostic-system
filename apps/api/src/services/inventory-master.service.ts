import {
  type InventoryBaseUnit,
  type InventoryItemMaster,
  type InventoryMaterialCategory,
  type InventoryPackageUnit,
  type SupplierBarcodeMapping,
  type SupplierRecord,
  type WarehouseRecord,
  TubeType,
  deepCleanFirestorePayload,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { DEV_DATA_STORE } from './devStore';

// Canonical default categories
export const DEFAULT_INVENTORY_CATEGORIES = [
  { id: 'CAT-VAC', name: 'Vacutainer Specimen Tubes', category: 'VACUTAINER' as InventoryMaterialCategory, icon: '🧪', sortOrder: 1 },
  { id: 'CAT-NDL', name: 'Blood Collection Needles & Holders', category: 'NEEDLE' as InventoryMaterialCategory, icon: '💉', sortOrder: 2 },
  { id: 'CAT-ACC', name: 'Collection Accessories (Swabs, Cotton, Tourniquet)', category: 'ACCESSORY' as InventoryMaterialCategory, icon: '🩹', sortOrder: 3 },
  { id: 'CAT-LBL', name: 'Thermal Barcode Labels & Ribbons', category: 'LABEL_STICKER' as InventoryMaterialCategory, icon: '🏷️', sortOrder: 4 },
  { id: 'CAT-PKG', name: 'Biohazard Pouches, Ice Packs & Cold Boxes', category: 'PACKAGING' as InventoryMaterialCategory, icon: '📦', sortOrder: 5 },
  { id: 'CAT-PPE', name: 'PPE & Gloves (Nitrile/Latex)', category: 'ACCESSORY' as InventoryMaterialCategory, icon: '🧤', sortOrder: 6 },
  { id: 'CAT-RGT', name: 'Testing Reagents & Strips', category: 'REAGENT' as InventoryMaterialCategory, icon: '🧬', sortOrder: 7 },
];

// Seed Starter Suppliers
export const DEFAULT_INVENTORY_SUPPLIERS: SupplierRecord[] = [
  {
    id: 'SUP-BD-01',
    name: 'Becton Dickinson India (BD)',
    gstin: '07AAACB0123M1Z5',
    contactPerson: 'Ajay Sharma',
    contactPhone: '+91 9811002233',
    contactEmail: 'orders.india@bd.com',
    address: 'Signature Tower B, Sector 30',
    city: 'Gurugram',
    state: 'Haryana',
    pincode: '122001',
    leadTimeDays: 3,
    paymentTermsDays: 30,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'SUP-DISPO-02',
    name: 'Hindustan Syringes & Medical Devices (Dispovan)',
    gstin: '06AAACH1234D1Z2',
    contactPerson: 'Sunil Verma',
    contactPhone: '+91 9822004455',
    contactEmail: 'sales@dispovan.com',
    address: 'Plot 12, Industrial Area',
    city: 'Faridabad',
    state: 'Haryana',
    pincode: '121001',
    leadTimeDays: 2,
    paymentTermsDays: 15,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'SUP-MEDIPACK-03',
    name: 'MediPack Bio-Safe Solutions',
    gstin: '27AABCM5678K1Z9',
    contactPerson: 'Ramesh Patel',
    contactPhone: '+91 9899006677',
    contactEmail: 'contact@medipack.in',
    address: 'Andheri East Industrial Estate',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400069',
    leadTimeDays: 4,
    paymentTermsDays: 30,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Seed Starter Items
export const DEFAULT_INVENTORY_ITEMS: InventoryItemMaster[] = [
  {
    id: 'ITEM-EDTA-LAV',
    name: 'K2 EDTA Vacutainer Tube 3ml (Lavender/Purple Cap)',
    sku: 'VAC-EDTA-3ML-PUR',
    category: 'VACUTAINER',
    description: 'Whole blood tube for CBC, HbA1c, ESR, blood grouping and hematology panels.',
    manufacturer: 'BD Diagnostics',
    tubeType: TubeType.EDTA_LAVENDER,
    baseUnit: 'PIECE',
    purchasePackageUnit: 'BOX',
    unitsPerPackage: 100,
    supplierBarcodeMappings: ['BD-EDTA-3ML-BOX100', '8901234001001'],
    internalItemBarcode: 'LS-MAT-EDTA',
    minimumStock: 200,
    reorderLevel: 500,
    batchTracking: true,
    expiryTracking: true,
    storageInstructions: 'Store between 4°C to 25°C. Do not freeze before use.',
    iconEmoji: '🟣',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ITEM-SST-GOLD',
    name: 'Serum Separator Tube (SST Gel & Clot Activator / Gold-Yellow Cap)',
    sku: 'VAC-SST-4ML-GLD',
    category: 'VACUTAINER',
    description: 'Biochemistry, Lipid Profile, LFT, KFT, hormones, thyroid and immunology tests.',
    manufacturer: 'BD Diagnostics',
    tubeType: TubeType.SERUM_RED_GOLD,
    baseUnit: 'PIECE',
    purchasePackageUnit: 'BOX',
    unitsPerPackage: 100,
    supplierBarcodeMappings: ['BD-SST-4ML-BOX100', '8901234001018'],
    internalItemBarcode: 'LS-MAT-SST',
    minimumStock: 200,
    reorderLevel: 500,
    batchTracking: true,
    expiryTracking: true,
    storageInstructions: 'Store at 4°C to 25°C away from direct sunlight.',
    iconEmoji: '🟡',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ITEM-FLU-GREY',
    name: 'Sodium Fluoride / Potassium Oxalate Tube 2ml (Grey Cap)',
    sku: 'VAC-FLU-2ML-GRY',
    category: 'VACUTAINER',
    description: 'Fasting and Postprandial Blood Glucose and Lactate testing.',
    manufacturer: 'BD Diagnostics',
    tubeType: TubeType.SODIUM_FLUORIDE_GREY,
    baseUnit: 'PIECE',
    purchasePackageUnit: 'BOX',
    unitsPerPackage: 100,
    supplierBarcodeMappings: ['BD-FLU-2ML-BOX100', '8901234001025'],
    internalItemBarcode: 'LS-MAT-FLU',
    minimumStock: 100,
    reorderLevel: 250,
    batchTracking: true,
    expiryTracking: true,
    storageInstructions: 'Store between 4°C to 25°C.',
    iconEmoji: '⚪',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ITEM-CIT-BLUE',
    name: 'Sodium Citrate 3.2% Tube 2.7ml (Light Blue Cap)',
    sku: 'VAC-CIT-2.7ML-BLU',
    category: 'VACUTAINER',
    description: 'Coagulation studies, PT/INR, APTT, D-Dimer.',
    manufacturer: 'BD Diagnostics',
    tubeType: TubeType.SODIUM_CITRATE_BLUE,
    baseUnit: 'PIECE',
    purchasePackageUnit: 'BOX',
    unitsPerPackage: 100,
    supplierBarcodeMappings: ['BD-CIT-2.7ML-BOX100', '8901234001032'],
    internalItemBarcode: 'LS-MAT-CIT',
    minimumStock: 50,
    reorderLevel: 150,
    batchTracking: true,
    expiryTracking: true,
    storageInstructions: 'Store at 4°C to 25°C.',
    iconEmoji: '🔵',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ITEM-NDL-21G',
    name: 'Sterile Multi-Sample Flashback Needle 21G with Safety Shield',
    sku: 'NDL-FLASH-21G',
    category: 'NEEDLE',
    description: 'Safety vein puncture needle for routine venous blood collection.',
    manufacturer: 'Dispovan / BD',
    baseUnit: 'PIECE',
    purchasePackageUnit: 'BOX',
    unitsPerPackage: 100,
    supplierBarcodeMappings: ['DISPO-NDL-21G-BOX100', '8902345002005'],
    internalItemBarcode: 'LS-MAT-NDL21',
    minimumStock: 300,
    reorderLevel: 600,
    batchTracking: true,
    expiryTracking: true,
    iconEmoji: '💉',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ITEM-ACC-SWAB',
    name: 'Pre-injection Isopropyl Alcohol 70% Swabs (Sterile Sachet)',
    sku: 'ACC-ALC-SWAB-70',
    category: 'ACCESSORY',
    description: 'Individual sealed sachet for skin disinfection prior to venipuncture.',
    manufacturer: 'MediPack India',
    baseUnit: 'SWAB',
    purchasePackageUnit: 'BOX',
    unitsPerPackage: 200,
    supplierBarcodeMappings: ['MEDIPACK-ALC-SWAB-200', '8903456003009'],
    internalItemBarcode: 'LS-MAT-SWAB',
    minimumStock: 500,
    reorderLevel: 1000,
    batchTracking: true,
    expiryTracking: true,
    iconEmoji: '🩹',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ITEM-ACC-GLOVE',
    name: 'Powder-Free Nitrile Examination Gloves (Medium / Blue)',
    sku: 'ACC-GLOVE-NIT-M',
    category: 'ACCESSORY',
    description: 'Medical-grade ambidextrous nitrile gloves for phlebotomists.',
    manufacturer: 'Karam / SafeTouch',
    baseUnit: 'PAIR',
    purchasePackageUnit: 'BOX',
    unitsPerPackage: 50,
    supplierBarcodeMappings: ['SAFETOUCH-NIT-M-50PR', '8904567004003'],
    internalItemBarcode: 'LS-MAT-GLOVE-M',
    minimumStock: 100,
    reorderLevel: 300,
    batchTracking: true,
    expiryTracking: true,
    iconEmoji: '🧤',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ITEM-PKG-BIOBAG',
    name: 'Transparent Biohazard Specimen Transport Zip Pouch (Double Pocket)',
    sku: 'PKG-BIO-ZIP-POUCH',
    category: 'PACKAGING',
    description: 'Dual pocket bag with biohazard warning symbol and requisition pouch.',
    manufacturer: 'MediPack Bio-Safe Solutions',
    baseUnit: 'PIECE',
    purchasePackageUnit: 'PACK',
    unitsPerPackage: 100,
    supplierBarcodeMappings: ['MEDIPACK-BIOBAG-100PK', '8905678005007'],
    internalItemBarcode: 'LS-MAT-BIOBAG',
    minimumStock: 300,
    reorderLevel: 800,
    batchTracking: false,
    expiryTracking: false,
    iconEmoji: '🛍️',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Seed Starter Supplier Barcode Mappings
export const DEFAULT_SUPPLIER_BARCODE_MAPPINGS: SupplierBarcodeMapping[] = [
  {
    id: 'MAP-BD-EDTA-BOX',
    supplierBarcode: 'BD-EDTA-3ML-BOX100',
    itemId: 'ITEM-EDTA-LAV',
    itemSku: 'VAC-EDTA-3ML-PUR',
    supplierId: 'SUP-BD-01',
    supplierName: 'Becton Dickinson India (BD)',
    packageUnit: 'BOX_OF_100',
    unitsPerPackage: 100,
    verified: true,
    notes: 'Manufacturer carton barcode for box of 100 EDTA Lavender Vacutainer tubes.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'MAP-BD-EDTA-EAN',
    supplierBarcode: '8901234001001',
    itemId: 'ITEM-EDTA-LAV',
    itemSku: 'VAC-EDTA-3ML-PUR',
    supplierId: 'SUP-BD-01',
    supplierName: 'Becton Dickinson India (BD)',
    packageUnit: 'BOX_OF_100',
    unitsPerPackage: 100,
    verified: true,
    notes: 'Standard GS1 / EAN barcode printed on BD EDTA Vacutainer box.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'MAP-BD-SST-BOX',
    supplierBarcode: 'BD-SST-4ML-BOX100',
    itemId: 'ITEM-SST-GOLD',
    itemSku: 'VAC-SST-4ML-GLD',
    supplierId: 'SUP-BD-01',
    supplierName: 'Becton Dickinson India (BD)',
    packageUnit: 'BOX_OF_100',
    unitsPerPackage: 100,
    verified: true,
    notes: 'Box barcode for BD SST Gold vacutainer tubes.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'MAP-BD-SST-EAN',
    supplierBarcode: '8901234001018',
    itemId: 'ITEM-SST-GOLD',
    itemSku: 'VAC-SST-4ML-GLD',
    supplierId: 'SUP-BD-01',
    supplierName: 'Becton Dickinson India (BD)',
    packageUnit: 'BOX_OF_100',
    unitsPerPackage: 100,
    verified: true,
    notes: 'GS1 barcode on BD SST Gold Vacutainer box.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'MAP-DISPO-NDL-BOX',
    supplierBarcode: 'DISPO-NDL-21G-BOX100',
    itemId: 'ITEM-NDL-21G',
    itemSku: 'NDL-FLASH-21G',
    supplierId: 'SUP-DISPO-02',
    supplierName: 'Hindustan Syringes & Medical Devices (Dispovan)',
    packageUnit: 'BOX_OF_100',
    unitsPerPackage: 100,
    verified: true,
    notes: '100 Flashback needles per box.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'MAP-MEDIPACK-SWAB-BOX',
    supplierBarcode: 'MEDIPACK-ALC-SWAB-200',
    itemId: 'ITEM-ACC-SWAB',
    itemSku: 'ACC-ALC-SWAB-70',
    supplierId: 'SUP-MEDIPACK-03',
    supplierName: 'MediPack Bio-Safe Solutions',
    packageUnit: 'BOX_OF_200',
    unitsPerPackage: 200,
    verified: true,
    notes: 'Dispenser box of 200 alcohol prep swabs.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Central Primary Warehouse Seed
export const DEFAULT_CENTRAL_WAREHOUSE: WarehouseRecord = {
  id: 'WH-CENTRAL-MAIN',
  code: 'WH-MUM-HQ',
  name: 'LabSetu Central Diagnostic Hub & Warehouse',
  isPrimary: true,
  address: 'Plot 44, Diagnostic Logistics Park, Andheri East',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400069',
  managerName: 'LabSetu Central Logistics Desk',
  managerPhone: '+91 9876543210',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Ensures default master data exists in Firestore / In-Memory
 */
export async function ensureInventoryMasterBootstrapped(): Promise<void> {
  const { db, isMockMode } = initializeFirebase();

  // In-Memory Dev Store Population
  if (DEV_DATA_STORE.inventoryItems.size === 0) {
    for (const it of DEFAULT_INVENTORY_ITEMS) {
      DEV_DATA_STORE.inventoryItems.set(it.id, it);
    }
    for (const sup of DEFAULT_INVENTORY_SUPPLIERS) {
      DEV_DATA_STORE.inventorySuppliers.set(sup.id, sup);
    }
    for (const map of DEFAULT_SUPPLIER_BARCODE_MAPPINGS) {
      DEV_DATA_STORE.supplierBarcodeMappings.set(map.id, map);
    }
    for (const cat of DEFAULT_INVENTORY_CATEGORIES) {
      DEV_DATA_STORE.inventoryCategories.set(cat.id, cat);
    }
    DEV_DATA_STORE.centralWarehouses.set(DEFAULT_CENTRAL_WAREHOUSE.id, DEFAULT_CENTRAL_WAREHOUSE);
  }

  // If live Firestore is available, seed if empty
  if (db && !isMockMode) {
    try {
      const itemsSnap = await db.collection('inventoryItems').limit(1).get();
      if (itemsSnap.empty) {
        console.log('Seeding initial Inventory Items into Firestore...');
        const batch = db.batch();
        for (const it of DEFAULT_INVENTORY_ITEMS) {
          batch.set(db.collection('inventoryItems').doc(it.id), deepCleanFirestorePayload(it));
        }
        for (const sup of DEFAULT_INVENTORY_SUPPLIERS) {
          batch.set(db.collection('inventorySuppliers').doc(sup.id), deepCleanFirestorePayload(sup));
        }
        for (const map of DEFAULT_SUPPLIER_BARCODE_MAPPINGS) {
          batch.set(db.collection('supplierBarcodeMappings').doc(map.id), deepCleanFirestorePayload(map));
        }
        for (const cat of DEFAULT_INVENTORY_CATEGORIES) {
          batch.set(db.collection('inventoryCategories').doc(cat.id), deepCleanFirestorePayload(cat));
        }
        batch.set(db.collection('centralWarehouses').doc(DEFAULT_CENTRAL_WAREHOUSE.id), deepCleanFirestorePayload(DEFAULT_CENTRAL_WAREHOUSE));
        await batch.commit();
        console.log('✓ Inventory Master data seeded into Firestore.');
      }
    } catch (err) {
      console.warn('Non-fatal inventory master bootstrap warning:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Master Item Queries & Mutations
// ---------------------------------------------------------------------------

export async function getInventoryItems(filters?: {
  category?: string;
  isActive?: boolean;
  search?: string;
}): Promise<InventoryItemMaster[]> {
  await ensureInventoryMasterBootstrapped();
  const { db, isMockMode } = initializeFirebase();

  let items: InventoryItemMaster[] = [];

  if (db && !isMockMode) {
    try {
      let q = db.collection('inventoryItems') as FirebaseFirestore.Query;
      if (filters?.category) {
        q = q.where('category', '==', filters.category);
      }
      if (filters?.isActive !== undefined) {
        q = q.where('isActive', '==', filters.isActive);
      }
      const snap = await q.get();
      items = snap.docs.map((doc) => doc.data() as InventoryItemMaster);
    } catch (err) {
      console.warn('Failed querying inventoryItems from Firestore, falling back to local store:', err);
      items = Array.from(DEV_DATA_STORE.inventoryItems.values());
    }
  } else {
    items = Array.from(DEV_DATA_STORE.inventoryItems.values());
  }

  if (filters?.search) {
    const s = filters.search.trim().toLowerCase();
    items = items.filter(
      (it) =>
        it.name.toLowerCase().includes(s) ||
        it.sku.toLowerCase().includes(s) ||
        it.internalItemBarcode.toLowerCase().includes(s) ||
        it.manufacturer.toLowerCase().includes(s)
    );
  }

  return items;
}

export async function getInventoryItemById(itemId: string): Promise<InventoryItemMaster | null> {
  await ensureInventoryMasterBootstrapped();
  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    try {
      const docSnap = await db.collection('inventoryItems').doc(itemId).get();
      if (docSnap.exists) {
        return docSnap.data() as InventoryItemMaster;
      }
    } catch (err) {
      console.warn(`Failed reading item ${itemId} from Firestore:`, err);
    }
  }

  return DEV_DATA_STORE.inventoryItems.get(itemId) || null;
}

export async function createInventoryItem(
  payload: Omit<InventoryItemMaster, 'id' | 'createdAt' | 'updatedAt'>,
  actorUid: string
): Promise<InventoryItemMaster> {
  const { db, isMockMode } = initializeFirebase();
  const now = new Date().toISOString();
  const id = `ITEM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const newItem: InventoryItemMaster = {
    ...payload,
    id,
    createdAt: now,
    updatedAt: now,
  };

  DEV_DATA_STORE.inventoryItems.set(id, newItem);

  if (db && !isMockMode) {
    await db.collection('inventoryItems').doc(id).set(deepCleanFirestorePayload(newItem));
  }

  return newItem;
}

export async function updateInventoryItem(
  itemId: string,
  updates: Partial<InventoryItemMaster>,
  actorUid: string
): Promise<InventoryItemMaster> {
  const existing = await getInventoryItemById(itemId);
  if (!existing) {
    throw new Error(`Inventory item ${itemId} not found`);
  }

  const updated: InventoryItemMaster = {
    ...existing,
    ...updates,
    id: itemId,
    updatedAt: new Date().toISOString(),
  };

  DEV_DATA_STORE.inventoryItems.set(itemId, updated);

  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db.collection('inventoryItems').doc(itemId).set(deepCleanFirestorePayload(updated), { merge: true });
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Suppliers Queries & Mutations
// ---------------------------------------------------------------------------

export async function getInventorySuppliers(): Promise<SupplierRecord[]> {
  await ensureInventoryMasterBootstrapped();
  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    try {
      const snap = await db.collection('inventorySuppliers').where('isActive', '==', true).get();
      if (!snap.empty) {
        return snap.docs.map((doc) => doc.data() as SupplierRecord);
      }
    } catch (err) {
      console.warn('Failed querying inventorySuppliers from Firestore:', err);
    }
  }

  return Array.from(DEV_DATA_STORE.inventorySuppliers.values()).filter((s) => s.isActive);
}

export async function createInventorySupplier(
  payload: Omit<SupplierRecord, 'id' | 'createdAt' | 'updatedAt'>,
  actorUid: string
): Promise<SupplierRecord> {
  const { db, isMockMode } = initializeFirebase();
  const now = new Date().toISOString();
  const id = `SUP-${Date.now().toString(36).toUpperCase()}`;

  const supplier: SupplierRecord = {
    ...payload,
    id,
    createdAt: now,
    updatedAt: now,
  };

  DEV_DATA_STORE.inventorySuppliers.set(id, supplier);

  if (db && !isMockMode) {
    await db.collection('inventorySuppliers').doc(id).set(deepCleanFirestorePayload(supplier));
  }

  return supplier;
}

// ---------------------------------------------------------------------------
// Supplier Barcode Mappings & Resolver
// ---------------------------------------------------------------------------

export async function getSupplierBarcodeMappings(itemId?: string): Promise<SupplierBarcodeMapping[]> {
  await ensureInventoryMasterBootstrapped();
  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    try {
      let q = db.collection('supplierBarcodeMappings') as FirebaseFirestore.Query;
      if (itemId) {
        q = q.where('itemId', '==', itemId);
      }
      const snap = await q.get();
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as SupplierBarcodeMapping);
      }
    } catch (err) {
      console.warn('Failed querying supplierBarcodeMappings from Firestore:', err);
    }
  }

  const all = Array.from(DEV_DATA_STORE.supplierBarcodeMappings.values());
  return itemId ? all.filter((m) => m.itemId === itemId) : all;
}

export async function createSupplierBarcodeMapping(
  payload: Omit<SupplierBarcodeMapping, 'id' | 'createdAt' | 'updatedAt'>,
  actorUid: string
): Promise<SupplierBarcodeMapping> {
  const { db, isMockMode } = initializeFirebase();
  const now = new Date().toISOString();
  const id = `MAP-${Date.now().toString(36).toUpperCase()}`;

  const mapping: SupplierBarcodeMapping = {
    ...payload,
    id,
    createdAt: now,
    updatedAt: now,
  };

  DEV_DATA_STORE.supplierBarcodeMappings.set(id, mapping);

  if (db && !isMockMode) {
    await db.collection('supplierBarcodeMappings').doc(id).set(deepCleanFirestorePayload(mapping));
  }

  // Also update item's mapping reference list
  const item = await getInventoryItemById(payload.itemId);
  if (item && !item.supplierBarcodeMappings?.includes(payload.supplierBarcode)) {
    const updatedMappings = [...(item.supplierBarcodeMappings || []), payload.supplierBarcode];
    await updateInventoryItem(item.id, { supplierBarcodeMappings: updatedMappings }, actorUid);
  }

  return mapping;
}

/**
 * Resolves any scanned or entered barcode:
 * 1. Matches against supplierBarcodeMappings (e.g. manufacturer carton / box barcode)
 * 2. Matches against internalItemBarcode / SKU on master items
 */
export async function resolveSupplierBarcode(barcode: string): Promise<{
  found: boolean;
  type: 'SUPPLIER_MAPPING' | 'INTERNAL_ITEM' | 'NONE';
  barcode: string;
  mapping?: SupplierBarcodeMapping;
  item?: InventoryItemMaster;
  packageUnit?: string;
  multiplierToBaseUnit: number;
  baseUnit?: InventoryBaseUnit;
}> {
  await ensureInventoryMasterBootstrapped();
  const cleanBarcode = barcode.trim();
  const { db, isMockMode } = initializeFirebase();

  // Step 1: Check Supplier Barcode Mappings
  let matchedMapping: SupplierBarcodeMapping | undefined;

  if (db && !isMockMode) {
    try {
      const snap = await db
        .collection('supplierBarcodeMappings')
        .where('supplierBarcode', '==', cleanBarcode)
        .limit(1)
        .get();

      if (!snap.empty) {
        matchedMapping = snap.docs[0].data() as SupplierBarcodeMapping;
      }
    } catch (err) {
      console.warn(`Firestore query for barcode ${cleanBarcode} failed:`, err);
    }
  }

  if (!matchedMapping) {
    matchedMapping = Array.from(DEV_DATA_STORE.supplierBarcodeMappings.values()).find(
      (m) => m.supplierBarcode.toLowerCase() === cleanBarcode.toLowerCase()
    );
  }

  if (matchedMapping) {
    const item = await getInventoryItemById(matchedMapping.itemId);
    if (item) {
      return {
        found: true,
        type: 'SUPPLIER_MAPPING',
        barcode: cleanBarcode,
        mapping: matchedMapping,
        item,
        packageUnit: matchedMapping.packageUnit,
        multiplierToBaseUnit: matchedMapping.unitsPerPackage || 1,
        baseUnit: item.baseUnit,
      };
    }
  }

  // Step 2: Check Direct Item Barcode / SKU
  const allItems = await getInventoryItems();
  const matchedItem = allItems.find(
    (it) =>
      it.internalItemBarcode.toLowerCase() === cleanBarcode.toLowerCase() ||
      it.sku.toLowerCase() === cleanBarcode.toLowerCase() ||
      it.supplierBarcodeMappings?.some((b) => b.toLowerCase() === cleanBarcode.toLowerCase())
  );

  if (matchedItem) {
    return {
      found: true,
      type: 'INTERNAL_ITEM',
      barcode: cleanBarcode,
      item: matchedItem,
      packageUnit: matchedItem.purchasePackageUnit,
      multiplierToBaseUnit: matchedItem.unitsPerPackage || 1,
      baseUnit: matchedItem.baseUnit,
    };
  }

  return {
    found: false,
    type: 'NONE',
    barcode: cleanBarcode,
    multiplierToBaseUnit: 1,
  };
}

// ---------------------------------------------------------------------------
// Warehouses Queries
// ---------------------------------------------------------------------------

export async function getCentralWarehouses(): Promise<WarehouseRecord[]> {
  await ensureInventoryMasterBootstrapped();
  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    try {
      const snap = await db.collection('centralWarehouses').where('isActive', '==', true).get();
      if (!snap.empty) {
        return snap.docs.map((doc) => doc.data() as WarehouseRecord);
      }
    } catch (err) {
      console.warn('Failed querying centralWarehouses from Firestore:', err);
    }
  }

  return Array.from(DEV_DATA_STORE.centralWarehouses.values()).filter((w) => w.isActive);
}
