import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  type CommissionConfig,
  type CreateManagedUserPayload,
  type CustodyEvent,
  CustodyEventType,
  type DiagnosticReportRecord,
  type DiagnosticTestItem,
  type EmailDeliverySettings,
  type EmailMetadataValue,
  type EmailTemplateType,
  type LabFacility,
  type LabVerificationStatus,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  OrderPriority,
  OrderStatus,
  type PatientRecord,
  type PayoutProfile,
  type PayoutRecord,
  type PhlebotomistProfile,
  type PhlebotomistShiftStatus,
  type PickupOrder,
  type PlatformNotification,
  type PlatformSlaConfig,
  ROLE_LABELS,
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
  commissionPct: 15,
  courierBaseFeeInr: 250,
  statSurchargeInr: 150,
  updatedAt: new Date().toISOString(),
};

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

  const [platSnap, commSnap, notifSnap] = await Promise.all([
    getDoc(doc(db, 'settings', 'platform')),
    getDoc(doc(db, 'settings', 'commission')),
    getDoc(doc(db, 'settings', 'notifications')),
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
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, 'patients');
  const q =
    profile.role === UserRole.SMALL_LAB && profile.labId
      ? query(colRef, where('smallLabId', '==', profile.labId))
      : colRef;

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PatientRecord, 'id'>) }))
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

    let unsubMine: Unsubscribe = () => {};
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

  let q = query(colRef);
  if (profile.role === UserRole.SMALL_LAB && profile.labId) {
    q = query(colRef, where('smallLabId', '==', profile.labId));
  } else if (profile.role === UserRole.LARGE_LAB && profile.labId) {
    q = query(colRef, where('targetLabId', '==', profile.labId));
  }

  return onSnapshot(
    q,
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
  let q = query(colRef);
  if (profile.role === UserRole.SMALL_LAB && profile.labId) {
    q = query(colRef, where('smallLabId', '==', profile.labId));
  } else if (profile.role === UserRole.LARGE_LAB && profile.labId) {
    q = query(colRef, where('targetLabId', '==', profile.labId));
  }

  return onSnapshot(
    q,
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
  let q = query(colRef);

  if (profile.role === UserRole.SMALL_LAB && profile.labId) {
    q = query(colRef, where('smallLabId', '==', profile.labId));
  } else if (profile.role === UserRole.LARGE_LAB && profile.labId) {
    q = query(colRef, where('targetLabId', '==', profile.labId));
  } else if (profile.role === UserRole.PHLEBOTOMIST) {
    if (!profile.phlebotomistId) {
      onData([]);
      return () => {};
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
    return () => {};
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
      byId.set(d.id, { id: d.id, ...(d.data() as Omit<PlatformNotification, 'id'>) });
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
  const u1 = onSnapshot(doc(db, 'settings', 'platform'), (snap) => {
    if (snap.exists()) {
      onSla({ ...DEFAULT_PLATFORM_SLA, ...(snap.data() as Partial<PlatformSlaConfig>) });
    }
  });
  const u2 = onSnapshot(doc(db, 'settings', 'commission'), (snap) => {
    if (snap.exists()) {
      onCommission({ ...DEFAULT_COMMISSION_CONFIG, ...(snap.data() as Partial<CommissionConfig>) });
    }
  });
  const u3 = onSnapshot(doc(db, 'settings', 'notifications'), (snap) => {
    if (snap.exists()) {
      onEmail({ ...DEFAULT_EMAIL_SETTINGS, ...(snap.data() as Partial<EmailDeliverySettings>) });
    }
  });

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
    address?: string;
    nablNumber?: string;
    vehicleInfo?: string;
  }
): Promise<{ profile: UserProfile; apiSynced: boolean }> {
  const normalized = payload.email.trim().toLowerCase();
  const now = new Date().toISOString();

  const resolvedLabId =
    payload.role === UserRole.SMALL_LAB
      ? payload.labId?.trim() || `LAB-SM-${Date.now().toString().slice(-4)}`
      : payload.role === UserRole.LARGE_LAB
      ? payload.labId?.trim() || `LAB-LG-${Date.now().toString().slice(-4)}`
      : undefined;

  const resolvedPhleboId =
    payload.role === UserRole.PHLEBOTOMIST
      ? payload.phlebotomistId?.trim() || `PHL-${Date.now().toString().slice(-4)}`
      : undefined;

  const enrichedPayload: CreateManagedUserPayload = {
    ...payload,
    email: normalized,
    labId: resolvedLabId,
    phlebotomistId: resolvedPhleboId,
  };

  let createdProfile: UserProfile | null = null;
  let apiSynced = false;

  try {
    const res = await fetch(`${API_BASE_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(enrichedPayload),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.data) {
      createdProfile = json.data as UserProfile;
      apiSynced = true;
    }
  } catch {
    // Direct Firestore provisioning continues seamlessly
  }

  const profile: UserProfile = createdProfile || {
    id: `usr-${normalized.replace(/[^a-z0-9]/g, '').slice(0, 12)}-${Date.now().toString(36)}`,
    email: normalized,
    displayName: enrichedPayload.displayName.trim(),
    role: enrichedPayload.role,
    ...(enrichedPayload.phoneNumber ? { phoneNumber: enrichedPayload.phoneNumber.trim() } : {}),
    ...(resolvedLabId ? { labId: resolvedLabId } : {}),
    ...(resolvedPhleboId ? { phlebotomistId: resolvedPhleboId } : {}),
    isActive: true,
    createdByAdmin: true,
    createdAt: now,
    updatedAt: now,
  };

  if (auth.currentUser) {
    await setDoc(doc(db, 'user_directory', normalized), profile, { merge: true });

    if (extra?.createFacilityRecord !== false) {
      if (
        (profile.role === UserRole.SMALL_LAB || profile.role === UserRole.LARGE_LAB) &&
        resolvedLabId
      ) {
        const labPayload: LabFacility = {
          id: resolvedLabId,
          name: profile.displayName,
          type: profile.role === UserRole.SMALL_LAB ? 'SMALL_LAB' : 'LARGE_LAB',
          city: extra?.city?.trim() || 'Mumbai',
          address: extra?.address?.trim() || `${profile.displayName} Facility`,
          phone: profile.phoneNumber || '',
          email: normalized,
          nablNumber:
            extra?.nablNumber?.trim() ||
            (profile.role === UserRole.LARGE_LAB ? 'NABL ISO 15189' : 'Registered Center'),
          verified: true,
          verificationStatus: 'VERIFIED',
          cutoffWindow:
            profile.role === UserRole.LARGE_LAB ? '08:30 PM Daily Cutoff' : undefined,
          rating: 5.0,
          courierEtaMins: profile.role === UserRole.LARGE_LAB ? 20 : undefined,
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(doc(db, 'labs', resolvedLabId), labPayload, { merge: true });
      } else if (profile.role === UserRole.PHLEBOTOMIST && resolvedPhleboId) {
        const phleboPayload: PhlebotomistProfile = {
          id: resolvedPhleboId,
          name: profile.displayName,
          phone: profile.phoneNumber || '',
          email: normalized,
          status: 'ONLINE',
          currentLocation: extra?.city?.trim() || 'Active Field Zone',
          batteryPct: 100,
          chillerTempCelsius: 4.2,
          coolerBoxId: `CB-${resolvedPhleboId}`,
          vehicleInfo: extra?.vehicleInfo?.trim() || 'Cold-Chain Two-Wheeler',
          rating: 5.0,
          totalPickups: 0,
          verified: true,
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(doc(db, 'phlebotomists', resolvedPhleboId), phleboPayload, {
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
          role: profile.role,
          ...(profile.labId ? { labId: profile.labId } : {}),
          ...(profile.phlebotomistId ? { phlebotomistId: profile.phlebotomistId } : {}),
          hasPassword: Boolean(payload.password),
          ...(typeof window !== 'undefined' ? { portalOrigin: window.location.origin } : {}),
        },
        message: {
          subject: `Welcome to LabSetu — ${ROLE_LABELS[profile.role]} Account Ready`,
          text: `Hello ${profile.displayName}, Admin (${ADMIN_LOGIN_EMAIL}) has created your ${ROLE_LABELS[profile.role]} account for ${normalized}. ${
            profile.role === UserRole.PHLEBOTOMIST
              ? 'Please open the LabSetu Mobile App and sign in using Google Sign-In, Email & Password, or Email OTP.'
              : `Sign in at ${window.location.origin}/login using Google Sign-In, Email & Password, or Email OTP.`
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
  const normalized = user.email.trim().toLowerCase();
  const updatedAt = new Date().toISOString();

  try {
    await fetch(`${API_BASE_URL}/users/${encodeURIComponent(normalized)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ isActive: nextActive }),
    });
  } catch {
    // Non-fatal when API is offline locally
  }

  await setDoc(
    doc(db, 'user_directory', normalized),
    { ...user, isActive: nextActive, updatedAt },
    { merge: true }
  );
}

export async function saveLabFacility(lab: Omit<LabFacility, 'createdAt' | 'updatedAt'> & { createdAt?: string }): Promise<void> {
  const now = new Date().toISOString();
  await setDoc(
    doc(db, 'labs', lab.id),
    {
      ...lab,
      createdAt: lab.createdAt || now,
      updatedAt: now,
    },
    { merge: true }
  );
}

export async function updateLabOperationsProfile(
  labId: string,
  updates: {
    name?: string;
    city?: string;
    address?: string;
    phone?: string;
    nablNumber?: string;
    cutoffWindow?: string;
    courierEtaMins?: number;
    payoutProfile?: PayoutProfile;
  }
): Promise<void> {
  await updateDoc(doc(db, 'labs', labId), {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
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
    {
      ...test,
      createdAt: test.createdAt || now,
      updatedAt: now,
    },
    { merge: true }
  );
}

export async function deleteDiagnosticTest(testId: string): Promise<void> {
  await deleteDoc(doc(db, 'test_catalog', testId));
}

export async function createLiveBooking(params: {
  sessionUser: UserProfile;
  operatorUid: string;
  patient: { id: string; pseudonym: string; age: number; gender: 'MALE' | 'FEMALE' | 'OTHER' };
  smallLab: { id: string; name: string; address: string; phone?: string };
  targetLab: { id: string; name: string; address: string };
  phlebotomist?: { id: string; name: string } | null;
  selectedTests: DiagnosticTestItem[];
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

  const testsTotal = params.selectedTests.reduce((sum, t) => sum + (t.b2bPriceInr || 0), 0);
  const surcharge =
    params.priority === OrderPriority.STAT_CRITICAL
      ? params.commissionConfig.statSurchargeInr
      : 0;
  const courierFeeInr = params.commissionConfig.courierBaseFeeInr + surcharge;
  const totalAmountInr = testsTotal + courierFeeInr;
  const platformFeeInr = Math.round((totalAmountInr * params.commissionConfig.commissionPct) / 100);
  const labPayoutInr = Math.max(0, totalAmountInr - platformFeeInr - courierFeeInr);

  const custodyEvent: CustodyEvent = {
    id: `EVT-${Date.now()}`,
    orderId: orderNumber,
    eventType: CustodyEventType.ORDER_CREATED,
    timestamp: now,
    operatorId: params.operatorUid,
    operatorName: params.sessionUser.displayName,
    operatorRole: params.sessionUser.role,
    notes: `Booking created by ${params.smallLab.name} for ${params.patient.pseudonym}`,
  };

  const hasPhlebo = Boolean(params.phlebotomist?.id);
  const newOrder: PickupOrder = {
    id: orderNumber,
    orderNumber,
    smallLabId: params.smallLab.id,
    smallLabName: params.smallLab.name,
    targetLabId: params.targetLab.id,
    targetLabName: params.targetLab.name,
    phlebotomistId: params.phlebotomist?.id || '',
    ...(params.phlebotomist?.name ? { phlebotomistName: params.phlebotomist.name } : {}),
    status: hasPhlebo ? OrderStatus.ASSIGNED_TO_PHLEBO : OrderStatus.READY_FOR_PICKUP,
    priority: params.priority,
    patient: params.patient,
    specimens,
    custodyHistory: [custodyEvent],
    pickupLocation: {
      address: params.smallLab.address,
      latitude: 19.1438,
      longitude: 72.9378,
      ...(params.smallLab.phone ? { contactPhone: params.smallLab.phone } : {}),
    },
    deliveryLocation: {
      address: params.targetLab.address,
      latitude: 19.1726,
      longitude: 72.9565,
    },
    scheduledPickupAt: params.scheduledPickupAt,
    totalAmountInr,
    courierFeeInr,
    paymentStatus: 'UNPAID',
    handoverOtp,
    department: params.selectedTests[0]?.department || 'Pathology',
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'orders', orderNumber), newOrder);
  await addDoc(collection(db, 'custody_events'), custodyEvent);

  const settlement: SettlementRecord = {
    id: `STL-${orderNumber.replace('BK-', '')}`,
    orderId: orderNumber,
    orderNumber,
    smallLabId: params.smallLab.id,
    smallLabName: params.smallLab.name,
    targetLabId: params.targetLab.id,
    targetLabName: params.targetLab.name,
    ...(params.phlebotomist?.id ? { phlebotomistId: params.phlebotomist.id } : {}),
    ...(params.phlebotomist?.name ? { phlebotomistName: params.phlebotomist.name } : {}),
    grossAmountInr: totalAmountInr,
    platformFeeInr,
    labPayoutInr,
    phleboPayoutInr: courierFeeInr,
    billingPeriod: currentBillingPeriod(),
    paymentStatus: 'UNPAID',
    labPayoutStatus: 'PENDING',
    phleboPayoutStatus: 'PENDING',
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'settlements', settlement.id), settlement);

  // Update patient visit counter if linked to saved patient record
  if (params.patient.id.startsWith('PT-')) {
    try {
      const pSnap = await getDoc(doc(db, 'patients', params.patient.id));
      if (pSnap.exists()) {
        const currentTotal = (pSnap.data() as PatientRecord).totalOrders || 0;
        await updateDoc(doc(db, 'patients', params.patient.id), {
          totalOrders: currentTotal + 1,
          lastVisitAt: now,
          updatedAt: now,
        });
      }
    } catch {
      // Ad-hoc patient without directory record
    }
  }

  await dispatchPlatformAlert({
    title: `New Booking ${orderNumber} (${params.priority})`,
    message: `${params.smallLab.name} requested pickup for ${params.patient.pseudonym} -> ${params.targetLab.name}. Handover OTP: ${handoverOtp}`,
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
  }

  return newOrder;
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

  await updateDoc(doc(db, 'orders', params.order.id), {
    ...(params.extraFields || {}),
    status: params.nextStatus,
    ...(params.nextStatus === OrderStatus.PICKED_UP ? { actualPickupAt: now } : {}),
    ...(params.nextStatus === OrderStatus.DELIVERED_TO_LAB ? { actualDeliveredAt: now } : {}),
    ...(typeof params.temperatureCelsius === 'number'
      ? { arrivalTemperatureCelsius: params.temperatureCelsius }
      : {}),
    ...(params.qualityStatus ? { qualityStatus: params.qualityStatus } : {}),
    custodyHistory: [...(params.order.custodyHistory || []), evt],
    updatedAt: now,
  });

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

  const record: DiagnosticReportRecord = {
    id: reportId,
    orderId: params.order.id,
    orderNumber: params.order.orderNumber,
    patientId: params.order.patient.id,
    patientName: params.order.patient.pseudonym,
    smallLabId: params.order.smallLabId,
    smallLabName: params.order.smallLabName,
    targetLabId: params.order.targetLabId,
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
  };

  await setDoc(doc(db, 'reports', reportId), record);

  const evt: CustodyEvent = {
    id: `EVT-${Date.now()}`,
    orderId: params.order.id,
    eventType: CustodyEventType.ACCESSIONED_BY_PARTNER_LAB,
    timestamp: now,
    operatorId: params.operatorUid,
    operatorName: params.operatorName,
    operatorRole: UserRole.LARGE_LAB,
    notes: `Verified report ${reportId} uploaded by ${record.pathologistName}`,
  };

  await updateDoc(doc(db, 'orders', params.order.id), {
    status: OrderStatus.REPORT_UPLOADED,
    reportDocumentUrl: downloadUrl,
    reportId,
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
    { ...cfg, updatedBy: adminEmail, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}
