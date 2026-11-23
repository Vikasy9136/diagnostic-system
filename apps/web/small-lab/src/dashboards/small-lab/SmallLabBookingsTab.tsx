import { useEffect, useState } from 'react';
import {
  formatInr,
  formatOrderStatus,
  OrderStatus,
  type PickupOrder,
  type SettlementRecord,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';

export interface SmallLabBookingsTabProps {
  myLabId: string;
  filteredOrders: PickupOrder[];
  settlements: SettlementRecord[];
  orderFilter: string;
  onOrderFilterChange: (filter: string) => void;
  payingSettlementId: string | null;
  onCreateNewBooking: () => void;
  onTrackCustody: (order: PickupOrder) => void;
  onPaySettlement: (settlement: SettlementRecord) => Promise<void>;
  onMarkPaidByLab?: (order: PickupOrder) => Promise<void> | void;
  onOpenSelfQc?: (order: PickupOrder) => void;
  onSelfStartRun?: (order: PickupOrder) => Promise<void>;
  onOpenSelfReport?: (order: PickupOrder) => void;
  onCancelOrder: (order: PickupOrder) => void;
  onRetryBroadcast?: (orderId: string, hikeInr: number) => Promise<void>;
  onPrintBarcodes?: (order: PickupOrder) => void;
  onViewPaymentSlip?: (order: PickupOrder) => void;
  onOpenOrderChat?: (order: PickupOrder) => void;
}

export function SmallLabBookingsTab({
  myLabId,
  filteredOrders,
  settlements,
  orderFilter,
  onOrderFilterChange,
  payingSettlementId,
  onCreateNewBooking,
  onTrackCustody,
  onPaySettlement,
  onMarkPaidByLab,
  onOpenSelfQc: _onOpenSelfQc,
  onSelfStartRun: _onSelfStartRun,
  onOpenSelfReport: _onOpenSelfReport,
  onCancelOrder,
  onRetryBroadcast,
  onPrintBarcodes,
  onViewPaymentSlip,
  onOpenOrderChat,
}: SmallLabBookingsTabProps) {
  const [nowTick, setNowTick] = useState(Date.now());
  const [previewPhotoOrder, setPreviewPhotoOrder] = useState<PickupOrder | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <div>
          <h2 className="card-top-title">All Dispatch Bookings ({filteredOrders.length})</h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
            Real-time tracking, live rider GPS, payment &amp; self-drop lab actions
          </p>
        </div>
        <select
          className="form-select"
          style={{ width: '210px' }}
          value={orderFilter}
          onChange={(e) => onOrderFilterChange(e.target.value)}
        >
          <option value="ALL">All Statuses</option>
          {Object.values(OrderStatus).map((st) => (
            <option key={st} value={st}>
              {formatOrderStatus(st)}
            </option>
          ))}
        </select>
      </div>

      {filteredOrders.length === 0 ? (
        <EmptyStateBox
          title="No Bookings Found"
          description="Dispatch a booking to track sample custody live from collection to verified PDF report."
          actionLabel="+ Create Booking"
          onAction={onCreateNewBooking}
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Booking ID</th>
                <th>Patient &amp; Tests</th>
                <th>Drop Destination</th>
                <th>Courier &amp; Live Proof</th>
                <th>OTP / Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((o) => {
                const stl = settlements.find((s) => s.orderId === o.id);
                const isSelfDrop = o.dropType === 'SELF_DROP' || o.targetLabId === myLabId;
                const cancellable =
                  o.status === OrderStatus.CREATED ||
                  o.status === OrderStatus.READY_FOR_PICKUP ||
                  o.status === OrderStatus.ASSIGNED_TO_PHLEBO;
                const needsOnlinePay =
                  stl && stl.paymentStatus !== 'PAID' && stl.grossAmountInr >= 1 && o.paymentStatus !== 'PAID';
                const isSearchingPhlebo = o.status === OrderStatus.READY_FOR_PICKUP && !o.phlebotomistId;
                const expiresMs = o.broadcastExpiresAt
                  ? new Date(o.broadcastExpiresAt).getTime()
                  : new Date(o.createdAt).getTime() + 45000;
                const remSec = Math.max(0, Math.floor((expiresMs - nowTick) / 1000));
                const isTimedOut = isSearchingPhlebo && remSec === 0;

                return (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.orderNumber}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {o.distanceKm ? `${o.distanceKm} km` : ''}{' '}
                        {o.broadcastRadiusKm ? `• ${o.broadcastRadiusKm}km pool` : ''}
                      </div>
                    </td>
                    <td>
                      <div>
                        <strong>{o.patient.pseudonym}</strong>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#475569' }}>
                        {o.specimens.map((s) => s.testCode).join(', ')}
                      </div>
                      {o.matchedPackageNames?.length ? (
                        <span className="package-match-pill" style={{ padding: '1px 6px', fontSize: '0.68rem', marginTop: '3px' }}>
                          🎁 {o.matchedPackageNames[0]}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <div>
                        <strong>{o.targetLabName}</strong>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {isSelfDrop
                          ? 'Self Lab Return'
                          : o.dropType === 'CUSTOM_ADDRESS'
                          ? 'Custom Address'
                          : 'Partner Large Lab'}
                      </div>
                    </td>
                    <td>
                      {isSearchingPhlebo ? (
                        <div>
                          {!isTimedOut ? (
                            <div>
                              <div style={{ color: '#0D9488', fontWeight: 700, fontSize: '0.82rem' }}>
                                📡 Searching Phlebo... ({remSec}s)
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                                {o.broadcastRadiusKm || 5} km Pool • Rider: {formatInr(o.courierFeeInr || 100)}
                                {o.surgeIncentiveInr ? ` (+₹${o.surgeIncentiveInr})` : ''}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ color: '#DC2626', fontWeight: 800, fontSize: '0.82rem' }}>
                                ⚠️ No Phlebo Found
                              </div>
                              <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                                  onClick={() => void onRetryBroadcast?.(o.id, 0)}
                                >
                                  🔄 Retry
                                </button>
                                <button
                                  type="button"
                                  className="btn-primary"
                                  style={{ padding: '2px 8px', fontSize: '0.72rem', background: '#D97706', borderColor: '#D97706' }}
                                  onClick={() => void onRetryBroadcast?.(o.id, 30)}
                                >
                                  ⚡ +₹30 Boost
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <strong>{o.phlebotomistName || 'Assigned Courier'}</strong>
                          <div style={{ fontSize: '0.72rem', color: '#0D9488', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px', alignItems: 'center' }}>
                            {o.phleboLiveLocation && <span>📍 Live GPS</span>}
                            {o.sampleCollectionPhotoUrl && (
                              <button
                                type="button"
                                style={{
                                  padding: '2px 8px',
                                  fontSize: '0.72rem',
                                  backgroundColor: '#ECFDF5',
                                  color: '#059669',
                                  border: '1px solid #A7F3D0',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontWeight: 600,
                                }}
                                onClick={() => setPreviewPhotoOrder(o)}
                              >
                                📷 View Sample Photo
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      {o.status === OrderStatus.CANCELLED ? (
                        <div>
                          <span style={{ color: '#94A3B8', fontSize: '0.78rem', textDecoration: 'line-through' }}>
                            {o.handoverOtp || '—'}
                          </span>
                          <div style={{ marginTop: '4px' }}>
                            <span
                              style={{
                                background: '#F1F5F9',
                                color: '#64748B',
                                border: '1px solid #E2E8F0',
                                borderRadius: '999px',
                                padding: '2px 8px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                              }}
                            >
                              Order Void
                            </span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <code>{o.handoverOtp || '—'}</code>
                          </div>
                          <div style={{ marginTop: '4px' }}>
                            <span
                              className={
                                o.paymentStatus === 'PAID' || stl?.paymentStatus === 'PAID'
                                  ? 'status-pill-green'
                                  : 'status-pill-amber'
                              }
                            >
                              {o.paymentStatus === 'PAID' || stl?.paymentStatus === 'PAID'
                                ? `Paid ${formatInr(stl?.grossAmountInr || o.totalAmountInr || 0)}`
                                : `Due ${formatInr(stl?.grossAmountInr || o.totalAmountInr || 0)}`}
                            </span>
                          </div>
                        </>
                      )}
                    </td>
                    <td>
                      {o.status === OrderStatus.CANCELLED ? (
                        <span
                          style={{
                            background: '#FEE2E2',
                            color: '#DC2626',
                            border: '1px solid #FECACA',
                            borderRadius: '999px',
                            padding: '3px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          ✕ Cancelled
                        </span>
                      ) : (
                        <span className="status-pill-blue">{formatOrderStatus(o.status)}</span>
                      )}
                    </td>
                    <td>
                      {o.status === OrderStatus.CANCELLED ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              color: '#94A3B8',
                              fontSize: '0.78rem',
                              fontStyle: 'italic',
                              fontWeight: 600,
                            }}
                          >
                            ✕ Cancelled (All Actions Disabled)
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {isSearchingPhlebo && (
                            <button
                              type="button"
                              className="btn-primary"
                              style={{ fontSize: '0.74rem', background: '#0D9488', borderColor: '#0D9488' }}
                              onClick={() => onTrackCustody(o)}
                            >
                              📡 Radar / Hike
                            </button>
                          )}
                          <button type="button" className="btn-secondary" onClick={() => onTrackCustody(o)}>
                            {o.phleboLiveLocation ? '📍 Live / Custody' : 'Track Custody'}
                          </button>
                          {o.phlebotomistId && onOpenOrderChat && (
                            <button
                              type="button"
                              className="btn-primary"
                              style={{
                                fontSize: '0.74rem',
                                padding: '4px 9px',
                                background: '#2563EB',
                                borderColor: '#2563EB',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: 'pointer',
                              }}
                              onClick={() => onOpenOrderChat(o)}
                            >
                              💬 Chat Phlebo
                            </button>
                          )}
                          {o.specimens && o.specimens.length > 0 && (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ fontSize: '0.74rem', color: '#0F172A', borderColor: '#CBD5E1' }}
                              onClick={() => onPrintBarcodes?.(o)}
                              title="Print tube barcode stickers for vacutainers"
                            >
                              🏷️ Print Stickers
                            </button>
                          )}
                          {onViewPaymentSlip && o.paymentStatus === 'PAID' && (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{
                                fontSize: '0.74rem',
                                color: '#0D9488',
                                borderColor: '#99F6E4',
                                background: '#F0FDFA',
                                fontWeight: 700,
                              }}
                              onClick={() => onViewPaymentSlip(o)}
                              title="View & Print Official PDF Payment Receipt"
                            >
                              🧾 Receipt Slip
                            </button>
                          )}
                          {needsOnlinePay && stl && (
                            <button
                              type="button"
                              className="btn-primary"
                              disabled={payingSettlementId === stl.id}
                              onClick={() => void onPaySettlement(stl)}
                            >
                              {payingSettlementId === stl.id ? 'Opening...' : 'Pay Now'}
                            </button>
                          )}
                          {o.paymentStatus !== 'PAID' && (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{
                                fontSize: '0.74rem',
                                color: '#0D9488',
                                borderColor: '#0D9488',
                                fontWeight: 600,
                              }}
                              onClick={() => void onMarkPaidByLab?.(o)}
                              title="Mark as settled directly with the lab so the phlebotomist will not collect payment from the patient."
                            >
                              ✓ Mark Paid by Lab
                            </button>
                          )}
                          {(o.status === OrderStatus.REPORT_UPLOADED || o.status === OrderStatus.COMPLETED) && (
                            <span
                              className="status-pill-green"
                              style={{ fontSize: '0.74rem', fontWeight: 700 }}
                            >
                              ✓ Report Ready
                            </span>
                          )}
                          {cancellable && (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ color: '#DC2626', borderColor: '#FECACA' }}
                              onClick={() => onCancelOrder(o)}
                            >
                              Cancel
                            </button>
                          )}
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

      {previewPhotoOrder && previewPhotoOrder.sampleCollectionPhotoUrl && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => setPreviewPhotoOrder(null)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #E2E8F0',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0F172A', fontWeight: 700 }}>
                  📸 Specimen Photo Proof • {previewPhotoOrder.orderNumber}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                  Patient: {previewPhotoOrder.patient.pseudonym} • Courier: {previewPhotoOrder.phlebotomistName || 'Field Phlebo'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhotoOrder(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '22px',
                  cursor: 'pointer',
                  color: '#64748B',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
              <img
                src={previewPhotoOrder.sampleCollectionPhotoUrl}
                alt={`Sample proof for ${previewPhotoOrder.orderNumber}`}
                style={{
                  maxWidth: '100%',
                  maxHeight: '420px',
                  borderRadius: '10px',
                  objectFit: 'contain',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  border: '1px solid #E2E8F0',
                }}
              />
              <div
                style={{
                  marginTop: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.8rem',
                  color: '#475569',
                  backgroundColor: '#FFFFFF',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <span>
                  Chiller Temp: <strong>{previewPhotoOrder.arrivalTemperatureCelsius ? `${previewPhotoOrder.arrivalTemperatureCelsius}°C` : '4.0°C'}</strong>
                </span>
                <a
                  href={previewPhotoOrder.sampleCollectionPhotoUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}
                >
                  Open Full Resolution ↗
                </a>
              </div>
            </div>

            <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #E2E8F0' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPreviewPhotoOrder(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
