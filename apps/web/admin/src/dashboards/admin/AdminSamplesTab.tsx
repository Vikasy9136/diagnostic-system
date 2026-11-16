import { type CustodyEvent, ROLE_LABELS } from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';
import { type FormatLabelFn } from '../types';

export interface AdminSamplesTabProps {
  custodyEvents: CustodyEvent[];
  formatLabel: FormatLabelFn;
}

export function AdminSamplesTab({
  custodyEvents,
  formatLabel,
}: AdminSamplesTabProps) {
  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <h2 className="card-top-title">Sample Handover &amp; Temperature Log ({custodyEvents.length} Events)</h2>
      </div>
      {custodyEvents.length === 0 ? (
        <EmptyStateBox
          title="No Custody Events Recorded Yet"
          description="Every pickup scan, temperature reading, and handover is logged here."
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Event</th>
                <th>Updated By</th>
                <th>Role</th>
                <th>Temp Logged</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {custodyEvents.map((ev) => (
                <tr key={ev.id}>
                  <td><strong>{ev.orderId}</strong></td>
                  <td><span className="status-pill-blue">{formatLabel(ev.eventType)}</span></td>
                  <td>{ev.operatorName}</td>
                  <td>{ROLE_LABELS[ev.operatorRole] || formatLabel(ev.operatorRole)}</td>
                  <td>{ev.temperatureCelsius !== undefined ? `${ev.temperatureCelsius}°C` : '—'}</td>
                  <td>{new Date(ev.timestamp).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
