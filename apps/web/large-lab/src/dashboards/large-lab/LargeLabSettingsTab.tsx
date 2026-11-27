import { type FormEvent } from 'react';
import { InteractiveMapPicker } from '../../components/InteractiveMapPicker';

export interface LargeLabSettingsTabProps {
  settingsName: string;
  onSettingsNameChange: (val: string) => void;
  settingsLat: number;
  settingsLng: number;
  onLocationChange: (loc: {
    latitude: number;
    longitude: number;
    address?: string;
    city?: string;
    pincode?: string;
  }) => void;
  settingsCity: string;
  onSettingsCityChange: (val: string) => void;
  settingsPincode: string;
  onSettingsPincodeChange: (val: string) => void;
  settingsAddress: string;
  onSettingsAddressChange: (val: string) => void;
  settingsNabl: string;
  onSettingsNablChange: (val: string) => void;
  settingsCutoff: string;
  onSettingsCutoffChange: (val: string) => void;
  payoutMethod?: 'UPI' | 'BANK_TRANSFER';
  onPayoutMethodChange?: (method: 'UPI' | 'BANK_TRANSFER') => void;
  payoutHolderName?: string;
  onPayoutHolderNameChange?: (val: string) => void;
  payoutUpiId?: string;
  onPayoutUpiIdChange?: (val: string) => void;
  payoutBankLast4?: string;
  onPayoutBankLast4Change?: (val: string) => void;
  payoutIfsc?: string;
  onPayoutIfscChange?: (val: string) => void;
  onSubmitSettings: (e: FormEvent) => Promise<void>;
}

export function LargeLabSettingsTab({
  settingsName,
  onSettingsNameChange,
  settingsLat,
  settingsLng,
  onLocationChange,
  settingsCity,
  onSettingsCityChange,
  settingsPincode,
  onSettingsPincodeChange,
  settingsAddress,
  onSettingsAddressChange,
  settingsNabl,
  onSettingsNablChange,
  settingsCutoff,
  onSettingsCutoffChange,
  onSubmitSettings,
}: LargeLabSettingsTabProps) {
  return (
    <div className="chart-card-modern" style={{ maxWidth: '680px' }}>
      <h2 className="card-top-title">Reference Hub Facility Settings</h2>
      <form style={{ marginTop: '16px' }} onSubmit={(e) => void onSubmitSettings(e)}>
        <div className="form-group">
          <label className="form-label">Hub / Center Display Name</label>
          <input
            className="form-input"
            value={settingsName}
            onChange={(e) => onSettingsNameChange(e.target.value)}
            required
          />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <InteractiveMapPicker
            latitude={settingsLat}
            longitude={settingsLng}
            heightPx={230}
            title="Pin Reference Hub Location (Google Maps)"
            subtitle="Search address, tap map, or drag marker to autofill Address, City & Pincode"
            onChange={onLocationChange}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="form-group">
            <label className="form-label">City</label>
            <input
              className="form-input"
              value={settingsCity}
              onChange={(e) => onSettingsCityChange(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Pincode</label>
            <input
              className="form-input"
              placeholder="e.g. 400053"
              value={settingsPincode}
              onChange={(e) => onSettingsPincodeChange(e.target.value)}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Address</label>
          <input
            className="form-input"
            value={settingsAddress}
            onChange={(e) => onSettingsAddressChange(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">NABL Accreditation</label>
          <input
            className="form-input"
            value={settingsNabl}
            onChange={(e) => onSettingsNablChange(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Daily Sample Cutoff</label>
          <input
            className="form-input"
            value={settingsCutoff}
            onChange={(e) => onSettingsCutoffChange(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary">
          Save Facility Location &amp; Profile
        </button>
      </form>
    </div>
  );
}

