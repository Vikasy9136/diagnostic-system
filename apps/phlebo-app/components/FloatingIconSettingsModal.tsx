import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  type FloatingIconSettings,
  type FloatingIconSize,
  type FloatingIconVisibilityMode,
  type WebNotificationPermissionState,
} from '../types/phleboTypes';
import {
  getOverlayEnvironmentInfo,
  openSystemOverlayPermissionSettings,
  type OverlayEnvironmentInfo,
} from '../services/floatingOverlayService';
import { BRAND_COLORS, BRAND_FONTS, LabSetuLogoMark } from './LabSetuBrand';
import { COMPACT_TEXT_SCALE, lh, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

interface FloatingIconSettingsModalProps {
  visible: boolean;
  settings: FloatingIconSettings;
  isOnline: boolean;
  webNotifPerm: WebNotificationPermissionState;
  onUpdateSettings: (patch: Partial<FloatingIconSettings>) => void;
  onResetPosition: () => void;
  onRequestOverlayPermission: () => void;
  onClose: () => void;
}

export function FloatingIconSettingsModal({
  visible,
  settings,
  isOnline,
  webNotifPerm,
  onUpdateSettings,
  onResetPosition,
  onRequestOverlayPermission,
  onClose,
}: FloatingIconSettingsModalProps) {
  const insets = useSafeAreaInsets();
  const { height: winHeight } = useWindowDimensions();
  const [envInfo, setEnvInfo] = useState<OverlayEnvironmentInfo | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void getOverlayEnvironmentInfo().then((info) => {
      if (active) setEnvInfo(info);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  if (!visible) return null;

  const scrollMaxHeight = Math.max(
    260,
    Math.round((winHeight - insets.top - insets.bottom) * 0.62)
  );
  const previewDiameter = settings.size === 'SM' ? 54 : settings.size === 'LG' ? 76 : 66;
  const isCurrentlyShown =
    settings.enabled && (settings.visibilityMode === 'ALWAYS' || isOnline);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              marginTop: Math.max(insets.top + 12, 24),
              paddingBottom: Math.max(insets.bottom + 14, 22),
            },
          ]}
        >
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.title}>
                Floating Icon Settings
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.subtitle}>
                Customize in-app &amp; background/outside-app LabSetu floating bubble
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeCircle}>
              <Ionicons name="close" size={20} color={BRAND_COLORS.navyPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: scrollMaxHeight }} showsVerticalScrollIndicator={false}>
            {/* Live Preview */}
            <View style={styles.previewBox}>
              <View style={styles.previewOrbRow}>
                <View
                  style={[
                    styles.previewGlowRing,
                    {
                      width: previewDiameter + 12,
                      height: previewDiameter + 12,
                      borderRadius: (previewDiameter + 12) / 2,
                      opacity: settings.enabled ? settings.opacityPct / 100 : 0.35,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.previewInnerOrb,
                      {
                        width: previewDiameter,
                        height: previewDiameter,
                        borderRadius: previewDiameter / 2,
                      },
                    ]}
                  >
                    <LabSetuLogoMark size={Math.round(previewDiameter * 0.66)} />
                    {settings.showBadgeAndPulse ? (
                      <View style={styles.previewBadge}>
                        <Text style={styles.previewBadgeText}>3</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.previewTitle}>
                    {isCurrentlyShown
                      ? 'Floating Icon Active'
                      : settings.enabled
                        ? 'Standby (Shows When On Duty)'
                        : 'Floating Icon Disabled'}
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.previewSub}>
                    Drag anywhere on screen. Tap orb to open clamped Quick Radar popup (never
                    clipped off edges!).
                  </Text>
                </View>
              </View>
            </View>

            {/* Master Enable Toggle */}
            <View style={styles.settingRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.settingLabel}>
                  Show Draggable Floating Icon
                </Text>
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.settingDesc}>
                  Display quick-access circular LabSetu radar bubble across screens
                </Text>
              </View>
              <Switch
                value={settings.enabled}
                onValueChange={(val) => onUpdateSettings({ enabled: val })}
                trackColor={{ false: '#CBD5E1', true: '#99F6E4' }}
                thumbColor={settings.enabled ? BRAND_COLORS.tealPrimary : '#F8FAFC'}
              />
            </View>

            {/* Show Outside App / When Minimized or Closed */}
            <View style={styles.settingRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.settingLabel}>
                  Keep Active Outside App (Minimized / Closed)
                </Text>
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.settingDesc}>
                  Uses Android Display-Over-Apps service in APK builds &amp; persistent quick-return
                  notification in Expo Go
                </Text>
              </View>
              <Switch
                value={settings.showOutsideApp}
                onValueChange={(val) => onUpdateSettings({ showOutsideApp: val })}
                trackColor={{ false: '#CBD5E1', true: '#99F6E4' }}
                thumbColor={settings.showOutsideApp ? BRAND_COLORS.tealPrimary : '#F8FAFC'}
              />
            </View>

            {/* Visibility Rule */}
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.sectionLabel}>
              When Should Floating Icon Appear?
            </Text>
            <View style={styles.segmentRow}>
              {(
                [
                  { id: 'ONLINE_ONLY', label: 'Only While On Duty' },
                  { id: 'ALWAYS', label: 'Always Visible' },
                ] as { id: FloatingIconVisibilityMode; label: string }[]
              ).map((opt) => {
                const active = settings.visibilityMode === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                    onPress={() => onUpdateSettings({ visibilityMode: opt.id })}
                  >
                    <Text
                      maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                      style={[styles.segmentText, active && styles.segmentTextActive]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Snap to Edge */}
            <View style={styles.settingRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.settingLabel}>
                  Auto-Snap to Screen Edge
                </Text>
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.settingDesc}>
                  Gently docks floating icon to nearest left/right edge after drag
                </Text>
              </View>
              <Switch
                value={settings.snapToEdge}
                onValueChange={(val) => onUpdateSettings({ snapToEdge: val })}
                trackColor={{ false: '#CBD5E1', true: '#99F6E4' }}
                thumbColor={settings.snapToEdge ? BRAND_COLORS.tealPrimary : '#F8FAFC'}
              />
            </View>

            {/* Pulse & Count Badge */}
            <View style={styles.settingRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.settingLabel}>
                  Glow Pulse &amp; Booking Count Badge
                </Text>
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.settingDesc}>
                  Animate halo ring &amp; show red badge when nearby bookings arrive
                </Text>
              </View>
              <Switch
                value={settings.showBadgeAndPulse}
                onValueChange={(val) => onUpdateSettings({ showBadgeAndPulse: val })}
                trackColor={{ false: '#CBD5E1', true: '#99F6E4' }}
                thumbColor={settings.showBadgeAndPulse ? BRAND_COLORS.tealPrimary : '#F8FAFC'}
              />
            </View>

            {/* Bubble Size */}
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.sectionLabel}>
              Floating Icon Size
            </Text>
            <View style={styles.segmentRow}>
              {(
                [
                  { id: 'SM', label: 'Compact' },
                  { id: 'MD', label: 'Standard' },
                  { id: 'LG', label: 'Large' },
                ] as { id: FloatingIconSize; label: string }[]
              ).map((opt) => {
                const active = settings.size === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                    onPress={() => onUpdateSettings({ size: opt.id })}
                  >
                    <Text
                      maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                      style={[styles.segmentText, active && styles.segmentTextActive]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Idle Opacity */}
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.sectionLabel}>
              Floating Icon Opacity
            </Text>
            <View style={styles.segmentRow}>
              {([100, 85, 70] as const).map((pct) => {
                const active = settings.opacityPct === pct;
                return (
                  <TouchableOpacity
                    key={pct}
                    style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                    onPress={() => onUpdateSettings({ opacityPct: pct })}
                  >
                    <Text
                      maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                      style={[styles.segmentText, active && styles.segmentTextActive]}
                    >
                      {pct}%
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Reset Position */}
            <TouchableOpacity style={styles.resetBtn} onPress={onResetPosition}>
              <Ionicons name="refresh-outline" size={16} color={BRAND_COLORS.navyPrimary} />
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.resetBtnText}>
                Reset Floating Icon to Default Corner
              </Text>
            </TouchableOpacity>

            {/* System Permission / Overlay Environment Card */}
            <View style={styles.sysCard}>
              <View style={styles.envBadgeRow}>
                <View
                  style={[
                    styles.envBadge,
                    {
                      backgroundColor: envInfo?.nativeModuleAvailable ? '#DCFCE7' : '#DBEAFE',
                    },
                  ]}
                >
                  <Text
                    maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                    style={[
                      styles.envBadgeText,
                      {
                        color: envInfo?.nativeModuleAvailable ? '#15803D' : '#1D4ED8',
                      },
                    ]}
                  >
                    {Platform.OS === 'web'
                      ? 'Web Runtime'
                      : envInfo?.nativeModuleAvailable
                        ? 'APK Overlay Service Ready'
                        : 'Expo Go • Sticky Notification Active'}
                  </Text>
                </View>

                {Platform.OS === 'android' && envInfo?.nativeModuleAvailable ? (
                  <View
                    style={[
                      styles.envBadge,
                      {
                        backgroundColor: envInfo.canDrawOverlays ? '#DCFCE7' : '#FEF3C7',
                      },
                    ]}
                  >
                    <Text
                      maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                      style={[
                        styles.envBadgeText,
                        { color: envInfo.canDrawOverlays ? '#15803D' : '#B45309' },
                      ]}
                    >
                      {envInfo.canDrawOverlays ? 'Overlay Allowed' : 'Overlay Permission Needed'}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.sysTitle}>
                Outside-App Floating Bubble &amp; Background Environment
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.sysSub}>
                {Platform.OS === 'web'
                  ? webNotifPerm === 'granted'
                    ? 'Browser notifications are active for background pickup requests.'
                    : 'Enable browser notifications so new pickup requests pop up even when minimized.'
                  : envInfo?.nativeModuleAvailable
                    ? envInfo.canDrawOverlays
                      ? 'Display-Over-Other-Apps is GRANTED. When minimized or closed, LabSetu draws the live floating bubble above other apps.'
                      : 'Tap "Allow Display Over Other Apps" below so LabSetu can keep the floating bubble visible even when closed or over Google Maps.'
                    : 'Inside Expo Go, minimizing starts a persistent LabSetu Quick-Return Duty Notification. Note: Android OS blocks true over-other-apps WindowManager overlays inside Expo Go — building an Android APK with our configured plugin (eas build -p android --profile preview) activates full over-other-apps bubble when closed.'}
              </Text>

              {Platform.OS === 'android' ? (
                <TouchableOpacity
                  style={[styles.permBtn, { backgroundColor: BRAND_COLORS.navyPrimary }]}
                  onPress={() => void openSystemOverlayPermissionSettings()}
                >
                  <Ionicons name="layers-outline" size={16} color="#FFFFFF" />
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.permBtnText}>
                    Allow Display Over Other Apps (System Settings)
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity style={styles.permBtn} onPress={onRequestOverlayPermission}>
                <Ionicons name="notifications-outline" size={16} color="#FFFFFF" />
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.permBtnText}>
                  Verify Notification &amp; Background Alerts
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
            <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.doneBtnText}>
              Save &amp; Done ✓
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 29, 66, 0.56)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  title: {
    fontSize: rf(18),
    lineHeight: lh(rf(18)),
    fontFamily: BRAND_FONTS.extraBold,
    color: BRAND_COLORS.navyPrimary,
    includeFontPadding: true,
  },
  subtitle: {
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    fontFamily: BRAND_FONTS.medium,
    color: BRAND_COLORS.muted,
    marginTop: 2,
    includeFontPadding: true,
  },
  closeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBox: {
    backgroundColor: BRAND_COLORS.canvas,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND_COLORS.border,
    marginBottom: 14,
  },
  previewOrbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  previewGlowRing: {
    backgroundColor: 'rgba(13, 148, 136, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewInnerOrb: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: BRAND_COLORS.tealPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BRAND_COLORS.navyPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  previewBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: BRAND_COLORS.crimson,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: BRAND_FONTS.bold,
  },
  previewTitle: {
    fontSize: rf(13.5),
    lineHeight: lh(rf(13.5)),
    fontFamily: BRAND_FONTS.bold,
    color: BRAND_COLORS.navyPrimary,
    flexShrink: 1,
    includeFontPadding: true,
  },
  previewSub: {
    fontSize: rf(11.5),
    fontFamily: BRAND_FONTS.regular,
    color: BRAND_COLORS.muted,
    marginTop: 3,
    lineHeight: lh(rf(11.5), 1.42),
    flexShrink: 1,
    includeFontPadding: true,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: rs(11),
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  settingLabel: {
    fontSize: rf(13.5),
    lineHeight: lh(rf(13.5)),
    fontFamily: BRAND_FONTS.bold,
    color: BRAND_COLORS.navyPrimary,
    flexShrink: 1,
    includeFontPadding: true,
  },
  settingDesc: {
    fontSize: rf(11.5),
    lineHeight: lh(rf(11.5), 1.38),
    fontFamily: BRAND_FONTS.regular,
    color: BRAND_COLORS.muted,
    marginTop: 2,
    flexShrink: 1,
    includeFontPadding: true,
  },
  sectionLabel: {
    fontSize: rf(12.5),
    lineHeight: lh(rf(12.5)),
    fontFamily: BRAND_FONTS.bold,
    color: BRAND_COLORS.navyPrimary,
    marginTop: rs(14),
    marginBottom: rs(8),
    includeFontPadding: true,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rs(8),
    marginBottom: 6,
  },
  segmentBtn: {
    flex: 1,
    minWidth: rs(92),
    backgroundColor: '#F1F5F9',
    borderRadius: 11,
    paddingVertical: rs(10),
    paddingHorizontal: rs(8),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  segmentBtnActive: {
    backgroundColor: BRAND_COLORS.tealSoft,
    borderColor: BRAND_COLORS.tealPrimary,
  },
  segmentText: {
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    fontFamily: BRAND_FONTS.semiBold,
    color: BRAND_COLORS.muted,
    textAlign: 'center',
    flexShrink: 1,
    includeFontPadding: true,
  },
  segmentTextActive: {
    color: BRAND_COLORS.tealPrimary,
    fontFamily: BRAND_FONTS.bold,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: rs(14),
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: BRAND_COLORS.border,
    borderRadius: 12,
    paddingVertical: rs(11),
    paddingHorizontal: rs(12),
  },
  resetBtnText: {
    fontSize: rf(12.5),
    lineHeight: lh(rf(12.5)),
    fontFamily: BRAND_FONTS.bold,
    color: BRAND_COLORS.navyPrimary,
    textAlign: 'center',
    flexShrink: 1,
    includeFontPadding: true,
  },
  sysCard: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: BRAND_COLORS.tealBorder,
    borderRadius: 14,
    padding: rs(13),
    marginTop: rs(14),
    marginBottom: 10,
  },
  envBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  envBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  envBadgeText: {
    fontSize: rf(10.5),
    lineHeight: lh(rf(10.5)),
    fontFamily: BRAND_FONTS.bold,
    includeFontPadding: true,
  },
  sysTitle: {
    fontSize: rf(12.5),
    lineHeight: lh(rf(12.5)),
    fontFamily: BRAND_FONTS.bold,
    color: BRAND_COLORS.navyPrimary,
    includeFontPadding: true,
  },
  sysSub: {
    fontSize: rf(11.5),
    fontFamily: BRAND_FONTS.regular,
    color: '#334155',
    marginTop: 4,
    lineHeight: lh(rf(11.5), 1.42),
    includeFontPadding: true,
  },
  permBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: BRAND_COLORS.tealPrimary,
    borderRadius: 10,
    paddingVertical: rs(10),
    paddingHorizontal: rs(12),
    marginTop: 10,
  },
  permBtnText: {
    color: '#FFFFFF',
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    fontFamily: BRAND_FONTS.bold,
    textAlign: 'center',
    flexShrink: 1,
    includeFontPadding: true,
  },
  doneBtn: {
    backgroundColor: BRAND_COLORS.navyPrimary,
    borderRadius: 13,
    paddingVertical: rs(14),
    paddingHorizontal: rs(14),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: rs(12),
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: rf(14.5),
    lineHeight: lh(rf(14.5)),
    fontFamily: BRAND_FONTS.bold,
    textAlign: 'center',
    includeFontPadding: true,
  },
});
