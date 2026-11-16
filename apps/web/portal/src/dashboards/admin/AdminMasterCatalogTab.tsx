import {
  type CatalogItemType,
  type CommissionConfig,
  type DiagnosticTestItem,
  formatInr,
  type LabFacility,
  TUBE_METADATA,
  TubeType,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';
import { type AlertTriggerFn } from '../types';

export interface AdminMasterCatalogTabProps {
  testCatalog: DiagnosticTestItem[];
  largeLabOrgs: LabFacility[];
  commConfig: CommissionConfig;
  catalogOwnerFilter: string;
  onCatalogOwnerFilterChange: (owner: string) => void;
  onOpenAddTestModal: (type: CatalogItemType) => void;
  onEditTestModal: (item: DiagnosticTestItem) => void;
  onDeleteTest: (id: string) => void;
  onShowAlert: AlertTriggerFn;
}

export function AdminMasterCatalogTab({
  testCatalog,
  largeLabOrgs,
  commConfig,
  catalogOwnerFilter,
  onCatalogOwnerFilterChange,
  onOpenAddTestModal,
  onEditTestModal,
  onDeleteTest,
  onShowAlert,
}: AdminMasterCatalogTabProps) {
  return (
    <div className="chart-card-modern">
      <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 className="card-top-title">Master Tests &amp; Partner Package Catalogue ({testCatalog.length})</h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
            Single tests, combo health packages, negotiated Large Lab B2B rates, and Small Lab payable tariffs
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="form-select"
            style={{ width: '210px' }}
            value={catalogOwnerFilter}
            onChange={(e) => onCatalogOwnerFilterChange(e.target.value)}
          >
            <option value="ALL">All Owners ({testCatalog.length})</option>
            <option value="GLOBAL">Global Network Default</option>
            {largeLabOrgs.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={() => onOpenAddTestModal('TEST')}>
            + Add Test Panel
          </button>
          <button type="button" className="btn-primary" onClick={() => onOpenAddTestModal('PACKAGE')}>
            + Add Health Package
          </button>
        </div>
      </div>
      {testCatalog.length === 0 ? (
        <EmptyStateBox
          title="Test Catalogue Is Empty"
          description="Add diagnostic tests (e.g., CBC, LFT, TSH) or Health Packages so Collection Labs can book and compare quotes."
          actionLabel="+ Add First Test Panel"
          onAction={() => onOpenAddTestModal('TEST')}
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Code &amp; Type</th>
                <th>Test / Package Details</th>
                <th>Partner Lab Owner</th>
                <th>Tube Cap</th>
                <th>Reference Lab Rate</th>
                <th>Collection Centre Pays</th>
                <th>Margin / MRP</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {testCatalog
                .filter((t) => {
                  if (catalogOwnerFilter === 'GLOBAL') return !t.ownerOrgId && !t.labId;
                  if (catalogOwnerFilter !== 'ALL') {
                    return t.ownerOrgId === catalogOwnerFilter || t.labId === catalogOwnerFilter;
                  }
                  return true;
                })
                .map((t) => {
                  const tubeMeta = TUBE_METADATA[t.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                  const largeRate =
                    typeof t.largeLabB2bRateInr === 'number'
                      ? t.largeLabB2bRateInr
                      : Math.round((t.b2bPriceInr || 0) * (1 - commConfig.commissionPct / 100));
                  const marginInr = Math.max(0, (t.b2bPriceInr || 0) - largeRate);
                  return (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.code}</strong>
                        <div style={{ marginTop: '4px' }}>
                          <span className={t.itemType === 'PACKAGE' ? 'package-match-pill' : 'status-pill-blue'}>
                            {t.itemType === 'PACKAGE' ? '📦 PACKAGE' : '🧪 TEST'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div><strong>{t.name}</strong></div>
                        <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                          {t.department} • TAT {t.tatHours} hrs
                        </div>
                        {t.itemType === 'PACKAGE' && t.includedTestCodes && t.includedTestCodes.length > 0 && (
                          <div style={{ fontSize: '0.72rem', color: '#1D4ED8', marginTop: '3px' }}>
                            Includes: {t.includedTestCodes.join(', ')}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                          {t.ownerOrgId ? (t.labName || t.ownerOrgId) : 'Global Default'}
                        </span>
                      </td>
                      <td>
                        <span className="tube-cap-pill" style={{ background: tubeMeta.bgHex, color: tubeMeta.colorHex }}>
                          <span className="tube-cap-dot" style={{ background: tubeMeta.colorHex }} />
                          {tubeMeta.capColorName}
                        </span>
                      </td>
                      <td>{formatInr(largeRate)}</td>
                      <td><strong>{formatInr(t.b2bPriceInr)}</strong></td>
                      <td>
                        <span style={{ color: '#059669', fontWeight: 700 }}>{formatInr(marginInr)}</span>
                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>MRP {formatInr(t.mrpInr)}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button type="button" className="btn-secondary" onClick={() => onEditTestModal(t)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() =>
                              onShowAlert({
                                variant: 'confirm',
                                title: `Remove ${t.code}?`,
                                message: `Delete ${t.name} from the catalogue?`,
                                onConfirm: () => onDeleteTest(t.id),
                              })
                            }
                          >
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
    </div>
  );
}
