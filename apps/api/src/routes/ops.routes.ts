import { NextFunction, Response, Router } from 'express';
import {
  type AutomationRunRecord,
  DEFAULT_STARTER_SERVICE_ZONES,
  type OnboardingRecord,
  type OperationalExceptionRecord,
  OrderStatus,
  type ServiceZoneRecord,
  type SupportTicketRecord,
  type TrainingRecord,
  UserRole,
  type VerificationReviewRecord,
  normalizeIdentifierCode,
} from '@diagnostic/shared';
import { config } from '../config/env';
import { initializeFirebase } from '../config/firebase';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, requireRoles } from '../middleware/auth';
import {
  AuthenticatedRequest,
  getRequestClientMeta,
  recordAuditLog,
  requireAnyPermission,
  requirePermissions,
} from '../middleware/rbac';
import { ensureOrganisationBootstrapped } from '../services/user-directory.service';
import { DEV_DATA_STORE } from '../services/devStore';
import { dualDelete, dualGet, dualList, dualSet, recordDualAutomationRun } from '../services/dualCollection';

export const opsRouter = Router();

// Accessible to all signed-in roles (Small Lab, Large Lab, Phlebo, Admin) to inspect active coverage zones
opsRouter.get('/service-zones', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await ensureOrganisationBootstrapped(req.user?.email);
    let zones = await dualList<ServiceZoneRecord>('service_zones');
    if (zones.length === 0) {
      for (const starter of DEFAULT_STARTER_SERVICE_ZONES) {
        await dualSet('service_zones', starter.id, starter);
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

opsRouter.use(requireAuth, requireRoles(UserRole.ADMIN));

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

opsRouter.get(
  '/overview',
  requireAnyPermission(
    'VIEW_OPERATIONS_DASHBOARD',
    'MANAGE_BOOKINGS_DISPATCH',
    'MANAGE_ONBOARDING',
    'MANAGE_VERIFICATION',
    'MANAGE_TRAINING',
    'MANAGE_SUPPORT_TICKETS',
    'MANAGE_OPERATIONAL_QUALITY',
    'VIEW_SUPER_ADMIN_DASHBOARD'
  ),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await ensureOrganisationBootstrapped(req.user?.email);

      const { db, isMockMode } = initializeFirebase();
      let orders: Array<Record<string, any>> = [];
      let phlebos: Array<Record<string, any>> = [];
      let labs: Array<Record<string, any>> = [];
      let sla: Record<string, unknown> = DEV_DATA_STORE.platformSettings;
      let automationRuns: AutomationRunRecord[] = DEV_DATA_STORE.automationRuns.filter(
        (r) => r.departmentId === 'OPERATIONS_PARTNERSHIPS'
      );

      if (db && !isMockMode) {
        const [ordersSnap, phleboSnap, labsSnap, slaSnap, runsSnap] = await Promise.all([
          db.collection('orders').limit(250).get(),
          db.collection('phlebotomists').limit(150).get(),
          db.collection('labs').limit(150).get(),
          db.collection('settings').doc('platform').get(),
          db.collection('automation_runs').where('departmentId', '==', 'OPERATIONS_PARTNERSHIPS').limit(30).get(),
        ]);
        orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        phlebos = phleboSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        labs = labsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        sla = (slaSnap.data() as Record<string, unknown>) || sla;
        automationRuns = runsSnap.docs.map((d) => d.data() as AutomationRunRecord);
      }

      const [onboarding, rawVerification, training, tickets, exceptions] = await Promise.all([
        dualList<OnboardingRecord>('onboarding_records'),
        dualList<VerificationReviewRecord>('verification_reviews'),
        dualList<TrainingRecord>('training_records'),
        dualList<SupportTicketRecord>('support_tickets'),
        dualList<OperationalExceptionRecord>('operational_exceptions'),
      ]);

      const canViewIdentity =
        Boolean(req.user?.isSuperAdmin) ||
        Boolean(req.user?.permissions.includes('VIEW_IDENTITY_DOCS'));
      const verificationReviews = rawVerification.map((rec) =>
        canViewIdentity ? rec : { ...rec, documentUrl: undefined, storagePath: undefined }
      );

      const activeLoad = new Map<string, number>();
      for (const ord of orders) {
        const pid = ord.phlebotomistId ? String(ord.phlebotomistId) : '';
        if (
          pid &&
          [OrderStatus.ASSIGNED_TO_PHLEBO, OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT].includes(
            String(ord.status) as OrderStatus
          )
        ) {
          activeLoad.set(pid, (activeLoad.get(pid) || 0) + 1);
        }
      }

      const unassignedMatches = orders
        .filter((o) => o.status === OrderStatus.READY_FOR_PICKUP && !o.phlebotomistId)
        .map((o) => {
          const pLoc = (o.pickupLocation || {}) as { latitude?: number; longitude?: number };
          const lat = Number(pLoc.latitude || 19.1438);
          const lon = Number(pLoc.longitude || 72.9378);
          const radiusKm = Math.min(5, Math.max(1, Number(o.broadcastRadiusKm || 3)));
          const candidates = phlebos
            .filter((p) => p.verified !== false && p.status === 'ONLINE')
            .map((p) => ({
              phlebotomistId: String(p.id),
              name: String(p.name || p.id),
              distanceKm:
                typeof p.latitude === 'number' && typeof p.longitude === 'number'
                  ? Math.round(haversineKm(lat, lon, p.latitude, p.longitude) * 10) / 10
                  : 2.1,
              activeLoad: activeLoad.get(String(p.id)) || 0,
              status: String(p.status),
            }))
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

      const sortDesc = <T extends { createdAt?: string }>(arr: T[]) =>
        arr.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      return res.json({
        success: true,
        data: {
          sla,
          unassignedMatches,
          onboarding: sortDesc(onboarding),
          verificationReviews: sortDesc(verificationReviews),
          training: sortDesc(training),
          tickets: sortDesc(tickets),
          exceptions: sortDesc(exceptions),
          automationRuns: automationRuns.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
          kpis: {
            openOrdersCount: orders.filter(
              (o) =>
                ![OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REJECTED].includes(
                  String(o.status) as OrderStatus
                )
            ).length,
            unassignedOrdersCount: unassignedMatches.length,
            onlinePhlebosCount: phlebos.filter((p) => p.status === 'ONLINE').length,
            pendingLabsVerificationCount: labs.filter((l) => l.verificationStatus === 'PENDING').length,
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

opsRouter.post(
  '/automation/run-dispatch-monitor',
  requirePermissions('MANAGE_BOOKINGS_DISPATCH'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startedAt = new Date().toISOString();
    const runId = `RUN-OPS-${Date.now()}`;
    try {
      const { db, isMockMode } = initializeFirebase();
      const existingExceptions = await dualList<OperationalExceptionRecord>('operational_exceptions');
      const existingByKey = new Set(
        existingExceptions.filter((e) => e.status !== 'RESOLVED').map((e) => e.dedupKey || `${e.exceptionType}_${e.orderId}`)
      );

      let orders: Array<Record<string, any>> = [];
      let pickupTimeoutMs = 15 * 60 * 1000;
      let maxTemp = 8;
      let minTemp = 2;

      if (db && !isMockMode) {
        const [ordersSnap, slaSnap] = await Promise.all([
          db.collection('orders').limit(250).get(),
          db.collection('settings').doc('platform').get(),
        ]);
        orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const sla = slaSnap.data() || {};
        pickupTimeoutMs = Number(sla.pickupTimeoutMinutes || sla.statPickupSlaMinutes || 15) * 60 * 1000;
        if (sla.temperatureRangeCelsius) {
          maxTemp = Number(sla.temperatureRangeCelsius.max ?? 8);
          minTemp = Number(sla.temperatureRangeCelsius.min ?? 2);
        }
      }

      const nowMs = Date.now();
      let created = 0;

      for (const ord of orders) {
        const orderId = String(ord.id);
        const orderNum = String(ord.orderNumber || ord.id);
        const createdAtMs = new Date(String(ord.createdAt || startedAt)).getTime();
        const ageMs = Number.isFinite(createdAtMs) ? nowMs - createdAtMs : 0;

        if (ord.status === OrderStatus.READY_FOR_PICKUP && !ord.phlebotomistId && ageMs > pickupTimeoutMs) {
          const dedupKey = `UNASSIGNED_TIMEOUT_${orderId}`;
          if (!existingByKey.has(dedupKey)) {
            const excId = `EXC-${orderId}-UNASSIGNED`;
            const rec: OperationalExceptionRecord = {
              id: excId,
              exceptionType: 'UNASSIGNED_TIMEOUT',
              orderId,
              orderNumber: orderNum,
              ...(ord.smallLabName ? { smallLabName: String(ord.smallLabName) } : {}),
              ...(ord.targetLabName ? { targetLabName: String(ord.targetLabName) } : {}),
              severity: ord.priority === 'STAT_CRITICAL' ? 'CRITICAL' : 'HIGH',
              status: 'OPEN',
              details: `Order ${orderNum} (${ord.smallLabName || 'Collection Lab'}) has not been accepted within ${Math.round(pickupTimeoutMs / 60000)} mins.`,
              recommendedAction: 'Check 1-5 km online phlebotomist pool or manually assign backup courier.',
              dedupKey,
              escalatedToHead: false,
              createdAt: startedAt,
              updatedAt: startedAt,
            };
            await dualSet('operational_exceptions', excId, rec);
            existingByKey.add(dedupKey);
            created += 1;
          }
        }

        const temp = typeof ord.arrivalTemperatureCelsius === 'number' ? ord.arrivalTemperatureCelsius : null;
        if (temp !== null && (temp > maxTemp || temp < minTemp)) {
          const dedupKey = `TEMPERATURE_EXCURSION_${orderId}`;
          if (!existingByKey.has(dedupKey)) {
            const excId = `EXC-${orderId}-TEMP`;
            const rec: OperationalExceptionRecord = {
              id: excId,
              exceptionType: 'TEMPERATURE_EXCURSION',
              orderId,
              orderNumber: orderNum,
              severity: 'CRITICAL',
              status: 'ESCALATED',
              details: `Cold-chain alert: ${orderNum} temperature ${temp}°C outside ${minTemp}–${maxTemp}°C range.`,
              recommendedAction: 'Escalate to Operations Quality Executive and review cold-box log.',
              dedupKey,
              escalatedToHead: true,
              createdAt: startedAt,
              updatedAt: startedAt,
            };
            await dualSet('operational_exceptions', excId, rec);
            existingByKey.add(dedupKey);
            created += 1;
          }
        }
      }

      const completedAt = new Date().toISOString();
      const summary = `Monitored ${orders.length} order(s); flagged ${created} new operational exception(s).`;
      const runRecord: AutomationRunRecord = {
        id: runId,
        jobKey: `OPS_MONITOR_${startedAt.slice(0, 13)}`,
        automationType: 'PHLEBO_ASSIGNMENT_CHECK',
        departmentId: 'OPERATIONS_PARTNERSHIPS',
        status: 'SUCCESS',
        processedCount: orders.length,
        alertCount: created,
        dedupSkippedCount: 0,
        retryCount: 0,
        escalatedToHead: created > 0,
        triggeredByEmail: req.user?.email || config.admin.email,
        summary,
        startedAt,
        completedAt,
        createdAt: completedAt,
      };
      await recordDualAutomationRun(runRecord);

      return res.json({
        success: true,
        data: runRecord,
        message: summary,
        timestamp: completedAt,
      });
    } catch (err) {
      return next(err);
    }
  }
);

opsRouter.post(
  '/exceptions/:id/resolve',
  requireAnyPermission('MANAGE_BOOKINGS_DISPATCH', 'MANAGE_OPERATIONAL_QUALITY'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const existing = await dualGet<OperationalExceptionRecord>('operational_exceptions', req.params.id);
      if (!existing) return next(new AppError('Exception not found.', 404, 'NOT_FOUND'));
      const now = new Date().toISOString();
      const { status, escalate, resolutionNotes, notes, assignPhlebotomistId, assignPhlebotomistName } =
        req.body || {};

      if (assignPhlebotomistId && existing.orderId) {
        const { db, isMockMode } = initializeFirebase();
        if (db && !isMockMode) {
          await db.collection('orders').doc(existing.orderId).set(
            {
              phlebotomistId: assignPhlebotomistId,
              ...(assignPhlebotomistName ? { phlebotomistName: assignPhlebotomistName } : {}),
              status: OrderStatus.ASSIGNED_TO_PHLEBO,
              updatedAt: now,
            },
            { merge: true }
          );
        }
      }

      const nextStatus: OperationalExceptionRecord['status'] =
        status === 'ESCALATED' || escalate
          ? 'ESCALATED'
          : status === 'ACKNOWLEDGED'
          ? 'ACKNOWLEDGED'
          : 'RESOLVED';
      const updated: OperationalExceptionRecord = {
        ...existing,
        status: nextStatus,
        escalatedToHead: nextStatus === 'ESCALATED' ? true : existing.escalatedToHead,
        ...(nextStatus === 'RESOLVED' ? { resolvedBy: req.user?.email || config.admin.email, resolvedAt: now } : {}),
        resolutionNotes: resolutionNotes || notes || 'Resolved by Operations team',
        updatedAt: now,
      };
      await dualSet('operational_exceptions', req.params.id, updated, true);
      return res.json({ success: true, data: updated, message: 'Exception updated.', timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

opsRouter.post(
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
        contactEmail,
        contactPhone,
        assignedOwnerName,
        stage,
        notes,
      } = req.body || {};
      if (!entityName?.trim() || !contactEmail?.trim()) {
        return next(new AppError('entityName and contactEmail are required.', 400, 'BAD_REQUEST'));
      }
      const now = new Date().toISOString();
      const id = `ONB-${Date.now().toString().slice(-6)}`;
      const rec: OnboardingRecord = {
        id,
        entityType: (entityType || 'SMALL_LAB') as OnboardingRecord['entityType'],
        ...(entityId ? { entityId: String(entityId) } : {}),
        entityName: entityName.trim(),
        city: city?.trim() || 'Mumbai',
        ...(zone ? { zone: String(zone).trim() } : {}),
        contactName: contactName?.trim() || entityName.trim(),
        contactPhone: contactPhone?.trim() || '',
        contactEmail: String(contactEmail).trim().toLowerCase(),
        stage: (stage || 'APPLICATION_SUBMITTED') as OnboardingRecord['stage'],
        verificationStatus: 'PENDING',
        trainingStatus: 'NOT_STARTED',
        ...(assignedOwnerName ? { assignedOwnerName: String(assignedOwnerName) } : {}),
        ...(notes ? { notes: String(notes) } : {}),
        updatedBy: req.user?.email || config.admin.email,
        createdAt: now,
        updatedAt: now,
      };
      await dualSet('onboarding_records', id, rec);
      return res.status(201).json({ success: true, data: rec, message: 'Onboarding record created.', timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

opsRouter.patch(
  '/onboarding/:id',
  requireAnyPermission('MANAGE_ONBOARDING', 'MANAGE_TRAINING', 'MANAGE_VERIFICATION'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const existing = await dualGet<OnboardingRecord>('onboarding_records', req.params.id);
      if (!existing) return next(new AppError('Onboarding record not found.', 404, 'NOT_FOUND'));
      const now = new Date().toISOString();
      const updated: OnboardingRecord = {
        ...existing,
        ...(req.body?.stage ? { stage: req.body.stage } : {}),
        ...(req.body?.trainingStatus ? { trainingStatus: req.body.trainingStatus } : {}),
        ...(req.body?.assignedOwnerName !== undefined
          ? { assignedOwnerName: req.body.assignedOwnerName }
          : {}),
        ...(req.body?.notes !== undefined ? { notes: String(req.body.notes) } : {}),
        updatedBy: req.user?.email || config.admin.email,
        updatedAt: now,
      };
      await dualSet('onboarding_records', req.params.id, updated, true);
      return res.json({ success: true, data: updated, message: 'Onboarding record updated.', timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

async function handleCreateVerificationReview(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { onboardingId, entityType, entityId, entityName, documentType, documentUrl, storagePath } =
      req.body || {};
    if (!entityId || !entityName || !documentType) {
      return next(
        new AppError('entityId, entityName, and documentType are required.', 400, 'BAD_REQUEST')
      );
    }
    const allowedDocs: VerificationReviewRecord['documentType'][] = [
      'NABL_CERTIFICATE',
      'LAB_REGISTRATION',
      'AADHAAR_PAN_KYC',
      'PHLEBO_DL_ID',
      'COLD_BOX_AUDIT',
    ];
    const resolvedDoc = allowedDocs.includes(documentType)
      ? (documentType as VerificationReviewRecord['documentType'])
      : 'LAB_REGISTRATION';
    const now = new Date().toISOString();
    const id = `VER-${Date.now().toString().slice(-6)}`;
    const rec: VerificationReviewRecord = {
      id,
      ...(onboardingId ? { onboardingId: String(onboardingId) } : {}),
      entityType: (entityType || 'SMALL_LAB') as VerificationReviewRecord['entityType'],
      entityId: String(entityId),
      entityName: String(entityName).trim(),
      documentType: resolvedDoc,
      ...(documentUrl ? { documentUrl: String(documentUrl) } : {}),
      ...(storagePath ? { storagePath: String(storagePath) } : {}),
      status: 'PENDING_REVIEW',
      createdAt: now,
      updatedAt: now,
    };
    await dualSet('verification_reviews', id, rec);
    return res.status(201).json({ success: true, data: rec, message: 'Verification review queued.', timestamp: now });
  } catch (err) {
    return next(err);
  }
}

opsRouter.post('/verification-reviews', requireAnyPermission('MANAGE_ONBOARDING', 'MANAGE_VERIFICATION'), handleCreateVerificationReview);
opsRouter.post('/verifications', requireAnyPermission('MANAGE_ONBOARDING', 'MANAGE_VERIFICATION'), handleCreateVerificationReview);

async function handleDecideVerificationReview(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const decisionRaw = req.body?.decision || req.body?.status;
    if (!['APPROVED', 'REJECTED', 'RESUBMIT_REQUIRED'].includes(String(decisionRaw))) {
      return next(
        new AppError('decision must be APPROVED, REJECTED, or RESUBMIT_REQUIRED.', 400, 'BAD_REQUEST')
      );
    }
    const decision = decisionRaw as VerificationReviewRecord['status'];
    const existing = await dualGet<VerificationReviewRecord>('verification_reviews', req.params.id);
    if (!existing) return next(new AppError('Verification review not found.', 404, 'NOT_FOUND'));
    const now = new Date().toISOString();
    const updated: VerificationReviewRecord = {
      ...existing,
      status: decision,
      reviewerEmail: req.user?.email || config.admin.email,
      reviewerName: req.user?.displayName || req.user?.email,
      reviewedAt: now,
      reviewNotes: req.body?.reviewNotes
        ? String(req.body.reviewNotes)
        : req.body?.notes
        ? String(req.body.notes)
        : `Human verification ${decision}`,
      updatedAt: now,
    };
    await dualSet('verification_reviews', req.params.id, updated, true);

    const { db, isMockMode } = initializeFirebase();
    if (existing.onboardingId && db && !isMockMode) {
      await db
        .collection('onboarding_records')
        .doc(existing.onboardingId)
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
    if (db && !isMockMode && decision === 'APPROVED' && (existing.entityType === 'SMALL_LAB' || existing.entityType === 'LARGE_LAB')) {
      await db.collection('labs').doc(existing.entityId).set(
        { verified: true, verificationStatus: 'VERIFIED', updatedAt: now },
        { merge: true }
      );
    } else if (db && !isMockMode && decision === 'APPROVED' && existing.entityType === 'PHLEBOTOMIST') {
      await db.collection('phlebotomists').doc(existing.entityId).set(
        { verified: true, updatedAt: now },
        { merge: true }
      );
    }

    await recordAuditLog({
      actorUid: req.user?.uid,
      actorEmail: req.user?.email,
      actorRole: req.user?.role,
      action: `VERIFICATION_${decision}`,
      resourceType: 'VERIFICATION_REVIEW',
      resourceId: req.params.id,
      departmentId: 'OPERATIONS_PARTNERSHIPS',
      severity: 'CRITICAL',
      summary: `${decision} KYC/accreditation for ${existing.entityName} (${existing.entityType})`,
      ...getRequestClientMeta(req),
    });

    return res.json({ success: true, data: updated, message: `Verification ${decision.toLowerCase()}.`, timestamp: now });
  } catch (err) {
    return next(err);
  }
}

opsRouter.post('/verification-reviews/:id/decision', requirePermissions('MANAGE_VERIFICATION'), handleDecideVerificationReview);
opsRouter.post('/verifications/:id/decision', requirePermissions('MANAGE_VERIFICATION'), handleDecideVerificationReview);

opsRouter.post(
  '/training',
  requirePermissions('MANAGE_TRAINING'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        traineeType,
        traineeId,
        traineeName,
        traineeEmail,
        moduleName,
        status,
        assessmentScorePct,
        trainerName,
      } = req.body || {};
      if (!traineeName?.trim() || !moduleName?.trim()) {
        return next(new AppError('traineeName and moduleName are required.', 400, 'BAD_REQUEST'));
      }
      const now = new Date().toISOString();
      const id = `TRN-${Date.now().toString().slice(-6)}`;
      const rec: TrainingRecord = {
        id,
        traineeType: (traineeType || 'PHLEBOTOMIST') as TrainingRecord['traineeType'],
        ...(traineeId ? { traineeId: String(traineeId) } : {}),
        traineeName: traineeName.trim(),
        ...(traineeEmail ? { traineeEmail: String(traineeEmail).toLowerCase() } : {}),
        moduleName: moduleName.trim(),
        status: (status || 'ASSIGNED') as TrainingRecord['status'],
        ...(typeof assessmentScorePct === 'number' ? { assessmentScorePct } : {}),
        trainerName: trainerName?.trim() || req.user?.displayName || 'Training Executive',
        ...(status === 'COMPLETED' ? { completedAt: now } : {}),
        createdAt: now,
        updatedAt: now,
      };
      await dualSet('training_records', id, rec);
      return res.status(201).json({ success: true, data: rec, message: 'Training record saved.', timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

opsRouter.patch(
  '/training/:id',
  requirePermissions('MANAGE_TRAINING'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const existing = await dualGet<TrainingRecord>('training_records', req.params.id);
      if (!existing) return next(new AppError('Training record not found.', 404, 'NOT_FOUND'));
      const now = new Date().toISOString();
      const nextStatus = req.body?.status || existing.status;
      const updated: TrainingRecord = {
        ...existing,
        status: nextStatus,
        ...(typeof req.body?.assessmentScorePct === 'number'
          ? { assessmentScorePct: req.body.assessmentScorePct }
          : {}),
        ...(nextStatus === 'COMPLETED' ? { completedAt: existing.completedAt || now } : {}),
        updatedAt: now,
      };
      await dualSet('training_records', req.params.id, updated, true);
      return res.json({ success: true, data: updated, message: 'Training updated.', timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

opsRouter.post(
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
        sourceType: (sourceType || 'INTERNAL') as SupportTicketRecord['sourceType'],
        ...(sourceId ? { sourceId: String(sourceId) } : {}),
        sourceName: sourceName?.trim() || 'Partner Support Desk',
        ...(orderId ? { orderId: String(orderId) } : {}),
        category: (category || 'OTHER') as SupportTicketRecord['category'],
        priority: (priority || 'MEDIUM') as SupportTicketRecord['priority'],
        status: 'OPEN',
        departmentId: departmentId || 'OPERATIONS_PARTNERSHIPS',
        ...(assignedToEmail ? { assignedToEmail: String(assignedToEmail).toLowerCase() } : {}),
        ...(assignedToName ? { assignedToName: String(assignedToName) } : {}),
        subject: subject.trim(),
        description: description.trim(),
        createdBy: req.user?.email || config.admin.email,
        createdAt: now,
        updatedAt: now,
      };
      await dualSet('support_tickets', ticketNum, ticket);
      return res.status(201).json({ success: true, data: ticket, message: `Support ticket ${ticket.ticketNumber} created.`, timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

opsRouter.patch(
  '/tickets/:id',
  requirePermissions('MANAGE_SUPPORT_TICKETS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const existing = await dualGet<SupportTicketRecord>('support_tickets', req.params.id);
      if (!existing) return next(new AppError('Support ticket not found.', 404, 'NOT_FOUND'));
      const now = new Date().toISOString();
      const nextStatus = req.body?.status || existing.status;
      const updated: SupportTicketRecord = {
        ...existing,
        status: nextStatus,
        ...(req.body?.priority ? { priority: req.body.priority } : {}),
        ...(req.body?.assignedToEmail !== undefined ? { assignedToEmail: req.body.assignedToEmail } : {}),
        ...(req.body?.assignedToName !== undefined ? { assignedToName: req.body.assignedToName } : {}),
        ...(nextStatus === 'ESCALATED' ? { escalatedToHead: true } : {}),
        ...(req.body?.resolutionNotes !== undefined
          ? { resolutionNotes: String(req.body.resolutionNotes) }
          : {}),
        ...(nextStatus === 'RESOLVED' || nextStatus === 'CLOSED' ? { resolvedAt: now } : {}),
        updatedAt: now,
      };
      await dualSet('support_tickets', req.params.id, updated, true);
      return res.json({ success: true, data: updated, message: 'Support ticket updated.', timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

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

opsRouter.post(
  '/service-zones',
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
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return next(new AppError('Valid centerLatitude and centerLongitude are required.', 400, 'BAD_REQUEST'));
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
        launchPhase:
          (['PILOT', 'EXPANSION', 'FULL_CITY', 'PAUSED'].includes(String(launchPhase))
            ? launchPhase
            : 'EXPANSION') as ServiceZoneRecord['launchPhase'],
        isActive: isActive !== false && launchPhase !== 'PAUSED',
        ...(notes?.trim() ? { notes: String(notes).trim() } : {}),
        createdBy: req.user?.email || config.admin.email,
        createdAt: now,
        updatedAt: now,
      };

      await dualSet('service_zones', docId, zone);
      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
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

opsRouter.patch(
  '/service-zones/:id',
  requireAnyPermission(
    'MANAGE_OPERATIONAL_QUALITY',
    'MANAGE_BOOKINGS_DISPATCH',
    'MANAGE_LAB_PARTNERSHIPS'
  ),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const existing = await dualGet<ServiceZoneRecord>('service_zones', req.params.id);
      if (!existing) {
        return next(new AppError(`Service zone not found: ${req.params.id}`, 404, 'NOT_FOUND'));
      }
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
        updatedBy: req.user?.email || config.admin.email,
        updatedAt: now,
      };

      await dualSet('service_zones', req.params.id, updated, true);
      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
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

opsRouter.delete(
  '/service-zones/:id',
  requireAnyPermission('MANAGE_OPERATIONAL_QUALITY', 'MANAGE_BOOKINGS_DISPATCH'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const existing = await dualGet<ServiceZoneRecord>('service_zones', req.params.id);
      if (!existing) {
        return next(new AppError(`Service zone not found: ${req.params.id}`, 404, 'NOT_FOUND'));
      }
      await dualDelete('service_zones', req.params.id);
      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
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

