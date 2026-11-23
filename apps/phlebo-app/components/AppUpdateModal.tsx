import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { type AppUpdateCheckResult } from '../services/appUpdateService';
import { BRAND_COLORS, BRAND_FONTS } from './LabSetuBrand';
import { COMPACT_TEXT_SCALE, lh, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

interface AppUpdateModalProps {
  visible: boolean;
  updateData: AppUpdateCheckResult | null;
  onClose: () => void;
  onStartUpdate: (onProgress: (percent: number, stepText: string) => void) => Promise<void>;
}

export function AppUpdateModal({
  visible,
  updateData,
  onClose,
  onStartUpdate,
}: AppUpdateModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [downloadStepText, setDownloadStepText] = useState('Connecting to update server...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Rotation animation for the circular spinner
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (downloading) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnim.setValue(0);
    }
  }, [downloading, spinAnim]);

  if (!visible || !updateData) return null;

  const radius = 48;
  const strokeWidth = 7;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * downloadPercent) / 100;

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleStart = async () => {
    setDownloading(true);
    setErrorMsg(null);
    setDownloadPercent(5);
    setDownloadStepText('Connecting to update server...');

    try {
      await onStartUpdate((percent, stepText) => {
        setDownloadPercent(Math.min(100, Math.max(0, percent)));
        if (stepText) setDownloadStepText(stepText);
      });
    } catch (err: any) {
      setDownloading(false);
      setErrorMsg(err?.message || 'Update failed to download. Please check your internet and try again.');
    }
  };

  const isMandatory = Boolean(updateData.isMandatory);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Top Brand Accent Strip */}
          <View style={styles.topAccentStrip} />

          {/* Close Button (top-right) */}
          {!downloading && !isMandatory && (
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Close"
            >
              <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          )}

          <View style={styles.body}>
            {downloading ? (
              /* ============================================================== */
              /* DOWNLOADING STATE WITH CIRCULAR PROGRESS */
              /* ============================================================== */
              <View style={styles.downloadSection}>
                <View style={styles.circleContainer}>
                  {/* Rotating dashed ring */}
                  <Animated.View
                    style={[
                      styles.spinnerWrapper,
                      { transform: [{ rotate: spin }] },
                    ]}
                  >
                    <Svg width={124} height={124}>
                      <Circle
                        cx={62}
                        cy={62}
                        r={radius}
                        stroke="rgba(13, 148, 136, 0.18)"
                        strokeWidth={strokeWidth + 2}
                        strokeDasharray="14, 10"
                        fill="none"
                      />
                    </Svg>
                  </Animated.View>

                  {/* SVG Progress Ring */}
                  <Svg width={124} height={124} style={styles.svgRing}>
                    <Circle
                      cx={62}
                      cy={62}
                      r={radius}
                      stroke="#E2E8F0"
                      strokeWidth={strokeWidth}
                      fill="none"
                    />
                    <Circle
                      cx={62}
                      cy={62}
                      r={radius}
                      stroke="#0D9488"
                      strokeWidth={strokeWidth}
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      fill="none"
                      transform="rotate(-90 62 62)"
                    />
                  </Svg>

                  {/* Center Content */}
                  <View style={styles.centerLabelContainer}>
                    <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.percentText}>{Math.round(downloadPercent)}%</Text>
                    <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.centerSubLabel}>
                      {downloadPercent >= 100 ? 'Finalizing' : 'Downloading'}
                    </Text>
                  </View>
                </View>

                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.downloadTitle}>
                  {downloadPercent >= 100 ? 'Restarting App...' : 'Downloading Update...'}
                </Text>

                <View style={styles.stepBox}>
                  <Ionicons
                    name={downloadPercent >= 100 ? 'checkmark-circle' : 'cloud-download-outline'}
                    size={16}
                    color={downloadPercent >= 100 ? '#16A34A' : '#0D9488'}
                  />
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.stepText} numberOfLines={2}>
                    {downloadStepText}
                  </Text>
                </View>

                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.restartHint}>
                  The app will automatically restart once finished. Please keep this screen open.
                </Text>
              </View>
            ) : (
              /* ============================================================== */
              /* UPDATE DETAILS & PROMPT (CLEAN NORMAL ENGLISH) */
              /* ============================================================== */
              <View style={styles.overviewSection}>
                {/* Center App / Sparkles Badge */}
                <View style={styles.iconBadge}>
                  <Ionicons name="sparkles" size={26} color="#0D9488" />
                </View>

                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.title}>App Update Available</Text>

                <View style={styles.versionPill}>
                  <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={styles.versionPillText}>
                    New Version v{updateData.latestVersion}
                  </Text>
                </View>

                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.message}>
                  A fresh update is ready to install with improvements and bug fixes for a smoother experience.
                </Text>

                <View style={styles.whatsNewBox}>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.whatsNewHeading}>What&apos;s New:</Text>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.whatsNewContent}>
                    {updateData.releaseNotes ||
                      '• Faster pickup alerts & smooth navigation\n• Live GPS & performance improvements\n• Bug fixes and stability enhancements'}
                  </Text>
                </View>

                {errorMsg && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={16} color="#DC2626" />
                    <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.errorText}>{errorMsg}</Text>
                  </View>
                )}

                <View style={styles.actionRow}>
                  {!isMandatory && (
                    <TouchableOpacity
                      style={styles.btnSecondary}
                      onPress={onClose}
                      activeOpacity={0.7}
                    >
                      <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.btnSecondaryText}>Later</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.btnPrimary, { flex: isMandatory ? 1 : 1.5 }]}
                    onPress={handleStart}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="download-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.btnPrimaryText}>Update Now</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 29, 66, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: rs(20),
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(24),
    width: '100%',
    maxWidth: rs(360),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 16,
    position: 'relative',
  },
  topAccentStrip: {
    height: rs(4),
    backgroundColor: '#0D9488',
    width: '100%',
  },
  closeBtn: {
    position: 'absolute',
    top: rs(14),
    right: rs(14),
    width: rs(30),
    height: rs(30),
    borderRadius: rs(15),
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeBtnText: {
    fontFamily: BRAND_FONTS.bold,
    fontSize: rf(14),
    lineHeight: lh(rf(14)),
    color: '#64748B',
  },
  body: {
    paddingHorizontal: rs(22),
    paddingTop: rs(24),
    paddingBottom: rs(22),
  },
  overviewSection: {
    alignItems: 'center',
  },
  iconBadge: {
    width: rs(58),
    height: rs(58),
    borderRadius: rs(29),
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(14),
  },
  title: {
    fontFamily: BRAND_FONTS.extraBold,
    fontSize: rf(18),
    lineHeight: lh(rf(18)),
    color: BRAND_COLORS.navyPrimary,
    textAlign: 'center',
    marginBottom: rs(6),
  },
  versionPill: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: rs(12),
    paddingVertical: rs(4),
    borderRadius: rs(20),
    marginBottom: rs(12),
  },
  versionPillText: {
    fontFamily: BRAND_FONTS.bold,
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    color: '#0D9488',
  },
  message: {
    fontFamily: BRAND_FONTS.regular,
    fontSize: rf(13),
    color: '#475569',
    textAlign: 'center',
    lineHeight: lh(rf(13), 1.45),
    marginBottom: rs(16),
  },
  whatsNewBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: rs(14),
    padding: rs(12),
    marginBottom: rs(18),
  },
  whatsNewHeading: {
    fontFamily: BRAND_FONTS.bold,
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    color: '#334155',
    marginBottom: rs(5),
  },
  whatsNewContent: {
    fontFamily: BRAND_FONTS.medium,
    fontSize: rf(12),
    color: '#64748B',
    lineHeight: lh(rf(12), 1.45),
  },
  downloadSection: {
    alignItems: 'center',
    paddingVertical: rs(12),
  },
  circleContainer: {
    width: 124,
    height: 124,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(18),
  },
  spinnerWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 124,
    height: 124,
  },
  svgRing: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  centerLabelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentText: {
    fontFamily: BRAND_FONTS.extraBold,
    fontSize: rf(24),
    lineHeight: lh(rf(24)),
    color: BRAND_COLORS.navyPrimary,
  },
  centerSubLabel: {
    fontFamily: BRAND_FONTS.bold,
    fontSize: rf(9.5),
    lineHeight: lh(rf(9.5)),
    color: '#0D9488',
    textTransform: 'uppercase',
    marginTop: rs(2),
  },
  downloadTitle: {
    fontFamily: BRAND_FONTS.extraBold,
    fontSize: rf(16),
    lineHeight: lh(rf(16)),
    color: BRAND_COLORS.navyPrimary,
    marginBottom: rs(12),
  },
  stepBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: rs(12),
    paddingVertical: rs(9),
    borderRadius: rs(10),
    width: '100%',
    marginBottom: rs(12),
  },
  stepText: {
    fontFamily: BRAND_FONTS.semiBold,
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    color: '#0F766E',
    flex: 1,
  },
  restartHint: {
    fontFamily: BRAND_FONTS.regular,
    fontSize: rf(11.5),
    color: '#64748B',
    textAlign: 'center',
    lineHeight: lh(rf(11.5), 1.4),
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: rs(10),
    padding: rs(10),
    marginBottom: rs(14),
    width: '100%',
  },
  errorText: {
    fontFamily: BRAND_FONTS.medium,
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    color: '#DC2626',
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: rs(10),
    width: '100%',
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: rs(12),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  btnSecondaryText: {
    fontFamily: BRAND_FONTS.bold,
    fontSize: rf(13.5),
    lineHeight: lh(rf(13.5)),
    color: '#475569',
  },
  btnPrimary: {
    flexDirection: 'row',
    paddingVertical: rs(12),
    borderRadius: rs(12),
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  btnPrimaryText: {
    fontFamily: BRAND_FONTS.bold,
    fontSize: rf(13.5),
    lineHeight: lh(rf(13.5)),
    color: '#FFFFFF',
  },
});
