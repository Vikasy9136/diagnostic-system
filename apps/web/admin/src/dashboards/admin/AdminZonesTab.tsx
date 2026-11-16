import { type FormEvent, useMemo, useState } from 'react';
import {
  LOCALITY_GPS_PRESETS,
  type PhlebotomistProfile,
  type ServiceZoneRecord,
} from '@diagnostic/shared';
import { InteractiveMapPicker } from '../../components/InteractiveMapPicker';
import {
  deleteServiceZone,
  saveServiceZone,
  toggleServiceZoneActive,
} from '../../services/firestoreService';
import {
  createServiceZoneApi,
  deleteServiceZoneApi,
  updateServiceZoneApi,
} from '../../services/orgApiService';
import { type AlertTriggerFn } from '../types';

export interface ZonePresetItem {
  code: string;
  name: string;
  city: string;
  state: string;
  pincodes: string[];
  lat: number;
  lng: number;
  radiusKm: number;
  phase: 'PILOT' | 'EXPANSION';
}

const EXPANSION_CITY_PRESETS: ZonePresetItem[] = [
  // Mumbai
  {
    code: 'MUM-01',
    name: 'Andheri West / Powai / Chandivali Cluster',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincodes: ['400053', '400058', '400059', '400072', '400076', '400093'],
    lat: 19.124,
    lng: 72.866,
    radiusKm: 6,
    phase: 'PILOT',
  },
  {
    code: 'MUM-BKC',
    name: 'Bandra–Kurla Complex (BKC) & Santacruz',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincodes: ['400050', '400051', '400055', '400098'],
    lat: 19.0653,
    lng: 72.8681,
    radiusKm: 5,
    phase: 'EXPANSION',
  },
  {
    code: 'MUM-DDR',
    name: 'Dadar & Lower Parel Medical Corridor',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincodes: ['400013', '400014', '400018', '400028'],
    lat: 19.0178,
    lng: 72.8478,
    radiusKm: 5,
    phase: 'EXPANSION',
  },
  {
    code: 'MUM-BOR',
    name: 'Borivali–Kandivali North Cluster',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincodes: ['400066', '400067', '400092', '400101'],
    lat: 19.2307,
    lng: 72.8567,
    radiusKm: 6,
    phase: 'EXPANSION',
  },
  // Patna (Bihar Expansion)
  {
    code: 'PAT-01',
    name: 'Kankarbagh Medical Area & Old Bypass',
    city: 'Patna',
    state: 'Bihar',
    pincodes: ['800020', '800026'],
    lat: 25.5941,
    lng: 85.1588,
    radiusKm: 5,
    phase: 'EXPANSION',
  },
  {
    code: 'PAT-02',
    name: 'Patliputra & Boring Road Commercial Zone',
    city: 'Patna',
    state: 'Bihar',
    pincodes: ['800001', '800013'],
    lat: 25.6207,
    lng: 85.1095,
    radiusKm: 5,
    phase: 'EXPANSION',
  },
  {
    code: 'PAT-03',
    name: 'Civil Lines & Gandhi Maidan Central Hub',
    city: 'Patna',
    state: 'Bihar',
    pincodes: ['800004', '800005'],
    lat: 25.6154,
    lng: 85.1415,
    radiusKm: 4,
    phase: 'EXPANSION',
  },
  {
    code: 'PAT-04',
    name: 'Rajendra Nagar & Kadamkuan Sector',
    city: 'Patna',
    state: 'Bihar',
    pincodes: ['800003', '800016'],
    lat: 25.6022,
    lng: 85.1539,
    radiusKm: 5,
    phase: 'EXPANSION',
  },
  // Delhi / NCR
  {
    code: 'DEL-01',
    name: 'South Delhi & AIIMS Medical Belt',
    city: 'Delhi',
    state: 'Delhi',
    pincodes: ['110016', '110017', '110029', '110049'],
    lat: 28.5672,
    lng: 77.21,
    radiusKm: 6,
    phase: 'EXPANSION',
  },
  {
    code: 'DEL-02',
    name: 'Connaught Place & Central Diagnostics',
    city: 'Delhi',
    state: 'Delhi',
    pincodes: ['110001', '110002', '110005'],
    lat: 28.6315,
    lng: 77.2167,
    radiusKm: 5,
    phase: 'EXPANSION',
  },
  // Thane & Navi Mumbai
  {
    code: 'THN-01',
    name: 'Thane West & Ghodbunder Diagnostics Belt',
    city: 'Thane',
    state: 'Maharashtra',
    pincodes: ['400601', '400602', '400604', '400607', '400615'],
    lat: 19.2183,
    lng: 72.9781,
    radiusKm: 7,
    phase: 'EXPANSION',
  },
  {
    code: 'NMV-01',
    name: 'Vashi–Nerul–Belapur Expansion Sector',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    pincodes: ['400614', '400703', '400705', '400706'],
    lat: 19.0745,
    lng: 72.9978,
    radiusKm: 7,
    phase: 'EXPANSION',
  },
  // Pune
  {
    code: 'PUN-01',
    name: 'Kothrud & Deccan Gymkhana Cluster',
    city: 'Pune',
    state: 'Maharashtra',
    pincodes: ['411004', '411029', '411038'],
    lat: 18.5074,
    lng: 73.8077,
    radiusKm: 6,
    phase: 'EXPANSION',
  },
];

