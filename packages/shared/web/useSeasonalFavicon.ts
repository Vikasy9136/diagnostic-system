import { useEffect } from 'react';
import { doc, onSnapshot, type Firestore } from 'firebase/firestore';
import {
  DEFAULT_SEASONAL_BRANDING_DOC,
  resolveActiveFestivalBranding,
  type SeasonalBrandingDocument,
} from '../src/festivalBranding.js';

const WEB_CACHE_KEY = 'labsetu_seasonal_branding_v1';

function readCachedWebBranding(): SeasonalBrandingDocument | null {
  try {
    const raw = window.localStorage.getItem(WEB_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SeasonalBrandingDocument;
    return parsed && Array.isArray(parsed.festivals) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedWebBranding(docData: SeasonalBrandingDocument): void {
  try {
    window.localStorage.setItem(WEB_CACHE_KEY, JSON.stringify(docData));
  } catch {
    // Non-fatal
  }
}

function applyFaviconHref(href: string, version: number): void {
  if (typeof document === 'undefined') return;
  const separator = href.includes('?') ? '&' : '?';
  const versionedHref = `${href}${separator}v=${version}`;

  const iconLinks = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]')
  );
  if (iconLinks.length === 0) {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = versionedHref;
    document.head.appendChild(link);
    return;
  }

  for (const link of iconLinks) {
    if (link.getAttribute('href') !== versionedHref) {
      link.href = versionedHref;
      if (href.endsWith('.png')) {
        link.type = 'image/png';
      }
    }
  }
}

/**
 * Dynamically updates the browser tab favicon across Admin, Small Lab, Large Lab, and Portal
 * based on the centralized Firestore `settings/seasonalBranding` schedule, with localStorage fallback.
 */
export function useSeasonalFavicon(db: Firestore): void {
  useEffect(() => {
    let currentDoc: SeasonalBrandingDocument =
      readCachedWebBranding() || DEFAULT_SEASONAL_BRANDING_DOC;

    const evaluateAndApply = () => {
      const resolved = resolveActiveFestivalBranding(currentDoc, Date.now());
      applyFaviconHref(resolved.webFaviconPath, currentDoc.version || 1);
    };

    evaluateAndApply();

    const unsub = onSnapshot(
      doc(db, 'settings', 'seasonalBranding'),
      (snap) => {
        if (!snap.exists()) {
          currentDoc = DEFAULT_SEASONAL_BRANDING_DOC;
        } else {
          const data = snap.data() as Partial<SeasonalBrandingDocument>;
          currentDoc = {
            version: typeof data.version === 'number' ? data.version : 1,
            forceDefaultBranding: Boolean(data.forceDefaultBranding),
            manualOverrideFestivalId: data.manualOverrideFestivalId ?? null,
            festivals: Array.isArray(data.festivals) ? data.festivals : [],
            updatedAt:
              typeof data.updatedAt === 'string'
                ? data.updatedAt
                : new Date().toISOString(),
            updatedBy:
              typeof data.updatedBy === 'string' ? data.updatedBy : 'system',
          };
          writeCachedWebBranding(currentDoc);
        }
        evaluateAndApply();
      },
      () => {
        // Offline / unauthenticated error: keep cached or default favicon
        evaluateAndApply();
      }
    );

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        evaluateAndApply();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(evaluateAndApply, 60 * 1000);

    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [db]);
}
