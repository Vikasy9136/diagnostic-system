import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  UserRole,
} from './types';
import { ADMIN_EMAIL, AppError, RAZORPAY_CONFIG, db } from './firebaseAdmin';
import { sendPlatformNotification } from './mailer';

export interface CreateRazorpayOrderInput {
  amount?: number | string;
  amountInr?: number | string;
  currency?: string;
  receipt?: string;
  bookingId?: string;
  settlementId?: string;
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
  collectedByRole?: 'SMALL_LAB' | 'PHLEBOTOMIST' | 'ADMIN';
  paymentMethod?: string;
}

export interface CreatePaymentLinkInput {
  amount?: number | string;
  amountInr?: number | string;
  bookingId?: string;
  settlementId?: string;
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

export async function createRazorpayOrder(input: CreateRazorpayOrderInput) {
  const { client, keyId } = getRazorpayClient();

  let amountPaise =
    input.amount !== undefined && input.amount !== null && input.amount !== ''
      ? Math.round(Number(input.amount))
      : input.amountInr !== undefined && input.amountInr !== null && input.amountInr !== ''
      ? Math.round(Number(input.amountInr) * 100)
      : NaN;

  const bookingId = input.bookingId?.trim();
  const requestedSettlementId = input.settlementId?.trim();
  const resolvedSettlementId =
    requestedSettlementId || (bookingId ? `STL-${bookingId.replace(/^BK-/, '')}` : undefined);

  let linkedOrderDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  let linkedSettlementDoc: FirebaseFirestore.DocumentSnapshot | null = null;

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
        const expectedPaise = Math.max(100, Math.round(stlData.grossAmountInr * 100));
        // Enforce authoritative server invoice amount when linked to a settlement
        amountPaise = expectedPaise;
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
    (bookingId ? `rcpt_${bookingId}` : `rcpt_${Date.now()}`)
  ).slice(0, 40);

  const notes: Record<string, string | number> = {
    ...sanitizeNotes(input.notes),
    platform: 'labsetu',
    ...(bookingId ? { bookingId } : {}),
    ...(resolvedSettlementId ? { settlementId: resolvedSettlementId } : {}),
  };

