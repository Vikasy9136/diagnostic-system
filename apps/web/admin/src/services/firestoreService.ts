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
  writeBatch,
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
  DEFAULT_INVENTORY_KITS,
  DEFAULT_INVENTORY_MATERIALS,
  DEFAULT_PLATFORM_FAQS,
  DEFAULT_PLATFORM_FEATURES,
  DEFAULT_PLATFORM_SOPS,
  DEFAULT_STARTER_SERVICE_ZONES,
  DEFAULT_SUPPORT_CONTACTS,
  type PlatformFeaturesConfig,
  type PlatformFaqDocument,
  type PlatformSopDocument,
  type SupportContactsConfig,
  type DiagnosticReportRecord,
  type DiagnosticTestItem,
  type DropDestinationType,
  type EmailDeliverySettings,
  type EmailMetadataValue,
  type EmailTemplateType,
  evaluatePointServiceCoverage,
  generateRoleAssignedId,
  type InventoryKitItem,
  type InventoryMaterialItem,
  type KitAllocationRecord,
  type LabCenterType,
  type LabDocumentRecord,
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
  type VendorPurchaseRecord,
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
  try {
    await setDoc(doc(db, 'service_zones', id), full, { merge: true });
  } catch (err) {
    console.warn('[firestoreService] Direct Firestore saveServiceZone setDoc warning:', err);
  }
  return full;
}

export async function toggleServiceZoneActive(
  zone: ServiceZoneRecord,
  isActive: boolean,
  actorEmail?: string
): Promise<void> {
  const now = new Date().toISOString();
  try {
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
  } catch (err) {
    console.warn('[firestoreService] toggleServiceZoneActive warning:', err);
  }
}

