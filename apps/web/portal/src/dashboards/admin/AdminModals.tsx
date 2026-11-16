import { type FormEvent, useEffect, useState } from 'react';
import {
  ADMIN_SUB_ROLE_LABELS,
  type AdminTeamRole,
  formatInr,
  type LabFacility,
  type PhlebotomistProfile,
  type PickupOrder,
  ROLE_LABELS,
  type ServiceZoneRecord,
  type SettlementRecord,
  type UserProfile,
  UserRole,
} from '@diagnostic/shared';
import { InteractiveMapPicker } from '../../components/InteractiveMapPicker';
import { LiveTrackingMap } from '../../components/LiveTrackingMap';
import { ModalFrame, PasswordInputWithGenerator } from '../../components/shared';
import { assignPhlebotomistZone } from '../../services/firestoreService';
import { releasePartnerPayoutApi } from '../../services/razorpayCheckout';
import { setManagedUserInitialPasswordApi } from '../../services/orgApiService';
import { type AlertTriggerFn, type CredentialSlipData, type FormatLabelFn } from '../types';
import { type AdminPasswordTarget } from './adminTypes';

export interface AdminEditUserModalProps {
  user: UserProfile | null;
  onClose: () => void;
  isSuperAdmin: boolean;
  largeLabOrgs: LabFacility[];
  onSave: (updates: {
    adminSubRole?: AdminTeamRole;
    labId?: string;
    parentLabId?: string;
  }) => Promise<void>;
}

export function AdminEditUserModal({
  user,
  onClose,
  isSuperAdmin,
  largeLabOrgs,
  onSave,
}: AdminEditUserModalProps) {
  const [adminSubRole, setAdminSubRole] = useState<AdminTeamRole>('OPS_DISPATCH');
  const [labId, setLabId] = useState('');
  const [parentLabId, setParentLabId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setAdminSubRole(user.adminSubRole || 'OPS_DISPATCH');
    setLabId(user.labId || '');
    setParentLabId(user.parentLabId || '');
  }, [user]);

  if (!user) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await onSave({
        adminSubRole: user.role === UserRole.ADMIN ? adminSubRole : undefined,
        labId:
          user.role === UserRole.SMALL_LAB || user.role === UserRole.LARGE_LAB
            ? labId.trim() || undefined
            : undefined,
        parentLabId: user.role === UserRole.LARGE_LAB ? parentLabId.trim() || undefined : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame
      open={Boolean(user)}
      onClose={onClose}
      title={`Edit Access • ${user.displayName}`}
      disableClose={saving}
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
        <p style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: '12px' }}>
          {user.email} • <strong>{ROLE_LABELS[user.role]}</strong>
        </p>
        {user.role === UserRole.ADMIN && (
          <div className="form-group">
            <label className="form-label">Admin Team Sub-Role</label>
            <select
              className="form-select"
              value={adminSubRole}
              onChange={(e) => setAdminSubRole(e.target.value as AdminTeamRole)}
            >
              {(Object.keys(ADMIN_SUB_ROLE_LABELS) as AdminTeamRole[])
                .filter((sr) => sr !== 'SUPER_ADMIN' || isSuperAdmin)
                .map((sr) => (
                  <option key={sr} value={sr}>{ADMIN_SUB_ROLE_LABELS[sr]}</option>
                ))}
            </select>
          </div>
        )}
        {(user.role === UserRole.SMALL_LAB || user.role === UserRole.LARGE_LAB) && (
          <div className="form-group">
            <label className="form-label">Assigned Lab / Center ID</label>
            <input className="form-input" value={labId} onChange={(e) => setLabId(e.target.value)} required />
          </div>
        )}
        {user.role === UserRole.LARGE_LAB && (
          <div className="form-group">
            <label className="form-label">Parent Large Lab HQ (Leave blank if this user is Main Hub HQ)</label>
            <select
              className="form-select"
              value={parentLabId}
              onChange={(e) => setParentLabId(e.target.value)}
            >
              <option value="">None (Main Reference Hub HQ)</option>
              {largeLabOrgs.map((org) => (
                <option key={org.id} value={org.id}>{org.name} ({org.id})</option>
              ))}
            </select>
          </div>
        )}
        <div className="modal-footer" style={{ padding: 0, borderTop: 'none', marginTop: '12px' }}>
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Access Changes'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export interface AdminSetPasswordModalProps {
  target: AdminPasswordTarget | null;
  onClose: () => void;
  bearerToken?: string;
  onSuccessSlip: (slip: CredentialSlipData) => void;
  onShowAlert: AlertTriggerFn;
}

