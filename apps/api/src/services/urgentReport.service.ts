import {
  type BookingTestItem,
  deepCleanFirestorePayload,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  type PickupOrder,
  type UrgentPriorityLevel,
  type UrgentReportRequestRecord,
  type UrgentRequestHistoryEntry,
  type UrgentRequestStatus,
  UserRole,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { AppError } from '../middleware/errorHandler';
import { recordAuditLog } from '../middleware/rbac';
import { sendPlatformNotification } from './notification.service';

const ACTIVE_URGENT_STATUSES: UrgentRequestStatus[] = [
  'URGENT_REQUESTED',
  'URGENT_ACCEPTED',
  'URGENT_IN_PROGRESS',
  'URGENT_DELAYED',
];

const memUrgentRequests = new Map<string, UrgentReportRequestRecord>();
const memOrderAccessor = new Map<string, PickupOrder>();

export function resetUrgentReportTestStores() {
  memUrgentRequests.clear();
  memOrderAccessor.clear();
}

export function seedOrderForUrgentTest(order: PickupOrder) {
  memOrderAccessor.set(order.id, order);
}

export function getSeededOrderForUrgentTest(orderId: string): PickupOrder | undefined {
  return memOrderAccessor.get(orderId);
}

async function loadOrderForUrgent(orderId: string): Promise<PickupOrder> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection('orders').doc(orderId).get();
    if (!snap.exists) {
      throw new AppError(`Booking not found: ${orderId}`, 404, 'ORDER_NOT_FOUND');
    }
    return { id: snap.id, ...(snap.data() as Omit<PickupOrder, 'id'>) };
  }
  const mem = memOrderAccessor.get(orderId);
  if (!mem) {
    throw new AppError(`Booking not found: ${orderId}`, 404, 'ORDER_NOT_FOUND');
  }
  return mem;
}

async function patchOrderBookingTests(
  orderId: string,
  bookingTestItems: BookingTestItem[]
): Promise<void> {
  const now = new Date().toISOString();
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db
      .collection('orders')
      .doc(orderId)
      .update(deepCleanFirestorePayload({ bookingTestItems, updatedAt: now }));
    return;
  }
  const cur = memOrderAccessor.get(orderId);
  if (cur) {
    memOrderAccessor.set(orderId, { ...cur, bookingTestItems, updatedAt: now });
  }
}

async function loadAllUrgentRequestsFromStore(): Promise<UrgentReportRequestRecord[]> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection('urgent_report_requests').get();
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<UrgentReportRequestRecord, 'id'>),
    }));
  }
  return Array.from(memUrgentRequests.values());
}

async function saveUrgentRequest(record: UrgentReportRequestRecord): Promise<UrgentReportRequestRecord> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db
      .collection('urgent_report_requests')
      .doc(record.id)
      .set(deepCleanFirestorePayload(record));
  } else {
    memUrgentRequests.set(record.id, record);
  }
  return record;
}

async function loadUrgentRequestById(requestId: string): Promise<UrgentReportRequestRecord> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection('urgent_report_requests').doc(requestId).get();
    if (!snap.exists) {
      throw new AppError(`Urgent request not found: ${requestId}`, 404, 'NOT_FOUND');
    }
    return { id: snap.id, ...(snap.data() as Omit<UrgentReportRequestRecord, 'id'>) };
  }
  const mem = memUrgentRequests.get(requestId);
  if (!mem) {
    throw new AppError(`Urgent request not found: ${requestId}`, 404, 'NOT_FOUND');
  }
  return mem;
}

