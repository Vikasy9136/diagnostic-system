import { useState, type FormEvent } from 'react';
import {
  LABSETU_THEME,
  OrderStatus,
  OrderPriority,
  SpecimenType,
  TubeType,
  StorageTemperature,
  PickupOrder,
} from '@diagnostic/shared';

// Initial synthetic mock bookings matching the reference UI
const INITIAL_BOOKINGS: PickupOrder[] = [
  {
    id: 'BK-10456',
    orderNumber: 'BK-10456',
    smallLabId: 'LAB-SM-001',
    smallLabName: 'Bhandup Care Lab',
    targetLabId: 'LAB-LG-100',
    targetLabName: 'Metro Diagnostics',
    phlebotomistId: 'PHL-204',
    phlebotomistName: 'Rahul Yadav',
    status: OrderStatus.PICKED_UP,
    priority: OrderPriority.ROUTINE,
    patient: {
      id: 'PT-101',
      pseudonym: 'Ravi Sharma',
      age: 38,
      gender: 'MALE',
    },
    specimens: [
      {
        id: 'SMP-10456-1',
        barcode: 'SMP-10456-1',
        testCode: 'CBC',
        testName: 'Complete Blood Count',
        specimenType: SpecimenType.BLOOD,
        tubeType: TubeType.EDTA_LAVENDER,
        temperatureRequirement: StorageTemperature.REFRIGERATED,
      },
      {
        id: 'SMP-10456-2',
        barcode: 'SMP-10456-2',
        testCode: 'LFT',
        testName: 'Liver Function Test',
        specimenType: SpecimenType.SERUM,
        tubeType: TubeType.SERUM_RED_GOLD,
        temperatureRequirement: StorageTemperature.REFRIGERATED,
      },
    ],
    custodyHistory: [],
    pickupLocation: {
      address: 'Sharma Diagnostic Lab, Bhandup (W)',
      latitude: 19.1438,
      longitude: 72.9378,
      contactPhone: '+91 98XXX3210',
    },
    deliveryLocation: {
      address: 'Metro Diagnostics, Mulund (W)',
      latitude: 19.1726,
      longitude: 72.9565,
    },
    scheduledPickupAt: '10:15 AM',
    createdAt: 'Today, 09:30 AM',
    updatedAt: 'Today, 10:15 AM',
  },
  {
    id: 'BK-10455',
    orderNumber: 'BK-10455',
    smallLabId: 'LAB-SM-001',
    smallLabName: 'Bhandup Care Lab',
    targetLabId: 'LAB-LG-100',
    targetLabName: 'Metro Diagnostics',
    phlebotomistId: 'PHL-204',
    phlebotomistName: 'Rahul Yadav',
    status: OrderStatus.IN_TRANSIT,
    priority: OrderPriority.URGENT,
    patient: {
      id: 'PT-102',
      pseudonym: 'Priya Desai',
      age: 29,
      gender: 'FEMALE',
    },
    specimens: [
      {
        id: 'SMP-10455-1',
        barcode: 'SMP-10455-1',
        testCode: 'TSH',
        testName: 'Thyroid Stimulating Hormone',
        specimenType: SpecimenType.SERUM,
        tubeType: TubeType.SERUM_RED_GOLD,
        temperatureRequirement: StorageTemperature.REFRIGERATED,
      },
      {
        id: 'SMP-10455-2',
        barcode: 'SMP-10455-2',
        testCode: 'FT4',
        testName: 'Free T4',
        specimenType: SpecimenType.SERUM,
        tubeType: TubeType.SERUM_RED_GOLD,
        temperatureRequirement: StorageTemperature.REFRIGERATED,
      },
    ],
    custodyHistory: [],
    pickupLocation: {
      address: 'Bhandup Care Lab, Station Road',
      latitude: 19.144,
      longitude: 72.938,
    },
    deliveryLocation: {
      address: 'Metro Diagnostics, Mulund (W)',
      latitude: 19.1726,
      longitude: 72.9565,
    },
    scheduledPickupAt: '10:30 AM',
    createdAt: 'Today, 09:45 AM',
    updatedAt: 'Today, 10:35 AM',
  },
  {
    id: 'BK-10454',
    orderNumber: 'BK-10454',
    smallLabId: 'LAB-SM-001',
    smallLabName: 'Bhandup Care Lab',
    targetLabId: 'LAB-LG-100',
    targetLabName: 'Metro Diagnostics',
    status: OrderStatus.REPORT_UPLOADED,
    priority: OrderPriority.ROUTINE,
    patient: {
      id: 'PT-103',
      pseudonym: 'Ajay Mehta',
      age: 51,
      gender: 'MALE',
    },
    specimens: [
      {
        id: 'SMP-10454-1',
        barcode: 'SMP-10454-1',
        testCode: 'LIPID',
        testName: 'Lipid Profile',
        specimenType: SpecimenType.BLOOD,
        tubeType: TubeType.SERUM_RED_GOLD,
        temperatureRequirement: StorageTemperature.REFRIGERATED,
      },
    ],
    custodyHistory: [],
    pickupLocation: {
      address: 'Bhandup Care Lab, Station Road',
      latitude: 19.144,
      longitude: 72.938,
    },
    deliveryLocation: {
      address: 'Metro Diagnostics, Mulund (W)',
      latitude: 19.1726,
      longitude: 72.9565,
    },
    scheduledPickupAt: '08:00 AM',
    createdAt: 'Today, 07:30 AM',
    updatedAt: 'Today, 11:15 AM',
  },
  {
    id: 'BK-10453',
    orderNumber: 'BK-10453',
    smallLabId: 'LAB-SM-001',
    smallLabName: 'Bhandup Care Lab',
    targetLabId: 'LAB-LG-100',
    targetLabName: 'Metro Diagnostics',
    status: OrderStatus.UNDER_ANALYSIS,
    priority: OrderPriority.ROUTINE,
    patient: {
      id: 'PT-104',
      pseudonym: 'Sneha Patil',
      age: 34,
      gender: 'FEMALE',
    },
    specimens: [
      {
        id: 'SMP-10453-1',
        barcode: 'SMP-10453-1',
        testCode: 'HbA1c',
        testName: 'Hemoglobin A1c',
        specimenType: SpecimenType.BLOOD,
        tubeType: TubeType.EDTA_LAVENDER,
        temperatureRequirement: StorageTemperature.REFRIGERATED,
      },
    ],
    custodyHistory: [],
    pickupLocation: {
      address: 'Bhandup Care Lab, Station Road',
      latitude: 19.144,
      longitude: 72.938,
    },
    deliveryLocation: {
      address: 'Metro Diagnostics, Mulund (W)',
      latitude: 19.1726,
      longitude: 72.9565,
    },
    scheduledPickupAt: '08:30 AM',
    createdAt: 'Today, 08:00 AM',
    updatedAt: 'Today, 10:00 AM',
  },
];

