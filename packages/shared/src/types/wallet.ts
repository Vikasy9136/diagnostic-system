export type WalletTransactionType =
  | 'BOOKING_EARNING'
  | 'WITHDRAWAL_REQUEST'
  | 'WITHDRAWAL_RESERVED'
  | 'WITHDRAWAL_SETTLED'
  | 'WITHDRAWAL_REJECTED'
  | 'WITHDRAWAL_RELEASED'
  | 'ADMIN_CREDIT'
  | 'ADMIN_DEBIT'
  | 'REFUND_ADJUSTMENT'
  | 'REVERSAL';

export type WalletTransactionStatus =
  | 'COMPLETED'
  | 'PENDING'
  | 'RESERVED'
  | 'RELEASED'
  | 'REJECTED'
  | 'REVERSED'
  | 'FAILED';

export type WithdrawalStatus =
  | 'PENDING_ADMIN_SETTLEMENT'
  | 'UNDER_REVIEW'
  | 'ON_HOLD'
  | 'PROCESSING_MANUALLY'
  | 'MANUAL_PAID'
  | 'REJECTED'
  | 'FAILED'
  | 'CANCELLED'
  | 'NEEDS_REVIEW';

export type ManualPaymentMethod = 'UPI' | 'IMPS' | 'NEFT' | 'RTGS' | 'OTHER_BANK_TRANSFER';

export type WithdrawalRejectionCyclePolicy = 'ALLOW_RETRY_IN_CYCLE' | 'WAIT_NEXT_7_DAY_CYCLE';

export interface WithdrawalConfig {
  minWithdrawalPaise: number; // default 10000 (₹100)
  cycleDays: number; // 7 days
  platformFeePct: number; // e.g. 0 or configured %
  rejectionPolicy: WithdrawalRejectionCyclePolicy;
  autoCreditOnHandover: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface PhleboWallet {
  phleboId: string;
  phleboName?: string;
  availableBalancePaise: number;
  withdrawalEligibleBalancePaise: number;
  pendingWithdrawalPaise: number;
  onHoldBalancePaise: number;
  totalEarnedPaise: number;
  totalSettledPaise: number;
  thisWeekEarningsPaise: number;
  thisMonthEarningsPaise: number;
  lastWithdrawalAt?: string;
  nextEligibleWithdrawalAt?: string;
  lastSettlementStatus?: WithdrawalStatus;
  updatedAt: string;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  phleboId: string;
  bookingId?: string;
  orderNumber?: string;
  withdrawalRequestId?: string;
  type: WalletTransactionType;
  grossEarningPaise: number;
  platformFeePaise: number;
  netEarningPaise: number;
  amountPaise: number;
  status: WalletTransactionStatus;
  description: string;
  idempotencyKey: string;
  auditMetadata?: Record<string, string | number | boolean>;
  createdAt: string;
}

export interface WithdrawalRequest {
  id: string;
  phleboId: string;
  phleboName: string;
  phleboPhone?: string;
  kycVerified?: boolean;
  requestedAmountPaise: number;
  availableBalanceBeforePaise: number;
  paymentMethod: 'BANK_ACCOUNT' | 'UPI';
  maskedDestination: string;
  bankVerificationStatus: string;
  payoutProfileVersion: number;
  status: WithdrawalStatus;
  requestedAt: string;
  weeklyCycleStart: string;
  nextEligibleAt: string;
  adminId?: string;
  adminEmail?: string;
  holdReason?: string;
  rejectionReason?: string;
  reviewNotes?: string;
  settledAt?: string;
  internalSettlementId?: string;
  manualTransactionRef?: string;
  referenceSource?: 'ADMIN_RECORDED';
  createdAt: string;
  updatedAt: string;
}

export interface ManualSettlementRecord {
  id: string;
  withdrawalRequestId: string;
  phleboId: string;
  phleboName: string;
  amountPaise: number;
  paymentMethod: ManualPaymentMethod;
  transactionReference: string;
  maskedTransactionReference: string;
  referenceSource: 'ADMIN_RECORDED';
  paymentDate: string;
  paymentTime: string;
  receiptStoragePath?: string;
  remarks?: string;
  recordedBy: string;
  recordedAt: string;
  status: 'MANUAL_PAID';
}

export interface FinancialAuditLog {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  entityType: 'WALLET' | 'WALLET_TRANSACTION' | 'WITHDRAWAL_REQUEST' | 'MANUAL_SETTLEMENT' | 'PAYOUT_PROFILE';
  entityId: string;
  oldStatus?: string;
  newStatus?: string;
  reason?: string;
  timestamp: string;
}

export interface WalletReconciliationReport {
  generatedAt: string;
  totalWalletsChecked: number;
  mismatchedWallets: Array<{
    phleboId: string;
    walletTotalEarnedPaise: number;
    ledgerNetCreditedPaise: number;
    walletSettledPaise: number;
    settlementTotalPaise: number;
    reason: string;
  }>;
  duplicateUtrs: Array<{
    transactionReference: string;
    settlementIds: string[];
  }>;
  orphanedWithdrawals: Array<{
    withdrawalRequestId: string;
    status: WithdrawalStatus;
    reason: string;
  }>;
}
