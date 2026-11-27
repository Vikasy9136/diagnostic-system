import { API_BASE_URL, auth } from '../firebase';

const CLOUD_FALLBACK_API_BASE =
  'https://us-central1-labsetu-diagnostics.cloudfunctions.net/api/api/v1';

async function callHandoverApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  if (!token) {
    throw new Error('Authentication session expired. Please sign in again.');
  }

  const normalized = path.startsWith('/') ? path : `/${path}`;
  const bases = [
    API_BASE_URL.replace(/\/+$/, ''),
    ...(API_BASE_URL.replace(/\/+$/, '') !== CLOUD_FALLBACK_API_BASE
      ? [CLOUD_FALLBACK_API_BASE]
      : []),
  ];

  let lastError = 'Handover OTP request failed.';
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${normalized}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'ANDROID',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        return json.data as T;
      }
      lastError = json?.error?.message || json?.message || `HTTP ${res.status}`;
      if (res.status < 500) {
        throw new Error(lastError);
      }
    } catch (err) {
      lastError = (err as Error).message || lastError;
      if (!lastError.includes('Network') && !lastError.includes('Failed to fetch')) {
        throw err;
      }
    }
  }
  throw new Error(lastError);
}

export async function generateHandoverOtpMobile(
  orderId: string,
  centreId?: string
): Promise<{ orderId: string; expiresAt: string; ttlMinutes: number }> {
  return callHandoverApi(`/workflow/orders/${encodeURIComponent(orderId)}/handover-otp/generate`, {
    ...(centreId ? { centreId } : {}),
  });
}

export async function verifyHandoverOtpMobile(
  orderId: string,
  payload: {
    otp: string;
    centreId?: string;
    receivedByStaff?: string;
    temperatureCelsius?: number;
    remarks?: string;
  }
): Promise<{ verified: boolean; order: any }> {
  return callHandoverApi(
    `/workflow/orders/${encodeURIComponent(orderId)}/handover-otp/verify`,
    payload
  );
}
