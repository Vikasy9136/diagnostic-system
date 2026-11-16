import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  type LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  type ScaledSize,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { type FloatingIconSettings, DEFAULT_FLOATING_ICON_SETTINGS } from '../types/phleboTypes';
import { BRAND_COLORS, BRAND_FONTS, LabSetuLogoMark } from './LabSetuBrand';
import { COMPACT_TEXT_SCALE, lh, MAX_TEXT_SCALE, rf } from '../utils/responsive';

export interface FloatingDispatchOverlayProps {
  visible: boolean;
  isOnline: boolean;
  nearbyOpenCount: number;
  gpsLabel: string;
  settings?: FloatingIconSettings;
  resetNonce?: number;
  onOpenNearbyPool: () => void;
  onOpenTodayCollections?: () => void;
  onOpenBroadcastPopup: () => void;
  onOpenLocationPicker: () => void;
  onOpenFloatingSettings: () => void;
  onChangeDuty: (status: 'ONLINE' | 'BREAK' | 'OFFLINE') => void;
}

const EDGE_MARGIN = 12;

export function FloatingDispatchOverlay({
  visible,
  isOnline,
  nearbyOpenCount,
  gpsLabel,
  settings = DEFAULT_FLOATING_ICON_SETTINGS,
  resetNonce = 0,
  onOpenNearbyPool,
  onOpenTodayCollections,
  onOpenBroadcastPopup,
  onOpenLocationPicker,
  onOpenFloatingSettings,
  onChangeDuty,
}: FloatingDispatchOverlayProps) {
  const insets = useSafeAreaInsets();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [measuredMenuHeight, setMeasuredMenuHeight] = useState(280);

  const bubbleSize =
    settings.size === 'SM' ? 56 : settings.size === 'LG' ? 80 : 68;
  const ringPadding = 8;
  const orbFootprint = bubbleSize + ringPadding;

  const bounds = useMemo(() => {
    const safeW = winWidth > 0 ? winWidth : Dimensions.get('window').width || 375;
    const safeH = winHeight > 0 ? winHeight : Dimensions.get('window').height || 760;
    const minX = insets.left + EDGE_MARGIN;
    const maxX = Math.max(minX, safeW - insets.right - orbFootprint - EDGE_MARGIN);
    const minY = Math.max(70, insets.top + 12);
    const maxY = Math.max(minY, safeH - insets.bottom - orbFootprint - 78);
    return { safeW, safeH, minX, maxX, minY, maxY };
  }, [winWidth, winHeight, insets.left, insets.right, insets.top, insets.bottom, orbFootprint]);

  const getInitialCoords = () => ({
    x: bounds.maxX,
    y: Math.min(bounds.maxY, Math.max(bounds.minY, Math.round(bounds.safeH * 0.42))),
  });

  const pan = useRef(new Animated.ValueXY(getInitialCoords())).current;
  const currentPosRef = useRef(getInitialCoords());
  const [anchorPos, setAnchorPos] = useState(getInitialCoords);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const propsRef = useRef({
    nearbyOpenCount,
    snapToEdge: settings.snapToEdge,
    orbFootprint,
    onOpenBroadcastPopup,
  });
  propsRef.current = {
    nearbyOpenCount,
    snapToEdge: settings.snapToEdge,
    orbFootprint,
    onOpenBroadcastPopup,
  };

  useEffect(() => {
    if (resetNonce > 0) {
      const next = {
        x: bounds.maxX,
        y: Math.min(bounds.maxY, Math.max(bounds.minY, Math.round(bounds.safeH * 0.42))),
      };
      currentPosRef.current = next;
      setAnchorPos(next);
      Animated.spring(pan, {
        toValue: next,
        friction: 7,
        tension: 65,
        useNativeDriver: false,
      }).start();
    }
  }, [resetNonce, bounds.maxX, bounds.maxY, bounds.minY, bounds.safeH, pan]);

  useEffect(() => {
    const clampedX = Math.min(Math.max(bounds.minX, currentPosRef.current.x), bounds.maxX);
    const clampedY = Math.min(Math.max(bounds.minY, currentPosRef.current.y), bounds.maxY);
    if (clampedX !== currentPosRef.current.x || clampedY !== currentPosRef.current.y) {
      currentPosRef.current = { x: clampedX, y: clampedY };
      setAnchorPos({ x: clampedX, y: clampedY });
      pan.setValue({ x: clampedX, y: clampedY });
    }
  }, [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, pan]);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: { window: ScaledSize }) => {
      const b = boundsRef.current;
      const foot = propsRef.current.orbFootprint;
      const maxX = Math.max(b.minX, window.width - insets.right - foot - EDGE_MARGIN);
      const maxY = Math.max(b.minY, window.height - insets.bottom - foot - 78);
      const clampedX = Math.min(Math.max(b.minX, currentPosRef.current.x), maxX);
      const clampedY = Math.min(Math.max(b.minY, currentPosRef.current.y), maxY);
      currentPosRef.current = { x: clampedX, y: clampedY };
      setAnchorPos({ x: clampedX, y: clampedY });
      pan.setValue({ x: clampedX, y: clampedY });
    });
    return () => {
      sub.remove();
    };
  }, [insets.right, insets.bottom, pan]);

  useEffect(() => {
    if (!visible || !settings.showBadgeAndPulse) {
      pulseAnim.setValue(1);
      if (!visible) setMenuOpen(false);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: nearbyOpenCount > 0 ? 1.11 : 1.045,
          duration: nearbyOpenCount > 0 ? 520 : 1300,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: nearbyOpenCount > 0 ? 520 : 1300,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [visible, nearbyOpenCount, settings.showBadgeAndPulse, pulseAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: currentPosRef.current.x,
          y: currentPosRef.current.y,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_evt, gesture) => {
        pan.flattenOffset();
        const b = boundsRef.current;
        const foot = propsRef.current.orbFootprint;
        const movedDistance = Math.hypot(gesture.dx, gesture.dy);

        const rawX = currentPosRef.current.x + gesture.dx;
        const rawY = currentPosRef.current.y + gesture.dy;

        const clampedY = Math.min(Math.max(b.minY, rawY), b.maxY);
        const clampedX =
          propsRef.current.snapToEdge && movedDistance > 8
            ? rawX + foot / 2 < b.safeW / 2
              ? b.minX
              : b.maxX
            : Math.min(Math.max(b.minX, rawX), b.maxX);

        currentPosRef.current = { x: clampedX, y: clampedY };
        setAnchorPos({ x: clampedX, y: clampedY });
        Animated.spring(pan, {
          toValue: { x: clampedX, y: clampedY },
          friction: 7,
          tension: 70,
          useNativeDriver: false,
        }).start();

        if (movedDistance <= 6) {
          if (propsRef.current.nearbyOpenCount > 0) {
            setMenuOpen(false);
            propsRef.current.onOpenBroadcastPopup();
          } else {
            setMenuOpen((prev) => !prev);
          }
        }
      },
    })
  ).current;

  if (!visible) return null;

  const hasRequests = nearbyOpenCount > 0;

  // Smart clamped popup modal position so it NEVER gets hidden/clipped by any screen edge
  const safeLeftEdge = insets.left + 14;
  const safeRightEdge = insets.right + 14;
  const safeTopEdge = insets.top + 14;
  const safeBottomEdge = insets.bottom + 14;
  const availWidth = Math.max(220, bounds.safeW - safeLeftEdge - safeRightEdge);
  const cardWidth = Math.min(296, availWidth);
  const availHeight = Math.max(220, bounds.safeH - safeTopEdge - safeBottomEdge);

  const isBubbleOnRightHalf = anchorPos.x + orbFootprint / 2 >= bounds.safeW / 2;
  const preferredLeft = isBubbleOnRightHalf
    ? anchorPos.x + orbFootprint - cardWidth
    : anchorPos.x;
  const clampedMenuLeft = Math.max(
    safeLeftEdge,
    Math.min(preferredLeft, bounds.safeW - safeRightEdge - cardWidth)
  );

  const estHeight = Math.min(measuredMenuHeight, availHeight);
  const fitsAbove = anchorPos.y - estHeight - 10 >= safeTopEdge;
  const fitsBelow = anchorPos.y + orbFootprint + 10 + estHeight <= bounds.safeH - safeBottomEdge;
  let candidateTop: number;
  if (fitsAbove) {
    candidateTop = anchorPos.y - estHeight - 10;
  } else if (fitsBelow) {
    candidateTop = anchorPos.y + orbFootprint + 10;
  } else {
    candidateTop = Math.round((bounds.safeH - estHeight) / 2);
  }
  const clampedMenuTop = Math.max(
    safeTopEdge,
    Math.min(candidateTop, bounds.safeH - safeBottomEdge - estHeight)
  );

  const handleMenuLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 40 && Math.abs(h - measuredMenuHeight) > 4) {
      setMeasuredMenuHeight(h);
    }
  };

  return (
    <>
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.modalLayer}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />

          <View
            onLayout={handleMenuLayout}
            style={[
              styles.quickMenuCard,
              {
                position: 'absolute',
                left: clampedMenuLeft,
                top: clampedMenuTop,
                width: cardWidth,
                maxHeight: availHeight,
              },
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <View style={styles.quickMenuTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickMenuTitle}>
                    LabSetu Quick Radar
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickMenuSub}>
                    {gpsLabel}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <View
                    style={[
                      styles.quickStatusPill,
                      { backgroundColor: isOnline ? BRAND_COLORS.emeraldSoft : '#F1F5F9' },
                    ]}
                  >
                    <Text
                      maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                      style={[
                        styles.quickStatusText,
                        { color: isOnline ? BRAND_COLORS.emerald : BRAND_COLORS.muted },
                      ]}
                    >
                      {isOnline ? '● Online' : 'Offline'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => setMenuOpen(false)}
                    style={styles.quickCloseBtn}
                    hitSlop={8}
                    accessibilityLabel="Close quick radar"
                  >
                    <Ionicons name="close" size={16} color={BRAND_COLORS.navyPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.quickMenuItem}
                onPress={() => {
                  setMenuOpen(false);
                  onOpenNearbyPool();
                }}
              >
                <Ionicons name="flash-outline" size={16} color={BRAND_COLORS.tealPrimary} />
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickMenuItemText}>
                  Open 1–5 km Pickup Pool
                </Text>
                <Ionicons name="chevron-forward" size={15} color={BRAND_COLORS.muted} />
              </TouchableOpacity>

              {onOpenTodayCollections ? (
                <TouchableOpacity
                  style={styles.quickMenuItem}
                  onPress={() => {
                    setMenuOpen(false);
                    onOpenTodayCollections();
                  }}
                >
                  <Ionicons name="calendar-outline" size={16} color={BRAND_COLORS.navyPrimary} />
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickMenuItemText}>
                    Today&apos;s Collections
                  </Text>
                  <Ionicons name="chevron-forward" size={15} color={BRAND_COLORS.muted} />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.quickMenuItem}
                onPress={() => {
                  setMenuOpen(false);
                  onOpenLocationPicker();
                }}
              >
                <Ionicons name="location-outline" size={16} color={BRAND_COLORS.navyPrimary} />
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickMenuItemText}>
                  Admin Zone &amp; Live GPS
                </Text>
                <Ionicons name="chevron-forward" size={15} color={BRAND_COLORS.muted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickMenuItem}
                onPress={() => {
                  setMenuOpen(false);
                  onOpenFloatingSettings();
                }}
              >
                <Ionicons name="options-outline" size={16} color={BRAND_COLORS.navyPrimary} />
                <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.quickMenuItemText}>
                  Floating Icon Settings
                </Text>
                <Ionicons name="chevron-forward" size={15} color={BRAND_COLORS.muted} />
              </TouchableOpacity>

              <View style={styles.quickMenuDutyRow}>
                {isOnline ? (
                  <>
                    <TouchableOpacity
                      style={[styles.quickDutyBtn, { backgroundColor: '#FEF3C7' }]}
                      onPress={() => {
                        setMenuOpen(false);
                        onChangeDuty('BREAK');
                      }}
                    >
                      <Text
                        maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                        style={[styles.quickDutyText, { color: '#B45309' }]}
                      >
                        Break
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickDutyBtn, { backgroundColor: '#FEE2E2' }]}
                      onPress={() => {
                        setMenuOpen(false);
                        onChangeDuty('OFFLINE');
                      }}
                    >
                      <Text
                        maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                        style={[styles.quickDutyText, { color: '#B91C1C' }]}
                      >
                        Go Offline
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.quickDutyBtn, { backgroundColor: BRAND_COLORS.emeraldSoft }]}
                    onPress={() => {
                      setMenuOpen(false);
                      onChangeDuty('ONLINE');
                    }}
                  >
                    <Text
                      maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                      style={[styles.quickDutyText, { color: BRAND_COLORS.emerald }]}
                    >
                      ● Go Online Now
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.overlayContainer,
          Platform.OS === 'web' ? ({ position: 'fixed' } as unknown as object) : null,
          {
            left: pan.x,
            top: pan.y,
            opacity: settings.opacityPct / 100,
          },
        ]}
      >
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.outerGlowRing,
            {
              width: orbFootprint,
              height: orbFootprint,
              borderRadius: orbFootprint / 2,
              backgroundColor: hasRequests
                ? 'rgba(245, 158, 11, 0.25)'
                : isOnline
                  ? 'rgba(13, 148, 136, 0.20)'
                  : 'rgba(100, 116, 139, 0.20)',
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <View
            style={[
              styles.floatingOrb,
              {
                width: bubbleSize,
                height: bubbleSize,
                borderRadius: bubbleSize / 2,
                borderColor: hasRequests
                  ? '#F59E0B'
                  : isOnline
                    ? BRAND_COLORS.tealPrimary
                    : '#94A3B8',
              },
            ]}
          >
            <LabSetuLogoMark size={Math.round(bubbleSize * 0.66)} />

            <View
              style={[
                styles.liveDot,
                {
                  backgroundColor: hasRequests
                    ? '#F59E0B'
                    : isOnline
                      ? BRAND_COLORS.emerald
                      : '#94A3B8',
                },
              ]}
            />

            {settings.showBadgeAndPulse && hasRequests ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{nearbyOpenCount}</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    zIndex: 9900,
    elevation: 20,
  },
  modalLayer: {
    flex: 1,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6, 29, 66, 0.28)',
  },
  outerGlowRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingOrb: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0A2A5E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 14,
  },
  liveDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#DC2626',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontFamily: BRAND_FONTS.extraBold,
  },
  quickMenuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCE5F2',
    padding: 13,
    shadowColor: '#0A2A5E',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 20,
    elevation: 18,
  },
  quickMenuTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  quickMenuTitle: {
    fontSize: rf(13.5),
    lineHeight: lh(rf(13.5)),
    fontFamily: BRAND_FONTS.bold,
    color: BRAND_COLORS.navyPrimary,
    includeFontPadding: true,
  },
  quickMenuSub: {
    fontSize: rf(11),
    lineHeight: lh(rf(11)),
    fontFamily: BRAND_FONTS.medium,
    color: BRAND_COLORS.muted,
    marginTop: 1,
    includeFontPadding: true,
  },
  quickStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  quickStatusText: {
    fontSize: rf(10.5),
    lineHeight: lh(rf(10.5)),
    fontFamily: BRAND_FONTS.bold,
    includeFontPadding: true,
  },
  quickCloseBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F4F8FC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 9.5,
    marginBottom: 7,
  },
  quickMenuItemText: {
    flex: 1,
    color: BRAND_COLORS.navyPrimary,
    fontSize: rf(12),
    lineHeight: lh(rf(12)),
    fontFamily: BRAND_FONTS.semiBold,
    flexShrink: 1,
    includeFontPadding: true,
  },
  quickMenuDutyRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 3,
  },
  quickDutyBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickDutyText: {
    fontSize: rf(11.5),
    lineHeight: lh(rf(11.5)),
    fontFamily: BRAND_FONTS.bold,
    textAlign: 'center',
    includeFontPadding: true,
  },
});

export default FloatingDispatchOverlay;

