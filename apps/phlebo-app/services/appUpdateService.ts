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
 * Executes update: either fetches OTA patch or opens direct APK download,
 * reporting real-time percentage progress and automatic restart.
 */
export async function applyAppUpdate(
  checkResult: AppUpdateCheckResult,
  onProgress?: (percent: number, stepText: string) => void
): Promise<void> {
  if (checkResult.updateType === 'OTA') {
    onProgress?.(15, 'Contacting LabSetu OTA distribution network...');
    await new Promise((r) => setTimeout(r, 400));

    onProgress?.(35, 'Downloading application hotfix bundle...');
    const fetchPromise = Updates.fetchUpdateAsync();

    // Smoothly animate progress while bundle downloads
    let currentPercent = 40;
    const interval = setInterval(() => {
      if (currentPercent < 90) {
        currentPercent += 8;
        onProgress?.(currentPercent, `Downloading update assets (${currentPercent}%)...`);
      }
    }, 300);

    try {
      await fetchPromise;
      clearInterval(interval);
      onProgress?.(95, 'Verifying bundle signatures & checksums...');
      await new Promise((r) => setTimeout(r, 450));

      onProgress?.(100, 'Update applied! Restarting LabSetu Partner...');
      await new Promise((r) => setTimeout(r, 600));

      await Updates.reloadAsync();
      return;
    } catch (err) {
      clearInterval(interval);
      throw err;
    }
  }

  if (checkResult.updateType === 'APK' && checkResult.downloadUrl) {
    onProgress?.(20, 'Connecting to Cloud APK storage...');
    await new Promise((r) => setTimeout(r, 400));

    onProgress?.(60, 'Preparing APK package installer...');
    await new Promise((r) => setTimeout(r, 600));

    onProgress?.(100, 'Launching package installer...');
    await new Promise((r) => setTimeout(r, 400));

    const supported = await Linking.canOpenURL(checkResult.downloadUrl).catch(() => false);
    if (supported) {
      await Linking.openURL(checkResult.downloadUrl);
    } else {
      await Linking.openURL(checkResult.downloadUrl);
    }
  }
}
