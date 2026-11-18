import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface AppReleaseMetadata {
  latestVersion: string;
  versionCode: number;
  downloadUrl: string;
  releaseNotes: string;
  isMandatory?: boolean;
  publishedAt?: string;
}

export interface AppUpdateCheckResult {
  hasUpdate: boolean;
  updateType: 'APK' | 'OTA' | 'NONE';
  latestVersion: string;
  currentVersion: string;
  downloadUrl?: string;
  releaseNotes?: string;
  isMandatory?: boolean;
}

export const CURRENT_APP_VERSION = Constants.expoConfig?.version || '1.0.0';
export const CURRENT_VERSION_CODE = Constants.expoConfig?.android?.versionCode || 1;

/**
 * Compares two semantic version strings (e.g. "1.0.1" > "1.0.0")
 */
function isNewerVersion(remoteVer: string, localVer: string): boolean {
  try {
    const rParts = remoteVer.split('.').map((x) => parseInt(x, 10) || 0);
    const lParts = localVer.split('.').map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
      const r = rParts[i] || 0;
      const l = lParts[i] || 0;
      if (r > l) return true;
      if (r < l) return false;
    }
  } catch {
    return remoteVer !== localVer;
  }
  return false;
}

/**
 * Checks for updates:
 * 1. Remote APK Release in Firestore (system_config/app_release_phlebo)
 * 2. Over-The-Air JS Updates via expo-updates (for instant patch reload)
 */
export async function checkAppUpdateAvailability(): Promise<AppUpdateCheckResult> {
  const currentVer = CURRENT_APP_VERSION;

  // 1. Check Remote APK Release from Firestore
  try {
    const releaseRef = doc(db, 'system_config', 'app_release_phlebo');
    const snap = await getDoc(releaseRef);
    if (snap.exists()) {
      const data = snap.data() as AppReleaseMetadata;
      const remoteVer = (data.latestVersion || '').trim();
      const remoteCode = Number(data.versionCode) || 0;

      const isApkNewer =
        (remoteVer && isNewerVersion(remoteVer, currentVer)) ||
        (remoteCode > 0 && remoteCode > CURRENT_VERSION_CODE);

      if (isApkNewer && data.downloadUrl) {
        return {
          hasUpdate: true,
          updateType: 'APK',
          latestVersion: remoteVer || `v${remoteCode}`,
          currentVersion: currentVer,
          downloadUrl: data.downloadUrl,
          releaseNotes: data.releaseNotes || 'New enhancements and bug fixes.',
          isMandatory: Boolean(data.isMandatory),
        };
      }
    }
  } catch (err) {
    console.warn('Remote APK release check skipped:', err);
  }

  // 2. Check EAS OTA Updates (if running in a standalone build)
  try {
    if (!__DEV__ && Updates.isEnabled) {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        return {
          hasUpdate: true,
          updateType: 'OTA',
          latestVersion: `${currentVer} (Hotfix OTA)`,
          currentVersion: currentVer,
          releaseNotes: 'Over-the-air hotfix patch ready for instant restart.',
          isMandatory: false,
        };
      }
    }
  } catch (err) {
    console.warn('OTA update check skipped:', err);
  }

  return {
    hasUpdate: false,
    updateType: 'NONE',
    latestVersion: currentVer,
    currentVersion: currentVer,
  };
}

/**
 * Executes update: either fetches OTA patch or opens direct APK download
 */
export async function applyAppUpdate(
  checkResult: AppUpdateCheckResult,
  onProgress?: (msg: string) => void
): Promise<void> {
  if (checkResult.updateType === 'OTA') {
    onProgress?.('Fetching over-the-air update bundle...');
    await Updates.fetchUpdateAsync();
    onProgress?.('Reloading app...');
    await Updates.reloadAsync();
    return;
  }

  if (checkResult.updateType === 'APK' && checkResult.downloadUrl) {
    onProgress?.('Opening download page in browser...');
    const supported = await Linking.canOpenURL(checkResult.downloadUrl).catch(() => false);
    if (supported) {
      await Linking.openURL(checkResult.downloadUrl);
    } else {
      // Fallback
      await Linking.openURL(checkResult.downloadUrl);
    }
  }
}
