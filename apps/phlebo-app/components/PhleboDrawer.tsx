import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BRAND_COLORS, BRAND_FONTS, LabSetuLogoMark, LabSetuWordmark } from './LabSetuBrand';
import { type BottomTab, type ScreenType } from '../types/phleboTypes';
import { lh, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

interface PhleboDrawerProps {
  visible: boolean;
  phleboName: string;
  courierId: string;
  isOnline: boolean;
  activeTab: BottomTab;
  currentScreen?: ScreenType;
  pendingCount: number;
  todayPendingCount?: number;
  onClose: () => void;
  onNavigateTab: (tab: BottomTab, screenReset?: boolean) => void;
  onOpenTodayCollections?: () => void;
  onOpenFloatingSettings: () => void;
  onOpenTrainingSops: () => void;
  onOpenMySupplies?: () => void;
  isKitModuleActive?: boolean;
  onOpenHelpSupport: () => void;
  onLogout: () => void;
}

export function PhleboDrawer({
  visible,
  phleboName,
  courierId,
  isOnline,
  activeTab,
  currentScreen,
  pendingCount,
  todayPendingCount,
  onClose,
  onNavigateTab,
  onOpenTodayCollections,
  onOpenFloatingSettings,
  onOpenTrainingSops,
  onOpenMySupplies,
  isKitModuleActive = false,
  onOpenHelpSupport,
  onLogout,
}: PhleboDrawerProps) {
  const insets = useSafeAreaInsets();
  const { width: winWidth } = useWindowDimensions();
  const drawerWidth = Math.min(310, Math.round(winWidth * 0.82));
  const slideX = useRef(new Animated.Value(-drawerWidth)).current;

  useEffect(() => {
    Animated.timing(slideX, {
      toValue: visible ? 0 : -drawerWidth,
      duration: visible ? 220 : 180,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [visible, drawerWidth, slideX]);

  if (!visible) return null;

  const navItems: {
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    active?: boolean;
    badge?: number;
    onPress: () => void;
  }[] = [
      {
        key: 'home',
        label: 'Home',
        icon: 'home-outline',
        active: activeTab === 'home' && currentScreen !== 'TODAYS_COLLECTIONS',
        onPress: () => {
          onClose();
          onNavigateTab('home', true);
        },
      },
      {
        key: 'collections',
        label: "Today's Collections",
        icon: 'clipboard-outline',
        active: activeTab === 'home' && currentScreen === 'TODAYS_COLLECTIONS',
        badge:
          typeof todayPendingCount === 'number'
            ? todayPendingCount > 0
              ? todayPendingCount
              : undefined
            : pendingCount > 0
            ? pendingCount
            : undefined,
        onPress: () => {
          onClose();
          if (onOpenTodayCollections) {
            onOpenTodayCollections();
          } else {
            onNavigateTab('home', true);
          }
        },
      },
      {
        key: 'history',
        label: 'Collection History',
        icon: 'time-outline',
        active: activeTab === 'bookings',
        onPress: () => {
          onClose();
          onNavigateTab('bookings');
        },
      },
      {
        key: 'earnings',
        label: 'Reports & Payouts',
        icon: 'bar-chart-outline',
        active: activeTab === 'earnings',
        onPress: () => {
          onClose();
          onNavigateTab('earnings');
        },
      },
      {
        key: 'floating',
        label: 'Floating Icon Settings',
        icon: 'radio-button-on-outline',
        onPress: () => {
          onClose();
          onOpenFloatingSettings();
        },
      },
      {
        key: 'training',
        label: 'Training & SOPs',
        icon: 'book-outline',
        onPress: () => {
          onClose();
          onOpenTrainingSops();
        },
      },
      ...(isKitModuleActive
        ? [
            {
              key: 'supplies' as const,
              label: 'My Collection Kits & Supplies',
              icon: 'briefcase-outline' as const,
              onPress: () => {
                onClose();
                onOpenMySupplies?.();
              },
            },
          ]
        : []),
      {
        key: 'support',
        label: 'Help & Support',
        icon: 'headset-outline',
        onPress: () => {
          onClose();
          onOpenHelpSupport();
        },
      },
    ];

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdropRow}>
        <Animated.View
          style={[
            styles.drawerSheet,
            {
              width: drawerWidth,
              paddingTop: Math.max(insets.top + 12, rs(22)),
              paddingBottom: Math.max(insets.bottom + 10, rs(16)),
              paddingLeft: insets.left,
              transform: [{ translateX: slideX }],
            },
          ]}
        >
          <View style={styles.drawerHeader}>
            <View style={styles.brandRow}>
              <LabSetuLogoMark size={36} />
              <LabSetuWordmark fontSize={rf(19)} />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close Menu">
              <Ionicons name="close" size={22} color={BRAND_COLORS.navyPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.riderStrip}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.riderName}>
                {phleboName}
              </Text>
              <Text maxFontSizeMultiplier={MAX_TEXT_SCALE} style={styles.riderMeta}>
                Phlebotomist • {courierId}
              </Text>
            </View>
            <View
              style={[
                styles.statusChip,
                { backgroundColor: isOnline ? BRAND_COLORS.emeraldSoft : '#F1F5F9' },
              ]}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: isOnline ? BRAND_COLORS.emerald : BRAND_COLORS.muted },
                ]}
              />
              <Text
                style={[
                  styles.statusChipText,
                  { color: isOnline ? BRAND_COLORS.emerald : BRAND_COLORS.muted },
                ]}
              >
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>

          <ScrollView style={styles.navList} showsVerticalScrollIndicator={false}>
            {navItems.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.navRow, item.active && styles.navRowActive]}
                onPress={item.onPress}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.active ? BRAND_COLORS.tealPrimary : BRAND_COLORS.navyPrimary}
                />
                <Text style={[styles.navLabel, item.active && styles.navLabelActive]}>
                  {item.label}
                </Text>
                {typeof item.badge === 'number' ? (
                  <View style={styles.navBadge}>
                    <Text style={styles.navBadgeText}>{item.badge}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.navRow}
              onPress={() => {
                onClose();
                onNavigateTab('profile');
              }}
            >
              <MaterialCommunityIcons
                name="account-cog-outline"
                size={20}
                color={BRAND_COLORS.navyPrimary}
              />
              <Text style={styles.navLabel}>Profile &amp; Bank Account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navRow}
              onPress={() => {
                onClose();
                onLogout();
              }}
            >
              <Ionicons name="log-out-outline" size={20} color={BRAND_COLORS.crimson} />
              <Text style={[styles.navLabel, { color: BRAND_COLORS.crimson }]}>Logout</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.drawerFooter}>
            <Text style={styles.versionText}>v1.0.0 • LabSetu Phlebo App</Text>
          </View>
        </Animated.View>

        <Pressable style={styles.scrim} onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(6, 29, 66, 0.45)',
  },
  scrim: {
    flex: 1,
  },
  drawerSheet: {
    backgroundColor: '#FFFFFF',
    height: '100%',
    paddingTop: rs(22),
    paddingBottom: rs(16),
    shadowColor: '#061D42',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 18,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: rs(16),
    paddingBottom: rs(14),
    borderBottomWidth: 1,
    borderBottomColor: BRAND_COLORS.border,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  riderStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: rs(14),
    marginTop: rs(14),
    marginBottom: 8,
    padding: rs(12),
    borderRadius: 14,
    backgroundColor: BRAND_COLORS.canvas,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  riderName: {
    fontSize: rf(14),
    lineHeight: lh(rf(14)),
    fontFamily: BRAND_FONTS.bold,
    color: BRAND_COLORS.navyPrimary,
    includeFontPadding: true,
  },
  riderMeta: {
    fontSize: rf(11.5),
    lineHeight: lh(rf(11.5)),
    fontFamily: BRAND_FONTS.medium,
    color: BRAND_COLORS.muted,
    marginTop: 2,
    includeFontPadding: true,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    flexShrink: 0,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusChipText: {
    fontSize: rf(11),
    lineHeight: lh(rf(11)),
    fontFamily: BRAND_FONTS.bold,
    includeFontPadding: true,
  },
  navList: {
    flex: 1,
    paddingHorizontal: rs(12),
    paddingTop: 6,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: rs(13),
    paddingVertical: rs(12),
    borderRadius: 12,
    marginBottom: 4,
  },
  navRowActive: {
    backgroundColor: BRAND_COLORS.tealSoft,
  },
  navLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: rf(13.5),
    lineHeight: lh(rf(13.5)),
    fontFamily: BRAND_FONTS.semiBold,
    color: BRAND_COLORS.navyPrimary,
    includeFontPadding: true,
  },
  navLabelActive: {
    color: BRAND_COLORS.tealPrimary,
    fontFamily: BRAND_FONTS.bold,
  },
  navBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BRAND_COLORS.crimson,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  navBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: BRAND_FONTS.bold,
  },
  divider: {
    height: 1,
    backgroundColor: BRAND_COLORS.border,
    marginVertical: 10,
    marginHorizontal: 8,
  },
  drawerFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BRAND_COLORS.border,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 11.5,
    fontFamily: BRAND_FONTS.medium,
    color: BRAND_COLORS.muted,
  },
});

