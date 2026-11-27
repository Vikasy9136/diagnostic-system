import crypto from 'node:crypto';
import * as admin from 'firebase-admin';
import { Router, type NextFunction, type Response } from 'express';
import { AppError, db } from './firebaseAdmin';
import { type AuthenticatedRequest, requireAuth, requireRoles } from './rbac';
import { UserRole } from './types';

export type ScannerMode = 'ONE_SCAN' | 'MULTI_SCAN';
export type ScannerSessionStatus = 'WAITING_FOR_DEVICE' | 'CONNECTED' | 'CLOSED' | 'EXPIRED';
export type ScanBarcodeType =
  | 'SKU_BARCODE'
  | 'SUPPLIER_BARCODE'
  | 'KIT_BARCODE'
  | 'SERIALIZED_TUBE_BARCODE'
  | 'BATCH_BARCODE'
  | 'UNKNOWN';

export interface ScannerBridgeEventRecord {
  id: string;
  eventId: string;
  sessionId: string;
  barcode: string;
  barcodeType: ScanBarcodeType;
  symbology: string;
  status: 'MATCHED' | 'UNKNOWN_BARCODE' | 'MAPPED';
  recordStatus: 'RECORDED';
  itemId: string | null;
  itemName: string | null;
  sku: string | null;
  kitId: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  warehouseLocation: string | null;
  scannedAt: string;
  acknowledgedAt: string;
  pairedDeviceId: string | null;
  pairedDeviceName: string;
  operatorEmail: string | null;
  context: string;
  metadata?: Record<string, unknown>;
}

const requireInventoryAdmin = requireRoles(UserRole.ADMIN);

