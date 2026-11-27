export type PayoutProviderArchitecture = 'RAZORPAY_ROUTE' | 'RAZORPAYX' | 'NONE';

export type PayoutEligibilityTrigger = 'AFTER_HANDOVER' | 'AFTER_REPORT_COMPLETION';

export type PayoutLifecycleStatus =
  | 'NOT_ELIGIBLE'
  | 'PENDING'
  | 'ON_HOLD'
  | 'READY_FOR_PAYOUT'
  | 'PROCESSING'
  | 'INITIATED'
  | 'PROCESSED'
  | 'SETTLED'
  | 'FAILED'
  | 'REVERSED'
  | 'NEEDS_REVIEW';

export type PayoutErrorCode =
  | 'BANK_DETAILS_NOT_ADDED'
  | 'BANK_DETAILS_NOT_VERIFIED'
  | 'IFSC_INVALID'
  | 'BENEFICIARY_NOT_ACTIVE'
  | 'LINKED_ACCOUNT_NOT_ACTIVATED'
  | 'RAZORPAY_ROUTE_NOT_ENABLED'
  | 'RAZORPAYX_NOT_ENABLED'
  | 'INSUFFICIENT_BALANCE'
  | 'TRANSFER_REJECTED'
  | 'PAYOUT_FAILED'
  | 'WEBHOOK_NOT_RECEIVED'
  | 'DUPLICATE_PAYOUT_PREVENTED'
  | 'PAYMENT_NOT_CAPTURED'
  | 'BOOKING_NOT_ELIGIBLE'
  | 'PAYOUT_ON_HOLD'
  | 'PROVIDER_TIMEOUT'
  | 'UNKNOWN_PROVIDER_ERROR';

export type BankVerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'FAILED'
  | 'REVERIFICATION_REQUIRED';

export interface BankDirectoryEntry {
  code: string;
  name: string;
  shortName: string;
  ifscPrefix: string;
  popular: boolean;
  accentColor: string;
  upiSupported: boolean;
  impsSupported: boolean;
  neftSupported: boolean;
}

export interface IfscLookupResult {
  valid: boolean;
  ifsc: string;
  bank: string;
  bankCode: string;
  branch: string;
  address: string;
  city: string;
  district: string;
  state: string;
  micr?: string;
  imps: boolean;
  neft: boolean;
  rtgs: boolean;
  upi: boolean;
}

export interface PhleboBankAccountMasked {
  id: string;
  phleboId: string;
  bankCode: string;
  bankName: string;
  branchName: string;
  branchAddress?: string;
  branchCity?: string;
  branchState?: string;
  ifsc: string;
  accountHolderName: string;
  maskedAccountNumber: string;
  last4: string;
  verificationStatus: BankVerificationStatus;
  keyVersion: string;
  isDefault: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface PhleboUpiAccountMasked {
  id: string;
  phleboId: string;
  maskedUpiId: string;
  vpaHandle: string;
  verificationStatus: BankVerificationStatus;
  verifiedName?: string;
  keyVersion: string;
  isDefault: boolean;
  updatedAt: string;
  createdAt: string;
}

export type BeneficiaryType = 'PHLEBOTOMIST' | 'LARGE_LAB';

export interface QrCodeMetadata {
  available: boolean;
  source: 'UPLOADED' | 'GENERATED_FROM_UPI' | 'NONE';
  decodedUpiId?: string;
  decodedPayeeName?: string;
  consistencyStatus: 'MATCHED' | 'MISMATCH' | 'UNVERIFIED' | 'NOT_APPLICABLE';
  verificationStatus: BankVerificationStatus;
  mimeType?: string;
  updatedAt?: string;
}

export interface PhleboPaymentMethodSummary {
  phleboId: string;
  beneficiaryType?: BeneficiaryType;
  beneficiaryId?: string;
  profileVersion?: number;
  defaultMethod: 'BANK_ACCOUNT' | 'UPI' | 'NONE';
  bankAccount?: PhleboBankAccountMasked | null;
  upiAccount?: PhleboUpiAccountMasked | null;
  qrCode?: QrCodeMetadata;
  linkedAccountStatus?: 'NOT_CREATED' | 'CREATED' | 'UNDER_REVIEW' | 'ACTIVATED' | 'SUSPENDED';
  linkedAccountId?: string;
  updatedAt: string;
}

export interface PayoutLedgerRecord {
  id: string;
  bookingId: string;
  orderNumber: string;
  settlementId: string;
  phleboId: string;
  phleboName: string;
  grossEarningPaise: number;
  platformFeePaise: number;
  taxPaise: number;
  refundPaise: number;
  adjustmentPaise: number;
  netPayablePaise: number;
  grossEarningInr: number;
  platformFeeInr: number;
  netPayableInr: number;
  currency: 'INR';
  payoutMethod: 'BANK_ACCOUNT' | 'UPI' | 'RAZORPAY_ROUTE' | 'MANUAL' | 'NONE';
  payoutMode?: 'IMPS' | 'NEFT' | 'UPI' | 'ROUTE_TRANSFER' | 'MANUAL';
  maskedDestination: string;
  bankName?: string;
  ifsc?: string;
  providerArchitecture: PayoutProviderArchitecture;
  sourcePaymentId?: string;
  providerTransferId?: string;
  providerPayoutId?: string;
  utrNumber?: string;
  idempotencyKey: string;
  status: PayoutLifecycleStatus;
  errorCode?: PayoutErrorCode;
  errorMessage?: string;
  recommendedAction?: string;
  retryEligible: boolean;
  retryCount: number;
  holdReason?: string;
  heldByEmail?: string;
  manualReferenceId?: string;
  reconciledByEmail?: string;
  eligibleAt?: string;
  initiatedAt?: string;
  processedAt?: string;
  settledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutErrorLogRecord {
  id: string;
  ledgerId: string;
  bookingId: string;
  orderNumber: string;
  phleboId: string;
  phleboName: string;
  amountPaise: number;
  amountInr: number;
  errorCode: PayoutErrorCode;
  message: string;
  recommendedAction: string;
  providerReference?: string;
  retryEligible: boolean;
  resolved: boolean;
  resolvedByEmail?: string;
  resolvedAt?: string;
  createdAt: string;
}
