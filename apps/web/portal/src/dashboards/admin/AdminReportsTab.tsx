import { type DiagnosticReportRecord } from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';

export interface AdminReportsTabProps {
  reports: DiagnosticReportRecord[];
}

export function AdminReportsTab({ reports }: AdminReportsTabProps) {
  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <h2 className="card-top-title">Diagnostic Reports Archive ({reports.length})</h2>
      </div>
      {reports.length === 0 ? (
        <EmptyStateBox
          title="No Verified Reports Uploaded Yet"
          description="Partner reference labs upload signed PDF reports once testing finishes."
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Report ID</th>
                <th>Booking</th>
                <th>Patient</th>
                <th>Tests</th>
                <th>Pathologist</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.id}</strong></td>
                  <td>{r.orderNumber}</td>
                  <td>{r.patientName}</td>
                  <td>{r.testsSummary}</td>
                  <td>{r.pathologistName}</td>
                  <td>
                    <a href={r.downloadUrl} target="_blank" rel="noreferrer" className="btn-primary" style={{ textDecoration: 'none' }}>
                      Download PDF
                    </a>
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
