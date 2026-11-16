import {
  type CommissionConfig,
  formatInr,
  type PayoutRecord,
  type SettlementRecord,
} from '@diagnostic/shared';
import { EmptyStateBox, SlaCountdownBadge } from '../../components/shared';
import { type LargeLabMetrics } from './largeLabTypes';

export interface LargeLabSettlementsTabProps {
  commConfig: CommissionConfig;
  metrics: LargeLabMetrics;
  settlements: SettlementRecord[];
  payouts: PayoutRecord[];
  nowTick: number;
}

export function LargeLabSettlementsTab({
  commConfig,
  metrics,
  settlements,
  payouts,
  nowTick,
}: LargeLabSettlementsTabProps) {
  const windowMins = commConfig.instantPayoutWindowMinutes ?? 30;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="privacy-shield-banner" style={{ marginBottom: 0 }}>
        <div>
          <strong>⚡ {windowMins}-Minute Instant Partner Settlement Active</strong>
          <div style={{ fontSize: '0.8rem', marginTop: '3px' }}>
            Reference Lab B2B settlements are automatically scheduled via UPI / IMPS within{' '}
            <strong>{windowMins} minutes</strong> of completed sample processing.
          </div>
        </div>
      </div>

      <div className="chart-card-modern">
        <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 className="card-top-title">Receivables &amp; Lab Payouts ({settlements.length})</h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Track customer payment confirmations, 30-min instant payout timers, and payouts sent to your Reference Hub
            </p>
          </div>
          <span className="sla-countdown-chip on-time">⚡ {windowMins}-Min Auto-Payout SLA</span>
        </div>

        <div className="kpi-row" style={{ marginBottom: '20px' }}>
          <div className="kpi-card-modern">
            <div className="kpi-body">
              <span className="kpi-title">Total Lab Earnings</span>
              <span className="kpi-main-number">{formatInr(metrics.totalReceivable)}</span>
            </div>
          </div>
          <div className="kpi-card-modern">
            <div className="kpi-body">
              <span className="kpi-title">Paid Out to Hub</span>
              <span className="kpi-main-number">{formatInr(metrics.paidReceivable)}</span>
            </div>
          </div>
          <div className="kpi-card-modern">
            <div className="kpi-body">
              <span className="kpi-title">Pending Payout</span>
              <span className="kpi-main-number">{formatInr(metrics.pendingReceivable)}</span>
            </div>
          </div>
        </div>

        {settlements.length === 0 ? (
          <EmptyStateBox
            title="No Settlement Records Yet"
            description="Receivables generate live for every booking routed to your hub."
          />
        ) : (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Booking</th>
                  <th>Source Lab</th>
                  <th>Customer Payment</th>
                  <th>Lab Share</th>
                  <th>30-Min Payout SLA</th>
                  <th>Payout Status</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => {
                  const isLabPaid = s.labPayoutStatus === 'PAID' || s.status === 'SETTLED';
                  const isCustomerPaid = s.paymentStatus === 'PAID';
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.id}</strong>
                      </td>
                      <td>{s.orderNumber}</td>
                      <td>{s.smallLabName}</td>
                      <td>
                        <span className={isCustomerPaid ? 'status-pill-green' : 'status-pill-amber'}>
                          {isCustomerPaid ? 'Paid Online' : 'Payment Due'}
                        </span>
                      </td>
                      <td>
                        <strong>{formatInr(s.labPayoutInr)}</strong>
                      </td>
                      <td>
                        <SlaCountdownBadge
                          isSettled={isLabPaid}
                          settledLabel="✓ Paid Out"
                          payoutDueAt={s.payoutDueAt}
                          completedAt={s.completedAt}
                          windowMinutes={s.payoutWindowMinutes ?? windowMins}
                          nowMs={nowTick}
                          pendingFallbackLabel={`⏱ ${s.payoutWindowMinutes ?? windowMins}m SLA on drop`}
                        />
                      </td>
                      <td>
                        <span className={isLabPaid ? 'status-pill-green' : 'status-pill-amber'}>
                          {isLabPaid ? 'Paid Out' : 'Pending Payout'}
                        </span>
                      </td>
                      <td>
                        <code style={{ fontSize: '0.75rem' }}>
                          {s.labPayoutRef || s.razorpayPaymentId || '—'}
                        </code>
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
          <h3 className="card-top-title">Payout Receipts ({payouts.length})</h3>
        </div>
        {payouts.length === 0 ? (
          <EmptyStateBox
            title="No Payout Transfers Recorded Yet"
            description="Completed payouts transferred by Platform Admin appear here with their reference number."
          />
        ) : (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>Payout ID</th>
                  <th>Order</th>
                  <th>Mode</th>
                  <th>Destination</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.id}</strong>
                    </td>
                    <td>{p.orderNumber}</td>
                    <td>{p.mode}</td>
                    <td>{p.destinationSummary}</td>
                    <td>
                      <code>{p.referenceId}</code>
                    </td>
                    <td>
                      <strong>{formatInr(p.amountInr)}</strong>
                    </td>
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
