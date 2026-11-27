import {
  type InventoryItemMaster,
  type KitAssemblyRecord,
  type KitBOMVersionRecord,
  type KitDefinitionMaster,
  type KitSerialRecord,
  type StockBatchRecord,
  type StockInwardRecord,
  type StockTransactionRecord,
  type SupplierBarcodeMapping,
  type SupplierRecord,
  type TubeSerialRecord,
  type WarehouseRecord,
} from '@diagnostic/shared';
import { API_BASE_URL, auth } from '../firebase';

export interface BarcodeResolutionResult {
  found: boolean;
  type: 'SUPPLIER_MAPPING' | 'INTERNAL_ITEM' | 'NONE';
  barcode: string;
  mapping?: SupplierBarcodeMapping;
  item?: InventoryItemMaster;
  packageUnit?: string;
  multiplierToBaseUnit: number;
  baseUnit?: string;
}

export interface InwardSubmitPayload {
  supplierId: string;
  poNumber?: string;
  invoiceNumber?: string;
  warehouseId?: string;
  items: {
    itemId: string;
    scannedSupplierBarcode?: string;
    packageUnit: string;
    packageQuantity: number;
    unitsPerPackage: number;
    batchNumber: string;
    mfgDate?: string;
    expiryDate: string;
    unitCostInr: number;
    warehouseLocationId?: string;
  }[];
  notes?: string;
}

function getInventoryApiBase(): string {
  const base = (API_BASE_URL || '/api/v1').replace(/\/+$/, '');
  return base.endsWith('/api/v1') ? base : `${base}/api/v1`;
}

// Scanner bridge sessions are shared between Desktop (even on localhost) and Mobile Camera
// (which opens https://labsetu-diagnostics.web.app/mobile-scanner for HTTPS camera permissions),
// so scanner-bridge calls always target the Cloud Functions Firestore backend unless already on it.
const CLOUD_SCANNER_API_BASE =
  'https://us-central1-labsetu-diagnostics.cloudfunctions.net/api/api/v1';

function getScannerBridgeApiBase(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'labsetu-diagnostics.web.app' || host === 'labsetu-diagnostics.firebaseapp.com') {
      return '/api/v1';
    }
    if (host === 'localhost' || host === '127.0.0.1') {
      return CLOUD_SCANNER_API_BASE;
    }
  }
  return getInventoryApiBase();
}

async function getAuthHeader(): Promise<HeadersInit> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    // Development fallback
    headers['x-mock-role'] = 'ADMIN';
    headers['x-mock-email'] = 'lab.setu.admin@gmail.com';
  }
  return headers;
}

export async function fetchInventoryItems(params?: { category?: string; search?: string }): Promise<InventoryItemMaster[]> {
  const query = new URLSearchParams();
  if (params?.category) query.append('category', params.category);
  if (params?.search) query.append('search', params.search);
  const qStr = query.toString() ? `?${query.toString()}` : '';

  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/items${qStr}`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch inventory items: ${res.statusText}`);
  const json = await res.json();
  return json.items || [];
}

export async function createInventoryItemApi(
  payload: Omit<InventoryItemMaster, 'id' | 'createdAt' | 'updatedAt'>
): Promise<InventoryItemMaster> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/items`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed creating inventory item: ${res.statusText}`);
  }
  const json = await res.json();
  return json.item;
}

export async function fetchInventorySuppliers(): Promise<SupplierRecord[]> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/suppliers`, { headers });
  if (!res.ok) throw new Error(`Failed fetching suppliers: ${res.statusText}`);
  const json = await res.json();
  return json.suppliers || [];
}

export async function createInventorySupplierApi(
  payload: Omit<SupplierRecord, 'id' | 'createdAt' | 'updatedAt'>
): Promise<SupplierRecord> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/suppliers`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed creating supplier: ${res.statusText}`);
  }
  const json = await res.json();
  return json.supplier;
}

export async function fetchSupplierBarcodeMappings(itemId?: string): Promise<SupplierBarcodeMapping[]> {
  const qStr = itemId ? `?itemId=${encodeURIComponent(itemId)}` : '';
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/mappings${qStr}`, { headers });
  if (!res.ok) throw new Error(`Failed fetching mappings: ${res.statusText}`);
  const json = await res.json();
  return json.mappings || [];
}

