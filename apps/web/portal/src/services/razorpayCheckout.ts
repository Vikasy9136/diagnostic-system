import { API_BASE_URL, auth } from '../firebase';

export const RAZORPAY_PUBLIC_KEY_ID: string =
  import.meta.env.VITE_RAZORPAY_KEY_ID?.trim() || '';

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
    source?: string;
    step?: string;
    reason?: string;
  };
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: { color?: string };
  modal?: {
    ondismiss?: () => void;
    escape?: boolean;
    backdropclose?: boolean;
  };
  handler: (response: RazorpayHandlerResponse) => void;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, callback: (resp: RazorpayFailedResponse) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

async function ensureRazorpayScriptLoaded(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Checkout window is unavailable outside the browser.');
  }
  if (window.Razorpay) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );
    if (existing) {
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        if (window.Razorpay) {
          window.clearInterval(timer);
          resolve();
        } else if (attempts > 30) {
          window.clearInterval(timer);
          reject(new Error('Could not load online payment checkout. Please refresh and try again.'));
        }
      }, 200);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Unable to load Razorpay checkout script. Check your internet connection.'));
    document.head.appendChild(script);
  });

  if (!window.Razorpay) {
    throw new Error('Payment checkout failed to initialize.');
  }
}

async function callPaymentApi<T>(
  path: string,
  options: RequestInit & { requireUserToken?: boolean } = {}
): Promise<T> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  if (options.requireUserToken && !token) {
    throw new Error('Your sign-in session expired. Please sign in again.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'WEB',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const primaryUrl = `${API_BASE_URL.replace(/\/+$/, '')}${normalizedPath}`;

  let res: Response;
  try {
    res = await fetch(primaryUrl, { ...options, headers });
  } catch {
    // Fallback cleanly if local Vite runs standalone without local Express server started
    const fallbackUrl = `${CLOUD_FALLBACK_API_BASE}${normalizedPath}`;
    res = await fetch(fallbackUrl, { ...options, headers });
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      json?.error?.message ||
      json?.message ||
      `Payment service returned status ${res.status}`;
    throw new Error(message);
  }

  return json as T;
}

export interface StartCheckoutParams {
  amountInr: number;
  bookingId?: string;
  settlementId?: string;
  description: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  collectedByRole?: 'SMALL_LAB' | 'PHLEBOTOMIST' | 'ADMIN';
}

export interface VerifiedCheckoutResult {
  orderId: string;
  paymentId: string;
  paymentMethod: string;
  paidAt: string;
}

export async function startRazorpayBookingCheckout(
  params: StartCheckoutParams
): Promise<
  | { status: 'PAID'; result: VerifiedCheckoutResult }
  | { status: 'CANCELLED'; message: string }
> {
  const amountPaise = Math.round(params.amountInr * 100);
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    throw new Error('Minimum payable amount is ₹1.00 (100 paise).');
  }

  await ensureRazorpayScriptLoaded();

  const orderResp = await callPaymentApi<{
    order_id?: string;
    amount?: number;
    currency?: string;
    key_id?: string;
    data?: { order_id: string; amount: number; currency: string; key_id?: string };
  }>('/payments/create-order', {
    method: 'POST',
    requireUserToken: Boolean(params.bookingId || params.settlementId),
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt: params.bookingId
        ? `rcpt_${params.bookingId}`.slice(0, 40)
        : `rcpt_${Date.now()}`,
      bookingId: params.bookingId,
      settlementId: params.settlementId,
      notes: {
        ...(params.bookingId ? { bookingId: params.bookingId } : {}),
        ...(params.settlementId ? { settlementId: params.settlementId } : {}),
      },
    }),
  });

  const orderId = orderResp.order_id || orderResp.data?.order_id;
  const orderAmount = orderResp.amount || orderResp.data?.amount || amountPaise;
  const currency = orderResp.currency || orderResp.data?.currency || 'INR';
  const publicKey = RAZORPAY_PUBLIC_KEY_ID || orderResp.key_id || orderResp.data?.key_id || '';

  if (!orderId || !publicKey) {
    throw new Error('Online checkout configuration is missing. Please contact support.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const rzp = new window.Razorpay!({
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
      notes: {
        ...(params.bookingId ? { bookingId: params.bookingId } : {}),
        ...(params.settlementId ? { settlementId: params.settlementId } : {}),
      },
      theme: { color: '#0D9488' },
      modal: {
        escape: true,
        backdropclose: false,
        ondismiss: () => {
          if (settled) return;
          settled = true;
          resolve({
            status: 'CANCELLED',
            message: 'Checkout was closed before payment finished. You can retry anytime from Payments.',
          });
        },
      },
      handler: (response: RazorpayHandlerResponse) => {
        void (async () => {
          try {
            const verifyResp = await callPaymentApi<{
              verified?: boolean;
              data?: {
                order_id: string;
                payment_id: string;
                paymentMethod?: string;
                paidAt?: string;
              };
            }>('/payments/verify-payment', {
              method: 'POST',
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                bookingId: params.bookingId,
                settlementId: params.settlementId,
                collectedByRole: params.collectedByRole || 'SMALL_LAB',
              }),
            });

            if (settled) return;
            settled = true;
            resolve({
              status: 'PAID',
              result: {
                orderId: verifyResp.data?.order_id || response.razorpay_order_id,
                paymentId: verifyResp.data?.payment_id || response.razorpay_payment_id,
                paymentMethod: verifyResp.data?.paymentMethod || 'ONLINE',
                paidAt: verifyResp.data?.paidAt || new Date().toISOString(),
              },
            });
          } catch (err) {
            if (settled) return;
            settled = true;
            reject(
              err instanceof Error
                ? err
                : new Error('Payment signature verification failed. Payment was not confirmed.')
            );
          }
        })();
      },
    });

    rzp.on('payment.failed', (failure: RazorpayFailedResponse) => {
      if (settled) return;
      settled = true;
      const reason =
        failure?.error?.description ||
        failure?.error?.reason ||
        'Your payment did not go through. Please try again.';
      reject(new Error(reason));
    });

    rzp.open();
  });
}

export async function releasePartnerPayoutApi(params: {
  settlementId: string;
  recipientType: 'LARGE_LAB' | 'PHLEBOTOMIST' | 'BOTH';
  mode?: 'UPI' | 'IMPS' | 'NEFT' | 'RAZORPAYX';
  referenceId?: string;
  notes?: string;
  forceWithoutCollection?: boolean;
}): Promise<{
  message?: string;
  data?: { payouts?: Array<{ id: string; referenceId: string; amountInr: number; recipientName: string }> };
}> {
  return callPaymentApi('/payments/payout', {
    method: 'POST',
    requireUserToken: true,
    body: JSON.stringify(params),
  });
}

