import { useEffect, useState } from 'react';
import {
  formatOrderStatus,
  type PickupOrder,
  type UrgentReportRequestRecord,
  type UrgentRequestStatus,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';
import {
  listUrgentRequestsApi,
  respondUrgentRequestApi,
} from '../../services/workflowApiService';

export interface LargeLabUrgentRequestsTabProps {
  orders: PickupOrder[];
  onAlert: (alert: {
    variant: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }) => void;
}

export function getUrgentStatusPillClass(status?: UrgentRequestStatus): string {
  switch (status) {
    case 'URGENT_ACCEPTED':
      return 'status-pill-blue';
    case 'URGENT_IN_PROGRESS':
      return 'status-pill-amber';
    case 'URGENT_DELAYED':
    case 'URGENT_REJECTED':
      return 'status-pill-red';
    case 'URGENT_COMPLETED':
      return 'status-pill-green';
    case 'URGENT_REQUESTED':
      return 'status-pill-amber';
    default:
      return 'status-pill-blue';
  }
}

export function LargeLabUrgentRequestsTab({
  orders,
  onAlert,
}: LargeLabUrgentRequestsTabProps) {
  const [requests, setRequests] = useState<UrgentReportRequestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<UrgentRequestStatus | 'ALL'>('ALL');
  const [activeActionReq, setActiveActionReq] = useState<{
    req: UrgentReportRequestRecord;
    mode: 'ACCEPT' | 'REJECT' | 'CLARIFY' | 'DEADLINE';
  } | null>(null);
  const [expectedAt, setExpectedAt] = useState('');
  const [assignedTeam, setAssignedTeam] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadRequests() {
    setLoading(true);
    try {
      const list = await listUrgentRequestsApi({ status: statusFilter });
      setRequests(list);
    } catch (err) {
      onAlert({
        variant: 'error',
        title: 'Failed to Load Urgent Requests',
        message: (err as Error).message,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRequests();
  }, [statusFilter]);

  function openModal(
    req: UrgentReportRequestRecord,
    mode: 'ACCEPT' | 'REJECT' | 'CLARIFY' | 'DEADLINE'
  ) {
    const defaultExp = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
    setExpectedAt(
      req.acceptedExpectedCompletionAt
        ? req.acceptedExpectedCompletionAt.slice(0, 16)
        : req.requestedDeadline
        ? req.requestedDeadline.slice(0, 16)
        : defaultExp
    );
    setAssignedTeam(req.assignedTeamOrCentre || '');
    setReasonInput('');
    setActiveActionReq({ req, mode });
  }

  async function handleActionSubmit() {
    if (!activeActionReq) return;
    setSubmitting(true);
    try {
      const { req, mode } = activeActionReq;
      if (mode === 'ACCEPT') {
        await respondUrgentRequestApi(req.id, {
          action: 'ACCEPT',
          expectedCompletionAt: new Date(expectedAt).toISOString(),
          assignedTeamOrCentre: assignedTeam.trim() || undefined,
        });
      } else if (mode === 'REJECT') {
        await respondUrgentRequestApi(req.id, {
          action: 'REJECT',
          reason: reasonInput.trim(),
        });
      } else if (mode === 'CLARIFY') {
        await respondUrgentRequestApi(req.id, {
          action: 'REQUEST_CLARIFICATION',
          reason: reasonInput.trim(),
        });
      } else if (mode === 'DEADLINE') {
        await respondUrgentRequestApi(req.id, {
          action: 'UPDATE_DEADLINE',
          expectedCompletionAt: new Date(expectedAt).toISOString(),
          reason: reasonInput.trim(),
        });
      }
      onAlert({
        variant: 'success',
        title: 'Urgent Request Updated',
        message: `Response saved for ${req.testName} (${req.orderNumber}) and Small Lab notified.`,
      });
      setActiveActionReq(null);
      await loadRequests();
    } catch (err) {
      onAlert({
        variant: 'error',
        title: 'Action Failed',
        message: (err as Error).message,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStartProcessing(req: UrgentReportRequestRecord) {
    try {
      await respondUrgentRequestApi(req.id, { action: 'START_PROCESSING' });
      onAlert({
        variant: 'success',
        title: 'Priority Processing Started',
        message: `${req.testName} (${req.orderNumber}) is now URGENT_IN_PROGRESS.`,
      });
      await loadRequests();
    } catch (err) {
      onAlert({
        variant: 'error',
        title: 'Could Not Start Priority Processing',
        message: (err as Error).message,
      });
    }
  }

  return (
    <div className="chart-card-modern">
      <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 className="card-top-title">Urgent Report Requests ({requests.length})</h2>
          <p style={{ fontSize: '0.78rem', color: '#64748B' }}>
            Review test-level priority requests from Small Labs, commit expected completion deadlines, and track delays.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            className="form-select"
            style={{ width: '190px' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="ALL">All Statuses</option>
            <option value="URGENT_REQUESTED">Awaiting Response</option>
            <option value="URGENT_ACCEPTED">Urgent Accepted</option>
            <option value="URGENT_IN_PROGRESS">Urgent In Progress</option>
            <option value="URGENT_DELAYED">Urgent Delayed</option>
            <option value="URGENT_COMPLETED">Urgent Completed</option>
            <option value="URGENT_REJECTED">Urgent Rejected</option>
          </select>
          <button type="button" className="btn-secondary" onClick={() => void loadRequests()} disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {requests.length === 0 ? (
        <EmptyStateBox
          title="No Urgent Report Requests"
          description="Test-level urgent reporting requests from referring Small Labs will appear here."
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Booking &amp; Small Lab</th>
                <th>Test &amp; Processing</th>
                <th>Reason &amp; Deadline</th>
                <th>Priority Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const matchingOrder = orders.find((o) => o.id === r.orderId);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.orderNumber}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#475569' }}>{r.smallLabName}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                        Submitted: {new Date(r.createdAt).toLocaleString('en-IN')}
                      </div>
                    </td>
                    <td>
                      <strong>{r.testName}</strong> ({r.testCode})
                      <div style={{ fontSize: '0.74rem', color: '#0369A1' }}>
                        {matchingOrder ? formatOrderStatus(matchingOrder.status) : 'In Workflow'}
                      </div>
                      {r.assignedTeamOrCentre && (
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          Team/Centre: {r.assignedTeamOrCentre}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>
                      <div>
                        <strong>{r.requestedPriority}:</strong> {r.reason}
                      </div>
                      <div style={{ color: '#475569', marginTop: '2px' }}>
                        Requested by: {new Date(r.requestedDeadline).toLocaleString('en-IN')}
                      </div>
                      {r.acceptedExpectedCompletionAt && (
                        <div style={{ color: '#0F766E', fontWeight: 600 }}>
                          Committed: {new Date(r.acceptedExpectedCompletionAt).toLocaleString('en-IN')}
                        </div>
                      )}
                      {r.clarificationQuestion && (
                        <div style={{ color: '#B45309', marginTop: '2px' }}>
                          Q: {r.clarificationQuestion}
                          {r.clarificationResponse ? ` | Reply: ${r.clarificationResponse}` : ''}
                        </div>
                      )}
                      {r.rejectionReason && (
                        <div style={{ color: '#DC2626', marginTop: '2px' }}>
                          Rejected: {r.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={getUrgentStatusPillClass(r.status)}>
                        {r.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {r.status === 'URGENT_REQUESTED' && (
                          <>
                            <button type="button" className="btn-primary" onClick={() => openModal(r, 'ACCEPT')}>
                              Accept
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => openModal(r, 'REJECT')}>
                              Reject
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => openModal(r, 'CLARIFY')}>
                              Clarify
                            </button>
                          </>
                        )}
                        {(r.status === 'URGENT_ACCEPTED' || r.status === 'URGENT_DELAYED') && (
                          <button type="button" className="btn-primary" onClick={() => void handleStartProcessing(r)}>
                            Start Priority Run
                          </button>
                        )}
                        {(r.status === 'URGENT_ACCEPTED' ||
                          r.status === 'URGENT_IN_PROGRESS' ||
                          r.status === 'URGENT_DELAYED') && (
                          <button type="button" className="btn-secondary" onClick={() => openModal(r, 'DEADLINE')}>
                            Update Deadline
                          </button>
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

      {activeActionReq && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div style={{ background: '#FFF', borderRadius: '14px', maxWidth: '460px', width: '100%', padding: '20px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '8px' }}>
              {activeActionReq.mode === 'ACCEPT'
                ? 'Accept Urgent Request'
                : activeActionReq.mode === 'REJECT'
                ? 'Reject Urgent Request'
                : activeActionReq.mode === 'CLARIFY'
                ? 'Request Clarification'
                : 'Update Expected Completion Deadline'}
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '12px' }}>
              {activeActionReq.req.orderNumber} — <strong>{activeActionReq.req.testName}</strong>
            </p>
            {(activeActionReq.mode === 'ACCEPT' || activeActionReq.mode === 'DEADLINE') && (
              <>
                <div className="form-group">
                  <label className="form-label">Expected Completion Date &amp; Time *</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={expectedAt}
                    onChange={(e) => setExpectedAt(e.target.value)}
                  />
                </div>
                {activeActionReq.mode === 'ACCEPT' && (
                  <div className="form-group">
                    <label className="form-label">Assigned Processing Team / Centre (Optional)</label>
                    <input
                      className="form-input"
                      placeholder="e.g. STAT Biochemistry Desk"
                      value={assignedTeam}
                      onChange={(e) => setAssignedTeam(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
            {activeActionReq.mode !== 'ACCEPT' && (
              <div className="form-group">
                <label className="form-label">
                  {activeActionReq.mode === 'REJECT'
                    ? 'Rejection Reason *'
                    : activeActionReq.mode === 'CLARIFY'
                    ? 'Clarification Question *'
                    : 'Reason for Deadline Change *'}
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="Enter details for Small Lab & audit trail..."
                />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
              <button type="button" className="btn-secondary" onClick={() => setActiveActionReq(null)} disabled={submitting}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={() => void handleActionSubmit()} disabled={submitting}>
                {submitting ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
