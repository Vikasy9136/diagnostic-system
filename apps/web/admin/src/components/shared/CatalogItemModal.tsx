import { type FormEvent, useEffect, useState } from 'react';
import {
  type CatalogItemType,
  type CommissionConfig,
  DiagnosticDepartment,
  type DiagnosticTestItem,
  formatInr,
  inferCatalogDefaultsForCode,
  type LabFacility,
  SpecimenType,
  StorageTemperature,
  TUBE_METADATA,
  TubeType,
} from '@diagnostic/shared';
import { type AlertTriggerFn, type FormatLabelFn } from '../../dashboards/types';
import { ModalFrame } from './ModalFrame';

export interface CatalogItemSaveInput {
  id: string;
  code: string;
  name: string;
  itemType: CatalogItemType;
  includedTestCodes?: string[];
  department: DiagnosticDepartment;
  specimenType: SpecimenType;
  tubeType: TubeType;
  temperatureRequirement: StorageTemperature;
  tatHours: number;
  b2bPriceInr: number;
  largeLabB2bRateInr: number;
  mrpInr: number;
  ownerOrgId?: string;
  labId?: string;
  labName: string;
}

export interface CatalogItemModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'ADMIN' | 'LARGE_LAB';
  editingItem: DiagnosticTestItem | null;
  initialItemType: CatalogItemType;
  largeLabOrgs?: LabFacility[];
  fixedOrgId?: string;
  fixedOrgName?: string;
  singleTestsCatalog: DiagnosticTestItem[];
  commConfig: CommissionConfig;
  defaultMarkupPct?: number;
  formatLabel: FormatLabelFn;
  onShowAlert: AlertTriggerFn;
  onSave: (item: CatalogItemSaveInput) => Promise<void>;
}

const DEPARTMENTS: DiagnosticDepartment[] = [
  'Hematology',
  'Biochemistry',
  'Immunology',
  'Molecular',
  'Microbiology',
  'Pathology',
  'Preventive Health',
];

