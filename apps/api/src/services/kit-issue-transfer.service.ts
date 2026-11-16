import * as admin from 'firebase-admin';
import {
  type KitIssueRecord,
  type KitSerialRecord,
  type KitTransferRecord,
  type StockTransactionRecord,
  type TubeSerialRecord,
  deepCleanFirestorePayload,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { DEV_DATA_STORE } from './devStore';
import { getKitSerialWithTubes } from './serialization.service';

/**
 * Central Warehouse Issues Assembled Physical Kits to Field Phlebotomist
 */
export async function issueKitsToPhlebotomist(
  payload: {
    phlebotomistId: string;
    phlebotomistName?: string;
    phlebotomistPhone?: string;
    kitSerials: string[];
    warehouseId?: string;
    notes?: string;
  },
  actor: { uid: string; email: string }
): Promise<{
  success: boolean;
  issueRecord: KitIssueRecord;
  issuedKits: KitSerialRecord[];
}> {
  const { kitSerials, phlebotomistId } = payload;
  if (!kitSerials || kitSerials.length === 0) {
    throw new Error('At least one kit serial barcode must be selected for issue.');
  }
  if (!phlebotomistId) {
    throw new Error('Target phlebotomist must be specified.');
  }

  const warehouseId = payload.warehouseId || 'WH-CENTRAL-MAIN';
  const now = new Date().toISOString();
  const issueId = `ISS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const issueNumber = `ISS-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

  // Find recipient phlebotomist name if not provided
  let phleboName = payload.phlebotomistName || 'Field Phlebotomist';
  let phleboPhone = payload.phlebotomistPhone || '';

  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode && (!payload.phlebotomistName || !payload.phlebotomistPhone)) {
    try {
      const phleboDoc = await db.collection('phlebotomists').doc(phlebotomistId).get();
      if (phleboDoc.exists) {
        const pData = phleboDoc.data();
        if (pData?.name) phleboName = pData.name;
        if (pData?.phone) phleboPhone = pData.phone;
      }
    } catch (err) {
      console.warn('Phlebotomist lookup notice:', err);
    }
  }

  // Verify and load all kits to be issued
  const kitsToUpdate: KitSerialRecord[] = [];
  const tubesToUpdate: TubeSerialRecord[] = [];
  const transactionsToCreate: StockTransactionRecord[] = [];

  for (const serial of kitSerials) {
    const { kit, tubes } = await getKitSerialWithTubes(serial);
    if (!kit) {
      throw new Error(`Kit barcode ${serial} not found in central inventory.`);
    }
    if (kit.currentStatus !== 'READY') {
      throw new Error(
        `Kit ${serial} is in status "${kit.currentStatus}" and cannot be issued. Only READY kits can be dispatched.`
      );
    }

    const updatedKit: KitSerialRecord = {
      ...kit,
      currentStatus: 'IN_TRANSIT',
      currentLocationType: 'PHLEBOTOMIST',
      currentLocationId: phlebotomistId,
      assignedPhleboId: phlebotomistId,
      assignedPhleboName: phleboName,
      updatedAt: now,
    };
    kitsToUpdate.push(updatedKit);

    // Update child tubes custody location
    for (const t of tubes) {
      const updatedTube: TubeSerialRecord = {
        ...t,
        currentLocationType: 'PHLEBO',
        currentLocationId: phlebotomistId,
        updatedAt: now,
      };
      tubesToUpdate.push(updatedTube);
    }

    // Ledger transaction
    const tx: StockTransactionRecord = {
      id: `TX-DISPATCH-${kit.id}-${Date.now().toString(36)}`,
      transactionType: 'KIT_DISPATCH',
      itemId: kit.kitDefinitionId,
      itemSku: kit.kitCode,
      quantityDelta: -1,
      balanceAfter: 0,
      sourceLocation: warehouseId,
      destinationLocation: phleboName,
      referenceId: issueId,
      notes: `Issued kit ${kit.kitSerial} to courier ${phleboName} (${phlebotomistId})`,
      actorUid: actor.uid,
      actorEmail: actor.email,
      timestamp: now,
    };
    transactionsToCreate.push(tx);
  }

  const issueRecord: KitIssueRecord = {
    id: issueId,
    issueNumber,
    phlebotomistId,
    phlebotomistName: phleboName,
    phlebotomistPhone: phleboPhone,
    kitSerials: kitsToUpdate.map((k) => k.kitSerial),
    totalKits: kitsToUpdate.length,
    warehouseId,
    issuedByUid: actor.uid,
    issuedByEmail: actor.email,
    issuedAt: now,
    status: 'DISPATCHED',
    notes: payload.notes || 'Central warehouse kit issuance to field courier',
  };

  // Perform atomic updates in Firestore
  if (db && !isMockMode) {
    const batch = db.batch();

    // 1. Write KitIssue document
    batch.set(db.collection('kitIssues').doc(issueId), deepCleanFirestorePayload(issueRecord));

    // 2. Update all physical Kit Serials
    for (const k of kitsToUpdate) {
      batch.set(db.collection('kitSerials').doc(k.id), deepCleanFirestorePayload(k));
    }

    // 3. Update all child Specimen Tube Serials
    for (const t of tubesToUpdate) {
      batch.set(db.collection('tubeSerials').doc(t.id), deepCleanFirestorePayload(t));
    }

    // 4. Record Ledger Transactions
    for (const tx of transactionsToCreate) {
      batch.set(db.collection('stockTransactions').doc(tx.id), deepCleanFirestorePayload(tx));
    }

    await batch.commit();
  }

  // Update in-memory dev store
  DEV_DATA_STORE.kitIssues.set(issueId, issueRecord);
  for (const k of kitsToUpdate) {
    DEV_DATA_STORE.kitSerials.set(k.id, k);
  }
  for (const t of tubesToUpdate) {
    DEV_DATA_STORE.tubeSerials.set(t.id, t);
  }
  for (const tx of transactionsToCreate) {
    DEV_DATA_STORE.stockTransactions.unshift(tx);
  }

  return {
    success: true,
    issueRecord,
    issuedKits: kitsToUpdate,
  };
}

