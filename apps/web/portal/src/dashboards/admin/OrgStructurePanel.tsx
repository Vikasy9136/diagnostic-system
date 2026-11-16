import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DEFAULT_SUPER_ADMIN_EMAIL,
  hasPermission,
  isEffectiveSuperAdmin,
  PERMISSION_CATALOG,
  type DepartmentRecord,
  type DesignationCategory,
  type DesignationRecord,
  type FounderSeatKey,
  type FounderSeatRecord,
  type PermissionCode,
  type UserProfile,
} from '@diagnostic/shared';
import { type DynamicAlertVariant } from '../../components/DynamicAlertModal';
import {
  assignFounderSeatApi,
  getOrgOverviewApi,
  saveDepartmentApi,
  saveDesignationApi,
  transferSuperAdminApi,
  updateDepartmentApi,
  updateDesignationApi,
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

interface OrgStructurePanelProps {
  currentUser: UserProfile;
  bearerToken?: string;
  onShowAlert: AlertTriggerFn;
  onJumpToEmployees?: () => void;
}

export function OrgStructurePanel({
  currentUser,
  bearerToken,
  onShowAlert,
  onJumpToEmployees,
}: OrgStructurePanelProps) {
  const [data, setData] = useState<OrgOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [desigDeptFilter, setDesigDeptFilter] = useState<string>('ALL');

  // Assign Founder Seat Modal
  const [assignSeat, setAssignSeat] = useState<FounderSeatRecord | null>(null);
  const [seatEmail, setSeatEmail] = useState('');
  const [seatFounderName, setSeatFounderName] = useState('');
  const [seatPhone, setSeatPhone] = useState('');
  const [seatSendResetEmail, setSeatSendResetEmail] = useState(true);
  const [savingSeat, setSavingSeat] = useState(false);

  // Transfer Super Admin Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferEmail, setTransferEmail] = useState('');
  const [transferName, setTransferName] = useState('');
  const [transferPhrase, setTransferPhrase] = useState('');
  const [revokeCurrentSuperAdmin, setRevokeCurrentSuperAdmin] = useState(false);
  const [keepCurrentAsProductHead, setKeepCurrentAsProductHead] = useState(true);
  const [transferring, setTransferring] = useState(false);

  // Create / Edit Department Modal
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentRecord | null>(null);
  const [deptCode, setDeptCode] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptShortName, setDeptShortName] = useState('');
  const [deptHeadName, setDeptHeadName] = useState('');
  const [deptHeadEmail, setDeptHeadEmail] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [deptRespText, setDeptRespText] = useState('');
  const [savingDept, setSavingDept] = useState(false);

  // Create / Edit Designation Modal
  const [showDesigModal, setShowDesigModal] = useState(false);
  const [editingDesig, setEditingDesig] = useState<DesignationRecord | null>(null);
  const [desigDepartmentId, setDesigDepartmentId] = useState('FINANCE_BUSINESS');
  const [desigTitle, setDesigTitle] = useState('');
  const [desigCategory, setDesigCategory] = useState<DesignationCategory>('EXECUTIVE');
  const [desigDesc, setDesigDesc] = useState('');
  const [desigRespText, setDesigRespText] = useState('');
  const [desigPermissions, setDesigPermissions] = useState<PermissionCode[]>([]);
  const [desigIsSoftwareQa, setDesigIsSoftwareQa] = useState(false);
  const [desigIsOpsQuality, setDesigIsOpsQuality] = useState(false);
  const [savingDesig, setSavingDesig] = useState(false);

  const isSuperAdmin = useMemo(
    () => isEffectiveSuperAdmin(currentUser, DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser]
  );
  const canManageFounders = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_FOUNDER_SEATS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canManageDepts = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_DEPARTMENTS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canManageDesigs = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_DESIGNATIONS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getOrgOverviewApi(bearerToken);
      setData(res.data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not load organisation structure.');
    } finally {
      setLoading(false);
    }
  }, [bearerToken]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const superAdminSeat = useMemo(
    () => data?.founderSeats.find((s) => s.seatKey === 'VIKAS') || data?.founderSeats.find((s) => s.isSuperAdmin),
    [data]
  );

  const filteredDesignations = useMemo(() => {
    const list = data?.designations || [];
    if (desigDeptFilter === 'ALL') return list;
    return list.filter((d) => d.departmentId === desigDeptFilter);
  }, [data, desigDeptFilter]);

  const hiredCountByDesignation = useMemo(() => {
    const map: Record<string, number> = {};
    for (const emp of data?.employees || []) {
      map[emp.designationId] = (map[emp.designationId] || 0) + 1;
    }
    return map;
  }, [data]);

  function openAssignSeatModal(seat: FounderSeatRecord) {
    setAssignSeat(seat);
    setSeatEmail(seat.assignedEmail || '');
    setSeatFounderName(seat.founderName);
    setSeatPhone('');
    setSeatSendResetEmail(true);
  }

  async function handleAssignFounderSeat(e: FormEvent) {
    e.preventDefault();
    if (!assignSeat || !seatEmail.trim()) return;
    setSavingSeat(true);
    try {
      const res = await assignFounderSeatApi(
        assignSeat.seatKey as FounderSeatKey,
        {
          email: seatEmail.trim().toLowerCase(),
          founderName: seatFounderName.trim() || assignSeat.founderName,
          phoneNumber: seatPhone.trim() || undefined,
          sendPasswordSetupEmail: seatSendResetEmail,
        },
        bearerToken
      );
      setAssignSeat(null);
      onShowAlert({
        variant: 'success',
        title: 'Founder Seat Activated',
        message: res.message || `${seatFounderName} is now active on ${seatEmail.trim().toLowerCase()}.`,
        detail: seatSendResetEmail
          ? 'A secure password setup email link was queued for the assigned email.'
          : 'This user can now sign in with Google or email OTP.',
      });
      await loadOverview();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Seat Assignment Failed',
        message: err instanceof Error ? err.message : 'Unable to assign founder seat.',
      });
    } finally {
      setSavingSeat(false);
    }
  }

  async function handleTransferSuperAdmin(e: FormEvent) {
    e.preventDefault();
    if (transferPhrase.trim() !== 'TRANSFER SUPER ADMIN') {
      onShowAlert({
        variant: 'warning',
        title: 'Confirmation Phrase Required',
        message: 'Type the exact phrase "TRANSFER SUPER ADMIN" to authorise Super Admin handover.',
      });
      return;
    }
    setTransferring(true);
    try {
      const res = await transferSuperAdminApi(
        {
          targetEmail: transferEmail.trim().toLowerCase(),
          targetName: transferName.trim() || undefined,
          confirmPhrase: transferPhrase.trim(),
          revokeCurrentSuperAdmin,
          keepCurrentAsProductHead,
        },
        bearerToken
      );
      setShowTransferModal(false);
      setTransferEmail('');
      setTransferName('');
      setTransferPhrase('');
      onShowAlert({
        variant: 'success',
        title: 'Super Admin Transfer Complete',
        message: res.message || `Super Admin authority configured for ${res.data.transferredTo}.`,
      });
      await loadOverview();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Transfer Blocked',
        message: err instanceof Error ? err.message : 'Could not transfer Super Admin privileges.',
      });
    } finally {
      setTransferring(false);
    }
  }

  function openNewDepartmentModal() {
    setEditingDept(null);
    setDeptCode('');
    setDeptName('');
    setDeptShortName('');
    setDeptHeadName('');
    setDeptHeadEmail('');
    setDeptDesc('');
    setDeptRespText('');
    setShowDeptModal(true);
  }

  function openEditDepartmentModal(dept: DepartmentRecord) {
    setEditingDept(dept);
    setDeptCode(dept.code);
    setDeptName(dept.name);
    setDeptShortName(dept.shortName);
    setDeptHeadName(dept.headName);
    setDeptHeadEmail(dept.headEmail || '');
    setDeptDesc(dept.description);
    setDeptRespText((dept.responsibilities || []).join('\n'));
    setShowDeptModal(true);
  }

  async function handleSaveDepartment(e: FormEvent) {
    e.preventDefault();
    if (!deptName.trim()) return;
    setSavingDept(true);
    const responsibilities = deptRespText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      if (editingDept) {
        await updateDepartmentApi(
          editingDept.id,
          {
            name: deptName.trim(),
            shortName: deptShortName.trim() || deptName.trim().slice(0, 20),
            headName: deptHeadName.trim() || editingDept.headName,
            headEmail: deptHeadEmail.trim().toLowerCase(),
            description: deptDesc.trim(),
            responsibilities,
          },
          bearerToken
        );
      } else {
        await saveDepartmentApi(
          {
            code: deptCode.trim() || undefined,
            name: deptName.trim(),
            shortName: deptShortName.trim() || deptName.trim().slice(0, 20),
            headName: deptHeadName.trim() || 'Super Admin',
            headEmail: deptHeadEmail.trim().toLowerCase() || undefined,
            description: deptDesc.trim(),
            responsibilities,
          },
          bearerToken
        );
      }
      setShowDeptModal(false);
      onShowAlert({
        variant: 'success',
        title: editingDept ? 'Department Updated' : 'Department Created',
        message: `${deptName.trim()} configuration saved cleanly.`,
      });
      await loadOverview();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Department Save Error',
        message: err instanceof Error ? err.message : 'Unable to save department.',
      });
    } finally {
      setSavingDept(false);
    }
  }

  function openNewDesignationModal() {
    setEditingDesig(null);
    const fallbackDept = desigDeptFilter !== 'ALL' ? desigDeptFilter : 'FINANCE_BUSINESS';
    setDesigDepartmentId(fallbackDept);
    setDesigTitle('');
    setDesigCategory('EXECUTIVE');
    setDesigDesc('');
    setDesigRespText('');
    setDesigPermissions([]);
    setDesigIsSoftwareQa(false);
    setDesigIsOpsQuality(false);
    setShowDesigModal(true);
  }

  function openEditDesignationModal(desig: DesignationRecord) {
    setEditingDesig(desig);
    setDesigDepartmentId(desig.departmentId);
    setDesigTitle(desig.title);
    setDesigCategory(desig.category);
    setDesigDesc(desig.description);
    setDesigRespText((desig.defaultResponsibilities || []).join('\n'));
    setDesigPermissions([...(desig.defaultPermissions || [])]);
    setDesigIsSoftwareQa(Boolean(desig.isSoftwareQa));
    setDesigIsOpsQuality(Boolean(desig.isOperationalQuality));
    setShowDesigModal(true);
  }

  async function handleSaveDesignation(e: FormEvent) {
    e.preventDefault();
    if (!desigTitle.trim()) return;
    setSavingDesig(true);
    const defaultResponsibilities = desigRespText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      if (editingDesig) {
        await updateDesignationApi(
          editingDesig.id,
          {
            title: desigTitle.trim(),
            category: desigCategory,
            description: desigDesc.trim(),
            defaultResponsibilities,
            defaultPermissions: desigPermissions,
          },
          bearerToken
        );
      } else {
        await saveDesignationApi(
          {
            departmentId: desigDepartmentId,
            title: desigTitle.trim(),
            category: desigCategory,
            description: desigDesc.trim(),
            isSoftwareQa: desigIsSoftwareQa,
            isOperationalQuality: desigIsOpsQuality,
            defaultResponsibilities,
            defaultPermissions: desigPermissions,
          },
          bearerToken
        );
      }
      setShowDesigModal(false);
      onShowAlert({
        variant: 'success',
        title: editingDesig ? 'Designation Updated' : 'Designation Created',
        message: `${desigTitle.trim()} updated in organisation role catalog.`,
      });
      await loadOverview();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Designation Save Failed',
        message: err instanceof Error ? err.message : 'Could not save designation.',
      });
    } finally {
      setSavingDesig(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="chart-card-modern">
        <h2 className="card-top-title">Organisation Structure &amp; Founder Governance</h2>
        <p style={{ color: '#64748B', fontSize: '0.86rem', marginTop: '8px' }}>
          Loading founder seats, core departments, and designation catalog...
        </p>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="chart-card-modern">
        <div className="admin-auth-alert error">{errorMsg}</div>
        <button type="button" className="btn-primary" onClick={() => void loadOverview()}>
          Retry Loading Organisation Data
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Top Metrics */}
      <div className="page-header-row" style={{ marginBottom: 0 }}>
        <div className="page-title-group">
          <h1>Organisation Governance &amp; Founder Seats</h1>
          <p>
            Launch Governance Policy: Strictly 4 Founder Leadership Seats (only verified Super Admin
            active until other co-founders assign real email logins) — zero fake employees or credentials.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {canManageFounders && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowTransferModal(true)}
            >
              Transfer Super Admin Access
            </button>
          )}
          {onJumpToEmployees && (
            <button type="button" className="btn-primary" onClick={onJumpToEmployees}>
              Manage Team Members ({data?.stats.totalEmployeesCount ?? 0})
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <section className="kpi-row" style={{ marginBottom: 0 }}>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-teal">🛡️</div>
          <div className="kpi-body">
            <span className="kpi-title">Active Founder Seats</span>
            <span className="kpi-main-number">{data?.stats.activeFoundersCount ?? 1} / 4</span>
            <span className="kpi-sub-split">
              {data?.stats.awaitingFoundersCount ?? 3} awaiting real email binding
            </span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-blue">🏛️</div>
          <div className="kpi-body">
            <span className="kpi-title">Core Departments</span>
            <span className="kpi-main-number">{data?.stats.totalDepartmentsCount ?? 4}</span>
            <span className="kpi-sub-split">All reporting directly to Super Admin</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-purple">🪪</div>
          <div className="kpi-body">
            <span className="kpi-title">Future Designations Ready</span>
            <span className="kpi-main-number">{data?.stats.totalDesignationsCount ?? 26}</span>
            <span className="kpi-sub-split">Pre-mapped role permissions catalog</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-green">👥</div>
          <div className="kpi-body">
            <span className="kpi-title">Hired Department Staff</span>
            <span className="kpi-main-number">{data?.stats.totalEmployeesCount ?? 0}</span>
            <span className="kpi-sub-split">
              {(data?.stats.totalEmployeesCount ?? 0) === 0
                ? 'Founders handle responsibilities initially'
                : `${data?.stats.activeEmployeesCount ?? 0} active staff members`}
            </span>
          </div>
        </div>
      </section>

      {/* 4 FOUNDER SEATS */}
      <div className="chart-card-modern">
        <div className="card-top-header">
          <div>
            <h2 className="card-top-title">4 Executive Founder Seats</h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Unassigned founder seats remain locked until Super Admin links their real email address.
            </p>
          </div>
        </div>

        <div className="org-founder-grid" style={{ marginBottom: 0 }}>
          {(data?.founderSeats || []).map((seat) => {
            const isActiveSeat = seat.seatStatus === 'ACTIVE';
            return (
              <div
                key={seat.seatKey}
                className={`founder-seat-card ${isActiveSeat ? 'active' : 'awaiting'}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                        {seat.founderName}
                      </div>
                      {seat.seatKey === 'VIKAS' && (
                        <span className="user-code-badge">USR-ADM-1001</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0F766E' }}>
                      {seat.title}
                    </div>
                  </div>
                  <span className={isActiveSeat ? 'status-pill-green' : 'status-pill-amber'}>
                    {isActiveSeat ? 'ACTIVE' : 'AWAITING EMAIL'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {seat.founderRoles.map((roleCode) => (
                    <span key={roleCode} className="status-pill-blue">
                      {roleCode.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>

                <div style={{ fontSize: '0.8rem', color: '#334155', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Assigned Login Email
                  </div>
                  <div style={{ fontWeight: 600, marginTop: '2px', wordBreak: 'break-all' }}>
                    {seat.assignedEmail || 'Not Assigned — Login Disabled'}
                  </div>
                </div>

                <ul style={{ marginLeft: '16px', fontSize: '0.77rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {(seat.responsibilities || []).slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>

                {canManageFounders && (
                  <div style={{ marginTop: 'auto', paddingTop: '6px', display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className={isActiveSeat ? 'btn-secondary' : 'btn-primary'}
                      onClick={() => openAssignSeatModal(seat)}
                    >
                      {seat.assignedEmail ? 'Update Assigned Email' : 'Assign Founder Email'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* VISUAL REPORTING HIERARCHY TREE */}
      <div className="chart-card-modern">
        <div className="card-top-header">
          <div>
            <h2 className="card-top-title">Reporting Hierarchy</h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Vikas holds coexisting Super Admin oversight + Product &amp; Technology Head leadership. All 4 department heads report to Super Admin.
            </p>
          </div>
        </div>

        <div className="org-hierarchy-tree">
          <div className="hierarchy-root-node">
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5EEAD4', fontWeight: 700 }}>
              Platform Root Authority
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '4px' }}>
              Super Admin: {superAdminSeat?.founderName || 'Vikas'}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#CBD5E1', marginTop: '2px' }}>
              {superAdminSeat?.assignedEmail || DEFAULT_SUPER_ADMIN_EMAIL}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#99F6E4', marginTop: '4px' }}>
              Coexisting Roles: SUPER_ADMIN + PRODUCT_TECHNOLOGY_HEAD
            </div>
          </div>

          <div className="hierarchy-connector" />

          <div className="hierarchy-branches-grid">
            {(data?.departments || []).map((dept) => {
              const matchingSeat = data?.founderSeats.find((s) => s.primaryDepartmentId === dept.id);
              const hiredCount = (data?.employees || []).filter((e) => e.departmentId === dept.id).length;
              const desigCount = (data?.designations || []).filter((d) => d.departmentId === dept.id).length;
              return (
                <div key={dept.id} className="hierarchy-branch-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                    <strong style={{ fontSize: '0.9rem', color: '#0F172A' }}>{dept.name}</strong>
                    <span className={dept.isActive ? 'status-pill-green' : 'status-pill-slate'}>
                      {dept.isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#0F766E', fontWeight: 700, marginTop: '6px' }}>
                    Head: {dept.headName}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                    {dept.headEmail || matchingSeat?.assignedEmail || 'Email Pending Assignment'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{desigCount} designations</span>
                    <span><strong>{hiredCount}</strong> staff hired</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CORE DEPARTMENTS CRUD TABLE */}
      <div className="chart-card-modern">
        <div className="card-top-header">
          <div>
            <h2 className="card-top-title">Departments Registry ({data?.departments.length || 0})</h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Configure reporting heads, department responsibilities, and active operational state.
            </p>
          </div>
          {canManageDepts && (
            <button type="button" className="btn-primary" onClick={openNewDepartmentModal}>
              + Add Department
            </button>
          )}
        </div>

        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Head &amp; Email</th>
                <th>Key Responsibilities</th>
                <th>Status</th>
                {canManageDepts && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {(data?.departments || []).map((dept) => (
                <tr key={dept.id}>
                  <td>
                    <strong>{dept.name}</strong>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                      Code: <code>{dept.code}</code> {dept.isCoreDepartment ? '• Core' : ''}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{dept.headName}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {dept.headEmail || 'Unassigned at launch'}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.76rem', color: '#334155', maxWidth: '340px' }}>
                      {dept.description}
                    </div>
                  </td>
                  <td>
                    <span className={dept.isActive ? 'status-pill-green' : 'status-pill-amber'}>
                      {dept.isActive ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  {canManageDepts && (
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => openEditDepartmentModal(dept)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            onShowAlert({
                              variant: 'confirm',
                              title: dept.isActive ? `Pause ${dept.name}?` : `Activate ${dept.name}?`,
                              message: `Change operational status for ${dept.name}?`,
                              onConfirm: () => {
                                void updateDepartmentApi(dept.id, { isActive: !dept.isActive }, bearerToken)
                                  .then(() => loadOverview())
                                  .catch((err) =>
                                    onShowAlert({
                                      variant: 'error',
                                      title: 'Update Failed',
                                      message: err instanceof Error ? err.message : 'Unable to update department.',
                                    })
                                  );
                              },
                            })
                          }
                        >
                          {dept.isActive ? 'Pause' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FUTURE DESIGNATIONS CATALOG (26 DESIGNATIONS — 0 HIRED INITIALLY) */}
      <div className="chart-card-modern">
        <div className="card-top-header">
          <div>
            <h2 className="card-top-title">
              Future Designations Catalog ({filteredDesignations.length})
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              All 26 structured roles pre-mapped with default permissions. Note strict separation between Software QA Executive (Product &amp; Tech) and Operational Quality Executive (Operations).
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="form-select"
              style={{ width: '230px' }}
              value={desigDeptFilter}
              onChange={(e) => setDesigDeptFilter(e.target.value)}
            >
              <option value="ALL">All Departments ({data?.designations.length || 0})</option>
              {(data?.departments || []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {canManageDesigs && (
              <button type="button" className="btn-primary" onClick={openNewDesignationModal}>
                + Add Designation
              </button>
            )}
          </div>
        </div>

        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Designation Title</th>
                <th>Department &amp; Type</th>
                <th>Default Permissions</th>
                <th>Hired Count</th>
                {canManageDesigs && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {filteredDesignations.map((desig) => {
                const count = hiredCountByDesignation[desig.id] || 0;
                return (
                  <tr key={desig.id}>
                    <td>
                      <strong>{desig.title}</strong>
                      {desig.isSoftwareQa && (
                        <span className="status-pill-purple" style={{ marginLeft: '6px' }}>
                          Software QA
                        </span>
                      )}
                      {desig.isOperationalQuality && (
                        <span className="status-pill-green" style={{ marginLeft: '6px' }}>
                          Ops Sample Quality
                        </span>
                      )}
                      <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '3px', maxWidth: '330px' }}>
                        {desig.description}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{desig.departmentName}</div>
                      <span className="status-pill-slate" style={{ marginTop: '4px' }}>
                        {desig.category}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '300px' }}>
                        {desig.defaultPermissions.slice(0, 4).map((p) => (
                          <span key={p} className="status-pill-blue">
                            {p.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {desig.defaultPermissions.length > 4 && (
                          <span className="status-pill-slate">
                            +{desig.defaultPermissions.length - 4} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={count === 0 ? 'status-pill-slate' : 'status-pill-green'}>
                        {count === 0 ? '0 Hired Initially' : `${count} Active`}
                      </span>
                    </td>
                    {canManageDesigs && (
                      <td>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => openEditDesignationModal(desig)}
                        >
                          Edit Role
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ASSIGN FOUNDER SEAT EMAIL */}
      {assignSeat && (
        <div className="modal-overlay" onClick={() => !savingSeat && setAssignSeat(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Assign Founder Seat • {assignSeat.founderName}</h3>
              <button
                type="button"
                className="btn-secondary"
                disabled={savingSeat}
                onClick={() => setAssignSeat(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleAssignFounderSeat(e)}>
              <div className="modal-body">
                <div className="admin-auth-alert success" style={{ fontSize: '0.8rem' }}>
                  <strong>Seat:</strong> {assignSeat.title} ({assignSeat.seatKey})<br />
                  Only real co-founder email addresses should be linked here. No default passwords are generated.
                </div>
                <div className="form-group">
                  <label className="form-label">Founder Full Name</label>
                  <input
                    className="form-input"
                    value={seatFounderName}
                    onChange={(e) => setSeatFounderName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Verified Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="Enter co-founder email address"
                    value={seatEmail}
                    onChange={(e) => setSeatEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number (Optional)</label>
                  <input
                    className="form-input"
                    placeholder="+91 ..."
                    value={seatPhone}
                    onChange={(e) => setSeatPhone(e.target.value)}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={seatSendResetEmail}
                    onChange={(e) => setSeatSendResetEmail(e.target.checked)}
                  />
                  Send secure password setup / verification email link immediately
                </label>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={savingSeat}
                  onClick={() => setAssignSeat(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={savingSeat}>
                  {savingSeat ? 'Activating Seat...' : 'Activate Founder Seat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TRANSFER SUPER ADMIN */}
      {showTransferModal && (
        <div className="modal-overlay" onClick={() => !transferring && setShowTransferModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Transfer Super Admin Authority</h3>
              <button
                type="button"
                className="btn-secondary"
                disabled={transferring}
                onClick={() => setShowTransferModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleTransferSuperAdmin(e)}>
              <div className="modal-body">
                <div className="disclaimer-banner-ca">
                  <strong>Critical Security Action:</strong> Grants full platform authority to the target account and updates the root Super Admin record with an immutable audit entry.
                </div>
                <div className="form-group">
                  <label className="form-label">Target Super Admin Name</label>
                  <input
                    className="form-input"
                    placeholder="Full name"
                    value={transferName}
                    onChange={(e) => setTransferName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Destination Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="Enter new Super Admin email"
                    value={transferEmail}
                    onChange={(e) => setTransferEmail(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px', fontSize: '0.82rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={revokeCurrentSuperAdmin}
                      onChange={(e) => setRevokeCurrentSuperAdmin(e.target.checked)}
                    />
                    Revoke Super Admin privilege from current account ({currentUser.email})
                  </label>
                  {revokeCurrentSuperAdmin && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '20px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={keepCurrentAsProductHead}
                        onChange={(e) => setKeepCurrentAsProductHead(e.target.checked)}
                      />
                      Retain Product &amp; Technology Head access for current account
                    </label>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Confirmation Phrase — type <code>TRANSFER SUPER ADMIN</code>
                  </label>
                  <input
                    className="form-input"
                    placeholder="TRANSFER SUPER ADMIN"
                    value={transferPhrase}
                    onChange={(e) => setTransferPhrase(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={transferring}
                  onClick={() => setShowTransferModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={transferring}>
                  {transferring ? 'Processing Transfer...' : 'Confirm Super Admin Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DEPARTMENT CREATE/EDIT */}
      {showDeptModal && (
        <div className="modal-overlay" onClick={() => !savingDept && setShowDeptModal(false)}>
          <div className="modal-card" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingDept ? `Edit Department • ${editingDept.name}` : 'Create New Department'}</h3>
              <button
                type="button"
                className="btn-secondary"
                disabled={savingDept}
                onClick={() => setShowDeptModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveDepartment(e)}>
              <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                {!editingDept && (
                  <div className="form-group">
                    <label className="form-label">Department Code (Optional)</label>
                    <input
                      className="form-input"
                      placeholder="e.g. MEDICAL_ADVISORY"
                      value={deptCode}
                      onChange={(e) => setDeptCode(e.target.value)}
                    />
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Department Name</label>
                    <input
                      className="form-input"
                      value={deptName}
                      onChange={(e) => setDeptName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Short Label</label>
                    <input
                      className="form-input"
                      value={deptShortName}
                      onChange={(e) => setDeptShortName(e.target.value)}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Department Head Name</label>
                    <input
                      className="form-input"
                      value={deptHeadName}
                      onChange={(e) => setDeptHeadName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department Head Email</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="Optional"
                      value={deptHeadEmail}
                      onChange={(e) => setDeptHeadEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Scope Description</label>
                  <input
                    className="form-input"
                    value={deptDesc}
                    onChange={(e) => setDeptDesc(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Responsibilities (one per line)</label>
                  <textarea
                    className="form-input"
                    rows={4}
                    value={deptRespText}
                    onChange={(e) => setDeptRespText(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={savingDept}
                  onClick={() => setShowDeptModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={savingDept}>
                  {savingDept ? 'Saving...' : 'Save Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DESIGNATION CREATE/EDIT */}
      {showDesigModal && (
        <div className="modal-overlay" onClick={() => !savingDesig && setShowDesigModal(false)}>
          <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingDesig ? `Edit Designation • ${editingDesig.title}` : 'Add Future Designation'}</h3>
              <button
                type="button"
                className="btn-secondary"
                disabled={savingDesig}
                onClick={() => setShowDesigModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveDesignation(e)}>
              <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <select
                      className="form-select"
                      value={desigDepartmentId}
                      disabled={Boolean(editingDesig)}
                      onChange={(e) => setDesigDepartmentId(e.target.value)}
                    >
                      {(data?.departments || []).map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select
                      className="form-select"
                      value={desigCategory}
                      onChange={(e) => setDesigCategory(e.target.value as DesignationCategory)}
                    >
                      <option value="EXECUTIVE">Executive</option>
                      <option value="SUPPORT">Support</option>
                      <option value="ANALYST">Analyst</option>
                      <option value="DEVELOPER">Developer</option>
                      <option value="QA">Quality / QA</option>
                      <option value="DESIGN">Design</option>
                      <option value="HEAD">Lead / Head</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Designation Title</label>
                  <input
                    className="form-input"
                    value={desigTitle}
                    onChange={(e) => setDesigTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Role Description</label>
                  <input
                    className="form-input"
                    value={desigDesc}
                    onChange={(e) => setDesigDesc(e.target.value)}
                  />
                </div>
                {!editingDesig && (
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', fontSize: '0.8rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={desigIsSoftwareQa}
                        onChange={(e) => setDesigIsSoftwareQa(e.target.checked)}
                      />
                      Software QA Testing Role
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={desigIsOpsQuality}
                        onChange={(e) => setDesigIsOpsQuality(e.target.checked)}
                      />
                      Operational Sample Quality Role
                    </label>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Default Responsibilities (one per line)</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={desigRespText}
                    onChange={(e) => setDesigRespText(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Default Permission Bundle ({desigPermissions.length} selected)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', maxHeight: '210px', overflowY: 'auto', padding: '8px', border: '1px solid #E2E8F0', borderRadius: '10px', background: '#F8FAFC' }}>
                    {PERMISSION_CATALOG.map((perm) => {
                      const checked = desigPermissions.includes(perm.code);
                      return (
                        <label
                          key={perm.code}
                          className={`permission-checkbox-item ${perm.sensitive ? 'sensitive' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setDesigPermissions((prev) =>
                                checked ? prev.filter((p) => p !== perm.code) : [...prev, perm.code]
                              )
                            }
                          />
                          <div>
                            <div style={{ fontWeight: 600 }}>{perm.label}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{perm.group}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={savingDesig}
                  onClick={() => setShowDesigModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={savingDesig}>
                  {savingDesig ? 'Saving...' : 'Save Designation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