async function resolveInventoryBarcode(cleanBarcode: string, defaultWarehouse?: string) {
  // 1. Direct Inventory Item Master (SKU or barcode or doc ID)
  const itemBySku = await db.collection('inventoryItems').where('sku', '==', cleanBarcode).limit(1).get();
  if (!itemBySku.empty) {
    const d = itemBySku.docs[0];
    const data = d.data() || {};
    return {
      matched: true,
      barcodeType: 'SKU_BARCODE' as ScanBarcodeType,
      itemId: d.id,
      itemName: String(data.name || data.itemName || cleanBarcode),
      sku: String(data.sku || cleanBarcode),
      kitId: null,
      batchNumber: null,
      expiryDate: null,
      warehouseLocation: String(data.warehouseLocation || defaultWarehouse || 'Central Warehouse'),
    };
  }

  const itemByBarcode = await db.collection('inventoryItems').where('barcode', '==', cleanBarcode).limit(1).get();
  if (!itemByBarcode.empty) {
    const d = itemByBarcode.docs[0];
    const data = d.data() || {};
    return {
      matched: true,
      barcodeType: 'SKU_BARCODE' as ScanBarcodeType,
      itemId: d.id,
      itemName: String(data.name || data.itemName || cleanBarcode),
      sku: String(data.sku || d.id),
      kitId: null,
      batchNumber: null,
      expiryDate: null,
      warehouseLocation: String(data.warehouseLocation || defaultWarehouse || 'Central Warehouse'),
    };
  }

  // 2. Supplier / Package Barcode Mapping
  const supSnap = await db
    .collection('supplierBarcodeMappings')
    .where('supplierBarcode', '==', cleanBarcode)
    .limit(1)
    .get();
  if (!supSnap.empty) {
    const mapData = supSnap.docs[0].data() || {};
    const linkedItemId = String(mapData.itemId || '');
    let itemName = String(mapData.itemName || mapData.packageLabel || cleanBarcode);
    let sku = String(mapData.sku || linkedItemId || cleanBarcode);
    if (linkedItemId) {
      const itemDoc = await db.collection('inventoryItems').doc(linkedItemId).get();
      if (itemDoc.exists) {
        const iData = itemDoc.data() || {};
        itemName = String(iData.name || iData.itemName || itemName);
        sku = String(iData.sku || sku);
      }
    }
    return {
      matched: true,
      barcodeType: 'SUPPLIER_BARCODE' as ScanBarcodeType,
      itemId: linkedItemId || null,
      itemName,
      sku,
      kitId: null,
      batchNumber: null,
      expiryDate: null,
      warehouseLocation: String(defaultWarehouse || 'Central Warehouse'),
    };
  }

  // 3. Kit Serial / Kit Barcode
  const kitSnap = await db.collection('kitSerials').where('kitSerial', '==', cleanBarcode).limit(1).get();
  if (!kitSnap.empty) {
    const d = kitSnap.docs[0];
    const data = d.data() || {};
    return {
      matched: true,
      barcodeType: 'KIT_BARCODE' as ScanBarcodeType,
      itemId: data.kitDefinitionId ? String(data.kitDefinitionId) : null,
      itemName: String(data.kitName || data.kitTitle || `Diagnostic Kit ${cleanBarcode}`),
      sku: String(data.kitCode || cleanBarcode),
      kitId: d.id,
      batchNumber: data.batchNumber ? String(data.batchNumber) : null,
      expiryDate: data.expiryDate ? String(data.expiryDate) : null,
      warehouseLocation: String(data.warehouseLocation || defaultWarehouse || 'Central Warehouse'),
    };
  }

  // 4. Serialized Tube Barcode
  const tubeSnap = await db.collection('tubeSerials').where('tubeBarcode', '==', cleanBarcode).limit(1).get();
  if (!tubeSnap.empty) {
    const d = tubeSnap.docs[0];
    const data = d.data() || {};
    return {
      matched: true,
      barcodeType: 'SERIALIZED_TUBE_BARCODE' as ScanBarcodeType,
      itemId: data.itemId ? String(data.itemId) : null,
      itemName: String(data.itemName || data.tubeType || `Specimen Tube ${cleanBarcode}`),
      sku: String(data.sku || data.tubeType || cleanBarcode),
      kitId: data.kitSerial ? String(data.kitSerial) : null,
      batchNumber: data.batchNumber ? String(data.batchNumber) : null,
      expiryDate: data.expiryDate ? String(data.expiryDate) : null,
      warehouseLocation: String(data.warehouseLocation || defaultWarehouse || 'Central Warehouse'),
    };
  }

  // 5. Stock Batch Barcode
  const batchSnap = await db.collection('stockBatches').where('batchNumber', '==', cleanBarcode).limit(1).get();
  if (!batchSnap.empty) {
    const d = batchSnap.docs[0];
    const data = d.data() || {};
    return {
      matched: true,
      barcodeType: 'BATCH_BARCODE' as ScanBarcodeType,
      itemId: data.itemId ? String(data.itemId) : null,
      itemName: String(data.itemName || `Batch ${cleanBarcode}`),
      sku: data.sku ? String(data.sku) : null,
      kitId: null,
      batchNumber: String(data.batchNumber || cleanBarcode),
      expiryDate: data.expiryDate ? String(data.expiryDate) : null,
      warehouseLocation: String(data.warehouseLocation || defaultWarehouse || 'Central Warehouse'),
    };
  }

  return {
    matched: false,
    barcodeType: 'UNKNOWN' as ScanBarcodeType,
    itemId: null,
    itemName: null,
    sku: null,
    kitId: null,
    batchNumber: null,
    expiryDate: null,
    warehouseLocation: defaultWarehouse || 'Central Warehouse',
  };
}