/**
 * Phlebotomist confirms custody receipt of dispatched kits
 */
export async function confirmKitIssueReceipt(
  kitSerials: string[],
  phlebotomistId: string
): Promise<{ success: boolean; confirmedKitsCount: number }> {
  const { db, isMockMode } = initializeFirebase();
  const now = new Date().toISOString();
  let count = 0;

  for (const serial of kitSerials) {
    const { kit } = await getKitSerialWithTubes(serial);
    if (!kit) continue;

    if (kit.assignedPhleboId === phlebotomistId) {
      const updatedKit: KitSerialRecord = {
        ...kit,
        currentStatus: 'AVAILABLE_WITH_PHLEBO',
        updatedAt: now,
      };

      if (db && !isMockMode) {
        await db.collection('kitSerials').doc(kit.id).update({
          currentStatus: 'AVAILABLE_WITH_PHLEBO',
          updatedAt: now,
        });
      }
      DEV_DATA_STORE.kitSerials.set(kit.id, updatedKit);
      count++;
    }
  }

  return { success: true, confirmedKitsCount: count };
}

/**
 * Gets all live kit stock held by a specific field phlebotomist
 */
export async function getPhleboKitsInventory(phlebotomistId: string): Promise<{
  totalKitsCount: number;
  availableKitsCount: number;
  inTransitKitsCount: number;
  kits: Array<KitSerialRecord & { childTubesCount: number }>;
}> {
  const { db, isMockMode } = initializeFirebase();
  let kitsList: KitSerialRecord[] = [];

  if (db && !isMockMode) {
    try {
      const snap = await db
        .collection('kitSerials')
        .where('assignedPhleboId', '==', phlebotomistId)
        .get();

      if (!snap.empty) {
        kitsList = snap.docs.map((d) => d.data() as KitSerialRecord);
      }
    } catch (err) {
      console.warn('Phlebo kit inventory query error:', err);
    }
  }

  if (kitsList.length === 0) {
    kitsList = Array.from(DEV_DATA_STORE.kitSerials.values()).filter(
      (k) => k.assignedPhleboId === phlebotomistId
    );
  }

  const enrichedKits = await Promise.all(
    kitsList.map(async (k) => {
      const { tubes } = await getKitSerialWithTubes(k.kitSerial);
      return {
        ...k,
        childTubesCount: tubes.length,
      };
    })
  );

  const available = enrichedKits.filter((k) => k.currentStatus === 'AVAILABLE_WITH_PHLEBO').length;
  const inTransit = enrichedKits.filter((k) => k.currentStatus === 'IN_TRANSIT').length;

  return {
    totalKitsCount: enrichedKits.length,
    availableKitsCount: available,
    inTransitKitsCount: inTransit,
    kits: enrichedKits,
  };
}

