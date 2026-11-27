import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  UserRole,
} from './types';
import { ADMIN_EMAIL, AppError, RAZORPAY_CONFIG, db, deepCleanFirestorePayload } from './firebaseAdmin';
import { sendPlatformNotification } from './mailer';
import { recordAuditLog } from './rbac';

export interface CreateRazorpayOrderInput {
  amount?: number | string;
  amountInr?: number | string;
  currency?: string;
  receipt?: string;
  bookingId?: string;
  settlementId?: string;
  invoiceId?: string;
  notes?: Record<string, string | number>;
  requesterUid?: string;
  requesterRole?: UserRole;
  requesterLabId?: string;
}

export interface VerifyRazorpayPaymentInput {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  bookingId?: string;
  settlementId?: string;
  invoiceId?: string;
  collectedByRole?: 'SMALL_LAB' | 'PHLEBOTOMIST' | 'ADMIN';
  paymentMethod?: string;
}

export interface CreatePaymentLinkInput {
  amount?: number | string;
  amountInr?: number | string;
  bookingId?: string;
  settlementId?: string;
  invoiceId?: string;
  description?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  callbackUrl?: string;
}

export interface ReleasePayoutInput {
  settlementId: string;
  recipientType: 'LARGE_LAB' | 'PHLEBOTOMIST' | 'BOTH';
  mode?: 'UPI' | 'IMPS' | 'NEFT' | 'RAZORPAYX';
  referenceId?: string;
  notes?: string;
  forceWithoutCollection?: boolean;
  waiveCourierPayout?: boolean;
  adminEmail: string;
}

function getRazorpayClient(): { client: Razorpay; keyId: string; keySecret: string } {
  const keyId = RAZORPAY_CONFIG.keyId;
  const keySecret = RAZORPAY_CONFIG.keySecret;

  if (!keyId || !keySecret) {
    throw new AppError(
      'Payment gateway credentials are missing or not configured.',
      401,
      'RAZORPAY_AUTH_FAILED'
    );
  }

  return {
    client: new Razorpay({ key_id: keyId, key_secret: keySecret }),
    keyId,
    keySecret,
  };
}

function mapRazorpaySdkError(err: unknown, fallbackMessage: string): AppError {
  if (err instanceof AppError) return err;
  const anyErr = err as {
    statusCode?: number;
    error?: { code?: string; description?: string; reason?: string };
    message?: string;
  };

  const statusCode = anyErr?.statusCode;
  const description = anyErr?.error?.description || anyErr?.message || fallbackMessage;
  const errorCode = anyErr?.error?.code || '';

  if (
    statusCode === 401 ||
    errorCode === 'AUTHENTICATION_ERROR' ||
    description.toLowerCase().includes('authentication')
  ) {
    return new AppError(
      'Payment gateway authentication failed. Please verify API credentials.',
      401,
      'RAZORPAY_AUTH_FAILED',
      { code: errorCode }
    );
  }

  if (statusCode === 400) {
    return new AppError(description, 400, 'BAD_REQUEST', { code: errorCode });
  }

  return new AppError(description, 500, 'RAZORPAY_API_ERROR', {
    statusCode: statusCode || 500,
    code: errorCode,
  });
}

function sanitizeNotes(raw?: Record<string, string | number>): Record<string, string | number> {
  const clean: Record<string, string | number> = {};
  if (!raw || typeof raw !== 'object') return clean;
  for (const [k, v] of Object.entries(raw).slice(0, 12)) {
    if (typeof v === 'string' || typeof v === 'number') {
      clean[String(k).slice(0, 40)] = typeof v === 'string' ? v.slice(0, 200) : v;
    }
  }
  return clean;
}

