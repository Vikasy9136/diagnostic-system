import {
  type KitBOMComponent,
  type KitBOMVersionRecord,
  type KitDefinitionMaster,
  TubeType,
  deepCleanFirestorePayload,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { DEV_DATA_STORE } from './devStore';
import { DEFAULT_INVENTORY_ITEMS } from './inventory-master.service';

export const DEFAULT_KIT_DEFINITIONS: KitDefinitionMaster[] = [
  {
    id: 'KIT-DEF-CBC',
    kitCode: 'KIT-HEM-CBC',
    name: 'Routine Hematology Specimen Kit (CBC / HbA1c / ESR)',
    category: 'Hematology',
    description: 'Pre-assembled diagnostic kit for complete blood counts, ESR, and whole blood tests.',
    targetTestCodes: ['TEST-CBC-01', 'TEST-HBA1C-02', 'TEST-ESR-03'],
    activeBOMVersion: 1,
    estimatedCostPerKitInr: 32.5,
    iconEmoji: '🟣',
    colorBadge: '#8B5CF6',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'KIT-DEF-CMP',
    kitCode: 'KIT-MET-CMP',
    name: 'Comprehensive Metabolic Specimen Kit (LFT / KFT / Lipid Profile)',
    category: 'Biochemistry',
    description: 'Serum clot activator specimen kit for routine chemistry and organ function panels.',
    targetTestCodes: ['TEST-LFT-01', 'TEST-KFT-02', 'TEST-LIPID-03', 'TEST-THYROID-04'],
    activeBOMVersion: 1,
    estimatedCostPerKitInr: 34.0,
    iconEmoji: '🟡',
    colorBadge: '#EAB308',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'KIT-DEF-DIA',
    kitCode: 'KIT-DIA-GLU',
    name: 'Diabetes & Glycemic Monitoring Kit (Fasting Glucose + HbA1c)',
    category: 'Diabetes Care',
    description: 'Dual tube collection kit for whole blood HbA1c and plasma fluoride glucose.',
    targetTestCodes: ['TEST-FBS-01', 'TEST-PPBS-02', 'TEST-HBA1C-02'],
    activeBOMVersion: 1,
    estimatedCostPerKitInr: 45.0,
    iconEmoji: '⚪',
    colorBadge: '#64748B',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'KIT-DEF-COAG',
    kitCode: 'KIT-COAG-PT',
    name: 'Coagulation Profile Kit (PT / INR / APTT / D-Dimer)',
    category: 'Coagulation',
    description: 'Sodium citrate 3.2% tube kit for accurate plasma coagulation analysis.',
    targetTestCodes: ['TEST-PTINR-01', 'TEST-APTT-02', 'TEST-DDIMER-03'],
    activeBOMVersion: 1,
    estimatedCostPerKitInr: 35.5,
    iconEmoji: '🔵',
    colorBadge: '#3B82F6',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'KIT-DEF-FULL',
    kitCode: 'KIT-FULL-BODY',
    name: 'Executive Comprehensive Full Body Health Check Kit',
    category: 'Wellness Panels',
    description: 'Triple-vacutainer multi-panel specimen kit covering CBC, LFT, KFT, Lipid, and Glucose.',
    targetTestCodes: ['TEST-FULLBODY-01', 'TEST-SENIOR-02', 'TEST-EXECUTIVE-03'],
    activeBOMVersion: 1,
    estimatedCostPerKitInr: 68.0,
    iconEmoji: '🛡️',
    colorBadge: '#0D9488',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const DEFAULT_KIT_BOMS: Record<string, KitBOMComponent[]> = {
  'KIT-DEF-CBC': [
    {
      itemId: 'ITEM-EDTA-LAV',
      itemName: 'K2 EDTA Vacutainer Tube 3ml (Lavender Cap)',
      sku: 'VAC-EDTA-3ML-PUR',
      category: 'VACUTAINER',
      tubeType: TubeType.EDTA_LAVENDER,
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: true,
    },
    {
      itemId: 'ITEM-NDL-21G',
      itemName: 'Sterile Multi-Sample Flashback Needle 21G',
      sku: 'NDL-FLASH-21G',
      category: 'NEEDLE',
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-ACC-SWAB',
      itemName: 'Pre-injection Isopropyl Alcohol 70% Swabs',
      sku: 'ACC-ALC-SWAB-70',
      category: 'ACCESSORY',
      quantity: 2,
      unit: 'SWAB',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-ACC-GLOVE',
      itemName: 'Powder-Free Nitrile Examination Gloves',
      sku: 'ACC-GLOVE-NIT-M',
      category: 'ACCESSORY',
      quantity: 1,
      unit: 'PAIR',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-PKG-BIOBAG',
      itemName: 'Transparent Biohazard Specimen Transport Zip Pouch',
      sku: 'PKG-BIO-ZIP-POUCH',
      category: 'PACKAGING',
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: false,
    },
  ],
  'KIT-DEF-CMP': [
    {
      itemId: 'ITEM-SST-GOLD',
      itemName: 'Serum Separator Tube (SST Gel & Clot Activator / Gold Cap)',
      sku: 'VAC-SST-4ML-GLD',
      category: 'VACUTAINER',
      tubeType: TubeType.SERUM_RED_GOLD,
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: true,
    },
    {
      itemId: 'ITEM-NDL-21G',
      itemName: 'Sterile Multi-Sample Flashback Needle 21G',
      sku: 'NDL-FLASH-21G',
      category: 'NEEDLE',
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-ACC-SWAB',
      itemName: 'Pre-injection Isopropyl Alcohol 70% Swabs',
      sku: 'ACC-ALC-SWAB-70',
      category: 'ACCESSORY',
      quantity: 2,
      unit: 'SWAB',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-ACC-GLOVE',
      itemName: 'Powder-Free Nitrile Examination Gloves',
      sku: 'ACC-GLOVE-NIT-M',
      category: 'ACCESSORY',
      quantity: 1,
      unit: 'PAIR',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-PKG-BIOBAG',
      itemName: 'Transparent Biohazard Specimen Transport Zip Pouch',
      sku: 'PKG-BIO-ZIP-POUCH',
      category: 'PACKAGING',
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: false,
    },
  ],
  'KIT-DEF-DIA': [
    {
      itemId: 'ITEM-EDTA-LAV',
      itemName: 'K2 EDTA Vacutainer Tube 3ml (Lavender Cap)',
      sku: 'VAC-EDTA-3ML-PUR',
      category: 'VACUTAINER',
      tubeType: TubeType.EDTA_LAVENDER,
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: true,
    },
    {
      itemId: 'ITEM-FLU-GREY',
      itemName: 'Sodium Fluoride Tube 2ml (Grey Cap)',
      sku: 'VAC-FLU-2ML-GRY',
      category: 'VACUTAINER',
      tubeType: TubeType.SODIUM_FLUORIDE_GREY,
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: true,
    },
    {
      itemId: 'ITEM-NDL-21G',
      itemName: 'Sterile Multi-Sample Flashback Needle 21G',
      sku: 'NDL-FLASH-21G',
      category: 'NEEDLE',
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-ACC-SWAB',
      itemName: 'Pre-injection Isopropyl Alcohol 70% Swabs',
      sku: 'ACC-ALC-SWAB-70',
      category: 'ACCESSORY',
      quantity: 2,
      unit: 'SWAB',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-ACC-GLOVE',
      itemName: 'Powder-Free Nitrile Examination Gloves',
      sku: 'ACC-GLOVE-NIT-M',
      category: 'ACCESSORY',
      quantity: 1,
      unit: 'PAIR',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-PKG-BIOBAG',
      itemName: 'Transparent Biohazard Specimen Transport Zip Pouch',
      sku: 'PKG-BIO-ZIP-POUCH',
      category: 'PACKAGING',
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: false,
    },
  ],
  'KIT-DEF-COAG': [
    {
      itemId: 'ITEM-CIT-BLUE',
      itemName: 'Sodium Citrate 3.2% Tube 2.7ml (Light Blue Cap)',
      sku: 'VAC-CIT-2.7ML-BLU',
      category: 'VACUTAINER',
      tubeType: TubeType.SODIUM_CITRATE_BLUE,
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: true,
    },
    {
      itemId: 'ITEM-NDL-21G',
      itemName: 'Sterile Multi-Sample Flashback Needle 21G',
      sku: 'NDL-FLASH-21G',
      category: 'NEEDLE',
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-ACC-SWAB',
      itemName: 'Pre-injection Isopropyl Alcohol 70% Swabs',
      sku: 'ACC-ALC-SWAB-70',
      category: 'ACCESSORY',
      quantity: 2,
      unit: 'SWAB',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-ACC-GLOVE',
      itemName: 'Powder-Free Nitrile Examination Gloves',
      sku: 'ACC-GLOVE-NIT-M',
      category: 'ACCESSORY',
      quantity: 1,
      unit: 'PAIR',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-PKG-BIOBAG',
      itemName: 'Transparent Biohazard Specimen Transport Zip Pouch',
      sku: 'PKG-BIO-ZIP-POUCH',
      category: 'PACKAGING',
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: false,
    },
  ],
  'KIT-DEF-FULL': [
    {
      itemId: 'ITEM-EDTA-LAV',
      itemName: 'K2 EDTA Vacutainer Tube 3ml (Lavender Cap)',
      sku: 'VAC-EDTA-3ML-PUR',
      category: 'VACUTAINER',
      tubeType: TubeType.EDTA_LAVENDER,
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: true,
    },
    {
      itemId: 'ITEM-SST-GOLD',
      itemName: 'Serum Separator Tube (SST Gel & Clot Activator / Gold Cap)',
      sku: 'VAC-SST-4ML-GLD',
      category: 'VACUTAINER',
      tubeType: TubeType.SERUM_RED_GOLD,
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: true,
    },
    {
      itemId: 'ITEM-FLU-GREY',
      itemName: 'Sodium Fluoride Tube 2ml (Grey Cap)',
      sku: 'VAC-FLU-2ML-GRY',
      category: 'VACUTAINER',
      tubeType: TubeType.SODIUM_FLUORIDE_GREY,
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: true,
    },
    {
      itemId: 'ITEM-NDL-21G',
      itemName: 'Sterile Multi-Sample Flashback Needle 21G',
      sku: 'NDL-FLASH-21G',
      category: 'NEEDLE',
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-ACC-SWAB',
      itemName: 'Pre-injection Isopropyl Alcohol 70% Swabs',
      sku: 'ACC-ALC-SWAB-70',
      category: 'ACCESSORY',
      quantity: 3,
      unit: 'SWAB',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-ACC-GLOVE',
      itemName: 'Powder-Free Nitrile Examination Gloves',
      sku: 'ACC-GLOVE-NIT-M',
      category: 'ACCESSORY',
      quantity: 1,
      unit: 'PAIR',
      isIndividuallySerialized: false,
    },
    {
      itemId: 'ITEM-PKG-BIOBAG',
      itemName: 'Transparent Biohazard Specimen Transport Zip Pouch',
      sku: 'PKG-BIO-ZIP-POUCH',
      category: 'PACKAGING',
      quantity: 1,
      unit: 'PIECE',
      isIndividuallySerialized: false,
    },
  ],
};

export async function ensureKitMasterBootstrapped(): Promise<void> {
  const { db, isMockMode } = initializeFirebase();

  // In-Memory Dev Store Population
  if (DEV_DATA_STORE.kitDefinitions.size === 0) {
    for (const kit of DEFAULT_KIT_DEFINITIONS) {
      DEV_DATA_STORE.kitDefinitions.set(kit.id, kit);
      const components = DEFAULT_KIT_BOMS[kit.id] || [];
      const bomRecord: KitBOMVersionRecord = {
        id: `BOM-${kit.id}-V1`,
        kitDefinitionId: kit.id,
        version: 1,
        components,
        approvedByUid: 'admin-root',
        approvedByEmail: 'admin@labsetu.com',
        approvedAt: kit.createdAt,
        isActive: true,
        notes: 'Initial production Bill of Materials recipe',
      };
      DEV_DATA_STORE.kitBomVersions.set(bomRecord.id, bomRecord);
    }
  }

  // Live Firestore Seeding
  if (db && !isMockMode) {
    try {
      const snap = await db.collection('kitDefinitions').limit(1).get();
      if (snap.empty) {
        console.log('Seeding Master Kit Definitions & BOMs into Firestore...');
        const batch = db.batch();
        for (const kit of DEFAULT_KIT_DEFINITIONS) {
          batch.set(db.collection('kitDefinitions').doc(kit.id), deepCleanFirestorePayload(kit));
          const components = DEFAULT_KIT_BOMS[kit.id] || [];
          const bomRecord: KitBOMVersionRecord = {
            id: `BOM-${kit.id}-V1`,
            kitDefinitionId: kit.id,
            version: 1,
            components,
            approvedByUid: 'admin-root',
            approvedByEmail: 'admin@labsetu.com',
            approvedAt: kit.createdAt,
            isActive: true,
            notes: 'Initial production Bill of Materials recipe',
          };
          batch.set(db.collection('kitBomVersions').doc(bomRecord.id), deepCleanFirestorePayload(bomRecord));
        }
        await batch.commit();
        console.log('✓ Master Kit Definitions & BOMs seeded successfully.');
      }
    } catch (err) {
      console.warn('Non-fatal kit master bootstrap warning:', err);
    }
  }
}

export async function getKitDefinitions(): Promise<KitDefinitionMaster[]> {
  await ensureKitMasterBootstrapped();
  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    try {
      const snap = await db.collection('kitDefinitions').where('isActive', '==', true).get();
      if (!snap.empty) {
        return snap.docs.map((doc) => doc.data() as KitDefinitionMaster);
      }
    } catch (err) {
      console.warn('Failed querying kitDefinitions from Firestore:', err);
    }
  }

  return Array.from(DEV_DATA_STORE.kitDefinitions.values()).filter((k) => k.isActive);
}

export async function getKitDefinitionById(idOrCode: string): Promise<KitDefinitionMaster | null> {
  await ensureKitMasterBootstrapped();
  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    try {
      const doc = await db.collection('kitDefinitions').doc(idOrCode).get();
      if (doc.exists) {
        return doc.data() as KitDefinitionMaster;
      }
      const querySnap = await db.collection('kitDefinitions').where('kitCode', '==', idOrCode).limit(1).get();
      if (!querySnap.empty) {
        return querySnap.docs[0].data() as KitDefinitionMaster;
      }
    } catch (err) {
      console.warn(`Failed reading kit ${idOrCode} from Firestore:`, err);
    }
  }

  const direct = DEV_DATA_STORE.kitDefinitions.get(idOrCode);
  if (direct) return direct;
  return (
    Array.from(DEV_DATA_STORE.kitDefinitions.values()).find(
      (k: any) => k.kitCode === idOrCode
    ) || null
  );
}

export async function getKitActiveBOM(kitDefinitionIdOrCode: string): Promise<KitBOMVersionRecord | null> {
  await ensureKitMasterBootstrapped();
  const kit = await getKitDefinitionById(kitDefinitionIdOrCode);
  const targetId = kit ? kit.id : kitDefinitionIdOrCode;

  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    try {
      const snap = await db
        .collection('kitBomVersions')
        .where('kitDefinitionId', '==', targetId)
        .where('isActive', '==', true)
        .limit(1)
        .get();
      if (!snap.empty) {
        return snap.docs[0].data() as KitBOMVersionRecord;
      }
    } catch (err) {
      console.warn(`Failed reading BOM for kit ${targetId}:`, err);
    }
  }

  const all = Array.from(DEV_DATA_STORE.kitBomVersions.values()) as KitBOMVersionRecord[];
  return all.find((b) => b.kitDefinitionId === targetId && b.isActive) || null;
}

