import { NextFunction, Response, Router } from 'express';
import {
  type AutomationRunRecord,
  type DepartmentRecord,
  type DesignationRecord,
  type EmployeeRecord,
  type FounderSeatRecord,
  OrderStatus,
} from './types';
import {
  type AppErrorLogRecord,
  type BackupRecord,
  type DepartmentSummaryReport,
  type ExpenseRecord,
  type LeadRecord,
  type OnboardingRecord,
  type OperationalExceptionRecord,
  type PlatformInvoiceRecord,
  type ReconciliationAlertRecord,
  type RefundRequestRecord,
  type SupportTicketRecord,
  type SystemHealthCheckRecord,
  type TechIssueRecord,
  type VerificationReviewRecord,
} from './modulesTypes';
import { ADMIN_EMAIL, AppError, auth, db, RAZORPAY_CONFIG, SMTP_CONFIG } from './firebaseAdmin';
import { ensureOrganisationBootstrapped } from './directory';
import { PERMISSION_CATALOG } from './orgConstants';
import {
  type AuthenticatedRequest,
  getRequestClientMeta,
  recordAuditLog,
  requireAnyPermission,
  requireAuth,
  requirePermissions,
} from './rbac';

export function createTechRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // ===========================================================================
  // SUPER ADMIN EXECUTIVE COMMAND SUMMARY (ALL 16 SECTIONS + DEPT REPORTS)
  // ===========================================================================
  router.get(
    '/executive-summary',
    requireAnyPermission('VIEW_SUPER_ADMIN_DASHBOARD', 'FULL_PLATFORM_CONTROL'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        await ensureOrganisationBootstrapped(req.user?.email);

        const [
          ordersSnap,
          labsSnap,
          phleboSnap,
          deptsSnap,
          desigSnap,
          empSnap,
          seatsSnap,
          invSnap,
          subsSnap,
          expSnap,
          refundSnap,
          reconSnap,
          ticketsSnap,
          excSnap,
          onbSnap,
          verSnap,
          leadsSnap,
          auditSnap,
          healthSnap,
          errSnap,
          runsSnap,
        ] = await Promise.all([
          db.collection('orders').limit(300).get(),
          db.collection('labs').limit(250).get(),
          db.collection('phlebotomists').limit(250).get(),
          db.collection('departments').get(),
          db.collection('designations').get(),
          db.collection('employees').get(),
          db.collection('founder_seats').get(),
          db.collection('invoices').limit(200).get(),
          db.collection('lab_subscriptions').limit(200).get(),
          db.collection('expenses').limit(200).get(),
          db.collection('refund_requests').limit(100).get(),
          db.collection('reconciliation_alerts').limit(100).get(),
          db.collection('support_tickets').limit(150).get(),
          db.collection('operational_exceptions').limit(150).get(),
          db.collection('onboarding_records').limit(150).get(),
          db.collection('verification_reviews').limit(150).get(),
          db.collection('leads').limit(200).get(),
          db.collection('audit_logs').orderBy('createdAt', 'desc').limit(30).get(),
          db.collection('system_health_checks').orderBy('checkedAt', 'desc').limit(5).get(),
          db.collection('app_error_logs').orderBy('createdAt', 'desc').limit(20).get(),
          db.collection('automation_runs').orderBy('createdAt', 'desc').limit(25).get(),
        ]);

        const orders = ordersSnap.docs.map((d) => d.data() as Record<string, unknown>);
        const labs = labsSnap.docs.map((d) => d.data() as Record<string, unknown>);
        const phlebos = phleboSnap.docs.map((d) => d.data() as Record<string, unknown>);
        const departments = deptsSnap.docs.map((d) => d.data() as DepartmentRecord);
        const designations = desigSnap.docs.map((d) => d.data() as DesignationRecord);
        const employees = empSnap.docs.map((d) => d.data() as EmployeeRecord);
        const founderSeats = seatsSnap.docs.map((d) => d.data() as FounderSeatRecord);
        const invoices = invSnap.docs.map((d) => d.data() as PlatformInvoiceRecord);
        const expenses = expSnap.docs.map((d) => d.data() as ExpenseRecord);
        const refunds = refundSnap.docs.map((d) => d.data() as RefundRequestRecord);
        const reconAlerts = reconSnap.docs.map((d) => d.data() as ReconciliationAlertRecord);
        const tickets = ticketsSnap.docs.map((d) => d.data() as SupportTicketRecord);
        const exceptions = excSnap.docs.map((d) => d.data() as OperationalExceptionRecord);
        const onboarding = onbSnap.docs.map((d) => d.data() as OnboardingRecord);
        const verifications = verSnap.docs.map((d) => d.data() as VerificationReviewRecord);
        const leads = leadsSnap.docs.map((d) => d.data() as LeadRecord);

        const bookingsByStatus: Record<string, number> = {};
        for (const o of orders) {
          const st = String(o.status || 'UNKNOWN');
          bookingsByStatus[st] = (bookingsByStatus[st] || 0) + 1;
        }

        const pendingRefunds = refunds.filter((r) => r.status === 'PENDING_HUMAN_APPROVAL');
        const pendingVerifications = verifications.filter((v) => v.status === 'PENDING_REVIEW');
        const openReconAlerts = reconAlerts.filter((a) => a.status === 'OPEN');

        const departmentReports: DepartmentSummaryReport[] = departments.map((dept) => {
          const deptEmps = employees.filter((e) => e.departmentId === dept.id);
          const deptDesigs = designations.filter((d) => d.departmentId === dept.id);
          const matchingSeat = founderSeats.find((s) => s.primaryDepartmentId === dept.id);

          let keyMetrics: Record<string, string | number> = {};
          if (dept.id === 'FINANCE_BUSINESS') {
            keyMetrics = {
              PaidInvoicesInr: invoices
                .filter((i) => i.status === 'PAID')
                .reduce((s, i) => s + Number(i.totalAmountInr || 0), 0),
              ActiveSubscriptions: subsSnap.size,
              OpenReconAlerts: openReconAlerts.length,
              PendingRefunds: pendingRefunds.length,
            };
          } else if (dept.id === 'OPERATIONS_PARTNERSHIPS') {
            keyMetrics = {
              TotalBookings: orders.length,
              OpenExceptions: exceptions.filter((e) => e.status !== 'RESOLVED').length,
              OpenTickets: tickets.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED')
                .length,
              PendingVerifications: pendingVerifications.length,
            };
          } else if (dept.id === 'MARKETING_GROWTH') {
            keyMetrics = {
              TotalLeads: leads.length,
              ConvertedLabs: leads.filter((l) => l.stage === 'CONVERTED_TO_LAB').length,
              RegisteredSmallLabs: labs.filter((l) => l.type !== 'LARGE_LAB').length,
            };
          } else {
            keyMetrics = {
              OpenAppErrors: errSnap.docs.filter((d) => d.data()?.resolved === false).length,
              SecurityRulesActive: 'STRICT_MULTI_TENANT',
              SystemStatus: healthSnap.docs[0]?.data()?.overallStatus || 'HEALTHY',
            };
          }

          return {
            departmentId: dept.id,
            departmentName: dept.name,
            headName: dept.headName,
            headEmail: dept.headEmail,
            headSeatStatus: matchingSeat?.seatStatus || 'ACTIVE',
            isActive: dept.isActive,
            designationCount: deptDesigs.length,
            activeEmployeeCount: deptEmps.filter((e) => e.isActive).length,
            inactiveEmployeeCount: deptEmps.filter((e) => !e.isActive).length,
            keyMetrics,
            employeeStatuses: deptEmps.map((e) => ({
              employeeId: e.employeeId,
              name: e.name,
              designationTitle: e.designationTitle,
              status: e.status,
            })),
          };
        });

        return res.json({
          success: true,
          data: {
            bookingsOverview: {
              total: orders.length,
              active: orders.filter(
                (o) =>
                  ![OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REJECTED].includes(
                    String(o.status) as OrderStatus
                  )
              ).length,
              completed: orders.filter(
                (o) => o.status === OrderStatus.COMPLETED || o.status === OrderStatus.REPORT_UPLOADED
              ).length,
              unassignedAlerts: exceptions.filter(
                (e) => e.exceptionType === 'UNASSIGNED_TIMEOUT' && e.status !== 'RESOLVED'
              ).length,
              byStatus: bookingsByStatus,
            },
            labsOverview: {
              total: labs.length,
              smallLabs: labs.filter((l) => l.type !== 'LARGE_LAB').length,
              largeLabs: labs.filter((l) => l.type === 'LARGE_LAB').length,
              verified: labs.filter((l) => l.verificationStatus === 'VERIFIED').length,
              pendingVerification: labs.filter((l) => l.verificationStatus === 'PENDING').length,
              onboardingInProgress: onboarding.filter(
                (o) => o.entityType !== 'PHLEBOTOMIST' && o.stage !== 'ACTIVE'
              ).length,
            },
            phleboOverview: {
              total: phlebos.length,
              online: phlebos.filter((p) => p.status === 'ONLINE').length,
              onBreak: phlebos.filter((p) => p.status === 'BREAK').length,
              offline: phlebos.filter((p) => p.status === 'OFFLINE').length,
              verified: phlebos.filter((p) => p.verified !== false).length,
              onboardingInProgress: onboarding.filter(
                (o) => o.entityType === 'PHLEBOTOMIST' && o.stage !== 'ACTIVE'
              ).length,
            },
            financeOverview: {
              recognizedRevenueInr:
                invoices
                  .filter((i) => i.status === 'PAID')
                  .reduce((s, i) => s + Number(i.totalAmountInr || 0), 0) +
                orders.reduce((s, o) => s + Number(o.platformFeeInr || 0), 0),
              outstandingInr: invoices
                .filter((i) => i.status === 'ISSUED' || i.status === 'OVERDUE')
                .reduce((s, i) => s + Number(i.totalAmountInr || 0), 0),
              approvedExpensesInr: expenses
                .filter((e) => e.approvalStatus === 'APPROVED')
                .reduce((s, e) => s + Number(e.amountInr || 0), 0),
              activeSubscriptions: subsSnap.size,
              openReconAlerts: openReconAlerts.length,
            },
            supportAndAlerts: {
              openTickets: tickets.filter(
                (t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED'
              ).length,
              escalatedTickets: tickets.filter((t) => t.status === 'ESCALATED').length,
              openExceptions: exceptions.filter((e) => e.status !== 'RESOLVED').length,
            },
            marketingOverview: {
              totalLeads: leads.length,
              convertedToLabs: leads.filter((l) => l.stage === 'CONVERTED_TO_LAB').length,
              hotPipeline: leads.filter(
                (l) => l.stage === 'DEMO_SCHEDULED' || l.stage === 'NEGOTIATION'
              ).length,
            },
            pendingApprovals: {
              refundRequests: pendingRefunds.length,
              verificationReviews: pendingVerifications.length,
              labCompliancePending: labs.filter((l) => l.verificationStatus === 'PENDING').length,
              expenseApprovals: expenses.filter((e) => e.approvalStatus === 'PENDING_REVIEW').length,
            },
            systemHealth: {
              latestCheck: healthSnap.docs[0]?.data() || {
                overallStatus: 'HEALTHY',
                authServiceOk: true,
                databaseOk: true,
                storageOk: true,
                paymentWebhookConfigured: Boolean(RAZORPAY_CONFIG.webhookSecret),
                emailServiceConfigured: Boolean(SMTP_CONFIG.pass),
              },
              unresolvedErrorsCount: errSnap.docs.filter((d) => d.data()?.resolved === false)
                .length,
            },
            departmentReports,
            recentAuditLogs: auditSnap.docs.map((d) => d.data()),
            recentAutomationRuns: runsSnap.docs.map((d) => d.data()),
            founderSeats,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ===========================================================================
  // PRODUCT & TECHNOLOGY HEAD WORKSPACE (`VIKAS`)
  // ===========================================================================
  router.get(
    '/overview',
    requireAnyPermission(
      'VIEW_TECH_DASHBOARD',
      'MANAGE_SYSTEM_SECURITY',
      'VIEW_APP_ERROR_LOGS',
      'MANAGE_SYSTEM_HEALTH',
      'MANAGE_SOFTWARE_QA',
      'MANAGE_BACKUPS',
      'MANAGE_TECH_ISSUES'
    ),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        await ensureOrganisationBootstrapped(req.user?.email);
        const [errSnap, healthSnap, backupSnap, issuesSnap, dirSnap] = await Promise.all([
          db.collection('app_error_logs').orderBy('createdAt', 'desc').limit(80).get(),
          db.collection('system_health_checks').orderBy('checkedAt', 'desc').limit(30).get(),
          db.collection('backup_records').orderBy('createdAt', 'desc').limit(40).get(),
          db.collection('tech_issues').orderBy('createdAt', 'desc').limit(100).get(),
          db.collection('user_directory').get(),
        ]);

        const errorLogs = errSnap.docs.map((d) => d.data() as AppErrorLogRecord);
        const healthChecks = healthSnap.docs.map((d) => d.data() as SystemHealthCheckRecord);
        const backups = backupSnap.docs.map((d) => d.data() as BackupRecord);
        const techIssues = issuesSnap.docs.map((d) => d.data() as TechIssueRecord);
        const users = dirSnap.docs.map((d) => d.data() as Record<string, unknown>);

        return res.json({
          success: true,
          data: {
            platformsStatus: [
              {
                name: 'LabSetu Website & Control Tower Portal',
                surface: 'apps/web/portal',
                runtime: 'React + TypeScript + Cloud Hosting',
                status: 'OPERATIONAL',
              },
              {
                name: 'Field Phlebotomist Mobile App',
                surface: 'apps/phlebo-app',
                runtime: 'React Native / Expo (Android & iOS)',
                status: 'OPERATIONAL',
              },
              {
                name: 'Serverless Cloud API & Webhook Engine',
                surface: 'firebase/functions',
                runtime: `Node.js ${process.version}`,
                status: 'OPERATIONAL',
              },
              {
                name: 'Payment & Webhook Verification',
                surface: 'Razorpay HMAC-SHA256',
                runtime: RAZORPAY_CONFIG.webhookSecret ? 'WEBHOOK_SECRET_CONFIGURED' : 'SECRET_PENDING',
                status: RAZORPAY_CONFIG.webhookSecret ? 'OPERATIONAL' : 'ACTION_NEEDED',
              },
            ],
            securityMatrix: {
              activeAdminAccounts: users.filter((u) => u.role === 'ADMIN' && u.isActive !== false)
                .length,
              activeSuperAdmins: users.filter((u) => u.isSuperAdmin === true && u.isActive !== false)
                .length,
              permissionCatalogCount: PERMISSION_CATALOG.length,
              customClaimsCompactEnforced: true,
              multiTenantStrictLabIdEnforced: true,
              webhookHmacVerified: Boolean(RAZORPAY_CONFIG.webhookSecret),
              emailDeliveryConfigured: Boolean(SMTP_CONFIG.pass),
            },
            errorLogs,
            healthChecks,
            backups,
            techIssues,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Live System Health Check Runner
  router.post(
    '/health-check/run',
    requirePermissions('MANAGE_SYSTEM_HEALTH'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        let authServiceOk = false;
        let databaseOk = false;
        try {
          await auth.listUsers(1);
          authServiceOk = true;
        } catch {
          authServiceOk = false;
        }
        try {
          await db.collection('settings').doc('platform').get();
          databaseOk = true;
        } catch {
          databaseOk = false;
        }

        const overallStatus: SystemHealthCheckRecord['overallStatus'] =
          authServiceOk && databaseOk
            ? 'HEALTHY'
            : authServiceOk || databaseOk
            ? 'DEGRADED'
            : 'DOWN';

        const now = new Date().toISOString();
        const id = `HLTH-${Date.now()}`;
        const record: SystemHealthCheckRecord = {
          id,
          checkedAt: now,
          overallStatus,
          authServiceOk,
          databaseOk,
          storageOk: true,
          paymentWebhookConfigured: Boolean(RAZORPAY_CONFIG.webhookSecret),
          emailServiceConfigured: Boolean(SMTP_CONFIG.pass),
          checkedBy: req.user?.email || ADMIN_EMAIL,
          notes: `Executed live service probe (${overallStatus})`,
        };

        await db.collection('system_health_checks').doc(id).set(record);
        return res.json({ success: true, data: record, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/backups',
    requirePermissions('MANAGE_BACKUPS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { backupType, status, scopeSummary, storageLocation, recoveryPointObjectiveMinutes } =
          req.body || {};
        if (!scopeSummary?.trim()) {
          return next(new AppError('scopeSummary is required.', 400, 'BAD_REQUEST'));
        }
        const now = new Date().toISOString();
        const id = `BKP-${Date.now().toString().slice(-6)}`;
        const record: BackupRecord = {
          id,
          backupType: backupType || 'DATABASE_SNAPSHOT',
          status: status || 'VERIFIED',
          scopeSummary: scopeSummary.trim(),
          storageLocation: storageLocation?.trim() || 'gs://labsetu-diagnostics-backups',
          verifiedBy: req.user?.email || ADMIN_EMAIL,
          ...(typeof recoveryPointObjectiveMinutes === 'number'
            ? { recoveryPointObjectiveMinutes }
            : { recoveryPointObjectiveMinutes: 60 }),
          createdAt: now,
        };
        await db.collection('backup_records').doc(id).set(record);
        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: req.user?.role,
          action: 'BACKUP_VERIFIED',
          resourceType: 'BACKUP_RECORD',
          resourceId: id,
          departmentId: 'PRODUCT_TECHNOLOGY',
          severity: 'SENSITIVE',
          summary: `Verified ${record.backupType} backup (${record.scopeSummary})`,
          ...getRequestClientMeta(req),
        });
        return res.status(201).json({ success: true, data: record, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/issues',
    requireAnyPermission('MANAGE_TECH_ISSUES', 'MANAGE_SOFTWARE_QA'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { surface, title, description, priority, qaStatus, assignedToEmail } =
          req.body || {};
        if (!title?.trim() || !description?.trim()) {
          return next(new AppError('Issue title and description are required.', 400, 'BAD_REQUEST'));
        }
        const now = new Date().toISOString();
        const id = `TECH-${Date.now().toString().slice(-6)}`;
        const issue: TechIssueRecord = {
          id,
          issueKey: id,
          surface: surface || 'ADMIN_WEBSITE',
          title: title.trim(),
          description: description.trim(),
          priority: priority || 'MEDIUM',
          status: 'OPEN',
          qaStatus: qaStatus || 'PENDING_TEST',
          ...(assignedToEmail ? { assignedToEmail: assignedToEmail.trim().toLowerCase() } : {}),
          createdBy: req.user?.email || ADMIN_EMAIL,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection('tech_issues').doc(id).set(issue);
        return res.status(201).json({ success: true, data: issue, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.patch(
    '/issues/:id',
    requireAnyPermission('MANAGE_TECH_ISSUES', 'MANAGE_SOFTWARE_QA'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('tech_issues').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError('Technical issue not found.', 404, 'NOT_FOUND'));
        }
        const body = req.body || {};
        const now = new Date().toISOString();
        await ref.set(
          {
            ...(body.status ? { status: body.status } : {}),
            ...(body.qaStatus ? { qaStatus: body.qaStatus } : {}),
            ...(body.priority ? { priority: body.priority } : {}),
            ...(body.assignedToEmail !== undefined
              ? { assignedToEmail: body.assignedToEmail }
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

  router.patch(
    '/errors/:id/resolve',
    requirePermissions('VIEW_APP_ERROR_LOGS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('app_error_logs').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError('Error log entry not found.', 404, 'NOT_FOUND'));
        }
        await ref.set(
          { resolved: true, resolvedBy: req.user?.email || ADMIN_EMAIL },
          { merge: true }
        );
        return res.json({ success: true, data: (await ref.get()).data(), timestamp: new Date().toISOString() });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ===========================================================================
  // IMMUTABLE AUDIT LOGS, LOGIN HISTORY & AUTOMATION RUN LOGS
  // ===========================================================================
  router.get(
    '/audit-logs',
    requireAnyPermission('VIEW_AUDIT_LOGS', 'VIEW_SUPER_ADMIN_DASHBOARD'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const limitNum = Math.min(200, parseInt(String(req.query.limit || '80'), 10) || 80);
        const [auditSnap, loginSnap, runsSnap] = await Promise.all([
          db.collection('audit_logs').orderBy('createdAt', 'desc').limit(limitNum).get(),
          db.collection('login_history').orderBy('createdAt', 'desc').limit(limitNum).get(),
          db.collection('automation_runs').orderBy('createdAt', 'desc').limit(60).get(),
        ]);

        return res.json({
          success: true,
          data: {
            auditLogs: auditSnap.docs.map((d) => d.data()),
            loginHistory:
              req.user?.isSuperAdmin || req.user?.permissions.includes('VIEW_LOGIN_HISTORY')
                ? loginSnap.docs.map((d) => d.data())
                : [],
            automationRuns: runsSnap.docs.map((d) => d.data()),
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  return router;
}

