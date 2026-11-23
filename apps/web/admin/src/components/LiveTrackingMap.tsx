import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { calculateHaversineDistanceKm } from '@diagnostic/shared';

interface LiveTrackingMapProps {
  pickupLocation: { latitude: number; longitude: number; address?: string; label?: string };
  dropLocation?: { latitude: number; longitude: number; address?: string; label?: string } | null;
  phleboLocation?: { latitude: number; longitude: number; name?: string; updatedAt?: string } | null;
  orderNumber?: string;
  heightPx?: number;
}

export type TrackingLayerType = 'GOOGLE_ROADS' | 'GOOGLE_SATELLITE' | 'GOOGLE_HYBRID';

const TRACKING_TILE_CONFIGS: Record<TrackingLayerType, { url: string; options: L.TileLayerOptions }> = {
  GOOGLE_ROADS: {
    url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    options: {
      subdomains: ['0', '1', '2', '3'],
      attribution: '&copy; Google Maps',
      maxZoom: 20,
    },
  },
  GOOGLE_SATELLITE: {
    url: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    options: {
      subdomains: ['0', '1', '2', '3'],
      attribution: '&copy; Google Maps Imagery',
      maxZoom: 20,
    },
  },
  GOOGLE_HYBRID: {
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    options: {
      subdomains: ['0', '1', '2', '3'],
      attribution: '&copy; Google Maps Hybrid',
      maxZoom: 20,
    },
  },
};

/**
 * Custom Animated Bike Courier Rider Marker with LabSetu Brand Logo on the Bag.
 */
