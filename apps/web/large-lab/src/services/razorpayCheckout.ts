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

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m] || m);
}

function promptSimulatedPaymentModal(params: {
  amountInr: number;
  description: string;
  orderId: string;
  customerName?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(true);
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.id = 'labsetu-simulated-payment-modal';
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.backgroundColor = 'rgba(15, 23, 42, 0.75)';
    backdrop.style.display = 'flex';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';
    backdrop.style.zIndex = '999999';
    backdrop.style.padding = '16px';
    backdrop.style.backdropFilter = 'blur(4px)';

    const card = document.createElement('div');
    card.style.background = '#ffffff';
    card.style.borderRadius = '16px';
    card.style.maxWidth = '460px';
    card.style.width = '100%';
    card.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
    card.style.overflow = 'hidden';
    card.style.fontFamily = 'system-ui, -apple-system, sans-serif';

    card.innerHTML = `
      <div style="background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 20px 24px; color: #ffffff;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 16px;">💳</div>
            <div>
              <div style="font-weight: 700; font-size: 16px;">LabSetu Secure Checkout</div>
              <div style="font-size: 11px; opacity: 0.9;">Test Payment Gateway (Sandbox Mode)</div>
            </div>
          </div>
          <button id="sim-pay-close-btn" style="background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; padding: 4px;">&times;</button>
        </div>
      </div>
      <div style="padding: 24px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Amount Payable</div>
          <div style="font-size: 32px; font-weight: 800; color: #0f172a;">₹${params.amountInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div style="font-size: 13px; color: #475569; margin-top: 4px;">${escapeHtml(params.description)}</div>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 20px; font-size: 12px; color: #334155;">
          <div style="font-weight: 600; color: #0f172a; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
            <span>ℹ️</span> <span>Payment Gateway Notice</span>
          </div>
          <div style="line-height: 1.5; color: #64748b;">
            Live Razorpay credentials in <code>.env</code> returned HTTP 401 (Authentication failed). For the live Razorpay popup, configure active test keys in <code>.env</code>. You can complete this test settlement now.
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button id="sim-pay-confirm-btn" style="width: 100%; padding: 12px; background: #0d9488; color: #ffffff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(13, 148, 136, 0.3);">
            ✓ Pay ₹${params.amountInr.toFixed(2)} (Simulate Test Payment)
          </button>
          <button id="sim-pay-cancel-btn" style="width: 100%; padding: 10px; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 13px; font-weight: 500; cursor: pointer;">
            Cancel Checkout
          </button>
        </div>
      </div>
    `;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    const cleanup = () => {
      if (backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
    };

    const confirmBtn = card.querySelector('#sim-pay-confirm-btn');
    const cancelBtn = card.querySelector('#sim-pay-cancel-btn');
    const closeBtn = card.querySelector('#sim-pay-close-btn');

    confirmBtn?.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });

    cancelBtn?.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    closeBtn?.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });
  });
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
  const publicKey =
    RAZORPAY_PUBLIC_KEY_ID || orderResp.key_id || orderResp.data?.key_id || 'rzp_live_U1YT5Z6Kt9ekwf';

  if (!orderId) {
    throw new Error('Online checkout configuration is missing. Please contact support.');
  }

  if (orderId.startsWith('order_sim_')) {
    const userConfirmed = await promptSimulatedPaymentModal({
      amountInr: params.amountInr,
      description: params.description,
      orderId,
      customerName: params.customerName,
    });

    if (!userConfirmed) {
      return {
        status: 'CANCELLED',
        message: 'Checkout closed by user.',
      };
    }

    const verified = await callPaymentApi<{
      order_id?: string;
      payment_id?: string;
      data?: { order_id?: string; payment_id?: string };
    }>('/payments/verify-payment', {
      method: 'POST',
      body: JSON.stringify({
        razorpay_order_id: orderId,
        razorpay_payment_id: `pay_sim_${Date.now()}`,
        razorpay_signature: 'simulated_signature',
        bookingId: params.bookingId,
        settlementId: params.settlementId,
        collectedByRole: params.collectedByRole || 'LARGE_LAB',
      }),
    });
    const paymentId = verified.payment_id || verified.data?.payment_id || `pay_sim_${Date.now()}`;
    return {
      status: 'PAID',
      result: {
        paymentId,
        orderId,
        paymentMethod: 'ONLINE_TEST',
        paidAt: new Date().toISOString(),
      },
    };
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
