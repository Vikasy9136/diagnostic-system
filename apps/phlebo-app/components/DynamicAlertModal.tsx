import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND_COLORS, BRAND_FONTS } from './LabSetuBrand';
import { lh, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

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
  const insets = useSafeAreaInsets();
  const isConfirm = alertState.variant === 'confirm' || Boolean(alertState.onConfirm);
  const cfg = VARIANT_CONFIG[alertState.variant] || VARIANT_CONFIG.info;

  return (
    <Modal
      visible={alertState.isOpen}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(20, insets.top + 12),
            paddingBottom: Math.max(20, insets.bottom + 12),
            paddingLeft: Math.max(20, insets.left + 16),
            paddingRight: Math.max(20, insets.right + 16),
          },
        ]}
      >
        <View style={styles.card}>
          <View style={[styles.topStrip, { backgroundColor: cfg.accent }]} />

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityLabel="Close dialog"
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>

          <ScrollView
            style={{ maxHeight: 380 }}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.iconBadge, { backgroundColor: cfg.badgeBg }]}>
              <Text style={[styles.iconText, { color: cfg.accent }]}>{cfg.icon}</Text>
            </View>

            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.title}>
              {alertState.title}
            </Text>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.message}>
              {alertState.message}
            </Text>

            {alertState.detail ? (
              <View style={styles.detailBox}>
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.detailText}>
                  {alertState.detail}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {isConfirm ? (
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.cancelBtnText}>
                  {alertState.cancelLabel || 'Cancel'}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                {
                  backgroundColor:
                    alertState.variant === 'error' ? '#DC2626' : BRAND_COLORS.navyPrimary,
                },
              ]}
              onPress={() => {
                const cb = alertState.onConfirm;
                onClose();
                if (cb) cb();
              }}
            >
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.confirmBtnText}>
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
    fontSize: rf(13),
    fontFamily: BRAND_FONTS.bold,
    includeFontPadding: true,
  },
  body: {
    paddingHorizontal: rs(20),
    paddingTop: rs(24),
    paddingBottom: rs(18),
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
    fontSize: rf(22),
    fontFamily: BRAND_FONTS.extraBold,
  },
  title: {
    fontSize: rf(17.5),
    lineHeight: lh(rf(17.5)),
    fontFamily: BRAND_FONTS.extraBold,
    color: BRAND_COLORS.navyPrimary,
    textAlign: 'center',
    marginBottom: 8,
    includeFontPadding: true,
  },
  message: {
    fontSize: rf(13.5),
    fontFamily: BRAND_FONTS.regular,
    lineHeight: lh(rf(13.5), 1.45),
    color: '#475569',
    textAlign: 'center',
    includeFontPadding: true,
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
    fontSize: rf(12),
    lineHeight: lh(rf(12), 1.4),
    fontFamily: BRAND_FONTS.semiBold,
    color: '#334155',
    textAlign: 'center',
    includeFontPadding: true,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rs(10),
    paddingHorizontal: rs(18),
    paddingVertical: rs(14),
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  cancelBtn: {
    flex: 1,
    minWidth: rs(100),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 11,
    paddingVertical: rs(11),
    paddingHorizontal: rs(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#334155',
    fontSize: rf(13.5),
    lineHeight: lh(rf(13.5)),
    fontFamily: BRAND_FONTS.bold,
    textAlign: 'center',
    includeFontPadding: true,
  },
  confirmBtn: {
    flex: 1,
    minWidth: rs(110),
    borderRadius: 11,
    paddingVertical: rs(11),
    paddingHorizontal: rs(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: rf(13.5),
    lineHeight: lh(rf(13.5)),
    fontFamily: BRAND_FONTS.bold,
    textAlign: 'center',
    includeFontPadding: true,
  },
});

