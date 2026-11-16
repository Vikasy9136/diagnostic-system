import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LOCALITY_GPS_PRESETS } from '@diagnostic/shared';

export interface MapSelectedLocation {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  label?: string;
  placeId?: string;
}

interface InteractiveMapPickerProps {
  latitude: number;
  longitude: number;
  onChange: (loc: MapSelectedLocation) => void;
  title?: string;
  subtitle?: string;
  radiusKm?: number;
  radiusColor?: string;
  heightPx?: number;
  showPresets?: boolean;
  searchPlaceholder?: string;
}

export type MapLayerType = 'GOOGLE_ROADS' | 'GOOGLE_SATELLITE' | 'GOOGLE_HYBRID';

export interface GeocodeSearchResult {
  id: string;
  source: 'GOOGLE';
  title: string;
  subtitle: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
  pincode?: string;
  placeId?: string;
}

const GOOGLE_TILE_CONFIGS: Record<MapLayerType, { url: string; options: L.TileLayerOptions }> = {
  GOOGLE_ROADS: {
    url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    options: {
      subdomains: ['0', '1', '2', '3'],
      attribution: '&copy; Google Maps',
      maxZoom: 21,
    },
  },
  GOOGLE_SATELLITE: {
    url: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    options: {
      subdomains: ['0', '1', '2', '3'],
      attribution: '&copy; Google Maps Imagery',
      maxZoom: 21,
    },
  },
  GOOGLE_HYBRID: {
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    options: {
      subdomains: ['0', '1', '2', '3'],
      attribution: '&copy; Google Maps Hybrid',
      maxZoom: 21,
    },
  },
};

function buildGooglePinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'labsetu-map-pin-wrapper',
    html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:#0D9488;transform:rotate(-45deg);border:2.5px solid #FFFFFF;box-shadow:0 3px 12px rgba(15,23,42,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:10px;height:10px;border-radius:50%;background:#FFFFFF;transform:rotate(45deg);"></div></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  });
}

/**
 * Searches places strictly via Google Maps Platform APIs:
 * 1. Native Google Maps JavaScript Places Autocomplete / Geocoder (if SDK is loaded).
 * 2. API Proxy (/api/v1/maps/places & /api/v1/maps/geocode) backed by Google Maps Key.
 */
