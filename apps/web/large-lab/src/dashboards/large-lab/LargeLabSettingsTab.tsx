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
  payoutMethod: 'UPI' | 'BANK_TRANSFER';
  onPayoutMethodChange: (method: 'UPI' | 'BANK_TRANSFER') => void;
  payoutHolderName: string;
  onPayoutHolderNameChange: (val: string) => void;
  payoutUpiId: string;
  onPayoutUpiIdChange: (val: string) => void;
  payoutBankLast4: string;
  onPayoutBankLast4Change: (val: string) => void;
  payoutIfsc: string;
  onPayoutIfscChange: (val: string) => void;
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
  payoutMethod,
  onPayoutMethodChange,
  payoutHolderName,
  onPayoutHolderNameChange,
  payoutUpiId,
  onPayoutUpiIdChange,
  payoutBankLast4,
  onPayoutBankLast4Change,
  payoutIfsc,
  onPayoutIfscChange,
  onSubmitSettings,
}: LargeLabSettingsTabProps) {
  return (
    <div className="chart-card-modern" style={{ maxWidth: '680px' }}>
      <h2 className="card-top-title">Reference Hub Facility &amp; Payout Settings</h2>
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

        <div style={{ borderTop: '1px solid #E2E8F0', margin: '18px 0 14px', paddingTop: '14px' }}>
          <h3 style={{ fontSize: '0.96rem', fontWeight: 700, marginBottom: '12px' }}>Payout Account Details</h3>
          <div className="form-group">
            <label className="form-label">Preferred Settlement Method</label>
            <select
              className="form-select"
              value={payoutMethod}
              onChange={(e) => onPayoutMethodChange(e.target.value as 'UPI' | 'BANK_TRANSFER')}
            >
              <option value="UPI">UPI Transfer</option>
              <option value="BANK_TRANSFER">Bank Transfer (NEFT / IMPS)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Beneficiary / Business Account Name</label>
            <input
              className="form-input"
              placeholder="e.g. Metro Diagnostics Pvt Ltd"
              value={payoutHolderName}
              onChange={(e) => onPayoutHolderNameChange(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">UPI ID (Optional)</label>
            <input
              className="form-input"
              placeholder="e.g. labhub@icici"
              value={payoutUpiId}
              onChange={(e) => onPayoutUpiIdChange(e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Bank Account Last 4 Digits</label>
              <input
                className="form-input"
                maxLength={4}
                placeholder="e.g. 4821"
                value={payoutBankLast4}
                onChange={(e) => onPayoutBankLast4Change(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">IFSC Code</label>
              <input
                className="form-input"
                placeholder="e.g. HDFC0000123"
                value={payoutIfsc}
                onChange={(e) => onPayoutIfscChange(e.target.value.toUpperCase())}
              />
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary">
          Save Facility &amp; Payout Profile
        </button>
      </form>
    </div>
  );
}
