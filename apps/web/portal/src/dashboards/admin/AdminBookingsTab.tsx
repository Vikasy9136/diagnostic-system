import {
  formatInr,
  formatOrderStatus,
  OrderStatus,
  type PickupOrder,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';

export interface AdminBookingsTabProps {
  filteredOrders: PickupOrder[];
  orderStatusFilter: string;
  onOrderStatusFilterChange: (status: string) => void;
  onExportCsv: () => void;
  onTrackOrder: (order: PickupOrder) => void;
  onAssignCourier: (order: PickupOrder) => void;
}

export function AdminBookingsTab({
  filteredOrders,
  orderStatusFilter,
  onOrderStatusFilterChange,
  onExportCsv,
  onTrackOrder,
  onAssignCourier,
}: AdminBookingsTabProps) {
  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <div>
          <h2 className="card-top-title">Live Specimen Pickup Bookings ({filteredOrders.length})</h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Real-time bookings across all connected labs</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            className="form-select"
            style={{ width: '210px' }}
            value={orderStatusFilter}
            onChange={(e) => onOrderStatusFilterChange(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            {Object.values(OrderStatus).map((st) => (
              <option key={st} value={st}>{formatOrderStatus(st)}</option>
            ))}
          </select>
          <button type="button" className="btn-primary" onClick={onExportCsv}>
            Export CSV
          </button>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <EmptyStateBox
          title="No Matching Bookings Found"
          description="Live orders submitted from Collection Centers will appear here automatically."
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Booking ID</th>
                <th>Collection Centre</th>
                <th>Target Hub</th>
                <th>Patient</th>
                <th>Tests</th>
                <th>Phlebotomist</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.orderNumber}</strong>
                    {o.serviceZoneName && (
                      <div style={{ fontSize: '0.7rem', color: '#0F766E', marginTop: '2px' }}>
                        Zone: {o.serviceZoneName}
                      </div>
                    )}
                  </td>
                  <td>{o.smallLabName}</td>
                  <td>{o.targetLabName}</td>
                  <td>{o.patient.pseudonym}</td>
                  <td>{o.specimens.map((s) => s.testCode).join(', ')}</td>
                  <td>{o.phlebotomistName || 'Unassigned'}</td>
                  <td>{formatInr(o.totalAmountInr || 0)}</td>
                  <td>
                    {o.status === OrderStatus.CANCELLED ? (
                      <span
                        style={{
                          background: '#FEE2E2',
                          color: '#DC2626',
                          border: '1px solid #FECACA',
                          borderRadius: '999px',
                          padding: '3px 10px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        ✕ Cancelled
                      </span>
                    ) : (
                      <span className="status-pill-blue">{formatOrderStatus(o.status)}</span>
                    )}
                  </td>
                  <td>
                    {o.status === OrderStatus.CANCELLED ? (
                      <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontStyle: 'italic', fontWeight: 600 }}>
                        ✕ Cancelled (No Action)
                      </span>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onTrackOrder(o)}
                        >
                          📍 Live Map
                        </button>
                        {(o.sampleCollectionPhotoUrl || (o as unknown as { samplePhotoUrl?: string }).samplePhotoUrl) && (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ borderColor: '#86EFAC', background: '#F0FDF4', color: '#166534' }}
                            onClick={() => onTrackOrder(o)}
                            title="View Specimen Collection Proof Photo"
                          >
                            📸 Proof
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onAssignCourier(o)}
                        >
                          Assign Courier
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
