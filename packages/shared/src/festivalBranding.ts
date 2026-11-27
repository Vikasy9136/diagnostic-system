export type FestivalIconKey =
  | 'default'
  | 'diwali'
  | 'holi'
  | 'christmas'
  | 'new-year'
  | 'eid'
  | 'independence-day'
  | 'republic-day'
  | 'raksha-bandhan'
  | 'navratri'
  | 'dussehra'
  | 'custom';

export type AndroidBundledIconKey = Exclude<FestivalIconKey, 'custom'>;

export interface FestivalCatalogEntry {
  readonly key: FestivalIconKey;
  readonly label: string;
  readonly androidAliasName: string | null;
  readonly defaultDescription: string;
  readonly accentColor: string;
}

export const DEFAULT_BRANDING_TIMEZONE = 'Asia/Kolkata';

export const FESTIVAL_BUNDLED_CATALOG: Record<FestivalIconKey, FestivalCatalogEntry> = {
  default: {
    key: 'default',
    label: 'Official LabSetu Default',
    androidAliasName: 'LauncherDefault',
    defaultDescription: 'Permanent official LabSetu master brand identity.',
    accentColor: '#0D9488',
  },
  diwali: {
    key: 'diwali',
    label: 'Diwali (Festival of Lights)',
    androidAliasName: 'LauncherDiwali',
    defaultDescription: 'Warm golden diya & marigold aura around the official LabSetu emblem.',
    accentColor: '#F59E0B',
  },
  holi: {
    key: 'holi',
    label: 'Holi (Festival of Colors)',
    androidAliasName: 'LauncherHoli',
    defaultDescription: 'Festive magenta, gold, and cyan color accents framing the LabSetu emblem.',
    accentColor: '#EC4899',
  },
  christmas: {
    key: 'christmas',
    label: 'Christmas',
    androidAliasName: 'LauncherChristmas',
    defaultDescription: 'Crimson & evergreen holly accent celebrating the holiday season.',
    accentColor: '#DC2626',
  },
  'new-year': {
    key: 'new-year',
    label: 'New Year',
    androidAliasName: 'LauncherNewYear',
    defaultDescription: 'Golden starburst celebrations around the LabSetu emblem.',
    accentColor: '#EAB308',
  },
  eid: {
    key: 'eid',
    label: 'Eid Mubarak',
    androidAliasName: 'LauncherEid',
    defaultDescription: 'Crescent moon & golden star accent framing the LabSetu emblem.',
    accentColor: '#10B981',
  },
  'independence-day': {
    key: 'independence-day',
    label: 'Independence Day (15 Aug)',
    androidAliasName: 'LauncherIndependenceDay',
    defaultDescription: 'Indian tricolor ribbon arc honoring Independence Day.',
    accentColor: '#FF9933',
  },
  'republic-day': {
    key: 'republic-day',
    label: 'Republic Day (26 Jan)',
    androidAliasName: 'LauncherRepublicDay',
    defaultDescription: 'Tricolor & navy perimeter ring honoring Republic Day.',
    accentColor: '#138808',
  },
  'raksha-bandhan': {
    key: 'raksha-bandhan',
    label: 'Raksha Bandhan',
    androidAliasName: 'LauncherRakshaBandhan',
    defaultDescription: 'Crimson & gold rakhi rosette accent around the LabSetu emblem.',
    accentColor: '#E11D48',
  },
  navratri: {
    key: 'navratri',
    label: 'Navratri',
    androidAliasName: 'LauncherNavratri',
    defaultDescription: 'Festive magenta & saffron celebratory arcs for Navratri.',
    accentColor: '#DB2777',
  },
  dussehra: {
    key: 'dussehra',
    label: 'Dussehra',
    androidAliasName: 'LauncherDussehra',
    defaultDescription: 'Vermilion & gold celebratory ring for Dussehra.',
    accentColor: '#EA580C',
  },
  custom: {
    key: 'custom',
    label: 'Custom Seasonal Icon',
    androidAliasName: null, // Custom uploaded images work on web/in-app; Android launcher requires pre-bundled APK resources
    defaultDescription: 'Admin-uploaded custom seasonal icon (web favicon & in-app branding; Android launcher falls back to Default unless bundled in APK).',
    accentColor: '#0D9488',
  },
};

export interface FestivalBrandingConfig {
  id: string;
  festivalKey: FestivalIconKey;
  festivalName: string;
  iconAssetUrl?: string;
  previewImageUrl?: string;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endDate: string; // YYYY-MM-DD
  endTime: string; // HH:mm
  timezone: string; // e.g. 'Asia/Kolkata'
  isActive: boolean;
  priority: number; // Higher wins on overlap
  description: string;
  enableSplashBranding?: boolean;
  createdBy: string;
  updatedAt: string;
}

