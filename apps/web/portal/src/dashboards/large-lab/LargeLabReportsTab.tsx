import { type FormEvent } from 'react';
import {
  type DiagnosticReportRecord,
  formatOrderStatus,
  isOrderCompleted,
  OrderStatus,
  type PickupOrder,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';

export interface LargeLabReportsTabProps {
  orders: PickupOrder[];
  reports: DiagnosticReportRecord[];
  reportOrder: PickupOrder | null;
  onSelectReportOrder: (order: PickupOrder | null) => void;
  pathologistName: string;
  onPathologistNameChange: (val: string) => void;
  onSelectReportFile: (file: File | null) => void;
  uploadingReport: boolean;
  onSubmitReport: (e: FormEvent) => Promise<void>;
}

export function LargeLabReportsTab({
  orders,
  reports,
  reportOrder,
  onSelectReportOrder,
  pathologistName,
  onPathologistNameChange,
  onSelectReportFile,
  uploadingReport,
  onSubmitReport,
}: LargeLabReportsTabProps) {
  return (
    <div className="settings-grid-2">
      <div className="chart-card-modern">
        <div className="card-top-header">
          <h2 className="card-top-title">Upload &amp; Share Verified PDF Report</h2>
        </div>
        <form onSubmit={(e) => void onSubmitReport(e)}>
          <div className="form-group">
            <label className="form-label">Select Order Ready for Reporting</label>
            <select
              className="form-select"
              value={reportOrder?.id || ''}
              onChange={(e) =>
                onSelectReportOrder(orders.find((o) => o.id === e.target.value) || null)
              }
              required
            >
              <option value="">-- Select Booking --</option>
              {orders
                .filter(
                  (o) =>
                    !isOrderCompleted(o.status) &&
                    o.status !== OrderStatus.CANCELLED &&
                    o.status !== OrderStatus.REJECTED
                )
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} — {o.patient.pseudonym} ({o.smallLabName}) [
                    {formatOrderStatus(o.status)}]
                  </option>
                ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Sign-off Pathologist Name</label>
            <input
              className="form-input"
              placeholder="Enter verifying MD Pathologist / Signatory name"
              value={pathologistName}
              onChange={(e) => onPathologistNameChange(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Verified Report File (PDF / Document)</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.txt"
              className="form-input"
              onChange={(e) => onSelectReportFile(e.target.files?.[0] || null)}
            />
          </div>
          <button
            type="submit"
            className="btn-primary btn-full"
            disabled={uploadingReport || !reportOrder}
          >
            {uploadingReport ? 'Uploading Report...' : 'Verify & Publish Report →'}
          </button>
        </form>
      </div>

      <div className="chart-card-modern">
        <div className="card-top-header">
          <h2 className="card-top-title">Published Reports ({reports.length})</h2>
        </div>
        {reports.length === 0 ? (
          <EmptyStateBox
            title="No Reports Uploaded Yet"
            description="Uploaded PDFs are shared immediately in the referring Collection Lab's Reports tab."
          />
        ) : (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Order</th>
                  <th>Patient</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.id}</strong>
                    </td>
                    <td>{r.orderNumber}</td>
                    <td>{r.patientName}</td>
                    <td>
                      <a href={r.downloadUrl} target="_blank" rel="noreferrer" className="btn-link-muted">
                        Open PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

