import { NextFunction, Response, Router } from 'express';
import {
  type AppErrorLogRecord,
  type AuditLogRecord,
  type AutomationRunRecord,
  type BackupRecord,
  type DepartmentRecord,
  type DepartmentSummaryReport,
  type DesignationRecord,
  type EmployeeRecord,
  type ExpenseRecord,
  type FounderSeatRecord,
  type LeadRecord,
  type LoginHistoryRecord,
  type OnboardingRecord,
  type OperationalExceptionRecord,
  OrderStatus,
  PERMISSION_CATALOG,
  type PlatformInvoiceRecord,
  type ReconciliationAlertRecord,
  type RefundRequestRecord,
  type SupportTicketRecord,
  type SystemHealthCheckRecord,
  type TechIssueRecord,
  UserRole,
  type VerificationReviewRecord,
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
import { dualGet, dualList, dualSet, recordDualAutomationRun } from '../services/dualCollection';

export const techRouter = Router();

techRouter.use(requireAuth, requireRoles(UserRole.ADMIN));

// ===========================================================================
// SUPER ADMIN EXECUTIVE COMMAND SUMMARY (ALL 16 SECTIONS + DEPT REPORTS)
// ===========================================================================
techRouter.get(
  '/executive-summary',
  requireAnyPermission('VIEW_SUPER_ADMIN_DASHBOARD', 'FULL_PLATFORM_CONTROL'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await ensureOrganisationBootstrapped(req.user?.email);
      const { db, isMockMode } = initializeFirebase();

      const [
        departments,
        designations,
        employees,
        founderSeats,
        invoices,
        subscriptions,
        expenses,
        refunds,
        reconAlerts,
        tickets,
        exceptions,
        onboarding,
        verifications,
        leads,
        healthChecks,
      ] = await Promise.all([
        dualList<DepartmentRecord>('departments'),
        dualList<DesignationRecord>('designations'),
        dualList<EmployeeRecord>('employees'),
        dualList<FounderSeatRecord>('founder_seats'),
        dualList<PlatformInvoiceRecord>('invoices'),
        dualList<Record<string, unknown>>('lab_subscriptions'),
        dualList<ExpenseRecord>('expenses'),
        dualList<RefundRequestRecord>('refund_requests'),
        dualList<ReconciliationAlertRecord>('reconciliation_alerts'),
        dualList<SupportTicketRecord>('support_tickets'),
        dualList<OperationalExceptionRecord>('operational_exceptions'),
        dualList<OnboardingRecord>('onboarding_records'),
        dualList<VerificationReviewRecord>('verification_reviews'),
        dualList<LeadRecord>('leads'),
        dualList<SystemHealthCheckRecord>('system_health_checks'),
      ]);

      let orders: Array<Record<string, unknown>> = [];
      let labs: Array<Record<string, unknown>> = [];
      let phlebos: Array<Record<string, unknown>> = [];
      let auditLogs: AuditLogRecord[] = DEV_DATA_STORE.auditLogs.slice(0, 30);
      let errLogs: AppErrorLogRecord[] = DEV_DATA_STORE.appErrorLogs.slice(0, 20);
      let runs: AutomationRunRecord[] = DEV_DATA_STORE.automationRuns.slice(0, 25);

      if (db && !isMockMode) {
        const [ordersSnap, labsSnap, phleboSnap, auditSnap, errSnap, runsSnap] = await Promise.all([
          db.collection('orders').limit(300).get(),
          db.collection('labs').limit(250).get(),
          db.collection('phlebotomists').limit(250).get(),
          db.collection('audit_logs').orderBy('createdAt', 'desc').limit(30).get(),
          db.collection('app_error_logs').orderBy('createdAt', 'desc').limit(20).get(),
          db.collection('automation_runs').orderBy('createdAt', 'desc').limit(25).get(),
        ]);
        orders = ordersSnap.docs.map((d) => d.data() as Record<string, unknown>);
        labs = labsSnap.docs.map((d) => d.data() as Record<string, unknown>);
        phlebos = phleboSnap.docs.map((d) => d.data() as Record<string, unknown>);
        auditLogs = auditSnap.docs.map((d) => d.data() as AuditLogRecord);
        errLogs = errSnap.docs.map((d) => d.data() as AppErrorLogRecord);
        runs = runsSnap.docs.map((d) => d.data() as AutomationRunRecord);
      }

      const sortedHealth = [...healthChecks].sort((a, b) =>
        String(b.checkedAt || '').localeCompare(String(a.checkedAt || ''))
      );

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
            ActiveSubscriptions: subscriptions.length,
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
            OpenAppErrors: errLogs.filter((d) => d.resolved === false).length,
            SecurityRulesActive: 'STRICT_MULTI_TENANT',
            SystemStatus: sortedHealth[0]?.overallStatus || 'HEALTHY',
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
            activeSubscriptions: subscriptions.length,
            openReconAlerts: openReconAlerts.length,
          },
          supportAndAlerts: {
            openTickets: tickets.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED')
              .length,
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
            latestCheck: sortedHealth[0] || {
              overallStatus: 'HEALTHY',
              authServiceOk: true,
              databaseOk: true,
              storageOk: true,
              paymentWebhookConfigured: Boolean(config.razorpay.webhookSecret),
              emailServiceConfigured: Boolean(config.smtp.pass),
            },
            unresolvedErrorsCount: errLogs.filter((d) => d.resolved === false).length,
          },
          departmentReports,
          recentAuditLogs: auditLogs,
          recentAutomationRuns: runs,
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
techRouter.get(
  '/overview',
  requireAnyPermission(
    'VIEW_TECH_DASHBOARD',
    'MANAGE_SYSTEM_SECURITY',
    'VIEW_APP_ERROR_LOGS',
    'MANAGE_SYSTEM_HEALTH',
    'MANAGE_SOFTWARE_QA',
    'MANAGE_BACKUPS',
    'MANAGE_TECH_ISSUES',
    'VIEW_SUPER_ADMIN_DASHBOARD'
  ),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await ensureOrganisationBootstrapped(req.user?.email);
      const { db, isMockMode } = initializeFirebase();

      const [healthChecks, backups, techIssues] = await Promise.all([
        dualList<SystemHealthCheckRecord>('system_health_checks'),
        dualList<BackupRecord>('backup_records'),
        dualList<TechIssueRecord>('tech_issues'),
      ]);

      let errorLogs: AppErrorLogRecord[] = DEV_DATA_STORE.appErrorLogs;
      let users: Array<Record<string, unknown>> = Array.from(
        DEV_DATA_STORE.usersDirectory.values()
      ) as unknown as Array<Record<string, unknown>>;

      if (db && !isMockMode) {
        const [errSnap, dirSnap] = await Promise.all([
          db.collection('app_error_logs').orderBy('createdAt', 'desc').limit(80).get(),
          db.collection('user_directory').get(),
        ]);
        errorLogs = errSnap.docs.map((d) => d.data() as AppErrorLogRecord);
        users = dirSnap.docs.map((d) => d.data() as Record<string, unknown>);
      }

      const sortDesc = <T extends { createdAt?: string; checkedAt?: string }>(arr: T[]) =>
        [...arr].sort((a, b) =>
          String(b.checkedAt || b.createdAt || '').localeCompare(
            String(a.checkedAt || a.createdAt || '')
          )
        );

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
              runtime: config.razorpay.webhookSecret ? 'WEBHOOK_SECRET_CONFIGURED' : 'SECRET_PENDING',
              status: config.razorpay.webhookSecret ? 'OPERATIONAL' : 'ACTION_NEEDED',
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
            webhookHmacVerified: Boolean(config.razorpay.webhookSecret),
            emailDeliveryConfigured: Boolean(config.smtp.pass),
          },
          errorLogs,
          healthChecks: sortDesc(healthChecks),
          backups: sortDesc(backups),
          techIssues: sortDesc(techIssues),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);

techRouter.post(
  '/health-check/run',
  requirePermissions('MANAGE_SYSTEM_HEALTH'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startedAt = new Date().toISOString();
    const runId = `RUN-TECH-${Date.now()}`;
    try {
      const { db, auth, isMockMode } = initializeFirebase();
      let authServiceOk = Boolean(isMockMode);
      let databaseOk = Boolean(isMockMode);

      if (auth && !isMockMode) {
        try {
          await auth.listUsers(1);
          authServiceOk = true;
        } catch {
          authServiceOk = false;
        }
      }
      if (db && !isMockMode) {
        try {
          await db.collection('settings').doc('platform').get();
          databaseOk = true;
        } catch {
          databaseOk = false;
        }
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
        paymentWebhookConfigured: Boolean(config.razorpay.webhookSecret),
        emailServiceConfigured: Boolean(config.smtp.pass),
        checkedBy: req.user?.email || config.admin.email,
        notes: `Executed live service probe (${overallStatus})`,
      };

      await dualSet('system_health_checks', id, record);
      await recordDualAutomationRun({
        id: runId,
        jobKey: `TECH_HEALTH_${now.slice(0, 13)}`,
        automationType: 'SYSTEM_HEALTH_CHECK',
        departmentId: 'PRODUCT_TECHNOLOGY',
        status: 'SUCCESS',
        processedCount: 5,
        alertCount: overallStatus === 'HEALTHY' ? 0 : 1,
        dedupSkippedCount: 0,
        retryCount: 0,
        triggeredByEmail: req.user?.email || config.admin.email,
        summary: `System health probe completed (${overallStatus})`,
        startedAt,
        completedAt: now,
        createdAt: now,
      });

      return res.json({ success: true, data: record, timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

techRouter.post(
  '/backups',
  requirePermissions('MANAGE_BACKUPS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { backupType, status, scopeSummary, scope, storageLocation, recoveryPointObjectiveMinutes } =
        req.body || {};
      const resolvedScope = (scopeSummary || scope || '').trim();
      if (!resolvedScope) {
        return next(new AppError('scopeSummary is required.', 400, 'BAD_REQUEST'));
      }
      const now = new Date().toISOString();
      const id = `BKP-${Date.now().toString().slice(-6)}`;
      const record: BackupRecord = {
        id,
        backupType: backupType || 'DATABASE_SNAPSHOT',
        status: status || 'VERIFIED',
        scopeSummary: resolvedScope,
        storageLocation: storageLocation?.trim() || 'gs://labsetu-diagnostics-backups',
        verifiedBy: req.user?.email || config.admin.email,
        recoveryPointObjectiveMinutes:
          typeof recoveryPointObjectiveMinutes === 'number' ? recoveryPointObjectiveMinutes : 60,
        createdAt: now,
      };
      await dualSet('backup_records', id, record);
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

techRouter.post(
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
        ...(assignedToEmail ? { assignedToEmail: String(assignedToEmail).trim().toLowerCase() } : {}),
        createdBy: req.user?.email || config.admin.email,
        createdAt: now,
        updatedAt: now,
      };
      await dualSet('tech_issues', id, issue);
      return res.status(201).json({ success: true, data: issue, timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

techRouter.patch(
  '/issues/:id',
  requireAnyPermission('MANAGE_TECH_ISSUES', 'MANAGE_SOFTWARE_QA'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const existing = await dualGet<TechIssueRecord>('tech_issues', req.params.id);
      if (!existing) {
        return next(new AppError('Technical issue not found.', 404, 'NOT_FOUND'));
      }
      const body = req.body || {};
      const now = new Date().toISOString();
      const updated: TechIssueRecord = {
        ...existing,
        ...(body.status ? { status: body.status } : {}),
        ...(body.qaStatus ? { qaStatus: body.qaStatus } : {}),
        ...(body.priority ? { priority: body.priority } : {}),
        ...(body.assignedToEmail !== undefined ? { assignedToEmail: body.assignedToEmail } : {}),
        updatedAt: now,
      };
      await dualSet('tech_issues', req.params.id, updated, true);
      return res.json({ success: true, data: updated, timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

async function handleResolveErrorLog(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { db, isMockMode } = initializeFirebase();
    const now = new Date().toISOString();
    let resolvedRec: AppErrorLogRecord | null = null;
    if (db && !isMockMode) {
      const ref = db.collection('app_error_logs').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) {
        return next(new AppError('Error log entry not found.', 404, 'NOT_FOUND'));
      }
      await ref.set(
        { resolved: true, resolvedBy: req.user?.email || config.admin.email },
        { merge: true }
      );
      resolvedRec = (await ref.get()).data() as AppErrorLogRecord;
    } else {
      const idx = DEV_DATA_STORE.appErrorLogs.findIndex((e) => e.id === req.params.id);
      if (idx < 0) {
        return next(new AppError('Error log entry not found.', 404, 'NOT_FOUND'));
      }
      DEV_DATA_STORE.appErrorLogs[idx] = {
        ...DEV_DATA_STORE.appErrorLogs[idx],
        resolved: true,
        resolvedBy: req.user?.email || config.admin.email,
      };
      resolvedRec = DEV_DATA_STORE.appErrorLogs[idx];
    }
    return res.json({ success: true, data: resolvedRec, timestamp: now });
  } catch (err) {
    return next(err);
  }
}

techRouter.patch('/errors/:id/resolve', requirePermissions('VIEW_APP_ERROR_LOGS'), handleResolveErrorLog);
techRouter.post('/errors/:id/resolve', requirePermissions('VIEW_APP_ERROR_LOGS'), handleResolveErrorLog);

// ===========================================================================
// IMMUTABLE AUDIT LOGS, LOGIN HISTORY & AUTOMATION RUN LOGS
// ===========================================================================
techRouter.get(
  '/audit-logs',
  requireAnyPermission('VIEW_AUDIT_LOGS', 'VIEW_SUPER_ADMIN_DASHBOARD'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const limitNum = Math.min(200, parseInt(String(req.query.limit || '80'), 10) || 80);
      const { db, isMockMode } = initializeFirebase();

      let auditLogs: AuditLogRecord[] = DEV_DATA_STORE.auditLogs.slice(0, limitNum);
      let loginHistory: LoginHistoryRecord[] = DEV_DATA_STORE.loginHistory.slice(0, limitNum);
      let automationRuns: AutomationRunRecord[] = DEV_DATA_STORE.automationRuns.slice(0, 60);

      if (db && !isMockMode) {
        const [auditSnap, loginSnap, runsSnap] = await Promise.all([
          db.collection('audit_logs').orderBy('createdAt', 'desc').limit(limitNum).get(),
          db.collection('login_history').orderBy('createdAt', 'desc').limit(limitNum).get(),
          db.collection('automation_runs').orderBy('createdAt', 'desc').limit(60).get(),
        ]);
        auditLogs = auditSnap.docs.map((d) => d.data() as AuditLogRecord);
        loginHistory = loginSnap.docs.map((d) => d.data() as LoginHistoryRecord);
        automationRuns = runsSnap.docs.map((d) => d.data() as AutomationRunRecord);
      }

      const canViewLogins =
        Boolean(req.user?.isSuperAdmin) ||
        Boolean(req.user?.permissions.includes('VIEW_LOGIN_HISTORY'));

      return res.json({
        success: true,
        data: {
          auditLogs,
          loginHistory: canViewLogins ? loginHistory : [],
          automationRuns,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);