export async function createUrgentReportRequest(params: {
  orderId: string;
  testId: string;
  actorUid: string;
  actorRole: UserRole;
  actorLabId?: string;
  actorName?: string;
  requestedPriority?: UrgentPriorityLevel;
  reason: string;
  requestedDeadline: string;
  remarks?: string;
  nowMs?: number;
}): Promise<UrgentReportRequestRecord> {
  if (params.actorRole !== UserRole.SMALL_LAB && params.actorRole !== UserRole.ADMIN) {
    throw new AppError('Only the owning Small Lab can request urgent test reporting.', 403, 'FORBIDDEN');
  }

  const order = await loadOrderForUrgent(params.orderId);
  if (params.actorRole === UserRole.SMALL_LAB) {
    if (!params.actorLabId || order.smallLabId !== params.actorLabId) {
      throw new AppError('You do not own this booking.', 403, 'FORBIDDEN');
    }
  }

  const items: BookingTestItem[] = order.bookingTestItems?.length
    ? [...order.bookingTestItems]
    : (order.specimens || []).map((s, idx) => ({
        testId: s.testCode || s.id || `TEST-${idx + 1}`,
        testCode: s.testCode || `TEST-${idx + 1}`,
        testName: s.testName || s.testCode || `Test ${idx + 1}`,
        priceInr: 0,
        reportStatus: 'PENDING',
        updatedAt: order.updatedAt,
      }));

  const testIdx = items.findIndex(
    (t) => t.testId === params.testId || t.testCode === params.testId
  );
  if (testIdx < 0) {
    throw new AppError(`Test "${params.testId}" does not belong to booking ${order.orderNumber}.`, 400, 'INVALID_TEST');
  }

  const targetTest = items[testIdx];
  if (
    targetTest.reportStatus === 'AVAILABLE_TO_SMALL_LAB' ||
    targetTest.reportStatus === 'UPLOADED' ||
    targetTest.reportStatus === 'VERIFIED'
  ) {
    throw new AppError(
      `Report for ${targetTest.testName} is already authorised and available.`,
      400,
      'REPORT_ALREADY_AVAILABLE'
    );
  }

  const reason = (params.reason || '').trim();
  if (reason.length < 3) {
    throw new AppError('A clear reason for the urgent request is required.', 400, 'REASON_REQUIRED');
  }

  const deadlineMs = Date.parse(params.requestedDeadline);
  const nowMs = params.nowMs ?? Date.now();
  if (Number.isNaN(deadlineMs)) {
    throw new AppError('Requested deadline must be a valid date and time.', 400, 'INVALID_DEADLINE');
  }
  if (deadlineMs < nowMs + 15 * 60 * 1000) {
    throw new AppError(
      'Requested deadline must be at least 15 minutes in the future.',
      400,
      'UNREALISTIC_DEADLINE'
    );
  }

  const existingAll = await loadAllUrgentRequestsFromStore();
  const duplicate = existingAll.find(
    (r) =>
      r.orderId === order.id &&
      (r.testId === targetTest.testId || r.testCode === targetTest.testCode) &&
      ACTIVE_URGENT_STATUSES.includes(r.status)
  );
  if (duplicate) {
    throw new AppError(
      `An active urgent request (${duplicate.id}) already exists for ${targetTest.testName}.`,
      409,
      'DUPLICATE_URGENT_REQUEST'
    );
  }

  const now = new Date(nowMs).toISOString();
  const reqId = `URG-${order.orderNumber}-${targetTest.testCode}-${nowMs}`;
  const priority: UrgentPriorityLevel =
    params.requestedPriority === 'CRITICAL' ? 'CRITICAL' : 'URGENT';

  const historyEntry: UrgentRequestHistoryEntry = {
    action: 'REQUESTED',
    previousStatus: 'NORMAL',
    newStatus: 'URGENT_REQUESTED',
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    actorName: params.actorName || order.smallLabName,
    timestamp: now,
    remarks: reason,
    expectedCompletionAt: params.requestedDeadline,
  };

  const record: UrgentReportRequestRecord = {
    id: reqId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    testId: targetTest.testId,
    testCode: targetTest.testCode,
    testName: targetTest.testName,
    department: order.department,
    smallLabId: order.smallLabId,
    smallLabName: order.smallLabName,
    largeLabId: order.targetParentLabId || order.targetLabId,
    largeLabName: order.targetLabName,
    requestedPriority: priority,
    reason,
    requestedDeadline: new Date(deadlineMs).toISOString(),
    ...(params.remarks?.trim() ? { remarks: params.remarks.trim() } : {}),
    status: 'URGENT_REQUESTED',
    history: [historyEntry],
    createdAt: now,
    updatedAt: now,
  };

  await saveUrgentRequest(record);

  items[testIdx] = {
    ...targetTest,
    urgentPriorityStatus: 'URGENT_REQUESTED',
    urgentRequestId: reqId,
    urgentDeadline: record.requestedDeadline,
    updatedAt: now,
  };
  await patchOrderBookingTests(order.id, items);

  await Promise.all([
    sendPlatformNotification({
      title: `Urgent Report Request (${priority}) — ${order.orderNumber}`,
      message: `${order.smallLabName} requested urgent processing for ${targetTest.testName}. Deadline: ${record.requestedDeadline}. Reason: ${reason}`,
      category: NotificationCategory.SYSTEM_ALERT,
      priority: priority === 'CRITICAL' ? NotificationPriority.CRITICAL : NotificationPriority.HIGH,
      recipientRole: UserRole.LARGE_LAB,
      recipientUid: order.targetLabId,
      orderId: order.id,
      channels: [NotificationChannel.IN_APP],
      metadata: { idempotencyKey: `urg-req-${reqId}-lg`, urgentRequestId: reqId },
    }),
    sendPlatformNotification({
      title: `Urgent Request Submitted — ${targetTest.testName}`,
      message: `Your urgent request for ${targetTest.testName} (${order.orderNumber}) was sent to ${order.targetLabName}.`,
      category: NotificationCategory.SYSTEM_ALERT,
      priority: NotificationPriority.NORMAL,
      recipientRole: UserRole.SMALL_LAB,
      recipientUid: order.smallLabId,
      orderId: order.id,
      channels: [NotificationChannel.IN_APP],
      metadata: { idempotencyKey: `urg-req-${reqId}-sm`, urgentRequestId: reqId },
    }),
  ]);

  await recordAuditLog({
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    action: 'URGENT_REPORT_REQUESTED',
    resourceType: 'urgent_report_requests',
    resourceId: reqId,
    summary: `Requested ${priority} reporting for ${targetTest.testName} in ${order.orderNumber}.`,
  });

  return record;
}

