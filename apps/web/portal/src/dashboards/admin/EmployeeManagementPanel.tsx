import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DEFAULT_SUPER_ADMIN_EMAIL,
  generateStrongInitialPassword,
  hasPermission,
  isEffectiveSuperAdmin,
  PERMISSION_CATALOG,
  resolveReportingManagerForRole,
  type EmployeeRecord,
  type PermissionCode,
  type ServiceZoneRecord,
  type UserProfile,
  UserRole,
} from '@diagnostic/shared';
import { computeNextAssignedIdForRole } from '../../services/firestoreService';
import { type DynamicAlertVariant } from '../../components/DynamicAlertModal';
import {
  createEmployeeApi,
  getEmployeeActivityApi,
  getOrgOverviewApi,
  getServiceZonesApi,
  resetEmployeePasswordApi,
  setManagedUserInitialPasswordApi,
  toggleEmployeeStatusApi,
  transferEmployeeApi,
  updateEmployeeApi,
  type EmployeeActivityData,
  type OrgOverviewData,
} from '../../services/orgApiService';

type AlertTriggerFn = (opts: {
  variant: DynamicAlertVariant;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
}) => void;

interface EmployeeManagementPanelProps {
  currentUser: UserProfile;
  bearerToken?: string;
  onShowAlert: AlertTriggerFn;
}

const SENSITIVE_SYSTEM_PERMS: PermissionCode[] = [
  'FULL_PLATFORM_CONTROL',
  'MANAGE_FOUNDER_SEATS',
  'MANAGE_SYSTEM_SECURITY',
  'APPROVE_SENSITIVE_ACTIONS',
];