export async function deleteServiceZone(zoneId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'service_zones', zoneId));
  } catch (err) {
    console.warn('[firestoreService] deleteServiceZone warning:', err);
  }
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
    assignedZoneId?: string;
    assignedZoneCode?: string;
    assignedZoneName?: string;
    assignedCity?: string;
    existingCodes?: string[];
    exteriorPhotoUrl?: string;
    interiorPhotoUrl?: string;
    livePhotoUrl?: string;
    photos?: string[];
    documents?: LabDocumentRecord[];
    contactPersonName?: string;
    operatingHours?: string;
    verified?: boolean;
    verificationStatus?: LabVerificationStatus;
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
    ...(extra?.assignedZoneName || extra?.assignedZoneCode
      ? {
        assignedZone: extra.assignedZoneCode
          ? `${extra.assignedZoneCode} • ${extra.assignedZoneName || ''}`.trim()
          : extra.assignedZoneName,
      }
      : {}),
    ...(extra?.assignedCity || extra?.city
      ? { assignedCity: (extra.assignedCity || extra.city || '').trim() }
      : {}),
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
    verified: extra?.verified !== undefined ? extra.verified : (apiPayload.role === UserRole.ADMIN),
    verificationStatus: extra?.verificationStatus || (apiPayload.role === UserRole.ADMIN ? 'VERIFIED' : 'PENDING'),
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
    try {
      await setDoc(doc(db, 'user_directory', normalized), profile, { merge: true });
    } catch (err) {
      console.warn('[provisionRoleUser] Direct write to user_directory caught:', err);
    }

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
          verified: extra?.verified !== undefined ? extra.verified : false,
          verificationStatus: extra?.verificationStatus || 'PENDING',
          ...(isLarge ? { cutoffWindow: '08:30 PM Daily Cutoff', courierEtaMins: 20 } : {}),
          ...(profile.initialPasswordSet
            ? {
              initialPasswordSet: true,
              initialPasswordUpdatedAt: profile.initialPasswordUpdatedAt || now,
            }
            : {}),
          rating: 5.0,
          ...(extra?.exteriorPhotoUrl ? { exteriorPhotoUrl: extra.exteriorPhotoUrl } : {}),
          ...(extra?.interiorPhotoUrl ? { interiorPhotoUrl: extra.interiorPhotoUrl } : {}),
          ...(extra?.livePhotoUrl ? { livePhotoUrl: extra.livePhotoUrl } : {}),
          ...(extra?.photos && extra.photos.length > 0 ? { photos: extra.photos } : {}),
          ...(extra?.documents && extra.documents.length > 0 ? { documents: extra.documents } : {}),
          ...(extra?.contactPersonName ? { contactPersonName: extra.contactPersonName } : {}),
          ...(extra?.operatingHours ? { operatingHours: extra.operatingHours } : {}),
          createdAt: now,
          updatedAt: now,
        };
        const labPayload: LabFacility = stripUndefinedFields<LabFacility>(rawLabPayload);
        try {
          await setDoc(doc(db, 'labs', effectiveLabId), labPayload, { merge: true });
        } catch (err) {
          console.warn('[provisionRoleUser] Direct write to labs caught:', err);
        }
      } else if (profile.role === UserRole.PHLEBOTOMIST && effectivePhleboId) {
        const resolvedZoneDisplay = extra?.assignedZoneName?.trim()
          ? extra.assignedZoneCode?.trim()
            ? `${extra.assignedZoneName.trim()} (${extra.assignedZoneCode.trim()})`
            : extra.assignedZoneName.trim()
          : extra?.city?.trim() || 'Zone Pending (Admin)';
        const rawPhleboPayload: PhlebotomistProfile = {
          id: effectivePhleboId,
          userCode: profile.userCode || effectivePhleboId,
          userCodeUpper: normalizeIdentifierCode(profile.userCode || effectivePhleboId),
          name: profile.displayName,
          phone: profile.phoneNumber || '',
          email: normalized,
          status: 'ONLINE',
          currentLocation: resolvedZoneDisplay,
          ...(extra?.assignedZoneId ? { assignedZoneId: extra.assignedZoneId } : {}),
          ...(extra?.assignedZoneCode ? { assignedZoneCode: extra.assignedZoneCode.trim().toUpperCase() } : {}),
          ...(extra?.assignedZoneName ? { assignedZoneName: extra.assignedZoneName.trim() } : {}),
          ...(extra?.assignedCity || extra?.city
            ? { assignedCity: (extra.assignedCity || extra.city || '').trim() }
            : {}),
          latitude: typeof extra?.latitude === 'number' ? extra.latitude : 19.124,
          longitude: typeof extra?.longitude === 'number' ? extra.longitude : 72.866,
          batteryPct: 100,
          chillerTempCelsius: 4.2,
          coolerBoxId: `CB-${effectivePhleboId}`,
          vehicleInfo: extra?.vehicleInfo?.trim() || 'Cold-Chain Two-Wheeler',
          rating: 5.0,
          totalPickups: 0,
          verified: extra?.verified !== undefined ? extra.verified : false,
          verificationStatus: extra?.verificationStatus || 'PENDING',
          ...(extra?.livePhotoUrl ? { livePhotoUrl: extra.livePhotoUrl } : {}),
          ...(extra?.exteriorPhotoUrl ? { exteriorPhotoUrl: extra.exteriorPhotoUrl } : {}),
          ...(extra?.interiorPhotoUrl ? { interiorPhotoUrl: extra.interiorPhotoUrl } : {}),
          ...(extra?.documents && extra.documents.length > 0 ? { documents: extra.documents } : {}),
          createdAt: now,
          updatedAt: now,
        };
        const phleboPayload: PhlebotomistProfile =
          stripUndefinedFields<PhlebotomistProfile>(rawPhleboPayload);
        try {
          await setDoc(doc(db, 'phlebotomists', effectivePhleboId), phleboPayload, {
            merge: true,
          });
        } catch (err) {
          console.warn('[provisionRoleUser] Direct write to phlebotomists caught:', err);
        }
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
  const snap = await getDoc(doc(db, 'labs', labId));
  if (!snap.exists()) {
    throw new Error(`Laboratory facility ${labId} was not found.`);
  }
  const data = snap.data();
  const docs = (data.documents || []) as LabDocumentRecord[];
  const extPhoto = data.exteriorPhotoUrl;
  const intPhoto = data.interiorPhotoUrl;

  if (verificationStatus === 'VERIFIED') {
    if (docs.length === 0) {
      throw new Error(
        'Cannot verify laboratory: At least one required regulatory/trade document must be uploaded before approval.'
      );
    }
    if (!extPhoto) {
      throw new Error(
        'Cannot verify laboratory: Live Front Exterior Signboard Photo is required.'
      );
    }
    if (!intPhoto) {
      throw new Error(
        'Cannot verify laboratory: Live Facility Interior Photo is required.'
      );
    }
  }

  const now = new Date().toISOString();
  await updateDoc(doc(db, 'labs', labId), {
    verificationStatus,
    verified: verificationStatus === 'VERIFIED',
    updatedAt: now,
  });

  // Sync verification status to user_directory & users
  const targetEmail = data.email?.toLowerCase().trim();
  if (targetEmail) {
    try {
      const userRef = doc(db, 'user_directory', targetEmail);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        await updateDoc(userRef, {
          verificationStatus,
          verified: verificationStatus === 'VERIFIED',
          updatedAt: now,
        });
      }
    } catch {
      // Non-fatal sync
    }

    // Automatically send onboarding credentials and login instructions email
    if (verificationStatus === 'VERIFIED') {
      try {
        const role = data.type === 'LARGE_LAB' ? UserRole.LARGE_LAB : UserRole.SMALL_LAB;
        const roleLabel = ROLE_LABELS[role];
        const portalOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://labsetu.app';
        const loginUrl = `${portalOrigin}/login?role=${encodeURIComponent(role)}`;
        const resetUrl = `${portalOrigin}/forgot-password?email=${encodeURIComponent(targetEmail)}&role=${encodeURIComponent(role)}`;

        await addDoc(collection(db, 'mail'), {
          to: [targetEmail],
          templateType: 'ACCOUNT_WELCOME' satisfies EmailTemplateType,
          category: NotificationCategory.SYSTEM_ALERT,
          priority: NotificationPriority.HIGH,
          templateData: {
            displayName: data.name,
            email: targetEmail,
            userCode: data.userCode || labId,
            role,
            labId,
            hasPassword: Boolean(data.initialPasswordSet),
            portalOrigin,
          },
          message: {
            subject: `Welcome to LabSetu — ${roleLabel} Account Verified & Ready (${data.userCode || labId})`,
            text: `Hello ${data.name},\n\nYour laboratory account on LabSetu (${data.userCode || labId}) has been successfully verified and approved by the LabSetu Platform Administrator.\n\nAccount Credentials & Login Steps:\n1. Open the portal at: ${loginUrl}\n2. Enter your registered email: ${targetEmail} (or Assigned ID: ${data.userCode || labId})\n3. Sign in using Email OTP, Google Sign-In, or set your password at: ${resetUrl}\n\nThank you for partnering with LabSetu!`,
          },
          createdAt: now,
        });
      } catch (mailErr) {
        console.warn('[updateLabVerification] Could not queue welcome email:', mailErr);
      }
    }
  }
}