export async function checkAndFlagDelayedUrgentRequests(
  nowMs: number = Date.now()
): Promise<UrgentReportRequestRecord[]> {
  const all = await loadAllUrgentRequestsFromStore();
  const nowIso = new Date(nowMs).toISOString();
  const flagged: UrgentReportRequestRecord[] = [];

  for (const r of all) {
    if (r.status !== 'URGENT_ACCEPTED' && r.status !== 'URGENT_IN_PROGRESS') continue;
    const expectedMs = r.acceptedExpectedCompletionAt
      ? Date.parse(r.acceptedExpectedCompletionAt)
      : NaN;
    if (Number.isNaN(expectedMs) || expectedMs >= nowMs) continue;

    const hist: UrgentRequestHistoryEntry = {
      action: 'DELAYED',
      previousStatus: r.status,
      newStatus: 'URGENT_DELAYED',
      actorUid: 'SYSTEM_SLA_MONITOR',
      actorRole: 'SYSTEM',
      timestamp: nowIso,
      remarks: 'Committed expected completion deadline passed without an authorised report.',
    };

    const updated: UrgentReportRequestRecord = {
      ...r,
      status: 'URGENT_DELAYED',
      delayedDetectedAt: nowIso,
      delayReason: r.delayReason || 'Expected completion deadline exceeded.',
      history: [...r.history, hist],
      updatedAt: nowIso,
    };

    await saveUrgentRequest(updated);

    try {
      const order = await loadOrderForUrgent(r.orderId);
      if (order.bookingTestItems?.length) {
        const nextItems = order.bookingTestItems.map((t) =>
          t.testId === r.testId || t.testCode === r.testCode
            ? { ...t, urgentPriorityStatus: 'URGENT_DELAYED' as UrgentRequestStatus, updatedAt: nowIso }
            : t
        );
        await patchOrderBookingTests(order.id, nextItems);
      }
    } catch {
      // Order may not exist in isolated unit tests
    }

    await Promise.all([
      sendPlatformNotification({
        title: `URGENT DELAYED — ${r.orderNumber} (${r.testName})`,
        message: `Accepted urgent request ${r.id} passed its committed deadline (${r.acceptedExpectedCompletionAt}).`,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.CRITICAL,
        recipientRole: UserRole.LARGE_LAB,
        recipientUid: r.largeLabId,
        orderId: r.orderId,
        channels: [NotificationChannel.IN_APP],
        metadata: { idempotencyKey: `urg-delay-${r.id}-lg` },
      }),
      sendPlatformNotification({
        title: `Urgent Report Delayed — ${r.testName}`,
        message: `${r.largeLabName} missed the expected deadline for ${r.testName} (${r.orderNumber}).`,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.HIGH,
        recipientRole: UserRole.SMALL_LAB,
        recipientUid: r.smallLabId,
        orderId: r.orderId,
        channels: [NotificationChannel.IN_APP],
        metadata: { idempotencyKey: `urg-delay-${r.id}-sm` },
      }),
      sendPlatformNotification({
        title: `SLA Breach: Urgent Report Delayed (${r.orderNumber})`,
        message: `${r.largeLabName} delayed ${r.testName} for ${r.smallLabName}.`,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.CRITICAL,
        recipientRole: UserRole.ADMIN,
        orderId: r.orderId,
        channels: [NotificationChannel.IN_APP],
        metadata: { idempotencyKey: `urg-delay-${r.id}-adm` },
      }),
    ]);

    flagged.push(updated);
  }

  return flagged;
}

