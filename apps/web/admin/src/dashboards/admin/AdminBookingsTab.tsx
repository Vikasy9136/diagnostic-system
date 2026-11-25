import { useMemo, useState } from 'react';
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
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [dateFilterMode, setDateFilterMode] = useState<'TODAY' | 'ALL' | 'CUSTOM'>('TODAY');
  const [selectedCustomDate, setSelectedCustomDate] = useState<string>(todayStr);

  const todayCount = useMemo(() => {
    return filteredOrders.filter(
      (o) => (o.createdAt || o.scheduledPickupAt || '').slice(0, 10) === todayStr
    ).length;
  }, [filteredOrders, todayStr]);

  const displayOrders = useMemo(() => {
    return filteredOrders.filter((o) => {
      if (dateFilterMode === 'ALL') return true;
      const orderDate = (o.createdAt || o.scheduledPickupAt || '').slice(0, 10);
      if (dateFilterMode === 'TODAY') {
        return orderDate === todayStr;
      }
      if (dateFilterMode === 'CUSTOM') {
        return orderDate === selectedCustomDate;
      }
      return true;
    });
  }, [filteredOrders, dateFilterMode, todayStr, selectedCustomDate]);

  return (
    <div className="chart-card-modern">
      <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h2 className="card-top-title" style={{ margin: 0 }}>
              Live Specimen Pickup Bookings ({displayOrders.length})
            </h2>
            <span
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background:
                  dateFilterMode === 'TODAY'
                    ? '#CCFBF1'
                    : dateFilterMode === 'ALL'
                    ? '#F1F5F9'
                    : '#FEF3C7',
                color:
                  dateFilterMode === 'TODAY'
                    ? '#0F766E'
                    : dateFilterMode === 'ALL'
                    ? '#475569'
                    : '#92400E',
                border: '1px solid',
                borderColor:
                  dateFilterMode === 'TODAY'
                    ? '#99F6E4'
                    : dateFilterMode === 'ALL'
                    ? '#CBD5E1'
                    : '#FDE68A',
              }}
            >
              {dateFilterMode === 'TODAY'
                ? `📅 Today (${todayStr})`
                : dateFilterMode === 'ALL'
                ? '🌐 All Dates'
                : `📅 Selected: ${selectedCustomDate}`}
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
            Real-time bookings across all connected labs
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Quick Date Toggle Buttons */}
          <div
            style={{
              display: 'inline-flex',
              background: '#F1F5F9',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
            }}
          >
            <button
              type="button"
              onClick={() => setDateFilterMode('TODAY')}
              style={{
                border: 'none',
                background: dateFilterMode === 'TODAY' ? '#0D9488' : 'transparent',
                color: dateFilterMode === 'TODAY' ? '#FFFFFF' : '#475569',
                fontSize: '0.78rem',
                fontWeight: dateFilterMode === 'TODAY' ? 700 : 500,
                padding: '5px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Today ({todayCount})
            </button>
            <button
              type="button"
              onClick={() => setDateFilterMode('ALL')}
              style={{
                border: 'none',
                background: dateFilterMode === 'ALL' ? '#0A2A5E' : 'transparent',
                color: dateFilterMode === 'ALL' ? '#FFFFFF' : '#475569',
                fontSize: '0.78rem',
                fontWeight: dateFilterMode === 'ALL' ? 700 : 500,
                padding: '5px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              All Dates ({filteredOrders.length})
            </button>
          </div>

          {/* Past / Custom Calendar Picker with FUTURE DATES DISABLED */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="date"
              className="form-control"
              value={selectedCustomDate}
              max={todayStr}
              title="Pick current or past date (future dates disabled)"
              onChange={(e) => {
                const val = e.target.value;
                if (val && val <= todayStr) {
                  setSelectedCustomDate(val);
                  setDateFilterMode('CUSTOM');
                }
              }}
              style={{
                width: '138px',
                padding: '6px 8px',
                fontSize: '0.78rem',
                borderRadius: '8px',
                border:
                  dateFilterMode === 'CUSTOM' ? '1.5px solid #0D9488' : '1px solid #CBD5E1',
                background: dateFilterMode === 'CUSTOM' ? '#F0FDFA' : '#FFFFFF',
              }}
            />
          </div>

          <select
            className="form-select"
            style={{ width: '160px', fontSize: '0.78rem', padding: '6px 10px' }}
            value={orderStatusFilter}
            onChange={(e) => onOrderStatusFilterChange(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            {Object.values(OrderStatus).map((st) => (
              <option key={st} value={st}>
                {formatOrderStatus(st)}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary" onClick={onExportCsv}>
            Export CSV
          </button>
        </div>
      </div>

      {displayOrders.length === 0 ? (
        <EmptyStateBox
          title={
            dateFilterMode === 'TODAY'
              ? `No Bookings Dispatched Today (${todayStr})`
              : dateFilterMode === 'CUSTOM'
              ? `No Bookings on ${selectedCustomDate}`
              : 'No Matching Bookings Found'
          }
          description={
            dateFilterMode === 'TODAY' && filteredOrders.length > 0
              ? `You have ${filteredOrders.length} previous booking(s). Switch to "All Dates" to view them.`
              : 'Live orders submitted from Collection Centers will appear here automatically.'
          }
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
              {displayOrders.map((o) => (
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
                  <td><span className="status-pill-blue">{formatOrderStatus(o.status)}</span></td>
                  <td>
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