export interface AdminZonesTabProps {
  serviceZones: ServiceZoneRecord[];
  phlebotomists?: PhlebotomistProfile[];
  actorEmail: string;
  bearerToken?: string;
  onShowAlert: AlertTriggerFn;
}

export function AdminZonesTab({
  serviceZones,
  phlebotomists = [],
  actorEmail,
  bearerToken,
  onShowAlert,
}: AdminZonesTabProps) {
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>('ALL');
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneCode, setZoneCode] = useState('MUM-02');
  const [zoneName, setZoneName] = useState('');
  const [zoneCity, setZoneCity] = useState('Mumbai');
  const [zoneState, setZoneState] = useState('Maharashtra');
  const [zoneRadiusKm, setZoneRadiusKm] = useState<number>(6);
  const [zonePincodes, setZonePincodes] = useState<string[]>([]);
  const [singlePinInput, setSinglePinInput] = useState('');
  const [zonePincodesText, setZonePincodesText] = useState('');
  const [zoneLat, setZoneLat] = useState<number>(LOCALITY_GPS_PRESETS[3].latitude);
  const [zoneLng, setZoneLng] = useState<number>(LOCALITY_GPS_PRESETS[3].longitude);
  const [zoneLaunchPhase, setZoneLaunchPhase] = useState<'PILOT' | 'EXPANSION' | 'PAUSED'>('EXPANSION');
  const [zoneNotes, setZoneNotes] = useState('');
  const [savingZone, setSavingZone] = useState(false);

  // Distinct cities list from current zones + presets
  const availableCities = useMemo(() => {
    const citySet = new Set<string>();
    serviceZones.forEach((z) => {
      if (z.city?.trim()) citySet.add(z.city.trim());
    });
    EXPANSION_CITY_PRESETS.forEach((p) => citySet.add(p.city));
    return Array.from(citySet).sort();
  }, [serviceZones]);

  // Grouped metrics per city
  const citySummaryMatrix = useMemo(() => {
    const map = new Map<
      string,
      {
        city: string;
        state: string;
        totalAreas: number;
        activeAreas: number;
        pincodes: Set<string>;
        fleetCount: number;
      }
    >();

    serviceZones.forEach((z) => {
      const c = z.city?.trim() || 'Unknown';
      const existing = map.get(c) || {
        city: c,
        state: z.state || '',
        totalAreas: 0,
        activeAreas: 0,
        pincodes: new Set<string>(),
        fleetCount: 0,
      };
      existing.totalAreas += 1;
      if (z.isActive) existing.activeAreas += 1;
      (z.pincodes || []).forEach((p) => existing.pincodes.add(p));
      const fleet = phlebotomists.filter(
        (ph) =>
          ph.assignedZoneId === z.id ||
          ph.assignedCity?.toLowerCase() === c.toLowerCase() ||
          (ph.assignedZoneCode && ph.assignedZoneCode.toUpperCase() === z.zoneCode.toUpperCase())
      ).length;
      existing.fleetCount += fleet;
      map.set(c, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.activeAreas - a.activeAreas);
  }, [serviceZones, phlebotomists]);

  // Filtered zones list based on chosen city
  const filteredZones = useMemo(() => {
    if (selectedCityFilter === 'ALL') return serviceZones;
    return serviceZones.filter(
      (z) => z.city?.trim().toLowerCase() === selectedCityFilter.toLowerCase()
    );
  }, [serviceZones, selectedCityFilter]);

  // Total unique pincodes across active zones
  const totalCoveredPincodes = useMemo(() => {
    return new Set(serviceZones.filter((z) => z.isActive).flatMap((z) => z.pincodes || [])).size;
  }, [serviceZones]);

  function resetZoneEditor() {
    setEditingZoneId(null);
    const nextNum = serviceZones.length + 1;
    const defaultPrefix = zoneCity.toUpperCase().slice(0, 3) || 'EXP';
    setZoneCode(`${defaultPrefix}-0${nextNum}`);
    setZoneName('');
    setZoneCity('Mumbai');
    setZoneState('Maharashtra');
    setZoneRadiusKm(6);
    setZonePincodes([]);
    setZonePincodesText('');
    setSinglePinInput('');
    setZoneLat(LOCALITY_GPS_PRESETS[3].latitude);
    setZoneLng(LOCALITY_GPS_PRESETS[3].longitude);
    setZoneLaunchPhase('EXPANSION');
    setZoneNotes('');
  }

  function applyPreset(preset: ZonePresetItem) {
    setEditingZoneId(null);
    setZoneCode(preset.code);
    setZoneName(preset.name);
    setZoneCity(preset.city);
    setZoneState(preset.state);
    setZoneRadiusKm(preset.radiusKm);
    setZonePincodes(preset.pincodes);
    setZonePincodesText(preset.pincodes.join(', '));
    setZoneLat(preset.lat);
    setZoneLng(preset.lng);
    setZoneLaunchPhase(preset.phase);
    setZoneNotes(`Standard ${preset.city} Area Expansion Cluster`);
    setSelectedCityFilter(preset.city);
  }

  function handleAddSinglePin() {
    const clean = singlePinInput.replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) {
      onShowAlert({
        variant: 'warning',
        title: 'Invalid Pincode',
        message: 'Indian postal pincodes must contain exactly 6 numeric digits.',
      });
      return;
    }
    if (!zonePincodes.includes(clean)) {
      const updated = [...zonePincodes, clean];
      setZonePincodes(updated);
      setZonePincodesText(updated.join(', '));
    }
    setSinglePinInput('');
  }

  function handleRemovePin(pinToRemove: string) {
    const updated = zonePincodes.filter((p) => p !== pinToRemove);
    setZonePincodes(updated);
    setZonePincodesText(updated.join(', '));
  }

  function handlePincodeTextBlur() {
    const parsed = Array.from(
      new Set(
        zonePincodesText
          .split(/[,\s]+/)
          .map((p) => p.replace(/\D/g, '').slice(0, 6))
          .filter((p) => p.length === 6)
      )
    );
    setZonePincodes(parsed);
    setZonePincodesText(parsed.join(', '));
  }

  async function handleSaveZone(e: FormEvent) {
    e.preventDefault();
    if (!zoneName.trim() || !zoneCity.trim()) {
      onShowAlert({
        variant: 'warning',
        title: 'Missing Required Fields',
        message: 'City and Area / Zone Display Name are mandatory for area expansion.',
      });
      return;
    }
    setSavingZone(true);
    try {
      // Gather combined pincodes
      const combinedPins = Array.from(
        new Set([
          ...zonePincodes,
          ...zonePincodesText
            .split(/[,\s]+/)
            .map((p) => p.replace(/\D/g, '').slice(0, 6))
            .filter((p) => p.length === 6),
        ])
      );

      const saved = await saveServiceZone(
        {
          id: editingZoneId || '',
          zoneCode: zoneCode.trim().toUpperCase(),
          name: zoneName.trim(),
          city: zoneCity.trim(),
          state: zoneState.trim() || undefined,
          centerLatitude: Number(zoneLat),
          centerLongitude: Number(zoneLng),
          radiusKm: Number(zoneRadiusKm) || 6,
          pincodes: combinedPins,
          isActive: zoneLaunchPhase !== 'PAUSED',
          launchPhase: zoneLaunchPhase,
          notes: zoneNotes.trim() || undefined,
        },
        actorEmail
      );

      // Best effort API sync with backend
      if (editingZoneId) {
        void updateServiceZoneApi(saved.id, saved, bearerToken).catch(() => {});
      } else {
        void createServiceZoneApi(saved, bearerToken).catch(() => {});
      }

      resetZoneEditor();
      onShowAlert({
        variant: 'success',
        title: `Service Area Synced (${saved.zoneCode})`,
        message: `${saved.city} — ${saved.name} (${saved.pincodes?.length || 0} pincodes • ${saved.radiusKm} km radius • ${saved.isActive ? 'ACTIVE' : 'PAUSED'}) is now saved.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Zone Save Error',
        message: (err as Error).message || 'Could not save service expansion zone.',
      });
    } finally {
      setSavingZone(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner */}
      <div className="privacy-shield-banner" style={{ marginBottom: 0 }}>
        <div>
          <strong>Hierarchical Area Expansion by City &amp; Pincode</strong>
          <div style={{ fontSize: '0.82rem', marginTop: '4px', lineHeight: 1.5 }}>
            Manage service rollout hierarchically: <strong>City &rarr; Area Corridor &rarr; Pincodes</strong>.
            Booking orders from diagnostic labs check both <strong>Pincode coverage list</strong> and <strong>GPS flight distance radius</strong>.
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="kpi-row">
        <div className="kpi-card-modern">
          <div className="kpi-body">
            <span className="kpi-title">Active Expansion Cities</span>
            <span className="kpi-main-number">{citySummaryMatrix.filter((c) => c.activeAreas > 0).length}</span>
            <span className="kpi-sub-split">
              {citySummaryMatrix.map((c) => c.city).slice(0, 4).join(', ') || 'Mumbai, Patna, Delhi'}
            </span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-body">
            <span className="kpi-title">Active Area Hubs</span>
            <span className="kpi-main-number">{serviceZones.filter((z) => z.isActive).length}</span>
            <span className="kpi-sub-split">{serviceZones.filter((z) => !z.isActive).length} paused/planned</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-body">
            <span className="kpi-title">Enrolled Pincodes</span>
            <span className="kpi-main-number">{totalCoveredPincodes}</span>
            <span className="kpi-sub-split">Instant Pincode-level match verification</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-body">
            <span className="kpi-title">Phlebo Fleet Deployed</span>
            <span className="kpi-main-number">{phlebotomists.length}</span>
            <span className="kpi-sub-split">Mapped across active city zones</span>
          </div>
        </div>
      </div>

      {/* City Filter Pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>
          Filter by City:
        </span>
        <button
          type="button"
          className={selectedCityFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}
          style={{ fontSize: '0.78rem', padding: '6px 14px', borderRadius: '20px' }}
          onClick={() => setSelectedCityFilter('ALL')}
        >
          🏢 All Cities ({serviceZones.length} Areas)
        </button>
        {availableCities.map((city) => {
          const zoneCount = serviceZones.filter(
            (z) => z.city?.trim().toLowerCase() === city.toLowerCase()
          ).length;
          const isSelected = selectedCityFilter.toLowerCase() === city.toLowerCase();
          return (
            <button
              key={city}
              type="button"
              className={isSelected ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: '0.78rem', padding: '6px 14px', borderRadius: '20px' }}
              onClick={() => setSelectedCityFilter(city)}
            >
              📍 {city} ({zoneCount})
            </button>
          );
        })}
      </div>

      {/* Main 2-Column Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        {/* Left Card: Area & Pincode Editor */}
        <div className="chart-card-modern">
          <div className="card-top-header" style={{ marginBottom: '12px' }}>
            <div>
              <h2 className="card-top-title">
                {editingZoneId ? `Edit Area: ${zoneName || zoneCode}` : 'Add & Expand Service Area by City & Pincode'}
              </h2>
              <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                Select city, pin exact coordinates on map, and assign 6-digit covered pincodes.
              </p>
            </div>
            {editingZoneId && (
              <button type="button" className="btn-secondary" onClick={resetZoneEditor}>
                + New Area
              </button>
            )}
          </div>

          {/* Quick Presets by City */}
          <div style={{ marginBottom: '14px', background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
              ⚡ 1-Click City &amp; Area Rollout Presets:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {EXPANSION_CITY_PRESETS.map((preset) => (
                <button
                  key={preset.code}
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '6px' }}
                  onClick={() => applyPreset(preset)}
                >
                  <strong>{preset.city}:</strong> {preset.code} ({preset.pincodes.length} pins)
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(e) => void handleSaveZone(e)}
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            {/* Interactive Map Picker */}
            <InteractiveMapPicker
              latitude={zoneLat}
              longitude={zoneLng}
              radiusKm={zoneRadiusKm}
              radiusColor={zoneLaunchPhase === 'PAUSED' ? '#94A3B8' : '#0D9488'}
              title="Area Center & Delivery Flight Radius"
              subtitle="Search city/area, click map, or drag pin to auto-fill GPS and Pincode"
              heightPx={260}
              onChange={(loc) => {
                setZoneLat(loc.latitude);
                setZoneLng(loc.longitude);
                if (loc.city) setZoneCity(loc.city);
                if (loc.state) setZoneState(loc.state);
                if (loc.pincode) {
                  const pin = loc.pincode.replace(/\D/g, '').slice(0, 6);
                  if (pin.length === 6 && !zonePincodes.includes(pin)) {
                    const next = [...zonePincodes, pin];
                    setZonePincodes(next);
                    setZonePincodesText(next.join(', '));
                  }
                }
              }}
            />

            {/* City & State Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '10px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">City *</label>
                <input
                  className="form-input"
                  placeholder="e.g. Mumbai or Patna"
                  value={zoneCity}
                  onChange={(e) => setZoneCity(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">State</label>
                <input
                  className="form-input"
                  placeholder="e.g. Maharashtra"
                  value={zoneState}
                  onChange={(e) => setZoneState(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Launch Phase</label>
                <select
                  className="form-select"
                  value={zoneLaunchPhase}
                  onChange={(e) =>
                    setZoneLaunchPhase(e.target.value as 'PILOT' | 'EXPANSION' | 'PAUSED')
                  }
                >
                  <option value="PILOT">PILOT (Active Core)</option>
                  <option value="EXPANSION">EXPANSION (Active Scaled)</option>
                  <option value="PAUSED">PAUSED (Inactive)</option>
                </select>
              </div>
            </div>

            {/* Zone Code & Area Name Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Area Code *</label>
                <input
                  className="form-input"
                  placeholder="e.g. MUM-01 or PAT-01"
                  value={zoneCode}
                  onChange={(e) => setZoneCode(e.target.value.toUpperCase())}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Area / Pocket Name *</label>
                <input
                  className="form-input"
                  placeholder="e.g. Kankarbagh Medical Area"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Radius Slider */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: '12px',
                alignItems: 'center',
                background: '#F1F5F9',
                padding: '10px 14px',
                borderRadius: '8px',
              }}
            >
              <div>
                <label className="form-label" style={{ marginBottom: '4px' }}>
                  Coverage Radius: <strong>{zoneRadiusKm} km</strong>
                </label>
                <input
                  type="range"
                  min={1}
                  max={30}
                  step={0.5}
                  style={{ width: '100%', accentColor: '#0D9488' }}
                  value={zoneRadiusKm}
                  onChange={(e) => setZoneRadiusKm(Number(e.target.value))}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Radius (km)</label>
                <input
                  type="number"
                  min={0.5}
                  max={100}
                  step={0.5}
                  className="form-input"
                  value={zoneRadiusKm}
                  onChange={(e) => setZoneRadiusKm(Number(e.target.value) || 5)}
                />
              </div>
            </div>

            {/* Pincode Manager with Badges */}
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  Covered Pincodes for this Area ({zonePincodes.length})
                </label>
                <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                  Orders with these pincodes match immediately
                </span>
              </div>

              {/* Single Pincode Add Form */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  maxLength={6}
                  className="form-input"
                  style={{ maxWidth: '180px' }}
                  placeholder="Enter 6-digit pin"
                  value={singlePinInput}
                  onChange={(e) => setSinglePinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSinglePin();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '0 14px' }}
                  onClick={handleAddSinglePin}
                >
                  + Add Pin
                </button>
              </div>

              {/* Interactive Badges */}
              {zonePincodes.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {zonePincodes.map((pin) => (
                    <span
                      key={pin}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: '#CCFBF1',
                        color: '#0F766E',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        padding: '3px 8px',
                        borderRadius: '14px',
                        border: '1px solid #99F6E4',
                      }}
                    >
                      {pin}
                      <button
                        type="button"
                        aria-label={`Remove pincode ${pin}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0F766E',
                          cursor: 'pointer',
                          fontWeight: 900,
                          padding: 0,
                          fontSize: '0.75rem',
                        }}
                        onClick={() => handleRemovePin(pin)}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                  No specific pincodes added yet (GPS radius will be used as fallback).
                </div>
              )}

              {/* Bulk Comma-Separated Pincodes Input */}
              <div style={{ marginTop: '6px' }}>
                <label style={{ fontSize: '0.74rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>
                  Or paste multiple pincodes (comma separated):
                </label>
                <input
                  className="form-input"
                  placeholder="e.g. 400051, 400050, 400055, 400098"
                  value={zonePincodesText}
                  onChange={(e) => setZonePincodesText(e.target.value)}
                  onBlur={handlePincodeTextBlur}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Expansion Notes (Optional)</label>
              <input
                className="form-input"
                placeholder="Rider capacity, hospital corridor, or operational hours"
                value={zoneNotes}
                onChange={(e) => setZoneNotes(e.target.value)}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button type="submit" className="btn-primary" disabled={savingZone}>
                {savingZone
                  ? 'Saving Area...'
                  : editingZoneId
                  ? 'Update Expansion Area'
                  : 'Save & Activate Area'}
              </button>
              <button type="button" className="btn-secondary" onClick={resetZoneEditor}>
                Reset
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: City Summary Matrix & Configured Areas Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* City-Wise Rollout Matrix */}
          <div className="chart-card-modern">
            <div className="card-top-header" style={{ marginBottom: '10px' }}>
              <div>
                <h2 className="card-top-title">City-Wise Rollout Summary</h2>
                <p style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Operational coverage status across all targeted cities
                </p>
              </div>
            </div>
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>City &amp; State</th>
                    <th>Active Hubs</th>
                    <th>Covered Pincodes</th>
                    <th>Assigned Fleet</th>
                    <th>Quick Action</th>
                  </tr>
                </thead>
                <tbody>
                  {citySummaryMatrix.map((item) => (
                    <tr key={item.city}>
                      <td>
                        <strong>{item.city}</strong>
                        {item.state && (
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{item.state}</div>
                        )}
                      </td>
                      <td>
                        <span className={item.activeAreas > 0 ? 'status-pill-green' : 'status-pill-red'}>
                          {item.activeAreas} / {item.totalAreas} Active
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#0F766E' }}>
                          {item.pincodes.size} Pincodes
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{item.fleetCount} Phlebos</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                          onClick={() => {
                            setSelectedCityFilter(item.city);
                            setZoneCity(item.city);
                            if (item.state) setZoneState(item.state);
                          }}
                        >
                          View Areas &rarr;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Configured Zones Table */}
          <div className="chart-card-modern">
            <div className="card-top-header">
              <div>
                <h2 className="card-top-title">
                  Configured Areas &amp; Zones ({filteredZones.length})
                  {selectedCityFilter !== 'ALL' && ` in ${selectedCityFilter}`}
                </h2>
                <p style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Live delivery boundaries, GPS radius, and pin coverage
                </p>
              </div>
            </div>
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>City &amp; Code</th>
                    <th>Area Name</th>
                    <th>Radius &amp; Pincodes</th>
                    <th>Assigned Fleet</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredZones.map((z) => {
                    const zoneRiders = phlebotomists.filter(
                      (p) =>
                        p.assignedZoneId === z.id ||
                        p.assignedCity?.toLowerCase() === (z.city || '').toLowerCase() ||
                        (p.assignedZoneCode &&
                          p.assignedZoneCode.toUpperCase() === z.zoneCode.toUpperCase())
                    );
                    return (
                      <tr key={z.id}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0F766E' }}>{z.city}</div>
                          <span className="user-code-badge">{z.zoneCode}</span>
                        </td>
                        <td>
                          <div><strong>{z.name}</strong></div>
                          <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                            {z.state ? `${z.state} • ` : ''}
                            {z.centerLatitude.toFixed(4)}, {z.centerLongitude.toFixed(4)}
                          </div>
                        </td>
                        <td>
                          <div><strong>{z.radiusKm} km radius</strong></div>
                          {z.pincodes && z.pincodes.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '2px' }}>
                              {z.pincodes.slice(0, 5).map((p) => (
                                <span
                                  key={p}
                                  style={{
                                    fontSize: '0.68rem',
                                    background: '#F1F5F9',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                  }}
                                >
                                  {p}
                                </span>
                              ))}
                              {z.pincodes.length > 5 && (
                                <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                  +{z.pincodes.length - 5} more
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>GPS flight radius only</span>
                          )}
                        </td>
                        <td>
                          <div>
                            <strong>
                              {zoneRiders.length} Phlebo{zoneRiders.length === 1 ? '' : 's'}
                            </strong>
                          </div>
                          {zoneRiders.length > 0 && (
                            <div style={{ fontSize: '0.7rem', color: '#0F766E' }}>
                              {zoneRiders.slice(0, 2).map((r) => r.userCode || r.name).join(', ')}
                              {zoneRiders.length > 2 && ` +${zoneRiders.length - 2}`}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={z.isActive ? 'status-pill-green' : 'status-pill-red'}>
                            {z.isActive ? `● ACTIVE (${z.launchPhase})` : `● PAUSED (${z.launchPhase})`}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                              onClick={() => {
                                setEditingZoneId(z.id);
                                setZoneCode(z.zoneCode);
                                setZoneName(z.name);
                                setZoneCity(z.city);
                                setZoneState(z.state || 'Maharashtra');
                                setZoneRadiusKm(z.radiusKm);
                                setZonePincodes(z.pincodes || []);
                                setZonePincodesText((z.pincodes || []).join(', '));
                                setZoneLat(z.centerLatitude);
                                setZoneLng(z.centerLongitude);
                                setZoneLaunchPhase(z.launchPhase);
                                setZoneNotes(z.notes || '');
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                              onClick={async () => {
                                const nextActive = !z.isActive;
                                await toggleServiceZoneActive(z, nextActive, actorEmail);
                                void updateServiceZoneApi(
                                  z.id,
                                  {
                                    isActive: nextActive,
                                    launchPhase: nextActive
                                      ? z.launchPhase === 'PAUSED'
                                        ? 'EXPANSION'
                                        : z.launchPhase
                                      : 'PAUSED',
                                  },
                                  bearerToken
                                ).catch(() => {});
                              }}
                            >
                              {z.isActive ? 'Pause' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                              onClick={() =>
                                onShowAlert({
                                  variant: 'confirm',
                                  title: `Remove ${z.zoneCode}?`,
                                  message: `Delete service zone "${z.name}" (${z.city})? Bookings matching this area may be affected.`,
                                  onConfirm: () => {
                                    void deleteServiceZone(z.id);
                                    void deleteServiceZoneApi(z.id, bearerToken).catch(() => {});
                                  },
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
          </div>
        </div>
      </div>
    </div>
  );
}