export async function listUrgentReportRequests(params: {
  actorRole: UserRole;
  actorLabId?: string;
  status?: UrgentRequestStatus | 'ALL';
  largeLabId?: string;
  smallLabId?: string;
  delayedOnly?: boolean;
  department?: string;
  date?: string;
  orderId?: string;
  nowMs?: number;
}): Promise<UrgentReportRequestRecord[]> {
  await checkAndFlagDelayedUrgentRequests(params.nowMs);
  const all = await loadAllUrgentRequestsFromStore();

  return all
    .filter((r) => {
      if (params.actorRole === UserRole.SMALL_LAB) {
        if (!params.actorLabId || r.smallLabId !== params.actorLabId) return false;
      } else if (params.actorRole === UserRole.LARGE_LAB) {
        if (!params.actorLabId || r.largeLabId !== params.actorLabId) return false;
      } else if (params.actorRole !== UserRole.ADMIN) {
        return false;
      }

      if (params.status && params.status !== 'ALL' && r.status !== params.status) return false;
      if (params.largeLabId && r.largeLabId !== params.largeLabId) return false;
      if (params.smallLabId && r.smallLabId !== params.smallLabId) return false;
      if (params.delayedOnly && r.status !== 'URGENT_DELAYED') return false;
      if (params.department && params.department !== 'ALL' && r.department !== params.department) {
        return false;
      }
      if (params.date && !r.createdAt.startsWith(params.date)) return false;
      if (params.orderId && r.orderId !== params.orderId) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function respondToUrgentRequest(params: {
  requestId: string;
  action: 'ACCEPT' | 'REJECT' | 'REQUEST_CLARIFICATION' | 'START_PROCESSING' | 'UPDATE_DEADLINE';
  actorUid: string;
  actorRole: UserRole;
  actorLabId?: string;
  actorName?: string;
  expectedCompletionAt?: string;
  assignedTeamOrCentre?: string;
  reason?: string;
  nowMs?: number;
}): Promise<UrgentReportRequestRecord> {
  if (params.actorRole !== UserRole.LARGE_LAB && params.actorRole !== UserRole.ADMIN) {
    throw new AppError('Only authorised Large Lab staff can respond to urgent requests.', 403, 'FORBIDDEN');
  }

  const reqRec = await loadUrgentRequestById(params.requestId);
  if (params.actorRole === UserRole.LARGE_LAB) {
    if (!params.actorLabId || reqRec.largeLabId !== params.actorLabId) {
      throw new AppError('You are not assigned to this urgent request.', 403, 'FORBIDDEN');
    }
  }

  const nowMs = params.nowMs ?? Date.now();
  const now = new Date(nowMs).toISOString();
  let nextStatus: UrgentRequestStatus = reqRec.status;
  let patch: Partial<UrgentReportRequestRecord> = {};
  let histAction: UrgentRequestHistoryEntry['action'] = 'ACCEPTED';
  let notifTitle = '';
  let notifMsg = '';

  if (params.action === 'ACCEPT') {
    if (reqRec.status !== 'URGENT_REQUESTED') {
      throw new AppError('Only pending urgent requests can be accepted.', 400, 'INVALID_STATE');
    }
    const expMs = params.expectedCompletionAt ? Date.parse(params.expectedCompletionAt) : NaN;
    if (Number.isNaN(expMs) || expMs <= nowMs) {
      throw new AppError('Provide a valid future expected completion date/time.', 400, 'INVALID_DEADLINE');
    }
    nextStatus = 'URGENT_ACCEPTED';
    histAction = 'ACCEPTED';
    patch = {
      acceptedExpectedCompletionAt: new Date(expMs).toISOString(),
      ...(params.assignedTeamOrCentre?.trim()
        ? { assignedTeamOrCentre: params.assignedTeamOrCentre.trim() }
        : {}),
      respondedByUid: params.actorUid,
      respondedByName: params.actorName,
      respondedAt: now,
    };
    notifTitle = `Urgent Request Accepted — ${reqRec.testName}`;
    notifMsg = `${reqRec.largeLabName} accepted urgent reporting for ${reqRec.testName} (${reqRec.orderNumber}). Expected completion: ${patch.acceptedExpectedCompletionAt}.`;
  } else if (params.action === 'REJECT') {
    if (reqRec.status !== 'URGENT_REQUESTED') {
      throw new AppError('Only pending urgent requests can be rejected.', 400, 'INVALID_STATE');
    }
    if (!params.reason?.trim()) {
      throw new AppError('A rejection reason is required.', 400, 'REASON_REQUIRED');
    }
    nextStatus = 'URGENT_REJECTED';
    histAction = 'REJECTED';
    patch = {
      rejectionReason: params.reason.trim(),
      respondedByUid: params.actorUid,
      respondedByName: params.actorName,
      respondedAt: now,
    };
    notifTitle = `Urgent Request Rejected — ${reqRec.testName}`;
    notifMsg = `${reqRec.largeLabName} could not expedite ${reqRec.testName} (${reqRec.orderNumber}). Reason: ${params.reason.trim()}. Normal processing continues.`;
  } else if (params.action === 'REQUEST_CLARIFICATION') {
    if (!params.reason?.trim()) {
      throw new AppError('Clarification question is required.', 400, 'REASON_REQUIRED');
    }
    histAction = 'CLARIFICATION_REQUESTED';
    patch = {
      clarificationQuestion: params.reason.trim(),
      respondedByUid: params.actorUid,
      respondedByName: params.actorName,
      respondedAt: now,
    };
    notifTitle = `Clarification Requested — ${reqRec.testName}`;
    notifMsg = `${reqRec.largeLabName} requested clarification for urgent ${reqRec.testName} (${reqRec.orderNumber}): ${params.reason.trim()}`;
  } else if (params.action === 'START_PROCESSING') {
    if (reqRec.status !== 'URGENT_ACCEPTED' && reqRec.status !== 'URGENT_DELAYED') {
      throw new AppError('Urgent request must be accepted before starting priority processing.', 400, 'INVALID_STATE');
    }
    nextStatus = 'URGENT_IN_PROGRESS';
    histAction = 'IN_PROGRESS';
    notifTitle = `Urgent Processing Started — ${reqRec.testName}`;
    notifMsg = `${reqRec.largeLabName} started priority processing for ${reqRec.testName} (${reqRec.orderNumber}).`;
  } else if (params.action === 'UPDATE_DEADLINE') {
    if (!ACTIVE_URGENT_STATUSES.includes(reqRec.status)) {
      throw new AppError('Cannot update deadline on a closed urgent request.', 400, 'INVALID_STATE');
    }
    if (!params.reason?.trim()) {
      throw new AppError('A reason is required when modifying the expected completion deadline.', 400, 'REASON_REQUIRED');
    }
    const expMs = params.expectedCompletionAt ? Date.parse(params.expectedCompletionAt) : NaN;
    if (Number.isNaN(expMs) || expMs <= nowMs) {
      throw new AppError('New expected completion time must be in the future.', 400, 'INVALID_DEADLINE');
    }
    histAction = 'DEADLINE_UPDATED';
    patch = {
      acceptedExpectedCompletionAt: new Date(expMs).toISOString(),
      delayReason: params.reason.trim(),
    };
    notifTitle = `Urgent Deadline Updated — ${reqRec.testName}`;
    notifMsg = `${reqRec.largeLabName} updated expected completion for ${reqRec.testName} (${reqRec.orderNumber}) to ${patch.acceptedExpectedCompletionAt}. Reason: ${params.reason.trim()}`;
  }

  const histEntry: UrgentRequestHistoryEntry = {
    action: histAction,
    previousStatus: reqRec.status,
    newStatus: nextStatus,
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    actorName: params.actorName,
    timestamp: now,
    remarks: params.reason?.trim(),
    ...(patch.acceptedExpectedCompletionAt
      ? { expectedCompletionAt: patch.acceptedExpectedCompletionAt }
      : {}),
  };

  const updated: UrgentReportRequestRecord = {
    ...reqRec,
    ...patch,
    status: nextStatus,
    history: [...reqRec.history, histEntry],
    updatedAt: now,
  };
  await saveUrgentRequest(updated);

  const order = await loadOrderForUrgent(reqRec.orderId);
  if (order.bookingTestItems?.length) {
    const nextItems = order.bookingTestItems.map((t) =>
      t.testId === reqRec.testId || t.testCode === reqRec.testCode
        ? {
            ...t,
            urgentPriorityStatus: nextStatus,
            ...(updated.acceptedExpectedCompletionAt
              ? { expectedCompletionAt: updated.acceptedExpectedCompletionAt }
              : {}),
            updatedAt: now,
          }
        : t
    );
    await patchOrderBookingTests(order.id, nextItems);
  }

  await sendPlatformNotification({
    title: notifTitle,
    message: notifMsg,
    category: NotificationCategory.SYSTEM_ALERT,
    priority: NotificationPriority.HIGH,
    recipientRole: UserRole.SMALL_LAB,
    recipientUid: reqRec.smallLabId,
    orderId: reqRec.orderId,
    channels: [NotificationChannel.IN_APP],
    metadata: { idempotencyKey: `urg-resp-${reqRec.id}-${histAction}-${nowMs}` },
  });

  await recordAuditLog({
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    action: `URGENT_REQUEST_${histAction}`,
    resourceType: 'urgent_report_requests',
    resourceId: reqRec.id,
    summary: `${histAction} on urgent request ${reqRec.id} (${reqRec.testName}).`,
  });

  return updated;
}

export async function submitUrgentClarification(params: {
  requestId: string;
  actorUid: string;
  actorRole: UserRole;
  actorLabId?: string;
  actorName?: string;
  clarificationResponse: string;
}): Promise<UrgentReportRequestRecord> {
  if (params.actorRole !== UserRole.SMALL_LAB && params.actorRole !== UserRole.ADMIN) {
    throw new AppError('Only the owning Small Lab can submit clarification.', 403, 'FORBIDDEN');
  }
  const reqRec = await loadUrgentRequestById(params.requestId);
  if (params.actorRole === UserRole.SMALL_LAB && reqRec.smallLabId !== params.actorLabId) {
    throw new AppError('Access denied.', 403, 'FORBIDDEN');
  }
  if (!params.clarificationResponse.trim()) {
    throw new AppError('Clarification response cannot be empty.', 400, 'REASON_REQUIRED');
  }
  const now = new Date().toISOString();
  const histEntry: UrgentRequestHistoryEntry = {
    action: 'CLARIFICATION_SUBMITTED',
    previousStatus: reqRec.status,
    newStatus: reqRec.status,
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    actorName: params.actorName,
    timestamp: now,
    remarks: params.clarificationResponse.trim(),
  };

  const updated: UrgentReportRequestRecord = {
    ...reqRec,
    clarificationResponse: params.clarificationResponse.trim(),
    history: [...reqRec.history, histEntry],
    updatedAt: now,
  };
  await saveUrgentRequest(updated);

  await sendPlatformNotification({
    title: `Clarification Submitted — ${reqRec.testName}`,
    message: `${reqRec.smallLabName} replied for ${reqRec.orderNumber}: ${params.clarificationResponse.trim()}`,
    category: NotificationCategory.SYSTEM_ALERT,
    priority: NotificationPriority.HIGH,
    recipientRole: UserRole.LARGE_LAB,
    recipientUid: reqRec.largeLabId,
    orderId: reqRec.orderId,
    channels: [NotificationChannel.IN_APP],
  });

  return updated;
}

export async function markUrgentRequestsCompletedForTests(params: {
  orderId: string;
  coveredTestIds: string[];
  actorUid: string;
  actorRole: UserRole;
}): Promise<UrgentReportRequestRecord[]> {
  const all = await loadAllUrgentRequestsFromStore();
  const now = new Date().toISOString();
  const coveredSet = new Set(params.coveredTestIds.map((x) => x.toUpperCase()));
  const completed: UrgentReportRequestRecord[] = [];

  for (const r of all) {
    if (r.orderId !== params.orderId) continue;
    if (!ACTIVE_URGENT_STATUSES.includes(r.status)) continue;
    if (!coveredSet.has(r.testId.toUpperCase()) && !coveredSet.has(r.testCode.toUpperCase())) {
      continue;
    }

    const hist: UrgentRequestHistoryEntry = {
      action: 'COMPLETED',
      previousStatus: r.status,
      newStatus: 'URGENT_COMPLETED',
      actorUid: params.actorUid,
      actorRole: params.actorRole,
      timestamp: now,
      remarks: 'Authorised test report published.',
    };

    const updated: UrgentReportRequestRecord = {
      ...r,
      status: 'URGENT_COMPLETED',
      completedAt: now,
      history: [...r.history, hist],
      updatedAt: now,
    };
    await saveUrgentRequest(updated);
    completed.push(updated);

    await sendPlatformNotification({
      title: `Urgent Report Authorised & Ready — ${r.testName}`,
      message: `Priority report for ${r.testName} (${r.orderNumber}) is now authorised and available to view/download.`,
      category: NotificationCategory.REPORT_UPLOADED,
      priority: NotificationPriority.HIGH,
      recipientRole: UserRole.SMALL_LAB,
      recipientUid: r.smallLabId,
      orderId: r.orderId,
      channels: [NotificationChannel.IN_APP],
      metadata: { idempotencyKey: `urg-done-${r.id}` },
    });
  }

  return completed;
}
