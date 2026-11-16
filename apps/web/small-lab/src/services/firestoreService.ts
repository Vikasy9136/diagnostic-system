import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  type AdminTeamRole,
  calculateHaversineDistanceKm,
  type CommissionConfig,
  computeOrderPricingSplit,
  type CreateManagedUserPayload,
  type CustodyEvent,
  CustodyEventType,
  deepCleanFirestorePayload,
  DEFAULT_COMMISSION_CONFIG as SHARED_DEFAULT_COMMISSION_CONFIG,
  DEFAULT_STARTER_SERVICE_ZONES,
  type DiagnosticReportRecord,
  type DiagnosticTestItem,
  type DropDestinationType,
  type EmailDeliverySettings,
  type EmailMetadataValue,
  type EmailTemplateType,
  evaluatePointServiceCoverage,
  generateRoleAssignedId,
  type LabCenterType,
  type LabFacility,
  type LabVerificationStatus,
  normalizeIdentifierCode,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  OrderPriority,
  OrderStatus,
  type PatientRecord,
  type PayoutProfile,
  type PayoutRecord,
  type PermissionCode,
  type PhlebotomistProfile,
  type PhlebotomistShiftStatus,
  type PickupOrder,
  type PlatformNotification,
  type PlatformSlaConfig,
  ROLE_LABELS,
  type ServiceZoneRecord,
  type SettlementRecord,
  SpecimenQualityStatus,
  type UserProfile,
  UserRole,
} from '@diagnostic/shared';
import {
  ADMIN_LOGIN_EMAIL,
  API_BASE_URL,
  auth,
  db,
  uploadDiagnosticDocument,
} from '../firebase';

export const DEFAULT_PLATFORM_SLA: PlatformSlaConfig = {
  temperatureRangeCelsius: { min: 2.0, max: 8.0 },
  statPickupSlaMinutes: 45,
  autoReassignDelayMinutes: 15,
  projectId: 'labsetu-diagnostics',
  updatedAt: new Date().toISOString(),
};

export const DEFAULT_COMMISSION_CONFIG: CommissionConfig = {
  ...SHARED_DEFAULT_COMMISSION_CONFIG,
  updatedAt: new Date().toISOString(),
};

function stripUndefinedFields<T>(val: T): T {
  return deepCleanFirestorePayload(val);
}

export const DEFAULT_EMAIL_SETTINGS: EmailDeliverySettings = {
  adminEmail: ADMIN_LOGIN_EMAIL,
  enableBookingEmails: true,
  enableColdChainAlerts: true,
  enableReportReadyEmails: true,
  enableDailySummaryEmails: true,
};

function currentBillingPeriod(): string {
  return new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function generateNumericOtp(digits = 5): string {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return String(Math.floor(min + Math.random() * (max - min)));
}

/**
 * Ensures root Platform Admin record & platform settings docs exist in Firestore cleanly
 * without creating any fake bookings, labs, or patients.
 */
export async function ensureRootAdminInitialized(
  uid: string,
  profile: UserProfile
): Promise<void> {
  if (profile.role !== UserRole.ADMIN) return;
  const normalized = profile.email.trim().toLowerCase();
  const now = new Date().toISOString();

  await setDoc(
    doc(db, 'user_directory', normalized),
    { ...profile, email: normalized, isActive: true, updatedAt: now },
    { merge: true }
  );

  await setDoc(
    doc(db, 'users', uid),
    { ...profile, id: uid, email: normalized, lastLoginAt: now, updatedAt: now },
    { merge: true }
  );

  const [platSnap, commSnap, notifSnap, zonesSnap] = await Promise.all([
    getDoc(doc(db, 'settings', 'platform')),
    getDoc(doc(db, 'settings', 'commission')),
    getDoc(doc(db, 'settings', 'notifications')),
    getDocs(collection(db, 'service_zones')),
  ]);

  if (!platSnap.exists()) {
    await setDoc(doc(db, 'settings', 'platform'), {
      ...DEFAULT_PLATFORM_SLA,
      updatedBy: normalized,
      updatedAt: now,
    });
  }
  if (!commSnap.exists()) {
    await setDoc(doc(db, 'settings', 'commission'), {
      ...DEFAULT_COMMISSION_CONFIG,
      updatedBy: normalized,
      updatedAt: now,
    });
  }
  if (!notifSnap.exists()) {
    await setDoc(doc(db, 'settings', 'notifications'), {
      ...DEFAULT_EMAIL_SETTINGS,
      updatedAt: now,
    });
  }
  if (zonesSnap.empty) {
    for (const zone of DEFAULT_STARTER_SERVICE_ZONES) {
      await setDoc(doc(db, 'service_zones', zone.id), zone, { merge: true });
    }
  }
}

// =========================================================================
// IDENTIFIER / ASSIGNED-ID AUTHENTICATION API HELPERS (ZERO EMAIL LEAKAGE)
// =========================================================================

const CLOUD_AUTH_API_BASE =
  'https://us-central1-labsetu-diagnostics.cloudfunctions.net/api/api/v1';

export class AuthApiRequestError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AuthApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function callPublicAuthEndpoint<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data: T; message?: string }> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const primaryUrl = `${API_BASE_URL.replace(/\/+$/, '')}${normalizedPath}`;
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'web',
    ...((options.headers as Record<string, string>) || {}),
  };

  let res: Response;
  let json: {
    success?: boolean;
    data?: T;
    message?: string;
    error?: { code?: string; message?: string; details?: Record<string, unknown> };
  } | null = null;

  try {
    res = await fetch(primaryUrl, { ...options, headers });
    json = await res.json().catch(() => null);
    if (isLocalHost && res.status >= 502 && !json) {
      res = await fetch(`${CLOUD_AUTH_API_BASE}${normalizedPath}`, { ...options, headers });
      json = await res.json().catch(() => null);
    }
  } catch {
    res = await fetch(`${CLOUD_AUTH_API_BASE}${normalizedPath}`, { ...options, headers });
    json = await res.json().catch(() => null);
  }

  if (!res.ok) {
    throw new AuthApiRequestError(
      json?.error?.message || json?.message || `Sign-in service returned ${res.status}.`,
      res.status,
      json?.error?.code,
      json?.error?.details
    );
  }

  if (!json?.data) {
    throw new AuthApiRequestError('Unexpected empty response from authentication service.', 500);
  }

  return { success: true, data: json.data, message: json.message };
}

export async function loginWithIdentifierApi(params: {
  identifier: string;
  password: string;
  portalRole?: UserRole;
  clientType?: 'WEB' | 'MOBILE';
}): Promise<{ customToken: string | null; devSessionToken?: string; userProfile: UserProfile }> {
  const res = await callPublicAuthEndpoint<{
    customToken: string | null;
    devSessionToken?: string;
    userProfile: UserProfile;
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: params.identifier.trim(),
      password: params.password,
      ...(params.portalRole ? { portalRole: params.portalRole } : {}),
      clientType: params.clientType || 'WEB',
    }),
  });
  return res.data;
}

export async function sendOtpApi(params: {
  identifier: string;
  portalRole?: UserRole;
  clientType?: 'WEB' | 'MOBILE';
}): Promise<{
  sent: boolean;
  deliveryMode: 'SMTP' | 'QUEUED_NO_SMTP';
  role: UserRole;
  maskedEmail: string;
}> {
  const res = await callPublicAuthEndpoint<{
    sent: boolean;
    deliveryMode: 'SMTP' | 'QUEUED_NO_SMTP';
    role: UserRole;
    maskedEmail: string;
  }>('/auth/otp/send', {
    method: 'POST',
    body: JSON.stringify({
      identifier: params.identifier.trim(),
      ...(params.portalRole ? { portalRole: params.portalRole } : {}),
      clientType: params.clientType || 'WEB',
    }),
  });
  return res.data;
}

export async function verifyOtpApi(params: {
  identifier: string;
  otp: string;
  portalRole?: UserRole;
  clientType?: 'WEB' | 'MOBILE';
}): Promise<{ customToken: string | null; devSessionToken?: string; userProfile: UserProfile }> {
  const res = await callPublicAuthEndpoint<{
    customToken: string | null;
    devSessionToken?: string;
    userProfile: UserProfile;
  }>('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({
      identifier: params.identifier.trim(),
      otp: params.otp.trim(),
      ...(params.portalRole ? { portalRole: params.portalRole } : {}),
      clientType: params.clientType || 'WEB',
    }),
  });
  return res.data;
}

export async function forgotPasswordApi(params: {
  identifier: string;
  origin?: string;
  portalRole?: UserRole;
  clientType?: 'WEB' | 'MOBILE';
}): Promise<{
  sent: boolean;
  deliveryMode: 'SMTP';
  role: UserRole;
  roleLabel: string;
  maskedEmail: string;
}> {
  const res = await callPublicAuthEndpoint<{
    sent: boolean;
    deliveryMode: 'SMTP';
    role: UserRole;
    roleLabel: string;
    maskedEmail: string;
  }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      identifier: params.identifier.trim(),
      origin: params.origin || (typeof window !== 'undefined' ? window.location.origin : ''),
      ...(params.portalRole ? { portalRole: params.portalRole } : {}),
      clientType: params.clientType || 'WEB',
    }),
  });
  return res.data;
}

export async function roleCheckApi(identifier: string): Promise<{
  provisioned: boolean;
  role: UserRole | null;
  isActive: boolean;
  maskedEmail: string | null;
}> {
  const res = await callPublicAuthEndpoint<{
    provisioned: boolean;
    role: UserRole | null;
    isActive: boolean;
    maskedEmail: string | null;
  }>(`/auth/role-check?identifier=${encodeURIComponent(identifier.trim())}`, {
    method: 'GET',
  });
  return res.data;
}

// =========================================================================
// OPERATIONAL SERVICE ZONES (PHASED AREA EXPANSION)
// =========================================================================

export function subscribeServiceZones(
  onData: (zones: ServiceZoneRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'service_zones'),
    (snap) => {
      if (snap.empty) {
        onData([...DEFAULT_STARTER_SERVICE_ZONES]);
        return;
      }
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<ServiceZoneRecord, 'id'>) }))
        .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      onData(list);
    },
    (err) => onError?.(err)
  );
}

