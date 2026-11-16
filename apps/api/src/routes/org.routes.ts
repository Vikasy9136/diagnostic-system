import { NextFunction, Response, Router } from 'express';
import {
  ALL_PERMISSION_CODES,
  type AdminTeamRole,
  type CoreDepartmentId,
  DEFAULT_DEPARTMENTS,
  type DepartmentRecord,
  type DesignationCategory,
  type DesignationRecord,
  type EmployeeRecord,
  type FounderSeatKey,
  type FounderSeatRecord,
  PERMISSION_CATALOG,
  type PermissionCode,
  UserRole,
  generateRoleAssignedId,
  normalizeIdentifierCode,
  resolveEffectivePermissions,
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
  requireSuperAdmin,
} from '../middleware/rbac';
import {
  collectExistingAssignedCodes,
  createOrUpdateManagedUser,
  ensureOrganisationBootstrapped,
  normalizeEmail,
  requestPasswordReset,
  updateManagedUserStatus,
} from '../services/user-directory.service';
import { DEV_DATA_STORE } from '../services/devStore';
import { dualGet, dualList, dualSet } from '../services/dualCollection';

export const orgRouter = Router();

orgRouter.use(requireAuth, requireRoles(UserRole.ADMIN));

orgRouter.post(
  '/bootstrap',
  requireAnyPermission('VIEW_SUPER_ADMIN_DASHBOARD', 'FULL_PLATFORM_CONTROL', 'MANAGE_DEPARTMENTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await ensureOrganisationBootstrapped(req.user?.email);
      return res.json({
        success: true,
        data: result,
        message: 'Organisation governance structure verified.',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);

orgRouter.get('/permissions', (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: PERMISSION_CATALOG,
    timestamp: new Date().toISOString(),
  });
});

orgRouter.get('/permission-catalog', (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: PERMISSION_CATALOG,
    timestamp: new Date().toISOString(),
  });
});