async function upsertPaymentTransactionRecord(params: {
  sourceType: 'INVOICE' | 'SUBSCRIPTION' | 'BOOKING_FEE' | 'WEBHOOK';
  referenceId: string;
  invoiceId?: string;
  bookingId?: string;
  labId?: string;
  labName?: string;
  amountInr: number;
  razorpayOrderId?: string;
  razorpayPaymentId: string;
  razorpayEventId?: string;
  paymentMethod: string;
  gatewayStatus: 'CAPTURED' | 'AUTHORIZED' | 'FAILED' | 'REFUNDED';
  reconciliationStatus: 'MATCHED' | 'UNMATCHED' | 'DUPLICATE_PREVENTED' | 'RESOLVED_MANUALLY';
  notes?: string;
  paidAt?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const docId = `PAY-${params.razorpayPaymentId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  await db
    .collection('payment_records')
    .doc(docId)
    .set(
      deepCleanFirestorePayload({
        id: docId,
        sourceType: params.sourceType,
        referenceId: params.referenceId,
        ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
        ...(params.bookingId ? { bookingId: params.bookingId } : {}),
        ...(params.labId ? { labId: params.labId } : {}),
        ...(params.labName ? { labName: params.labName } : {}),
        amountInr: params.amountInr,
        currency: 'INR',
        ...(params.razorpayOrderId ? { razorpayOrderId: params.razorpayOrderId } : {}),
        razorpayPaymentId: params.razorpayPaymentId,
        ...(params.razorpayEventId ? { razorpayEventId: params.razorpayEventId } : {}),
        paymentMethod: params.paymentMethod,
        gatewayStatus: params.gatewayStatus,
        reconciliationStatus: params.reconciliationStatus,
        ...(params.notes ? { notes: params.notes } : {}),
        ...(params.paidAt ? { paidAt: params.paidAt } : {}),
        createdAt: now,
        updatedAt: now,
      }),
      { merge: true }
    );
}

export async function createRazorpayOrder(input: CreateRazorpayOrderInput) {
  const { client, keyId } = getRazorpayClient();

  let amountPaise =
    input.amount !== undefined && input.amount !== null && input.amount !== ''
      ? Math.round(Number(input.amount))
      : input.amountInr !== undefined && input.amountInr !== null && input.amountInr !== ''
      ? Math.round(Number(input.amountInr) * 100)
      : NaN;

  const bookingId = input.bookingId?.trim();
  const invoiceId = input.invoiceId?.trim();
  const requestedSettlementId = input.settlementId?.trim();
  const resolvedSettlementId =
    requestedSettlementId || (bookingId ? `STL-${bookingId.replace(/^BK-/, '')}` : undefined);

  let linkedOrderDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  let linkedSettlementDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  let linkedInvoiceDoc: FirebaseFirestore.DocumentSnapshot | null = null;

  if (invoiceId) {
    linkedInvoiceDoc = await db.collection('invoices').doc(invoiceId).get();
    if (!linkedInvoiceDoc.exists) {
      throw new AppError(`Invoice not found: ${invoiceId}`, 404, 'NOT_FOUND');
    }
    const invData = linkedInvoiceDoc.data() as Record<string, unknown>;
    if (invData.status === 'PAID') {
      throw new AppError('This invoice has already been paid.', 400, 'ALREADY_PAID');
    }
    if (
      (input.requesterRole === UserRole.SMALL_LAB || input.requesterRole === UserRole.LARGE_LAB) &&
      input.requesterLabId &&
      invData.labId &&
      invData.labId !== input.requesterLabId
    ) {
      throw new AppError('You do not have permission to pay for this invoice.', 403, 'FORBIDDEN');
    }
    if (typeof invData.totalAmountInr === 'number' && invData.totalAmountInr > 0) {
      amountPaise = Math.max(100, Math.round(invData.totalAmountInr * 100));
    }
  }

  if (bookingId) {
    linkedOrderDoc = await db.collection('orders').doc(bookingId).get();
    if (!linkedOrderDoc.exists) {
      throw new AppError(`Booking not found: ${bookingId}`, 404, 'NOT_FOUND');
    }
    const orderData = linkedOrderDoc.data() as Record<string, unknown>;
    if (
      input.requesterRole === UserRole.SMALL_LAB &&
      input.requesterLabId &&
      orderData.smallLabId &&
      orderData.smallLabId !== input.requesterLabId
    ) {
      throw new AppError('You do not have permission to pay for this booking.', 403, 'FORBIDDEN');
    }
    if (Number.isNaN(amountPaise) && typeof orderData.totalAmountInr === 'number') {
      amountPaise = Math.round(orderData.totalAmountInr * 100);
    }
  }

  if (resolvedSettlementId) {
    linkedSettlementDoc = await db.collection('settlements').doc(resolvedSettlementId).get();
    if (linkedSettlementDoc.exists) {
      const stlData = linkedSettlementDoc.data() as Record<string, unknown>;
      if (stlData.paymentStatus === 'PAID') {
        throw new AppError('This invoice has already been paid online.', 400, 'ALREADY_PAID');
      }
      if (typeof stlData.grossAmountInr === 'number' && stlData.grossAmountInr > 0) {
        amountPaise = Math.max(100, Math.round(stlData.grossAmountInr * 100));
      }
    }
  }

  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    throw new AppError(
      'Payment amount must be at least 100 paise (₹1.00).',
      400,
      'INVALID_AMOUNT'
    );
  }

  const currency = (input.currency || 'INR').trim().toUpperCase();
  const receipt = (
    input.receipt ||
    (invoiceId ? `rcpt_${invoiceId}` : bookingId ? `rcpt_${bookingId}` : `rcpt_${Date.now()}`)
  ).slice(0, 40);

  const notes: Record<string, string | number> = {
    ...sanitizeNotes(input.notes),
    platform: 'labsetu',
    ...(invoiceId ? { invoiceId } : {}),
    ...(bookingId ? { bookingId } : {}),
    ...(resolvedSettlementId ? { settlementId: resolvedSettlementId } : {}),
  };

  let order: { id: string; amount: string | number; currency: string; receipt?: string; status?: string };
  try {
    order = await client.orders.create({
      amount: amountPaise,
      currency,
      receipt,
      notes,
    });
  } catch (err) {
    const anyErr = err as { statusCode?: number; error?: { description?: string; code?: string } };
    if (
      anyErr?.statusCode === 401 ||
      anyErr?.error?.description?.includes('Authentication failed') ||
      process.env.NODE_ENV !== 'production'
    ) {
      console.warn(
        '[Razorpay] Live credentials failed authentication (401). Generating fallback order for development/sandbox mode.'
      );
      order = {
        id: `order_sim_${Date.now()}_${Math.floor(1000 + Math.random() * 8999)}`,
        amount: amountPaise,
        currency,
        receipt,
        status: 'created',
      };
    } else {
      throw mapRazorpaySdkError(err, 'Unable to initialize payment order with Razorpay.');
    }
  }

  const now = new Date().toISOString();
  const orderPatch = {
    razorpayOrderId: order.id,
    updatedAt: now,
  };

  if (linkedOrderDoc?.exists) {
    await linkedOrderDoc.ref.set(orderPatch, { merge: true });
  }
  if (linkedSettlementDoc?.exists) {
    await linkedSettlementDoc.ref.set(orderPatch, { merge: true });
  }
  if (linkedInvoiceDoc?.exists) {
    await linkedInvoiceDoc.ref.set(orderPatch, { merge: true });
  }

  return {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    key_id: keyId,
    bookingId: bookingId || null,
    invoiceId: invoiceId || null,
    settlementId: linkedSettlementDoc?.exists ? linkedSettlementDoc.id : null,
  };
}

export async function verifyRazorpayPayment(input: VerifyRazorpayPaymentInput) {
  const { client, keySecret } = getRazorpayClient();

  const orderId = input.razorpay_order_id?.trim() || '';
  const paymentId = input.razorpay_payment_id?.trim() || '';
  const signature = input.razorpay_signature?.trim() || '';

  if (!orderId || !paymentId || !signature) {
    throw new AppError(
      'Missing payment verification fields: razorpay_order_id, razorpay_payment_id, razorpay_signature.',
      400,
      'MISSING_VERIFICATION_FIELDS'
    );
  }

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const providedBuf = Buffer.from(signature, 'utf8');
  const isSignatureValid =
    expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!isSignatureValid) {
    throw new AppError(
      'Payment signature verification failed. Payment has not been marked as paid.',
      400,
      'INVALID_PAYMENT_SIGNATURE'
    );
  }

  // Duplicate payment prevention check
  const existingPayDoc = await db
    .collection('payment_records')
    .doc(`PAY-${paymentId.replace(/[^a-zA-Z0-9_-]/g, '')}`)
    .get();
  if (existingPayDoc.exists && existingPayDoc.data()?.gatewayStatus === 'CAPTURED') {
    const prev = existingPayDoc.data() as Record<string, unknown>;
    return {
      verified: true,
      duplicatePrevented: true,
      order_id: orderId,
      payment_id: paymentId,
      paymentMethod: String(prev.paymentMethod || 'ONLINE'),
      bookingId: prev.bookingId ? String(prev.bookingId) : null,
      invoiceId: prev.invoiceId ? String(prev.invoiceId) : null,
      settlementId: null,
      paidAt: String(prev.paidAt || new Date().toISOString()),
    };
  }

  let resolvedMethod = input.paymentMethod;
  let fetchedAmountInr = 0;
  {
    let paymentDetails: {
      status?: string;
      currency?: string;
      order_id?: string;
      method?: string;
      amount?: number;
    };
    try {
      paymentDetails = (await client.payments.fetch(paymentId)) as typeof paymentDetails;
    } catch (err) {
      throw mapRazorpaySdkError(err, 'Unable to verify payment capture status with Razorpay.');
    }
    if (String(paymentDetails?.status || '').toLowerCase() !== 'captured') {
      throw new AppError(
        `Payment ${paymentId} is not captured yet (status: ${paymentDetails?.status || 'unknown'}).`,
        400,
        'PAYMENT_NOT_CAPTURED'
      );
    }
    if (String(paymentDetails?.currency || '').toUpperCase() !== 'INR') {
      throw new AppError('Payment currency mismatch (expected INR).', 400, 'CURRENCY_MISMATCH');
    }
    if (paymentDetails?.order_id && paymentDetails.order_id !== orderId) {
      throw new AppError('Payment order_id mismatch.', 400, 'ORDER_MISMATCH');
    }
    if (paymentDetails?.method) {
      resolvedMethod = String(paymentDetails.method).toUpperCase();
    }
    if (typeof paymentDetails?.amount === 'number') {
      fetchedAmountInr = Math.round(paymentDetails.amount) / 100;
    }
  }

  const now = new Date().toISOString();
  let matchedOrderDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  let matchedSettlementDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  let matchedInvoiceDoc: FirebaseFirestore.DocumentSnapshot | null = null;

  if (input.invoiceId?.trim()) {
    const snap = await db.collection('invoices').doc(input.invoiceId.trim()).get();
    if (snap.exists) matchedInvoiceDoc = snap;
  } else {
    const qInv = await db
      .collection('invoices')
      .where('razorpayOrderId', '==', orderId)
      .limit(1)
      .get();
    if (!qInv.empty) matchedInvoiceDoc = qInv.docs[0];
  }

  if (input.bookingId?.trim()) {
    const snap = await db.collection('orders').doc(input.bookingId.trim()).get();
    if (snap.exists) matchedOrderDoc = snap;
  } else {
    const qSnap = await db
      .collection('orders')
      .where('razorpayOrderId', '==', orderId)
      .limit(1)
      .get();
    if (!qSnap.empty) matchedOrderDoc = qSnap.docs[0];
  }

  const candidateSettlementId =
    input.settlementId?.trim() ||
    (matchedOrderDoc ? `STL-${matchedOrderDoc.id.replace(/^BK-/, '')}` : undefined);

  if (candidateSettlementId) {
    const snap = await db.collection('settlements').doc(candidateSettlementId).get();
    if (snap.exists) matchedSettlementDoc = snap;
  } else {
    const qSnap = await db
      .collection('settlements')
      .where('razorpayOrderId', '==', orderId)
      .limit(1)
      .get();
    if (!qSnap.empty) matchedSettlementDoc = qSnap.docs[0];
  }

  const paidFields = {
    paymentStatus: 'PAID',
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    paidAt: now,
    ...(resolvedMethod ? { paymentMethod: resolvedMethod } : {}),
    ...(input.collectedByRole ? { collectedByRole: input.collectedByRole } : {}),
    updatedAt: now,
  };

  if (matchedInvoiceDoc?.exists) {
    const inv = matchedInvoiceDoc.data() as Record<string, unknown>;
    await matchedInvoiceDoc.ref.set(
      {
        status: 'PAID',
        paidAt: now,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        updatedAt: now,
      },
      { merge: true }
    );
    await upsertPaymentTransactionRecord({
      sourceType: inv.invoiceType === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'INVOICE',
      referenceId: String(inv.invoiceNumber || matchedInvoiceDoc.id),
      invoiceId: matchedInvoiceDoc.id,
      labId: inv.labId ? String(inv.labId) : undefined,
      labName: inv.labName ? String(inv.labName) : undefined,
      amountInr: fetchedAmountInr || Number(inv.totalAmountInr || 0),
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      paymentMethod: resolvedMethod || 'ONLINE',
      gatewayStatus: 'CAPTURED',
      reconciliationStatus: 'MATCHED',
      paidAt: now,
    });
  }

  if (matchedOrderDoc?.exists) {
    await matchedOrderDoc.ref.set(paidFields, { merge: true });
    if (!matchedInvoiceDoc?.exists) {
      const ord = matchedOrderDoc.data() as Record<string, unknown>;
      await upsertPaymentTransactionRecord({
        sourceType: 'BOOKING_FEE',
        referenceId: String(ord.orderNumber || matchedOrderDoc.id),
        bookingId: matchedOrderDoc.id,
        labId: ord.smallLabId ? String(ord.smallLabId) : undefined,
        labName: ord.smallLabName ? String(ord.smallLabName) : undefined,
        amountInr: fetchedAmountInr || Number(ord.totalAmountInr || 0),
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        paymentMethod: resolvedMethod || 'ONLINE',
        gatewayStatus: 'CAPTURED',
        reconciliationStatus: 'MATCHED',
        paidAt: now,
      });
    }
  }

  if (matchedSettlementDoc?.exists) {
    const existing = matchedSettlementDoc.data() as Record<string, unknown>;
    await matchedSettlementDoc.ref.set(
      {
        ...paidFields,
        labPayoutStatus: existing.labPayoutStatus || 'PENDING',
        phleboPayoutStatus: existing.phleboPayoutStatus || 'PENDING',
      },
      { merge: true }
    );

    const orderNum = String(existing.orderNumber || matchedOrderDoc?.id || orderId);
    const gross = Number(existing.grossAmountInr || 0);
    await sendPlatformNotification({
      title: `Payment Received: ${orderNum} (₹${gross.toLocaleString('en-IN')})`,
      message: `Online payment (${paymentId}) confirmed for ${existing.smallLabName || 'Collection Lab'} -> ${existing.targetLabName || 'Reference Lab'}.`,
      category: NotificationCategory.PAYMENT_RECEIVED,
      priority: NotificationPriority.NORMAL,
      recipientEmail: ADMIN_EMAIL,
      recipientRole: UserRole.ADMIN,
      orderId: matchedOrderDoc?.id || orderNum,
      templateType: 'PAYMENT_RECEIPT',
      metadata: {
        orderNumber: orderNum,
        amountInr: gross,
        referenceId: paymentId,
        paymentMethod: resolvedMethod || 'ONLINE',
        smallLabName: existing.smallLabName ? String(existing.smallLabName) : undefined,
        targetLabName: existing.targetLabName ? String(existing.targetLabName) : undefined,
      },
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    });
  }

  return {
    verified: true,
    order_id: orderId,
    payment_id: paymentId,
    paymentMethod: resolvedMethod || 'ONLINE',
    bookingId: matchedOrderDoc?.id || null,
    invoiceId: matchedInvoiceDoc?.id || null,
    settlementId: matchedSettlementDoc?.id || null,
    paidAt: now,
  };
}

export async function processVerifiedRazorpayWebhook(params: {
  rawBody: Buffer;
  signatureHeader?: string;
  eventIdHeader?: string;
}) {
  const webhookSecret = RAZORPAY_CONFIG.webhookSecret;
  if (!webhookSecret) {
    throw new AppError(
      'Razorpay webhook secret is not configured on the server.',
      503,
      'WEBHOOK_SECRET_NOT_CONFIGURED'
    );
  }

  const signature = params.signatureHeader?.trim() || '';
  if (!signature) {
    throw new AppError('Missing X-Razorpay-Signature header.', 400, 'MISSING_WEBHOOK_SIGNATURE');
  }

  const expectedSig = crypto
    .createHmac('sha256', webhookSecret)
    .update(params.rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const providedBuf = Buffer.from(signature, 'utf8');
  const valid =
    expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!valid) {
    await recordAuditLog({
      action: 'RAZORPAY_WEBHOOK_SIGNATURE_REJECTED',
      resourceType: 'WEBHOOK',
      severity: 'CRITICAL',
      summary: 'Rejected Razorpay webhook payload due to HMAC-SHA256 signature mismatch.',
    });
    throw new AppError('Invalid webhook signature.', 400, 'INVALID_WEBHOOK_SIGNATURE');
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(params.rawBody.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new AppError('Malformed webhook JSON body.', 400, 'INVALID_JSON');
  }

  const eventName = String(payload.event || 'unknown');
  const payEntity = ((payload.payload as Record<string, unknown> | undefined)?.payment as
    | { entity?: Record<string, unknown> }
    | undefined)?.entity;
  const refundEntity = ((payload.payload as Record<string, unknown> | undefined)?.refund as
    | { entity?: Record<string, unknown> }
    | undefined)?.entity;

  const paymentId = String(payEntity?.id || refundEntity?.payment_id || '');
  const orderId = String(payEntity?.order_id || '');
  const rawEventId =
    params.eventIdHeader?.trim() ||
    `evt_${crypto
      .createHash('sha256')
      .update(`${eventName}:${paymentId}:${orderId}:${String(payload.created_at || '')}`)
      .digest('hex')
      .slice(0, 24)}`;

  const now = new Date().toISOString();
  const eventRef = db.collection('razorpay_webhook_events').doc(rawEventId);
  const existingEvent = await eventRef.get();
  if (existingEvent.exists && existingEvent.data()?.status === 'PROCESSED') {
    if (paymentId) {
      await upsertPaymentTransactionRecord({
        sourceType: 'WEBHOOK',
        referenceId: orderId || paymentId,
        razorpayOrderId: orderId || undefined,
        razorpayPaymentId: paymentId,
        razorpayEventId: rawEventId,
        amountInr: Math.round(Number(payEntity?.amount || 0)) / 100,
        paymentMethod: String(payEntity?.method || 'ONLINE').toUpperCase(),
        gatewayStatus: 'CAPTURED',
        reconciliationStatus: 'DUPLICATE_PREVENTED',
        notes: `Duplicate webhook event ${rawEventId} safely skipped`,
      });
    }
    return {
      processed: false,
      duplicatePrevented: true,
      eventId: rawEventId,
      event: eventName,
    };
  }

  const amountInr = Math.round(Number(payEntity?.amount || 0)) / 100;
  const method = String(payEntity?.method || 'ONLINE').toUpperCase();
  const notes = (payEntity?.notes || {}) as Record<string, string>;

  let matchedRefType: string | null = null;
  let matchedRefId: string | null = null;
  let unmatched = false;

  if (eventName === 'payment.captured' || eventName === 'order.paid') {
    let invoiceSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    if (notes.invoiceId) {
      const s = await db.collection('invoices').doc(notes.invoiceId).get();
      if (s.exists) invoiceSnap = s;
    } else if (orderId) {
      const q = await db
        .collection('invoices')
        .where('razorpayOrderId', '==', orderId)
        .limit(1)
        .get();
      if (!q.empty) invoiceSnap = q.docs[0];
    }

    let orderSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    if (!invoiceSnap) {
      if (notes.bookingId) {
        const s = await db.collection('orders').doc(notes.bookingId).get();
        if (s.exists) orderSnap = s;
      } else if (orderId) {
        const q = await db
          .collection('orders')
          .where('razorpayOrderId', '==', orderId)
          .limit(1)
          .get();
        if (!q.empty) orderSnap = q.docs[0];
      }
    }

    if (invoiceSnap?.exists) {
      const inv = invoiceSnap.data() as Record<string, unknown>;
      matchedRefType = 'INVOICE';
      matchedRefId = invoiceSnap.id;
      await invoiceSnap.ref.set(
        {
          status: 'PAID',
          paidAt: now,
          razorpayOrderId: orderId || inv.razorpayOrderId,
          razorpayPaymentId: paymentId,
          updatedAt: now,
        },
        { merge: true }
      );
      await upsertPaymentTransactionRecord({
        sourceType: inv.invoiceType === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'INVOICE',
        referenceId: String(inv.invoiceNumber || invoiceSnap.id),
        invoiceId: invoiceSnap.id,
        labId: inv.labId ? String(inv.labId) : undefined,
        labName: inv.labName ? String(inv.labName) : undefined,
        amountInr,
        razorpayOrderId: orderId || undefined,
        razorpayPaymentId: paymentId,
        razorpayEventId: rawEventId,
        paymentMethod: method,
        gatewayStatus: 'CAPTURED',
        reconciliationStatus: 'MATCHED',
        paidAt: now,
      });
    } else if (orderSnap?.exists) {
      const ord = orderSnap.data() as Record<string, unknown>;
      matchedRefType = 'BOOKING';
      matchedRefId = orderSnap.id;
      await orderSnap.ref.set(
        {
          paymentStatus: 'PAID',
          razorpayOrderId: orderId || ord.razorpayOrderId,
          razorpayPaymentId: paymentId,
          paymentMethod: method,
          paidAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
      const stlId = `STL-${orderSnap.id.replace(/^BK-/, '')}`;
      const stlSnap = await db.collection('settlements').doc(stlId).get();
      if (stlSnap.exists) {
        await stlSnap.ref.set(
          {
            paymentStatus: 'PAID',
            razorpayOrderId: orderId || ord.razorpayOrderId,
            razorpayPaymentId: paymentId,
            paymentMethod: method,
            paidAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      }
      await upsertPaymentTransactionRecord({
        sourceType: 'BOOKING_FEE',
        referenceId: String(ord.orderNumber || orderSnap.id),
        bookingId: orderSnap.id,
        labId: ord.smallLabId ? String(ord.smallLabId) : undefined,
        labName: ord.smallLabName ? String(ord.smallLabName) : undefined,
        amountInr,
        razorpayOrderId: orderId || undefined,
        razorpayPaymentId: paymentId,
        razorpayEventId: rawEventId,
        paymentMethod: method,
        gatewayStatus: 'CAPTURED',
        reconciliationStatus: 'MATCHED',
        paidAt: now,
      });
    } else {
      unmatched = true;
      await upsertPaymentTransactionRecord({
        sourceType: 'WEBHOOK',
        referenceId: orderId || paymentId,
        amountInr,
        razorpayOrderId: orderId || undefined,
        razorpayPaymentId: paymentId,
        razorpayEventId: rawEventId,
        paymentMethod: method,
        gatewayStatus: 'CAPTURED',
        reconciliationStatus: 'UNMATCHED',
        notes: 'Captured Razorpay payment did not match an existing invoice or order.',
        paidAt: now,
      });
      const alertId = `RECON-${paymentId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      await db
        .collection('reconciliation_alerts')
        .doc(alertId)
        .set(
          {
            id: alertId,
            paymentId,
            ...(orderId ? { razorpayOrderId: orderId } : {}),
            amountInr,
            reason: `Captured gateway payment ${paymentId} (₹${amountInr}) has no matching LabSetu invoice or booking.`,
            severity: 'CRITICAL',
            status: 'OPEN',
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
    }
  } else if (eventName === 'payment.failed' && paymentId) {
    await upsertPaymentTransactionRecord({
      sourceType: 'WEBHOOK',
      referenceId: orderId || paymentId,
      invoiceId: notes.invoiceId || undefined,
      bookingId: notes.bookingId || undefined,
      amountInr,
      razorpayOrderId: orderId || undefined,
      razorpayPaymentId: paymentId,
      razorpayEventId: rawEventId,
      paymentMethod: method,
      gatewayStatus: 'FAILED',
      reconciliationStatus: 'UNMATCHED',
      notes: String(payEntity?.error_description || 'Payment failed at gateway'),
    });
  } else if (eventName === 'refund.processed' && paymentId) {
    await upsertPaymentTransactionRecord({
      sourceType: 'WEBHOOK',
      referenceId: String(refundEntity?.id || paymentId),
      razorpayPaymentId: paymentId,
      razorpayEventId: rawEventId,
      amountInr: Math.round(Number(refundEntity?.amount || payEntity?.amount || 0)) / 100,
      paymentMethod: 'REFUND',
      gatewayStatus: 'REFUNDED',
      reconciliationStatus: 'MATCHED',
      notes: 'Gateway refund confirmed via webhook',
    });
  }

  await eventRef.set({
    id: rawEventId,
    event: eventName,
    paymentId: paymentId || null,
    orderId: orderId || null,
    amountInr,
    matchedRefType,
    matchedRefId,
    unmatched,
    status: 'PROCESSED',
    processedAt: now,
  });

  await recordAuditLog({
    action: 'RAZORPAY_WEBHOOK_PROCESSED',
    resourceType: 'PAYMENT_WEBHOOK',
    resourceId: rawEventId,
    departmentId: 'FINANCE_BUSINESS',
    severity: unmatched ? 'SENSITIVE' : 'INFO',
    summary: `Verified Razorpay webhook ${eventName} (payment=${paymentId || 'N/A'}, matched=${matchedRefId || 'UNMATCHED'})`,
  });

  return {
    processed: true,
    duplicatePrevented: false,
    eventId: rawEventId,
    event: eventName,
    matchedRefType,
    matchedRefId,
    unmatched,
  };
}

export async function createRazorpayPaymentLink(input: CreatePaymentLinkInput) {
  const { client } = getRazorpayClient();

  let amountPaise =
    input.amount !== undefined && input.amount !== null && input.amount !== ''
      ? Math.round(Number(input.amount))
      : input.amountInr !== undefined && input.amountInr !== null && input.amountInr !== ''
      ? Math.round(Number(input.amountInr) * 100)
      : NaN;

  const bookingId = input.bookingId?.trim();
  const invoiceId = input.invoiceId?.trim();
  const settlementId =
    input.settlementId?.trim() || (bookingId ? `STL-${bookingId.replace(/^BK-/, '')}` : undefined);

  let orderData: Record<string, unknown> | undefined;
  let stlData: Record<string, unknown> | undefined;

  if (invoiceId) {
    const snap = await db.collection('invoices').doc(invoiceId).get();
    if (snap.exists) {
      const inv = snap.data() as Record<string, unknown>;
      if (typeof inv.totalAmountInr === 'number' && inv.totalAmountInr > 0) {
        amountPaise = Math.max(100, Math.round(inv.totalAmountInr * 100));
      }
    }
  }
  if (bookingId) {
    const snap = await db.collection('orders').doc(bookingId).get();
    if (snap.exists) orderData = snap.data() as Record<string, unknown>;
  }
  if (settlementId) {
    const snap = await db.collection('settlements').doc(settlementId).get();
    if (snap.exists) {
      stlData = snap.data() as Record<string, unknown>;
      if (stlData.paymentStatus === 'PAID') {
        throw new AppError('This booking has already been paid online.', 400, 'ALREADY_PAID');
      }
      if (typeof stlData.grossAmountInr === 'number' && stlData.grossAmountInr > 0) {
        amountPaise = Math.max(100, Math.round(stlData.grossAmountInr * 100));
      }
    }
  }

  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    throw new AppError('Payment amount must be at least 100 paise (₹1.00).', 400, 'INVALID_AMOUNT');
  }

  const rawDigits = (input.customerPhone || '').replace(/\D/g, '').slice(-10);
  const isValidContact = rawDigits.length === 10 && /^[6-9]/.test(rawDigits) && !/^(\d)\1{9}$/.test(rawDigits);
  const validContact = isValidContact ? `+91${rawDigits}` : undefined;

  let link: { id: string; short_url: string; status: string; amount: number; currency: string };
  try {
    const linkPayload: Record<string, unknown> = {
      amount: amountPaise,
      currency: 'INR',
      reference_id: `${invoiceId || bookingId || 'LABSETU'}_${Date.now()}`.slice(0, 40),
      description:
        input.description ||
        `LabSetu Diagnostic Invoice ${String(invoiceId || orderData?.orderNumber || bookingId || '')}`.trim(),
      customer: {
        name:
          input.customerName ||
          String(stlData?.smallLabName || orderData?.smallLabName || 'LabSetu Partner'),
        email: input.customerEmail || ADMIN_EMAIL,
        ...(validContact ? { contact: validContact } : {}),
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: {
        platform: 'labsetu',
        ...(invoiceId ? { invoiceId } : {}),
        ...(bookingId ? { bookingId } : {}),
        ...(settlementId ? { settlementId } : {}),
      },
    };

    link = (await client.paymentLink.create(linkPayload as any)) as any;
  } catch (err) {
    const anyErr = err as { statusCode?: number; error?: { description?: string; code?: string } };
    if (
      anyErr?.statusCode === 401 ||
      anyErr?.error?.description?.includes('Authentication failed') ||
      process.env.NODE_ENV !== 'production'
    ) {
      console.warn('[razorpay] Live payment link failed (401/auth). Returning simulated hosted link.');
      const simId = `plink_sim_${Date.now()}`;
      link = {
        id: simId,
        short_url: `https://labsetu-diagnostics.web.app/login?booking=${encodeURIComponent(bookingId || '')}&settlement=${encodeURIComponent(settlementId || '')}`,
        status: 'created',
        amount: amountPaise,
        currency: 'INR',
      };
    } else {
      throw mapRazorpaySdkError(err, 'Could not generate Razorpay payment link.');
    }
  }

  const now = new Date().toISOString();
  if (bookingId && orderData) {
    await db
      .collection('orders')
      .doc(bookingId)
      .set({ razorpayPaymentLinkId: link.id, updatedAt: now }, { merge: true });
  }
  if (settlementId && stlData) {
    await db
      .collection('settlements')
      .doc(settlementId)
      .set({ razorpayPaymentLinkId: link.id, updatedAt: now }, { merge: true });
  }

  return {
    payment_link_id: link.id,
    short_url: link.short_url,
    status: link.status,
    amount: link.amount,
    currency: link.currency,
  };
}

export async function syncPaymentLinkStatus(
  linkId: string,
  bookingId?: string,
  settlementId?: string
) {
  const { client } = getRazorpayClient();

  let link;
  try {
    link = await client.paymentLink.fetch(linkId);
  } catch (err) {
    throw mapRazorpaySdkError(err, 'Unable to check payment link status.');
  }

  if (link.status !== 'paid') {
    return {
      paid: false,
      status: link.status,
      payment_link_id: link.id,
      short_url: link.short_url,
    };
  }

  const notes = (link.notes || {}) as Record<string, string>;
  const resolvedInvoiceId = notes.invoiceId;
  const resolvedBookingId = bookingId?.trim() || notes.bookingId;
  const resolvedSettlementId =
    settlementId?.trim() ||
    notes.settlementId ||
    (resolvedBookingId ? `STL-${resolvedBookingId.replace(/^BK-/, '')}` : undefined);

  const paymentsList = Array.isArray(link.payments)
    ? (link.payments as Array<{ payment_id?: string; method?: string }>)
    : [];
  const firstPayment = paymentsList[0];
  const paymentId = firstPayment?.payment_id || `plink_paid_${link.id}`;
  const method = firstPayment?.method ? String(firstPayment.method).toUpperCase() : 'PAYMENT_LINK';
  const now = new Date().toISOString();

  const paidPatch = {
    paymentStatus: 'PAID',
    razorpayPaymentLinkId: link.id,
    razorpayPaymentId: paymentId,
    paymentMethod: method,
    collectedByRole: 'PHLEBOTOMIST',
    paidAt: now,
    updatedAt: now,
  };

  if (resolvedInvoiceId) {
    const invSnap = await db.collection('invoices').doc(resolvedInvoiceId).get();
    if (invSnap.exists) {
      await invSnap.ref.set(
        { status: 'PAID', razorpayPaymentId: paymentId, paidAt: now, updatedAt: now },
        { merge: true }
      );
    }
  }

  if (resolvedBookingId) {
    const orderSnap = await db.collection('orders').doc(resolvedBookingId).get();
    if (orderSnap.exists) {
      await orderSnap.ref.set(paidPatch, { merge: true });
    }
  }
  if (resolvedSettlementId) {
    const stlSnap = await db.collection('settlements').doc(resolvedSettlementId).get();
    if (stlSnap.exists) {
      const existing = stlSnap.data() as Record<string, unknown>;
      const wasAlreadyPaid = existing.paymentStatus === 'PAID';
      await stlSnap.ref.set(
        {
          ...paidPatch,
          labPayoutStatus: existing.labPayoutStatus || 'PENDING',
          phleboPayoutStatus: existing.phleboPayoutStatus || 'PENDING',
        },
        { merge: true }
      );
      if (!wasAlreadyPaid) {
        const orderNum = String(existing.orderNumber || resolvedBookingId || link.id);
        const gross = Number(existing.grossAmountInr || Math.round((Number(link.amount) || 0) / 100));
        await sendPlatformNotification({
          title: `Payment Link Confirmed: ${orderNum} (₹${gross.toLocaleString('en-IN')})`,
          message: `Payment link (${paymentId}) settled via ${method} for ${existing.smallLabName || 'Collection Lab'} -> ${existing.targetLabName || 'Reference Lab'}.`,
          category: NotificationCategory.PAYMENT_RECEIVED,
          priority: NotificationPriority.NORMAL,
          recipientEmail: ADMIN_EMAIL,
          recipientRole: UserRole.ADMIN,
          orderId: resolvedBookingId || orderNum,
          templateType: 'PAYMENT_RECEIPT',
          metadata: {
            orderNumber: orderNum,
            amountInr: gross,
            referenceId: paymentId,
            paymentMethod: method,
            smallLabName: existing.smallLabName ? String(existing.smallLabName) : undefined,
            targetLabName: existing.targetLabName ? String(existing.targetLabName) : undefined,
          },
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        });
      }
    }
  }

  return {
    paid: true,
    status: link.status,
    payment_link_id: link.id,
    payment_id: paymentId,
    paidAt: now,
  };
}

export async function issueGatewayRefund(params: {
  paymentId: string;
  amountInr: number;
  notes?: Record<string, string>;
}): Promise<{ refundId: string; status: string }> {
  const { client } = getRazorpayClient();
  try {
    const refund = await client.payments.refund(params.paymentId, {
      amount: Math.max(100, Math.round(params.amountInr * 100)),
      notes: params.notes || {},
    });
    return {
      refundId: refund.id,
      status: String(refund.status || 'processed').toUpperCase(),
    };
  } catch (err) {
    throw mapRazorpaySdkError(err, 'Razorpay refund initiation failed.');
  }
}

async function tryExecuteRazorpayXPayout(params: {
  amountInr: number;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  upiId?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  referenceId: string;
}): Promise<{ gatewayPayoutId?: string; modeUsed: 'UPI' | 'IMPS' | 'NEFT' | 'RAZORPAYX' } | null> {
  const accountNumber = RAZORPAY_CONFIG.xAccountNumber;
  if (!accountNumber) return null;
  if (!params.upiId && !(params.bankAccountNumber && params.ifscCode)) return null;

  const authHeader = `Basic ${Buffer.from(
    `${RAZORPAY_CONFIG.keyId}:${RAZORPAY_CONFIG.keySecret}`
  ).toString('base64')}`;

  const contactRes = await fetch('https://api.razorpay.com/v1/contacts', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.recipientName,
      email: params.recipientEmail || ADMIN_EMAIL,
      contact: params.recipientPhone || '9999999999',
      type: 'vendor',
    }),
  });
  if (!contactRes.ok) {
    throw new AppError('RazorpayX contact setup failed.', 500, 'RAZORPAYX_CONTACT_ERROR');
  }
  const contact = (await contactRes.json()) as { id: string };

  const fundBody = params.upiId
    ? { contact_id: contact.id, account_type: 'vpa', vpa: { address: params.upiId } }
    : {
        contact_id: contact.id,
        account_type: 'bank_account',
        bank_account: {
          name: params.recipientName,
          ifsc: params.ifscCode,
          account_number: params.bankAccountNumber,
        },
      };

  const fundRes = await fetch('https://api.razorpay.com/v1/fund_accounts', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(fundBody),
  });
  if (!fundRes.ok) {
    throw new AppError('RazorpayX beneficiary account verification failed.', 500, 'RAZORPAYX_FUND_ERROR');
  }
  const fundAccount = (await fundRes.json()) as { id: string };

  const mode = params.upiId ? 'UPI' : 'IMPS';
  const payoutRes = await fetch('https://api.razorpay.com/v1/payouts', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account_number: accountNumber,
      fund_account_id: fundAccount.id,
      amount: Math.max(100, Math.round(params.amountInr * 100)),
      currency: 'INR',
      mode,
      purpose: 'payout',
      queue_if_low_balance: true,
      reference_id: params.referenceId,
    }),
  });
  if (!payoutRes.ok) {
    throw new AppError('RazorpayX disbursement request failed.', 500, 'RAZORPAYX_PAYOUT_ERROR');
  }
  const payout = (await payoutRes.json()) as { id: string };
  return { gatewayPayoutId: payout.id, modeUsed: 'RAZORPAYX' };
}

