import { useState } from 'react';
import {
  formatOrderStatus,
  OrderStatus,
  type PickupOrder,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';

export interface LargeLabTestingTabProps {
  testingQueue: PickupOrder[];
  deptFilter: string;
  onDeptFilterChange: (dept: string) => void;
  onStartRun: (order: PickupOrder) => Promise<void>;
  onTransitionStatus?: (order: PickupOrder, nextStatus: OrderStatus, remarks?: string) => Promise<void>;
  onOpenReportUpload: (order: PickupOrder) => void;
}

const EXCEPTION_STATUSES = new Set<OrderStatus>([
  OrderStatus.INSUFFICIENT_SAMPLE,
  OrderStatus.RECOLLECTION_REQUIRED,
  OrderStatus.ON_HOLD,
  OrderStatus.PROCESSING_FAILED,
]);

export function LargeLabTestingTab({
  testingQueue,
  deptFilter,
  onDeptFilterChange,
  onStartRun,
  onTransitionStatus,
  onOpenReportUpload,
}: LargeLabTestingTabProps) {
  const [selectedStages, setSelectedStages] = useState<Record<string, OrderStatus>>({});
  const [remarksByOrder, setRemarksByOrder] = useState<Record<string, string>>({});
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  async function handleStageUpdate(o: PickupOrder) {
    if (!onTransitionStatus) return;
    const nextStatus = selectedStages[o.id] || OrderStatus.UNDER_ANALYSIS;
    const remarks = (remarksByOrder[o.id] || '').trim();
    if (EXCEPTION_STATUSES.has(nextStatus) && !remarks) {
      window.alert('Please enter remarks explaining the hold, failure, or recollection reason.');
      return;
    }
    setBusyOrderId(o.id);
    try {
      await onTransitionStatus(o, nextStatus, remarks || undefined);
    } finally {
      setBusyOrderId(null);
    }
  }

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
                <th>Tests &amp; Report Progress</th>
                <th>Status</th>
                <th>Processing Stage &amp; Action</th>
              </tr>
            </thead>
            <tbody>
              {testingQueue.map((o) => {
                const chosenStage = selectedStages[o.id] || OrderStatus.UNDER_ANALYSIS;
                const needsRemarks = EXCEPTION_STATUSES.has(chosenStage);
                const testItems = o.bookingTestItems || [];
                const uploadedTestsCount = testItems.filter((t) => t.reportStatus === 'UPLOADED').length;

                return (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.orderNumber}</strong>
                      {o.selectedCentreName && (
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{o.selectedCentreName}</div>
                      )}
                    </td>
                    <td>{o.patient.pseudonym}</td>
                    <td>{o.department || 'Pathology'}</td>
                    <td>
                      <div>
                        {testItems.length > 0
                          ? testItems.map((t) => t.testName).join(', ')
                          : o.specimens.map((s) => s.testCode).join(', ')}
                      </div>
                      {testItems.length > 0 && (
                        <div style={{ fontSize: '0.72rem', color: '#0369A1' }}>
                          Reports: {uploadedTestsCount}/{testItems.length} uploaded
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="status-pill-blue">{formatOrderStatus(o.status)}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {o.status === OrderStatus.DELIVERED_TO_LAB && (
                            <button type="button" className="btn-secondary" onClick={() => void onStartRun(o)}>
                              Start Run
                            </button>
                          )}
                          {onTransitionStatus && (
                            <>
                              <select
                                className="form-select"
                                style={{ width: '185px', fontSize: '0.78rem', padding: '4px 8px' }}
                                value={chosenStage}
                                onChange={(e) =>
                                  setSelectedStages((prev) => ({
                                    ...prev,
                                    [o.id]: e.target.value as OrderStatus,
                                  }))
                                }
                              >
                                <option value={OrderStatus.SAMPLE_RECEIVED_AT_CENTRE}>Received at Centre</option>
                                <option value={OrderStatus.SAMPLE_IN_LAB}>Sample In Lab</option>
                                <option value={OrderStatus.UNDER_ANALYSIS}>Under Analysis</option>
                                <option value={OrderStatus.PROCESSING_COMPLETED}>Processing Completed</option>
                                <option value={OrderStatus.REPORT_PENDING}>Report Pending</option>
                                <option value={OrderStatus.ON_HOLD}>On Hold</option>
                                <option value={OrderStatus.INSUFFICIENT_SAMPLE}>Insufficient Sample</option>
                                <option value={OrderStatus.RECOLLECTION_REQUIRED}>Recollection Required</option>
                                <option value={OrderStatus.PROCESSING_FAILED}>Processing Failed</option>
                              </select>
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={busyOrderId === o.id}
                                onClick={() => void handleStageUpdate(o)}
                              >
                                {busyOrderId === o.id ? 'Updating...' : 'Update Stage'}
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => onOpenReportUpload(o)}
                          >
                            Upload Report →
                          </button>
                        </div>
                        {needsRemarks && (
                          <input
                            className="form-input"
                            style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                            placeholder="Required remarks (reason for hold/recollection/failure)..."
                            value={remarksByOrder[o.id] || ''}
                            onChange={(e) =>
                              setRemarksByOrder((prev) => ({ ...prev, [o.id]: e.target.value }))
                            }
                          />
                        )}
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