export async function updatePhleboVerification(
  phleboId: string,
  verificationStatus: LabVerificationStatus
): Promise<void> {
  const snap = await getDoc(doc(db, 'phlebotomists', phleboId));
  if (!snap.exists()) {
    throw new Error(`Phlebotomist profile ${phleboId} was not found.`);
  }
  const data = snap.data();
  const docs = (data.documents || []) as LabDocumentRecord[];
  const livePhoto = data.livePhotoUrl;

  if (verificationStatus === 'VERIFIED') {
    if (docs.length === 0) {
      throw new Error(
        'Cannot verify phlebotomist: At least one required KYC document (Aadhaar, Driving License, DMLT, or PAN) must be uploaded before approval.'
      );
    }
    if (!livePhoto) {
      throw new Error(
        'Cannot verify phlebotomist: Live Browser Camera Selfie / Portrait photo must be captured before approval.'
      );
    }
  }

  const now = new Date().toISOString();
  await updateDoc(doc(db, 'phlebotomists', phleboId), {
    verificationStatus,
    verified: verificationStatus === 'VERIFIED',
    updatedAt: now,
  });

  // Sync to user_directory / users
  const targetEmail = data.email?.toLowerCase().trim();
  if (targetEmail) {
    try {
      const userRef = doc(db, 'user_directory', targetEmail);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        await updateDoc(userRef, {
          verificationStatus,
          verified: verificationStatus === 'VERIFIED',
          updatedAt: now,
        });
      }
    } catch {
      // Non-fatal sync
    }

    // Automatically send mobile app credentials and login instructions email
    if (verificationStatus === 'VERIFIED') {
      try {
        const portalOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://labsetu.app';
        const resetUrl = `${portalOrigin}/forgot-password?email=${encodeURIComponent(targetEmail)}&role=${encodeURIComponent(UserRole.PHLEBOTOMIST)}`;

        await addDoc(collection(db, 'mail'), {
          to: [targetEmail],
          templateType: 'ACCOUNT_WELCOME' satisfies EmailTemplateType,
          category: NotificationCategory.SYSTEM_ALERT,
          priority: NotificationPriority.HIGH,
          templateData: {
            displayName: data.name,
            email: targetEmail,
            userCode: data.userCode || phleboId,
            role: UserRole.PHLEBOTOMIST,
            phlebotomistId: phleboId,
            hasPassword: false,
            portalOrigin,
          },
          message: {
            subject: `Welcome to LabSetu — Field Phlebotomist Account Verified & Ready (${data.userCode || phleboId})`,
            text: `Hello ${data.name},\n\nCongratulations! Your Field Phlebotomist account on LabSetu (${data.userCode || phleboId}) has been verified and approved by the LabSetu Platform Administrator.\n\nMobile App Login Steps:\n1. Open the LabSetu Phlebotomist Mobile App on your device.\n2. Enter your registered email (${targetEmail}) or Courier ID (${data.userCode || phleboId}).\n3. Use Email OTP to sign in immediately, or set a secure password at: ${resetUrl}\n4. Enable your shift to start receiving assigned cold-chain sample pickup requests.\n\nWelcome to the LabSetu logistics network!`,
          },
          createdAt: now,
        });
      } catch (mailErr) {
        console.warn('[updatePhleboVerification] Could not queue welcome email:', mailErr);
      }
    }
  }
}

