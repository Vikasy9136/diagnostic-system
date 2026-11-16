import { Alert, Platform } from 'react-native';
import { API_BASE_URL, auth } from '../firebase';

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

const env = typeof process !== 'undefined' && process.env ? process.env : {};

export const EXPO_RAZORPAY_KEY_ID =
  env.EXPO_PUBLIC_RAZORPAY_KEY_ID?.trim() || '';

const CLOUD_FALLBACK_API_BASE =
  'https://us-central1-labsetu-diagnostics.cloudfunctions.net/api/api/v1';

interface RazorpayHandlerResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayFailedResponse {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
  };
}

interface RazorpayWebInstance {
  open: () => void;
  on: (event: string, cb: (resp: RazorpayFailedResponse) => void) => void;
}

type WebWindow = {
  document?: {
    querySelector: (selector: string) => unknown;
    createElement: (tag: string) => {
      src: string;
      async: boolean;
      onload: (() => void) | null;
      onerror: (() => void) | null;
    };
    head: { appendChild: (el: unknown) => void };
  };
  Razorpay?: new (options: Record<string, unknown>) => RazorpayWebInstance;
  setInterval: (cb: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
};

async function callPaymentApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  if (!token) {
    throw new Error('Your sign-in session expired. Please sign out and sign back in.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'MOBILE_APP',
    Authorization: `Bearer ${token}`,
    ...((options.headers as Record<string, string>) || {}),
  };

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const primaryUrl = `${API_BASE_URL.replace(/\/+$/, '')}${normalizedPath}`;

  let res: Response;
  try {
    res = await fetch(primaryUrl, { ...options, headers });
  } catch {
    res = await fetch(`${CLOUD_FALLBACK_API_BASE}${normalizedPath}`, {
      ...options,
      headers,
    });
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      json?.error?.message ||
        json?.message ||
        `Payment service returned status ${res.status}`
    );
  }

  return json as T;
}

async function ensureWebRazorpayLoaded(): Promise<WebWindow> {
  const win = globalThis as unknown as WebWindow;
  if (!win.document) {
    throw new Error('Browser window is unavailable for web checkout.');
  }
  if (win.Razorpay) return win;

  await new Promise<void>((resolve, reject) => {
    const existing = win.document!.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );
    if (existing) {
      let tries = 0;
      const timer = win.setInterval(() => {
        tries += 1;
        if (win.Razorpay) {
          win.clearInterval(timer);
          resolve();
        } else if (tries > 30) {
          win.clearInterval(timer);
          reject(new Error('Online checkout script timed out. Please refresh and try again.'));
        }
      }, 200);
      return;
    }

    const script = win.document!.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Could not load Razorpay checkout script. Check internet access.'));
    win.document!.head.appendChild(script);
  });

  if (!win.Razorpay) {
    throw new Error('Payment modal failed to initialize.');
  }
  return win;
}

export interface PhleboPaymentParams {
  amountInr: number;
  bookingId: string;
  settlementId: string;
  description: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

export async function startPhleboWebCheckout(
  params: PhleboPaymentParams
): Promise<
  | { status: 'PAID'; paymentId: string; orderId: string }
  | { status: 'CANCELLED'; message: string }
> {
  const amountPaise = Math.round(params.amountInr * 100);
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    throw new Error('Minimum payable amount is ₹1.00 (100 paise).');
  }

  const win = await ensureWebRazorpayLoaded();

