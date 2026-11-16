import os from 'node:os';
import { AppError } from '../middleware/errorHandler';

export interface ScannerBridgeSession {
  sessionId: string;
  pairingToken: string;
  status: 'WAITING_FOR_DEVICE' | 'CONNECTED' | 'CLOSED';
  pairedDeviceId?: string;
  pairedDeviceName?: string;
  lanIp?: string;
  createdAt: string;
  expiresAt: string;
  lastActiveAt: string;
  scannedBarcodes: Array<{
    id: string;
    barcode: string;
    symbology?: string;
    scannedAt: string;
    metadata?: Record<string, unknown>;
  }>;
}

export function getLocalServerLanIp(): string {
  try {
    const nets = os.networkInterfaces();
    // Prefer Wi-Fi / Local Area 192.168.x.x addresses
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal && net.address.startsWith('192.168.')) {
          return net.address;
        }
      }
    }
    // Fallback to any non-internal IPv4
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

// In-memory sessions store (active sessions live for 45 minutes)
const SESSIONS = new Map<string, ScannerBridgeSession>();

export function createScannerBridgeSession(options?: {
  operatorEmail?: string;
}): ScannerBridgeSession {
  const sessionId = `BRIDGE-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const pairingToken = `TOK-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 45 * 60 * 1000).toISOString();
  const lanIp = getLocalServerLanIp();

  const session: ScannerBridgeSession = {
    sessionId,
    pairingToken,
    status: 'WAITING_FOR_DEVICE',
    lanIp,
    createdAt: now.toISOString(),
    expiresAt,
    lastActiveAt: now.toISOString(),
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

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    session.status = 'CLOSED';
    throw new AppError('Scanner pairing session has expired. Create a new QR code on desktop.', 410, 'SESSION_EXPIRED');
  }

  session.status = 'CONNECTED';
  session.pairedDeviceId = deviceId;
  session.pairedDeviceName = deviceName || 'Mobile Scanner';
  session.lastActiveAt = new Date().toISOString();

  return session;
}

export function pushScannedBarcode(params: {
  sessionId: string;
  barcode: string;
  symbology?: string;
  metadata?: Record<string, unknown>;
}): {
  success: boolean;
  scanIndex: number;
  barcode: string;
} {
  const { sessionId, barcode, symbology, metadata } = params;
  const session = SESSIONS.get(sessionId);
  if (!session) {
    throw new AppError('Scanner session not found or expired.', 404, 'SESSION_NOT_FOUND');
  }

  const clean = barcode.trim();
  if (!clean) {
    throw new AppError('Barcode value cannot be blank.', 400, 'INVALID_BARCODE');
  }

  const entry = {
    id: `SCN-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    barcode: clean,
    symbology: symbology || 'CODE_128',
    scannedAt: new Date().toISOString(),
    metadata,
  };

  session.scannedBarcodes.push(entry);
  session.lastActiveAt = entry.scannedAt;

  return {
    success: true,
    scanIndex: session.scannedBarcodes.length - 1,
    barcode: clean,
  };
}

export function getScannerBridgeEvents(params: {
  sessionId: string;
  sinceIndex?: number;
}): {
  sessionId: string;
  status: 'WAITING_FOR_DEVICE' | 'CONNECTED' | 'CLOSED';
  pairedDeviceName?: string;
  events: ScannerBridgeSession['scannedBarcodes'];
  totalCount: number;
} {
  const { sessionId, sinceIndex = 0 } = params;
  const session = SESSIONS.get(sessionId);
  if (!session) {
    throw new AppError('Scanner session not found or expired.', 404, 'SESSION_NOT_FOUND');
  }

  const events = session.scannedBarcodes.slice(Math.max(0, sinceIndex));
  return {
    sessionId: session.sessionId,
    status: session.status,
    pairedDeviceName: session.pairedDeviceName,
    events,
    totalCount: session.scannedBarcodes.length,
  };
}
