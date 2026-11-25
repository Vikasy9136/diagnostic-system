import {
  formatOrderStatus,
  type LabFacility,
  type PickupOrder,
  TUBE_METADATA,
  TubeType,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';

export interface LargeLabIncomingTabProps {
  isBranchCenter: boolean;
  orgCenters: LabFacility[];
  centerFilter: string;
  onCenterFilterChange: (nextFilter: string) => void;
  filteredOrders: PickupOrder[];
  onTrackOrder: (order: PickupOrder) => void;
  onOpenQc: (order: PickupOrder) => void;
  onOpenChat?: (order: PickupOrder) => void;
}

export function LargeLabIncomingTab({
  isBranchCenter,
  orgCenters,
  centerFilter,
  onCenterFilterChange,
  filteredOrders,
  onTrackOrder,
  onOpenQc,
  onOpenChat,
}: LargeLabIncomingTabProps) {
  return (
    <div className="chart-card-modern">
      <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 className="card-top-title">
            Incoming Cold-Chain Receiving &amp; QC Accessioning ({filteredOrders.length})
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
            Monitor live phlebotomist GPS, inspect uploaded sample photos &amp; tube barcode scans, and log cooler temperature (2°C – 8°C)
          </p>
        </div>
        {!isBranchCenter && orgCenters.length > 1 && (
          <select
            className="form-select"
            style={{ width: '210px' }}
            value={centerFilter}
            onChange={(e) => onCenterFilterChange(e.target.value)}
          >
            <option value="ALL_ORG">All Org Centers</option>
            {orgCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {filteredOrders.length === 0 ? (
        <EmptyStateBox
          title="No Incoming Orders"
          description="Dispatched bookings destined for your Reference Lab appear here in real time."
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Booking ID &amp; Center</th>
                <th>Source Lab &amp; Patient</th>
                <th>Tubes &amp; Barcode Checks</th>
                <th>Phlebotomist / Proof</th>
                <th>Temp (°C)</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((o) => {
                const verifiedCount = o.specimens.filter((s) => s.validationStatus === 'VERIFIED').length;
                const mismatchCount = o.specimens.filter((s) => s.validationStatus === 'MISMATCH').length;
                return (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.orderNumber}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{o.targetLabName}</div>
                    </td>
                    <td>
                      <div>{o.smallLabName}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{o.patient.pseudonym}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {o.specimens.map((s) => {
                          const tubeMeta = TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                          return (
                            <div
                              key={s.id}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '0.76rem' }}
                            >
                              <span className="tube-cap-pill" style={{ background: tubeMeta.bgHex, color: tubeMeta.colorHex }}>
                                <span className="tube-cap-dot" style={{ background: tubeMeta.colorHex }} />
                                {s.testCode}
                              </span>
                              <code>{s.scannedBarcode || s.barcode}</code>
                              {s.validationStatus === 'VERIFIED' && <span style={{ color: '#059669', fontWeight: 700 }}>✓</span>}
                              {s.validationStatus === 'MISMATCH' && (
                                <span style={{ color: '#DC2626', fontWeight: 700 }}>⚠ Mismatch</span>
                              )}
                            </div>
                          );
                        })}
                        {o.specimens.length > 0 && (
                          <div style={{ fontSize: '0.7rem', color: mismatchCount > 0 ? '#DC2626' : '#64748B' }}>
                            {verifiedCount}/{o.specimens.length} tubes barcode-verified
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div>
                        <strong>{o.phlebotomistName || 'Broadcasting'}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {(o.phleboLiveLocation || o.sampleCollectionPhotoUrl) && (
                          <button
                            type="button"
                            className="btn-link-muted"
                            style={{ fontSize: '0.74rem' }}
                            onClick={() => onTrackOrder(o)}
                          >
                            {o.sampleCollectionPhotoUrl ? '📷 Photo & 📍 Live' : '📍 Live Location'}
                          </button>
                        )}
                        {o.phlebotomistId && onOpenChat && (
                          <button
                            type="button"
                            className="btn-primary"
                            style={{
                              fontSize: '0.72rem',
                              padding: '3px 8px',
                              background: '#2563EB',
                              borderColor: '#2563EB',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            onClick={() => onOpenChat(o)}
                          >
                            💬 Chat
                            {(o.chatUnreadByLargeLab || 0) > 0 && (
                              <span
                                style={{
                                  background: '#EF4444',
                                  color: '#FFFFFF',
                                  borderRadius: '999px',
                                  fontSize: '0.66rem',
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                }}
                              >
                                {o.chatUnreadByLargeLab}
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td>{o.arrivalTemperatureCelsius !== undefined ? `${o.arrivalTemperatureCelsius}°C` : 'Pending Check'}</td>
                    <td>
                      <span className="status-pill-blue">{formatOrderStatus(o.status)}</span>
                    </td>
                    <td>
                      <button type="button" className="btn-primary" onClick={() => onOpenQc(o)}>
                        Perform QC
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
