import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closeScannerBridgeSession,
  createScannerBridgeSession,
  getRecentScannerEvents,
  getScannerBridgeEvents,
  mapUnknownScannerEvent,
  pairMobileDevice,
  pushScannedBarcode,
} from '../services/scanner-bridge.service';

test('Scanner Bridge: ONE_SCAN pairing, scan, idempotent retry, and close', async () => {
  const session = createScannerBridgeSession({
    operatorEmail: 'admin@labsetu.com',
    mode: 'ONE_SCAN',
    context: 'Central Warehouse Inventory',
  });
  assert.equal(session.status, 'WAITING_FOR_DEVICE');
  assert.equal(session.mode, 'ONE_SCAN');

  // Invalid pairing token must fail
  assert.throws(
    () =>
      pairMobileDevice({
        sessionId: session.sessionId,
        pairingToken: 'WRONG-TOKEN',
        deviceId: 'MOB-1',
      }),
    /Invalid pairing token/
  );

  // Valid pairing succeeds
  const paired = pairMobileDevice({
    sessionId: session.sessionId,
    pairingToken: session.pairingToken,
    deviceId: 'MOB-1',
    deviceName: 'Pixel Camera',
  });
  assert.equal(paired.status, 'CONNECTED');

  // Scan with unique eventId
  const eventId = `EVT-TEST-${Date.now()}`;
  const firstAck = await pushScannedBarcode({
    sessionId: session.sessionId,
    pairingToken: session.pairingToken,
    eventId,
    barcode: 'UNKNOWN-BARCODE-9988',
    symbology: 'CODE_128',
    deviceId: 'MOB-1',
  });
  assert.equal(firstAck.success, true);
  assert.equal(firstAck.duplicate, false);
  assert.equal(firstAck.event.status, 'UNKNOWN_BARCODE');
  assert.equal(firstAck.event.recordStatus, 'RECORDED');

  // Lost ack / duplicate delivery with same eventId must NOT create a duplicate record
  const retryAck = await pushScannedBarcode({
    sessionId: session.sessionId,
    pairingToken: session.pairingToken,
    eventId,
    barcode: 'UNKNOWN-BARCODE-9988',
    symbology: 'CODE_128',
    deviceId: 'MOB-1',
  });
  assert.equal(retryAck.success, true);
  assert.equal(retryAck.duplicate, true);
  assert.equal(retryAck.alreadyProcessed, true);

  const fetched = getScannerBridgeEvents({ sessionId: session.sessionId });
  assert.equal(fetched.totalCount, 1);

  // Admin maps UNKNOWN_BARCODE event
  const mapped = mapUnknownScannerEvent({
    eventId,
    itemId: 'ITEM-EDTA-3ML',
    itemName: 'EDTA 3mL Tube',
    sku: 'EDTA-3ML',
  });
  assert.equal(mapped.status, 'MAPPED');
  assert.equal(mapped.itemId, 'ITEM-EDTA-3ML');

  // Close session and verify further scans are rejected
  const closed = closeScannerBridgeSession(session.sessionId);
  assert.equal(closed.status, 'CLOSED');
  await assert.rejects(
    () =>
      pushScannedBarcode({
        sessionId: session.sessionId,
        pairingToken: session.pairingToken,
        eventId: `EVT-AFTER-CLOSE-${Date.now()}`,
        barcode: 'ANY-BARCODE',
      }),
    /already been closed/
  );
});

test('Scanner Bridge: MULTI_SCAN keeps session open and expired session rejects scans', async () => {
  const multi = createScannerBridgeSession({
    operatorEmail: 'admin@labsetu.com',
    mode: 'MULTI_SCAN',
    context: 'Kit Assembly',
  });
  pairMobileDevice({
    sessionId: multi.sessionId,
    pairingToken: multi.pairingToken,
    deviceId: 'MOB-MULTI',
  });

  const a1 = await pushScannedBarcode({
    sessionId: multi.sessionId,
    pairingToken: multi.pairingToken,
    eventId: `EVT-M1-${Date.now()}`,
    barcode: 'KIT-001',
  });
  const a2 = await pushScannedBarcode({
    sessionId: multi.sessionId,
    pairingToken: multi.pairingToken,
    eventId: `EVT-M2-${Date.now()}`,
    barcode: 'KIT-002',
  });
  assert.equal(a1.sessionMode, 'MULTI_SCAN');
  assert.equal(a2.sessionMode, 'MULTI_SCAN');
  assert.equal(getScannerBridgeEvents({ sessionId: multi.sessionId }).totalCount, 2);
  assert.ok(getRecentScannerEvents(10).length >= 2);

  // Expired session must reject scan
  const expired = createScannerBridgeSession({
    operatorEmail: 'admin@labsetu.com',
    ttlMs: -1000,
  });
  await assert.rejects(
    () =>
      pushScannedBarcode({
        sessionId: expired.sessionId,
        pairingToken: expired.pairingToken,
        eventId: `EVT-EXP-${Date.now()}`,
        barcode: 'EXP-123',
      }),
    /expired/
  );
});
