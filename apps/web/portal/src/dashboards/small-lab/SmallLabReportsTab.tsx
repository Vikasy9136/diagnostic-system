import { type DiagnosticReportRecord } from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';

export interface SmallLabReportsTabProps {
  reports: DiagnosticReportRecord[];
  onPreviewPrintReport: (report: DiagnosticReportRecord) => void;
}

export function SmallLabReportsTab({ reports, onPreviewPrintReport }: SmallLabReportsTabProps) {
  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <h2 className="card-top-title">
          Diagnostic Reports Ready for Download &amp; Print ({reports.length})
        </h2>
      </div>
      {reports.length === 0 ? (
        <EmptyStateBox
          title="No Verified Reports Available Yet"
          description="Once your Partner Reference Lab (or your Self-Drop Lab desk) uploads a pathologist-verified report, it appears here immediately."
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Report ID</th>
                <th>Booking ID</th>
                <th>Patient</th>
                <th>Tests</th>
                <th>Processing Lab</th>
                <th>Signed By</th>
                <th>Action</th>
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
                  <td>{r.testsSummary}</td>
                  <td>{r.targetLabName}</td>
                  <td>{r.pathologistName}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button type="button" className="btn-secondary" onClick={() => onPreviewPrintReport(r)}>
                        🖨️ View &amp; Print
                      </button>
                      <a
                        href={r.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-primary"
                        style={{ textDecoration: 'none' }}
                      >
                        Download PDF
                      </a>
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