export async function createSupplierBarcodeMappingApi(
  payload: Omit<SupplierBarcodeMapping, 'id' | 'createdAt' | 'updatedAt'>
): Promise<SupplierBarcodeMapping> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/mappings`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed creating mapping: ${res.statusText}`);
  }
  const json = await res.json();
  return json.mapping;
}

export async function resolveSupplierBarcodeApi(barcode: string): Promise<BarcodeResolutionResult> {
  const headers = await getAuthHeader();
  const clean = encodeURIComponent(barcode.trim());
  const res = await fetch(`${getInventoryApiBase()}/inventory/resolve-barcode/${clean}`, { headers });
  if (!res.ok) throw new Error(`Failed resolving barcode: ${res.statusText}`);
  return await res.json();
}

export async function submitStockInwardApi(payload: InwardSubmitPayload): Promise<{
  success: boolean;
  inwardRecord: StockInwardRecord;
  batches: StockBatchRecord[];
  transactions: StockTransactionRecord[];
}> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/inward`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed processing stock inward: ${res.statusText}`);
  }
  return await res.json();
}

export async function fetchStockBatches(itemId?: string): Promise<StockBatchRecord[]> {
  const qStr = itemId ? `?itemId=${encodeURIComponent(itemId)}` : '';
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/batches${qStr}`, { headers });
  if (!res.ok) throw new Error(`Failed fetching batches: ${res.statusText}`);
  const json = await res.json();
  return json.batches || [];
}

export async function fetchStockInwardHistory(): Promise<StockInwardRecord[]> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/inward-history`, { headers });
  if (!res.ok) throw new Error(`Failed fetching inward history: ${res.statusText}`);
  const json = await res.json();
  return json.history || [];
}

export async function fetchStockTransactions(): Promise<StockTransactionRecord[]> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/transactions`, { headers });
  if (!res.ok) throw new Error(`Failed fetching transactions: ${res.statusText}`);
  const json = await res.json();
  return json.transactions || [];
}

export async function fetchCentralWarehouses(): Promise<WarehouseRecord[]> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/warehouses`, { headers });
  if (!res.ok) throw new Error(`Failed fetching warehouses: ${res.statusText}`);
  const json = await res.json();
  return json.warehouses || [];
}

// ---------------------------------------------------------------------------
// Kit Master & Assembly Functions
// ---------------------------------------------------------------------------

export async function fetchKitDefinitions(): Promise<KitDefinitionMaster[]> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/kits`, { headers });
  if (!res.ok) throw new Error(`Failed fetching kit definitions: ${res.statusText}`);
  const json = await res.json();
  return json.kits || [];
}

export async function fetchKitBom(kitDefinitionId: string): Promise<KitBOMVersionRecord> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/kits/${encodeURIComponent(kitDefinitionId)}/bom`, { headers });
  if (!res.ok) throw new Error(`Failed fetching kit BOM: ${res.statusText}`);
  const json = await res.json();
  return json.bom;
}

export interface AssemblyValidationResponse {
  feasible: boolean;
  kitDefinitionId: string;
  kitCode: string;
  kitName: string;
  quantityToAssemble: number;
  components: Array<{
    itemId: string;
    itemName: string;
    sku: string;
    requiredPerKit: number;
    totalRequired: number;
    availableLooseStock: number;
    deficit: number;
    hasSufficientStock: boolean;
  }>;
  estimatedCostPerKitInr: number;
  estimatedTotalBatchCostInr: number;
  unmetRequirementsCount: number;
}

export async function validateKitAssemblyFeasibilityApi(
  kitDefinitionId: string,
  quantityToAssemble: number,
  warehouseId = 'WH-CENTRAL-MAIN'
): Promise<AssemblyValidationResponse> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/kits/validate-assembly`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kitDefinitionId, quantityToAssemble, warehouseId }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed validating assembly feasibility: ${res.statusText}`);
  }
  return await res.json();
}

export async function executeKitAssemblyApi(payload: {
  kitDefinitionId: string;
  quantityToAssemble: number;
  warehouseId?: string;
  notes?: string;
}): Promise<{
  success: boolean;
  assemblyRecord: KitAssemblyRecord;
  allocatedBatches: any[];
  transactions: StockTransactionRecord[];
}> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/kits/assemble`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed executing kit assembly: ${res.statusText}`);
  }
  return await res.json();
}

