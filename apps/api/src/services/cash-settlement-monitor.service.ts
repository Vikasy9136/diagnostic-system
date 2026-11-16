import {
  NotificationCategory,
  NotificationPriority,
  UserRole,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { sendPlatformNotification } from './notification.service';

export interface FeeOverdueAuditReport {
  checkedAt: string;
  totalLabsAudited: number;
  totalPhlebosAudited: number;
  suspendedCount: number;
  remindedCount: number;
  actions: Array<{
    targetType: 'LAB' | 'PHLEBOTOMIST';
    targetId: string;
    targetName: string;
    email?: string;
    pendingFeeInr: number;
    daysOverdue: number;
    actionTaken: 'SUSPENDED' | 'REMINDER_QUEUED' | 'RESTORED';
  }>;
}

/**
 * Scans all facilities and phlebotomists for unsettled cash platform fees.
 * Applies the 15-day SLA rule: automatically suspends service if unsettled >= 15 days,
 * sends daily warning notifications if pending < 15 days, and restores service immediately upon settlement.
 */
export async function runCashPlatformFeeAudit(): Promise<FeeOverdueAuditReport> {
  const { db, isMockMode } = initializeFirebase();
  const now = new Date();
  const nowMs = now.getTime();
  const actions: FeeOverdueAuditReport['actions'] = [];

  if (isMockMode || !db) {
    return {
      checkedAt: now.toISOString(),
      totalLabsAudited: 0,
      totalPhlebosAudited: 0,
      suspendedCount: 0,
      remindedCount: 0,
      actions: [],
    };
  }

  // 1. Audit Small Labs
  const labsSnap = await db.collection('labs').get();
  for (const docSnap of labsSnap.docs) {
    const lab = docSnap.data();
    const labId = docSnap.id;
    const pendingFee = Number(lab.pendingPlatformFeeDueInr) || 0;
    const unsettledSince = lab.unsettledCashSince ? new Date(lab.unsettledCashSince).getTime() : null;
    const wasSuspended = Boolean(lab.serviceSuspended);

    if (pendingFee <= 0) {
      if (wasSuspended || lab.unsettledCashSince) {
        // Immediate Restoration
        await docSnap.ref.set({
          serviceSuspended: false,
          suspensionReason: null,
          unsettledCashSince: null,
          updatedAt: now.toISOString(),
        }, { merge: true });
        actions.push({
          targetType: 'LAB',
          targetId: labId,
          targetName: lab.name || labId,
          email: lab.email,
          pendingFeeInr: 0,
          daysOverdue: 0,
          actionTaken: 'RESTORED',
        });
      }
      continue;
    }

    const daysOverdue = unsettledSince ? Math.floor((nowMs - unsettledSince) / 86400000) : 0;
    if (daysOverdue >= 15) {
      // Suspend service
      if (!wasSuspended) {
        await docSnap.ref.set({
          serviceSuspended: true,
          suspensionReason: `Overdue cash platform fees of ₹${pendingFee} unsettled for ${daysOverdue} days.`,
          updatedAt: now.toISOString(),
        }, { merge: true });

        await sendPlatformNotification({
          title: `⚠️ Account Services Suspended: Overdue Platform Fees`,
          message: `Your booking & pickup services are suspended due to unsettled cash platform fees of ₹${pendingFee.toLocaleString('en-IN')} pending for ${daysOverdue} days. Settle via online checkout or dashboard to instantly restore services.`,
          category: NotificationCategory.SYSTEM_ALERT,
          priority: NotificationPriority.HIGH,
          recipientEmail: lab.email,
          recipientRole: UserRole.SMALL_LAB,
          labId,
        });

        actions.push({
          targetType: 'LAB',
          targetId: labId,
          targetName: lab.name || labId,
          email: lab.email,
          pendingFeeInr: pendingFee,
          daysOverdue,
          actionTaken: 'SUSPENDED',
        });
      }
    } else {
      // Send daily reminder
      await sendPlatformNotification({
        title: `Payment Reminder: Unsettled Cash Platform Fee (₹${pendingFee})`,
        message: `You have ₹${pendingFee.toLocaleString('en-IN')} in platform fees from cash bookings pending for ${daysOverdue} days. Settle within ${15 - daysOverdue} days to avoid automatic service suspension.`,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.NORMAL,
        recipientEmail: lab.email,
        recipientRole: UserRole.SMALL_LAB,
        labId,
      });

      actions.push({
        targetType: 'LAB',
        targetId: labId,
        targetName: lab.name || labId,
        email: lab.email,
        pendingFeeInr: pendingFee,
        daysOverdue,
        actionTaken: 'REMINDER_QUEUED',
      });
    }
  }

  // 2. Audit Phlebotomists
  const phlebosSnap = await db.collection('phlebotomists').get();
  for (const docSnap of phlebosSnap.docs) {
    const ph = docSnap.data();
    const phleboId = docSnap.id;
    const pendingFee = Number(ph.pendingPlatformFeeDueInr) || 0;
    const unsettledSince = ph.unsettledCashSince ? new Date(ph.unsettledCashSince).getTime() : null;
    const wasSuspended = Boolean(ph.serviceSuspended);

    if (pendingFee <= 0) {
      if (wasSuspended || ph.unsettledCashSince) {
        await docSnap.ref.set({
          serviceSuspended: false,
          suspensionReason: null,
          unsettledCashSince: null,
          updatedAt: now.toISOString(),
        }, { merge: true });
        actions.push({
          targetType: 'PHLEBOTOMIST',
          targetId: phleboId,
          targetName: ph.name || phleboId,
          email: ph.email,
          pendingFeeInr: 0,
          daysOverdue: 0,
          actionTaken: 'RESTORED',
        });
      }
      continue;
    }

    const daysOverdue = unsettledSince ? Math.floor((nowMs - unsettledSince) / 86400000) : 0;
    if (daysOverdue >= 15) {
      if (!wasSuspended) {
        await docSnap.ref.set({
          serviceSuspended: true,
          suspensionReason: `Overdue cash platform fees of ₹${pendingFee} unsettled for ${daysOverdue} days.`,
          updatedAt: now.toISOString(),
        }, { merge: true });

        await sendPlatformNotification({
          title: `⚠️ App Services Restricted: Overdue Platform Fees`,
          message: `Your duty acceptance and sample collections are paused due to ₹${pendingFee.toLocaleString('en-IN')} pending from cash collections for ${daysOverdue} days. Settle to immediately restore your account.`,
          category: NotificationCategory.SYSTEM_ALERT,
          priority: NotificationPriority.HIGH,
          recipientEmail: ph.email,
          recipientRole: UserRole.PHLEBOTOMIST,
        });

        actions.push({
          targetType: 'PHLEBOTOMIST',
          targetId: phleboId,
          targetName: ph.name || phleboId,
          email: ph.email,
          pendingFeeInr: pendingFee,
          daysOverdue,
          actionTaken: 'SUSPENDED',
        });
      }
    } else {
      await sendPlatformNotification({
        title: `Cash Collection Fee Notice: ₹${pendingFee}`,
        message: `₹${pendingFee.toLocaleString('en-IN')} platform fee from cash collections is due (${daysOverdue}/15 days). It will automatically be adjusted against your next courier payout.`,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.NORMAL,
        recipientEmail: ph.email,
        recipientRole: UserRole.PHLEBOTOMIST,
      });

      actions.push({
        targetType: 'PHLEBOTOMIST',
        targetId: phleboId,
        targetName: ph.name || phleboId,
        email: ph.email,
        pendingFeeInr: pendingFee,
        daysOverdue,
        actionTaken: 'REMINDER_QUEUED',
      });
    }
  }

  const suspendedCount = actions.filter((a) => a.actionTaken === 'SUSPENDED').length;
  const remindedCount = actions.filter((a) => a.actionTaken === 'REMINDER_QUEUED').length;

  return {
    checkedAt: now.toISOString(),
    totalLabsAudited: labsSnap.size,
    totalPhlebosAudited: phlebosSnap.size,
    suspendedCount,
    remindedCount,
    actions,
  };
}
