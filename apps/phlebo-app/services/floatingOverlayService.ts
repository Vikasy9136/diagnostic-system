import { type AppStateStatus, Linking, NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { type FloatingIconSettings } from '../types/phleboTypes';

export interface IncomingOrderOverlayPayload {
  orderId: string;
  orderNumber: string;
  pickupLab: string;
  pickupAddress: string;
  targetLab: string;
  distance: string;
  payout: string;
  specimens: string;
  timeoutSec?: number;
  surgeIncentive?: number;
}

interface NativeFloatingDispatchOverlayModule {
  canDrawOverlays: () => Promise<boolean>;
  openOverlayPermissionSettings: () => Promise<boolean>;
  startOverlay: (options: {
    isOnline: boolean;
    nearbyCount: number;
    courierId: string;
  }) => Promise<boolean>;
  stopOverlay: () => Promise<boolean>;
  triggerIncomingPickupModal: (orderData: IncomingOrderOverlayPayload) => Promise<boolean>;
  dismissIncomingPickupModal: () => Promise<boolean>;
  getPendingOrderAction: () => Promise<{ action: 'ACCEPT' | 'DECLINE'; orderId: string } | null>;
  playBookingRingtone?: () => Promise<boolean>;
  stopBookingRingtone?: () => Promise<boolean>;
  playNotificationChime?: () => Promise<boolean>;
}

const NativeOverlay = (NativeModules?.FloatingDispatchOverlayModule ||
  NativeModules?.OverlayDispatchModule) as
  | NativeFloatingDispatchOverlayModule
  | undefined;

const DUTY_CHANNEL_ID = 'labsetu-duty-bubble';
const STICKY_DUTY_NOTIF_ID = 'labsetu-sticky-duty-bubble';
export const URGENT_DISPATCH_CHANNEL_ID = 'labsetu-urgent-pickups';

export interface OverlayEnvironmentInfo {
  runtime: 'apk_native' | 'expo_go' | 'ios' | 'web';
  nativeModuleAvailable: boolean;
  canDrawOverlays: boolean;
  notificationGranted: boolean;
}

export function isNativeSystemOverlayAvailable(): boolean {
  return Platform.OS === 'android' && Boolean(NativeOverlay?.startOverlay);
}

export function isRunningInExpoGo(): boolean {
  return Constants.appOwnership === 'expo' || !isNativeSystemOverlayAvailable();
}

export async function getOverlayEnvironmentInfo(): Promise<OverlayEnvironmentInfo> {
  if (Platform.OS === 'web') {
    const webPerm =
      typeof window !== 'undefined' && 'Notification' in window
        ? window.Notification.permission === 'granted'
        : false;
    return {
      runtime: 'web',
      nativeModuleAvailable: false,
      canDrawOverlays: false,
      notificationGranted: webPerm,
    };
  }

  let notificationGranted = false;
  try {
    const perm = await Notifications.getPermissionsAsync();
    notificationGranted = perm.status === 'granted';
  } catch {
    notificationGranted = false;
  }

  if (Platform.OS === 'ios') {
    return {
      runtime: 'ios',
      nativeModuleAvailable: false,
      canDrawOverlays: false,
      notificationGranted,
    };
  }

  if (NativeOverlay?.canDrawOverlays) {
    let canDraw = false;
    try {
      canDraw = await NativeOverlay.canDrawOverlays();
    } catch {
      canDraw = false;
    }
    return {
      runtime: 'apk_native',
      nativeModuleAvailable: true,
      canDrawOverlays: canDraw,
      notificationGranted,
    };
  }

  return {
    runtime: 'expo_go',
    nativeModuleAvailable: false,
    canDrawOverlays: false,
    notificationGranted,
  };
}

export async function openSystemOverlayPermissionSettings(): Promise<{
  opened: boolean;
  mode: 'overlay' | 'app_settings' | 'web';
}> {
  if (Platform.OS === 'web') {
    return { opened: false, mode: 'web' };
  }

  if (Platform.OS === 'android' && NativeOverlay?.openOverlayPermissionSettings) {
    try {
      await NativeOverlay.openOverlayPermissionSettings();
      return { opened: true, mode: 'overlay' };
    } catch {
      // Fallback below
    }
  }

  if (Platform.OS === 'android') {
    try {
      await Linking.sendIntent('android.settings.action.MANAGE_OVERLAY_PERMISSION', [
        { key: 'packageName', value: Constants.expoConfig?.android?.package || 'com.diagnostic.phleboapp' },
      ]);
      return { opened: true, mode: 'overlay' };
    } catch {
      // Fall back to app settings page
    }
  }

  try {
    await Linking.openSettings();
    return { opened: true, mode: 'app_settings' };
  } catch {
    return { opened: false, mode: 'app_settings' };
  }
}

export async function ensureDutyNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(DUTY_CHANNEL_ID, {
      name: 'LabSetu Persistent Floating Duty Bar',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0],
      enableLights: true,
      lightColor: '#0D9488',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });

    // High Priority Full Screen / Heads Up Channel for Instant Incoming Orders
    await Notifications.setNotificationChannelAsync(URGENT_DISPATCH_CHANNEL_ID, {
      name: 'LabSetu Urgent Sample Pickup Broadcasts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 800, 300, 800, 300, 800],
      enableLights: true,
      lightColor: '#10B981',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      sound: 'default',
      bypassDnd: true,
    });
  } catch {
    // Ignore unsupported notification channel environment
  }
}

