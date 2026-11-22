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
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { type FloatingIconSettings, DEFAULT_FLOATING_ICON_SETTINGS } from '../types/phleboTypes';
import { BRAND_COLORS, BRAND_FONTS, LabSetuLogoMark, PhleboCourierBikeMark } from './LabSetuBrand';
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
  const [isDismissed, setIsDismissed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isOverDismissZone, setIsOverDismissZone] = useState(false);
  const isOverDismissZoneRef = useRef(false);

  useEffect(() => {
    setIsDismissed(false);
  }, [resetNonce, visible]);

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
        isOverDismissZoneRef.current = false;
        setIsOverDismissZone(false);
      },
      onPanResponderMove: (_evt, gesture) => {
        pan.setValue({ x: gesture.dx, y: gesture.dy });
        const b = boundsRef.current;
        const foot = propsRef.current.orbFootprint;
        const moved = Math.hypot(gesture.dx, gesture.dy);
        if (moved > 10) {
          setIsDragging(true);
        }
        const currentX = currentPosRef.current.x + gesture.dx;
        const currentY = currentPosRef.current.y + gesture.dy;
        const targetCenterX = b.safeW / 2;
        const targetCenterY = b.safeH - insets.bottom - 45;
        const dist = Math.hypot(currentX + foot / 2 - targetCenterX, currentY + foot / 2 - targetCenterY);
        const isOver = dist < 70 || (currentY + foot > b.safeH - insets.bottom - 40 && Math.abs(currentX + foot / 2 - targetCenterX) < 65);
        if (isOver !== isOverDismissZoneRef.current) {
          isOverDismissZoneRef.current = isOver;
          setIsOverDismissZone(isOver);
          if (isOver) {
            try {
              Vibration.vibrate(35);
            } catch { }
          }
        }
      },
      onPanResponderRelease: (_evt, gesture) => {
        pan.flattenOffset();
        setIsDragging(false);
        const wasOver = isOverDismissZoneRef.current;
        setIsOverDismissZone(false);
        isOverDismissZoneRef.current = false;

        if (wasOver) {
          try {
            Vibration.vibrate(50);
          } catch { }
          setIsDismissed(true);
          return;
        }

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

  if (!visible || isDismissed) return null;

  const hasRequests = nearbyOpenCount > 0;

  // Smart clamped popup modal position so it NEVER gets hidden/clipped by any screen edge
  const safeLeftEdge = insets.left + 14;
  const safeRightEdge = insets.right + 14;
  const safeTopEdge = insets.top + 14;
  const safeBottomEdge = insets.bottom + 14;
  const availWidth = Math.max(220, bounds.safeW - safeLeftEdge - safeRightEdge);
  const cardWidth = Math.min(320, availWidth);
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
              {/* Executive Dark Navy Header */}
              <View style={styles.menuHeaderCard}>
                <View style={styles.menuAppLogoPill}>
                  <PhleboCourierBikeMark size={24} />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuHeaderTitle}>
                    LabSetu Partner Radar
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuHeaderSub}>
                    {isOnline ? '● On Duty • Live Pickups Active' : '⚪ Off Duty • Standby Mode'}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setMenuOpen(false)}
                  style={styles.menuHeaderCloseBtn}
                  hitSlop={8}
                  accessibilityLabel="Close quick radar"
                >
                  <Ionicons name="close" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              {/* 3-Mode Duty Switcher */}
              <View style={styles.menuDutyRow}>
                <TouchableOpacity
                  style={[
                    styles.menuDutyBtn,
                    {
                      backgroundColor: isOnline ? BRAND_COLORS.emeraldSoft : '#F8FAFC',
                      borderColor: isOnline ? BRAND_COLORS.emerald : '#E2E8F0',
                      borderWidth: isOnline ? 2 : 1,
                    },
                  ]}
                  onPress={() => {
                    setMenuOpen(false);
                    onChangeDuty('ONLINE');
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                    style={[
                      styles.menuDutyBtnText,
                      { color: isOnline ? BRAND_COLORS.emerald : BRAND_COLORS.muted },
                    ]}
                  >
                    🟢 Online
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.menuDutyBtn,
                    {
                      backgroundColor: '#F8FAFC',
                      borderColor: '#E2E8F0',
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => {
                    setMenuOpen(false);
                    onChangeDuty('BREAK');
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                    style={[styles.menuDutyBtnText, { color: BRAND_COLORS.muted }]}
                  >
                    ☕ Break
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.menuDutyBtn,
                    {
                      backgroundColor: !isOnline ? BRAND_COLORS.crimsonSoft : '#F8FAFC',
                      borderColor: !isOnline ? BRAND_COLORS.crimson : '#E2E8F0',
                      borderWidth: !isOnline ? 2 : 1,
                    },
                  ]}
                  onPress={() => {
                    setMenuOpen(false);
                    onChangeDuty('OFFLINE');
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                    style={[
                      styles.menuDutyBtnText,
                      { color: !isOnline ? BRAND_COLORS.crimson : BRAND_COLORS.muted },
                    ]}
                  >
                    🔴 Offline
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Action Tile 1: Today's Collections */}
              {onOpenTodayCollections ? (
                <TouchableOpacity
                  style={styles.menuActionTile}
                  onPress={() => {
                    setMenuOpen(false);
                    onOpenTodayCollections();
                  }}
                >
                  <View style={[styles.menuTileIconBox, { backgroundColor: '#CCFBF1' }]}>
                    <Ionicons name="cube-outline" size={18} color="#0D9488" />
                  </View>
                  <View style={styles.menuTileCol}>
                    <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuTileTitle}>
                      Today&apos;s Collections
                    </Text>
                    <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuTileSub}>
                      View sample pickups, test tubes &amp; status
                    </Text>
                  </View>
                  <View style={styles.menuTileBadgePill}>
                    <Text style={styles.menuTileBadgeText}>Open ➔</Text>
                  </View>
                </TouchableOpacity>
              ) : null}

              {/* Action Tile 2: 1-5 km Pickup Pool */}
              <TouchableOpacity
                style={[styles.menuActionTile, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}
                onPress={() => {
                  setMenuOpen(false);
                  onOpenNearbyPool();
                }}
              >
                <View style={[styles.menuTileIconBox, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="flash-outline" size={18} color="#D97706" />
                </View>
                <View style={styles.menuTileCol}>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={[styles.menuTileTitle, { color: '#B45309' }]}>
                    1–5 km Pickup Pool
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuTileSub}>
                    {hasRequests ? `${nearbyOpenCount} urgent orders waiting` : 'Scan active sample requests nearby'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.menuTileBadgePill,
                    hasRequests ? { backgroundColor: '#EF4444' } : { backgroundColor: '#FEF3C7' },
                  ]}
                >
                  <Text
                    style={[
                      styles.menuTileBadgeText,
                      hasRequests ? { color: '#FFFFFF' } : { color: '#D97706' },
                    ]}
                  >
                    {hasRequests ? `${nearbyOpenCount} Urgent` : 'Radar ➔'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Action Tile 3: Admin Zone & Live GPS */}
              <TouchableOpacity
                style={styles.menuActionTile}
                onPress={() => {
                  setMenuOpen(false);
                  onOpenLocationPicker();
                }}
              >
                <View style={[styles.menuTileIconBox, { backgroundColor: '#E2E8F0' }]}>
                  <Ionicons name="location-outline" size={18} color={BRAND_COLORS.navyPrimary} />
                </View>
                <View style={styles.menuTileCol}>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuTileTitle}>
                    Admin Zone &amp; Live GPS
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuTileSub}>
                    {gpsLabel}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={BRAND_COLORS.muted} />
              </TouchableOpacity>

              {/* Action Tile 4: Floating Icon Settings */}
              <TouchableOpacity
                style={styles.menuActionTile}
                onPress={() => {
                  setMenuOpen(false);
                  onOpenFloatingSettings();
                }}
              >
                <View style={[styles.menuTileIconBox, { backgroundColor: '#E2E8F0' }]}>
                  <Ionicons name="options-outline" size={18} color={BRAND_COLORS.navyPrimary} />
                </View>
                <View style={styles.menuTileCol}>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuTileTitle}>
                    Floating Icon Settings
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.menuTileSub}>
                    Customize size, snap &amp; opacity
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={BRAND_COLORS.muted} />
              </TouchableOpacity>

              <Text style={styles.menuFooterText}>
                📍 GPS Active • Serviceable Area Ready
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Drag-to-Dismiss Bottom Cross Target ('✕') */}
      {isDragging ? (
        <View
          pointerEvents="none"
          style={[
            styles.dismissTargetContainer,
            {
              bottom: insets.bottom + 24,
              left: (bounds.safeW - 120) / 2,
            },
          ]}
        >
          <View
            style={[
              styles.dismissTargetCircle,
              {
                backgroundColor: isOverDismissZone ? '#991B1B' : '#E11D48',
                transform: [{ scale: isOverDismissZone ? 1.25 : 1 }],
              },
            ]}
          >
            <Text style={styles.dismissTargetCross}>✕</Text>
          </View>
          <Text style={styles.dismissTargetLabel}>
            {isOverDismissZone ? 'Drop to Close' : 'Drag here to close'}
          </Text>
        </View>
      ) : null}

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
            <PhleboCourierBikeMark size={Math.round(bubbleSize * 0.72)} />

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
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#0D9488',
    padding: 14,
    shadowColor: '#0A2A5E',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 22,
  },
  menuHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A2A5E',
    borderRadius: 14,
    padding: 10,
    gap: 10,
    marginBottom: 10,
  },
  menuAppLogoPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuHeaderTitle: {
    fontSize: rf(13.5),
    lineHeight: lh(rf(13.5)),
    fontFamily: BRAND_FONTS.bold,
    color: '#FFFFFF',
    includeFontPadding: true,
  },
  menuHeaderSub: {
    fontSize: rf(10.5),
    lineHeight: lh(rf(10.5)),
    fontFamily: BRAND_FONTS.semiBold,
    color: '#34D399',
    marginTop: 1,
    includeFontPadding: true,
  },
  menuHeaderCloseBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuDutyRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  menuDutyBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuDutyBtnText: {
    fontSize: rf(11.5),
    lineHeight: lh(rf(11.5)),
    fontFamily: BRAND_FONTS.bold,
    textAlign: 'center',
    includeFontPadding: true,
  },
  menuActionTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDFA',
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
  },
  menuTileIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTileCol: {
    flex: 1,
    minWidth: 0,
  },
  menuTileTitle: {
    color: '#0F766E',
    fontSize: rf(12.5),
    lineHeight: lh(rf(12.5)),
    fontFamily: BRAND_FONTS.bold,
    includeFontPadding: true,
  },
  menuTileSub: {
    color: '#475569',
    fontSize: rf(10),
    lineHeight: lh(rf(10)),
    fontFamily: BRAND_FONTS.medium,
    marginTop: 1,
    includeFontPadding: true,
  },
  menuTileBadgePill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#E6F7F5',
  },
  menuTileBadgeText: {
    fontSize: rf(10.5),
    lineHeight: lh(rf(10.5)),
    fontFamily: BRAND_FONTS.bold,
    color: '#0D9488',
    includeFontPadding: true,
  },
  menuFooterText: {
    fontSize: rf(10.5),
    lineHeight: lh(rf(10.5)),
    fontFamily: BRAND_FONTS.semiBold,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 2,
    includeFontPadding: true,
  },
  dismissTargetContainer: {
    position: 'absolute',
    width: 120,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 30,
  },
  dismissTargetCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E11D48',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 16,
  },
  dismissTargetCross: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  dismissTargetLabel: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontFamily: BRAND_FONTS.bold,
    textAlign: 'center',
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

export default FloatingDispatchOverlay;

