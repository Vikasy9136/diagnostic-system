import {
  type CatalogItemType,
  type CommissionConfig,
  type DiagnosticTestItem,
  formatInr,
  type LabFacility,
  type LargeLabB2bAgreement,
  TUBE_METADATA,
  TubeType,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';
import { type FormatLabelFn } from '../types';
import { type LargeLabOrgCatalogItems } from './largeLabTypes';

export interface LargeLabRatesTabProps {
  orgCatalogItems: LargeLabOrgCatalogItems;
  activeAgreement?: LargeLabB2bAgreement;
  commConfig: CommissionConfig;
  orgCenters: LabFacility[];
  isBranchCenter: boolean;
  formatLabel: FormatLabelFn;
  onOpenAddCatalogModal: (itemType: CatalogItemType) => void;
  onOpenEditCatalogModal: (item: DiagnosticTestItem) => void;
  onConfirmDeleteTest: (item: DiagnosticTestItem) => void;
  onOpenAddBranchModal: () => void;
}

export function LargeLabRatesTab({
  orgCatalogItems,
  activeAgreement,
  commConfig,
  orgCenters,
  isBranchCenter,
  formatLabel,
  onOpenAddCatalogModal,
  onOpenEditCatalogModal,
  onConfirmDeleteTest,
  onOpenAddBranchModal,
}: LargeLabRatesTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="chart-card-modern">
        <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 className="card-top-title">
              Partner Test &amp; Package Catalogue ({orgCatalogItems.owned.length} Published)
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Enter each test-wise &amp; combo package B2B rate for Small Labs to auto-match and compare prices live.{' '}
              {activeAgreement
                ? `Negotiated Contract: ${activeAgreement.agreedCommissionPct}% Commission • ${activeAgreement.b2bMarkupPct}% Markup`
                : `Default Network Rule: ${commConfig.commissionPct}% Commission`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={() => onOpenAddCatalogModal('TEST')}>
              + Add Test Rate
            </button>
            <button type="button" className="btn-primary" onClick={() => onOpenAddCatalogModal('PACKAGE')}>
              + Add Combo Package
            </button>
          </div>
        </div>

        {orgCatalogItems.owned.length === 0 ? (
          <EmptyStateBox
            title="No Custom Tests or Packages Published Yet"
            description="Add your Lab's Test Panels & Health Packages below, or customize any Global Baseline test below so Small Labs see your competitive quotes at #1."
          />
        ) : (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>Code &amp; Type</th>
                  <th>Test / Package Name</th>
                  <th>Tube Cap</th>
                  <th>Your B2B Payout</th>
                  <th>Small Lab Pays</th>
                  <th>MRP / TAT</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orgCatalogItems.owned.map((t) => {
                  const tubeMeta = TUBE_METADATA[t.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                  const largeRate =
                    typeof t.largeLabB2bRateInr === 'number'
                      ? t.largeLabB2bRateInr
                      : Math.round(
                        (t.b2bPriceInr || 0) *
                        (1 - (activeAgreement?.agreedCommissionPct ?? commConfig.commissionPct) / 100)
                      );
                  return (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.code}</strong>
                        <div style={{ marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          <span className={t.itemType === 'PACKAGE' ? 'package-match-pill' : 'status-pill-blue'}>
                            {t.itemType === 'PACKAGE' ? '📦 PACKAGE' : '🧪 TEST'}
                          </span>
                          <span
                            className={
                              t.approvalStatus === 'APPROVED' || !t.approvalStatus
                                ? 'status-pill-green'
                                : t.approvalStatus === 'REJECTED'
                                ? 'status-pill-red'
                                : 'status-pill-amber'
                            }
                          >
                            {t.approvalStatus || 'APPROVED'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div>
                          <strong>{t.name}</strong>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{t.department}</div>
                        {t.itemType === 'PACKAGE' && t.includedTestCodes && (
                          <div style={{ fontSize: '0.72rem', color: '#1D4ED8', marginTop: '2px' }}>
                            Includes: {t.includedTestCodes.join(', ')}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="tube-cap-pill" style={{ background: tubeMeta.bgHex, color: tubeMeta.colorHex }}>
                          <span className="tube-cap-dot" style={{ background: tubeMeta.colorHex }} />
                          {tubeMeta.capColorName}
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: '#059669' }}>{formatInr(largeRate)}</strong>
                      </td>
                      <td>
                        <strong>{formatInr(t.b2bPriceInr)}</strong>
                      </td>
                      <td>
                        {formatInr(t.mrpInr)} / {t.tatHours}h
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button type="button" className="btn-secondary" onClick={() => onOpenEditCatalogModal(t)}>
                            Edit
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => onConfirmDeleteTest(t)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {orgCatalogItems.globalFallback.length > 0 && (
          <div style={{ marginTop: '22px', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
            <h3 style={{ fontSize: '0.94rem', fontWeight: 700, marginBottom: '10px' }}>
              Global Network Baseline Panels ({orgCatalogItems.globalFallback.length})
            </h3>
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Panel Name</th>
                    <th>Tube</th>
                    <th>Baseline Tariff</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orgCatalogItems.globalFallback.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.code}</strong>
                      </td>
                      <td>
                        {t.name}{' '}
                        {t.itemType === 'PACKAGE' && t.includedTestCodes
                          ? `(${t.includedTestCodes.join(', ')})`
                          : ''}
                      </td>
                      <td>{TUBE_METADATA[t.tubeType]?.capColorName || formatLabel(t.tubeType)}</td>
                      <td>{formatInr(t.b2bPriceInr)}</td>
                      <td>
                        <button type="button" className="btn-secondary" onClick={() => onOpenEditCatalogModal(t)}>
                          Customize Rate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Connected Centers & Branches Card */}
      <div className="chart-card-modern">
        <div className="card-top-header">
          <div>
            <h3 className="card-top-title">
              Organization Hubs &amp; Branch Collection Centers ({orgCenters.length})
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Each branch center appears as a nearby sample drop-off option when Small Labs select your Hub.
            </p>
          </div>
          {!isBranchCenter && (
            <button type="button" className="btn-primary" onClick={onOpenAddBranchModal}>
              + Add Collection Center Branch
            </button>
          )}
        </div>
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Center ID</th>
                <th>Branch Name</th>
                <th>Role</th>
                <th>City / Pincode</th>
                <th>Address &amp; GPS</th>
                <th>Login Access</th>
              </tr>
            </thead>
            <tbody>
              {orgCenters.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="user-code-badge">{c.userCode || c.id}</span>
                  </td>
                  <td>{c.name}</td>
                  <td>
                    <span className={c.centerType === 'COLLECTION_CENTER' ? 'status-pill-blue' : 'status-pill-green'}>
                      {c.centerType === 'COLLECTION_CENTER' ? 'Branch Center' : 'Main Hub HQ'}
                    </span>
                  </td>
                  <td>
                    {c.city}
                    {c.pincode ? ` (${c.pincode})` : ''}
                  </td>
                  <td>
                    <div>{c.address}</div>
                    {c.latitude && c.longitude && (
                      <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                        GPS: {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                      </div>
                    )}
                  </td>
                  <td>
                    <div>{c.email}</div>
                    <span
                      style={{ marginTop: '3px', display: 'inline-block', fontSize: '0.7rem' }}
                      className={c.initialPasswordSet ? 'status-pill-green' : 'status-pill-amber'}
                    >
                      {c.initialPasswordSet ? '🔐 Password Ready' : '📧 Email / OTP Login'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

