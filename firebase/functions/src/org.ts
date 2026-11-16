import { NextFunction, Response, Router } from 'express';
import {
  type AdminTeamRole,
  type CoreDepartmentId,
  type DepartmentRecord,
  type DesignationCategory,
  type DesignationRecord,
  type EmployeeRecord,
  type FounderSeatKey,
  type FounderSeatRecord,
  type PermissionCode,
  UserRole,
} from './types';
import { ADMIN_EMAIL, AppError, auth, db } from './firebaseAdmin';
import {
  collectExistingAssignedCodes,
  createOrUpdateManagedUser,
  ensureOrganisationBootstrapped,
  normalizeEmail,
  requestPasswordReset,
  updateManagedUserStatus,
} from './directory';
import {
  ALL_PERMISSION_CODES,
  DEFAULT_DEPARTMENTS,
  PERMISSION_CATALOG,
  generateRoleAssignedId,
  normalizeIdentifierCode,
  resolveEffectivePermissions,
} from './orgConstants';
import {
  type AuthenticatedRequest,
  getRequestClientMeta,
  recordAuditLog,
  requireAnyPermission,
  requireAuth,
  requirePermissions,
  requireSuperAdmin,
} from './rbac';

function slugifyId(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function createOrgRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/v1/org/bootstrap (idempotent initialization)
  router.post(
    '/bootstrap',
    requireAnyPermission('VIEW_SUPER_ADMIN_DASHBOARD', 'FULL_PLATFORM_CONTROL', 'MANAGE_DEPARTMENTS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const result = await ensureOrganisationBootstrapped(req.user?.email);
        return res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // GET /api/v1/org/overview — founder seats, departments, designations, employees (no fake staff)
  router.get(
    '/overview',
    requireAnyPermission(
      'VIEW_SUPER_ADMIN_DASHBOARD',
      'MANAGE_DEPARTMENTS',
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

        const [deptSnap, desigSnap, seatSnap, empSnap] = await Promise.all([
          db.collection('departments').get(),
          db.collection('designations').get(),
          db.collection('founder_seats').get(),
          db.collection('employees').get(),
        ]);

        const departments = deptSnap.docs.map((d) => d.data() as DepartmentRecord);
        const designations = desigSnap.docs.map((d) => d.data() as DesignationRecord);
        const founderSeats = seatSnap.docs.map((d) => d.data() as FounderSeatRecord);
        const employees = empSnap.docs.map((d) => d.data() as EmployeeRecord);

        return res.json({
          success: true,
          data: {
            departments,
            designations,
            founderSeats,
            employees,
            permissionCatalog: PERMISSION_CATALOG,
            currentActor: {
              email: req.user?.email,
              displayName: req.user?.displayName,
              isSuperAdmin: Boolean(req.user?.isSuperAdmin),
              founderRoles: req.user?.founderRoles || [],
              primaryDepartmentId: req.user?.primaryDepartmentId,
              departmentIds: req.user?.departmentIds || [],
              permissions: req.user?.permissions || [],
            },
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.get('/permission-catalog', (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      success: true,
      data: PERMISSION_CATALOG,
      timestamp: new Date().toISOString(),
    });
  });

  // ===========================================================================
  // FOUNDER SEATS & SAFE SUPER ADMIN TRANSFER
  // ===========================================================================
  router.get(
    '/founders',
    requireAnyPermission('VIEW_SUPER_ADMIN_DASHBOARD', 'MANAGE_FOUNDER_SEATS', 'MANAGE_DEPARTMENTS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        await ensureOrganisationBootstrapped(req.user?.email);
        const snap = await db.collection('founder_seats').get();
        return res.json({
          success: true,
          data: snap.docs.map((d) => d.data() as FounderSeatRecord),
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/founders/:seatKey/assign',
    requireSuperAdmin(),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const seatKey = req.params.seatKey.toUpperCase() as FounderSeatKey;
        const { email, founderName, phoneNumber, sendPasswordSetupEmail } = req.body || {};
        if (!email || typeof email !== 'string' || !email.includes('@')) {
          return next(new AppError('Please provide a valid email address.', 400, 'BAD_REQUEST'));
        }

        const cleanEmail = normalizeEmail(email);
        const seatRef = db.collection('founder_seats').doc(seatKey);
        const seatSnap = await seatRef.get();
        if (!seatSnap.exists) {
          return next(new AppError(`Founder seat not found: ${seatKey}`, 404, 'NOT_FOUND'));
        }
        const seat = seatSnap.data() as FounderSeatRecord;
        const nextName = (founderName?.trim() || seat.founderName).slice(0, 80);
        const now = new Date().toISOString();

        // Provision account & claims cleanly without inventing passwords
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
            permissions: seat.isSuperAdmin ? ALL_PERMISSION_CODES : seat.permissions,
            isActive: true,
          },
          {
            uid: req.user?.uid,
            email: req.user?.email,
            displayName: req.user?.displayName,
            role: req.user?.role,
            isSuperAdmin: req.user?.isSuperAdmin,
            ...getRequestClientMeta(req),
          }
        );

        await seatRef.set(
          {
            founderName: nextName,
            assignedEmail: cleanEmail,
            assignedUid: profile.id,
            seatStatus: 'ACTIVE',
            updatedBy: req.user?.email || ADMIN_EMAIL,
            updatedAt: now,
          },
          { merge: true }
        );

        await db
          .collection('departments')
          .doc(seat.primaryDepartmentId)
          .set(
            {
              headName: nextName,
              headEmail: cleanEmail,
              headUserId: profile.id,
              updatedAt: now,
            },
            { merge: true }
          );

        if (sendPasswordSetupEmail) {
          const origin =
            typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
          await requestPasswordReset(cleanEmail, origin, 'WEB', {
            uid: req.user?.uid,
            email: req.user?.email,
            displayName: req.user?.displayName,
            role: req.user?.role,
          }).catch((e) => console.warn('Optional founder setup email skipped:', e));
        }

        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: 'SUPER_ADMIN',
          action: 'FOUNDER_SEAT_ASSIGNED',
          resourceType: 'FOUNDER_SEAT',
          resourceId: seatKey,
          departmentId: seat.primaryDepartmentId,
          severity: 'CRITICAL',
          summary: `Assigned founder seat ${seatKey} (${nextName}) to ${cleanEmail}`,
          ...getRequestClientMeta(req),
        });

        const updatedSnap = await seatRef.get();
        return res.json({
          success: true,
          data: updatedSnap.data(),
          message: `Founder seat ${nextName} assigned to ${cleanEmail}`,
          timestamp: now,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/founders/transfer-super-admin',
    requireSuperAdmin(),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const {
          targetEmail,
          targetName,
          confirmPhrase,
          revokeCurrentSuperAdmin,
          keepCurrentAsProductHead,
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
          return next(new AppError('Target Super Admin email is required.', 400, 'BAD_REQUEST'));
        }

        const cleanTarget = normalizeEmail(targetEmail);
        const currentEmail = normalizeEmail(req.user?.email || ADMIN_EMAIL);
        if (cleanTarget === currentEmail) {
          return next(
            new AppError('Target email is already the current Super Admin.', 400, 'BAD_REQUEST')
          );
        }

        const now = new Date().toISOString();
        const promoted = await createOrUpdateManagedUser(
          {
            email: cleanTarget,
            displayName: (targetName?.trim() || cleanTarget.split('@')[0]) + ' (Super Admin)',
            role: UserRole.ADMIN,
            adminSubRole: 'SUPER_ADMIN',
            isSuperAdmin: true,
            founderRoles: ['SUPER_ADMIN'],
            primaryDepartmentId: 'PRODUCT_TECHNOLOGY',
            departmentIds: [
              'PRODUCT_TECHNOLOGY',
              'FINANCE_BUSINESS',
              'OPERATIONS_PARTNERSHIPS',
              'MARKETING_GROWTH',
            ],
            permissions: ALL_PERMISSION_CODES,
            isActive: true,
          },
          {
            uid: req.user?.uid,
            email: req.user?.email,
            displayName: req.user?.displayName,
            role: 'SUPER_ADMIN',
            isSuperAdmin: true,
            ...getRequestClientMeta(req),
          }
        );

        // Ensure target explicitly holds active Super Admin before optionally downgrading current
        if (revokeCurrentSuperAdmin) {
          const keepTechHead = keepCurrentAsProductHead !== false;
          await db
            .collection('user_directory')
            .doc(currentEmail)
            .set(
              {
                isSuperAdmin: false,
                revokedSuperAdmin: true,
                adminSubRole: keepTechHead ? 'PRODUCT_TECHNOLOGY_HEAD' : 'DEPARTMENT_EMPLOYEE',
                founderRoles: keepTechHead ? ['PRODUCT_TECHNOLOGY_HEAD'] : [],
                primaryDepartmentId: 'PRODUCT_TECHNOLOGY',
                departmentIds: ['PRODUCT_TECHNOLOGY'],
                updatedAt: now,
              },
              { merge: true }
            );
          await updateManagedUserStatus(
            currentEmail,
            {
              adminSubRole: keepTechHead ? 'PRODUCT_TECHNOLOGY_HEAD' : 'DEPARTMENT_EMPLOYEE',
              isSuperAdmin: false,
              founderRoles: keepTechHead ? ['PRODUCT_TECHNOLOGY_HEAD'] : [],
              primaryDepartmentId: 'PRODUCT_TECHNOLOGY',
              departmentIds: ['PRODUCT_TECHNOLOGY'],
            },
            {
              uid: req.user?.uid,
              email: req.user?.email,
              displayName: req.user?.displayName,
              role: 'SUPER_ADMIN',
              isSuperAdmin: true,
            }
          );
        }

        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: currentEmail,
          actorName: req.user?.displayName,
          actorRole: 'SUPER_ADMIN',
          action: 'SUPER_ADMIN_TRANSFERRED',
          resourceType: 'FOUNDER_SEAT',
          resourceId: cleanTarget,
          severity: 'CRITICAL',
          summary: `Super Admin authority granted to ${cleanTarget}${revokeCurrentSuperAdmin ? ` (previous ${currentEmail} stepped down to ${keepCurrentAsProductHead !== false ? 'Product & Tech Head' : 'standard team access'})` : ' (co-Super Admin enabled)'
            }`,
          ...getRequestClientMeta(req),
        });

        return res.json({
          success: true,
          data: {
            newSuperAdmin: promoted,
            previousEmail: currentEmail,
            previousRevoked: Boolean(revokeCurrentSuperAdmin),
          },
          message: `Super Admin access configured for ${cleanTarget}.`,
          timestamp: now,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ===========================================================================
  // DEPARTMENTS & DESIGNATIONS MANAGEMENT
  // ===========================================================================
  router.get(
    '/departments',
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        await ensureOrganisationBootstrapped(req.user?.email);
        const snap = await db.collection('departments').get();
        return res.json({
          success: true,
          data: snap.docs.map((d) => d.data() as DepartmentRecord),
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/departments',
    requirePermissions('MANAGE_DEPARTMENTS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { name, shortName, description, headName, headEmail, responsibilities, defaultPermissions } =
          req.body || {};
        if (!name?.trim()) {
          return next(new AppError('Department name is required.', 400, 'BAD_REQUEST'));
        }

        const id = slugifyId(name);
        if (!id) {
          return next(new AppError('Invalid department name.', 400, 'BAD_REQUEST'));
        }

        const existing = await db.collection('departments').doc(id).get();
        if (existing.exists) {
          return next(new AppError(`Department ${id} already exists.`, 409, 'DUPLICATE_RESOURCE'));
        }

        const now = new Date().toISOString();
        const dept: DepartmentRecord = {
          id,
          code: id,
          name: name.trim(),
          shortName: shortName?.trim() || name.trim().slice(0, 20),
          description: description?.trim() || `${name.trim()} department`,
          headName: headName?.trim() || 'Super Admin',
          ...(headEmail?.trim() ? { headEmail: normalizeEmail(headEmail) } : {}),
          reportsTo: 'SUPER_ADMIN',
          isActive: true,
          isCoreDepartment: false,
          defaultPermissions: Array.isArray(defaultPermissions) ? defaultPermissions : [],
          responsibilities: Array.isArray(responsibilities) ? responsibilities : [],
          createdAt: now,
          updatedAt: now,
        };

        await db.collection('departments').doc(id).set(dept);
        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: req.user?.role,
          action: 'DEPARTMENT_CREATED',
          resourceType: 'DEPARTMENT',
          resourceId: id,
          departmentId: id,
          severity: 'SENSITIVE',
          summary: `Created department "${dept.name}" (Head: ${dept.headName})`,
          ...getRequestClientMeta(req),
        });

        return res.status(201).json({
          success: true,
          data: dept,
          message: `Department ${dept.name} created successfully.`,
          timestamp: now,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.patch(
    '/departments/:id',
    requirePermissions('MANAGE_DEPARTMENTS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const deptId = req.params.id;
        const ref = db.collection('departments').doc(deptId);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError(`Department not found: ${deptId}`, 404, 'NOT_FOUND'));
        }
        const existing = snap.data() as DepartmentRecord;
        const updates = req.body || {};
        const now = new Date().toISOString();

        const nextDept: DepartmentRecord = {
          ...existing,
          ...(updates.name?.trim() ? { name: updates.name.trim() } : {}),
          ...(updates.shortName?.trim() ? { shortName: updates.shortName.trim() } : {}),
          ...(updates.description !== undefined ? { description: String(updates.description) } : {}),
          ...(updates.headName?.trim() ? { headName: updates.headName.trim() } : {}),
          ...(updates.headEmail !== undefined
            ? { headEmail: updates.headEmail ? normalizeEmail(updates.headEmail) : undefined }
            : {}),
          ...(updates.headUserId !== undefined ? { headUserId: updates.headUserId } : {}),
          ...(typeof updates.isActive === 'boolean' ? { isActive: updates.isActive } : {}),
          ...(Array.isArray(updates.responsibilities)
            ? { responsibilities: updates.responsibilities }
            : {}),
          ...(Array.isArray(updates.defaultPermissions)
            ? { defaultPermissions: updates.defaultPermissions }
            : {}),
          updatedAt: now,
        };

        await ref.set(nextDept, { merge: true });
        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: req.user?.role,
          action: 'DEPARTMENT_UPDATED',
          resourceType: 'DEPARTMENT',
          resourceId: deptId,
          departmentId: deptId,
          severity: 'SENSITIVE',
          summary: `Updated department ${nextDept.name} (active=${nextDept.isActive}, head=${nextDept.headName})`,
          ...getRequestClientMeta(req),
        });

        return res.json({
          success: true,
          data: nextDept,
          message: `Department ${nextDept.name} updated.`,
          timestamp: now,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.get(
    '/designations',
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        await ensureOrganisationBootstrapped(req.user?.email);
        const snap = await db.collection('designations').get();
        let items = snap.docs.map((d) => d.data() as DesignationRecord);
        const deptFilter = req.query.departmentId as string | undefined;
        if (deptFilter) {
          items = items.filter((d) => d.departmentId === deptFilter);
        }
        return res.json({
          success: true,
          data: items,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/designations',
    requirePermissions('MANAGE_DESIGNATIONS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const {
          departmentId,
          title,
          category,
          description,
          defaultResponsibilities,
          defaultPermissions,
          isSoftwareQa,
          isOperationalQuality,
        } = req.body || {};

        if (!departmentId || !title?.trim()) {
          return next(
            new AppError('departmentId and title are required.', 400, 'BAD_REQUEST')
          );
        }

        const deptSnap = await db.collection('departments').doc(departmentId).get();
        if (!deptSnap.exists) {
          return next(new AppError(`Department not found: ${departmentId}`, 404, 'NOT_FOUND'));
        }
        const dept = deptSnap.data() as DepartmentRecord;
        const id = `DES-${slugifyId(departmentId).slice(0, 6)}-${slugifyId(title).slice(0, 20)}`;
        const now = new Date().toISOString();

        const record: DesignationRecord = {
          id,
          departmentId,
          departmentName: dept.name,
          title: title.trim(),
          slug: title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          category: (category || 'EXECUTIVE') as DesignationCategory,
          description: description?.trim() || `${title.trim()} in ${dept.name}`,
          ...(typeof isSoftwareQa === 'boolean' ? { isSoftwareQa } : {}),
          ...(typeof isOperationalQuality === 'boolean' ? { isOperationalQuality } : {}),
          defaultResponsibilities: Array.isArray(defaultResponsibilities)
            ? defaultResponsibilities
            : [],
          defaultPermissions: Array.isArray(defaultPermissions)
            ? defaultPermissions
            : dept.defaultPermissions,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };

        await db.collection('designations').doc(id).set(record, { merge: true });
        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: req.user?.role,
          action: 'DESIGNATION_CREATED',
          resourceType: 'DESIGNATION',
          resourceId: id,
          departmentId,
          severity: 'INFO',
          summary: `Added designation "${record.title}" under ${dept.name}`,
          ...getRequestClientMeta(req),
        });

        return res.status(201).json({
          success: true,
          data: record,
          message: `Designation ${record.title} added to ${dept.name}.`,
          timestamp: now,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.patch(
    '/designations/:id',
    requirePermissions('MANAGE_DESIGNATIONS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('designations').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError(`Designation not found: ${req.params.id}`, 404, 'NOT_FOUND'));
        }
        const existing = snap.data() as DesignationRecord;
        const updates = req.body || {};
        const now = new Date().toISOString();
        const nextRec: DesignationRecord = {
          ...existing,
          ...(updates.title?.trim() ? { title: updates.title.trim() } : {}),
          ...(updates.description !== undefined ? { description: String(updates.description) } : {}),
          ...(typeof updates.isActive === 'boolean' ? { isActive: updates.isActive } : {}),
          ...(Array.isArray(updates.defaultResponsibilities)
            ? { defaultResponsibilities: updates.defaultResponsibilities }
            : {}),
          ...(Array.isArray(updates.defaultPermissions)
            ? { defaultPermissions: updates.defaultPermissions }
            : {}),
          updatedAt: now,
        };
        await ref.set(nextRec, { merge: true });
        return res.json({
          success: true,
          data: nextRec,
          timestamp: now,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ===========================================================================
  // EMPLOYEE MANAGEMENT (ZERO DUMMY EMPLOYEES — REAL ADDS / TRANSFERS ONLY)
  // ===========================================================================
  router.get(
    '/employees',
    requireAnyPermission('MANAGE_EMPLOYEES', 'VIEW_SUPER_ADMIN_DASHBOARD', 'MANAGE_DEPARTMENTS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const snap = await db.collection('employees').get();
        let employees = snap.docs.map((d) => d.data() as EmployeeRecord);
        const deptFilter = req.query.departmentId as string | undefined;
        if (deptFilter) {
          employees = employees.filter((e) => e.departmentId === deptFilter);
        }
        // Department heads without Super Admin only see their own department unless granted cross-dept view
        if (!req.user?.isSuperAdmin && !req.user?.permissions.includes('MANAGE_EMPLOYEES')) {
          const allowedDepts = new Set(req.user?.departmentIds || []);
          if (req.user?.primaryDepartmentId) allowedDepts.add(req.user.primaryDepartmentId);
          employees = employees.filter((e) => allowedDepts.has(e.departmentId));
        }
        employees.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return res.json({
          success: true,
          data: employees,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
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
          reportingManagerEmail,
          responsibilities,
          permissions,
          isActive,
          joiningDate,
          assignedCity,
          assignedZone,
          password,
          initialPassword,
          sendSetupEmail,
        } = req.body || {};
        const resolvedPassword = String(password || initialPassword || '').trim() || undefined;

        if (!name?.trim() || !email?.trim() || !departmentId || !designationId) {
          return next(
            new AppError(
              'Missing required employee fields: name, email, departmentId, designationId.',
              400,
              'BAD_REQUEST'
            )
          );
        }

        if (!req.user?.isSuperAdmin) {
          if (
            req.body?.isSuperAdmin === true ||
            req.body?.adminSubRole === 'SUPER_ADMIN' ||
            (Array.isArray(req.body?.founderRoles) && req.body.founderRoles.includes('SUPER_ADMIN'))
          ) {
            return next(
              new AppError(
                'Only an active Super Admin may grant Super Admin privileges.',
                403,
                'PRIVILEGE_ESCALATION_BLOCKED'
              )
            );
          }
          const requestedPerms: PermissionCode[] = Array.isArray(permissions)
            ? (permissions as PermissionCode[])
            : [];
          const forbidden = requestedPerms.filter(
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
          const actorDepts = new Set(req.user?.departmentIds || []);
          if (req.user?.primaryDepartmentId) actorDepts.add(req.user.primaryDepartmentId);
          if (!actorDepts.has(String(departmentId))) {
            return next(
              new AppError(
                'You can only hire/manage employees within your assigned department.',
                403,
                'FORBIDDEN'
              )
            );
          }
        }

        const cleanEmail = normalizeEmail(email);
        const [deptSnap, desigSnap] = await Promise.all([
          db.collection('departments').doc(departmentId).get(),
          db.collection('designations').doc(designationId).get(),
        ]);

        if (!deptSnap.exists) {
          return next(new AppError(`Department not found: ${departmentId}`, 404, 'NOT_FOUND'));
        }
        if (!desigSnap.exists) {
          return next(new AppError(`Designation not found: ${designationId}`, 404, 'NOT_FOUND'));
        }

        const dept = deptSnap.data() as DepartmentRecord;
        const desig = desigSnap.data() as DesignationRecord;
        const now = new Date().toISOString();
        const existingCodes = employeeId?.trim() ? [] : await collectExistingAssignedCodes();
        const resolvedEmpId = normalizeIdentifierCode(
          employeeId?.trim() ||
            generateRoleAssignedId({
              role: UserRole.ADMIN,
              isEmployee: true,
              existingCodes,
            })
        );
        const resolvedPerms: PermissionCode[] =
          Array.isArray(permissions) && permissions.length > 0
            ? permissions
            : desig.defaultPermissions;

        if (!req.user?.isSuperAdmin) {
          const forbiddenDefault = resolvedPerms.filter(
            (p) =>
              p === 'FULL_PLATFORM_CONTROL' ||
              p === 'MANAGE_FOUNDER_SEATS' ||
              p === 'MANAGE_SYSTEM_SECURITY' ||
              p === 'APPROVE_SENSITIVE_ACTIONS'
          );
          if (forbiddenDefault.length > 0) {
            return next(
              new AppError(
                `Only Super Admin may grant sensitive system permissions: ${forbiddenDefault.join(', ')}`,
                403,
                'PRIVILEGE_ESCALATION_BLOCKED'
              )
            );
          }
        }
        const resolvedResponsibilities: string[] =
          Array.isArray(responsibilities) && responsibilities.length > 0
            ? responsibilities
            : desig.defaultResponsibilities;

        const userProfile = await createOrUpdateManagedUser(
          {
            email: cleanEmail,
            displayName: name.trim(),
            phoneNumber: phoneNumber?.trim() || undefined,
            role: UserRole.ADMIN,
            adminSubRole: 'DEPARTMENT_EMPLOYEE',
            isSuperAdmin: false,
            employeeId: resolvedEmpId,
            userCode: resolvedEmpId,
            primaryDepartmentId: departmentId,
            departmentIds: [departmentId],
            designationId: desig.id,
            designationTitle: desig.title,
            responsibilities: resolvedResponsibilities,
            permissions: resolvedPerms,
            assignedCity: assignedCity?.trim() || undefined,
            assignedZone: assignedZone?.trim() || undefined,
            joiningDate: joiningDate || now.slice(0, 10),
            ...(resolvedPassword ? { password: resolvedPassword } : {}),
            isActive: isActive !== false,
          },
          {
            uid: req.user?.uid,
            email: req.user?.email,
            displayName: req.user?.displayName,
            role: req.user?.role,
            isSuperAdmin: req.user?.isSuperAdmin,
            ...getRequestClientMeta(req),
          }
        );

        const docId = `emp_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
        const existingEmp = await db.collection('employees').doc(docId).get();
        const empRecord: EmployeeRecord = {
          id: docId,
          employeeId: resolvedEmpId,
          userCode: userProfile.userCode || resolvedEmpId,
          userCodeUpper: normalizeIdentifierCode(userProfile.userCode || resolvedEmpId),
          userId: userProfile.id,
          email: cleanEmail,
          name: name.trim(),
          ...(phoneNumber?.trim() ? { phoneNumber: phoneNumber.trim() } : {}),
          departmentId,
          departmentName: dept.name,
          designationId: desig.id,
          designationTitle: desig.title,
          reportingManagerEmail: userProfile.reportingManagerEmail || dept.headEmail || ADMIN_EMAIL,
          reportingManagerName: userProfile.reportingManagerName || dept.headName || 'Department Head',
          responsibilities: resolvedResponsibilities,
          permissions: resolveEffectivePermissions(userProfile, ADMIN_EMAIL),
          isSuperAdmin: false,
          isFounderSeat: false,
          status: isActive === false ? 'INACTIVE' : 'ACTIVE',
          isActive: isActive !== false,
          canSignIn: isActive !== false,
          joiningDate: joiningDate || now.slice(0, 10),
          ...(assignedCity?.trim() ? { assignedCity: assignedCity.trim() } : {}),
          ...(assignedZone?.trim() ? { assignedZone: assignedZone.trim() } : {}),
          createdBy: existingEmp.exists
            ? (existingEmp.data() as EmployeeRecord).createdBy
            : req.user?.email || ADMIN_EMAIL,
          createdAt: existingEmp.exists
            ? (existingEmp.data() as EmployeeRecord).createdAt
            : now,
          updatedAt: now,
        };

        await db.collection('employees').doc(docId).set(empRecord, { merge: true });

        if (sendSetupEmail && !resolvedPassword) {
          const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
          await requestPasswordReset(cleanEmail, origin, 'WEB', {
            uid: req.user?.uid,
            email: req.user?.email,
            displayName: req.user?.displayName,
          }).catch((e) => console.warn('Employee password setup mail skipped:', e));
        }

        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: req.user?.role,
          action: existingEmp.exists ? 'EMPLOYEE_UPDATED' : 'EMPLOYEE_CREATED',
          resourceType: 'EMPLOYEE',
          resourceId: docId,
          departmentId,
          severity: 'SENSITIVE',
          summary: `${existingEmp.exists ? 'Updated' : 'Onboarded'} employee ${empRecord.name} (${empRecord.designationTitle} — ${dept.name})`,
          ...getRequestClientMeta(req),
        });

        return res.status(existingEmp.exists ? 200 : 201).json({
          success: true,
          data: empRecord,
          message: `Employee ${empRecord.name} saved under ${dept.name}.`,
          timestamp: now,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.patch(
    '/employees/:id',
    requirePermissions('MANAGE_EMPLOYEES'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('employees').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError(`Employee not found: ${req.params.id}`, 404, 'NOT_FOUND'));
        }
        const existing = snap.data() as EmployeeRecord;
        const updates = req.body || {};

        if (!req.user?.isSuperAdmin) {
          if (
            updates?.isSuperAdmin === true ||
            updates?.adminSubRole === 'SUPER_ADMIN' ||
            (Array.isArray(updates?.founderRoles) && updates.founderRoles.includes('SUPER_ADMIN'))
          ) {
            return next(
              new AppError(
                'Only an active Super Admin may grant Super Admin privileges.',
                403,
                'PRIVILEGE_ESCALATION_BLOCKED'
              )
            );
          }
          const forbidden = (Array.isArray(updates.permissions) ? updates.permissions : []).filter(
            (p: PermissionCode) =>
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
          const actorDepts = new Set(req.user?.departmentIds || []);
          if (req.user?.primaryDepartmentId) actorDepts.add(req.user.primaryDepartmentId);
          if (
            !actorDepts.has(existing.departmentId) ||
            (updates.departmentId && !actorDepts.has(String(updates.departmentId)))
          ) {
            return next(
              new AppError(
                'You can only manage employees within your assigned department.',
                403,
                'FORBIDDEN'
              )
            );
          }
        }

        const now = new Date().toISOString();

        const nextDeptId = updates.departmentId || existing.departmentId;
        const nextDesigId = updates.designationId || existing.designationId;
        const [deptSnap, desigSnap] = await Promise.all([
          db.collection('departments').doc(nextDeptId).get(),
          db.collection('designations').doc(nextDesigId).get(),
        ]);

        const deptName = deptSnap.exists
          ? (deptSnap.data() as DepartmentRecord).name
          : existing.departmentName;
        const desigTitle = desigSnap.exists
          ? (desigSnap.data() as DesignationRecord).title
          : existing.designationTitle;

        const nextPerms: PermissionCode[] = Array.isArray(updates.permissions)
          ? updates.permissions
          : existing.permissions;
        const nextActive =
          typeof updates.isActive === 'boolean' ? updates.isActive : existing.isActive;

        const syncedProfile = await updateManagedUserStatus(
          existing.email,
          {
            isActive: nextActive,
            primaryDepartmentId: nextDeptId,
            departmentIds: [nextDeptId],
            designationId: nextDesigId,
            designationTitle: desigTitle,
            permissions: nextPerms,
          },
          {
            uid: req.user?.uid,
            email: req.user?.email,
            displayName: req.user?.displayName,
            role: req.user?.role,
            isSuperAdmin: req.user?.isSuperAdmin,
            ...getRequestClientMeta(req),
          }
        );

        const nextEmp: EmployeeRecord = {
          ...existing,
          ...(updates.employeeId?.trim() ? { employeeId: updates.employeeId.trim() } : {}),
          ...(updates.name?.trim() ? { name: updates.name.trim() } : {}),
          ...(updates.phoneNumber !== undefined ? { phoneNumber: updates.phoneNumber } : {}),
          departmentId: nextDeptId,
          departmentName: deptName,
          designationId: nextDesigId,
          designationTitle: desigTitle,
          reportingManagerEmail: syncedProfile.reportingManagerEmail || existing.reportingManagerEmail,
          reportingManagerName: syncedProfile.reportingManagerName || existing.reportingManagerName,
          ...(Array.isArray(updates.responsibilities)
            ? { responsibilities: updates.responsibilities }
            : {}),
          permissions: resolveEffectivePermissions(syncedProfile, ADMIN_EMAIL),
          ...(updates.assignedCity !== undefined ? { assignedCity: updates.assignedCity } : {}),
          ...(updates.assignedZone !== undefined ? { assignedZone: updates.assignedZone } : {}),
          ...(updates.joiningDate ? { joiningDate: updates.joiningDate } : {}),
          isActive: nextActive,
          canSignIn: nextActive,
          status: updates.status || (nextActive ? 'ACTIVE' : 'INACTIVE'),
          updatedAt: now,
        };

        await ref.set(nextEmp, { merge: true });

        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: req.user?.role,
          action: 'EMPLOYEE_UPDATED',
          resourceType: 'EMPLOYEE',
          resourceId: req.params.id,
          departmentId: nextDeptId,
          severity: 'SENSITIVE',
          summary: `Updated employee ${nextEmp.name} (${nextEmp.designationTitle}, active=${nextActive})`,
          ...getRequestClientMeta(req),
        });

        return res.json({
          success: true,
          data: nextEmp,
          message: `Updated ${nextEmp.name}`,
          timestamp: now,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
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

        const empRef = db.collection('employees').doc(req.params.id);
        const empSnap = await empRef.get();
        if (!empSnap.exists) {
          return next(new AppError(`Employee not found: ${req.params.id}`, 404, 'NOT_FOUND'));
        }
        const existing = empSnap.data() as EmployeeRecord;
        const [deptSnap, desigSnap] = await Promise.all([
          db.collection('departments').doc(departmentId).get(),
          db.collection('designations').doc(designationId).get(),
        ]);
        if (!deptSnap.exists || !desigSnap.exists) {
          return next(new AppError('Target department or designation not found.', 404, 'NOT_FOUND'));
        }

        const dept = deptSnap.data() as DepartmentRecord;
        const desig = desigSnap.data() as DesignationRecord;
        const now = new Date().toISOString();
        const nextPerms: PermissionCode[] =
          Array.isArray(permissions) && permissions.length > 0
            ? permissions
            : desig.defaultPermissions;

        if (!req.user?.isSuperAdmin) {
          const actorDepts = new Set(req.user?.departmentIds || []);
          if (req.user?.primaryDepartmentId) actorDepts.add(req.user.primaryDepartmentId);
          if (!actorDepts.has(existing.departmentId) || !actorDepts.has(dept.id)) {
            return next(
              new AppError(
                'Cross-department employee transfers require Super Admin approval.',
                403,
                'FORBIDDEN'
              )
            );
          }
          const forbidden = nextPerms.filter(
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
            displayName: req.user?.displayName,
            role: req.user?.role,
            isSuperAdmin: req.user?.isSuperAdmin,
          }
        );

        const transferred: EmployeeRecord = {
          ...existing,
          departmentId: dept.id,
          departmentName: dept.name,
          designationId: desig.id,
          designationTitle: desig.title,
          reportingManagerEmail: syncedProfile.reportingManagerEmail || dept.headEmail || ADMIN_EMAIL,
          reportingManagerName: syncedProfile.reportingManagerName || dept.headName,
          permissions: syncedProfile.permissions || nextPerms,
          status: existing.isActive ? 'ACTIVE' : 'INACTIVE',
          updatedAt: now,
        };

        await empRef.set(transferred, { merge: true });

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
          ...getRequestClientMeta(req),
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

  router.post(
    '/employees/:id/status',
    requirePermissions('MANAGE_EMPLOYEES'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { isActive } = req.body || {};
        if (typeof isActive !== 'boolean') {
          return next(new AppError('Boolean field isActive is required.', 400, 'BAD_REQUEST'));
        }
        const empRef = db.collection('employees').doc(req.params.id);
        const empSnap = await empRef.get();
        if (!empSnap.exists) {
          return next(new AppError(`Employee not found: ${req.params.id}`, 404, 'NOT_FOUND'));
        }
        const existing = empSnap.data() as EmployeeRecord;
        const now = new Date().toISOString();

        await empRef.set(
          {
            isActive,
            canSignIn: isActive,
            status: isActive ? 'ACTIVE' : 'INACTIVE',
            updatedAt: now,
          },
          { merge: true }
        );

        const updatedUser = await updateManagedUserStatus(
          existing.email,
          { isActive },
          {
            uid: req.user?.uid,
            email: req.user?.email,
            displayName: req.user?.displayName,
            role: req.user?.role,
            isSuperAdmin: req.user?.isSuperAdmin,
          }
        );

        if (!isActive && updatedUser.id) {
          await auth.revokeRefreshTokens(updatedUser.id).catch(() => { });
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
          ...getRequestClientMeta(req),
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

  router.post(
    '/employees/:id/reset-password',
    requirePermissions('MANAGE_EMPLOYEES'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const empSnap = await db.collection('employees').doc(req.params.id).get();
        if (!empSnap.exists) {
          return next(new AppError(`Employee not found: ${req.params.id}`, 404, 'NOT_FOUND'));
        }
        const emp = empSnap.data() as EmployeeRecord;
        const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
        const result = await requestPasswordReset(emp.email, origin, 'WEB', {
          uid: req.user?.uid,
          email: req.user?.email,
          displayName: req.user?.displayName,
          role: req.user?.role,
          ...getRequestClientMeta(req),
        });

        return res.json({
          success: true,
          data: result,
          message: `Password reset email sent to ${emp.email}.`,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.get(
    '/employees/:id/activity',
    requireAnyPermission('MANAGE_EMPLOYEES', 'VIEW_AUDIT_LOGS', 'VIEW_LOGIN_HISTORY'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const empSnap = await db.collection('employees').doc(req.params.id).get();
        if (!empSnap.exists) {
          return next(new AppError(`Employee not found: ${req.params.id}`, 404, 'NOT_FOUND'));
        }
        const emp = empSnap.data() as EmployeeRecord;

        const [auditSnap, loginSnap] = await Promise.all([
          db
            .collection('audit_logs')
            .where('actorEmail', '==', normalizeEmail(emp.email))
            .limit(40)
            .get(),
          db
            .collection('login_history')
            .where('email', '==', normalizeEmail(emp.email))
            .limit(40)
            .get(),
        ]);

        const canViewLogins =
          Boolean(req.user?.isSuperAdmin) ||
          Boolean(req.user?.permissions.includes('VIEW_LOGIN_HISTORY'));

        return res.json({
          success: true,
          data: {
            employee: emp,
            auditLogs: auditSnap.docs
              .map((d) => d.data())
              .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
            loginHistory: canViewLogins
              ? loginSnap.docs
                .map((d) => d.data())
                .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
              : [],
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

export { DEFAULT_DEPARTMENTS };
export type { CoreDepartmentId };
