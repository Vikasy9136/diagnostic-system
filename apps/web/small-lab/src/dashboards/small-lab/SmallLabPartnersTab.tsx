import { useEffect, useState } from 'react';
import {
  type CollectionCentreRecord,
  formatInr,
  type LabFacility,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';
import {
  discoverOfferingsApi,
  type DiscoveryOfferingItem,
  listCollectionCentresApi,
} from '../../services/workflowApiService';

export interface SmallLabPartnersTabProps {
  largeLabs: LabFacility[];
  onStartBooking?: (labId: string, testCode?: string) => void;
}

export function SmallLabPartnersTab({
  largeLabs,
  onStartBooking,
}: SmallLabPartnersTabProps) {
  const [search, setSearch] = useState('');
  const [itemType, setItemType] = useState<'ALL' | 'TEST' | 'PACKAGE'>('ALL');
  const [department, setDepartment] = useState('ALL');
  const [maxPrice, setMaxPrice] = useState('');
  const [maxTatHours, setMaxTatHours] = useState('');
  const [city, setCity] = useState('');
  const [sort, setSort] = useState<'LOWEST_PRICE' | 'HIGHEST_PRICE' | 'FASTEST_TAT'>('LOWEST_PRICE');
  const [offerings, setOfferings] = useState<DiscoveryOfferingItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedLab, setSelectedLab] = useState<LabFacility | null>(null);
  const [centres, setCentres] = useState<CollectionCentreRecord[]>([]);
  const [loadingCentres, setLoadingCentres] = useState(false);

  async function runDiscovery() {
    setLoading(true);
    try {
      const res = await discoverOfferingsApi({
        search: search.trim() || undefined,
        itemType,
        department,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        maxTatHours: maxTatHours ? Number(maxTatHours) : undefined,
        city: city.trim() || undefined,
        sort,
        limit: 40,
      });
      setOfferings(res.items || []);
    } catch {
      setOfferings([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runDiscovery();
  }, [sort, itemType, department]);

  async function inspectLab(lab: LabFacility) {
    setSelectedLab(lab);
    setLoadingCentres(true);
    try {
      const list = await listCollectionCentresApi(lab.id);
      setCentres(list);
    } catch {
      setCentres([]);
    } finally {
      setLoadingCentres(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div className="chart-card-modern">
        <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 className="card-top-title">Find Testing Labs — Lowest Price &amp; TAT Discovery</h2>
            <p style={{ fontSize: '0.78rem', color: '#64748B' }}>
              Compare verified Reference Labs, test-wise pricing, multi-test packages, and collection centres.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select
              className="form-select"
              style={{ width: '170px' }}
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
            >
              <option value="LOWEST_PRICE">Sort: Lowest Price</option>
              <option value="FASTEST_TAT">Sort: Fastest TAT</option>
              <option value="HIGHEST_PRICE">Sort: Highest Price</option>
            </select>
            <button type="button" className="btn-primary" onClick={() => void runDiscovery()} disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
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
            className="form-input"
            placeholder="Search test, package, or lab..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runDiscovery();
            }}
          />
          <select
            className="form-select"
            value={itemType}
            onChange={(e) => setItemType(e.target.value as any)}
          >
            <option value="ALL">Tests &amp; Packages</option>
            <option value="TEST">Individual Tests</option>
            <option value="PACKAGE">Health Packages</option>
          </select>
          <select
            className="form-select"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="ALL">All Departments</option>
            <option value="Hematology">Hematology</option>
            <option value="Biochemistry">Biochemistry</option>
            <option value="Immunology">Immunology</option>
            <option value="Molecular">Molecular</option>
            <option value="Microbiology">Microbiology</option>
            <option value="Preventive Health">Preventive Health</option>
          </select>
          <input
            type="number"
            className="form-input"
            placeholder="Max Price (₹)"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
          <input
            type="number"
            className="form-input"
            placeholder="Max TAT (hrs)"
            value={maxTatHours}
            onChange={(e) => setMaxTatHours(e.target.value)}
          />
          <input
            className="form-input"
            placeholder="City (e.g. Mumbai)"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>

        {offerings.length === 0 ? (
          <EmptyStateBox
            title="No Matching Approved Offerings"
            description="Adjust your price, TAT, or search filters to view verified Large Lab offerings."
          />
        ) : (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>Test / Package</th>
                  <th>Verified Reference Lab</th>
                  <th>B2B Price</th>
                  <th>MRP &amp; TAT</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {offerings.map((item) => (
                  <tr key={`${item.largeLabId}-${item.id}`}>
                    <td>
                      <strong>{item.name}</strong> ({item.code})
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                        <span className={item.itemType === 'PACKAGE' ? 'package-match-pill' : 'status-pill-blue'}>
                          {item.itemType === 'PACKAGE' ? 'PACKAGE' : 'TEST'}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{item.department}</span>
                      </div>
                      {item.itemType === 'PACKAGE' && item.includedTestCodes && (
                        <div style={{ fontSize: '0.72rem', color: '#1D4ED8', marginTop: '2px' }}>
                          Includes: {item.includedTestCodes.join(', ')}
                        </div>
                      )}
                    </td>
                    <td>
                      <strong>{item.largeLabName}</strong>
                      <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                        {item.largeLabCity} • ★ {item.largeLabRating.toFixed(1)} • {item.collectionCentresCount} centres
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: '#059669', fontSize: '0.96rem' }}>
                        {formatInr(item.b2bPriceInr)}
                      </strong>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      <div>MRP: {formatInr(item.mrpInr)}</div>
                      <div style={{ color: '#64748B' }}>TAT: {item.tatHours}h</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {onStartBooking && (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => onStartBooking(item.largeLabId, item.code)}
                          >
                            Book Now →
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="chart-card-modern">
        <div className="card-top-header">
          <h2 className="card-top-title">Verified Reference Hubs &amp; Collection Centres ({largeLabs.length})</h2>
        </div>
        {largeLabs.length === 0 ? (
          <EmptyStateBox title="No Reference Hubs Verified Yet" description="Admin verification will publish approved reference hubs here." />
        ) : (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>Hub Name</th>
                  <th>City &amp; NABL</th>
                  <th>Cutoff</th>
                  <th>Rating</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {largeLabs.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.name}</strong>
                      <div style={{ fontSize: '0.74rem', color: '#64748B' }}>{l.address}</div>
                    </td>
                    <td>
                      {l.city} • {l.nablNumber || 'NABL Verified'}
                    </td>
                    <td>{l.cutoffWindow || '08:30 PM'}</td>
                    <td>★ {(l.rating ?? 4.8).toFixed(1)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" className="btn-secondary" onClick={() => void inspectLab(l)}>
                          View Centres
                        </button>
                        {onStartBooking && (
                          <button type="button" className="btn-primary" onClick={() => onStartBooking(l.id)}>
                            Select Lab
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedLab && (
          <div style={{ marginTop: '16px', padding: '14px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <strong>{selectedLab.name} — Collection Centres &amp; Contact Persons</strong>
              <button type="button" className="btn-secondary" onClick={() => setSelectedLab(null)}>
                Close
              </button>
            </div>
            {loadingCentres ? (
              <div style={{ fontSize: '0.84rem', color: '#64748B' }}>Loading collection centres...</div>
            ) : centres.length === 0 ? (
              <div style={{ fontSize: '0.84rem', color: '#64748B' }}>
                Main Lab Hub: {selectedLab.address}, {selectedLab.city} ({selectedLab.phone || 'Contact via portal'})
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {centres.map((c) => (
                  <div key={c.id} style={{ background: '#FFF', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.82rem' }}>
                    <strong>{c.name}</strong> — {c.address}, {c.city} ({c.pincode})
                    <div style={{ color: '#475569', marginTop: '2px' }}>
                      Contact: {c.contactPersonName} ({c.contactPhone}) • Hours: {c.operatingHours}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