export async function updateLabMediaAndDocuments(
  labId: string,
  updates: {
    exteriorPhotoUrl?: string;
    interiorPhotoUrl?: string;
    livePhotoUrl?: string;
    photos?: string[];
    documents?: LabDocumentRecord[];
    contactPersonName?: string;
    operatingHours?: string;
    nablNumber?: string;
    verificationStatus?: LabVerificationStatus;
  }
): Promise<void> {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  if (updates.verificationStatus) {
    payload.verified = updates.verificationStatus === 'VERIFIED';
  }
  await updateDoc(doc(db, 'labs', labId), stripUndefinedFields(payload));
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
    (coverage.covered ? 10 : 25);

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
      : {
        serviceZoneId: 'ZONE-PILOT-EXPANSION',
        serviceZoneName: 'Flexible Pilot Expansion Zone',
      }),
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

  const operatorUid = auth.currentUser?.uid || existing.smallLabId;
  const retryEvent: CustodyEvent = {
    id: `EVT-${Date.now()}`,
    orderId: existing.id,
    eventType: CustodyEventType.PACKED_BY_SMALL_LAB,
    timestamp: now.toISOString(),
    operatorId: operatorUid,
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

  try {
    await addDoc(collection(db, 'custody_events'), retryEvent);
  } catch (err) {
    console.warn('[retryOrderBroadcast] custody_events log caught:', err);
  }

  // If an order had an assigned phlebotomist, alert only that specific courier
  if (existing.phlebotomistId) {
    try {
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
    } catch (err) {
      console.warn('[retryOrderBroadcast] dispatchPlatformAlert caught:', err);
    }
  }

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

export async function markAllNotificationsRead(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 400) {
    chunks.push(ids.slice(i, i + 400));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((id) => {
      batch.update(doc(db, 'notifications', id), { read: true, readAt: new Date().toISOString() });
    });
    await batch.commit();
  }
}

export async function clearAllNotifications(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 400) {
    chunks.push(ids.slice(i, i + 400));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((id) => {
      batch.delete(doc(db, 'notifications', id));
    });
    await batch.commit();
  }
}

export async function fetchSupportContacts(): Promise<SupportContactsConfig> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'support'));
    if (snap.exists()) {
      return { ...DEFAULT_SUPPORT_CONTACTS, ...(snap.data() as Partial<SupportContactsConfig>) };
    }
  } catch (err) {
    console.warn('Failed to fetch support contacts from Firestore:', err);
  }
  return { ...DEFAULT_SUPPORT_CONTACTS };
}

export function subscribeSupportContacts(
  onData: (cfg: SupportContactsConfig) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'settings', 'support'),
    (snap) => {
      if (snap.exists()) {
        onData({ ...DEFAULT_SUPPORT_CONTACTS, ...(snap.data() as Partial<SupportContactsConfig>) });
      } else {
        onData({ ...DEFAULT_SUPPORT_CONTACTS });
      }
    },
    (err) => onError?.(err)
  );
}

export async function saveSupportContacts(
  cfg: Partial<SupportContactsConfig>,
  updatedBy?: string
): Promise<void> {
  const merged: SupportContactsConfig = {
    ...DEFAULT_SUPPORT_CONTACTS,
    ...cfg,
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy } : {}),
  };
  await setDoc(doc(db, 'settings', 'support'), deepCleanFirestorePayload(merged), { merge: true });
}

export function subscribePlatformFeatures(
  onData: (cfg: PlatformFeaturesConfig) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    doc(db, 'settings', 'features'),
    (snap) => {
      if (snap.exists()) {
        onData({ ...DEFAULT_PLATFORM_FEATURES, ...(snap.data() as Partial<PlatformFeaturesConfig>) });
      } else {
        onData(DEFAULT_PLATFORM_FEATURES);
      }
    },
    (err) => onError?.(err)
  );
}

export async function savePlatformFeatures(
  cfg: Partial<PlatformFeaturesConfig>,
  updatedBy?: string
): Promise<void> {
  const merged: PlatformFeaturesConfig = {
    ...DEFAULT_PLATFORM_FEATURES,
    ...cfg,
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy } : {}),
  };
  await setDoc(doc(db, 'settings', 'features'), deepCleanFirestorePayload(merged), { merge: true });
}

export async function fetchPlatformSops(): Promise<PlatformSopDocument[]> {
  try {
    const snap = await getDocs(collection(db, 'platform_sops'));
    if (!snap.empty) {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlatformSopDocument));
      return list.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    }
  } catch (err) {
    console.warn('Failed to fetch platform SOPs from Firestore:', err);
  }
  return DEFAULT_PLATFORM_SOPS;
}

export function subscribePlatformSops(
  onData: (sops: PlatformSopDocument[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'platform_sops'),
    (snap) => {
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlatformSopDocument));
        list.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        onData(list);
      } else {
        onData(DEFAULT_PLATFORM_SOPS);
      }
    },
    (err) => onError?.(err)
  );
}

