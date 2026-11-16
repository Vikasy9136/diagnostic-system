import { NextFunction, Response, Router } from 'express';
import {
  type AutomationRunRecord,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  UserRole,
} from './types';
import {
  type LeadRecord,
  type MarketingCampaignRecord,
  type OnboardingRecord,
} from './modulesTypes';
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
} from './rbac';

async function resolveMarketingHeadEmail(): Promise<string> {
  const snap = await db.collection('departments').doc('MARKETING_GROWTH').get();
  const email = snap.exists ? (snap.data()?.headEmail as string | undefined) : undefined;
  return (email || ADMIN_EMAIL).trim().toLowerCase();
}

export function createMarketingRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // Strictly scoped to Marketing & Growth: ZERO patient records, medical reports, KYC, or payment ledgers.
  router.get(
    '/overview',
    requireAnyPermission(
      'VIEW_MARKETING_DASHBOARD',
      'MANAGE_LEADS',
      'MANAGE_CAMPAIGNS',
      'VIEW_GROWTH_ANALYTICS',
      'MANAGE_FIELD_ACQUISITION'
    ),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        await ensureOrganisationBootstrapped(req.user?.email);
        const [leadsSnap, campSnap, labsSnap, runsSnap] = await Promise.all([
          db.collection('leads').limit(300).get(),
          db.collection('campaigns').limit(100).get(),
          db.collection('labs').limit(250).get(),
          db
            .collection('automation_runs')
            .where('departmentId', '==', 'MARKETING_GROWTH')
            .limit(30)
            .get(),
        ]);

        const sortDesc = <T extends { createdAt?: string }>(arr: T[]) =>
          arr.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

        const leads = sortDesc(leadsSnap.docs.map((d) => d.data() as LeadRecord));
        const rawCampaigns = sortDesc(campSnap.docs.map((d) => d.data() as MarketingCampaignRecord));
        const automationRuns = sortDesc(runsSnap.docs.map((d) => d.data() as AutomationRunRecord));

        const campLeadCounts = new Map<string, { total: number; converted: number }>();
        for (const lead of leads) {
          if (!lead.campaignId) continue;
          const entry = campLeadCounts.get(lead.campaignId) || { total: 0, converted: 0 };
          entry.total += 1;
          if (lead.stage === 'CONVERTED_TO_LAB') entry.converted += 1;
          campLeadCounts.set(lead.campaignId, entry);
        }

        const campaigns = rawCampaigns.map((cmp) => {
          const attr = campLeadCounts.get(cmp.id);
          if (!attr) return cmp;
          return {
            ...cmp,
            leadsGenerated: Math.max(Number(cmp.leadsGenerated || 0), attr.total),
            conversionsCount: Math.max(Number(cmp.conversionsCount || 0), attr.converted),
          };
        });

        // Only safe non-sensitive city/tier counts of acquired labs (no private financials)
        const cityMap = new Map<
          string,
          { city: string; leadsCount: number; convertedLeadsCount: number; registeredSmallLabs: number; registeredLargeLabs: number }
        >();

        const touchCity = (rawCity: string) => {
          const city = (rawCity || 'Unspecified').trim();
          if (!cityMap.has(city)) {
            cityMap.set(city, {
              city,
              leadsCount: 0,
              convertedLeadsCount: 0,
              registeredSmallLabs: 0,
              registeredLargeLabs: 0,
            });
          }
          return cityMap.get(city)!;
        };

        for (const lead of leads) {
          const bucket = touchCity(lead.city);
          bucket.leadsCount += 1;
          if (lead.stage === 'CONVERTED_TO_LAB') bucket.convertedLeadsCount += 1;
        }

        for (const doc of labsSnap.docs) {
          const lab = doc.data() as Record<string, unknown>;
          const bucket = touchCity(String(lab.city || 'Mumbai'));
          if (lab.type === 'LARGE_LAB') bucket.registeredLargeLabs += 1;
          else bucket.registeredSmallLabs += 1;
        }

        const totalLeads = leads.length;
        const convertedLeads = leads.filter((l) => l.stage === 'CONVERTED_TO_LAB').length;
        const conversionRatePct =
          totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 1000) / 10 : 0;

        const nowMs = Date.now();
        const dueFollowUpsCount = leads.filter(
          (l) =>
            l.stage !== 'CONVERTED_TO_LAB' &&
            l.stage !== 'LOST' &&
            l.nextFollowUpAt &&
            new Date(l.nextFollowUpAt).getTime() <= nowMs
        ).length;

        return res.json({
          success: true,
          data: {
            leads,
            campaigns,
            automationRuns,
            areaGrowth: Array.from(cityMap.values()).sort((a, b) => b.leadsCount - a.leadsCount),
            kpis: {
              totalLeads,
              convertedLeads,
              conversionRatePct,
              dueFollowUpsCount,
              activeCampaignsCount: campaigns.filter((c) => c.status === 'ACTIVE').length,
              totalCampaignSpendInr: campaigns.reduce((s, c) => s + Number(c.spentInr || 0), 0),
              registeredSmallLabsCount: labsSnap.docs.filter((d) => d.data()?.type !== 'LARGE_LAB')
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

  router.post(
    '/leads',
    requirePermissions('MANAGE_LEADS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const {
          labName,
          leadType,
          contactPerson,
          phone,
          email,
          city,
          zone,
          estimatedMonthlyBookings,
          estimatedMonthlyValueInr,
          stage,
          source,
          campaignId,
          assignedOwnerEmail,
          assignedOwnerName,
          nextFollowUpAt,
          notes,
        } = req.body || {};

        if (!labName?.trim() || !contactPerson?.trim() || !phone?.trim() || !city?.trim()) {
          return next(
            new AppError('labName, contactPerson, phone, and city are required.', 400, 'BAD_REQUEST')
          );
        }

        const now = new Date().toISOString();
        const code = `LD-${Date.now().toString().slice(-6)}`;
        const bookingsEst =
          typeof estimatedMonthlyBookings === 'number' && Number.isFinite(estimatedMonthlyBookings)
            ? Math.max(0, estimatedMonthlyBookings)
            : undefined;
        const computedMonthlyVal =
          typeof estimatedMonthlyValueInr === 'number' && estimatedMonthlyValueInr > 0
            ? estimatedMonthlyValueInr
            : bookingsEst && bookingsEst > 0
            ? Math.round(bookingsEst * 750)
            : undefined;
        const resolvedStage = stage || 'NEW';
        const autoFollowUpIso =
          nextFollowUpAt ||
          (resolvedStage !== 'CONVERTED_TO_LAB' && resolvedStage !== 'LOST'
            ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
            : undefined);
        const deptSnap = await db.collection('departments').doc('MARKETING_GROWTH').get();
        const deptData = deptSnap.exists
          ? (deptSnap.data() as { headEmail?: string; headName?: string })
          : {};
        const resolvedOwnerEmail = (
          assignedOwnerEmail?.trim() ||
          deptData.headEmail ||
          req.user?.email ||
          ADMIN_EMAIL
        )
          .toString()
          .trim()
          .toLowerCase();
        const resolvedOwnerName = (
          assignedOwnerName?.trim() ||
          deptData.headName ||
          req.user?.displayName ||
          'Vishal'
        ).trim();

        const record: LeadRecord = {
          id: code,
          leadCode: code,
          labName: labName.trim(),
          leadType: leadType || 'SMALL_LAB',
          contactPerson: contactPerson.trim(),
          phone: phone.trim(),
          ...(email?.trim() ? { email: email.trim().toLowerCase() } : {}),
          city: city.trim(),
          ...(zone?.trim() ? { zone: zone.trim() } : {}),
          ...(bookingsEst !== undefined ? { estimatedMonthlyBookings: bookingsEst } : {}),
          ...(computedMonthlyVal !== undefined
            ? { estimatedMonthlyValueInr: computedMonthlyVal }
            : {}),
          stage: resolvedStage,
          source: source || 'FIELD_VISIT',
          ...(campaignId ? { campaignId } : {}),
          assignedOwnerEmail: resolvedOwnerEmail,
          assignedOwnerName: resolvedOwnerName,
          ...(autoFollowUpIso ? { nextFollowUpAt: autoFollowUpIso } : {}),
          ...(notes ? { notes } : {}),
          createdBy: req.user?.email || ADMIN_EMAIL,
          createdAt: now,
          updatedAt: now,
        };

        await db.collection('leads').doc(code).set(record);
        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: req.user?.role,
          action: 'MARKETING_LEAD_CREATED',
          resourceType: 'LEAD',
          resourceId: code,
          departmentId: 'MARKETING_GROWTH',
          summary: `Created lead ${record.labName} (${record.city}, stage=${record.stage})`,
          ...getRequestClientMeta(req),
        });

        return res.status(201).json({ success: true, data: record, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.patch(
    '/leads/:id',
    requirePermissions('MANAGE_LEADS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('leads').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError(`Lead not found: ${req.params.id}`, 404, 'NOT_FOUND'));
        }
        const existing = snap.data() as LeadRecord;
        const body = req.body || {};
        const now = new Date().toISOString();
        const nextStage = body.stage || existing.stage;

        const updated: LeadRecord = {
          ...existing,
          ...(body.stage ? { stage: body.stage } : {}),
          ...(body.nextFollowUpAt !== undefined ? { nextFollowUpAt: body.nextFollowUpAt } : {}),
          ...(body.lastContactedAt !== undefined ? { lastContactedAt: body.lastContactedAt } : {}),
          ...(body.assignedOwnerEmail !== undefined
            ? { assignedOwnerEmail: body.assignedOwnerEmail }
            : {}),
          ...(body.assignedOwnerName !== undefined
            ? { assignedOwnerName: body.assignedOwnerName }
            : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          updatedAt: now,
        };

        await ref.set(updated, { merge: true });

        // Hand off cleanly to Operations Onboarding when lead is won!
        if (nextStage === 'CONVERTED_TO_LAB' && existing.stage !== 'CONVERTED_TO_LAB') {
          const onbId = `ONB-${existing.id}`;
          const onbRec: OnboardingRecord = {
            id: onbId,
            entityType: existing.leadType === 'LARGE_LAB' ? 'LARGE_LAB' : 'SMALL_LAB',
            entityName: existing.labName,
            city: existing.city,
            ...(existing.zone ? { zone: existing.zone } : {}),
            contactName: existing.contactPerson,
            contactPhone: existing.phone,
            contactEmail: existing.email || `${existing.id.toLowerCase()}@pending-onboarding.local`,
            stage: 'APPLICATION_SUBMITTED',
            verificationStatus: 'PENDING',
            trainingStatus: 'NOT_STARTED',
            notes: `Handed off from Marketing & Growth (${existing.leadCode})`,
            updatedBy: req.user?.email || ADMIN_EMAIL,
            createdAt: now,
            updatedAt: now,
          };
          await db.collection('onboarding_records').doc(onbId).set(onbRec, { merge: true });
        }

        return res.json({ success: true, data: updated, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/campaigns',
    requirePermissions('MANAGE_CAMPAIGNS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const {
          name,
          channel,
          targetCity,
          status,
          budgetInr,
          spentInr,
          leadsGenerated,
          conversionsCount,
          startDate,
          endDate,
          notes,
        } = req.body || {};

        if (!name?.trim() || !targetCity?.trim()) {
          return next(new AppError('Campaign name and targetCity are required.', 400, 'BAD_REQUEST'));
        }
        const now = new Date().toISOString();
        const id = `CMP-${Date.now().toString().slice(-6)}`;
        const campaign: MarketingCampaignRecord = {
          id,
          name: name.trim(),
          channel: channel || 'FIELD_OUTREACH',
          targetCity: targetCity.trim(),
          status: status || 'ACTIVE',
          budgetInr: Number(budgetInr || 0),
          spentInr: Number(spentInr || 0),
          leadsGenerated: Number(leadsGenerated || 0),
          conversionsCount: Number(conversionsCount || 0),
          startDate: startDate || now.slice(0, 10),
          ...(endDate ? { endDate } : {}),
          ...(notes ? { notes } : {}),
          createdBy: req.user?.email || ADMIN_EMAIL,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection('campaigns').doc(id).set(campaign);
        return res.status(201).json({ success: true, data: campaign, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.patch(
    '/campaigns/:id',
    requirePermissions('MANAGE_CAMPAIGNS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('campaigns').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError('Campaign not found.', 404, 'NOT_FOUND'));
        }
        const body = req.body || {};
        const now = new Date().toISOString();
        await ref.set(
          {
            ...(body.status ? { status: body.status } : {}),
            ...(typeof body.spentInr === 'number' ? { spentInr: body.spentInr } : {}),
            ...(typeof body.leadsGenerated === 'number'
              ? { leadsGenerated: body.leadsGenerated }
              : {}),
            ...(typeof body.conversionsCount === 'number'
              ? { conversionsCount: body.conversionsCount }
              : {}),
            ...(body.notes !== undefined ? { notes: body.notes } : {}),
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

  // Deduplicated Lead Follow-Up Reminders Automation
  router.post(
    '/automation/follow-up-reminders',
    requirePermissions('MANAGE_LEADS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const startedAt = new Date().toISOString();
      const runId = `RUN-MKT-${Date.now()}`;
      try {
        const snap = await db.collection('leads').get();
        const nowMs = Date.now();
        let remindersSent = 0;
        let dedupSkipped = 0;
        const headEmail = await resolveMarketingHeadEmail();

        for (const doc of snap.docs) {
          const lead = doc.data() as LeadRecord;
          if (lead.stage === 'CONVERTED_TO_LAB' || lead.stage === 'LOST') continue;
          if (!lead.nextFollowUpAt) continue;
          const dueMs = new Date(lead.nextFollowUpAt).getTime();
          if (dueMs > nowMs) continue;

          const lastRemMs = lead.followUpReminderSentAt
            ? new Date(lead.followUpReminderSentAt).getTime()
            : 0;
          if (nowMs - lastRemMs < 24 * 60 * 60 * 1000) {
            dedupSkipped += 1;
            continue;
          }

          const targetEmail = lead.assignedOwnerEmail || headEmail;
          await sendPlatformNotification({
            title: `Lead Follow-Up Due: ${lead.labName} (${lead.city})`,
            message: `Stage: ${lead.stage}. Contact: ${lead.contactPerson} (${lead.phone}). Follow-up was scheduled for ${lead.nextFollowUpAt.slice(0, 10)}.`,
            category: NotificationCategory.SYSTEM_ALERT,
            priority: NotificationPriority.NORMAL,
            recipientEmail: targetEmail,
            recipientRole: UserRole.ADMIN,
            templateType: 'OPERATIONAL_NOTIFICATION',
            channels: [NotificationChannel.IN_APP],
          });

          await doc.ref.set(
            { followUpReminderSentAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            { merge: true }
          );
          remindersSent += 1;
        }

        const completedAt = new Date().toISOString();
        const runRecord: AutomationRunRecord = {
          id: runId,
          jobKey: `MKT_FOLLOWUP_${startedAt.slice(0, 10)}`,
          automationType: 'MARKETING_FOLLOWUP_REMINDER',
          departmentId: 'MARKETING_GROWTH',
          status: 'SUCCESS',
          processedCount: remindersSent,
          alertCount: remindersSent,
          dedupSkippedCount: dedupSkipped,
          retryCount: 0,
          triggeredByEmail: req.user?.email || ADMIN_EMAIL,
          summary: `Triggered ${remindersSent} lead follow-up reminder(s); skipped ${dedupSkipped} recent reminder(s).`,
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

  return router;
}

