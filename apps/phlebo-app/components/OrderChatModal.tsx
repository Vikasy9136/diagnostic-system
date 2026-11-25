import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  formatOrderStatus,
  isOrderCompleted,
  type OrderChatMessage,
  type PickupOrder,
} from '@diagnostic/shared';
import { BRAND_COLORS, BRAND_FONTS } from './LabSetuBrand';
import {
  cleanupCompletedOrderChats,
  markOrderChatReadByPhlebo,
  sendOrderChatMessage,
  subscribeOrderChat,
} from '../services/orderChatService';
import { COMPACT_TEXT_SCALE, lh, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

export interface OrderChatModalProps {
  visible: boolean;
  order: PickupOrder | null;
  phleboId: string;
  phleboName: string;
  onClose: () => void;
}

export function OrderChatModal({
  visible,
  order,
  phleboId,
  phleboName,
  onClose,
}: OrderChatModalProps) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<any>(null);

  const isCompleted = order
    ? order.status === 'DELIVERED_TO_LAB' ||
      order.status === 'UNDER_ANALYSIS' ||
      order.status === 'REPORT_UPLOADED' ||
      order.status === 'COMPLETED' ||
      isOrderCompleted(order.status)
    : false;

  useEffect(() => {
    if (!visible) return;
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }, 120);
      }
    );
    return () => showSub.remove();
  }, [visible]);

  useEffect(() => {
    if (!visible || !order?.id) {
      setMessages([]);
      return;
    }

    // Auto-cleanup check if order was completed > 1.5 hours ago
    void cleanupCompletedOrderChats(order);
    void markOrderChatReadByPhlebo(order.id);

    const unsub = subscribeOrderChat(order.id, (msgs) => {
      setMessages(msgs);
      if ((order.chatUnreadByPhlebo || 0) > 0) {
        void markOrderChatReadByPhlebo(order.id);
      }
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    return () => unsub();
  }, [visible, order?.id, order?.status]);

  async function handleSend() {
    if (!inputText.trim() || !order || isCompleted || sending) return;
    const txt = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      await sendOrderChatMessage({
        orderId: order.id,
        orderNumber: order.orderNumber,
        senderId: phleboId,
        senderName: phleboName,
        senderRole: 'PHLEBOTOMIST',
        message: txt,
        order,
      });
    } finally {
      setSending(false);
    }
  }

  if (!order) return null;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View
          style={[
            styles.container,
            {
              paddingTop: Math.max(12, insets.top),
              paddingBottom: Platform.OS === 'ios' ? Math.max(12, insets.bottom) : 10,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: rs(8) }}>
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.headerTitle}>
                  💬 Lab Guidance Chat
                </Text>
                <View style={styles.orderPill}>
                  <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.orderPillText}>
                    {order.orderNumber}
                  </Text>
                </View>
              </View>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.headerSub}>
                {order.smallLabName} • {formatOrderStatus(order.status)}
              </Text>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close chat">
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Status Banner */}
          {isCompleted ? (
            <View style={styles.completedBanner}>
              <Ionicons name="lock-closed" size={16} color="#047857" />
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.completedBannerText}>
                Order Delivered • Chat is read-only (messages auto-expire in 1–2 hours)
              </Text>
            </View>
          ) : (
            <View style={styles.activeBanner}>
              <Ionicons name="shield-checkmark" size={15} color="#0D9488" />
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.activeBannerText}>
                Live Route Chat with Lab Desk for directions & sample guidance
              </Text>
            </View>
          )}

          {/* Messages List */}
          <ScrollView
            ref={scrollRef}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              scrollRef.current?.scrollToEnd({ animated: true });
            }}
            onLayout={() => {
              scrollRef.current?.scrollToEnd({ animated: false });
            }}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="chatbubbles-outline" size={42} color="#94A3B8" />
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.emptyTitle}>
                  No messages yet
                </Text>
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.emptySub}>
                  Send a message to {order.smallLabName} if you need patient location assistance, fasting instructions, or sample collection guidance.
                </Text>
              </View>
            ) : (
              messages.map((m) => {
                const isMe = m.senderRole === 'PHLEBOTOMIST';
                const timeStr = m.timestamp
                  ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';

                return (
                  <View
                    key={m.id}
                    style={[
                      styles.bubbleRow,
                      isMe ? styles.bubbleRowRight : styles.bubbleRowLeft,
                    ]}
                  >
                    <View
                      style={[
                        styles.bubble,
                        isMe ? styles.bubbleRight : styles.bubbleLeft,
                      ]}
                    >
                      <Text
                        maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                        style={[
                          styles.senderLabel,
                          isMe ? styles.senderLabelRight : styles.senderLabelLeft,
                        ]}
                      >
                        {isMe ? 'You (Phlebo)' : m.senderName || 'Lab Desk'}
                      </Text>

                      <Text
                        maxFontSizeMultiplier={MAX_TEXT_SCALE}
                        style={[
                          styles.bubbleText,
                          isMe ? styles.bubbleTextRight : styles.bubbleTextLeft,
                        ]}
                      >
                        {m.message || m.text || ''}
                      </Text>

                      <Text
                        maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                        style={[
                          styles.timestampText,
                          isMe ? styles.timestampRight : styles.timestampLeft,
                        ]}
                      >
                        {timeStr}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Input Bar */}
          {!isCompleted ? (
            <View style={styles.inputBar}>
              <TextInput
                style={[styles.input, { maxHeight: 90 }]}
                value={inputText}
                onChangeText={(val) => {
                  setInputText(val);
                  scrollRef.current?.scrollToEnd({ animated: false });
                }}
                onFocus={() => {
                  setTimeout(() => {
                    scrollRef.current?.scrollToEnd({ animated: true });
                  }, 120);
                }}
                placeholder="Type guidance message for lab desk..."
                placeholderTextColor="#94A3B8"
                multiline
              />
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  (!inputText.trim() || sending) && { opacity: 0.5 },
                ]}
                disabled={!inputText.trim() || sending}
                onPress={handleSend}
              >
                <Ionicons name="send" size={17} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  container: {
    flex: 1,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: rs(24),
    borderTopRightRadius: rs(24),
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(18),
    paddingVertical: rs(14),
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: rf(16),
    lineHeight: lh(rf(16)),
    fontFamily: BRAND_FONTS.extraBold,
    color: BRAND_COLORS.navyPrimary,
  },
  orderPill: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: rs(8),
    paddingHorizontal: rs(7),
    paddingVertical: rs(2),
  },
  orderPillText: {
    fontSize: rf(11),
    fontFamily: BRAND_FONTS.bold,
    color: '#1D4ED8',
  },
  headerSub: {
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    fontFamily: BRAND_FONTS.medium,
    color: '#64748B',
    marginTop: rs(3),
  },
  closeBtn: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(16),
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
    backgroundColor: '#F0FDFA',
    paddingHorizontal: rs(16),
    paddingVertical: rs(8),
    borderBottomWidth: 1,
    borderBottomColor: '#CCFBF1',
  },
  activeBannerText: {
    fontSize: rf(11.5),
    lineHeight: lh(rf(11.5)),
    fontFamily: BRAND_FONTS.medium,
    color: '#0F766E',
    flex: 1,
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
    backgroundColor: '#ECFDF5',
    paddingHorizontal: rs(16),
    paddingVertical: rs(8),
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
  },
  completedBannerText: {
    fontSize: rf(11.5),
    lineHeight: lh(rf(11.5)),
    fontFamily: BRAND_FONTS.medium,
    color: '#047857',
    flex: 1,
  },
  messageList: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  messageListContent: {
    paddingHorizontal: rs(16),
    paddingVertical: rs(16),
    gap: rs(10),
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: rs(60),
    paddingHorizontal: rs(24),
  },
  emptyTitle: {
    fontSize: rf(15),
    fontFamily: BRAND_FONTS.bold,
    color: '#475569',
    marginTop: rs(12),
  },
  emptySub: {
    fontSize: rf(12),
    lineHeight: lh(rf(12), 1.45),
    fontFamily: BRAND_FONTS.regular,
    color: '#64748B',
    textAlign: 'center',
    marginTop: rs(6),
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: rs(4),
  },
  bubbleRowLeft: {
    justifyContent: 'flex-start',
  },
  bubbleRowRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: rs(14),
    paddingHorizontal: rs(12),
    paddingVertical: rs(9),
  },
  bubbleLeft: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: rs(2),
  },
  bubbleRight: {
    backgroundColor: BRAND_COLORS.navyPrimary,
    borderBottomRightRadius: rs(2),
  },
  senderLabel: {
    fontSize: rf(10.5),
    fontFamily: BRAND_FONTS.bold,
    marginBottom: rs(2),
  },
  senderLabelLeft: {
    color: '#0D9488',
  },
  senderLabelRight: {
    color: '#99F6E4',
  },
  bubbleText: {
    fontSize: rf(13),
    lineHeight: lh(rf(13), 1.4),
    fontFamily: BRAND_FONTS.medium,
  },
  bubbleTextLeft: {
    color: '#0F172A',
  },
  bubbleTextRight: {
    color: '#FFFFFF',
  },
  timestampText: {
    fontSize: rf(9.5),
    fontFamily: BRAND_FONTS.regular,
    marginTop: rs(3),
    alignSelf: 'flex-end',
  },
  timestampLeft: {
    color: '#94A3B8',
  },
  timestampRight: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    paddingHorizontal: rs(14),
    paddingVertical: rs(10),
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  input: {
    flex: 1,
    minHeight: rs(42),
    backgroundColor: '#F1F5F9',
    borderRadius: rs(21),
    paddingHorizontal: rs(16),
    paddingVertical: rs(8),
    fontSize: rf(13),
    fontFamily: BRAND_FONTS.medium,
    color: '#0F172A',
  },
  sendBtn: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(20),
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