export async function saveServiceZone(
  zone: Omit<ServiceZoneRecord, 'createdAt' | 'updatedAt'> & { createdAt?: string },
  actorEmail?: string
): Promise<ServiceZoneRecord> {
  const now = new Date().toISOString();
  const cleanCode = normalizeIdentifierCode(
    zone.zoneCode ||
    `ZONE-${String(zone.city || 'IND').slice(0, 3)}-${String(zone.name || 'NEW')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .slice(0, 14)}`
  );
  const id = normalizeIdentifierCode(zone.id || cleanCode) || `ZONE-${Date.now()}`;
  const full = stripUndefinedFields<ServiceZoneRecord>({
    ...zone,
    id,
    zoneCode: cleanCode,
    pincodes: Array.from(
      new Set(
        (zone.pincodes || [])
          .map((p) => String(p || '').replace(/\D/g, '').slice(0, 6))
          .filter((p) => p.length === 6)
      )
    ),
    radiusKm: Math.round(Math.min(100, Math.max(0.5, Number(zone.radiusKm || 5))) * 10) / 10,
    isActive: zone.isActive !== false && zone.launchPhase !== 'PAUSED',
    updatedBy: actorEmail || zone.updatedBy || ADMIN_LOGIN_EMAIL,
    createdBy: zone.createdBy || actorEmail || ADMIN_LOGIN_EMAIL,
    createdAt: zone.createdAt || now,
    updatedAt: now,
  });
  await setDoc(doc(db, 'service_zones', id), full, { merge: true });
  return full;
}

export async function toggleServiceZoneActive(
  zone: ServiceZoneRecord,
  isActive: boolean,
  actorEmail?: string
): Promise<void> {
  const now = new Date().toISOString();
  await setDoc(
    doc(db, 'service_zones', zone.id),
    {
      isActive,
      launchPhase: isActive
        ? zone.launchPhase === 'PAUSED'
          ? 'EXPANSION'
          : zone.launchPhase
        : 'PAUSED',
      updatedBy: actorEmail || ADMIN_LOGIN_EMAIL,
      updatedAt: now,
    },
    { merge: true }
  );
}

export async function deleteServiceZone(zoneId: string): Promise<void> {
  await deleteDoc(doc(db, 'service_zones', zoneId));
}

export function computeNextAssignedIdForRole(params: {
  role: UserRole;
  centerType?: LabCenterType | string;
  isEmployee?: boolean;
  existingCodes?: string[];
  preferredCode?: string;
}): string {
  return generateRoleAssignedId(params);
}

export function subscribeUserDirectory(
  onData: (users: UserProfile[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'user_directory'),
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as UserProfile)
        .filter((u) => Boolean(u?.email))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      onData(list);
    },
    (err) => onError?.(err)
  );
}

export function subscribeLabs(
  onData: (labs: LabFacility[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'labs'),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<LabFacility, 'id'>) }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      onData(list);
    },
    (err) => onError?.(err)
  );
}

export function subscribePhlebotomists(
  onData: (list: PhlebotomistProfile[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'phlebotomists'),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PhlebotomistProfile, 'id'>) }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      onData(list);
    },
    (err) => onError?.(err)
  );
}

export function subscribePatients(
  profile: UserProfile,
  onData: (list: PatientRecord[]) => void,
  onError?: (err: Error) => void,
  targetLabId?: string
): Unsubscribe {
  const colRef = collection(db, 'patients');
  const labId = targetLabId || (profile.role === UserRole.SMALL_LAB ? profile.labId : undefined);
  const q = labId
    ? query(colRef, where('smallLabId', '==', labId))
    : colRef;

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PatientRecord, 'id'>) }))
        .filter((p) => !labId || p.smallLabId === labId)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      onData(list);
    },
    (err) => onError?.(err)
  );
}

export function subscribeTestCatalog(
  onData: (tests: DiagnosticTestItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'test_catalog'),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<DiagnosticTestItem, 'id'>) }))
        .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      onData(list);
    },
    (err) => onError?.(err)
  );
}

export function subscribeOrders(
  profile: UserProfile,
  onData: (orders: PickupOrder[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, 'orders');

  if (profile.role === UserRole.PHLEBOTOMIST) {
    const phleboId = profile.phlebotomistId || '';
    const mapById = new Map<string, PickupOrder>();
    const emit = () => {
      onData(
        Array.from(mapById.values()).sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        )
      );
    };

    const unsubOpen = onSnapshot(
      query(
        colRef,
        where('status', '==', OrderStatus.READY_FOR_PICKUP),
        where('phlebotomistId', '==', '')
      ),
      (snap) => {
        for (const [k, v] of mapById.entries()) {
          if (v.status === OrderStatus.READY_FOR_PICKUP && !v.phlebotomistId) {
            mapById.delete(k);
          }
        }
        snap.docs.forEach((d) => {
          mapById.set(d.id, { id: d.id, ...(d.data() as Omit<PickupOrder, 'id'>) });
        });
        emit();
      },
      (err) => onError?.(err)
    );

    let unsubMine: Unsubscribe = () => { };
    if (phleboId) {
      unsubMine = onSnapshot(
        query(colRef, where('phlebotomistId', '==', phleboId)),
        (snap) => {
          for (const [k, v] of mapById.entries()) {
            if (v.phlebotomistId === phleboId) {
              mapById.delete(k);
            }
          }
          snap.docs.forEach((d) => {
            mapById.set(d.id, { id: d.id, ...(d.data() as Omit<PickupOrder, 'id'>) });
          });
          emit();
        },
        (err) => onError?.(err)
      );
    }

    return () => {
      unsubOpen();
      unsubMine();
    };
  }

  if (profile.role === UserRole.SMALL_LAB && profile.labId) {
    const mapById = new Map<string, PickupOrder>();
    const emit = () => {
      onData(
        Array.from(mapById.values()).sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        )
      );
    };
    const u1 = onSnapshot(
      query(colRef, where('smallLabId', '==', profile.labId)),
      (snap) => {
        snap.docs.forEach((d) => {
          mapById.set(d.id, { id: d.id, ...(d.data() as Omit<PickupOrder, 'id'>) });
        });
        emit();
      },
      (err) => onError?.(err)
    );
    const u2 = onSnapshot(
      query(colRef, where('targetLabId', '==', profile.labId)),
      (snap) => {
        snap.docs.forEach((d) => {
          mapById.set(d.id, { id: d.id, ...(d.data() as Omit<PickupOrder, 'id'>) });
        });
        emit();
      },
      (err) => onError?.(err)
    );
    return () => {
      u1();
      u2();
    };
  }

  if (profile.role === UserRole.LARGE_LAB && profile.labId) {
    const mapById = new Map<string, PickupOrder>();
    const emit = () => {
      onData(
        Array.from(mapById.values()).sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        )
      );
    };
    const u1 = onSnapshot(
      query(colRef, where('targetLabId', '==', profile.labId)),
      (snap) => {
        snap.docs.forEach((d) => {
          mapById.set(d.id, { id: d.id, ...(d.data() as Omit<PickupOrder, 'id'>) });
        });
        emit();
      },
      (err) => onError?.(err)
    );
    let u2: Unsubscribe = () => { };
    if (!profile.parentLabId) {
      u2 = onSnapshot(
        query(colRef, where('targetParentLabId', '==', profile.labId)),
        (snap) => {
          snap.docs.forEach((d) => {
            mapById.set(d.id, { id: d.id, ...(d.data() as Omit<PickupOrder, 'id'>) });
          });
          emit();
        },
        (err) => onError?.(err)
      );
    }
    return () => {
      u1();
      u2();
    };
  }

  return onSnapshot(
    query(colRef),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PickupOrder, 'id'>) }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      onData(list);
    },
    (err) => onError?.(err)
  );
}

export function subscribeReports(
  profile: UserProfile,
  onData: (list: DiagnosticReportRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, 'reports');

  if (profile.role === UserRole.SMALL_LAB && profile.labId) {
    const mapById = new Map<string, DiagnosticReportRecord>();
    const emit = () => {
      onData(
        Array.from(mapById.values()).sort((a, b) =>
          (b.verifiedAt || '').localeCompare(a.verifiedAt || '')
        )
      );
    };
    const u1 = onSnapshot(
      query(colRef, where('smallLabId', '==', profile.labId)),
      (snap) => {
        snap.docs.forEach((d) => {
          mapById.set(d.id, { id: d.id, ...(d.data() as Omit<DiagnosticReportRecord, 'id'>) });
        });
        emit();
      },
      (err) => onError?.(err)
    );
    const u2 = onSnapshot(
      query(colRef, where('targetLabId', '==', profile.labId)),
      (snap) => {
        snap.docs.forEach((d) => {
          mapById.set(d.id, { id: d.id, ...(d.data() as Omit<DiagnosticReportRecord, 'id'>) });
        });
        emit();
      },
      (err) => onError?.(err)
    );
    return () => {
      u1();
      u2();
    };
  }

  if (profile.role === UserRole.LARGE_LAB && profile.labId) {
    const mapById = new Map<string, DiagnosticReportRecord>();
    const emit = () => {
      onData(
        Array.from(mapById.values()).sort((a, b) =>
          (b.verifiedAt || '').localeCompare(a.verifiedAt || '')
        )
      );
    };
    const u1 = onSnapshot(
      query(colRef, where('targetLabId', '==', profile.labId)),
      (snap) => {
        snap.docs.forEach((d) => {
          mapById.set(d.id, { id: d.id, ...(d.data() as Omit<DiagnosticReportRecord, 'id'>) });
        });
        emit();
      },
      (err) => onError?.(err)
    );
    let u2: Unsubscribe = () => { };
    if (!profile.parentLabId) {
      u2 = onSnapshot(
        query(colRef, where('targetParentLabId', '==', profile.labId)),
        (snap) => {
          snap.docs.forEach((d) => {
            mapById.set(d.id, { id: d.id, ...(d.data() as Omit<DiagnosticReportRecord, 'id'>) });
          });
          emit();
        },
        (err) => onError?.(err)
      );
    }
    return () => {
      u1();
      u2();
    };
  }

  return onSnapshot(
    query(colRef),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<DiagnosticReportRecord, 'id'>) }))
        .sort((a, b) => (b.verifiedAt || '').localeCompare(a.verifiedAt || ''));
      onData(list);
    },
    (err) => onError?.(err)
  );
}