async function searchPlacesGoogleOnly(query: string): Promise<GeocodeSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  // Direct GPS coordinates check (e.g. "19.124, 72.866")
  const coordMatch = q.match(/^([-+]?[0-9]*\.?[0-9]+)[\s,]+([-+]?[0-9]*\.?[0-9]+)$/);
  if (coordMatch) {
    const lat = Math.round(parseFloat(coordMatch[1]) * 1000000) / 1000000;
    const lon = Math.round(parseFloat(coordMatch[2]) * 1000000) / 1000000;
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return [
        {
          id: `coord-${lat}-${lon}`,
          source: 'GOOGLE',
          title: `Google GPS Pin: ${lat}, ${lon}`,
          subtitle: 'Direct Geographic Pinpoint',
          fullAddress: `Coordinates: ${lat}, ${lon}`,
          latitude: lat,
          longitude: lon,
        },
      ];
    }
  }

  const results: GeocodeSearchResult[] = [];

  // Match local presets if matched
  LOCALITY_GPS_PRESETS.forEach((preset) => {
    if (preset.label.toLowerCase().includes(q.toLowerCase())) {
      results.push({
        id: `preset-${preset.label}`,
        source: 'GOOGLE',
        title: preset.label,
        subtitle: `${preset.city || 'India'} • Quick Locality Preset`,
        fullAddress: `${preset.label}, ${preset.city || 'India'}`,
        latitude: preset.latitude,
        longitude: preset.longitude,
        city: preset.city,
      });
    }
  });

  // Attempt 1: Browser Native Google Maps Places Autocomplete SDK
  const win = window as unknown as {
    google?: {
      maps?: {
        places?: {
          AutocompleteService: new () => {
            getPlacePredictions: (
              req: { input: string; componentRestrictions?: { country: string } },
              cb: (
                preds: Array<{
                  place_id: string;
                  description: string;
                  structured_formatting?: { main_text: string; secondary_text?: string };
                }> | null,
                status: string
              ) => void
            ) => void;
          };
          PlacesService: new (attrContainer: HTMLDivElement) => {
            getDetails: (
              req: { placeId: string; fields: string[] },
              cb: (
                place: {
                  geometry?: { location?: { lat: () => number; lng: () => number } };
                  formatted_address?: string;
                  address_components?: Array<{ long_name: string; types: string[] }>;
                } | null,
                status: string
              ) => void
            ) => void;
          };
        };
        Geocoder: new () => {
          geocode: (
            req: { address?: string; placeId?: string; componentRestrictions?: { country: string } },
            cb: (
              res: Array<{
                formatted_address: string;
                geometry: { location: { lat: () => number; lng: () => number } };
                address_components?: Array<{ long_name: string; types: string[] }>;
              }> | null,
              status: string
            ) => void
          ) => void;
        };
      };
    };
  };

  let sdkSuccess = false;
  if (win.google?.maps?.places?.AutocompleteService) {
    try {
      const acService = new win.google.maps.places.AutocompleteService();
      const predictions = await new Promise<Array<{
        place_id: string;
        description: string;
        structured_formatting?: { main_text: string; secondary_text?: string };
      }>>((resolve) => {
        const timeout = setTimeout(() => resolve([]), 2500);
        acService.getPlacePredictions(
          { input: q, componentRestrictions: { country: 'in' } },
          (preds, status) => {
            clearTimeout(timeout);
            if (status === 'OK' && Array.isArray(preds)) {
              resolve(preds);
            } else {
              resolve([]);
            }
          }
        );
      });

      if (predictions.length > 0 && win.google.maps.Geocoder) {
        const geocoder = new win.google.maps.Geocoder();
        const topPreds = predictions.slice(0, 5);

        for (const pred of topPreds) {
          await new Promise<void>((resItem) => {
            const timeout = setTimeout(() => resItem(), 1800);
            geocoder.geocode({ placeId: pred.place_id }, (geoResults, geoStatus) => {
              clearTimeout(timeout);
              if (geoStatus === 'OK' && geoResults && geoResults[0]) {
                const item = geoResults[0];
                const lat = Math.round(item.geometry.location.lat() * 1000000) / 1000000;
                const lon = Math.round(item.geometry.location.lng() * 1000000) / 1000000;
                let city: string | undefined;
                let state: string | undefined;
                let pincode: string | undefined;

                item.address_components?.forEach((c) => {
                  if (c.types.includes('locality')) city = c.long_name;
                  if (c.types.includes('administrative_area_level_1')) state = c.long_name;
                  if (c.types.includes('postal_code')) {
                    pincode = c.long_name.replace(/\D/g, '').slice(0, 6);
                  }
                });

                results.push({
                  id: pred.place_id,
                  source: 'GOOGLE',
                  title: pred.structured_formatting?.main_text || pred.description.split(',')[0],
                  subtitle: pred.structured_formatting?.secondary_text || item.formatted_address,
                  fullAddress: item.formatted_address,
                  latitude: lat,
                  longitude: lon,
                  city,
                  state,
                  pincode,
                  placeId: pred.place_id,
                });
              }
              resItem();
            });
          });
        }
        if (results.length > 0) sdkSuccess = true;
      }
    } catch {
      // Fall through to API proxy
    }
  }

  // Attempt 2: Backend Proxy to Google Maps Places Autocomplete & Geocoding
  if (!sdkSuccess || results.length < 2) {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
      const acRes = await fetch(`${apiUrl}/maps/places?input=${encodeURIComponent(q)}`);
      if (acRes.ok) {
        const acData = (await acRes.json()) as {
          predictions?: Array<{
            place_id: string;
            description: string;
            structured_formatting?: { main_text: string; secondary_text?: string };
          }>;
        };
        const preds = acData.predictions || [];

        for (const pred of preds.slice(0, 5)) {
          try {
            const geoRes = await fetch(`${apiUrl}/maps/geocode?place_id=${encodeURIComponent(pred.place_id)}`);
            if (geoRes.ok) {
              const geoData = (await geoRes.json()) as {
                results?: Array<{
                  formatted_address: string;
                  geometry: { location: { lat: number; lng: number } };
                  address_components?: Array<{ long_name: string; types: string[] }>;
                }>;
              };
              const gItem = geoData.results?.[0];
              if (gItem) {
                const lat = Math.round(gItem.geometry.location.lat * 1000000) / 1000000;
                const lon = Math.round(gItem.geometry.location.lng * 1000000) / 1000000;
                let city: string | undefined;
                let state: string | undefined;
                let pincode: string | undefined;

                gItem.address_components?.forEach((c) => {
                  if (c.types.includes('locality')) city = c.long_name;
                  if (c.types.includes('administrative_area_level_1')) state = c.long_name;
                  if (c.types.includes('postal_code')) {
                    pincode = c.long_name.replace(/\D/g, '').slice(0, 6);
                  }
                });

                results.push({
                  id: pred.place_id,
                  source: 'GOOGLE',
                  title: pred.structured_formatting?.main_text || pred.description.split(',')[0],
                  subtitle: pred.structured_formatting?.secondary_text || gItem.formatted_address,
                  fullAddress: gItem.formatted_address,
                  latitude: lat,
                  longitude: lon,
                  city,
                  state,
                  pincode,
                  placeId: pred.place_id,
                });
              }
            }
          } catch {
            // Ignore single geocode failure
          }
        }
      }
    } catch {
      // Ignore proxy error
    }
  }

  // Deduplicate and filter invalid coordinates
  const valid = results.filter((r) => r.latitude !== 0 && r.longitude !== 0);
  const deduplicated: GeocodeSearchResult[] = [];
  const seen: Array<{ lat: number; lng: number }> = [];

  for (const item of valid) {
    const isDup = seen.some(
      (s) => Math.abs(s.lat - item.latitude) < 0.0006 && Math.abs(s.lng - item.longitude) < 0.0006
    );
    if (!isDup) {
      seen.push({ lat: item.latitude, lng: item.longitude });
      deduplicated.push(item);
    }
  }

  return deduplicated.slice(0, 8);
}