  let order;
  try {
    order = await client.orders.create({
      amount: amountPaise,
      currency,
      receipt,
      notes,
    });
  } catch (err) {
    throw mapRazorpaySdkError(err, 'Unable to initialize payment order with Razorpay.');
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

  return {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    key_id: keyId,
    bookingId: bookingId || null,
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

  // Enrich payment method non-fatally if payment exists in Razorpay
  let resolvedMethod = input.paymentMethod;
  try {
    const paymentDetails = await client.payments.fetch(paymentId);
    if (paymentDetails?.method) {
      resolvedMethod = String(paymentDetails.method).toUpperCase();
    }
  } catch {
    // Non-fatal: synthetic HMAC verification or restricted test query still succeeds cleanly
  }

  const now = new Date().toISOString();
  let matchedOrderDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  let matchedSettlementDoc: FirebaseFirestore.DocumentSnapshot | null = null;

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

  if (matchedOrderDoc?.exists) {
    await matchedOrderDoc.ref.set(paidFields, { merge: true });
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
      message: `Online payment (${paymentId}) confirmed for ${existing.smallLabName || 'Collection Lab'} -> ${existing.targetLabName || 'Reference Lab'}. Ready for partner payouts.`,
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
    settlementId: matchedSettlementDoc?.id || null,
    paidAt: now,
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
  const settlementId =
    input.settlementId?.trim() || (bookingId ? `STL-${bookingId.replace(/^BK-/, '')}` : undefined);

  let orderData: Record<string, unknown> | undefined;
  let stlData: Record<string, unknown> | undefined;

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

  const rawContact = (input.customerPhone || '9999999999').replace(/\D/g, '').slice(-10);
  const contact = rawContact.length >= 10 ? `+91${rawContact}` : '+919999999999';

  let link;
  try {
    link = await client.paymentLink.create({
      amount: amountPaise,
      currency: 'INR',
      reference_id: `${bookingId || 'LABSETU'}_${Date.now()}`.slice(0, 40),
      description:
        input.description ||
        `LabSetu Diagnostic Booking ${String(orderData?.orderNumber || bookingId || '')}`.trim(),
      customer: {
        name:
          input.customerName ||
          String(stlData?.smallLabName || orderData?.smallLabName || 'LabSetu Partner'),
        email: input.customerEmail || ADMIN_EMAIL,
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
  } catch (err) {
    throw mapRazorpaySdkError(err, 'Could not generate Razorpay payment link.');
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
    const targetLabName = String(stl.targetLabName || 'Partner Reference Lab');
    const labSnap = targetLabId ? await db.collection('labs').doc(targetLabId).get() : null;
    const labData = (labSnap?.data() as Record<string, unknown> | undefined) || {};
    const payoutProfile = (labData.payoutProfile || {}) as Record<string, string>;

    const destSummary = payoutProfile.upiId
      ? `UPI: ${payoutProfile.upiId}`
      : payoutProfile.bankAccountLast4
      ? `Bank ••••${payoutProfile.bankAccountLast4} (${payoutProfile.ifscCode || 'IFSC'})`
      : 'Verified Partner Account';

    const refId =
      input.referenceId?.trim() || `LABPAY-${Date.now().toString().slice(-6)}`;
    const xResult = await tryExecuteRazorpayXPayout({
      amountInr: labPayoutInr,
      recipientName: payoutProfile.accountHolderName || targetLabName,
      recipientEmail: labData.email ? String(labData.email) : undefined,
      recipientPhone: labData.phone ? String(labData.phone) : undefined,
      upiId: payoutProfile.upiId,
      bankAccountNumber: payoutProfile.bankAccountNumber,
      ifscCode: payoutProfile.ifscCode,
      referenceId: refId,
    });

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
      amountInr: labPayoutInr,
      mode: payoutMode,
      referenceId: refId,
      destinationSummary: destSummary,
      ...(xResult?.gatewayPayoutId ? { gatewayPayoutId: xResult.gatewayPayoutId } : {}),
      status: 'PROCESSED',
      processedByEmail: input.adminEmail,
      ...(input.notes ? { notes: input.notes } : {}),
      createdAt: now,
    };

    await db.collection('payouts').doc(payoutId).set(payoutDoc);
    createdPayouts.push(payoutDoc);

    nextLabStatus = 'PAID';
    labRef = refId;
    labPaidAt = now;

    await sendPlatformNotification({
      title: `Payout Released: ₹${labPayoutInr.toLocaleString('en-IN')} (${orderNumber})`,
      message: `Reference Hub payout for ${orderNumber} sent via ${payoutMode} to ${destSummary}. Reference: ${refId}.`,
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

    if (!phleboId && stl.orderId) {
      const ordSnap = await db.collection('orders').doc(String(stl.orderId)).get();
      if (ordSnap.exists) {
        const ordData = ordSnap.data() as Record<string, unknown>;
        phleboId = ordData.phlebotomistId ? String(ordData.phlebotomistId) : '';
        phleboName = ordData.phlebotomistName ? String(ordData.phlebotomistName) : '';
      }
    }

    if (!phleboId) {
      throw new AppError(
        'Cannot release courier payout until a Field Phlebotomist is assigned to this order.',
        400,
        'PHLEBOTOMIST_NOT_ASSIGNED'
      );
    }

    const phSnap = await db.collection('phlebotomists').doc(phleboId).get();
    const phData = (phSnap.data() as Record<string, unknown> | undefined) || {};
    const payoutProfile = (phData.payoutProfile || {}) as Record<string, string>;
    const resolvedName = phleboName || String(phData.name || phleboId);

    const destSummary = payoutProfile.upiId
      ? `UPI: ${payoutProfile.upiId}`
      : payoutProfile.bankAccountLast4
      ? `Bank ••••${payoutProfile.bankAccountLast4} (${payoutProfile.ifscCode || 'IFSC'})`
      : 'Courier Payout Account';

    const refId =
      input.referenceId?.trim() || `CURPAY-${Date.now().toString().slice(-6)}`;
    const xResult = await tryExecuteRazorpayXPayout({
      amountInr: phleboPayoutInr,
      recipientName: payoutProfile.accountHolderName || resolvedName,
      recipientEmail: phData.email ? String(phData.email) : undefined,
      recipientPhone: phData.phone ? String(phData.phone) : undefined,
      upiId: payoutProfile.upiId,
      bankAccountNumber: payoutProfile.bankAccountNumber,
      ifscCode: payoutProfile.ifscCode,
      referenceId: refId,
    });

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
      amountInr: phleboPayoutInr,
      mode: payoutMode,
      referenceId: refId,
      destinationSummary: destSummary,
      ...(xResult?.gatewayPayoutId ? { gatewayPayoutId: xResult.gatewayPayoutId } : {}),
      status: 'PROCESSED',
      processedByEmail: input.adminEmail,
      ...(input.notes ? { notes: input.notes } : {}),
      createdAt: now,
    };

    await db.collection('payouts').doc(payoutId).set(payoutDoc);
    createdPayouts.push(payoutDoc);

    nextPhleboStatus = 'PAID';
    phleboRef = refId;
    phleboPaidAt = now;

    await sendPlatformNotification({
      title: `Courier Payout Sent: ₹${phleboPayoutInr.toLocaleString('en-IN')} (${orderNumber})`,
      message: `Your delivery payout for ${orderNumber} was released via ${payoutMode} (${destSummary}). Ref: ${refId}.`,
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
        paymentMethod: payoutMode,
        recipientName: resolvedName,
        phleboName: resolvedName,
        destinationSummary: destSummary,
      },
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    });
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