export async function fetchKitAssembliesHistory(): Promise<KitAssemblyRecord[]> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/kit-assemblies`, { headers });
  if (!res.ok) throw new Error(`Failed fetching kit assemblies history: ${res.statusText}`);
  const json = await res.json();
  return json.assemblies || [];
}

export interface UniversalBarcodeLookupResponse {
  success: boolean;
  level: 'LEVEL_1_SUPPLIER' | 'LEVEL_2_KIT' | 'LEVEL_3_TUBE' | 'UNKNOWN';
  barcode: string;
  identified: boolean;
  supplierProduct?: any;
  kitRecord?: KitSerialRecord;
  kitChildTubes?: TubeSerialRecord[];
  tubeRecord?: TubeSerialRecord;
  parentKitRecord?: KitSerialRecord;
  message: string;
}

export async function fetchKitSerials(params?: {
  status?: string;
  kitCode?: string;
  assignedPhleboId?: string;
  limit?: number;
}): Promise<KitSerialRecord[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.kitCode) q.set('kitCode', params.kitCode);
  if (params?.assignedPhleboId) q.set('assignedPhleboId', params.assignedPhleboId);
  if (params?.limit) q.set('limit', String(params.limit));

  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/serials/kits?${q.toString()}`, { headers });
  if (!res.ok) throw new Error(`Failed fetching kit serials: ${res.statusText}`);
  const json = await res.json();
  return json.kits || [];
}

export async function fetchKitSerialWithTubes(kitSerial: string): Promise<{
  kit: KitSerialRecord;
  tubes: TubeSerialRecord[];
}> {
  const headers = await getAuthHeader();
  const clean = encodeURIComponent(kitSerial.trim());
  const res = await fetch(`${getInventoryApiBase()}/inventory/serials/kits/${clean}`, { headers });
  if (!res.ok) throw new Error(`Failed fetching kit serial ${kitSerial}: ${res.statusText}`);
  return await res.json();
}

export async function fetchTubeSerials(params?: {
  parentKitId?: string;
  status?: string;
  tubeType?: string;
  limit?: number;
}): Promise<TubeSerialRecord[]> {
  const q = new URLSearchParams();
  if (params?.parentKitId) q.set('parentKitId', params.parentKitId);
  if (params?.status) q.set('status', params.status);
  if (params?.tubeType) q.set('tubeType', params.tubeType);
  if (params?.limit) q.set('limit', String(params.limit));

  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/serials/tubes?${q.toString()}`, { headers });
  if (!res.ok) throw new Error(`Failed fetching tube serials: ${res.statusText}`);
  const json = await res.json();
  return json.tubes || [];
}

export async function resolveBarcodeIdentityApi(barcode: string): Promise<UniversalBarcodeLookupResponse> {
  const headers = await getAuthHeader();
  const clean = encodeURIComponent(barcode.trim());
  const res = await fetch(`${getInventoryApiBase()}/inventory/serials/resolve/${clean}`, { headers });
  if (!res.ok) throw new Error(`Failed resolving barcode: ${res.statusText}`);
  return await res.json();
}

// ---------------------------------------------------------------------------
// Kit Dispatch & Courier Custody
// ---------------------------------------------------------------------------

export async function dispatchKitsToPhleboApi(payload: {
  phlebotomistId: string;
  phlebotomistName: string;
  phlebotomistPhone?: string;
  kitSerials: string[];
  notes?: string;
}): Promise<{ success: boolean; issue: any; message: string }> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/issues/dispatch`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Kit dispatch failed: ${res.statusText}`);
  }
  return await res.json();
}

export async function fetchPhleboStockApi(phleboId: string): Promise<{
  phlebotomistId: string;
  totalKits: number;
  availableKits: KitSerialRecord[];
  inTransitKits: KitSerialRecord[];
  consumedKits: KitSerialRecord[];
}> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/phlebo-stock/${encodeURIComponent(phleboId)}`, { headers });
  if (!res.ok) throw new Error(`Failed fetching phlebo stock: ${res.statusText}`);
  return await res.json();
}

// ---------------------------------------------------------------------------
// Dashboard Valuation & Double-Entry Ledger
// ---------------------------------------------------------------------------

