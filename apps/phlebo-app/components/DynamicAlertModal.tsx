import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export type DynamicAlertVariant = 'success' | 'error' | 'warning' | 'info' | 'confirm';

export interface DynamicAlertState {
  isOpen: boolean;
  variant: DynamicAlertVariant;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
}

export const INITIAL_DYNAMIC_ALERT: DynamicAlertState = {
  isOpen: false,
  variant: 'info',
  title: '',
  message: '',
};

interface DynamicAlertModalProps {
  alertState: DynamicAlertState;
  onClose: () => void;
}

const VARIANT_CONFIG: Record<
  DynamicAlertVariant,
  { accent: string; badgeBg: string; icon: string }
> = {
  success: { accent: '#16A34A', badgeBg: '#DCFCE7', icon: '✓' },
  error: { accent: '#DC2626', badgeBg: '#FEE2E2', icon: '✕' },
  warning: { accent: '#D97706', badgeBg: '#FEF3C7', icon: '!' },
  info: { accent: '#0D9488', badgeBg: '#CCFBF1', icon: 'ℹ' },
  confirm: { accent: '#0F766E', badgeBg: '#E0F2FE', icon: '🛡️' },
};

export function DynamicAlertModal({ alertState, onClose }: DynamicAlertModalProps) {
  const isConfirm = alertState.variant === 'confirm' || Boolean(alertState.onConfirm);
  const cfg = VARIANT_CONFIG[alertState.variant] || VARIANT_CONFIG.info;

  return (
    <Modal
      visible={alertState.isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={[styles.topStrip, { backgroundColor: cfg.accent }]} />

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityLabel="Close dialog"
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.body}>
            <View style={[styles.iconBadge, { backgroundColor: cfg.badgeBg }]}>
              <Text style={[styles.iconText, { color: cfg.accent }]}>{cfg.icon}</Text>
            </View>

            <Text style={styles.title}>{alertState.title}</Text>
            <Text style={styles.message}>{alertState.message}</Text>

            {alertState.detail ? (
              <View style={styles.detailBox}>
                <Text style={styles.detailText}>{alertState.detail}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.footer}>
            {isConfirm ? (
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>
                  {alertState.cancelLabel || 'Cancel'}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                {
                  backgroundColor:
                    alertState.variant === 'error' ? '#DC2626' : '#0D9488',
                },
              ]}
              onPress={() => {
                const cb = alertState.onConfirm;
                onClose();
                if (cb) cb();
              }}
            >
              <Text style={styles.confirmBtnText}>
                {alertState.confirmLabel || (isConfirm ? 'Confirm' : 'Got It')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 34, 38, 0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 410,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  topStrip: {
    height: 5,
    width: '100%',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  closeBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 18,
    alignItems: 'center',
  },
  iconBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  iconText: {
    fontSize: 22,
    fontWeight: '800',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    textAlign: 'center',
  },
  detailBox: {
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: '100%',
  },
  detailText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

