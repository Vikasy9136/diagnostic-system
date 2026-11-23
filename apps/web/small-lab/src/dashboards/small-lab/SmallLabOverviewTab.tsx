import {
  type DiagnosticReportRecord,
  formatInr,
  formatOrderStatus,
  type LabFacility,
  type PatientRecord,
  type PhlebotomistProfile,
  type PickupOrder,
} from '@diagnostic/shared';
import {
  BookingsTrendCard,
  EmptyStateBox,
  StatusDonutCard,
} from '../../components/shared';
import { type SmallLabMetrics, type SmallLabTab } from './smallLabTypes';

export interface SmallLabOverviewTabProps {
  myLabFacility: LabFacility;
  profileUserCode?: string;
  trendDays: 7 | 30;
  onToggleTrendDays: () => void;
  onSelectTab: (tab: SmallLabTab) => void;
  onOpenAddPatient: () => void;
  onOpenOrderChat?: (order: PickupOrder) => void;
  metrics: SmallLabMetrics;
  orders: PickupOrder[];
  reports: DiagnosticReportRecord[];
  patients: PatientRecord[];
  onlinePhlebos: PhlebotomistProfile[];
  verifiedLargeLabs: LabFacility[];
}

export function SmallLabOverviewTab({
  myLabFacility,
  profileUserCode,
  trendDays,
  onToggleTrendDays,
  onSelectTab,
  onOpenAddPatient,
  onOpenOrderChat,
  metrics,
  orders,
  reports,
  patients,
  onlinePhlebos,
  verifiedLargeLabs,
}: SmallLabOverviewTabProps) {
  return (
    <>
      <div className="page-header-row">
        <div className="page-title-group">
          <h1>Collection Centre Portal</h1>
          <p style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>{myLabFacility.name}</span>
            <span className="user-code-badge">
              {myLabFacility.userCode || profileUserCode || myLabFacility.id}
            </span>
            <span>— live pickup orders &amp; sample tracking</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn-secondary" onClick={onToggleTrendDays}>
            📅 {trendDays === 30 ? 'Last 30 Days' : 'Last 7 Days'}
          </button>
          <button type="button" className="btn-primary" onClick={() => onSelectTab('new-booking')}>
            + New Pickup Booking
          </button>
        </div>
      </div>

      <section className="kpi-5-row">
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-mint">📦</div>
          <div className="kpi-body">
            <span className="kpi-title">Total Bookings</span>
            <span className="kpi-main-number">{metrics.totalBookings}</span>
            <span className="kpi-sub-split">{metrics.activePickupsCount} awaiting pickup</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-blue">🚚</div>
          <div className="kpi-body">
            <span className="kpi-title">Samples In Transit</span>
            <span className="kpi-main-number">{metrics.inTransitCount}</span>
            <span className="kpi-sub-split">Cold-chain active</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-green">📄</div>
          <div className="kpi-body">
            <span className="kpi-title">Verified Reports</span>
            <span className="kpi-main-number">{reports.length}</span>
            <span className="kpi-sub-split">{metrics.completedCount} completed orders</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-indigo">👥</div>
          <div className="kpi-body">
            <span className="kpi-title">Registered Patients</span>
            <span className="kpi-main-number">{patients.length}</span>
            <span className="kpi-sub-split">Saved at your center</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-purple">₹</div>
          <div className="kpi-body">
            <span className="kpi-title">Total Billed</span>
            <span className="kpi-main-number">{formatInr(metrics.totalBilled)}</span>
            <span className="kpi-sub-split">{formatInr(metrics.pendingPay)} pending</span>
          </div>
        </div>
      </section>

      <section className="analytics-3-row">
        <BookingsTrendCard
          title="Dispatch Volume Trend"
          primaryLabel="Created"
          secondaryLabel="Reports Ready"
          buckets={metrics.trendBuckets}
        />

        <StatusDonutCard
          title="Booking Lifecycle"
          centerLabel="Orders"
          breakdown={metrics.statusBreakdown}
          labels={{
            completed: 'Completed',
            inProgress: 'In Progress',
            assigned: 'Pickup Queue',
            rejected: 'Rejected',
          }}
        />

        <div className="chart-card-modern">
          <div className="card-top-header">
            <span className="card-top-title">Dispatch Quick-Actions</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button type="button" className="btn-primary btn-full" onClick={() => onSelectTab('new-booking')}>
              ➕ Create Pickup Booking
            </button>
            <button type="button" className="btn-secondary btn-full" onClick={onOpenAddPatient}>
              👤 Add Patient Record
            </button>
            <button type="button" className="btn-secondary btn-full" onClick={() => onSelectTab('reports')}>
              📄 View Diagnostic Reports ({reports.length})
            </button>
            <button type="button" className="btn-secondary btn-full" onClick={() => onSelectTab('partners')}>
              🔬 Partner Labs ({verifiedLargeLabs.length} Online)
            </button>
          </div>
        </div>
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
              title="No Pickup Bookings Created Yet"
              description="Create your first live pickup request using real patients and verified reference labs."
              actionLabel="+ Create First Booking"
              onAction={() => onSelectTab('new-booking')}
            />
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Booking ID</th>
                    <th>Patient</th>
                    <th>Reference Hub</th>
                    <th>Tests</th>
                    <th>OTP</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 6).map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.orderNumber}</strong>
                      </td>
                      <td>{o.patient.pseudonym}</td>
                      <td>{o.targetLabName}</td>
                      <td>{o.specimens.map((s) => s.testCode).join(', ')}</td>
                      <td>
                        <code>{o.handoverOtp || '—'}</code>
                      </td>
                      <td>
                        <span className="status-pill-blue">{formatOrderStatus(o.status)}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          {o.phlebotomistId && onOpenOrderChat && (
                            <button
                              type="button"
                              className="btn-primary"
                              style={{
                                fontSize: '0.72rem',
                                padding: '3px 8px',
                                background: '#2563EB',
                                borderColor: '#2563EB',
                                cursor: 'pointer',
                              }}
                              onClick={() => onOpenOrderChat(o)}
                            >
                              💬 Chat
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                            onClick={() => onSelectTab('bookings')}
                          >
                            Details &rarr;
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

        <div className="chart-card-modern">
          <div className="card-top-header">
            <span className="card-top-title">Available Couriers</span>
          </div>
          {onlinePhlebos.length === 0 ? (
            <EmptyStateBox
              title="No Online Couriers"
              description="Bookings placed now enter the open pickup pool immediately."
            />
          ) : (
            onlinePhlebos.slice(0, 4).map((p) => (
              <div key={p.id} className="network-list-item">
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{p.name}</div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                    {p.currentLocation} • {p.chillerTempCelsius}°C
                  </div>
                </div>
                <span className="status-pill-green">ONLINE</span>
              </div>
            ))
          )}
        </div>

        <div className="chart-card-modern">
          <div className="card-top-header">
            <span className="card-top-title">Verified Reference Hubs</span>
          </div>
          {verifiedLargeLabs.length === 0 ? (
            <EmptyStateBox
              title="No Reference Hubs Verified"
              description="Ask Platform Admin to register & verify Large Partner Labs."
            />
          ) : (
            verifiedLargeLabs.slice(0, 4).map((l) => (
              <div key={l.id} className="network-list-item">
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{l.name}</div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                    {l.city} • {l.nablNumber || 'NABL'}
                  </div>
                </div>
                <span className="status-pill-green">VERIFIED</span>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
