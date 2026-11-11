import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { NotificationCategory, NotificationChannel, NotificationPriority, UserRole } from '@diagnostic/shared';
import { config } from '../config/env';
import { initializeFirebase } from '../config/firebase';
import { AppError } from '../middleware/errorHandler';
import { sendPlatformNotification } from './notification.service';

export interface CreateOrderParams {
  amount?: number | string;
  amountInr?: number | string;
  currency?: string;
  receipt?: string;
  bookingId?: string;
  settlementId?: string;
  notes?: Record<string, string | number>;
  requesterRole?: UserRole;
  requesterLabId?: string;
}

export interface VerifyPaymentParams {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  bookingId?: string;
  settlementId?: string;
  collectedByRole?: 'SMALL_LAB' | 'PHLEBOTOMIST' | 'ADMIN';
  paymentMethod?: string;
}

function getRazorpayClient(): { client: Razorpay; keyId: string; keySecret: string } {
  const keyId = config.razorpay.keyId;
  const keySecret = config.razorpay.keySecret;

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

function mapRazorpayError(err: unknown, fallbackMessage: string): AppError {
  if (err instanceof AppError) return err;
  const anyErr = err as {
    statusCode?: number;
    error?: { code?: string; description?: string };
    message?: string;
  };
  const statusCode = anyErr?.statusCode;
  const description = anyErr?.error?.description || anyErr?.message || fallbackMessage;
  const code = anyErr?.error?.code || '';

  if (
    statusCode === 401 ||
    code === 'AUTHENTICATION_ERROR' ||
    description.toLowerCase().includes('authentication')
  ) {
    return new AppError(
      'Payment gateway authentication failed. Please verify API credentials.',
      401,
      'RAZORPAY_AUTH_FAILED',
      { code }
    );
  }
  if (statusCode === 400) {
    return new AppError(description, 400, 'BAD_REQUEST', { code });
  }
  return new AppError(description, 500, 'RAZORPAY_API_ERROR', {
    statusCode: statusCode || 500,
    code,
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

export async function createOrder(params: CreateOrderParams) {
  const { client, keyId } = getRazorpayClient();
  const { db, isMockMode } = initializeFirebase();

  let amountPaise =
    params.amount !== undefined && params.amount !== null && params.amount !== ''
      ? Math.round(Number(params.amount))
      : params.amountInr !== undefined && params.amountInr !== null && params.amountInr !== ''
      ? Math.round(Number(params.amountInr) * 100)
      : NaN;

  const bookingId = params.bookingId?.trim();
  const resolvedSettlementId =
    params.settlementId?.trim() || (bookingId ? `STL-${bookingId.replace(/^BK-/, '')}` : undefined);

  if (db && !isMockMode && bookingId) {
    const orderSnap = await db.collection('orders').doc(bookingId).get();
    if (!orderSnap.exists) {
      throw new AppError(`Booking not found: ${bookingId}`, 404, 'NOT_FOUND');
    }
    const orderData = orderSnap.data() as Record<string, unknown>;
    if (
      params.requesterRole === UserRole.SMALL_LAB &&
      params.requesterLabId &&
      orderData.smallLabId &&
      orderData.smallLabId !== params.requesterLabId
    ) {
      throw new AppError('You do not have permission to pay for this booking.', 403, 'FORBIDDEN');
    }
    if (Number.isNaN(amountPaise) && typeof orderData.totalAmountInr === 'number') {
      amountPaise = Math.round(orderData.totalAmountInr * 100);
    }
  }

  if (db && !isMockMode && resolvedSettlementId) {
    const stlSnap = await db.collection('settlements').doc(resolvedSettlementId).get();
    if (stlSnap.exists) {
      const stlData = stlSnap.data() as Record<string, unknown>;
      if (stlData.paymentStatus === 'PAID') {
        throw new AppError('This invoice has already been paid online.', 400, 'ALREADY_PAID');
      }
      if (typeof stlData.grossAmountInr === 'number' && stlData.grossAmountInr > 0) {
        amountPaise = Math.max(100, Math.round(stlData.grossAmountInr * 100));
      }
    }
  }

  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    throw new AppError('Payment amount must be at least 100 paise (₹1.00).', 400, 'INVALID_AMOUNT');
  }

  const currency = (params.currency || 'INR').trim().toUpperCase();
  const receipt = (
    params.receipt || (bookingId ? `rcpt_${bookingId}` : `rcpt_${Date.now()}`)
  ).slice(0, 40);

  let order;
  try {
    order = await client.orders.create({
      amount: amountPaise,
      currency,
      receipt,
      notes: {
        ...sanitizeNotes(params.notes),
        platform: 'labsetu',
        ...(bookingId ? { bookingId } : {}),
        ...(resolvedSettlementId ? { settlementId: resolvedSettlementId } : {}),
      },
    });
  } catch (err) {
    throw mapRazorpayError(err, 'Unable to create Razorpay order.');
  }

  const now = new Date().toISOString();
  if (db && !isMockMode) {
    if (bookingId) {
      await db.collection('orders').doc(bookingId).set({ razorpayOrderId: order.id, updatedAt: now }, { merge: true });
    }
    if (resolvedSettlementId) {
      const stlRef = db.collection('settlements').doc(resolvedSettlementId);
      const stlSnap = await stlRef.get();
      if (stlSnap.exists) {
        await stlRef.set({ razorpayOrderId: order.id, updatedAt: now }, { merge: true });
      }
    }
  }

  return {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    key_id: keyId,
    bookingId: bookingId || null,
    settlementId: resolvedSettlementId || null,
  };
}

export async function verifyPayment(params: VerifyPaymentParams) {
  const { client, keySecret } = getRazorpayClient();
  const { db, isMockMode } = initializeFirebase();

  const orderId = params.razorpay_order_id?.trim() || '';
  const paymentId = params.razorpay_payment_id?.trim() || '';
  const signature = params.razorpay_signature?.trim() || '';

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

  let resolvedMethod = params.paymentMethod;
  try {
    const paymentDetails = await client.payments.fetch(paymentId);
    if (paymentDetails?.method) {
      resolvedMethod = String(paymentDetails.method).toUpperCase();
    }
  } catch {
    // Non-fatal
  }

  const now = new Date().toISOString();
  let matchedOrderId = params.bookingId?.trim() || null;
  let matchedSettlementId = params.settlementId?.trim() || null;

  if (db && !isMockMode) {
    let orderDoc = matchedOrderId ? await db.collection('orders').doc(matchedOrderId).get() : null;
    if (!orderDoc?.exists) {
      const qSnap = await db.collection('orders').where('razorpayOrderId', '==', orderId).limit(1).get();
      if (!qSnap.empty) orderDoc = qSnap.docs[0];
    }

    const candidateStlId =
      matchedSettlementId || (orderDoc?.exists ? `STL-${orderDoc.id.replace(/^BK-/, '')}` : undefined);
    let stlDoc = candidateStlId ? await db.collection('settlements').doc(candidateStlId).get() : null;
    if (!stlDoc?.exists) {
      const qSnap = await db.collection('settlements').where('razorpayOrderId', '==', orderId).limit(1).get();
      if (!qSnap.empty) stlDoc = qSnap.docs[0];
    }

    const paidPatch = {
      paymentStatus: 'PAID',
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      paidAt: now,
      ...(resolvedMethod ? { paymentMethod: resolvedMethod } : {}),
      ...(params.collectedByRole ? { collectedByRole: params.collectedByRole } : {}),
      updatedAt: now,
    };

    if (orderDoc?.exists) {
      matchedOrderId = orderDoc.id;
      await orderDoc.ref.set(paidPatch, { merge: true });
    }
    if (stlDoc?.exists) {
      matchedSettlementId = stlDoc.id;
      const existing = stlDoc.data() as Record<string, unknown>;
      await stlDoc.ref.set(
        {
          ...paidPatch,
          labPayoutStatus: existing.labPayoutStatus || 'PENDING',
          phleboPayoutStatus: existing.phleboPayoutStatus || 'PENDING',
        },
        { merge: true }
      );
      const gross = Number(existing.grossAmountInr || 0);
      const orderNum = String(existing.orderNumber || matchedOrderId || orderId);
      await sendPlatformNotification({
        title: `Payment Received: ${orderNum} (₹${gross.toLocaleString('en-IN')})`,
        message: `Online payment (${paymentId}) confirmed for ${String(existing.smallLabName || 'Collection Lab')}.`,
        category: NotificationCategory.PAYMENT_RECEIVED,
        priority: NotificationPriority.NORMAL,
        recipientEmail: config.admin.email,
        recipientRole: UserRole.ADMIN,
        orderId: matchedOrderId || undefined,
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
  }

  return {
    verified: true,
    order_id: orderId,
    payment_id: paymentId,
    paymentMethod: resolvedMethod || 'ONLINE',
    bookingId: matchedOrderId,
    settlementId: matchedSettlementId,
    paidAt: now,
  };
}

export async function createPaymentLink(input: {
  amount?: number | string;
  amountInr?: number | string;
  bookingId?: string;
  settlementId?: string;
  description?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}) {
  const { client } = getRazorpayClient();
  const { db, isMockMode } = initializeFirebase();

  let amountPaise =
    input.amount !== undefined && input.amount !== null && input.amount !== ''
      ? Math.round(Number(input.amount))
      : input.amountInr !== undefined && input.amountInr !== null && input.amountInr !== ''
      ? Math.round(Number(input.amountInr) * 100)
      : NaN;

  const bookingId = input.bookingId?.trim();
  const settlementId =
    input.settlementId?.trim() || (bookingId ? `STL-${bookingId.replace(/^BK-/, '')}` : undefined);

  if (db && !isMockMode && settlementId) {
    const snap = await db.collection('settlements').doc(settlementId).get();
    if (snap.exists) {
      const data = snap.data() as Record<string, unknown>;
      if (data.paymentStatus === 'PAID') {
        throw new AppError('This booking has already been paid online.', 400, 'ALREADY_PAID');
      }
      if (typeof data.grossAmountInr === 'number' && data.grossAmountInr > 0) {
        amountPaise = Math.max(100, Math.round(data.grossAmountInr * 100));
      }
    }
  }

  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    throw new AppError('Payment amount must be at least 100 paise (₹1.00).', 400, 'INVALID_AMOUNT');
  }

  const rawContact = (input.customerPhone || '9999999999').replace(/\D/g, '').slice(-10);
  const contact = rawContact.length >= 10 ? `+91${rawContact}` : '+919999999999';

  try {
    const link = await client.paymentLink.create({
      amount: amountPaise,
      currency: 'INR',
      reference_id: `${bookingId || 'LABSETU'}_${Date.now()}`.slice(0, 40),
      description: input.description || `LabSetu Diagnostic Booking ${bookingId || ''}`.trim(),
      customer: {
        name: input.customerName || 'LabSetu Partner',
        email: input.customerEmail || config.admin.email,
        contact,
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: {
        platform: 'labsetu',
        ...(bookingId ? { bookingId } : {}),
        ...(settlementId ? { settlementId } : {}),
      },
    });

    if (db && !isMockMode) {
      const now = new Date().toISOString();
      if (bookingId) {
        await db.collection('orders').doc(bookingId).set({ razorpayPaymentLinkId: link.id, updatedAt: now }, { merge: true });
      }
      if (settlementId) {
        await db.collection('settlements').doc(settlementId).set({ razorpayPaymentLinkId: link.id, updatedAt: now }, { merge: true });
      }
    }

    return {
      payment_link_id: link.id,
      short_url: link.short_url,
      status: link.status,
      amount: link.amount,
      currency: link.currency,
    };
  } catch (err) {
    throw mapRazorpayError(err, 'Could not generate Razorpay payment link.');
  }
}

export async function checkPaymentLink(linkId: string, bookingId?: string, settlementId?: string) {
  const { client } = getRazorpayClient();
  const { db, isMockMode } = initializeFirebase();

  let link;
  try {
    link = await client.paymentLink.fetch(linkId);
  } catch (err) {
    throw mapRazorpayError(err, 'Unable to check payment link status.');
  }

  if (link.status !== 'paid') {
    return { paid: false, status: link.status, payment_link_id: link.id, short_url: link.short_url };
  }

  const now = new Date().toISOString();
  const notes = (link.notes || {}) as Record<string, string>;
  const resolvedBookingId = bookingId?.trim() || notes.bookingId;
  const resolvedSettlementId =
    settlementId?.trim() ||
    notes.settlementId ||
    (resolvedBookingId ? `STL-${resolvedBookingId.replace(/^BK-/, '')}` : undefined);

  const paymentsList = Array.isArray(link.payments)
    ? (link.payments as Array<{ payment_id?: string; method?: string }>)
    : [];
  const paymentId = paymentsList[0]?.payment_id || `plink_paid_${link.id}`;
  const method = paymentsList[0]?.method ? String(paymentsList[0].method).toUpperCase() : 'PAYMENT_LINK';

  if (db && !isMockMode) {
    const paidPatch = {
      paymentStatus: 'PAID',
      razorpayPaymentLinkId: link.id,
      razorpayPaymentId: paymentId,
      paymentMethod: method,
      collectedByRole: 'PHLEBOTOMIST',
      paidAt: now,
      updatedAt: now,
    };
    if (resolvedBookingId) {
      await db.collection('orders').doc(resolvedBookingId).set(paidPatch, { merge: true });
    }
    if (resolvedSettlementId) {
      const stlRef = db.collection('settlements').doc(resolvedSettlementId);
      const stlSnap = await stlRef.get();
      const existing = (stlSnap.data() as Record<string, unknown> | undefined) || {};
      const wasAlreadyPaid = existing.paymentStatus === 'PAID';
      await stlRef.set(paidPatch, { merge: true });
      if (stlSnap.exists && !wasAlreadyPaid) {
        const orderNum = String(existing.orderNumber || resolvedBookingId || link.id);
        const gross = Number(existing.grossAmountInr || Math.round((Number(link.amount) || 0) / 100));
        await sendPlatformNotification({
          title: `Payment Link Confirmed: ${orderNum} (₹${gross.toLocaleString('en-IN')})`,
          message: `Payment link (${paymentId}) settled via ${method} for ${existing.smallLabName || 'Collection Lab'}.`,
          category: NotificationCategory.PAYMENT_RECEIVED,
          priority: NotificationPriority.NORMAL,
          recipientEmail: config.admin.email,
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

  return { paid: true, status: link.status, payment_link_id: link.id, payment_id: paymentId, paidAt: now };
}

export async function releasePayout(input: {
  settlementId: string;
  recipientType: 'LARGE_LAB' | 'PHLEBOTOMIST' | 'BOTH';
  mode?: 'UPI' | 'IMPS' | 'NEFT' | 'RAZORPAYX';
  referenceId?: string;
  notes?: string;
  forceWithoutCollection?: boolean;
  adminEmail: string;
}) {
  const { db, isMockMode } = initializeFirebase();
  if (!db || isMockMode) {
    throw new AppError(
      'Database Admin connection required for partner payout settlements.',
      503,
      'ADMIN_DB_REQUIRED'
    );
  }

  const settlementRef = db.collection('settlements').doc(input.settlementId);
  const stlSnap = await settlementRef.get();
  if (!stlSnap.exists) {
    throw new AppError(`Settlement record not found: ${input.settlementId}`, 404, 'NOT_FOUND');
  }

  const stl = stlSnap.data() as Record<string, unknown>;
  if (String(stl.paymentStatus || 'UNPAID') !== 'PAID' && !input.forceWithoutCollection) {
    throw new AppError(
      'Customer payment is not verified for this order. Collect payment first or approve override.',
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
  const payouts: Array<Record<string, unknown>> = [];

  if (
    (input.recipientType === 'LARGE_LAB' || input.recipientType === 'BOTH') &&
    nextLabStatus !== 'PAID' &&
    labPayoutInr > 0
  ) {
    const targetLabId = String(stl.targetLabId || '');
    const targetLabName = String(stl.targetLabName || 'Partner Reference Lab');
    const labSnap = targetLabId ? await db.collection('labs').doc(targetLabId).get() : null;
    const labData = (labSnap?.data() as Record<string, unknown> | undefined) || {};
    const refId = input.referenceId?.trim() || `LABPAY-${Date.now().toString().slice(-6)}`;
    const mode = input.mode || 'NEFT';
    const payoutId = `POUT-LAB-${Date.now().toString().slice(-6)}`;
    const destSummary = 'Verified Partner Account';
    const payoutDoc = {
      id: payoutId,
      settlementId: input.settlementId,
      orderId: String(stl.orderId || orderNumber),
      orderNumber,
      recipientRole: 'LARGE_LAB',
      recipientId: targetLabId || 'LAB-LG',
      recipientName: targetLabName,
      amountInr: labPayoutInr,
      mode,
      referenceId: refId,
      destinationSummary: destSummary,
      status: 'PROCESSED',
      processedByEmail: input.adminEmail,
      createdAt: now,
    };
    await db.collection('payouts').doc(payoutId).set(payoutDoc);
    payouts.push(payoutDoc);
    nextLabStatus = 'PAID';
    labRef = refId;
    labPaidAt = now;

    await sendPlatformNotification({
      title: `Payout Released: ₹${labPayoutInr.toLocaleString('en-IN')} (${orderNumber})`,
      message: `Reference Hub payout for ${orderNumber} sent via ${mode} to ${destSummary}. Reference: ${refId}.`,
      category: NotificationCategory.PAYOUT_SETTLED,
      priority: NotificationPriority.NORMAL,
      recipientEmail: labData.email ? String(labData.email) : undefined,
      recipientRole: UserRole.LARGE_LAB,
      labId: targetLabId || undefined,
      orderId: String(stl.orderId || orderNumber),
      templateType: 'PAYMENT_RECEIPT',
      metadata: {
        orderNumber,
        amountInr: labPayoutInr,
        referenceId: refId,
        paymentMethod: mode,
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
    const phleboId = stl.phlebotomistId ? String(stl.phlebotomistId) : '';
    const phleboName = stl.phlebotomistName ? String(stl.phlebotomistName) : phleboId;
    if (!phleboId) {
      throw new AppError('Assign a Field Phlebotomist before releasing courier payout.', 400, 'PHLEBOTOMIST_NOT_ASSIGNED');
    }
    const phSnap = await db.collection('phlebotomists').doc(phleboId).get();
    const phData = (phSnap.data() as Record<string, unknown> | undefined) || {};
    const refId = input.referenceId?.trim() || `CURPAY-${Date.now().toString().slice(-6)}`;
    const mode = input.mode || 'UPI';
    const payoutId = `POUT-CUR-${Date.now().toString().slice(-6)}`;
    const destSummary = 'Courier Payout Account';
    const payoutDoc = {
      id: payoutId,
      settlementId: input.settlementId,
      orderId: String(stl.orderId || orderNumber),
      orderNumber,
      recipientRole: 'PHLEBOTOMIST',
      recipientId: phleboId,
      recipientName: phleboName,
      amountInr: phleboPayoutInr,
      mode,
      referenceId: refId,
      destinationSummary: destSummary,
      status: 'PROCESSED',
      processedByEmail: input.adminEmail,
      createdAt: now,
    };
    await db.collection('payouts').doc(payoutId).set(payoutDoc);
    payouts.push(payoutDoc);
    nextPhleboStatus = 'PAID';
    phleboRef = refId;
    phleboPaidAt = now;

    await sendPlatformNotification({
      title: `Courier Payout Sent: ₹${phleboPayoutInr.toLocaleString('en-IN')} (${orderNumber})`,
      message: `Your delivery payout for ${orderNumber} was released via ${mode} (${destSummary}). Ref: ${refId}.`,
      category: NotificationCategory.PAYOUT_SETTLED,
      priority: NotificationPriority.NORMAL,
      recipientEmail: phData.email ? String(phData.email) : undefined,
      recipientRole: UserRole.PHLEBOTOMIST,
      orderId: String(stl.orderId || orderNumber),
      templateType: 'PAYMENT_RECEIPT',
      metadata: {
        orderNumber,
        amountInr: phleboPayoutInr,
        referenceId: refId,
        paymentMethod: mode,
        recipientName: phleboName,
        phleboName,
        destinationSummary: destSummary,
      },
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    });
  }

  const allDone =
    (nextLabStatus === 'PAID' || labPayoutInr <= 0) &&
    (nextPhleboStatus === 'PAID' || phleboPayoutInr <= 0);

  const patch = {
    labPayoutStatus: nextLabStatus,
    phleboPayoutStatus: nextPhleboStatus,
    ...(labRef ? { labPayoutRef: labRef } : {}),
    ...(labPaidAt ? { labPaidAt } : {}),
    ...(phleboRef ? { phleboPayoutRef: phleboRef } : {}),
    ...(phleboPaidAt ? { phleboPaidAt } : {}),
    ...(input.mode ? { payoutMode: input.mode } : {}),
    ...(allDone ? { status: 'SETTLED', settledAt: now } : {}),
    updatedAt: now,
  };
  await settlementRef.set(patch, { merge: true });
  return { settlement: { id: stlSnap.id, ...stl, ...patch }, payouts };
}

