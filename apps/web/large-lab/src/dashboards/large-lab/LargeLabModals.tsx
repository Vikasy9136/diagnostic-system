import { type FormEvent } from 'react';
import {
  type PickupOrder,
  SpecimenQualityStatus,
  TUBE_METADATA,
  TubeType,
} from '@diagnostic/shared';
import { InteractiveMapPicker } from '../../components/InteractiveMapPicker';
import { ModalFrame, PasswordInputWithGenerator } from '../../components/shared';
import { type FormatLabelFn } from '../types';

export interface LargeLabQcModalProps {
  qcOrder: PickupOrder | null;
  onClose: () => void;
  qcTemp: string;
  onQcTempChange: (val: string) => void;
  qcQuality: SpecimenQualityStatus;
  onQcQualityChange: (val: SpecimenQualityStatus) => void;
  qcRejectReason: string;
  onQcRejectReasonChange: (val: string) => void;
  submittingQc: boolean;
  onSubmitQc: (e: FormEvent, decision: 'ACCEPT' | 'REJECT') => Promise<void>;
  formatLabel: FormatLabelFn;
}

export function LargeLabQcModal({
  qcOrder,
  onClose,
  qcTemp,
  onQcTempChange,
  qcQuality,
  onQcQualityChange,
  qcRejectReason,
  onQcRejectReasonChange,
  submittingQc,
  onSubmitQc,
  formatLabel,
}: LargeLabQcModalProps) {
  if (!qcOrder) return null;

  return (
    <ModalFrame
      open={Boolean(qcOrder)}
      onClose={onClose}
      title={`Specimen QC Check • ${qcOrder.orderNumber}`}
      maxWidth="620px"
      disableClose={submittingQc}
    >
      <form onSubmit={(e) => void onSubmitQc(e, 'ACCEPT')}>
        <div
          style={{
            background: '#F8FAFC',
            padding: '12px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            marginBottom: '14px',
          }}
        >
          <div style={{ fontSize: '0.82rem', marginBottom: '8px' }}>
            <strong>Source:</strong> {qcOrder.smallLabName} &rarr; <strong>Receiving Center:</strong>{' '}
            {qcOrder.targetLabName}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {qcOrder.specimens.map((s) => {
              const tubeMeta = TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
              return (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.78rem',
                    background: '#FFF',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="tube-cap-pill" style={{ background: tubeMeta.bgHex, color: tubeMeta.colorHex }}>
                      <span className="tube-cap-dot" style={{ background: tubeMeta.colorHex }} />
                      {tubeMeta.capColorName}
                    </span>
                    <strong>{s.testCode}</strong>
                    <code>{s.scannedBarcode || s.barcode}</code>
                  </div>
                  <span
                    className={
                      s.validationStatus === 'VERIFIED'
                        ? 'status-pill-green'
                        : s.validationStatus === 'MISMATCH'
                        ? 'status-pill-red'
                        : 'status-pill-amber'
                    }
                  >
                    {s.validationStatus === 'VERIFIED'
                      ? 'Barcode Matched'
                      : s.validationStatus === 'MISMATCH'
                      ? 'Tube Mismatch'
                      : 'Not Scanned'}
                  </span>
                </div>
              );
            })}
          </div>
          {qcOrder.sampleCollectionPhotoUrl && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 700, marginBottom: '6px' }}>
                Phlebotomist Collection Photo
              </div>
              <a href={qcOrder.sampleCollectionPhotoUrl} target="_blank" rel="noreferrer">
                <img
                  src={qcOrder.sampleCollectionPhotoUrl}
                  alt="Collected sample tubes"
                  className="sample-proof-thumb"
                />
              </a>
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Arrival Cooler Temperature (°C)</label>
          <input
            type="number"
            step="0.1"
            className="form-input"
            value={qcTemp}
            onChange={(e) => onQcTempChange(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Specimen Integrity Status</label>
          <select
            className="form-select"
            value={qcQuality}
            onChange={(e) => onQcQualityChange(e.target.value as SpecimenQualityStatus)}
          >
            {Object.values(SpecimenQualityStatus).map((st) => (
              <option key={st} value={st}>
                {formatLabel(st)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Rejection Reason (Only if rejecting specimen)</label>
          <input
            className="form-input"
            placeholder="e.g. Hemolyzed sample or temperature excursion"
            value={qcRejectReason}
            onChange={(e) => onQcRejectReasonChange(e.target.value)}
          />
        </div>

        <div className="modal-footer" style={{ padding: 0, borderTop: 'none', marginTop: '8px' }}>
          <button
            type="button"
            className="labsetu-alert-btn-danger"
            disabled={submittingQc}
            onClick={(e) => void onSubmitQc(e, 'REJECT')}
          >
            Reject Specimen
          </button>
          <button type="submit" className="btn-primary" disabled={submittingQc}>
            {submittingQc ? 'Saving...' : 'Accept & Accession'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export interface LargeLabAddBranchModalProps {
  open: boolean;
  onClose: () => void;
  previewBranchId: string;
  defaultContactEmail: string;
  branchName: string;
  onBranchNameChange: (val: string) => void;
  branchManagerName: string;
  onBranchManagerNameChange: (val: string) => void;
  branchLat: number;
  branchLng: number;
  onBranchLocationChange: (loc: {
    latitude: number;
    longitude: number;
    city?: string;
    address?: string;
    pincode?: string;
  }) => void;
  branchCity: string;
  onBranchCityChange: (val: string) => void;
  branchPincode: string;
  onBranchPincodeChange: (val: string) => void;
  branchPhone: string;
  onBranchPhoneChange: (val: string) => void;
  branchAddress: string;
  onBranchAddressChange: (val: string) => void;
  branchCreateLogin: boolean;
  onBranchCreateLoginChange: (checked: boolean) => void;
  branchEmail: string;
  onBranchEmailChange: (val: string) => void;
  branchPassword: string;
  onBranchPasswordChange: (val: string) => void;
  showBranchPassword: boolean;
  onToggleShowBranchPassword: () => void;
  savingBranch: boolean;
  onSubmitBranch: (e: FormEvent) => Promise<void>;
}

export function LargeLabAddBranchModal({
  open,
  onClose,
  previewBranchId,
  defaultContactEmail,
  branchName,
  onBranchNameChange,
  branchManagerName,
  onBranchManagerNameChange,
  branchLat,
  branchLng,
  onBranchLocationChange,
  branchCity,
  onBranchCityChange,
  branchPincode,
  onBranchPincodeChange,
  branchPhone,
  onBranchPhoneChange,
  branchAddress,
  onBranchAddressChange,
  branchCreateLogin,
  onBranchCreateLoginChange,
  branchEmail,
  onBranchEmailChange,
  branchPassword,
  onBranchPasswordChange,
  showBranchPassword,
  onToggleShowBranchPassword,
  savingBranch,
  onSubmitBranch,
}: LargeLabAddBranchModalProps) {
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      title="Add Collection Center / Branch"
      subtitle={
        <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Auto-Assigned Branch ID:</span>
          <span className="user-code-badge">{previewBranchId}</span>
        </div>
      }
      maxWidth="680px"
      disableClose={savingBranch}
    >
      <form onSubmit={(e) => void onSubmitBranch(e)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div className="form-group">
            <label className="form-label">Branch / Center Name</label>
            <input
              className="form-input"
              placeholder="e.g. Metro Diagnostics - Thane Branch"
              value={branchName}
              onChange={(e) => onBranchNameChange(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Branch Contact / Manager Name (Optional)</label>
            <input
              className="form-input"
              placeholder="e.g. Dr. Sneha Patil"
              value={branchManagerName}
              onChange={(e) => onBranchManagerNameChange(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <InteractiveMapPicker
            latitude={branchLat}
            longitude={branchLng}
            heightPx={210}
            title="Pin Branch Location (Google Maps)"
            subtitle="Search address or tap map to autofill City, Pincode & Street Address"
            onChange={onBranchLocationChange}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          <div className="form-group">
            <label className="form-label">City</label>
            <input
              className="form-input"
              value={branchCity}
              onChange={(e) => onBranchCityChange(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Pincode</label>
            <input
              className="form-input"
              placeholder="e.g. 400601"
              value={branchPincode}
              onChange={(e) => onBranchPincodeChange(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input
              className="form-input"
              placeholder="+91 98..."
              value={branchPhone}
              onChange={(e) => onBranchPhoneChange(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Full Branch Address</label>
          <input
            className="form-input"
            value={branchAddress}
            onChange={(e) => onBranchAddressChange(e.target.value)}
            required
          />
        </div>

        <div
          style={{
            background: '#F8FAFC',
            border: '1px solid #CBD5E1',
            borderRadius: '10px',
            padding: '12px',
            marginTop: '6px',
            marginBottom: '14px',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              color: '#0F172A',
            }}
          >
            <input
              type="checkbox"
              checked={branchCreateLogin}
              onChange={(e) => onBranchCreateLoginChange(e.target.checked)}
            />
            Create dedicated Branch Portal login + Initial Password for {previewBranchId}
          </label>
          {branchCreateLogin ? (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Branch Login Email (Required)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. thane.branch@metrolabs.in"
                  value={branchEmail}
                  onChange={(e) => onBranchEmailChange(e.target.value)}
                  required={branchCreateLogin}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Initial Sign-In Password (Stored securely in Auth Vault)</label>
                <PasswordInputWithGenerator
                  value={branchPassword}
                  onChange={onBranchPasswordChange}
                  showPassword={showBranchPassword}
                  onToggleShow={onToggleShowBranchPassword}
                  placeholder="Min 6 chars — or leave blank for Email OTP / Google"
                />
                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                  Branch staff can sign in immediately using Branch ID <strong>{previewBranchId}</strong> or email +
                  this initial password. Plaintext passwords are never written to database tables.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '8px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Branch Contact Email (Optional — defaults to HQ email)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder={defaultContactEmail}
                  value={branchEmail}
                  onChange={(e) => onBranchEmailChange(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ padding: 0, borderTop: 'none' }}>
          <button type="button" className="btn-secondary" disabled={savingBranch} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={savingBranch}>
            {savingBranch
              ? 'Provisioning Branch...'
              : branchCreateLogin
              ? 'Register Branch & Create Login'
              : 'Register Branch'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
