import {
  type CommissionConfig,
  formatInr,
  type PayoutRecord,
  type PickupOrder,
  type SettlementRecord,
} from '@diagnostic/shared';
import { EmptyStateBox, SlaCountdownBadge } from '../../components/shared';
import { type AdminMetrics } from './adminTypes';

export interface AdminPaymentsTabProps {
  settlements: SettlementRecord[];
  payouts: PayoutRecord[];
  orders: PickupOrder[];
  commConfig: CommissionConfig;
  metrics: AdminMetrics;
  nowTick: number;
  runningInstantBatch: boolean;
  onRunInstantPayoutBatch: () => void;
  onOpenPayoutModal: (
    settlement: SettlementRecord,
    recipientType: 'LARGE_LAB' | 'PHLEBOTOMIST' | 'BOTH'
  ) => void;
  onMarkSettlementSettled: (settlementId: string) => void;
}

export function AdminPaymentsTab({
  settlements,
  payouts,
  orders,
  commConfig,
  metrics,
  nowTick,
  runningInstantBatch,
  onRunInstantPayoutBatch,
  onOpenPayoutModal,
  onMarkSettlementSettled,
}: AdminPaymentsTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="chart-card-modern">
        <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 className="card-top-title">Payments &amp; 30-Min Instant Partner Payouts ({settlements.length})</h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Reconcile online customer collections and release 30-minute instant payouts to Reference Labs &amp; Field Phlebotomists
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="sla-countdown-chip on-time">
              ⚡ {commConfig.instantPayoutWindowMinutes ?? 30}-Min Auto-Payout SLA Active
            </span>
            <button
              type="button"
              className="btn-primary"
              disabled={runningInstantBatch}
              onClick={onRunInstantPayoutBatch}
            >
              {runningInstantBatch ? 'Processing 30m Payouts...' : '⚡ Run 30-Min Auto-Payout Batch'}
            </button>
          </div>
        </div>
        <div className="kpi-row" style={{ marginBottom: '20px' }}>
          <div className="kpi-card-modern">
            <div className="kpi-body">
              <span className="kpi-title">Collected Online</span>
              <span className="kpi-main-number">{formatInr(metrics.collectedOnline)}</span>
              <span className="kpi-sub-split">{formatInr(metrics.awaitingCollection)} awaiting payment</span>
            </div>
          </div>
          <div className="kpi-card-modern">
            <div className="kpi-body">
              <span className="kpi-title">Platform Commission</span>
              <span className="kpi-main-number">{formatInr(metrics.platformFees)}</span>
              <span className="kpi-sub-split">Out of {formatInr(metrics.grossGmv)} billed</span>
            </div>
          </div>
          <div className="kpi-card-modern">
            <div className="kpi-body">
              <span className="kpi-title">Reference Lab Payouts</span>
              <span className="kpi-main-number">{formatInr(metrics.labPayoutsDue)} due</span>
              <span className="kpi-sub-split">{formatInr(metrics.labPayoutsPaid)} released</span>
            </div>
          </div>
          <div className="kpi-card-modern">
            <div className="kpi-body">
              <span className="kpi-title">Courier Payouts</span>
              <span className="kpi-main-number">{formatInr(metrics.phleboPayoutsDue)} due</span>
              <span className="kpi-sub-split">{formatInr(metrics.phleboPayoutsPaid)} released</span>
            </div>
          </div>
        </div>
        {settlements.length === 0 ? (
          <EmptyStateBox
            title="No Settlement Entries Yet"
            description="Settlements are created automatically for every booking."
          />
        ) : (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>Invoice &amp; Order</th>
                  <th>Collection &rarr; Hub</th>
                  <th>Collection Status</th>
                  <th>Platform Fee</th>
                  <th>Reference Lab Split</th>
                  <th>Phlebotomist Split</th>
                  <th>30-Min Payout SLA</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => {
                  const isPaidOnline = s.paymentStatus === 'PAID';
                  const isLabPaid = s.labPayoutStatus === 'PAID' || s.status === 'SETTLED';
                  const isPhleboPaid = s.phleboPayoutStatus === 'PAID' || s.status === 'SETTLED';
                  const linkedOrder = orders.find((o) => o.id === s.orderId || o.orderNumber === s.orderNumber);
                  const assignedPhleboId = s.phlebotomistId || linkedOrder?.phlebotomistId;
                  const assignedPhleboName = s.phlebotomistName || linkedOrder?.phlebotomistName;
                  const hasPhlebo = Boolean(assignedPhleboId);
                  const canReleaseBoth = !isLabPaid && hasPhlebo && !isPhleboPaid;

                  const triggerOpenPayout = (recipientType: 'LARGE_LAB' | 'PHLEBOTOMIST' | 'BOTH') => {
                    onOpenPayoutModal(
                      {
                        ...s,
                        phlebotomistId: assignedPhleboId,
                        phlebotomistName: assignedPhleboName,
                      },
                      recipientType
                    );
                  };

                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.id}</strong>
                        <div style={{ fontSize: '0.73rem', color: '#64748B' }}>{s.orderNumber}</div>
                      </td>
                      <td>
                        <div>{s.smallLabName}</div>
                        <div style={{ fontSize: '0.73rem', color: '#64748B' }}>&rarr; {s.targetLabName}</div>
                      </td>
                      <td>
                        <strong>{formatInr(s.grossAmountInr)}</strong>
                        <div style={{ marginTop: '4px' }}>
                          <span className={isPaidOnline ? 'status-pill-green' : 'status-pill-amber'}>
                            {isPaidOnline ? 'Paid Online' : 'Unpaid'}
                          </span>
                        </div>
                        {s.razorpayPaymentId && (
                          <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                            {s.razorpayPaymentId}
                          </div>
                        )}
                      </td>
                      <td>{formatInr(s.platformFeeInr)}</td>
                      <td>
                        <strong>{formatInr(s.labPayoutInr)}</strong>
                        <div style={{ marginTop: '4px' }}>
                          <span className={isLabPaid ? 'status-pill-green' : 'status-pill-amber'}>
                            {isLabPaid ? 'Paid' : 'Due'}
                          </span>
                        </div>
                        {s.labPayoutRef && (
                          <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>{s.labPayoutRef}</div>
                        )}
                      </td>
                      <td>
                        <strong>{formatInr(s.phleboPayoutInr)}</strong>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {assignedPhleboName || 'Unassigned'}
                        </div>
                        <div style={{ marginTop: '4px' }}>
                          <span className={isPhleboPaid ? 'status-pill-green' : 'status-pill-amber'}>
                            {isPhleboPaid ? 'Paid' : 'Due'}
                          </span>
                        </div>
                        {s.phleboPayoutRef && (
                          <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>{s.phleboPayoutRef}</div>
                        )}
                      </td>
                      <td>
                        <SlaCountdownBadge
                          isSettled={s.status === 'SETTLED' || (isLabPaid && isPhleboPaid)}
                          payoutDueAt={s.payoutDueAt || linkedOrder?.payoutDueAt}
                          completedAt={s.completedAt || linkedOrder?.completedAt}
                          windowMinutes={commConfig.instantPayoutWindowMinutes}
                          nowMs={nowTick}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {!isLabPaid && (
                            <button type="button" className="btn-secondary" onClick={() => triggerOpenPayout('LARGE_LAB')}>
                              Pay Lab
                            </button>
                          )}
                          {!isPhleboPaid && (
                            assignedPhleboId ? (
                              <button type="button" className="btn-secondary" onClick={() => triggerOpenPayout('PHLEBOTOMIST')}>
                                Pay Courier
                              </button>
                            ) : (
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  color: '#94A3B8',
                                  padding: '5px 8px',
                                  background: '#F1F5F9',
                                  borderRadius: '6px',
                                  border: '1px dashed #CBD5E1',
                                }}
                                title="Assign a Field Phlebotomist to order before releasing courier payout"
                              >
                                Courier Unassigned
                              </span>
                            )
                          )}
                          {s.status !== 'SETTLED' && canReleaseBoth ? (
                            <button type="button" className="btn-primary" onClick={() => triggerOpenPayout('BOTH')}>
                              Release Payout (Both)
                            </button>
                          ) : s.status !== 'SETTLED' && !isLabPaid ? (
                            <button type="button" className="btn-primary" onClick={() => triggerOpenPayout('LARGE_LAB')}>
                              Release Lab Payout
                            </button>
                          ) : s.status === 'SETTLED' ? (
                            <span className="status-pill-green">Settled</span>
                          ) : (
                            <button type="button" className="btn-secondary" onClick={() => onMarkSettlementSettled(s.id)}>
                              Mark Settled
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
      </div>

      <div className="chart-card-modern">
        <div className="card-top-header">
          <h3 className="card-top-title">Released Payout Ledger ({payouts.length})</h3>
        </div>
        {payouts.length === 0 ? (
          <EmptyStateBox
            title="No Payouts Released Yet"
            description="Disbursements released to Reference Labs and Field Phlebotomists appear here with UTR references."
          />
        ) : (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>Payout ID</th>
                  <th>Order</th>
                  <th>Recipient</th>
                  <th>Role</th>
                  <th>Mode &amp; Destination</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.id}</strong></td>
                    <td>{p.orderNumber}</td>
                    <td>{p.recipientName}</td>
                    <td>{p.recipientRole === 'LARGE_LAB' ? 'Reference Lab' : 'Phlebotomist'}</td>
                    <td>{p.mode} • {p.destinationSummary}</td>
                    <td><code>{p.referenceId}</code></td>
                    <td><strong>{formatInr(p.amountInr)}</strong></td>
                    <td>{new Date(p.createdAt).toLocaleString('en-IN')}</td>
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