/**
 * Reverse-geocodes coordinates strictly via Google Maps Geocoding API
 */
async function reverseGeocodeGoogle(lat: number, lng: number): Promise<Partial<MapSelectedLocation> | null> {
  // 1. Try Browser SDK first
  const win = window as unknown as {
    google?: {
      maps?: {
        Geocoder: new () => {
          geocode: (
            req: { location: { lat: number; lng: number } },
            cb: (
              res: Array<{
                formatted_address: string;
                address_components?: Array<{ long_name: string; types: string[] }>;
              }> | null,
              status: string
            ) => void
          ) => void;
        };
      };
    };
  };

  if (win.google?.maps?.Geocoder) {
    try {
      const geocoder = new win.google.maps.Geocoder();
      return await new Promise<Partial<MapSelectedLocation> | null>((resolve) => {
        const timeout = setTimeout(() => resolve(null), 2500);
        geocoder.geocode({ location: { lat, lng } }, (res, status) => {
          clearTimeout(timeout);
          if (status === 'OK' && res && res[0]) {
            const item = res[0];
            let city: string | undefined;
            let state: string | undefined;
            let pincode: string | undefined;

            item.address_components?.forEach((c) => {
              if (c.types.includes('locality')) city = c.long_name;
              if (c.types.includes('administrative_area_level_1')) state = c.long_name;
              if (c.types.includes('postal_code')) {
                pincode = c.long_name.replace(/\D/g, '').slice(0, 6);
              }
            });

            const parts = item.formatted_address.split(',');
            resolve({
              address: item.formatted_address,
              city,
              state,
              pincode,
              label: parts[0]?.trim() || 'Pinned Location',
            });
          } else {
            resolve(null);
          }
        });
      });
    } catch {
      // Fall through to API proxy
    }
  }

  // 2. Try API Proxy
  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    const res = await fetch(`${apiUrl}/maps/geocode?latlng=${lat},${lng}`);
    if (res.ok) {
      const data = (await res.json()) as {
        results?: Array<{
          formatted_address: string;
          address_components?: Array<{ long_name: string; types: string[] }>;
        }>;
      };
      const item = data.results?.[0];
      if (item) {
        let city: string | undefined;
        let state: string | undefined;
        let pincode: string | undefined;

        item.address_components?.forEach((c) => {
          if (c.types.includes('locality')) city = c.long_name;
          if (c.types.includes('administrative_area_level_1')) state = c.long_name;
          if (c.types.includes('postal_code')) {
            pincode = c.long_name.replace(/\D/g, '').slice(0, 6);
          }
        });

        const parts = item.formatted_address.split(',');
        return {
          address: item.formatted_address,
          city,
          state,
          pincode,
          label: parts[0]?.trim() || 'Pinned Location',
        };
      }
    }
  } catch {
    // Return null
  }

  return null;
}

