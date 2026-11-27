import { useEffect, useMemo, useState } from 'react';
import {
  formatOrderStatus,
  type LabFacility,
  type PickupOrder,
  type UrgentReportRequestRecord,
  type UrgentRequestStatus,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';
import { listUrgentRequestsApi } from '../../services/workflowApiService';

function getUrgentStatusPillClass(status?: UrgentRequestStatus): string {
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

export interface AdminUrgentReportsTabProps {
  labs: LabFacility[];
  orders: PickupOrder[];
}

export function AdminUrgentReportsTab({ labs, orders }: AdminUrgentReportsTabProps) {
  const [requests, setRequests] = useState<UrgentReportRequestRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<UrgentRequestStatus | 'ALL'>('ALL');
  const [largeLabFilter, setLargeLabFilter] = useState('');
  const [smallLabFilter, setSmallLabFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [historyReq, setHistoryReq] = useState<UrgentReportRequestRecord | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const list = await listUrgentRequestsApi({
        status: statusFilter,
        largeLabId: largeLabFilter || undefined,
        smallLabId: smallLabFilter || undefined,
        department: departmentFilter,
        date: dateFilter || undefined,
        delayedOnly,
      });
      setRequests(list);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [statusFilter, largeLabFilter, smallLabFilter, departmentFilter, dateFilter, delayedOnly]);

  const counts = useMemo(() => {
    return {
      total: requests.length,
      requested: requests.filter((r) => r.status === 'URGENT_REQUESTED').length,
      accepted: requests.filter((r) => r.status === 'URGENT_ACCEPTED').length,
      inProgress: requests.filter((r) => r.status === 'URGENT_IN_PROGRESS').length,
      completed: requests.filter((r) => r.status === 'URGENT_COMPLETED').length,
      rejected: requests.filter((r) => r.status === 'URGENT_REJECTED').length,
      delayed: requests.filter((r) => r.status === 'URGENT_DELAYED').length,
    };
  }, [requests]);

  const largeLabs = useMemo(() => labs.filter((l) => l.type === 'LARGE_LAB'), [labs]);
  const smallLabs = useMemo(() => labs.filter((l) => l.type === 'SMALL_LAB'), [labs]);

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
          gap: '10px',
        }}
      >
        {[
          { label: 'Total Requests', value: counts.total, color: '#0F172A' },
          { label: 'Awaiting Response', value: counts.requested, color: '#D97706' },
          { label: 'Accepted', value: counts.accepted, color: '#2563EB' },
          { label: 'In Progress', value: counts.inProgress, color: '#7C3AED' },
          { label: 'Completed', value: counts.completed, color: '#059669' },
          { label: 'Rejected', value: counts.rejected, color: '#DC2626' },
          { label: 'Delayed SLA', value: counts.delayed, color: '#B91C1C' },
        ].map((kpi) => (
          <div key={kpi.label} className="chart-card-modern" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>{kpi.label}</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="chart-card-modern">
        <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 className="card-top-title">Operations — Urgent Report Requests Monitoring</h2>
            <p style={{ fontSize: '0.78rem', color: '#64748B' }}>
              Immutable SLA audit trail across Small Labs and Reference Labs
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void loadAll()} disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          <input
            type="date"
            className="form-input"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
          <select className="form-select" value={largeLabFilter} onChange={(e) => setLargeLabFilter(e.target.value)}>
            <option value="">All Large Labs</option>
            {largeLabs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select className="form-select" value={smallLabFilter} onChange={(e) => setSmallLabFilter(e.target.value)}>
            <option value="">All Small Labs</option>
            {smallLabs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            className="form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="ALL">All Statuses</option>
            <option value="URGENT_REQUESTED">Urgent Requested</option>
            <option value="URGENT_ACCEPTED">Urgent Accepted</option>
            <option value="URGENT_IN_PROGRESS">Urgent In Progress</option>
            <option value="URGENT_DELAYED">Urgent Delayed</option>
            <option value="URGENT_COMPLETED">Urgent Completed</option>
            <option value="URGENT_REJECTED">Urgent Rejected</option>
          </select>
          <select
            className="form-select"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            <option value="Hematology">Hematology</option>
            <option value="Biochemistry">Biochemistry</option>
            <option value="Immunology">Immunology</option>
            <option value="Molecular">Molecular</option>
            <option value="Microbiology">Microbiology</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 600 }}>
            <input type="checkbox" checked={delayedOnly} onChange={(e) => setDelayedOnly(e.target.checked)} />
            Delayed Only
          </label>
        </div>

        {requests.length === 0 ? (
          <EmptyStateBox
            title="No Urgent Requests Found"
            description="Adjust filters or check back when Small Labs request priority test reporting."
          />
        ) : (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>Booking &amp; Test</th>
                  <th>Small Lab &rarr; Large Lab</th>
                  <th>Reason &amp; Deadlines</th>
                  <th>Processing / Priority</th>
                  <th>Audit History</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const ord = orders.find((o) => o.id === r.orderId);
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.orderNumber}</strong>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>{r.testName}</div>
                      </td>
                      <td style={{ fontSize: '0.78rem' }}>
                        <div>{r.smallLabName}</div>
                        <div style={{ color: '#64748B' }}>&rarr; {r.largeLabName}</div>
                      </td>
                      <td style={{ fontSize: '0.76rem' }}>
                        <div>{r.reason}</div>
                        <div style={{ color: '#64748B' }}>
                          Req: {new Date(r.requestedDeadline).toLocaleString('en-IN')}
                        </div>
                        {r.acceptedExpectedCompletionAt && (
                          <div style={{ color: '#0F766E' }}>
                            Exp: {new Date(r.acceptedExpectedCompletionAt).toLocaleString('en-IN')}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          <span className={getUrgentStatusPillClass(r.status)}>
                            {r.status.replace(/_/g, ' ')}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#475569' }}>
                            {ord ? formatOrderStatus(ord.status) : 'Active'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <button type="button" className="btn-secondary" onClick={() => setHistoryReq(r)}>
                          View History ({r.history.length})
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {historyReq && (
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
          <div style={{ background: '#FFF', borderRadius: '14px', maxWidth: '560px', width: '100%', padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>
                Urgent Request History • {historyReq.orderNumber} ({historyReq.testName})
              </h3>
              <button type="button" className="btn-secondary" onClick={() => setHistoryReq(null)}>
                Close
              </button>
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {historyReq.history.map((h, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '0.8rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{h.action.replace(/_/g, ' ')}</strong>
                    <span style={{ color: '#64748B' }}>{new Date(h.timestamp).toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ color: '#475569', marginTop: '2px' }}>
                    Actor: {h.actorName || h.actorUid} ({h.actorRole}) &bull; Status: {h.newStatus}
                  </div>
                  {h.remarks && <div style={{ marginTop: '4px' }}>Remarks: {h.remarks}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