function buildBikeCourierIcon(courierName?: string): L.DivIcon {
  const name = courierName || 'Live Courier';
  const html = `
    <div class="labsetu-bike-marker-wrapper">
      <div class="labsetu-bike-radar-ring"></div>
      <svg width="58" height="58" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 10px rgba(15,23,42,0.45));">
        <!-- Back Wheel -->
        <circle cx="16" cy="44" r="9" fill="#1E293B" stroke="#94A3B8" stroke-width="2.5"/>
        <circle cx="16" cy="44" r="4" fill="#F8FAFC" stroke="#64748B" stroke-width="1.5"/>

        <!-- Front Wheel -->
        <circle cx="48" cy="44" r="9" fill="#1E293B" stroke="#94A3B8" stroke-width="2.5"/>
        <circle cx="48" cy="44" r="4" fill="#F8FAFC" stroke="#64748B" stroke-width="1.5"/>

        <!-- Bike Frame & Body (Deep Navy + Teal) -->
        <path d="M16 44 L28 40 L44 32 L48 44" stroke="#0A2A5E" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M28 40 L34 46 L40 46" stroke="#0D9488" stroke-width="3" stroke-linecap="round"/>
        
        <!-- Front Fairing & Headlight Beam -->
        <path d="M42 32 L51 34 L49 39" stroke="#0D9488" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M53 34 L63 30 L63 38 Z" fill="rgba(254, 240, 138, 0.5)"/>
        <circle cx="52" cy="34" r="2.2" fill="#FACC15"/>

        <!-- Handlebars -->
        <path d="M42 27 L44 32 L40 31" stroke="#334155" stroke-width="2.2" stroke-linecap="round"/>

        <!-- Rider Legs & Torso (LabSetu Uniform) -->
        <path d="M28 35 L33 41 L35 44" stroke="#0A2A5E" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M26 31 L37 28 L42 29" stroke="#0A2A5E" stroke-width="5" stroke-linecap="round"/>
        <path d="M35 28 L42 29 L43 31" stroke="#0D9488" stroke-width="2.5" stroke-linecap="round"/>

        <!-- Rider Helmet in LabSetu Teal with Navy Visor -->
        <circle cx="36" cy="20" r="6.2" fill="#0D9488" stroke="#0A2A5E" stroke-width="1.6"/>
        <path d="M37 19 C39 19, 41 20, 42.5 22 C40 23, 38 23, 37 22 Z" fill="#0A2A5E"/>

        <!-- Courier Backpack with LabSetu Brand Mark on Bag -->
        <rect x="17" y="18" width="16" height="18" rx="3.5" fill="#FFFFFF" stroke="#0A2A5E" stroke-width="1.8"/>
        <!-- LabSetu Teal Canopy -->
        <path d="M19 20 H31 L32 23.5 C32 25, 30 25.5, 29 24.5 C28 25.5, 26 25.5, 25.5 24.5 C25 25.5, 23 25.5, 22 24.5 C21 25.5, 19.5 25, 19 23.5 Z" fill="#0D9488"/>
        <!-- Mini Test Tube -->
        <rect x="21.5" y="26.5" width="2.2" height="6.5" rx="1.1" fill="#0D9488"/>
        <!-- LabSetu Red Blood Drop -->
        <path d="M27 26.5 C28.5 28.5, 29.3 29.5, 29.3 30.5 C29.3 31.8, 28.3 32.7, 27 32.7 C25.7 32.7, 24.7 31.8, 24.7 30.5 C24.7 29.5, 25.5 28.5, 27 26.5 Z" fill="#DC2626"/>
      </svg>
      <div class="labsetu-bike-badge">
        <span>🏍️</span>
        <span>${name}</span>
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'labsetu-bike-marker-container',
    html,
    iconSize: [80, 80],
    iconAnchor: [40, 40],
    popupAnchor: [0, -32],
  });
}

function makePickupPin(): L.DivIcon {
  return L.divIcon({
    className: 'labsetu-map-pin-pickup',
    html: `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:#0D9488;transform:rotate(-45deg);border:3px solid #FFFFFF;box-shadow:0 3px 10px rgba(15,23,42,0.35);display:flex;align-items:center;justify-content:center;"><div style="width:10px;height:10px;border-radius:50%;background:#FFFFFF;transform:rotate(45deg);"></div></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

function makeDropPin(): L.DivIcon {
  return L.divIcon({
    className: 'labsetu-map-pin-drop',
    html: `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:#2563EB;transform:rotate(-45deg);border:3px solid #FFFFFF;box-shadow:0 3px 10px rgba(15,23,42,0.35);display:flex;align-items:center;justify-content:center;"><div style="width:10px;height:10px;border-radius:50%;background:#FFFFFF;transform:rotate(45deg);"></div></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

export function LiveTrackingMap({
  pickupLocation,
  dropLocation,
  phleboLocation,
  orderNumber,
  heightPx = 280,
}: LiveTrackingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);

  const [mapLayer, setMapLayer] = useState<TrackingLayerType>('GOOGLE_ROADS');

  const pLat = Number.isFinite(pickupLocation.latitude) ? pickupLocation.latitude : 19.124;
  const pLng = Number.isFinite(pickupLocation.longitude) ? pickupLocation.longitude : 72.866;

  const hasDrop = Boolean(
    dropLocation && Number.isFinite(dropLocation.latitude) && Number.isFinite(dropLocation.longitude)
  );
  const dLat = hasDrop && dropLocation ? dropLocation.latitude : pLat;
  const dLng = hasDrop && dropLocation ? dropLocation.longitude : pLng;

  const hasCourier = Boolean(
    phleboLocation &&
    Number.isFinite(phleboLocation.latitude) &&
    Number.isFinite(phleboLocation.longitude)
  );
  const cLat = hasCourier && phleboLocation ? phleboLocation.latitude : pLat;
  const cLng = hasCourier && phleboLocation ? phleboLocation.longitude : pLng;

  const routeDistanceKm = hasDrop
    ? Math.round(calculateHaversineDistanceKm(pLat, pLng, dLat, dLng) * 10) / 10
    : 0;

  const courierToDropKm =
    hasCourier && hasDrop
      ? Math.round(calculateHaversineDistanceKm(cLat, cLng, dLat, dLng) * 10) / 10
      : null;

  // 1. Initialize Leaflet map instance and base Google tile layer ONCE on mount
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [pLat, pLng],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });

    const tileConfig = TRACKING_TILE_CONFIGS[mapLayer] || TRACKING_TILE_CONFIGS.GOOGLE_ROADS;
    const initialTileLayer = L.tileLayer(tileConfig.url, tileConfig.options).addTo(map);
    currentTileLayerRef.current = initialTileLayer;

    const markersGroup = L.layerGroup().addTo(map);
    markersGroupRef.current = markersGroup;

    mapRef.current = map;

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 120);

    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      markersGroupRef.current = null;
      currentTileLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Smoothly update markers and route polyline without recreating or flashing the map
  useEffect(() => {
    const map = mapRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    const points: L.LatLngExpression[] = [];

    // 1. Pickup Origin Pin
    points.push([pLat, pLng]);
    L.marker([pLat, pLng], { icon: makePickupPin() })
      .addTo(markersGroup)
      .bindPopup(
        `<div style="font-family:sans-serif;font-size:12px;line-height:1.4;">
          <strong style="color:#0D9488;">🏥 Sample Collection Point</strong><br/>
          <strong>Facility:</strong> ${pickupLocation.label || 'Collection Clinic'}<br/>
          <span style="color:#64748B;">${pickupLocation.address || 'Pickup Point'}</span>
        </div>`
      );

    // 2. Live Phlebotomist Courier Rider Marker
    if (hasCourier && phleboLocation) {
      points.push([cLat, cLng]);
      L.marker([cLat, cLng], {
        icon: buildBikeCourierIcon(phleboLocation.name || 'LabSetu Courier'),
        zIndexOffset: 1000,
      })
        .addTo(markersGroup)
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;line-height:1.4;">
            <strong style="color:#0A2A5E;">🏍️ LabSetu On-Duty Phlebo Courier</strong><br/>
            <strong>Rider:</strong> ${phleboLocation.name || 'Courier'}<br/>
            <span style="color:#0F766E;">📍 Live Location Active</span>
          </div>`
        );
    }

    // 3. Drop Destination Pin
    if (hasDrop && dropLocation) {
      points.push([dLat, dLng]);
      L.marker([dLat, dLng], { icon: makeDropPin() })
        .addTo(markersGroup)
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;line-height:1.4;">
            <strong style="color:#2563EB;">🔬 Delivery Hub (Analysis)</strong><br/>
            <strong>Destination:</strong> ${dropLocation.label || 'Reference Lab'}<br/>
            <span style="color:#64748B;">${dropLocation.address || 'Lab Center'}</span>
          </div>`
        );
    }

    // 4. Dashed Polyline connecting the journey
    if (points.length > 1) {
      L.polyline(points, {
        color: '#0D9488',
        weight: 3.5,
        dashArray: '8, 8',
      }).addTo(markersGroup);

      map.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 15 });
    } else {
      map.setView([pLat, pLng], 13);
    }
  }, [
    pLat,
    pLng,
    dLat,
    dLng,
    cLat,
    cLng,
    hasDrop,
    hasCourier,
    pickupLocation.label,
    pickupLocation.address,
    dropLocation?.label,
    dropLocation?.address,
    phleboLocation?.name,
  ]);

  // Switch Tile Layer smoothly when mapLayer changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (currentTileLayerRef.current) {
      map.removeLayer(currentTileLayerRef.current);
    }
    const tileConfig = TRACKING_TILE_CONFIGS[mapLayer] || TRACKING_TILE_CONFIGS.GOOGLE_ROADS;
    const nextTileLayer = L.tileLayer(tileConfig.url, tileConfig.options).addTo(map);
    currentTileLayerRef.current = nextTileLayer;
    map.invalidateSize();
  }, [mapLayer]);

  const googleDirectionsUrl = hasDrop
    ? `https://www.google.com/maps/dir/?api=1&origin=${hasCourier && phleboLocation
      ? `${phleboLocation.latitude},${phleboLocation.longitude}`
      : `${pLat},${pLng}`
    }&destination=${dLat},${dLng}&travelmode=driving`
    : `https://www.google.com/maps/search/?api=1&query=${pLat},${pLng}`;

  return (
    <div className="interactive-map-card">
      <div className="interactive-map-header">
        <div>
          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
            🛰️ Live Courier Tracking Map {orderNumber ? `(${orderNumber})` : ''}
          </div>
          <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: '2px' }}>
            <strong style={{ color: '#0D9488' }}>🏥 Pickup</strong> •{' '}
            <strong style={{ color: '#0A2A5E' }}>🏍️ LabSetu Courier (Live)</strong> •{' '}
            <strong style={{ color: '#2563EB' }}>🔬 Delivery Lab</strong>
          </div>
        </div>

        {/* Live Interactive Map Layer Switcher for Live Tracking (Strict Google Maps) */}
        <div className="map-provider-toggle" role="tablist">
          <button
            type="button"
            className={`map-provider-btn ${mapLayer === 'GOOGLE_ROADS' ? 'active' : ''}`}
            onClick={() => setMapLayer('GOOGLE_ROADS')}
            title="Google Maps Road Layer"
          >
            🗺️ Google Maps
          </button>
          <button
            type="button"
            className={`map-provider-btn ${mapLayer === 'GOOGLE_SATELLITE' ? 'active' : ''}`}
            onClick={() => setMapLayer('GOOGLE_SATELLITE')}
            title="Google Maps Satellite Layer"
          >
            🛰️ Google Satellite
          </button>
          <button
            type="button"
            className={`map-provider-btn ${mapLayer === 'GOOGLE_HYBRID' ? 'active' : ''}`}
            onClick={() => setMapLayer('GOOGLE_HYBRID')}
            title="Google Maps Hybrid Layer"
          >
            🌐 Google Hybrid
          </button>
        </div>
      </div>

      {/* Live Map Canvas */}
      <div ref={containerRef} className="map-canvas" style={{ height: `${heightPx}px` }} />

      {/* Status & Navigation Bar */}
      <div className="map-coords-bar">
        <span>
          {hasDrop ? `Total Route: ${routeDistanceKm} km` : 'Pickup Location Verified'}
          {courierToDropKm !== null
            ? ` • 🏍️ Courier ${courierToDropKm} km from lab destination (~${Math.max(5, Math.round(courierToDropKm * 3.5))} min ETA)`
            : hasCourier
              ? ' • 🏍️ Courier is active on route'
              : ' • Dispatch broadcasting to nearby riders'}
        </span>
        <a
          href={googleDirectionsUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: '0.75rem',
            color: '#0D9488',
            fontWeight: 700,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          Open in Google Maps ↗
        </a>
      </div>
    </div>
  );
}