const MOCK_PATIENTS = [
  { id: 'PT-101', name: 'Ravi Sharma', age: 38, gender: 'Male', phone: '+91 98200 12345', orders: 3, lastVisit: 'Today' },
  { id: 'PT-102', name: 'Priya Desai', age: 29, gender: 'Female', phone: '+91 98300 23456', orders: 2, lastVisit: 'Today' },
  { id: 'PT-103', name: 'Ajay Mehta', age: 51, gender: 'Male', phone: '+91 98400 34567', orders: 5, lastVisit: 'Today' },
  { id: 'PT-104', name: 'Sneha Patil', age: 34, gender: 'Female', phone: '+91 98500 45678', orders: 1, lastVisit: 'Today' },
  { id: 'PT-105', name: 'Kavita Iyer', age: 44, gender: 'Female', phone: '+91 98600 56789', orders: 4, lastVisit: '08 Nov 2026' },
];

const MOCK_TESTS = [
  { code: 'CBC', name: 'Complete Blood Count', tube: 'EDTA Lavender', temp: 'Refrigerated (2°C - 8°C)', tat: '4 Hours', price: '₹350' },
  { code: 'LFT', name: 'Liver Function Test', tube: 'Serum Red/Gold', temp: 'Refrigerated (2°C - 8°C)', tat: '6 Hours', price: '₹650' },
  { code: 'KFT', name: 'Kidney Function Test', tube: 'Serum Red/Gold', temp: 'Refrigerated (2°C - 8°C)', tat: '6 Hours', price: '₹600' },
  { code: 'HbA1c', name: 'Glycated Hemoglobin', tube: 'EDTA Lavender', temp: 'Refrigerated (2°C - 8°C)', tat: '4 Hours', price: '₹450' },
  { code: 'TSH', name: 'Thyroid Stimulating Hormone', tube: 'Serum Red/Gold', temp: 'Refrigerated (2°C - 8°C)', tat: '5 Hours', price: '₹300' },
  { code: 'LIPID', name: 'Lipid Profile (Full)', tube: 'Serum Red/Gold', temp: 'Refrigerated (2°C - 8°C)', tat: '6 Hours', price: '₹550' },
];