/**
 * Triggers native floating pickup card over other apps + loud alert sound & vibration
 */
export async function triggerIncomingPickupOverlay(
  payload: IncomingOrderOverlayPayload
): Promise<boolean> {
  if (Platform.OS === 'android' && NativeOverlay?.triggerIncomingPickupModal) {
    try {
      const canDraw = await NativeOverlay.canDrawOverlays();
      if (canDraw) {
        return await NativeOverlay.triggerIncomingPickupModal(payload);
      }
    } catch (err) {
      console.warn('Native triggerIncomingPickupModal failed:', err);
    }
  }
  return false;
}

/**
 * Dismisses native floating card & silences sound / vibration
 */
export async function dismissIncomingPickupOverlay(): Promise<boolean> {
  if (Platform.OS === 'android' && NativeOverlay?.dismissIncomingPickupModal) {
    try {
      return await NativeOverlay.dismissIncomingPickupModal();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Check if phlebo tapped ACCEPT or DECLINE on the outside-app floating card
 */
export async function getPendingIncomingOrderAction(): Promise<{
  action: 'ACCEPT' | 'DECLINE';
  orderId: string;
} | null> {
  if (Platform.OS === 'android' && NativeOverlay?.getPendingOrderAction) {
    try {
      return await NativeOverlay.getPendingOrderAction();
    } catch {
      return null;
    }
  }
  return null;
}

export async function syncFloatingOverlayRuntime(opts: {
  signedIn: boolean;
  settings: FloatingIconSettings;
  isOnline: boolean;
  nearbyCount: number;
  courierId: string;
  appState: AppStateStatus;
}): Promise<void> {
  if (Platform.OS === 'web') return;

  const { signedIn, settings, isOnline, nearbyCount, courierId, appState } = opts;
  const shouldBeActive =
    signedIn &&
    settings.enabled &&
    settings.showOutsideApp &&
    (settings.visibilityMode === 'ALWAYS' || isOnline);

  // 1. Native Android APK overlay service (true WindowManager floating orb over other apps)
  if (Platform.OS === 'android' && NativeOverlay) {
    try {
      if (shouldBeActive && appState !== 'active') {
        const canDraw = await NativeOverlay.canDrawOverlays();
        if (canDraw) {
          await NativeOverlay.startOverlay({
            isOnline,
            nearbyCount,
            courierId: courierId || 'LabSetu',
          });
        }
      } else {
        await NativeOverlay.stopOverlay();
      }
    } catch {
      // Continue gracefully with notification channel fallback
    }
  }

  // 2. Expo Go & Android sticky notification quick-return bubble while minimized / offline standby
  try {
    if (!shouldBeActive) {
      await Notifications.dismissNotificationAsync(STICKY_DUTY_NOTIF_ID).catch(() => {});
      return;
    }

    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') return;

    await ensureDutyNotificationChannel();

    // Post/refresh ongoing sticky notification when minimized, or on duty changes
    if (appState !== 'active') {
      await Notifications.scheduleNotificationAsync({
        identifier: STICKY_DUTY_NOTIF_ID,
        content: {
          title: isOnline
            ? `🟢 LabSetu Floating Radar ON • ${courierId || 'Partner'}`
            : `⚪ LabSetu Quick Return • ${courierId || 'Partner'}`,
          body:
            nearbyCount > 0
              ? `⚡ ${nearbyCount} pickup request(s) within 1–5 km! Tap to open LabSetu.`
              : 'App minimized — Tap anytime to jump back to LabSetu Quick Radar.',
          sticky: true,
          autoDismiss: false,
          data: { action: 'OPEN_RADAR' },
        },
        trigger: Platform.OS === 'android' ? { channelId: DUTY_CHANNEL_ID } : null,
      });
    } else {
      await Notifications.dismissNotificationAsync(STICKY_DUTY_NOTIF_ID).catch(() => {});
    }
  } catch {
    // Ignore sticky notification errors cleanly
  }
}

export async function playNativeBookingRingtone(): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeOverlay?.playBookingRingtone) return false;
  try {
    return await NativeOverlay.playBookingRingtone();
  } catch {
    return false;
  }
}

export async function stopNativeBookingRingtone(): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeOverlay?.stopBookingRingtone) return false;
  try {
    return await NativeOverlay.stopBookingRingtone();
  } catch {
    return false;
  }
}

export async function playNativeNotificationChime(): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeOverlay?.playNotificationChime) return false;
  try {
    return await NativeOverlay.playNotificationChime();
  } catch {
    return false;
  }
}
