import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type PhlebotomistProfile, type PhlebotomistShiftStatus } from '@diagnostic/shared';
import { BRAND_COLORS, BRAND_FONTS } from '../components/LabSetuBrand';
import { ProfileSubScreenHeader } from '../components/ProfileSubScreenHeader';
import { COLORS, FONTS, styles } from '../styles/phleboStyles';
import {
  type FloatingIconSettings,
  type WebNotificationPermissionState,
} from '../types/phleboTypes';
import { rf, rs } from '../utils/responsive';

export interface NotificationPrefsPayload {
  dispatchAlerts: boolean;
  payoutAlerts: boolean;
  coldChainAlerts: boolean;
  soundEnabled: boolean;
}

export interface NotificationsPreferencesScreenProps {
  myPhleboProfile: PhlebotomistProfile | null;
  dutyStatus: PhlebotomistShiftStatus;
  webNotifPerm: WebNotificationPermissionState;
  hasOverlayPermission?: boolean;
  floatingSettings?: FloatingIconSettings;
  onBack: () => void;
  onShiftUpdate: (nextStatus: PhlebotomistShiftStatus) => void;
  onRequestBackgroundAlertPermission: () => void;
  onOpenFloatingSettings: () => void;
  onSaveNotificationPreferences: (prefs: NotificationPrefsPayload) => Promise<boolean>;
}

