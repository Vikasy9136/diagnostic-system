import { calculateHaversineDistanceKm, type LabFacility } from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';

export interface SmallLabPartnersTabProps {
  verifiedLargeLabs: LabFacility[];
  pickupLat: number;
  pickupLng: number;
  onSelectPartnerForBooking: (orgLabId: string, centerLabId: string) => void;
}

export function SmallLabPartnersTab({
  verifiedLargeLabs,
  pickupLat,
  pickupLng,
  onSelectPartnerForBooking,
}: SmallLabPartnersTabProps) {
  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <h2 className="card-top-title">
          Verified Reference Hubs &amp; Collection Centers ({verifiedLargeLabs.length})
        </h2>
      </div>
      {verifiedLargeLabs.length === 0 ? (
        <EmptyStateBox
          title="No Verified Large Reference Labs Yet"
          description="Partner reference labs and branch centers appear here once added and verified by Platform Admin."
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Center ID</th>
                <th>Facility Name &amp; Hierarchy</th>
                <th>City, Pincode &amp; Distance</th>
                <th>NABL / Accreditation</th>
                <th>Cutoff Window</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {verifiedLargeLabs.map((l) => {
                const distKm =
                  typeof l.latitude === 'number' && typeof l.longitude === 'number'
                    ? calculateHaversineDistanceKm(pickupLat, pickupLng, l.latitude, l.longitude)
                    : null;
                return (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.id}</strong>
                    </td>
                    <td>
                      <div>
                        <strong>{l.name}</strong>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {l.centerType === 'COLLECTION_CENTER'
                          ? `Branch of ${l.parentLabName || l.parentLabId}`
                          : 'Main Reference Hub HQ'}
                      </div>
                    </td>
                    <td>
                      <div>
                        {l.city} {l.pincode ? `• ${l.pincode}` : ''}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#0D9488' }}>
                        {l.address || 'Main Hub'} {distKm !== null ? `• ${distKm} km away` : ''}
                      </div>
                    </td>
                    <td>{l.nablNumber || 'NABL ISO 15189'}</td>
                    <td>{l.cutoffWindow || '08:30 PM Daily'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => onSelectPartnerForBooking(l.parentLabId || l.id, l.id)}
                      >
                        Send Sample →
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