orgRouter.get(
  '/founders',
  requireAnyPermission('VIEW_SUPER_ADMIN_DASHBOARD', 'MANAGE_FOUNDER_SEATS', 'MANAGE_DEPARTMENTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await ensureOrganisationBootstrapped(req.user?.email);
      const founderSeats = await dualList<FounderSeatRecord>('founder_seats');
      const seatOrder: Record<FounderSeatKey, number> = { VIKAS: 0, ASHWANI: 1, AKASH: 2, VISHAL: 3 };
      founderSeats.sort((a, b) => (seatOrder[a.seatKey] ?? 9) - (seatOrder[b.seatKey] ?? 9));
      return res.json({
        success: true,
        data: founderSeats,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);

orgRouter.get(
  '/overview',
  requireAnyPermission(
    'VIEW_SUPER_ADMIN_DASHBOARD',
    'MANAGE_DEPARTMENTS',
    'MANAGE_DESIGNATIONS',
    'MANAGE_EMPLOYEES',
    'MANAGE_FOUNDER_SEATS',
    'VIEW_FINANCE_DASHBOARD',
    'VIEW_OPERATIONS_DASHBOARD',
    'VIEW_MARKETING_DASHBOARD',
    'VIEW_TECH_DASHBOARD'
  ),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await ensureOrganisationBootstrapped(req.user?.email);

      const [departments, designations, founderSeats, employees] = await Promise.all([
        dualList<DepartmentRecord>('departments'),
        dualList<DesignationRecord>('designations'),
        dualList<FounderSeatRecord>('founder_seats'),
        dualList<EmployeeRecord>('employees'),
      ]);

      departments.sort((a, b) => a.name.localeCompare(b.name));
      designations.sort(
        (a, b) => a.departmentName.localeCompare(b.departmentName) || a.title.localeCompare(b.title)
      );
      const seatOrder: Record<FounderSeatKey, number> = { VIKAS: 0, ASHWANI: 1, AKASH: 2, VISHAL: 3 };
      founderSeats.sort((a, b) => (seatOrder[a.seatKey] ?? 9) - (seatOrder[b.seatKey] ?? 9));
      employees.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      return res.json({
        success: true,
        data: {
          currentActor: {
            email: req.user?.email,
            displayName: req.user?.displayName || req.user?.email,
            isSuperAdmin: req.user?.isSuperAdmin || false,
            founderRoles: req.user?.founderRoles || [],
            primaryDepartmentId: req.user?.primaryDepartmentId || null,
            departmentIds: req.user?.departmentIds || [],
            permissions: req.user?.permissions || [],
          },
          departments,
          designations,
          founderSeats,
          employees,
          permissionCatalog: PERMISSION_CATALOG,
          stats: {
            activeFoundersCount: founderSeats.filter((s) => s.seatStatus === 'ACTIVE').length,
            awaitingFoundersCount: founderSeats.filter(
              (s) => s.seatStatus === 'AWAITING_EMAIL_ASSIGNMENT'
            ).length,
            totalDepartmentsCount: departments.filter((d) => d.isActive).length,
            totalDesignationsCount: designations.filter((d) => d.isActive).length,
            totalEmployeesCount: employees.length,
            activeEmployeesCount: employees.filter((e) => e.status === 'ACTIVE').length,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);

orgRouter.post(
  '/founders/:seatKey/assign',
  requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const seatKey = String(req.params.seatKey).toUpperCase() as FounderSeatKey;
      const { email, founderName, phoneNumber, sendPasswordSetupEmail } = req.body || {};
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return next(new AppError('Please provide a valid email address.', 400, 'BAD_REQUEST'));
      }

      const cleanEmail = normalizeEmail(email);
      const seat = await dualGet<FounderSeatRecord>('founder_seats', seatKey);
      if (!seat) {
        return next(new AppError(`Founder seat not found: ${seatKey}`, 404, 'NOT_FOUND'));
      }

      const nextName = (founderName?.trim() || seat.founderName).slice(0, 80);
      const now = new Date().toISOString();
      const meta = getRequestClientMeta(req);

      const profile = await createOrUpdateManagedUser(
        {
          email: cleanEmail,
          displayName: `${nextName} (${seat.title})`,
          phoneNumber: phoneNumber?.trim() || undefined,
          role: UserRole.ADMIN,
          adminSubRole: seat.isSuperAdmin
            ? 'SUPER_ADMIN'
            : (`${seat.primaryDepartmentId}_HEAD` as AdminTeamRole),
          isSuperAdmin: seat.isSuperAdmin,
          founderRoles: seat.founderRoles,
          founderSeatKey: seat.seatKey,
          primaryDepartmentId: seat.primaryDepartmentId,
          departmentIds: seat.departmentIds,
          designationTitle: seat.title,
          responsibilities: seat.responsibilities,
          permissions: seat.permissions,
          isActive: true,
        },
        {
          uid: req.user?.uid,
          email: req.user?.email,
          displayName: req.user?.profile?.displayName || req.user?.email,
          role: req.user?.role,
          isSuperAdmin: true,
          ...meta,
        }
      );

      const updatedSeat: FounderSeatRecord = {
        ...seat,
        founderName: nextName,
        assignedEmail: cleanEmail,
        assignedUid: profile.id,
        seatStatus: 'ACTIVE',
        updatedBy: req.user?.email || config.admin.email,
        updatedAt: now,
      };
      await dualSet('founder_seats', seatKey, updatedSeat, true);

      const dept = await dualGet<DepartmentRecord>('departments', seat.primaryDepartmentId);
      if (dept) {
        await dualSet(
          'departments',
          seat.primaryDepartmentId,
          {
            ...dept,
            headName: nextName,
            headEmail: cleanEmail,
            headUserId: profile.id,
            updatedAt: now,
          },
          true
        );
      }

      if (sendPasswordSetupEmail) {
        const origin =
          typeof req.headers.origin === 'string'
            ? req.headers.origin
            : 'https://labsetu-diagnostics.web.app';
        try {
          await requestPasswordReset(cleanEmail, origin, 'WEB', {
            uid: req.user?.uid,
            email: req.user?.email,
            ...meta,
          });
        } catch {
          // Email delivery failure does not roll back seat binding
        }
      }

      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorRole: 'SUPER_ADMIN',
        action: 'FOUNDER_SEAT_ASSIGNED',
        resourceType: 'FOUNDER_SEAT',
        resourceId: seatKey,
        departmentId: seat.primaryDepartmentId,
        severity: 'CRITICAL',
        summary: `Assigned founder seat ${seatKey} (${seat.title}) to ${cleanEmail}`,
        ...meta,
      });

      return res.json({
        success: true,
        data: { seat: updatedSeat, profile },
        message: `${nextName}'s seat is now active on ${cleanEmail}.`,
        timestamp: now,
      });
    } catch (err) {
      return next(err);
    }
  }
);

async function handleTransferSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      targetEmail,
      targetName,
      targetFounderName,
      confirmPhrase,
      revokeCurrentSuperAdmin,
      keepCurrentAsProductHead,
      keepPreviousAsTechHead,
    } = req.body || {};

    if (confirmPhrase !== 'TRANSFER SUPER ADMIN') {
      return next(
        new AppError(
          'Confirmation phrase mismatch. Type "TRANSFER SUPER ADMIN" to proceed.',
          400,
          'CONFIRMATION_REQUIRED'
        )
      );
    }

    if (!targetEmail || typeof targetEmail !== 'string' || !targetEmail.includes('@')) {
      return next(
        new AppError('Please provide a valid destination email for Super Admin transfer.', 400, 'BAD_REQUEST')
      );
    }

    const cleanTarget = normalizeEmail(targetEmail);
    const currentActorEmail = normalizeEmail(req.user?.email || config.admin.email);
    if (cleanTarget === currentActorEmail) {
      return next(new AppError('Target email is already the current Super Admin.', 400, 'BAD_REQUEST'));
    }

    const now = new Date().toISOString();
    const meta = getRequestClientMeta(req);
    const resolvedTargetName = (targetName?.trim() || targetFounderName?.trim() || cleanTarget.split('@')[0]).slice(0, 80);

    const nextProfile = await createOrUpdateManagedUser(
      {
        email: cleanTarget,
        displayName: `${resolvedTargetName} (Super Admin)`,
        role: UserRole.ADMIN,
        adminSubRole: 'SUPER_ADMIN',
        isSuperAdmin: true,
        founderRoles: ['SUPER_ADMIN', 'PRODUCT_TECHNOLOGY_HEAD'],
        founderSeatKey: 'VIKAS',
        primaryDepartmentId: 'PRODUCT_TECHNOLOGY',
        departmentIds: [
          'PRODUCT_TECHNOLOGY',
          'FINANCE_BUSINESS',
          'OPERATIONS_PARTNERSHIPS',
          'MARKETING_GROWTH',
        ],
        designationTitle: 'Super Admin & Product & Technology Head',
        permissions: ALL_PERMISSION_CODES,
        isActive: true,
      },
      {
        uid: req.user?.uid,
        email: currentActorEmail,
        isSuperAdmin: true,
        ...meta,
      }
    );

    const currentSeat = await dualGet<FounderSeatRecord>('founder_seats', 'VIKAS');
    if (currentSeat) {
      await dualSet(
        'founder_seats',
        'VIKAS',
        {
          ...currentSeat,
          founderName: resolvedTargetName,
          assignedEmail: cleanTarget,
          assignedUid: nextProfile.id,
          seatStatus: 'ACTIVE',
          updatedBy: currentActorEmail,
          updatedAt: now,
        },
        true
      );
    }

    const keepTechHead = keepCurrentAsProductHead !== undefined
      ? keepCurrentAsProductHead !== false
      : keepPreviousAsTechHead !== false;

    if (revokeCurrentSuperAdmin) {
      try {
        await updateManagedUserStatus(
          currentActorEmail,
          keepTechHead
            ? {
                isSuperAdmin: false,
                adminSubRole: 'PRODUCT_TECHNOLOGY_HEAD',
                founderRoles: ['PRODUCT_TECHNOLOGY_HEAD'],
                primaryDepartmentId: 'PRODUCT_TECHNOLOGY',
                departmentIds: ['PRODUCT_TECHNOLOGY'],
              }
            : {
                isSuperAdmin: false,
                adminSubRole: 'DEPARTMENT_EMPLOYEE',
                founderRoles: [],
                primaryDepartmentId: 'PRODUCT_TECHNOLOGY',
                departmentIds: ['PRODUCT_TECHNOLOGY'],
                isActive: false,
              },
          {
            uid: req.user?.uid,
            email: currentActorEmail,
            isSuperAdmin: true,
            ...meta,
          }
        );
      } catch (err) {
        console.warn('Previous Super Admin demotion warning:', err);
      }
    }

    await recordAuditLog({
      actorUid: req.user?.uid,
      actorEmail: currentActorEmail,
      actorRole: 'SUPER_ADMIN',
      action: 'SUPER_ADMIN_TRANSFERRED',
      resourceType: 'FOUNDER_SEAT',
      resourceId: 'VIKAS',
      severity: 'CRITICAL',
      summary: `Transferred Super Admin access from ${currentActorEmail} to ${cleanTarget}`,
      details: { keepTechHead, revokeCurrentSuperAdmin: Boolean(revokeCurrentSuperAdmin) },
      ...meta,
    });

    return res.json({
      success: true,
      data: {
        newSuperAdmin: nextProfile,
        transferredTo: cleanTarget,
        previousEmail: currentActorEmail,
        previousRevoked: Boolean(revokeCurrentSuperAdmin),
      },
      message: `Super Admin authority safely configured for ${cleanTarget}.`,
      timestamp: now,
    });
  } catch (err) {
    return next(err);
  }
}

