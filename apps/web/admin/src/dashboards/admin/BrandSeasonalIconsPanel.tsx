import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  type BrandingAuditLogEntry,
  DEFAULT_BRANDING_TIMEZONE,
  DEFAULT_SEASONAL_BRANDING_DOC,
  FESTIVAL_BUNDLED_CATALOG,
  type FestivalBrandingConfig,
  type FestivalIconKey,
  findOverlappingFestivals,
  resolveActiveFestivalBranding,
  type SeasonalBrandingDocument,
  validateFestivalSchedule,
} from '@diagnostic/shared';
import { LabSetuLogo } from '@diagnostic/shared/web/LabSetuLogo';
import { db, storage } from '../../firebase';

interface BrandSeasonalIconsPanelProps {
  actorEmail: string;
}

const PRESET_KEYS = Object.keys(FESTIVAL_BUNDLED_CATALOG) as FestivalIconKey[];

function getPreviewUrlForFestival(key: FestivalIconKey, customUrl?: string): string {
  if (key === 'custom' && customUrl) return customUrl;
  if (key === 'default') return '/pwa-icon-192.png';
  return `/festivals/${key}/preview.png`;
}

function getFaviconUrlForFestival(key: FestivalIconKey, customUrl?: string): string {
  if (key === 'custom' && customUrl) return customUrl;
  if (key === 'default') return '/favicon-32x32.png';
  return `/festivals/${key}/favicon-32x32.png`;
}