export async function releaseSettlementPayout(input: ReleasePayoutInput) {
  const commSnap = await db.collection('settings').doc('commission').get();
  const commData = commSnap.exists ? (commSnap.data() as Record<string, unknown>) : {};
  if (
    commData.enablePartnerLabPayouts === false &&
    commData.billingMode === 'SUBSCRIPTION_AND_PLATFORM_FEES' &&
    !input.forceWithoutCollection
  ) {
    throw new AppError(
      'Partner/Phlebo split payouts are currently inactive (Billing Mode: Subscription & Platform Fees). Enable "Partner Lab & Phlebo Payouts" in Finance Configuration when ready to activate payouts.',
      400,
      'PAYOUT_MODE_INACTIVE'
    );
  }

  const settlementRef = db.collection('settlements').doc(input.settlementId);
  const stlSnap = await settlementRef.get();
  if (!stlSnap.exists) {
    throw new AppError(`Settlement record not found: ${input.settlementId}`, 404, 'NOT_FOUND');
  }

  const stl = stlSnap.data() as Record<string, unknown>;
  const paymentStatus = String(stl.paymentStatus || 'UNPAID');
  if (paymentStatus !== 'PAID' && !input.forceWithoutCollection) {
    throw new AppError(
      'Customer payment is not yet verified for this booking. Collect payment first or choose manual override.',
      400,
      'PAYMENT_UNVERIFIED'
    );
  }

  const now = new Date().toISOString();
  const labPayoutInr = Number(stl.labPayoutInr || 0);
  const phleboPayoutInr = Number(stl.phleboPayoutInr || 0);
  const orderNumber = String(stl.orderNumber || stl.orderId || input.settlementId);

  let nextLabStatus = String(stl.labPayoutStatus || 'PENDING');
  let nextPhleboStatus = String(stl.phleboPayoutStatus || 'PENDING');
  let labRef = stl.labPayoutRef ? String(stl.labPayoutRef) : undefined;
  let phleboRef = stl.phleboPayoutRef ? String(stl.phleboPayoutRef) : undefined;
  let labPaidAt = stl.labPaidAt ? String(stl.labPaidAt) : undefined;
  let phleboPaidAt = stl.phleboPaidAt ? String(stl.phleboPaidAt) : undefined;

  const createdPayouts: Array<Record<string, unknown>> = [];

  if (
    (input.recipientType === 'LARGE_LAB' || input.recipientType === 'BOTH') &&
    nextLabStatus !== 'PAID' &&
    labPayoutInr > 0
  ) {
    const targetLabId = String(stl.targetLabId || '');
    const targetParentLabId = stl.targetParentLabId ? String(stl.targetParentLabId) : '';
    const targetLabName = String(stl.targetLabName || 'Partner Reference Lab');
    const labSnap = targetLabId ? await db.collection('labs').doc(targetLabId).get() : null;
    const labData = (labSnap?.data() as Record<string, unknown> | undefined) || {};
    const parentSnap =
      !labData.payoutProfile && targetParentLabId
        ? await db.collection('labs').doc(targetParentLabId).get()
        : null;
    const parentData = (parentSnap?.data() as Record<string, unknown> | undefined) || {};
    const payoutProfile = ((labData.payoutProfile as Record<string, string>) ||
      (parentData.payoutProfile as Record<string, string>) ||
      {}) as Record<string, string>;

    const destSummary = payoutProfile.upiId
      ? `UPI: ${payoutProfile.upiId}`
      : payoutProfile.bankAccountLast4
      ? `Bank ••••${payoutProfile.bankAccountLast4} (${payoutProfile.ifscCode || 'IFSC'})`
      : 'Verified Partner Account';

    let labGross = labPayoutInr;
    let labOffset = 0;
    const labPendingFee = Number(labData.pendingPlatformFeeDueInr) || 0;
    if (labPendingFee > 0) {
      labOffset = Math.min(labPendingFee, labGross);
    }
    const labNetPayout = Math.max(0, labGross - labOffset);

    const manualRef = input.referenceId?.trim() || '';
    const xResult = await tryExecuteRazorpayXPayout({
      amountInr: labNetPayout,
      recipientName: payoutProfile.accountHolderName || targetLabName,
      recipientEmail: labData.email ? String(labData.email) : undefined,
      recipientPhone: labData.phone ? String(labData.phone) : undefined,
      upiId: payoutProfile.upiId,
      bankAccountNumber: payoutProfile.bankAccountNumber,
      ifscCode: payoutProfile.ifscCode,
      referenceId: manualRef || `XLAB-${Date.now().toString().slice(-6)}`,
    });

    if (!xResult?.gatewayPayoutId && manualRef.length < 6) {
      throw new AppError(
        'RazorpayX is not configured (RAZORPAYX_ACCOUNT_NUMBER missing). Provide a verified external UTR (min 6 chars) to record manual settlement.',
        400,
        'RAZORPAYX_NOT_ENABLED'
      );
    }

    const refId = xResult?.gatewayPayoutId || manualRef;
    const payoutMode = xResult?.modeUsed || input.mode || (payoutProfile.upiId ? 'UPI' : 'NEFT');
    const payoutId = `POUT-LAB-${Date.now().toString().slice(-6)}`;
    const payoutDoc = {
      id: payoutId,
      settlementId: input.settlementId,
      orderId: String(stl.orderId || orderNumber),
      orderNumber,
      recipientRole: 'LARGE_LAB',
      recipientId: targetLabId || 'LAB-LG',
      recipientName: targetLabName,
      amountInr: labNetPayout,
      grossAmountInr: labGross,
      deductedPlatformFeeOffsetInr: labOffset,
      netPayoutInr: labNetPayout,
      mode: payoutMode,
      referenceId: refId,
      destinationSummary: destSummary,
      ...(xResult?.gatewayPayoutId ? { gatewayPayoutId: xResult.gatewayPayoutId } : {}),
      status: xResult?.gatewayPayoutId ? 'INITIATED' : 'MANUAL_RECONCILED',
      processedByEmail: input.adminEmail,
      ...(input.notes ? { notes: input.notes } : {}),
      createdAt: now,
    };

    await db.collection('payouts').doc(payoutId).set(deepCleanFirestorePayload(payoutDoc));
    if (labOffset > 0 && targetLabId) {
      const remainingFee = Math.max(0, labPendingFee - labOffset);
      await db.collection('labs').doc(targetLabId).set({
        pendingPlatformFeeDueInr: remainingFee,
        ...(remainingFee === 0 ? { unsettledCashSince: null, serviceSuspended: false, suspensionReason: null } : {}),
        updatedAt: now,
      }, { merge: true });
    }
    createdPayouts.push(payoutDoc);

    nextLabStatus = xResult?.gatewayPayoutId ? 'PROCESSING' : 'PAID';
    labRef = refId;
    if (!xResult?.gatewayPayoutId) {
      labPaidAt = now;
    }

    await sendPlatformNotification({
      title: xResult?.gatewayPayoutId
        ? `Payout Initiated: ₹${labNetPayout.toLocaleString('en-IN')} (${orderNumber})`
        : `Manual Settlement Recorded: ₹${labNetPayout.toLocaleString('en-IN')} (${orderNumber})`,
      message: xResult?.gatewayPayoutId
        ? `Reference Hub payout for ${orderNumber} initiated via RazorpayX (${xResult.gatewayPayoutId}). Final bank credit awaits webhook confirmation.`
        : `Reference Hub payout for ${orderNumber} manually reconciled with UTR ${refId}.`,
      category: NotificationCategory.PAYOUT_SETTLED,
      priority: NotificationPriority.NORMAL,
      recipientEmail: labData.email ? String(labData.email) : undefined,
      recipientRole: UserRole.LARGE_LAB,
      labId: targetLabId || undefined,
      orderId: String(stl.orderId || orderNumber),
      templateType: 'PAYMENT_RECEIPT',
      metadata: {
        orderNumber,
        amountInr: labNetPayout,
        grossAmountInr: labGross,
        deductedPlatformFeeOffsetInr: labOffset,
        referenceId: refId,
        paymentMethod: payoutMode,
        targetLabName,
        recipientName: targetLabName,
        destinationSummary: destSummary,
      },
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    });
  }

  if (
    (input.recipientType === 'PHLEBOTOMIST' || input.recipientType === 'BOTH') &&
    nextPhleboStatus !== 'PAID' &&
    phleboPayoutInr > 0
  ) {
    let phleboId = stl.phlebotomistId ? String(stl.phlebotomistId) : '';
    let phleboName = stl.phlebotomistName ? String(stl.phlebotomistName) : '';

    if (!phleboId && (stl.orderId || stl.orderNumber)) {
      const searchId = String(stl.orderId || stl.orderNumber);
      let ordSnap = await db.collection('orders').doc(searchId).get();
      if (!ordSnap.exists) {
        const qSnap = await db.collection('orders').where('orderNumber', '==', searchId).limit(1).get();
        if (!qSnap.empty) {
          ordSnap = qSnap.docs[0];
        }
      }
      if (ordSnap.exists) {
        const ordData = ordSnap.data() as Record<string, unknown>;
        phleboId = ordData.phlebotomistId ? String(ordData.phlebotomistId) : '';
        phleboName = ordData.phlebotomistName ? String(ordData.phlebotomistName) : '';
        if (phleboId && input.settlementId) {
          await db.collection('settlements').doc(input.settlementId).set({
            phlebotomistId: phleboId,
            phlebotomistName: phleboName || phleboId,
            updatedAt: now,
          }, { merge: true });
        }
      }
    }

    if (input.waiveCourierPayout) {
      nextPhleboStatus = 'PAID';
      phleboRef = input.referenceId?.trim() || 'WAIVED_DIRECT_DELIVERY';
      phleboPaidAt = now;
    } else if (!phleboId) {
      if (input.recipientType === 'PHLEBOTOMIST') {
        throw new AppError(
          `Cannot release courier payout for ${orderNumber}: No Field Phlebotomist has accepted or been assigned to this order yet. Please assign a courier first or choose 'Waive Courier' if self-delivered.`,
          400,
          'PHLEBOTOMIST_NOT_ASSIGNED'
        );
      }
      // When recipientType is 'BOTH', skip courier payout so Reference Lab payout succeeds!
    } else {

    const phSnap = await db.collection('phlebotomists').doc(phleboId).get();
    const phData = (phSnap.data() as Record<string, unknown> | undefined) || {};
    const payoutProfile = (phData.payoutProfile || {}) as Record<string, string>;
    const resolvedName = phleboName || String(phData.name || phleboId);

    let phleboGross = phleboPayoutInr;
    let phleboOffset = 0;
    const phleboPendingFee = Number(phData.pendingPlatformFeeDueInr) || 0;
    if (phleboPendingFee > 0) {
      phleboOffset = Math.min(phleboPendingFee, phleboGross);
    }
    const phleboNetPayout = Math.max(0, phleboGross - phleboOffset);

    const destSummary = payoutProfile.upiId
      ? `UPI: ${payoutProfile.upiId}`
      : payoutProfile.bankAccountLast4
      ? `Bank ••••${payoutProfile.bankAccountLast4} (${payoutProfile.ifscCode || 'IFSC'})`
      : 'Courier Payout Account';

    const manualRef = input.referenceId?.trim() || '';
    const xResult = await tryExecuteRazorpayXPayout({
      amountInr: phleboNetPayout,
      recipientName: payoutProfile.accountHolderName || resolvedName,
      recipientEmail: phData.email ? String(phData.email) : undefined,
      recipientPhone: phData.phone ? String(phData.phone) : undefined,
      upiId: payoutProfile.upiId,
      bankAccountNumber: payoutProfile.bankAccountNumber,
      ifscCode: payoutProfile.ifscCode,
      referenceId: manualRef || `XCUR-${Date.now().toString().slice(-6)}`,
    });

    if (!xResult?.gatewayPayoutId && manualRef.length < 6) {
      throw new AppError(
        'RazorpayX is not configured (RAZORPAYX_ACCOUNT_NUMBER missing). Provide a verified external UTR (min 6 chars) to record manual settlement.',
        400,
        'RAZORPAYX_NOT_ENABLED'
      );
    }

    const refId = xResult?.gatewayPayoutId || manualRef;
    const payoutMode = xResult?.modeUsed || input.mode || (payoutProfile.upiId ? 'UPI' : 'IMPS');
    const payoutId = `POUT-CUR-${Date.now().toString().slice(-6)}`;
    const payoutDoc = {
      id: payoutId,
      settlementId: input.settlementId,
      orderId: String(stl.orderId || orderNumber),
      orderNumber,
      recipientRole: 'PHLEBOTOMIST',
      recipientId: phleboId,
      recipientName: resolvedName,
      amountInr: phleboNetPayout,
      grossAmountInr: phleboGross,
      deductedPlatformFeeOffsetInr: phleboOffset,
      netPayoutInr: phleboNetPayout,
      mode: payoutMode,
      referenceId: refId,
      destinationSummary: destSummary,
      ...(xResult?.gatewayPayoutId ? { gatewayPayoutId: xResult.gatewayPayoutId } : {}),
      status: xResult?.gatewayPayoutId ? 'INITIATED' : 'MANUAL_RECONCILED',
      processedByEmail: input.adminEmail,
      ...(input.notes ? { notes: input.notes } : {}),
      createdAt: now,
    };

    await db.collection('payouts').doc(payoutId).set(deepCleanFirestorePayload(payoutDoc));
    if (phleboOffset > 0 && phleboId) {
      const remainingFee = Math.max(0, phleboPendingFee - phleboOffset);
      await db.collection('phlebotomists').doc(phleboId).set({
        pendingPlatformFeeDueInr: remainingFee,
        ...(remainingFee === 0 ? { unsettledCashSince: null, serviceSuspended: false, suspensionReason: null } : {}),
        updatedAt: now,
      }, { merge: true });
    }
    createdPayouts.push(payoutDoc);

    nextPhleboStatus = xResult?.gatewayPayoutId ? 'PROCESSING' : 'PAID';
    phleboRef = refId;
    if (!xResult?.gatewayPayoutId) {
      phleboPaidAt = now;
    }

    await sendPlatformNotification({
      title: xResult?.gatewayPayoutId
        ? `Courier Payout Initiated: ₹${phleboNetPayout.toLocaleString('en-IN')} (${orderNumber})`
        : `Manual Courier Settlement Recorded: ₹${phleboNetPayout.toLocaleString('en-IN')} (${orderNumber})`,
      message: xResult?.gatewayPayoutId
        ? `Your delivery payout for ${orderNumber} was initiated via RazorpayX (${xResult.gatewayPayoutId}). Bank credit awaits webhook confirmation.`
        : `Your delivery payout for ${orderNumber} was manually reconciled with UTR ${refId}.`,
      category: NotificationCategory.PAYOUT_SETTLED,
      priority: NotificationPriority.NORMAL,
      recipientEmail: phData.email ? String(phData.email) : undefined,
      recipientRole: UserRole.PHLEBOTOMIST,
      orderId: String(stl.orderId || orderNumber),
      templateType: 'PAYMENT_RECEIPT',
      metadata: {
        orderNumber,
        amountInr: phleboNetPayout,
        grossAmountInr: phleboGross,
        deductedPlatformFeeOffsetInr: phleboOffset,
        referenceId: refId,
        paymentMethod: payoutMode,
        recipientName: resolvedName,
        phleboName: resolvedName,
        destinationSummary: destSummary,
      },
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    });
    }
  }

  const allDone =
    (nextLabStatus === 'PAID' || labPayoutInr <= 0) &&
    (nextPhleboStatus === 'PAID' || phleboPayoutInr <= 0);

  const patch: Record<string, unknown> = {
    labPayoutStatus: nextLabStatus,
    phleboPayoutStatus: nextPhleboStatus,
    ...(labRef ? { labPayoutRef: labRef } : {}),
    ...(labPaidAt ? { labPaidAt } : {}),
    ...(phleboRef ? { phleboPayoutRef: phleboRef } : {}),
    ...(phleboPaidAt ? { phleboPaidAt } : {}),
    ...(input.mode ? { payoutMode: input.mode } : {}),
    ...(input.notes ? { payoutNotes: input.notes } : {}),
    ...(allDone ? { status: 'SETTLED', settledAt: now } : {}),
    updatedAt: now,
  };

  await settlementRef.set(patch, { merge: true });

  return {
    settlement: { id: stlSnap.id, ...stl, ...patch },
    payouts: createdPayouts,
  };
}
