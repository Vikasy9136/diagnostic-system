import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DEFAULT_SUPER_ADMIN_EMAIL,
  hasPermission,
  isEffectiveSuperAdmin,
  type BackupRecord,
  type TechIssueRecord,
  type UserProfile,
} from '@diagnostic/shared';
import { type DynamicAlertVariant } from '../../components/DynamicAlertModal';
import {
  createBackupRecordApi,
  createTechIssueApi,
  getOrgOverviewApi,
  getTechOverviewApi,
  resolveAppErrorLogApi,
  runSystemHealthCheckApi,
  updateTechIssueApi,
  type TechOverviewData,
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

type TechSubTab = 'platforms' | 'health' | 'errors' | 'issues' | 'backups';

interface ProductTechPanelProps {
  currentUser: UserProfile;
  bearerToken?: string;
  onShowAlert: AlertTriggerFn;
}

const BACKUP_PRESETS: Record<
  BackupRecord['backupType'],
  { scope: string; storage: string; rpo: string }
> = {
  DATABASE_SNAPSHOT: {
    scope: 'Primary database collections, lab catalogs, orders, reports & directory',
    storage: 'gs://labsetu-diagnostics-backups/daily-snapshots',
    rpo: '60',
  },
  RULES_CONFIG: {
    scope: 'Security access rules, compact role claims matrix & API environment config',
    storage: 'gs://labsetu-diagnostics-backups/security-rules-rbac',
    rpo: '30',
  },
  AUDIT_ARCHIVE: {
    scope: 'Immutable GST invoices, Razorpay webhooks, settlement & custody audit ledger',
    storage: 'gs://labsetu-diagnostics-backups/compliance-audit-archive',
    rpo: '1440',
  },
};

export function ProductTechPanel({
  currentUser,
  bearerToken,
  onShowAlert,
}: ProductTechPanelProps) {
  const [subTab, setSubTab] = useState<TechSubTab>('platforms');
  const [data, setData] = useState<TechOverviewData | null>(null);
  const [teamRoster, setTeamRoster] = useState<
    Array<{ label: string; email: string; dept?: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [runningHealth, setRunningHealth] = useState(false);
  const [issueStatusFilter, setIssueStatusFilter] = useState<'ALL' | TechIssueRecord['status']>('ALL');
  const [errorSeverityFilter, setErrorSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');

  // Create Tech Issue / Software QA Modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueSurface, setIssueSurface] = useState<TechIssueRecord['surface']>('ADMIN_WEBSITE');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDesc, setIssueDesc] = useState('');
  const [issuePriority, setIssuePriority] = useState<TechIssueRecord['priority']>('MEDIUM');
  const [issueQaStatus, setIssueQaStatus] = useState<NonNullable<TechIssueRecord['qaStatus']>>('PENDING_TEST');
  const [issueAssignee, setIssueAssignee] = useState(currentUser.email);
  const [savingIssue, setSavingIssue] = useState(false);

  // Create Backup Verification Modal
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [bkpType, setBkpType] = useState<BackupRecord['backupType']>('DATABASE_SNAPSHOT');
  const [bkpStatus, setBkpStatus] = useState<BackupRecord['status']>('VERIFIED');
  const [bkpScope, setBkpScope] = useState(BACKUP_PRESETS.DATABASE_SNAPSHOT.scope);
  const [bkpStorage, setBkpStorage] = useState(BACKUP_PRESETS.DATABASE_SNAPSHOT.storage);
  const [bkpRpo, setBkpRpo] = useState(BACKUP_PRESETS.DATABASE_SNAPSHOT.rpo);
  const [savingBackup, setSavingBackup] = useState(false);

  const isSuperAdmin = useMemo(
    () => isEffectiveSuperAdmin(currentUser, DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser]
  );
  const canManageHealth = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_SYSTEM_HEALTH', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canResolveErrors = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'VIEW_APP_ERROR_LOGS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canManageIssuesOrQa = useMemo(
    () =>
      isSuperAdmin ||
      hasPermission(currentUser, 'MANAGE_TECH_ISSUES', DEFAULT_SUPER_ADMIN_EMAIL) ||
      hasPermission(currentUser, 'MANAGE_SOFTWARE_QA', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canManageBackups = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_BACKUPS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );

  const loadTech = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [techRes, orgRes] = await Promise.allSettled([
        getTechOverviewApi(bearerToken),
        getOrgOverviewApi(bearerToken),
      ]);
      if (techRes.status === 'fulfilled') {
        setData(techRes.value.data);
      } else {
        throw techRes.reason;
      }
      if (orgRes.status === 'fulfilled') {
        const orgData = orgRes.value.data;
        const candidates: Array<{ label: string; email: string; dept?: string }> = [];
        const seenEmails = new Set<string>();
        for (const seat of orgData.founderSeats || []) {
          if (seat.assignedEmail) {
            const em = seat.assignedEmail.trim().toLowerCase();
            if (!seenEmails.has(em)) {
              seenEmails.add(em);
              candidates.push({
                label: `${seat.founderName} — ${seat.title}`,
                email: em,
                dept: seat.primaryDepartmentId,
              });
            }
          }
        }
        for (const emp of orgData.employees || []) {
          if (emp.isActive && emp.email) {
            const em = emp.email.trim().toLowerCase();
            if (!seenEmails.has(em)) {
              seenEmails.add(em);
              candidates.push({
                label: `${emp.name} — ${emp.designationTitle}`,
                email: em,
                dept: emp.departmentId,
              });
            }
          }
        }
        setTeamRoster(candidates);
        if (candidates.length > 0) {
          const techLead =
            candidates.find((c) => c.dept === 'PRODUCT_TECHNOLOGY') || candidates[0];
          setIssueAssignee((prev) => prev || techLead.email);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load product & technology telemetry.');
    } finally {
      setLoading(false);
    }
  }, [bearerToken]);

  useEffect(() => {
    void loadTech();
  }, [loadTech]);

  const filteredIssues = useMemo(() => {
    const items = data?.techIssues || [];
    if (issueStatusFilter === 'ALL') return items;
    return items.filter((item) => item.status === issueStatusFilter);
  }, [data, issueStatusFilter]);

  const filteredErrorLogs = useMemo(() => {
    const logs = data?.errorLogs || [];
    if (errorSeverityFilter === 'ALL') return logs;
    return logs.filter((l) => l.severity === errorSeverityFilter);
  }, [data, errorSeverityFilter]);

  function handleBackupTypeChange(nextType: BackupRecord['backupType']) {
    setBkpType(nextType);
    const preset = BACKUP_PRESETS[nextType];
    if (preset) {
      setBkpScope(preset.scope);
      setBkpStorage(preset.storage);
      setBkpRpo(preset.rpo);
    }
  }

  async function handleRunHealthCheck() {
    setRunningHealth(true);
    try {
      const res = await runSystemHealthCheckApi(bearerToken);
      onShowAlert({
        variant: res.data.overallStatus === 'HEALTHY' ? 'success' : 'warning',
        title: `Live System Health: ${res.data.overallStatus}`,
        message: res.data.notes || 'Service probe completed.',
        detail: `Identity: ${res.data.authServiceOk ? 'OK' : 'ISSUE'} | Database: ${res.data.databaseOk ? 'OK' : 'ISSUE'} | Payment Webhook: ${res.data.paymentWebhookConfigured ? 'Configured' : 'Pending Secret'}`,
      });
      await loadTech();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Health Probe Failed',
        message: err instanceof Error ? err.message : 'Could not run system health probe.',
      });
    } finally {
      setRunningHealth(false);
    }
  }

  async function handleResolveError(errorId: string) {
    try {
      await resolveAppErrorLogApi(errorId, bearerToken);
      await loadTech();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Resolve Failed',
        message: err instanceof Error ? err.message : 'Unable to mark error log resolved.',
      });
    }
  }

  async function handleCreateIssue(e: FormEvent) {
    e.preventDefault();
    if (!issueTitle.trim() || !issueDesc.trim()) return;
    setSavingIssue(true);
    try {
      await createTechIssueApi(
        {
          surface: issueSurface,
          title: issueTitle.trim(),
          description: issueDesc.trim(),
          priority: issuePriority,
          qaStatus: issueQaStatus,
          assignedToEmail: issueAssignee.trim() || undefined,
        },
        bearerToken
      );
      setShowIssueModal(false);
      setIssueTitle('');
      setIssueDesc('');
      onShowAlert({
        variant: 'success',
        title: 'Tech / Software QA Ticket Created',
        message: 'Tracked under Product & Technology (separate from clinical sample quality).',
      });
      await loadTech();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Create Issue Failed',
        message: err instanceof Error ? err.message : 'Could not create technical issue.',
      });
    } finally {
      setSavingIssue(false);
    }
  }

  async function handleUpdateIssue(
    id: string,
    patch: { status?: TechIssueRecord['status']; qaStatus?: TechIssueRecord['qaStatus'] }
  ) {
    try {
      await updateTechIssueApi(id, patch, bearerToken);
      await loadTech();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Update Failed',
        message: err instanceof Error ? err.message : 'Unable to update issue.',
      });
    }
  }

  async function handleCreateBackup(e: FormEvent) {
    e.preventDefault();
    if (!bkpScope.trim()) return;
    setSavingBackup(true);
    try {
      await createBackupRecordApi(
        {
          backupType: bkpType,
          status: bkpStatus,
          scopeSummary: bkpScope.trim(),
          storageLocation: bkpStorage.trim(),
          recoveryPointObjectiveMinutes: Number(bkpRpo || 60),
        },
        bearerToken
      );
      setShowBackupModal(false);
      onShowAlert({
        variant: 'success',
        title: 'Backup Verification Recorded',
        message: 'Verified recovery snapshot has been logged to the immutable audit trail.',
      });
      await loadTech();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Backup Log Failed',
        message: err instanceof Error ? err.message : 'Unable to record backup verification.',
      });
    } finally {
      setSavingBackup(false);
    }
  }

  const unresolvedErrorsCount = (data?.errorLogs || []).filter((e) => !e.resolved).length;
  const openIssuesCount = (data?.techIssues || []).filter((i) => i.status !== 'RESOLVED').length;
  const qaPassedCount = (data?.techIssues || []).filter((i) => i.qaStatus === 'PASSED').length;
  const operationalSurfacesCount = (data?.platformsStatus || []).filter(
    (p) => p.status === 'OPERATIONAL'
  ).length;
  const latestHealth = (data?.healthChecks || [])[0];
  const verifiedBackupsCount = (data?.backups || []).filter((b) => b.status === 'VERIFIED').length;
  const latestBackupRpo = (data?.backups || [])[0]?.recoveryPointObjectiveMinutes ?? 60;

  if (loading && !data) {
    return (
      <div className="chart-card-modern">
        <h2 className="card-top-title">Product &amp; Technology Command (Vikas)</h2>
        <p style={{ color: '#64748B', fontSize: '0.86rem', marginTop: '8px' }}>
          Loading platform uptime probes, security posture, error telemetry, Software QA &amp; backup status...
        </p>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="chart-card-modern">
        <div className="admin-auth-alert error">{errorMsg}</div>
        <button type="button" className="btn-primary" onClick={() => void loadTech()}>
          Retry Loading Telemetry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Row (Matching Control Tower UI/UX) */}
      <div className="page-header-row" style={{ marginBottom: 0 }}>
        <div className="page-title-group">
          <h1>Product &amp; Technology Command (Vikas)</h1>
          <p>
            Platform Uptime, Security Matrix, Application Error Telemetry, Software QA Testing &amp; Disaster Recovery Verification.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {canManageHealth && (
            <button
              type="button"
              className="btn-secondary"
              disabled={runningHealth}
              onClick={() => void handleRunHealthCheck()}
            >
              {runningHealth ? 'Probing Services...' : '⚡ Run Live Health Check'}
            </button>
          )}
          {canManageBackups && (
            <button type="button" className="btn-secondary" onClick={() => setShowBackupModal(true)}>
              + Verify Backup
            </button>
          )}
          {canManageIssuesOrQa && (
            <button type="button" className="btn-primary" onClick={() => setShowIssueModal(true)}>
              + Log Tech / QA Ticket
            </button>
          )}
        </div>
      </div>

      {/* KPI Row (Matching Finance/Ops/Org 5-card modern layout) */}
      <section className="kpi-5-row" style={{ marginBottom: 0 }}>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-teal">🖥️</div>
          <div className="kpi-body">
            <span className="kpi-title">Operational Surfaces</span>
            <span className="kpi-main-number">
              {operationalSurfacesCount} / {(data?.platformsStatus || []).length || 4}
            </span>
            <span className="kpi-sub-split">Web portals, APIs &amp; mobile runtime</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-green">🛡️</div>
          <div className="kpi-body">
            <span className="kpi-title">Live System Health</span>
            <span className="kpi-main-number">{latestHealth?.overallStatus || 'HEALTHY'}</span>
            <span className="kpi-sub-split">
              {latestHealth
                ? `Probed ${new Date(latestHealth.checkedAt).toLocaleDateString('en-IN')}`
                : 'Ready to run live service probe'}
            </span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-orange">🚨</div>
          <div className="kpi-body">
            <span className="kpi-title">Open App Error Logs</span>
            <span className="kpi-main-number">{unresolvedErrorsCount}</span>
            <span className="kpi-sub-split">
              {data?.errorLogs.length || 0} total events tracked
            </span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-blue">🧪</div>
          <div className="kpi-body">
            <span className="kpi-title">Tech &amp; Software QA</span>
            <span className="kpi-main-number">{openIssuesCount} Open</span>
            <span className="kpi-sub-split">
              {qaPassedCount} passed QA • {data?.techIssues.length || 0} total
            </span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-purple">💾</div>
          <div className="kpi-body">
            <span className="kpi-title">Verified Backups</span>
            <span className="kpi-main-number">{verifiedBackupsCount}</span>
            <span className="kpi-sub-split">Target RPO: &le; {latestBackupRpo} mins</span>
          </div>
        </div>
      </section>

      {/* SOFTWARE QA vs OPS QUALITY NOTICE */}
      <div className="privacy-shield-banner" style={{ marginBottom: 0 }}>
        <strong>Role Boundary &amp; Coexisting Architecture:</strong> Vikas holds both{' '}
        <strong>SUPER_ADMIN</strong> and <strong>PRODUCT_TECHNOLOGY_HEAD</strong>. This command center manages
        software releases, API error logs, custom claims RBAC, webhook HMAC verification, and{' '}
        <strong>Software QA Executive</strong> tickets — strictly isolated from Operations &amp;
        Partnerships clinical sample quality SLAs.
      </div>

      {errorMsg && <div className="admin-auth-alert error">{errorMsg}</div>}

      {/* SUB-TABS */}
      <div className="sub-tab-pills" style={{ marginBottom: 0 }}>
        <button
          type="button"
          className={`sub-tab-pill ${subTab === 'platforms' ? 'active' : ''}`}
          onClick={() => setSubTab('platforms')}
        >
          Platforms &amp; Security Matrix
        </button>
        <button
          type="button"
          className={`sub-tab-pill ${subTab === 'health' ? 'active' : ''}`}
          onClick={() => setSubTab('health')}
        >
          System Health Probes ({data?.healthChecks.length || 0})
        </button>
        <button
          type="button"
          className={`sub-tab-pill ${subTab === 'errors' ? 'active' : ''}`}
          onClick={() => setSubTab('errors')}
        >
          App Error Logs ({unresolvedErrorsCount} open)
        </button>
        <button
          type="button"
          className={`sub-tab-pill ${subTab === 'issues' ? 'active' : ''}`}
          onClick={() => setSubTab('issues')}
        >
          Tech Issues &amp; Software QA ({openIssuesCount} open)
        </button>
        <button
          type="button"
          className={`sub-tab-pill ${subTab === 'backups' ? 'active' : ''}`}
          onClick={() => setSubTab('backups')}
        >
          Backups &amp; Recovery ({data?.backups.length || 0})
        </button>
      </div>

      {/* SUB-TAB: PLATFORMS & SECURITY MATRIX */}
      {subTab === 'platforms' && data && (
        <>
          <div className="chart-card-modern">
            <div className="card-top-header">
              <div>
                <h2 className="card-top-title">Connected Platform Runtimes</h2>
                <p style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  Real-time operational readiness across Admin Command Center, Lab Portals, Phlebo Mobile App, and Backend APIs.
                </p>
              </div>
              <span className="status-pill-green">{operationalSurfacesCount} OPERATIONAL</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: '12px',
              }}
            >
              {data.platformsStatus.map((plat) => (
                <div
                  key={plat.name}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    {plat.surface}
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '0.96rem', color: '#0F172A' }}>{plat.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '0.74rem', color: '#475569' }}>{plat.runtime}</span>
                    <span className={plat.status === 'OPERATIONAL' ? 'status-pill-green' : 'status-pill-amber'}>
                      {plat.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-card-modern">
            <h2 className="card-top-title">Platform Security &amp; Access Control Posture</h2>
            <div className="exec-summary-grid" style={{ marginTop: '14px' }}>
              <div className="exec-dept-card">
                <span className="kpi-title">Active Admin Accounts</span>
                <strong style={{ fontSize: '1.35rem', color: '#0F172A', marginTop: '4px' }}>
                  {data.securityMatrix.activeAdminAccounts}
                </strong>
                <span style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                  Super Admins: {data.securityMatrix.activeSuperAdmins}
                </span>
              </div>
              <div className="exec-dept-card">
                <span className="kpi-title">Granular Permission Keys</span>
                <strong style={{ fontSize: '1.35rem', color: '#0F172A', marginTop: '4px' }}>
                  {data.securityMatrix.permissionCatalogCount}
                </strong>
                <span style={{ fontSize: '0.75rem', color: '#0D9488', marginTop: '2px' }}>
                  Compact Token Claims: {data.securityMatrix.customClaimsCompactEnforced ? 'ENFORCED' : 'OFF'}
                </span>
              </div>
              <div className="exec-dept-card">
                <span className="kpi-title">Multi-Tenant Lab Isolation</span>
                <div style={{ marginTop: '6px' }}>
                  <span className={data.securityMatrix.multiTenantStrictLabIdEnforced ? 'status-pill-green' : 'status-pill-red'}>
                    {data.securityMatrix.multiTenantStrictLabIdEnforced ? 'STRICT LAB_ID RULES ACTIVE' : 'REVIEW'}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                  Prevents cross-lab data leakage
                </span>
              </div>
              <div className="exec-dept-card">
                <span className="kpi-title">Integrations &amp; Webhooks</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.78rem', marginTop: '6px' }}>
                  <span>
                    Razorpay Webhook HMAC:{' '}
                    <strong>{data.securityMatrix.webhookHmacVerified ? 'CONFIGURED' : 'SECRET PENDING'}</strong>
                  </span>
                  <span>
                    Email Templates:{' '}
                    <strong>{data.securityMatrix.emailDeliveryConfigured ? 'CONFIGURED' : 'DEV CONSOLE'}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* SUB-TAB: SYSTEM HEALTH CHECKS */}
      {subTab === 'health' && (
        <div className="chart-card-modern">
          <div className="card-top-header">
            <h2 className="card-top-title">System Health Probes ({data?.healthChecks.length || 0})</h2>
            {canManageHealth && (
              <button
                type="button"
                className="btn-primary"
                disabled={runningHealth}
                onClick={() => void handleRunHealthCheck()}
              >
                {runningHealth ? 'Probing...' : 'Run Probe Now'}
              </button>
            )}
          </div>
          {(data?.healthChecks || []).length === 0 ? (
            <div className="empty-state-box">
              <h4>No Health Probes Recorded Yet</h4>
              <p>Run a live system probe to verify identity, storage, database, email, and webhook status.</p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Checked At</th>
                    <th>Overall Status</th>
                    <th>Identity &amp; DB</th>
                    <th>Webhooks &amp; Email</th>
                    <th>Checked By</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.healthChecks || []).map((hc) => (
                    <tr key={hc.id}>
                      <td>{new Date(hc.checkedAt).toLocaleString('en-IN')}</td>
                      <td>
                        <span
                          className={
                            hc.overallStatus === 'HEALTHY'
                              ? 'status-pill-green'
                              : hc.overallStatus === 'DEGRADED'
                              ? 'status-pill-amber'
                              : 'status-pill-red'
                          }
                        >
                          {hc.overallStatus}
                        </span>
                      </td>
                      <td>
                        Auth: {hc.authServiceOk ? 'OK' : 'FAIL'} • DB: {hc.databaseOk ? 'OK' : 'FAIL'}
                      </td>
                      <td>
                        Webhook: {hc.paymentWebhookConfigured ? 'Configured' : 'Pending'} • Email:{' '}
                        {hc.emailServiceConfigured ? 'Configured' : 'Dev'}
                      </td>
                      <td>{hc.checkedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB: APP ERROR LOGS */}
      {subTab === 'errors' && (
        <div className="chart-card-modern">
          <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <h2 className="card-top-title">Application &amp; API Error Telemetry ({filteredErrorLogs.length})</h2>
            <select
              className="form-select"
              style={{ width: '175px', padding: '7px 10px' }}
              value={errorSeverityFilter}
              onChange={(e) => setErrorSeverityFilter(e.target.value as 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW')}
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
          {filteredErrorLogs.length === 0 ? (
            <div className="empty-state-box">
              <h4>Zero Application Errors Recorded</h4>
              <p>All web portals, backend services, and webhook processors are operating cleanly.</p>
            </div>
          ) : (
            <div className="data-table-container" style={{ marginTop: '12px' }}>
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Service &amp; Code</th>
                    <th>Message &amp; Route</th>
                    <th>Severity</th>
                    <th>Status</th>
                    {canResolveErrors && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredErrorLogs.map((errLog) => (
                    <tr key={errLog.id}>
                      <td>
                        <strong>{errLog.service.replace(/_/g, ' ')}</strong>
                        <div style={{ fontSize: '0.73rem', color: '#64748B' }}>{errLog.errorCode}</div>
                      </td>
                      <td>
                        <div>{errLog.message}</div>
                        <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                          {errLog.endpointOrRoute || 'Runtime'} • {new Date(errLog.createdAt).toLocaleString('en-IN')}
                        </div>
                      </td>
                      <td>
                        <span className={errLog.severity === 'CRITICAL' ? 'status-pill-red' : 'status-pill-amber'}>
                          {errLog.severity}
                        </span>
                      </td>
                      <td>
                        <span className={errLog.resolved ? 'status-pill-green' : 'status-pill-amber'}>
                          {errLog.resolved ? `RESOLVED (${errLog.resolvedBy || ''})` : 'OPEN'}
                        </span>
                      </td>
                      {canResolveErrors && (
                        <td>
                          {!errLog.resolved && (
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => void handleResolveError(errLog.id)}
                            >
                              Mark Resolved
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB: TECH ISSUES & SOFTWARE QA TRACKER */}
      {subTab === 'issues' && (
        <div className="chart-card-modern">
          <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <h2 className="card-top-title">Engineering Issues &amp; Software QA ({filteredIssues.length})</h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                className="form-select"
                style={{ width: '175px', padding: '7px 10px' }}
                value={issueStatusFilter}
                onChange={(e) => setIssueStatusFilter(e.target.value as 'ALL' | TechIssueRecord['status'])}
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN PROGRESS</option>
                <option value="IN_QA_REVIEW">IN QA REVIEW</option>
                <option value="RESOLVED">RESOLVED</option>
              </select>
              {canManageIssuesOrQa && (
                <button type="button" className="btn-primary" onClick={() => setShowIssueModal(true)}>
                  + Log Issue / QA Item
                </button>
              )}
            </div>
          </div>

          {filteredIssues.length === 0 ? (
            <div className="empty-state-box">
              <h4>No Open Tech or Software QA Tickets</h4>
              <p>Track portal bugs, Android Phlebo App release QA, and RBAC hardening tasks here.</p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Ticket &amp; Surface</th>
                    <th>Description</th>
                    <th>Priority</th>
                    <th>Workflow Status</th>
                    <th>Software QA</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map((iss) => (
                    <tr key={iss.id}>
                      <td>
                        <strong>{iss.issueKey}: {iss.title}</strong>
                        <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                          {iss.surface.replace(/_/g, ' ')} {iss.assignedToEmail ? `• ${iss.assignedToEmail}` : ''}
                        </div>
                      </td>
                      <td style={{ maxWidth: '280px', fontSize: '0.8rem', color: '#475569' }}>
                        {iss.description}
                      </td>
                      <td>
                        <span className={iss.priority === 'CRITICAL' ? 'status-pill-red' : 'status-pill-amber'}>
                          {iss.priority}
                        </span>
                      </td>
                      <td>
                        <select
                          className="form-select"
                          style={{ padding: '6px 9px', minWidth: '140px' }}
                          disabled={!canManageIssuesOrQa}
                          value={iss.status}
                          onChange={(e) =>
                            void handleUpdateIssue(iss.id, {
                              status: e.target.value as TechIssueRecord['status'],
                            })
                          }
                        >
                          <option value="OPEN">OPEN</option>
                          <option value="IN_PROGRESS">IN PROGRESS</option>
                          <option value="IN_QA_REVIEW">IN QA REVIEW</option>
                          <option value="RESOLVED">RESOLVED</option>
                        </select>
                      </td>
                      <td>
                        <select
                          className="form-select"
                          style={{ padding: '6px 9px', minWidth: '140px' }}
                          disabled={!canManageIssuesOrQa}
                          value={iss.qaStatus || 'PENDING_TEST'}
                          onChange={(e) =>
                            void handleUpdateIssue(iss.id, {
                              qaStatus: e.target.value as TechIssueRecord['qaStatus'],
                            })
                          }
                        >
                          <option value="PENDING_TEST">PENDING TEST</option>
                          <option value="PASSED">QA PASSED</option>
                          <option value="FAILED">QA FAILED</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB: BACKUPS & RECOVERY VERIFICATION */}
      {subTab === 'backups' && (
        <div className="chart-card-modern">
          <div className="card-top-header">
            <h2 className="card-top-title">Database Snapshots, Rules &amp; Recovery Verification ({data?.backups.length || 0})</h2>
            {canManageBackups && (
              <button type="button" className="btn-primary" onClick={() => setShowBackupModal(true)}>
                + Verify Backup Snapshot
              </button>
            )}
          </div>
          {(data?.backups || []).length === 0 ? (
            <div className="empty-state-box">
              <h4>No Backup Verification Records Logged Yet</h4>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>ID &amp; Type</th>
                    <th>Scope Summary</th>
                    <th>Storage Target</th>
                    <th>RPO</th>
                    <th>Status</th>
                    <th>Verified By</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.backups || []).map((bkp) => (
                    <tr key={bkp.id}>
                      <td>
                        <strong>{bkp.id}</strong>
                        <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                          {bkp.backupType.replace(/_/g, ' ')}
                        </div>
                      </td>
                      <td>{bkp.scopeSummary}</td>
                      <td style={{ fontSize: '0.76rem', color: '#475569' }}>{bkp.storageLocation}</td>
                      <td>{bkp.recoveryPointObjectiveMinutes || 60} min</td>
                      <td>
                        <span className={bkp.status === 'VERIFIED' ? 'status-pill-green' : 'status-pill-amber'}>
                          {bkp.status}
                        </span>
                      </td>
                      <td>
                        <div>{bkp.verifiedBy}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {new Date(bkp.createdAt).toLocaleString('en-IN')}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREATE TECH ISSUE / QA */}
      {showIssueModal && (
        <div className="modal-overlay" onClick={() => !savingIssue && setShowIssueModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Log Tech Issue / Software QA Item</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowIssueModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleCreateIssue(e)}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Platform Surface</label>
                    <select className="form-select" value={issueSurface} onChange={(e) => setIssueSurface(e.target.value as TechIssueRecord['surface'])}>
                      <option value="ADMIN_WEBSITE">Admin Website</option>
                      <option value="PARTNER_PORTAL">Partner Portal (Small / Large Labs)</option>
                      <option value="PHLEBO_MOBILE_APP">Phlebo Mobile App</option>
                      <option value="API_BACKEND">Backend API Services</option>
                      <option value="SECURITY_RBAC">Security &amp; RBAC</option>
                      <option value="QA_AUTOMATION">Software QA Regression</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select className="form-select" value={issuePriority} onChange={(e) => setIssuePriority(e.target.value as TechIssueRecord['priority'])}>
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Title *</label>
                  <input className="form-input" value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Description &amp; Acceptance Criteria *</label>
                  <textarea className="form-input" rows={3} value={issueDesc} onChange={(e) => setIssueDesc(e.target.value)} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Initial Software QA Status</label>
                    <select className="form-select" value={issueQaStatus} onChange={(e) => setIssueQaStatus(e.target.value as NonNullable<TechIssueRecord['qaStatus']>)}>
                      <option value="PENDING_TEST">PENDING TEST</option>
                      <option value="PASSED">PASSED</option>
                      <option value="FAILED">FAILED</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Assigned Engineer / Owner</label>
                    <select
                      className="form-select"
                      value={issueAssignee}
                      onChange={(e) => setIssueAssignee(e.target.value)}
                    >
                      <option value="">Unassigned (Triage Queue)</option>
                      {teamRoster.map((member) => (
                        <option key={member.email} value={member.email}>
                          {member.label} ({member.email})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowIssueModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingIssue}>
                  {savingIssue ? 'Logging...' : 'Create Tech Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECORD BACKUP VERIFICATION */}
      {showBackupModal && (
        <div className="modal-overlay" onClick={() => !savingBackup && setShowBackupModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Verify Platform Backup Snapshot</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowBackupModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleCreateBackup(e)}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Backup Type (Auto-Fills Scope)</label>
                    <select
                      className="form-select"
                      value={bkpType}
                      onChange={(e) => handleBackupTypeChange(e.target.value as BackupRecord['backupType'])}
                    >
                      <option value="DATABASE_SNAPSHOT">Database Snapshot</option>
                      <option value="RULES_CONFIG">Security Rules &amp; Config</option>
                      <option value="AUDIT_ARCHIVE">Immutable Audit Archive</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Verification Result</label>
                    <select className="form-select" value={bkpStatus} onChange={(e) => setBkpStatus(e.target.value as BackupRecord['status'])}>
                      <option value="VERIFIED">VERIFIED</option>
                      <option value="SCHEDULED">SCHEDULED</option>
                      <option value="FAILED">FAILED</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Scope Summary *</label>
                  <input className="form-input" value={bkpScope} onChange={(e) => setBkpScope(e.target.value)} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Storage Location</label>
                    <input className="form-input" value={bkpStorage} onChange={(e) => setBkpStorage(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">RPO (Minutes)</label>
                    <input className="form-input" type="number" min="1" value={bkpRpo} onChange={(e) => setBkpRpo(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowBackupModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingBackup}>
                  {savingBackup ? 'Recording...' : 'Record Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