/**
 * Initiates an emergency Courier-to-Courier (Phlebo-to-Phlebo) Kit Transfer
 */
export async function initiatePhleboPeerTransfer(payload: {
  senderPhleboId: string;
  senderPhleboName?: string;
  receiverPhleboId: string;
  receiverPhleboName?: string;
  kitSerials: string[];
  transferReason: string;
}): Promise<{ success: boolean; transferRecord: KitTransferRecord }> {
  const { senderPhleboId, receiverPhleboId, kitSerials, transferReason } = payload;
  if (!kitSerials || kitSerials.length === 0) {
    throw new Error('At least one kit serial must be selected for peer transfer.');
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hour expiry
  const transferId = `XFER-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const transferNumber = `XFER-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

  // Verify all kits belong to sender and are AVAILABLE_WITH_PHLEBO
  for (const serial of kitSerials) {
    const { kit } = await getKitSerialWithTubes(serial);
    if (!kit) throw new Error(`Kit ${serial} not found.`);
    if (kit.assignedPhleboId !== senderPhleboId) {
      throw new Error(`Kit ${serial} is not assigned to you.`);
    }
    if (kit.currentStatus !== 'AVAILABLE_WITH_PHLEBO') {
      throw new Error(`Kit ${serial} is not currently available for transfer.`);
    }
  }

  const transferRecord: KitTransferRecord = {
    id: transferId,
    transferNumber,
    senderPhleboId,
    senderPhleboName: payload.senderPhleboName || 'Field Courier',
    receiverPhleboId,
    receiverPhleboName: payload.receiverPhleboName || 'Peer Courier',
    kitSerials,
    totalKits: kitSerials.length,
    status: 'PENDING_ACCEPTANCE',
    transferReason,
    initiatedAt: now,
    expiresAt,
  };

  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    const batch = db.batch();
    batch.set(db.collection('kitTransfers').doc(transferId), deepCleanFirestorePayload(transferRecord));

    // Mark kits as IN_TRANSIT
    for (const serial of kitSerials) {
      batch.update(db.collection('kitSerials').doc(serial), {
        currentStatus: 'IN_TRANSIT',
        updatedAt: now,
      });
    }
    await batch.commit();
  }

  DEV_DATA_STORE.kitTransfers.set(transferId, transferRecord);
  for (const serial of kitSerials) {
    const k = DEV_DATA_STORE.kitSerials.get(serial) as KitSerialRecord | undefined;
    if (k) {
      k.currentStatus = 'IN_TRANSIT';
      k.updatedAt = now;
    }
  }

  return { success: true, transferRecord };
}

/**
 * Responds to a Peer Transfer (Accept or Reject)
 */
