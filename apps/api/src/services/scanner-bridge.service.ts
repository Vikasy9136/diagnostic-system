import crypto from 'node:crypto';
import os from 'node:os';
import { AppError } from '../middleware/errorHandler';
import { resolveSupplierBarcode } from './inventory-master.service';

export type ScannerMode = 'ONE_SCAN' | 'MULTI_SCAN';

export interface ScannerBridgeEventRecord {
  id: string;
  eventId: string;
  sessionId: string;
  barcode: string;
  barcodeType:
    | 'SKU_BARCODE'
    | 'SUPPLIER_BARCODE'
    | 'KIT_BARCODE'
    | 'SERIALIZED_TUBE_BARCODE'
    | 'BATCH_BARCODE'
    | 'UNKNOWN';
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

export interface ScannerBridgeSession {
  sessionId: string;
  pairingToken: string;
  status: 'WAITING_FOR_DEVICE' | 'CONNECTED' | 'CLOSED' | 'EXPIRED';
  mode: ScannerMode;
  context: string;
  warehouseId: string;
  operatorEmail: string;
  pairedDeviceId?: string;
  pairedDeviceName?: string;
  lanIp?: string;
  createdAt: string;
  expiresAt: string;
  lastActiveAt: string;
  closedAt?: string;
  scanCount: number;
  scannedBarcodes: ScannerBridgeEventRecord[];
}

export function getLocalServerLanIp(): string {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal && net.address.startsWith('192.168.')) {
          return net.address;
        }
      }
    }
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {
    // fallback
  }
  return 'localhost';
}

const SESSIONS = new Map<string, ScannerBridgeSession>();
const EVENTS_BY_ID = new Map<string, ScannerBridgeEventRecord>();

export function createScannerBridgeSession(options?: {
  operatorEmail?: string;
  mode?: ScannerMode;
  context?: string;
  warehouseId?: string;
  ttlMs?: number;
}): ScannerBridgeSession {
  const sessionId = `BRIDGE-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const pairingToken = `TOK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const now = new Date();
  const ttlMs = typeof options?.ttlMs === 'number' ? options.ttlMs : 45 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const lanIp = getLocalServerLanIp();

  const session: ScannerBridgeSession = {
    sessionId,
    pairingToken,
    status: 'WAITING_FOR_DEVICE',
    mode: options?.mode === 'MULTI_SCAN' ? 'MULTI_SCAN' : 'ONE_SCAN',
    context: options?.context || 'Central Warehouse Inventory',
    warehouseId: options?.warehouseId || 'CENTRAL_WAREHOUSE',
    operatorEmail: options?.operatorEmail || 'admin@labsetu.com',
    lanIp,
    createdAt: now.toISOString(),
    expiresAt,
    lastActiveAt: now.toISOString(),
    scanCount: 0,
    scannedBarcodes: [],
  };

  SESSIONS.set(sessionId, session);
  return session;
}

export function pairMobileDevice(params: {
  sessionId: string;
  pairingToken: string;
  deviceId: string;
  deviceName?: string;
}): ScannerBridgeSession {
  const { sessionId, pairingToken, deviceId, deviceName } = params;
  const session = SESSIONS.get(sessionId);
  if (!session) {
    throw new AppError('Scanner pairing session not found or expired.', 404, 'SESSION_NOT_FOUND');
  }
  if (session.pairingToken !== pairingToken) {
    throw new AppError('Invalid pairing token for this scanner bridge session.', 401, 'INVALID_PAIRING_TOKEN');
  }
  if (session.status === 'CLOSED') {
    throw new AppError('Scanner session is already closed.', 410, 'SESSION_CLOSED');
  }
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    session.status = 'EXPIRED';
    throw new AppError('Scanner pairing session has expired. Create a new QR code on desktop.', 410, 'SESSION_EXPIRED');
  }

  session.status = 'CONNECTED';
  session.pairedDeviceId = deviceId;
  session.pairedDeviceName = deviceName || 'Mobile Scanner';
  session.lastActiveAt = new Date().toISOString();

  return session;
}