export function subscribeSettlements(
  profile: UserProfile,
  onData: (list: SettlementRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, 'settlements');
  if (profile.role === UserRole.LARGE_LAB && profile.labId) {
    const mapById = new Map<string, SettlementRecord>();
    const emit = () => {
      onData(
        Array.from(mapById.values()).sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        )
      );
    };
    const u1 = onSnapshot(
      query(colRef, where('targetLabId', '==', profile.labId)),
      (snap) => {
        snap.docs.forEach((d) => {
          mapById.set(d.id, { id: d.id, ...(d.data() as Omit<SettlementRecord, 'id'>) });
        });
        emit();
      },
      (err) => onError?.(err)
    );
    let u2: Unsubscribe = () => { };
    if (!profile.parentLabId) {
      u2 = onSnapshot(
        query(colRef, where('targetParentLabId', '==', profile.labId)),
        (snap) => {
          snap.docs.forEach((d) => {
            mapById.set(d.id, { id: d.id, ...(d.data() as Omit<SettlementRecord, 'id'>) });
          });
          emit();
        },
        (err) => onError?.(err)
      );
    }
    return () => {
      u1();
      u2();
    };
  }

  let q = query(colRef);

  if (profile.role === UserRole.SMALL_LAB && profile.labId) {
    q = query(colRef, where('smallLabId', '==', profile.labId));
  } else if (profile.role === UserRole.PHLEBOTOMIST) {
    if (!profile.phlebotomistId) {
      onData([]);
      return () => { };
    }
    q = query(colRef, where('phlebotomistId', '==', profile.phlebotomistId));
  }

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SettlementRecord, 'id'>) }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      onData(list);
    },
    (err) => onError?.(err)
  );
}

export function subscribePayouts(
  profile: UserProfile,
  onData: (list: PayoutRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, 'payouts');
  let q = query(colRef);

  if (profile.role === UserRole.LARGE_LAB && profile.labId) {
    q = query(
      colRef,
      where('recipientRole', '==', 'LARGE_LAB'),
      where('recipientId', '==', profile.labId)
    );
  } else if (profile.role === UserRole.PHLEBOTOMIST && profile.phlebotomistId) {
    q = query(
      colRef,
      where('recipientRole', '==', 'PHLEBOTOMIST'),
      where('recipientId', '==', profile.phlebotomistId)
    );
  } else if (profile.role === UserRole.SMALL_LAB) {
    onData([]);
    return () => { };
  }

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PayoutRecord, 'id'>) }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      onData(list);
    },
    (err) => onError?.(err)
  );
}

export function subscribeCustodyEvents(
  onData: (list: CustodyEvent[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'custody_events'),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<CustodyEvent, 'id'>) }))
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      onData(list);
    },
    (err) => onError?.(err)
  );
}

export function subscribeNotifications(
  profile: UserProfile,
  onData: (list: PlatformNotification[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, 'notifications');

  if (profile.role === UserRole.ADMIN) {
    return onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<PlatformNotification, 'id'>) }))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
          .slice(0, 40);
        onData(list);
      },
      (err) => onError?.(err)
    );
  }

  const normalized = profile.email.trim().toLowerCase();
  const byId = new Map<string, PlatformNotification>();
  const emit = () => {
    onData(
      Array.from(byId.values())
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 30)
    );
  };

  const mergeDocs = (docs: { id: string; data: () => unknown }[]) => {
    docs.forEach((d) => {
      const item = { id: d.id, ...(d.data() as Omit<PlatformNotification, 'id'>) };
      if (
        item.labId &&
        profile.labId &&
        profile.parentLabId &&
        item.labId !== profile.labId &&
        item.recipientEmail?.toLowerCase() !== normalized
      ) {
        return;
      }
      byId.set(d.id, item);
    });
    emit();
  };

  const u1 = onSnapshot(
    query(colRef, where('recipientRole', '==', profile.role)),
    (s) => mergeDocs(s.docs),
    (err) => onError?.(err)
  );
  const u2 = onSnapshot(
    query(colRef, where('recipientEmail', '==', normalized)),
    (s) => mergeDocs(s.docs),
    (err) => onError?.(err)
  );
  const u3 = onSnapshot(
    query(colRef, where('recipientRole', '==', 'ALL')),
    (s) => mergeDocs(s.docs),
    (err) => onError?.(err)
  );

  return () => {
    u1();
    u2();
    u3();
  };
}

export function subscribeSettings(
  onSla: (cfg: PlatformSlaConfig) => void,
  onCommission: (cfg: CommissionConfig) => void,
  onEmail: (cfg: EmailDeliverySettings) => void
): Unsubscribe {
  const u1 = onSnapshot(
    doc(db, 'settings', 'platform'),
    (snap) => {
      if (snap.exists()) {
        onSla({ ...DEFAULT_PLATFORM_SLA, ...(snap.data() as Partial<PlatformSlaConfig>) });
      }
    },
    (err) => console.warn('Platform settings sync skipped:', err.message)
  );
  const u2 = onSnapshot(
    doc(db, 'settings', 'commission'),
    (snap) => {
      if (snap.exists()) {
        onCommission({ ...DEFAULT_COMMISSION_CONFIG, ...(snap.data() as Partial<CommissionConfig>) });
      }
    },
    (err) => console.warn('Commission settings sync skipped:', err.message)
  );
  const u3 = onSnapshot(
    doc(db, 'settings', 'notifications'),
    (snap) => {
      if (snap.exists()) {
        onEmail({ ...DEFAULT_EMAIL_SETTINGS, ...(snap.data() as Partial<EmailDeliverySettings>) });
      }
    },
    (err) => console.warn('Notification settings sync skipped:', err.message)
  );

  return () => {
    u1();
    u2();
    u3();
  };
}

// =========================================================================
// MUTATIONS — 100% CLOUD FIRESTORE & FIREBASE STORAGE
// =========================================================================