export interface InventoryDashboardSummaryDto {
  success: boolean;
  valuation: {
    totalStockValuationInr: number;
    totalActiveSkus: number;
    totalStockUnits: number;
  };
  kits: {
    totalAssembled: number;
    warehouseKits: number;
    inTransitKits: number;
    availableWithPhleboKits: number;
    consumedKits: number;
  };
  tubes: {
    totalSerialized: number;
    withWarehouse: number;
    withPhlebo: number;
    collectedOrDelivered: number;
  };
  alerts: {
    lowStockItems: Array<{
      id: string;
      name: string;
      sku: string;
      currentStock: number;
      reorderLevel: number;
      unit: string;
    }>;
    expiringBatches: Array<{
      batchNumber: string;
      itemId: string;
      sku: string;
      expiryDate: string;
      daysUntilExpiry: number;
      currentQuantity: number;
      isExpired: boolean;
    }>;
  };
  recentTransactions: StockTransactionRecord[];
}

export async function fetchInventoryDashboardSummaryApi(): Promise<InventoryDashboardSummaryDto> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/dashboard-summary`, { headers });
  if (!res.ok) throw new Error(`Failed fetching inventory dashboard summary: ${res.statusText}`);
  return await res.json();
}

export async function fetchStockLedgerApi(filter?: {
  itemId?: string;
  batchNumber?: string;
  transactionType?: string;
  limit?: number;
}): Promise<StockTransactionRecord[]> {
  const q = new URLSearchParams();
  if (filter?.itemId) q.set('itemId', filter.itemId);
  if (filter?.batchNumber) q.set('batchNumber', filter.batchNumber);
  if (filter?.transactionType) q.set('transactionType', filter.transactionType);
  if (filter?.limit) q.set('limit', String(filter.limit));

  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/stock-ledger?${q.toString()}`, { headers });
  if (!res.ok) throw new Error(`Failed fetching stock ledger: ${res.statusText}`);
  const json = await res.json();
  return json.ledger || [];
}

// ---------------------------------------------------------------------------
// Stock Adjustments & Damage Write-Offs
// ---------------------------------------------------------------------------

export async function createStockAdjustmentApi(payload: {
  itemId: string;
  batchNumber: string;
  quantityDelta: number;
  adjustmentType: 'COUNT_RECONCILIATION' | 'DAMAGE' | 'LOSS' | 'EXPIRY' | 'SAMPLE_TESTING';
  reason?: string;
  notes?: string;
}): Promise<{ success: boolean; message: string; updatedStock: number }> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/adjustments`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Stock adjustment failed: ${res.statusText}`);
  }
  return await res.json();
}

export async function fetchStockAdjustmentsApi(params?: {
  itemId?: string;
  limit?: number;
}): Promise<any[]> {
  const q = new URLSearchParams();
  if (params?.itemId) q.set('itemId', params.itemId);
  if (params?.limit) q.set('limit', String(params.limit));

  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/adjustments?${q.toString()}`, { headers });
  if (!res.ok) throw new Error(`Failed fetching stock adjustments: ${res.statusText}`);
  const json = await res.json();
  return json.adjustments || [];
}

// ---------------------------------------------------------------------------
// Mobile-to-Desktop Remote Scanner Bridge
// ---------------------------------------------------------------------------

export type ScannerMode = 'ONE_SCAN' | 'MULTI_SCAN';

export interface ScannerBridgeEventRecord {
  id: string;
  eventId: string;
  sessionId: string;
  barcode: string;
  barcodeType:
    | 'SKU_BARCODE'
    | 'SUPPLIER_BARCODE'
    | 'KIT_BARCODE'
    | 'SERIALIZED_TUBE_BARCODE'
    | 'BATCH_BARCODE'
    | 'UNKNOWN';
  symbology?: string;
  status: 'MATCHED' | 'UNKNOWN_BARCODE' | 'MAPPED';
  recordStatus: 'RECORDED';
  itemId: string | null;
  itemName: string | null;
  sku: string | null;
  kitId: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  warehouseLocation: string | null;
  scannedAt: string;
  acknowledgedAt?: string;
  pairedDeviceId?: string | null;
  pairedDeviceName?: string;
  operatorEmail?: string | null;
  context?: string;
  metadata?: Record<string, unknown>;
}

export async function createScannerBridgeSessionApi(options?: {
  mode?: ScannerMode;
  context?: string;
  warehouseId?: string;
}): Promise<{
  sessionId: string;
  pairingToken: string;
  status: string;
  mode: ScannerMode;
  expiresAt: string;
  lanIp?: string;
}> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getScannerBridgeApiBase()}/inventory/scanner-bridge/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options || {}),
  });
  if (!res.ok) throw new Error(`Failed creating scanner session: ${res.statusText}`);
  const json = await res.json();
  return json.session;
}

export async function pairMobileScannerApi(
  sessionId: string,
  payload: {
    pairingToken: string;
    deviceId: string;
    deviceName?: string;
  }
): Promise<any> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getScannerBridgeApiBase()}/inventory/scanner-bridge/${encodeURIComponent(sessionId)}/pair`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e: any = new Error(err?.error?.message || err?.error || `Pairing failed: ${res.statusText}`);
    e.statusCode = res.status;
    e.code = err?.error?.code || err?.code;
    throw e;
  }
  return await res.json();
}

