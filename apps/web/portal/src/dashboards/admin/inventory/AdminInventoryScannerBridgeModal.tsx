import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createScannerBridgeSessionApi,
  fetchScannerBridgeEventsApi,
} from '../../../services/inventoryApiService';

interface AdminInventoryScannerBridgeModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onBarcodeScanned?: (barcode: string, metadata?: any) => void;
  contextTitle?: string;
  context?: string;
}

const LIVE_SCANNER_ORIGIN = 'https://labsetu-diagnostics.web.app';

export function AdminInventoryScannerBridgeModal({
  isOpen = true,
  onClose,
  onBarcodeScanned,
  contextTitle,
  context,
}: AdminInventoryScannerBridgeModalProps) {
  const effectiveTitle = contextTitle || context || 'Inward / Kit Assembly';
  if (!isOpen) return null;
  const [session, setSession] = useState<{
    sessionId: string;
    pairingToken: string;
    status: string;
    expiresAt: string;
    lanIp?: string;
  } | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<'WAITING_FOR_DEVICE' | 'CONNECTED' | 'CLOSED'>('WAITING_FOR_DEVICE');
  const [deviceName, setDeviceName] = useState<string | undefined>();
  const [scannedEvents, setScannedEvents] = useState<Array<{ id: string; barcode: string; scannedAt: string }>>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [customHost, setCustomHost] = useState('');
  const [showHostInput, setShowHostInput] = useState(false);
  const [protocolChoice, setProtocolChoice] = useState<'https' | 'http'>('https');
  const [liveLinkAvailable, setLiveLinkAvailable] = useState<boolean>(true);
  const [preferLocalFallback, setPreferLocalFallback] = useState<boolean>(false);

  const pollIntervalRef = useRef<any>(null);
  const nextSinceIndexRef = useRef<number>(0);

  // Play audio chime on desktop when mobile scans a barcode
  const playDesktopChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6 tone
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

  useEffect(() => {
    if (isOpen) {
      initSession();
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
    } else {
      stopPolling();
      setSession(null);
      setScannedEvents([]);
      nextSinceIndexRef.current = 0;
    }
    return () => stopPolling();
  }, [isOpen]);

  async function initSession() {
    try {
      const sess = await createScannerBridgeSessionApi();
      setSession(sess);
      setDeviceStatus('WAITING_FOR_DEVICE');
      startPolling(sess.sessionId);
    } catch (err) {
      console.error('Failed to create scanner bridge session:', err);
    }
  }

  function startPolling(sessionId: string) {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetchScannerBridgeEventsApi(sessionId, nextSinceIndexRef.current);
        setDeviceStatus(res.status);
        if (res.pairedDeviceName) {
          setDeviceName(res.pairedDeviceName);
        }
        if (res.events && res.events.length > 0) {
          nextSinceIndexRef.current += res.events.length;
          setScannedEvents((prev) => [...prev, ...res.events]);

          // Play desktop audio confirmation & trigger scan handler
          playDesktopChime();
          for (const ev of res.events) {
            if (onBarcodeScanned) {
              onBarcodeScanned(ev.barcode, ev.metadata);
            }
          }
        }
      } catch (err) {
        // Silently retry polling
      }
    }, 750);
  }

  function stopPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  if (!isOpen) return null;

  // Compute the direct URL that phone cameras / Google Lens can open:
  // Automatically prefer verified Live HTTPS link (no Chrome/mobile SSL spam warning),
  // and fall back to Local Network IP only if Live link is unavailable.
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
    ? `${selectedProtocol}//${resolvedHost}/mobile-scanner?session=${encodeURIComponent(session.sessionId)}&token=${encodeURIComponent(session.pairingToken)}&context=${encodeURIComponent(effectiveTitle)}&auto=1`
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
          maxWidth: '580px',
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '24px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📷</span> Scan with Mobile Camera / Google Lens
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>
              No app needed! Point your phone camera or Google Lens to use your phone as a wireless barcode reader for {effectiveTitle}.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94A3B8' }}
          >
            ✕
          </button>
        </div>

        {/* Pairing Status Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: '10px',
            backgroundColor: deviceStatus === 'CONNECTED' ? '#ECFDF5' : '#EFF6FF',
            border: `1.5px solid ${deviceStatus === 'CONNECTED' ? '#10B981' : '#BFDBFE'}`,
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>{deviceStatus === 'CONNECTED' ? '🟢' : '📡'}</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: deviceStatus === 'CONNECTED' ? '#065F46' : '#1E40AF' }}>
                {deviceStatus === 'CONNECTED'
                  ? `Phone Connected: ${deviceName || 'Active Mobile Camera'}`
                  : 'Waiting for Mobile Camera / Google Lens...'}
              </div>
              <div style={{ fontSize: '11px', color: '#64748B' }}>
                {deviceStatus === 'CONNECTED'
                  ? 'Your phone is paired! Scan barcodes on boxes or tubes to beam them here instantly.'
                  : 'Open your phone camera or Google Lens and scan the QR code below.'}
              </div>
            </div>
          </div>
        </div>

        {/* QR Code & Web URL Container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            backgroundColor: '#F8FAFC',
            padding: '18px',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            marginBottom: '16px',
            textAlign: 'center',
          }}
        >
          {session ? (
            <>
              {/* Protocol Switcher */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Scanner Mode:</span>
                <button
                  type="button"
                  onClick={() => setProtocolChoice('https')}
                  style={{
                    backgroundColor: protocolChoice === 'https' ? '#0D9488' : '#FFFFFF',
                    color: protocolChoice === 'https' ? '#FFFFFF' : '#475569',
                    border: '1.5px solid ' + (protocolChoice === 'https' ? '#0D9488' : '#CBD5E1'),
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🔒 HTTPS (Live Camera)
                </button>
                <button
                  type="button"
                  onClick={() => setProtocolChoice('http')}
                  style={{
                    backgroundColor: protocolChoice === 'http' ? '#0D9488' : '#FFFFFF',
                    color: protocolChoice === 'http' ? '#FFFFFF' : '#475569',
                    border: '1.5px solid ' + (protocolChoice === 'http' ? '#0D9488' : '#CBD5E1'),
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🌐 HTTP
                </button>
              </div>

              <div
                style={{
                  padding: '10px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1.5px solid #CBD5E1',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.06)',
                  marginBottom: '12px',
                }}
              >
                <img
                  src={qrUrl}
                  alt="Google Lens Scanner Pairing QR"
                  style={{ width: '200px', height: '200px', display: 'block' }}
                />
              </div>

              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                🔍 Point Google Lens or Phone Camera at this QR Code
              </div>
              <div style={{ fontSize: '11px', color: '#64748B', maxWidth: '380px', marginBottom: '12px' }}>
                Tap the link that appears on your phone screen to open the live wireless barcode scanner. No login or Phlebo app required.
              </div>

              {usingLiveOrigin ? (
                <div style={{ fontSize: '11px', color: '#047857', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '8px', padding: '6px 12px', maxWidth: '380px', marginBottom: '12px', textAlign: 'left', lineHeight: 1.4 }}>
                  🟢 <strong>Verified Live HTTPS Link:</strong> Using <strong>{resolvedHost}</strong> — opens directly on mobile camera &amp; Google Lens without any browser security warning.
                  {isLocal && (
                    <button
                      type="button"
                      onClick={() => setPreferLocalFallback(true)}
                      style={{ marginLeft: '6px', background: 'none', border: 'none', color: '#0369A1', textDecoration: 'underline', cursor: 'pointer', fontSize: '11px', padding: 0 }}
                    >
                      Use Local Wi-Fi IP instead
                    </button>
                  )}
                </div>
              ) : protocolChoice === 'https' && (
                <div style={{ fontSize: '11px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '6px 12px', maxWidth: '380px', marginBottom: '12px', textAlign: 'left', lineHeight: 1.4 }}>
                  🟡 <strong>Local Network Fallback ({resolvedHost}):</strong> Live link unavailable or overridden. Tap <strong>"Advanced" &rarr; "Proceed"</strong> if prompted on local IP.
                  {liveLinkAvailable && isLocal && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomHost('');
                        setPreferLocalFallback(false);
                      }}
                      style={{ marginLeft: '6px', background: 'none', border: 'none', color: '#047857', textDecoration: 'underline', cursor: 'pointer', fontSize: '11px', padding: 0 }}
                    >
                      Switch to Live HTTPS Link
                    </button>
                  )}
                </div>
              )}

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
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>{copiedLink ? '✓' : '📋'}</span> {copiedLink ? 'Mobile Link Copied!' : 'Copy Mobile Link'}
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
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>🔗</span> Open Scanner in New Tab
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
                  ⚙️ Change Host / Wi-Fi IP
                </button>
              </div>

              {showHostInput && (
                <div style={{ marginTop: '12px', width: '100%', maxWidth: '340px' }}>
                  <div style={{ fontSize: '11px', color: '#64748B', textAlign: 'left', marginBottom: '4px' }}>
                    Scanner Host IP (for phone on same Wi-Fi):
                  </div>
                  <input
                    type="text"
                    value={customHost || resolvedHost}
                    onChange={(e) => setCustomHost(e.target.value)}
                    placeholder="e.g. 192.168.0.114:3003"
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      fontSize: '12px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '40px', color: '#64748B', fontSize: '13px' }}>
              Generating secure mobile scanner session...
            </div>
          )}
        </div>

        {/* Live Scanned Barcodes Stream */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
              Live Scanned Barcodes ({scannedEvents.length})
            </span>
            {scannedEvents.length > 0 && (
              <button
                onClick={() => setScannedEvents([])}
                style={{ background: 'none', border: 'none', fontSize: '11px', color: '#0D9488', cursor: 'pointer', fontWeight: 600 }}
              >
                Clear Log
              </button>
            )}
          </div>

          <div
            style={{
              maxHeight: '130px',
              overflowY: 'auto',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
            }}
          >
            {scannedEvents.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#94A3B8', fontSize: '12px' }}>
                No barcodes received yet. Point phone camera at a barcode to scan in real-time.
              </div>
            ) : (
              scannedEvents
                .slice()
                .reverse()
                .map((ev, idx) => (
                  <div
                    key={ev.id || idx}
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
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>
                        {ev.barcode}
                      </span>
                      {idx === 0 && (
                        <span style={{ marginLeft: '8px', fontSize: '10px', background: '#DCFCE7', color: '#15803D', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          LATEST
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                      {new Date(ev.scannedAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 600 }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
