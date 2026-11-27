import { useState } from 'react';
import {
  type DiagnosticReportRecord,
  type PickupOrder,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';
import { getAuthorizedReportDownloadApi } from '../../services/workflowApiService';

export interface SmallLabReportsTabProps {
  reports: DiagnosticReportRecord[];
  orders?: PickupOrder[];
  onPrintReport: (report: DiagnosticReportRecord) => void;
}

export function SmallLabReportsTab({
  reports,
  orders = [],
  onPrintReport,
}: SmallLabReportsTabProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleSecureDownload(r: DiagnosticReportRecord) {
    setDownloadingId(r.id);
    try {
      const signed = await getAuthorizedReportDownloadApi(r.id);
      const targetUrl = signed.signedUrl || signed.dataUrl;
      if (targetUrl) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      if (r.downloadUrl && !r.downloadUrl.startsWith('private://')) {
        window.open(r.downloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        window.alert('Unable to generate secure report download link right now.');
      }
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <div>
          <h2 className="card-top-title">Diagnostic Reports ({reports.length})</h2>
          <p style={{ fontSize: '0.78rem', color: '#64748B' }}>
            Test-wise and combined PDF reports with short-lived authorized download links
          </p>
        </div>
      </div>
      {reports.length === 0 ? (
        <EmptyStateBox
          title="No Reports Published Yet"
          description="Verified PDF reports uploaded by the Reference Lab appear here automatically."
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Report ID &amp; Type</th>
                <th>Booking &amp; Patient</th>
                <th>Covered &amp; Pending Tests</th>
                <th>Authorised By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const matchingOrder = orders.find((o) => o.id === r.orderId);
                const pendingTests = (matchingOrder?.bookingTestItems || []).filter(
                  (t) => t.reportStatus !== 'UPLOADED'
                );
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.id}</strong>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                        <span className={r.reportType === 'INDIVIDUAL' ? 'status-pill-blue' : 'status-pill-green'}>
                          {r.reportType === 'INDIVIDUAL' ? 'Test-Wise' : 'Combined'}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>v{r.version || 1}</span>
                      </div>
                    </td>
                    <td>
                      <strong>{r.orderNumber}</strong>
                      <div style={{ fontSize: '0.76rem', color: '#475569' }}>{r.patientName}</div>
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>
                      <div>
                        <strong>Included:</strong>{' '}
                        {r.coveredTestNames?.join(', ') || 'Full Order Panel'}
                      </div>
                      {pendingTests.length > 0 && (
                        <div style={{ color: '#D97706', marginTop: '2px' }}>
                          Pending: {pendingTests.map((t) => t.testName).join(', ')}
                        </div>
                      )}
                    </td>
                    <td>
                      <div>{r.pathologistName}</div>
                      <div style={{ fontSize: '0.72rem', color: '#059669' }}>
                        {r.authorisationStatus || 'AUTHORISED'}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={downloadingId === r.id}
                          onClick={() => void handleSecureDownload(r)}
                        >
                          {downloadingId === r.id ? 'Authorizing...' : 'Download PDF'}
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => onPrintReport(r)}>
                          Print
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
