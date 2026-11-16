import { type FormEvent } from 'react';
import {
  type EmailDeliverySettings,
  type PlatformSlaConfig,
  type SupportContactsConfig,
} from '@diagnostic/shared';

export interface AdminSettingsTabProps {
  profileEmail: string;
  slaConfig: PlatformSlaConfig;
  onSlaConfigChange: (next: PlatformSlaConfig) => void;
  emailSettings: EmailDeliverySettings;
  onEmailSettingsChange: (next: EmailDeliverySettings) => void;
  supportContacts: SupportContactsConfig;
  onSupportContactsChange: (next: SupportContactsConfig) => void;
  onSaveSettings: () => Promise<void>;
  newAccountPassword: string;
  onNewAccountPasswordChange: (val: string) => void;
  confirmAccountPassword: string;
  onConfirmAccountPasswordChange: (val: string) => void;
  savingPassword: boolean;
  onUpdateAccountPassword: (e: FormEvent) => Promise<void>;
  onSendTestNotification: () => Promise<void>;
  notifStatusMsg: string | null;
  onStorageUploadTest: (file: File | undefined) => Promise<void>;
  storageStatusMsg: string | null;
}

export function AdminSettingsTab({
  profileEmail,
  slaConfig,
  onSlaConfigChange,
  emailSettings,
  onEmailSettingsChange,
  supportContacts,
  onSupportContactsChange,
  onSaveSettings,
  newAccountPassword,
  onNewAccountPasswordChange,
  confirmAccountPassword,
  onConfirmAccountPasswordChange,
  savingPassword,
  onUpdateAccountPassword,
  onSendTestNotification,
  notifStatusMsg,
  onStorageUploadTest,
  storageStatusMsg,
}: AdminSettingsTabProps) {
  return (
    <div className="settings-grid-2">
      {/* 1. Pickup Targets & Email Alert Settings */}
      <div className="chart-card-modern">
        <h2 className="card-top-title">Pickup Targets &amp; Email Preferences</h2>
        <div style={{ marginTop: '16px' }}>
          <div className="form-group">
            <label className="form-label">Urgent Pickup Target (Minutes)</label>
            <input
              type="number"
              className="form-input"
              value={slaConfig.statPickupSlaMinutes}
              onChange={(e) => onSlaConfigChange({ ...slaConfig, statPickupSlaMinutes: Number(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Auto-Reassign Delay (Minutes)</label>
            <input
              type="number"
              className="form-input"
              value={slaConfig.autoReassignDelayMinutes}
              onChange={(e) => onSlaConfigChange({ ...slaConfig, autoReassignDelayMinutes: Number(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Admin Alert Email</label>
            <input
              type="email"
              className="form-input"
              value={emailSettings.adminEmail}
              onChange={(e) => onEmailSettingsChange({ ...emailSettings, adminEmail: e.target.value })}
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void onSaveSettings()}
          >
            Save Settings
          </button>
        </div>
      </div>

      {/* 2. Account Password Setting */}
      <div className="chart-card-modern">
        <h2 className="card-top-title">Account Sign-In Password</h2>
        <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '4px' }}>
          Set or change the password for <strong>{profileEmail}</strong>.
        </p>
        <form onSubmit={(e) => void onUpdateAccountPassword(e)} style={{ marginTop: '14px' }}>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Minimum 6 characters"
              value={newAccountPassword}
              onChange={(e) => onNewAccountPasswordChange(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Re-enter password"
              value={confirmAccountPassword}
              onChange={(e) => onConfirmAccountPasswordChange(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={savingPassword}>
            {savingPassword ? 'Updating...' : 'Set / Update Password'}
          </button>
        </form>
      </div>

      {/* 3. Real-Time Support Desk & Field Phlebo Emergency Contacts */}
      <div className="chart-card-modern" style={{ gridColumn: 'span 2' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 className="card-top-title">Platform Support Desk &amp; Field Emergency Contacts</h2>
            <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '4px' }}>
              These live contacts sync directly to the Phlebotomist Mobile App (Help &amp; Support screen) and partner portals in real-time. Zero dummy numbers.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void onSaveSettings()}
          >
            Save Support Contacts
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
          <div className="form-group">
            <label className="form-label">Toll-Free Emergency SOS Helpline (Raw tel: format)</label>
            <input
              type="text"
              className="form-input"
              placeholder="+9118008897388"
              value={supportContacts?.emergencyPhone || ''}
              onChange={(e) => onSupportContactsChange({ ...supportContacts, emergencyPhone: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Emergency Helpline Display Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="1800-889-SETU (1800-889-7388)"
              value={supportContacts?.displayEmergencyPhone || ''}
              onChange={(e) => onSupportContactsChange({ ...supportContacts, displayEmergencyPhone: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Direct Dispatch Mobile &amp; WhatsApp (Raw format)</label>
            <input
              type="text"
              className="form-input"
              placeholder="+919820012345"
              value={supportContacts?.dispatchMobile || ''}
              onChange={(e) => onSupportContactsChange({ ...supportContacts, dispatchMobile: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Dispatch Mobile Display Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="+91 98200 12345"
              value={supportContacts?.displayDirectMobile || ''}
              onChange={(e) => onSupportContactsChange({ ...supportContacts, displayDirectMobile: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Official Support Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="support@labsetu.com"
              value={supportContacts?.supportEmail || ''}
              onChange={(e) => onSupportContactsChange({ ...supportContacts, supportEmail: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Support Operating Hours</label>
            <input
              type="text"
              className="form-input"
              placeholder="6:00 AM – 11:00 PM (All 7 Days)"
              value={supportContacts?.operatingHours || ''}
              onChange={(e) => onSupportContactsChange({ ...supportContacts, operatingHours: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label className="form-label">Dispatch SLA Guarantee</label>
            <input
              type="text"
              className="form-input"
              placeholder="< 5 Mins Immediate Dispatch Response"
              value={supportContacts?.dispatchSla || ''}
              onChange={(e) => onSupportContactsChange({ ...supportContacts, dispatchSla: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* 4. Live Test Notification Check */}
      <div className="chart-card-modern" style={{ gridColumn: 'span 2' }}>
        <h2 className="card-top-title">Document Upload &amp; Email Check</h2>
        <div style={{ marginTop: '16px' }}>
          <button type="button" className="btn-primary" onClick={() => void onSendTestNotification()}>
            Send Live Test Email &amp; Alert
          </button>
          {notifStatusMsg && <p style={{ fontSize: '0.8rem', color: '#0F766E', marginTop: '8px' }}>{notifStatusMsg}</p>}
          <div className="form-group" style={{ marginTop: '20px' }}>
            <label className="form-label">Test Document Upload</label>
            <input type="file" className="form-input" onChange={(e) => void onStorageUploadTest(e.target.files?.[0])} />
            {storageStatusMsg && <p style={{ fontSize: '0.78rem', marginTop: '8px', wordBreak: 'break-all' }}>{storageStatusMsg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
