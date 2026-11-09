import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  Alert,
} from 'react-native';

// Canonical LabSetu Palette from design system
const COLORS = {
  primaryTeal: '#0D9488',
  primaryDark: '#0F766E',
  accentBlue: '#2563EB',
  successGreen: '#16A34A',
  warningAmber: '#F59E0B',
  errorRed: '#DC2626',
  background: '#F8FAFC',
  surfaceCard: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  borderLight: '#E2E8F0',
};

type ScreenType =
  | 'BOOKING_REQUESTS'
  | 'BOOKING_DETAILS'
  | 'COLLECT_SAMPLE'
  | 'DROP_SAMPLE'
  | 'COMPLETED';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('BOOKING_REQUESTS');
  const [isOnline, setIsOnline] = useState(true);
  const [requestTab, setRequestTab] = useState<'new' | 'active' | 'completed'>('new');
  const [bottomTab, setBottomTab] = useState<'home' | 'bookings' | 'earnings' | 'profile'>('home');
  const [otpValue, setOtpValue] = useState(['7', '4', '2', '9', '9']);
  const [scannedBarcode, setScannedBarcode] = useState('SMP-10456-CBC');

  // Active booking mock details
  const activeBooking = {
    id: 'BK-10456',
    pickupLab: 'Sharma Diagnostic Lab',
    pickupAddress: 'Bhandup (W)',
    patientName: 'Ravi Sharma',
    patientPhone: '+91 98XXX3210',
    patientAddress: 'Mulund (E)',
    distanceKm: '3.2 km',
    dropLab: 'Metro Diagnostics',
    dropAddress: 'Mulund (W)',
    tests: 'CBC, LFT, KFT',
    earnings: '₹350',
    pickupEta: '< 12 mins',
  };

  /* =========================================================================
   * 1. SCREEN 1: BOOKING REQUESTS (HOME LIST)
   * ========================================================================= */
  const renderBookingRequestsScreen = () => (
    <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
      {/* Dark Teal Hero Header */}
      <View style={styles.heroHeader}>
        <View style={styles.heroRow}>
          <View style={styles.profileSection}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>R</Text>
            </View>
            <View>
              <Text style={styles.greetingTitle}>Hello, Rahul</Text>
              <Text style={styles.greetingSubtitle}>Phlebotomist</Text>
            </View>
          </View>

          {/* Online Toggle Switch */}
          <TouchableOpacity
            style={[styles.onlinePill, { backgroundColor: isOnline ? '#16A34A' : '#64748B' }]}
            onPress={() => setIsOnline(!isOnline)}
          >
            <Text style={styles.onlinePillText}>{isOnline ? 'Online ●' : 'Offline ○'}</Text>
          </TouchableOpacity>
        </View>

        {/* Today's Summary Floating Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Today's Summary</Text>
          <View style={styles.summaryMetricsRow}>
            <View style={styles.summaryMetricCol}>
              <Text style={styles.metricNumber}>5</Text>
              <Text style={styles.metricLabel}>Bookings</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryMetricCol}>
              <Text style={styles.metricNumber}>4</Text>
              <Text style={styles.metricLabel}>Completed</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryMetricCol}>
              <Text style={[styles.metricNumber, { color: COLORS.primaryTeal }]}>₹1,240</Text>
              <Text style={styles.metricLabel}>Earnings</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Tabs: New (3) | Active (1) | Completed */}
      <View style={styles.bodyContainer}>
        <View style={styles.requestTabsRow}>
          <TouchableOpacity
            style={[styles.tabButton, requestTab === 'new' && styles.tabButtonActive]}
            onPress={() => setRequestTab('new')}
          >
            <Text style={[styles.tabButtonText, requestTab === 'new' && styles.tabButtonTextActive]}>
              New (3)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, requestTab === 'active' && styles.tabButtonActive]}
            onPress={() => setRequestTab('active')}
          >
            <Text style={[styles.tabButtonText, requestTab === 'active' && styles.tabButtonTextActive]}>
              Active (1)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, requestTab === 'completed' && styles.tabButtonActive]}
            onPress={() => setRequestTab('completed')}
          >
            <Text style={[styles.tabButtonText, requestTab === 'completed' && styles.tabButtonTextActive]}>
              Completed
            </Text>
          </TouchableOpacity>
        </View>

        {/* Card 1: BK-10456 */}
        <View style={styles.bookingCard}>
          <View style={styles.bookingCardTop}>
            <View>
              <Text style={styles.bookingTitle}>New Booking</Text>
              <Text style={styles.bookingId}>ID: {activeBooking.id}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={styles.pickupTimeBadge}>
                <Text style={styles.pickupTimeText}>Pickup {activeBooking.pickupEta}</Text>
              </View>
              <Text style={styles.bookingPrice}>{activeBooking.earnings}</Text>
            </View>
          </View>

          {/* Route Preview */}
          <View style={styles.routeContainer}>
            <View style={styles.routeRow}>
              <View style={[styles.dotMarker, { backgroundColor: COLORS.primaryTeal }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routePlaceTitle}>{activeBooking.pickupLab}</Text>
                <Text style={styles.routePlaceSubtitle}>{activeBooking.pickupAddress}</Text>
              </View>
            </View>

            <View style={styles.routeConnectingLine} />

            <View style={styles.routeRow}>
              <View style={[styles.dotMarker, { backgroundColor: COLORS.errorRed }]} />
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={styles.routePlaceTitle}>Patient Home</Text>
                  <Text style={styles.routePlaceSubtitle}>{activeBooking.patientAddress}</Text>
                </View>
                <Text style={styles.distanceBadge}>{activeBooking.distanceKm}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.testsPreview}>Tests: {activeBooking.tests}</Text>

          {/* Actions: Reject / Accept */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={() => Alert.alert('Booking Declined', 'Assignment passed to next available phlebotomist.')}
            >
              <Text style={styles.btnSecondaryText}>Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => setCurrentScreen('BOOKING_DETAILS')}
            >
              <Text style={styles.btnPrimaryText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Card 2: BK-10457 */}
        <View style={styles.bookingCard}>
          <View style={styles.bookingCardTop}>
            <View>
              <Text style={styles.bookingTitle}>New Booking</Text>
              <Text style={styles.bookingId}>ID: BK-10457</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={styles.pickupTimeBadge}>
                <Text style={styles.pickupTimeText}>Pickup &lt; 18 mins</Text>
              </View>
              <Text style={styles.bookingPrice}>₹280</Text>
            </View>
          </View>

          <View style={styles.routeContainer}>
            <View style={styles.routeRow}>
              <View style={[styles.dotMarker, { backgroundColor: COLORS.primaryTeal }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routePlaceTitle}>City Health Clinic</Text>
                <Text style={styles.routePlaceSubtitle}>Mulund (W)</Text>
              </View>
            </View>
          </View>
          <Text style={styles.testsPreview}>Tests: TSH, Lipid Profile</Text>
        </View>
      </View>
    </ScrollView>
  );

  /* =========================================================================
   * 2. SCREEN 2: BOOKING DETAILS & ROUTE
   * ========================================================================= */
  const renderBookingDetailsScreen = () => (
    <ScrollView style={styles.scrollArea}>
      <View style={styles.navBarHeader}>
        <TouchableOpacity onPress={() => setCurrentScreen('BOOKING_REQUESTS')}>
          <Text style={styles.navBarBackArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.navBarTitle}>Booking Details</Text>
          <Text style={styles.navBarSubtitle}>{activeBooking.id}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.bodyContainer}>
        {/* Full Chain Timeline */}
        <View style={styles.timelineCard}>
          {/* 1. Pickup Lab */}
          <View style={styles.timelineItem}>
            <View style={[styles.dotMarker, { backgroundColor: COLORS.primaryTeal }]} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.timelineLabel}>Pickup</Text>
              <Text style={styles.timelineTitle}>{activeBooking.pickupLab}</Text>
              <Text style={styles.timelineSub}>{activeBooking.pickupAddress}</Text>
            </View>
          </View>

          <View style={styles.timelineLine} />

          {/* 2. Collection Patient */}
          <View style={styles.timelineItem}>
            <View style={[styles.dotMarker, { backgroundColor: COLORS.accentBlue }]} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.timelineLabel}>Collection</Text>
              <Text style={styles.timelineTitle}>{activeBooking.patientName}</Text>
              <Text style={styles.timelineSub}>{activeBooking.patientPhone}</Text>
              <Text style={styles.timelineSub}>{activeBooking.patientAddress}</Text>
            </View>
            <TouchableOpacity
              style={styles.callCircleBtn}
              onPress={() => Alert.alert('Dialing Patient', activeBooking.patientPhone)}
            >
              <Text style={{ color: 'white', fontWeight: 'bold' }}>📞</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.timelineLine} />

          {/* 3. Drop Partner Lab */}
          <View style={styles.timelineItem}>
            <View style={[styles.dotMarker, { backgroundColor: COLORS.successGreen }]} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.timelineLabel}>Drop</Text>
              <Text style={styles.timelineTitle}>{activeBooking.dropLab}</Text>
              <Text style={styles.timelineSub}>{activeBooking.dropAddress}</Text>
            </View>
          </View>
        </View>

        {/* Tests Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoCardLabel}>Required Diagnostic Tests</Text>
          <Text style={styles.infoCardValue}>{activeBooking.tests}</Text>
          <View style={{ height: 1, backgroundColor: COLORS.borderLight, marginVertical: 12 }} />
          <Text style={styles.infoCardLabel}>Cold-Chain Mandate</Text>
          <Text style={[styles.infoCardValue, { color: COLORS.primaryTeal }]}>
            Refrigerated Gel Pack (2°C - 8°C)
          </Text>
        </View>

        {/* Bottom CTA */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => setCurrentScreen('COLLECT_SAMPLE')}
        >
          <Text style={styles.ctaButtonText}>Start Pickup</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  /* =========================================================================
   * 3. SCREEN 3: SAMPLE COLLECTION & BARCODE SCANNER
   * ========================================================================= */
  const renderCollectSampleScreen = () => (
    <View style={styles.fullscreenContainer}>
      <View style={styles.navBarHeader}>
        <TouchableOpacity onPress={() => setCurrentScreen('BOOKING_DETAILS')}>
          <Text style={styles.navBarBackArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.navBarTitle}>Collect Sample</Text>
          <Text style={styles.navBarSubtitle}>{activeBooking.id}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.bodyContainer, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
        {/* Vial Graphic Box */}
        <View style={styles.vialGraphicFrame}>
          <Text style={{ fontSize: 48, marginBottom: 8 }}>🧪</Text>
          <View style={styles.barcodeReticle} />
          <Text style={styles.scannedBarcodePill}>{scannedBarcode}</Text>
        </View>

        <Text style={styles.collectTitle}>Scan Sample Barcode</Text>
        <Text style={styles.collectSubtitle}>
          Align camera with the specimen vial barcode to link chain-of-custody.
        </Text>

        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => {
            Alert.alert('Barcode Verified!', `Specimen ${scannedBarcode} successfully linked.`);
            setCurrentScreen('DROP_SAMPLE');
          }}
        >
          <Text style={styles.ctaButtonText}>Scan Barcode</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginTop: 16 }}
          onPress={() => setCurrentScreen('DROP_SAMPLE')}
        >
          <Text style={{ color: COLORS.primaryTeal, fontWeight: '600', fontSize: 14 }}>
            Or Enter Manually
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  /* =========================================================================
   * 4. SCREEN 4: DROP SAMPLE & OTP
   * ========================================================================= */
  const renderDropSampleScreen = () => (
    <ScrollView style={styles.scrollArea}>
      <View style={styles.navBarHeader}>
        <TouchableOpacity onPress={() => setCurrentScreen('COLLECT_SAMPLE')}>
          <Text style={styles.navBarBackArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.navBarTitle}>Drop Sample</Text>
          <Text style={styles.navBarSubtitle}>{activeBooking.id}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.bodyContainer}>
        {/* Lab Destination Card */}
        <View style={styles.dropLabCard}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>🏢</Text>
          <Text style={styles.dropLabTitle}>{activeBooking.dropLab}</Text>
          <Text style={styles.dropLabSub}>{activeBooking.dropAddress}</Text>
        </View>

        {/* Handover Instruction */}
        <View style={styles.handoverBanner}>
          <Text style={styles.handoverCheck}>✓ Sample Handover</Text>
          <Text style={styles.handoverSub}>Confirm with laboratory receiving staff</Text>
          <Text style={styles.enterOtpPrompt}>Enter receiving OTP</Text>
        </View>

        {/* 5-Digit OTP Boxes */}
        <View style={styles.otpBoxesRow}>
          {otpValue.map((digit, idx) => (
            <View key={idx} style={styles.otpBox}>
              <Text style={styles.otpDigit}>{digit}</Text>
            </View>
          ))}
        </View>

        {/* Confirm Drop CTA */}
        <TouchableOpacity
          style={[styles.ctaButton, { marginTop: 32 }]}
          onPress={() => setCurrentScreen('COMPLETED')}
        >
          <Text style={styles.ctaButtonText}>Confirm Drop</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  /* =========================================================================
   * 5. SCREEN 5: BOOKING COMPLETED
   * ========================================================================= */
  const renderCompletedScreen = () => (
    <View style={styles.fullscreenContainer}>
      <View style={styles.navBarHeader}>
        <TouchableOpacity onPress={() => setCurrentScreen('BOOKING_REQUESTS')}>
          <Text style={styles.navBarBackArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.navBarTitle}>Booking Completed</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.bodyContainer, { flex: 1, justifyContent: 'center' }]}>
        {/* Big Green Circle Checkmark */}
        <View style={styles.successCheckCircle}>
          <Text style={styles.successCheckSymbol}>✓</Text>
        </View>

        <Text style={styles.successTitle}>Sample Delivered Successfully</Text>

        {/* Receipt Details Card */}
        <View style={styles.receiptCard}>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Booking ID</Text>
            <Text style={styles.receiptVal}>{activeBooking.id}</Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Earnings</Text>
            <Text style={[styles.receiptVal, { color: COLORS.primaryTeal }]}>
              {activeBooking.earnings}
            </Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Distance</Text>
            <Text style={styles.receiptVal}>{activeBooking.distanceKm}</Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptKey}>Completed At</Text>
            <Text style={styles.receiptVal}>11:48 AM</Text>
          </View>
        </View>

        {/* View Earnings CTA */}
        <TouchableOpacity
          style={[styles.ctaButton, { marginTop: 28 }]}
          onPress={() => setCurrentScreen('BOOKING_REQUESTS')}
        >
          <Text style={styles.ctaButtonText}>View Earnings</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />

      {/* Screen Router */}
      <View style={{ flex: 1 }}>
        {currentScreen === 'BOOKING_REQUESTS' && renderBookingRequestsScreen()}
        {currentScreen === 'BOOKING_DETAILS' && renderBookingDetailsScreen()}
        {currentScreen === 'COLLECT_SAMPLE' && renderCollectSampleScreen()}
        {currentScreen === 'DROP_SAMPLE' && renderDropSampleScreen()}
        {currentScreen === 'COMPLETED' && renderCompletedScreen()}
      </View>

      {/* Persistent Bottom Tab Bar */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity
          style={styles.bottomTabItem}
          onPress={() => {
            setBottomTab('home');
            setCurrentScreen('BOOKING_REQUESTS');
          }}
        >
          <Text style={{ fontSize: 18 }}>🏠</Text>
          <Text
            style={[
              styles.bottomTabText,
              bottomTab === 'home' && { color: COLORS.primaryTeal, fontWeight: '700' },
            ]}
          >
            Home
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomTabItem}
          onPress={() => {
            setBottomTab('bookings');
            setCurrentScreen('BOOKING_DETAILS');
          }}
        >
          <Text style={{ fontSize: 18 }}>📋</Text>
          <Text
            style={[
              styles.bottomTabText,
              bottomTab === 'bookings' && { color: COLORS.primaryTeal, fontWeight: '700' },
            ]}
          >
            Bookings
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomTabItem}
          onPress={() => setBottomTab('earnings')}
        >
          <Text style={{ fontSize: 18 }}>💰</Text>
          <Text
            style={[
              styles.bottomTabText,
              bottomTab === 'earnings' && { color: COLORS.primaryTeal, fontWeight: '700' },
            ]}
          >
            Earnings
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomTabItem}
          onPress={() => setBottomTab('profile')}
        >
          <Text style={{ fontSize: 18 }}>👤</Text>
          <Text
            style={[
              styles.bottomTabText,
              bottomTab === 'profile' && { color: COLORS.primaryTeal, fontWeight: '700' },
            ]}
          >
            Profile
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  /* Dark Teal Hero Header */
  heroHeader: {
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#064E3B',
    borderWidth: 2,
    borderColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 18,
  },
  greetingTitle: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
  },
  greetingSubtitle: {
    color: '#A7F3D0',
    fontSize: 13,
  },
  onlinePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  onlinePillText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Floating Summary Card */
  summaryCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: -32,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  summaryMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryMetricCol: {
    alignItems: 'center',
    flex: 1,
  },
  metricNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  metricLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.borderLight,
  },

  /* Body Content */
  bodyContainer: {
    paddingHorizontal: 20,
    paddingTop: 38,
    paddingBottom: 24,
  },

  /* Request Filter Tabs */
  requestTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  tabButtonActive: {
    backgroundColor: COLORS.primaryTeal,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabButtonTextActive: {
    color: 'white',
  },

  /* Booking Card */
  bookingCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 14,
  },
  bookingCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  bookingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  bookingId: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  pickupTimeBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 4,
  },
  pickupTimeText: {
    color: COLORS.errorRed,
    fontSize: 11,
    fontWeight: '700',
  },
  bookingPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  /* Route Visualizer */
  routeContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginVertical: 10,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dotMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routePlaceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  routePlaceSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  routeConnectingLine: {
    width: 2,
    height: 14,
    backgroundColor: '#CBD5E1',
    marginLeft: 4,
    marginVertical: 2,
  },
  distanceBadge: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  testsPreview: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 14,
  },

  /* Card Action Buttons */
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: COLORS.primaryTeal,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13,
  },

  /* Navigation Bar for Subscreens */
  navBarHeader: {
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navBarBackArrow: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
  },
  navBarTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  navBarSubtitle: {
    color: '#A7F3D0',
    fontSize: 12,
  },

  /* Timeline Card in Details */
  timelineCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  timelineSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  timelineLine: {
    width: 2,
    height: 20,
    backgroundColor: '#CBD5E1',
    marginLeft: 4,
    marginVertical: 4,
  },
  callCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Info Card */
  infoCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 24,
  },
  infoCardLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  infoCardValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },

  /* Full Width CTA */
  ctaButton: {
    backgroundColor: COLORS.primaryTeal,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
  },
  ctaButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },

  /* Sample Collection Screen */
  vialGraphicFrame: {
    width: 160,
    height: 160,
    borderRadius: 20,
    backgroundColor: '#F0FDFA',
    borderWidth: 2,
    borderColor: '#99F6E4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  barcodeReticle: {
    width: 100,
    height: 3,
    backgroundColor: COLORS.errorRed,
    marginBottom: 10,
  },
  scannedBarcodePill: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
    backgroundColor: 'white',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  collectTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  collectSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 28,
  },

  /* Drop Sample & OTP */
  dropLabCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 20,
  },
  dropLabTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  dropLabSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  handoverBanner: {
    alignItems: 'center',
    marginBottom: 20,
  },
  handoverCheck: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.successGreen,
  },
  handoverSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  enterOtpPrompt: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 14,
  },
  otpBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  otpBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.primaryTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  /* Completed Screen */
  successCheckCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.successGreen,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successCheckSymbol: {
    color: 'white',
    fontSize: 44,
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 24,
  },
  receiptCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  receiptKey: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  receiptVal: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
  },

  /* Persistent Bottom Tab Bar */
  bottomTabBar: {
    height: 60,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  bottomTabItem: {
    alignItems: 'center',
  },
  bottomTabText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
