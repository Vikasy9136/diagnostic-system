import { NextFunction, Response, Router } from 'express';
import {
  type AutomationRunRecord,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  OrderStatus,
  UserRole,
} from './types';
import {
  type OnboardingRecord,
  type OperationalExceptionRecord,
  type ServiceZoneRecord,
  type SupportTicketRecord,
  type TrainingRecord,
  type VerificationReviewRecord,
} from './modulesTypes';
import { DEFAULT_STARTER_SERVICE_ZONES, normalizeIdentifierCode } from './orgConstants';
import { ADMIN_EMAIL, AppError, db } from './firebaseAdmin';
import { ensureOrganisationBootstrapped } from './directory';
import { sendPlatformNotification } from './mailer';
import {
  type AuthenticatedRequest,
  getRequestClientMeta,
  recordAuditLog,
  requireAnyPermission,
  requireAuth,
  requirePermissions,
  requireRoles,
} from './rbac';

function sanitizeZonePincodes(input: unknown): string[] {
  const arr = Array.isArray(input)
    ? input
    : typeof input === 'string'
    ? input.split(/[,\s]+/)
    : [];
  const cleaned = arr
    .map((p) => String(p || '').replace(/\D/g, '').slice(0, 6))
    .filter((p) => p.length === 6);
  return Array.from(new Set(cleaned));
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function resolveOpsHeadEmail(): Promise<string> {
  const snap = await db.collection('departments').doc('OPERATIONS_PARTNERSHIPS').get();
  const email = snap.exists ? (snap.data()?.headEmail as string | undefined) : undefined;
  return (email || ADMIN_EMAIL).trim().toLowerCase();
}

export function createOpsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // Accessible to all signed-in roles (Small Lab, Large Lab, Phlebo, Admin) to inspect active coverage zones
  router.get('/service-zones', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await ensureOrganisationBootstrapped(req.user?.email);
      const snap = await db.collection('service_zones').get();
      let zones: ServiceZoneRecord[] = snap.docs.map((d) => d.data() as ServiceZoneRecord);
      if (zones.length === 0) {
        for (const starter of DEFAULT_STARTER_SERVICE_ZONES) {
          await db.collection('service_zones').doc(starter.id).set(starter, { merge: true });
        }
        zones = [...DEFAULT_STARTER_SERVICE_ZONES];
      }
      const activeOnly = String(req.query.activeOnly || '').toLowerCase() === 'true';
      const filtered = activeOnly
        ? zones.filter((z) => z.isActive !== false && z.launchPhase !== 'PAUSED')
        : zones;
      filtered.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

      return res.json({
        success: true,
        data: filtered,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post(
    '/service-zones',
    requireRoles(UserRole.ADMIN),
    requireAnyPermission(
      'MANAGE_OPERATIONAL_QUALITY',
      'MANAGE_BOOKINGS_DISPATCH',
      'MANAGE_LAB_PARTNERSHIPS'
    ),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const {
          id,
          zoneCode,
          name,
          city,
          state,
          centerLatitude,
          centerLongitude,
          radiusKm,
          pincodes,
          launchPhase,
          isActive,
          notes,
        } = req.body || {};

        const lat = Number(centerLatitude);
        const lng = Number(centerLongitude);
        const rad = Number(radiusKm);
        if (!name?.trim() || !city?.trim()) {
          return next(new AppError('Zone name and city are required.', 400, 'BAD_REQUEST'));
        }
        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180
        ) {
          return next(
            new AppError('Valid centerLatitude and centerLongitude are required.', 400, 'BAD_REQUEST')
          );
        }
        if (!Number.isFinite(rad) || rad < 0.5 || rad > 100) {
          return next(new AppError('radiusKm must be between 0.5 km and 100 km.', 400, 'BAD_REQUEST'));
        }

        const now = new Date().toISOString();
        const resolvedCode = normalizeIdentifierCode(
          zoneCode?.trim() ||
            `ZONE-${String(city).slice(0, 3)}-${String(name).replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 14)}`
        );
        const docId = normalizeIdentifierCode(id?.trim() || resolvedCode) || `ZONE-${Date.now()}`;
        const zone: ServiceZoneRecord = {
          id: docId,
          zoneCode: resolvedCode,
          name: String(name).trim(),
          city: String(city).trim(),
          ...(state?.trim() ? { state: String(state).trim() } : { state: 'Maharashtra' }),
          centerLatitude: Math.round(lat * 1000000) / 1000000,
          centerLongitude: Math.round(lng * 1000000) / 1000000,
          radiusKm: Math.round(rad * 10) / 10,
          pincodes: sanitizeZonePincodes(pincodes),
          launchPhase: (
            ['PILOT', 'EXPANSION', 'PAUSED'].includes(String(launchPhase)) ? launchPhase : 'EXPANSION'
          ) as ServiceZoneRecord['launchPhase'],
          isActive: isActive !== false && launchPhase !== 'PAUSED',
          ...(notes?.trim() ? { notes: String(notes).trim() } : {}),
          createdBy: req.user?.email || ADMIN_EMAIL,
          updatedBy: req.user?.email || ADMIN_EMAIL,
          createdAt: now,
          updatedAt: now,
        };

        await db.collection('service_zones').doc(docId).set(zone, { merge: true });
        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: req.user?.role,
          action: 'SERVICE_ZONE_CREATED',
          resourceType: 'SERVICE_ZONE',
          resourceId: docId,
          departmentId: 'OPERATIONS_PARTNERSHIPS',
          severity: 'SENSITIVE',
          summary: `Added operational service zone ${zone.name} (${zone.city}, ${zone.radiusKm} km radius, phase=${zone.launchPhase})`,
          ...getRequestClientMeta(req),
        });

        return res.status(201).json({
          success: true,
          data: zone,
          message: `Service zone "${zone.name}" saved and published.`,
          timestamp: now,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.patch(
    '/service-zones/:id',
    requireRoles(UserRole.ADMIN),
    requireAnyPermission(
      'MANAGE_OPERATIONAL_QUALITY',
      'MANAGE_BOOKINGS_DISPATCH',
      'MANAGE_LAB_PARTNERSHIPS'
    ),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('service_zones').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError(`Service zone not found: ${req.params.id}`, 404, 'NOT_FOUND'));
        }
        const existing = snap.data() as ServiceZoneRecord;
        const body = req.body || {};
        const now = new Date().toISOString();

        if (body.radiusKm !== undefined) {
          const rad = Number(body.radiusKm);
          if (!Number.isFinite(rad) || rad < 0.5 || rad > 100) {
            return next(new AppError('radiusKm must be between 0.5 km and 100 km.', 400, 'BAD_REQUEST'));
          }
        }

        const nextPhase = body.launchPhase ?? existing.launchPhase;
        const nextActive =
          typeof body.isActive === 'boolean'
            ? body.isActive
            : body.launchPhase === 'PAUSED'
            ? false
            : existing.isActive;

        const updated: ServiceZoneRecord = {
          ...existing,
          ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
          ...(body.city !== undefined ? { city: String(body.city).trim() } : {}),
          ...(body.state !== undefined ? { state: String(body.state).trim() } : {}),
          ...(body.zoneCode !== undefined
            ? { zoneCode: normalizeIdentifierCode(String(body.zoneCode)) }
            : {}),
          ...(body.centerLatitude !== undefined
            ? { centerLatitude: Math.round(Number(body.centerLatitude) * 1000000) / 1000000 }
            : {}),
          ...(body.centerLongitude !== undefined
            ? { centerLongitude: Math.round(Number(body.centerLongitude) * 1000000) / 1000000 }
            : {}),
          ...(body.radiusKm !== undefined
            ? { radiusKm: Math.round(Number(body.radiusKm) * 10) / 10 }
            : {}),
          ...(body.pincodes !== undefined ? { pincodes: sanitizeZonePincodes(body.pincodes) } : {}),
          ...(body.notes !== undefined ? { notes: String(body.notes).trim() } : {}),
          launchPhase: nextPhase,
          isActive: nextActive,
          updatedBy: req.user?.email || ADMIN_EMAIL,
          updatedAt: now,
        };

        await ref.set(updated, { merge: true });
        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: req.user?.role,
          action: 'SERVICE_ZONE_UPDATED',
          resourceType: 'SERVICE_ZONE',
          resourceId: req.params.id,
          departmentId: 'OPERATIONS_PARTNERSHIPS',
          severity: 'SENSITIVE',
          summary: `Updated service zone ${updated.name} (active=${updated.isActive}, radius=${updated.radiusKm}km, phase=${updated.launchPhase})`,
          ...getRequestClientMeta(req),
        });

        return res.json({
          success: true,
          data: updated,
          message: `Service zone "${updated.name}" updated.`,
          timestamp: now,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.delete(
    '/service-zones/:id',
    requireRoles(UserRole.ADMIN),
    requireAnyPermission('MANAGE_OPERATIONAL_QUALITY', 'MANAGE_BOOKINGS_DISPATCH'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('service_zones').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError(`Service zone not found: ${req.params.id}`, 404, 'NOT_FOUND'));
        }
        const existing = snap.data() as ServiceZoneRecord;
        await ref.delete();
        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: req.user?.role,
          action: 'SERVICE_ZONE_DELETED',
          resourceType: 'SERVICE_ZONE',
          resourceId: req.params.id,
          departmentId: 'OPERATIONS_PARTNERSHIPS',
          severity: 'CRITICAL',
          summary: `Deleted service zone ${existing.name} (${existing.zoneCode})`,
          ...getRequestClientMeta(req),
        });
        return res.json({
          success: true,
          data: { id: req.params.id, deleted: true },
          message: `Service zone "${existing.name}" deleted.`,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.get(
    '/overview',
    requireAnyPermission(
      'VIEW_OPERATIONS_DASHBOARD',
      'MANAGE_BOOKINGS_DISPATCH',
      'MANAGE_PHLEBO_NETWORK',
      'MANAGE_LAB_PARTNERSHIPS',
      'MANAGE_ONBOARDING',
      'MANAGE_VERIFICATION',
      'MANAGE_TRAINING',
      'MANAGE_SUPPORT_TICKETS',
      'MANAGE_OPERATIONAL_QUALITY'
    ),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        await ensureOrganisationBootstrapped(req.user?.email);
        const [
          ordersSnap,
          phleboSnap,
          labsSnap,
          onbSnap,
          verSnap,
          trnSnap,
          tktSnap,
          excSnap,
          runsSnap,
          slaSnap,
        ] = await Promise.all([
          db.collection('orders').limit(200).get(),
          db.collection('phlebotomists').limit(200).get(),
          db.collection('labs').limit(200).get(),
          db.collection('onboarding_records').limit(150).get(),
          db.collection('verification_reviews').limit(150).get(),
          db.collection('training_records').limit(150).get(),
          db.collection('support_tickets').limit(150).get(),
          db.collection('operational_exceptions').limit(150).get(),
          db
            .collection('automation_runs')
            .where('departmentId', '==', 'OPERATIONS_PARTNERSHIPS')
            .limit(40)
            .get(),
          db.collection('settings').doc('platform').get(),
        ]);

        const sortDesc = <T extends { createdAt?: string }>(arr: T[]) =>
          arr.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

        const orders: Array<Record<string, any>> = ordersSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Record<string, any>),
        }));
        const phlebos: Array<Record<string, any>> = phleboSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Record<string, any>),
        }));
        const labs: Array<Record<string, any>> = labsSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Record<string, any>),
        }));

        const canViewIdentity =
          Boolean(req.user?.isSuperAdmin) ||
          Boolean(req.user?.permissions.includes('VIEW_IDENTITY_DOCS'));

        const onboarding = sortDesc(onbSnap.docs.map((d) => d.data() as OnboardingRecord));
        const verificationReviews = sortDesc(
          verSnap.docs.map((d) => {
            const rec = d.data() as VerificationReviewRecord;
            return canViewIdentity
              ? rec
              : { ...rec, documentUrl: undefined, storagePath: undefined };
          })
        );
        const training = sortDesc(trnSnap.docs.map((d) => d.data() as TrainingRecord));
        const tickets = sortDesc(tktSnap.docs.map((d) => d.data() as SupportTicketRecord));
        const exceptions = sortDesc(excSnap.docs.map((d) => d.data() as OperationalExceptionRecord));
        const automationRuns = sortDesc(runsSnap.docs.map((d) => d.data() as AutomationRunRecord));

        // Active booking load per phlebo
        const activeLoad = new Map<string, number>();
        for (const ord of orders) {
          const pid = ord.phlebotomistId ? String(ord.phlebotomistId) : '';
          if (
            pid &&
            [
              OrderStatus.ASSIGNED_TO_PHLEBO,
              OrderStatus.PICKED_UP,
              OrderStatus.IN_TRANSIT,
            ].includes(String(ord.status) as OrderStatus)
          ) {
            activeLoad.set(pid, (activeLoad.get(pid) || 0) + 1);
          }
        }

        // Compute eligible radius matches (1-5 km) for unassigned READY_FOR_PICKUP orders
        const unassignedMatches = orders
          .filter((o) => o.status === OrderStatus.READY_FOR_PICKUP && !o.phlebotomistId)
          .map((o) => {
            const pLoc = (o.pickupLocation || {}) as { latitude?: number; longitude?: number };
            const lat = Number(pLoc.latitude || 19.1438);
            const lon = Number(pLoc.longitude || 72.9378);
            const radiusKm = Math.min(5, Math.max(1, Number(o.broadcastRadiusKm || 3)));
            const candidates = phlebos
              .filter((p) => p.verified !== false && p.status === 'ONLINE')
              .map((p) => {
                const dist =
                  typeof p.latitude === 'number' && typeof p.longitude === 'number'
                    ? Math.round(haversineKm(lat, lon, p.latitude, p.longitude) * 10) / 10
                    : 2.1;
                return {
                  phlebotomistId: String(p.id),
                  name: String(p.name || p.id),
                  distanceKm: dist,
                  activeLoad: activeLoad.get(String(p.id)) || 0,
                  status: String(p.status),
                };
              })
              .filter((c) => c.distanceKm <= radiusKm && c.activeLoad < 4)
              .sort((a, b) => a.distanceKm - b.distanceKm);

            return {
              orderId: String(o.id),
              orderNumber: String(o.orderNumber || o.id),
              smallLabName: String(o.smallLabName || ''),
              targetLabName: String(o.targetLabName || ''),
              radiusKm,
              createdAt: String(o.createdAt || ''),
              eligibleCandidates: candidates,
            };
          });

        return res.json({
          success: true,
          data: {
            sla: slaSnap.data() || {},
            unassignedMatches,
            onboarding,
            verificationReviews,
            training,
            tickets,
            exceptions,
            automationRuns,
            kpis: {
              openOrdersCount: orders.filter(
                (o) =>
                  ![OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REJECTED].includes(
                    String(o.status) as OrderStatus
                  )
              ).length,
              unassignedOrdersCount: unassignedMatches.length,
              onlinePhlebosCount: phlebos.filter((p) => p.status === 'ONLINE').length,
              pendingLabsVerificationCount: labs.filter((l) => l.verificationStatus === 'PENDING')
                .length,
              openExceptionsCount: exceptions.filter((e) => e.status === 'OPEN' || e.status === 'ESCALATED').length,
              openTicketsCount: tickets.filter(
                (t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'ESCALATED'
              ).length,
              pendingOnboardingCount: onboarding.filter((o) => o.stage !== 'ACTIVE' && o.stage !== 'REJECTED')
                .length,
            },
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ===========================================================================
  // AUTOMATED PHLEBO ASSIGNMENT, TIMEOUT, DELAY & CANCELLATION MONITOR
  // ===========================================================================
  router.post(
    '/automation/run-dispatch-monitor',
    requirePermissions('MANAGE_BOOKINGS_DISPATCH'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const startedAt = new Date().toISOString();
      const runId = `RUN-OPS-${Date.now()}`;
      try {
        const [ordersSnap, excSnap, slaSnap] = await Promise.all([
          db.collection('orders').limit(250).get(),
          db.collection('operational_exceptions').get(),
          db.collection('settings').doc('platform').get(),
        ]);

        const slaDelayMin = Number(slaSnap.data()?.autoReassignDelayMinutes || 10);
        const existingDedupKeys = new Set(
          excSnap.docs
            .map((d) => d.data() as OperationalExceptionRecord)
            .filter((e) => e.status !== 'RESOLVED')
            .map((e) => e.dedupKey)
        );

        const nowMs = Date.now();
        let createdAlerts = 0;
        let dedupSkipped = 0;
        let checked = 0;
        const headEmail = await resolveOpsHeadEmail();

        for (const doc of ordersSnap.docs) {
          checked += 1;
          const o = doc.data() as Record<string, unknown>;
          const orderId = doc.id;
          const orderNum = String(o.orderNumber || orderId);
          const status = String(o.status || '');
          const createdMs = o.createdAt ? new Date(String(o.createdAt)).getTime() : nowMs;
          const ageMinutes = Math.floor((nowMs - createdMs) / 60000);

          const maybeCreateException = async (
            type: OperationalExceptionRecord['exceptionType'],
            severity: OperationalExceptionRecord['severity'],
            details: string,
            recommendedAction: string
          ) => {
            const dedupKey = `${type}_${orderId}`;
            if (existingDedupKeys.has(dedupKey)) {
              dedupSkipped += 1;
              return;
            }
            const id = `EXC-${type.slice(0, 5)}-${orderId.replace(/[^A-Z0-9]/gi, '').slice(-8)}`;
            const now = new Date().toISOString();
            const record: OperationalExceptionRecord = {
              id,
              exceptionType: type,
              orderId,
              orderNumber: orderNum,
              ...(o.phlebotomistId ? { phlebotomistId: String(o.phlebotomistId) } : {}),
              smallLabName: o.smallLabName ? String(o.smallLabName) : undefined,
              targetLabName: o.targetLabName ? String(o.targetLabName) : undefined,
              severity,
              status: severity === 'CRITICAL' ? 'ESCALATED' : 'OPEN',
              escalatedToHead: severity === 'CRITICAL',
              details,
              recommendedAction,
              dedupKey,
              createdAt: now,
              updatedAt: now,
            };
            await db.collection('operational_exceptions').doc(id).set(record);
            existingDedupKeys.add(dedupKey);
            createdAlerts += 1;
          };

          if (status === OrderStatus.READY_FOR_PICKUP && !o.phlebotomistId && ageMinutes >= slaDelayMin) {
            await maybeCreateException(
              'UNASSIGNED_TIMEOUT',
              ageMinutes >= slaDelayMin * 3 ? 'CRITICAL' : 'HIGH',
              `Booking ${orderNum} has remained unassigned for ${ageMinutes} min (SLA ${slaDelayMin} min).`,
              'Check 1–5 km online phlebotomist pool or manually assign backup courier.'
            );
          }

          if (
            (status === OrderStatus.ASSIGNED_TO_PHLEBO || status === OrderStatus.PICKED_UP) &&
            ageMinutes >= 90
          ) {
            await maybeCreateException(
              status === OrderStatus.ASSIGNED_TO_PHLEBO ? 'PICKUP_DELAY' : 'DROP_OFF_DELAY',
              'HIGH',
              `Booking ${orderNum} (${status}) elapsed ${ageMinutes} min since creation.`,
              'Contact assigned phlebotomist for ETA and notify receiving lab.'
            );
          }

          if (status === OrderStatus.CANCELLED || status === OrderStatus.REJECTED) {
            await maybeCreateException(
              'CANCELLATION_ALERT',
              'WARNING',
              `Booking ${orderNum} moved to ${status}: ${String(
                o.cancellationReason || o.rejectionReason || 'Reason recorded on order'
              )}`,
              'Audit cancellation / rejection root cause with partner lab or courier.'
            );
          }

          if (o.qualityStatus === 'TEMPERATURE_EXCURSION') {
            await maybeCreateException(
              'TEMPERATURE_EXCURSION',
              'CRITICAL',
              `Cold-chain excursion logged on ${orderNum} (${String(
                o.arrivalTemperatureCelsius ?? 'N/A'
              )}°C).`,
              'Escalate to Operations Quality Executive and review cold-box log.'
            );
          }
        }

        if (createdAlerts > 0) {
          await sendPlatformNotification({
            title: `Operations Exception Monitor: ${createdAlerts} New Alert(s)`,
            message: `Automated dispatch & SLA monitor raised ${createdAlerts} alert(s) across ${checked} bookings.`,
            category: NotificationCategory.SYSTEM_ALERT,
            priority: NotificationPriority.HIGH,
            recipientEmail: headEmail,
            recipientRole: UserRole.ADMIN,
            templateType: 'OPERATIONAL_NOTIFICATION',
            channels: [NotificationChannel.IN_APP],
          });
        }

        const completedAt = new Date().toISOString();
        const runRecord: AutomationRunRecord = {
          id: runId,
          jobKey: `OPS_MONITOR_${startedAt.slice(0, 13)}`,
          automationType: 'PHLEBO_ASSIGNMENT_CHECK',
          departmentId: 'OPERATIONS_PARTNERSHIPS',
          status: 'SUCCESS',
          processedCount: checked,
          alertCount: createdAlerts,
          dedupSkippedCount: dedupSkipped,
          retryCount: 0,
          escalatedToHead: createdAlerts > 0,
          escalatedToEmail: createdAlerts > 0 ? headEmail : undefined,
          triggeredByEmail: req.user?.email || ADMIN_EMAIL,
          summary: `Scanned ${checked} bookings; created ${createdAlerts} alert(s), skipped ${dedupSkipped} active duplicate(s).`,
          startedAt,
          completedAt,
          createdAt: completedAt,
        };
        await db.collection('automation_runs').doc(runId).set(runRecord);

        return res.json({
          success: true,
          data: runRecord,
          message: runRecord.summary,
          timestamp: completedAt,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/exceptions/:id/resolve',
    requireAnyPermission('MANAGE_BOOKINGS_DISPATCH', 'MANAGE_OPERATIONAL_QUALITY'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('operational_exceptions').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError('Operational exception not found.', 404, 'NOT_FOUND'));
        }
        const { status, resolutionNotes, assignPhlebotomistId, assignPhlebotomistName } =
          req.body || {};
        const now = new Date().toISOString();
        const exc = snap.data() as OperationalExceptionRecord;

        if (assignPhlebotomistId && exc.orderId) {
          await db
            .collection('orders')
            .doc(exc.orderId)
            .set(
              {
                phlebotomistId: assignPhlebotomistId,
                ...(assignPhlebotomistName ? { phlebotomistName: assignPhlebotomistName } : {}),
                status: OrderStatus.ASSIGNED_TO_PHLEBO,
                updatedAt: now,
              },
              { merge: true }
            );
        }

        const nextStatus = status === 'ESCALATED' ? 'ESCALATED' : status === 'ACKNOWLEDGED' ? 'ACKNOWLEDGED' : 'RESOLVED';
        await ref.set(
          {
            status: nextStatus,
            ...(nextStatus === 'ESCALATED' ? { escalatedToHead: true } : {}),
            ...(nextStatus === 'RESOLVED' ? { resolvedBy: req.user?.email || ADMIN_EMAIL, resolvedAt: now } : {}),
            ...(resolutionNotes ? { resolutionNotes } : {}),
            updatedAt: now,
          },
          { merge: true }
        );

        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: req.user?.role,
          action: `OPS_EXCEPTION_${nextStatus}`,
          resourceType: 'OPERATIONAL_EXCEPTION',
          resourceId: req.params.id,
          departmentId: 'OPERATIONS_PARTNERSHIPS',
          summary: `Exception ${req.params.id} (${exc.exceptionType}) -> ${nextStatus}`,
          ...getRequestClientMeta(req),
        });

        return res.json({ success: true, data: { id: req.params.id, status: nextStatus }, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ===========================================================================
  // ONBOARDING, HUMAN VERIFICATION, TRAINING & SUPPORT TICKETS
  // ===========================================================================
  router.post(
    '/onboarding',
    requirePermissions('MANAGE_ONBOARDING'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const {
          entityType,
          entityId,
          entityName,
          city,
          zone,
          contactName,
          contactPhone,
          contactEmail,
          stage,
          assignedOwnerName,
          notes,
        } = req.body || {};
        if (!entityName?.trim() || !contactEmail?.trim()) {
          return next(new AppError('entityName and contactEmail are required.', 400, 'BAD_REQUEST'));
        }
        const now = new Date().toISOString();
        const id = `ONB-${Date.now().toString().slice(-6)}`;
        const record: OnboardingRecord = {
          id,
          entityType: entityType || 'SMALL_LAB',
          ...(entityId ? { entityId } : {}),
          entityName: entityName.trim(),
          city: city?.trim() || 'Mumbai',
          ...(zone?.trim() ? { zone: zone.trim() } : {}),
          contactName: contactName?.trim() || entityName.trim(),
          contactPhone: contactPhone?.trim() || '',
          contactEmail: contactEmail.trim().toLowerCase(),
          stage: stage || 'APPLICATION_SUBMITTED',
          verificationStatus: 'PENDING',
          trainingStatus: 'NOT_STARTED',
          ...(assignedOwnerName ? { assignedOwnerName } : {}),
          ...(notes ? { notes } : {}),
          updatedBy: req.user?.email || ADMIN_EMAIL,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection('onboarding_records').doc(id).set(record);
        return res.status(201).json({ success: true, data: record, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.patch(
    '/onboarding/:id',
    requireAnyPermission('MANAGE_ONBOARDING', 'MANAGE_TRAINING', 'MANAGE_VERIFICATION'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('onboarding_records').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError('Onboarding record not found.', 404, 'NOT_FOUND'));
        }
        const body = req.body || {};
        const now = new Date().toISOString();
        await ref.set(
          {
            ...(body.stage ? { stage: body.stage } : {}),
            ...(body.trainingStatus ? { trainingStatus: body.trainingStatus } : {}),
            ...(body.assignedOwnerName !== undefined
              ? { assignedOwnerName: body.assignedOwnerName }
              : {}),
            ...(body.notes !== undefined ? { notes: body.notes } : {}),
            updatedBy: req.user?.email || ADMIN_EMAIL,
            updatedAt: now,
          },
          { merge: true }
        );
        return res.json({ success: true, data: (await ref.get()).data(), timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/verification-reviews',
    requireAnyPermission('MANAGE_ONBOARDING', 'MANAGE_VERIFICATION'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { onboardingId, entityType, entityId, entityName, documentType, storagePath, documentUrl } =
          req.body || {};
        if (!entityId || !entityName || !documentType) {
          return next(
            new AppError('entityId, entityName, and documentType are required.', 400, 'BAD_REQUEST')
          );
        }
        const now = new Date().toISOString();
        const id = `VER-${Date.now().toString().slice(-6)}`;
        const rec: VerificationReviewRecord = {
          id,
          ...(onboardingId ? { onboardingId } : {}),
          entityType: entityType || 'SMALL_LAB',
          entityId,
          entityName,
          documentType,
          ...(storagePath ? { storagePath } : {}),
          ...(documentUrl ? { documentUrl } : {}),
          status: 'PENDING_REVIEW',
          createdAt: now,
          updatedAt: now,
        };
        await db.collection('verification_reviews').doc(id).set(rec);
        return res.status(201).json({ success: true, data: rec, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Human verification approval ONLY (strictly MANAGE_VERIFICATION)
  router.post(
    '/verification-reviews/:id/decision',
    requirePermissions('MANAGE_VERIFICATION'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { decision, reviewNotes } = req.body || {};
        if (!['APPROVED', 'REJECTED', 'RESUBMIT_REQUIRED'].includes(decision)) {
          return next(
            new AppError('decision must be APPROVED, REJECTED, or RESUBMIT_REQUIRED.', 400, 'BAD_REQUEST')
          );
        }
        const ref = db.collection('verification_reviews').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError('Verification review record not found.', 404, 'NOT_FOUND'));
        }
        const review = snap.data() as VerificationReviewRecord;
        const now = new Date().toISOString();

        await ref.set(
          {
            status: decision,
            reviewerEmail: req.user?.email || ADMIN_EMAIL,
            reviewerName: req.user?.displayName || req.user?.email,
            ...(reviewNotes ? { reviewNotes } : {}),
            reviewedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );

        if (review.onboardingId) {
          await db
            .collection('onboarding_records')
            .doc(review.onboardingId)
            .set(
              {
                verificationStatus:
                  decision === 'APPROVED'
                    ? 'VERIFIED'
                    : decision === 'REJECTED'
                    ? 'REJECTED'
                    : 'CHANGES_REQUESTED',
                updatedAt: now,
              },
              { merge: true }
            );
        }

        if (decision === 'APPROVED' && (review.entityType === 'SMALL_LAB' || review.entityType === 'LARGE_LAB')) {
          const labSnap = await db.collection('labs').doc(review.entityId).get();
          if (labSnap.exists) {
            await labSnap.ref.set(
              { verified: true, verificationStatus: 'VERIFIED', updatedAt: now },
              { merge: true }
            );
          }
        } else if (decision === 'APPROVED' && review.entityType === 'PHLEBOTOMIST') {
          const phSnap = await db.collection('phlebotomists').doc(review.entityId).get();
          if (phSnap.exists) {
            await phSnap.ref.set({ verified: true, updatedAt: now }, { merge: true });
          }
        }

        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: req.user?.role,
          action: `VERIFICATION_${decision}`,
          resourceType: 'VERIFICATION_REVIEW',
          resourceId: req.params.id,
          departmentId: 'OPERATIONS_PARTNERSHIPS',
          severity: 'CRITICAL',
          summary: `Human reviewer ${req.user?.email} marked ${review.entityName} (${review.documentType}) -> ${decision}`,
          ...getRequestClientMeta(req),
        });

        return res.json({ success: true, data: (await ref.get()).data(), timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/training',
    requirePermissions('MANAGE_TRAINING'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { traineeType, traineeId, traineeName, traineeEmail, moduleName, status, assessmentScorePct, trainerName } =
          req.body || {};
        if (!traineeName?.trim() || !moduleName?.trim()) {
          return next(new AppError('traineeName and moduleName are required.', 400, 'BAD_REQUEST'));
        }
        const now = new Date().toISOString();
        const id = `TRN-${Date.now().toString().slice(-6)}`;
        const record: TrainingRecord = {
          id,
          traineeType: traineeType || 'PHLEBOTOMIST',
          ...(traineeId ? { traineeId } : {}),
          traineeName: traineeName.trim(),
          ...(traineeEmail ? { traineeEmail: traineeEmail.trim().toLowerCase() } : {}),
          moduleName: moduleName.trim(),
          status: status || 'ASSIGNED',
          ...(typeof assessmentScorePct === 'number' ? { assessmentScorePct } : {}),
          trainerName: trainerName?.trim() || req.user?.displayName || 'Training Executive',
          ...(status === 'COMPLETED' ? { completedAt: now } : {}),
          createdAt: now,
          updatedAt: now,
        };
        await db.collection('training_records').doc(id).set(record);
        return res.status(201).json({ success: true, data: record, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.patch(
    '/training/:id',
    requirePermissions('MANAGE_TRAINING'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('training_records').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError('Training record not found.', 404, 'NOT_FOUND'));
        }
        const body = req.body || {};
        const now = new Date().toISOString();
        await ref.set(
          {
            ...(body.status ? { status: body.status } : {}),
            ...(typeof body.assessmentScorePct === 'number'
              ? { assessmentScorePct: body.assessmentScorePct }
              : {}),
            ...(body.status === 'COMPLETED' ? { completedAt: now } : {}),
            updatedAt: now,
          },
          { merge: true }
        );
        return res.json({ success: true, data: (await ref.get()).data(), timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/tickets',
    requireAnyPermission('MANAGE_SUPPORT_TICKETS', 'VIEW_OPERATIONS_DASHBOARD', 'MANAGE_TECH_ISSUES'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const {
          sourceType,
          sourceId,
          sourceName,
          orderId,
          category,
          priority,
          departmentId,
          subject,
          description,
          assignedToEmail,
          assignedToName,
        } = req.body || {};
        if (!subject?.trim() || !description?.trim()) {
          return next(new AppError('Ticket subject and description are required.', 400, 'BAD_REQUEST'));
        }
        const now = new Date().toISOString();
        const ticketNum = `TKT-${Date.now().toString().slice(-6)}`;
        const ticket: SupportTicketRecord = {
          id: ticketNum,
          ticketNumber: ticketNum,
          sourceType: sourceType || 'INTERNAL',
          ...(sourceId ? { sourceId } : {}),
          sourceName: sourceName?.trim() || 'Partner Support Desk',
          ...(orderId ? { orderId } : {}),
          category: category || 'OTHER',
          priority: priority || 'MEDIUM',
          status: 'OPEN',
          departmentId: departmentId || 'OPERATIONS_PARTNERSHIPS',
          ...(assignedToEmail ? { assignedToEmail: assignedToEmail.trim().toLowerCase() } : {}),
          ...(assignedToName ? { assignedToName } : {}),
          subject: subject.trim(),
          description: description.trim(),
          createdBy: req.user?.email || ADMIN_EMAIL,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection('support_tickets').doc(ticketNum).set(ticket);
        return res.status(201).json({ success: true, data: ticket, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.patch(
    '/tickets/:id',
    requirePermissions('MANAGE_SUPPORT_TICKETS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('support_tickets').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError('Support ticket not found.', 404, 'NOT_FOUND'));
        }
        const body = req.body || {};
        const now = new Date().toISOString();
        const nextStatus = body.status;
        await ref.set(
          {
            ...(nextStatus ? { status: nextStatus } : {}),
            ...(body.priority ? { priority: body.priority } : {}),
            ...(body.assignedToEmail !== undefined
              ? { assignedToEmail: body.assignedToEmail }
              : {}),
            ...(body.assignedToName !== undefined ? { assignedToName: body.assignedToName } : {}),
            ...(nextStatus === 'ESCALATED' ? { escalatedToHead: true } : {}),
            ...(nextStatus === 'RESOLVED' || nextStatus === 'CLOSED'
              ? { resolvedAt: now }
              : {}),
            ...(body.resolutionNotes !== undefined
              ? { resolutionNotes: body.resolutionNotes }
              : {}),
            updatedAt: now,
          },
          { merge: true }
        );
        return res.json({ success: true, data: (await ref.get()).data(), timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  return router;
}
