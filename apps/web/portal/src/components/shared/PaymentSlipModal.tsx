import { type PaymentSlipData, formatInr } from '@diagnostic/shared';
import { ModalFrame } from './ModalFrame';

export interface PaymentSlipModalProps {
  slip: PaymentSlipData | null;
  onClose: () => void;
}

export function PaymentSlipModal({ slip, onClose }: PaymentSlipModalProps) {
  if (!slip) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <ModalFrame
      open={Boolean(slip)}
      onClose={onClose}
      title="Digital Payment Receipt & Invoice Slip"
      maxWidth="680px"
      footer={
        <>
          <button type="button" className="btn-secondary no-print" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn-primary no-print"
            style={{ background: '#0D9488', borderColor: '#0D9488', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={handlePrint}
          >
            <span>🖨️</span>
            <span>Print / Save as PDF</span>
          </button>
        </>
      }
    >
      <div className="printable-payment-slip" style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: '#0F172A' }}>
        <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            .printable-payment-slip, .printable-payment-slip * {
              visibility: visible;
            }
            .printable-payment-slip {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              margin: 0;
              padding: 24px;
              background: #ffffff !important;
            }
            .no-print {
              display: none !important;
            }
            .modal-header, .modal-footer {
              display: none !important;
            }
          }
        `}</style>

        {/* Top Header Card */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '2.5px solid #0D9488',
            paddingBottom: '16px',
            marginBottom: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #0D9488 0%, #0A2A5E 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  fontWeight: 900,
                  fontSize: '18px',
                }}
              >
                +
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0A2A5E', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                  LabSetu Diagnostics
                </div>
                <div style={{ fontSize: '0.72rem', color: '#0D9488', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Unified B2B Lab Network &amp; Logistics
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '6px' }}>
              Digital Inter-Facility Sample Transport &amp; Processing Slip
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#DCFCE7',
                color: '#15803D',
                border: '1px solid #86EFAC',
                borderRadius: '999px',
                padding: '3px 10px',
                fontSize: '0.76rem',
                fontWeight: 800,
                marginBottom: '6px',
              }}
            >
              <span>●</span> PAID IN FULL
            </div>
            <div style={{ fontSize: '0.78rem', color: '#334155' }}>
              <strong>Receipt No:</strong> {slip.receiptNumber}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
              <strong>Paid Date:</strong> {new Date(slip.paidAt).toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        {/* Transaction Metadata Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '8px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '0.78rem',
          }}
        >
          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>
              Transaction ID
            </span>
            <strong style={{ color: '#0F172A', wordBreak: 'break-all' }}>{slip.paymentId}</strong>
          </div>
          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>
              Booking Reference
            </span>
            <strong style={{ color: '#0F766E' }}>{slip.orderNumber}</strong>
          </div>
          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>
              Payment Mode
            </span>
            <strong style={{ color: '#0F172A' }}>{slip.paymentMethod || 'Razorpay Online'}</strong>
          </div>
          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>
              Gross Settled
            </span>
            <strong style={{ color: '#16A34A', fontSize: '0.9rem' }}>{formatInr(slip.totalAmountInr)}</strong>
          </div>
        </div>

        {/* Payer and Payee Info Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          {/* Billed To / Payer */}
          <div
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '12px',
              background: '#FFFFFF',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0F766E', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '4px' }}>
              Billed To (Referring Center / Payer)
            </div>
            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0F172A' }}>{slip.payerName}</div>
            {slip.payerId && <div style={{ color: '#64748B', fontSize: '0.75rem' }}>Facility ID: {slip.payerId}</div>}
            {slip.payerPhone && <div style={{ color: '#64748B', fontSize: '0.75rem' }}>Contact: {slip.payerPhone}</div>}
            {slip.payerAddress && (
              <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: '4px', lineHeight: 1.3 }}>
                {slip.payerAddress}
              </div>
            )}
          </div>

          {/* Destination / Receiver */}
          <div
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '12px',
              background: '#FFFFFF',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0A2A5E', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '4px' }}>
              Testing Hub (Processing Destination)
            </div>
            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0F172A' }}>{slip.receiverName}</div>
            {slip.receiverId && <div style={{ color: '#64748B', fontSize: '0.75rem' }}>Hub ID: {slip.receiverId}</div>}
            <div style={{ color: '#16A34A', fontSize: '0.75rem', fontWeight: 600 }}>NABL Compliant Partner Lab</div>
            {slip.receiverAddress && (
              <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: '4px', lineHeight: 1.3 }}>
                {slip.receiverAddress}
              </div>
            )}
          </div>
        </div>

        {/* Patient Reference Strip */}
        <div
          style={{
            background: '#F0FDFA',
            border: '1px solid #99F6E4',
            borderRadius: '8px',
            padding: '8px 12px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.8rem',
          }}
        >
          <div>
            <span style={{ color: '#0F766E', fontWeight: 700 }}>Patient: </span>
            <strong style={{ color: '#0F172A' }}>{slip.patientName}</strong>
            {slip.patientAge ? ` • ${slip.patientAge} Y` : ''}
            {slip.patientGender ? ` / ${slip.patientGender}` : ''}
          </div>
          {slip.patientId && (
            <div style={{ color: '#64748B', fontSize: '0.75rem' }}>
              Patient Ref: <strong>{slip.patientId}</strong>
            </div>
          )}
        </div>

        {/* Diagnostic Items Table */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
            Diagnostic Panels / Tests Breakdown
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.78rem',
            }}
          >
            <thead>
              <tr style={{ background: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700, width: '32px' }}>#</th>
                <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>Test Code</th>
                <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>Investigation Description</th>
                <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>Vacutainer</th>
                <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {slip.items && slip.items.length > 0 ? (
                slip.items.map((it, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '8px 10px', color: '#64748B' }}>{idx + 1}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0F766E' }}>{it.code}</td>
                    <td style={{ padding: '8px 10px', color: '#0F172A', fontWeight: 600 }}>{it.name}</td>
                    <td style={{ padding: '8px 10px', color: '#64748B' }}>{it.specimenType || 'Serum / Blood'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                      {formatInr(it.rateInr)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '8px 10px', color: '#64748B' }}>1</td>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0F766E' }}>DIAG</td>
                  <td style={{ padding: '8px 10px', color: '#0F172A', fontWeight: 600 }}>
                    Diagnostic Profile &amp; Sample Collection
                  </td>
                  <td style={{ padding: '8px 10px', color: '#64748B' }}>Standard Vacutainer</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                    {formatInr(slip.subtotalInr)}
                  </td>
                </tr>
              )}

              {/* Logistics Row if applicable */}
              {slip.logisticsFeeInr !== undefined && slip.logisticsFeeInr > 0 && (
                <tr style={{ borderBottom: '1px solid #E2E8F0', background: '#FAFAFA' }}>
                  <td style={{ padding: '8px 10px', color: '#64748B' }}>•</td>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: '#64748B' }}>LOG-STAT</td>
                  <td style={{ padding: '8px 10px', color: '#475569' }}>
                    Phlebotomist Cold-Chain Transit &amp; Custody Courier
                  </td>
                  <td style={{ padding: '8px 10px', color: '#64748B' }}>Insulated Bag (+2°C to +8°C)</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                    {formatInr(slip.logisticsFeeInr)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Total Calculation Card */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: '18px',
          }}
        >
          <div style={{ width: '260px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748B', marginBottom: '4px' }}>
              <span>Diagnostic Tests Total</span>
              <span>{formatInr(slip.subtotalInr)}</span>
            </div>
            {slip.logisticsFeeInr !== undefined && slip.logisticsFeeInr > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748B', marginBottom: '4px' }}>
                <span>Cold-Chain Courier Transit</span>
                <span>{formatInr(slip.logisticsFeeInr)}</span>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.94rem',
                fontWeight: 900,
                color: '#0A2A5E',
                borderTop: '1.5px solid #0D9488',
                paddingTop: '6px',
                marginTop: '6px',
              }}
            >
              <span>Net Amount Paid:</span>
              <span style={{ color: '#16A34A' }}>{formatInr(slip.totalAmountInr)}</span>
            </div>
          </div>
        </div>

        {/* Transparent Automated Financial Split & Ledger Verification */}
        {(() => {
          const courierFee = slip.logisticsFeeInr || 200;
          const testTotal = Math.max(0, slip.totalAmountInr - courierFee);
          const phleboFeePct = slip.feeBreakdown?.phleboFeePct ?? 5;
          const smallLabFeePct = slip.feeBreakdown?.smallLabFeePct ?? 5;
          const adminFeePct = phleboFeePct + smallLabFeePct;

          const phleboDeduction =
            slip.feeBreakdown?.phleboFeeDeductionInr ?? Math.round((courierFee * phleboFeePct) / 100);
          const phleboNet =
            slip.feeBreakdown?.phleboNetPayoutInr ?? Math.max(0, courierFee - phleboDeduction);

          const smallLabDeduction =
            slip.feeBreakdown?.smallLabFeeDeductionInr ?? Math.round((testTotal * smallLabFeePct) / 100);
          const smallLabNet =
            slip.feeBreakdown?.smallLabNetShareInr ?? Math.max(0, testTotal - smallLabDeduction);

          const platformNet =
            slip.feeBreakdown?.adminPlatformFeeInr ?? (phleboDeduction + smallLabDeduction);

          return (
            <div
              style={{
                marginBottom: '18px',
                padding: '12px 14px',
                borderRadius: '8px',
                background: '#F0FDFA',
                border: '1px solid #99F6E4',
              }}
            >
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: '#0F766E',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >
                💳 Automated Payment Split &amp; Settlement Clearance
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '8px',
                  fontSize: '0.75rem',
                }}
              >
                <div
                  style={{
                    background: '#FFFFFF',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CCFBF1',
                  }}
                >
                  <div style={{ color: '#0A2A5E', fontWeight: 700 }}>🏍️ Phlebotomist Payout</div>
                  <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                    Gross: {formatInr(courierFee)} &bull; {phleboFeePct}% Platform Fee (-{formatInr(phleboDeduction)})
                  </div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0D9488', marginTop: '2px' }}>
                    Net: {formatInr(phleboNet)}
                  </div>
                </div>

                <div
                  style={{
                    background: '#FFFFFF',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CCFBF1',
                  }}
                >
                  <div style={{ color: '#0A2A5E', fontWeight: 700 }}>🏥 Small Lab Referral Share</div>
                  <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                    Gross: {formatInr(testTotal)} &bull; {smallLabFeePct}% Platform Fee (-{formatInr(smallLabDeduction)})
                  </div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>
                    Net: {formatInr(smallLabNet)}
                  </div>
                </div>

                <div
                  style={{
                    background: '#FFFFFF',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CCFBF1',
                  }}
                >
                  <div style={{ color: '#0A2A5E', fontWeight: 700 }}>⚡ LabSetu Platform Fee</div>
                  <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                    Combined {adminFeePct}% Cut (Admin Razorpay Linked)
                  </div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#16A34A', marginTop: '2px' }}>
                    {formatInr(platformNet)}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Security Verification & Signatory Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: '1px dashed #CBD5E1',
            paddingTop: '14px',
            fontSize: '0.72rem',
            color: '#64748B',
          }}
        >
          <div style={{ maxWidth: '380px', lineHeight: 1.4 }}>
            <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '2px' }}>
              ✓ Digital Platform Clearance Authentication
            </div>
            <div>
              Processed via RBI-compliant payment gateway. Transaction reference <code>{slip.paymentId}</code> digitally linked to Booking Order <code>{slip.orderNumber}</code>.
            </div>
            <div style={{ fontSize: '0.66rem', color: '#94A3B8', marginTop: '4px' }}>
              This is an authorized computer-generated diagnostic settlement slip and does not require a physical signature.
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800, color: '#0A2A5E', fontSize: '0.8rem' }}>LabSetu Gateway Automated Clearing</div>
            <div style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: 700 }}>Settlement Status: Cleared</div>
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}