orgRouter.post('/founders/transfer-super-admin', requireSuperAdmin(), handleTransferSuperAdmin);
orgRouter.post('/super-admin/transfer', requireSuperAdmin(), handleTransferSuperAdmin);

orgRouter.get('/departments', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const depts = await dualList<DepartmentRecord>('departments');
    return res.json({ success: true, data: depts, timestamp: new Date().toISOString() });
  } catch (err) {
    return next(err);
  }
});

orgRouter.post(
  '/departments',
  requirePermissions('MANAGE_DEPARTMENTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { code, name, shortName, description, headName, headEmail, responsibilities, defaultPermissions } =
        req.body || {};
      if (!name?.trim()) {
        return next(new AppError('Department name is required.', 400, 'BAD_REQUEST'));
      }
      const id = String(code || name)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .slice(0, 40);
      const now = new Date().toISOString();
      const existing = await dualGet<DepartmentRecord>('departments', id);

      const record: DepartmentRecord = {
        id,
        code: id,
        name: name.trim(),
        shortName: shortName?.trim() || name.trim().slice(0, 20),
        description: description?.trim() || existing?.description || '',
        headFounderKey: existing?.headFounderKey,
        headName: headName?.trim() || existing?.headName || 'Super Admin',
        ...(headEmail?.trim() ? { headEmail: normalizeEmail(headEmail) } : {}),
        reportsTo: 'SUPER_ADMIN',
        isActive: true,
        isCoreDepartment: DEFAULT_DEPARTMENTS.some((d) => d.id === id),
        defaultPermissions: Array.isArray(defaultPermissions)
          ? (defaultPermissions as PermissionCode[])
          : existing?.defaultPermissions || [],
        responsibilities: Array.isArray(responsibilities)
          ? responsibilities.map(String)
          : existing?.responsibilities || [],
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await dualSet('departments', id, record, true);

      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorRole: req.user?.role,
        action: existing ? 'DEPARTMENT_UPDATED' : 'DEPARTMENT_CREATED',
        resourceType: 'DEPARTMENT',
        resourceId: id,
        departmentId: id,
        severity: 'SENSITIVE',
        summary: `${existing ? 'Updated' : 'Created'} department ${record.name}`,
        ...getRequestClientMeta(req),
      });

      return res.status(existing ? 200 : 201).json({
        success: true,
        data: record,
        message: `Department "${record.name}" saved.`,
        timestamp: now,
      });
    } catch (err) {
      return next(err);
    }
  }
);