export async function pushScannedBarcodeApi(
  sessionId: string,
  payload: {
    pairingToken: string;
    eventId: string;
    barcode: string;
    symbology?: string;
    deviceId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{
  success: boolean;
  duplicate?: boolean;
  alreadyProcessed?: boolean;
  sessionMode?: ScannerMode;
  event?: ScannerBridgeEventRecord;
  barcode?: string;
}> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getScannerBridgeApiBase()}/inventory/scanner-bridge/${encodeURIComponent(sessionId)}/scan`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e: any = new Error(err?.error?.message || err?.error || `Push scan failed: ${res.statusText}`);
    e.statusCode = res.status;
    e.code = err?.error?.code || err?.code;
    throw e;
  }
  return await res.json();
}

export async function fetchScannerBridgeEventsApi(
  sessionId: string,
  sinceIndex?: number
): Promise<{
  sessionId: string;
  status: 'WAITING_FOR_DEVICE' | 'CONNECTED' | 'CLOSED' | 'EXPIRED';
  mode?: ScannerMode;
  expiresAt?: string;
  pairedDeviceName?: string;
  events: ScannerBridgeEventRecord[];
  totalCount: number;
}> {
  const q = sinceIndex !== undefined ? `?since=${sinceIndex}` : '';
  const headers = await getAuthHeader();
  const res = await fetch(`${getScannerBridgeApiBase()}/inventory/scanner-bridge/${encodeURIComponent(sessionId)}/events${q}`, {
    headers,
  });
  if (!res.ok) throw new Error(`Failed fetching scanner events: ${res.statusText}`);
  return await res.json();
}

export async function closeScannerBridgeSessionApi(sessionId: string): Promise<void> {
  const headers = await getAuthHeader();
  await fetch(`${getScannerBridgeApiBase()}/inventory/scanner-bridge/${encodeURIComponent(sessionId)}/close`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
}

export async function updateScannerBridgeModeApi(sessionId: string, mode: ScannerMode): Promise<void> {
  const headers = await getAuthHeader();
  await fetch(`${getScannerBridgeApiBase()}/inventory/scanner-bridge/${encodeURIComponent(sessionId)}/mode`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ mode }),
  });
}

export async function fetchRecentScannerEventsApi(): Promise<ScannerBridgeEventRecord[]> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getScannerBridgeApiBase()}/inventory/scanner-bridge/events/recent`, { headers });
  if (!res.ok) return [];
  const json = await res.json();
  return json.events || [];
}

export async function mapUnknownScannerEventApi(
  eventId: string,
  payload: { itemId: string; itemName?: string; sku?: string; saveMapping?: boolean }
): Promise<any> {
  const headers = await getAuthHeader();
  const res = await fetch(
    `${getScannerBridgeApiBase()}/inventory/scanner-bridge/events/${encodeURIComponent(eventId)}/map`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || err?.error || 'Failed mapping barcode');
  }
  return await res.json();
}

// ---------------------------------------------------------------------------
// Dynamic Enterprise Feature Activation Settings
// ---------------------------------------------------------------------------

export interface InventorySettingsRecord {
  enterpriseKitInventoryActive: boolean;
  activatedAt?: string;
  activatedByEmail?: string;
  enforceKitScanOnCollection?: boolean;
}

export async function fetchInventorySettingsApi(): Promise<InventorySettingsRecord> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`${getInventoryApiBase()}/inventory/settings`, { headers });
    if (res.ok) {
      const data = await res.json();
      return data.settings || { enterpriseKitInventoryActive: false };
    }
  } catch (err) {
    // fallback
  }
  return { enterpriseKitInventoryActive: false };
}

export async function updateInventorySettingsApi(
  settings: Partial<InventorySettingsRecord>
): Promise<InventorySettingsRecord> {
  const headers = await getAuthHeader();
  const res = await fetch(`${getInventoryApiBase()}/inventory/settings`, {
    method: 'POST',
    headers,
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed updating inventory activation settings');
  }
  const data = await res.json();
  return data.settings;
}


