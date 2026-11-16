import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND_FONTS } from './LabSetuBrand';
import { lh, MAX_TEXT_SCALE, rf } from '../utils/responsive';

export type ToastBannerVariant = 'SUCCESS' | 'ALERT' | 'INFO' | 'WARNING';

export interface ToastBannerState {
  id: string;
  visible: boolean;
  variant: ToastBannerVariant;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const INITIAL_TOAST_BANNER: ToastBannerState = {
  id: '',
  visible: false,
  variant: 'INFO',
  title: '',
};

interface ToastNotificationBannerProps {
  toast: ToastBannerState;
  onDismiss: () => void;
  durationMs?: number;
}

const VARIANT_STYLES: Record<
  ToastBannerVariant,
  { accent: string; bg: string; border: string; badgeBg: string; icon: string }
> = {
  SUCCESS: {
    accent: '#15803D',
    bg: '#F0FDF4',
    border: '#86EFAC',
    badgeBg: '#DCFCE7',
    icon: '✓',
  },
  ALERT: {
    accent: '#B91C1C',
    bg: '#FEF2F2',
    border: '#FCA5A5',
    badgeBg: '#FEE2E2',
    icon: '⚡',
  },
  WARNING: {
    accent: '#B45309',
    bg: '#FFFBEB',
    border: '#FCD34D',
    badgeBg: '#FEF3C7',
    icon: '⚠',
  },
  INFO: {
    accent: '#0F766E',
    bg: '#F0FDFA',
    border: '#5EEAD4',
    badgeBg: '#CCFBF1',
    icon: '🔔',
  },
};

export function ToastNotificationBanner({
  toast,
  onDismiss,
  durationMs = 4500,
}: ToastNotificationBannerProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-110)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast.visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -110,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
      return;
    }

    translateY.setValue(-110);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 68,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();

    const timer = setTimeout(() => {
      onDismiss();
    }, durationMs);

    return () => clearTimeout(timer);
  }, [toast.visible, toast.id, durationMs, onDismiss, translateY, opacity]);

  if (!toast.visible) return null;

  const palette = VARIANT_STYLES[toast.variant] || VARIANT_STYLES.INFO;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.host,
        Platform.OS === 'web' ? ({ position: 'fixed' } as unknown as object) : null,
        {
          top: Math.max(insets.top + 8, Platform.OS === 'web' ? 14 : 46),
          left: Math.max(insets.left + 12, 14),
          right: Math.max(insets.right + 12, 14),
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: palette.bg,
            borderColor: palette.border,
            borderLeftColor: palette.accent,
          },
        ]}
      >
        <View style={[styles.iconCircle, { backgroundColor: palette.badgeBg }]}>
          <Text style={[styles.iconText, { color: palette.accent }]}>{palette.icon}</Text>
        </View>

        <View style={styles.textWrap}>
          <Text
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            style={[styles.title, { color: palette.accent }]}
          >
            {toast.title}
          </Text>
          {toast.subtitle ? (
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.subtitle}>
              {toast.subtitle}
            </Text>
          ) : null}
        </View>

        {toast.actionLabel && toast.onAction ? (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: palette.accent }]}
            onPress={() => {
              toast.onAction?.();
              onDismiss();
            }}
          >
            <Text style={styles.actionBtnText}>{toast.actionLabel}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.closeBtn} onPress={onDismiss}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 14 : 46,
    left: 14,
    right: 14,
    zIndex: 9999,
    elevation: 20,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 10,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: rf(14),
    fontFamily: BRAND_FONTS.extraBold,
    includeFontPadding: true,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: rf(13),
    lineHeight: lh(rf(13)),
    fontFamily: BRAND_FONTS.extraBold,
    includeFontPadding: true,
  },
  subtitle: {
    fontSize: rf(11.5),
    fontFamily: BRAND_FONTS.regular,
    color: '#334155',
    marginTop: 2,
    lineHeight: lh(rf(11.5), 1.38),
    includeFontPadding: true,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexShrink: 0,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: rf(11),
    lineHeight: lh(rf(11)),
    fontFamily: BRAND_FONTS.bold,
    includeFontPadding: true,
  },
  closeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexShrink: 0,
  },
  closeText: {
    fontSize: 13,
    fontFamily: BRAND_FONTS.bold,
    color: '#64748B',
  },
});

