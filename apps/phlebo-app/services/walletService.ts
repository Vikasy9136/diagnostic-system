import {
  type PhleboWallet,
  type WalletTransaction,
  type WithdrawalConfig,
  type WithdrawalRequest,
} from '@diagnostic/shared';
import { API_BASE_URL, auth } from '../firebase';

const CLOUD_FALLBACK_API_BASE =
  'https://us-central1-labsetu-diagnostics.cloudfunctions.net/api/api';

async function callWalletApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const primaryRoot = (API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL).replace(
    /\/api\/v1$/,
    '/api'
  );
  const bases = [primaryRoot, CLOUD_FALLBACK_API_BASE];
  let lastErr = 'Unable to reach wallet service.';
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers || {}),
        },
      });
      const json = (await res.json()) as { success?: boolean; data?: T; message?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.message || `Request failed (${res.status})`);
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

export async function fetchMyWallet(): Promise<{ wallet: PhleboWallet; config: WithdrawalConfig }> {
  return callWalletApi('/phlebo/wallet');
}

export async function fetchMyWalletTransactions(): Promise<WalletTransaction[]> {
  return callWalletApi('/phlebo/wallet/transactions');
}

export async function fetchMyWithdrawalRequests(): Promise<WithdrawalRequest[]> {
  return callWalletApi('/phlebo/wallet/withdrawals');
}

export async function submitWithdrawalRequest(payload: {
  requestedAmountPaise: number;
  paymentMethod: 'BANK_ACCOUNT' | 'UPI';
}): Promise<{ request: WithdrawalRequest; wallet: PhleboWallet; message: string }> {
  return callWalletApi('/phlebo/wallet/withdrawals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadPrivateQrImage(payload: {
  mimeType: string;
  base64Data: string;
}): Promise<{ stored: boolean; storagePath: string; updatedAt: string }> {
  return callWalletApi('/phlebo/payout-profile/qr', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
