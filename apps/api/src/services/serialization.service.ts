import {
  type KitSerialRecord,
  type KitSerialStatus,
  type TubeSerialRecord,
  type TubeSerialStatus,
  TubeType,
  deepCleanFirestorePayload,
} from '@diagnostic/shared';
import * as admin from 'firebase-admin';
import { initializeFirebase } from '../config/firebase';
import { DEV_DATA_STORE } from './devStore';
import { resolveSupplierBarcode } from './inventory-master.service';

/**
 * Generates an immutable, sequential-like unique Kit Serial ID.
 * Format: LS-KIT-YYYYMMDD-XXXX (e.g. LS-KIT-20261115-0104)
 */
export function generateKitSerialId(dateStr?: string, counter?: number): string {
  const d = dateStr || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix =
    counter !== undefined
      ? String(counter).padStart(4, '0')
      : Math.floor(1000 + Math.random() * 9000).toString();
  return `LS-KIT-${d}-${suffix}`;
}

/**
 * Generates an immutable, sequential-like unique Vacutainer Tube Serial ID.
 * Format: LS-TUBE-YYYYMMDD-XXXXXX (e.g. LS-TUBE-20261115-001042)
 */
export function generateTubeSerialId(dateStr?: string, counter?: number): string {
  const d = dateStr || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix =
    counter !== undefined
      ? String(counter).padStart(6, '0')
      : Math.floor(100000 + Math.random() * 900000).toString();
  return `LS-TUBE-${d}-${suffix}`;
}

/**
 * Fetches all physical kit serials with optional status and assignment filters
 */
