import { type ReactNode, useMemo } from 'react';
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

export interface OrderLiveTrackingModalProps {
  order: PickupOrder | null;
  onClose: () => void;
  titlePrefix?: string;
  headerBadges?: ReactNode;
  phleboCourier?: PhlebotomistProfile | null;
  fallbackDropLat?: number;
  fallbackDropLng?: number;
  fallbackDropAddress?: string;
  showMetadataGrid?: boolean;
  showLiveRouteCard?: boolean;
  showSpecimensAudit?: boolean;
  custodyTimeline?: CustodyEvent[];
  formatLabel: FormatLabelFn;
}

export function OrderLiveTrackingModal({
  order,
  onClose,
  titlePrefix = 'Live Route & Custody Map',
  headerBadges,
  phleboCourier,
  fallbackDropLat = 19.076,
  fallbackDropLng = 72.8777,
  fallbackDropAddress,
  showMetadataGrid = false,
  showLiveRouteCard = true,
  showSpecimensAudit = true,
  custodyTimeline,
  formatLabel,
}: OrderLiveTrackingModalProps) {
  if (!order) return null;

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
      <div style={{ marginBottom: '12px' }}>
        <LiveTrackingMap
          orderNumber={order.orderNumber}
          pickupLocation={memoizedPickup}
          dropLocation={memoizedDrop}
          phleboLocation={livePhleboPos}
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

      {order.sampleCollectionPhotoUrl && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>
            Phlebotomist Sample Collection Photo Proof
          </div>
          <a href={order.sampleCollectionPhotoUrl} target="_blank" rel="noreferrer">
            <img
              src={order.sampleCollectionPhotoUrl}
              alt="Collected sample proof"
              className="sample-proof-thumb"
              style={{ maxWidth: '100%', maxHeight: '220px', borderRadius: '10px', border: '1px solid #CBD5E1' }}
            />
          </a>
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
