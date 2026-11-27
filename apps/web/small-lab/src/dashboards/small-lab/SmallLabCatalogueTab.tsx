import {
  type DiagnosticTestItem,
  formatInr,
  TUBE_METADATA,
  TubeType,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';
import { type FormatLabelFn } from '../types';

export interface SmallLabCatalogueTabProps {
  testCatalog: DiagnosticTestItem[];
  formatLabel: FormatLabelFn;
  onAddToBooking: (cleanCode: string, ownerOrgId?: string) => void;
}

export function SmallLabCatalogueTab({
  testCatalog,
  formatLabel,
  onAddToBooking,
}: SmallLabCatalogueTabProps) {
  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <h2 className="card-top-title">Live B2B Test &amp; Package Catalogue ({testCatalog.length})</h2>
      </div>
      {testCatalog.length === 0 ? (
        <EmptyStateBox
          title="No Tests Published Yet"
          description="Tests and combo packages appear here as soon as Admin or Reference Labs add them."
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Code &amp; Type</th>
                <th>Test / Package Name</th>
                <th>Partner Lab</th>
                <th>Tube &amp; Specimen</th>
                <th>Cold-Chain</th>
                <th>TAT</th>
                <th>Collection Centre Rate</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {testCatalog.map((t) => {
                const tubeMeta = TUBE_METADATA[t.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                const cleanCode = t.code.trim().toUpperCase();
                return (
                  <tr key={t.id}>
                    <td>
                      <strong>{cleanCode}</strong>
                      <div style={{ marginTop: '4px' }}>
                        <span className={t.itemType === 'PACKAGE' ? 'package-match-pill' : 'status-pill-blue'}>
                          {t.itemType === 'PACKAGE' ? '📦 PACKAGE' : '🧪 TEST'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div>
                        <strong>{t.name}</strong>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{t.department}</div>
                      {t.itemType === 'PACKAGE' && t.includedTestCodes?.length ? (
                        <div style={{ fontSize: '0.72rem', color: '#1D4ED8', marginTop: '2px' }}>
                          Includes: {t.includedTestCodes.join(', ')}
                        </div>
                      ) : null}
                    </td>
                    <td>{t.labName || 'All Partner Hubs'}</td>
                    <td>
                      <span className="tube-cap-pill" style={{ background: tubeMeta.bgHex, color: tubeMeta.colorHex }}>
                        <span className="tube-cap-dot" style={{ background: tubeMeta.colorHex }} />
                        {tubeMeta.capColorName}
                      </span>
                    </td>
                    <td>
                      <span className="status-pill-blue">{formatLabel(t.temperatureRequirement)}</span>
                    </td>
                    <td>{t.tatHours} hrs</td>
                    <td>
                      <strong>{formatInr(t.b2bPriceInr)}</strong>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => onAddToBooking(cleanCode, t.ownerOrgId || t.labId)}
                      >
                        Add to Booking
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
  );
}