export function EmployeeManagementPanel({
  currentUser,
  bearerToken,
  onShowAlert,
}: EmployeeManagementPanelProps) {
  const [data, setData] = useState<OrgOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Add / Edit Employee Modal
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<EmployeeRecord | null>(null);
  const [empCode, setEmpCode] = useState('');
  const [empName, setEmpName] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empDeptId, setEmpDeptId] = useState('FINANCE_BUSINESS');
  const [empDesigId, setEmpDesigId] = useState('');
  const [empInitialPassword, setEmpInitialPassword] = useState('');
  const [showEmpPassword, setShowEmpPassword] = useState(false);
  const [empCity, setEmpCity] = useState('');
  const [empZone, setEmpZone] = useState('');
  const [empJoiningDate, setEmpJoiningDate] = useState('');
  const [empPermissions, setEmpPermissions] = useState<PermissionCode[]>([]);
  const [empSendSetupEmail, setEmpSendSetupEmail] = useState(true);
  const [savingEmp, setSavingEmp] = useState(false);
  const [serviceZones, setServiceZones] = useState<ServiceZoneRecord[]>([]);

  // Initial Password Modal & Credential Slip
  const [passwordTargetEmp, setPasswordTargetEmp] = useState<EmployeeRecord | null>(null);
  const [modalInitialPassword, setModalInitialPassword] = useState('');
  const [showModalPassword, setShowModalPassword] = useState(false);
  const [modalSendPwdEmail, setModalSendPwdEmail] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);
  const [credentialSlip, setCredentialSlip] = useState<{
    name: string;
    email: string;
    userCode: string;
    designationTitle: string;
    departmentName: string;
    reportingManagerLabel: string;
    initialPassword?: string;
    copiedField?: string;
  } | null>(null);

  // Transfer Modal
  const [transferEmp, setTransferEmp] = useState<EmployeeRecord | null>(null);
  const [trDeptId, setTrDeptId] = useState('');
  const [trDesigId, setTrDesigId] = useState('');
  const [trPermissions, setTrPermissions] = useState<PermissionCode[]>([]);
  const [trReason, setTrReason] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Activity Modal
  const [activityEmp, setActivityEmp] = useState<EmployeeRecord | null>(null);
  const [activityData, setActivityData] = useState<EmployeeActivityData | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const isSuperAdmin = useMemo(
    () => isEffectiveSuperAdmin(currentUser, DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser]
  );
  const canManageEmployees = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_EMPLOYEES', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [orgRes, zonesRes] = await Promise.allSettled([
        getOrgOverviewApi(bearerToken),
        getServiceZonesApi(false, bearerToken),
      ]);
      if (orgRes.status === 'fulfilled') {
        setData(orgRes.value.data);
      } else {
        throw orgRes.reason;
      }
      if (zonesRes.status === 'fulfilled') {
        setServiceZones(zonesRes.value.data || []);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load employees.');
    } finally {
      setLoading(false);
    }
  }, [bearerToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const allowedDepartments = useMemo(() => {
    const allDepts = data?.departments || [];
    if (isSuperAdmin) return allDepts;
    return allDepts.filter(
      (d) =>
        currentUser.primaryDepartmentId === d.id ||
        currentUser.departmentIds?.includes(d.id)
    );
  }, [data, isSuperAdmin, currentUser]);

  const designationsGroupedByDept = useMemo(() => {
    const allowedIds = new Set(allowedDepartments.map((d) => d.id));
    return (data?.departments || [])
      .filter((d) => allowedIds.has(d.id))
      .map((dept) => ({
        dept,
        designations: (data?.designations || []).filter(
          (desig) => desig.departmentId === dept.id && desig.isActive
        ),
      }))
      .filter((g) => g.designations.length > 0);
  }, [data, allowedDepartments]);

  const availableZoneCities = useMemo(() => {
    const set = new Set<string>();
    for (const z of serviceZones) {
      if (z.city?.trim()) set.add(z.city.trim());
    }
    return Array.from(set).sort();
  }, [serviceZones]);

  const availableZonesForCity = useMemo(() => {
    const cleanCity = empCity.trim().toLowerCase();
    return serviceZones.filter(
      (z) => !cleanCity || z.city.trim().toLowerCase() === cleanCity
    );
  }, [serviceZones, empCity]);

  const autoAssignedManager = useMemo(
    () =>
      resolveReportingManagerForRole({
        role: UserRole.ADMIN,
        adminSubRole: 'DEPARTMENT_EMPLOYEE',
        primaryDepartmentId: empDeptId,
        targetEmail: empEmail,
        departments: data?.departments,
        founderSeats: data?.founderSeats,
        rootAdminEmail: DEFAULT_SUPER_ADMIN_EMAIL,
      }),
    [empDeptId, empEmail, data]
  );

  const autoTransferManager = useMemo(
    () =>
      resolveReportingManagerForRole({
        role: UserRole.ADMIN,
        adminSubRole: 'DEPARTMENT_EMPLOYEE',
        primaryDepartmentId: trDeptId,
        targetEmail: transferEmp?.email,
        departments: data?.departments,
        founderSeats: data?.founderSeats,
        rootAdminEmail: DEFAULT_SUPER_ADMIN_EMAIL,
      }),
    [trDeptId, transferEmp?.email, data]
  );

  const designationsForTransferDept = useMemo(
    () => (data?.designations || []).filter((d) => d.departmentId === trDeptId && d.isActive),
    [data, trDeptId]
  );

  const permissionGroups = useMemo(() => {
    const groups: Record<string, typeof PERMISSION_CATALOG> = {};
    for (const item of PERMISSION_CATALOG) {
      groups[item.group] = groups[item.group] || [];
      groups[item.group].push(item);
    }
    return Object.entries(groups);
  }, []);

  const filteredEmployees = useMemo(() => {
    return (data?.employees || []).filter((e) => {
      if (deptFilter !== 'ALL' && e.departmentId !== deptFilter) return false;
      if (statusFilter === 'ACTIVE' && !e.isActive) return false;
      if (statusFilter === 'INACTIVE' && e.isActive) return false;
      return true;
    });
  }, [data, deptFilter, statusFilter]);

  function filterAllowedPermissions(perms: PermissionCode[]): PermissionCode[] {
    if (isSuperAdmin) return perms;
    return perms.filter((p) => !SENSITIVE_SYSTEM_PERMS.includes(p));
  }

  function openAddEmployeeModal() {
    const defaultDept = allowedDepartments[0] || data?.departments[0];
    const deptId = defaultDept?.id || 'FINANCE_BUSINESS';
    const matchingDesigs = (data?.designations || []).filter(
      (d) => d.departmentId === deptId && d.isActive
    );
    const firstDesig = matchingDesigs[0];
    const autoNextEmpCode = computeNextAssignedIdForRole({
      role: UserRole.ADMIN,
      isEmployee: true,
      existingCodes: (data?.employees || []).map((emp) => emp.userCode || emp.employeeId),
    });

    setEditingEmp(null);
    setEmpCode(autoNextEmpCode);
    setEmpName('');
    setEmpEmail('');
    setEmpPhone('');
    setEmpDeptId(deptId);
    setEmpDesigId(firstDesig?.id || '');
    setEmpInitialPassword('');
    setShowEmpPassword(false);
    setEmpCity('');
    setEmpZone('');
    setEmpJoiningDate(new Date().toISOString().slice(0, 10));
    setEmpPermissions(filterAllowedPermissions(firstDesig?.defaultPermissions || []));
    setEmpSendSetupEmail(true);
    setShowEmpModal(true);
  }

  function openEditEmployeeModal(emp: EmployeeRecord) {
    setEditingEmp(emp);
    setEmpCode(emp.employeeId);
    setEmpName(emp.name);
    setEmpEmail(emp.email);
    setEmpPhone(emp.phoneNumber || '');
    setEmpDeptId(emp.departmentId);
    setEmpDesigId(emp.designationId);
    setEmpInitialPassword('');
    setShowEmpPassword(false);
    setEmpCity(emp.assignedCity || '');
    setEmpZone(emp.assignedZone || '');
    setEmpJoiningDate(emp.joiningDate);
    setEmpPermissions(filterAllowedPermissions([...(emp.permissions || [])]));
    setEmpSendSetupEmail(false);
    setShowEmpModal(true);
  }

  function handleDepartmentChangeInModal(nextDeptId: string) {
    setEmpDeptId(nextDeptId);
    const desigs = (data?.designations || []).filter(
      (d) => d.departmentId === nextDeptId && d.isActive
    );
    const nextDesig = desigs[0];
    setEmpDesigId(nextDesig?.id || '');
    setEmpPermissions(filterAllowedPermissions(nextDesig?.defaultPermissions || []));
  }

  function handleDesignationChangeInModal(nextDesigId: string) {
    setEmpDesigId(nextDesigId);
    const desig = (data?.designations || []).find((d) => d.id === nextDesigId);
    if (desig) {
      setEmpDeptId(desig.departmentId);
      setEmpPermissions(filterAllowedPermissions([...desig.defaultPermissions]));
    }
  }

  async function copySlipField(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCredentialSlip((prev) => (prev ? { ...prev, copiedField: label } : prev));
    } catch {
      // Clipboard fallback ignored silently
    }
  }

  function openSetPasswordModal(emp: EmployeeRecord) {
    setPasswordTargetEmp(emp);
    setModalInitialPassword('');
    setShowModalPassword(true);
    setModalSendPwdEmail(true);
  }

  async function handleSaveInitialPassword(e: FormEvent) {
    e.preventDefault();
    if (!passwordTargetEmp || modalInitialPassword.trim().length < 6) return;
    setSavingPassword(true);
    const enteredPwd = modalInitialPassword.trim();
    try {
      await setManagedUserInitialPasswordApi(
        passwordTargetEmp.email,
        {
          password: enteredPwd,
          mustChangePassword: true,
          sendNotificationEmail: modalSendPwdEmail,
        },
        bearerToken
      );
      const target = passwordTargetEmp;
      setPasswordTargetEmp(null);
      setCredentialSlip({
        name: target.name,
        email: target.email,
        userCode: target.userCode || target.employeeId,
        designationTitle: target.designationTitle,
        departmentName: target.departmentName,
        reportingManagerLabel: target.reportingManagerEmail
          ? `${target.reportingManagerName || 'Department Head'} (${target.reportingManagerEmail})`
          : target.reportingManagerName || 'Department Head',
        initialPassword: enteredPwd,
      });
      await loadData();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Password Setup Failed',
        message: err instanceof Error ? err.message : 'Unable to configure initial password.',
      });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleSaveEmployee(e: FormEvent) {
    e.preventDefault();
    if (!empName.trim() || !empEmail.trim() || !empDeptId || !empDesigId) return;
    const cleanedPassword = empInitialPassword.trim();
    if (!editingEmp && cleanedPassword && cleanedPassword.length < 6) {
      onShowAlert({
        variant: 'warning',
        title: 'Password Too Short',
        message: 'Initial password must be at least 6 characters long (or leave blank to send a setup link).',
      });
      return;
    }

    setSavingEmp(true);
    try {
      const selectedDesig = (data?.designations || []).find((d) => d.id === empDesigId);
      const selectedDept = (data?.departments || []).find((d) => d.id === empDeptId);
      if (editingEmp) {
        const res = await updateEmployeeApi(
          editingEmp.id,
          {
            name: empName.trim(),
            phoneNumber: empPhone.trim() || undefined,
            departmentId: empDeptId,
            designationId: empDesigId,
            assignedCity: empCity.trim() || undefined,
            assignedZone: empZone.trim() || undefined,
            permissions: empPermissions,
          },
          bearerToken
        );
        onShowAlert({
          variant: 'success',
          title: 'Employee Access Updated',
          message: res.message || `Updated permissions and profile for ${empName.trim()}.`,
          detail: `Reporting manager automatically synchronized to ${autoAssignedManager.reportsToLabel}.`,
        });
      } else {
        const res = await createEmployeeApi(
          {
            employeeId: empCode.trim() || undefined,
            name: empName.trim(),
            email: empEmail.trim().toLowerCase(),
            phoneNumber: empPhone.trim() || undefined,
            departmentId: empDeptId,
            designationId: empDesigId,
            responsibilities: selectedDesig?.defaultResponsibilities,
            permissions: empPermissions,
            joiningDate: empJoiningDate || undefined,
            assignedCity: empCity.trim() || undefined,
            assignedZone: empZone.trim() || undefined,
            ...(cleanedPassword ? { initialPassword: cleanedPassword } : {}),
            sendPasswordSetupEmail: empSendSetupEmail,
          },
          bearerToken
        );
        const createdEmp = res.data;
        setShowEmpModal(false);
        setCredentialSlip({
          name: createdEmp?.name || empName.trim(),
          email: createdEmp?.email || empEmail.trim().toLowerCase(),
          userCode: createdEmp?.userCode || createdEmp?.employeeId || empCode.trim(),
          designationTitle: createdEmp?.designationTitle || selectedDesig?.title || '',
          departmentName: createdEmp?.departmentName || selectedDept?.name || empDeptId,
          reportingManagerLabel: autoAssignedManager.reportsToLabel,
          ...(cleanedPassword ? { initialPassword: cleanedPassword } : {}),
        });
        await loadData();
        return;
      }
      setShowEmpModal(false);
      await loadData();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Could Not Save Employee',
        message: err instanceof Error ? err.message : 'Unable to save employee access.',
      });
    } finally {
      setSavingEmp(false);
    }
  }

  function openTransferModal(emp: EmployeeRecord) {
    setTransferEmp(emp);
    setTrDeptId(emp.departmentId);
    setTrDesigId(emp.designationId);
    setTrPermissions(filterAllowedPermissions([...emp.permissions]));
    setTrReason('');
  }

  async function handleTransferSubmit(e: FormEvent) {
    e.preventDefault();
    if (!transferEmp || !trDeptId || !trDesigId) return;
    setTransferring(true);
    try {
      const res = await transferEmployeeApi(
        transferEmp.id,
        {
          departmentId: trDeptId,
          designationId: trDesigId,
          permissions: trPermissions,
          reason: trReason.trim() || undefined,
        },
        bearerToken
      );
      setTransferEmp(null);
      onShowAlert({
        variant: 'success',
        title: 'Department Transfer Complete',
        message: res.message || `${transferEmp.name} transferred cleanly.`,
      });
      await loadData();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Transfer Failed',
        message: err instanceof Error ? err.message : 'Could not complete department transfer.',
      });
    } finally {
      setTransferring(false);
    }
  }

  async function handleViewActivity(emp: EmployeeRecord) {
    setActivityEmp(emp);
    setActivityData(null);
    setLoadingActivity(true);
    try {
      const res = await getEmployeeActivityApi(emp.id, bearerToken);
      setActivityData(res.data);
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Could Not Load Activity',
        message: err instanceof Error ? err.message : 'Unable to fetch activity history.',
      });
      setActivityEmp(null);
    } finally {
      setLoadingActivity(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="chart-card-modern">
        <h2 className="card-top-title">Employees &amp; Role Access Directory</h2>
        <p style={{ color: '#64748B', fontSize: '0.86rem', marginTop: '8px' }}>
          Loading staff roster and permission policies...
        </p>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="chart-card-modern">
        <div className="admin-auth-alert error">{errorMsg}</div>
        <button type="button" className="btn-primary" onClick={() => void loadData()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header-row" style={{ marginBottom: 0 }}>
        <div className="page-title-group">
          <h1>Employees &amp; Granular Access Matrix</h1>
          <p>
            Onboard future staff across departments using pre-configured designations and explicit permission bundles. Zero dummy profiles created at launch.
          </p>
        </div>
        {canManageEmployees && (
          <button type="button" className="btn-primary" onClick={openAddEmployeeModal}>
            + Add Team Member
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="chart-card-modern" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((st) => (
              <button
                key={st}
                type="button"
                className={statusFilter === st ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setStatusFilter(st)}
              >
                {st === 'ALL' ? `All (${data?.employees.length || 0})` : st}
              </button>
            ))}
          </div>
          <select
            className="form-select"
            style={{ width: '240px' }}
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="ALL">All Departments</option>
            {(data?.departments || []).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Employees Table / Empty State */}
      <div className="chart-card-modern">
        {filteredEmployees.length === 0 ? (
          <div className="empty-state-box">
            <h4>0 Employees Added Yet</h4>
            <p>
              Initially, all 4 department scopes are handled directly by the founder team. Use
              &ldquo;+ Add Team Member&rdquo; whenever you hire into one of the 26 future designations.
            </p>
            {canManageEmployees && (
              <button type="button" className="btn-primary" onClick={openAddEmployeeModal}>
                + Onboard First Team Member
              </button>
            )}
          </div>
        ) : (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department &amp; Designation</th>
                  <th>Reporting Manager</th>
                  <th>Permissions</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      <strong>{emp.name}</strong>
                      <div style={{ fontSize: '0.74rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                        <span className="user-code-badge">{emp.userCode || emp.employeeId}</span>
                        <span>• {emp.email}</span>
                      </div>
                      {(emp.assignedCity || emp.assignedZone) && (
                        <div style={{ fontSize: '0.72rem', color: '#0F766E' }}>
                          Territory: {[emp.assignedCity, emp.assignedZone].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{emp.designationTitle}</div>
                      <div style={{ fontSize: '0.74rem', color: '#64748B' }}>{emp.departmentName}</div>
                    </td>
                    <td>
                      <div>{emp.reportingManagerName || 'Department Head'}</div>
                      {emp.reportingManagerEmail && (
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{emp.reportingManagerEmail}</div>
                      )}
                    </td>
                    <td>
                      <span className="status-pill-blue">{emp.permissions.length} granted</span>
                    </td>
                    <td>
                      <span className={emp.isActive ? 'status-pill-green' : 'status-pill-red'}>
                        {emp.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {canManageEmployees && (
                          <>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => openEditEmployeeModal(emp)}
                            >
                              Edit Access
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => openTransferModal(emp)}
                            >
                              Transfer
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() =>
                                onShowAlert({
                                  variant: 'confirm',
                                  title: emp.isActive ? `Deactivate ${emp.name}?` : `Reactivate ${emp.name}?`,
                                  message: emp.isActive
                                    ? `Revoke sign-in sessions and deactivate ${emp.email}?`
                                    : `Restore dashboard sign-in access for ${emp.email}?`,
                                  onConfirm: () => {
                                    void toggleEmployeeStatusApi(emp.id, !emp.isActive, bearerToken)
                                      .then((r) => {
                                        onShowAlert({
                                          variant: 'success',
                                          title: 'Status Updated',
                                          message: r.message || 'Employee status updated.',
                                        });
                                        return loadData();
                                      })
                                      .catch((err) =>
                                        onShowAlert({
                                          variant: 'error',
                                          title: 'Failed',
                                          message: err instanceof Error ? err.message : 'Status update failed.',
                                        })
                                      );
                                  },
                                })
                              }
                            >
                              {emp.isActive ? 'Deactivate' : 'Reactivate'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => openSetPasswordModal(emp)}
                            >
                              🔑 Set Password
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => {
                                void resetEmployeePasswordApi(emp.id, bearerToken)
                                  .then((r) =>
                                    onShowAlert({
                                      variant: 'success',
                                      title: 'Password Link Dispatched',
                                      message: r.message || `Password setup email queued for ${emp.email}.`,
                                    })
                                  )
                                  .catch((err) =>
                                    onShowAlert({
                                      variant: 'error',
                                      title: 'Dispatch Failed',
                                      message: err instanceof Error ? err.message : 'Unable to queue reset email.',
                                    })
                                  );
                              }}
                            >
                              Send Setup Link
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => void handleViewActivity(emp)}
                        >
                          Activity
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: ADD / EDIT EMPLOYEE */}
      {showEmpModal && (
        <div className="modal-overlay" onClick={() => !savingEmp && setShowEmpModal(false)}>
          <div className="modal-card" style={{ maxWidth: '760px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingEmp ? `Edit Access • ${editingEmp.name}` : 'Add Department Team Member'}</h3>
              <button
                type="button"
                className="btn-secondary"
                disabled={savingEmp}
                onClick={() => setShowEmpModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveEmployee(e)}>
              <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.4fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Assigned Login ID (Auto)</label>
                    <input
                      className="form-input"
                      placeholder="Auto e.g. EMP-1001"
                      value={empCode}
                      disabled={Boolean(editingEmp)}
                      onChange={(e) => setEmpCode(e.target.value)}
                    />
                    {!editingEmp && (
                      <div style={{ fontSize: '0.68rem', color: '#0F766E', marginTop: '3px' }}>
                        Can also be used to sign in alongside work email
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input
                      className="form-input"
                      value={empName}
                      onChange={(e) => setEmpName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Work Email</label>
                    <input
                      type="email"
                      className="form-input"
                      value={empEmail}
                      disabled={Boolean(editingEmp)}
                      onChange={(e) => setEmpEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Role / Designation (Auto-Assigns Dept &amp; Manager)</label>
                    <select
                      className="form-select"
                      value={empDesigId}
                      onChange={(e) => handleDesignationChangeInModal(e.target.value)}
                      required
                    >
                      <option value="">Select designation...</option>
                      {designationsGroupedByDept.map((group) => (
                        <optgroup key={group.dept.id} label={group.dept.name}>
                          {group.designations.map((d) => (
                            <option key={d.id} value={d.id}>{d.title}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department (Synced From Designation)</label>
                    <select
                      className="form-select"
                      value={empDeptId}
                      onChange={(e) => handleDepartmentChangeInModal(e.target.value)}
                    >
                      {allowedDepartments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* AUTO-ASSIGNED REPORTING MANAGER (ZERO MANUAL ENTRY) */}
                <div
                  style={{
                    background: '#F0FDFA',
                    border: '1px solid #99F6E4',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0F766E', textTransform: 'uppercase' }}>
                      Reporting Manager (Automatically Assigned by Role)
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                      {autoAssignedManager.reportsToLabel}
                    </div>
                  </div>
                  <span className="status-pill-green">AUTO-ROUTED</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input
                      className="form-input"
                      placeholder="+91 ..."
                      value={empPhone}
                      onChange={(e) => setEmpPhone(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Joining Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={empJoiningDate}
                      disabled={Boolean(editingEmp)}
                      onChange={(e) => setEmpJoiningDate(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Assigned City (Active Zones)</label>
                    <input
                      className="form-input"
                      list="emp-service-cities"
                      placeholder="e.g. Mumbai"
                      value={empCity}
                      onChange={(e) => setEmpCity(e.target.value)}
                    />
                    <datalist id="emp-service-cities">
                      {availableZoneCities.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Assigned Coverage Zone</label>
                    <input
                      className="form-input"
                      list="emp-service-zones"
                      placeholder="e.g. Andheri West Pocket"
                      value={empZone}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEmpZone(val);
                        const match = serviceZones.find(
                          (z) => z.name.trim().toLowerCase() === val.trim().toLowerCase()
                        );
                        if (match && !empCity.trim()) {
                          setEmpCity(match.city);
                        }
                      }}
                    />
                    <datalist id="emp-service-zones">
                      {availableZonesForCity.map((z) => (
                        <option key={z.id} value={z.name}>
                          {z.city} • {z.zoneCode} ({z.radiusKm} km)
                        </option>
                      ))}
                    </datalist>
                  </div>
                </div>

                {!editingEmp && (
                  <div
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      marginBottom: '12px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        marginBottom: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <label className="form-label" style={{ marginBottom: 0 }}>
                        Initial Sign-In Password (Stored Safely in Auth Vault — Never Exposed in Directory)
                      </label>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                        onClick={() => {
                          setEmpInitialPassword(generateStrongInitialPassword(12));
                          setShowEmpPassword(true);
                        }}
                      >
                        🎲 Generate Strong Password
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type={showEmpPassword ? 'text' : 'password'}
                        className="form-input"
                        placeholder="Min 6 characters (optional if using setup link / OTP)"
                        value={empInitialPassword}
                        onChange={(e) => setEmpInitialPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ whiteSpace: 'nowrap' }}
                        onClick={() => setShowEmpPassword((v) => !v)}
                      >
                        {showEmpPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">
                    Permission Matrix ({empPermissions.length} selected)
                    {!isSuperAdmin && (
                      <span style={{ color: '#D97706', fontWeight: 500, marginLeft: '8px' }}>
                        System-critical permissions require Super Admin
                      </span>
                    )}
                  </label>
                  <div className="permission-matrix-grid">
                    {permissionGroups.map(([groupKey, items]) => (
                      <div key={groupKey} className="permission-group-card">
                        <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A' }}>
                          {groupKey.replace(/_/g, ' ')}
                        </div>
                        {items.map((perm) => {
                          const checked = empPermissions.includes(perm.code);
                          const lockedForCaller =
                            !isSuperAdmin && SENSITIVE_SYSTEM_PERMS.includes(perm.code);
                          return (
                            <label
                              key={perm.code}
                              className={`permission-checkbox-item ${perm.sensitive ? 'sensitive' : ''}`}
                              style={{ opacity: lockedForCaller ? 0.55 : 1 }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={lockedForCaller}
                                onChange={() =>
                                  setEmpPermissions((prev) =>
                                    checked
                                      ? prev.filter((p) => p !== perm.code)
                                      : [...prev, perm.code]
                                  )
                                }
                              />
                              <div>
                                <div style={{ fontWeight: 600 }}>{perm.label}</div>
                                <div style={{ fontSize: '0.69rem', color: '#64748B' }}>
                                  {perm.sensitive ? 'Sensitive' : 'Standard'}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {!editingEmp && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={empSendSetupEmail}
                      onChange={(e) => setEmpSendSetupEmail(e.target.checked)}
                    />
                    Dispatch secure password setup email link upon creation
                  </label>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={savingEmp}
                  onClick={() => setShowEmpModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={savingEmp}>
                  {savingEmp
                    ? 'Saving...'
                    : editingEmp
                    ? 'Save Updated Access'
                    : 'Create Employee Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TRANSFER EMPLOYEE DEPARTMENT */}
      {transferEmp && (
        <div className="modal-overlay" onClick={() => !transferring && setTransferEmp(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Transfer Employee • {transferEmp.name}</h3>
              <button
                type="button"
                className="btn-secondary"
                disabled={transferring}
                onClick={() => setTransferEmp(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleTransferSubmit(e)}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Target Department</label>
                  <select
                    className="form-select"
                    value={trDeptId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setTrDeptId(nextId);
                      const desigs = (data?.designations || []).filter(
                        (d) => d.departmentId === nextId && d.isActive
                      );
                      setTrDesigId(desigs[0]?.id || '');
                      setTrPermissions(filterAllowedPermissions(desigs[0]?.defaultPermissions || []));
                    }}
                  >
                    {(data?.departments || []).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">New Designation</label>
                  <select
                    className="form-select"
                    value={trDesigId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setTrDesigId(nextId);
                      const found = (data?.designations || []).find((d) => d.id === nextId);
                      if (found) setTrPermissions(filterAllowedPermissions([...found.defaultPermissions]));
                    }}
                    required
                  >
                    <option value="">Select designation...</option>
                    {designationsForTransferDept.map((d) => (
                      <option key={d.id} value={d.id}>{d.title}</option>
                    ))}
                  </select>
                </div>
                <div
                  style={{
                    background: '#F0FDFA',
                    border: '1px solid #99F6E4',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0F766E', textTransform: 'uppercase' }}>
                    New Reporting Manager (Auto-Assigned)
                  </div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                    {autoTransferManager.reportsToLabel}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Transfer Reason (Audit Trail)</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Territory expansion transition"
                    value={trReason}
                    onChange={(e) => setTrReason(e.target.value)}
                  />
                </div>
                <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                  Default bundle applies <strong>{trPermissions.length}</strong> permission(s) scoped to the target designation.
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={transferring}
                  onClick={() => setTransferEmp(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={transferring}>
                  {transferring ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EMPLOYEE ACTIVITY & LOGIN HISTORY */}
      {activityEmp && (
        <div className="modal-overlay" onClick={() => setActivityEmp(null)}>
          <div className="modal-card" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3>Activity &amp; Session Trail • {activityEmp.name}</h3>
                {(activityEmp.userCode || activityEmp.employeeId) && (
                  <span className="user-code-badge">
                    {activityEmp.userCode || activityEmp.employeeId}
                  </span>
                )}
              </div>
              <button type="button" className="btn-secondary" onClick={() => setActivityEmp(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              {loadingActivity ? (
                <p style={{ fontSize: '0.84rem', color: '#64748B' }}>Loading employee audit trail...</p>
              ) : !activityData ? (
                <p style={{ fontSize: '0.84rem', color: '#64748B' }}>No activity data available.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>
                      Audit Events ({activityData.auditLogs.length})
                    </h4>
                    {activityData.auditLogs.length === 0 ? (
                      <div className="empty-state-box" style={{ padding: '18px' }}>
                        <p style={{ marginBottom: 0 }}>No actions logged yet for this member.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {activityData.auditLogs.slice(0, 15).map((log) => (
                          <div key={log.id} className="automation-run-row">
                            <div>
                              <strong>{log.action}</strong>
                              <div style={{ fontSize: '0.76rem', color: '#475569' }}>{log.summary}</div>
                            </div>
                            <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                              {new Date(log.createdAt).toLocaleString('en-IN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>
                      Login History ({activityData.loginHistory.length})
                    </h4>
                    {activityData.loginHistory.length === 0 ? (
                      <div className="empty-state-box" style={{ padding: '18px' }}>
                        <p style={{ marginBottom: 0 }}>
                          No sign-in records visible (or login history permission required).
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {activityData.loginHistory.slice(0, 15).map((lh) => (
                          <div key={lh.id} className="automation-run-row">
                            <div>
                              <strong>{lh.clientType} • {lh.authMethod}</strong>
                              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                {lh.success ? 'Verified Sign-In' : lh.failureReason || 'Blocked'}
                              </div>
                            </div>
                            <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                              {new Date(lh.createdAt).toLocaleString('en-IN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SET / UPDATE INITIAL PASSWORD */}
      {passwordTargetEmp && (
        <div
          className="modal-overlay"
          onClick={() => !savingPassword && setPasswordTargetEmp(null)}
        >
          <div className="modal-card" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Set Initial Password • {passwordTargetEmp.name}</h3>
              <button
                type="button"
                className="btn-secondary"
                disabled={savingPassword}
                onClick={() => setPasswordTargetEmp(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveInitialPassword(e)}>
              <div className="modal-body">
                <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '12px' }}>
                  Account: <strong>{passwordTargetEmp.email}</strong> ({passwordTargetEmp.userCode || passwordTargetEmp.employeeId})
                </div>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>New Initial Password</label>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                      onClick={() => {
                        setModalInitialPassword(generateStrongInitialPassword(12));
                        setShowModalPassword(true);
                      }}
                    >
                      🎲 Generate Strong Password
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type={showModalPassword ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Minimum 6 characters"
                      minLength={6}
                      required
                      value={modalInitialPassword}
                      onChange={(e) => setModalInitialPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowModalPassword((v) => !v)}
                    >
                      {showModalPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={modalSendPwdEmail}
                    onChange={(e) => setModalSendPwdEmail(e.target.checked)}
                  />
                  Notify member by email that their initial sign-in password is ready
                </label>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={savingPassword}
                  onClick={() => setPasswordTargetEmp(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingPassword || modalInitialPassword.trim().length < 6}
                >
                  {savingPassword ? 'Configuring...' : 'Save Initial Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ONBOARDING CREDENTIALS READY SLIP */}
      {credentialSlip && (
        <div className="modal-overlay" onClick={() => setCredentialSlip(null)}>
          <div className="modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Team Credentials Ready</h3>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCredentialSlip(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '0.84rem', color: '#0F766E', fontWeight: 600 }}>
                {credentialSlip.name} ({credentialSlip.designationTitle} • {credentialSlip.departmentName}) is ready.
              </div>
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '0.82rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span>
                    Assigned ID: <strong>{credentialSlip.userCode}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '3px 9px', fontSize: '0.72rem' }}
                    onClick={() => void copySlipField('id', credentialSlip.userCode)}
                  >
                    {credentialSlip.copiedField === 'id' ? 'Copied' : 'Copy ID'}
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span>
                    Work Email: <strong>{credentialSlip.email}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '3px 9px', fontSize: '0.72rem' }}
                    onClick={() => void copySlipField('email', credentialSlip.email)}
                  >
                    {credentialSlip.copiedField === 'email' ? 'Copied' : 'Copy Email'}
                  </button>
                </div>
                <div>
                  Reporting Manager: <strong>{credentialSlip.reportingManagerLabel}</strong>
                </div>
                {credentialSlip.initialPassword ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', borderTop: '1px dashed #CBD5E1', paddingTop: '8px' }}>
                    <span>
                      Initial Password: <code>{credentialSlip.initialPassword}</code>
                    </span>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '3px 9px', fontSize: '0.72rem' }}
                      onClick={() => void copySlipField('password', credentialSlip.initialPassword || '')}
                    >
                      {credentialSlip.copiedField === 'password' ? 'Copied' : 'Copy Password'}
                    </button>
                  </div>
                ) : (
                  <div style={{ color: '#64748B', fontSize: '0.78rem', borderTop: '1px dashed #CBD5E1', paddingTop: '8px' }}>
                    No temporary password entered — member can sign in via Google, Email OTP, or emailed setup link.
                  </div>
                )}
              </div>
              {credentialSlip.initialPassword && (
                <div style={{ fontSize: '0.75rem', color: '#B45309' }}>
                  Copy this password now — for security, plaintext passwords are never stored in shared directories after creation.
                </div>
              )}
            </div>
            <div className="modal-footer">
              {credentialSlip.initialPassword && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    void copySlipField(
                      'all',
                      `LabSetu Staff Access\nID: ${credentialSlip.userCode}\nEmail: ${credentialSlip.email}\nInitial Password: ${credentialSlip.initialPassword}\nReporting Manager: ${credentialSlip.reportingManagerLabel}`
                    )
                  }
                >
                  {credentialSlip.copiedField === 'all' ? 'Copied Bundle' : 'Copy All Credentials'}
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                onClick={() => setCredentialSlip(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