orgRouter.patch(
  '/departments/:id',
  requirePermissions('MANAGE_DEPARTMENTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      const existing = await dualGet<DepartmentRecord>('departments', id);
      if (!existing) {
        return next(new AppError(`Department not found: ${id}`, 404, 'NOT_FOUND'));
      }
      const { name, shortName, description, headName, headEmail, isActive, responsibilities, defaultPermissions } =
        req.body || {};

      const updated: DepartmentRecord = {
        ...existing,
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(shortName?.trim() ? { shortName: shortName.trim() } : {}),
        ...(description !== undefined ? { description: String(description) } : {}),
        ...(headName?.trim() ? { headName: headName.trim() } : {}),
        ...(headEmail !== undefined
          ? { headEmail: headEmail ? normalizeEmail(String(headEmail)) : undefined }
          : {}),
        ...(typeof isActive === 'boolean' ? { isActive } : {}),
        ...(Array.isArray(responsibilities) ? { responsibilities: responsibilities.map(String) } : {}),
        ...(Array.isArray(defaultPermissions)
          ? { defaultPermissions: defaultPermissions as PermissionCode[] }
          : {}),
        updatedAt: new Date().toISOString(),
      };
      await dualSet('departments', id, updated, true);

      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorRole: req.user?.role,
        action: 'DEPARTMENT_UPDATED',
        resourceType: 'DEPARTMENT',
        resourceId: id,
        departmentId: id,
        severity: 'SENSITIVE',
        summary: `Updated department ${updated.name}`,
        ...getRequestClientMeta(req),
      });

      return res.json({
        success: true,
        data: updated,
        message: 'Department updated.',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);

orgRouter.get('/designations', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const list = await dualList<DesignationRecord>('designations');
    return res.json({ success: true, data: list, timestamp: new Date().toISOString() });
  } catch (err) {
    return next(err);
  }
});

orgRouter.post(
  '/designations',
  requirePermissions('MANAGE_DESIGNATIONS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        id,
        departmentId,
        title,
        category,
        description,
        isSoftwareQa,
        isOperationalQuality,
        defaultResponsibilities,
        defaultPermissions,
      } = req.body || {};

      if (!departmentId || !title?.trim()) {
        return next(new AppError('Department ID and designation title are required.', 400, 'BAD_REQUEST'));
      }

      const dept = await dualGet<DepartmentRecord>('departments', String(departmentId));
      if (!dept) {
        return next(new AppError(`Department not found: ${departmentId}`, 404, 'NOT_FOUND'));
      }

      const desigId =
        (id && String(id).trim().toUpperCase()) ||
        `DES-${String(departmentId).slice(0, 4)}-${String(title)
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '-')
          .slice(0, 28)}`;

      const existing = await dualGet<DesignationRecord>('designations', desigId);
      const now = new Date().toISOString();
      const record: DesignationRecord = {
        id: desigId,
        departmentId: dept.id,
        departmentName: dept.name,
        title: title.trim(),
        slug: title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        category: (category || 'EXECUTIVE') as DesignationCategory,
        description: description?.trim() || existing?.description || '',
        isSoftwareQa: Boolean(isSoftwareQa),
        isOperationalQuality: Boolean(isOperationalQuality),
        defaultResponsibilities: Array.isArray(defaultResponsibilities)
          ? defaultResponsibilities.map(String)
          : existing?.defaultResponsibilities || [],
        defaultPermissions: Array.isArray(defaultPermissions)
          ? (defaultPermissions as PermissionCode[])
          : existing?.defaultPermissions || [],
        isActive: true,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await dualSet('designations', desigId, record, true);

      return res.status(existing ? 200 : 201).json({
        success: true,
        data: record,
        message: `Designation "${record.title}" saved.`,
        timestamp: now,
      });
    } catch (err) {
      return next(err);
    }
  }
);

