import {
  type CommissionConfig,
  type DiagnosticReportRecord,
  formatInr,
  formatOrderStatus,
  type LabFacility,
  type LargeLabB2bAgreement,
  type PickupOrder,
} from '@diagnostic/shared';
import { EmptyStateBox, StatusDonutCard } from '../../components/shared';
import { type FormatLabelFn } from '../types';
import {
  type LargeLabMetrics,
  type LargeLabOrgCatalogItems,
  type LargeLabTab,
} from './largeLabTypes';

export interface LargeLabOverviewTabProps {
  myLab: LabFacility | null;
  orgId: string;
  orgRootLab: LabFacility | null;
  orgCenters: LabFacility[];
  isBranchCenter: boolean;
  displayName: string;
  userCode?: string;
  labId?: string;
  centerFilter: string;
  onCenterFilterChange: (nextFilter: string) => void;
  orders: PickupOrder[];
  filteredOrders: PickupOrder[];
  reports: DiagnosticReportRecord[];
  metrics: LargeLabMetrics;
  orgCatalogItems: LargeLabOrgCatalogItems;
  activeAgreement?: LargeLabB2bAgreement;
  commConfig: CommissionConfig;
  formatLabel: FormatLabelFn;
  onSelectTab: (tab: LargeLabTab) => void;
  onTrackOrder: (order: PickupOrder) => void;
}

export function LargeLabOverviewTab({
  myLab,
  orgId,
  orgRootLab,
  orgCenters,
  isBranchCenter,
  displayName,
  userCode,
  labId,
  centerFilter,
  onCenterFilterChange,
  orders,
  filteredOrders,
  reports,
  metrics,
  orgCatalogItems,
  activeAgreement,
  commConfig,
  formatLabel,
  onSelectTab,
  onTrackOrder,
}: LargeLabOverviewTabProps) {
  return (
    <>
      <div className="page-header-row">
        <div className="page-title-group">
          <h1>{isBranchCenter ? 'Collection Center Branch Dashboard' : 'Reference Lab Hub Dashboard'}</h1>
          <p>
            {myLab?.name || displayName}
            {isBranchCenter && orgRootLab
              ? ` (Branch under ${orgRootLab.name})`
              : ` — ${orgCenters.length} Connected Center(s)`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {!isBranchCenter && orgCenters.length > 1 && (
            <select
              className="form-select"
              style={{ width: '210px' }}
              value={centerFilter}
              onChange={(e) => onCenterFilterChange(e.target.value)}
            >
              <option value="ALL_ORG">All Org Centers ({orders.length})</option>
              {orgCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.centerType === 'COLLECTION_CENTER' ? 'Branch' : 'Main HQ'})
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn-primary" onClick={() => onSelectTab('incoming')}>
            🧊 Open QC Queue ({metrics.incomingCount})
          </button>
        </div>
      </div>

      <section className="kpi-5-row">
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-blue">🧊</div>
          <div className="kpi-body">
            <span className="kpi-title">Incoming Specimens</span>
            <span className="kpi-main-number">{metrics.incomingCount}</span>
            <span className="kpi-sub-split">In transit / awaiting QC</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-mint">🔬</div>
          <div className="kpi-body">
            <span className="kpi-title">Under Analysis</span>
            <span className="kpi-main-number">{metrics.inTestingCount}</span>
            <span className="kpi-sub-split">Active bench queue</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-green">📄</div>
          <div className="kpi-body">
            <span className="kpi-title">Verified Reports</span>
            <span className="kpi-main-number">{reports.length}</span>
            <span className="kpi-sub-split">
              Avg TAT: {metrics.avgTatMins ? `${metrics.avgTatMins} mins` : '—'}
            </span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-indigo">🏷️</div>
          <div className="kpi-body">
            <span className="kpi-title">Org Tests &amp; Packages</span>
            <span className="kpi-main-number">{orgCatalogItems.owned.length}</span>
            <span className="kpi-sub-split">+{orgCatalogItems.globalFallback.length} global baseline</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-purple">₹</div>
          <div className="kpi-body">
            <span className="kpi-title">Lab Receivables</span>
            <span className="kpi-main-number">{formatInr(metrics.totalReceivable)}</span>
            <span className="kpi-sub-split">{formatInr(metrics.pendingReceivable)} unsettled</span>
          </div>
        </div>
      </section>

      <section className="bottom-3-row">
        <div className="chart-card-modern">
          <div className="card-top-header">
            <span className="card-top-title">Incoming &amp; Live Pickups</span>
            <button type="button" className="btn-link-muted" onClick={() => onSelectTab('incoming')}>
              Open QC Queue →
            </button>
          </div>
          {filteredOrders.length === 0 ? (
            <EmptyStateBox
              title="No Specimens Routed Yet"
              description={`Live bookings sent to ${
                isBranchCenter ? 'this Collection Center' : 'your Reference Lab organization'
              } appear here right away.`}
            />
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Source Lab</th>
                    <th>Courier &amp; Live GPS</th>
                    <th>Tests</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.slice(0, 6).map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.orderNumber}</strong>
                        {o.targetLabName && (
                          <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{o.targetLabName}</div>
                        )}
                      </td>
                      <td>{o.smallLabName}</td>
                      <td>
                        {o.phlebotomistName ? (
                          <div>
                            <strong>{o.phlebotomistName}</strong>
                            {o.phleboLiveLocation && (
                              <div>
                                <button
                                  type="button"
                                  className="btn-link-muted"
                                  style={{ fontSize: '0.74rem' }}
                                  onClick={() => onTrackOrder(o)}
                                >
                                  📍 Track Route
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#64748B' }}>Broadcasting (1–5 km)</span>
                        )}
                      </td>
                      <td>{o.specimens.map((s) => s.testCode).join(', ')}</td>
                      <td>
                        <span className="status-pill-blue">{formatOrderStatus(o.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <StatusDonutCard
          title="Processing Distribution"
          centerLabel="Orders"
          breakdown={metrics.statusBreakdown}
          labels={{
            completed: 'Reported',
            inProgress: 'QC / Testing',
            assigned: 'Pre-Delivery',
            rejected: 'Rejected',
          }}
          showPercentages={false}
        />

        <div className="chart-card-modern">
          <div className="card-top-header">
            <span className="card-top-title">Hub &amp; Contract Info</span>
          </div>
          <div className="network-list-item">
            <span>Assigned Center ID</span>
            <span className="user-code-badge">
              {myLab?.userCode || userCode || labId || 'N/A'}
            </span>
          </div>
          <div className="network-list-item">
            <span>Hierarchy</span>
            <strong>{isBranchCenter ? `Branch of ${orgId}` : `Main Hub (${orgCenters.length} centers)`}</strong>
          </div>
          <div className="network-list-item">
            <span>NABL Cert</span>
            <strong>{myLab?.nablNumber || 'NABL ISO 15189'}</strong>
          </div>
          <div className="network-list-item">
            <span>B2B Commission</span>
            <strong>
              {activeAgreement
                ? `${activeAgreement.agreedCommissionPct}% Agreed`
                : `${commConfig.commissionPct}% Standard`}
            </strong>
          </div>
          <div className="network-list-item">
            <span>Verification</span>
            <span className="status-pill-green">{formatLabel(myLab?.verificationStatus || 'VERIFIED')}</span>
          </div>
        </div>
      </section>
    </>
  );
}

