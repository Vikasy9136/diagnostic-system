import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from '../firebase';
import { type OrderChatMessage, type PickupOrder, isOrderCompleted } from '@diagnostic/shared';

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
 * Send real-time guidance message
 */
export async function sendOrderChatMessage(params: {
  orderId: string;
  orderNumber: string;
  senderId: string;
  senderName: string;
  senderRole: 'PHLEBOTOMIST' | 'SMALL_LAB';
  message: string;
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
    timestamp: now,
    createdAt: now,
  };

  await addDoc(colRef, payload);

  // Also touch order's lastActivity
  try {
    await updateDoc(doc(db, 'orders', params.orderId), {
      lastChatAt: now,
      lastChatMessage: cleanMsg,
      updatedAt: now,
    });
  } catch {
    // Non-fatal
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
