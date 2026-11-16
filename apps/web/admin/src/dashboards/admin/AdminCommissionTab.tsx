import { type FormEvent } from 'react';
import {
  type CommissionConfig,
  formatInr,
  type LabFacility,
  type OrderPricingSplitResult,
  OrderPriority,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';

export interface AdminCommissionTabProps {
  commConfig: CommissionConfig;
  onCommConfigChange: (next: CommissionConfig) => void;
  onSaveCommissionConfig: () => Promise<void>;
  canViewFinanceOps: boolean;
  onOpenFinanceOps: () => void;
  largeLabOrgs: LabFacility[];
  simDropType: 'LARGE_LAB' | 'SELF_DROP' | 'CUSTOM_ADDRESS';
  onSimDropTypeChange: (val: 'LARGE_LAB' | 'SELF_DROP' | 'CUSTOM_ADDRESS') => void;
  simLabOrgId: string;
  onSimLabOrgIdChange: (val: string) => void;
  simSmallTariff: number;
  onSimSmallTariffChange: (val: number) => void;
  simLargeB2bRate: number;
  onSimLargeB2bRateChange: (val: number) => void;
  simDistanceKm: number;
  onSimDistanceKmChange: (val: number) => void;
  simPriority: OrderPriority;
  onSimPriorityChange: (val: OrderPriority) => void;
  simulatedSplit: OrderPricingSplitResult;
  agreementLabId: string;
  onAgreementLabChange: (id: string) => void;
  agreementCommPct: number;
  onAgreementCommPctChange: (val: number) => void;
  agreementMarkupPct: number;
  onAgreementMarkupPctChange: (val: number) => void;
  agreementCycle: 'DAILY' | 'T_PLUS_2' | 'WEEKLY';
  onAgreementCycleChange: (val: 'DAILY' | 'T_PLUS_2' | 'WEEKLY') => void;
  agreementMinPayout: number;
  onAgreementMinPayoutChange: (val: number) => void;
  agreementNotes: string;
  onAgreementNotesChange: (val: string) => void;
  onSaveAgreement: (e: FormEvent) => Promise<void>;
}

export function AdminCommissionTab({
  commConfig,
  onCommConfigChange,
  onSaveCommissionConfig,
  canViewFinanceOps,
  onOpenFinanceOps,
  largeLabOrgs,
  simDropType,
  onSimDropTypeChange,
  simLabOrgId,
  onSimLabOrgIdChange,
  simSmallTariff,
  onSimSmallTariffChange,
  simLargeB2bRate,
  onSimLargeB2bRateChange,
  simDistanceKm,
  onSimDistanceKmChange,
  simPriority,
  onSimPriorityChange,
  simulatedSplit,
  agreementLabId,
  onAgreementLabChange,
  agreementCommPct,
  onAgreementCommPctChange,
  agreementMarkupPct,
  onAgreementMarkupPctChange,
  agreementCycle,
  onAgreementCycleChange,
  agreementMinPayout,
  onAgreementMinPayoutChange,
  agreementNotes,
  onAgreementNotesChange,
  onSaveAgreement,
}: AdminCommissionTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        className={
          commConfig.enablePatientPaymentSplitting || commConfig.enablePartnerLabPayouts
            ? 'privacy-shield-banner'
            : 'disclaimer-banner-ca'
        }
        style={{
          marginBottom: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div>
          <strong>
            Current Commercial Billing Mode:{' '}
            {commConfig.billingMode === 'FULL_B2B_SPLIT'
              ? 'FULL B2B SPLIT & COMMISSIONS ACTIVE'
              : commConfig.billingMode === 'INSTANT_30M_PAYOUT' || commConfig.hideSubscriptionsUi !== false
              ? '30-MIN INSTANT PAYOUTS + PLATFORM FEES (Subscriptions Hidden)'
              : 'SUBSCRIPTION & PLATFORM FEES (Commission Splits Inactive Initially)'}
          </strong>
          <div style={{ fontSize: '0.78rem', marginTop: '2px' }}>
            30-Min Instant Payouts:{' '}
            <strong>
              {commConfig.instantPayoutEnabled !== false
                ? `ACTIVE (${commConfig.instantPayoutWindowMinutes ?? 30} mins SLA)`
                : 'PAUSED'}
            </strong>{' '}
            • Automated Partner Lab Payouts:{' '}
            <strong>{commConfig.enablePartnerLabPayouts ? 'ACTIVE' : 'INACTIVE'}</strong> • Subscriptions UI:{' '}
            <strong>{commConfig.hideSubscriptionsUi !== false ? 'HIDDEN (Preserved)' : 'VISIBLE'}</strong>.
          </div>
        </div>
        {canViewFinanceOps && (
          <button
            type="button"
            className="btn-secondary"
            onClick={onOpenFinanceOps}
          >
            Open Finance &amp; Billing Controls →
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        <div className="chart-card-modern">
          <h2 className="card-top-title">Global Commission, Logistics &amp; Dispatch Radius</h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
            Configure Small Lab pricing markup/commission, distance courier split, and 1–5 km live rider broadcast radius.
          </p>
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Default Platform Fee (%)</label>
                <input
                  type="number"
                  className="form-input"
                  value={commConfig.commissionPct}
                  onChange={(e) => onCommConfigChange({ ...commConfig, commissionPct: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Default Margin Model</label>
                <select
                  className="form-select"
                  value={commConfig.defaultMarginMode || 'PCT_OF_GROSS'}
                  onChange={(e) =>
                    onCommConfigChange({
                      ...commConfig,
                      defaultMarginMode: e.target.value as 'PCT_OF_GROSS' | 'MARKUP_ON_B2B',
                    })
                  }
                >
                  <option value="PCT_OF_GROSS">% Commission of Tariff</option>
                  <option value="MARKUP_ON_B2B">Markup on Negotiated Large Lab Rate</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Courier Base Fee (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  value={commConfig.courierBaseFeeInr}
                  onChange={(e) => onCommConfigChange({ ...commConfig, courierBaseFeeInr: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Included Base Km</label>
                <input
                  type="number"
                  className="form-input"
                  value={commConfig.includedBaseKm ?? 5}
                  onChange={(e) => onCommConfigChange({ ...commConfig, includedBaseKm: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Extra Per-Km Rate (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  value={commConfig.perKmFeeInr ?? 20}
                  onChange={(e) => onCommConfigChange({ ...commConfig, perKmFeeInr: Number(e.target.value) })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Self / Custom Drop Courier Fee (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  value={commConfig.customDropBaseFeeInr ?? 180}
                  onChange={(e) => onCommConfigChange({ ...commConfig, customDropBaseFeeInr: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">STAT Priority Surcharge (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  value={commConfig.statSurchargeInr}
                  onChange={(e) => onCommConfigChange({ ...commConfig, statSurchargeInr: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Default Live Rider Broadcast Radius: <strong>{commConfig.defaultBroadcastRadiusKm ?? 5} km</strong> (1–5 km)
              </label>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                style={{ width: '100%', accentColor: '#0D9488' }}
                value={commConfig.defaultBroadcastRadiusKm ?? 5}
                onChange={(e) =>
                  onCommConfigChange({ ...commConfig, defaultBroadcastRadiusKm: Number(e.target.value) })
                }
              />
            </div>

            <div
              style={{
                background: '#F0FDFA',
                border: '1px solid #99F6E4',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '14px',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0F766E', marginBottom: '8px' }}>
                30-Minute Instant Payouts &amp; Subscriptions Display
              </div>
              <label className="checkbox-row" style={{ marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  checked={commConfig.instantPayoutEnabled !== false}
                  onChange={(e) =>
                    onCommConfigChange({ ...commConfig, instantPayoutEnabled: e.target.checked })
                  }
                />
                <span style={{ fontSize: '0.82rem' }}>
                  Enable 30-Minute Instant Payout SLA after sample completion
                </span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Instant Payout SLA (Mins)</label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    className="form-input"
                    value={commConfig.instantPayoutWindowMinutes ?? 30}
                    onChange={(e) =>
                      onCommConfigChange({
                        ...commConfig,
                        instantPayoutWindowMinutes: Number(e.target.value) || 30,
                      })
                    }
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: '18px' }}>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={commConfig.autoReleaseInstantPayouts !== false}
                      onChange={(e) =>
                        onCommConfigChange({ ...commConfig, autoReleaseInstantPayouts: e.target.checked })
                      }
                    />
                    <span style={{ fontSize: '0.8rem' }}>Auto-release payouts</span>
                  </label>
                </div>
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={commConfig.hideSubscriptionsUi !== false}
                  onChange={(e) => {
                    const hideUi = e.target.checked;
                    onCommConfigChange({
                      ...commConfig,
                      hideSubscriptionsUi: hideUi,
                      enableSubscriptionsModule: !hideUi,
                      billingMode: hideUi ? 'INSTANT_30M_PAYOUT' : 'SUBSCRIPTION_AND_PLATFORM_FEES',
                    });
                  }}
                />
                <span style={{ fontSize: '0.8rem' }}>
                  Hide Subscriptions UI in Portals (Preserve Subscription Logic for Future Phase)
                </span>
              </label>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={() => void onSaveCommissionConfig()}
            >
              Save Global Commission Rules
            </button>
          </div>
        </div>

        <div className="chart-card-modern">
          <h2 className="card-top-title">Interactive B2B Rate &amp; Payout Split Simulator</h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
            Preview exactly what the Small Lab pays, what the Large Lab &amp; Phlebotomist earn, and LabSetu&apos;s platform fee.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
            <div className="form-group">
              <label className="form-label">Drop Destination</label>
              <select
                className="form-select"
                value={simDropType}
                onChange={(e) => onSimDropTypeChange(e.target.value as 'LARGE_LAB' | 'SELF_DROP' | 'CUSTOM_ADDRESS')}
              >
                <option value="LARGE_LAB">Partner Large Reference Lab</option>
                <option value="SELF_DROP">Return to Small Lab (Self Drop)</option>
                <option value="CUSTOM_ADDRESS">Custom Drop Address</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Partner Large Lab</label>
              <select
                className="form-select"
                value={simLabOrgId}
                onChange={(e) => onSimLabOrgIdChange(e.target.value)}
              >
                <option value="">Global Default Rule</option>
                {largeLabOrgs.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Small Lab Payable Tariff (₹)</label>
              <input
                type="number"
                className="form-input"
                value={simSmallTariff}
                onChange={(e) => onSimSmallTariffChange(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Negotiated Large Lab Rate (₹)</label>
              <input
                type="number"
                className="form-input"
                value={simLargeB2bRate}
                disabled={simDropType !== 'LARGE_LAB'}
                onChange={(e) => onSimLargeB2bRateChange(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Route Distance (km)</label>
              <input
                type="number"
                step="0.5"
                className="form-input"
                value={simDistanceKm}
                onChange={(e) => onSimDistanceKmChange(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Urgency</label>
              <select
                className="form-select"
                value={simPriority}
                onChange={(e) => onSimPriorityChange(e.target.value as OrderPriority)}
              >
                <option value={OrderPriority.ROUTINE}>Routine Dispatch</option>
                <option value={OrderPriority.STAT_CRITICAL}>STAT Urgent</option>
              </select>
            </div>
          </div>

          <div className="comm-simulator-grid">
            <div className="comm-split-box">
              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Small Lab Pays</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>{formatInr(simulatedSplit.grossAmountInr)}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                Tests + {simulatedSplit.distanceFeeInr > 0 ? `${formatInr(simulatedSplit.distanceFeeInr)} km fee` : 'Base courier'}
              </div>
            </div>
            <div className="comm-split-box">
              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Large Lab B2B Share</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0D9488' }}>{formatInr(simulatedSplit.labPayoutInr)}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Settlement payout</div>
            </div>
            <div className="comm-split-box">
              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Phlebotomist Payout</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#2563EB' }}>{formatInr(simulatedSplit.phleboPayoutInr)}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748B' }}>+{simulatedSplit.extraDistanceKm} extra km</div>
            </div>
            <div className="comm-split-box">
              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Platform Net Fee</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#7C3AED' }}>{formatInr(simulatedSplit.platformFeeInr)}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Applied: {simulatedSplit.appliedCommissionPct}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="chart-card-modern">
        <div className="card-top-header">
          <div>
            <h2 className="card-top-title">Per-Large-Lab Negotiated B2B Rate Agreements</h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Define custom commercial contracts with each Reference Lab Hub governing commission %, Small Lab markup %, and settlement cycles.
            </p>
          </div>
        </div>

        {largeLabOrgs.length === 0 ? (
          <EmptyStateBox
            title="No Large Reference Lab Hubs Registered Yet"
            description="Add a Large Reference Lab Hub first to configure partner-specific B2B commercial terms."
          />
        ) : (
          <form onSubmit={(e) => void onSaveAgreement(e)} style={{ marginBottom: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Select Large Lab Hub</label>
                <select
                  className="form-select"
                  value={agreementLabId}
                  onChange={(e) => onAgreementLabChange(e.target.value)}
                >
                  {largeLabOrgs.map((org) => (
                    <option key={org.id} value={org.id}>{org.name} ({org.id})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Agreed Commission (%)</label>
                <input
                  type="number"
                  className="form-input"
                  value={agreementCommPct}
                  onChange={(e) => onAgreementCommPctChange(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Default Small Lab Markup (%)</label>
                <input
                  type="number"
                  className="form-input"
                  value={agreementMarkupPct}
                  onChange={(e) => onAgreementMarkupPctChange(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Settlement Cycle</label>
                <select
                  className="form-select"
                  value={agreementCycle}
                  onChange={(e) => onAgreementCycleChange(e.target.value as 'DAILY' | 'T_PLUS_2' | 'WEEKLY')}
                >
                  <option value="DAILY">Daily Payout</option>
                  <option value="T_PLUS_2">T+2 Settlement</option>
                  <option value="WEEKLY">Weekly Batch</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Min Order Payout (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  value={agreementMinPayout}
                  onChange={(e) => onAgreementMinPayoutChange(Number(e.target.value))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: '240px', marginBottom: 0 }}>
                <label className="form-label">Contract Notes</label>
                <input
                  className="form-input"
                  placeholder="e.g. Q4 negotiated corporate B2B rate card"
                  value={agreementNotes}
                  onChange={(e) => onAgreementNotesChange(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary">Save Partner B2B Agreement</button>
            </div>
          </form>
        )}

        {commConfig.largeLabAgreements && Object.keys(commConfig.largeLabAgreements).length > 0 && (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>Partner Reference Lab</th>
                  <th>Agreed Commission</th>
                  <th>Collection Centre Markup</th>
                  <th>Settlement Cycle</th>
                  <th>Notes</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(commConfig.largeLabAgreements).map((ag) => (
                  <tr key={ag.labId}>
                    <td>
                      <strong>{ag.labName || ag.labId}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{ag.labId}</div>
                    </td>
                    <td><span className="status-pill-blue">{ag.agreedCommissionPct}%</span></td>
                    <td>{ag.b2bMarkupPct}%</td>
                    <td>{ag.settlementCycle || 'DAILY'}</td>
                    <td>{ag.notes || '—'}</td>
                    <td>{ag.updatedAt ? new Date(ag.updatedAt).toLocaleDateString('en-IN') : '—'}</td>
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
