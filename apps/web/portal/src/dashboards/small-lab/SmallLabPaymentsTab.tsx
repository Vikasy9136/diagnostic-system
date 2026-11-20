import {
  type CommissionConfig,
  formatInr,
  type SettlementRecord,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';
import { type SmallLabMetrics } from './smallLabTypes';

export interface SmallLabPaymentsTabProps {
  commConfig: CommissionConfig;
  metrics: SmallLabMetrics;
  settlements: SettlementRecord[];
  payingSettlementId: string | null;
  onPaySettlement: (settlement: SettlementRecord) => Promise<void>;
  onMarkSettlementPaidByLab?: (settlement: SettlementRecord) => Promise<void>;
  onViewPaymentSlip?: (settlement: SettlementRecord) => void;
}

export function SmallLabPaymentsTab({
  commConfig,
  metrics,
  settlements,
  payingSettlementId,
  onPaySettlement,
  onMarkSettlementPaidByLab,
  onViewPaymentSlip,
}: SmallLabPaymentsTabProps) {
  return (
    <div className="chart-card-modern">
      <div className="privacy-shield-banner" style={{ marginBottom: '16px' }}>
        <div>
          <strong>
            ⚡ Pay-Per-Order Checkout • {commConfig.instantPayoutWindowMinutes ?? 30}-Min Instant Partner Settlement
          </strong>
          <div style={{ fontSize: '0.8rem', marginTop: '2px' }}>
            Pay per booking online via UPI / Card / NetBanking with zero fixed subscription charges. Completed orders
            trigger partner &amp; courier payouts within 30 minutes.
          </div>
        </div>
      </div>

      <div className="card-top-header">
        <div>
          <h2 className="card-top-title">Billing &amp; Online Payments ({settlements.length})</h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
            Pay booking invoices securely via UPI, Card, or NetBanking and track settlements
          </p>
        </div>
      </div>

      <div className="kpi-row" style={{ marginBottom: '20px' }}>
        <div className="kpi-card-modern">
          <div className="kpi-body">
            <span className="kpi-title">Total Billed</span>
            <span className="kpi-main-number">{formatInr(metrics.totalBilled)}</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-body">
            <span className="kpi-title">Paid Online</span>
            <span className="kpi-main-number">{formatInr(metrics.paidOnline)}</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-body">
            <span className="kpi-title">Payment Due</span>
            <span className="kpi-main-number">{formatInr(metrics.pendingPay)}</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-body">
            <span className="kpi-title">Settled Invoices</span>
            <span className="kpi-main-number">
              {settlements.filter((s) => s.status === 'SETTLED').length}
            </span>
          </div>
        </div>
      </div>

      {settlements.length === 0 ? (
        <EmptyStateBox
          title="No Ledger Entries Yet"
          description="Invoices generate dynamically whenever you submit a pickup booking."
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Invoice ID</th>
                <th>Booking ID</th>
                <th>Reference Lab</th>
                <th>Period</th>
                <th>Total</th>
                <th>Payment Status</th>
                <th>Settlement</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => {
                const isPaid = s.paymentStatus === 'PAID';
                const isSettled = s.status === 'SETTLED';
                const isPaying = payingSettlementId === s.id;
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.id}</strong>
                    </td>
                    <td>{s.orderNumber}</td>
                    <td>{s.targetLabName}</td>
                    <td>{s.billingPeriod}</td>
                    <td>
                      <strong>{formatInr(s.grossAmountInr)}</strong>
                    </td>
                    <td>
                      <span className={isPaid ? 'status-pill-green' : 'status-pill-amber'}>
                        {isPaid ? 'Paid' : 'Pending'}
                      </span>
                      {s.razorpayPaymentId && (
                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                          {s.razorpayPaymentId}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={isSettled ? 'status-pill-green' : 'status-pill-blue'}>
                        {isSettled ? 'Settled' : 'In Progress'}
                      </span>
                    </td>
                    <td>
                      {isPaid ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#059669' }}>
                            ✓ Paid{s.paymentMethod ? ` (${s.paymentMethod})` : ''}
                          </span>
                          {onViewPaymentSlip && (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{
                                fontSize: '0.72rem',
                                color: '#0D9488',
                                borderColor: '#99F6E4',
                                background: '#F0FDFA',
                                padding: '3px 8px',
                                fontWeight: 700,
                              }}
                              onClick={() => onViewPaymentSlip(s)}
                              title="Print / Download Payment Slip"
                            >
                              🧾 Slip
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={isPaying || s.grossAmountInr < 1}
                            onClick={() => void onPaySettlement(s)}
                          >
                            {isPaying ? 'Opening Checkout...' : `Pay ${formatInr(s.grossAmountInr)}`}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ fontSize: '0.74rem', color: '#0D9488', borderColor: '#0D9488' }}
                            onClick={() => void onMarkSettlementPaidByLab?.(s)}
                            title="Mark as settled directly with the lab so courier does not ask patient for payment."
                          >
                            ✓ Mark Paid Direct
                          </button>
                        </div>
                      )}
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

