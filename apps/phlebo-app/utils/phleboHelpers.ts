import { Platform, Vibration } from 'react-native';
import {
  playNativeBookingRingtone,
  playNativeNotificationChime,
  stopNativeBookingRingtone,
} from '../services/floatingOverlayService';
import { type EarningRow } from '../types/phleboTypes';

export function formatLabel(value?: string | null): string {
  if (!value) return '—';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .replace(/\bEdta\b/g, 'EDTA')
    .replace(/\bStat\b/g, 'STAT');
}

let activeAlertTimeout: any = null;
let activeWebBookingAudio: any = null;
let activeWebNotifAudio: any = null;
let activeExpoBookingPlayer: any = null;
let activeExpoNotifPlayer: any = null;

function playAudioViaExpo(assetRequire: any, isLoop = false): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createAudioPlayer } = require('expo-audio');
    const player = createAudioPlayer(assetRequire);
    if (player) {
      if (isLoop) {
        player.loop = true;
      }
      player.play();
      return player;
    }
  } catch {
    // Ignore expo-audio module loading errors if native module not ready
  }
  return null;
}

export function playPickupAlertChime(): void {
  // Light haptic pulse
  try {
    Vibration.vibrate(150);
  } catch {}

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    try {
      if (!activeWebNotifAudio) {
        activeWebNotifAudio = new Audio('/sounds/notification_alert.wav');
      }
      activeWebNotifAudio.currentTime = 0;
      void activeWebNotifAudio.play().catch(() => {});
    } catch {
      // Audio playback might be restricted before user gesture
    }
    return;
  }

  // 1. Try native Kotlin overlay/chime module first
  if (Platform.OS === 'android') {
    void playNativeNotificationChime().then((handled) => {
      if (!handled) {
        // 2. Fallback to expo-audio bundled asset
        try {
          if (!activeExpoNotifPlayer) {
            activeExpoNotifPlayer = playAudioViaExpo(
              require('../assets/sounds/notification_alert.wav'),
              false
            );
          } else {
            activeExpoNotifPlayer.seekTo?.(0);
            activeExpoNotifPlayer.play?.();
          }
        } catch {}
      }
    });
    return;
  }

  // iOS / Other platforms fallback
  try {
    playAudioViaExpo(require('../assets/sounds/notification_alert.wav'), false);
  } catch {}
}

/**
 * Starts continuous looping alert sound and heavy vibration pattern
 * for high-priority dispatch until accepted, declined or timed out.
 */
export function startContinuousPickupAlert(timeoutSeconds = 45): void {
  stopContinuousPickupAlert();

  // 1. Device Vibration pattern (repeating continuously until cancelled)
  try {
    const pattern = [0, 800, 300, 800, 300, 1000];
    Vibration.vibrate(pattern, true);
  } catch {
    // Ignore vibration error
  }

  // 2. Looping Audio Alarm
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      try {
        if (!activeWebBookingAudio) {
          activeWebBookingAudio = new Audio('/sounds/booking_alert.wav');
        }
        activeWebBookingAudio.loop = true;
        activeWebBookingAudio.currentTime = 0;
        void activeWebBookingAudio.play().catch(() => {});
      } catch {
        // Audio autoplay might be suspended by browser
      }
    }
  } else if (Platform.OS === 'android') {
    void playNativeBookingRingtone().then((handled) => {
      if (!handled) {
        try {
          if (!activeExpoBookingPlayer) {
            activeExpoBookingPlayer = playAudioViaExpo(
              require('../assets/sounds/booking_alert.wav'),
              true
            );
          } else {
            activeExpoBookingPlayer.play?.();
          }
        } catch {}
      }
    });
  } else {
    try {
      activeExpoBookingPlayer = playAudioViaExpo(
        require('../assets/sounds/booking_alert.wav'),
        true
      );
    } catch {}
  }

  // 3. Safety auto-stop after timeout
  activeAlertTimeout = setTimeout(() => {
    stopContinuousPickupAlert();
  }, Math.max(10, timeoutSeconds) * 1000);
}

/**
 * Stops continuous alert sound and device vibration immediately.
 */
export function stopContinuousPickupAlert(): void {
  try {
    Vibration.cancel();
  } catch {}

  if (activeAlertTimeout) {
    clearTimeout(activeAlertTimeout);
    activeAlertTimeout = null;
  }

  if (Platform.OS === 'web' && activeWebBookingAudio) {
    try {
      activeWebBookingAudio.pause();
      activeWebBookingAudio.currentTime = 0;
    } catch {}
  } else if (Platform.OS === 'android') {
    void stopNativeBookingRingtone();
  }

  if (activeExpoBookingPlayer) {
    try {
      activeExpoBookingPlayer.pause?.();
      activeExpoBookingPlayer.seekTo?.(0);
    } catch {}
  }
}

export function getPhleboPayoutSlaBadge(
  row: Pick<EarningRow, 'order' | 'stl' | 'settled' | 'delivered' | 'customerPaid'>,
  instantPayoutWindowMinutes: number,
  nowTick: number
): { label: string; bg: string; color: string } {
  const windowMins = Math.max(5, instantPayoutWindowMinutes || 30);
  if (row.settled) {
    return {
      label: '✓ Instant Payout Settled',
      bg: '#DCFCE7',
      color: '#15803D',
    };
  }
  if (!row.delivered) {
    return {
      label: `⏳ Eligible for ${windowMins}-min Instant Payout on drop`,
      bg: '#F1F5F9',
      color: '#475569',
    };
  }
  if (!row.customerPaid) {
    return {
      label: `💳 Collect online payment to trigger ${windowMins}-min payout`,
      bg: '#FFEDD5',
      color: '#C2410C',
    };
  }
  const baseIso =
    row.stl?.completedAt ||
    row.order.completedAt ||
    row.order.actualDeliveredAt ||
    row.order.updatedAt ||
    row.order.createdAt;
  const dueMs = row.stl?.payoutDueAt
    ? new Date(row.stl.payoutDueAt).getTime()
    : row.order.payoutDueAt
    ? new Date(row.order.payoutDueAt).getTime()
    : new Date(baseIso).getTime() + windowMins * 60000;
  if (!Number.isFinite(dueMs)) {
    return {
      label: `⚡ ${windowMins}-Min Instant Payout Queued`,
      bg: '#FEF3C7',
      color: '#B45309',
    };
  }
  const remSeconds = Math.max(0, Math.floor((dueMs - nowTick) / 1000));
  if (remSeconds > 0) {
    const mins = Math.floor(remSeconds / 60);
    const secs = remSeconds % 60;
    return {
      label: `⚡ Payout Due in ${mins}m ${String(secs).padStart(2, '0')}s`,
      bg: '#FEF3C7',
      color: '#B45309',
    };
  }
  return {
    label: `⚡ ${windowMins}-MIN PAYOUT DUE NOW`,
    bg: '#DCFCE7',
    color: '#15803D',
  };
}
