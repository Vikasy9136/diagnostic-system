import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from '../firebase';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  type OrderChatMessage,
  type PickupOrder,
  UserRole,
  isOrderCompleted,
} from '@diagnostic/shared';

/**
 * Real-time listener for order guidance chat
 */
export function subscribeOrderChat(
  orderId: string,
  onUpdate: (messages: OrderChatMessage[]) => void
): () => void {
  if (!orderId) {
    onUpdate([]);
    return () => {};
  }

  const colRef = collection(db, 'orders', orderId, 'chat_messages');
  const q = query(colRef, orderBy('timestamp', 'asc'));

  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<OrderChatMessage, 'id'>),
      }));
      onUpdate(msgs);
    },
    (err) => {
      console.warn('Order chat subscription error:', err);
    }
  );
}

/**
 * Mark order chat messages as read by phlebotomist
 */
export async function markOrderChatReadByPhlebo(orderId: string): Promise<void> {
  if (!orderId) return;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      chatUnreadByPhlebo: 0,
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Send real-time guidance message and notify Small Lab (plus Large Lab if included in order)
 */
export async function sendOrderChatMessage(params: {
  orderId: string;
  orderNumber: string;
  senderId: string;
  senderName: string;
  senderRole: 'PHLEBOTOMIST' | 'SMALL_LAB' | 'LARGE_LAB';
  message: string;
  order?: PickupOrder | null;
}): Promise<void> {
  const cleanMsg = params.message.trim();
  if (!cleanMsg) return;

  const now = new Date().toISOString();
  const colRef = collection(db, 'orders', params.orderId, 'chat_messages');

  const payload: Omit<OrderChatMessage, 'id'> = {
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    senderId: params.senderId,
    senderName: params.senderName,
    senderRole: params.senderRole,
    message: cleanMsg,
    text: cleanMsg,
    timestamp: now,
    createdAt: now,
  };

  await addDoc(colRef, payload);

  const ord = params.order;
  const hasLargeLab = Boolean(
    ord &&
      String(ord.dropType || '') !== 'SELF_LAB_RETURN' &&
      ord.targetLabId &&
      ord.targetLabId !== ord.smallLabId
  );

  // Increment unread counters for other participants and update lastChat metadata
  try {
    const orderPatch: Record<string, any> = {
      lastChatAt: now,
      lastChatMessage: cleanMsg,
      lastChatSenderRole: params.senderRole,
      lastChatSenderName: params.senderName,
      updatedAt: now,
    };
    if (params.senderRole === 'PHLEBOTOMIST') {
      orderPatch.chatUnreadBySmallLab = increment(1);
      if (hasLargeLab) {
        orderPatch.chatUnreadByLargeLab = increment(1);
      }
    } else if (params.senderRole === 'SMALL_LAB') {
      if (ord?.phlebotomistId) orderPatch.chatUnreadByPhlebo = increment(1);
      if (hasLargeLab) orderPatch.chatUnreadByLargeLab = increment(1);
    } else if (params.senderRole === 'LARGE_LAB') {
      if (ord?.phlebotomistId) orderPatch.chatUnreadByPhlebo = increment(1);
      orderPatch.chatUnreadBySmallLab = increment(1);
    }
    await updateDoc(doc(db, 'orders', params.orderId), orderPatch);
  } catch {
    // Non-fatal
  }

  // Send real-time in-app notifications to respective participants
  try {
    const preview = cleanMsg.length > 90 ? `${cleanMsg.slice(0, 87)}...` : cleanMsg;
    const senderLabel =
      params.senderRole === 'PHLEBOTOMIST'
        ? `Phlebo (${params.senderName || 'Courier'})`
        : params.senderRole === 'LARGE_LAB'
          ? `Large Lab (${params.senderName || 'Reference Lab'})`
          : `Small Lab (${params.senderName || 'Lab Desk'})`;

    if (params.senderRole !== 'SMALL_LAB' && ord?.smallLabId) {
      await addDoc(collection(db, 'notifications'), {
        title: `💬 New Chat • ${params.orderNumber}`,
        message: `${senderLabel}: ${preview}`,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.HIGH,
        recipientRole: UserRole.SMALL_LAB,
        labId: ord.smallLabId,
        orderId: params.orderId,
        channels: [NotificationChannel.IN_APP],
        read: false,
        emailSent: false,
        createdAt: now,
      });
    }

    if (params.senderRole !== 'LARGE_LAB' && hasLargeLab && ord?.targetLabId) {
      await addDoc(collection(db, 'notifications'), {
        title: `💬 New Order Chat • ${params.orderNumber}`,
        message: `${senderLabel}: ${preview}`,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.HIGH,
        recipientRole: UserRole.LARGE_LAB,
        labId: ord.targetLabId,
        orderId: params.orderId,
        channels: [NotificationChannel.IN_APP],
        read: false,
        emailSent: false,
        createdAt: now,
      });
    }
  } catch {
    // Non-fatal notification dispatch failure
  }
}

/**
 * Storage space optimization:
 * Automatically cleans up chat messages 1-2 hours after order drop/completion
 */
export async function cleanupCompletedOrderChats(order: PickupOrder): Promise<void> {
  if (!order?.id) return;
  const isDelivered =
    order.status === 'DELIVERED_TO_LAB' ||
    order.status === 'UNDER_ANALYSIS' ||
    order.status === 'REPORT_UPLOADED' ||
    order.status === 'COMPLETED' ||
    isOrderCompleted(order.status);

  if (!isDelivered) return;

  const deliveredTime = order.actualDeliveredAt || order.updatedAt;
  if (!deliveredTime) return;

  const diffHours = (Date.now() - new Date(deliveredTime).getTime()) / (1000 * 60 * 60);

  // If completed > 1.5 hours ago, purge the messages collection for storage efficiency
  if (diffHours >= 1.5) {
    try {
      const colRef = collection(db, 'orders', order.id, 'chat_messages');
      const snap = await getDocs(colRef);
      if (!snap.empty) {
        const deletes = snap.docs.map((d) => deleteDoc(d.ref));
        await Promise.all(deletes);
      }
    } catch {
      // Non-fatal
    }
  }
}

/**
 * Storage space optimization:
 * Deletes sample collection photos and phlebo selfie photos after 7 days
 */
export async function purgeExpiredOrderMedia(order: PickupOrder): Promise<void> {
  if (!order?.id) return;
  const photoTime = order.actualPickupAt || order.updatedAt || order.createdAt;
  if (!photoTime) return;

  const diffDays = (Date.now() - new Date(photoTime).getTime()) / (1000 * 60 * 60 * 24);

  // If older than 7 days and has photos, delete storage blobs and clear URLs
  if (diffDays >= 7 && (order.sampleCollectionPhotoUrl || order.phleboSelfieUrl)) {
    try {
      if (order.sampleCollectionPhotoUrl && order.sampleCollectionPhotoUrl.startsWith('gs://')) {
        const pRef = ref(storage, order.sampleCollectionPhotoUrl);
        await deleteObject(pRef).catch(() => {});
      }
      if (order.phleboSelfieUrl && order.phleboSelfieUrl.startsWith('gs://')) {
        const sRef = ref(storage, order.phleboSelfieUrl);
        await deleteObject(sRef).catch(() => {});
      }

      await updateDoc(doc(db, 'orders', order.id), {
        sampleCollectionPhotoUrl: '',
        phleboSelfieUrl: '',
        photosPurgedAfter7Days: true,
        photosPurgedAt: new Date().toISOString(),
      });
    } catch {
      // Non-fatal
    }
  }
}
