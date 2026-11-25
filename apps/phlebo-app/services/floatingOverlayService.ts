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
  targetAddress?: string;
  distance: string;
  payout: string;
  specimens: string;
  timeoutSec?: number;
  surgeIncentive?: number;
}

interface NativeFloatingDispatchOverlayModule {
  canDrawOverlays: () => Promise<boolean>;
  openOverlayPermissionSettings: () => Promise<boolean>;
  openAppDetailsSettings?: () => Promise<boolean>;
  startOverlay: (options: {
    isOnline: boolean;
    nearbyCount: number;
    courierId: string;
    phleboId?: string;
    riderLat?: number;
    riderLng?: number;
    broadcastRadiusKm?: number;
    firebaseApiKey?: string;
    firebaseProjectId?: string;
    authToken?: string;
    refreshToken?: string;
    appInForeground?: boolean;
  }) => Promise<boolean>;
  stopOverlay: () => Promise<boolean>;
  triggerIncomingPickupModal: (orderData: IncomingOrderOverlayPayload) => Promise<boolean>;
  dismissIncomingPickupModal: () => Promise<boolean>;
  getPendingOrderAction: () => Promise<{ action: 'ACCEPT' | 'DECLINE' | 'EXPIRED'; orderId: string } | null>;
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

export async function openAppDetailsPermissionSettings(): Promise<boolean> {
  if (Platform.OS === 'android' && NativeOverlay?.openAppDetailsSettings) {
    try {
      return await NativeOverlay.openAppDetailsSettings();
    } catch {
      // Fallback below
    }
  }
  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
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
  action: 'ACCEPT' | 'DECLINE' | 'EXPIRED';
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
  appState?: AppStateStatus;
  phleboId?: string;
  riderLat?: number;
  riderLng?: number;
  broadcastRadiusKm?: number;
  firebaseApiKey?: string;
  firebaseProjectId?: string;
  authToken?: string;
  refreshToken?: string;
  appInForeground?: boolean;
}): Promise<void> {
  if (Platform.OS === 'web') return;

  const {
    signedIn,
    settings,
    isOnline,
    nearbyCount,
    courierId,
    phleboId,
    riderLat,
    riderLng,
    broadcastRadiusKm,
    firebaseApiKey,
    firebaseProjectId,
    authToken,
    refreshToken,
    appInForeground,
  } = opts;
  const shouldBeActive =
    signedIn &&
    settings.enabled &&
    (settings.visibilityMode === 'ALWAYS' || isOnline);

  // 1. Native Android APK overlay service (true WindowManager floating orb over ALL apps and LabSetu itself)
  if (Platform.OS === 'android' && NativeOverlay) {
    try {
      if (shouldBeActive) {
        const canDraw = await NativeOverlay.canDrawOverlays();
        if (canDraw) {
          await NativeOverlay.startOverlay({
            isOnline,
            nearbyCount,
            courierId: courierId || 'LabSetu',
            phleboId: phleboId || '',
            riderLat: typeof riderLat === 'number' ? riderLat : 0,
            riderLng: typeof riderLng === 'number' ? riderLng : 0,
            broadcastRadiusKm: typeof broadcastRadiusKm === 'number' ? broadcastRadiusKm : 5,
            firebaseApiKey: firebaseApiKey || '',
            firebaseProjectId: firebaseProjectId || 'labsetu-diagnostics',
            authToken: authToken || '',
            refreshToken: refreshToken || '',
            appInForeground: appInForeground !== false,
          });
        }
      } else {
        await NativeOverlay.stopOverlay();
      }
    } catch {
      // Continue gracefully with notification channel fallback
    }
  }

  // 2. Clean up any legacy sticky duty notification in status bar
  try {
    await Notifications.dismissNotificationAsync(STICKY_DUTY_NOTIF_ID).catch(() => { });
  } catch {
    // Ignore cleanup error
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