orgRouter.patch(
  '/designations/:id',
  requirePermissions('MANAGE_DESIGNATIONS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      const existing = await dualGet<DesignationRecord>('designations', id);
      if (!existing) {
        return next(new AppError(`Designation not found: ${id}`, 404, 'NOT_FOUND'));
      }
      const {
        title,
        description,
        category,
        defaultResponsibilities,
        defaultPermissions,
        isActive,
      } = req.body || {};
      const updated: DesignationRecord = {
        ...existing,
        ...(title?.trim() ? { title: title.trim() } : {}),
        ...(description !== undefined ? { description: String(description) } : {}),
        ...(category ? { category: category as DesignationCategory } : {}),
        ...(Array.isArray(defaultResponsibilities)
          ? { defaultResponsibilities: defaultResponsibilities.map(String) }
          : {}),
        ...(Array.isArray(defaultPermissions)
          ? { defaultPermissions: defaultPermissions as PermissionCode[] }
          : {}),
        ...(typeof isActive === 'boolean' ? { isActive } : {}),
        updatedAt: new Date().toISOString(),
      };
      await dualSet('designations', id, updated, true);
      return res.json({
        success: true,
        data: updated,
        message: 'Designation updated.',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);

orgRouter.get(
  '/employees',
  requireAnyPermission(
    'MANAGE_EMPLOYEES',
    'VIEW_SUPER_ADMIN_DASHBOARD',
    'VIEW_FINANCE_DASHBOARD',
    'VIEW_OPERATIONS_DASHBOARD',
    'VIEW_MARKETING_DASHBOARD',
    'VIEW_TECH_DASHBOARD'
  ),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      let list = await dualList<EmployeeRecord>('employees');
      const deptFilter = req.query.departmentId as string | undefined;
      if (deptFilter) {
        list = list.filter((e) => e.departmentId === deptFilter);
      }
      if (!req.user?.isSuperAdmin && !req.user?.permissions.includes('MANAGE_EMPLOYEES')) {
        const myDepts = new Set(req.user?.departmentIds || []);
        if (req.user?.primaryDepartmentId) myDepts.add(req.user.primaryDepartmentId);
        list = list.filter((e) => myDepts.has(e.departmentId));
      }
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return res.json({ success: true, data: list, timestamp: new Date().toISOString() });
    } catch (err) {
      return next(err);
    }
  }
);

orgRouter.post(
  '/employees',
  requirePermissions('MANAGE_EMPLOYEES'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        employeeId,
        name,
        email,
        phoneNumber,
        departmentId,
        designationId,
        responsibilities,
        permissions,
        joiningDate,
        assignedCity,
        assignedZone,
        password,
        initialPassword,
        sendPasswordSetupEmail,
        sendSetupEmail,
      } = req.body || {};
      const resolvedPassword = String(password || initialPassword || '').trim() || undefined;
      const shouldSendSetupMail = Boolean(sendPasswordSetupEmail || sendSetupEmail) && !resolvedPassword;

      if (!name?.trim() || !email?.trim() || !departmentId || !designationId) {
        return next(
          new AppError(
            'Full name, email, department, and designation are required.',
            400,
            'BAD_REQUEST'
          )
        );
      }

      const [dept, desig] = await Promise.all([
        dualGet<DepartmentRecord>('departments', String(departmentId)),
        dualGet<DesignationRecord>('designations', String(designationId)),
      ]);
      if (!dept) return next(new AppError(`Department not found: ${departmentId}`, 404, 'NOT_FOUND'));
      if (!desig) return next(new AppError(`Designation not found: ${designationId}`, 404, 'NOT_FOUND'));

      if (!req.user?.isSuperAdmin) {
        const actorDepts = new Set(req.user?.departmentIds || []);
        if (req.user?.primaryDepartmentId) actorDepts.add(req.user.primaryDepartmentId);
        if (!actorDepts.has(dept.id)) {
          return next(
            new AppError('You can only hire/manage employees within your assigned department.', 403, 'FORBIDDEN')
          );
        }
      }

      const cleanEmail = normalizeEmail(email);
      const grantedPerms: PermissionCode[] =
        Array.isArray(permissions) && permissions.length > 0
          ? (permissions as PermissionCode[])
          : desig.defaultPermissions;

      if (!req.user?.isSuperAdmin) {
        const forbidden = grantedPerms.filter(
          (p) =>
            p === 'FULL_PLATFORM_CONTROL' ||
            p === 'MANAGE_FOUNDER_SEATS' ||
            p === 'MANAGE_SYSTEM_SECURITY' ||
            p === 'APPROVE_SENSITIVE_ACTIONS'
        );
        if (forbidden.length > 0) {
          return next(
            new AppError(
              `Only Super Admin may grant sensitive system permissions: ${forbidden.join(', ')}`,
              403,
              'PRIVILEGE_ESCALATION_BLOCKED'
            )
          );
        }
      }

      const now = new Date().toISOString();
      const meta = getRequestClientMeta(req);
      const existingCodes = employeeId?.trim() ? [] : await collectExistingAssignedCodes();
      const docId = normalizeIdentifierCode(
        employeeId?.trim() ||
          generateRoleAssignedId({
            role: UserRole.ADMIN,
            isEmployee: true,
            existingCodes,
          })
      );

      const profile = await createOrUpdateManagedUser(
        {
          email: cleanEmail,
          displayName: name.trim(),
          phoneNumber: phoneNumber?.trim() || undefined,
          role: UserRole.ADMIN,
          adminSubRole: 'DEPARTMENT_EMPLOYEE',
          isSuperAdmin: false,
          employeeId: docId,
          userCode: docId,
          primaryDepartmentId: dept.id as CoreDepartmentId,
          departmentIds: [dept.id],
          designationId: desig.id,
          designationTitle: desig.title,
          responsibilities: Array.isArray(responsibilities)
            ? responsibilities.map(String)
            : desig.defaultResponsibilities,
          permissions: grantedPerms,
          assignedCity: assignedCity?.trim() || undefined,
          assignedZone: assignedZone?.trim() || undefined,
          joiningDate: joiningDate || now.slice(0, 10),
          ...(resolvedPassword ? { password: resolvedPassword } : {}),
          isActive: true,
        },
        {
          uid: req.user?.uid,
          email: req.user?.email,
          displayName: req.user?.profile?.displayName || req.user?.email,
          role: req.user?.role,
          isSuperAdmin: req.user?.isSuperAdmin,
          ...meta,
        }
      );

      const empRecord: EmployeeRecord = {
        id: docId,
        employeeId: docId,
        userCode: profile.userCode || docId,
        userCodeUpper: normalizeIdentifierCode(profile.userCode || docId),
        userId: profile.id,
        email: cleanEmail,
        name: name.trim(),
        ...(phoneNumber?.trim() ? { phoneNumber: phoneNumber.trim() } : {}),
        departmentId: dept.id,
        departmentName: dept.name,
        designationId: desig.id,
        designationTitle: desig.title,
        reportingManagerEmail: profile.reportingManagerEmail || dept.headEmail,
        reportingManagerName: profile.reportingManagerName || dept.headName,
        responsibilities: Array.isArray(responsibilities)
          ? responsibilities.map(String)
          : desig.defaultResponsibilities,
        permissions: profile.permissions || grantedPerms,
        isSuperAdmin: false,
        isFounderSeat: false,
        status: 'ACTIVE',
        isActive: true,
        canSignIn: true,
        joiningDate: joiningDate || now.slice(0, 10),
        ...(assignedCity?.trim() ? { assignedCity: assignedCity.trim() } : {}),
        ...(assignedZone?.trim() ? { assignedZone: assignedZone.trim() } : {}),
        createdBy: req.user?.email || config.admin.email,
        createdAt: now,
        updatedAt: now,
      };
      await dualSet('employees', docId, empRecord);

      if (shouldSendSetupMail) {
        const origin =
          typeof req.headers.origin === 'string'
            ? req.headers.origin
            : 'https://labsetu-diagnostics.web.app';
        try {
          await requestPasswordReset(cleanEmail, origin, 'WEB', {
            uid: req.user?.uid,
            email: req.user?.email,
            ...meta,
          });
        } catch {
          // Non-fatal
        }
      }

      return res.status(201).json({
        success: true,
        data: empRecord,
        message: `${empRecord.name} (${empRecord.designationTitle}) onboarded to ${empRecord.departmentName}.`,
        timestamp: now,
      });
    } catch (err) {
      return next(err);
    }
  }
);

