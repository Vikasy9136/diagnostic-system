import { useState } from 'react';
import {
  type PhlebotomistProfile,
  type ServiceZoneRecord,
  type UserProfile,
  UserRole,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';
import { type FormatLabelFn } from '../types';
import { type AdminPasswordTarget } from './adminTypes';
import { PhleboKYCInspectModal } from './PhleboKYCInspectModal';

export interface AdminPhlebotomistsTabProps {
  phlebotomists: PhlebotomistProfile[];
  managedUsers: UserProfile[];
  serviceZones: ServiceZoneRecord[];
  formatLabel: FormatLabelFn;
  onOpenAddUserModal: (role: UserRole) => void;
  onSelectCourier: (courier: PhlebotomistProfile) => void;
  onOpenAssignZone: (courier: PhlebotomistProfile) => void;
  onOpenSetPasswordDialog: (target: AdminPasswordTarget) => void;
  onVerifyPhlebo?: (phleboId: string) => Promise<void> | void;
}

export function AdminPhlebotomistsTab({
  phlebotomists,
  managedUsers,
  serviceZones,
  formatLabel,
  onOpenAddUserModal,
  onSelectCourier,
  onOpenAssignZone,
  onOpenSetPasswordDialog,
  onVerifyPhlebo,
}: AdminPhlebotomistsTabProps) {
  const [inspectPhlebo, setInspectPhlebo] = useState<PhlebotomistProfile | null>(null);

  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <div>
          <h2 className="card-top-title">Field Phlebotomist Fleet ({phlebotomists.length})</h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
            KYC compliance review, live webcam photos, admin-assigned service zones &amp; credential dispatch
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => onOpenAddUserModal(UserRole.PHLEBOTOMIST)}>
          + Add Phlebotomist
        </button>
      </div>

      {phlebotomists.length === 0 ? (
        <EmptyStateBox
          title="No Phlebotomists in Fleet"
          description="Onboard a field phlebotomist with KYC documents, live camera portrait, admin service zone, and mobile app credentials."
          actionLabel="+ Add Phlebotomist"
          onAction={() => onOpenAddUserModal(UserRole.PHLEBOTOMIST)}
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email / Phone</th>
                <th>Verification &amp; KYC</th>
                <th>Shift</th>
                <th>Admin-Assigned Zone</th>
                <th>Live Telemetry</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {phlebotomists.map((p) => {
                const matchedUser = managedUsers.find(
                  (u) => u.email.toLowerCase() === (p.email || '').trim().toLowerCase()
                );
                const hasPwd = Boolean(matchedUser?.initialPasswordSet);
                const isVerified = p.verified && p.verificationStatus === 'VERIFIED';
                const assignedZone =
                  (p.assignedZoneId
                    ? serviceZones.find((z) => z.id === p.assignedZoneId)
                    : undefined) ||
                  (p.assignedZoneCode
                    ? serviceZones.find(
                        (z) => z.zoneCode.toUpperCase() === p.assignedZoneCode?.toUpperCase()
                      )
                    : undefined);
                const zoneName = assignedZone?.name || p.assignedZoneName;
                const zoneCode = assignedZone?.zoneCode || p.assignedZoneCode;
                const zoneCity = assignedZone?.city || p.assignedCity;
                const docCount = p.documents?.length || 0;

                return (
                  <tr key={p.id}>
                    <td>
                      <span className="user-code-badge">{p.userCode || p.id}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {p.livePhotoUrl ? (
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              overflow: 'hidden',
                              border: '1.5px solid #0D9488',
                              flexShrink: 0,
                            }}
                          >
                            <img
                              src={p.livePhotoUrl}
                              alt={p.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: '#F1F5F9',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.9rem',
                              flexShrink: 0,
                            }}
                          >
                            👤
                          </div>
                        )}
                        <div>
                          <strong style={{ display: 'block', color: '#0F172A' }}>{p.name}</strong>
                          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {p.vehicleInfo || 'Cold-Chain Two-Wheeler'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>{p.email}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{p.phone || '—'}</div>
                    </td>

                    {/* Verification & KYC Status Column */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className={isVerified ? 'status-pill-green' : 'status-pill-amber'}>
                          {isVerified ? '✓ Verified' : '⏳ Pending Review'}
                        </span>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: p.livePhotoUrl ? '#ECFDF5' : '#FEF2F2',
                              color: p.livePhotoUrl ? '#065F46' : '#991B1B',
                              fontWeight: 600,
                            }}
                          >
                            {p.livePhotoUrl ? '📷 Live Photo' : '⚠️ No Photo'}
                          </span>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: docCount > 0 ? '#EFF6FF' : '#FEF2F2',
                              color: docCount > 0 ? '#1E40AF' : '#991B1B',
                              fontWeight: 600,
                            }}
                          >
                            📄 {docCount} Docs
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Shift */}
                    <td>
                      <span className={p.status === 'ONLINE' ? 'status-pill-green' : 'status-pill-amber'}>
                        {formatLabel(p.status)}
                      </span>
                    </td>

                    {/* Assigned Zone */}
                    <td>
                      {zoneName || zoneCode ? (
                        <div>
                          <span className={assignedZone?.isActive === false ? 'status-pill-amber' : 'status-pill-green'}>
                            {zoneCode ? `${zoneCode} • ` : ''}{zoneName || 'Assigned'}
                            {assignedZone?.isActive === false ? ' (Paused)' : ''}
                          </span>
                          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '3px' }}>
                            {zoneCity ? `${zoneCity}` : ''}
                            {assignedZone ? ` • ${assignedZone.radiusKm} km radar` : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="status-pill-amber">Zone Pending (Admin)</span>
                      )}
                    </td>

                    {/* Live Telemetry */}
                    <td>
                      <div>{p.currentLocation || 'Active Service Area'}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {p.batteryPct ? `🔋 ${p.batteryPct}% • ` : ''}Active Field Location
                      </div>
                    </td>

                    {/* Action Column */}
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.74rem',
                            background: '#0F766E',
                            borderColor: '#0D9488',
                          }}
                          onClick={() => setInspectPhlebo(p)}
                        >
                          🔍 Review KYC
                        </button>

                        {!isVerified && onVerifyPhlebo && (
                          <button
                            type="button"
                            className="btn-primary"
                            style={{
                              padding: '4px 8px',
                              fontSize: '0.74rem',
                              background: '#10B981',
                              borderColor: '#059669',
                            }}
                            onClick={() => {
                              const confirmVerify = window.confirm(
                                `Approve and verify ${p.name}?\n\nThis will mark the phlebotomist verified and dispatch login credentials and mobile app steps to ${p.email}.`
                              );
                              if (confirmVerify) {
                                void onVerifyPhlebo(p.id);
                              }
                            }}
                          >
                            ✓ Verify
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                          onClick={() => onOpenAssignZone(p)}
                        >
                          🗺️ {zoneName || zoneCode ? 'Change Zone' : 'Assign Zone'}
                        </button>

                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                          onClick={() => onSelectCourier(p)}
                        >
                          Telemetry
                        </button>

                        {p.email && (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                            onClick={() =>
                              onOpenSetPasswordDialog({
                                email: p.email,
                                name: p.name,
                                userCode: p.userCode || p.id,
                                roleLabel: 'Field Phlebotomist',
                                hasPassword: hasPwd,
                              })
                            }
                          >
                            🔑 {hasPwd ? 'Reset Pwd' : 'Set Pwd'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* KYC and Live Photo Inspection Modal */}
      {inspectPhlebo && (
        <PhleboKYCInspectModal
          open={Boolean(inspectPhlebo)}
          phlebo={inspectPhlebo}
          onClose={() => setInspectPhlebo(null)}
          onVerify={onVerifyPhlebo}
          onOpenSetPassword={(phlebo) =>
            onOpenSetPasswordDialog({
              email: phlebo.email,
              name: phlebo.name,
              userCode: phlebo.userCode || phlebo.id,
              roleLabel: 'Field Phlebotomist',
              hasPassword: false,
            })
          }
        />
      )}
    </div>
  );
}