export async function getKitSerials(filters?: {
  status?: KitSerialStatus;
  kitCode?: string;
  assignedPhleboId?: string;
  limit?: number;
}): Promise<KitSerialRecord[]> {
  const { db, isMockMode } = initializeFirebase();
  const limitCount = filters?.limit || 100;

  if (db && !isMockMode) {
    try {
      let query: admin.firestore.Query = db.collection('kitSerials');

      if (filters?.status) {
        query = query.where('currentStatus', '==', filters.status);
      }
      if (filters?.kitCode) {
        query = query.where('kitCode', '==', filters.kitCode);
      }
      if (filters?.assignedPhleboId) {
        query = query.where('assignedPhleboId', '==', filters.assignedPhleboId);
      }

      const snap = await query.limit(limitCount).get();
      if (!snap.empty) {
        const results = snap.docs.map((d) => d.data() as KitSerialRecord);
        return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
    } catch (err) {
      console.warn('Failed querying kitSerials from Firestore:', err);
    }
  }

  // Fallback to in-memory store
  return Array.from(DEV_DATA_STORE.kitSerials.values())
    .filter((k) => {
      if (filters?.status && k.currentStatus !== filters.status) return false;
      if (filters?.kitCode && k.kitCode !== filters.kitCode) return false;
      if (filters?.assignedPhleboId && k.assignedPhleboId !== filters.assignedPhleboId) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limitCount);
}

/**
 * Gets details of a specific Kit Serial along with its child specimen tubes
 */
export async function getKitSerialWithTubes(kitSerial: string): Promise<{
  kit: KitSerialRecord | null;
  tubes: TubeSerialRecord[];
}> {
  const { db, isMockMode } = initializeFirebase();

  let kit: KitSerialRecord | null = null;
  let tubes: TubeSerialRecord[] = [];

  if (db && !isMockMode) {
    try {
      const kitDoc = await db.collection('kitSerials').doc(kitSerial).get();
      if (kitDoc.exists) {
        kit = kitDoc.data() as KitSerialRecord;
      }

      const tubesSnap = await db
        .collection('tubeSerials')
        .where('parentKitId', '==', kitSerial)
        .get();

      if (!tubesSnap.empty) {
        tubes = tubesSnap.docs.map((d) => d.data() as TubeSerialRecord);
      }
    } catch (err) {
      console.warn('Failed fetching kit serial with tubes from Firestore:', err);
    }
  }

  if (!kit && DEV_DATA_STORE.kitSerials.has(kitSerial)) {
    kit = DEV_DATA_STORE.kitSerials.get(kitSerial) as KitSerialRecord;
  }

  if (tubes.length === 0) {
    tubes = Array.from(DEV_DATA_STORE.tubeSerials.values()).filter(
      (t) => t.parentKitId === kitSerial
    );
  }

  return { kit, tubes };
}

/**
 * Fetches all physical tube serials with optional filtering
 */
export async function getTubeSerials(filters?: {
  parentKitId?: string;
  status?: TubeSerialStatus;
  tubeType?: TubeType;
  limit?: number;
}): Promise<TubeSerialRecord[]> {
  const { db, isMockMode } = initializeFirebase();
  const limitCount = filters?.limit || 100;

  if (db && !isMockMode) {
    try {
      let query: admin.firestore.Query = db.collection('tubeSerials');

      if (filters?.parentKitId) {
        query = query.where('parentKitId', '==', filters.parentKitId);
      }
      if (filters?.status) {
        query = query.where('currentStatus', '==', filters.status);
      }
      if (filters?.tubeType) {
        query = query.where('tubeType', '==', filters.tubeType);
      }

      const snap = await query.limit(limitCount).get();
      if (!snap.empty) {
        const results = snap.docs.map((d) => d.data() as TubeSerialRecord);
        return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
    } catch (err) {
      console.warn('Failed querying tubeSerials from Firestore:', err);
    }
  }

  return Array.from(DEV_DATA_STORE.tubeSerials.values())
    .filter((t) => {
      if (filters?.parentKitId && t.parentKitId !== filters.parentKitId) return false;
      if (filters?.status && t.currentStatus !== filters.status) return false;
      if (filters?.tubeType && t.tubeType !== filters.tubeType) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limitCount);
}

/**
 * Universal 3-Level Barcode Resolver
 * Automatically identifies and returns data for:
 * - Level 1: Supplier Barcode (Box / Carton SKU)
 * - Level 2: Kit Serial Barcode (LS-KIT-XXXXXX)
 * - Level 3: Individual Tube Barcode (LS-TUBE-XXXXXX)
 */
export async function resolveBarcodeIdentity(barcodeInput: string): Promise<{
  level: 'LEVEL_1_SUPPLIER' | 'LEVEL_2_KIT' | 'LEVEL_3_TUBE' | 'UNKNOWN';
  barcode: string;
  identified: boolean;
  supplierProduct?: any;
  kitRecord?: KitSerialRecord;
  kitChildTubes?: TubeSerialRecord[];
  tubeRecord?: TubeSerialRecord;
  parentKitRecord?: KitSerialRecord;
  message: string;
}> {
  const trimmed = barcodeInput.trim();

  // 1. Check for Level 2 Kit Serial (LS-KIT-*)
  if (trimmed.startsWith('LS-KIT-')) {
    const { kit, tubes } = await getKitSerialWithTubes(trimmed);
    if (kit) {
      return {
        level: 'LEVEL_2_KIT',
        barcode: trimmed,
        identified: true,
        kitRecord: kit,
        kitChildTubes: tubes,
        message: `Identified Pre-Assembled Kit ${kit.kitName} (${kit.kitCode}) containing ${tubes.length} specimen tubes. Status: ${kit.currentStatus}.`,
      };
    }
  }

  // 2. Check for Level 3 Tube Serial (LS-TUBE-*)
  if (trimmed.startsWith('LS-TUBE-')) {
    const { db, isMockMode } = initializeFirebase();
    let tube: TubeSerialRecord | null = null;

    if (db && !isMockMode) {
      try {
        const doc = await db.collection('tubeSerials').doc(trimmed).get();
        if (doc.exists) {
          tube = doc.data() as TubeSerialRecord;
        }
      } catch (err) {
        console.warn('Firestore tube lookup error:', err);
      }
    }

    if (!tube && DEV_DATA_STORE.tubeSerials.has(trimmed)) {
      tube = DEV_DATA_STORE.tubeSerials.get(trimmed) as TubeSerialRecord;
    }

    if (tube) {
      // Also fetch parent kit for context
      let parentKit: KitSerialRecord | null = null;
      if (tube.parentKitId) {
        const { kit } = await getKitSerialWithTubes(tube.parentKitId);
        parentKit = kit;
      }

      return {
        level: 'LEVEL_3_TUBE',
        barcode: trimmed,
        identified: true,
        tubeRecord: tube,
        parentKitRecord: parentKit || undefined,
        message: `Identified Specimen Tube ${tube.tubeType} (${tube.sku}). Lot: ${tube.supplierBatch}, Expiry: ${tube.expiryDate}. Current Status: ${tube.currentStatus}.`,
      };
    }
  }

  // 3. Check for Level 1 Supplier Barcode
  const supplierMatch = await resolveSupplierBarcode(trimmed);
  if (supplierMatch.found) {
    return {
      level: 'LEVEL_1_SUPPLIER',
      barcode: trimmed,
      identified: true,
      supplierProduct: supplierMatch,
      message: `Identified Supplier Barcode mapped to ${supplierMatch.item?.name} (${supplierMatch.packageUnit}, ${supplierMatch.multiplierToBaseUnit} units/pack).`,
    };
  }

  return {
    level: 'UNKNOWN',
    barcode: trimmed,
    identified: false,
    message: `Barcode "${trimmed}" not recognized. It is neither an registered Supplier Barcode, Kit Barcode (LS-KIT-*), nor Specimen Tube (LS-TUBE-*).`,
  };
}