export function createScannerBridgeRouter(): Router {
  const r = Router();

  // Create pairing session (Desktop Admin)
  r.post(
    '/session',
    requireAuth,
    requireInventoryAdmin,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const mode: ScannerMode = req.body?.mode === 'MULTI_SCAN' ? 'MULTI_SCAN' : 'ONE_SCAN';
        const context = String(req.body?.context || 'Central Warehouse Inventory').slice(0, 120);
        const warehouseId = req.body?.warehouseId ? String(req.body.warehouseId).slice(0, 64) : 'CENTRAL_WAREHOUSE';

        const sessionId = `BRIDGE-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const pairingToken = `TOK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 45 * 60 * 1000).toISOString();

        const session = {
          sessionId,
          pairingToken,
          status: 'WAITING_FOR_DEVICE' as ScannerSessionStatus,
          mode,
          context,
          warehouseId,
          operatorEmail: req.user?.email || 'admin@labsetu.com',
          operatorUid: req.user?.uid || null,
          createdAt: now.toISOString(),
          expiresAt,
          lastActiveAt: now.toISOString(),
          scanCount: 0,
        };

        await db.collection('scannerPairingSessions').doc(sessionId).set(session);
        return res.status(201).json({ success: true, session });
      } catch (e) {
        return next(e);
      }
    }
  );

  // Pair mobile scanner using sessionId + pairingToken (No user session required on phone camera, token-verified)
  r.post('/:sessionId/pair', async (req, res: Response, next: NextFunction) => {
    try {
      const sessionId = String(req.params.sessionId || '').trim();
      const pairingToken = String(req.body?.pairingToken || '').trim();
      const deviceId = String(req.body?.deviceId || '').trim();
      const deviceName = String(req.body?.deviceName || 'Mobile Scanner').slice(0, 100);

      if (!sessionId || !pairingToken || !deviceId) {
        throw new AppError('sessionId, pairingToken, and deviceId are required.', 400, 'INVALID_PAIR_PAYLOAD');
      }

      const sessRef = db.collection('scannerPairingSessions').doc(sessionId);
      const snap = await sessRef.get();
      if (!snap.exists) {
        throw new AppError('Scanner pairing session not found or expired.', 404, 'SESSION_NOT_FOUND');
      }
      const sess = snap.data()!;
      if (sess.pairingToken !== pairingToken) {
        throw new AppError('Invalid pairing token for this scanner session.', 401, 'INVALID_PAIRING_TOKEN');
      }
      if (sess.status === 'CLOSED') {
        throw new AppError('Scanner session is already closed.', 410, 'SESSION_CLOSED');
      }
      if (new Date(sess.expiresAt).getTime() < Date.now()) {
        await sessRef.update({ status: 'EXPIRED', lastActiveAt: new Date().toISOString() });
        throw new AppError('Scanner pairing session has expired.', 410, 'SESSION_EXPIRED');
      }

      const now = new Date().toISOString();
      await sessRef.update({
        status: 'CONNECTED',
        pairedDeviceId: deviceId,
        pairedDeviceName: deviceName,
        lastActiveAt: now,
      });

      return res.json({
        success: true,
        session: {
          ...sess,
          status: 'CONNECTED',
          pairedDeviceId: deviceId,
          pairedDeviceName: deviceName,
          lastActiveAt: now,
        },
      });
    } catch (e) {
      return next(e);
    }
  });

  // Push barcode scan event (Idempotent by eventId + token-authenticated)
  r.post('/:sessionId/scan', async (req, res: Response, next: NextFunction) => {
    try {
      const sessionId = String(req.params.sessionId || '').trim();
      const pairingToken = String(req.body?.pairingToken || '').trim();
      const rawBarcode = String(req.body?.barcode || '').trim();
      const symbology = String(req.body?.symbology || 'CODE_128').slice(0, 40);
      const deviceId = req.body?.deviceId ? String(req.body.deviceId).slice(0, 120) : null;
      const rawEventId = String(req.body?.eventId || '').trim();
      const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};

      if (!rawBarcode || rawBarcode.length > 128) {
        throw new AppError('Valid barcode string (1–128 chars) is required.', 400, 'INVALID_BARCODE');
      }

      const sessRef = db.collection('scannerPairingSessions').doc(sessionId);
      const sessSnap = await sessRef.get();
      if (!sessSnap.exists) {
        throw new AppError('Scanner session not found or expired.', 404, 'SESSION_NOT_FOUND');
      }
      const sess = sessSnap.data()!;

      if (!pairingToken || sess.pairingToken !== pairingToken) {
        throw new AppError('Unauthorized scan: invalid pairing token.', 401, 'INVALID_PAIRING_TOKEN');
      }
      if (sess.status === 'CLOSED') {
        throw new AppError('Scanner session has already been closed.', 410, 'SESSION_CLOSED');
      }
      if (new Date(sess.expiresAt).getTime() < Date.now()) {
        await sessRef.update({ status: 'EXPIRED', lastActiveAt: new Date().toISOString() });
        throw new AppError('Scanner pairing session has expired.', 410, 'SESSION_EXPIRED');
      }

      const eventId = rawEventId || `EVT-${sessionId}-${crypto.randomBytes(6).toString('hex')}`;
      const eventRef = db.collection('scannerEvents').doc(eventId);

      // Resolve barcode against inventory master BEFORE transaction
      const resolved = await resolveInventoryBarcode(rawBarcode, sess.warehouseId);
      const now = new Date().toISOString();

      const txResult = await db.runTransaction(async (tx) => {
        const existingEventSnap = await tx.get(eventRef);
        if (existingEventSnap.exists) {
          const existingData = existingEventSnap.data() as ScannerBridgeEventRecord;
          if (existingData.sessionId !== sessionId) {
            throw new AppError('Scan event ID belongs to a different session.', 409, 'EVENT_ID_CONFLICT');
          }
          return {
            duplicate: true,
            event: existingData,
          };
        }

        const record: ScannerBridgeEventRecord = {
          id: eventId,
          eventId,
          sessionId,
          barcode: rawBarcode,
          barcodeType: resolved.barcodeType,
          symbology,
          status: resolved.matched ? 'MATCHED' : 'UNKNOWN_BARCODE',
          recordStatus: 'RECORDED',
          itemId: resolved.itemId,
          itemName: resolved.itemName,
          sku: resolved.sku,
          kitId: resolved.kitId,
          batchNumber: resolved.batchNumber,
          expiryDate: resolved.expiryDate,
          warehouseLocation: resolved.warehouseLocation,
          scannedAt: now,
          acknowledgedAt: now,
          pairedDeviceId: deviceId || sess.pairedDeviceId || null,
          pairedDeviceName: String(sess.pairedDeviceName || 'Mobile Scanner'),
          operatorEmail: sess.operatorEmail ? String(sess.operatorEmail) : null,
          context: String(sess.context || 'Central Warehouse Inventory'),
          metadata,
        };

        tx.set(eventRef, record);
        tx.update(sessRef, {
          status: 'CONNECTED',
          lastActiveAt: now,
          scanCount: admin.firestore.FieldValue.increment(1),
          latestEvent: {
            eventId,
            barcode: rawBarcode,
            status: record.status,
            itemName: record.itemName,
            scannedAt: now,
          },
        });

        return {
          duplicate: false,
          event: record,
        };
      });

      return res.status(txResult.duplicate ? 200 : 201).json({
        success: true,
        duplicate: txResult.duplicate,
        alreadyProcessed: txResult.duplicate,
        sessionMode: sess.mode || 'ONE_SCAN',
        event: txResult.event,
        barcode: txResult.event.barcode,
      });
    } catch (e) {
      return next(e);
    }
  });

  // Poll / fetch events for a session
  r.get('/:sessionId/events', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sessionId = String(req.params.sessionId || '').trim();
      const sinceIndex = req.query.since !== undefined ? Math.max(0, Number(req.query.since) || 0) : 0;

      const sessSnap = await db.collection('scannerPairingSessions').doc(sessionId).get();
      if (!sessSnap.exists) {
        throw new AppError('Scanner session not found or expired.', 404, 'SESSION_NOT_FOUND');
      }
      const sess = sessSnap.data()!;

      const evSnap = await db.collection('scannerEvents').where('sessionId', '==', sessionId).get();
      const allEvents = evSnap.docs
        .map((d) => d.data() as ScannerBridgeEventRecord)
        .sort((a, b) => String(a.scannedAt || '').localeCompare(String(b.scannedAt || '')));

      return res.json({
        success: true,
        sessionId: sess.sessionId,
        status: sess.status,
        mode: sess.mode || 'ONE_SCAN',
        expiresAt: sess.expiresAt,
        pairedDeviceName: sess.pairedDeviceName,
        events: allEvents.slice(sinceIndex),
        totalCount: allEvents.length,
      });
    } catch (e) {
      return next(e);
    }
  });

  // Update session mode (ONE_SCAN <-> MULTI_SCAN)
  r.patch(
    '/:sessionId/mode',
    requireAuth,
    requireInventoryAdmin,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const sessionId = String(req.params.sessionId || '').trim();
        const mode: ScannerMode = req.body?.mode === 'MULTI_SCAN' ? 'MULTI_SCAN' : 'ONE_SCAN';
        const sessRef = db.collection('scannerPairingSessions').doc(sessionId);
        const snap = await sessRef.get();
        if (!snap.exists) {
          throw new AppError('Scanner session not found.', 404, 'SESSION_NOT_FOUND');
        }
        await sessRef.update({ mode, lastActiveAt: new Date().toISOString() });
        return res.json({ success: true, sessionId, mode });
      } catch (e) {
        return next(e);
      }
    }
  );

  // Close / finish scanning session
  r.post(
    '/:sessionId/close',
    requireAuth,
    requireInventoryAdmin,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const sessionId = String(req.params.sessionId || '').trim();
        const sessRef = db.collection('scannerPairingSessions').doc(sessionId);
        const snap = await sessRef.get();
        if (!snap.exists) {
          throw new AppError('Scanner session not found.', 404, 'SESSION_NOT_FOUND');
        }
        const now = new Date().toISOString();
        await sessRef.update({ status: 'CLOSED', closedAt: now, lastActiveAt: now });
        return res.json({ success: true, sessionId, status: 'CLOSED', closedAt: now });
      } catch (e) {
        return next(e);
      }
    }
  );

  // Recent scan records across sessions (persisted in Firestore)
  r.get(
    '/events/recent',
    requireAuth,
    requireInventoryAdmin,
    async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const snap = await db.collection('scannerEvents').limit(40).get();
        const events = snap.docs
          .map((d) => d.data() as ScannerBridgeEventRecord)
          .sort((a, b) => String(b.scannedAt || '').localeCompare(String(a.scannedAt || '')))
          .slice(0, 30);
        return res.json({ success: true, events });
      } catch (e) {
        return next(e);
      }
    }
  );

  // Map an UNKNOWN_BARCODE scan event to an existing inventory item (authorised Admin only)
  r.post(
    '/events/:eventId/map',
    requireAuth,
    requireInventoryAdmin,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const eventId = String(req.params.eventId || '').trim();
        const itemId = String(req.body?.itemId || '').trim();
        if (!eventId || !itemId) {
          throw new AppError('eventId and itemId are required.', 400, 'INVALID_MAPPING_PAYLOAD');
        }

        const [evSnap, itemSnap] = await Promise.all([
          db.collection('scannerEvents').doc(eventId).get(),
          db.collection('inventoryItems').doc(itemId).get(),
        ]);

        if (!evSnap.exists) {
          throw new AppError('Scan event record not found.', 404, 'EVENT_NOT_FOUND');
        }
        if (!itemSnap.exists) {
          throw new AppError('Target inventory item not found.', 404, 'ITEM_NOT_FOUND');
        }

        const evData = evSnap.data() as ScannerBridgeEventRecord;
        const itemData = itemSnap.data() || {};
        const now = new Date().toISOString();

        await db.collection('scannerEvents').doc(eventId).update({
          status: 'MAPPED',
          itemId: itemSnap.id,
          itemName: String(itemData.name || itemData.itemName || itemSnap.id),
          sku: String(itemData.sku || itemSnap.id),
          mappedByEmail: req.user?.email || null,
          mappedAt: now,
        });

        // Optionally record supplier barcode mapping so future scans auto-match
        if (req.body?.saveMapping !== false && evData.barcode) {
          const mapId = `MAP-${Buffer.from(evData.barcode).toString('hex').slice(0, 20)}`;
          await db.collection('supplierBarcodeMappings').doc(mapId).set(
            {
              id: mapId,
              supplierBarcode: evData.barcode,
              itemId: itemSnap.id,
              itemName: String(itemData.name || itemData.itemName || itemSnap.id),
              sku: String(itemData.sku || itemSnap.id),
              createdByEmail: req.user?.email || null,
              updatedAt: now,
            },
            { merge: true }
          );
        }

        return res.json({
          success: true,
          eventId,
          status: 'MAPPED',
          itemId: itemSnap.id,
          itemName: String(itemData.name || itemData.itemName || itemSnap.id),
          sku: String(itemData.sku || itemSnap.id),
        });
      } catch (e) {
        return next(e);
      }
    }
  );

  return r;
}