export async function savePlatformSop(
  sop: Partial<PlatformSopDocument> & { id?: string },
  updatedBy?: string
): Promise<string> {
  const id = sop.id || `sop-${Date.now()}`;
  const payload: PlatformSopDocument = {
    id,
    category: sop.category || 'general',
    number: sop.number || 'SOP',
    title: sop.title || 'Untitled SOP',
    subtitle: sop.subtitle || '',
    badge: sop.badge || 'STANDARD',
    badgeColor: sop.badgeColor || '#0D9488',
    icon: sop.icon || 'test-tube',
    steps: sop.steps || [],
    isActive: sop.isActive !== undefined ? sop.isActive : true,
    orderIndex: sop.orderIndex || 99,
    targetRoles: sop.targetRoles || ['ALL'],
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy } : {}),
  };
  await setDoc(doc(db, 'platform_sops', id), deepCleanFirestorePayload(payload), { merge: true });
  return id;
}

export async function deletePlatformSop(sopId: string): Promise<void> {
  await deleteDoc(doc(db, 'platform_sops', sopId));
}

export async function fetchPlatformFaqs(): Promise<PlatformFaqDocument[]> {
  try {
    const snap = await getDocs(collection(db, 'platform_faqs'));
    if (!snap.empty) {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlatformFaqDocument));
      return list.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    }
  } catch (err) {
    console.warn('Failed to fetch platform FAQs from Firestore:', err);
  }
  return DEFAULT_PLATFORM_FAQS;
}

export function subscribePlatformFaqs(
  onData: (faqs: PlatformFaqDocument[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'platform_faqs'),
    (snap) => {
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlatformFaqDocument));
        list.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        onData(list);
      } else {
        onData(DEFAULT_PLATFORM_FAQS);
      }
    },
    (err) => onError?.(err)
  );
}

export async function savePlatformFaq(
  faq: Partial<PlatformFaqDocument> & { id?: string },
  updatedBy?: string
): Promise<string> {
  const id = faq.id || `faq-${Date.now()}`;
  const payload: PlatformFaqDocument = {
    id,
    category: faq.category || 'General',
    question: faq.question || 'FAQ Question',
    answer: faq.answer || 'FAQ Answer',
    orderIndex: faq.orderIndex || 99,
    isActive: faq.isActive !== undefined ? faq.isActive : true,
    targetRoles: faq.targetRoles || ['ALL'],
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy } : {}),
  };
  await setDoc(doc(db, 'platform_faqs', id), deepCleanFirestorePayload(payload), { merge: true });
  return id;
}

