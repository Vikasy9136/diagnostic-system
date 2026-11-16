import { formatOrderStatus, OrderStatus, type PickupOrder } from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';

export interface LargeLabTestingTabProps {
  testingQueue: PickupOrder[];
  deptFilter: string;
  onDeptFilterChange: (dept: string) => void;
  onStartRun: (order: PickupOrder) => Promise<void>;
  onOpenReportUpload: (order: PickupOrder) => void;
}

export function LargeLabTestingTab({
  testingQueue,
  deptFilter,
  onDeptFilterChange,
  onStartRun,
  onOpenReportUpload,
}: LargeLabTestingTabProps) {
  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <h2 className="card-top-title">Department Analyzer Queue ({testingQueue.length})</h2>
        <select
          className="form-select"
          style={{ width: '190px' }}
          value={deptFilter}
          onChange={(e) => onDeptFilterChange(e.target.value)}
        >
          <option value="ALL">All Departments</option>
          <option value="Hematology">Hematology</option>
          <option value="Biochemistry">Biochemistry</option>
          <option value="Immunology">Immunology</option>
          <option value="Molecular">Molecular</option>
          <option value="Microbiology">Microbiology</option>
        </select>
      </div>
      {testingQueue.length === 0 ? (
        <EmptyStateBox
          title="No Samples in Testing Queue"
          description="Perform QC accessioning in Incoming Samples to move specimens onto analyzers."
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Booking ID</th>
                <th>Patient</th>
                <th>Department</th>
                <th>Tests</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {testingQueue.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.orderNumber}</strong>
                  </td>
                  <td>{o.patient.pseudonym}</td>
                  <td>{o.department || 'Pathology'}</td>
                  <td>{o.specimens.map((s) => s.testCode).join(', ')}</td>
                  <td>
                    <span className="status-pill-blue">{formatOrderStatus(o.status)}</span>
                  </td>
                  <td style={{ display: 'flex', gap: '8px' }}>
                    {o.status === OrderStatus.DELIVERED_TO_LAB && (
                      <button type="button" className="btn-secondary" onClick={() => void onStartRun(o)}>
                        Start Run
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => onOpenReportUpload(o)}
                    >
                      Upload Report →
                    </button>
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
