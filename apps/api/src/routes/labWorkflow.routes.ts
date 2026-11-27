import { Router, type NextFunction, type Response } from 'express';
import { OrderStatus, UserRole } from '@diagnostic/shared';
import { requireAuth, requireRoles } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { type AuthenticatedRequest, requireAnyPermission } from '../middleware/rbac';
import {
  discoverApprovedLargeLabOfferings,
  generateHandoverOtp,
  getAuthorizedReportDownload,
  listCollectionCentres,
  saveCollectionCentre,
  setCatalogueApprovalByAdmin,
  transitionOrderProcessingStatus,
  uploadTestOrCombinedReport,
  upsertLargeLabTestOrPackage,
  verifyHandoverOtp,
} from '../services/labWorkflow.service';

export const labWorkflowRouter = Router();

labWorkflowRouter.use(requireAuth);

// Small Lab / Admin: Discover approved Large Lab tests & packages
labWorkflowRouter.get('/discovery', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await discoverApprovedLargeLabOfferings({
      q: req.query.q ? String(req.query.q) : undefined,
      itemType: (req.query.itemType as 'TEST' | 'PACKAGE' | 'ALL') || 'ALL',
      department: req.query.department ? String(req.query.department) : undefined,
      city: req.query.city ? String(req.query.city) : undefined,
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
      maxTatHours: req.query.maxTatHours ? Number(req.query.maxTatHours) : undefined,
      sortBy: (req.query.sortBy as 'LOWEST_PRICE' | 'HIGHEST_PRICE' | 'FASTEST_TAT') || 'LOWEST_PRICE',
      page: req.query.page ? Number(req.query.page) : 1,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
    });
    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// Large Lab / Admin: Upsert Test or Package
labWorkflowRouter.post(
  '/catalogue',
  requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const largeLabId =
        req.user?.role === UserRole.ADMIN
          ? String(req.body?.labId || '')
          : req.user?.parentLabId || req.user?.labId || '';
      if (!largeLabId) throw new AppError('Large Lab ID is required.', 400, 'LAB_ID_REQUIRED');
      const data = await upsertLargeLabTestOrPackage({
        largeLabId,
        largeLabName: String(req.body?.labName || req.user?.displayName || largeLabId),
        item: req.body,
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        isAdmin: req.user?.role === UserRole.ADMIN,
      });
      res.status(201).json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: Approve or Reject catalogue item
labWorkflowRouter.post(
  '/admin/catalogue/:id/approval',
  requireRoles(UserRole.ADMIN),
  requireAnyPermission('MANAGE_TEST_CATALOG', 'MANAGE_LAB_PARTNERSHIPS', 'FULL_PLATFORM_CONTROL'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const approvalStatus = req.body?.approvalStatus === 'REJECTED' ? 'REJECTED' : 'APPROVED';
      const data = await setCatalogueApprovalByAdmin({
        itemId: req.params.id,
        approvalStatus,
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

// Collection Centres: List & Save
labWorkflowRouter.get('/centres/:largeLabId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await listCollectionCentres(req.params.largeLabId);
    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

labWorkflowRouter.post(
  '/centres',
  requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const largeLabId =
        req.user?.role === UserRole.ADMIN
          ? String(req.body?.largeLabId || '')
          : req.user?.parentLabId || req.user?.labId || '';
      if (!largeLabId) throw new AppError('Large Lab ID is required.', 400, 'LAB_ID_REQUIRED');
      const data = await saveCollectionCentre({
        largeLabId,
        centre: req.body,
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
      });
      res.status(201).json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

// Phlebo Handover OTP: Generate & Verify
labWorkflowRouter.post(
  '/orders/:orderId/handover-otp/generate',
  requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = req.user?.phlebotomistId || req.user?.uid || '';
      const data = await generateHandoverOtp({
        orderId: req.params.orderId,
        phleboId,
        ttlMinutes: req.body?.ttlMinutes ? Number(req.body.ttlMinutes) : 10,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

labWorkflowRouter.post(
  '/orders/:orderId/handover-otp/verify',
  requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = req.user?.phlebotomistId || req.user?.uid || '';
      const data = await verifyHandoverOtp({
        orderId: req.params.orderId,
        phleboId,
        otp: String(req.body?.otp || ''),
        centreId: String(req.body?.centreId || ''),
        receiverId: req.body?.receiverId ? String(req.body.receiverId) : undefined,
        temperatureCelsius:
          typeof req.body?.temperatureCelsius === 'number' ? req.body.temperatureCelsius : undefined,
        remarks: req.body?.remarks ? String(req.body.remarks) : undefined,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

// Large Lab / Admin: Validated Sample Processing Status Transition
labWorkflowRouter.post(
  '/orders/:orderId/status',
  requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await transitionOrderProcessingStatus({
        orderId: req.params.orderId,
        nextStatus: req.body?.nextStatus as OrderStatus,
        actorUid: req.user?.uid || '',
        actorRole: req.user!.role,
        actorLabId: req.user?.labId,
        centreId: req.body?.centreId ? String(req.body.centreId) : undefined,
        remarks: req.body?.remarks ? String(req.body.remarks) : undefined,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

// Large Lab / Admin: Test-wise & Combined Report Upload
labWorkflowRouter.post(
  '/orders/:orderId/reports',
  requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await uploadTestOrCombinedReport({
        orderId: req.params.orderId,
        actorUid: req.user?.uid || '',
        actorRole: req.user!.role,
        actorLabId: req.user?.labId,
        reportType: req.body?.reportType === 'COMBINED' ? 'COMBINED' : 'INDIVIDUAL',
        coveredTestIds: Array.isArray(req.body?.coveredTestIds) ? req.body.coveredTestIds : [],
        pathologistName: String(req.body?.pathologistName || ''),
        authoriseNow: req.body?.authoriseNow !== false,
        fileName: String(req.body?.fileName || 'report.pdf'),
        mimeType: String(req.body?.mimeType || 'application/pdf'),
        base64Data: String(req.body?.base64Data || ''),
        reportDate: req.body?.reportDate ? String(req.body.reportDate) : undefined,
        remarks: req.body?.remarks ? String(req.body.remarks) : undefined,
      });
      res.status(201).json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

// Authorized Short-Lived Report Download (Small Lab owner, Large Lab owner, Admin only; Phlebo blocked)
labWorkflowRouter.get(
  '/reports/:reportId/download',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await getAuthorizedReportDownload({
        reportId: req.params.reportId,
        actorUid: req.user?.uid || '',
        actorRole: req.user!.role,
        actorLabId: req.user?.labId,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);
