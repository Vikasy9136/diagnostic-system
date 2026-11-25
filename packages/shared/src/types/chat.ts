/**
 * Real-time Order Guidance Chat message schema between Phlebotomist and Small Lab
 */
export interface OrderChatMessage {
  id: string;
  orderId: string;
  orderNumber: string;
  senderId: string;
  senderName: string;
  senderRole: 'PHLEBOTOMIST' | 'SMALL_LAB' | 'LARGE_LAB';
  message: string;
  text?: string;
  timestamp: string; // ISO String
  createdAt: string;
  expiresAt?: string; // Purged 1-2h after order completion
}