export interface SeasonalBrandingDocument {
  version: number;
  forceDefaultBranding: boolean;
  manualOverrideFestivalId?: string | null;
  festivals: FestivalBrandingConfig[];
  updatedAt: string;
  updatedBy: string;
}

export interface BrandingAuditLogEntry {
  id: string;
  action:
    | 'CREATE_FESTIVAL'
    | 'UPDATE_FESTIVAL'
    | 'ACTIVATE_FESTIVAL'
    | 'DEACTIVATE_FESTIVAL'
    | 'RESTORE_DEFAULT'
    | 'UPLOAD_CUSTOM_ICON'
    | 'AUTO_ACTIVATED'
    | 'AUTO_EXPIRED';
  festivalId?: string;
  festivalName?: string;
  actorEmail: string;
  summary: string;
  timestamp: string;
}

export interface ResolvedFestivalBranding {
  status: 'DEFAULT' | 'ACTIVE_FESTIVAL';
  activeFestival: FestivalBrandingConfig | null;
  resolvedIconKey: FestivalIconKey;
  androidAliasKey: AndroidBundledIconKey;
  webFaviconPath: string;
  upcomingFestivals: FestivalBrandingConfig[];
  expiredFestivals: FestivalBrandingConfig[];
  nextTransitionAtMs: number | null;
}

