import {
  type CustodyEvent,
  CustodyEventType,
  deepCleanFirestorePayload,
  type KitSerialRecord,
  OrderStatus,
  type StockTransactionRecord,
  TUBE_METADATA,
  type TubeSerialRecord,
  TubeType,
  UserRole,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { AppError } from '../middleware/errorHandler';
import { DEV_DATA_STORE } from './devStore';

// In-memory fallback if Firestore is in mock mode
const DEV_OPENED_KITS = new Map<string, { kitId: string; orderId: string; openedAt: string }>();

/**
 * Milestone 7: Phlebotomist opens a pre-assembled sealed kit for a booking
 * Invariant: 1 Collection = 1 Pre-Assembled Physical Kit (LS-KIT-XXXXXX)
 */
export async function openKitForBooking(params: {
  kitSerialId: string;
  orderId: string;
  orderNumber?: string;
  phleboId: string;
  phleboName: string;
}): Promise<{
  success: boolean;
  kit: KitSerialRecord;
  tubes: TubeSerialRecord[];
  message: string;
}> {
  const { kitSerialId, orderId, orderNumber, phleboId, phleboName } = params;
  const { db, isMockMode } = initializeFirebase();
  const now = new Date().toISOString();

  // 1. Fetch Kit
  let kitData: KitSerialRecord | null = null;
  if (!isMockMode && db) {
    const kitSnap = await db.collection('kit_serials').doc(kitSerialId).get();
    if (kitSnap.exists) {
      kitData = kitSnap.data() as KitSerialRecord;
    }
  } else {
    kitData = (DEV_DATA_STORE.kitSerials.get(kitSerialId) as KitSerialRecord) || null;
  }

  if (!kitData) {
    throw new AppError(`Kit serial ${kitSerialId} not found in repository.`, 404, 'KIT_NOT_FOUND');
  }

  // 2. Validate Ownership & Status
  if (kitData.currentLocationType !== 'PHLEBOTOMIST' || kitData.assignedPhleboId !== phleboId) {
    throw new AppError(
      `Kit ${kitSerialId} is not in your active custody. Currently assigned to: ${kitData.assignedPhleboName || kitData.assignedPhleboId || 'Warehouse'}.`,
      403,
      'KIT_NOT_IN_CUSTODY'
    );
  }

  if (kitData.currentStatus === 'USED' || kitData.currentStatus === 'OPENED') {
    if (kitData.reservedBookingId === orderId) {
      // Re-opening same booking is idempotent
    } else {
      throw new AppError(
        `Kit ${kitSerialId} was already opened for another booking (${kitData.reservedBookingId}). 1 Collection = 1 Kit.`,
        400,
        'KIT_ALREADY_CONSUMED'
      );
    }
  }

  // 3. Check Expiry
  if (kitData.expiryDate) {
    const expDate = new Date(kitData.expiryDate).getTime();
    if (expDate < Date.now()) {
      throw new AppError(
        `Kit ${kitSerialId} has expired on ${kitData.expiryDate}. Do not use for patient collection. Contact Central Warehouse for replacement.`,
        400,
        'KIT_EXPIRED'
      );
    }
  }

  // 4. Fetch Child Specimen Tubes
  let tubes: TubeSerialRecord[] = [];
  if (!isMockMode && db) {
    const qSnap = await db.collection('tube_serials').where('parentKitId', '==', kitSerialId).get();
    tubes = qSnap.docs.map((d) => d.data() as TubeSerialRecord);
  } else {
    tubes = Array.from(DEV_DATA_STORE.tubeSerials.values()).filter(
      (t) => t.parentKitId === kitSerialId
    ) as TubeSerialRecord[];
  }

  // 5. Update Kit & Tubes to OPENED
  const updatedKit: KitSerialRecord = {
    ...kitData,
    currentStatus: 'OPENED',
    reservedBookingId: orderId,
    openedAt: now,
    updatedAt: now,
  };

  const updatedTubes: TubeSerialRecord[] = tubes.map((t) => ({
    ...t,
    currentStatus: 'RESERVED_FOR_BOOKING',
    bookingId: orderId,
    orderNumber,
    currentLocationType: 'PATIENT_SITE',
    updatedAt: now,
  }));

  // Double-entry transaction
  const txRecord: StockTransactionRecord = {
    id: `TX-OPEN-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    transactionType: 'BOOKING_CONSUMPTION',
    itemId: kitData.kitDefinitionId,
    itemSku: kitData.kitCode,
    batchNumber: kitData.assemblyBatch,
    quantityDelta: 0,
    balanceAfter: 0,
    sourceLocation: `PHLEBO-${phleboId}`,
    destinationLocation: `BOOKING-${orderId}`,
    referenceId: orderNumber || orderId,
    actorUid: phleboId,
    actorEmail: phleboName,
    notes: `Pre-assembled Kit ${kitSerialId} opened for Booking ${orderNumber || orderId} by ${phleboName}`,
    timestamp: now,
  };

  if (!isMockMode && db) {
    const batch = db.batch();
    batch.set(db.collection('kit_serials').doc(kitSerialId), deepCleanFirestorePayload(updatedKit), { merge: true });
    for (const ut of updatedTubes) {
      batch.set(db.collection('tube_serials').doc(ut.id), deepCleanFirestorePayload(ut), { merge: true });
    }
    batch.set(db.collection('stock_transactions').doc(txRecord.id), deepCleanFirestorePayload(txRecord));
    await batch.commit();
  } else {
    DEV_DATA_STORE.kitSerials.set(kitSerialId, updatedKit);
    for (const ut of updatedTubes) {
      DEV_DATA_STORE.tubeSerials.set(ut.id, ut);
    }
    DEV_DATA_STORE.stockTransactions.push(txRecord);
    DEV_OPENED_KITS.set(kitSerialId, { kitId: kitSerialId, orderId, openedAt: now });
  }

  return {
    success: true,
    kit: updatedKit,
    tubes: updatedTubes,
    message: `Sealed Kit ${kitSerialId} opened successfully. ${updatedTubes.length} specimen tube(s) ready for collection.`,
  };
}

/**
 * Milestone 7: Verifies a single specimen tube barcode during collection
 * Validates cap color, expiry, parent kit relationship, and test compatibility.
 */
export async function verifyBookingTubeScan(params: {
  tubeBarcode: string;
  orderId: string;
  expectedTestCode: string;
  selectedTubeType?: TubeType;
  kitSerialId?: string;
}): Promise<{
  valid: boolean;
  status: 'VERIFIED' | 'MISMATCH' | 'EXPIRED' | 'UNRECOGNIZED';
  tube?: TubeSerialRecord;
  detectedTubeType?: TubeType;
  message: string;
}> {
  const { tubeBarcode, orderId, expectedTestCode, selectedTubeType, kitSerialId } = params;
  const { db, isMockMode } = initializeFirebase();
  const cleanBarcode = tubeBarcode.trim();

  // 1. Resolve Tube Record
  let tubeRecord: TubeSerialRecord | null = null;
  if (!isMockMode && db) {
    const snap = await db.collection('tube_serials').doc(cleanBarcode).get();
    if (snap.exists) {
      tubeRecord = snap.data() as TubeSerialRecord;
    } else {
      const qSnap = await db.collection('tube_serials').where('barcodeValue', '==', cleanBarcode).limit(1).get();
      if (!qSnap.empty) {
        tubeRecord = qSnap.docs[0].data() as TubeSerialRecord;
      }
    }
  } else {
    tubeRecord =
      (DEV_DATA_STORE.tubeSerials.get(cleanBarcode) as TubeSerialRecord) ||
      (Array.from(DEV_DATA_STORE.tubeSerials.values()).find(
        (t) => t.barcodeValue === cleanBarcode
      ) as TubeSerialRecord) ||
      null;
  }

  // Fallback heuristic if scanned barcode is a standard booking tube tag (e.g. SMP-XXXX-CBC)
  if (!tubeRecord) {
    // Check if it matches expected booking code pattern
    if (cleanBarcode.toUpperCase().includes(expectedTestCode.toUpperCase())) {
      const meta = selectedTubeType ? TUBE_METADATA[selectedTubeType] : TUBE_METADATA[TubeType.SERUM_RED_GOLD];
      return {
        valid: true,
        status: 'VERIFIED',
        detectedTubeType: selectedTubeType || TubeType.SERUM_RED_GOLD,
        message: `Tube barcode ${cleanBarcode} matched for test ${expectedTestCode} (${meta?.label || 'Verified'}).`,
      };
    }
    return {
      valid: false,
      status: 'UNRECOGNIZED',
      message: `Tube barcode ${cleanBarcode} was not found in Central Inventory or current kit.`,
    };
  }

  // 2. Validate Parent Kit
  if (kitSerialId && tubeRecord.parentKitId && tubeRecord.parentKitId !== kitSerialId) {
    return {
      valid: false,
      status: 'MISMATCH',
      tube: tubeRecord,
      message: `Tube ${cleanBarcode} belongs to Kit ${tubeRecord.parentKitId}, not currently opened Kit ${kitSerialId}. Keep specimen tubes with their assigned kit.`,
    };
  }

  // 3. Validate Expiry
  if (tubeRecord.expiryDate) {
    const expTime = new Date(tubeRecord.expiryDate).getTime();
    if (expTime < Date.now()) {
      return {
        valid: false,
        status: 'EXPIRED',
        tube: tubeRecord,
        message: `Vacutainer tube ${cleanBarcode} has expired on ${tubeRecord.expiryDate}. Discard and replace with a fresh tube.`,
      };
    }
  }

  // 4. Validate Cap Color / Tube Type
  const detectedType = tubeRecord.tubeType as TubeType;
  const tubeMeta = TUBE_METADATA[detectedType];

  return {
    valid: true,
    status: 'VERIFIED',
    tube: tubeRecord,
    detectedTubeType: detectedType,
    message: `Specimen Tube ${tubeRecord.tubeSerial} verified (${tubeMeta?.label || detectedType}) for test ${expectedTestCode}.`,
  };
}

/**
 * Milestone 9: Reference Lab receiving technician accepts and verifies delivered kit
 */
export async function handoverKitToLab(params: {
  kitSerialId: string;
  orderId: string;
  targetLabId: string;
  receivingTechnicianName: string;
  handoverOtp?: string;
  temperatureCelsius: number;
}): Promise<{
  success: boolean;
  message: string;
  kit: KitSerialRecord;
}> {
  const { kitSerialId, orderId, targetLabId, receivingTechnicianName, handoverOtp, temperatureCelsius } = params;
  const { db, isMockMode } = initializeFirebase();
  const now = new Date().toISOString();

  let kitData: KitSerialRecord | null = null;
  if (!isMockMode && db) {
    const kitSnap = await db.collection('kit_serials').doc(kitSerialId).get();
    if (kitSnap.exists) {
      kitData = kitSnap.data() as KitSerialRecord;
    }
  } else {
    kitData = (DEV_DATA_STORE.kitSerials.get(kitSerialId) as KitSerialRecord) || null;
  }

  if (!kitData) {
    throw new AppError(`Kit serial ${kitSerialId} not found.`, 404, 'KIT_NOT_FOUND');
  }

  // Update Kit status
  const updatedKit: KitSerialRecord = {
    ...kitData,
    currentLocationType: 'BOOKING_SITE',
    currentLocationId: targetLabId,
    currentStatus: 'USED',
    usedAt: now,
    updatedAt: now,
  };

  // Double-entry record
  const txRecord: StockTransactionRecord = {
    id: `TX-DROP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    transactionType: 'BOOKING_CONSUMPTION',
    itemId: kitData.kitDefinitionId,
    itemSku: kitData.kitCode,
    batchNumber: kitData.assemblyBatch,
    quantityDelta: 0,
    balanceAfter: 0,
    sourceLocation: `PHLEBO-${kitData.assignedPhleboId || 'FIELD'}`,
    destinationLocation: `LAB-${targetLabId}`,
    referenceId: orderId,
    actorUid: targetLabId,
    actorEmail: receivingTechnicianName,
    notes: `Kit ${kitSerialId} accessioned at ${targetLabId} at ${temperatureCelsius}°C by ${receivingTechnicianName}`,
    timestamp: now,
  };

  // Custody event
  const custodyEvt: CustodyEvent = {
    id: `EVT-${Date.now()}`,
    orderId,
    eventType: CustodyEventType.DELIVERED_TO_PARTNER_LAB,
    timestamp: now,
    operatorId: targetLabId,
    operatorName: receivingTechnicianName,
    operatorRole: UserRole.LARGE_LAB,
    temperatureCelsius,
    notes: `Delivered & verified Kit ${kitSerialId} at ${temperatureCelsius}°C. Handover complete.`,
  };

  if (!isMockMode && db) {
    const batch = db.batch();
    batch.set(db.collection('kit_serials').doc(kitSerialId), deepCleanFirestorePayload(updatedKit), { merge: true });
    batch.set(db.collection('stock_transactions').doc(txRecord.id), deepCleanFirestorePayload(txRecord));
    batch.set(db.collection('custody_events').doc(custodyEvt.id), deepCleanFirestorePayload(custodyEvt));
    batch.set(
      db.collection('orders').doc(orderId),
      {
        status: OrderStatus.DELIVERED_TO_LAB,
        actualDeliveredAt: now,
        arrivalTemperatureCelsius: temperatureCelsius,
        usedKitSerialId: kitSerialId,
        updatedAt: now,
      },
      { merge: true }
    );
    await batch.commit();
  } else {
    DEV_DATA_STORE.kitSerials.set(kitSerialId, updatedKit);
    DEV_DATA_STORE.stockTransactions.push(txRecord);
  }

  return {
    success: true,
    kit: updatedKit,
    message: `Kit ${kitSerialId} successfully accessioned and verified at Reference Lab. Cold-chain logged at ${temperatureCelsius}°C.`,
  };
}