export async function createKitDefinition(
  payload: Omit<KitDefinitionMaster, 'id' | 'createdAt' | 'updatedAt' | 'activeBOMVersion'> & {
    initialComponents: KitBOMComponent[];
  },
  actor: { uid: string; email: string }
): Promise<{ kit: KitDefinitionMaster; bom: KitBOMVersionRecord }> {
  const { db, isMockMode } = initializeFirebase();
  const now = new Date().toISOString();
  const kitId = `KIT-DEF-${Date.now().toString(36).toUpperCase()}`;

  const kit: KitDefinitionMaster = {
    id: kitId,
    kitCode: payload.kitCode.trim().toUpperCase(),
    name: payload.name.trim(),
    category: payload.category.trim(),
    description: payload.description.trim(),
    targetTestCodes: payload.targetTestCodes || [],
    activeBOMVersion: 1,
    estimatedCostPerKitInr: payload.estimatedCostPerKitInr || 45.0,
    iconEmoji: payload.iconEmoji || '📦',
    colorBadge: payload.colorBadge || '#0D9488',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const bomId = `BOM-${kitId}-V1`;
  const bom: KitBOMVersionRecord = {
    id: bomId,
    kitDefinitionId: kitId,
    version: 1,
    components: payload.initialComponents,
    approvedByUid: actor.uid,
    approvedByEmail: actor.email,
    approvedAt: now,
    isActive: true,
    notes: 'Initial Bill of Materials definition',
  };

  DEV_DATA_STORE.kitDefinitions.set(kitId, kit);
  DEV_DATA_STORE.kitBomVersions.set(bomId, bom);

  if (db && !isMockMode) {
    const batch = db.batch();
    batch.set(db.collection('kitDefinitions').doc(kitId), deepCleanFirestorePayload(kit));
    batch.set(db.collection('kitBomVersions').doc(bomId), deepCleanFirestorePayload(bom));
    await batch.commit();
  }

  return { kit, bom };
}