orgRouter.patch(
  '/employees/:id',
  requirePermissions('MANAGE_EMPLOYEES'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      const existing = await dualGet<EmployeeRecord>('employees', id);
      if (!existing) {
        return next(new AppError(`Employee record not found: ${id}`, 404, 'NOT_FOUND'));
      }

      const {
        name,
        phoneNumber,
        departmentId,
        designationId,
        responsibilities,
        permissions,
        status,
        assignedCity,
        assignedZone,
      } = req.body || {};

      let nextDeptName = existing.departmentName;
      let nextDeptId = existing.departmentId;
      if (departmentId && departmentId !== existing.departmentId) {
        const dept = await dualGet<DepartmentRecord>('departments', String(departmentId));
        if (!dept) return next(new AppError(`Department not found: ${departmentId}`, 404, 'NOT_FOUND'));
        nextDeptId = dept.id;
        nextDeptName = dept.name;
      }

      let nextDesigId = existing.designationId;
      let nextDesigTitle = existing.designationTitle;
      if (designationId && designationId !== existing.designationId) {
        const desig = await dualGet<DesignationRecord>('designations', String(designationId));
        if (!desig) return next(new AppError(`Designation not found: ${designationId}`, 404, 'NOT_FOUND'));
        nextDesigId = desig.id;
        nextDesigTitle = desig.title;
      }

      const nextStatus = status || existing.status;
      const isActive =
        typeof req.body?.isActive === 'boolean'
          ? req.body.isActive
          : nextStatus === 'ACTIVE' || nextStatus === 'TRANSFERRED';
      const now = new Date().toISOString();
      const meta = getRequestClientMeta(req);

      const updated: EmployeeRecord = {
        ...existing,
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(phoneNumber !== undefined ? { phoneNumber: phoneNumber?.trim() || undefined } : {}),
        departmentId: nextDeptId,
        departmentName: nextDeptName,
        designationId: nextDesigId,
        designationTitle: nextDesigTitle,
        ...(Array.isArray(responsibilities) ? { responsibilities: responsibilities.map(String) } : {}),
        ...(Array.isArray(permissions) ? { permissions: permissions as PermissionCode[] } : {}),
        status: isActive ? nextStatus : 'INACTIVE',
        isActive,
        canSignIn: isActive,
        ...(assignedCity !== undefined ? { assignedCity: assignedCity?.trim() || undefined } : {}),
        ...(assignedZone !== undefined ? { assignedZone: assignedZone?.trim() || undefined } : {}),
        updatedAt: now,
      };

      const syncedProfile = await updateManagedUserStatus(
        existing.email,
        {
          isActive,
          primaryDepartmentId: nextDeptId,
          departmentIds: [nextDeptId],
          designationId: nextDesigId,
          designationTitle: nextDesigTitle,
          permissions: updated.permissions,
        },
        {
          uid: req.user?.uid,
          email: req.user?.email,
          displayName: req.user?.profile?.displayName || req.user?.email,
          role: req.user?.role,
          isSuperAdmin: req.user?.isSuperAdmin,
          ...meta,
        }
      );

      updated.reportingManagerEmail = syncedProfile.reportingManagerEmail || updated.reportingManagerEmail;
      updated.reportingManagerName = syncedProfile.reportingManagerName || updated.reportingManagerName;
      updated.permissions = resolveEffectivePermissions(syncedProfile, config.admin.email);
      await dualSet('employees', id, updated, true);

      return res.json({
        success: true,
        data: updated,
        message: `Updated ${updated.name} (${updated.status}).`,
        timestamp: now,
      });
    } catch (err) {
      return next(err);
    }
  }
);

