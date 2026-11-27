import { NextFunction, Request, Response, Router } from 'express';
import {
  type BrandingAuditLogEntry,
  DEFAULT_BRANDING_TIMEZONE,
  DEFAULT_SEASONAL_BRANDING_DOC,
  FESTIVAL_BUNDLED_CATALOG,
  type FestivalBrandingConfig,
  findOverlappingFestivals,
  resolveActiveFestivalBranding,
  type SeasonalBrandingDocument,
  UserRole,
  validateFestivalSchedule,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, requireRoles } from '../middleware/auth';
import {
  AuthenticatedRequest,
  getRequestClientMeta,
  recordAuditLog,
  requirePermissions,
} from '../middleware/rbac';

export const brandingRouter = Router();

const SETTINGS_DOC_PATH = 'settings';
const SETTINGS_DOC_ID = 'seasonalBranding';
const AUDIT_COLLECTION = 'brandingAuditLogs';
let mockBrandingDoc: SeasonalBrandingDocument = { ...DEFAULT_SEASONAL_BRANDING_DOC };
const mockAuditLogs: BrandingAuditLogEntry[] = [];

async function readSeasonalBrandingDoc(): Promise<SeasonalBrandingDocument> {
  const { db } = initializeFirebase();
  if (!db) {
    return mockBrandingDoc;
  }
  const snap = await db.collection(SETTINGS_DOC_PATH).doc(SETTINGS_DOC_ID).get();
  if (!snap.exists) {
    return { ...DEFAULT_SEASONAL_BRANDING_DOC };
  }
  const data = snap.data() as Partial<SeasonalBrandingDocument>;
  return {
    version: typeof data.version === 'number' ? data.version : 1,
    forceDefaultBranding: Boolean(data.forceDefaultBranding),
    manualOverrideFestivalId: data.manualOverrideFestivalId ?? null,
    festivals: Array.isArray(data.festivals) ? data.festivals : [],
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : 'system',
  };
}

function sanitizeFestivalItem(raw: Partial<FestivalBrandingConfig>, actorEmail: string): FestivalBrandingConfig {
  const key = raw.festivalKey && FESTIVAL_BUNDLED_CATALOG[raw.festivalKey] ? raw.festivalKey : 'default';
  const catalog = FESTIVAL_BUNDLED_CATALOG[key];
  const item: FestivalBrandingConfig = {
    id: String(raw.id || `${key}_${Date.now()}`).trim(),
    festivalKey: key,
    festivalName: String(raw.festivalName || catalog.label).trim().slice(0, 80),
    iconAssetUrl: raw.iconAssetUrl ? String(raw.iconAssetUrl).trim() : undefined,
    previewImageUrl: raw.previewImageUrl ? String(raw.previewImageUrl).trim() : undefined,
    startDate: String(raw.startDate || '').trim(),
    startTime: String(raw.startTime || '00:00').trim(),
    endDate: String(raw.endDate || '').trim(),
    endTime: String(raw.endTime || '23:59').trim(),
    timezone: String(raw.timezone || DEFAULT_BRANDING_TIMEZONE).trim() || DEFAULT_BRANDING_TIMEZONE,
    isActive: raw.isActive !== false,
    priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : 10,
    description: String(raw.description || catalog.defaultDescription).trim().slice(0, 300),
    enableSplashBranding: Boolean(raw.enableSplashBranding),
    createdBy: String(raw.createdBy || actorEmail).trim(),
    updatedAt: new Date().toISOString(),
  };

  if (item.iconAssetUrl && !/^https:\/\/.+/i.test(item.iconAssetUrl) && !item.iconAssetUrl.startsWith('/')) {
    throw new AppError('Custom iconAssetUrl must be a valid HTTPS URL or relative asset path.', 400, 'INVALID_ICON_URL');
  }

  const check = validateFestivalSchedule(item);
  if (!check.valid) {
    throw new AppError(check.error || 'Invalid festival schedule.', 400, 'INVALID_FESTIVAL_SCHEDULE');
  }
  return item;
}

/**
 * Public endpoint used by Web portals and Phlebo app to fetch the active seasonal branding.
 */
