import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  type CustodyEvent,
  formatOrderStatus,
  type PhlebotomistProfile,
  type PickupOrder,
  ROLE_LABELS,
  TUBE_METADATA,
  TubeType,
} from '@diagnostic/shared';
import { type FormatLabelFn } from '../../dashboards/types';
import { LiveTrackingMap } from '../LiveTrackingMap';
import { ModalFrame } from './ModalFrame';

interface OrderRadarHikeCountdownSectionProps {
  order: PickupOrder;
  onRetryBroadcast?: (orderId: string, hikeInr: number) => Promise<void>;
}

function OrderRadarHikeCountdownSection({
  order,
  onRetryBroadcast,
}: OrderRadarHikeCountdownSectionProps) {
  const [retrying, setRetrying] = useState(false);
  const [customHike, setCustomHike] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const expiresMs = order.broadcastExpiresAt
    ? new Date(order.broadcastExpiresAt).getTime()
    : new Date(order.createdAt).getTime() + 45000;
  const remSeconds = Math.max(0, Math.floor((expiresMs - nowTick) / 1000));
  const isTimedOut = remSeconds === 0;

  async function handleApplyRetry(hike: number = 0) {
    if (!onRetryBroadcast || !order) return;
    setRetrying(true);
    try {
      await onRetryBroadcast(order.id, hike);
      setCustomHike('');
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div
      style={{
        marginBottom: '14px',
        padding: '14px 16px',
        borderRadius: '12px',
        background: isTimedOut ? '#FEF2F2' : '#F0FDFA',
        border: isTimedOut ? '1px solid #FECACA' : '1px solid #99F6E4',
      }}
    >
      {isTimedOut ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991B1B', fontWeight: 800, fontSize: '0.94rem' }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <span>No Phlebotomist Found Nearby for Pickup</span>
          </div>
          <p style={{ margin: '4px 0 10px', fontSize: '0.78rem', color: '#7F1D1D' }}>
            No nearby rider accepted within 45 seconds. You can retry the broadcast or add a price hike incentive below to attract riders immediately.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={retrying}
              onClick={() => void handleApplyRetry(0)}
              style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            >
              {retrying ? 'Retrying...' : '🔄 Retry Search (45s)'}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={retrying}
              onClick={() => void handleApplyRetry(20)}
              style={{ fontSize: '0.78rem', padding: '6px 12px', background: '#D97706', borderColor: '#D97706' }}
            >
              ⚡ +₹20 Surge
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={retrying}
              onClick={() => void handleApplyRetry(30)}
              style={{ fontSize: '0.78rem', padding: '6px 12px', background: '#0D9488', borderColor: '#0D9488' }}
            >
              ⚡ +₹30 Surge
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={retrying}
              onClick={() => void handleApplyRetry(50)}
              style={{ fontSize: '0.78rem', padding: '6px 12px', background: '#2563EB', borderColor: '#2563EB' }}
            >
              ⚡ +₹50 Surge
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
              <input
                type="number"
                placeholder="Custom ₹"
                value={customHike}
                onChange={(e) => setCustomHike(e.target.value)}
                style={{ width: '85px', padding: '5px 8px', fontSize: '0.78rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
              />
              <button
                type="button"
                className="btn-secondary"
                disabled={retrying || !customHike}
                onClick={() => void handleApplyRetry(Number(customHike) || 0)}
                style={{ fontSize: '0.76rem', padding: '5px 10px' }}
              >
                Apply Hike
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0F766E', fontWeight: 800, fontSize: '0.92rem' }}>
              <span style={{ fontSize: '1.1rem' }}>📡</span>
              <span>Searching for Nearby Phlebotomists ({order.broadcastRadiusKm || 5} km Pool)</span>
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F766E' }}>
              ⏳ {remSeconds}s remaining
            </div>
          </div>
          <div style={{ marginTop: '8px', background: '#CCFBF1', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
            <div
              style={{
                background: '#0D9488',
                height: '100%',
                width: `${Math.min(100, Math.max(0, (remSeconds / 45) * 100))}%`,
                transition: 'width 1s linear',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '0.75rem', color: '#115E59' }}>
            <span>Dispatched to active riders nearby</span>
            <span style={{ fontWeight: 700 }}>
              Rider Payout: ₹{order.courierFeeInr || 100}{' '}
              {order.surgeIncentiveInr ? `(Base ₹${(order.baseCourierFeeInr || ((order.courierFeeInr || 100) - order.surgeIncentiveInr))} + ₹${order.surgeIncentiveInr} Surge)` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export interface OrderLiveTrackingModalProps {
  order: PickupOrder | null;
  onClose: () => void;
  titlePrefix?: string;
  headerBadges?: ReactNode;
  phleboCourier?: PhlebotomistProfile | null;
  nearbyPhlebos?: PhlebotomistProfile[];
  fallbackDropLat?: number;
  fallbackDropLng?: number;
  fallbackDropAddress?: string;
  showMetadataGrid?: boolean;
  showLiveRouteCard?: boolean;
  showSpecimensAudit?: boolean;
  custodyTimeline?: CustodyEvent[];
  formatLabel: FormatLabelFn;
  onRetryBroadcast?: (orderId: string, hikeInr: number) => Promise<void>;
}

export function OrderLiveTrackingModal({
  order,
  onClose,
  titlePrefix = 'Live Route & Custody Map',
  headerBadges,
  phleboCourier,
  nearbyPhlebos,
  fallbackDropLat = 19.076,
  fallbackDropLng = 72.8777,
  fallbackDropAddress,
  showMetadataGrid = false,
  showLiveRouteCard = true,
  showSpecimensAudit = true,
  custodyTimeline,
  formatLabel,
  onRetryBroadcast,
}: OrderLiveTrackingModalProps) {
  if (!order) return null;

  const isLookingForPhlebo =
    order.status === 'READY_FOR_PICKUP' && !order.phlebotomistId;

  const destLat = order.deliveryLocation?.latitude || fallbackDropLat;
  const destLng = order.deliveryLocation?.longitude || fallbackDropLng;

  const livePhleboPos = useMemo(() => {
    if (order.phleboLiveLocation?.latitude && order.phleboLiveLocation?.longitude) {
      return {
        latitude: order.phleboLiveLocation.latitude,
        longitude: order.phleboLiveLocation.longitude,
        name: order.phlebotomistName || order.phlebotomistId || 'Field Phlebotomist',
        updatedAt: order.phleboLiveLocation.updatedAt,
      };
    }
    if (phleboCourier?.latitude && phleboCourier?.longitude) {
      return {
        latitude: phleboCourier.latitude,
        longitude: phleboCourier.longitude,
        name: phleboCourier.name,
        updatedAt: phleboCourier.updatedAt,
      };
    }
    return null;
  }, [
    order.phleboLiveLocation?.latitude,
    order.phleboLiveLocation?.longitude,
    order.phleboLiveLocation?.updatedAt,
    order.phlebotomistName,
    order.phlebotomistId,
    phleboCourier?.latitude,
    phleboCourier?.longitude,
    phleboCourier?.name,
    phleboCourier?.updatedAt,
  ]);

  const memoizedPickup = useMemo(
    () => ({
      latitude: order.pickupLocation.latitude,
      longitude: order.pickupLocation.longitude,
      address: order.pickupLocation.address,
      label: order.smallLabName,
    }),
    [order.pickupLocation.latitude, order.pickupLocation.longitude, order.pickupLocation.address, order.smallLabName]
  );

  const memoizedDrop = useMemo(
    () => ({
      latitude: destLat,
      longitude: destLng,
      address: order.deliveryLocation?.address || fallbackDropAddress,
      label: order.targetLabName,
    }),
    [destLat, destLng, order.deliveryLocation?.address, fallbackDropAddress, order.targetLabName]
  );

  return (
    <ModalFrame
      open={Boolean(order)}
      onClose={onClose}
      title={`${titlePrefix} • ${order.orderNumber}`}
      subtitle={headerBadges}
      maxWidth="740px"
    >
      {isLookingForPhlebo && (
        <OrderRadarHikeCountdownSection
          order={order}
          onRetryBroadcast={onRetryBroadcast}
        />
      )}

      <div style={{ marginBottom: '12px' }}>
        <LiveTrackingMap
          orderNumber={order.orderNumber}
          pickupLocation={memoizedPickup}
          dropLocation={memoizedDrop}
          phleboLocation={livePhleboPos}
          nearbyPhlebos={nearbyPhlebos}
          heightPx={290}
        />
      </div>

      {showLiveRouteCard && (
        <div className="live-route-card" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                🏍️ {order.phlebotomistName || 'Broadcasting in 1–5 km Pool'}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                Status: <strong>{formatOrderStatus(order.status)}</strong> • Handover OTP: <code>{order.handoverOtp || 'Pending'}</code>
              </div>
              <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '2px' }}>
                Patient: <strong>{order.patient.pseudonym}</strong> &rarr; Drop: <strong>{order.targetLabName}</strong>
              </div>
              {order.phleboLiveLocation && (
                <div style={{ fontSize: '0.75rem', color: '#0F766E', marginTop: '4px' }}>
                  Live GPS: {order.phleboLiveLocation.latitude.toFixed(5)}, {order.phleboLiveLocation.longitude.toFixed(5)}
                  {order.phleboLiveLocation.updatedAt
                    ? ` • Updated ${new Date(order.phleboLiveLocation.updatedAt).toLocaleTimeString('en-IN')}`
                    : ''}
                </div>
              )}
            </div>
            {order.phleboLiveLocation && (
              <a
                className="btn-primary"
                style={{ textDecoration: 'none', fontSize: '0.78rem' }}
                href={`https://www.google.com/maps/dir/?api=1&origin=${order.phleboLiveLocation.latitude},${order.phleboLiveLocation.longitude}&destination=${destLat},${destLng}`}
                target="_blank"
                rel="noreferrer"
              >
                🗺️ Open Live Route Map
              </a>
            )}
          </div>
        </div>
      )}

      {showMetadataGrid && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            marginBottom: '12px',
            fontSize: '0.84rem',
            background: '#F8FAFC',
            padding: '12px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
          }}
        >
          <div>
            <strong>Pickup Hub:</strong> {order.smallLabName}
            <div style={{ color: '#64748B', fontSize: '0.76rem' }}>{order.pickupLocation.address}</div>
          </div>
          <div>
            <strong>Drop Hub:</strong> {order.targetLabName}
            <div style={{ color: '#64748B', fontSize: '0.76rem' }}>{order.deliveryLocation.address}</div>
          </div>
          <div><strong>Assigned Courier:</strong> {order.phlebotomistName || 'Broadcast Open (1–5 km)'}</div>
          <div><strong>Handover OTP:</strong> <code>{order.handoverOtp || 'Pending'}</code></div>
        </div>
      )}

      {(order.sampleCollectionPhotoUrl || order.phleboSelfieUrl) && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '0.84rem', fontWeight: 700, marginBottom: '8px', color: '#0F172A' }}>
            Verification Proof Photos (Sample &amp; Phlebotomist Attendance)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: order.sampleCollectionPhotoUrl && order.phleboSelfieUrl ? '1fr 1fr' : '1fr', gap: '12px' }}>
            {order.sampleCollectionPhotoUrl && (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>🧪 Specimen Tubes Proof</span>
                  <span style={{ fontSize: '0.7rem', color: '#15803D', background: '#DCFCE7', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>✓ Verified</span>
                </div>
                <a href={order.sampleCollectionPhotoUrl} target="_blank" rel="noreferrer" title="Click to enlarge specimen photo">
                  <img
                    src={order.sampleCollectionPhotoUrl}
                    alt="Collected sample proof"
                    className="sample-proof-thumb"
                    style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  />
                </a>
              </div>
            )}
            {order.phleboSelfieUrl && (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>🤳 Phlebotomist Site Selfie</span>
                  <span style={{ fontSize: '0.7rem', color: '#15803D', background: '#DCFCE7', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>✓ Present At Site</span>
                </div>
                <a href={order.phleboSelfieUrl} target="_blank" rel="noreferrer" title="Click to enlarge phlebo selfie">
                  <img
                    src={order.phleboSelfieUrl}
                    alt="Phlebotomist site selfie"
                    className="sample-proof-thumb"
                    style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {showSpecimensAudit && order.specimens.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px' }}>
            Tube &amp; Barcode Validation
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {order.specimens.map((s) => {
              const tm = TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
              return (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.78rem',
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}
                >
                  <div>
                    <span className="tube-cap-pill" style={{ background: tm.bgHex, color: tm.colorHex, marginRight: '8px' }}>
                      <span className="tube-cap-dot" style={{ background: tm.colorHex }} />
                      {tm.capColorName}
                    </span>
                    <strong>{s.testCode}</strong> — <code>{s.scannedBarcode || s.barcode}</code>
                  </div>
                  <span className={s.validationStatus === 'VERIFIED' ? 'status-pill-green' : s.validationStatus === 'MISMATCH' ? 'status-pill-red' : 'status-pill-amber'}>
                    {s.validationStatus === 'VERIFIED' ? 'Matched ✓' : s.validationStatus === 'MISMATCH' ? 'Tube Mismatch' : 'Pending Scan'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {custodyTimeline && (
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px' }}>
            Chain of Custody History
          </div>
          {custodyTimeline.length === 0 ? (
            <p style={{ color: '#64748B', fontSize: '0.84rem' }}>No custody scan events yet.</p>
          ) : (
            custodyTimeline.map((ev) => (
              <div
                key={ev.id}
                style={{
                  padding: '10px 12px',
                  borderLeft: '3px solid #0D9488',
                  background: '#F8FAFC',
                  borderRadius: '6px',
                  marginBottom: '8px',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{formatLabel(ev.eventType)}</div>
                <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                  {ev.operatorName} ({ROLE_LABELS[ev.operatorRole] || formatLabel(ev.operatorRole)}){' '}
                  {ev.temperatureCelsius !== undefined ? `• Temp: ${ev.temperatureCelsius}°C` : ''}
                </div>
                {ev.notes && <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '2px' }}>{ev.notes}</div>}
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
                  {new Date(ev.timestamp).toLocaleString('en-IN')}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </ModalFrame>
  );
}
