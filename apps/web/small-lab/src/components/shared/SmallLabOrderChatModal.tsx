import { useEffect, useRef, useState } from 'react';
import {
  formatOrderStatus,
  isOrderCompleted,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  type OrderChatMessage,
  type PickupOrder,
  UserRole,
} from '@diagnostic/shared';
import { db } from '../../firebase';
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
import { ModalFrame } from './ModalFrame';

export interface SmallLabOrderChatModalProps {
  open: boolean;
  order: PickupOrder | null;
  labName: string;
  senderRole?: 'SMALL_LAB' | 'LARGE_LAB';
  onClose: () => void;
}

const QUICK_GUIDANCE_CHIPS = [
  '📞 Call patient before reaching location',
  '🚪 Use the rear building entrance / gate B',
  '❄️ Keep EDTA tube in cold carrier pouch',
  '🏢 Patient is on 2nd Floor, Room 204',
  '⚠️ Fasting sample - collect before 9:00 AM',
];

export function SmallLabOrderChatModal({
  open,
  order,
  labName,
  senderRole = 'SMALL_LAB',
  onClose,
}: SmallLabOrderChatModalProps) {
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const isCompleted = order
    ? order.status === 'DELIVERED_TO_LAB' ||
      order.status === 'UNDER_ANALYSIS' ||
      order.status === 'REPORT_UPLOADED' ||
      order.status === 'COMPLETED' ||
      isOrderCompleted(order.status)
    : false;

  useEffect(() => {
    if (!open || !order?.id) {
      setMessages([]);
      return;
    }

    // 1. Check if chat messages should be cleaned up (completed > 1.5 hours ago)
    if (isCompleted) {
      const completionTime =
        order.actualDeliveredAt ||
        order.deliveredAt ||
        order.actualDropAt ||
        order.completedAt ||
        order.updatedAt;
      if (completionTime) {
        const diffMs = Date.now() - new Date(completionTime).getTime();
        if (diffMs > 90 * 60 * 1000) {
          // Completed > 1.5 hours ago: Purge from database
          const chatCol = collection(db, 'orders', order.id, 'chat_messages');
          getDocs(chatCol)
            .then((snap) => {
              snap.docs.forEach((d) => {
                deleteDoc(d.ref).catch(() => {});
              });
            })
            .catch(() => {});
        }
      }
    }

    // Mark chat as read by this lab when modal is open
    const readField = senderRole === 'LARGE_LAB' ? 'chatUnreadByLargeLab' : 'chatUnreadBySmallLab';
    void updateDoc(doc(db, 'orders', order.id), { [readField]: 0 }).catch(() => {});

    // 2. Real-time subscription to order chat messages
    const chatCol = collection(db, 'orders', order.id, 'chat_messages');
    const q = query(chatCol, orderBy('timestamp', 'asc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const msgs = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<OrderChatMessage, 'id'>),
        }));
        setMessages(msgs);
        void updateDoc(doc(db, 'orders', order.id), { [readField]: 0 }).catch(() => {});
        setTimeout(() => {
          scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 80);
      },
      (err) => {
        console.warn('Small Lab chat subscription warning:', err);
      }
    );

    return () => unsub();
  }, [open, order?.id, order?.status, isCompleted]);

  async function handleSend(textToSend?: string) {
    const raw = (textToSend || inputText).trim();
    if (!raw || !order || isCompleted || sending) return;

    setInputText('');
    setSending(true);

    try {
      const now = new Date().toISOString();
      const chatCol = collection(db, 'orders', order.id, 'chat_messages');
      const senderId =
        senderRole === 'LARGE_LAB'
          ? order.targetLabId || 'LARGE_LAB'
          : order.smallLabId || 'SMALL_LAB';
      const resolvedSenderName =
        labName ||
        (senderRole === 'LARGE_LAB' ? order.targetLabName : order.smallLabName) ||
        'Lab Desk';

      await addDoc(chatCol, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        senderId,
        senderName: resolvedSenderName,
        senderRole,
        message: raw,
        text: raw,
        timestamp: now,
        createdAt: now,
      });

      const hasLargeLab = Boolean(
        String(order.dropType || '') !== 'SELF_LAB_RETURN' &&
          order.targetLabId &&
          order.targetLabId !== order.smallLabId
      );

      try {
        const orderPatch: Record<string, any> = {
          lastChatAt: now,
          lastChatMessage: raw,
          lastChatSenderRole: senderRole,
          lastChatSenderName: resolvedSenderName,
          updatedAt: now,
        };
        if (order.phlebotomistId) {
          orderPatch.chatUnreadByPhlebo = increment(1);
        }
        if (senderRole === 'SMALL_LAB' && hasLargeLab) {
          orderPatch.chatUnreadByLargeLab = increment(1);
        } else if (senderRole === 'LARGE_LAB') {
          orderPatch.chatUnreadBySmallLab = increment(1);
        }
        await updateDoc(doc(db, 'orders', order.id), orderPatch);
      } catch {
        // Non-fatal
      }

      // Send notifications to respective participants (Phlebo + Large Lab / Small Lab)
      try {
        const preview = raw.length > 90 ? `${raw.slice(0, 87)}...` : raw;
        const senderPrefix =
          senderRole === 'LARGE_LAB'
            ? `Large Lab (${resolvedSenderName})`
            : `Small Lab (${resolvedSenderName})`;

        if (order.phlebotomistId) {
          await addDoc(collection(db, 'notifications'), {
            title: `💬 New Chat • ${order.orderNumber}`,
            message: `${senderPrefix}: ${preview}`,
            category: NotificationCategory.SYSTEM_ALERT,
            priority: NotificationPriority.HIGH,
            recipientRole: UserRole.PHLEBOTOMIST,
            recipientUid: order.phlebotomistId,
            orderId: order.id,
            channels: [NotificationChannel.IN_APP],
            read: false,
            emailSent: false,
            createdAt: now,
          });
        }

        if (senderRole === 'SMALL_LAB' && hasLargeLab && order.targetLabId) {
          await addDoc(collection(db, 'notifications'), {
            title: `💬 New Order Chat • ${order.orderNumber}`,
            message: `${senderPrefix}: ${preview}`,
            category: NotificationCategory.SYSTEM_ALERT,
            priority: NotificationPriority.HIGH,
            recipientRole: UserRole.LARGE_LAB,
            labId: order.targetLabId,
            orderId: order.id,
            channels: [NotificationChannel.IN_APP],
            read: false,
            emailSent: false,
            createdAt: now,
          });
        } else if (senderRole === 'LARGE_LAB' && order.smallLabId) {
          await addDoc(collection(db, 'notifications'), {
            title: `💬 New Order Chat • ${order.orderNumber}`,
            message: `${senderPrefix}: ${preview}`,
            category: NotificationCategory.SYSTEM_ALERT,
            priority: NotificationPriority.HIGH,
            recipientRole: UserRole.SMALL_LAB,
            labId: order.smallLabId,
            orderId: order.id,
            channels: [NotificationChannel.IN_APP],
            read: false,
            emailSent: false,
            createdAt: now,
          });
        }
      } catch {
        // Non-fatal notification failure
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  }

  if (!order) return null;

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      title={`💬 Route & Pickup Guidance • ${order.orderNumber}`}
      subtitle={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
          <span>Rider: <strong>{order.phlebotomistName || 'Assigned Courier'}</strong></span>
          <span style={{ color: '#94A3B8' }}>•</span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '999px',
              background: isCompleted ? '#F1F5F9' : '#ECFDF5',
              color: isCompleted ? '#475569' : '#047857',
              fontWeight: 700,
              fontSize: '0.72rem',
            }}
          >
            {formatOrderStatus(order.status)}
          </span>
        </div>
      }
      maxWidth="680px"
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '520px',
          background: '#F8FAFC',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
        }}
      >
        {/* Status / Retention Banner */}
        {isCompleted ? (
          <div
            style={{
              padding: '10px 14px',
              background: '#F1F5F9',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.78rem',
              color: '#475569',
            }}
          >
            <span>🔒</span>
            <span>
              <strong>Order Delivered / Completed:</strong> Guidance chat is closed and read-only.
              Messages automatically expire from the database in 1–2 hours to maintain clean storage.
            </span>
          </div>
        ) : (
          <div
            style={{
              padding: '10px 14px',
              background: '#EFF6FF',
              borderBottom: '1px solid #DBEAFE',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.78rem',
              color: '#1E40AF',
            }}
          >
            <span>⚡</span>
            <span>
              <strong>Real-Time Rider Guidance:</strong> Message the phlebotomist directly with directions,
              landmark details, patient contact notes, or sample handling instructions.
            </span>
          </div>
        )}

        {/* Message Log */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                margin: 'auto',
                textAlign: 'center',
                padding: '24px',
                color: '#94A3B8',
                maxWidth: '380px',
              }}
            >
              <div style={{ fontSize: '2.4rem', marginBottom: '8px' }}>💬</div>
              <div style={{ fontWeight: 700, color: '#334155', fontSize: '0.94rem' }}>
                No Guidance Messages Yet
              </div>
              <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                Type a message below or tap a quick chip to give instant navigation instructions to{' '}
                <strong>{order.phlebotomistName || 'the courier'}</strong>.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.senderRole === 'SMALL_LAB';
              const timeStr = m.timestamp
                ? new Date(m.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';

              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: '#64748B',
                      marginBottom: '3px',
                      alignSelf: isMe ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {isMe ? '🏥 You (Lab Desk)' : `🏍️ ${m.senderName || 'Phlebotomist'}`} • {timeStr}
                  </div>
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                      background: isMe ? '#2563EB' : '#FFFFFF',
                      color: isMe ? '#FFFFFF' : '#0F172A',
                      border: isMe ? 'none' : '1px solid #E2E8F0',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      fontSize: '0.86rem',
                      lineHeight: '1.4',
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.message || m.text || ''}
                  </div>
                </div>
              );
            })
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* Quick Guidance Chips (Active only when not completed) */}
        {!isCompleted && (
          <div
            style={{
              padding: '8px 14px',
              background: '#F1F5F9',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {QUICK_GUIDANCE_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => void handleSend(chip)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '999px',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#334155',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#2563EB';
                  e.currentTarget.style.color = '#2563EB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#CBD5E1';
                  e.currentTarget.style.color = '#334155';
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Chat Input Bar */}
        {!isCompleted ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            style={{
              padding: '12px 14px',
              background: '#FFFFFF',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type guidance message for phlebotomist..."
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '0.86rem',
                outline: 'none',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#2563EB')}
              onBlur={(e) => (e.target.style.borderColor = '#CBD5E1')}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                background: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.86rem',
                cursor: !inputText.trim() || sending ? 'not-allowed' : 'pointer',
                opacity: !inputText.trim() || sending ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>Send</span>
              <span>&rarr;</span>
            </button>
          </form>
        ) : null}
      </div>
    </ModalFrame>
  );
}