export const DEFAULT_SEASONAL_BRANDING_DOC: SeasonalBrandingDocument = {
  version: 1,
  forceDefaultBranding: false,
  manualOverrideFestivalId: null,
  festivals: [],
  updatedAt: new Date(0).toISOString(),
  updatedBy: 'system',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * Converts a YYYY-MM-DD + HH:mm wall-clock time in an IANA timezone (default Asia/Kolkata)
 * into UTC epoch milliseconds without external dependencies.
 */
export function parseZonedDateTimeToEpochMs(
  dateStr: string,
  timeStr = '00:00',
  timezone = DEFAULT_BRANDING_TIMEZONE
): number | null {
  if (!DATE_RE.test(dateStr) || !TIME_RE.test(timeStr)) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  if (
    !Number.isFinite(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  // Initial UTC guess
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  if (timezone === 'Asia/Kolkata' || timezone === 'IST') {
    // Asia/Kolkata has no DST and is fixed UTC+05:30 (330 minutes)
    return utcGuess - 330 * 60 * 1000;
  }

  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = dtf.formatToParts(new Date(utcGuess));
    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = Number(p.value);
    }
    const asUtc = Date.UTC(
      map.year,
      (map.month || 1) - 1,
      map.day || 1,
      map.hour === 24 ? 0 : map.hour || 0,
      map.minute || 0,
      map.second || 0,
      0
    );
    const offset = asUtc - utcGuess;
    return utcGuess - offset;
  } catch {
    // Fallback to IST (+05:30)
    return utcGuess - 330 * 60 * 1000;
  }
}

export function validateFestivalSchedule(
  cfg: Pick<FestivalBrandingConfig, 'festivalName' | 'festivalKey' | 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timezone'>
): { valid: boolean; error?: string } {
  if (!cfg.festivalName || !cfg.festivalName.trim()) {
    return { valid: false, error: 'Festival name is required.' };
  }
  if (!FESTIVAL_BUNDLED_CATALOG[cfg.festivalKey]) {
    return { valid: false, error: `Unsupported festival icon key: ${cfg.festivalKey}` };
  }
  const startMs = parseZonedDateTimeToEpochMs(
    cfg.startDate,
    cfg.startTime || '00:00',
    cfg.timezone || DEFAULT_BRANDING_TIMEZONE
  );
  const endMs = parseZonedDateTimeToEpochMs(
    cfg.endDate,
    cfg.endTime || '23:59',
    cfg.timezone || DEFAULT_BRANDING_TIMEZONE
  );
  if (startMs === null || endMs === null) {
    return { valid: false, error: 'Invalid start or end date/time format (expected YYYY-MM-DD and HH:mm).' };
  }
  if (endMs <= startMs) {
    return { valid: false, error: 'End date/time must be strictly after start date/time.' };
  }
  return { valid: true };
}

export function findOverlappingFestivals(
  festivals: FestivalBrandingConfig[],
  candidate: FestivalBrandingConfig
): FestivalBrandingConfig[] {
  const cStart = parseZonedDateTimeToEpochMs(candidate.startDate, candidate.startTime, candidate.timezone);
  const cEnd = parseZonedDateTimeToEpochMs(candidate.endDate, candidate.endTime, candidate.timezone);
  if (cStart === null || cEnd === null) return [];
  return festivals.filter((item) => {
    if (item.id === candidate.id || !item.isActive) return false;
    const iStart = parseZonedDateTimeToEpochMs(item.startDate, item.startTime, item.timezone);
    const iEnd = parseZonedDateTimeToEpochMs(item.endDate, item.endTime, item.timezone);
    if (iStart === null || iEnd === null) return false;
    return cStart <= iEnd && iStart <= cEnd;
  });
}

export function getWebFaviconPathForFestival(festival: FestivalBrandingConfig | null): string {
  if (!festival || festival.festivalKey === 'default') {
    return '/favicon-32x32.png';
  }
  if (festival.festivalKey === 'custom' && festival.iconAssetUrl) {
    return festival.iconAssetUrl;
  }
  return `/festivals/${festival.festivalKey}/favicon-32x32.png`;
}

export function getAndroidAliasKeyForFestival(key: FestivalIconKey): AndroidBundledIconKey {
  if (key === 'custom') return 'default';
  return key in FESTIVAL_BUNDLED_CATALOG ? key : 'default';
}

/**
 * Pure deterministic evaluator that resolves the single active seasonal icon
 * (or default LabSetu icon) at a given timestamp.
 */
export function resolveActiveFestivalBranding(
  doc: SeasonalBrandingDocument | null | undefined,
  nowMs = Date.now()
): ResolvedFestivalBranding {
  const festivals = Array.isArray(doc?.festivals) ? doc!.festivals : [];

  const activeWindow: FestivalBrandingConfig[] = [];
  const upcomingFestivals: FestivalBrandingConfig[] = [];
  const expiredFestivals: FestivalBrandingConfig[] = [];
  let nextTransitionAtMs: number | null = null;

  for (const item of festivals) {
    const startMs = parseZonedDateTimeToEpochMs(
      item.startDate,
      item.startTime || '00:00',
      item.timezone || DEFAULT_BRANDING_TIMEZONE
    );
    const endMs = parseZonedDateTimeToEpochMs(
      item.endDate,
      item.endTime || '23:59',
      item.timezone || DEFAULT_BRANDING_TIMEZONE
    );
    if (startMs === null || endMs === null) continue;

    if (endMs < nowMs) {
      expiredFestivals.push(item);
      continue;
    }

    if (item.isActive) {
      if (startMs <= nowMs && nowMs <= endMs) {
        activeWindow.push(item);
        if (nextTransitionAtMs === null || endMs < nextTransitionAtMs) {
          nextTransitionAtMs = endMs;
        }
      } else if (startMs > nowMs) {
        upcomingFestivals.push(item);
        if (nextTransitionAtMs === null || startMs < nextTransitionAtMs) {
          nextTransitionAtMs = startMs;
        }
      }
    } else if (startMs > nowMs) {
      upcomingFestivals.push(item);
    }
  }

  upcomingFestivals.sort((a, b) => {
    const aMs = parseZonedDateTimeToEpochMs(a.startDate, a.startTime, a.timezone) || 0;
    const bMs = parseZonedDateTimeToEpochMs(b.startDate, b.startTime, b.timezone) || 0;
    return aMs - bMs;
  });
  expiredFestivals.sort((a, b) => {
    const aMs = parseZonedDateTimeToEpochMs(a.endDate, a.endTime, a.timezone) || 0;
    const bMs = parseZonedDateTimeToEpochMs(b.endDate, b.endTime, b.timezone) || 0;
    return bMs - aMs;
  });

  if (doc?.forceDefaultBranding) {
    return {
      status: 'DEFAULT',
      activeFestival: null,
      resolvedIconKey: 'default',
      androidAliasKey: 'default',
      webFaviconPath: '/favicon-32x32.png',
      upcomingFestivals,
      expiredFestivals,
      nextTransitionAtMs,
    };
  }

  let winner: FestivalBrandingConfig | null = null;

  if (doc?.manualOverrideFestivalId) {
    winner =
      festivals.find(
        (f) => f.id === doc.manualOverrideFestivalId && f.isActive
      ) || null;
  }

  if (!winner && activeWindow.length > 0) {
    activeWindow.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const bUpdated = Date.parse(b.updatedAt || '') || 0;
      const aUpdated = Date.parse(a.updatedAt || '') || 0;
      if (bUpdated !== aUpdated) return bUpdated - aUpdated;
      return a.id.localeCompare(b.id);
    });
    winner = activeWindow[0];
  }

  if (!winner) {
    return {
      status: 'DEFAULT',
      activeFestival: null,
      resolvedIconKey: 'default',
      androidAliasKey: 'default',
      webFaviconPath: '/favicon-32x32.png',
      upcomingFestivals,
      expiredFestivals,
      nextTransitionAtMs,
    };
  }

  return {
    status: 'ACTIVE_FESTIVAL',
    activeFestival: winner,
    resolvedIconKey: winner.festivalKey,
    androidAliasKey: getAndroidAliasKeyForFestival(winner.festivalKey),
    webFaviconPath: getWebFaviconPathForFestival(winner),
    upcomingFestivals,
    expiredFestivals,
    nextTransitionAtMs,
  };
}