export async function respondToPhleboPeerTransfer(payload: {
  transferId: string;
  receiverPhleboId: string;
  action: 'ACCEPT' | 'REJECT';
  rejectionReason?: string;
}): Promise<{ success: boolean; transferRecord: KitTransferRecord }> {
  const { transferId, receiverPhleboId, action, rejectionReason } = payload;
  const now = new Date().toISOString();
  const { db, isMockMode } = initializeFirebase();

  let transfer: KitTransferRecord | null = null;
  if (db && !isMockMode) {
    try {
      const doc = await db.collection('kitTransfers').doc(transferId).get();
      if (doc.exists) transfer = doc.data() as KitTransferRecord;
    } catch (err) {
      console.warn('Transfer lookup error:', err);
    }
  }
  if (!transfer) {
    transfer = DEV_DATA_STORE.kitTransfers.get(transferId) || null;
  }
  if (!transfer) throw new Error('Transfer record not found.');
  if (transfer.receiverPhleboId !== receiverPhleboId) {
    throw new Error('You are not authorized to respond to this transfer.');
  }
  if (transfer.status !== 'PENDING_ACCEPTANCE') {
    throw new Error(`Transfer is already in status "${transfer.status}".`);
  }

  if (action === 'ACCEPT') {
    transfer.status = 'ACCEPTED';
    transfer.respondedAt = now;

    if (db && !isMockMode) {
      const batch = db.batch();
      batch.update(db.collection('kitTransfers').doc(transferId), {
        status: 'ACCEPTED',
        respondedAt: now,
      });

      for (const serial of transfer.kitSerials) {
        batch.update(db.collection('kitSerials').doc(serial), {
          assignedPhleboId: receiverPhleboId,
          assignedPhleboName: transfer.receiverPhleboName,
          currentLocationId: receiverPhleboId,
          currentStatus: 'AVAILABLE_WITH_PHLEBO',
          updatedAt: now,
        });

        const { tubes } = await getKitSerialWithTubes(serial);
        for (const t of tubes) {
          batch.update(db.collection('tubeSerials').doc(t.id), {
            currentLocationId: receiverPhleboId,
            updatedAt: now,
          });
        }
      }
      await batch.commit();
    }

    // In-memory update
    for (const serial of transfer.kitSerials) {
      const k = DEV_DATA_STORE.kitSerials.get(serial) as KitSerialRecord | undefined;
      if (k) {
        k.assignedPhleboId = receiverPhleboId;
        k.assignedPhleboName = transfer.receiverPhleboName;
        k.currentLocationId = receiverPhleboId;
        k.currentStatus = 'AVAILABLE_WITH_PHLEBO';
        k.updatedAt = now;
      }
    }
  } else {
    transfer.status = 'REJECTED';
    transfer.respondedAt = now;
    transfer.rejectionReason = rejectionReason || 'Rejected by receiving courier';

    if (db && !isMockMode) {
      const batch = db.batch();
      batch.update(db.collection('kitTransfers').doc(transferId), {
        status: 'REJECTED',
        respondedAt: now,
        rejectionReason: transfer.rejectionReason,
      });
      for (const serial of transfer.kitSerials) {
        batch.update(db.collection('kitSerials').doc(serial), {
          currentStatus: 'AVAILABLE_WITH_PHLEBO',
          updatedAt: now,
        });
      }
      await batch.commit();
    }

    for (const serial of transfer.kitSerials) {
      const k = DEV_DATA_STORE.kitSerials.get(serial) as KitSerialRecord | undefined;
      if (k) {
        k.currentStatus = 'AVAILABLE_WITH_PHLEBO';
        k.updatedAt = now;
      }
    }
  }

  DEV_DATA_STORE.kitTransfers.set(transferId, transfer);
  return { success: true, transferRecord: transfer };
}

/**
 * Gets kit issuance history
 */
export async function getKitIssuesHistory(limit = 50): Promise<KitIssueRecord[]> {
  const { db, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    try {
      const snap = await db.collection('kitIssues').orderBy('issuedAt', 'desc').limit(limit).get();
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as KitIssueRecord);
      }
    } catch (err) {
      console.warn('Failed querying kitIssues:', err);
    }
  }

  return Array.from(DEV_DATA_STORE.kitIssues.values())
    .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
    .slice(0, limit);
}
