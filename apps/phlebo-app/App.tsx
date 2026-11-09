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
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [bookingHistoryFilter, setBookingHistoryFilter] = useState<'all' | 'active' | 'completed' | 'scheduled'>('all');
  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [dutyStatus, setDutyStatus] = useState<'ONLINE' | 'BREAK' | 'OFFLINE'>('ONLINE');

  const updateOtpDigit = (index: number, value: string) => {
    const updated = [...otpValue];
    updated[index] = value;
    setOtpValue(updated);
  };

  // History bookings mock records
  const MOCK_HISTORY_BOOKINGS = [
    {
      id: 'BK-10456',
      patient: 'Ravi Sharma',
      pickup: 'Sharma Diagnostic Lab, Bhandup (W)',
      drop: 'Metro Diagnostics, Mulund (W)',
      tests: 'CBC, LFT, KFT',
      status: 'In Transit',
      temp: '4.2°C (Safe)',
      fee: '₹350',
      time: '10:15 AM',
      category: 'active',
    },
    {
      id: 'BK-10455',
      patient: 'Priya Desai',
      pickup: 'City Health Lab, Mulund (W)',
      drop: 'Metro Diagnostics, Mulund (W)',
      tests: 'TSH, FT4',
      status: 'Delivered',
      temp: '4.5°C (Safe)',
      fee: '₹300',
      time: '09:40 AM',
      category: 'completed',
    },
    {
      id: 'BK-10454',
      patient: 'Ajay Mehta',
      pickup: 'LifeCare Clinic, Kanjurmarg',
      drop: 'Metro Diagnostics, Mulund (W)',
      tests: 'Lipid Profile, KFT',
      status: 'Delivered',
      temp: '4.1°C (Safe)',
      fee: '₹400',
      time: '08:50 AM',
      category: 'completed',
    },
    {
      id: 'BK-10453',
      patient: 'Sneha Patil',
      pickup: 'Bhandup Care Lab, Bhandup',
      drop: 'Apex Reference Testing, Thane',
      tests: 'HbA1c, Glucose Fasting',
      status: 'Scheduled',
      temp: 'Cooler Ready',
      fee: '₹280',
      time: '02:30 PM',
      category: 'scheduled',
    },
    {
      id: 'BK-10451',
      patient: 'Sunita Rao',
      pickup: 'Sharma Diagnostic Lab, Bhandup (W)',
      drop: 'Metro Diagnostics, Mulund (W)',
      tests: 'CBC, ESR',
      status: 'Delivered',
      temp: '4.3°C (Safe)',
      fee: '₹250',
      time: 'Yesterday',
      category: 'completed',
    },
  ];

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

        {showManualEntry ? (
          <View style={{ width: '100%', marginBottom: 20 }}>
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 6 }}>
              Enter Specimen Barcode:
            </Text>
            <TextInput
              style={{
                backgroundColor: 'white',
                borderWidth: 1.5,
                borderColor: COLORS.primaryTeal,
                borderRadius: 8,
                padding: 12,
                fontSize: 15,
                fontWeight: '600',
                color: COLORS.textPrimary,
              }}
              value={scannedBarcode}
              onChangeText={setScannedBarcode}
              placeholder="e.g. SMP-10456-CBC"
            />
          </View>
        ) : null}

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
          onPress={() => setShowManualEntry(!showManualEntry)}
        >
          <Text style={{ color: COLORS.primaryTeal, fontWeight: '600', fontSize: 14 }}>
            {showManualEntry ? 'Use Camera Scanner' : 'Or Enter Manually'}
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
              <TextInput
                style={styles.otpDigit}
                value={digit}
                maxLength={1}
                keyboardType="numeric"
                onChangeText={(val) => updateOtpDigit(idx, val)}
              />
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
          onPress={() => {
            setBottomTab('earnings');
            setCurrentScreen('BOOKING_REQUESTS');
          }}
        >
          <Text style={styles.ctaButtonText}>View Earnings</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  /* =========================================================================
   * TAB 2: MY BOOKINGS SCREEN
   * ========================================================================= */
  const renderBookingsHistoryScreen = () => {
    const filtered = MOCK_HISTORY_BOOKINGS.filter((b) => {
      const matchFilter = bookingHistoryFilter === 'all' || b.category === bookingHistoryFilter;
      const matchQuery =
        b.id.toLowerCase().includes(bookingSearchQuery.toLowerCase()) ||
        b.patient.toLowerCase().includes(bookingSearchQuery.toLowerCase()) ||
        b.tests.toLowerCase().includes(bookingSearchQuery.toLowerCase());
      return matchFilter && matchQuery;
    });

    return (
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <View style={styles.appHeaderBar}>
          <Text style={styles.appHeaderTitle}>My Bookings</Text>
          <Text style={styles.appHeaderSubtitle}>Track active collections and pickup history</Text>
        </View>

        <View style={styles.bodyContainer}>
          {/* Search Box */}
          <View style={styles.searchBox}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by ID, patient, test..."
              placeholderTextColor={COLORS.textSecondary}
              value={bookingSearchQuery}
              onChangeText={setBookingSearchQuery}
            />
            {bookingSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setBookingSearchQuery('')}>
                <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Chips */}
          <View style={styles.requestTabsRow}>
            {(['all', 'active', 'completed', 'scheduled'] as const).map((key) => (
              <TouchableOpacity
                key={key}
                style={[styles.tabButton, bookingHistoryFilter === key && styles.tabButtonActive]}
                onPress={() => setBookingHistoryFilter(key)}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    bookingHistoryFilter === key && styles.tabButtonTextActive,
                  ]}
                >
                  {key === 'all'
                    ? 'All (5)'
                    : key === 'active'
                    ? 'Active (1)'
                    : key === 'completed'
                    ? 'Completed (3)'
                    : 'Scheduled (1)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Bookings List */}
          {filtered.map((item) => (
            <View key={item.id} style={styles.historyCard}>
              <View style={styles.historyCardHeader}>
                <View>
                  <Text style={styles.historyCardId}>{item.id}</Text>
                  <Text style={styles.historyCardPatient}>{item.patient}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.historyCardFee}>{item.fee}</Text>
                  <View
                    style={[
                      styles.statusPillBadge,
                      {
                        backgroundColor:
                          item.status === 'In Transit'
                            ? '#DBEAFE'
                            : item.status === 'Delivered'
                            ? '#DCFCE7'
                            : '#FEF3C7',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        {
                          color:
                            item.status === 'In Transit'
                              ? '#2563EB'
                              : item.status === 'Delivered'
                              ? '#16A34A'
                              : '#D97706',
                        },
                      ]}
                    >
                      ● {item.status}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.routeItemRow}>
                <View style={[styles.dotMarker, { backgroundColor: COLORS.primaryTeal }]} />
                <Text style={styles.routeTextSm}>{item.pickup}</Text>
              </View>
              <View style={[styles.routeItemRow, { marginTop: 4 }]}>
                <View style={[styles.dotMarker, { backgroundColor: COLORS.accentBlue }]} />
                <Text style={styles.routeTextSm}>{item.drop}</Text>
              </View>

              <View style={styles.historyCardFooter}>
                <Text style={styles.historyCardTests}>🧪 {item.tests}</Text>
                <Text style={styles.historyCardTemp}>❄️ {item.temp}</Text>
              </View>

              {item.status === 'In Transit' && (
                <TouchableOpacity
                  style={[styles.btnPrimary, { marginTop: 12, paddingVertical: 8 }]}
                  onPress={() => {
                    setBottomTab('home');
                    setCurrentScreen('BOOKING_DETAILS');
                  }}
                >
                  <Text style={styles.btnPrimaryText}>Resume Active Trip</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  /* =========================================================================
   * TAB 3: EARNINGS & PAYOUTS SCREEN
   * ========================================================================= */
  const renderEarningsScreen = () => {
    return (
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <View style={styles.heroHeader}>
          <Text style={styles.greetingTitle}>Earnings & Payouts</Text>
          <Text style={styles.greetingSubtitle}>Instant cold-chain logistics incentives & daily ledger</Text>

          {/* Wallet Payout Card */}
          <View style={[styles.summaryCard, { marginTop: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={styles.summaryTitle}>AVAILABLE FOR WITHDRAWAL</Text>
                <Text style={[styles.metricNumber, { fontSize: 28, color: COLORS.primaryDark }]}>
                  ₹3,420
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.btnPrimary, { paddingHorizontal: 16, paddingVertical: 10 }]}
                onPress={() =>
                  Alert.alert(
                    'Instant UPI Payout Requested',
                    '₹3,420 will be credited directly to rahul.yadav@okhdfcbank within 60 seconds.'
                  )
                }
              >
                <Text style={styles.btnPrimaryText}>Withdraw to UPI</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.summaryDivider, { width: '100%', height: 1, marginVertical: 14 }]} />

            <View style={styles.summaryMetricsRow}>
              <View style={styles.summaryMetricCol}>
                <Text style={styles.metricNumber}>₹1,240</Text>
                <Text style={styles.metricLabel}>Today (5 Pickups)</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryMetricCol}>
                <Text style={styles.metricNumber}>₹8,450</Text>
                <Text style={styles.metricLabel}>This Week</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryMetricCol}>
                <Text style={styles.metricNumber}>₹34,200</Text>
                <Text style={styles.metricLabel}>This Month</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.bodyContainer, { paddingTop: 48 }]}>
          {/* Weekly Performance Bar Chart */}
          <View style={styles.chartCard}>
            <Text style={styles.sectionHeaderTitle}>Weekly Earnings Overview</Text>
            <View style={styles.barChartContainer}>
              {[
                { day: 'Mon', amount: '₹1,100', heightPct: 65 },
                { day: 'Tue', amount: '₹1,350', heightPct: 82 },
                { day: 'Wed', amount: '₹950', heightPct: 56 },
                { day: 'Thu', amount: '₹1,400', heightPct: 85 },
                { day: 'Fri', amount: '₹1,200', heightPct: 72 },
                { day: 'Sat', amount: '₹1,650', heightPct: 100, active: true },
                { day: 'Sun', amount: '₹800', heightPct: 48 },
              ].map((bar) => (
                <View key={bar.day} style={styles.chartBarCol}>
                  <Text style={styles.chartBarAmount}>{bar.amount.replace('₹', '')}</Text>
                  <View style={styles.chartBarTrack}>
                    <View
                      style={[
                        styles.chartBarFill,
                        {
                          height: `${bar.heightPct}%`,
                          backgroundColor: bar.active ? COLORS.primaryTeal : '#94A3B8',
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.chartBarDay,
                      bar.active && { color: COLORS.primaryDark, fontWeight: '700' },
                    ]}
                  >
                    {bar.day}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Incentive Boosters */}
          <View style={styles.incentiveCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 24 }}>🎯</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.incentiveTitle}>Cold-Chain Quality Bonus</Text>
                <Text style={styles.incentiveSubtitle}>
                  100% compliant temp logs today! +₹250 added to your balance.
                </Text>
              </View>
            </View>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: '100%' }]} />
            </View>
          </View>

          {/* Recent Trip Earnings */}
          <Text style={[styles.sectionHeaderTitle, { marginTop: 20, marginBottom: 10 }]}>
            Recent Trip Breakdown
          </Text>

          {[
            { id: 'BK-10456', fee: '₹350', base: '₹250 base + ₹100 chilled bonus', time: 'Today, 11:48 AM', lab: 'Metro Diagnostics' },
            { id: 'BK-10455', fee: '₹300', base: '₹250 base + ₹50 distance', time: 'Today, 10:15 AM', lab: 'Metro Diagnostics' },
            { id: 'BK-10454', fee: '₹400', base: '₹250 base + ₹150 STAT surge', time: 'Today, 09:30 AM', lab: 'Metro Diagnostics' },
            { id: 'BK-10452', fee: '₹190', base: 'Standard Routine Pickup', time: 'Today, 08:45 AM', lab: 'Apex Lab' },
          ].map((trip) => (
            <View key={trip.id} style={styles.tripLedgerRow}>
              <View>
                <Text style={styles.tripLedgerId}>{trip.id}</Text>
                <Text style={styles.tripLedgerLab}>{trip.lab} • {trip.time}</Text>
                <Text style={styles.tripLedgerBase}>{trip.base}</Text>
              </View>
              <Text style={styles.tripLedgerFee}>+{trip.fee}</Text>
            </View>
          ))}

          {/* Linked Bank Card */}
          <View style={styles.bankAccountCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 24 }}>🏦</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.bankName}>HDFC Bank (Linked UPI)</Text>
                <Text style={styles.bankNumber}>A/c •••• 4092 • rahul.yadav@okhdfcbank</Text>
              </View>
              <Text style={{ color: COLORS.successGreen, fontWeight: '700', fontSize: 12 }}>
                ✓ VERIFIED
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  /* =========================================================================
   * TAB 4: PHLEBOTOMIST PROFILE & HARDWARE COMPLIANCE
   * ========================================================================= */
  const renderProfileScreen = () => {
    return (
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <View style={styles.heroHeader}>
          <View style={{ alignItems: 'center', paddingVertical: 10 }}>
            <View style={[styles.avatarCircle, { width: 68, height: 68, borderRadius: 34 }]}>
              <Text style={[styles.avatarText, { fontSize: 26 }]}>R</Text>
            </View>
            <Text style={[styles.greetingTitle, { fontSize: 20, marginTop: 8 }]}>Rahul Yadav</Text>
            <Text style={styles.greetingSubtitle}>Phlebotomist ID: PHL-204 • Blood Group: O+</Text>
            <View style={[styles.onlinePill, { backgroundColor: '#064E3B', marginTop: 10 }]}>
              <Text style={styles.onlinePillText}>⭐ 4.9 Rating (428 Pickups)</Text>
            </View>
          </View>
        </View>

        <View style={styles.bodyContainer}>
          {/* Shift Status Selector */}
          <Text style={styles.sectionHeaderTitle}>Shift Status</Text>
          <View style={styles.shiftSelectorRow}>
            {[
              { status: 'ONLINE', label: '🟢 On Duty', bg: '#DCFCE7', text: '#16A34A' },
              { status: 'BREAK', label: '🟡 On Break', bg: '#FEF3C7', text: '#D97706' },
              { status: 'OFFLINE', label: '🔴 Off Duty', bg: '#FEE2E2', text: '#DC2626' },
            ].map((s) => (
              <TouchableOpacity
                key={s.status}
                style={[
                  styles.shiftButton,
                  dutyStatus === s.status && { backgroundColor: s.bg, borderColor: s.text, borderWidth: 1.5 },
                ]}
                onPress={() => {
                  setDutyStatus(s.status as any);
                  setIsOnline(s.status === 'ONLINE');
                  Alert.alert('Shift Status Updated', `You are now ${s.label}`);
                }}
              >
                <Text
                  style={[
                    styles.shiftButtonText,
                    dutyStatus === s.status && { color: s.text, fontWeight: '700' },
                  ]}
                >
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Assigned Cold-Chain Logistics Kit */}
          <Text style={[styles.sectionHeaderTitle, { marginTop: 20 }]}>
            Assigned Cold-Chain Equipment
          </Text>
          <View style={styles.equipmentCard}>
            <View style={styles.equipmentRow}>
              <Text style={{ fontSize: 20 }}>🧊</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.equipmentTitle}>IoT Smart Chiller Box #CB-408</Text>
                <Text style={styles.equipmentSub}>Internal Sensor: 4.2°C (Calibrated NABL) • Battery: 94%</Text>
              </View>
              <Text style={{ color: COLORS.successGreen, fontWeight: '700', fontSize: 12 }}>ONLINE</Text>
            </View>

            <View style={[styles.equipmentRow, { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: COLORS.borderLight }]}>
              <Text style={{ fontSize: 20 }}>🏍️</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.equipmentTitle}>Logistics Bike</Text>
                <Text style={styles.equipmentSub}>Hero Electric • MH-03-BW-4921</Text>
              </View>
              <Text style={{ color: COLORS.primaryTeal, fontWeight: '600', fontSize: 12 }}>ASSIGNED</Text>
            </View>

            <View style={[styles.equipmentRow, { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: COLORS.borderLight }]}>
              <Text style={{ fontSize: 20 }}>📱</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.equipmentTitle}>Barcode Scanner & Logger</Text>
                <Text style={styles.equipmentSub}>BLE 5.2 Handheld Accession Wand • Paired</Text>
              </View>
              <Text style={{ color: COLORS.successGreen, fontWeight: '700', fontSize: 12 }}>PAIRED</Text>
            </View>
          </View>

          {/* Verified Qualifications */}
          <Text style={[styles.sectionHeaderTitle, { marginTop: 20 }]}>
            Certifications & Verification
          </Text>
          <View style={styles.complianceCard}>
            {[
              { title: 'DMLT Pathology Diploma', auth: 'Maharashtra Paramedical Council', exp: 'Permanent' },
              { title: 'Cold-Chain Biological Handling', auth: 'LabSetu Standards Institute', exp: 'Valid till Nov 2027' },
              { title: 'Police Background Verification', auth: 'Mumbai City Police', exp: 'Clear (Verified 2026)' },
            ].map((doc, idx) => (
              <View
                key={doc.title}
                style={[
                  styles.docItemRow,
                  idx > 0 && { borderTopWidth: 1, borderColor: COLORS.borderLight, paddingTop: 10, marginTop: 10 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>{doc.title}</Text>
                  <Text style={styles.docAuth}>{doc.auth} • {doc.exp}</Text>
                </View>
                <Text style={{ color: COLORS.successGreen, fontSize: 16 }}>✓</Text>
              </View>
            ))}
          </View>

          {/* Support and SOS */}
          <View style={{ marginTop: 24, gap: 10 }}>
            <TouchableOpacity
              style={styles.sosButton}
              onPress={() =>
                Alert.alert(
                  'Emergency Cold-Chain SOS Triggered',
                  'Central Dispatch Operations & nearest backup phlebotomist have been notified of your location.'
                )
              }
            >
              <Text style={styles.sosButtonText}>🚨 EMERGENCY COLD-CHAIN SOS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.helpHotlineButton}
              onPress={() => Alert.alert('LabSetu Hotline', 'Dialing Operations Control Center: 1800-889-SETU')}
            >
              <Text style={styles.helpHotlineText}>📞 Call Central Dispatch Hotline (24x7)</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.versionFootnote}>
            LabSetu Phlebotomist Companion v2.4.0 (Build 108) • Android Protected
          </Text>
        </View>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />

      {/* Screen Router */}
      <View style={{ flex: 1 }}>
        {bottomTab === 'home' && (
          <>
            {currentScreen === 'BOOKING_REQUESTS' && renderBookingRequestsScreen()}
            {currentScreen === 'BOOKING_DETAILS' && renderBookingDetailsScreen()}
            {currentScreen === 'COLLECT_SAMPLE' && renderCollectSampleScreen()}
            {currentScreen === 'DROP_SAMPLE' && renderDropSampleScreen()}
            {currentScreen === 'COMPLETED' && renderCompletedScreen()}
          </>
        )}
        {bottomTab === 'bookings' && renderBookingsHistoryScreen()}
        {bottomTab === 'earnings' && renderEarningsScreen()}
        {bottomTab === 'profile' && renderProfileScreen()}
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

  /* Inner Tabs Header */
  appHeaderBar: {
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  appHeaderTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },
  appHeaderSubtitle: {
    color: '#A7F3D0',
    fontSize: 13,
    marginTop: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceCard,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
  },

  /* History Card */
  historyCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 12,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  historyCardId: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  historyCardPatient: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  historyCardFee: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  statusPillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  routeItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeTextSm: {
    fontSize: 12,
    color: COLORS.textPrimary,
    flex: 1,
  },
  historyCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: COLORS.borderLight,
    paddingTop: 8,
    marginTop: 10,
  },
  historyCardTests: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  historyCardTemp: {
    fontSize: 12,
    color: COLORS.successGreen,
    fontWeight: '600',
  },

  /* Earnings & Charts */
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  chartCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 14,
  },
  barChartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 16,
  },
  chartBarCol: {
    alignItems: 'center',
    flex: 1,
  },
  chartBarAmount: {
    fontSize: 9,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  chartBarTrack: {
    width: 20,
    height: 90,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartBarFill: {
    width: '100%',
    borderRadius: 6,
  },
  chartBarDay: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 6,
    fontWeight: '500',
  },
  incentiveCard: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  incentiveTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  incentiveSubtitle: {
    fontSize: 12,
    color: COLORS.primaryTeal,
    marginTop: 2,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#CCFBF1',
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primaryTeal,
  },
  tripLedgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceCard,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 8,
  },
  tripLedgerId: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  tripLedgerLab: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  tripLedgerBase: {
    fontSize: 11,
    color: COLORS.primaryTeal,
    marginTop: 2,
  },
  tripLedgerFee: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.successGreen,
  },
  bankAccountCard: {
    backgroundColor: COLORS.surfaceCard,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    marginBottom: 14,
  },
  bankName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  bankNumber: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  /* Profile Styles */
  shiftSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  shiftButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  shiftButtonText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  equipmentCard: {
    backgroundColor: COLORS.surfaceCard,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 14,
    padding: 14,
  },
  equipmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  equipmentTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  equipmentSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  complianceCard: {
    backgroundColor: COLORS.surfaceCard,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 14,
    padding: 14,
  },
  docItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  docTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  docAuth: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  sosButton: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: COLORS.errorRed,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sosButtonText: {
    color: COLORS.errorRed,
    fontSize: 13,
    fontWeight: '700',
  },
  helpHotlineButton: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: COLORS.primaryTeal,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  helpHotlineText: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: '600',
  },
  versionFootnote: {
    textAlign: 'center',
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 18,
    marginBottom: 10,
  },
});