const MOCK_PARTNER_LABS = [
  { id: 'LAB-LG-100', name: 'Metro Diagnostics Core Lab', location: 'Mulund (W), Mumbai', nabl: 'NABL ISO 15189', rating: '4.9 ★', courierEta: '14 mins', status: 'Connected' },
  { id: 'LAB-LG-101', name: 'Apex Reference Testing Center', location: 'Thane West', nabl: 'NABL Certified', rating: '4.8 ★', courierEta: '22 mins', status: 'Connected' },
  { id: 'LAB-LG-102', name: 'LifeCare Specialty Molecular Hub', location: 'Ghatkopar (E)', nabl: 'NABL & CAP Accredited', rating: '4.9 ★', courierEta: '30 mins', status: 'Available' },
];

const MOCK_INVOICES = [
  { id: 'INV-2026-11', date: '01 Nov 2026', period: 'October 2026', pickups: 184, total: '₹24,600', status: 'Paid' },
  { id: 'INV-2026-10', date: '01 Oct 2026', period: 'September 2026', pickups: 162, total: '₹21,800', status: 'Paid' },
  { id: 'INV-2026-09', date: '01 Sep 2026', period: 'August 2026', pickups: 145, total: '₹19,450', status: 'Paid' },
];

type NavTab =
  | 'dashboard'
  | 'new-booking'
  | 'patients'
  | 'test-catalogue'
  | 'partner-labs'
  | 'bookings'
  | 'reports'
  | 'payments'
  | 'help';

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [bookings, setBookings] = useState<PickupOrder[]>(INITIAL_BOOKINGS);
  const [showModal, setShowModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Booking form state
  const [patientName, setPatientName] = useState('');
  const [selectedTest, setSelectedTest] = useState('CBC, LFT');
  const [pickupTime, setPickupTime] = useState('11:30 AM');
  const [searchQuery, setSearchQuery] = useState('');

  const handleCreateBooking = (e: FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) return;

    const newBooking: PickupOrder = {
      id: `BK-${10457 + bookings.length}`,
      orderNumber: `BK-${10457 + bookings.length}`,
      smallLabId: 'LAB-SM-001',
      smallLabName: 'Bhandup Care Lab',
      targetLabId: 'LAB-LG-100',
      targetLabName: 'Metro Diagnostics',
      phlebotomistId: 'PHL-204',
      phlebotomistName: 'Rahul Yadav',
      status: OrderStatus.READY_FOR_PICKUP,
      priority: OrderPriority.ROUTINE,
      patient: {
        id: `PT-${200 + bookings.length}`,
        pseudonym: patientName,
        age: 35,
        gender: 'OTHER',
      },
      specimens: [
        {
          id: `SMP-${Date.now()}`,
          barcode: `SMP-${Date.now()}`.slice(0, 12),
          testCode: selectedTest,
          testName: selectedTest,
          specimenType: SpecimenType.BLOOD,
          tubeType: TubeType.EDTA_LAVENDER,
          temperatureRequirement: StorageTemperature.REFRIGERATED,
        },
      ],
      custodyHistory: [],
      pickupLocation: {
        address: 'Bhandup Care Lab, Station Road',
        latitude: 19.144,
        longitude: 72.938,
      },
      deliveryLocation: {
        address: 'Metro Diagnostics, Mulund (W)',
        latitude: 19.1726,
        longitude: 72.9565,
      },
      scheduledPickupAt: pickupTime,
      createdAt: 'Just now',
      updatedAt: 'Just now',
    };

    setBookings([newBooking, ...bookings]);
    setShowModal(false);
    setPatientName('');
    setActiveTab('bookings');
    setToastMessage(`Booking ${newBooking.orderNumber} created! Phlebotomist Rahul Yadav notified.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const renderStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.PICKED_UP:
        return <span className="status-pill status-sample-picked">● Sample Picked</span>;
      case OrderStatus.IN_TRANSIT:
        return <span className="status-pill status-in-transit">● In Transit</span>;
      case OrderStatus.REPORT_UPLOADED:
      case OrderStatus.COMPLETED:
        return <span className="status-pill status-report-ready">● Report Ready</span>;
      case OrderStatus.UNDER_ANALYSIS:
        return <span className="status-pill status-testing">● Testing</span>;
      case OrderStatus.READY_FOR_PICKUP:
      case OrderStatus.CREATED:
        return <span className="status-pill status-in-transit">● Pickup Requested</span>;
      default:
        return <span className="status-pill status-delayed">● {status}</span>;
    }
  };

  return (
    <div className="app-shell">
      {/* 1. Left Sidebar Navigation (Dark Slate Teal - Matching Modern Design System) */}
      <aside className="sidebar-dark">
        <div className="brand-header">
          <div className="brand-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
          </div>
          <div className="brand-title-wrap">
            <span className="brand-title">{LABSETU_THEME.brand.name}</span>
            <span className="brand-subtitle">Small Diagnostic Lab Portal</span>
          </div>
        </div>

        <ul className="sidebar-nav">
          <li
            className={`sidebar-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>Dashboard</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'new-booking' ? 'active' : ''}`}
            onClick={() => setActiveTab('new-booking')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>New Booking</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'patients' ? 'active' : ''}`}
            onClick={() => setActiveTab('patients')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Patients</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'test-catalogue' ? 'active' : ''}`}
            onClick={() => setActiveTab('test-catalogue')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>Test Catalogue</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'partner-labs' ? 'active' : ''}`}
            onClick={() => setActiveTab('partner-labs')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Partner Labs</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'bookings' ? 'active' : ''}`}
            onClick={() => setActiveTab('bookings')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            <span>Bookings</span>
            <span className="nav-badge-red">12</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>Reports</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => setActiveTab('payments')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <span>Payments</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'help' ? 'active' : ''}`}
            onClick={() => setActiveTab('help')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Help</span>
          </li>
        </ul>

        {/* Sidebar Footer Help Card */}
        <div
          className="sidebar-footer-card"
          onClick={() => setActiveTab('help')}
        >
          <div className="sidebar-footer-icon">🎧</div>
          <div>
            <div className="sidebar-footer-title">Help & Support</div>
            <div className="sidebar-footer-subtitle">Need assistance? We're here.</div>
          </div>
        </div>
      </aside>

      {/* 2. Main Wrapper */}
      <div className="main-wrapper">
        <header className="top-navbar">
          {/* Rounded Search Pill */}
          <div className="top-search-pill">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search booking ID, test, patient, or phlebotomist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="top-nav-right">
            <div className="nav-icon-circle" title="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="nav-alert-dot" />
            </div>

            <div className="user-profile-badge">
              <div className="user-photo-avatar">B</div>
              <div className="user-profile-info">
                <span className="user-profile-name">Bhandup Care Lab</span>
                <span className="user-profile-role">Collection Center</span>
              </div>
            </div>

            <button type="button" className="btn-primary" onClick={() => setShowModal(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Booking
            </button>
          </div>
        </header>

        <main className="dashboard-content">
          {/* Toast Notification */}
          {toastMessage && (
            <div
              style={{
                marginBottom: '20px',
                padding: '12px 18px',
                background: '#DCFCE7',
                border: '1px solid #86EFAC',
                borderRadius: '8px',
                color: '#15803D',
                fontSize: '0.9rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {toastMessage}
            </div>
          )}

          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <>
              {/* 4 KPI Cards */}
              <section className="kpi-row">
                <div className="kpi-card">
                  <div className="kpi-icon-box" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div>
                    <div className="kpi-val">12</div>
                    <div className="kpi-label">Today's Bookings</div>
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-icon-box" style={{ background: '#ECFDF5', color: '#16A34A' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                    </svg>
                  </div>
                  <div>
                    <div className="kpi-val">10</div>
                    <div className="kpi-label">Samples Picked</div>
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-icon-box" style={{ background: '#F0FDFA', color: '#0D9488' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <div className="kpi-val">8</div>
                    <div className="kpi-label">Reports Ready</div>
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-icon-box" style={{ background: '#FFF7ED', color: '#EA580C' }}>
                    <span style={{ fontSize: '1.3rem', fontWeight: 700 }}>₹</span>
                  </div>
                  <div>
                    <div className="kpi-val">₹24,600</div>
                    <div className="kpi-label">This Month</div>
                  </div>
                </div>
              </section>

              {/* Split Content: Recent Bookings & Live Tracking */}
              <div className="content-grid">
                <div className="surface-card">
                  <div className="card-header-flex">
                    <h3 className="card-title">Recent Bookings</h3>
                    <select className="btn-secondary" style={{ padding: '6px 12px' }}>
                      <option>Today</option>
                      <option>Yesterday</option>
                      <option>This Week</option>
                    </select>
                  </div>

                  <div className="data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Booking ID</th>
                          <th>Patient</th>
                          <th>Test(s)</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bookings.map((booking) => (
                          <tr key={booking.id}>
                            <td>
                              <strong style={{ color: '#0F172A' }}>{booking.orderNumber}</strong>
                            </td>
                            <td>{booking.patient.pseudonym}</td>
                            <td style={{ color: '#64748B' }}>
                              {booking.specimens.map((s) => s.testCode).join(', ')}
                            </td>
                            <td>{renderStatusBadge(booking.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="surface-card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="card-header-flex">
                    <h3 className="card-title">Live Tracking</h3>
                    <span style={{ fontSize: '0.8rem', color: '#0D9488', fontWeight: 600 }}>Active</span>
                  </div>

                  <div className="map-preview-box">
                    <svg className="map-svg-routes" viewBox="0 0 300 180">
                      <path d="M 20 40 L 280 40 M 20 90 L 280 90 M 20 140 L 280 140 M 80 10 L 80 170 M 160 10 L 160 170 M 240 10 L 240 170" stroke="#E2E8F0" strokeWidth="1.5" />
                      <path d="M 50 130 Q 120 120 150 70 T 250 40" fill="none" stroke="#0D9488" strokeWidth="3.5" strokeDasharray="6 4" />
                      <circle cx="50" cy="130" r="7" fill="#0D9488" />
                      <circle cx="50" cy="130" r="14" fill="#0D9488" fillOpacity="0.2" />
                      <circle cx="150" cy="70" r="9" fill="#2563EB" />
                      <circle cx="150" cy="70" r="18" fill="#2563EB" fillOpacity="0.2" />
                      <circle cx="250" cy="40" r="7" fill="#16A34A" />
                      <circle cx="250" cy="40" r="14" fill="#16A34A" fillOpacity="0.2" />
                    </svg>
                  </div>

                  <div className="courier-info-strip">
                    <div className="courier-avatar">RY</div>
                    <div className="courier-details">
                      <div className="courier-name">Rahul Yadav</div>
                      <div className="courier-subtext">On the way to lab • ETA 14 mins</div>
                    </div>
                    <button
                      className="icon-btn"
                      title="Call Courier"
                      onClick={() => alert('Dialing Phlebotomist Rahul Yadav: +91 98000 00000')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: NEW BOOKING (DEDICATED FORM) */}
          {activeTab === 'new-booking' && (
            <div className="surface-card" style={{ maxWidth: '720px', margin: '0 auto' }}>
              <div className="card-header-flex">
                <div>
                  <h3 className="card-title">Create Specimen Pickup Request</h3>
                  <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '4px' }}>
                    Generate barcode accession and dispatch certified phlebotomist
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreateBooking} style={{ marginTop: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Patient Name or Medical ID</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Ramesh Kulkarni (PT-105)"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Select Diagnostic Tests</label>
                  <select
                    className="form-select"
                    value={selectedTest}
                    onChange={(e) => setSelectedTest(e.target.value)}
                  >
                    <option value="CBC, LFT">CBC, LFT (EDTA + Serum) - ₹900</option>
                    <option value="TSH, FT4">Thyroid Profile (TSH, FT4) - ₹550</option>
                    <option value="HbA1c, Blood Sugar">HbA1c & Fasting Glucose - ₹500</option>
                    <option value="KFT, Electrolytes">KFT & Serum Electrolytes - ₹750</option>
                    <option value="Lipid Profile">Lipid Profile Comprehensive - ₹550</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Target Reference Laboratory</label>
                  <input
                    type="text"
                    className="form-input"
                    value="Metro Diagnostics (Partner Core Lab - Mulund West)"
                    disabled
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Pickup Window</label>
                  <select
                    className="form-select"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                  >
                    <option value="Immediate (Within 15 mins)">Immediate Dispatch (&lt; 15 mins)</option>
                    <option value="11:30 AM">11:30 AM Slot</option>
                    <option value="02:00 PM">02:00 PM Slot</option>
                    <option value="04:30 PM">04:30 PM Slot</option>
                  </select>
                </div>

                <div style={{ background: '#F0FDFA', border: '1px solid #CCFBF1', padding: '14px', borderRadius: '8px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '0.85rem', color: '#0F766E', fontWeight: 600 }}>
                    🧊 Automated Cold-Chain Mandate:
                  </div>
                  <div style={{ fontSize: '0.825rem', color: '#0D9488', marginTop: '2px' }}>
                    Phlebotomist will arrive equipped with a 2°C - 8°C chilled gel pack cooler container.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="submit" className="btn-primary" style={{ padding: '10px 24px' }}>
                    Dispatch Phlebotomist Now
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setActiveTab('dashboard')}
                  >
                    Back to Dashboard
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: PATIENTS DIRECTORY */}
          {activeTab === 'patients' && (
            <div className="surface-card">
              <div className="card-header-flex">
                <div>
                  <h3 className="card-title">Patient Directory</h3>
                  <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                    Registered patients and historical diagnostic orders
                  </p>
                </div>
                <button className="btn-primary" onClick={() => setShowModal(true)}>
                  + Register Patient
                </button>
              </div>

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Patient ID</th>
                      <th>Full Name</th>
                      <th>Age / Gender</th>
                      <th>Phone</th>
                      <th>Total Orders</th>
                      <th>Last Visit</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_PATIENTS.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.id}</strong></td>
                        <td>{p.name}</td>
                        <td>{p.age} yrs / {p.gender}</td>
                        <td style={{ color: '#64748B' }}>{p.phone}</td>
                        <td>{p.orders} Tests</td>
                        <td>{p.lastVisit}</td>
                        <td>
                          <button
                            className="btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            onClick={() => {
                              setPatientName(p.name);
                              setActiveTab('new-booking');
                            }}
                          >
                            + New Order
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: TEST CATALOGUE */}
          {activeTab === 'test-catalogue' && (
            <div className="surface-card">
              <div className="card-header-flex">
                <div>
                  <h3 className="card-title">Diagnostic Test Catalogue</h3>
                  <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                    Available test panels, prescribed tube types, and reference laboratory turnaround times
                  </p>
                </div>
              </div>

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Test Panel Name</th>
                      <th>Specimen / Tube Required</th>
                      <th>Cold-Chain Requirement</th>
                      <th>Standard TAT</th>
                      <th>B2B Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_TESTS.map((t) => (
                      <tr key={t.code}>
                        <td><strong style={{ color: '#0D9488' }}>{t.code}</strong></td>
                        <td>{t.name}</td>
                        <td><span style={{ fontWeight: 500 }}>{t.tube}</span></td>
                        <td><span style={{ color: '#16A34A', fontSize: '0.85rem' }}>{t.temp}</span></td>
                        <td>{t.tat}</td>
                        <td><strong>{t.price}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: PARTNER REFERENCE LABS */}
          {activeTab === 'partner-labs' && (
            <div className="surface-card">
              <div className="card-header-flex">
                <div>
                  <h3 className="card-title">Connected Partner Reference Laboratories</h3>
                  <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                    NABL accredited testing hubs linked with automatic logistics routing
                  </p>
                </div>
              </div>

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Lab ID</th>
                      <th>Reference Testing Center</th>
                      <th>Location</th>
                      <th>Accreditations</th>
                      <th>Rating</th>
                      <th>Courier Transit ETA</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_PARTNER_LABS.map((lab) => (
                      <tr key={lab.id}>
                        <td><strong>{lab.id}</strong></td>
                        <td>{lab.name}</td>
                        <td>{lab.location}</td>
                        <td><span style={{ background: '#ECFDF5', color: '#047857', padding: '3px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}>{lab.nabl}</span></td>
                        <td>{lab.rating}</td>
                        <td>{lab.courierEta}</td>
                        <td><span className="status-pill status-sample-picked">● {lab.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: FULL BOOKINGS MANAGEMENT */}
          {activeTab === 'bookings' && (
            <div className="surface-card">
              <div className="card-header-flex">
                <div>
                  <h3 className="card-title">All Specimen Pickup Bookings</h3>
                  <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                    Live status and chain-of-custody tracking across all bookings
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="Search by ID or Patient..."
                  className="form-input"
                  style={{ width: '220px', padding: '6px 12px' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Booking ID</th>
                      <th>Patient</th>
                      <th>Tests</th>
                      <th>Phlebotomist</th>
                      <th>Scheduled Slot</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings
                      .filter(
                        (b) =>
                          b.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          b.patient.pseudonym.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((b) => (
                        <tr key={b.id}>
                          <td><strong>{b.orderNumber}</strong></td>
                          <td>{b.patient.pseudonym}</td>
                          <td>{b.specimens.map((s) => s.testCode).join(', ')}</td>
                          <td>{b.phlebotomistName || 'Assigning...'}</td>
                          <td>{b.scheduledPickupAt}</td>
                          <td>{renderStatusBadge(b.status)}</td>
                          <td>
                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                              onClick={() => {
                                alert(`Viewing Chain of Custody for ${b.orderNumber}\nPhlebotomist: ${b.phlebotomistName || 'Unassigned'}\nStatus: ${b.status}`);
                              }}
                            >
                              Track
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: REPORTS */}
          {activeTab === 'reports' && (
            <div className="surface-card">
              <div className="card-header-flex">
                <div>
                  <h3 className="card-title">Diagnostic Reports Archive</h3>
                  <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                    Pathologist-verified laboratory results and downloadable PDF reports
                  </p>
                </div>
              </div>

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Report ID</th>
                      <th>Booking ID</th>
                      <th>Patient</th>
                      <th>Tests Performed</th>
                      <th>Verified At</th>
                      <th>Testing Laboratory</th>
                      <th>Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong style={{ color: '#0D9488' }}>RPT-10454</strong></td>
                      <td>BK-10454</td>
                      <td>Ajay Mehta</td>
                      <td>Lipid Profile Comprehensive</td>
                      <td>Today, 11:15 AM</td>
                      <td>Metro Diagnostics Core Lab</td>
                      <td>
                        <button
                          className="btn-primary"
                          style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                          onClick={() => alert('Downloading verified PDF report for Ajay Mehta (RPT-10454)...')}
                        >
                          📄 Download PDF
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td><strong style={{ color: '#0D9488' }}>RPT-10450</strong></td>
                      <td>BK-10450</td>
                      <td>Kavita Iyer</td>
                      <td>HbA1c & Fasting Glucose</td>
                      <td>Yesterday, 05:40 PM</td>
                      <td>Metro Diagnostics Core Lab</td>
                      <td>
                        <button
                          className="btn-primary"
                          style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                          onClick={() => alert('Downloading verified PDF report for Kavita Iyer (RPT-10450)...')}
                        >
                          📄 Download PDF
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 8: PAYMENTS */}
          {activeTab === 'payments' && (
            <div className="surface-card">
              <div className="card-header-flex">
                <div>
                  <h3 className="card-title">B2B Settlements & Billing Ledger</h3>
                  <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                    Monthly diagnostic courier and test processing settlements
                  </p>
                </div>
              </div>

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice ID</th>
                      <th>Billing Period</th>
                      <th>Date Generated</th>
                      <th>Total Pickups</th>
                      <th>Settlement Amount</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_INVOICES.map((inv) => (
                      <tr key={inv.id}>
                        <td><strong>{inv.id}</strong></td>
                        <td>{inv.period}</td>
                        <td>{inv.date}</td>
                        <td>{inv.pickups} Samples</td>
                        <td><strong>{inv.total}</strong></td>
                        <td><span className="status-pill status-sample-picked">● {inv.status}</span></td>
                        <td>
                          <button
                            className="btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            onClick={() => alert(`Downloading Invoice ${inv.id}`)}
                          >
                            Download Invoice
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 9: HELP */}
          {activeTab === 'help' && (
            <div className="surface-card" style={{ maxWidth: '800px' }}>
              <h3 className="card-title">LabSetu Small Lab Support & Helpline</h3>
              <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '4px' }}>
                Quick assistance for logistics escalations, courier delays, or pre-analytical queries
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', margin: '20px 0' }}>
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '16px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.85rem', color: '#64748B' }}>Logistics Dispatch Emergency</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0D9488', marginTop: '4px' }}>+91 1800 200 4567</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>Available 24/7 for urgent pickups</div>
                </div>

                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '16px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.85rem', color: '#64748B' }}>Partner Lab Coordinator</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#2563EB', marginTop: '4px' }}>+91 98000 11223</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>Metro Diagnostics Desk</div>
                </div>
              </div>

              <h4 style={{ fontSize: '0.95rem', marginBottom: '8px' }}>Pre-Analytical Specimen Guidelines</h4>
              <ul style={{ paddingLeft: '20px', fontSize: '0.875rem', color: '#475569', lineHeight: '1.8' }}>
                <li><strong>Order of Draw:</strong> Blood Culture → Sodium Citrate (Blue) → Serum (Red/Gold) → Heparin (Green) → EDTA (Lavender) → Fluoride (Grey).</li>
                <li><strong>Temperature Compliance:</strong> Always keep EDTA tubes in the 2°C to 8°C chilled pouch before courier handover.</li>
                <li><strong>Labeling:</strong> Affix barcode label vertically on each collection tube with patient ID visible.</li>
              </ul>
            </div>
          )}
        </main>
      </div>

      {/* 3. New Booking Accessible Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0F172A' }}>
                Create Specimen Pickup Request
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBooking}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Patient Name / Pseudonym</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Ramesh Kulkarni (PT-105)"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Diagnostic Test(s) Required</label>
                  <select
                    className="form-select"
                    value={selectedTest}
                    onChange={(e) => setSelectedTest(e.target.value)}
                  >
                    <option value="CBC, LFT">CBC, LFT (EDTA + Serum)</option>
                    <option value="TSH, FT4">Thyroid Profile (TSH, FT4)</option>
                    <option value="HbA1c, Blood Sugar">HbA1c & Fasting Glucose</option>
                    <option value="KFT, Electrolytes">KFT & Serum Electrolytes</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Target Reference Laboratory</label>
                  <input
                    type="text"
                    className="form-input"
                    value="Metro Diagnostics (Partner Core Lab)"
                    disabled
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Requested Pickup Window</label>
                  <select
                    className="form-select"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                  >
                    <option value="Immediate (Within 15 mins)">Immediate (Within 15 mins)</option>
                    <option value="11:30 AM">11:30 AM</option>
                    <option value="01:00 PM">01:00 PM</option>
                    <option value="04:00 PM">04:00 PM</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Dispatch Phlebotomist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
