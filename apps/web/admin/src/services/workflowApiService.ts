import {
  type CollectionCentreRecord,
  type DiagnosticReportRecord,
  type DiagnosticTestItem,
  OrderStatus,
  type PickupOrder,
} from '@diagnostic/shared';
import { API_BASE_URL, auth } from '../firebase';

export type WorkflowReportType = 'INDIVIDUAL' | 'COMBINED';

const CLOUD_FALLBACK_API_BASE =
  'https://us-central1-labsetu-diagnostics.cloudfunctions.net/api/api/v1';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}

async function callWorkflowApi<T>(
  path: string,
  options: RequestInit & { fallbackToken?: string } = {}
): Promise<ApiEnvelope<T>> {
  const freshToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const bearer = freshToken || options.fallbackToken || '';
  if (!bearer) {
    throw new Error('Your sign-in session expired. Please sign in again.');
  }

  const { fallbackToken: _ignored, headers: extraHeaders, ...fetchOpts } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'WEB',
    Authorization: `Bearer ${bearer}`,
    ...((extraHeaders as Record<string, string>) || {}),
  };

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const primaryUrl = `${API_BASE_URL.replace(/\/+$/, '')}${normalizedPath}`;
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  let res: Response;
  let json: (ApiEnvelope<T> & { error?: { code?: string; message?: string } }) | null = null;

  try {
    res = await fetch(primaryUrl, { ...fetchOpts, headers });
    json = await res.json().catch(() => null);
    if (isLocalHost && res.status >= 502 && !json) {
      res = await fetch(`${CLOUD_FALLBACK_API_BASE}${normalizedPath}`, { ...fetchOpts, headers });
      json = await res.json().catch(() => null);
    }
  } catch {
    res = await fetch(`${CLOUD_FALLBACK_API_BASE}${normalizedPath}`, { ...fetchOpts, headers });
    json = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const msg =
      json?.error?.message || json?.message || `Workflow API request failed (${res.status})`;
    throw new Error(msg);
  }
  return (json || { success: true, data: undefined as T }) as ApiEnvelope<T>;
}

export interface DiscoveryQueryParams {
  search?: string;
  itemType?: 'ALL' | 'TEST' | 'PACKAGE';
  department?: string;
  maxPrice?: number;
  maxTatHours?: number;
  city?: string;
  sort?: 'LOWEST_PRICE' | 'HIGHEST_PRICE' | 'FASTEST_TAT';
  limit?: number;
  offset?: number;
}

export interface DiscoveryOfferingItem extends DiagnosticTestItem {
  largeLabId: string;
  largeLabName: string;
  largeLabCity: string;
  largeLabRating: number;
  largeLabVerified: boolean;
  collectionCentresCount: number;
}

export interface DiscoveryResult {
  items: DiscoveryOfferingItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function discoverOfferingsApi(
  params: DiscoveryQueryParams
): Promise<DiscoveryResult> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.itemType && params.itemType !== 'ALL') qs.set('itemType', params.itemType);
  if (params.department && params.department !== 'ALL') qs.set('department', params.department);
  if (typeof params.maxPrice === 'number' && params.maxPrice > 0) {
    qs.set('maxPrice', String(params.maxPrice));
  }
  if (typeof params.maxTatHours === 'number' && params.maxTatHours > 0) {
    qs.set('maxTatHours', String(params.maxTatHours));
  }
  if (params.city) qs.set('city', params.city);
  if (params.sort) qs.set('sort', params.sort);
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params.offset === 'number') qs.set('offset', String(params.offset));

  const res = await callWorkflowApi<DiscoveryResult>(`/workflow/discovery?${qs.toString()}`);
  return res.data;
}

export async function upsertCatalogueItemApi(
  input: Partial<DiagnosticTestItem> & {
    code: string;
    name: string;
    b2bPriceInr: number;
    mrpInr: number;
    tatHours: number;
  }
): Promise<DiagnosticTestItem> {
  const res = await callWorkflowApi<DiagnosticTestItem>('/workflow/catalogue', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function adminApproveCatalogueApi(
  itemId: string,
  approvalStatus: 'APPROVED' | 'REJECTED',
  reason?: string
): Promise<DiagnosticTestItem> {
  const res = await callWorkflowApi<DiagnosticTestItem>(
    `/workflow/admin/catalogue/${encodeURIComponent(itemId)}/approval`,
    {
      method: 'POST',
      body: JSON.stringify({ approvalStatus, reason }),
    }
  );
  return res.data;
}

export async function listCollectionCentresApi(
  largeLabId: string
): Promise<CollectionCentreRecord[]> {
  const res = await callWorkflowApi<CollectionCentreRecord[]>(
    `/workflow/centres/${encodeURIComponent(largeLabId)}`
  );
  return res.data || [];
}

export async function saveCollectionCentreApi(
  input: Partial<CollectionCentreRecord> & {
    name: string;
    address: string;
    city: string;
    pincode: string;
    contactPersonName: string;
    contactPhone: string;
    operatingHours: string;
  }
): Promise<CollectionCentreRecord> {
  const res = await callWorkflowApi<CollectionCentreRecord>('/workflow/centres', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function transitionOrderProcessingStatusApi(
  orderId: string,
  nextStatus: OrderStatus,
  remarks?: string
): Promise<PickupOrder> {
  const res = await callWorkflowApi<PickupOrder>(
    `/workflow/orders/${encodeURIComponent(orderId)}/status`,
    {
      method: 'POST',
      body: JSON.stringify({ nextStatus, remarks }),
    }
  );
  return res.data;
}

export async function uploadTestOrCombinedReportApi(
  orderId: string,
  payload: {
    reportType: WorkflowReportType;
    coveredTestIds: string[];
    pathologistName: string;
    fileName: string;
    fileBase64: string;
    contentType?: string;
    remarks?: string;
    authorisationStatus?: 'PENDING_SIGN_OFF' | 'AUTHORISED';
  }
): Promise<{ report: DiagnosticReportRecord; order: PickupOrder }> {
  const res = await callWorkflowApi<{ report: DiagnosticReportRecord; order: PickupOrder }>(
    `/workflow/orders/${encodeURIComponent(orderId)}/reports`,
    {
      method: 'POST',
      body: JSON.stringify({
        reportType: payload.reportType === 'COMBINED' ? 'COMBINED' : 'INDIVIDUAL',
        coveredTestIds: payload.coveredTestIds,
        pathologistName: payload.pathologistName,
        authoriseNow: payload.authorisationStatus !== 'PENDING_SIGN_OFF',
        fileName: payload.fileName,
        mimeType: payload.contentType || 'application/pdf',
        base64Data: payload.fileBase64,
        remarks: payload.remarks,
      }),
    }
  );
  return res.data;
}

export async function getAuthorizedReportDownloadApi(
  reportId: string
): Promise<{ signedUrl?: string; dataUrl?: string; report: DiagnosticReportRecord }> {
  const res = await callWorkflowApi<{ signedUrl?: string; dataUrl?: string; report: DiagnosticReportRecord }>(
    `/workflow/reports/${encodeURIComponent(reportId)}/download`
  );
  return res.data;
}
