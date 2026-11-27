import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import {
  closeScannerBridgeSessionApi,
  createScannerBridgeSessionApi,
  fetchScannerBridgeEventsApi,
  updateScannerBridgeModeApi,
  type ScannerBridgeEventRecord,
  type ScannerMode,
} from '../../../services/inventoryApiService';

interface AdminInventoryScannerBridgeModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onBarcodeScanned?: (barcode: string, metadata?: any) => void;
  onScanRecorded?: (event: ScannerBridgeEventRecord) => void;
  contextTitle?: string;
  context?: string;
  defaultMode?: ScannerMode;
}

const LIVE_SCANNER_ORIGIN = 'https://labsetu-diagnostics.web.app';

type UiSyncPhase =
  | 'WAITING_FOR_SCANNER'
  | 'MOBILE_CONNECTED'
  | 'RECORD_ADDED'
  | 'UNKNOWN_BARCODE'
  | 'SESSION_EXPIRED'
  | 'SYNC_FAILED';

export function AdminInventoryScannerBridgeModal({
  isOpen = true,
  onClose,
  onBarcodeScanned,
  onScanRecorded,
  contextTitle,
  context,
  defaultMode = 'ONE_SCAN',
}: AdminInventoryScannerBridgeModalProps) {
  const effectiveTitle = contextTitle || context || 'Central Warehouse Inventory';
  const [session, setSession] = useState<{
    sessionId: string;
    pairingToken: string;
    status: string;
    mode: ScannerMode;
    expiresAt: string;
    lanIp?: string;
  } | null>(null);
  const [activeMode, setActiveMode] = useState<ScannerMode>(defaultMode);
  const [deviceStatus, setDeviceStatus] = useState<
    'WAITING_FOR_DEVICE' | 'CONNECTED' | 'CLOSED' | 'EXPIRED'
  >('WAITING_FOR_DEVICE');
  const [uiPhase, setUiPhase] = useState<UiSyncPhase>('WAITING_FOR_SCANNER');
  const [deviceName, setDeviceName] = useState<string | undefined>();
  const [scannedEvents, setScannedEvents] = useState<ScannerBridgeEventRecord[]>([]);
  const [latestConfirmedBanner, setLatestConfirmedBanner] = useState<ScannerBridgeEventRecord | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [customHost, setCustomHost] = useState('');
  const [showHostInput, setShowHostInput] = useState(false);
  const [protocolChoice, setProtocolChoice] = useState<'https' | 'http'>('https');
  const [liveLinkAvailable, setLiveLinkAvailable] = useState<boolean>(true);
  const [preferLocalFallback, setPreferLocalFallback] = useState<boolean>(false);

  const pollIntervalRef = useRef<any>(null);
  const autoCloseTimerRef = useRef<any>(null);
  const nextSinceIndexRef = useRef<number>(0);
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const activeModeRef = useRef<ScannerMode>(defaultMode);
  const isClosingRef = useRef<boolean>(false);

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  const playDesktopChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // AudioContext unavailable
    }
  }, []);

  const handleIncomingConfirmedEvents = useCallback(
    (incoming: ScannerBridgeEventRecord[], sessId: string) => {
      const fresh: ScannerBridgeEventRecord[] = [];
      for (const ev of incoming) {
        const key = ev.eventId || ev.id;
        if (!key || processedEventIdsRef.current.has(key)) continue;
        processedEventIdsRef.current.add(key);
        fresh.push(ev);
      }
      if (fresh.length === 0) return;

      setScannedEvents((prev) => [...prev, ...fresh]);
      playDesktopChime();

      for (const ev of fresh) {
        setLatestConfirmedBanner(ev);
        setUiPhase(ev.status === 'UNKNOWN_BARCODE' ? 'UNKNOWN_BARCODE' : 'RECORD_ADDED');
        onBarcodeScanned?.(ev.barcode, ev);
        onScanRecorded?.(ev);
      }

      if (activeModeRef.current === 'ONE_SCAN' && !isClosingRef.current) {
        isClosingRef.current = true;
        void closeScannerBridgeSessionApi(sessId).catch(() => {});
        autoCloseTimerRef.current = setTimeout(() => {
          onClose();
        }, 950);
      }
    },
    [onBarcodeScanned, onScanRecorded, onClose, playDesktopChime]
  );

  function stopPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      setSession(null);
      setScannedEvents([]);
      setLatestConfirmedBanner(null);
      nextSinceIndexRef.current = 0;
      processedEventIdsRef.current.clear();
      isClosingRef.current = false;
      return;
    }

    setActiveMode(defaultMode);
    activeModeRef.current = defaultMode;
    isClosingRef.current = false;
    processedEventIdsRef.current.clear();
    setScannedEvents([]);
    setLatestConfirmedBanner(null);
    setUiPhase('WAITING_FOR_SCANNER');

    let unsubSess: (() => void) | null = null;
    let unsubEvents: (() => void) | null = null;
    let cancelled = false;

    async function bootSession() {
      try {
        const sess = await createScannerBridgeSessionApi({
          mode: defaultMode,
          context: effectiveTitle,
        });
        if (cancelled) return;
        setSession(sess);
        setDeviceStatus('WAITING_FOR_DEVICE');

        // Real-time Firestore listener for session status
        try {
          unsubSess = onSnapshot(doc(db, 'scannerPairingSessions', sess.sessionId), (snap) => {
            if (!snap.exists()) return;
            const d = snap.data() as any;
            if (d.status) setDeviceStatus(d.status);
            if (d.pairedDeviceName) setDeviceName(d.pairedDeviceName);
            if (d.status === 'EXPIRED') {
              setUiPhase('SESSION_EXPIRED');
            } else if (d.status === 'CONNECTED') {
              setUiPhase((prev) =>
                prev === 'WAITING_FOR_SCANNER' ? 'MOBILE_CONNECTED' : prev
              );
            }
          });

          const evQ = query(
            collection(db, 'scannerEvents'),
            where('sessionId', '==', sess.sessionId)
          );
          unsubEvents = onSnapshot(evQ, (snap) => {
            const docs = snap.docs
              .map((d) => d.data() as ScannerBridgeEventRecord)
              .sort((a, b) => String(a.scannedAt || '').localeCompare(String(b.scannedAt || '')));
            if (docs.length > 0) {
              handleIncomingConfirmedEvents(docs, sess.sessionId);
            }
          });
        } catch {
          // Polling fallback handles environments without live Firestore listener
        }

        // Polling fallback
        pollIntervalRef.current = setInterval(async () => {
          try {
            const res = await fetchScannerBridgeEventsApi(sess.sessionId, nextSinceIndexRef.current);
            setDeviceStatus(res.status);
            if (res.pairedDeviceName) setDeviceName(res.pairedDeviceName);
            if (res.status === 'EXPIRED') {
              setUiPhase('SESSION_EXPIRED');
              stopPolling();
              return;
            }
            if (res.status === 'CONNECTED') {
              setUiPhase((prev) =>
                prev === 'WAITING_FOR_SCANNER' ? 'MOBILE_CONNECTED' : prev
              );
            }
            if (res.events && res.events.length > 0) {
              nextSinceIndexRef.current += res.events.length;
              handleIncomingConfirmedEvents(res.events, sess.sessionId);
            }
          } catch {
            // Silent retry
          }
        }, 900);
      } catch (err) {
        console.error('Failed to create scanner bridge session:', err);
        setUiPhase('SYNC_FAILED');
      }
    }

    void bootSession();

    const localCheck =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (!localCheck) {
      setLiveLinkAvailable(true);
    } else {
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
    }

    return () => {
      cancelled = true;
      stopPolling();
      unsubSess?.();
      unsubEvents?.();
    };
  }, [isOpen, defaultMode, effectiveTitle, handleIncomingConfirmedEvents]);

  async function handleToggleMode(nextMode: ScannerMode) {
    setActiveMode(nextMode);
    activeModeRef.current = nextMode;
    if (session?.sessionId) {
      await updateScannerBridgeModeApi(session.sessionId, nextMode).catch(() => {});
    }
  }

  async function handleFinishAndClose() {
    if (session?.sessionId && !isClosingRef.current) {
      isClosingRef.current = true;
      await closeScannerBridgeSessionApi(session.sessionId).catch(() => {});
    }
    onClose();
  }

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

  const statusConfig: Record<UiSyncPhase, { bg: string; border: string; text: string; label: string; icon: string }> = {
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
          ? 'Barcode Scanned Successfully • Record Added (Closing...)'
          : 'Barcode Scanned Successfully • Record Added',
      icon: '✅',
    },
    UNKNOWN_BARCODE: {
      bg: '#FEF3C7',
      border: '#F59E0B',
      text: '#92400E',
      label:
        activeMode === 'ONE_SCAN'
          ? 'Unknown Barcode Recorded (Closing...)'
          : 'Unknown Barcode Recorded — Map item on inventory page',
      icon: '⚠️',
    },
    SESSION_EXPIRED: {
      bg: '#FEE2E2',
      border: '#EF4444',
      text: '#991B1B',
      label: 'Session Expired — Close and open a new scanner session',
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
              Scan with phone camera or Google Lens for <strong>{effectiveTitle}</strong>. Scans save automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleFinishAndClose()}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94A3B8' }}
          >
            ✕
          </button>
        </div>

        {/* Mode Selector: ONE-SCAN vs MULTI-SCAN */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Scan Completion Mode:</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => void handleToggleMode('ONE_SCAN')}
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
              One-Scan (Auto-Close)
            </button>
            <button
              type="button"
              onClick={() => void handleToggleMode('MULTI_SCAN')}
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
              Multi-Scan (Keep Open)
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
                  ? 'Phone paired. Point camera at SKU, supplier, kit, or tube barcode.'
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleFinishAndClose()}
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 700,
              backgroundColor: activeMode === 'MULTI_SCAN' ? '#0D9488' : '#475569',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            {activeMode === 'MULTI_SCAN' ? 'Finish Scanning' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
