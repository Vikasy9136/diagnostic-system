import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import {
  type AndroidBundledIconKey,
  DEFAULT_SEASONAL_BRANDING_DOC,
  resolveActiveFestivalBranding,
  type ResolvedFestivalBranding,
  type SeasonalBrandingDocument,
} from '@diagnostic/shared';
import { db } from '../firebase';

const CACHE_STORAGE_KEY = '@labsetu/seasonal_branding_cache_v1';
const LAST_APPLIED_ICON_KEY = '@labsetu/last_applied_android_icon_v1';
const MIN_REFRESH_INTERVAL_MS = 60 * 1000;

let lastFetchTimestampMs = 0;

interface DynamicLauncherNativeInterface {
  getActiveLauncherIconKey(): Promise<string>;
  setLauncherIconKey(key: string): Promise<string>;
}

const nativeLauncher: DynamicLauncherNativeInterface | undefined =
  Platform.OS === 'android'
    ? (NativeModules.DynamicLauncherIcon as DynamicLauncherNativeInterface | undefined)
    : undefined;

async function readCachedBrandingDoc(): Promise<SeasonalBrandingDocument | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SeasonalBrandingDocument;
    if (!parsed || !Array.isArray(parsed.festivals)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCachedBrandingDoc(docData: SeasonalBrandingDocument): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(docData));
  } catch {
    // Non-fatal
  }
}

async function applyAndroidLauncherAliasIfChanged(targetKey: AndroidBundledIconKey): Promise<void> {
  if (Platform.OS !== 'android' || !nativeLauncher) return;
  try {
    const lastApplied = await AsyncStorage.getItem(LAST_APPLIED_ICON_KEY);
    if (lastApplied === targetKey) {
      return;
    }
    const applied = await nativeLauncher.setLauncherIconKey(targetKey);
    await AsyncStorage.setItem(LAST_APPLIED_ICON_KEY, applied || targetKey);
  } catch (err) {
    console.warn('[dynamicBranding] Failed to switch Android launcher alias:', err);
  }
}

/**
 * Fetches active seasonal branding from Firestore (with offline cache fallback),
 * resolves Asia/Kolkata schedule & priority, and updates the Android launcher alias if changed.
 */
export async function syncDynamicFestivalBranding(
  forceRefresh = false
): Promise<ResolvedFestivalBranding> {
  const now = Date.now();
  let brandingDoc = await readCachedBrandingDoc();

  if (forceRefresh || now - lastFetchTimestampMs >= MIN_REFRESH_INTERVAL_MS || !brandingDoc) {
    try {
      const snap = await getDoc(doc(db, 'settings', 'seasonalBranding'));
      if (snap.exists()) {
        const data = snap.data() as Partial<SeasonalBrandingDocument>;
        brandingDoc = {
          version: typeof data.version === 'number' ? data.version : 1,
          forceDefaultBranding: Boolean(data.forceDefaultBranding),
          manualOverrideFestivalId: data.manualOverrideFestivalId ?? null,
          festivals: Array.isArray(data.festivals) ? data.festivals : [],
          updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
          updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : 'system',
        };
        await writeCachedBrandingDoc(brandingDoc);
      } else if (!brandingDoc) {
        brandingDoc = DEFAULT_SEASONAL_BRANDING_DOC;
      }
      lastFetchTimestampMs = now;
    } catch (err) {
      console.warn('[dynamicBranding] Offline or fetch error; using cached/default branding:', err);
    }
  }

  const resolved = resolveActiveFestivalBranding(
    brandingDoc || DEFAULT_SEASONAL_BRANDING_DOC,
    Date.now()
  );
  await applyAndroidLauncherAliasIfChanged(resolved.androidAliasKey);
  return resolved;
}
