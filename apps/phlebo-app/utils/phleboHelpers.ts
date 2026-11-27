import { Platform, Vibration } from 'react-native';
import { type PickupOrder, OrderStatus } from '@diagnostic/shared';
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
let activeWebNotifAudioSrc = '';
let activeWebBookingAudioSrc = '';
let activeExpoBookingPlayer: any = null;
let activeExpoNotifPlayer: any = null;
let customNotificationToneUrl = '';
let customBookingRingtoneUrl = '';

export function setDynamicAudioTones(opts: {
  notificationToneUrl?: string;
  bookingRingtoneUrl?: string;
}): void {
  customNotificationToneUrl = (opts.notificationToneUrl || '').trim();
  customBookingRingtoneUrl = (opts.bookingRingtoneUrl || '').trim();
}

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

export function parseDateToMillis(val: any): number {
  if (!val) return NaN;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const ms = new Date(val).getTime();
    return Number.isNaN(ms) ? NaN : ms;
  }
  if (typeof val === 'object') {
    if (typeof val.toMillis === 'function') {
      try {
        return val.toMillis();
      } catch {}
    }
    if (typeof val.toDate === 'function') {
      try {
        return val.toDate().getTime();
      } catch {}
    }
    if (typeof val.seconds === 'number') {
      return (
        val.seconds * 1000 +
        (typeof val.nanoseconds === 'number' ? Math.floor(val.nanoseconds / 1000000) : 0)
      );
    }
  }
  return NaN;
}

export function isOrderBroadcastExpired(order: PickupOrder | null | undefined): boolean {
  if (!order) return true;
  if (order.status !== OrderStatus.READY_FOR_PICKUP) return true;
  if (order.phlebotomistId) return true;

  if (order.broadcastExpiresAt) {
    const expTime = parseDateToMillis(order.broadcastExpiresAt);
    if (!Number.isNaN(expTime)) {
      return Date.now() >= expTime;
    }
  }

  const refTimeVal = order.updatedAt || order.createdAt;
  if (refTimeVal) {
    const refTime = parseDateToMillis(refTimeVal);
    if (!Number.isNaN(refTime)) {
      return Date.now() - refTime >= 45000;
    }
  }

  return false;
}

export function playPickupAlertChime(): void {
  // Light haptic pulse
  try {
    Vibration.vibrate(150);
  } catch {}

  const targetNotifUri = customNotificationToneUrl;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    try {
      const desiredSrc = targetNotifUri || '/sounds/notification_alert.wav';
      if (!activeWebNotifAudio || activeWebNotifAudioSrc !== desiredSrc) {
        activeWebNotifAudio = new Audio(desiredSrc);
        activeWebNotifAudioSrc = desiredSrc;
      }
      activeWebNotifAudio.currentTime = 0;
      void activeWebNotifAudio.play().catch(() => {});
    } catch {
      // Audio playback might be restricted before user gesture
    }
    return;
  }

  // If Admin configured a custom Notification Tone URL, play it directly via expo-audio
  if (targetNotifUri) {
    const customPlayer = playAudioViaExpo({ uri: targetNotifUri }, false);
    if (customPlayer) {
      activeExpoNotifPlayer = customPlayer;
      return;
    }
  }

  // Try expo-audio bundled notification chime first (reliable even if native overlay isn't active), with native fallback
  try {
    const bundledPlayer = playAudioViaExpo(
      require('../assets/sounds/notification_alert.wav'),
      false
    );
    if (bundledPlayer) {
      activeExpoNotifPlayer = bundledPlayer;
      return;
    }
  } catch {}

  if (Platform.OS === 'android') {
    void playNativeNotificationChime();
  }
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

  const targetBookingUri = customBookingRingtoneUrl;

  // 2. Looping Audio Alarm
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      try {
        const desiredSrc = targetBookingUri || '/sounds/booking_alert.wav';
        if (!activeWebBookingAudio || activeWebBookingAudioSrc !== desiredSrc) {
          activeWebBookingAudio = new Audio(desiredSrc);
          activeWebBookingAudioSrc = desiredSrc;
        }
        activeWebBookingAudio.loop = true;
        activeWebBookingAudio.currentTime = 0;
        void activeWebBookingAudio.play().catch(() => {});
      } catch {
        // Audio autoplay might be suspended by browser
      }
    }
  } else if (targetBookingUri) {
    const customLoop = playAudioViaExpo({ uri: targetBookingUri }, true);
    if (customLoop) {
      activeExpoBookingPlayer = customLoop;
    } else if (Platform.OS === 'android') {
      void playNativeBookingRingtone();
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
      activeExpoBookingPlayer.stop?.();
    } catch {}
    activeExpoBookingPlayer = null;
  }
}

export function getPhleboPayoutSlaBadge(
  row: Pick<EarningRow, 'order' | 'stl' | 'settled' | 'delivered' | 'customerPaid'>,
  _instantPayoutWindowMinutes: number,
  _nowTick: number
): { label: string; bg: string; color: string } {
  if (row.settled) {
    return {
      label: '✓ Payout Paid',
      bg: '#DCFCE7',
      color: '#15803D',
    };
  }
  if (!row.delivered) {
    return {
      label: '⏳ Eligible for payout after sample drop (3–7 business days)',
      bg: '#F1F5F9',
      color: '#475569',
    };
  }
  if (!row.customerPaid) {
    return {
      label: '💳 Collect online payment to queue payout',
      bg: '#FFEDD5',
      color: '#C2410C',
    };
  }
  return {
    label: '⏳ Queued for Admin Payout (3–7 Business Days)',
    bg: '#FEF3C7',
    color: '#B45309',
  };
}
