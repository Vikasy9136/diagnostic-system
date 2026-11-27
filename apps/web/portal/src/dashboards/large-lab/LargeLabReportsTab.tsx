import { type FormEvent, useEffect, useState } from 'react';
import {
  type DiagnosticReportRecord,
  formatOrderStatus,
  isOrderCompleted,
  OrderStatus,
  type PickupOrder,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';
import {
  getAuthorizedReportDownloadApi,
  type WorkflowReportType,
} from '../../services/workflowApiService';

export interface LargeLabReportsTabProps {
  orders: PickupOrder[];
  reports: DiagnosticReportRecord[];
  reportOrder: PickupOrder | null;
  onSelectReportOrder: (order: PickupOrder | null) => void;
  pathologistName: string;
  onPathologistNameChange: (val: string) => void;
  onSelectReportFile: (file: File | null) => void;
  uploadingReport: boolean;
  onSubmitReport: (
    e: FormEvent,
    options?: {
      reportType: WorkflowReportType;
      coveredTestIds: string[];
      remarks?: string;
    }
  ) => Promise<void>;
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
  const [reportType, setReportType] = useState<WorkflowReportType>('COMBINED');
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [remarks, setRemarks] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const orderTests = reportOrder?.bookingTestItems?.length
    ? reportOrder.bookingTestItems
    : (reportOrder?.specimens || []).map((s, idx) => ({
        testId: s.testCode || s.id || `TEST-${idx + 1}`,
        testName: s.testName || s.testCode || `Test ${idx + 1}`,
        priceInr: 0,
        reportStatus: 'PENDING' as const,
      }));

  useEffect(() => {
    if (!reportOrder) {
      setSelectedTestIds([]);
      return;
    }
    if (reportType === 'COMBINED') {
      setSelectedTestIds(orderTests.map((t) => t.testId));
    } else {
      const firstPending = orderTests.find((t) => t.reportStatus !== 'UPLOADED');
      setSelectedTestIds(firstPending ? [firstPending.testId] : orderTests.slice(0, 1).map((t) => t.testId));
    }
  }, [reportOrder?.id, reportType]);

  function toggleTestId(testId: string) {
    if (reportType === 'INDIVIDUAL') {
      setSelectedTestIds((prev) =>
        prev.includes(testId) ? prev.filter((x) => x !== testId) : [...prev, testId]
      );
    } else {
      setSelectedTestIds((prev) =>
        prev.includes(testId) ? prev.filter((x) => x !== testId) : [...prev, testId]
      );
    }
  }

  async function handleOpenSignedPdf(report: DiagnosticReportRecord) {
    setDownloadingId(report.id);
    try {
      const res = await getAuthorizedReportDownloadApi(report.id);
      const targetUrl = res.signedUrl || res.dataUrl;
      if (targetUrl) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      if (report.downloadUrl && !report.downloadUrl.startsWith('private://')) {
        window.open(report.downloadUrl, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="settings-grid-2">
      <div className="chart-card-modern">
        <div className="card-top-header">
          <h2 className="card-top-title">Upload Test-Wise or Combined PDF Report</h2>
        </div>
        <form
          onSubmit={(e) =>
            void onSubmitReport(e, {
              reportType,
              coveredTestIds: selectedTestIds,
              remarks: remarks.trim() || undefined,
            })
          }
        >
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
                    o.status !== OrderStatus.REJECTED &&
                    o.status !== OrderStatus.RECOLLECTION_REQUIRED
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
            <label className="form-label">Report Upload Mode</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className={reportType === 'COMBINED' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setReportType('COMBINED')}
              >
                Combined Report (All / Selected Tests)
              </button>
              <button
                type="button"
                className={reportType === 'INDIVIDUAL' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setReportType('INDIVIDUAL')}
              >
                Individual Test-Wise Report
              </button>
            </div>
          </div>

          {reportOrder && orderTests.length > 0 && (
            <div className="form-group">
              <label className="form-label">
                Select Covered Tests ({selectedTestIds.length}/{orderTests.length} selected)
              </label>
              <div
                style={{
                  display: 'grid',
                  gap: '6px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '10px',
                }}
              >
                {orderTests.map((t) => {
                  const checked = selectedTestIds.includes(t.testId);
                  return (
                    <label
                      key={t.testId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTestId(t.testId)}
                        />
                        <strong>{t.testName}</strong> ({t.testId})
                      </span>
                      <span
                        className={
                          t.reportStatus === 'UPLOADED' ? 'status-pill-green' : 'status-pill-amber'
                        }
                      >
                        {t.reportStatus === 'UPLOADED' ? 'Uploaded' : 'Pending'}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Sign-off Pathologist Name *</label>
            <input
              className="form-input"
              placeholder="Enter verifying MD Pathologist / Signatory name"
              value={pathologistName}
              onChange={(e) => onPathologistNameChange(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Pathologist Remarks (Optional)</label>
            <input
              className="form-input"
              placeholder="Clinical notes or re-upload reason"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Verified Report File (PDF / Document) *</label>
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
            disabled={uploadingReport || !reportOrder || (orderTests.length > 0 && selectedTestIds.length === 0)}
          >
            {uploadingReport
              ? 'Uploading Encrypted Report...'
              : reportType === 'INDIVIDUAL'
              ? 'Publish Test-Wise Report →'
              : 'Verify & Publish Combined Report →'}
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
            description="Uploaded PDFs are stored privately and shared immediately with the referring Small Lab."
          />
        ) : (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>ID &amp; Version</th>
                  <th>Order &amp; Type</th>
                  <th>Tests Covered</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.id}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        v{r.version || 1} • {r.authorisationStatus || 'AUTHORISED'}
                      </div>
                    </td>
                    <td>
                      <div>{r.orderNumber}</div>
                      <span className={r.reportType === 'INDIVIDUAL' ? 'status-pill-blue' : 'status-pill-green'}>
                        {r.reportType === 'INDIVIDUAL' ? 'Test-Wise' : 'Combined'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>
                      {r.coveredTestNames?.join(', ') || r.patientName}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={downloadingId === r.id}
                        onClick={() => void handleOpenSignedPdf(r)}
                      >
                        {downloadingId === r.id ? 'Authorizing...' : 'Open Signed PDF'}
                      </button>
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