  const orderResp = await callPaymentApi<{
    order_id?: string;
    amount?: number;
    currency?: string;
    key_id?: string;
    data?: { order_id: string; amount: number; currency: string; key_id?: string };
  }>('/payments/create-order', {
    method: 'POST',
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt: `rcpt_${params.bookingId}`.slice(0, 40),
      bookingId: params.bookingId,
      settlementId: params.settlementId,
      notes: {
        bookingId: params.bookingId,
        settlementId: params.settlementId,
        collectedBy: 'PHLEBOTOMIST',
      },
    }),
  });

  const orderId = orderResp.order_id || orderResp.data?.order_id;
  const orderAmount = orderResp.amount || orderResp.data?.amount || amountPaise;
  const currency = orderResp.currency || orderResp.data?.currency || 'INR';
  const publicKey =
    EXPO_RAZORPAY_KEY_ID || orderResp.key_id || orderResp.data?.key_id || 'rzp_test_TyoM0mUyIpaaOZ';

  if (!orderId) {
    throw new Error('Payment checkout order could not be generated.');
  }

  if (orderId.startsWith('order_sim_')) {
    const shouldProceed = await new Promise<boolean>((resolve) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const ok = window.confirm(
          `[Test Mode] Live Razorpay credentials returned HTTP 401.\n\nSimulate online payment collection of ₹${params.amountInr.toFixed(2)} for ${params.bookingId}?`
        );
        resolve(ok);
      } else {
        Alert.alert(
          'Simulate Test Payment',
          `Live Razorpay credentials returned HTTP 401.\n\nSimulate online payment collection of ₹${params.amountInr.toFixed(2)} for ${params.bookingId}?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Confirm Pay', onPress: () => resolve(true) },
          ]
        );
      }
    });

    if (!shouldProceed) {
      return {
        status: 'CANCELLED',
        message: 'Payment collection cancelled by user.',
      };
    }

    const verified = await callPaymentApi<{
      data?: { payment_id?: string; order_id?: string };
    }>('/payments/verify-payment', {
      method: 'POST',
      body: JSON.stringify({
        razorpay_order_id: orderId,
        razorpay_payment_id: `pay_sim_${Date.now()}`,
        razorpay_signature: 'simulated_signature',
        bookingId: params.bookingId,
        settlementId: params.settlementId,
        collectedByRole: 'PHLEBOTOMIST',
      }),
    });
    return {
      status: 'PAID',
      paymentId: verified.data?.payment_id || `pay_sim_${Date.now()}`,
      orderId,
    };
  }

  return new Promise((resolve, reject) => {
    let finished = false;
    const rzp = new win.Razorpay!({
      key: publicKey,
      amount: orderAmount,
      currency,
      name: 'LabSetu Diagnostics',
      description: params.description,
      order_id: orderId,
      prefill: {
        name: params.customerName || undefined,
        email: params.customerEmail || undefined,
        contact: params.customerPhone || undefined,
      },
      theme: { color: '#0D9488' },
      modal: {
        escape: true,
        backdropclose: false,
        ondismiss: () => {
          if (finished) return;
          finished = true;
          resolve({
            status: 'CANCELLED',
            message: 'Checkout closed before completing payment.',
          });
        },
      },
      handler: (response: RazorpayHandlerResponse) => {
        void (async () => {
          try {
            const verified = await callPaymentApi<{
              data?: { payment_id?: string; order_id?: string };
            }>('/payments/verify-payment', {
              method: 'POST',
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                bookingId: params.bookingId,
                settlementId: params.settlementId,
                collectedByRole: 'PHLEBOTOMIST',
              }),
            });
            if (finished) return;
            finished = true;
            resolve({
              status: 'PAID',
              paymentId:
                verified.data?.payment_id || response.razorpay_payment_id,
              orderId: verified.data?.order_id || response.razorpay_order_id,
            });
          } catch (err) {
            if (finished) return;
            finished = true;
            reject(
              err instanceof Error
                ? err
                : new Error('Payment signature verification failed.')
            );
          }
        })();
      },
    });

    rzp.on('payment.failed', (failure: RazorpayFailedResponse) => {
      if (finished) return;
      finished = true;
      reject(
        new Error(
          failure?.error?.description ||
            failure?.error?.reason ||
            'Payment failed. Please retry.'
        )
      );
    });

    rzp.open();
  });
}

export async function createPhleboMobilePaymentLink(
  params: PhleboPaymentParams
): Promise<{
  payment_link_id: string;
  short_url: string;
  status: string;
  amount: number;
  currency: string;
}> {
  const resp = await callPaymentApi<{
    data: {
      payment_link_id: string;
      short_url: string;
      status: string;
      amount: number;
      currency: string;
    };
  }>('/payments/create-payment-link', {
    method: 'POST',
    body: JSON.stringify({
      bookingId: params.bookingId,
      settlementId: params.settlementId,
      amountInr: params.amountInr,
      description: params.description,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      customerPhone: params.customerPhone,
    }),
  });

  if (!resp.data?.payment_link_id || !resp.data?.short_url) {
    throw new Error('Could not generate Razorpay mobile payment link.');
  }

  return resp.data;
}

export async function checkPhleboPaymentLinkStatus(params: {
  paymentLinkId: string;
  bookingId: string;
  settlementId: string;
}): Promise<{
  paid: boolean;
  status: string;
  payment_id?: string;
}> {
  const qs = new URLSearchParams({
    bookingId: params.bookingId,
    settlementId: params.settlementId,
  }).toString();

  const resp = await callPaymentApi<{
    data: {
      paid: boolean;
      status: string;
      payment_id?: string;
    };
  }>(`/payments/payment-link/${encodeURIComponent(params.paymentLinkId)}?${qs}`, {
    method: 'GET',
  });

  return resp.data;
}

