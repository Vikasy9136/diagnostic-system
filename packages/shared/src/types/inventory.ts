import { TubeType } from './specimen.js';

// ============================================================================
// LABSETU THREE-LEVEL BARCODE ARCHITECTURE
// ============================================================================

/**
 * Level 1: Supplier Barcode Reference (Manufacturer SKU / Outer Box code)
 */
export interface SupplierBarcodeMapping {
  id: string;
  supplierBarcode: string;
  itemId: string;
  itemSku: string;
  supplierId: string;
  supplierName: string;
  packageUnit: string; // e.g. "BOX_OF_100", "CARTON_OF_1000"
  unitsPerPackage: number; // e.g. 100
  verified: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Level 2: Individual Pre-Assembled Physical Kit Serial (LS-KIT-XXXXXX)
 */
export type KitSerialStatus =
  | 'READY'
  | 'RESERVED'
  | 'ISSUED'
  | 'IN_TRANSIT'
  | 'AVAILABLE_WITH_PHLEBO'
  | 'RESERVED_FOR_BOOKING'
  | 'OPENED'
  | 'IN_USE'
  | 'USED'
  | 'RETURN_PENDING_INSPECTION'
  | 'RETURNED'
  | 'DAMAGED'
  | 'EXPIRED'
  | 'BLOCKED';

export interface KitSerialRecord {
  id: string; // e.g. "LS-KIT-000125"
  kitSerial: string;
  barcode: string; // Code 128 / QR payload
  kitDefinitionId: string;
  kitCode: string; // e.g. "KIT-RTN-CBC"
  kitName: string;
  bomVersionId: string;
  bomVersion: number;
  assemblyId: string;
  assemblyBatch: string;
  assembledAt: string;
  expiryDate: string; // Earliest expiry of contained components
  currentStatus: KitSerialStatus;
  currentLocationType: 'CENTRAL_WAREHOUSE' | 'PHLEBOTOMIST' | 'BOOKING_SITE' | 'SCRAP';
  currentLocationId: string; // Warehouse ID or Phlebotomist UID
  assignedPhleboId?: string;
  assignedPhleboName?: string;
  reservedBookingId?: string;
  reservedAt?: string;
  openedAt?: string;
  usedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Level 3: Individual Tracked Specimen Tube Serial (LS-TUBE-XXXXXX)
 */
export type TubeSerialStatus =
  | 'SEALED_IN_KIT'
  | 'RESERVED_FOR_BOOKING'
  | 'SAMPLE_COLLECTED'
  | 'HANDED_OVER_TO_LAB'
  | 'RECEIVED_BY_LAB'
  | 'DISCARDED'
  | 'DAMAGED'
  | 'LOST';

export interface TubeSerialRecord {
  id: string; // e.g. "LS-TUBE-000001"
  tubeSerial: string;
  barcodeValue: string;
  supplierBarcodeRef?: string;
  itemId: string;
  sku: string;
  tubeType: TubeType;
  brand: string;
  supplierName: string;
  supplierBatch: string;
  mfgDate?: string;
  expiryDate: string;
  parentKitId: string; // LS-KIT-XXXXXX
  assemblyId: string;
  bomVersion: number;
  currentStatus: TubeSerialStatus;
  currentLocationType: 'WAREHOUSE' | 'PHLEBO' | 'PATIENT_SITE' | 'TESTING_LAB' | 'DISPOSED';
  currentLocationId: string;
  bookingId?: string;
  orderNumber?: string;
  collectedAt?: string;
  collectionOperatorId?: string;
  temperatureCelsius?: number;
  sampleProofPhotoUrl?: string;
  handedOverAt?: string;
  handoverOperatorId?: string;
  receivedByLabAt?: string;
  receivingLabId?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

// ============================================================================
// INVENTORY MASTER, SUPPLIERS & WAREHOUSE
// ============================================================================

export type InventoryMaterialCategory =
  | 'VACUTAINER'
  | 'NEEDLE'
  | 'ACCESSORY'
  | 'LABEL_STICKER'
  | 'PACKAGING'
  | 'EQUIPMENT'
  | 'REAGENT';

export type InventoryBaseUnit =
  | 'PIECE'
  | 'PAIR'
  | 'ROLL'
  | 'SWAB'
  | 'VIAL'
  | 'UNIT'
  | 'ML';

export type InventoryPackageUnit =
  | 'BOX'
  | 'PACK'
  | 'CARTON'
  | 'ROLL'
  | 'STRIP'
  | 'CASE';

export interface InventoryItemMaster {
  id: string;
  name: string;
  sku: string;
  category: InventoryMaterialCategory;
  description?: string;
  manufacturer: string;
  tubeType?: TubeType;
  baseUnit: InventoryBaseUnit;
  purchasePackageUnit: InventoryPackageUnit;
  unitsPerPackage: number; // e.g. 1 Box = 100 Pieces
  supplierBarcodeMappings: string[];
  internalItemBarcode: string;
  minimumStock: number;
  reorderLevel: number;
  batchTracking: boolean;
  expiryTracking: boolean;
  storageInstructions?: string;
  iconEmoji: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierRecord {
  id: string;
  name: string;
  gstin?: string;
  contactPerson?: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  leadTimeDays: number;
  paymentTermsDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseRecord {
  id: string;
  code: string;
  name: string;
  isPrimary: boolean;
  address: string;
  city: string;
  state: string;
  pincode: string;
  managerUid?: string;
  managerName?: string;
  managerPhone?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseLocationRecord {
  id: string;
  warehouseId: string;
  code: string; // e.g. "RACK-1-SHELF-A"
  zone: string;
  capacityUnits: number;
  description?: string;
  isActive: boolean;
}

export interface StockBalanceRecord {
  id: string; // BAL-${warehouseId}-${itemId}
  warehouseId: string;
  itemId: string;
  itemSku: string;
  category: InventoryMaterialCategory;
  totalOnHand: number;
  totalAllocatedInKits: number;
  totalAvailableLoose: number;
  totalReserved: number;
  unit: InventoryBaseUnit;
  lastUpdated: string;
}

// ============================================================================
// BATCHES & STOCK LEDGER
// ============================================================================

export type BatchStatus = 'ACTIVE' | 'EXPIRED' | 'BLOCKED' | 'DEPLETED';

export interface StockBatchRecord {
  id: string;
  itemId: string;
  itemSku: string;
  supplierId: string;
  supplierName: string;
  batchNumber: string;
  mfgDate?: string;
  expiryDate: string;
  initialQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  consumedQuantity: number;
  warehouseId: string;
  locationId?: string;
  unitCostInr: number;
  status: BatchStatus;
  receivedAt: string;
  updatedAt: string;
}

export type StockTransactionType =
  | 'INWARD_RECEIPT'
  | 'KIT_ASSEMBLY_DEDUCTION'
  | 'KIT_DISPATCH'
  | 'PHLEBO_PEER_TRANSFER'
  | 'BOOKING_RESERVATION'
  | 'BOOKING_CONSUMPTION'
  | 'RETURN_RESTOCK'
  | 'DAMAGE_WRITEOFF'
  | 'EXPIRED_WRITEOFF'
  | 'MANUAL_ADJUSTMENT';

export interface StockTransactionRecord {
  id: string;
  transactionType: StockTransactionType;
  itemId: string;
  itemSku: string;
  batchId?: string;
  batchNumber?: string;
  quantityDelta: number; // Positive for increase, negative for deduction
  balanceAfter: number;
  sourceLocation: string;
  destinationLocation: string;
  referenceId: string; // PO ID, Inward ID, Kit Assembly ID, Booking ID, etc.
  notes?: string;
  actorUid: string;
  actorEmail: string;
  timestamp: string;
}

// ============================================================================
// STOCK INWARD
// ============================================================================

export type StockInwardStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface StockInwardItem {
  itemId: string;
  itemName: string;
  sku: string;
  category: InventoryMaterialCategory;
  scannedSupplierBarcode?: string;
  packageUnit: InventoryPackageUnit;
  packageQuantity: number;
  unitsPerPackage: number;
  totalBaseQuantity: number;
  baseUnit: InventoryBaseUnit;
  batchNumber: string;
  mfgDate?: string;
  expiryDate: string;
  unitCostInr: number;
  totalCostInr: number;
  warehouseLocationId?: string;
}

export interface StockInwardRecord {
  id: string;
  inwardNumber: string;
  supplierId: string;
  supplierName: string;
  poNumber?: string;
  invoiceNumber?: string;
  status: StockInwardStatus;
  items: StockInwardItem[];
  totalPackages: number;
  totalBaseUnits: number;
  totalAmountInr: number;
  warehouseId: string;
  submittedByUid: string;
  submittedByEmail: string;
  approvedByUid?: string;
  approvedByEmail?: string;
  approvedAt?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// KIT MASTER, BOM & ASSEMBLY
// ============================================================================

export interface KitBOMComponent {
  itemId: string;
  itemName: string;
  sku: string;
  category: InventoryMaterialCategory;
  tubeType?: TubeType;
  quantity: number;
  unit: InventoryBaseUnit;
  isIndividuallySerialized: boolean; // true for tubes, false for gloves/swabs
}

export interface KitDefinitionMaster {
  id: string;
  kitCode: string;
  name: string;
  category: string;
  description: string;
  targetTestCodes: string[];
  activeBOMVersion: number;
  estimatedCostPerKitInr: number;
  iconEmoji: string;
  colorBadge: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KitBOMVersionRecord {
  id: string;
  kitDefinitionId: string;
  version: number;
  components: KitBOMComponent[];
  approvedByUid: string;
  approvedByEmail: string;
  approvedAt: string;
  isActive: boolean;
  notes?: string;
}

export interface KitAssemblyBatchAllocation {
  itemId: string;
  batchId: string;
  batchNumber: string;
  quantityDeducted: number;
  expiryDate: string;
}

export interface KitAssemblyRecord {
  id: string;
  assemblyCode: string;
  kitDefinitionId: string;
  kitCode: string;
  kitName: string;
  bomVersionId: string;
  bomVersion: number;
  plannedQuantity: number;
  assembledQuantity: number;
  allocatedBatches: KitAssemblyBatchAllocation[];
  generatedKitSerials: string[]; // LS-KIT-XXXXXX
  totalTubesSerialized: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  earliestComponentExpiry: string;
  warehouseId: string;
  assembledByUid: string;
  assembledByEmail: string;
  assembledAt: string;
  notes?: string;
}

export interface KitComponentMappingRecord {
  id: string;
  kitSerial: string;
  itemId: string;
  tubeSerial?: string; // Present if individually serialized
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  status: 'INTACT' | 'CONSUMED' | 'DAMAGED' | 'RETURNED';
}

// ============================================================================
// KIT ISSUANCE, PEER TRANSFERS & PHLEBO INVENTORY
// ============================================================================

export interface KitIssueRecord {
  id: string;
  issueNumber: string;
  phlebotomistId: string;
  phlebotomistName: string;
  phlebotomistPhone?: string;
  kitSerials: string[];
  totalKits: number;
  warehouseId: string;
  issuedByUid: string;
  issuedByEmail: string;
  issuedAt: string;
  status: 'DISPATCHED' | 'RECEIVED_BY_PHLEBO';
  notes?: string;
}

export type KitTransferStatus =
  | 'PENDING_ACCEPTANCE'
  | 'IN_TRANSIT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface KitTransferRecord {
  id: string;
  transferNumber: string;
  senderPhleboId: string;
  senderPhleboName: string;
  senderPhleboPhone?: string;
  receiverPhleboId: string;
  receiverPhleboName: string;
  receiverPhleboPhone?: string;
  kitSerials: string[];
  totalKits: number;
  status: KitTransferStatus;
  transferReason: string;
  initiatedAt: string;
  respondedAt?: string;
  rejectionReason?: string;
  expiresAt: string;
}

export interface KitReturnRecord {
  id: string;
  returnNumber: string;
  phlebotomistId: string;
  phlebotomistName: string;
  kitSerials: string[];
  returnReason: 'SURPLUS' | 'DAMAGED' | 'EXPIRED' | 'SEAL_BROKEN';
  warehouseInspectorUid?: string;
  warehouseInspectorEmail?: string;
  inspectionStatus: 'PENDING_INSPECTION' | 'RESTOCKED' | 'SCRAPPED';
  inspectedAt?: string;
  notes?: string;
  createdAt: string;
}

export interface PhleboInventorySummary {
  id: string; // PHLINV-${phleboId}
  phlebotomistId: string;
  availableKitsCount: number;
  reservedKitsCount: number;
  usedKitsCount: number;
  kitSerialsOnHand: string[];
  lastSyncedAt: string;
}

// ============================================================================
// BOOKING USAGE, TUBE SCANNING & CUSTODY
// ============================================================================

export interface BookingKitUsageRecord {
  id: string;
  bookingId: string;
  orderNumber: string;
  phlebotomistId: string;
  kitSerial: string; // LS-KIT-XXXXXX
  openedAt: string;
  completedAt?: string;
  status: 'RESERVED' | 'OPENED' | 'COMPLETED' | 'CANCELLED';
  usedTubeSerials: string[];
  unusedTubeSerials: string[];
  damagedTubeSerials: string[];
  notes?: string;
}

export interface TubeScanEventRecord {
  id: string;
  bookingId: string;
  orderNumber: string;
  kitSerial: string;
  tubeSerial: string;
  expectedTubeType: TubeType;
  scannedTubeType?: TubeType;
  validationStatus: 'VALID' | 'MISMATCH' | 'DUPLICATE' | 'FOREIGN_KIT' | 'EXPIRED';
  validationMessage: string;
  phlebotomistId: string;
  scannedAt: string;
}

export interface TubeCollectionProofRecord {
  id: string;
  bookingId: string;
  orderNumber: string;
  tubeSerial: string;
  tubeType: TubeType;
  phlebotomistId: string;
  temperatureCelsius: number;
  photoUrl?: string;
  collectedAt: string;
}

export interface TubeHandoverRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  targetLabId: string;
  targetLabName: string;
  phlebotomistId: string;
  tubeSerials: string[];
  handoverOtpVerified: boolean;
  receivingOperatorName: string;
  arrivalTemperatureCelsius: number;
  handedOverAt: string;
}

// ============================================================================
// MOBILE-TO-DESKTOP REMOTE SCANNER SYSTEM
// ============================================================================

export type ScannerSessionStatus =
  | 'NOT_CONNECTED'
  | 'WAITING_FOR_MOBILE'
  | 'MOBILE_CONNECTED'
  | 'SCANNER_ACTIVE'
  | 'PAUSED'
  | 'SCAN_RECEIVED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'ERROR';

export type ScannerContext =
  | 'STOCK_INWARD'
  | 'KIT_ASSEMBLY'
  | 'KIT_ISSUE'
  | 'WAREHOUSE_AUDIT'
  | 'BOOKING_SAMPLE_SCAN';

export interface ScannerPairingSession {
  id: string;
  sessionToken: string; // Cryptographic opaque token
  desktopClientName: string;
  adminUid: string;
  adminEmail: string;
  activeContext: ScannerContext;
  status: ScannerSessionStatus;
  pairedDeviceId?: string;
  pairedDeviceName?: string;
  pairedUserUid?: string;
  pairedUserEmail?: string;
  lastScannedBarcode?: string;
  scanCount: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScannerScanEvent {
  id: string;
  sessionId: string;
  barcode: string;
  symbology: 'CODE_128' | 'QR_CODE' | 'DATA_MATRIX' | 'EAN_13' | 'UPC_A' | 'OTHER';
  scannedAt: string;
  devicePlatform: 'ANDROID' | 'IOS' | 'WEB';
  processed: boolean;
  resolvedItem?: {
    id: string;
    name: string;
    sku: string;
    category: string;
    packageUnit?: string;
    unitsPerPackage?: number;
    kitCode?: string;
    tubeType?: string;
  };
  error?: string;
}

// ============================================================================
// AUDIT & ADJUSTMENTS
// ============================================================================

export interface StockAdjustmentRecord {
  id: string;
  adjustmentNumber: string;
  warehouseId: string;
  itemId: string;
  itemSku: string;
  batchId?: string;
  adjustmentType: 'COUNT_RECONCILIATION' | 'DAMAGE' | 'LOSS' | 'EXPIRY' | 'SAMPLE_TESTING';
  quantityDelta: number;
  reason: string;
  authorizedByUid: string;
  authorizedByEmail: string;
  timestamp: string;
}

export interface InventoryAuditLogRecord {
  id: string;
  action:
    | 'ITEM_CREATED'
    | 'SUPPLIER_MAPPED'
    | 'INWARD_APPROVED'
    | 'KIT_ASSEMBLED'
    | 'KITS_DISPATCHED'
    | 'TRANSFER_INITIATED'
    | 'TRANSFER_ACCEPTED'
    | 'KIT_OPENED'
    | 'TUBE_SCANNED'
    | 'SAMPLE_HANDED_OVER'
    | 'STOCK_ADJUSTED';
  resourceType:
    | 'INVENTORY_ITEM'
    | 'STOCK_INWARD'
    | 'KIT_SERIAL'
    | 'TUBE_SERIAL'
    | 'KIT_TRANSFER'
    | 'SCANNER_SESSION';
  resourceId: string;
  actorUid: string;
  actorEmail: string;
  summary: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}