export function InteractiveMapPicker({
  latitude,
  longitude,
  onChange,
  title = 'Pin Exact Location (Google Maps)',
  subtitle = 'Search any street, area or pincode, click on map, or drag the Google pin',
  radiusKm,
  radiusColor = '#0D9488',
  heightPx = 250,
  showPresets = true,
  searchPlaceholder = 'Search Google Maps (e.g. Lilavati Hospital, Andheri West, 400053)...',
}: InteractiveMapPickerProps) {
  const safeLat = Number.isFinite(latitude) && Math.abs(latitude) > 0.001 ? latitude : 19.124;
  const safeLng = Number.isFinite(longitude) && Math.abs(longitude) > 0.001 ? longitude : 72.866;

  const [mapLayer, setMapLayer] = useState<MapLayerType>('GOOGLE_ROADS');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodeSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [locatingGps, setLocatingGps] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchRunIdRef = useRef<number>(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Debounce search query for real-time live typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reverse Geocoding strictly with Google Maps
  async function reverseGeocodeAndEmit(lat: number, lng: number, fallbackLabel?: string) {
    const roundedLat = Math.round(lat * 1000000) / 1000000;
    const roundedLng = Math.round(lng * 1000000) / 1000000;

    // Immediately notify parent with exact coordinates
    onChangeRef.current({
      latitude: roundedLat,
      longitude: roundedLng,
      ...(fallbackLabel ? { label: fallbackLabel } : {}),
    });

    const gInfo = await reverseGeocodeGoogle(roundedLat, roundedLng);
    if (gInfo) {
      onChangeRef.current({
        latitude: roundedLat,
        longitude: roundedLng,
        address: gInfo.address,
        city: gInfo.city,
        state: gInfo.state,
        pincode: gInfo.pincode,
        label: gInfo.label || fallbackLabel || 'Pinned Location',
      });
      if (gInfo.label) {
        setSearchQuery(gInfo.label);
      }
    }
  }

  // Execute Google Maps search
  async function executeSearch(queryText: string) {
    const q = queryText.trim();
    if (!q || q.length < 2) {
      setSearchResults([]);
      setSearchStatus(null);
      setSearching(false);
      return;
    }

    const currentRunId = ++searchRunIdRef.current;
    setSearching(true);
    setSearchStatus(null);

    try {
      const items = await searchPlacesGoogleOnly(q);
      if (searchRunIdRef.current !== currentRunId) return;

      setSearchResults(items);
      setShowDropdown(items.length > 0);
      if (items.length === 0) {
        setSearchStatus(`No Google Maps results found for "${q}". Try another landmark or PIN.`);
      }
    } catch {
      if (searchRunIdRef.current === currentRunId) {
        setSearchStatus('Search request failed. Please check network.');
      }
    } finally {
      if (searchRunIdRef.current === currentRunId) {
        setSearching(false);
      }
    }
  }

  // Trigger search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      void executeSearch(debouncedQuery);
    } else {
      setSearchResults([]);
      setShowDropdown(false);
      setSearchStatus(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize strictly Google Maps Canvas
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      currentTileLayerRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [safeLat, safeLng],
      zoom: 14,
      zoomControl: true,
      attributionControl: true,
    });

    const tileConfig = GOOGLE_TILE_CONFIGS[mapLayer] || GOOGLE_TILE_CONFIGS.GOOGLE_ROADS;
    const initialTileLayer = L.tileLayer(tileConfig.url, tileConfig.options).addTo(map);
    currentTileLayerRef.current = initialTileLayer;

    // Draggable Pin marker
    const marker = L.marker([safeLat, safeLng], {
      draggable: true,
      icon: buildGooglePinIcon(),
    }).addTo(map);
    markerRef.current = marker;

    marker.bindPopup(
      `<div style="font-family:sans-serif;font-size:12px;line-height:1.4;">
        <strong style="color:#0D9488;">📍 Google Maps Location</strong><br/>
        <span>${safeLat.toFixed(4)}, ${safeLng.toFixed(4)}</span><br/>
        <span style="color:#64748B;font-size:11px;">Drag or click map to change point</span>
      </div>`
    );

    // Marker drag event -> reverse geocode with Google Maps
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      const roundedLat = Math.round(pos.lat * 1000000) / 1000000;
      const roundedLng = Math.round(pos.lng * 1000000) / 1000000;
      void reverseGeocodeAndEmit(roundedLat, roundedLng);
    });

    // Map click event -> move marker and reverse geocode with Google Maps
    map.on('click', (e: L.LeafletMouseEvent) => {
      const roundedLat = Math.round(e.latlng.lat * 1000000) / 1000000;
      const roundedLng = Math.round(e.latlng.lng * 1000000) / 1000000;
      marker.setLatLng([roundedLat, roundedLng]);
      map.panTo([roundedLat, roundedLng]);
      void reverseGeocodeAndEmit(roundedLat, roundedLng);
    });

    // Optional service radius circle
    if (radiusKm && radiusKm > 0) {
      circleRef.current = L.circle([safeLat, safeLng], {
        radius: radiusKm * 1000,
        color: radiusColor,
        fillColor: radiusColor,
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6, 6',
      }).addTo(map);
    }

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 120);

    mapRef.current = map;
    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      currentTileLayerRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external coordinates
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const currentMarkerPos = markerRef.current.getLatLng();
    const distDiff =
      Math.abs(currentMarkerPos.lat - safeLat) + Math.abs(currentMarkerPos.lng - safeLng);

    if (distDiff > 0.00005) {
      markerRef.current.setLatLng([safeLat, safeLng]);
      mapRef.current.panTo([safeLat, safeLng]);
      if (circleRef.current) {
        circleRef.current.setLatLng([safeLat, safeLng]);
      }
    }
  }, [safeLat, safeLng]);

  // Switch Tile Layer smoothly when mapLayer changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (currentTileLayerRef.current) {
      map.removeLayer(currentTileLayerRef.current);
    }
    const tileConfig = GOOGLE_TILE_CONFIGS[mapLayer] || GOOGLE_TILE_CONFIGS.GOOGLE_ROADS;
    const nextTileLayer = L.tileLayer(tileConfig.url, tileConfig.options).addTo(map);
    currentTileLayerRef.current = nextTileLayer;
    map.invalidateSize();
  }, [mapLayer]);

  // Radius updates
  useEffect(() => {
    if (!mapRef.current) return;
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }
    if (radiusKm && radiusKm > 0) {
      circleRef.current = L.circle([safeLat, safeLng], {
        radius: radiusKm * 1000,
        color: radiusColor,
        fillColor: radiusColor,
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6, 6',
      }).addTo(mapRef.current);
    }
  }, [radiusKm, radiusColor, safeLat, safeLng]);

  // Select place item from Google Maps search results
  function handleSelectResult(item: GeocodeSearchResult) {
    setShowDropdown(false);
    setSearchQuery(item.title);
    setSearchResults([]);

    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([item.latitude, item.longitude]);
      mapRef.current.flyTo([item.latitude, item.longitude], 16, { duration: 1.0 });
      if (circleRef.current) {
        circleRef.current.setLatLng([item.latitude, item.longitude]);
      }
    }

    onChangeRef.current({
      latitude: item.latitude,
      longitude: item.longitude,
      address: item.fullAddress,
      city: item.city,
      state: item.state,
      pincode: item.pincode,
      label: item.title,
      placeId: item.placeId,
    });
  }

  // Locate device current location via browser Geolocation API
  function handleLocateMe() {
    if (!navigator.geolocation) {
      setSearchStatus('Geolocation is not supported by your browser.');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingGps(false);
        const lat = Math.round(pos.coords.latitude * 1000000) / 1000000;
        const lng = Math.round(pos.coords.longitude * 1000000) / 1000000;

        if (mapRef.current && markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
          mapRef.current.flyTo([lat, lng], 16, { duration: 1.2 });
          if (circleRef.current) {
            circleRef.current.setLatLng([lat, lng]);
          }
        }
        void reverseGeocodeAndEmit(lat, lng, 'Current Location');
      },
      (err) => {
        setLocatingGps(false);
        setSearchStatus(`Could not fetch current GPS location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div ref={containerRef} className="interactive-map-card">
      {/* Header with Title and Layer Toggle */}
      <div className="interactive-map-header">
        <div>
          <div className="interactive-map-title">{title}</div>
          <div className="interactive-map-subtitle">{subtitle}</div>
        </div>

        {/* Google Map Layer Switcher */}
        <div className="map-provider-toggle" role="tablist">
          <button
            type="button"
            className={`map-provider-btn ${mapLayer === 'GOOGLE_ROADS' ? 'active' : ''}`}
            onClick={() => setMapLayer('GOOGLE_ROADS')}
            title="Google Maps Standard Road Layer"
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
            title="Google Maps Satellite with Road Labels"
          >
            🌐 Google Hybrid
          </button>
        </div>
      </div>

      {/* Google Maps Search Bar */}
      <div className="map-search-bar" style={{ position: 'relative' }}>
        <div className="map-search-input-wrap" style={{ flex: 1, position: 'relative' }}>
          <span className="map-search-icon">🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            className="map-search-input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!showDropdown && e.target.value.trim().length >= 2) {
                setShowDropdown(true);
              }
            }}
            onFocus={() => {
              if (searchResults.length > 0) {
                setShowDropdown(true);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void executeSearch(searchQuery);
              } else if (e.key === 'Escape') {
                setShowDropdown(false);
              }
            }}
            placeholder={searchPlaceholder}
            aria-label="Search Google Maps"
          />
          {searchQuery && (
            <button
              type="button"
              className="map-search-clear-btn"
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setShowDropdown(false);
                setSearchStatus(null);
                searchInputRef.current?.focus();
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
          {searching && <span className="map-search-spinner" title="Searching Google Maps..." />}
        </div>

        <button
          type="button"
          className="btn-primary"
          style={{
            fontSize: '0.8rem',
            padding: '7px 14px',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#0D9488',
          }}
          onClick={() => void executeSearch(searchQuery)}
          disabled={searching || !searchQuery.trim()}
        >
          {searching ? 'Searching...' : 'Search Google Maps'}
        </button>

        <button
          type="button"
          className="map-gps-btn"
          onClick={handleLocateMe}
          disabled={locatingGps}
          title="Detect Current GPS Location"
        >
          {locatingGps ? '⏳ Locating...' : '🎯 My Location'}
        </button>

        {/* Live Search Autocomplete Dropdown Popover */}
        {showDropdown && searchResults.length > 0 && (
          <div className="map-search-dropdown" role="listbox">
            <div
              style={{
                padding: '6px 12px',
                background: '#F1F5F9',
                borderBottom: '1px solid #E2E8F0',
                fontSize: '0.72rem',
                color: '#475569',
                fontWeight: 700,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>📍 Powered by Google Maps</span>
              <span>{searchResults.length} Results</span>
            </div>
            {searchResults.map((item) => (
              <div
                key={item.id}
                className="map-search-result-item"
                onClick={() => handleSelectResult(item)}
                role="option"
                aria-selected={false}
              >
                <div className="map-result-icon">📍</div>
                <div className="map-result-info">
                  <div className="map-result-title">
                    <span>{item.title}</span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: '#E0F2FE',
                        color: '#0369A1',
                      }}
                    >
                      Google Maps
                    </span>
                  </div>
                  <div className="map-result-subtitle">{item.subtitle}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline Search Feedback / Error Message */}
      {searchStatus && (
        <div className="map-search-status-bar">
          <span>ℹ️ {searchStatus}</span>
          <button type="button" onClick={() => setSearchStatus(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Quick Locality Presets */}
      {showPresets && (
        <div className="map-presets-bar">
          <span className="map-presets-label">Popular Mumbai Hubs:</span>
          {LOCALITY_GPS_PRESETS.slice(0, 5).map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="map-preset-pill"
              onClick={() => {
                setSearchQuery(preset.label);
                if (mapRef.current && markerRef.current) {
                  markerRef.current.setLatLng([preset.latitude, preset.longitude]);
                  mapRef.current.flyTo([preset.latitude, preset.longitude], 15);
                  if (circleRef.current) {
                    circleRef.current.setLatLng([preset.latitude, preset.longitude]);
                  }
                }
                void reverseGeocodeAndEmit(preset.latitude, preset.longitude, preset.label);
              }}
            >
              📍 {preset.label}
            </button>
          ))}
        </div>
      )}

      {/* Map Leaflet/Google Tile Canvas */}
      <div ref={mapContainerRef} className="map-canvas" style={{ height: `${heightPx}px` }} />

      {/* Footer Bar with Active GPS and Helpful Tip */}
      <div className="map-coords-bar">
        <span>
          <strong>Google Maps GPS:</strong> {safeLat.toFixed(5)}, {safeLng.toFixed(5)}
          {radiusKm ? ` • Broadcast Radius: ${radiusKm} km` : ''}
        </span>
        <span style={{ color: '#0D9488', fontWeight: 600 }}>
          💡 Click anywhere on map or drag pin to update Google address
        </span>
      </div>
    </div>
  );
}
