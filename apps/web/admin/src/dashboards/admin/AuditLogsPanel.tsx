import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SUPER_ADMIN_EMAIL,
  hasPermission,
  isEffectiveSuperAdmin,
  type UserProfile,
} from '@diagnostic/shared';
import {
  getAuditLogsApi,
  type AuditLogsWorkspaceData,
} from '../../services/orgApiService';

type AuditSubTab = 'audit' | 'automation' | 'logins';

interface AuditLogsPanelProps {
  currentUser: UserProfile;
  bearerToken?: string;
}

export function AuditLogsPanel({ currentUser, bearerToken }: AuditLogsPanelProps) {
  const [subTab, setSubTab] = useState<AuditSubTab>('audit');
  const [data, setData] = useState<AuditLogsWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'INFO' | 'SENSITIVE' | 'CRITICAL'>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const isSuperAdmin = useMemo(
    () => isEffectiveSuperAdmin(currentUser, DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser]
  );
  const canViewLoginHistory = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'VIEW_LOGIN_HISTORY', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getAuditLogsApi(120, bearerToken);
      setData(res.data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load immutable audit logs.');
    } finally {
      setLoading(false);
    }
  }, [bearerToken]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const filteredAuditLogs = useMemo(() => {
    const items = data?.auditLogs || [];
    const q = searchQuery.trim().toLowerCase();
    return items.filter((log) => {
      if (severityFilter !== 'ALL' && log.severity !== severityFilter) return false;
      if (deptFilter !== 'ALL' && (log.departmentId || 'SYSTEM') !== deptFilter) return false;
      if (!q) return true;
      return (
        log.action.toLowerCase().includes(q) ||
        log.summary.toLowerCase().includes(q) ||
        log.actorEmail.toLowerCase().includes(q) ||
        (log.resourceId || '').toLowerCase().includes(q)
      );
    });
  }, [data, severityFilter, deptFilter, searchQuery]);

  return (
    <div className="dashboard-view-fade">
      <div className="view-header-flex">
        <div>
          <h1 className="view-title-main">Immutable Audit Trail, Automation &amp; Sign-In Logs</h1>
          <p className="view-subtitle-muted">
            Tamper-Resistant Role Changes, Founder Seat Assignments, Financial Approvals, Automation Runs &amp; Sign-In History.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void loadLogs()}>
          Refresh Audit Feed
        </button>
      </div>

      {errorMsg && <div className="admin-auth-alert error">{errorMsg}</div>}

      <div className="sub-tab-pills">
        <button
          type="button"
          className={`sub-tab-pill ${subTab === 'audit' ? 'active' : ''}`}
          onClick={() => setSubTab('audit')}
        >
          Immutable Audit Trail ({data?.auditLogs.length || 0})
        </button>
        <button
          type="button"
          className={`sub-tab-pill ${subTab === 'automation' ? 'active' : ''}`}
          onClick={() => setSubTab('automation')}
        >
          All Automation Runs ({data?.automationRuns.length || 0})
        </button>
        <button
          type="button"
          className={`sub-tab-pill ${subTab === 'logins' ? 'active' : ''}`}
          onClick={() => setSubTab('logins')}
        >
          Sign-In History ({canViewLoginHistory ? data?.loginHistory.length || 0 : 'Restricted'})
        </button>
      </div>

      {loading && !data ? (
        <div className="chart-card-modern">Loading immutable audit history...</div>
      ) : null}

      {/* SUB-TAB: AUDIT LOGS */}
      {subTab === 'audit' && (
        <div className="chart-card-modern">
          <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <h2 className="card-top-title">Recorded Governance &amp; Security Events ({filteredAuditLogs.length})</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-input"
                style={{ width: '210px', padding: '7px 10px' }}
                placeholder="Search actor, action, resource..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="form-select"
                style={{ width: '150px', padding: '7px 10px' }}
                value={severityFilter}
                onChange={(e) =>
                  setSeverityFilter(e.target.value as 'ALL' | 'INFO' | 'SENSITIVE' | 'CRITICAL')
                }
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="SENSITIVE">SENSITIVE</option>
                <option value="INFO">INFO</option>
              </select>
              <select
                className="form-select"
                style={{ width: '190px', padding: '7px 10px' }}
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="ALL">All Departments</option>
                <option value="FINANCE_BUSINESS">Finance &amp; Business</option>
                <option value="OPERATIONS_PARTNERSHIPS">Operations &amp; Partnerships</option>
                <option value="MARKETING_GROWTH">Marketing &amp; Growth</option>
                <option value="PRODUCT_TECHNOLOGY">Product &amp; Technology</option>
                <option value="SYSTEM">Platform / Root</option>
              </select>
            </div>
          </div>

          {filteredAuditLogs.length === 0 ? (
            <div className="empty-state-box">
              <h4>No Audit Events Match Current Filter</h4>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Actor</th>
                    <th>Severity</th>
                    <th>Action &amp; Resource</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                        {new Date(log.createdAt).toLocaleString('en-IN')}
                      </td>
                      <td>
                        <strong>{log.actorName || log.actorEmail}</strong>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {log.actorEmail} • {log.actorRole}
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            log.severity === 'CRITICAL'
                              ? 'status-pill-red'
                              : log.severity === 'SENSITIVE'
                              ? 'status-pill-amber'
                              : 'status-pill-blue'
                          }
                        >
                          {log.severity}
                        </span>
                      </td>
                      <td>
                        <strong>{log.action}</strong>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {log.departmentId ? `${log.departmentId} • ` : ''}
                          {log.resourceType}
                          {log.resourceId ? ` (${log.resourceId})` : ''}
                        </div>
                      </td>
                      <td style={{ maxWidth: '340px', fontSize: '0.8rem', color: '#334155' }}>
                        {log.summary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB: AUTOMATION RUNS */}
      {subTab === 'automation' && (
        <div className="chart-card-modern">
          <h2 className="card-top-title">Idempotent Automation Execution History ({data?.automationRuns.length || 0})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            {(data?.automationRuns || []).length === 0 ? (
              <div className="empty-state-box">
                <h4>No Automation Jobs Recorded Yet</h4>
              </div>
            ) : (
              (data?.automationRuns || []).map((run) => (
                <div key={run.id} className="automation-run-row">
                  <div>
                    <strong>
                      {run.automationType.replace(/_/g, ' ')} • {run.departmentId.replace(/_/g, ' ')}
                    </strong>
                    <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>{run.summary}</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                      Processed: {run.processedCount} • Alerts: {run.alertCount} • Dedup Skipped:{' '}
                      {run.dedupSkippedCount} • By {run.triggeredByEmail} •{' '}
                      {new Date(run.createdAt).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <span className={run.status === 'SUCCESS' ? 'status-pill-green' : 'status-pill-amber'}>
                    {run.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB: LOGIN HISTORY */}
      {subTab === 'logins' && (
        <div className="chart-card-modern">
          <h2 className="card-top-title">Authenticated Sign-In History</h2>
          {!canViewLoginHistory ? (
            <div className="privacy-shield-banner" style={{ marginTop: '12px' }}>
              <strong>Permission Required:</strong> Viewing detailed account sign-in history requires{' '}
              <code>VIEW_LOGIN_HISTORY</code> or Super Admin access.
            </div>
          ) : (data?.loginHistory || []).length === 0 ? (
            <div className="empty-state-box" style={{ marginTop: '12px' }}>
              <h4>No Sign-In History Events Logged Yet</h4>
              <p>Sign-in events from the portal, admin hub, and partner logins appear here automatically.</p>
            </div>
          ) : (
            <div className="data-table-container" style={{ marginTop: '12px' }}>
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Account</th>
                    <th>Client &amp; Method</th>
                    <th>Outcome</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.loginHistory || []).map((ev) => (
                    <tr key={ev.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                        {new Date(ev.createdAt).toLocaleString('en-IN')}
                      </td>
                      <td>
                        <strong>{ev.email}</strong>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {ev.role} {ev.departmentId ? `• ${ev.departmentId}` : ''}
                        </div>
                      </td>
                      <td>
                        {ev.clientType} • {ev.authMethod}
                      </td>
                      <td>
                        <span className={ev.success ? 'status-pill-green' : 'status-pill-red'}>
                          {ev.success ? 'SUCCESS' : 'BLOCKED'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.76rem', color: '#64748B' }}>
                        {ev.failureReason || ev.ipAddress || 'Verified session'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