export function NotificationsPreferencesScreen({
  myPhleboProfile,
  dutyStatus,
  webNotifPerm,
  hasOverlayPermission = true,
  floatingSettings,
  onBack,
  onShiftUpdate,
  onRequestBackgroundAlertPermission,
  onOpenFloatingSettings,
  onSaveNotificationPreferences,
}: NotificationsPreferencesScreenProps) {
  const [dispatchAlerts, setDispatchAlerts] = useState(
    myPhleboProfile?.notificationPreferences?.dispatchAlerts ?? true
  );
  const [payoutAlerts, setPayoutAlerts] = useState(
    myPhleboProfile?.notificationPreferences?.payoutAlerts ?? true
  );
  const [coldChainAlerts, setColdChainAlerts] = useState(
    myPhleboProfile?.notificationPreferences?.coldChainAlerts ?? true
  );
  const [soundEnabled, setSoundEnabled] = useState(
    myPhleboProfile?.notificationPreferences?.soundEnabled ?? true
  );
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  useEffect(() => {
    const p = myPhleboProfile?.notificationPreferences;
    if (p) {
      if (typeof p.dispatchAlerts === 'boolean') setDispatchAlerts(p.dispatchAlerts);
      if (typeof p.payoutAlerts === 'boolean') setPayoutAlerts(p.payoutAlerts);
      if (typeof p.coldChainAlerts === 'boolean') setColdChainAlerts(p.coldChainAlerts);
      if (typeof p.soundEnabled === 'boolean') setSoundEnabled(p.soundEnabled);
    }
  }, [myPhleboProfile?.notificationPreferences]);

  const handleSave = async () => {
    setSaving(true);
    setSavedBanner(null);
    try {
      const ok = await onSaveNotificationPreferences({
        dispatchAlerts,
        payoutAlerts,
        coldChainAlerts,
        soundEnabled,
      });
      if (ok) {
        setSavedBanner('Notification preferences saved to your Phlebo profile.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ProfileSubScreenHeader
        title="Notifications & Preferences"
        subtitle="Dispatch alerts, shift status & floating bubble"
        onBack={onBack}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: rs(16), paddingBottom: rs(90) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Duty Shift Status */}
        <Text style={styles.sectionHeaderTitle}>Duty Shift Status</Text>
        <View style={[styles.shiftSelectorRow, { marginBottom: 18 }]}>
          {(
            [
              { status: 'ONLINE', label: 'On Duty', bg: '#DCFCE7', text: '#16A34A' },
              { status: 'BREAK', label: 'On Break', bg: '#FEF3C7', text: '#D97706' },
              { status: 'OFFLINE', label: 'Off Duty', bg: '#FEE2E2', text: '#DC2626' },
            ] as const
          ).map((s) => (
            <TouchableOpacity
              key={s.status}
              style={[
                styles.shiftButton,
                dutyStatus === s.status && {
                  backgroundColor: s.bg,
                  borderColor: s.text,
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => onShiftUpdate(s.status)}
            >
              <Text
                style={[
                  styles.shiftButtonText,
                  dutyStatus === s.status && { color: s.text, fontFamily: FONTS.bold },
                ]}
              >
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* System Permissions */}
        <Text style={styles.sectionHeaderTitle}>System Permissions &amp; Floating Bubble</Text>
        <View style={[styles.menuGroupCard, { marginBottom: 18 }]}>
          <TouchableOpacity
            style={styles.menuGroupRow}
            onPress={onRequestBackgroundAlertPermission}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="notifications-outline" size={18} color={BRAND_COLORS.navyPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.menuRowTitle}>Push &amp; Background Alerts</Text>
              <Text style={styles.menuRowSub}>
                Status: {webNotifPerm === 'granted' ? 'Enabled' : webNotifPerm === 'denied' ? 'Blocked' : 'Tap to Enable'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuGroupRow, { borderBottomWidth: 0 }]}
            onPress={onOpenFloatingSettings}
            activeOpacity={0.75}
          >
            <View style={[styles.menuRowIconWrap, { backgroundColor: '#E6F7F5' }]}>
              <Ionicons name="sparkles-outline" size={18} color={BRAND_COLORS.tealPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.menuRowTitle}>Floating Dispatch Bubble</Text>
              <Text style={styles.menuRowSub}>
                {floatingSettings?.enabled ? 'Enabled' : 'Disabled'} • Overlay Permission: {hasOverlayPermission ? 'Granted' : 'Pending'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={BRAND_COLORS.muted} />
          </TouchableOpacity>
        </View>

        {/* Alert Channels */}
        <Text style={styles.sectionHeaderTitle}>Alert Preferences</Text>
        <View style={styles.equipmentCard}>
          {[
            {
              label: 'New Pickup & Dispatch Broadcasts',
              sub: 'Instant alerts for nearby lab collection orders',
              value: dispatchAlerts,
              onChange: setDispatchAlerts,
            },
            {
              label: 'Instant Payout & Settlement Alerts',
              sub: 'Notify when 30-min payout or wallet credit completes',
              value: payoutAlerts,
              onChange: setPayoutAlerts,
            },
            {
              label: 'Cold-Chain & Temperature Warnings',
              sub: 'Remind when chiller box approaches 2°C–8°C threshold',
              value: coldChainAlerts,
              onChange: setColdChainAlerts,
            },
            {
              label: 'Urgent Booking Sound & Vibration',
              sub: 'Play audible chime for high-priority pickups',
              value: soundEnabled,
              onChange: setSoundEnabled,
            },
          ].map((row, idx, arr) => (
            <View
              key={row.label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 10,
                borderBottomWidth: idx < arr.length - 1 ? 1 : 0,
                borderBottomColor: '#F1F5F9',
                gap: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: BRAND_FONTS.bold, fontSize: rf(13), color: '#0F172A' }}>
                  {row.label}
                </Text>
                <Text style={{ fontFamily: FONTS.regular, fontSize: rf(11.5), color: '#64748B', marginTop: 2 }}>
                  {row.sub}
                </Text>
              </View>
              <Switch
                value={row.value}
                onValueChange={row.onChange}
                trackColor={{ false: '#CBD5E1', true: '#99F6E4' }}
                thumbColor={row.value ? BRAND_COLORS.tealPrimary : '#F8FAFC'}
              />
            </View>
          ))}
        </View>

        {savedBanner ? (
          <View
            style={{
              backgroundColor: '#DCFCE7',
              borderWidth: 1,
              borderColor: '#86EFAC',
              borderRadius: 10,
              padding: 12,
              marginTop: 14,
            }}
          >
            <Text style={{ fontFamily: BRAND_FONTS.medium, fontSize: rf(12), color: '#15803D' }}>
              {savedBanner}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={{
            backgroundColor: BRAND_COLORS.tealPrimary,
            borderRadius: 12,
            paddingVertical: 13,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 16,
            opacity: saving ? 0.7 : 1,
          }}
          onPress={() => void handleSave()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={{ fontFamily: BRAND_FONTS.bold, fontSize: rf(14), color: '#FFFFFF' }}>
              Save Preferences
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
