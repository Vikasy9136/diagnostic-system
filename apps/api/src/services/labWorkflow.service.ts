import crypto from 'node:crypto';
import {
  type BookingTestItem,
  canTransitionOrderStatus,
  type CollectionCentreRecord,
  deepCleanFirestorePayload,
  type DiagnosticReportRecord,
  type DiagnosticTestItem,
  type LabFacility,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  OrderStatus,
  type PickupOrder,
  type ProcessingStatusHistoryEntry,
  type ReportVersionEntry,
  SpecimenQualityStatus,
  UserRole,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { AppError } from '../middleware/errorHandler';
import { recordAuditLog } from '../middleware/rbac';
import { sendPlatformNotification } from './notification.service';
import { markUrgentRequestsCompletedForTests } from './urgentReport.service';

export interface HandoverOtpRecord {
  orderId: string;
  otpHash: string;
  receivingCentreId: string;
  largeLabId: string;
  phleboId: string;
  expiresAtMs: number;
  attemptsUsed: number;
  maxAttempts: number;
  used: boolean;
  usedAt?: string;
  createdAt: string;
}

// In-memory stores for deterministic mock & E2E testing
const memLabs = new Map<string, LabFacility>();
const memCatalog = new Map<string, DiagnosticTestItem>();
const memCentres = new Map<string, CollectionCentreRecord>();
const memOrders = new Map<string, PickupOrder>();
const memOtps = new Map<string, HandoverOtpRecord>();
const memReports = new Map<string, DiagnosticReportRecord>();
const memReportBytes = new Map<string, { mimeType: string; base64: string }>();

export function resetLabWorkflowTestStores() {
  memLabs.clear();
  memCatalog.clear();
  memCentres.clear();
  memOrders.clear();
  memOtps.clear();
  memReports.clear();
  memReportBytes.clear();
}

export function seedLabForWorkflowTest(lab: LabFacility) {
  memLabs.set(lab.id, lab);
}

export function seedOrderForWorkflowTest(order: PickupOrder) {
  memOrders.set(order.id, order);
}

function hashOtp(orderId: string, otp: string): string {
  return crypto.createHash('sha256').update(`${orderId}:${otp.trim()}`).digest('hex');
}

export async function upsertLargeLabTestOrPackage(params: {
  largeLabId: string;
  largeLabName: string;
  item: Partial<DiagnosticTestItem> & { code: string; name: string; b2bPriceInr: number };
  actorUid?: string;
  actorEmail?: string;
  isAdmin?: boolean;
}): Promise<DiagnosticTestItem> {
  const { db, isMockMode } = initializeFirebase();
  const code = params.item.code.trim().toUpperCase();
  const name = params.item.name.trim();
  const itemType = params.item.itemType === 'PACKAGE' ? 'PACKAGE' : 'TEST';
  if (!code || !name) {
    throw new AppError('Test/Package code and name are required.', 400, 'INVALID_CATALOGUE_ITEM');
  }
  if (!Number.isFinite(params.item.b2bPriceInr) || params.item.b2bPriceInr <= 0) {
    throw new AppError('B2B price must be greater than 0.', 400, 'INVALID_PRICE');
  }

  let existingAll: DiagnosticTestItem[] = [];
  if (db && !isMockMode) {
    const snap = await db.collection('test_catalog').where('labId', '==', params.largeLabId).get();
    existingAll = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DiagnosticTestItem, 'id'>) }));
  } else {
    existingAll = Array.from(memCatalog.values()).filter((t) => t.labId === params.largeLabId);
  }

  const dupCode = existingAll.find((t) => t.code === code && t.id !== params.item.id);
  if (dupCode) {
    throw new AppError(`Code "${code}" already exists in your catalogue.`, 409, 'DUPLICATE_CATALOGUE_CODE');
  }

  let includedTests: DiagnosticTestItem['includedTests'];
  let includedTestIds = params.item.includedTestIds;
  if (itemType === 'PACKAGE') {
    if (!Array.isArray(includedTestIds) || includedTestIds.length < 2) {
      throw new AppError('A package must include at least 2 existing tests.', 400, 'PACKAGE_TESTS_REQUIRED');
    }
    if (new Set(includedTestIds).size !== includedTestIds.length) {
      throw new AppError('Duplicate tests are not allowed inside a package.', 400, 'DUPLICATE_PACKAGE_TEST');
    }
    includedTests = includedTestIds.map((tid) => {
      const found = existingAll.find((t) => t.id === tid && (t.itemType || 'TEST') === 'TEST');
      if (!found) {
        throw new AppError(`Included test "${tid}" was not found in your Large Lab catalogue.`, 400, 'INVALID_PACKAGE_TEST');
      }
      return { id: found.id, code: found.code, name: found.name, b2bPriceInr: found.b2bPriceInr };
    });
  }

  const prev = params.item.id ? existingAll.find((t) => t.id === params.item.id) : undefined;
  const now = new Date().toISOString();
  const id = params.item.id || `${itemType === 'PACKAGE' ? 'PKG' : 'TST'}-${params.largeLabId}-${code}`;
  const prevHistory = Array.isArray(prev?.pricingHistory) ? prev!.pricingHistory : [];
  const nextHistory =
    !prev || prev.b2bPriceInr !== params.item.b2bPriceInr
      ? [
          ...prevHistory,
          {
            priceInr: params.item.b2bPriceInr,
            changedBy: params.actorEmail || params.largeLabId,
            changedAt: now,
            reason: prev ? 'Price updated' : 'Initial price',
          },
        ]
      : prevHistory;

  const saved: DiagnosticTestItem = {
    ...(prev || {}),
    ...(params.item as DiagnosticTestItem),
    id,
    code,
    name,
    itemType,
    labId: params.largeLabId,
    ownerOrgId: params.largeLabId,
    labName: params.largeLabName,
    isActive: params.item.isActive !== false,
    isAvailable: params.item.isAvailable !== false,
    approvalStatus: params.isAdmin ? 'APPROVED' : prev?.approvalStatus || 'PENDING_APPROVAL',
    ...(includedTestIds ? { includedTestIds, includedTests, includedTestCodes: includedTests?.map((x) => x.code) } : {}),
    pricingHistory: nextHistory,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
  };

  if (db && !isMockMode) {
    await db.collection('test_catalog').doc(id).set(deepCleanFirestorePayload(saved), { merge: true });
  } else {
    memCatalog.set(id, saved);
  }

  await recordAuditLog({
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    actorRole: params.isAdmin ? 'ADMIN' : 'LARGE_LAB',
    action: `${itemType}_UPSERTED`,
    resourceType: 'test_catalog',
    resourceId: id,
    summary: `${prev ? 'Updated' : 'Created'} ${itemType} ${code} (${name}) at ₹${saved.b2bPriceInr}.`,
  });

  return saved;
}