export async function deletePlatformFaq(faqId: string): Promise<void> {
  await deleteDoc(doc(db, 'platform_faqs', faqId));
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

export async function assignPhlebotomistZone(params: {
  phleboId: string;
  phleboEmail?: string;
  phleboName?: string;
  zone: ServiceZoneRecord;
  latitude?: number;
  longitude?: number;
  actorEmail: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const cleanLat =
    typeof params.latitude === 'number' && Number.isFinite(params.latitude)
      ? Number(params.latitude.toFixed(5))
      : params.zone.centerLatitude;
  const cleanLng =
    typeof params.longitude === 'number' && Number.isFinite(params.longitude)
      ? Number(params.longitude.toFixed(5))
      : params.zone.centerLongitude;
  const zoneLabel = `${params.zone.name} (${params.zone.zoneCode})`;

  await setDoc(
    doc(db, 'phlebotomists', params.phleboId),
    stripUndefinedFields({
      assignedZoneId: params.zone.id,
      assignedZoneCode: params.zone.zoneCode.trim().toUpperCase(),
      assignedZoneName: params.zone.name.trim(),
      assignedCity: params.zone.city.trim(),
      currentLocation: zoneLabel,
      latitude: cleanLat,
      longitude: cleanLng,
      updatedAt: now,
    }),
    { merge: true }
  );

  const normalizedEmail = params.phleboEmail?.trim().toLowerCase();
  if (normalizedEmail) {
    try {
      await setDoc(
        doc(db, 'user_directory', normalizedEmail),
        {
          assignedZone: `${params.zone.zoneCode} • ${params.zone.name}`,
          assignedCity: params.zone.city,
          updatedAt: now,
        },
        { merge: true }
      );
    } catch {
      // Non-super-admin Ops managers can update phlebotomists directly even if user_directory is restricted
    }

    try {
      await dispatchPlatformAlert({
        title: `Operating Zone Updated: ${params.zone.zoneCode} (${params.zone.name})`,
        message: `Admin (${params.actorEmail}) assigned ${params.phleboName || params.phleboId
          } to service zone ${params.zone.name} (${params.zone.city}, ${params.zone.radiusKm} km radius).`,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.NORMAL,
        recipientEmail: normalizedEmail,
        recipientRole: UserRole.PHLEBOTOMIST,
      });
    } catch {
      // Best-effort notification
    }
  }
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

// ---------------------------------------------------------------------------
// Kit & Vacutainer Central Inventory Operations (Admin Central Supply Chain)
// ---------------------------------------------------------------------------

export function subscribeInventoryMaterials(
  callback: (items: InventoryMaterialItem[]) => void
): Unsubscribe {
  const colRef = collection(db, 'inventory_materials');
  return onSnapshot(colRef, async (snap) => {
    if (snap.empty) {
      for (const item of DEFAULT_INVENTORY_MATERIALS) {
        try {
          await setDoc(doc(db, 'inventory_materials', item.id), deepCleanFirestorePayload(item));
        } catch {
          // Non-fatal seed retry
        }
      }
      callback(DEFAULT_INVENTORY_MATERIALS as InventoryMaterialItem[]);
      return;
    }
    const list: InventoryMaterialItem[] = [];
    snap.forEach((d) => {
      list.push({ ...(d.data() as InventoryMaterialItem), id: d.id });
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    callback(list);
  });
}

export function subscribeInventoryKits(
  callback: (kits: InventoryKitItem[]) => void
): Unsubscribe {
  const colRef = collection(db, 'inventory_kits');
  return onSnapshot(colRef, async (snap) => {
    if (snap.empty) {
      for (const kit of DEFAULT_INVENTORY_KITS) {
        try {
          await setDoc(doc(db, 'inventory_kits', kit.id), deepCleanFirestorePayload(kit));
        } catch {
          // Non-fatal seed retry
        }
      }
      callback(DEFAULT_INVENTORY_KITS as InventoryKitItem[]);
      return;
    }
    const list: InventoryKitItem[] = [];
    snap.forEach((d) => {
      list.push({ ...(d.data() as InventoryKitItem), id: d.id });
    });
    list.sort((a, b) => a.kitName.localeCompare(b.kitName));
    callback(list);
  });
}

export function subscribeKitAllocations(
  callback: (allocations: KitAllocationRecord[]) => void
): Unsubscribe {
  const colRef = collection(db, 'kit_allocations');
  return onSnapshot(colRef, (snap) => {
    const list: KitAllocationRecord[] = [];
    snap.forEach((d) => {
      list.push({ ...(d.data() as KitAllocationRecord), id: d.id });
    });
    list.sort((a, b) => new Date(b.allocatedAt).getTime() - new Date(a.allocatedAt).getTime());
    callback(list);
  });
}

export function subscribeVendorPurchases(
  callback: (purchases: VendorPurchaseRecord[]) => void
): Unsubscribe {
  const colRef = collection(db, 'vendor_purchases');
  return onSnapshot(colRef, (snap) => {
    const list: VendorPurchaseRecord[] = [];
    snap.forEach((d) => {
      list.push({ ...(d.data() as VendorPurchaseRecord), id: d.id });
    });
    list.sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime());
    callback(list);
  });
}

export async function saveInventoryMaterial(item: InventoryMaterialItem): Promise<void> {
  const now = new Date().toISOString();
  const id = item.id || `MAT-${Date.now()}`;
  await setDoc(
    doc(db, 'inventory_materials', id),
    deepCleanFirestorePayload({
      ...item,
      id,
      updatedAt: now,
      createdAt: item.createdAt || now,
    }),
    { merge: true }
  );
}

export async function saveInventoryKit(kit: InventoryKitItem): Promise<void> {
  const now = new Date().toISOString();
  const id = kit.id || `KIT-${Date.now()}`;
  await setDoc(
    doc(db, 'inventory_kits', id),
    deepCleanFirestorePayload({
      ...kit,
      id,
      updatedAt: now,
      createdAt: kit.createdAt || now,
    }),
    { merge: true }
  );
}

export async function recordAuditLogAction(entry: {
  action: string;
  resourceType: string;
  resourceId?: string;
  summary: string;
  details?: Record<string, unknown>;
  actorEmail?: string;
}): Promise<void> {
  try {
    const logId = `AUDIT-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    await setDoc(
      doc(db, 'audit_logs', logId),
      deepCleanFirestorePayload({
        id: logId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId || null,
        summary: entry.summary,
        details: entry.details || {},
        actorEmail: entry.actorEmail || 'admin@labsetu.com',
        timestamp: new Date().toISOString(),
      })
    );
  } catch (err) {
    console.warn('[Admin] Failed to record audit log:', err);
  }
}

export async function assembleInventoryKits(params: {
  kit: InventoryKitItem;
  quantityToAssemble: number;
  availableMaterials: InventoryMaterialItem[];
  actorEmail: string;
}): Promise<void> {
  const { kit, quantityToAssemble, availableMaterials, actorEmail } = params;
  if (quantityToAssemble <= 0) {
    throw new Error('Please enter a valid quantity of kits to assemble.');
  }

  const materialsById = new Map<string, InventoryMaterialItem>();
  for (const mat of availableMaterials) {
    materialsById.set(mat.id, mat);
  }

  for (const comp of kit.billOfMaterials) {
    const totalRequired = comp.quantity * quantityToAssemble;
    const material = materialsById.get(comp.materialId);
    if (!material) {
      throw new Error(`Raw material "${comp.materialName}" was not found in stock inventory.`);
    }
    if (material.currentStock < totalRequired) {
      throw new Error(
        `Insufficient stock for "${comp.materialName}". Required: ${totalRequired} ${comp.unit}s, Available: ${material.currentStock} ${comp.unit}s.`
      );
    }
  }

  const now = new Date().toISOString();

  for (const comp of kit.billOfMaterials) {
    const totalRequired = comp.quantity * quantityToAssemble;
    const material = materialsById.get(comp.materialId)!;
    const newStock = Math.max(0, material.currentStock - totalRequired);
    await setDoc(
      doc(db, 'inventory_materials', material.id),
      deepCleanFirestorePayload({
        currentStock: newStock,
        updatedAt: now,
      }),
      { merge: true }
    );
  }

  const nextKitStock = (kit.currentAssembledStock || 0) + quantityToAssemble;
  await setDoc(
    doc(db, 'inventory_kits', kit.id),
    deepCleanFirestorePayload({
      currentAssembledStock: nextKitStock,
      updatedAt: now,
    }),
    { merge: true }
  );

  await recordAuditLogAction({
    action: 'INVENTORY_KITS_ASSEMBLED',
    resourceType: 'INVENTORY_KIT',
    resourceId: kit.id,
    summary: `Assembled ${quantityToAssemble}x "${kit.kitName}" kits from raw material inventory.`,
    details: {
      kitCode: kit.kitCode,
      quantityAssembled: quantityToAssemble,
      newAssembledStock: nextKitStock,
      assembledBy: actorEmail,
    },
  });
}

export async function allocateKitsToPhlebotomist(params: {
  phlebo: PhlebotomistProfile;
  kit: InventoryKitItem;
  quantity: number;
  actorEmail: string;
  notes?: string;
}): Promise<void> {
  const { phlebo, kit, quantity, actorEmail, notes } = params;
  if (quantity <= 0) {
    throw new Error('Please enter a valid quantity of kits to dispatch.');
  }
  if ((kit.currentAssembledStock || 0) < quantity) {
    throw new Error(
      `Cannot allocate ${quantity} kits. Only ${kit.currentAssembledStock || 0} assembled kits are in central stock.`
    );
  }

  const now = new Date().toISOString();
  const allocationId = `ALLOC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const newStock = Math.max(0, (kit.currentAssembledStock || 0) - quantity);
  await setDoc(
    doc(db, 'inventory_kits', kit.id),
    deepCleanFirestorePayload({
      currentAssembledStock: newStock,
      updatedAt: now,
    }),
    { merge: true }
  );

  const allocationRecord: KitAllocationRecord = {
    id: allocationId,
    phlebotomistId: phlebo.id,
    phlebotomistName: phlebo.name,
    phlebotomistPhone: phlebo.phone,
    kitId: kit.id,
    kitCode: kit.kitCode,
    kitName: kit.kitName,
    quantityAllocated: quantity,
    quantityConsumed: 0,
    quantityOnHand: quantity,
    allocatedAt: now,
    status: 'DISPATCHED',
    dispatchedBy: actorEmail,
    ...(notes ? { notes } : {}),
  };

  await setDoc(
    doc(db, 'kit_allocations', allocationId),
    deepCleanFirestorePayload(allocationRecord)
  );

  const normalizedPhleboEmail = phlebo.email?.trim().toLowerCase();
  if (normalizedPhleboEmail) {
    try {
      await dispatchPlatformAlert({
        title: `📦 ${quantity}x Collection Kits Dispatched: ${kit.kitName}`,
        message: `Admin (${actorEmail}) has dispatched ${quantity}x ${kit.kitName} (${kit.kitCode}) to your field kit. Confirm receipt in your app.`,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.NORMAL,
        recipientEmail: normalizedPhleboEmail,
        recipientRole: UserRole.PHLEBOTOMIST,
      });
    } catch {
      // Non-fatal
    }
  }

  await recordAuditLogAction({
    action: 'INVENTORY_KITS_DISPATCHED',
    resourceType: 'KIT_ALLOCATION',
    resourceId: allocationId,
    summary: `Dispatched ${quantity}x "${kit.kitName}" kits to phlebotomist ${phlebo.name} (${phlebo.id}).`,
    details: {
      phlebotomistId: phlebo.id,
      phlebotomistName: phlebo.name,
      kitCode: kit.kitCode,
      quantity,
      dispatchedBy: actorEmail,
    },
  });
}

export async function allocateSuppliesPackToPhlebotomist(params: {
  phlebo: PhlebotomistProfile;
  packName: string;
  packCode: string;
  totalPacksCount: number;
  itemsManifest: Array<{
    materialId: string;
    materialName: string;
    category: any;
    quantity: number;
    unit: string;
    iconEmoji?: string;
    tubeType?: any;
  }>;
  actorEmail: string;
  notes?: string;
}): Promise<void> {
  const { phlebo, packName, packCode, totalPacksCount, itemsManifest, actorEmail, notes } = params;

  if (itemsManifest.length === 0) {
    throw new Error('Please select at least one item to include in the dispatch pack.');
  }

  const now = new Date().toISOString();
  const allocationId = `ALLOC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // 1. Deduct all items from inventory_materials
  for (const item of itemsManifest) {
    try {
      const matRef = doc(db, 'inventory_materials', item.materialId);
      const snap = await getDoc(matRef);
      if (snap.exists()) {
        const curStock = (snap.data().currentStock as number) || 0;
        const nextStock = Math.max(0, curStock - item.quantity);
        await setDoc(matRef, deepCleanFirestorePayload({ currentStock: nextStock, updatedAt: now }), { merge: true });
      }
    } catch (err) {
      console.warn(`[Inventory] Could not deduct stock for ${item.materialName}:`, err);
    }
  }

  // 2. Create kit allocation record with full manifest
  const allocationRecord: KitAllocationRecord = {
    id: allocationId,
    phlebotomistId: phlebo.id,
    phlebotomistName: phlebo.name,
    phlebotomistPhone: phlebo.phone,
    kitId: packCode,
    kitCode: packCode,
    kitName: packName,
    quantityAllocated: totalPacksCount,
    quantityConsumed: 0,
    quantityOnHand: totalPacksCount,
    allocatedAt: now,
    status: 'DISPATCHED',
    dispatchedBy: actorEmail,
    itemsManifest,
    ...(notes ? { notes } : {}),
  };

  await setDoc(doc(db, 'kit_allocations', allocationId), deepCleanFirestorePayload(allocationRecord));

  // 3. Notify Phlebotomist
  const normalizedPhleboEmail = phlebo.email?.trim().toLowerCase();
  if (normalizedPhleboEmail) {
    try {
      const summaryItems = itemsManifest.map(i => `${i.quantity}x ${i.materialName}`).slice(0, 4).join(', ');
      await dispatchPlatformAlert({
        title: `📦 Supply Kit Handover Dispatched: ${packName}`,
        message: `Admin (${actorEmail}) has dispatched field supplies: ${summaryItems}... Check "My Collection Kits" in app.`,
        recipientEmail: normalizedPhleboEmail,
        recipientRole: UserRole.PHLEBOTOMIST,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.HIGH,
      });
    } catch {
      // non-fatal
    }
  }

  // 4. Record audit log
  await recordAuditLogAction({
    action: 'SUPPLY_PACK_DISPATCHED',
    resourceType: 'KIT_ALLOCATION',
    resourceId: allocationId,
    summary: `Dispatched supply pack "${packName}" (${totalPacksCount} packs) with ${itemsManifest.length} item types to ${phlebo.name}.`,
    details: {
      allocationId,
      phlebotomistId: phlebo.id,
      phlebotomistName: phlebo.name,
      items: itemsManifest,
      dispatchedBy: actorEmail,
    },
  });
}

export async function recordVendorPurchaseOrder(params: {
  purchase: Omit<VendorPurchaseRecord, 'id' | 'purchasedAt'>;
  autoReceiveStock: boolean;
  actorEmail: string;
}): Promise<void> {
  const { purchase, autoReceiveStock, actorEmail } = params;
  const now = new Date().toISOString();
  const id = `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const poRecord: VendorPurchaseRecord = {
    ...purchase,
    id,
    purchasedAt: now,
    status: autoReceiveStock ? 'RECEIVED' : 'ORDERED',
    ...(autoReceiveStock ? { receivedAt: now } : {}),
  };

  await setDoc(doc(db, 'vendor_purchases', id), deepCleanFirestorePayload(poRecord));

  if (autoReceiveStock && Array.isArray(purchase.items)) {
    for (const item of purchase.items) {
      if (!item.materialId || item.quantity <= 0) continue;
      try {
        const matSnap = await getDoc(doc(db, 'inventory_materials', item.materialId));
        if (matSnap.exists()) {
          const current = (matSnap.data() as InventoryMaterialItem).currentStock || 0;
          await setDoc(
            doc(db, 'inventory_materials', item.materialId),
            deepCleanFirestorePayload({
              currentStock: current + item.quantity,
              batchNumber: item.batchNumber || (matSnap.data() as InventoryMaterialItem).batchNumber,
              expiryDate: item.expiryDate || (matSnap.data() as InventoryMaterialItem).expiryDate,
              updatedAt: now,
            }),
            { merge: true }
          );
        }
      } catch {
        // Non-fatal
      }
    }
  }

  await recordAuditLogAction({
    action: 'VENDOR_PURCHASE_RECORDED',
    resourceType: 'VENDOR_PURCHASE',
    resourceId: id,
    summary: `Recorded Inward Purchase Order ${poRecord.poNumber} from "${poRecord.vendorName}" (₹${poRecord.totalAmountInr.toLocaleString('en-IN')}).`,
    details: {
      poNumber: poRecord.poNumber,
      vendorName: poRecord.vendorName,
      totalAmountInr: poRecord.totalAmountInr,
      autoReceived: autoReceiveStock,
      recordedBy: actorEmail,
    },
  });
}