orgRouter.post(
  '/employees/:id/transfer',
  requirePermissions('MANAGE_EMPLOYEES'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        departmentId,
        designationId,
        permissions,
        reason,
      } = req.body || {};
      if (!departmentId || !designationId) {
        return next(
          new AppError('departmentId and designationId are required for transfer.', 400, 'BAD_REQUEST')
        );
      }

      const existing = await dualGet<EmployeeRecord>('employees', req.params.id);
      if (!existing) {
        return next(new AppError(`Employee not found: ${req.params.id}`, 404, 'NOT_FOUND'));
      }
      const [dept, desig] = await Promise.all([
        dualGet<DepartmentRecord>('departments', String(departmentId)),
        dualGet<DesignationRecord>('designations', String(designationId)),
      ]);
      if (!dept || !desig) {
        return next(new AppError('Target department or designation not found.', 404, 'NOT_FOUND'));
      }

      const now = new Date().toISOString();
      const meta = getRequestClientMeta(req);
      const nextPerms: PermissionCode[] =
        Array.isArray(permissions) && permissions.length > 0
          ? (permissions as PermissionCode[])
          : desig.defaultPermissions;

      const syncedProfile = await updateManagedUserStatus(
        existing.email,
        {
          primaryDepartmentId: dept.id,
          departmentIds: [dept.id],
          designationId: desig.id,
          designationTitle: desig.title,
          permissions: nextPerms,
        },
        {
          uid: req.user?.uid,
          email: req.user?.email,
          displayName: req.user?.displayName || req.user?.email,
          role: req.user?.role,
          isSuperAdmin: req.user?.isSuperAdmin,
          ...meta,
        }
      );

      const transferred: EmployeeRecord = {
        ...existing,
        departmentId: dept.id,
        departmentName: dept.name,
        designationId: desig.id,
        designationTitle: desig.title,
        reportingManagerEmail: syncedProfile.reportingManagerEmail || dept.headEmail || config.admin.email,
        reportingManagerName: syncedProfile.reportingManagerName || dept.headName,
        permissions: nextPerms,
        status: existing.isActive ? 'ACTIVE' : 'INACTIVE',
        updatedAt: now,
      };
      await dualSet('employees', existing.id, transferred, true);

      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorName: req.user?.displayName,
        actorRole: req.user?.role,
        action: 'EMPLOYEE_TRANSFERRED',
        resourceType: 'EMPLOYEE',
        resourceId: existing.id,
        departmentId: dept.id,
        severity: 'SENSITIVE',
        summary: `Transferred ${existing.name} from ${existing.departmentName} to ${dept.name} as ${desig.title}${reason ? ` (${reason})` : ''}`,
        ...meta,
      });

      return res.json({
        success: true,
        data: transferred,
        message: `${existing.name} transferred to ${dept.name} (${desig.title}).`,
        timestamp: now,
      });
    } catch (err) {
      return next(err);
    }
  }
);

