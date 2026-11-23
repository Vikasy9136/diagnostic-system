import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from '../firebase';
import { isOrderCompleted, type PickupOrder } from '@diagnostic/shared';

/**
 * Automatically delete chat messages from the database 1.5 - 2 hours after order completion
 * to minimize database storage consumption.
 */
export async function cleanupCompletedOrderChats(order: PickupOrder): Promise<void> {
  if (!order || !order.id || !isOrderCompleted(order.status)) return;

  const completionTime =
    order.actualDeliveredAt ||
    order.deliveredAt ||
    order.actualDropAt ||
    order.completedAt ||
    order.updatedAt;

  if (!completionTime) return;

  const diffMs = Date.now() - new Date(completionTime).getTime();
  const ONE_AND_HALF_HOURS_MS = 90 * 60 * 1000;

  if (diffMs > ONE_AND_HALF_HOURS_MS) {
    try {
      const chatCol = collection(db, 'orders', order.id, 'chat_messages');
      const snap = await getDocs(chatCol);
      if (!snap.empty) {
        const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
        await Promise.all(deletePromises);
        console.log(`[Storage Retention] Auto-purged ${snap.size} chat messages for completed order ${order.id}`);
      }
    } catch (err) {
      console.warn(`[Storage Retention] Could not purge chat for ${order.id}:`, err);
    }
  }
}

/**
 * Automatically delete sample collection proof and phlebo selfie photos from Firebase Storage
 * and database after 7 days to free up cloud storage.
 */
export async function purgeExpiredOrderMedia(order: PickupOrder): Promise<void> {
  if (!order || !order.id) return;

  const pickupTime = order.actualPickupAt || order.createdAt;
  if (!pickupTime) return;

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const isOlderThan7Days = Date.now() - new Date(pickupTime).getTime() > SEVEN_DAYS_MS;

  if (!isOlderThan7Days) return;

  const sampleUrl = order.sampleCollectionPhotoUrl || order.samplePhotoUrl;
  const selfieUrl = order.phleboSelfieUrl || order.selfiePhotoUrl;

  if (!sampleUrl && !selfieUrl) return;

  const updates: Record<string, any> = {};

  if (sampleUrl) {
    try {
      if (sampleUrl.includes('firebasestorage.googleapis.com')) {
        const storageRef = ref(storage, sampleUrl);
        await deleteObject(storageRef).catch(() => {});
      }
    } catch {
      // Storage deletion error or already deleted
    }
    updates.sampleCollectionPhotoUrl = '';
    updates.samplePhotoUrl = '';
  }

  if (selfieUrl) {
    try {
      if (selfieUrl.includes('firebasestorage.googleapis.com')) {
        const storageRef = ref(storage, selfieUrl);
        await deleteObject(storageRef).catch(() => {});
      }
    } catch {
      // Storage deletion error or already deleted
    }
    updates.phleboSelfieUrl = '';
    updates.selfiePhotoUrl = '';
  }

  if (Object.keys(updates).length > 0) {
    try {
      await updateDoc(doc(db, 'orders', order.id), updates);
      console.log(`[Storage Retention] Auto-purged 7+ days old photo proofs for order ${order.id}`);
    } catch (err) {
      console.warn(`[Storage Retention] Failed to update order doc for purged media ${order.id}:`, err);
    }
  }
}