brandingRouter.get('/active', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await readSeasonalBrandingDoc();
    const resolved = resolveActiveFestivalBranding(doc, Date.now());
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({
      success: true,
      serverTimeIso: new Date().toISOString(),
      config: doc,
      resolved,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin-only endpoints below.
 */
brandingRouter.get(
  '/admin',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('MANAGE_SETTINGS'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { db } = initializeFirebase();
      const doc = await readSeasonalBrandingDoc();
      const resolved = resolveActiveFestivalBranding(doc, Date.now());
      if (!db) {
        res.json({ success: true, config: doc, resolved, auditLogs: mockAuditLogs.slice(0, 40) });
        return;
      }
      const auditSnap = await db
        .collection(AUDIT_COLLECTION)
        .orderBy('timestamp', 'desc')
        .limit(40)
        .get();
      const auditLogs = auditSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BrandingAuditLogEntry, 'id'>) }));
      res.json({ success: true, config: doc, resolved, auditLogs });
    } catch (err) {
      next(err);
    }
  }
);

brandingRouter.put(
  '/admin',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('MANAGE_SETTINGS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const actorEmail = req.user?.email || 'admin@labsetu.com';
      const body = req.body as Partial<SeasonalBrandingDocument> & { auditSummary?: string; auditAction?: BrandingAuditLogEntry['action']; targetFestivalId?: string };
      const existing = await readSeasonalBrandingDoc();

      const sanitizedFestivals = Array.isArray(body.festivals)
        ? body.festivals.map((f) => sanitizeFestivalItem(f, actorEmail))
        : existing.festivals;

      const overlaps = sanitizedFestivals
        .filter((f) => f.isActive)
        .map((f) => ({
          festivalId: f.id,
          overlapsWith: findOverlappingFestivals(sanitizedFestivals, f).map((o) => o.id),
        }))
        .filter((x) => x.overlapsWith.length > 0);

      const nextDoc: SeasonalBrandingDocument = {
        version: (existing.version || 1) + 1,
        forceDefaultBranding: Boolean(body.forceDefaultBranding),
        manualOverrideFestivalId: body.manualOverrideFestivalId ?? null,
        festivals: sanitizedFestivals,
        updatedAt: new Date().toISOString(),
        updatedBy: actorEmail,
      };

      const { db } = initializeFirebase();
      const logId = `brand_audit_${Date.now()}`;
      const logEntry: BrandingAuditLogEntry = {
        id: logId,
        action: body.auditAction || 'UPDATE_FESTIVAL',
        festivalId: body.targetFestivalId,
        actorEmail,
        summary: body.auditSummary || `Updated seasonal branding configuration (v${nextDoc.version}).`,
        timestamp: new Date().toISOString(),
      };
      if (!db) {
        mockBrandingDoc = nextDoc;
        mockAuditLogs.unshift(logEntry);
      } else {
        await db.collection(SETTINGS_DOC_PATH).doc(SETTINGS_DOC_ID).set(nextDoc, { merge: false });
        await db.collection(AUDIT_COLLECTION).doc(logId).set(logEntry);
      }

      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail,
        actorRole: req.user?.role || UserRole.ADMIN,
        action: 'UPDATE_SEASONAL_BRANDING',
        resourceType: 'settings',
        resourceId: SETTINGS_DOC_ID,
        summary: logEntry.summary,
        details: { version: nextDoc.version, overlapsCount: overlaps.length },
        ...getRequestClientMeta(req),
      });

      const resolved = resolveActiveFestivalBranding(nextDoc, Date.now());
      res.json({ success: true, config: nextDoc, resolved, overlaps });
    } catch (err) {
      next(err);
    }
  }
);

brandingRouter.post(
  '/admin/restore-default',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('MANAGE_SETTINGS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const actorEmail = req.user?.email || 'admin@labsetu.com';
      const existing = await readSeasonalBrandingDoc();
      const nextDoc: SeasonalBrandingDocument = {
        ...existing,
        version: (existing.version || 1) + 1,
        forceDefaultBranding: true,
        manualOverrideFestivalId: null,
        updatedAt: new Date().toISOString(),
        updatedBy: actorEmail,
      };

      const { db } = initializeFirebase();
      const logId = `brand_audit_${Date.now()}`;
      const logEntry: BrandingAuditLogEntry = {
        id: logId,
        action: 'RESTORE_DEFAULT',
        actorEmail,
        summary: 'Manually restored default LabSetu branding.',
        timestamp: new Date().toISOString(),
      };
      if (!db) {
        mockBrandingDoc = nextDoc;
        mockAuditLogs.unshift(logEntry);
      } else {
        await db.collection(SETTINGS_DOC_PATH).doc(SETTINGS_DOC_ID).set(nextDoc, { merge: false });
        await db.collection(AUDIT_COLLECTION).doc(logId).set(logEntry);
      }

      const resolved = resolveActiveFestivalBranding(nextDoc, Date.now());
      res.json({ success: true, config: nextDoc, resolved });
    } catch (err) {
      next(err);
    }
  }
);