export async function pushScannedBarcode(params: {
  sessionId: string;
  pairingToken?: string;
  eventId?: string;
  barcode: string;
  symbology?: string;
  deviceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  success: boolean;
  duplicate: boolean;
  alreadyProcessed: boolean;
  sessionMode: ScannerMode;
  scanIndex: number;
  barcode: string;
  event: ScannerBridgeEventRecord;
}> {
  const { sessionId, pairingToken, eventId, barcode, symbology, deviceId, metadata } = params;
  const session = SESSIONS.get(sessionId);
  if (!session) {
    throw new AppError('Scanner session not found or expired.', 404, 'SESSION_NOT_FOUND');
  }
  if (!pairingToken || session.pairingToken !== pairingToken) {
    throw new AppError('Unauthorized scan: invalid pairing token.', 401, 'INVALID_PAIRING_TOKEN');
  }
  if (session.status === 'CLOSED') {
    throw new AppError('Scanner session has already been closed.', 410, 'SESSION_CLOSED');
  }
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    session.status = 'EXPIRED';
    throw new AppError('Scanner pairing session has expired.', 410, 'SESSION_EXPIRED');
  }

  const clean = barcode.trim();
  if (!clean || clean.length > 128) {
    throw new AppError('Barcode value must be 1–128 characters.', 400, 'INVALID_BARCODE');
  }

  const resolvedEventId = (eventId || '').trim() || `EVT-${sessionId}-${crypto.randomBytes(6).toString('hex')}`;
  const existing = EVENTS_BY_ID.get(resolvedEventId);
  if (existing) {
    if (existing.sessionId !== sessionId) {
      throw new AppError('Scan event ID belongs to a different session.', 409, 'EVENT_ID_CONFLICT');
    }
    const idx = session.scannedBarcodes.findIndex((e) => e.eventId === resolvedEventId);
    return {
      success: true,
      duplicate: true,
      alreadyProcessed: true,
      sessionMode: session.mode,
      scanIndex: idx >= 0 ? idx : 0,
      barcode: existing.barcode,
      event: existing,
    };
  }

  let matchedItemId: string | null = null;
  let matchedItemName: string | null = null;
  let matchedSku: string | null = null;
  let barcodeType: ScannerBridgeEventRecord['barcodeType'] = 'UNKNOWN';

  try {
    const resolved = await resolveSupplierBarcode(clean);
    if (resolved.found && resolved.item) {
      matchedItemId = resolved.item.id;
      matchedItemName = resolved.item.name;
      matchedSku = resolved.item.sku || resolved.item.id;
      barcodeType = resolved.type === 'SUPPLIER_MAPPING' ? 'SUPPLIER_BARCODE' : 'SKU_BARCODE';
    }
  } catch {
    // Non-fatal: record as UNKNOWN_BARCODE if master lookup fails
  }

  const now = new Date().toISOString();
  const entry: ScannerBridgeEventRecord = {
    id: resolvedEventId,
    eventId: resolvedEventId,
    sessionId,
    barcode: clean,
    barcodeType,
    symbology: symbology || 'CODE_128',
    status: matchedItemId ? 'MATCHED' : 'UNKNOWN_BARCODE',
    recordStatus: 'RECORDED',
    itemId: matchedItemId,
    itemName: matchedItemName,
    sku: matchedSku,
    kitId: null,
    batchNumber: null,
    expiryDate: null,
    warehouseLocation: session.warehouseId || 'Central Warehouse',
    scannedAt: now,
    acknowledgedAt: now,
    pairedDeviceId: deviceId || session.pairedDeviceId || null,
    pairedDeviceName: session.pairedDeviceName || 'Mobile Scanner',
    operatorEmail: session.operatorEmail || null,
    context: session.context,
    metadata,
  };

  EVENTS_BY_ID.set(resolvedEventId, entry);
  session.scannedBarcodes.push(entry);
  session.scanCount = session.scannedBarcodes.length;
  session.status = 'CONNECTED';
  session.lastActiveAt = now;

  return {
    success: true,
    duplicate: false,
    alreadyProcessed: false,
    sessionMode: session.mode,
    scanIndex: session.scannedBarcodes.length - 1,
    barcode: clean,
    event: entry,
  };
}

export function getScannerBridgeEvents(params: {
  sessionId: string;
  sinceIndex?: number;
}): {
  sessionId: string;
  status: ScannerBridgeSession['status'];
  mode: ScannerMode;
  expiresAt: string;
  pairedDeviceName?: string;
  events: ScannerBridgeEventRecord[];
  totalCount: number;
} {
  const { sessionId, sinceIndex = 0 } = params;
  const session = SESSIONS.get(sessionId);
  if (!session) {
    throw new AppError('Scanner session not found or expired.', 404, 'SESSION_NOT_FOUND');
  }
  if (session.status !== 'CLOSED' && new Date(session.expiresAt).getTime() < Date.now()) {
    session.status = 'EXPIRED';
  }

  const events = session.scannedBarcodes.slice(Math.max(0, sinceIndex));
  return {
    sessionId: session.sessionId,
    status: session.status,
    mode: session.mode,
    expiresAt: session.expiresAt,
    pairedDeviceName: session.pairedDeviceName,
    events,
    totalCount: session.scannedBarcodes.length,
  };
}

export function closeScannerBridgeSession(sessionId: string) {
  const session = SESSIONS.get(sessionId);
  if (!session) {
    throw new AppError('Scanner session not found.', 404, 'SESSION_NOT_FOUND');
  }
  const now = new Date().toISOString();
  session.status = 'CLOSED';
  session.closedAt = now;
  session.lastActiveAt = now;
  return session;
}

export function updateScannerBridgeMode(sessionId: string, mode: ScannerMode) {
  const session = SESSIONS.get(sessionId);
  if (!session) {
    throw new AppError('Scanner session not found.', 404, 'SESSION_NOT_FOUND');
  }
  session.mode = mode === 'MULTI_SCAN' ? 'MULTI_SCAN' : 'ONE_SCAN';
  session.lastActiveAt = new Date().toISOString();
  return session;
}

export function getRecentScannerEvents(limit = 30): ScannerBridgeEventRecord[] {
  return Array.from(EVENTS_BY_ID.values())
    .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))
    .slice(0, limit);
}

export function mapUnknownScannerEvent(params: {
  eventId: string;
  itemId: string;
  itemName: string;
  sku?: string;
}) {
  const ev = EVENTS_BY_ID.get(params.eventId);
  if (!ev) {
    throw new AppError('Scan event record not found.', 404, 'EVENT_NOT_FOUND');
  }
  ev.status = 'MAPPED';
  ev.itemId = params.itemId;
  ev.itemName = params.itemName;
  ev.sku = params.sku || params.itemId;
  return ev;
}
