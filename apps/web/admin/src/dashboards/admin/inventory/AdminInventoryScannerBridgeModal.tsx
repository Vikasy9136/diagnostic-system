import { useEffect, useState } from 'react';
import {
  type ActiveScannerSessionInfo,
  type PersistentScannerUiPhase,
} from '../../../hooks/usePersistentScannerBridge';
import {
  type ScannerBridgeEventRecord,
  type ScannerMode,
} from '../../../services/inventoryApiService';

interface AdminInventoryScannerBridgeModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onDisconnect?: () => void;
  session: ActiveScannerSessionInfo | null;
  activeMode: ScannerMode;
  onSwitchMode: (mode: ScannerMode) => void;
  deviceStatus: 'WAITING_FOR_DEVICE' | 'CONNECTED' | 'CLOSED' | 'EXPIRED';
  uiPhase: PersistentScannerUiPhase;
  deviceName?: string;
  scannedEvents: ScannerBridgeEventRecord[];
  latestConfirmedBanner: ScannerBridgeEventRecord | null;
  contextTitle?: string;
  context?: string;
}

const LIVE_SCANNER_ORIGIN = 'https://labsetu-diagnostics.web.app';

export function AdminInventoryScannerBridgeModal({
  isOpen = true,
  onClose,
  onDisconnect,
  session,
  activeMode,
  onSwitchMode,
  deviceStatus,
  uiPhase,
  deviceName,
  scannedEvents,
  latestConfirmedBanner,
  contextTitle,
  context,
}: AdminInventoryScannerBridgeModalProps) {
  const effectiveTitle = contextTitle || context || 'Central Warehouse Inventory';
  const [copiedLink, setCopiedLink] = useState(false);
  const [customHost, setCustomHost] = useState('');
  const [showHostInput, setShowHostInput] = useState(false);
  const [protocolChoice, setProtocolChoice] = useState<'https' | 'http'>('https');
  const [liveLinkAvailable, setLiveLinkAvailable] = useState<boolean>(true);
  const [preferLocalFallback, setPreferLocalFallback] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    const localCheck =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (!localCheck) {
      setLiveLinkAvailable(true);
      return;
    }
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 2500);
    fetch(`${LIVE_SCANNER_ORIGIN}/favicon.ico`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: ctrl.signal,
    })
      .then(() => {
        clearTimeout(tid);
        setLiveLinkAvailable(true);
      })
      .catch(() => {
        clearTimeout(tid);
        setLiveLinkAvailable(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const isLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const localFallbackHost = `${session?.lanIp || '192.168.0.114'}:${window.location.port || '3003'}`;
  const usingLiveOrigin = !customHost.trim() && (!isLocal || (liveLinkAvailable && !preferLocalFallback));

  const resolvedHost =
    customHost.trim() ||
    (usingLiveOrigin
      ? (isLocal ? new URL(LIVE_SCANNER_ORIGIN).host : window.location.host)
      : localFallbackHost);

  const selectedProtocol = usingLiveOrigin ? 'https:' : `${protocolChoice}:`;

  const directScannerUrl = session
    ? `${selectedProtocol}//${resolvedHost}/mobile-scanner?session=${encodeURIComponent(session.sessionId)}&token=${encodeURIComponent(session.pairingToken)}&context=${encodeURIComponent(effectiveTitle)}&mode=${activeMode}&auto=1`
    : '';

  const qrUrl = directScannerUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(directScannerUrl)}`
    : '';

  function handleCopyDirectLink() {
    if (!directScannerUrl) return;
    navigator.clipboard.writeText(directScannerUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  }

  const statusConfig: Record<
    PersistentScannerUiPhase,
    { bg: string; border: string; text: string; label: string; icon: string }
  > = {
    IDLE: {
      bg: '#EFF6FF',
      border: '#BFDBFE',
      text: '#1E40AF',
      label: 'Waiting for Scanner...',
      icon: '📡',
    },
    WAITING_FOR_SCANNER: {
      bg: '#EFF6FF',
      border: '#BFDBFE',
      text: '#1E40AF',
      label: 'Waiting for Scanner...',
      icon: '📡',
    },
    MOBILE_CONNECTED: {
      bg: '#ECFDF5',
      border: '#10B981',
      text: '#065F46',
      label: `Mobile Connected: ${deviceName || 'Active Mobile Camera'}`,
      icon: '🟢',
    },
    RECORD_ADDED: {
      bg: '#DCFCE7',
      border: '#16A34A',
      text: '#14532D',
      label:
        activeMode === 'ONE_SCAN'
          ? 'Barcode Scanned Successfully • Record Added (Closing Popup, Keeping Connected...)'
          : 'Barcode Scanned Successfully • Record Added',
      icon: '✅',
    },
    UNKNOWN_BARCODE: {
      bg: '#FEF3C7',
      border: '#F59E0B',
      text: '#92400E',
      label:
        activeMode === 'ONE_SCAN'
          ? 'Unknown Barcode Recorded (Closing Popup, Keeping Connected...)'
          : 'Unknown Barcode Recorded — Map item on inventory page',
      icon: '⚠️',
    },
    SESSION_EXPIRED: {
      bg: '#FEE2E2',
      border: '#EF4444',
      text: '#991B1B',
      label: 'Session Expired — Disconnect and start a new session',
      icon: '⏱️',
    },
    SYNC_FAILED: {
      bg: '#FEE2E2',
      border: '#EF4444',
      text: '#991B1B',
      label: 'Sync Failed — Unable to reach backend',
      icon: '❌',
    },
  };

  const activeStatusUi = statusConfig[uiPhase];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '24px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📷</span> Mobile Barcode Scanner Bridge
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>
              Once connected, your phone stays paired even after closing this popup — scans sync live to <strong>{effectiveTitle}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94A3B8' }}
            title="Hide popup (keep mobile connected)"
          >
            ✕
          </button>
        </div>

        {/* Mode Selector: ONE-SCAN vs MULTI-SCAN */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Popup Mode:</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => onSwitchMode('ONE_SCAN')}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeMode === 'ONE_SCAN' ? '#0D9488' : '#F8FAFC',
                color: activeMode === 'ONE_SCAN' ? '#FFFFFF' : '#475569',
                border: `1.5px solid ${activeMode === 'ONE_SCAN' ? '#0D9488' : '#CBD5E1'}`,
              }}
            >
              Auto-Close Popup on Scan
            </button>
            <button
              type="button"
              onClick={() => onSwitchMode('MULTI_SCAN')}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeMode === 'MULTI_SCAN' ? '#0D9488' : '#F8FAFC',
                color: activeMode === 'MULTI_SCAN' ? '#FFFFFF' : '#475569',
                border: `1.5px solid ${activeMode === 'MULTI_SCAN' ? '#0D9488' : '#CBD5E1'}`,
              }}
            >
              Keep Popup Open (Multi-Scan)
            </button>
          </div>
        </div>

        {/* Status Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '10px',
            backgroundColor: activeStatusUi.bg,
            border: `1.5px solid ${activeStatusUi.border}`,
            marginBottom: '14px',
          }}
        >
          <span style={{ fontSize: '20px' }}>{activeStatusUi.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: activeStatusUi.text }}>
              {activeStatusUi.label}
            </div>
            {latestConfirmedBanner ? (
              <div style={{ fontSize: '11.5px', color: '#334155', marginTop: '2px' }}>
                <strong>{latestConfirmedBanner.itemName || 'Unknown Item'}</strong> •{' '}
                <code>{latestConfirmedBanner.barcode}</code> • {latestConfirmedBanner.recordStatus}
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: '#64748B' }}>
                {deviceStatus === 'CONNECTED'
                  ? 'Phone paired! All barcode scans sync automatically in real time.'
                  : 'Scan the QR code below using your phone camera or Google Lens.'}
              </div>
            )}
          </div>
        </div>

        {/* QR Code & URL */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            backgroundColor: '#F8FAFC',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            marginBottom: '14px',
            textAlign: 'center',
          }}
        >
          {session ? (
            <>
              <div
                style={{
                  padding: '10px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1.5px solid #CBD5E1',
                  marginBottom: '10px',
                }}
              >
                <img
                  src={qrUrl}
                  alt="Mobile Scanner Pairing QR"
                  style={{ width: '185px', height: '185px', display: 'block' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={handleCopyDirectLink}
                  style={{
                    backgroundColor: copiedLink ? '#059669' : '#0D9488',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {copiedLink ? '✓ Mobile Link Copied!' : '📋 Copy Mobile Link'}
                </button>
                <a
                  href={directScannerUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    backgroundColor: '#F1F5F9',
                    color: '#334155',
                    border: '1px solid #CBD5E1',
                    borderRadius: '8px',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  🔗 Open Scanner Tab
                </a>
                <button
                  type="button"
                  onClick={() => setShowHostInput((s) => !s)}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#64748B',
                    border: 'none',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  ⚙️ Host / Protocol
                </button>
              </div>

              {showHostInput && (
                <div style={{ marginTop: '10px', width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setProtocolChoice('https')}
                      style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid #CBD5E1', background: protocolChoice === 'https' ? '#0D9488' : '#FFF', color: protocolChoice === 'https' ? '#FFF' : '#334155' }}
                    >
                      HTTPS
                    </button>
                    <button
                      type="button"
                      onClick={() => setProtocolChoice('http')}
                      style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid #CBD5E1', background: protocolChoice === 'http' ? '#0D9488' : '#FFF', color: protocolChoice === 'http' ? '#FFF' : '#334155' }}
                    >
                      HTTP
                    </button>
                    {isLocal && (
                      <button
                        type="button"
                        onClick={() => setPreferLocalFallback((p) => !p)}
                        style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFF' }}
                      >
                        {preferLocalFallback ? 'Use Live Origin' : 'Use Local IP'}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={customHost || resolvedHost}
                    onChange={(e) => setCustomHost(e.target.value)}
                    placeholder="e.g. 192.168.0.114:3003"
                    style={{ width: '100%', padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontFamily: 'monospace' }}
                  />
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '32px', color: '#64748B', fontSize: '13px' }}>
              Generating secure mobile scanner session...
            </div>
          )}
        </div>

        {/* Live Scanned Barcodes */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
              Session Scan Records ({scannedEvents.length})
            </span>
          </div>
          <div style={{ maxHeight: '140px', overflowY: 'auto', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
            {scannedEvents.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', color: '#94A3B8', fontSize: '12px' }}>
                No barcodes received yet.
              </div>
            ) : (
              scannedEvents
                .slice()
                .reverse()
                .map((ev, idx) => (
                  <div
                    key={ev.eventId || ev.id || idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderBottom: idx < scannedEvents.length - 1 ? '1px solid #F1F5F9' : 'none',
                      backgroundColor: idx === 0 ? '#F0FDF4' : '#FFFFFF',
                    }}
                  >
                    <div>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '12.5px', color: '#0F172A' }}>
                        {ev.barcode}{' '}
                        <span
                          style={{
                            marginLeft: '6px',
                            fontSize: '10px',
                            background: ev.status === 'UNKNOWN_BARCODE' ? '#FEF3C7' : '#DCFCE7',
                            color: ev.status === 'UNKNOWN_BARCODE' ? '#92400E' : '#15803D',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontFamily: 'sans-serif',
                          }}
                        >
                          {ev.status === 'UNKNOWN_BARCODE' ? 'UNKNOWN_BARCODE' : 'RECORD ADDED'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                        {ev.itemName ? `${ev.itemName} (${ev.sku || ev.barcodeType})` : 'Unmapped barcode'}
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                      {new Date(ev.scannedAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
          {onDisconnect && session ? (
            <button
              type="button"
              onClick={onDisconnect}
              style={{
                padding: '8px 14px',
                fontSize: '12.5px',
                fontWeight: 700,
                backgroundColor: '#FEE2E2',
                color: '#B91C1C',
                border: '1px solid #FCA5A5',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Disconnect Mobile
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 700,
              backgroundColor: '#0D9488',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            {deviceStatus === 'CONNECTED' ? 'Hide Popup (Keep Connected)' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