export async function setCatalogueApprovalByAdmin(params: {
  itemId: string;
  approvalStatus: 'APPROVED' | 'REJECTED';
  actorUid?: string;
  actorEmail?: string;
}): Promise<DiagnosticTestItem> {
  const { db, isMockMode } = initializeFirebase();
  const now = new Date().toISOString();
  let item: DiagnosticTestItem | null = null;
  if (db && !isMockMode) {
    const snap = await db.collection('test_catalog').doc(params.itemId).get();
    if (snap.exists) item = { id: snap.id, ...(snap.data() as Omit<DiagnosticTestItem, 'id'>) };
  } else {
    item = memCatalog.get(params.itemId) || null;
  }
  if (!item) throw new AppError('Catalogue item not found.', 404, 'NOT_FOUND');

  const updated: DiagnosticTestItem = {
    ...item,
    approvalStatus: params.approvalStatus,
    approvedBy: params.actorEmail,
    approvedAt: now,
    updatedAt: now,
  };
  if (db && !isMockMode) {
    await db.collection('test_catalog').doc(params.itemId).set(deepCleanFirestorePayload(updated), { merge: true });
  } else {
    memCatalog.set(params.itemId, updated);
  }

  await recordAuditLog({
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    actorRole: 'ADMIN',
    action: `CATALOGUE_${params.approvalStatus}`,
    resourceType: 'test_catalog',
    resourceId: params.itemId,
    summary: `${params.approvalStatus} catalogue item ${item.code} (${item.name}).`,
  });

  return updated;
}

