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
import { BRAND_COLORS } from './LabSetuBrand';
import { type AppUpdateCheckResult } from '../services/appUpdateService';

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
  const [downloadStepText, setDownloadStepText] = useState('Connecting to LabSetu release servers...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Rotation animation for the spinning circle ring
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

  const radius = 54;
  const strokeWidth = 8;
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
      setErrorMsg(err?.message || 'Failed to complete update download. Please retry.');
    }
  };

  const isMandatory = Boolean(updateData.isMandatory);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={modalStyles.backdrop}>
        <View style={modalStyles.card}>
          {/* Header Strip */}
          <View style={modalStyles.header}>
            <View style={modalStyles.headerIcon}>
              <Ionicons name="rocket-outline" size={24} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={modalStyles.title}>
                {downloading ? 'Downloading Update...' : 'New Update Available!'}
              </Text>
              <Text style={modalStyles.versionRow}>
                Current: <Text style={{ fontWeight: '700' }}>v{updateData.currentVersion}</Text> → New: <Text style={{ fontWeight: '700', color: '#0D9488' }}>v{updateData.latestVersion}</Text>
              </Text>
            </View>
            {!downloading && !isMandatory && (
              <TouchableOpacity onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {downloading ? (
            /* ============================================================== */
            /* DOWNLOADING CIRCULAR PROGRESS WITH ROTATING ANIMATION */
            /* ============================================================== */
            <View style={modalStyles.downloadContainer}>
              <View style={modalStyles.circleContainer}>
                {/* Continuous rotating pulse behind the ring */}
                <Animated.View
                  style={[
                    modalStyles.spinnerWrapper,
                    { transform: [{ rotate: spin }] },
                  ]}
                >
                  <Svg width={140} height={140}>
                    <Circle
                      cx={70}
                      cy={70}
                      r={radius}
                      stroke="rgba(13, 148, 136, 0.15)"
                      strokeWidth={strokeWidth + 2}
                      strokeDasharray="18, 12"
                      fill="none"
                    />
                  </Svg>
                </Animated.View>

                {/* SVG Progress Ring */}
                <Svg width={140} height={140} style={modalStyles.svgRing}>
                  {/* Background Track */}
                  <Circle
                    cx={70}
                    cy={70}
                    r={radius}
                    stroke="#E2E8F0"
                    strokeWidth={strokeWidth}
                    fill="none"
                  />
                  {/* Animated Filled Stroke */}
                  <Circle
                    cx={70}
                    cy={70}
                    r={radius}
                    stroke="#0D9488"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="none"
                    transform="rotate(-90 70 70)"
                  />
                </Svg>

                {/* Center Content: Percentage & Icon */}
                <View style={modalStyles.centerLabelContainer}>
                  <Text style={modalStyles.percentText}>{Math.round(downloadPercent)}%</Text>
                  <Text style={modalStyles.centerSubLabel}>
                    {downloadPercent >= 100 ? 'Finalizing' : 'Downloading'}
                  </Text>
                </View>
              </View>

              {/* Live Step Caption */}
              <View style={modalStyles.stepBox}>
                <Ionicons
                  name={downloadPercent >= 100 ? 'checkmark-circle' : 'cloud-download-outline'}
                  size={18}
                  color={downloadPercent >= 100 ? '#16A34A' : '#0D9488'}
                />
                <Text style={modalStyles.stepText} numberOfLines={2}>
                  {downloadStepText}
                </Text>
              </View>

              <Text style={modalStyles.autoRestartHint}>
                ⚡ App will automatically restart as soon as the download finishes. Please do not close the app.
              </Text>
            </View>
          ) : (
            /* ============================================================== */
            /* UPDATE OVERVIEW & RELEASE NOTES */
            /* ============================================================== */
            <View style={modalStyles.bodyContainer}>
              <View style={modalStyles.patchBanner}>
                <Ionicons name="sparkles" size={18} color="#0D9488" />
                <Text style={modalStyles.patchBannerText}>
                  {updateData.updateType === 'OTA'
                    ? 'Instant Hotfix Patch: Fast in-app download with automatic reload.'
                    : 'Full Application Release: Includes native performance improvements.'}
                </Text>
              </View>

              <Text style={modalStyles.sectionTitle}>What&apos;s New:</Text>
              <View style={modalStyles.releaseNotesBox}>
                <Text style={modalStyles.releaseNotesText}>
                  {updateData.releaseNotes ||
                    '• Enhanced Rapido-style incoming booking alerts\n• Separate dynamic Profile & secure bank management\n• Direct automatic update download with rotating circle\n• Performance optimizations and bug fixes.'}
                </Text>
              </View>

              {errorMsg && (
                <View style={modalStyles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color="#DC2626" />
                  <Text style={modalStyles.errorText}>{errorMsg}</Text>
                </View>
              )}

              {/* Action Buttons */}
              <View style={modalStyles.actionRow}>
                {!isMandatory && (
                  <TouchableOpacity
                    style={modalStyles.btnSecondary}
                    onPress={onClose}
                    activeOpacity={0.75}
                  >
                    <Text style={modalStyles.btnSecondaryText}>Later</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[modalStyles.btnPrimary, { flex: isMandatory ? 1 : 1.6 }]}
                  onPress={handleStart}
                  activeOpacity={0.85}
                >
                  <Ionicons name="download-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={modalStyles.btnPrimaryText}>Update &amp; Restart Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 29, 66, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    width: '100%',
    maxWidth: 390,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#061D42',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  versionRow: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  downloadContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
  },
  circleContainer: {
    width: 140,
    height: 140,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  spinnerWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 140,
    height: 140,
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
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  centerSubLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0D9488',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  stepBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    width: '100%',
    marginBottom: 14,
  },
  stepText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F766E',
    flex: 1,
  },
  autoRestartHint: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
  },
  bodyContainer: {
    padding: 20,
  },
  patchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  patchBannerText: {
    fontSize: 12,
    color: '#0F766E',
    flex: 1,
    lineHeight: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  releaseNotesBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    maxHeight: 120,
  },
  releaseNotesText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  btnSecondaryText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#475569',
  },
  btnPrimary: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPrimaryText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