export function CatalogItemModal({
  open,
  onClose,
  mode,
  editingItem,
  initialItemType,
  largeLabOrgs = [],
  fixedOrgId,
  fixedOrgName,
  singleTestsCatalog,
  commConfig,
  defaultMarkupPct = 18,
  formatLabel,
  onShowAlert,
  onSave,
}: CatalogItemModalProps) {
  const [ownerOrgId, setOwnerOrgId] = useState<string>('GLOBAL');
  const [itemType, setItemType] = useState<CatalogItemType>(initialItemType);
  const [includedCodes, setIncludedCodes] = useState<string[]>([]);
  const [customCodesInput, setCustomCodesInput] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [dept, setDept] = useState<DiagnosticDepartment>('Hematology');
  const [specimen, setSpecimen] = useState<SpecimenType>(SpecimenType.BLOOD);
  const [tube, setTube] = useState<TubeType>(TubeType.EDTA_LAVENDER);
  const [temp, setTemp] = useState<StorageTemperature>(StorageTemperature.REFRIGERATED);
  const [tat, setTat] = useState(4);
  const [largeLabRate, setLargeLabRate] = useState(190);
  const [b2bPrice, setB2bPrice] = useState(250);
  const [mrp, setMrp] = useState(500);
  const [b2bManualOverride, setB2bManualOverride] = useState(false);
  const [autoSuggestedName, setAutoSuggestedName] = useState('');
  const [autoMetaNote, setAutoMetaNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditingOwned = Boolean(
    editingItem &&
      (mode === 'ADMIN' ||
        (fixedOrgId && (editingItem.ownerOrgId === fixedOrgId || editingItem.labId === fixedOrgId)))
  );

  function getMarkupPct(targetOwnerId: string): number {
    if (targetOwnerId && targetOwnerId !== 'GLOBAL') {
      const agreed = commConfig.largeLabAgreements?.[targetOwnerId]?.b2bMarkupPct;
      if (typeof agreed === 'number' && Number.isFinite(agreed) && agreed >= 0) {
        return agreed;
      }
    }
    return defaultMarkupPct;
  }

  useEffect(() => {
    if (!open) return;
    if (editingItem) {
      const itemOwner = editingItem.ownerOrgId || editingItem.labId || 'GLOBAL';
      setOwnerOrgId(mode === 'LARGE_LAB' ? fixedOrgId || itemOwner : itemOwner);
      setItemType(editingItem.itemType || 'TEST');
      setIncludedCodes(editingItem.includedTestCodes || []);
      setCustomCodesInput('');
      setCode(editingItem.code);
      setName(editingItem.name);
      setDept(editingItem.department);
      setSpecimen(editingItem.specimenType);
      setTube(editingItem.tubeType);
      setTemp(editingItem.temperatureRequirement);
      setTat(editingItem.tatHours);
      const fallbackComm =
        (fixedOrgId ? commConfig.largeLabAgreements?.[fixedOrgId]?.agreedCommissionPct : undefined) ??
        commConfig.commissionPct ??
        15;
      const baseRate =
        typeof editingItem.largeLabB2bRateInr === 'number'
          ? editingItem.largeLabB2bRateInr
          : Math.round((editingItem.b2bPriceInr || 250) * (1 - fallbackComm / 100));
      setLargeLabRate(baseRate);
      setB2bPrice(editingItem.b2bPriceInr);
      setMrp(editingItem.mrpInr);
      setB2bManualOverride(true);
      setAutoSuggestedName('');
      setAutoMetaNote(null);
      return;
    }

    setOwnerOrgId(mode === 'LARGE_LAB' ? fixedOrgId || 'LARGE_HUB' : 'GLOBAL');
    setItemType(initialItemType);
    setIncludedCodes([]);
    setCustomCodesInput('');
    setCode('');
    setName('');
    setDept(initialItemType === 'PACKAGE' ? 'Preventive Health' : 'Hematology');
    setSpecimen(SpecimenType.BLOOD);
    setTube(TubeType.EDTA_LAVENDER);
    setTemp(StorageTemperature.REFRIGERATED);
    setTat(initialItemType === 'PACKAGE' ? 12 : 4);
    const defaultRate = initialItemType === 'PACKAGE' ? 680 : 190;
    const initOwner = mode === 'LARGE_LAB' ? fixedOrgId || 'LARGE_HUB' : 'GLOBAL';
    const mPct = getMarkupPct(initOwner);
    setLargeLabRate(defaultRate);
    setB2bPrice(Math.round(defaultRate * (1 + mPct / 100)));
    setMrp(initialItemType === 'PACKAGE' ? 1500 : 500);
    setB2bManualOverride(false);
    setAutoSuggestedName('');
    setAutoMetaNote(null);
  }, [open, editingItem, initialItemType, mode, fixedOrgId]);

  function handleCodeChange(raw: string) {
    setCode(raw);
    if (editingItem) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      setAutoMetaNote(null);
      return;
    }
    const inferred = inferCatalogDefaultsForCode(trimmed);
    setDept(inferred.department);
    setSpecimen(inferred.specimenType);
    setTube(inferred.tubeType);
    setTemp(inferred.temperatureRequirement);
    if (inferred.suggestedName && (!name.trim() || name.trim() === autoSuggestedName)) {
      setName(inferred.suggestedName);
      setAutoSuggestedName(inferred.suggestedName);
    }
    setAutoMetaNote(
      `Auto-detected: ${inferred.department} • ${TUBE_METADATA[inferred.tubeType].label} • ${formatLabel(inferred.temperatureRequirement)}`
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanCode || !name.trim()) return;

    const extraCodes = customCodesInput
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const mergedIncludedCodes =
      itemType === 'PACKAGE' ? Array.from(new Set([...includedCodes, ...extraCodes])) : undefined;

    if (itemType === 'PACKAGE' && (!mergedIncludedCodes || mergedIncludedCodes.length < 2)) {
      onShowAlert({
        variant: 'warning',
        title: 'Select Package Tests',
        message: 'A Health Package must include at least 2 test codes so bookings can auto-match it.',
      });
      return;
    }

    setSaving(true);
    try {
      if (mode === 'LARGE_LAB') {
        const ownerKey = fixedOrgId || 'LARGE_HUB';
        const docId = isEditingOwned && editingItem ? editingItem.id : `${ownerKey}__${cleanCode}`;
        await onSave({
          id: docId,
          code: cleanCode,
          name: name.trim(),
          itemType,
          includedTestCodes: mergedIncludedCodes,
          department: dept,
          specimenType: specimen,
          tubeType: tube,
          temperatureRequirement: temp,
          tatHours: Number(tat) || 4,
          largeLabB2bRateInr: Number(largeLabRate) || 0,
          b2bPriceInr: Number(b2bPrice) || 250,
          mrpInr: Number(mrp) || 500,
          ownerOrgId: ownerKey,
          labId: ownerKey,
          labName: fixedOrgName || 'Reference Lab Hub',
        });
      } else {
        const ownerOrg =
          ownerOrgId !== 'GLOBAL' ? largeLabOrgs.find((l) => l.id === ownerOrgId) : undefined;
        const docId =
          editingItem?.id || (ownerOrg ? `${ownerOrg.id}__${cleanCode}` : cleanCode);
        await onSave({
          id: docId,
          code: cleanCode,
          name: name.trim(),
          itemType,
          includedTestCodes: mergedIncludedCodes,
          department: dept,
          specimenType: specimen,
          tubeType: tube,
          temperatureRequirement: temp,
          tatHours: Number(tat) || 4,
          b2bPriceInr: Number(b2bPrice) || 250,
          largeLabB2bRateInr: Number(largeLabRate) || 0,
          mrpInr: Number(mrp) || 500,
          ownerOrgId: ownerOrg ? ownerOrg.id : undefined,
          labId: ownerOrg ? ownerOrg.id : undefined,
          labName: ownerOrg ? ownerOrg.name : 'Global Network Default',
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const modalTitle =
    mode === 'LARGE_LAB'
      ? isEditingOwned
        ? 'Edit Partner Rate Card Item'
        : itemType === 'PACKAGE'
        ? 'Publish B2B Combo Package'
        : 'Publish B2B Test Panel'
      : editingItem
      ? 'Edit Catalogue Item'
      : itemType === 'PACKAGE'
      ? 'Add Partner Health Package'
      : 'Add Test Panel';

  const submitLabel =
    mode === 'LARGE_LAB'
      ? isEditingOwned
        ? 'Update Tariff'
        : 'Publish to Rate Card'
      : editingItem
      ? 'Update Item'
      : 'Save Catalogue Item';

  const activeMarkupPct = getMarkupPct(ownerOrgId);

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      title={modalTitle}
      maxWidth="600px"
      disableClose={saving}
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div style={{ display: 'grid', gridTemplateColumns: mode === 'ADMIN' ? '1fr 1fr' : '1fr', gap: '10px' }}>
          {mode === 'ADMIN' && (
            <div className="form-group">
              <label className="form-label">Catalogue Owner (Reference Lab)</label>
              <select
                className="form-select"
                value={ownerOrgId}
                disabled={Boolean(editingItem)}
                onChange={(e) => {
                  const nextOwner = e.target.value;
                  setOwnerOrgId(nextOwner);
                  if (!editingItem && !b2bManualOverride && largeLabRate > 0) {
                    const mPct = getMarkupPct(nextOwner);
                    setB2bPrice(Math.round(largeLabRate * (1 + mPct / 100)));
                  }
                }}
              >
                <option value="GLOBAL">Global Network Default</option>
                {largeLabOrgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Item Type</label>
            <select
              className="form-select"
              value={itemType}
              onChange={(e) => setItemType(e.target.value as CatalogItemType)}
            >
              <option value="TEST">Individual Diagnostic Test</option>
              <option value="PACKAGE">Combo Health Package</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
          <div className="form-group">
            <label className="form-label">Code</label>
            <input
              className="form-input"
              placeholder={itemType === 'PACKAGE' ? 'e.g. EXEC5' : 'e.g. CBC'}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input
              className="form-input"
              placeholder={itemType === 'PACKAGE' ? 'Master Wellness Panel' : 'Complete Blood Count'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        </div>

        {autoMetaNote && !editingItem && (
          <div
            style={{
              fontSize: '0.76rem',
              padding: '8px 10px',
              borderRadius: '8px',
              background: '#EFF6FF',
              color: '#1D4ED8',
              marginBottom: '10px',
              border: '1px solid #BFDBFE',
            }}
          >
            ✨ {autoMetaNote}
          </div>
        )}

        {itemType === 'PACKAGE' && (
          <div
            className="form-group"
            style={{
              background: '#F8FAFC',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
            }}
          >
            <label className="form-label">Included Individual Tests (used for auto package matching)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {Array.from(new Set(singleTestsCatalog.map((t) => t.code))).map((c) => {
                const active = includedCodes.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    className={active ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                    onClick={() =>
                      setIncludedCodes((prev) =>
                        prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                      )
                    }
                  >
                    {active ? '✓ ' : '+ '}
                    {c}
                  </button>
                );
              })}
            </div>
            <input
              className="form-input"
              placeholder="Additional codes comma-separated (e.g. TSH, HBA1C)"
              value={customCodesInput}
              onChange={(e) => setCustomCodesInput(e.target.value)}
            />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="form-group">
            <label className="form-label">Department</label>
            <select
              className="form-select"
              value={dept}
              onChange={(e) => setDept(e.target.value as DiagnosticDepartment)}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Specimen Type</label>
            <select
              className="form-select"
              value={specimen}
              onChange={(e) => setSpecimen(e.target.value as SpecimenType)}
            >
              {Object.values(SpecimenType).map((s) => (
                <option key={s} value={s}>
                  {formatLabel(s)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="form-group">
            <label className="form-label">Required Vacutainer / Tube</label>
            <select
              className="form-select"
              value={tube}
              onChange={(e) => setTube(e.target.value as TubeType)}
            >
              {Object.values(TubeType).map((t) => (
                <option key={t} value={t}>
                  {TUBE_METADATA[t].label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Cold-Chain Band</label>
            <select
              className="form-select"
              value={temp}
              onChange={(e) => setTemp(e.target.value as StorageTemperature)}
            >
              {Object.values(StorageTemperature).map((t) => (
                <option key={t} value={t}>
                  {formatLabel(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
          <div className="form-group">
            <label className="form-label">{mode === 'LARGE_LAB' ? 'Your B2B Rate (₹)' : 'Large Lab Rate (₹)'}</label>
            <input
              type="number"
              className="form-input"
              value={largeLabRate}
              onChange={(e) => {
                const v = Number(e.target.value);
                setLargeLabRate(v);
                if (!editingItem && !b2bManualOverride && Number.isFinite(v) && v > 0) {
                  setB2bPrice(Math.round(v * (1 + activeMarkupPct / 100)));
                }
              }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{mode === 'LARGE_LAB' ? 'Small Lab Price (₹)' : 'Small Lab Pays (₹)'}</label>
            <input
              type="number"
              className="form-input"
              value={b2bPrice}
              onChange={(e) => {
                setB2bManualOverride(true);
                setB2bPrice(Number(e.target.value));
              }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Retail MRP (₹)</label>
            <input
              type="number"
              className="form-input"
              value={mrp}
              onChange={(e) => setMrp(Number(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">TAT (Hrs)</label>
            <input
              type="number"
              className="form-input"
              value={tat}
              onChange={(e) => setTat(Number(e.target.value))}
            />
          </div>
        </div>

        <div
          style={{
            fontSize: '0.8rem',
            padding: '10px 12px',
            borderRadius: '8px',
            background: '#F0FDFA',
            color: '#0F766E',
            marginBottom: '12px',
          }}
        >
          Platform Spread Margin: <strong>{formatInr(Math.max(0, b2bPrice - largeLabRate))}</strong> (
          {b2bPrice > 0 ? Math.round(((b2bPrice - largeLabRate) / b2bPrice) * 100) : 0}% of Small Lab Tariff)
          {!editingItem && !b2bManualOverride && (
            <span style={{ display: 'block', fontSize: '0.73rem', marginTop: '3px', color: '#0E7490' }}>
              Auto-calculated using +{activeMarkupPct}% B2B markup. Edit Small Lab Price to override manually.
            </span>
          )}
        </div>

        <div className="modal-footer" style={{ padding: 0, borderTop: 'none' }}>
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : submitLabel}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