export async function discoverApprovedLargeLabOfferings(filters: {
  q?: string;
  itemType?: 'TEST' | 'PACKAGE' | 'ALL';
  department?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  maxTatHours?: number;
  sortBy?: 'LOWEST_PRICE' | 'HIGHEST_PRICE' | 'FASTEST_TAT';
  page?: number;
  pageSize?: number;
}): Promise<{
  items: Array<DiagnosticTestItem & { lab?: LabFacility }>;
  total: number;
  page: number;
  pageSize: number;
}> {
  const { db, isMockMode } = initializeFirebase();
  let labs: LabFacility[] = [];
  let catalog: DiagnosticTestItem[] = [];

  if (db && !isMockMode) {
    const [labsSnap, catSnap] = await Promise.all([
      db.collection('labs').where('type', '==', 'LARGE_LAB').get(),
      db.collection('test_catalog').where('isActive', '==', true).get(),
    ]);
    labs = labsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LabFacility, 'id'>) }));
    catalog = catSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DiagnosticTestItem, 'id'>) }));
  } else {
    labs = Array.from(memLabs.values()).filter((l) => l.type === 'LARGE_LAB');
    catalog = Array.from(memCatalog.values()).filter((t) => t.isActive);
  }

  const eligibleLabMap = new Map<string, LabFacility>();
  for (const l of labs) {
    if (l.verified && l.verificationStatus === 'VERIFIED') {
      eligibleLabMap.set(l.id, l);
    }
  }

  const q = (filters.q || '').trim().toLowerCase();
  const matched = catalog
    .filter((t) => {
      if (!t.isActive || t.isAvailable === false) return false;
      if (t.approvalStatus !== 'APPROVED') return false;
      const lab = t.labId ? eligibleLabMap.get(t.labId) : undefined;
      if (!lab) return false;

      if (filters.itemType && filters.itemType !== 'ALL' && (t.itemType || 'TEST') !== filters.itemType) {
        return false;
      }
      if (filters.department && t.department !== filters.department) return false;
      if (filters.city && lab.city?.toLowerCase() !== filters.city.trim().toLowerCase()) return false;
      if (typeof filters.minPrice === 'number' && t.b2bPriceInr < filters.minPrice) return false;
      if (typeof filters.maxPrice === 'number' && t.b2bPriceInr > filters.maxPrice) return false;
      if (typeof filters.maxTatHours === 'number' && t.tatHours > filters.maxTatHours) return false;
      if (q) {
        const hay = `${t.name} ${t.code} ${t.department} ${lab.name} ${lab.city || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .map((t) => ({ ...t, lab: t.labId ? eligibleLabMap.get(t.labId) : undefined }));

  const sortBy = filters.sortBy || 'LOWEST_PRICE';
  matched.sort((a, b) => {
    if (sortBy === 'HIGHEST_PRICE') return b.b2bPriceInr - a.b2bPriceInr;
    if (sortBy === 'FASTEST_TAT') return a.tatHours - b.tatHours || a.b2bPriceInr - b.b2bPriceInr;
    return a.b2bPriceInr - b.b2bPriceInr || a.tatHours - b.tatHours;
  });

  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize) || 20));
  const start = (page - 1) * pageSize;

  return {
    items: matched.slice(start, start + pageSize),
    total: matched.length,
    page,
    pageSize,
  };
}

export async function saveCollectionCentre(params: {
  largeLabId: string;
  centre: Partial<CollectionCentreRecord> & {
    name: string;
    address: string;
    city: string;
    pincode: string;
    contactPersonName: string;
    contactPhone: string;
  };
  actorUid?: string;
  actorEmail?: string;
}): Promise<CollectionCentreRecord> {
  const { db, isMockMode } = initializeFirebase();
  const now = new Date().toISOString();
  const id = params.centre.id || `CTR-${params.largeLabId}-${Date.now().toString().slice(-5)}`;
  const record: CollectionCentreRecord = {
    id,
    largeLabId: params.largeLabId,
    name: params.centre.name.trim(),
    address: params.centre.address.trim(),
    city: params.centre.city.trim(),
    district: params.centre.district?.trim(),
    state: params.centre.state?.trim(),
    pincode: params.centre.pincode.trim(),
    latitude: params.centre.latitude,
    longitude: params.centre.longitude,
    centreType: params.centre.centreType || 'BOTH',
    contactPersonName: params.centre.contactPersonName.trim(),
    contactDesignation: params.centre.contactDesignation?.trim(),
    contactPhone: params.centre.contactPhone.trim(),
    alternatePhone: params.centre.alternatePhone?.trim(),
    operatingHours: params.centre.operatingHours || '08:00 AM – 08:30 PM',
    isAvailable: params.centre.isAvailable !== false,
    canReceiveSamples: params.centre.canReceiveSamples !== false,
    canProcessSamples: params.centre.canProcessSamples !== false,
    handoverInstructions: params.centre.handoverInstructions?.trim(),
    createdAt: params.centre.createdAt || now,
    updatedAt: now,
  };

  if (db && !isMockMode) {
    await db.collection('collection_centres').doc(id).set(deepCleanFirestorePayload(record), { merge: true });
  } else {
    memCentres.set(id, record);
  }

  await recordAuditLog({
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    actorRole: 'LARGE_LAB',
    action: 'COLLECTION_CENTRE_SAVED',
    resourceType: 'collection_centres',
    resourceId: id,
    summary: `Saved collection centre "${record.name}" (${record.city}) for ${params.largeLabId}.`,
  });

  return record;
}

export async function listCollectionCentres(largeLabId: string): Promise<CollectionCentreRecord[]> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection('collection_centres').where('largeLabId', '==', largeLabId).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CollectionCentreRecord, 'id'>) }));
  }
  return Array.from(memCentres.values()).filter((c) => c.largeLabId === largeLabId);
}

async function loadOrder(orderId: string): Promise<PickupOrder> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection('orders').doc(orderId).get();
    if (!snap.exists) throw new AppError(`Booking not found: ${orderId}`, 404, 'NOT_FOUND');
    return { id: snap.id, ...(snap.data() as Omit<PickupOrder, 'id'>) };
  }
  const found = memOrders.get(orderId);
  if (!found) throw new AppError(`Booking not found: ${orderId}`, 404, 'NOT_FOUND');
  return found;
}

async function saveOrderPatch(orderId: string, patch: Partial<PickupOrder>): Promise<PickupOrder> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db.collection('orders').doc(orderId).set(deepCleanFirestorePayload(patch), { merge: true });
    return loadOrder(orderId);
  }
  const prev = memOrders.get(orderId);
  if (!prev) throw new AppError(`Booking not found: ${orderId}`, 404, 'NOT_FOUND');
  const next = { ...prev, ...patch };
  memOrders.set(orderId, next);
  return next;
}

export async function generateHandoverOtp(params: {
  orderId: string;
  phleboId: string;
  ttlMinutes?: number;
  maxAttempts?: number;
}): Promise<{ expiresAt: string; receivingCentreId: string; otpForNotificationOnly?: string }> {
  const order = await loadOrder(params.orderId);
  if (order.phlebotomistId && order.phlebotomistId !== params.phleboId) {
    throw new AppError('Only the assigned Phlebotomist can initiate sample handover.', 403, 'FORBIDDEN');
  }
  if (order.handoverVerifiedAt) {
    throw new AppError('Sample handover is already verified for this booking.', 400, 'DUPLICATE_HANDOVER');
  }

  const rawOtp = String(crypto.randomInt(100000, 1000000));
  const ttlMs = Math.max(1, params.ttlMinutes ?? 10) * 60 * 1000;
  const now = new Date().toISOString();
  const expiresAtMs = Date.now() + ttlMs;
  const receivingCentreId = order.selectedCentreId || order.targetLabId;

  const otpRecord: HandoverOtpRecord = {
    orderId: order.id,
    otpHash: hashOtp(order.id, rawOtp),
    receivingCentreId,
    largeLabId: order.targetParentLabId || order.targetLabId,
    phleboId: params.phleboId,
    expiresAtMs,
    attemptsUsed: 0,
    maxAttempts: params.maxAttempts ?? 5,
    used: false,
    createdAt: now,
  };

  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db.collection('handover_otps').doc(order.id).set(deepCleanFirestorePayload(otpRecord));
  } else {
    memOtps.set(order.id, otpRecord);
  }

  await sendPlatformNotification({
    title: `Handover OTP Ready — ${order.orderNumber}`,
    message: `Phlebo has arrived at ${order.selectedCentreName || order.targetLabName}. Share one-time Handover OTP ${rawOtp} (valid ${params.ttlMinutes ?? 10} min) after verifying sample condition.`,
    category: NotificationCategory.SAMPLE_COLLECTED,
    priority: NotificationPriority.HIGH,
    recipientRole: UserRole.LARGE_LAB,
    recipientUid: order.targetLabId,
    orderId: order.id,
    channels: [NotificationChannel.IN_APP],
  });

  await recordAuditLog({
    actorUid: params.phleboId,
    actorRole: UserRole.PHLEBOTOMIST,
    action: 'HANDOVER_OTP_GENERATED',
    resourceType: 'orders',
    resourceId: order.id,
    summary: `Generated server-side handover OTP for ${order.orderNumber} at centre ${receivingCentreId}.`,
  });

  return {
    expiresAt: new Date(expiresAtMs).toISOString(),
    receivingCentreId,
    ...(isMockMode ? { otpForNotificationOnly: rawOtp } : {}),
  };
}

export async function verifyHandoverOtp(params: {
  orderId: string;
  phleboId: string;
  otp: string;
  centreId: string;
  receiverId?: string;
  temperatureCelsius?: number;
  remarks?: string;
  nowMs?: number;
}): Promise<PickupOrder> {
  const order = await loadOrder(params.orderId);
  if (order.phlebotomistId && order.phlebotomistId !== params.phleboId) {
    throw new AppError('Only the assigned Phlebotomist can complete sample handover.', 403, 'FORBIDDEN');
  }
  const expectedCentre = order.selectedCentreId || order.targetLabId;
  if (params.centreId !== expectedCentre && params.centreId !== order.targetLabId) {
    throw new AppError(`Wrong centre handover: expected ${expectedCentre}, got ${params.centreId}.`, 400, 'WRONG_CENTRE_HANDOVER');
  }

  const { db, isMockMode } = initializeFirebase();
  let otpRec: HandoverOtpRecord | null = null;
  if (db && !isMockMode) {
    const snap = await db.collection('handover_otps').doc(order.id).get();
    if (snap.exists) otpRec = snap.data() as HandoverOtpRecord;
  } else {
    otpRec = memOtps.get(order.id) || null;
  }

  if (!otpRec) {
    throw new AppError('No active handover OTP found. Generate an OTP first.', 400, 'OTP_NOT_FOUND');
  }
  if (otpRec.used) {
    throw new AppError('Handover OTP has already been used.', 400, 'OTP_ALREADY_USED');
  }
  const nowMs = params.nowMs ?? Date.now();
  if (nowMs > otpRec.expiresAtMs) {
    throw new AppError('Handover OTP has expired. Please request a new OTP.', 400, 'OTP_EXPIRED');
  }
  if (otpRec.attemptsUsed >= otpRec.maxAttempts) {
    throw new AppError('Maximum OTP verification attempts exceeded.', 429, 'OTP_ATTEMPTS_EXCEEDED');
  }

  const candidateBuf = Buffer.from(hashOtp(order.id, params.otp), 'hex');
  const expectedBuf = Buffer.from(otpRec.otpHash, 'hex');
  const matches = candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf);

  if (!matches) {
    const nextAttempts = otpRec.attemptsUsed + 1;
    if (db && !isMockMode) {
      await db.collection('handover_otps').doc(order.id).set({ attemptsUsed: nextAttempts }, { merge: true });
    } else {
      memOtps.set(order.id, { ...otpRec, attemptsUsed: nextAttempts });
    }
    throw new AppError(`Invalid Handover OTP (${otpRec.maxAttempts - nextAttempts} attempts left).`, 400, 'INVALID_OTP');
  }

  const now = new Date(nowMs).toISOString();
  if (db && !isMockMode) {
    await db.collection('handover_otps').doc(order.id).set({ used: true, usedAt: now }, { merge: true });
  } else {
    memOtps.set(order.id, { ...otpRec, used: true, usedAt: now });
  }

  const histEntry: ProcessingStatusHistoryEntry = {
    previousStatus: order.status,
    newStatus: OrderStatus.SAMPLE_RECEIVED_AT_CENTRE,
    userId: params.phleboId,
    userRole: UserRole.PHLEBOTOMIST,
    timestamp: now,
    centreId: params.centreId,
    remarks: params.remarks || 'OTP verified handover at assigned centre',
  };

  const updated = await saveOrderPatch(order.id, {
    status: OrderStatus.SAMPLE_RECEIVED_AT_CENTRE,
    actualDeliveredAt: now,
    deliveredAt: now,
    handoverVerifiedAt: now,
    handoverVerifiedBy: params.receiverId || order.deliveryLocation?.contactName || 'AUTHORISED_CENTRE_STAFF',
    handoverCentreId: params.centreId,
    ...(typeof params.temperatureCelsius === 'number' ? { arrivalTemperatureCelsius: params.temperatureCelsius } : {}),
    processingStatusHistory: [...(order.processingStatusHistory || []), histEntry],
    updatedAt: now,
  });

  await Promise.all([
    sendPlatformNotification({
      title: `Sample Received at Centre — ${order.orderNumber}`,
      message: `Sample for ${order.orderNumber} was handed over and verified via OTP at ${order.selectedCentreName || order.targetLabName}.`,
      category: NotificationCategory.SAMPLE_COLLECTED,
      priority: NotificationPriority.NORMAL,
      recipientRole: UserRole.SMALL_LAB,
      recipientUid: order.smallLabId,
      orderId: order.id,
      channels: [NotificationChannel.IN_APP],
    }),
    sendPlatformNotification({
      title: `Sample Received — ${order.orderNumber}`,
      message: `Handover OTP verified. Sample is now at ${order.selectedCentreName || order.targetLabName}.`,
      category: NotificationCategory.SAMPLE_COLLECTED,
      priority: NotificationPriority.NORMAL,
      recipientRole: UserRole.LARGE_LAB,
      recipientUid: order.targetLabId,
      orderId: order.id,
      channels: [NotificationChannel.IN_APP],
    }),
  ]);

  await recordAuditLog({
    actorUid: params.phleboId,
    actorRole: UserRole.PHLEBOTOMIST,
    action: 'HANDOVER_OTP_VERIFIED',
    resourceType: 'orders',
    resourceId: order.id,
    summary: `Handover OTP verified for ${order.orderNumber} at centre ${params.centreId}.`,
  });

  return updated;
}

export async function transitionOrderProcessingStatus(params: {
  orderId: string;
  nextStatus: OrderStatus;
  actorUid: string;
  actorRole: UserRole;
  actorLabId?: string;
  centreId?: string;
  remarks?: string;
}): Promise<PickupOrder> {
  const order = await loadOrder(params.orderId);
  if (params.actorRole === UserRole.LARGE_LAB) {
    if (!params.actorLabId || (order.targetLabId !== params.actorLabId && order.targetParentLabId !== params.actorLabId)) {
      throw new AppError('You are not authorized to update this booking.', 403, 'FORBIDDEN');
    }
  } else if (params.actorRole !== UserRole.ADMIN) {
    throw new AppError('Unauthorized role for processing status transition.', 403, 'FORBIDDEN');
  }

  if (!canTransitionOrderStatus(order.status, params.nextStatus)) {
    throw new AppError(
      `Invalid status transition from ${order.status} to ${params.nextStatus}.`,
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }

  if (
    [OrderStatus.REJECTED, OrderStatus.INSUFFICIENT_SAMPLE, OrderStatus.RECOLLECTION_REQUIRED].includes(params.nextStatus) &&
    !params.remarks?.trim()
  ) {
    throw new AppError('A reason/remarks is required for rejected or recollection statuses.', 400, 'REMARKS_REQUIRED');
  }

  const now = new Date().toISOString();
  const histEntry: ProcessingStatusHistoryEntry = {
    previousStatus: order.status,
    newStatus: params.nextStatus,
    userId: params.actorUid,
    userRole: params.actorRole,
    timestamp: now,
    centreId: params.centreId || order.selectedCentreId || order.targetLabId,
    remarks: params.remarks,
  };

  const updated = await saveOrderPatch(order.id, {
    status: params.nextStatus,
    ...(params.nextStatus === OrderStatus.REJECTED && params.remarks ? { rejectionReason: params.remarks } : {}),
    processingStatusHistory: [...(order.processingStatusHistory || []), histEntry],
    updatedAt: now,
  });

  if (
    [
      OrderStatus.SAMPLE_IN_LAB,
      OrderStatus.UNDER_ANALYSIS,
      OrderStatus.PROCESSING_COMPLETED,
      OrderStatus.RECOLLECTION_REQUIRED,
      OrderStatus.INSUFFICIENT_SAMPLE,
      OrderStatus.REJECTED,
    ].includes(params.nextStatus)
  ) {
    await sendPlatformNotification({
      title: `Sample Update (${order.orderNumber}): ${params.nextStatus.replace(/_/g, ' ')}`,
      message: params.remarks
        ? `${order.targetLabName} updated ${order.orderNumber} to ${params.nextStatus.replace(/_/g, ' ')}. Remarks: ${params.remarks}`
        : `${order.targetLabName} updated ${order.orderNumber} to ${params.nextStatus.replace(/_/g, ' ')}.`,
      category: NotificationCategory.SYSTEM_ALERT,
      priority:
        params.nextStatus === OrderStatus.RECOLLECTION_REQUIRED || params.nextStatus === OrderStatus.REJECTED
          ? NotificationPriority.HIGH
          : NotificationPriority.NORMAL,
      recipientRole: UserRole.SMALL_LAB,
      recipientUid: order.smallLabId,
      orderId: order.id,
      channels: [NotificationChannel.IN_APP],
    });
  }

  return updated;
}

export async function uploadTestOrCombinedReport(params: {
  orderId: string;
  actorUid: string;
  actorRole: UserRole;
  actorLabId?: string;
  reportType: 'INDIVIDUAL' | 'COMBINED';
  coveredTestIds: string[];
  pathologistName: string;
  authoriseNow: boolean;
  fileName: string;
  mimeType: string;
  base64Data: string;
  reportDate?: string;
  remarks?: string;
}): Promise<{ report: DiagnosticReportRecord; order: PickupOrder }> {
  const order = await loadOrder(params.orderId);
  if (params.actorRole === UserRole.LARGE_LAB) {
    if (!params.actorLabId || (order.targetLabId !== params.actorLabId && order.targetParentLabId !== params.actorLabId)) {
      throw new AppError('Only the assigned Large Lab can upload reports for this booking.', 403, 'FORBIDDEN');
    }
  } else if (params.actorRole !== UserRole.ADMIN) {
    throw new AppError('Unauthorized role for report upload.', 403, 'FORBIDDEN');
  }

  if (!Array.isArray(params.coveredTestIds) || params.coveredTestIds.length === 0) {
    throw new AppError('Select at least one test covered by this report.', 400, 'COVERED_TESTS_REQUIRED');
  }
  if (params.reportType === 'INDIVIDUAL' && params.coveredTestIds.length !== 1) {
    throw new AppError('Individual report must cover exactly 1 test.', 400, 'INVALID_INDIVIDUAL_REPORT');
  }
  if (params.authoriseNow && !params.pathologistName.trim()) {
    throw new AppError('Authorised Pathologist name is required before publishing.', 400, 'PATHOLOGIST_REQUIRED');
  }

  const allowedMime = ['application/pdf', 'image/png', 'image/jpeg'];
  if (!allowedMime.includes(params.mimeType.toLowerCase())) {
    throw new AppError('Report must be a PDF, PNG, or JPEG file.', 400, 'INVALID_REPORT_FORMAT');
  }
  const cleanB64 = params.base64Data.replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(cleanB64, 'base64');
  if (buf.length < 50 || buf.length > 10 * 1024 * 1024) {
    throw new AppError('Report file must be between 50 bytes and 10 MB.', 400, 'INVALID_REPORT_SIZE');
  }

  // Build or resolve bookingTestItems
  const now = new Date().toISOString();
  const currentItems: BookingTestItem[] =
    order.bookingTestItems && order.bookingTestItems.length > 0
      ? [...order.bookingTestItems]
      : order.specimens.map((s) => ({
          testId: s.testCode,
          testCode: s.testCode,
          testName: s.testName,
          sampleType: s.specimenType,
          priceInr: 0,
          reportStatus: 'PENDING' as const,
          updatedAt: now,
        }));

  const validTestIds = new Set(currentItems.map((i) => i.testId));
  for (const tid of params.coveredTestIds) {
    if (!validTestIds.has(tid)) {
      throw new AppError(`Test "${tid}" is not part of booking ${order.orderNumber}.`, 400, 'INVALID_COVERED_TEST');
    }
  }

  const coveredNames = currentItems
    .filter((i) => params.coveredTestIds.includes(i.testId))
    .map((i) => i.testName || i.testCode);

  const reportId =
    params.reportType === 'INDIVIDUAL'
      ? `RPT-${order.orderNumber}-${params.coveredTestIds[0]}`
      : `RPT-${order.orderNumber}-COMB-${crypto.createHash('md5').update(params.coveredTestIds.slice().sort().join(',')).digest('hex').slice(0, 6).toUpperCase()}`;

  const { db, storage, isMockMode } = initializeFirebase();
  let existingReport: DiagnosticReportRecord | null = null;
  if (db && !isMockMode) {
    const snap = await db.collection('reports').doc(reportId).get();
    if (snap.exists) existingReport = snap.data() as DiagnosticReportRecord;
  } else {
    existingReport = memReports.get(reportId) || null;
  }

  const nextVersion = (existingReport?.version || 0) + 1;
  const storagePath = `private-reports/${order.id}/${reportId}-v${nextVersion}.pdf`;

  if (db && storage && !isMockMode) {
    const file = storage.bucket().file(storagePath);
    await file.save(buf, { contentType: params.mimeType, resumable: false, public: false });
  } else {
    memReportBytes.set(storagePath, { mimeType: params.mimeType, base64: cleanB64 });
  }

  const versionEntry: ReportVersionEntry = {
    version: nextVersion,
    fileName: params.fileName,
    storagePath,
    uploadedBy: params.actorUid,
    uploadedAt: now,
    remarks: params.remarks,
  };

  const report: DiagnosticReportRecord = {
    id: reportId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    patientId: order.patient.id,
    patientName: order.patient.pseudonym,
    patientReferenceId: order.patient.id,
    smallLabId: order.smallLabId,
    smallLabName: order.smallLabName,
    targetLabId: order.targetLabId,
    ...(order.targetParentLabId ? { targetParentLabId: order.targetParentLabId } : {}),
    targetLabName: order.targetLabName,
    testsSummary: coveredNames.join(', '),
    reportType: params.reportType,
    coveredTestIds: params.coveredTestIds,
    coveredTestNames: coveredNames,
    authorisationStatus: params.authoriseNow ? 'AUTHORISED' : 'DRAFT',
    version: nextVersion,
    versions: [...(existingReport?.versions || []), versionEntry],
    reportDate: params.reportDate || now.slice(0, 10),
    remarks: params.remarks,
    pathologistName: params.pathologistName.trim(),
    fileName: params.fileName,
    downloadUrl: `/api/v1/workflow/reports/${reportId}/download`, // Authorised private endpoint only
    storagePath,
    qualityStatus: order.qualityStatus || SpecimenQualityStatus.INTACT,
    verifiedAt: params.authoriseNow ? now : existingReport?.verifiedAt || '',
    createdAt: existingReport?.createdAt || now,
  };

  if (db && !isMockMode) {
    await db.collection('reports').doc(reportId).set(deepCleanFirestorePayload(report));
    await db.collection('report_versions').doc(`${reportId}-v${nextVersion}`).set(deepCleanFirestorePayload({ ...versionEntry, reportId, orderId: order.id }));
  } else {
    memReports.set(reportId, report);
  }

  // Update ONLY the covered tests in bookingTestItems; leave uncovered tests untouched!
  const updatedItems: BookingTestItem[] = currentItems.map((item) => {
    if (!params.coveredTestIds.includes(item.testId)) return item;
    const isUrgentActive =
      item.urgentPriorityStatus &&
      ['URGENT_REQUESTED', 'URGENT_ACCEPTED', 'URGENT_IN_PROGRESS', 'URGENT_DELAYED'].includes(
        item.urgentPriorityStatus
      );
    return {
      ...item,
      reportStatus: params.authoriseNow ? 'AVAILABLE_TO_SMALL_LAB' : 'UPLOADED',
      latestReportId: reportId,
      reportType: params.reportType,
      ...(params.authoriseNow && isUrgentActive
        ? { urgentPriorityStatus: 'URGENT_COMPLETED' as const }
        : {}),
      updatedAt: now,
    };
  });

  const allAuthorised = updatedItems.every((i) => i.reportStatus === 'AVAILABLE_TO_SMALL_LAB');
  const nextOrderStatus = allAuthorised
    ? OrderStatus.REPORT_AVAILABLE_TO_SMALL_LAB
    : order.status === OrderStatus.COMPLETED
      ? OrderStatus.COMPLETED
      : OrderStatus.REPORT_PENDING;

  const updatedOrder = await saveOrderPatch(order.id, {
    bookingTestItems: updatedItems,
    status: nextOrderStatus,
    ...(allAuthorised ? { reportId, completedAt: order.completedAt || now } : {}),
    updatedAt: now,
  });

  if (params.authoriseNow) {
    await markUrgentRequestsCompletedForTests({
      orderId: order.id,
      coveredTestIds: params.coveredTestIds,
      actorUid: params.actorUid,
      actorRole: params.actorRole,
    });
    await sendPlatformNotification({
      title: `Verified ${params.reportType === 'COMBINED' ? 'Combined ' : ''}Report Available — ${order.orderNumber}`,
      message: `${order.targetLabName} published verified report for: ${coveredNames.join(', ')}.`,
      category: NotificationCategory.REPORT_UPLOADED,
      priority: NotificationPriority.HIGH,
      recipientRole: UserRole.SMALL_LAB,
      recipientUid: order.smallLabId,
      orderId: order.id,
      channels: [NotificationChannel.IN_APP],
    });
  }

  await recordAuditLog({
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    action: params.authoriseNow ? 'REPORT_PUBLISHED' : 'REPORT_DRAFT_UPLOADED',
    resourceType: 'reports',
    resourceId: reportId,
    summary: `Uploaded ${params.reportType} report v${nextVersion} for ${order.orderNumber} covering [${params.coveredTestIds.join(', ')}].`,
  });

  return { report, order: updatedOrder };
}

export async function getAuthorizedReportDownload(params: {
  reportId: string;
  actorUid: string;
  actorRole: UserRole;
  actorLabId?: string;
}): Promise<{ report: DiagnosticReportRecord; signedUrl?: string; dataUrl?: string }> {
  if (params.actorRole === UserRole.PHLEBOTOMIST) {
    throw new AppError('Phlebotomists are not permitted to access medical reports.', 403, 'FORBIDDEN');
  }

  const { db, storage, isMockMode } = initializeFirebase();
  let report: DiagnosticReportRecord | null = null;
  if (db && !isMockMode) {
    const snap = await db.collection('reports').doc(params.reportId).get();
    if (snap.exists) report = snap.data() as DiagnosticReportRecord;
  } else {
    report = memReports.get(params.reportId) || null;
  }
  if (!report) throw new AppError('Report not found.', 404, 'NOT_FOUND');

  if (params.actorRole === UserRole.SMALL_LAB) {
    if (!params.actorLabId || report.smallLabId !== params.actorLabId) {
      throw new AppError('Access denied: report belongs to another Small Lab.', 403, 'FORBIDDEN');
    }
    if (report.authorisationStatus !== 'AUTHORISED') {
      throw new AppError('Report is not yet authorised for Small Lab access.', 403, 'REPORT_NOT_AUTHORISED');
    }
  } else if (params.actorRole === UserRole.LARGE_LAB) {
    if (!params.actorLabId || (report.targetLabId !== params.actorLabId && report.targetParentLabId !== params.actorLabId)) {
      throw new AppError('Access denied: report belongs to another Large Lab.', 403, 'FORBIDDEN');
    }
  } else if (params.actorRole !== UserRole.ADMIN) {
    throw new AppError('Unauthorized role.', 403, 'FORBIDDEN');
  }

  if (db && storage && !isMockMode) {
    const file = storage.bucket().file(report.storagePath);
    const [exists] = await file.exists();
    if (!exists) throw new AppError('Report file missing in private storage.', 404, 'FILE_NOT_FOUND');
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 2 * 60 * 1000, // Short-lived 2-minute URL
    });
    return { report, signedUrl };
  }

  const mem = memReportBytes.get(report.storagePath);
  return {
    report,
    dataUrl: mem ? `data:${mem.mimeType};base64,${mem.base64}` : undefined,
  };
}
