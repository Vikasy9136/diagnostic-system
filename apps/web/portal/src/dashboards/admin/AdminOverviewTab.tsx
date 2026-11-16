import {
  type CommissionConfig,
  type CoreDepartmentId,
  formatInr,
  formatOrderStatus,
  type LabFacility,
  type PhlebotomistProfile,
  type PickupOrder,
  type DiagnosticReportRecord,
  type UserProfile,
  UserRole,
} from '@diagnostic/shared';
import {
  BookingsTrendCard,
  EmptyStateBox,
  StatusDonutCard,
} from '../../components/shared';
import { type ExecutiveSummaryData } from '../../services/orgApiService';
import { type AdminDeptView, type AdminMetrics, type AdminTab } from './adminTypes';

export interface AdminOverviewTabProps {
  metrics: AdminMetrics;
  trendDays: 7 | 30;
  onToggleTrendDays: () => void;
  labs: LabFacility[];
  phlebotomists: PhlebotomistProfile[];
  orders: PickupOrder[];
  managedUsers: UserProfile[];
  reports: DiagnosticReportRecord[];
  execSummary: ExecutiveSummaryData | null;
  commConfig: CommissionConfig;
  canViewTab: (tab: AdminTab) => boolean;
  onSelectTab: (tab: AdminTab) => void;
  onSelectDeptWorkspace: (dept: AdminDeptView, tab: AdminTab) => void;
  onOpenAddUserModal: (role: UserRole) => void;
  onOpenAddTestModal: () => void;
  onExportCsv: () => void;
}

