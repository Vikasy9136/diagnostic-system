import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  pairMobileScannerApi,
  pushScannedBarcodeApi,
  type ScannerMode,
} from '../services/inventoryApiService';

type PermissionState =
  | 'INITIAL'
  | 'CHECKING'
  | 'REQUESTING'
  | 'PROMPT_REQUIRED'
  | 'GRANTED'
  | 'DENIED'
  | 'INSECURE_CONTEXT'
  | 'UNSUPPORTED'
  | 'NO_CAMERA';

interface MobileScanQueueItem {
  eventId: string;
  barcode: string;
  symbology: string;
  time: string;
  syncStatus: 'SYNCING' | 'PENDING_SYNC' | 'SYNCED' | 'DUPLICATE' | 'EXPIRED' | 'ERROR';
  itemName?: string | null;
  recordStatusText?: string;
}

export function MobileScannerPage() {
  const [sessionId, setSessionId] = useState('');
  const [pairingToken, setPairingToken] = useState('');
  const [contextTitle, setContextTitle] = useState('Central Warehouse');
  const [scannerMode, setScannerMode] = useState<ScannerMode>('ONE_SCAN');

  const [connectionStatus, setConnectionStatus] = useState<'PAIRING' | 'CONNECTED' | 'EXPIRED' | 'ERROR'>('PAIRING');
  const [errorMessage, setErrorMessage] = useState('');
  const deviceIdRef = useRef<string>(`MOB-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);

  // Camera & Permission State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>('INITIAL');
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessingSnapshot, setIsProcessingSnapshot] = useState(false);

  // Scan History & Feedback
  const [lastScanned, setLastScanned] = useState<MobileScanQueueItem | null>(null);
  const [recentScans, setRecentScans] = useState<MobileScanQueueItem[]>([]);
  const [justScannedFlash, setJustScannedFlash] = useState(false);
  const lastScannedTimeRef = useRef<{ [code: string]: number }>({});

  // Manual Input State
  const [manualCode, setManualCode] = useState('');
  const [isSendingManual, setIsSendingManual] = useState(false);

  // Parse query parameters and start instant auto-pairing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sId = params.get('session') || '';
    const tkn = params.get('token') || '';
    const ctx = params.get('context') || params.get('title') || 'Central Warehouse';
    const modeParam = params.get('mode') === 'MULTI_SCAN' ? 'MULTI_SCAN' : 'ONE_SCAN';

    setSessionId(sId);
    setPairingToken(tkn);
    setContextTitle(ctx);
    setScannerMode(modeParam);

    if (sId && tkn) {
      try {
        const saved = localStorage.getItem(`labsetu_scanner_queue_${sId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setRecentScans(parsed);
        }
      } catch {}
      void pairWithDesktop(sId, tkn, 1);
    } else {
      setConnectionStatus('ERROR');
      setErrorMessage('Missing Session ID or Token in QR code URL. Please scan the QR code from the Admin Desktop screen again.');
    }
  }, []);

  // Resilient Auto-Pairing with exponential background retry (no false optimistic CONNECTED state)
  async function pairWithDesktop(sId: string, tkn: string, attempt = 1) {
    if (attempt === 1) {
      setConnectionStatus('PAIRING');
    }

    try {
      const deviceId = deviceIdRef.current;
      const deviceName = `${getDeviceModelName()} (Google Lens / Web)`;

      await pairMobileScannerApi(sId, {
        pairingToken: tkn,
        deviceId,
        deviceName,
      });

      setConnectionStatus('CONNECTED');
      setErrorMessage('');
    } catch (err: any) {
      console.warn(`Pairing attempt ${attempt} failed:`, err);
      const code = err?.code;
      const statusCode = err?.statusCode;
      if (statusCode === 410 || statusCode === 404 || code === 'SESSION_EXPIRED' || code === 'SESSION_CLOSED' || code === 'SESSION_NOT_FOUND') {
        setConnectionStatus('EXPIRED');
        setErrorMessage(err?.message || 'Scanner session expired or not found. Please scan a fresh QR code from desktop.');
        return;
      }
      if (attempt < 5) {
        setTimeout(() => {
          void pairWithDesktop(sId, tkn, attempt + 1);
        }, attempt * 700);
      } else {
        setConnectionStatus('ERROR');
        setErrorMessage(err.message || 'Could not connect to desktop session. Ensure Admin desktop scanner modal is open.');
      }
    }
  }

  function getDeviceModelName(): string {
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua)) return 'Apple iPhone';
    if (/iPad/i.test(ua)) return 'Apple iPad';
    if (/Samsung/i.test(ua)) return 'Samsung Galaxy';
    if (/Pixel/i.test(ua)) return 'Google Pixel';
    if (/Android/i.test(ua)) return 'Android Device';
    return 'Mobile Camera';
  }

  // Audio Beep generator using Web Audio API
  const playBeepSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // High-pitched clean confirmation tone (C6)
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // AudioContext unavailable or restricted
    }
  }, []);

  // Stop Camera Stream
  function stopCamera() {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }

  // Proactive Camera Start with Direct User Gesture Support & Polyfills
  const startCamera = useCallback(async (userInitiated = false) => {
    stopCamera();

    // 1. Polyfill legacy getUserMedia implementations if needed
    if (typeof navigator !== 'undefined') {
      if (!navigator.mediaDevices) {
        (navigator as any).mediaDevices = {};
      }
      if (!navigator.mediaDevices.getUserMedia) {
        const legacy =
          (navigator as any).getUserMedia ||
          (navigator as any).webkitGetUserMedia ||
          (navigator as any).mozGetUserMedia ||
          (navigator as any).msGetUserMedia;
        if (legacy) {
          navigator.mediaDevices.getUserMedia = function (constraints: any) {
            return new Promise((resolve, reject) => {
              legacy.call(navigator, constraints, resolve, reject);
            });
          };
        }
      }
    }

    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isSecure = typeof window !== 'undefined' && (window.isSecureContext || isHttps || isLocalhost);

    // If browser completely lacks camera support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (!isSecure) {
        setPermissionState('INSECURE_CONTEXT');
        return;
      }
      setPermissionState('UNSUPPORTED');
      return;
    }

    setPermissionState('REQUESTING');

    try {
      let stream: MediaStream;
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: cameraFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr: any) {
        console.warn('Initial camera constraints failed, trying fallback constraints:', firstErr);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: cameraFacing } },
            audio: false,
          });
        } catch (secondErr: any) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {});
      }

      setIsCameraActive(true);
      setPermissionState('GRANTED');
      setErrorMessage('');

      // Check torch capability
      const track = stream.getVideoTracks()[0];
      const capabilities: any = track?.getCapabilities ? track.getCapabilities() : {};
      setHasTorch(Boolean(capabilities?.torch));
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setIsCameraActive(false);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('DENIED');
        setErrorMessage('Camera access was blocked by the browser. Tap "Allow Camera" or check site permissions.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPermissionState('NO_CAMERA');
        setErrorMessage('No physical camera device was found. Use the Photo Snap button below.');
      } else {
        // If automatic request failed due to user-gesture restriction
        setPermissionState('PROMPT_REQUIRED');
        if (userInitiated) {
          setErrorMessage(err.message || 'Unable to start camera. Please tap Allow Camera.');
        }
      }
    }
  }, [cameraFacing]);

  // Request camera automatically on mount or when cameraFacing changes
  useEffect(() => {
    // If browser supports Permissions API, check status
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'camera' as any })
        .then((status) => {
          if (status.state === 'granted') {
            void startCamera(false);
          } else if (status.state === 'denied') {
            setPermissionState('DENIED');
          } else {
            setPermissionState('PROMPT_REQUIRED');
            // Try starting camera once automatically to trigger the native permission prompt
            void startCamera(false);
          }
        })
        .catch(() => {
          void startCamera(false);
        });
    } else {
      void startCamera(false);
    }

    return () => stopCamera();
  }, [startCamera]);

  // Toggle Torch/Flash
  async function toggleTorch() {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const target = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: target }],
      });
      setTorchOn(target);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  }

  // Camera switch
  function toggleCameraFacing() {
    setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }

  // Persist scan queue locally so network drops never lose scans
  useEffect(() => {
    if (!sessionId) return;
    try {
      localStorage.setItem(`labsetu_scanner_queue_${sessionId}`, JSON.stringify(recentScans.slice(0, 15)));
    } catch {}
  }, [recentScans, sessionId]);

  const deliverScanEvent = useCallback(
    async (item: MobileScanQueueItem) => {
      if (!sessionId || !pairingToken) return;
      if (connectionStatus === 'EXPIRED') return;

      try {
        const ack = await pushScannedBarcodeApi(sessionId, {
          pairingToken,
          eventId: item.eventId,
          barcode: item.barcode,
          symbology: item.symbology,
          deviceId: deviceIdRef.current,
          metadata: {
            source: 'MOBILE_GOOGLE_LENS_VIEWFINDER',
            userAgent: navigator.userAgent,
          },
        });

        const resolvedStatus: MobileScanQueueItem['syncStatus'] = ack.duplicate ? 'DUPLICATE' : 'SYNCED';
        const itemLabel = ack.event?.itemName || (ack.event?.status === 'UNKNOWN_BARCODE' ? 'Unknown Barcode' : null);
        const statusText = ack.duplicate
          ? 'Duplicate Scan • Already Recorded'
          : ack.event?.status === 'UNKNOWN_BARCODE'
          ? 'Unknown Barcode Recorded'
          : 'Barcode Scanned Successfully • Record Added';

        const updated: MobileScanQueueItem = {
          ...item,
          syncStatus: resolvedStatus,
          itemName: itemLabel,
          recordStatusText: statusText,
        };

        setLastScanned((prev) => (prev?.eventId === item.eventId ? updated : prev));
        setRecentScans((prev) => prev.map((s) => (s.eventId === item.eventId ? updated : s)));

        if ((ack.sessionMode || scannerMode) === 'ONE_SCAN' && ack.success) {
          setIsPaused(true);
        }
      } catch (err: any) {
        const statusCode = err?.statusCode;
        const code = err?.code;
        if (statusCode === 410 || statusCode === 404 || code === 'SESSION_EXPIRED' || code === 'SESSION_CLOSED' || code === 'SESSION_NOT_FOUND') {
          setConnectionStatus('EXPIRED');
          setErrorMessage('Desktop pairing session expired or closed. Please scan a new QR code from desktop.');
          setIsPaused(true);
          const expiredItem: MobileScanQueueItem = {
            ...item,
            syncStatus: 'EXPIRED',
            recordStatusText: 'Session Expired',
          };
          setLastScanned((prev) => (prev?.eventId === item.eventId ? expiredItem : prev));
          setRecentScans((prev) => prev.map((s) => (s.eventId === item.eventId ? expiredItem : s)));
          return;
        }

        const pendingItem: MobileScanQueueItem = {
          ...item,
          syncStatus: 'PENDING_SYNC',
          recordStatusText: 'Scan Pending Sync (Retrying...)',
        };
        setLastScanned((prev) => (prev?.eventId === item.eventId ? pendingItem : prev));
        setRecentScans((prev) => prev.map((s) => (s.eventId === item.eventId ? pendingItem : s)));

        setTimeout(() => {
          void deliverScanEvent(item);
        }, 2500);
      }
    },
    [sessionId, pairingToken, connectionStatus, scannerMode]
  );

  // Transmit detected barcode to desktop with unique eventId
  const handleBarcodeDetected = useCallback(
    async (code: string, format = 'CODE_128') => {
      const clean = code.trim();
      if (!clean || isPaused || connectionStatus === 'EXPIRED') return;

      // Debounce same barcode within 1.8 seconds
      const now = Date.now();
      const lastScannedAt = lastScannedTimeRef.current[clean] || 0;
      if (now - lastScannedAt < 1800) {
        return;
      }
      lastScannedTimeRef.current[clean] = now;

      // Feedback: Audio + Haptic + Visual Flash
      playBeepSound();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([45, 30, 45]);
        } catch {}
      }

      setJustScannedFlash(true);
      setTimeout(() => setJustScannedFlash(false), 500);

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const eventId = `EVT-${sessionId || 'LOCAL'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const queueItem: MobileScanQueueItem = {
        eventId,
        barcode: clean,
        symbology: format,
        time: timeStr,
        syncStatus: 'SYNCING',
        recordStatusText: 'Saving Record...',
      };

      setLastScanned(queueItem);
      setRecentScans((prev) => [queueItem, ...prev.slice(0, 14)]);

      await deliverScanEvent(queueItem);
    },
    [isPaused, connectionStatus, playBeepSound, sessionId, deliverScanEvent]
  );

  // Barcode Detection Scanning Loop for Live Video
  useEffect(() => {
    if (!isCameraActive || isPaused) return;

    let animId: number;
    let isDetecting = false;

    // Check if BarcodeDetector is natively supported
    const hasNativeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    let detectorInstance: any = null;

    if (hasNativeDetector) {
      try {
        detectorInstance = new (window as any).BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'data_matrix', 'upc_a', 'upc_e'],
        });
      } catch {
        detectorInstance = null;
      }
    }

    // Fallback ZXing reader initialization if native BarcodeDetector is not available
    let zxingReader: any = null;
    if (!detectorInstance && typeof window !== 'undefined') {
      const zx = (window as any).ZXing;
      if (zx && zx.BrowserMultiFormatReader) {
        try {
          zxingReader = new zx.BrowserMultiFormatReader();
        } catch {}
      } else {
        const scriptId = 'zxing-cdn-script';
        if (!document.getElementById(scriptId)) {
          const s = document.createElement('script');
          s.id = scriptId;
          s.src = 'https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js';
          s.async = true;
          document.head.appendChild(s);
        }
      }
    }

    const scanFrame = async () => {
      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && !isDetecting) {
        isDetecting = true;
        try {
          if (detectorInstance) {
            const barcodes = await detectorInstance.detect(video);
            if (barcodes && barcodes.length > 0) {
              const b = barcodes[0];
              if (b.rawValue) {
                await handleBarcodeDetected(b.rawValue, b.format || 'CODE_128');
              }
            }
          } else if (zxingReader) {
            try {
              const res = await zxingReader.decodeOnceFromVideoDevice(undefined, video);
              if (res && res.getText()) {
                await handleBarcodeDetected(res.getText(), res.getBarcodeFormat() ? String(res.getBarcodeFormat()) : 'BARCODE');
              }
            } catch {
              // No barcode found in this frame - ignore
            }
          }
        } catch {
          // Frame detection pass
        } finally {
          isDetecting = false;
        }
      }
      animId = requestAnimationFrame(scanFrame);
    };

    animId = requestAnimationFrame(scanFrame);
    return () => {
      cancelAnimationFrame(animId);
      if (zxingReader && zxingReader.reset) {
        try {
          zxingReader.reset();
        } catch {}
      }
    };
  }, [isCameraActive, isPaused, handleBarcodeDetected]);

  // Direct Native Camera Snapshot Fallback (Works on 100% of mobile devices and browsers, even on plain HTTP)
  async function handleSnapshotFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingSnapshot(true);
    try {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = async (readEv) => {
        img.src = readEv.target?.result as string;
        img.onload = async () => {
          let detected = false;

          // 1. Try native BarcodeDetector
          if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
            try {
              const detector = new (window as any).BarcodeDetector({
                formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'data_matrix', 'upc_a', 'upc_e'],
              });
              const barcodes = await detector.detect(img);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                await handleBarcodeDetected(barcodes[0].rawValue, barcodes[0].format || 'CODE_128');
                detected = true;
              }
            } catch (err) {
              console.warn('Native BarcodeDetector snapshot scan error:', err);
            }
          }

          // 2. Try ZXing fallback if not detected
          if (!detected && typeof window !== 'undefined') {
            const zx = (window as any).ZXing;
            if (zx && zx.BrowserMultiFormatReader) {
              try {
                const zReader = new zx.BrowserMultiFormatReader();
                const res = await zReader.decodeFromImageElement(img);
                if (res && res.getText()) {
                  await handleBarcodeDetected(res.getText(), res.getBarcodeFormat() ? String(res.getBarcodeFormat()) : 'BARCODE');
                  detected = true;
                }
              } catch (zErr) {
                console.warn('ZXing snapshot scan error:', zErr);
              }
            }
          }

          if (!detected) {
            alert('No barcode detected in the photo. Please align the barcode clearly with good lighting and snap again.');
          }
          setIsProcessingSnapshot(false);
        };
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Snapshot processing failed:', err);
      setIsProcessingSnapshot(false);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  // Handle Manual Code Send
  async function handleSendManualCode(e: React.FormEvent) {
    e.preventDefault();
    const clean = manualCode.trim();
    if (!clean) return;

    setIsSendingManual(true);
    try {
      await handleBarcodeDetected(clean, 'MANUAL_ENTRY');
      setManualCode('');
    } finally {
      setIsSendingManual(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#090D16',
        color: '#F8FAFC',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
    >
      {/* HIDDEN NATIVE CAMERA FILE INPUT */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleSnapshotFile}
        style={{ display: 'none' }}
      />

      {/* TOP HEADER */}
      <header
        style={{
          background: '#0F172A',
          borderBottom: '1px solid #1E293B',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '18px',
              color: '#FFFFFF',
              boxShadow: '0 2px 10px rgba(13, 148, 136, 0.4)',
            }}
          >
            ⚡
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.98rem', letterSpacing: '-0.01em', color: '#FFFFFF' }}>
              LabSetu Scanner
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{contextTitle}</div>
          </div>
        </div>

        {/* CONNECTION STATUS BADGE */}
        <div>
          {connectionStatus === 'CONNECTED' ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#064E3B',
                color: '#34D399',
                padding: '5px 12px',
                borderRadius: '999px',
                fontSize: '0.74rem',
                fontWeight: 700,
                border: '1px solid #059669',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10B981',
                  boxShadow: '0 0 8px #10B981',
                }}
              />
              Desktop Connected
            </div>
          ) : connectionStatus === 'PAIRING' ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#78350F',
                color: '#FCD34D',
                padding: '5px 12px',
                borderRadius: '999px',
                fontSize: '0.74rem',
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#F59E0B',
                }}
              />
              Connecting...
            </div>
          ) : (
            <div
              style={{
                background: '#7F1D1D',
                color: '#FCA5A5',
                padding: '5px 12px',
                borderRadius: '999px',
                fontSize: '0.74rem',
                fontWeight: 700,
              }}
            >
              Reconnecting
            </div>
          )}
        </div>
      </header>

      {/* ERROR BANNER */}
      {errorMessage && (
        <div
          style={{
            background: '#450A0A',
            borderBottom: '1px solid #991B1B',
            color: '#FECACA',
            padding: '10px 16px',
            fontSize: '0.8rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            onClick={() => void pairWithDesktop(sessionId, pairingToken, 1)}
            style={{
              background: '#DC2626',
              border: 'none',
              color: '#FFFFFF',
              padding: '4px 10px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.75rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* VIEWFINDER CAMERA CONTAINER */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          flex: 1,
          minHeight: '360px',
          background: '#000000',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: isCameraActive ? 'block' : 'none',
          }}
        />

        {/* PERMISSION / CAMERA START OVERLAY (When live video is not yet streaming) */}
        {!isCameraActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'radial-gradient(circle at center, #0F172A 0%, #020617 100%)',
              padding: '24px',
              textAlign: 'center',
              zIndex: 8,
            }}
          >
            {permissionState === 'DENIED' ? (
              <div style={{ maxWidth: '320px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔒</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#F87171', marginBottom: '8px' }}>
                  Camera Permission Blocked
                </div>
                <p style={{ fontSize: '0.82rem', color: '#94A3B8', lineHeight: 1.5, marginBottom: '16px' }}>
                  Your mobile browser previously blocked camera access. To allow:
                  <br />
                  <strong style={{ color: '#E2E8F0' }}>Android Chrome:</strong> Tap the 🔒 icon next to the URL &rarr; Permissions &rarr; Camera &rarr; Allow.
                  <br />
                  <strong style={{ color: '#E2E8F0' }}>iOS Safari:</strong> Tap 'aA' &rarr; Website Settings &rarr; Camera &rarr; Allow.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => void startCamera(true)}
                    style={{
                      background: '#0D9488',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '12px 20px',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🔄 Try Re-enabling Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: '#1E293B',
                      color: '#F8FAFC',
                      border: '1px solid #334155',
                      borderRadius: '10px',
                      padding: '12px 20px',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    📸 Or Snap Barcode with Native Camera
                  </button>
                </div>
              </div>
            ) : permissionState === 'INSECURE_CONTEXT' ? (
              <div style={{ maxWidth: '340px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🔒</div>
                <div style={{ fontSize: '1.08rem', fontWeight: 800, color: '#38BDF8', marginBottom: '6px' }}>
                  Enable Live Camera (HTTPS)
                </div>
                <p style={{ fontSize: '0.82rem', color: '#CBD5E1', lineHeight: 1.5, marginBottom: '16px' }}>
                  Mobile browsers strictly require HTTPS to allow continuous live video streaming. Tap below to switch to HTTPS mode:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.location.href = window.location.href.replace(/^http:/i, 'https:');
                      }
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #0284C7 0%, #0EA5E9 100%)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '14px 20px',
                      fontSize: '0.98rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(14, 165, 233, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>🔒</span>
                    <span>Switch to HTTPS (Live Camera)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: '#1E293B',
                      color: '#F8FAFC',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                      padding: '12px 18px',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>📸</span>
                    <span>Or Snap Photo Barcode Instantly</span>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ maxWidth: '300px' }}>
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'rgba(20, 184, 166, 0.15)',
                    border: '2px solid #14B8A6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.8rem',
                    margin: '0 auto 16px auto',
                    animation: 'pulseGlow 2s infinite ease-in-out',
                  }}
                >
                  📷
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#FFFFFF', marginBottom: '6px' }}>
                  Allow Camera Permission
                </div>
                <p style={{ fontSize: '0.8rem', color: '#94A3B8', lineHeight: 1.5, marginBottom: '20px' }}>
                  Tap below to allow camera access for high-speed live tube and kit barcode scanning.
                </p>
                <button
                  type="button"
                  onClick={() => void startCamera(true)}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '14px 20px',
                    fontSize: '0.98rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 18px rgba(13, 148, 136, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span>📷</span>
                  <span>Tap to Grant Camera Access</span>
                </button>

                <div style={{ marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: 'transparent',
                      color: '#14B8A6',
                      border: 'none',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '8px',
                      textDecoration: 'underline',
                    }}
                  >
                    Or Snap Barcode Directly with Camera &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TARGETING SCAN RETICLE OVERLAY */}
        {isCameraActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: '85%',
                maxWidth: '320px',
                height: '180px',
                borderRadius: '16px',
                border: `2px solid ${justScannedFlash ? '#10B981' : 'rgba(20, 184, 166, 0.7)'}`,
                boxShadow: justScannedFlash
                  ? '0 0 25px rgba(16, 185, 129, 0.9), inset 0 0 20px rgba(16, 185, 129, 0.4)'
                  : '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Animated Scanning Laser Line */}
              {!isPaused && (
                <div
                  style={{
                    position: 'absolute',
                    left: '8px',
                    right: '8px',
                    height: '2.5px',
                    background: 'linear-gradient(90deg, transparent, #EF4444 20%, #F87171 50%, #EF4444 80%, transparent)',
                    boxShadow: '0 0 10px #EF4444',
                    animation: 'scanLaserMove 1.8s ease-in-out infinite alternate',
                  }}
                />
              )}

              {/* Reticle Corner Brackets */}
              <div style={{ position: 'absolute', top: -3, left: -3, width: 22, height: 22, borderTop: '4px solid #14B8A6', borderLeft: '4px solid #14B8A6', borderTopLeftRadius: 14 }} />
              <div style={{ position: 'absolute', top: -3, right: -3, width: 22, height: 22, borderTop: '4px solid #14B8A6', borderRight: '4px solid #14B8A6', borderTopRightRadius: 14 }} />
              <div style={{ position: 'absolute', bottom: -3, left: -3, width: 22, height: 22, borderBottom: '4px solid #14B8A6', borderLeft: '4px solid #14B8A6', borderBottomLeftRadius: 14 }} />
              <div style={{ position: 'absolute', bottom: -3, right: -3, width: 22, height: 22, borderBottom: '4px solid #14B8A6', borderRight: '4px solid #14B8A6', borderBottomRightRadius: 14 }} />

              <div
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  fontSize: '0.72rem',
                  color: justScannedFlash ? '#34D399' : '#E2E8F0',
                  fontWeight: 600,
                  textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                }}
              >
                {justScannedFlash ? '✓ Barcode Transmitted!' : 'Align barcode within frame'}
              </div>
            </div>
          </div>
        )}

        {/* FLOATING CAMERA CONTROLS (Torch, Switch, Pause, Snap Photo) */}
        {isCameraActive && (
          <div
            style={{
              position: 'absolute',
              bottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              zIndex: 5,
            }}
          >
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                style={{
                  background: torchOn ? '#F59E0B' : 'rgba(15, 23, 42, 0.85)',
                  color: torchOn ? '#000000' : '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '50px',
                  padding: '8px 14px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>🔦</span> {torchOn ? 'Torch On' : 'Torch'}
              </button>
            )}

            <button
              type="button"
              onClick={toggleCameraFacing}
              style={{
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '50px',
                padding: '8px 14px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>🔄</span> Flip
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: 'rgba(13, 148, 136, 0.9)',
                color: '#FFFFFF',
                border: '1px solid #14B8A6',
                borderRadius: '50px',
                padding: '8px 14px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>📸</span> Snap
            </button>

            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              style={{
                background: isPaused ? '#10B981' : 'rgba(15, 23, 42, 0.85)',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '50px',
                padding: '8px 14px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{isPaused ? '▶️' : '⏸️'}</span> {isPaused ? 'Resume' : 'Pause'}
            </button>
          </div>
        )}
      </div>

      {/* SNAPSHOT PROCESSING SPINNER */}
      {isProcessingSnapshot && (
        <div
          style={{
            background: '#0F766E',
            color: '#FFFFFF',
            padding: '8px 16px',
            textAlign: 'center',
            fontSize: '0.8rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <span>⏳</span> Processing captured photo barcode...
        </div>
      )}

      {/* BOTTOM DRAWER: LAST SCANNED & RECENT SCANS */}
      <div
        style={{
          background: '#0F172A',
          borderTop: '1px solid #1E293B',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* SNAP BARCODE ACTION BUTTON (Always visible for zero-friction scanning) */}
        {!isCameraActive && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '12px',
              padding: '14px',
              fontWeight: 800,
              fontSize: '0.96rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: '0 4px 14px rgba(13, 148, 136, 0.4)',
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>📸</span>
            <span>Take Photo of Barcode</span>
          </button>
        )}

        {/* LAST SCANNED CARD */}
        {connectionStatus === 'EXPIRED' ? (
          <div
            style={{
              background: '#7F1D1D',
              border: '1px solid #EF4444',
              borderRadius: '12px',
              padding: '12px 16px',
              color: '#FEE2E2',
              fontSize: '0.84rem',
              fontWeight: 700,
            }}
          >
            ⚠️ {errorMessage || 'Session Expired. Please scan a new QR code from Desktop.'}
          </div>
        ) : lastScanned ? (
          <div
            style={{
              background:
                lastScanned.syncStatus === 'SYNCED' || lastScanned.syncStatus === 'DUPLICATE'
                  ? 'linear-gradient(135deg, #064E3B 0%, #0F2E28 100%)'
                  : lastScanned.syncStatus === 'PENDING_SYNC'
                  ? '#78350F'
                  : '#1E293B',
              border: `1px solid ${
                lastScanned.syncStatus === 'SYNCED' || lastScanned.syncStatus === 'DUPLICATE'
                  ? '#059669'
                  : lastScanned.syncStatus === 'PENDING_SYNC'
                  ? '#F59E0B'
                  : '#334155'
              }`,
              borderRadius: '12px',
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.7rem', color: '#A7F3D0', fontWeight: 700, textTransform: 'uppercase' }}>
                {lastScanned.recordStatusText || 'Saving Record...'} • {lastScanned.time}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.04em', fontFamily: 'monospace' }}>
                {lastScanned.barcode}
              </div>
              {lastScanned.itemName ? (
                <div style={{ fontSize: '0.76rem', color: '#E2E8F0', marginTop: '2px' }}>
                  {lastScanned.itemName}
                </div>
              ) : null}
            </div>
            {lastScanned.syncStatus === 'PENDING_SYNC' ? (
              <button
                type="button"
                onClick={() => void deliverScanEvent(lastScanned)}
                style={{
                  background: '#F59E0B',
                  color: '#0F172A',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Retry Sync
              </button>
            ) : (
              <div
                style={{
                  background:
                    lastScanned.syncStatus === 'SYNCED' || lastScanned.syncStatus === 'DUPLICATE'
                      ? '#10B981'
                      : '#38BDF8',
                  color: '#022C22',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                {lastScanned.syncStatus === 'SYNCED'
                  ? '✓ Record Added'
                  : lastScanned.syncStatus === 'DUPLICATE'
                  ? '✓ Already Saved'
                  : lastScanned.syncStatus === 'EXPIRED'
                  ? 'Expired'
                  : '⏳ Syncing'}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              background: '#1E293B',
              borderRadius: '10px',
              padding: '12px',
              textAlign: 'center',
              color: '#94A3B8',
              fontSize: '0.82rem',
            }}
          >
            Ready to scan. Point phone camera at any tube, box, or kit barcode.
          </div>
        )}

        {/* MANUAL INPUT EXPANDER */}
        <form onSubmit={handleSendManualCode} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Type barcode manually if label is damaged..."
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            style={{
              flex: 1,
              background: '#1E293B',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#F8FAFC',
              padding: '10px 12px',
              fontSize: '0.82rem',
            }}
          />
          <button
            type="submit"
            disabled={!manualCode.trim() || isSendingManual}
            style={{
              background: '#0D9488',
              border: 'none',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.82rem',
              padding: '10px 16px',
              cursor: 'pointer',
              opacity: !manualCode.trim() || isSendingManual ? 0.6 : 1,
            }}
          >
            Send
          </button>
        </form>

        {/* RECENT SCANS LIST */}
        {recentScans.length > 0 && (
          <div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
              Session Scans ({recentScans.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '110px', overflowY: 'auto' }}>
              {recentScans.map((s) => (
                <div
                  key={s.eventId}
                  style={{
                    background: '#1E293B',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.76rem',
                  }}
                >
                  <span style={{ fontFamily: 'monospace', color: '#E2E8F0', fontWeight: 600 }}>{s.barcode}</span>
                  <span
                    style={{
                      color:
                        s.syncStatus === 'SYNCED' || s.syncStatus === 'DUPLICATE'
                          ? '#10B981'
                          : s.syncStatus === 'PENDING_SYNC'
                          ? '#FBBF24'
                          : '#38BDF8',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                    }}
                  >
                    {s.syncStatus === 'SYNCED'
                      ? '✓ Record Added'
                      : s.syncStatus === 'DUPLICATE'
                      ? '✓ Duplicate Ack'
                      : s.syncStatus === 'PENDING_SYNC'
                      ? '⏳ Pending Sync'
                      : s.syncStatus === 'EXPIRED'
                      ? '✕ Expired'
                      : '⏳ Syncing'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scanLaserMove {
          0% { top: 10px; }
          100% { top: 160px; }
        }
        @keyframes pulseGlow {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.7); }
          70% { transform: scale(1.05); box-shadow: 0 0 0 16px rgba(20, 184, 166, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(20, 184, 166, 0); }
        }
      `}</style>
    </div>
  );
}
