import {
  type BankDirectoryEntry,
  type IfscLookupResult,
  type PayoutLedgerRecord,
  type PhleboPaymentMethodSummary,
} from '@diagnostic/shared';
import { API_BASE_URL, auth } from '../firebase';

const CLOUD_FALLBACK_API_BASE =
  'https://us-central1-labsetu-diagnostics.cloudfunctions.net/api/api/v1';

async function callPhleboPayoutApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const bases = [
    API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL,
    CLOUD_FALLBACK_API_BASE,
  ];
  let lastErr = 'Unable to reach LabSetu payout service.';
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/phlebo-payouts${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers || {}),
        },
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: T;
        message?: string;
        error?: { message?: string };
      } | null;
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message || json?.message || `Request failed (${res.status})`);
      }
      return json.data as T;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : lastErr;
      if (base === bases[bases.length - 1] || !lastErr.toLowerCase().includes('network')) {
        throw new Error(lastErr);
      }
    }
  }
  throw new Error(lastErr);
}

export async function fetchBankDirectory(
  query?: string
): Promise<{ popular: BankDirectoryEntry[]; all: BankDirectoryEntry[] }> {
  const q = query ? `?q=${encodeURIComponent(query)}` : '';
  return callPhleboPayoutApi(`/banks${q}`);
}

export async function lookupIfscFromBackend(ifsc: string): Promise<IfscLookupResult> {
  return callPhleboPayoutApi(`/ifsc/${encodeURIComponent(ifsc.trim().toUpperCase())}`);
}

export async function fetchMyPaymentMethods(): Promise<PhleboPaymentMethodSummary> {
  return callPhleboPayoutApi('/my-payment-methods');
}

export async function saveMyBankAccount(payload: {
  accountHolderName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifscCode: string;
  selectedBankCode?: string;
  makeDefault?: boolean;
}): Promise<PhleboPaymentMethodSummary> {
  return callPhleboPayoutApi('/my-bank-account', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function saveMyUpiAccount(payload: {
  upiId: string;
  confirmUpiId: string;
  makeDefault?: boolean;
}): Promise<PhleboPaymentMethodSummary> {
  return callPhleboPayoutApi('/my-upi-account', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function setMyDefaultPayoutMethod(
  method: 'BANK_ACCOUNT' | 'UPI'
): Promise<PhleboPaymentMethodSummary> {
  return callPhleboPayoutApi('/my-default-method', {
    method: 'PATCH',
    body: JSON.stringify({ method }),
  });
}

export interface MyPayoutsResponse {
  summary: {
    availableInr: number;
    pendingInr: number;
    processingInr: number;
    paidInr: number;
    failedInr: number;
    lastPayout: PayoutLedgerRecord | null;
  };
  payouts: PayoutLedgerRecord[];
}

export async function fetchMyPayoutLedger(): Promise<MyPayoutsResponse> {
  return callPhleboPayoutApi('/my-payouts');
}