export function AdminOverviewTab({
  metrics,
  trendDays,
  onToggleTrendDays,
  labs,
  phlebotomists,
  orders,
  managedUsers,
  reports,
  execSummary,
  commConfig,
  canViewTab,
  onSelectTab,
  onSelectDeptWorkspace,
  onOpenAddUserModal,
  onOpenAddTestModal,
  onExportCsv,
}: AdminOverviewTabProps) {
  return (
    <>
      <div className="page-header-row">
        <div className="page-title-group">
          <h1>Admin Dashboard</h1>
          <p>Live overview of bookings, samples, labs, and payouts</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={onToggleTrendDays}
        >
          📅 {trendDays === 30 ? 'Last 30 Days View' : 'Last 7 Days View'}
        </button>
      </div>

      <section className="kpi-5-row">
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-mint">📦</div>
          <div className="kpi-body">
            <span className="kpi-title">Total Bookings</span>
            <span className="kpi-main-number">{metrics.totalOrders}</span>
            <span className="kpi-sub-split">{metrics.completedCount} completed</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-blue">🧪</div>
          <div className="kpi-body">
            <span className="kpi-title">Total Specimens</span>
            <span className="kpi-main-number">{metrics.totalSpecimens}</span>
            <span className="kpi-sub-split">Cold-chain {metrics.coldChainRate}</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-indigo">🏥</div>
          <div className="kpi-body">
            <span className="kpi-title">Registered Labs</span>
            <span className="kpi-main-number">{labs.length}</span>
            <span className="kpi-sub-split">
              {metrics.smallLabsCount} Small | {metrics.largeLabsCount} Large
            </span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-purple">🏍️</div>
          <div className="kpi-body">
            <span className="kpi-title">Phlebotomists</span>
            <span className="kpi-main-number">{phlebotomists.length}</span>
            <span className="kpi-sub-split">{metrics.onlinePhlebosCount} Online now</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-mint">₹</div>
          <div className="kpi-body">
            <span className="kpi-title">Platform Revenue</span>
            <span className="kpi-main-number">{formatInr(metrics.totalRevenue)}</span>
            <span className="kpi-sub-split">Total from partner settlements</span>
          </div>
        </div>
      </section>

      <section className="analytics-3-row">
        <BookingsTrendCard
          title="Bookings Trend (Live)"
          buckets={metrics.trendBuckets}
        />

        <StatusDonutCard
          title="Booking Status"
          breakdown={metrics.statusBreakdown}
        />

        <div className="chart-card-modern">
          <div className="card-top-header">
            <span className="card-top-title">Live Operations</span>
          </div>
          <div className="live-ops-split">
            <div className="mini-map-canvas">
              <svg width="100%" height="100%" viewBox="0 0 180 160" preserveAspectRatio="none">
                <path d="M 10 40 L 170 40 M 10 90 L 170 90 M 50 10 L 50 150 M 120 10 L 120 150" stroke="#E2E8F0" strokeWidth="1.5" />
                <circle cx="90" cy="80" r="14" fill="#2563EB" fillOpacity="0.16" />
                <circle cx="90" cy="80" r="7" fill="#2563EB" />
                {labs.slice(0, 6).map((l, i) => (
                  <circle
                    key={l.id}
                    cx={30 + ((i * 29) % 120)}
                    cy={28 + ((i * 37) % 105)}
                    r="5"
                    fill={l.type === 'LARGE_LAB' ? '#0D9488' : '#10B981'}
                  />
                ))}
              </svg>
            </div>
            <div className="live-ops-metrics-list">
              <div className="ops-metric-item">
                <div className="ops-icon-circle" style={{ background: '#EFF6FF', color: '#2563EB' }}>👤</div>
                <div>
                  <div className="ops-metric-val">{metrics.onlinePhlebosCount}</div>
                  <div className="ops-metric-label">Online Couriers</div>
                </div>
              </div>
              <div className="ops-metric-item">
                <div className="ops-icon-circle" style={{ background: '#ECFDF5', color: '#059669' }}>📦</div>
                <div>
                  <div className="ops-metric-val">{metrics.activePickupsCount}</div>
                  <div className="ops-metric-label">Active Pickups</div>
                </div>
              </div>
              <div className="ops-metric-item">
                <div className="ops-icon-circle" style={{ background: '#FEF3C7', color: '#D97706' }}>🚚</div>
                <div>
                  <div className="ops-metric-val">{metrics.inTransitCount}</div>
                  <div className="ops-metric-label">In Transit</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="quick-actions-bar">
        {canViewTab('users') && (
          <button type="button" className="action-card-btn" onClick={() => onOpenAddUserModal(UserRole.SMALL_LAB)}>
            <span className="action-btn-icon">🛡️</span>
            <span className="action-btn-text">+ Add Role User</span>
          </button>
        )}
        {canViewTab('labs') && (
          <button type="button" className="action-card-btn" onClick={() => onOpenAddUserModal(UserRole.SMALL_LAB)}>
            <span className="action-btn-icon">🏥</span>
            <span className="action-btn-text">+ Add Lab / Center</span>
          </button>
        )}
        {canViewTab('phlebotomists') && (
          <button type="button" className="action-card-btn" onClick={() => onOpenAddUserModal(UserRole.PHLEBOTOMIST)}>
            <span className="action-btn-icon">🏍️</span>
            <span className="action-btn-text">+ Add Phlebotomist</span>
          </button>
        )}
        {canViewTab('master-data') && (
          <button type="button" className="action-card-btn" onClick={onOpenAddTestModal}>
            <span className="action-btn-icon">🧪</span>
            <span className="action-btn-text">+ Add Test / Package</span>
          </button>
        )}
        {canViewTab('bookings') && (
          <button type="button" className="action-card-btn" onClick={() => onSelectTab('bookings')}>
            <span className="action-btn-icon">📋</span>
            <span className="action-btn-text">Manage Bookings</span>
          </button>
        )}
        {canViewTab('commission') && (
          <button type="button" className="action-card-btn" onClick={() => onSelectTab('commission')}>
            <span className="action-btn-icon">%</span>
            <span className="action-btn-text">B2B Rate Rules</span>
          </button>
        )}
        <button type="button" className="action-card-btn" onClick={onExportCsv}>
          <span className="action-btn-icon">📥</span>
          <span className="action-btn-text">Export CSV</span>
        </button>
      </section>

      <section className="bottom-3-row">
        <div className="chart-card-modern">
          <div className="card-top-header">
            <span className="card-top-title">Recent Bookings</span>
            <button type="button" className="btn-link-muted" onClick={() => onSelectTab('bookings')}>
              View All →
            </button>
          </div>
          {orders.length === 0 ? (
            <EmptyStateBox
              title="No Bookings Yet"
              description="Once a Collection Lab submits a sample pickup booking, it appears here right away."
            />
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Source Lab</th>
                    <th>Tests</th>
                    <th>Courier</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 6).map((o) => (
                    <tr key={o.id}>
                      <td><strong>{o.orderNumber}</strong></td>
                      <td>{o.smallLabName}</td>
                      <td>{o.specimens.map((s) => s.testCode).join(', ')}</td>
                      <td>{o.phlebotomistName || 'Unassigned'}</td>
                      <td><span className="status-pill-blue">{formatOrderStatus(o.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="chart-card-modern">
          <div className="card-top-header">
            <span className="card-top-title">Network Overview</span>
          </div>
          <div className="network-list-item">
            <span className="network-item-label">🏢 Small Labs</span>
            <span className="network-item-number">{metrics.smallLabsCount}</span>
          </div>
          <div className="network-list-item">
            <span className="network-item-label">🔬 Reference Labs</span>
            <span className="network-item-number">{metrics.largeLabsCount}</span>
          </div>
          <div className="network-list-item">
            <span className="network-item-label">🏍️ Phlebotomists</span>
            <span className="network-item-number">{phlebotomists.length}</span>
          </div>
          <div className="network-list-item">
            <span className="network-item-label">🛡️ Role Accounts</span>
            <span className="network-item-number">{managedUsers.length}</span>
          </div>
        </div>

        <div className="chart-card-modern">
          <div className="card-top-header">
            <span className="card-top-title">Today&apos;s Highlights</span>
          </div>
          <div className="highlight-row-item">
            <span>✓ Completed Today</span>
            <strong>{metrics.todayCompletedCount}</strong>
          </div>
          <div className="highlight-row-item">
            <span>📦 Bookings Today</span>
            <strong>{metrics.todayOrdersCount}</strong>
          </div>
          <div className="highlight-row-item">
            <span>₹ Today&apos;s Volume</span>
            <strong>{formatInr(metrics.todayRevenue)}</strong>
          </div>
          <div className="highlight-row-item">
            <span>📄 Reports Published</span>
            <strong>{reports.length}</strong>
          </div>
        </div>
      </section>

      {execSummary && (
        <div className="chart-card-modern" style={{ marginTop: '20px' }}>
          <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 className="card-top-title">Executive Cross-Department Command (Founder Reporting Structure)</h2>
              <p style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                Live department status reporting into Super Admin • Billing Mode:{' '}
                <strong>
                  {commConfig.billingMode === 'FULL_B2B_SPLIT'
                    ? 'Full B2B Commission & Split Payouts'
                    : commConfig.billingMode === 'INSTANT_30M_PAYOUT' || commConfig.hideSubscriptionsUi !== false
                    ? '30-Min Instant Partner & Courier Payouts + Platform Fees'
                    : 'Subscription + Platform Fees (Commissions Inactive)'}
                </strong>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span
                className={
                  execSummary.systemHealth.latestCheck.overallStatus === 'HEALTHY'
                    ? 'status-pill-green'
                    : 'status-pill-amber'
                }
              >
                System: {execSummary.systemHealth.latestCheck.overallStatus} (
                {execSummary.systemHealth.unresolvedErrorsCount} open errors)
              </span>
              {canViewTab('org-structure') && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onSelectTab('org-structure')}
                >
                  Manage Founder Seats
                </button>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              marginBottom: '16px',
              padding: '10px 12px',
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: '10px',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: '0.82rem', color: '#92400E' }}>
              <strong>Human Approvals Queue:</strong>{' '}
              {execSummary.pendingApprovals.refundRequests} Refund Requests •{' '}
              {execSummary.pendingApprovals.verificationReviews} KYC/NABL Verifications •{' '}
              {execSummary.pendingApprovals.labCompliancePending} Pending Labs •{' '}
              {execSummary.pendingApprovals.expenseApprovals} Expense Approvals
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {canViewTab('finance-ops') && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onSelectDeptWorkspace('FINANCE_BUSINESS', 'finance-ops')}
                >
                  Review Finance Approvals
                </button>
              )}
              {canViewTab('ops-command') && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onSelectDeptWorkspace('OPERATIONS_PARTNERSHIPS', 'ops-command')}
                >
                  Review KYC &amp; Exceptions
                </button>
              )}
            </div>
          </div>

          <div className="exec-summary-grid">
            {execSummary.departmentReports.map((rep) => {
              const targetTab: AdminTab =
                rep.departmentId === 'FINANCE_BUSINESS'
                  ? 'finance-ops'
                  : rep.departmentId === 'OPERATIONS_PARTNERSHIPS'
                  ? 'ops-command'
                  : rep.departmentId === 'MARKETING_GROWTH'
                  ? 'marketing-growth'
                  : 'product-tech';
              return (
                <div key={rep.departmentId} className="exec-dept-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <strong>{rep.departmentName}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        Head: {rep.headName} {rep.headEmail ? `(${rep.headEmail})` : '(Awaiting Email)'}
                      </div>
                    </div>
                    <span className={rep.headEmail ? 'status-pill-green' : 'status-pill-amber'}>
                      {rep.headEmail ? 'ACTIVE' : 'AWAITING'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#475569' }}>
                    {rep.designationCount} future designations • {rep.activeEmployeeCount} active staff
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.entries(rep.keyMetrics).slice(0, 3).map(([k, v]) => (
                      <span key={k} className="status-pill-slate">
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                  {canViewTab(targetTab) && (
                    <button
                      type="button"
                      className="btn-link-muted"
                      style={{ alignSelf: 'flex-start', marginTop: 'auto' }}
                      onClick={() =>
                        onSelectDeptWorkspace(rep.departmentId as CoreDepartmentId, targetTab)
                      }
                    >
                      Open Department Workspace →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
