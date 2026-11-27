import { useEffect, useState } from 'react';
import {
  calculateCentralizedBookingFinancialsPaise,
  DEFAULT_PLATFORM_PRICING_CONFIG,
  type FinancialLedgerRecord,
  type PhleboCostFundingModel,
  type PlatformPricingChangeHistoryEntry,
  type PlatformPricingConfig,
} from '@diagnostic/shared';
import {
  getAdminFinancialLedgerSummaryApi,
  getPlatformPricingConfigApi,
  getPlatformPricingHistoryApi,
  updatePlatformPricingConfigApi,
} from '../../services/workflowApiService';

function paiseToInrStr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function AdminPlatformPricingPanel({
  canConfigure,
  onNotify,
}: {
  canConfigure: boolean;
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const [cfg, setCfg] = useState<PlatformPricingConfig>(DEFAULT_PLATFORM_PRICING_CONFIG);
  const [history, setHistory] = useState<PlatformPricingChangeHistoryEntry[]>([]);
  const [ledgerRecords, setLedgerRecords] = useState<FinancialLedgerRecord[]>([]);
  const [totals, setTotals] = useState({
    largeLabPriceDifferenceMarginPaise: 0,
    smallLabIncludedPlatformFeePaise: 0,
    phleboPlatformFeePaise: 0,
    largeLabProcessingCostPaise: 0,
    phleboNetEarningPaise: 0,
    totalGrossPlatformRevenuePaise: 0,
    refundsAndAdjustmentsPaise: 0,
    taxesPaise: 0,
    gatewayExpensesPaise: 0,
    netPlatformRevenuePaise: 0,
  });
  const [saving, setSaving] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [summaryNote, setSummaryNote] = useState('');

  // Ledger filters
  const [dateFilter, setDateFilter] = useState('');
  const [orderFilter, setOrderFilter] = useState('');
  const [versionFilter, setVersionFilter] = useState('');

  async function loadAll() {
    try {
      const [c, h, l] = await Promise.all([
        getPlatformPricingConfigApi(),
        getPlatformPricingHistoryApi(),
        getAdminFinancialLedgerSummaryApi({
          date: dateFilter || undefined,
          orderId: orderFilter || undefined,
          pricingVersion: versionFilter || undefined,
        }),
      ]);
      setCfg(c);
      setHistory(h);
      setLedgerRecords(l.records || []);
      setTotals(l.totals);
    } catch {
      // Keep defaults if offline
    }
  }

  useEffect(() => {
    void loadAll();
  }, [dateFilter, orderFilter, versionFilter]);

  const preview = calculateCentralizedBookingFinancialsPaise({
    config: cfg,
    smallLabB2bPricePaise: 50000, // ₹500 sample B2B selling price
    largeLabNegotiatedPricePaise: 40000, // ₹400 sample negotiated processing price
  });

  async function handlePublish() {
    if (!canConfigure) {
      onNotify('You do not have permission to update platform pricing.', true);
      return;
    }
    setSaving(true);
    try {
      const updated = await updatePlatformPricingConfigApi({
        ...cfg,
        summary: summaryNote.trim() || undefined,
      });
      setCfg(updated);
      setConfirmPublish(false);
      setSummaryNote('');
      onNotify(`Published pricing ${updated.pricingVersion} successfully.`);
      await loadAll();
    } catch (err) {
      onNotify((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div className="chart-card-modern">
        <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 className="card-top-title">
              Platform Pricing &amp; Fee Settings ({cfg.pricingVersion})
            </h2>
            <p style={{ fontSize: '0.78rem', color: '#64748B' }}>
              Centralized integer-paise configuration. Changes apply only to future bookings.
            </p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={cfg.isActive}
              disabled={!canConfigure}
              onChange={(e) => setCfg({ ...cfg, isActive: e.target.checked })}
            />
            Configuration Active
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '14px' }}>
          {/* Section A: Large Lab Platform Margin */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
            <h3 style={{ marginTop: 0, fontSize: '0.92rem' }}>A. Large Lab Platform Margin</h3>
            <p style={{ fontSize: '0.74rem', color: '#64748B' }}>
              Gross margin = Small Lab B2B Selling Price − Large Lab Negotiated Processing Price.
            </p>
            <div className="form-group">
              <label className="form-label">Default Margin (% when negotiated price not overridden)</label>
              <input
                type="number"
                step="0.1"
                className="form-input"
                disabled={!canConfigure}
                value={cfg.defaultLargeLabMarginPct}
                onChange={(e) => setCfg({ ...cfg, defaultLargeLabMarginPct: Number(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Optional Large Lab Side Fee (%) — Default 0%</label>
              <input
                type="number"
                step="0.1"
                className="form-input"
                disabled={!canConfigure}
                value={cfg.largeLabSideFeePct}
                onChange={(e) => setCfg({ ...cfg, largeLabSideFeePct: Number(e.target.value) })}
              />
            </div>
            <div style={{ fontSize: '0.76rem', color: '#0F766E', fontWeight: 600 }}>
              Preview (₹500 B2B / ₹400 Negotiated): Large Lab gets {paiseToInrStr(preview.largeLabNetPayablePaise)}, Price Diff Margin = {paiseToInrStr(preview.largeLabPriceDifferenceMarginPaise)}
            </div>
          </div>

          {/* Section B: Small Lab Platform Fee (Included in B2B Price) */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
            <h3 style={{ marginTop: 0, fontSize: '0.92rem' }}>B. Small Lab Platform Fee (%)</h3>
            <p style={{ fontSize: '0.74rem', color: '#64748B' }}>
              Included in B2B Selling Price (never charged extra on top of ₹500).
            </p>
            <div className="form-group">
              <label className="form-label">Default Small Lab Included Fee (%)</label>
              <input
                type="number"
                step="0.1"
                className="form-input"
                disabled={!canConfigure}
                value={cfg.smallLabDefaultFeePct}
                onChange={(e) => setCfg({ ...cfg, smallLabDefaultFeePct: Number(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Tax (%) &amp; Gateway Charge (%)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  type="number"
                  step="0.1"
                  className="form-input"
                  disabled={!canConfigure}
                  value={cfg.taxPct}
                  onChange={(e) => setCfg({ ...cfg, taxPct: Number(e.target.value) })}
                  placeholder="Tax %"
                />
                <input
                  type="number"
                  step="0.1"
                  className="form-input"
                  disabled={!canConfigure}
                  value={cfg.gatewayChargePct}
                  onChange={(e) => setCfg({ ...cfg, gatewayChargePct: Number(e.target.value) })}
                  placeholder="Gateway %"
                />
              </div>
            </div>
            <div style={{ fontSize: '0.76rem', color: '#1D4ED8', fontWeight: 600 }}>
              Preview (₹500 B2B @ {cfg.smallLabDefaultFeePct}%): Included Fee = {paiseToInrStr(preview.smallLabIncludedFeePaise)} (Included in B2B Price)
            </div>
          </div>

          {/* Section C: Phlebo Platform Fee (Deducted from Gross Payout) */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
            <h3 style={{ marginTop: 0, fontSize: '0.92rem' }}>C. Phlebo Platform Fee (%)</h3>
            <p style={{ fontSize: '0.74rem', color: '#64748B' }}>
              Deducted once from Eligible Gross Phlebo Payout before wallet credit.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="form-group">
                <label className="form-label">Base Visit Gross (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  disabled={!canConfigure}
                  value={cfg.phleboBaseVisitPayoutPaise / 100}
                  onChange={(e) =>
                    setCfg({ ...cfg, phleboBaseVisitPayoutPaise: Math.round(Number(e.target.value) * 100) })
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phlebo Fee (%)</label>
                <input
                  type="number"
                  step="0.1"
                  className="form-input"
                  disabled={!canConfigure}
                  value={cfg.phleboPlatformFeePct}
                  onChange={(e) => setCfg({ ...cfg, phleboPlatformFeePct: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Phlebo Cost Funding Model</label>
              <select
                className="form-select"
                disabled={!canConfigure}
                value={cfg.phleboCostFundingModel}
                onChange={(e) =>
                  setCfg({ ...cfg, phleboCostFundingModel: e.target.value as PhleboCostFundingModel })
                }
              >
                <option value="SEPARATELY_BILLED">Separately Billed Service Charge</option>
                <option value="INCLUDED_IN_B2B">Included in B2B Price</option>
              </select>
            </div>
            <div style={{ fontSize: '0.76rem', color: '#7C3AED', fontWeight: 600 }}>
              Preview: Gross {paiseToInrStr(preview.phleboGrossPayoutPaise)} − Fee {paiseToInrStr(preview.phleboPlatformFeePaise)} = Net Wallet Credit {paiseToInrStr(preview.phleboNetEarningPaise)}
            </div>
          </div>
        </div>

        {canConfigure && (
          <div style={{ marginTop: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <input
              className="form-input"
              style={{ maxWidth: '420px' }}
              placeholder="Change summary for audit log (optional)..."
              value={summaryNote}
              onChange={(e) => setSummaryNote(e.target.value)}
            />
            {!confirmPublish ? (
              <button type="button" className="btn-primary" onClick={() => setConfirmPublish(true)}>
                Save &amp; Publish New Version →
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#B45309' }}>
                  Apply to all future bookings?
                </span>
                <button type="button" className="btn-primary" onClick={() => void handlePublish()} disabled={saving}>
                  {saving ? 'Publishing...' : 'Confirm Publish'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setConfirmPublish(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Revenue Classification & Ledger Summary */}
      <div className="chart-card-modern">
        <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 className="card-top-title">Revenue Classification &amp; Financial Ledger ({ledgerRecords.length} entries)</h2>
            <p style={{ fontSize: '0.78rem', color: '#64748B' }}>
              Balanced integer-paise ledger — no double counting between Large Lab price difference and Small Lab included fee.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input type="date" className="form-input" style={{ width: '150px' }} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
            <input className="form-input" style={{ width: '150px' }} placeholder="Booking ID..." value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)} />
            <input className="form-input" style={{ width: '120px' }} placeholder="Version (v1.0.0)" value={versionFilter} onChange={(e) => setVersionFilter(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
          {[
            { label: 'Large Lab Price Diff Margin', val: totals.largeLabPriceDifferenceMarginPaise, color: '#0F766E' },
            { label: 'Small Lab Included Fee (Sub)', val: totals.smallLabIncludedPlatformFeePaise, color: '#1D4ED8' },
            { label: 'Phlebo Platform Fee', val: totals.phleboPlatformFeePaise, color: '#7C3AED' },
            { label: 'Total Gross Platform Rev', val: totals.totalGrossPlatformRevenuePaise, color: '#059669' },
            { label: 'Refunds & Adjustments', val: totals.refundsAndAdjustmentsPaise, color: '#DC2626' },
            { label: 'Taxes (Govt)', val: totals.taxesPaise, color: '#475569' },
            { label: 'Gateway Expenses', val: totals.gatewayExpensesPaise, color: '#B45309' },
            { label: 'Net Platform Revenue', val: totals.netPlatformRevenuePaise, color: '#0F172A' },
          ].map((k) => (
            <div key={k.label} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>{k.label}</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: k.color }}>{paiseToInrStr(k.val)}</div>
            </div>
          ))}
        </div>

        {history.length > 0 && (
          <div style={{ marginTop: '10px', fontSize: '0.78rem', color: '#475569' }}>
            <strong>Latest Version History:</strong>{' '}
            {history.slice(0, 3).map((h) => `${h.pricingVersion} (${new Date(h.changedAt).toLocaleDateString('en-IN')})`).join(' • ')}
          </div>
        )}
      </div>
    </div>
  );
}