export function BrandSeasonalIconsPanel({ actorEmail }: BrandSeasonalIconsPanelProps) {
  const [brandingDoc, setBrandingDoc] = useState<SeasonalBrandingDocument>(
    DEFAULT_SEASONAL_BRANDING_DOC
  );
  const [auditLogs, setAuditLogs] = useState<BrandingAuditLogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingCustom, setUploadingCustom] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state for adding / editing a festival schedule
  const [editingId, setEditingId] = useState<string | null>(null);
  const [festivalKey, setFestivalKey] = useState<FestivalIconKey>('diwali');
  const [festivalName, setFestivalName] = useState<string>(FESTIVAL_BUNDLED_CATALOG.diwali.label);
  const [description, setDescription] = useState<string>(
    FESTIVAL_BUNDLED_CATALOG.diwali.defaultDescription
  );
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState<string>('00:00');
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [endTime, setEndTime] = useState<string>('23:59');
  const [timezone, setTimezone] = useState<string>(DEFAULT_BRANDING_TIMEZONE);
  const [priority, setPriority] = useState<number>(10);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [enableSplashBranding, setEnableSplashBranding] = useState<boolean>(false);
  const [customIconUrl, setCustomIconUrl] = useState<string>('');
  const [previewKey, setPreviewKey] = useState<FestivalIconKey>('diwali');

  useEffect(() => {
    const unsubDoc = onSnapshot(
      doc(db, 'settings', 'seasonalBranding'),
      (snap) => {
        if (!snap.exists()) {
          setBrandingDoc(DEFAULT_SEASONAL_BRANDING_DOC);
          return;
        }
        const data = snap.data() as Partial<SeasonalBrandingDocument>;
        setBrandingDoc({
          version: typeof data.version === 'number' ? data.version : 1,
          forceDefaultBranding: Boolean(data.forceDefaultBranding),
          manualOverrideFestivalId: data.manualOverrideFestivalId ?? null,
          festivals: Array.isArray(data.festivals) ? data.festivals : [],
          updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
          updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : 'system',
        });
      },
      (err) => {
        setErrorMsg(`Unable to load seasonal branding: ${err.message}`);
      }
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'brandingAuditLogs'), orderBy('timestamp', 'desc'), limit(25)),
      (snap) => {
        setAuditLogs(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<BrandingAuditLogEntry, 'id'>),
          }))
        );
      },
      () => {
        // Ignore if index or logs collection is empty
      }
    );

    return () => {
      unsubDoc();
      unsubLogs();
    };
  }, []);

  const resolved = useMemo(
    () => resolveActiveFestivalBranding(brandingDoc, Date.now()),
    [brandingDoc]
  );

  const candidateOverlap = useMemo(() => {
    const candidate: FestivalBrandingConfig = {
      id: editingId || '__draft__',
      festivalKey,
      festivalName,
      startDate,
      startTime,
      endDate,
      endTime,
      timezone,
      isActive,
      priority,
      description,
      createdBy: actorEmail,
      updatedAt: new Date().toISOString(),
    };
    return findOverlappingFestivals(brandingDoc.festivals, candidate);
  }, [
    actorEmail,
    brandingDoc.festivals,
    description,
    editingId,
    endDate,
    endTime,
    festivalKey,
    festivalName,
    isActive,
    priority,
    startDate,
    startTime,
    timezone,
  ]);

  async function persistBrandingUpdate(
    nextDoc: SeasonalBrandingDocument,
    action: BrandingAuditLogEntry['action'],
    summary: string,
    festival?: { id?: string; name?: string }
  ) {
    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await setDoc(doc(db, 'settings', 'seasonalBranding'), nextDoc, { merge: false });
      const logId = `brand_audit_${Date.now()}`;
      const logEntry: BrandingAuditLogEntry = {
        id: logId,
        action,
        festivalId: festival?.id,
        festivalName: festival?.name,
        actorEmail,
        summary,
        timestamp: new Date().toISOString(),
      };
      await setDoc(doc(db, 'brandingAuditLogs', logId), logEntry);
      setStatusMsg(summary);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save branding configuration.');
    } finally {
      setSaving(false);
    }
  }

  function selectPreset(key: FestivalIconKey) {
    setFestivalKey(key);
    setPreviewKey(key);
    if (!editingId) {
      setFestivalName(FESTIVAL_BUNDLED_CATALOG[key].label);
      setDescription(FESTIVAL_BUNDLED_CATALOG[key].defaultDescription);
    }
  }

  async function handleCustomIconUpload(file: File | undefined) {
    if (!file) return;
    setErrorMsg(null);
    setStatusMsg(null);

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/x-icon'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMsg('Custom icon must be a PNG, JPEG, WebP, or ICO image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Custom icon file size must be 2 MB or smaller.');
      return;
    }

    setUploadingCustom(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageRef = ref(storage, `brand-icons/custom-${Date.now()}-${safeName}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setFestivalKey('custom');
      setPreviewKey('custom');
      setCustomIconUrl(url);
      setStatusMsg(`Uploaded custom icon "${file.name}". Save the schedule below to publish.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Custom icon upload failed.');
    } finally {
      setUploadingCustom(false);
    }
  }

  async function handleSaveFestival(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    if (festivalKey === 'custom' && !customIconUrl.trim()) {
      setErrorMsg('Please upload a custom icon image or choose a pre-bundled festival preset.');
      return;
    }

    const item: FestivalBrandingConfig = {
      id: editingId || `${festivalKey}_${Date.now()}`,
      festivalKey,
      festivalName: festivalName.trim(),
      iconAssetUrl: festivalKey === 'custom' ? customIconUrl.trim() : undefined,
      previewImageUrl: getPreviewUrlForFestival(festivalKey, customIconUrl.trim()),
      startDate,
      startTime,
      endDate,
      endTime,
      timezone,
      isActive,
      priority: Number(priority) || 10,
      description: description.trim() || FESTIVAL_BUNDLED_CATALOG[festivalKey].defaultDescription,
      enableSplashBranding,
      createdBy: actorEmail,
      updatedAt: new Date().toISOString(),
    };

    const validation = validateFestivalSchedule(item);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Invalid festival schedule.');
      return;
    }

    const exists = brandingDoc.festivals.some((f) => f.id === item.id);
    const nextFestivals = exists
      ? brandingDoc.festivals.map((f) => (f.id === item.id ? item : f))
      : [...brandingDoc.festivals, item];

    const nextDoc: SeasonalBrandingDocument = {
      ...brandingDoc,
      version: (brandingDoc.version || 1) + 1,
      forceDefaultBranding: false,
      festivals: nextFestivals,
      updatedAt: new Date().toISOString(),
      updatedBy: actorEmail,
    };

    await persistBrandingUpdate(
      nextDoc,
      exists ? 'UPDATE_FESTIVAL' : 'CREATE_FESTIVAL',
      `${exists ? 'Updated' : 'Scheduled'} "${item.festivalName}" (${item.startDate} ${item.startTime} – ${item.endDate} ${item.endTime} ${item.timezone}).`,
      { id: item.id, name: item.festivalName }
    );
    setEditingId(null);
  }

  async function handleRestoreDefault() {
    const nextDoc: SeasonalBrandingDocument = {
      ...brandingDoc,
      version: (brandingDoc.version || 1) + 1,
      forceDefaultBranding: true,
      manualOverrideFestivalId: null,
      updatedAt: new Date().toISOString(),
      updatedBy: actorEmail,
    };
    await persistBrandingUpdate(
      nextDoc,
      'RESTORE_DEFAULT',
      'Manually restored permanent official LabSetu default branding.'
    );
  }

  async function handleToggleFestival(item: FestivalBrandingConfig) {
    const nextActive = !item.isActive;
    const nextFestivals = brandingDoc.festivals.map((f) =>
      f.id === item.id ? { ...f, isActive: nextActive, updatedAt: new Date().toISOString() } : f
    );
    const nextDoc: SeasonalBrandingDocument = {
      ...brandingDoc,
      version: (brandingDoc.version || 1) + 1,
      forceDefaultBranding: nextActive ? false : brandingDoc.forceDefaultBranding,
      manualOverrideFestivalId:
        !nextActive && brandingDoc.manualOverrideFestivalId === item.id
          ? null
          : brandingDoc.manualOverrideFestivalId,
      festivals: nextFestivals,
      updatedAt: new Date().toISOString(),
      updatedBy: actorEmail,
    };
    await persistBrandingUpdate(
      nextDoc,
      nextActive ? 'ACTIVATE_FESTIVAL' : 'DEACTIVATE_FESTIVAL',
      `${nextActive ? 'Activated' : 'Deactivated'} "${item.festivalName}".`,
      { id: item.id, name: item.festivalName }
    );
  }

  async function handleActivateNow(item: FestivalBrandingConfig) {
    const nextFestivals = brandingDoc.festivals.map((f) =>
      f.id === item.id ? { ...f, isActive: true, updatedAt: new Date().toISOString() } : f
    );
    const nextDoc: SeasonalBrandingDocument = {
      ...brandingDoc,
      version: (brandingDoc.version || 1) + 1,
      forceDefaultBranding: false,
      manualOverrideFestivalId: item.id,
      festivals: nextFestivals,
      updatedAt: new Date().toISOString(),
      updatedBy: actorEmail,
    };
    await persistBrandingUpdate(
      nextDoc,
      'ACTIVATE_FESTIVAL',
      `Manually activated "${item.festivalName}" immediately.`,
      { id: item.id, name: item.festivalName }
    );
  }

  const activePreviewUrl = getPreviewUrlForFestival(
    previewKey,
    previewKey === 'custom' ? customIconUrl : undefined
  );
  const activeFaviconUrl = getFaviconUrlForFestival(
    previewKey,
    previewKey === 'custom' ? customIconUrl : undefined
  );

  return (
    <div className="chart-card-modern" style={{ gridColumn: 'span 2' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <LabSetuLogo variant="full" width={54} height={54} alt="LabSetu Official Logo" />
          <div>
            <h2 className="card-top-title" style={{ margin: 0 }}>
              Brand &amp; Seasonal Icons Manager
            </h2>
            <p className="card-top-sub" style={{ margin: '4px 0 0 0' }}>
              Schedule festival variations of the official LabSetu icon across Web Favicons &amp; Android Phlebo Launcher (Asia/Kolkata).
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary"
          disabled={saving}
          onClick={() => void handleRestoreDefault()}
        >
          ↺ Restore Default LabSetu Branding
        </button>
      </div>

      {/* Currently Active Status Banner */}
      <div
        style={{
          marginTop: '16px',
          padding: '14px 16px',
          borderRadius: '12px',
          background: resolved.status === 'ACTIVE_FESTIVAL' ? '#FEF3C7' : '#F0FDFA',
          border: `1px solid ${resolved.status === 'ACTIVE_FESTIVAL' ? '#FDE68A' : '#99F6E4'}`,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src={getPreviewUrlForFestival(
              resolved.resolvedIconKey,
              resolved.activeFestival?.iconAssetUrl
            )}
            alt="Currently active icon"
            style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 10, background: '#FFFFFF', padding: 3 }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0F172A' }}>
              Active Branding:{' '}
              {resolved.activeFestival
                ? `${resolved.activeFestival.festivalName} (${resolved.resolvedIconKey})`
                : 'Official LabSetu Default'}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
              {resolved.activeFestival
                ? `Active ${resolved.activeFestival.startDate} ${resolved.activeFestival.startTime} → ${resolved.activeFestival.endDate} ${resolved.activeFestival.endTime} (${resolved.activeFestival.timezone}) • Android Alias: ${resolved.androidAliasKey}`
                : 'No festival active right now — displaying permanent official LabSetu logo.'}
            </div>
          </div>
        </div>
        <span
          style={{
            fontSize: '0.74rem',
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: '999px',
            background: '#FFFFFF',
            color: '#0F766E',
            border: '1px solid #CBD5E1',
          }}
        >
          Config v{brandingDoc.version}
        </span>
      </div>

      {statusMsg && (
        <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '10px', background: '#ECFDF5', color: '#065F46', fontSize: '0.84rem', fontWeight: 600 }}>
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '10px', background: '#FEF2F2', color: '#991B1B', fontSize: '0.84rem', fontWeight: 600 }}>
          {errorMsg}
        </div>
      )}

      {/* Preset Icon Gallery + Live Android & Browser Tab Preview */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          marginTop: '20px',
        }}
      >
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '10px', color: '#0F172A' }}>
            1. Available Festival Designs (Pre-bundled + Custom)
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
              gap: '10px',
            }}
          >
            {PRESET_KEYS.map((key) => {
              const selected = festivalKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectPreset(key)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 6px',
                    borderRadius: '12px',
                    border: selected ? '2px solid #0D9488' : '1px solid #E2E8F0',
                    background: selected ? '#F0FDFA' : '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  <img
                    src={getPreviewUrlForFestival(key, key === 'custom' ? customIconUrl : undefined)}
                    alt={FESTIVAL_BUNDLED_CATALOG[key].label}
                    style={{ width: 46, height: 46, objectFit: 'contain' }}
                  />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0F172A', textAlign: 'center', lineHeight: 1.2 }}>
                    {key === 'default' ? 'Default' : FESTIVAL_BUNDLED_CATALOG[key].label.split(' (')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Previews: Android Launcher + Browser Tab */}
        <div
          style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: '#0F172A' }}>
            2. Live Device &amp; Browser Tab Preview ({previewKey})
          </h3>

          {/* Browser Tab Mock */}
          <div>
            <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, marginBottom: '6px' }}>
              Website Browser Tab (Icon-Only 16×16 / 32×32)
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderBottom: '2px solid #0D9488',
                borderRadius: '8px 8px 0 0',
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#0F172A',
              }}
            >
              <img src={activeFaviconUrl} alt="Browser tab favicon" style={{ width: 16, height: 16, objectFit: 'contain' }} />
              <span>LabSetu Portal</span>
            </div>
          </div>

          {/* Android Launcher Mock */}
          <div>
            <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, marginBottom: '6px' }}>
              Android Phlebo Launcher Icon (Adaptive Safe Zone)
            </div>
            <div
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                padding: '12px 18px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                }}
              >
                <img src={activePreviewUrl} alt="Android launcher preview" style={{ width: 46, height: 46, objectFit: 'contain' }} />
              </div>
              <span style={{ fontSize: '0.72rem', color: '#F8FAFC', fontWeight: 600 }}>
                LabSetu Partner
              </span>
            </div>
            {previewKey === 'custom' && (
              <p style={{ fontSize: '0.73rem', color: '#B45309', margin: '6px 0 0 0' }}>
                Note: Custom uploaded icons update Web favicons &amp; in-app branding immediately. Android launcher icons require pre-bundled APK resources and fall back to Default unless bundled.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Schedule Form */}
      <form onSubmit={(e) => void handleSaveFestival(e)} style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
        <h3 style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '12px', color: '#0F172A' }}>
          3. {editingId ? 'Edit Scheduled Festival' : 'Schedule Festival Activation'}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Festival Name</label>
            <input
              type="text"
              className="form-input"
              value={festivalName}
              onChange={(e) => setFestivalName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Start Date ({timezone})</label>
            <input type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Start Time</label>
            <input type="time" className="form-input" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">End Date ({timezone})</label>
            <input type="date" className="form-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">End Time</label>
            <input type="time" className="form-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Priority (higher wins overlap)</label>
            <input
              type="number"
              className="form-input"
              min={1}
              max={100}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 10)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Timezone</label>
            <input type="text" className="form-input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Upload Custom Icon (PNG/WebP/ICO ≤ 2 MB)</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/x-icon"
              className="form-input"
              disabled={uploadingCustom}
              onChange={(e) => void handleCustomIconUpload(e.target.files?.[0])}
            />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '10px' }}>
          <label className="form-label">Description</label>
          <input type="text" className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', marginTop: '10px', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', fontWeight: 600 }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Schedule Active
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={enableSplashBranding}
              onChange={(e) => setEnableSplashBranding(e.target.checked)}
            />
            Allow seasonal badge on Phlebo in-app splash/login
          </label>
        </div>

        {candidateOverlap.length > 0 && (
          <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: '0.8rem', color: '#92400E' }}>
            Overlap detected with: {candidateOverlap.map((o) => `${o.festivalName} (Priority ${o.priority})`).join(', ')}. Highest priority wins automatically.
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
          <button type="submit" className="btn-primary" disabled={saving || uploadingCustom}>
            {saving ? 'Saving...' : editingId ? 'Update Festival Schedule' : 'Publish Festival Schedule'}
          </button>
          {editingId && (
            <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      {/* Scheduled / Upcoming / Expired Lists */}
      <div style={{ marginTop: '22px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
        <h3 style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '10px', color: '#0F172A' }}>
          4. Scheduled, Upcoming &amp; Expired Configurations ({brandingDoc.festivals.length})
        </h3>
        {brandingDoc.festivals.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: '#64748B' }}>
            No festival schedules configured yet. Add one above to automate seasonal branding.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {brandingDoc.festivals.map((item) => {
              const isCurrentWinner = resolved.activeFestival?.id === item.id;
              const isExpired = resolved.expiredFestivals.some((e) => e.id === item.id);
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: isCurrentWinner ? '1.5px solid #0D9488' : '1px solid #E2E8F0',
                    background: isCurrentWinner ? '#F0FDFA' : '#FFFFFF',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img
                      src={getPreviewUrlForFestival(item.festivalKey, item.iconAssetUrl)}
                      alt={item.festivalName}
                      style={{ width: 38, height: 38, objectFit: 'contain' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0F172A' }}>
                        {item.festivalName}{' '}
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: isCurrentWinner ? '#0F766E' : isExpired ? '#64748B' : '#2563EB' }}>
                          {isCurrentWinner ? '• LIVE NOW' : isExpired ? '• EXPIRED' : item.isActive ? '• SCHEDULED' : '• PAUSED'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#475569' }}>
                        {item.startDate} {item.startTime} → {item.endDate} {item.endTime} ({item.timezone}) • Priority {item.priority}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '0.76rem', padding: '5px 10px' }}
                      onClick={() => void handleActivateNow(item)}
                    >
                      Activate Now
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '0.76rem', padding: '5px 10px' }}
                      onClick={() => void handleToggleFestival(item)}
                    >
                      {item.isActive ? 'Deactivate' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '0.76rem', padding: '5px 10px' }}
                      onClick={() => {
                        setEditingId(item.id);
                        setFestivalKey(item.festivalKey);
                        setPreviewKey(item.festivalKey);
                        setFestivalName(item.festivalName);
                        setDescription(item.description);
                        setStartDate(item.startDate);
                        setStartTime(item.startTime);
                        setEndDate(item.endDate);
                        setEndTime(item.endTime);
                        setTimezone(item.timezone);
                        setPriority(item.priority);
                        setIsActive(item.isActive);
                        setEnableSplashBranding(Boolean(item.enableSplashBranding));
                        setCustomIconUrl(item.iconAssetUrl || '');
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Branding Audit History */}
      <div style={{ marginTop: '22px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
        <h3 style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '8px', color: '#0F172A' }}>
          5. Branding Change Audit History
        </h3>
        {auditLogs.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: '#64748B' }}>No branding changes recorded yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: '6px', maxHeight: '190px', overflowY: 'auto' }}>
            {auditLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  fontSize: '0.78rem',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <span>
                  <strong>[{log.action}]</strong> {log.summary}{' '}
                  <span style={{ color: '#64748B' }}>by {log.actorEmail}</span>
                </span>
                <span style={{ color: '#64748B', whiteSpace: 'nowrap' }}>
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