export async function provisionRoleUser(
  bearerToken: string,
  payload: CreateManagedUserPayload,
  extra?: {
    createFacilityRecord?: boolean;
    city?: string;
    state?: string;
    address?: string;
    pincode?: string;
    latitude?: number;
    longitude?: number;
    serviceRadiusKm?: number;
    centerType?: LabCenterType;
    parentLabName?: string;
    nablNumber?: string;
    vehicleInfo?: string;
    existingCodes?: string[];
  }
): Promise<{ profile: UserProfile; apiSynced: boolean }> {
  const normalized = payload.email.trim().toLowerCase();
  const now = new Date().toISOString();

  const resolvedAdminSubRole: AdminTeamRole | undefined =
    payload.role === UserRole.ADMIN
      ? payload.adminSubRole || (payload.isSuperAdmin ? 'SUPER_ADMIN' : 'DEPARTMENT_EMPLOYEE')
      : undefined;

  const isEmpAdmin =
    payload.role === UserRole.ADMIN &&
    resolvedAdminSubRole === 'DEPARTMENT_EMPLOYEE' &&
    !payload.isSuperAdmin;

  const sequentialFallbackCode = generateRoleAssignedId({
    role: payload.role,
    centerType:
      extra?.centerType || (payload.parentLabId?.trim() ? 'COLLECTION_CENTER' : undefined),
    isEmployee: isEmpAdmin,
    existingCodes: extra?.existingCodes || [],
    preferredCode:
      payload.userCode?.trim() ||
      payload.labId?.trim() ||
      payload.phlebotomistId?.trim() ||
      payload.employeeId?.trim() ||
      undefined,
  });

  const manualLabId =
    payload.role === UserRole.SMALL_LAB || payload.role === UserRole.LARGE_LAB
      ? payload.labId?.trim()
      : undefined;
  const resolvedLabId =
    payload.role === UserRole.SMALL_LAB || payload.role === UserRole.LARGE_LAB
      ? manualLabId || sequentialFallbackCode
      : undefined;

  const resolvedParentLabId =
    payload.role === UserRole.LARGE_LAB && payload.parentLabId?.trim()
      ? payload.parentLabId.trim()
      : undefined;

  const manualPhleboId =
    payload.role === UserRole.PHLEBOTOMIST ? payload.phlebotomistId?.trim() : undefined;
  const resolvedPhleboId =
    payload.role === UserRole.PHLEBOTOMIST
      ? manualPhleboId || sequentialFallbackCode
      : undefined;

  const apiPayload: CreateManagedUserPayload = {
    ...payload,
    email: normalized,
    ...(resolvedAdminSubRole ? { adminSubRole: resolvedAdminSubRole } : {}),
    ...(manualLabId ? { labId: manualLabId } : {}),
    ...(resolvedParentLabId ? { parentLabId: resolvedParentLabId } : {}),
    ...(manualPhleboId ? { phlebotomistId: manualPhleboId } : {}),
  };

  let createdProfile: UserProfile | null = null;
  let apiSynced = false;
  let explicitHttpError: string | null = null;

  const CLOUD_FALLBACK_API =
    'https://us-central1-labsetu-diagnostics.cloudfunctions.net/api/api/v1';

  const requestHeaders = {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'WEB',
    Authorization: `Bearer ${bearerToken}`,
  };

  const tryCreateViaEndpoint = async (
    baseUrl: string
  ): Promise<{ handled: boolean; profile?: UserProfile; error?: string }> => {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/users`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(apiPayload),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.data) {
      return { handled: true, profile: json.data as UserProfile };
    }
    if (res.status >= 400 && res.status < 500 && res.status !== 404) {
      return {
        handled: true,
        error:
          json?.error?.message || json?.message || `Account provisioning blocked (${res.status}).`,
      };
    }
    return { handled: false };
  };

  try {
    const primaryAttempt = await tryCreateViaEndpoint(API_BASE_URL);
    if (primaryAttempt.profile) {
      createdProfile = primaryAttempt.profile;
      apiSynced = true;
    } else if (primaryAttempt.error) {
      explicitHttpError = primaryAttempt.error;
    } else if (!primaryAttempt.handled && API_BASE_URL !== CLOUD_FALLBACK_API) {
      const cloudAttempt = await tryCreateViaEndpoint(CLOUD_FALLBACK_API).catch(() => ({
        handled: false,
      }));
      if ('profile' in cloudAttempt && cloudAttempt.profile) {
        createdProfile = cloudAttempt.profile;
        apiSynced = true;
      } else if ('error' in cloudAttempt && cloudAttempt.error) {
        explicitHttpError = cloudAttempt.error;
      }
    }
  } catch {
    if (API_BASE_URL !== CLOUD_FALLBACK_API) {
      try {
        const cloudAttempt = await tryCreateViaEndpoint(CLOUD_FALLBACK_API);
        if (cloudAttempt.profile) {
          createdProfile = cloudAttempt.profile;
          apiSynced = true;
        } else if (cloudAttempt.error) {
          explicitHttpError = cloudAttempt.error;
        }
      } catch {
        // Direct data sync continues seamlessly when backend API is offline
      }
    }
  }

  if (explicitHttpError) {
    throw new Error(explicitHttpError);
  }

  const finalCode = normalizeIdentifierCode(
    createdProfile?.userCode ||
    createdProfile?.labId ||
    createdProfile?.phlebotomistId ||
    createdProfile?.employeeId ||
    sequentialFallbackCode
  );

  const fallbackProfile: UserProfile = {
    id: `usr-${normalized.replace(/[^a-z0-9]/g, '').slice(0, 12)}-${Date.now().toString(36)}`,
    email: normalized,
    userCode: finalCode,
    userCodeUpper: finalCode,
    displayName: apiPayload.displayName.trim(),
    role: apiPayload.role,
    ...(resolvedAdminSubRole ? { adminSubRole: resolvedAdminSubRole } : {}),
    ...(typeof apiPayload.isSuperAdmin === 'boolean'
      ? { isSuperAdmin: apiPayload.isSuperAdmin }
      : {}),
    ...(Array.isArray(apiPayload.founderRoles)
      ? { founderRoles: apiPayload.founderRoles }
      : {}),
    ...(apiPayload.founderSeatKey ? { founderSeatKey: apiPayload.founderSeatKey } : {}),
    ...(apiPayload.employeeId
      ? { employeeId: apiPayload.employeeId }
      : isEmpAdmin
        ? { employeeId: finalCode }
        : {}),
    ...(apiPayload.primaryDepartmentId
      ? { primaryDepartmentId: apiPayload.primaryDepartmentId }
      : {}),
    ...(Array.isArray(apiPayload.departmentIds)
      ? { departmentIds: apiPayload.departmentIds }
      : {}),
    ...(apiPayload.designationId ? { designationId: apiPayload.designationId } : {}),
    ...(apiPayload.designationTitle ? { designationTitle: apiPayload.designationTitle } : {}),
    ...(apiPayload.reportingManagerEmail
      ? { reportingManagerEmail: apiPayload.reportingManagerEmail }
      : {}),
    ...(apiPayload.reportingManagerName
      ? { reportingManagerName: apiPayload.reportingManagerName }
      : {}),
    ...(Array.isArray(apiPayload.responsibilities)
      ? { responsibilities: apiPayload.responsibilities }
      : {}),
    ...(Array.isArray(apiPayload.permissions)
      ? { permissions: apiPayload.permissions }
      : {}),
    ...(apiPayload.assignedCity ? { assignedCity: apiPayload.assignedCity } : {}),
    ...(apiPayload.assignedZone ? { assignedZone: apiPayload.assignedZone } : {}),
    ...(apiPayload.joiningDate ? { joiningDate: apiPayload.joiningDate } : {}),
    ...(apiPayload.phoneNumber ? { phoneNumber: apiPayload.phoneNumber.trim() } : {}),
    ...(resolvedLabId ? { labId: resolvedLabId } : {}),
    ...(resolvedParentLabId ? { parentLabId: resolvedParentLabId } : {}),
    ...(resolvedPhleboId ? { phlebotomistId: resolvedPhleboId } : {}),
    initialPasswordSet: false,
    isActive: true,
    createdByAdmin: true,
    createdAt: now,
    updatedAt: now,
  };
  const profile: UserProfile = stripUndefinedFields<UserProfile>(
    createdProfile
      ? {
        ...createdProfile,
        userCode: createdProfile.userCode || finalCode,
        userCodeUpper: normalizeIdentifierCode(createdProfile.userCode || finalCode),
      }
      : fallbackProfile
  );

  const effectiveLabId = profile.labId || resolvedLabId;
  const effectivePhleboId = profile.phlebotomistId || resolvedPhleboId;

  if (auth.currentUser) {
    await setDoc(doc(db, 'user_directory', normalized), profile, { merge: true });

    if (extra?.createFacilityRecord !== false) {
      if (
        (profile.role === UserRole.SMALL_LAB || profile.role === UserRole.LARGE_LAB) &&
        effectiveLabId
      ) {
        const isLarge = profile.role === UserRole.LARGE_LAB;
        const resolvedCenterType: LabCenterType =
          extra?.centerType || (resolvedParentLabId ? 'COLLECTION_CENTER' : 'MAIN_HUB');

        const rawLabPayload: LabFacility = {
          id: effectiveLabId,
          userCode: profile.userCode || effectiveLabId,
          userCodeUpper: normalizeIdentifierCode(profile.userCode || effectiveLabId),
          name: profile.displayName,
          type: isLarge ? 'LARGE_LAB' : 'SMALL_LAB',
          ...(isLarge ? { centerType: resolvedCenterType } : {}),
          ...(isLarge && resolvedParentLabId ? { parentLabId: resolvedParentLabId } : {}),
          ...(isLarge && extra?.parentLabName ? { parentLabName: extra.parentLabName.trim() } : {}),
          city: extra?.city?.trim() || 'Mumbai',
          address: extra?.address?.trim() || `${profile.displayName} Facility`,
          ...(extra?.pincode?.trim() ? { pincode: extra.pincode.trim() } : {}),
          latitude: typeof extra?.latitude === 'number' ? extra.latitude : 19.124,
          longitude: typeof extra?.longitude === 'number' ? extra.longitude : 72.866,
          ...(typeof extra?.serviceRadiusKm === 'number'
            ? { serviceRadiusKm: extra.serviceRadiusKm }
            : isLarge
              ? { serviceRadiusKm: 15 }
              : {}),
          phone: profile.phoneNumber || '',
          email: normalized,
          nablNumber:
            extra?.nablNumber?.trim() ||
            (isLarge ? 'NABL ISO 15189' : 'Registered Center'),
          verified: true,
          verificationStatus: 'VERIFIED',
          ...(isLarge ? { cutoffWindow: '08:30 PM Daily Cutoff', courierEtaMins: 20 } : {}),
          ...(profile.initialPasswordSet
            ? {
              initialPasswordSet: true,
              initialPasswordUpdatedAt: profile.initialPasswordUpdatedAt || now,
            }
            : {}),
          rating: 5.0,
          createdAt: now,
          updatedAt: now,
        };
        const labPayload: LabFacility = stripUndefinedFields<LabFacility>(rawLabPayload);
        await setDoc(doc(db, 'labs', effectiveLabId), labPayload, { merge: true });
      } else if (profile.role === UserRole.PHLEBOTOMIST && effectivePhleboId) {
        const rawPhleboPayload: PhlebotomistProfile = {
          id: effectivePhleboId,
          userCode: profile.userCode || effectivePhleboId,
          userCodeUpper: normalizeIdentifierCode(profile.userCode || effectivePhleboId),
          name: profile.displayName,
          phone: profile.phoneNumber || '',
          email: normalized,
          status: 'ONLINE',
          currentLocation: extra?.city?.trim() || 'Active Field Zone',
          latitude: typeof extra?.latitude === 'number' ? extra.latitude : 19.124,
          longitude: typeof extra?.longitude === 'number' ? extra.longitude : 72.866,
          batteryPct: 100,
          chillerTempCelsius: 4.2,
          coolerBoxId: `CB-${effectivePhleboId}`,
          vehicleInfo: extra?.vehicleInfo?.trim() || 'Cold-Chain Two-Wheeler',
          rating: 5.0,
          totalPickups: 0,
          verified: true,
          createdAt: now,
          updatedAt: now,
        };
        const phleboPayload: PhlebotomistProfile =
          stripUndefinedFields<PhlebotomistProfile>(rawPhleboPayload);
        await setDoc(doc(db, 'phlebotomists', effectivePhleboId), phleboPayload, {
          merge: true,
        });
      }
    }

    if (!apiSynced) {
      await addDoc(collection(db, 'mail'), {
        to: [normalized],
        templateType: 'ACCOUNT_WELCOME' satisfies EmailTemplateType,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.NORMAL,
        templateData: {
          displayName: profile.displayName,
          email: normalized,
          ...(profile.userCode ? { userCode: profile.userCode } : {}),
          role: profile.role,
          ...(profile.adminSubRole ? { adminSubRole: profile.adminSubRole } : {}),
          ...(effectiveLabId ? { labId: effectiveLabId } : {}),
          ...(profile.parentLabId ? { parentLabId: profile.parentLabId } : {}),
          ...(effectivePhleboId ? { phlebotomistId: effectivePhleboId } : {}),
          hasPassword: Boolean(payload.password),
          ...(typeof window !== 'undefined' ? { portalOrigin: window.location.origin } : {}),
        },
        message: {
          subject: `Welcome to LabSetu — ${ROLE_LABELS[profile.role]} Account Ready (${profile.userCode || finalCode})`,
          text: `Hello ${profile.displayName}, Admin (${ADMIN_LOGIN_EMAIL}) has created your ${ROLE_LABELS[profile.role]} account (${normalized} | Assigned ID: ${profile.userCode || finalCode}). ${profile.role === UserRole.PHLEBOTOMIST
            ? 'Please open the LabSetu Mobile App and sign in using Email OTP or your password.'
            : `Sign in at ${window.location.origin}/login using Google Sign-In, Email/ID & Password, or Email OTP.`
            }`,
        },
        createdAt: now,
      });
    }
  }

  return { profile, apiSynced };
}

export async function toggleManagedUserStatus(
  bearerToken: string,
  user: UserProfile,
  nextActive: boolean
): Promise<void> {
  return updateManagedUserAccess(bearerToken, user, { isActive: nextActive });
}

export async function updateManagedUserAccess(
  bearerToken: string,
  user: UserProfile,
  updates: {
    isActive?: boolean;
    role?: UserRole;
    adminSubRole?: AdminTeamRole;
    isSuperAdmin?: boolean;
    primaryDepartmentId?: string;
    departmentIds?: string[];
    designationId?: string;
    designationTitle?: string;
    permissions?: PermissionCode[];
    labId?: string;
    parentLabId?: string;
    phlebotomistId?: string;
  }
): Promise<void> {
  const normalized = user.email.trim().toLowerCase();
  const updatedAt = new Date().toISOString();
  let explicitHttpError: string | null = null;

  try {
    const res = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(normalized)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'WEB',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(updates),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok && res.status >= 400 && res.status < 500 && res.status !== 404) {
      explicitHttpError =
        json?.error?.message || json?.message || `Access update rejected (${res.status}).`;
    }
  } catch {
    // Non-fatal when API is offline locally
  }

  if (explicitHttpError) {
    throw new Error(explicitHttpError);
  }

  const nextProfile = stripUndefinedFields({
    ...user,
    ...updates,
    updatedAt,
  });
  await setDoc(doc(db, 'user_directory', normalized), nextProfile, { merge: true });
}

export async function saveLabFacility(
  lab: Omit<LabFacility, 'createdAt' | 'updatedAt'> & { createdAt?: string }
): Promise<void> {
  const now = new Date().toISOString();
  await setDoc(
    doc(db, 'labs', lab.id),
    stripUndefinedFields({
      ...lab,
      createdAt: lab.createdAt || now,
      updatedAt: now,
    }),
    { merge: true }
  );
}

export async function updateLabOperationsProfile(
  labId: string,
  updates: {
    name?: string;
    city?: string;
    address?: string;
    pincode?: string;
    latitude?: number;
    longitude?: number;
    serviceRadiusKm?: number;
    phone?: string;
    nablNumber?: string;
    cutoffWindow?: string;
    courierEtaMins?: number;
    payoutProfile?: PayoutProfile;
  }
): Promise<void> {
  await updateDoc(
    doc(db, 'labs', labId),
    stripUndefinedFields({
      ...updates,
      updatedAt: new Date().toISOString(),
    })
  );
}

export async function updateLabVerification(
  labId: string,
  verificationStatus: LabVerificationStatus
): Promise<void> {
  await updateDoc(doc(db, 'labs', labId), {
    verificationStatus,
    verified: verificationStatus === 'VERIFIED',
    updatedAt: new Date().toISOString(),
  });
}

export async function savePhlebotomist(
  phlebo: Omit<PhlebotomistProfile, 'createdAt' | 'updatedAt'> & { createdAt?: string }
): Promise<void> {
  const now = new Date().toISOString();
  await setDoc(
    doc(db, 'phlebotomists', phlebo.id),
    {
      ...phlebo,
      createdAt: phlebo.createdAt || now,
      updatedAt: now,
    },
    { merge: true }
  );
}

export async function updatePhleboShiftStatus(
  phleboId: string,
  status: PhlebotomistShiftStatus,
  extras?: Partial<PhlebotomistProfile>
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'phlebotomists', phleboId), {
      ...(extras || {}),
      status,
      updatedAt: now,
    });
  } catch {
    await setDoc(
      doc(db, 'phlebotomists', phleboId),
      {
        ...(extras || {}),
        id: phleboId,
        status,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  }
}

export async function cancelSmallLabOrder(params: {
  order: PickupOrder;
  operatorUid: string;
  operatorName: string;
  reason?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const evt: CustodyEvent = {
    id: `EVT-${Date.now()}`,
    orderId: params.order.id,
    eventType: CustodyEventType.REJECTED_AT_LAB,
    timestamp: now,
    operatorId: params.operatorUid,
    operatorName: params.operatorName,
    operatorRole: UserRole.SMALL_LAB,
    notes: params.reason || 'Booking cancelled by Small Lab prior to pickup',
  };

  await updateDoc(doc(db, 'orders', params.order.id), {
    status: OrderStatus.CANCELLED,
    cancellationReason: params.reason || 'Cancelled prior to sample pickup',
    custodyHistory: [...(params.order.custodyHistory || []), evt],
    updatedAt: now,
  });

  await addDoc(collection(db, 'custody_events'), evt);
}

export async function savePatientRecord(
  patient: Omit<PatientRecord, 'id' | 'createdAt' | 'updatedAt' | 'totalOrders' | 'lastVisitAt'>
): Promise<PatientRecord> {
  const now = new Date().toISOString();
  const id = `PT-${Date.now().toString().slice(-6)}`;
  const full: PatientRecord = {
    ...patient,
    id,
    totalOrders: 0,
    lastVisitAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'patients', id), full);
  return full;
}

export async function saveDiagnosticTest(
  test: Omit<DiagnosticTestItem, 'createdAt' | 'updatedAt'> & { createdAt?: string }
): Promise<void> {
  const now = new Date().toISOString();
  await setDoc(
    doc(db, 'test_catalog', test.id),
    stripUndefinedFields({
      ...test,
      createdAt: test.createdAt || now,
      updatedAt: now,
    }),
    { merge: true }
  );
}

export async function deleteDiagnosticTest(testId: string): Promise<void> {
  await deleteDoc(doc(db, 'test_catalog', testId));
}

export async function createLiveBooking(params: {
  sessionUser: UserProfile;
  operatorUid: string;
  patient: {
    id: string;
    pseudonym: string;
    age: number;
    gender: 'MALE' | 'FEMALE' | 'OTHER';
    phone?: string;
    alternatePhone?: string;
    clinicalNote?: string;
  };
  smallLab: { id: string; name: string; address: string; phone?: string };
  targetLab: { id: string; name: string; address: string; parentLabId?: string };
  dropType?: DropDestinationType;
  pickupLocation?: {
    address: string;
    latitude: number;
    longitude: number;
    pincode?: string;
    contactName?: string;
    contactPhone?: string;
  };
  deliveryLocation?: {
    address: string;
    latitude: number;
    longitude: number;
    pincode?: string;
    contactName?: string;
    contactPhone?: string;
  };
  serviceZones?: ServiceZoneRecord[];
  phlebotomist?: { id: string; name: string } | null;
  selectedTests: DiagnosticTestItem[];
  smallLabPayableTestTotalInr?: number;
  largeLabB2bTotalInr?: number;
  matchedPackageNames?: string[];
  packageSavingsInr?: number;
  distanceKm?: number;
  broadcastRadiusKm?: number;
  priority: OrderPriority;
  scheduledPickupAt: string;
  commissionConfig: CommissionConfig;
}): Promise<PickupOrder> {
  const now = new Date().toISOString();
  const orderNumber = `BK-${Date.now().toString().slice(-6)}`;
  const handoverOtp = generateNumericOtp(5);

  const specimens = params.selectedTests.map((t, index) => ({
    id: `SMP-${orderNumber.replace('BK-', '')}-${index + 1}`,
    barcode: `SMP-${orderNumber.replace('BK-', '')}-${t.code}`,
    testCode: t.code,
    testName: t.name,
    specimenType: t.specimenType,
    tubeType: t.tubeType,
    temperatureRequirement: t.temperatureRequirement,
  }));

  const dropType: DropDestinationType = params.dropType || 'LARGE_LAB';
  const rawTestTotal =
    typeof params.smallLabPayableTestTotalInr === 'number'
      ? params.smallLabPayableTestTotalInr
      : params.selectedTests.reduce((sum, t) => sum + (t.b2bPriceInr || 0), 0);

  const rawLargeB2bTotal =
    typeof params.largeLabB2bTotalInr === 'number'
      ? params.largeLabB2bTotalInr
      : params.selectedTests.every((t) => typeof t.largeLabB2bRateInr === 'number')
        ? params.selectedTests.reduce((sum, t) => sum + (t.largeLabB2bRateInr || 0), 0)
        : undefined;

  const pricingOrgId = params.targetLab.parentLabId || params.targetLab.id;
  const pricingSplit = computeOrderPricingSplit({
    smallLabTestTotalInr: rawTestTotal,
    largeLabB2bTotalInr: rawLargeB2bTotal,
    commissionConfig: params.commissionConfig,
    targetLabId: dropType === 'LARGE_LAB' ? pricingOrgId : undefined,
    priority: params.priority,
    distanceKm: params.distanceKm,
    dropType,
  });

  const resolvedPickup = params.pickupLocation || {
    address: params.smallLab.address,
    latitude: 19.124,
    longitude: 72.866,
    ...(params.smallLab.phone ? { contactPhone: params.smallLab.phone } : {}),
  };

  let zonesToEvaluate: ServiceZoneRecord[] =
    Array.isArray(params.serviceZones) && params.serviceZones.length > 0
      ? params.serviceZones
      : [];
  if (zonesToEvaluate.length === 0) {
    try {
      const zSnap = await getDocs(collection(db, 'service_zones'));
      if (!zSnap.empty) {
        zonesToEvaluate = zSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ServiceZoneRecord, 'id'>),
        }));
      }
    } catch {
      // Fallback to starter pilot zone below
    }
  }
  if (zonesToEvaluate.length === 0) {
    zonesToEvaluate = [...DEFAULT_STARTER_SERVICE_ZONES];
  }

  const coverage = evaluatePointServiceCoverage(
    zonesToEvaluate,
    resolvedPickup.latitude,
    resolvedPickup.longitude,
    resolvedPickup.pincode
  );
  if (!coverage.covered) {
    throw new Error(coverage.message);
  }

  const resolvedDelivery = params.deliveryLocation || {
    address: params.targetLab.address,
    latitude: 19.1726,
    longitude: 72.9565,
  };
  const computedDistanceKm =
    typeof params.distanceKm === 'number'
      ? params.distanceKm
      : calculateHaversineDistanceKm(
        resolvedPickup.latitude,
        resolvedPickup.longitude,
        resolvedDelivery.latitude,
        resolvedDelivery.longitude
      );
  const broadcastRadiusKm =
    params.broadcastRadiusKm ??
    params.commissionConfig.defaultBroadcastRadiusKm ??
    5;

  const custodyEvent: CustodyEvent = {
    id: `EVT-${Date.now()}`,
    orderId: orderNumber,
    eventType: CustodyEventType.ORDER_CREATED,
    timestamp: now,
    operatorId: params.operatorUid,
    operatorName: params.sessionUser.displayName,
    operatorRole: params.sessionUser.role,
    notes: `Booking created by ${params.smallLab.name} -> ${params.targetLab.name} (${dropType === 'LARGE_LAB'
      ? 'Partner Reference Lab'
      : dropType === 'SELF_DROP'
        ? 'Self Lab Return Drop'
        : 'Custom Drop Address'
      })`,
  };

  const hasPhlebo = Boolean(params.phlebotomist?.id);
  const rawOrder: PickupOrder = {
    id: orderNumber,
    orderNumber,
    smallLabId: params.smallLab.id,
    smallLabName: params.smallLab.name,
    targetLabId: params.targetLab.id,
    ...(params.targetLab.parentLabId
      ? { targetParentLabId: params.targetLab.parentLabId }
      : {}),
    targetLabName: params.targetLab.name,
    dropType,
    phlebotomistId: params.phlebotomist?.id || '',
    ...(params.phlebotomist?.name ? { phlebotomistName: params.phlebotomist.name } : {}),
    status: hasPhlebo ? OrderStatus.ASSIGNED_TO_PHLEBO : OrderStatus.READY_FOR_PICKUP,
    priority: params.priority,
    patient: {
      id: params.patient.id,
      pseudonym: params.patient.pseudonym,
      age: params.patient.age,
      gender: params.patient.gender,
      phone: params.patient.phone || '',
      alternatePhone: params.patient.alternatePhone || '',
      clinicalNote: params.patient.clinicalNote || '',
    },
    specimens,
    custodyHistory: [custodyEvent],
    pickupLocation: resolvedPickup,
    deliveryLocation: resolvedDelivery,
    scheduledPickupAt: params.scheduledPickupAt,
    totalAmountInr: pricingSplit.grossAmountInr,
    courierFeeInr: pricingSplit.courierFeeInr,
    baseCourierFeeInr: pricingSplit.courierFeeInr,
    surgeIncentiveInr: 0,
    searchStatus: hasPhlebo ? 'ASSIGNED' : 'SEARCHING',
    broadcastExpiresAt: hasPhlebo ? undefined : new Date(Date.now() + 45000).toISOString(),
    searchRetryCount: 0,
    largeLabB2bAmountInr: pricingSplit.labPayoutInr,
    platformFeeInr: pricingSplit.platformFeeInr,
    ...(params.matchedPackageNames?.length
      ? { matchedPackageNames: params.matchedPackageNames }
      : {}),
    ...(typeof params.packageSavingsInr === 'number' && params.packageSavingsInr > 0
      ? { packageSavingsInr: params.packageSavingsInr }
      : {}),
    distanceKm: computedDistanceKm,
    broadcastRadiusKm,
    ...(coverage.matchedZone
      ? {
        serviceZoneId: coverage.matchedZone.id,
        serviceZoneName: coverage.matchedZone.name,
      }
      : {}),
    paymentStatus: 'UNPAID',
    handoverOtp,
    department: params.selectedTests[0]?.department || 'Pathology',
    createdAt: now,
    updatedAt: now,
  };
  const newOrder: PickupOrder = stripUndefinedFields<PickupOrder>(rawOrder);

  await setDoc(doc(db, 'orders', orderNumber), newOrder);
  await addDoc(collection(db, 'custody_events'), custodyEvent);

  const rawSettlement: SettlementRecord = {
    id: `STL-${orderNumber.replace('BK-', '')}`,
    orderId: orderNumber,
    orderNumber,
    smallLabId: params.smallLab.id,
    smallLabName: params.smallLab.name,
    targetLabId: params.targetLab.id,
    ...(params.targetLab.parentLabId
      ? { targetParentLabId: params.targetLab.parentLabId }
      : {}),
    targetLabName: params.targetLab.name,
    dropType,
    ...(params.phlebotomist?.id ? { phlebotomistId: params.phlebotomist.id } : {}),
    ...(params.phlebotomist?.name ? { phlebotomistName: params.phlebotomist.name } : {}),
    grossAmountInr: pricingSplit.grossAmountInr,
    platformFeeInr: pricingSplit.platformFeeInr,
    labPayoutInr: pricingSplit.labPayoutInr,
    phleboPayoutInr: pricingSplit.phleboPayoutInr,
    billingPeriod: currentBillingPeriod(),
    paymentStatus: 'UNPAID',
    labPayoutStatus: pricingSplit.labPayoutInr > 0 ? 'PENDING' : 'PAID',
    phleboPayoutStatus: 'PENDING',
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };
  const settlement: SettlementRecord = stripUndefinedFields<SettlementRecord>(rawSettlement);
  await setDoc(doc(db, 'settlements', settlement.id), settlement);

  // Update or save patient record strictly tied to this Small Lab
  try {
    const ptDocRef = doc(db, 'patients', params.patient.id);
    const pSnap = await getDoc(ptDocRef);
    if (pSnap.exists()) {
      const currentTotal = (pSnap.data() as PatientRecord).totalOrders || 0;
      await updateDoc(ptDocRef, {
        totalOrders: currentTotal + 1,
        lastVisitAt: now,
        updatedAt: now,
      });
    } else {
      await setDoc(ptDocRef, stripUndefinedFields({
        id: params.patient.id,
        name: params.patient.pseudonym,
        age: params.patient.age,
        gender: params.patient.gender,
        phone: params.patient.phone || '',
        alternatePhone: params.patient.alternatePhone || '',
        clinicalNote: params.patient.clinicalNote || '',
        smallLabId: params.smallLab.id,
        totalOrders: 1,
        lastVisitAt: now,
        createdAt: now,
        updatedAt: now,
      }));
    }
  } catch {
    // Non-fatal patient record handling
  }

  await dispatchPlatformAlert({
    title: `New Booking ${orderNumber} (${params.priority})`,
    message: `${params.smallLab.name} requested pickup for ${params.patient.pseudonym} -> ${params.targetLab.name} (${computedDistanceKm} km). Handover OTP: ${handoverOtp}`,
    category: NotificationCategory.BOOKING_CREATED,
    priority:
      params.priority === OrderPriority.STAT_CRITICAL
        ? NotificationPriority.CRITICAL
        : NotificationPriority.NORMAL,
    recipientEmail: ADMIN_LOGIN_EMAIL,
    recipientRole: UserRole.ADMIN,
    orderId: orderNumber,
    queueEmail: true,
    templateType:
      params.priority === OrderPriority.STAT_CRITICAL
        ? 'EMERGENCY_ALERT'
        : 'OPERATIONAL_NOTIFICATION',
    templateData: {
      orderNumber,
      smallLabName: params.smallLab.name,
      targetLabName: params.targetLab.name,
      handoverOtp,
    },
  });

  if (dropType === 'LARGE_LAB' && params.targetLab.id) {
    await dispatchPlatformAlert({
      title: `Incoming Booking ${orderNumber} -> ${params.targetLab.name}`,
      message: `${params.smallLab.name} booked ${specimens.map((s) => s.testCode).join(', ')} (${broadcastRadiusKm} km live dispatch triggered).`,
      category: NotificationCategory.BOOKING_CREATED,
      priority: NotificationPriority.NORMAL,
      recipientRole: UserRole.LARGE_LAB,
      labId: params.targetLab.id,
      orderId: orderNumber,
      queueEmail: false,
    });
  }

  if (params.phlebotomist?.id) {
    await dispatchPlatformAlert({
      title: `Pickup Assigned: ${orderNumber}`,
      message: `Collect ${specimens.map((s) => s.testCode).join(', ')} from ${params.smallLab.name} for ${params.targetLab.name}.`,
      category: NotificationCategory.PICKUP_ASSIGNED,
      priority: NotificationPriority.HIGH,
      recipientRole: UserRole.PHLEBOTOMIST,
      orderId: orderNumber,
      queueEmail: false,
    });
  } else {
    await dispatchPlatformAlert({
      title: `Live Pickup Broadcast (${broadcastRadiusKm} km): ${orderNumber}`,
      message: `${params.smallLab.name} pickup (${computedDistanceKm} km route -> ${params.targetLab.name}). Payout: ₹${pricingSplit.phleboPayoutInr}.`,
      category: NotificationCategory.PICKUP_ASSIGNED,
      priority: NotificationPriority.HIGH,
      recipientRole: UserRole.PHLEBOTOMIST,
      orderId: orderNumber,
      queueEmail: false,
    });
  }

  return newOrder;
}

export async function retryOrderBroadcast(
  orderId: string,
  hikeInr: number = 0
): Promise<PickupOrder> {
  const orderRef = doc(db, 'orders', orderId);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) {
    throw new Error('This booking was not found.');
  }
  const existing = snap.data() as PickupOrder;
  const baseCourier = existing.baseCourierFeeInr || existing.courierFeeInr || 100;
  const currentSurge = existing.surgeIncentiveInr || 0;
  const newSurge = currentSurge + Math.max(0, hikeInr);
  const newCourierFee = baseCourier + newSurge;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 45000).toISOString();

  const retryEvent: CustodyEvent = {
    id: `EVT-${Date.now()}`,
    orderId: existing.id,
    eventType: CustodyEventType.PACKED_BY_SMALL_LAB,
    timestamp: now.toISOString(),
    operatorId: existing.smallLabId,
    operatorName: existing.smallLabName,
    operatorRole: UserRole.SMALL_LAB,
    notes: hikeInr > 0
      ? `Broadcast retried with +₹${hikeInr} price hike incentive (Total rider payout ₹${newCourierFee})`
      : 'Broadcast retried searching for nearby phlebotomists (45s window)',
  };

  const updatedFields: Partial<PickupOrder> = {
    baseCourierFeeInr: baseCourier,
    surgeIncentiveInr: newSurge,
    courierFeeInr: newCourierFee,
    searchStatus: 'SEARCHING',
    broadcastExpiresAt: expiresAt,
    searchRetryCount: (existing.searchRetryCount || 0) + 1,
    status: OrderStatus.READY_FOR_PICKUP,
    phlebotomistId: '',
    phlebotomistName: undefined,
    updatedAt: now.toISOString(),
    custodyHistory: [...(existing.custodyHistory || []), retryEvent],
  };

  await updateDoc(orderRef, stripUndefinedFields(updatedFields));
  await addDoc(collection(db, 'custody_events'), retryEvent);

  // Broadcast high-priority alert to nearby phlebotomists
  await dispatchPlatformAlert({
    title: hikeInr > 0
      ? `⚡ SURGE +₹${hikeInr} ADD-ON: Pickup ${existing.orderNumber}`
      : `🔄 RETRY BROADCAST: Pickup ${existing.orderNumber}`,
    message: `${existing.smallLabName} pickup retried (${existing.distanceKm || 1} km route -> ${existing.targetLabName}). Payout boosted to ₹${newCourierFee}!`,
    category: NotificationCategory.PICKUP_ASSIGNED,
    priority: NotificationPriority.HIGH,
    recipientRole: UserRole.PHLEBOTOMIST,
    orderId: existing.id,
    queueEmail: false,
  });

  return {
    ...existing,
    ...updatedFields,
  };
}

export async function assignPhlebotomistToOrder(params: {
  order: PickupOrder;
  phlebo: PhlebotomistProfile;
  operatorUid: string;
  operatorName: string;
  operatorRole: UserRole;
}): Promise<void> {
  const now = new Date().toISOString();
  const evt: CustodyEvent = {
    id: `EVT-${Date.now()}`,
    orderId: params.order.id,
    eventType: CustodyEventType.COLD_CHAIN_CHECK,
    timestamp: now,
    operatorId: params.operatorUid,
    operatorName: params.operatorName,
    operatorRole: params.operatorRole,
    notes: `Assigned Phlebotomist ${params.phlebo.name} (${params.phlebo.id})`,
  };

  await updateDoc(doc(db, 'orders', params.order.id), {
    phlebotomistId: params.phlebo.id,
    phlebotomistName: params.phlebo.name,
    status: OrderStatus.ASSIGNED_TO_PHLEBO,
    custodyHistory: [...(params.order.custodyHistory || []), evt],
    updatedAt: now,
  });

  await addDoc(collection(db, 'custody_events'), evt);

  // Sync settlement beneficiary if settlement exists
  try {
    await setDoc(
      doc(db, 'settlements', `STL-${params.order.id.replace('BK-', '')}`),
      { phlebotomistId: params.phlebo.id, phlebotomistName: params.phlebo.name, updatedAt: now },
      { merge: true }
    );
  } catch {
    // Non-admin phlebo cannot update settlement directly; admin handles settlements
  }

  await dispatchPlatformAlert({
    title: `Pickup Assigned: ${params.order.orderNumber}`,
    message: `${params.phlebo.name} (${params.phlebo.id}) assigned to pick up specimen from ${params.order.smallLabName}.`,
    category: NotificationCategory.PICKUP_ASSIGNED,
    priority: NotificationPriority.NORMAL,
    recipientRole: UserRole.SMALL_LAB,
    orderId: params.order.id,
    queueEmail: false,
  });
}

export async function updateOrderCustodyTransition(params: {
  order: PickupOrder;
  nextStatus: OrderStatus;
  eventType: CustodyEventType;
  operatorUid: string;
  operatorName: string;
  operatorRole: UserRole;
  temperatureCelsius?: number;
  qualityStatus?: SpecimenQualityStatus;
  scannedBarcode?: string;
  notes?: string;
  extraFields?: Partial<PickupOrder>;
}): Promise<void> {
  const now = new Date().toISOString();
  const evt: CustodyEvent = {
    id: `EVT-${Date.now()}`,
    orderId: params.order.id,
    eventType: params.eventType,
    timestamp: now,
    operatorId: params.operatorUid,
    operatorName: params.operatorName,
    operatorRole: params.operatorRole,
    ...(typeof params.temperatureCelsius === 'number'
      ? { temperatureCelsius: params.temperatureCelsius }
      : {}),
    notes:
      params.notes ||
      `${params.eventType}${params.scannedBarcode ? ` • Barcode: ${params.scannedBarcode}` : ''}`,
  };

  const isCompletedDrop = params.nextStatus === OrderStatus.DELIVERED_TO_LAB;
  const payoutDueAtIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await updateDoc(doc(db, 'orders', params.order.id), {
    ...(params.extraFields || {}),
    status: params.nextStatus,
    ...(params.nextStatus === OrderStatus.PICKED_UP ? { actualPickupAt: now } : {}),
    ...(isCompletedDrop
      ? {
        actualDeliveredAt: now,
        deliveredAt: now,
        completedAt: params.order.completedAt || now,
        payoutDueAt: params.order.payoutDueAt || payoutDueAtIso,
        payoutWindowMinutes: 30,
        instantPayoutEligible: true,
      }
      : {}),
    ...(typeof params.temperatureCelsius === 'number'
      ? { arrivalTemperatureCelsius: params.temperatureCelsius }
      : {}),
    ...(params.qualityStatus ? { qualityStatus: params.qualityStatus } : {}),
    custodyHistory: [...(params.order.custodyHistory || []), evt],
    updatedAt: now,
  });

  if (isCompletedDrop) {
    try {
      await setDoc(
        doc(db, 'settlements', `STL-${params.order.id.replace('BK-', '')}`),
        {
          completedAt: params.order.completedAt || now,
          payoutDueAt: params.order.payoutDueAt || payoutDueAtIso,
          payoutWindowMinutes: 30,
          instantPayoutEligible: true,
          updatedAt: now,
        },
        { merge: true }
      );
    } catch {
      // Non-admin clients let Cloud Function trigger stamp settlement SLA safely
    }
  }

  await addDoc(collection(db, 'custody_events'), evt);

  if (
    typeof params.temperatureCelsius === 'number' &&
    (params.temperatureCelsius < 2 || params.temperatureCelsius > 8)
  ) {
    await dispatchPlatformAlert({
      title: `Cold-Chain Excursion Alert — ${params.order.orderNumber}`,
      message: `Temperature logged at ${params.temperatureCelsius}°C (outside 2°C–8°C safe band) by ${params.operatorName}.`,
      category: NotificationCategory.TEMPERATURE_ALERT,
      priority: NotificationPriority.CRITICAL,
      recipientEmail: ADMIN_LOGIN_EMAIL,
      recipientRole: UserRole.ADMIN,
      orderId: params.order.id,
      queueEmail: true,
      templateType: 'EMERGENCY_ALERT',
      templateData: {
        orderNumber: params.order.orderNumber,
        temperatureCelsius: params.temperatureCelsius,
        smallLabName: params.order.smallLabName,
        targetLabName: params.order.targetLabName,
        operatorName: params.operatorName,
      },
    });
  }
}

export async function publishDiagnosticReport(params: {
  order: PickupOrder;
  pathologistName: string;
  file: File | null;
  operatorUid: string;
  operatorName: string;
  operatorRole?: UserRole;
}): Promise<DiagnosticReportRecord> {
  const now = new Date().toISOString();
  const reportId = `RPT-${params.order.orderNumber.replace('BK-', '')}-${Date.now()
    .toString()
    .slice(-3)}`;

  const fileName = params.file ? params.file.name : `${reportId}-verified-report.txt`;
  const storagePath = `reports/${params.order.id}/${fileName}`;
  const fileBlob: File | Blob =
    params.file ||
    new Blob(
      [
        `LabSetu Verified Diagnostic Report\nReport ID: ${reportId}\nBooking ID: ${params.order.orderNumber}\nPatient: ${params.order.patient.pseudonym}\nSource Lab: ${params.order.smallLabName}\nReference Hub: ${params.order.targetLabName}\nPathologist: ${params.pathologistName}\nVerified At: ${now}\n`,
      ],
      { type: 'text/plain' }
    );

  const downloadUrl = await uploadDiagnosticDocument(storagePath, fileBlob);

  const createdMs = new Date(params.order.createdAt).getTime();
  const turnaroundMinutes = Number.isNaN(createdMs)
    ? undefined
    : Math.max(1, Math.round((Date.now() - createdMs) / 60000));

  const record: DiagnosticReportRecord = stripUndefinedFields({
    id: reportId,
    orderId: params.order.id,
    orderNumber: params.order.orderNumber,
    patientId: params.order.patient.id,
    patientName: params.order.patient.pseudonym,
    smallLabId: params.order.smallLabId,
    smallLabName: params.order.smallLabName,
    targetLabId: params.order.targetLabId,
    ...(params.order.targetParentLabId
      ? { targetParentLabId: params.order.targetParentLabId }
      : {}),
    targetLabName: params.order.targetLabName,
    testsSummary: params.order.specimens.map((s) => s.testCode).join(', ') || 'Panel',
    pathologistName: params.pathologistName.trim() || 'Chief Pathologist',
    fileName,
    downloadUrl,
    storagePath,
    qualityStatus: params.order.qualityStatus || SpecimenQualityStatus.INTACT,
    turnaroundMinutes,
    verifiedAt: now,
    createdAt: now,
  });

  await setDoc(doc(db, 'reports', reportId), record);

  const evt: CustodyEvent = {
    id: `EVT-${Date.now()}`,
    orderId: params.order.id,
    eventType: CustodyEventType.ACCESSIONED_BY_PARTNER_LAB,
    timestamp: now,
    operatorId: params.operatorUid,
    operatorName: params.operatorName,
    operatorRole: params.operatorRole || UserRole.LARGE_LAB,
    notes: `Verified report ${reportId} uploaded by ${record.pathologistName}`,
  };

  const payoutDueAtIso = params.order.payoutDueAt || new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await updateDoc(doc(db, 'orders', params.order.id), {
    status: OrderStatus.REPORT_UPLOADED,
    reportDocumentUrl: downloadUrl,
    reportId,
    completedAt: params.order.completedAt || now,
    payoutDueAt: payoutDueAtIso,
    payoutWindowMinutes: 30,
    instantPayoutEligible: true,
    custodyHistory: [...(params.order.custodyHistory || []), evt],
    updatedAt: now,
  });
  await addDoc(collection(db, 'custody_events'), evt);

  let smallLabRecipientEmail = '';
  let shouldSendReportEmail = true;
  try {
    const [labSnap, notifSnap] = await Promise.all([
      getDoc(doc(db, 'labs', params.order.smallLabId)),
      getDoc(doc(db, 'settings', 'notifications')),
    ]);
    if (labSnap.exists()) {
      const labData = labSnap.data() as Partial<LabFacility>;
      if (labData.email) {
        smallLabRecipientEmail = labData.email.trim().toLowerCase();
      }
    }
    if (notifSnap.exists()) {
      const notifSettings = notifSnap.data() as Partial<EmailDeliverySettings>;
      if (notifSettings.enableReportReadyEmails === false) {
        shouldSendReportEmail = false;
      }
    }
  } catch {
    // Proceed with notification even if optional lookup fails
  }

  await dispatchPlatformAlert({
    title: `Report Ready: ${params.order.orderNumber} (${record.patientName})`,
    message: `${params.order.targetLabName} uploaded verified report ${reportId} signed by ${record.pathologistName}.`,
    category: NotificationCategory.REPORT_UPLOADED,
    priority: NotificationPriority.NORMAL,
    recipientEmail: smallLabRecipientEmail || ADMIN_LOGIN_EMAIL,
    recipientRole: UserRole.SMALL_LAB,
    orderId: params.order.id,
    queueEmail: shouldSendReportEmail,
    templateType: 'PDF_REPORT',
    actionUrl: downloadUrl,
    actionLabel: 'Download Verified Report PDF →',
    templateData: {
      reportId,
      orderNumber: params.order.orderNumber,
      patientName: record.patientName,
      testsSummary: record.testsSummary,
      smallLabName: params.order.smallLabName,
      targetLabName: params.order.targetLabName,
      pathologistName: record.pathologistName,
      fileName: record.fileName,
      downloadUrl,
      ...(turnaroundMinutes ? { turnaroundMinutes: `${turnaroundMinutes} mins` } : {}),
    },
  });

  return record;
}

export async function markSettlementSettled(settlementId: string): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'settlements', settlementId), {
    status: 'SETTLED',
    settledAt: now,
    updatedAt: now,
  });
}

export async function markNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(db, 'notifications', id), { read: true });
}

export async function dispatchPlatformAlert(opts: {
  title: string;
  message: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  recipientEmail?: string;
  recipientRole?: UserRole | 'ALL';
  labId?: string;
  orderId?: string;
  queueEmail?: boolean;
  templateType?: EmailTemplateType;
  actionUrl?: string;
  actionLabel?: string;
  templateData?: Record<string, EmailMetadataValue>;
}): Promise<void> {
  const now = new Date().toISOString();
  const resolvedTemplateType: EmailTemplateType =
    opts.templateType ||
    (opts.category === NotificationCategory.REPORT_UPLOADED
      ? 'PDF_REPORT'
      : opts.category === NotificationCategory.TEMPERATURE_ALERT ||
        opts.priority === NotificationPriority.CRITICAL
        ? 'EMERGENCY_ALERT'
        : opts.category === NotificationCategory.PAYMENT_RECEIVED ||
          opts.category === NotificationCategory.PAYOUT_SETTLED
          ? 'PAYMENT_RECEIPT'
          : 'OPERATIONAL_NOTIFICATION');

  const payload: Omit<PlatformNotification, 'id'> = {
    title: opts.title,
    message: opts.message,
    category: opts.category,
    priority: opts.priority,
    ...(opts.recipientEmail ? { recipientEmail: opts.recipientEmail.toLowerCase() } : {}),
    recipientRole: opts.recipientRole || UserRole.ADMIN,
    ...(opts.labId ? { labId: opts.labId } : {}),
    ...(opts.orderId ? { orderId: opts.orderId } : {}),
    channels: opts.queueEmail
      ? [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
      : [NotificationChannel.IN_APP],
    read: false,
    emailSent: false,
    emailStatus: opts.queueEmail ? 'QUEUED_FOR_EMAIL' : 'IN_APP_ONLY',
    pushSent: false,
    createdAt: now,
  };

  await addDoc(collection(db, 'notifications'), payload);

  if (opts.queueEmail && opts.recipientEmail) {
    const cleanTemplateData: Record<string, EmailMetadataValue> = {
      title: opts.title,
    };
    for (const [key, val] of Object.entries(opts.templateData || {})) {
      if (val !== undefined) {
        cleanTemplateData[key] = val;
      }
    }
    if (opts.orderId) cleanTemplateData.orderId = opts.orderId;
    if (opts.recipientRole) cleanTemplateData.recipientRole = opts.recipientRole;
    if (opts.actionUrl) cleanTemplateData.actionUrl = opts.actionUrl;
    if (opts.actionLabel) cleanTemplateData.actionLabel = opts.actionLabel;

    const subject =
      resolvedTemplateType === 'EMERGENCY_ALERT'
        ? `[LabSetu ALERT] ${opts.title}`
        : resolvedTemplateType === 'PDF_REPORT'
          ? `[LabSetu Report PDF] ${opts.title}`
          : `[LabSetu] ${opts.title}`;

    await addDoc(collection(db, 'mail'), {
      to: [opts.recipientEmail.toLowerCase()],
      templateType: resolvedTemplateType,
      category: opts.category,
      priority: opts.priority,
      templateData: cleanTemplateData,
      message: {
        subject,
        text: opts.message,
      },
      createdAt: now,
    });
  }
}

export async function saveAdminSettings(params: {
  sla: PlatformSlaConfig;
  email: EmailDeliverySettings;
  adminEmail: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await Promise.all([
    setDoc(
      doc(db, 'settings', 'platform'),
      { ...params.sla, updatedBy: params.adminEmail, updatedAt: now },
      { merge: true }
    ),
    setDoc(
      doc(db, 'settings', 'notifications'),
      { ...params.email, updatedAt: now },
      { merge: true }
    ),
  ]);
}

export async function saveCommissionSettings(
  cfg: CommissionConfig,
  adminEmail: string
): Promise<void> {
  await setDoc(
    doc(db, 'settings', 'commission'),
    stripUndefinedFields({ ...cfg, updatedBy: adminEmail, updatedAt: new Date().toISOString() }),
    { merge: true }
  );
}

export async function markOrderPaidByLab(params: {
  orderId: string;
  actorEmail?: string;
  actorName?: string;
  paymentMethod?: 'DIRECT_LAB_SETTLEMENT' | 'CASH_AT_LAB' | 'UPI_AT_LAB';
  notes?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const orderRef = doc(db, 'orders', params.orderId);
  const stlId = `STL-${params.orderId.replace(/^BK-/, '')}`;
  const stlRef = doc(db, 'settlements', stlId);

  const orderSnap = await getDoc(orderRef);
  const existingOrder = orderSnap.exists() ? (orderSnap.data() as PickupOrder) : null;
  const stlSnap = await getDoc(stlRef);
  const existingStl = stlSnap.exists() ? (stlSnap.data() as SettlementRecord) : null;
  const platformFee = existingStl?.platformFeeInr || 20;

  await updateDoc(
    orderRef,
    deepCleanFirestorePayload({
      paymentStatus: 'PAID',
      paymentMethod: params.paymentMethod || 'DIRECT_LAB_SETTLEMENT',
      collectedByRole: 'SMALL_LAB',
      paidAt: now,
      updatedAt: now,
    })
  );

  try {
    await updateDoc(
      stlRef,
      deepCleanFirestorePayload({
        paymentStatus: 'PAID',
        paymentMethod: params.paymentMethod || 'DIRECT_LAB_SETTLEMENT',
        collectedByRole: 'SMALL_LAB',
        cashSettledDirectly: true,
        cashPlatformFeePendingInr: platformFee,
        cashPlatformFeeStatus: 'DUE',
        paidAt: now,
        updatedAt: now,
      })
    );
  } catch {
    // Non-fatal if settlement is missing or handled separately
  }

  // Record pending platform fee on the Small Lab facility profile
  if (existingOrder?.smallLabId) {
    try {
      const labRef = doc(db, 'labs', existingOrder.smallLabId);
      const labSnap = await getDoc(labRef);
      const labData = labSnap.exists() ? (labSnap.data() as Record<string, unknown>) : {};
      const currentDue = Number(labData.pendingPlatformFeeDueInr) || 0;
      await updateDoc(labRef, {
        pendingPlatformFeeDueInr: currentDue + platformFee,
        ...(!labData.unsettledCashSince ? { unsettledCashSince: now } : {}),
        updatedAt: now,
      });
    } catch {
      // Non-fatal
    }
  }

  if (existingOrder) {
    try {
      await dispatchPlatformAlert({
        title: `Payment Settled by Lab: ${existingOrder.orderNumber}`,
        message: `${existingOrder.smallLabName} marked booking ${existingOrder.orderNumber} as PAID directly. Phlebotomist will not collect payment from the patient.`,
        category: NotificationCategory.PAYMENT_RECEIVED,
        priority: NotificationPriority.NORMAL,
        orderId: existingOrder.id,
      });
    } catch {
      // Best-effort alert
    }
  }
}

export async function markOrderPaymentByPhlebo(params: {
  orderId: string;
  paymentMethod: 'DIRECT_TO_LAB' | 'CASH' | 'UPI_PHLEBO';
  phleboId?: string;
  phleboName?: string;
  notes?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const orderRef = doc(db, 'orders', params.orderId);
  const stlId = `STL-${params.orderId.replace(/^BK-/, '')}`;
  const stlRef = doc(db, 'settlements', stlId);

  const isDirectToLab = params.paymentMethod === 'DIRECT_TO_LAB';
  const paymentMethodLabel = isDirectToLab
    ? 'DIRECT_TO_LAB'
    : params.paymentMethod === 'CASH'
      ? 'CASH_COLLECTED_BY_PHLEBO'
      : 'UPI_COLLECTED_BY_PHLEBO';

  const collectedByRole = isDirectToLab ? 'PATIENT_DIRECT_LAB' : 'PHLEBOTOMIST';

  await updateDoc(
    orderRef,
    deepCleanFirestorePayload({
      paymentStatus: 'PAID',
      paymentMethod: paymentMethodLabel,
      collectedByRole,
      paidAt: now,
      updatedAt: now,
    })
  );

  try {
    await updateDoc(
      stlRef,
      deepCleanFirestorePayload({
        paymentStatus: 'PAID',
        paymentMethod: paymentMethodLabel,
        collectedByRole,
        paidAt: now,
        updatedAt: now,
      })
    );
  } catch {
    // Non-fatal
  }
}