export function AdminSetPasswordModal({
  target,
  onClose,
  bearerToken,
  onSuccessSlip,
  onShowAlert,
}: AdminSetPasswordModalProps) {
  const [pwdInput, setPwdInput] = useState('');
  const [showPwd, setShowPwd] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setPwdInput('');
    setShowPwd(true);
    setNotifyEmail(true);
  }, [target]);

  if (!target) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!target || pwdInput.trim().length < 6) return;
    const enteredPwd = pwdInput.trim();
    setSaving(true);
    try {
      const res = await setManagedUserInitialPasswordApi(
        target.email,
        {
          password: enteredPwd,
          mustChangePassword: true,
          sendNotificationEmail: notifyEmail,
        },
        bearerToken
      );
      onClose();
      onSuccessSlip({
        title: 'Onboarding Credentials Ready',
        name: target.name,
        email: target.email,
        userCode: res.data?.userCode || target.userCode || '',
        roleLabel: target.roleLabel,
        initialPassword: enteredPwd,
        passwordConfigured: true,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Password Setup Failed',
        message: (err as Error).message || 'Could not configure initial password.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame
      open={Boolean(target)}
      onClose={onClose}
      title={`${target.hasPassword ? 'Reset Initial Password' : 'Set Initial Password'} • ${target.name}`}
      maxWidth="500px"
      disableClose={saving}
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '12px' }}>
          Account: <strong>{target.email}</strong>
          {target.userCode ? ` (${target.userCode})` : ''} • {target.roleLabel}
        </div>
        <div className="form-group">
          <label className="form-label">New Initial Password</label>
          <PasswordInputWithGenerator
            value={pwdInput}
            onChange={setPwdInput}
            showPassword={showPwd}
            onToggleShow={() => setShowPwd((v) => !v)}
            placeholder="Minimum 6 characters"
            required
            minLength={6}
            disabled={saving}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer', marginBottom: '12px' }}>
          <input
            type="checkbox"
            checked={notifyEmail}
            onChange={(e) => setNotifyEmail(e.target.checked)}
          />
          Send notification email that sign-in password has been configured
        </label>
        <div className="modal-footer" style={{ padding: 0, borderTop: 'none' }}>
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving || pwdInput.trim().length < 6}>
            {saving ? 'Saving...' : 'Save Initial Password'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export interface AdminAssignCourierModalProps {
  order: PickupOrder | null;
  phlebotomists: PhlebotomistProfile[];
  formatLabel: FormatLabelFn;
  onClose: () => void;
  onAssign: (phlebotomistId: string) => Promise<void>;
}

export function AdminAssignCourierModal({
  order,
  phlebotomists,
  formatLabel,
  onClose,
  onAssign,
}: AdminAssignCourierModalProps) {
  const [selectedPhleboId, setSelectedPhleboId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!order) return;
    setSelectedPhleboId(order.phlebotomistId || phlebotomists[0]?.id || '');
  }, [order, phlebotomists]);

  if (!order) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedPhleboId) return;
    setSaving(true);
    try {
      await onAssign(selectedPhleboId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame
      open={Boolean(order)}
      onClose={onClose}
      title={`Assign Phlebotomist • ${order.orderNumber}`}
      disableClose={saving}
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
        {phlebotomists.length === 0 ? (
          <p>No phlebotomists registered yet. Add one first in Phlebotomists.</p>
        ) : (
          <div className="form-group">
            <label className="form-label">Select Phlebotomist</label>
            <select
              className="form-select"
              value={selectedPhleboId}
              onChange={(e) => setSelectedPhleboId(e.target.value)}
            >
              {phlebotomists.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.id}) — {formatLabel(p.status)}</option>
              ))}
            </select>
          </div>
        )}
        <div className="modal-footer" style={{ padding: 0, borderTop: 'none', marginTop: '12px' }}>
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving || !phlebotomists.length}>
            {saving ? 'Assigning...' : 'Confirm Assignment'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export interface AdminCourierDetailsModalProps {
  courier: PhlebotomistProfile | null;
  onClose: () => void;
  formatLabel: FormatLabelFn;
  onOpenAssignZone?: (courier: PhlebotomistProfile) => void;
}

export function AdminCourierDetailsModal({
  courier,
  onClose,
  formatLabel,
  onOpenAssignZone,
}: AdminCourierDetailsModalProps) {
  if (!courier) return null;

  const assignedZoneDisplay = courier.assignedZoneName
    ? `${courier.assignedZoneCode ? `${courier.assignedZoneCode} • ` : ''}${courier.assignedZoneName}${
        courier.assignedCity ? ` (${courier.assignedCity})` : ''
      }`
    : 'Zone Pending (Admin)';

  return (
    <ModalFrame
      open={Boolean(courier)}
      onClose={onClose}
      title={`Courier Details: ${courier.name}`}
      subtitle={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="user-code-badge">{courier.userCode || courier.id}</span>
          <span className={courier.status === 'ONLINE' ? 'status-pill-green' : 'status-pill-amber'}>
            {formatLabel(courier.status)}
          </span>
        </div>
      }
      maxWidth="640px"
      bodyStyle={{ maxHeight: '78vh' }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px', fontSize: '0.86rem' }}>
        <div><strong>Admin-Assigned Zone:</strong> {assignedZoneDisplay}</div>
        <div><strong>Live Telemetry Label:</strong> {courier.currentLocation || '—'}</div>
        <div><strong>Cooler Box Temp:</strong> {courier.chillerTempCelsius}°C</div>
        <div><strong>Battery:</strong> {courier.batteryPct}%</div>
        <div><strong>Vehicle:</strong> {courier.vehicleInfo || 'Cold-Chain Two-Wheeler'}</div>
      </div>
      {onOpenAssignZone && (
        <div style={{ marginBottom: '12px' }}>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: '7px 14px', fontSize: '0.82rem' }}
            onClick={() => onOpenAssignZone(courier)}
          >
            🗺️ Assign / Change Admin Operating Zone
          </button>
        </div>
      )}
      {typeof courier.latitude === 'number' && typeof courier.longitude === 'number' && (
        <LiveTrackingMap
          pickupLocation={{
            latitude: courier.latitude,
            longitude: courier.longitude,
            address: courier.currentLocation,
            label: `${courier.name} Base / Current Zone`,
          }}
          phleboLocation={{
            latitude: courier.latitude,
            longitude: courier.longitude,
            name: `${courier.name} (${courier.userCode || courier.id})`,
            updatedAt: courier.updatedAt,
          }}
          heightPx={260}
        />
      )}
    </ModalFrame>
  );
}

