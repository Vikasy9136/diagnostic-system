import { NextFunction, Request, Response, Router } from 'express';
import { AppError, db } from './firebaseAdmin';
import { type AuthenticatedRequest, requireAuth, requirePermissions, requireRoles } from './rbac';
import { UserRole } from './types';

const SETTINGS_DOC = db.collection('settings').doc('seasonalBranding');
const AUDIT_COL = db.collection('brandingAuditLogs');

function parseIstEpoch(dateStr: string, timeStr = '00:00'): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm, 0, 0) - 330 * 60 * 1000;
}

export function createBrandingRouter(): Router {
  const router = Router();

  router.get('/active', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const snap = await SETTINGS_DOC.get();
      const data = snap.exists ? snap.data() || {} : {};
      const festivals = Array.isArray(data.festivals) ? data.festivals : [];
      const nowMs = Date.now();
      let activeFestival: Record<string, unknown> | null = null;
      if (!data.forceDefaultBranding) {
        if (data.manualOverrideFestivalId) {
          activeFestival =
            festivals.find((f: Record<string, unknown>) => f.id === data.manualOverrideFestivalId && f.isActive) || null;
        }
        if (!activeFestival) {
          const matching = festivals.filter((f: Record<string, unknown>) => {
            if (!f.isActive) return false;
            const s = parseIstEpoch(String(f.startDate || ''), String(f.startTime || '00:00'));
            const e = parseIstEpoch(String(f.endDate || ''), String(f.endTime || '23:59'));
            return s !== null && e !== null && s <= nowMs && nowMs <= e;
          });
          matching.sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.priority || 0) - Number(a.priority || 0));
          activeFestival = matching[0] || null;
        }
      }
      const key = activeFestival ? String(activeFestival.festivalKey || 'default') : 'default';
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json({
        success: true,
        serverTimeIso: new Date().toISOString(),
        config: {
          version: Number(data.version || 1),
          forceDefaultBranding: Boolean(data.forceDefaultBranding),
          manualOverrideFestivalId: data.manualOverrideFestivalId ?? null,
          festivals,
          updatedAt: data.updatedAt || new Date(0).toISOString(),
          updatedBy: data.updatedBy || 'system',
        },
        resolved: {
          status: activeFestival ? 'ACTIVE_FESTIVAL' : 'DEFAULT',
          activeFestival,
          resolvedIconKey: key,
          androidAliasKey: key === 'custom' ? 'default' : key,
          webFaviconPath:
            key === 'default'
              ? '/favicon-32x32.png'
              : key === 'custom' && activeFestival?.iconAssetUrl
                ? String(activeFestival.iconAssetUrl)
                : `/festivals/${key}/favicon-32x32.png`,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.put(
    '/admin',
    requireAuth,
    requireRoles(UserRole.ADMIN),
    requirePermissions('MANAGE_SETTINGS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const actorEmail = req.user?.email || 'admin@labsetu.com';
        const snap = await SETTINGS_DOC.get();
        const prev = snap.exists ? snap.data() || {} : {};
        const body = req.body || {};
        if (Array.isArray(body.festivals)) {
          for (const f of body.festivals) {
            const s = parseIstEpoch(String(f.startDate || ''), String(f.startTime || '00:00'));
            const e = parseIstEpoch(String(f.endDate || ''), String(f.endTime || '23:59'));
            if (s === null || e === null || e <= s) {
              throw new AppError(`Invalid schedule for ${f.festivalName || f.id}`, 400, 'INVALID_FESTIVAL_SCHEDULE');
            }
          }
        }
        const nextDoc = {
          version: Number(prev.version || 1) + 1,
          forceDefaultBranding: Boolean(body.forceDefaultBranding),
          manualOverrideFestivalId: body.manualOverrideFestivalId ?? null,
          festivals: Array.isArray(body.festivals) ? body.festivals : prev.festivals || [],
          updatedAt: new Date().toISOString(),
          updatedBy: actorEmail,
        };
        await SETTINGS_DOC.set(nextDoc, { merge: false });
        const logId = `brand_audit_${Date.now()}`;
        await AUDIT_COL.doc(logId).set({
          id: logId,
          action: body.auditAction || 'UPDATE_FESTIVAL',
          festivalId: body.targetFestivalId || null,
          actorEmail,
          summary: body.auditSummary || `Updated seasonal branding (v${nextDoc.version}).`,
          timestamp: new Date().toISOString(),
        });
        res.json({ success: true, config: nextDoc });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
