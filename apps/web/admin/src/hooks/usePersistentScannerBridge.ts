import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import {
  closeScannerBridgeSessionApi,
  createScannerBridgeSessionApi,
  fetchScannerBridgeEventsApi,
  updateScannerBridgeModeApi,
  type ScannerBridgeEventRecord,
  type ScannerMode,
} from '../services/inventoryApiService';

export type PersistentScannerUiPhase =
  | 'IDLE'
  | 'WAITING_FOR_SCANNER'
  | 'MOBILE_CONNECTED'
  | 'RECORD_ADDED'
  | 'UNKNOWN_BARCODE'
  | 'SESSION_EXPIRED'
  | 'SYNC_FAILED';

export interface ActiveScannerSessionInfo {
  sessionId: string;
  pairingToken: string;
  status: string;
  mode: ScannerMode;
  expiresAt: string;
  lanIp?: string;
}

export function usePersistentScannerBridge(options: {
  contextTitle: string;
  defaultMode?: ScannerMode;
  onScanConfirmed?: (ev: ScannerBridgeEventRecord) => void;
}) {
  const { contextTitle, defaultMode = 'ONE_SCAN', onScanConfirmed } = options;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [session, setSession] = useState<ActiveScannerSessionInfo | null>(null);
  const [activeMode, setActiveMode] = useState<ScannerMode>(defaultMode);
  const [deviceStatus, setDeviceStatus] = useState<
    'WAITING_FOR_DEVICE' | 'CONNECTED' | 'CLOSED' | 'EXPIRED'
  >('WAITING_FOR_DEVICE');
  const [uiPhase, setUiPhase] = useState<PersistentScannerUiPhase>('IDLE');
  const [deviceName, setDeviceName] = useState<string | undefined>();
  const [sessionEvents, setSessionEvents] = useState<ScannerBridgeEventRecord[]>([]);
  const [latestConfirmedEvent, setLatestConfirmedEvent] =
    useState<ScannerBridgeEventRecord | null>(null);

  const pollIntervalRef = useRef<any>(null);
  const autoCloseTimerRef = useRef<any>(null);
  const nextSinceIndexRef = useRef<number>(0);
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const activeModeRef = useRef<ScannerMode>(defaultMode);
  const isModalOpenRef = useRef<boolean>(false);
  const onScanConfirmedRef = useRef(onScanConfirmed);

  useEffect(() => {
    onScanConfirmedRef.current = onScanConfirmed;
  }, [onScanConfirmed]);

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  useEffect(() => {
    isModalOpenRef.current = isModalOpen;
  }, [isModalOpen]);

  const playDesktopChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.14);
    } catch {
      // AudioContext unavailable
    }
  }, []);

  const handleIncomingEvents = useCallback(
    (incoming: ScannerBridgeEventRecord[]) => {
      const fresh: ScannerBridgeEventRecord[] = [];
      for (const ev of incoming) {
        const key = ev.eventId || ev.id;
        if (!key || processedEventIdsRef.current.has(key)) continue;
        processedEventIdsRef.current.add(key);
        fresh.push(ev);
      }
      if (fresh.length === 0) return;

      setSessionEvents((prev) => [...prev, ...fresh]);
      playDesktopChime();

      for (const ev of fresh) {
        setLatestConfirmedEvent(ev);
        setUiPhase(ev.status === 'UNKNOWN_BARCODE' ? 'UNKNOWN_BARCODE' : 'RECORD_ADDED');
        onScanConfirmedRef.current?.(ev);
      }

      // In ONE_SCAN mode, auto-close ONLY the popup after confirmed save —
      // keep the session CONNECTED in the background so subsequent scans still sync!
      if (activeModeRef.current === 'ONE_SCAN' && isModalOpenRef.current) {
        if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = setTimeout(() => {
          setIsModalOpen(false);
        }, 900);
      }
    },
    [playDesktopChime]
  );

  // Attach real-time Firestore listener + polling fallback whenever `session` is active
  useEffect(() => {
    if (!session?.sessionId) return;
    if (deviceStatus === 'CLOSED' || deviceStatus === 'EXPIRED') return;

    let unsubSess: (() => void) | null = null;
    let unsubEvents: (() => void) | null = null;

    try {
      unsubSess = onSnapshot(doc(db, 'scannerPairingSessions', session.sessionId), (snap) => {
        if (!snap.exists()) return;
        const d = snap.data() as any;
        if (d.status) setDeviceStatus(d.status);
        if (d.pairedDeviceName) setDeviceName(d.pairedDeviceName);
        if (d.status === 'EXPIRED') {
          setUiPhase('SESSION_EXPIRED');
        } else if (d.status === 'CONNECTED') {
          setUiPhase((prev) =>
            prev === 'IDLE' || prev === 'WAITING_FOR_SCANNER' ? 'MOBILE_CONNECTED' : prev
          );
        }
      });

      const evQ = query(
        collection(db, 'scannerEvents'),
        where('sessionId', '==', session.sessionId)
      );
      unsubEvents = onSnapshot(evQ, (snap) => {
        const docs = snap.docs
          .map((d) => d.data() as ScannerBridgeEventRecord)
          .sort((a, b) => String(a.scannedAt || '').localeCompare(String(b.scannedAt || '')));
        if (docs.length > 0) {
          handleIncomingEvents(docs);
        }
      });
    } catch {
      // Fallback to polling
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetchScannerBridgeEventsApi(
          session.sessionId,
          nextSinceIndexRef.current
        );
        setDeviceStatus(res.status);
        if (res.pairedDeviceName) setDeviceName(res.pairedDeviceName);
        if (res.status === 'EXPIRED' || res.status === 'CLOSED') {
          setUiPhase(res.status === 'EXPIRED' ? 'SESSION_EXPIRED' : 'IDLE');
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          return;
        }
        if (res.status === 'CONNECTED') {
          setUiPhase((prev) =>
            prev === 'IDLE' || prev === 'WAITING_FOR_SCANNER' ? 'MOBILE_CONNECTED' : prev
          );
        }
        if (res.events && res.events.length > 0) {
          nextSinceIndexRef.current += res.events.length;
          handleIncomingEvents(res.events);
        }
      } catch {
        // Silent retry
      }
    }, 900);

    return () => {
      unsubSess?.();
      unsubEvents?.();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [session?.sessionId, deviceStatus, handleIncomingEvents]);

  const openScanner = useCallback(async () => {
    setIsModalOpen(true);
    // Reuse existing active session if still open & unexpired!
    if (
      session &&
      deviceStatus !== 'CLOSED' &&
      deviceStatus !== 'EXPIRED' &&
      new Date(session.expiresAt).getTime() > Date.now()
    ) {
      return;
    }

    processedEventIdsRef.current.clear();
    nextSinceIndexRef.current = 0;
    setSessionEvents([]);
    setLatestConfirmedEvent(null);
    setDeviceName(undefined);
    setDeviceStatus('WAITING_FOR_DEVICE');
    setUiPhase('WAITING_FOR_SCANNER');

    try {
      const created = await createScannerBridgeSessionApi({
        mode: activeModeRef.current,
        context: contextTitle,
      });
      setSession(created);
    } catch (err) {
      console.error('Failed creating scanner session:', err);
      setUiPhase('SYNC_FAILED');
    }
  }, [session, deviceStatus, contextTitle]);

  // Close ONLY the popup, keeping the paired session alive in the background
  const closePopupOnly = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setIsModalOpen(false);
  }, []);

  // Explicitly disconnect the mobile scanner session
  const disconnectSession = useCallback(async () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    const sid = session?.sessionId;
    setIsModalOpen(false);
    setSession(null);
    setDeviceStatus('CLOSED');
    setUiPhase('IDLE');
    setDeviceName(undefined);
    if (sid) {
      await closeScannerBridgeSessionApi(sid).catch(() => {});
    }
  }, [session?.sessionId]);

  const switchMode = useCallback(
    async (nextMode: ScannerMode) => {
      setActiveMode(nextMode);
      activeModeRef.current = nextMode;
      if (session?.sessionId) {
        await updateScannerBridgeModeApi(session.sessionId, nextMode).catch(() => {});
      }
    },
    [session?.sessionId]
  );

  return {
    isModalOpen,
    session,
    activeMode,
    deviceStatus,
    uiPhase,
    deviceName,
    sessionEvents,
    latestConfirmedEvent,
    openScanner,
    closePopupOnly,
    disconnectSession,
    switchMode,
  };
}