export interface AdminAssignPhleboZoneModalProps {
  courier: PhlebotomistProfile | null;
  serviceZones: ServiceZoneRecord[];
  actorEmail: string;
  onClose: () => void;
  onShowAlert: AlertTriggerFn;
}

export function AdminAssignPhleboZoneModal({
  courier,
  serviceZones,
  actorEmail,
  onClose,
  onShowAlert,
}: AdminAssignPhleboZoneModalProps) {
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [baseLat, setBaseLat] = useState<number>(19.124);
  const [baseLng, setBaseLng] = useState<number>(72.866);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!courier) return;
    const matched =
      (courier.assignedZoneId
        ? serviceZones.find((z) => z.id === courier.assignedZoneId)
        : undefined) ||
      (courier.assignedZoneCode
        ? serviceZones.find(
            (z) => z.zoneCode.toUpperCase() === courier.assignedZoneCode?.toUpperCase()
          )
        : undefined) ||
      serviceZones.find((z) => z.isActive) ||
      serviceZones[0];
    setSelectedZoneId(matched?.id || '');
    setBaseLat(
      typeof courier.latitude === 'number'
        ? courier.latitude
        : matched?.centerLatitude ?? 19.124
    );
    setBaseLng(
      typeof courier.longitude === 'number'
        ? courier.longitude
        : matched?.centerLongitude ?? 72.866
    );
  }, [courier, serviceZones]);

  if (!courier) return null;
  const chosenZone = serviceZones.find((z) => z.id === selectedZoneId) || null;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!courier) return;
    if (!chosenZone) {
      onShowAlert({
        variant: 'warning',
        title: 'Select Service Zone',
        message: 'Create or choose a dynamic Service Zone first under Area Expansion Zones.',
      });
      return;
    }
    setSaving(true);
    try {
      await assignPhlebotomistZone({
        phleboId: courier.id,
        phleboEmail: courier.email,
        phleboName: courier.name,
        zone: chosenZone,
        latitude: baseLat,
        longitude: baseLng,
        actorEmail,
      });
      onClose();
      onShowAlert({
        variant: 'success',
        title: 'Phlebo Operating Zone Updated',
        message: `${courier.name} (${courier.userCode || courier.id}) is now dynamically locked to ${chosenZone.zoneCode} • ${chosenZone.name} (${chosenZone.radiusKm} km radar).`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Zone Assignment Failed',
        message: err instanceof Error ? err.message : 'Unable to save zone assignment.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame
      open={Boolean(courier)}
      onClose={onClose}
      title={`Assign Operating Zone • ${courier.name}`}
      subtitle={`Courier ID: ${courier.userCode || courier.id} • Phlebotomists cannot override zones on Mobile App`}
      maxWidth="660px"
      disableClose={saving}
      bodyStyle={{ maxHeight: '78vh' }}
    >
      <form onSubmit={(e) => void handleSave(e)}>
        <div className="form-group">
          <label className="form-label">Admin Service Zone (Live Dynamic Zones)</label>
          {serviceZones.length === 0 ? (
            <div className="admin-auth-alert warning">
              No dynamic Service Zones exist yet. Create a zone in <strong>Area Expansion Zones</strong> first.
            </div>
          ) : (
            <select
              className="form-select"
              value={selectedZoneId}
              onChange={(e) => {
                const z = serviceZones.find((item) => item.id === e.target.value);
                setSelectedZoneId(e.target.value);
                if (z) {
                  setBaseLat(z.centerLatitude);
                  setBaseLng(z.centerLongitude);
                }
              }}
              required
            >
              <option value="">Choose service zone...</option>
              {serviceZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.zoneCode} — {z.name} ({z.city} • {z.radiusKm} km){z.isActive ? '' : ' [PAUSED]'}
                </option>
              ))}
            </select>
          )}
        </div>

        {chosenZone && (
          <div
            style={{
              background: chosenZone.isActive ? '#F0FDFA' : '#FEF3C7',
              border: `1px solid ${chosenZone.isActive ? '#99F6E4' : '#FDE68A'}`,
              borderRadius: '10px',
              padding: '10px 12px',
              marginBottom: '12px',
              fontSize: '0.8rem',
              color: '#0F172A',
            }}
          >
            <div>
              <strong>{chosenZone.zoneCode} • {chosenZone.name}</strong> ({chosenZone.city})
            </div>
            <div style={{ color: '#475569', marginTop: '2px' }}>
              Radar Radius: <strong>{chosenZone.radiusKm} km</strong> • Phase: <strong>{chosenZone.launchPhase}</strong>
              {chosenZone.pincodes?.length ? ` • Pincodes: ${chosenZone.pincodes.join(', ')}` : ''}
            </div>
          </div>
        )}

        <div style={{ marginBottom: '12px' }}>
          <InteractiveMapPicker
            latitude={baseLat}
            longitude={baseLng}
            heightPx={220}
            title="Zone Base GPS Coordinates for Rider Radar"
            subtitle="Defaults to zone centroid — drag or search to set specific starting dispatch hub"
            onChange={(loc) => {
              setBaseLat(loc.latitude);
              setBaseLng(loc.longitude);
            }}
          />
        </div>

        <div className="modal-footer" style={{ padding: 0, borderTop: 'none' }}>
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving || serviceZones.length === 0}>
            {saving ? 'Syncing Zone...' : 'Save & Sync Zone to Mobile App'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export interface AdminPayoutReleaseModalProps {
  settlement: SettlementRecord | null;
  initialRecipientType: 'LARGE_LAB' | 'PHLEBOTOMIST' | 'BOTH';
  onClose: () => void;
  onShowAlert: AlertTriggerFn;
}

export function AdminPayoutReleaseModal({
  settlement,
  initialRecipientType,
  onClose,
  onShowAlert,
}: AdminPayoutReleaseModalProps) {
  const hasPhlebo = Boolean(settlement?.phlebotomistId);
  const effectiveInitialType =
    initialRecipientType === 'BOTH' && !hasPhlebo
      ? 'LARGE_LAB'
      : initialRecipientType === 'PHLEBOTOMIST' && !hasPhlebo
      ? 'LARGE_LAB'
      : initialRecipientType;

  const [recipientType, setRecipientType] = useState<'LARGE_LAB' | 'PHLEBOTOMIST' | 'BOTH'>(effectiveInitialType);
  const [mode, setMode] = useState<'UPI' | 'IMPS' | 'NEFT' | 'RAZORPAYX'>('UPI');
  const [referenceId, setReferenceId] = useState('');
  const [notes, setNotes] = useState('');
  const [forceUnpaid, setForceUnpaid] = useState(false);
  const [waiveCourier, setWaiveCourier] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!settlement) return;
    const canPayPhlebo = Boolean(settlement.phlebotomistId);
    const resolvedType =
      initialRecipientType === 'BOTH' && !canPayPhlebo
        ? 'LARGE_LAB'
        : initialRecipientType === 'PHLEBOTOMIST' && !canPayPhlebo
        ? 'LARGE_LAB'
        : initialRecipientType;
    setRecipientType(resolvedType);
    setMode('UPI');
    setReferenceId('');
    setNotes('');
    setWaiveCourier(false);
    setForceUnpaid(settlement.paymentStatus !== 'PAID');
  }, [settlement, initialRecipientType]);

  if (!settlement) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settlement) return;
    setSubmitting(true);
    if (recipientType === 'PHLEBOTOMIST' && !settlement.phlebotomistId && !waiveCourier) {
      setSubmitting(false);
      onShowAlert({
        variant: 'warning',
        title: 'Courier Not Assigned',
        message: `Please assign a Field Phlebotomist to order ${settlement.orderNumber} under Dispatch before releasing courier payout. Or check "Waive courier fee" below if this was directly delivered by lab.`,
      });
      return;
    }

    const effectiveType =
      recipientType === 'BOTH' && !settlement.phlebotomistId ? 'LARGE_LAB' : recipientType;

    try {
      const res = await releasePartnerPayoutApi({
        settlementId: settlement.id,
        recipientType: effectiveType,
        mode,
        referenceId: referenceId.trim() || undefined,
        notes: notes.trim() || undefined,
        forceWithoutCollection: forceUnpaid,
        waiveCourierPayout: waiveCourier,
      });
      const count = res?.data?.payouts?.length ?? 1;
      onClose();
      onShowAlert({
        variant: 'success',
        title: 'Partner Payout Released',
        message:
          res.message ||
          `Released ${count} payout transfer(s) for ${settlement.orderNumber}.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Payout Failed',
        message:
          err instanceof Error
            ? err.message
            : 'Could not release payout. Please verify details and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalFrame
      open={Boolean(settlement)}
      onClose={onClose}
      title={`Release Payout • ${settlement.orderNumber}`}
      disableClose={submitting}
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', marginBottom: '14px', fontSize: '0.84rem' }}>
          <div><strong>Invoice:</strong> {settlement.id} • Gross: {formatInr(settlement.grossAmountInr)}</div>
          <div><strong>Reference Lab Share:</strong> {settlement.targetLabName} — {formatInr(settlement.labPayoutInr)}</div>
          <div>
            <strong>Courier Share:</strong> {settlement.phlebotomistName || 'Unassigned'} — {formatInr(settlement.phleboPayoutInr)}
          </div>
          <div style={{ marginTop: '4px' }}>
            <strong>Customer Collection:</strong>{' '}
            {settlement.paymentStatus === 'PAID'
              ? `Paid Online (${settlement.razorpayPaymentId || 'Verified'})`
              : 'Pending Customer Payment'}
          </div>
        </div>

        {!hasPhlebo && (
          <div
            style={{
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '14px',
              fontSize: '0.82rem',
              color: '#1E40AF',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>
              ℹ️ Field Courier not yet assigned to Order {settlement.orderNumber}
            </div>
            <div>
              You can release the Reference Lab's testing share ({formatInr(settlement.labPayoutInr)}) now. The courier payout ({formatInr(settlement.phleboPayoutInr)}) remains due until a courier is assigned.
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '10px',
                paddingTop: '8px',
                borderTop: '1px dashed #BFDBFE',
                fontWeight: 600,
                color: '#1E3A8A',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={waiveCourier}
                onChange={(e) => setWaiveCourier(e.target.checked)}
              />
              <span>Waive courier fee (Direct lab drop / Self-delivered by small lab — no courier needed)</span>
            </label>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Payout Recipient</label>
          <select
            className="form-select"
            value={recipientType}
            onChange={(e) =>
              setRecipientType(e.target.value as 'LARGE_LAB' | 'PHLEBOTOMIST' | 'BOTH')
            }
          >
            <option value="LARGE_LAB">
              Reference Lab Only ({formatInr(settlement.labPayoutInr)})
            </option>
            <option value="BOTH" disabled={!hasPhlebo && !waiveCourier}>
              Both Reference Lab &amp; Field Phlebotomist {!hasPhlebo && !waiveCourier ? '(Disabled — No Courier Assigned)' : waiveCourier ? '(Courier Waived)' : ''}
            </option>
            <option value="PHLEBOTOMIST" disabled={!hasPhlebo && !waiveCourier}>
              Field Phlebotomist Only ({formatInr(settlement.phleboPayoutInr)}) {!hasPhlebo && !waiveCourier ? '(Disabled — No Courier Assigned)' : waiveCourier ? '(Waive)' : ''}
            </option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Transfer Method</label>
          <select
            className="form-select"
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as 'UPI' | 'IMPS' | 'NEFT' | 'RAZORPAYX')
            }
          >
            <option value="UPI">UPI Instant Transfer</option>
            <option value="IMPS">IMPS Bank Transfer</option>
            <option value="NEFT">NEFT Settlement</option>
            <option value="RAZORPAYX">Automated Payout (RazorpayX)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">UTR / Transfer Reference (Optional — auto-generated if blank)</label>
          <input
            className="form-input"
            placeholder="e.g. UTR3241984712"
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Settlement Notes (Optional)</label>
          <input
            className="form-input"
            placeholder="e.g. Daily partner batch settlement"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {settlement.paymentStatus !== 'PAID' && (
          <label className="checkbox-row" style={{ marginTop: '8px', marginBottom: '12px', background: '#FEF3C7', padding: '10px', borderRadius: '8px' }}>
            <input
              type="checkbox"
              checked={forceUnpaid}
              onChange={(e) => setForceUnpaid(e.target.checked)}
            />
            <span style={{ fontSize: '0.8rem', color: '#92400E' }}>
              Customer payment is still marked Unpaid. Approve releasing payout anyway.
            </span>
          </label>
        )}

        {recipientType === 'PHLEBOTOMIST' && !hasPhlebo && (
          <div
            style={{
              background: '#FEF2F2',
              border: '1px solid #FCA5A5',
              borderRadius: '8px',
              padding: '10px 12px',
              marginBottom: '12px',
              fontSize: '0.8rem',
              color: '#991B1B',
            }}
          >
            ⚠️ Cannot release courier payout: No Field Courier is assigned to order {settlement.orderNumber} yet. Please assign a courier to this order first or choose &quot;Reference Lab Only&quot;.
          </div>
        )}

        <div className="modal-footer" style={{ padding: 0, borderTop: 'none' }}>
          <button type="button" className="btn-secondary" disabled={submitting} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || (recipientType === 'PHLEBOTOMIST' && !hasPhlebo)}
          >
            {submitting ? 'Releasing Payout...' : 'Confirm & Release Payout'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