orgRouter.post(
  '/employees/:id/status',
  requirePermissions('MANAGE_EMPLOYEES'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { isActive } = req.body || {};
      if (typeof isActive !== 'boolean') {
        return next(new AppError('Boolean field isActive is required.', 400, 'BAD_REQUEST'));
      }
      const existing = await dualGet<EmployeeRecord>('employees', req.params.id);
      if (!existing) {
        return next(new AppError(`Employee not found: ${req.params.id}`, 404, 'NOT_FOUND'));
      }

      const now = new Date().toISOString();
      const meta = getRequestClientMeta(req);
      const updatedUser = await updateManagedUserStatus(
        existing.email,
        { isActive },
        {
          uid: req.user?.uid,
          email: req.user?.email,
          displayName: req.user?.displayName || req.user?.email,
          role: req.user?.role,
          isSuperAdmin: req.user?.isSuperAdmin,
          ...meta,
        }
      );

      await dualSet(
        'employees',
        existing.id,
        {
          ...existing,
          isActive,
          canSignIn: isActive,
          status: isActive ? 'ACTIVE' : 'INACTIVE',
          updatedAt: now,
        },
        true
      );

      const { auth, isMockMode } = initializeFirebase();
      if (!isActive && auth && !isMockMode && updatedUser.id) {
        await auth.revokeRefreshTokens(updatedUser.id).catch(() => {});
      }

      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorName: req.user?.displayName,
        actorRole: req.user?.role,
        action: isActive ? 'EMPLOYEE_REACTIVATED' : 'EMPLOYEE_DEACTIVATED',
        resourceType: 'EMPLOYEE',
        resourceId: existing.id,
        departmentId: existing.departmentId,
        severity: 'SENSITIVE',
        summary: `${isActive ? 'Reactivated' : 'Deactivated'} employee access for ${existing.name} (${existing.email})`,
        ...meta,
      });

      return res.json({
        success: true,
        data: { id: existing.id, isActive, status: isActive ? 'ACTIVE' : 'INACTIVE' },
        message: `Employee ${existing.name} ${isActive ? 'reactivated' : 'deactivated'}.`,
        timestamp: now,
      });
    } catch (err) {
      return next(err);
    }
  }
);

orgRouter.post(
  '/employees/:id/reset-password',
  requirePermissions('MANAGE_EMPLOYEES'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const emp = await dualGet<EmployeeRecord>('employees', req.params.id);
      if (!emp) {
        return next(new AppError('Employee not found.', 404, 'NOT_FOUND'));
      }
      const origin =
        typeof req.headers.origin === 'string'
          ? req.headers.origin
          : 'https://labsetu-diagnostics.web.app';
      const result = await requestPasswordReset(emp.email, origin, 'WEB', {
        uid: req.user?.uid,
        email: req.user?.email,
        ...getRequestClientMeta(req),
      });
      return res.json({
        success: true,
        data: result,
        message: `Password setup link dispatched to ${emp.email}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);

orgRouter.get(
  '/employees/:id/activity',
  requireAnyPermission('MANAGE_EMPLOYEES', 'VIEW_AUDIT_LOGS', 'VIEW_LOGIN_HISTORY'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const emp = await dualGet<EmployeeRecord>('employees', req.params.id);
      if (!emp) {
        return next(new AppError('Employee not found.', 404, 'NOT_FOUND'));
      }

      const { db, isMockMode } = initializeFirebase();
      let auditLogs: unknown[] = [];
      let loginHistory: unknown[] = [];

      if (db && !isMockMode) {
        const [auditSnap, loginSnap] = await Promise.all([
          db.collection('audit_logs').where('actorEmail', '==', emp.email).limit(100).get(),
          db.collection('login_history').where('email', '==', emp.email).limit(50).get(),
        ]);
        auditLogs = auditSnap.docs.map((d) => d.data());
        loginHistory = loginSnap.docs.map((d) => d.data());
      } else {
        auditLogs = DEV_DATA_STORE.auditLogs.filter((l) => l.actorEmail === emp.email);
        loginHistory = DEV_DATA_STORE.loginHistory.filter((l) => l.email === emp.email);
      }

      const canViewLogins =
        Boolean(req.user?.isSuperAdmin) ||
        Boolean(req.user?.permissions.includes('VIEW_LOGIN_HISTORY'));

      return res.json({
        success: true,
        data: {
          employee: emp,
          auditLogs,
          loginHistory: canViewLogins ? loginHistory : [],
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);
