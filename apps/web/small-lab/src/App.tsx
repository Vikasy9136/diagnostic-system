import { useState } from 'react';
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

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'bookings' | 'patients' | 'reports'>('dashboard');
  const [bookings, setBookings] = useState<PickupOrder[]>(INITIAL_BOOKINGS);
  const [showModal, setShowModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Booking form state
  const [patientName, setPatientName] = useState('');
  const [selectedTest, setSelectedTest] = useState('CBC, LFT');
  const [pickupTime, setPickupTime] = useState('11:30 AM');

  const handleCreateBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) return;

    const newBooking: PickupOrder = {
      id: `BK-${10457 + bookings.length}`,
      orderNumber: `BK-${10457 + bookings.length}`,
      smallLabId: 'LAB-SM-001',
      smallLabName: 'Bhandup Care Lab',
      targetLabId: 'LAB-LG-100',
      targetLabName: 'Metro Diagnostics',
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
    setToastMessage(`Booking ${newBooking.orderNumber} created successfully! Phlebotomist will be notified.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Helper for status badge style
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
      {/* 1. Left Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M2 12h20" />
            </svg>
          </div>
          <span className="logo-text">{LABSETU_THEME.brand.name}</span>
        </div>

        <ul className="nav-list">
          <li
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            Dashboard
          </li>

          <li className="nav-item" onClick={() => setShowModal(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Booking
          </li>

          <li
            className={`nav-item ${activeTab === 'patients' ? 'active' : ''}`}
            onClick={() => setActiveTab('patients')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Patients
          </li>

          <li className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Test Catalogue
          </li>

          <li className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Partner Labs
          </li>

          <li
            className={`nav-item ${activeTab === 'bookings' ? 'active' : ''}`}
            onClick={() => setActiveTab('bookings')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            Bookings
          </li>

          <li
            className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Reports
          </li>

          <li className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            Payments
          </li>

          <li className="nav-item" style={{ marginTop: 'auto' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Help
          </li>
        </ul>
      </aside>

      {/* 2. Main Wrapper */}
      <div className="main-wrapper">
        {/* Top Bar Header */}
        <header className="top-nav">
          <div className="top-greeting">
            <h2>
              Good Morning, Bhandup Care Lab{' '}
              <span role="img" aria-label="wave">
                👋
              </span>
            </h2>
            <p>Manage your bookings and reports</p>
          </div>

          <div className="top-actions">
            <button className="icon-btn" aria-label="Notifications" title="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '7px',
                  height: '7px',
                  background: '#DC2626',
                  borderRadius: '50%',
                }}
              />
            </button>

            <div className="user-pill">
              <div className="user-avatar">B</div>
              <span className="user-name">Bhandup Care Lab</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            <button className="btn-primary" onClick={() => setShowModal(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Booking
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="page-content">
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
            {/* Recent Bookings Table */}
            <div className="surface-card">
              <div className="card-header-flex">
                <h3 className="card-title">Recent Bookings</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select className="btn-secondary" style={{ padding: '6px 12px' }}>
                    <option>Today</option>
                    <option>Yesterday</option>
                    <option>This Week</option>
                  </select>
                </div>
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
                          <span style={{ fontWeight: 600, color: '#0F172A' }}>
                            {booking.orderNumber}
                          </span>
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

            {/* Live Tracking Card */}
            <div className="surface-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header-flex">
                <h3 className="card-title">Live Tracking</h3>
                <span style={{ fontSize: '0.8rem', color: '#0D9488', fontWeight: 600 }}>Active</span>
              </div>

              {/* Simulated Map Visual Box */}
              <div className="map-preview-box">
                <svg className="map-svg-routes" viewBox="0 0 300 180">
                  {/* Subtle Grid Roads */}
                  <path d="M 20 40 L 280 40 M 20 90 L 280 90 M 20 140 L 280 140 M 80 10 L 80 170 M 160 10 L 160 170 M 240 10 L 240 170" stroke="#E2E8F0" strokeWidth="1.5" />
                  
                  {/* Curving Transit Route */}
                  <path
                    d="M 50 130 Q 120 120 150 70 T 250 40"
                    fill="none"
                    stroke="#0D9488"
                    strokeWidth="3.5"
                    strokeDasharray="6 4"
                  />

                  {/* Origin Small Lab Point */}
                  <circle cx="50" cy="130" r="7" fill="#0D9488" />
                  <circle cx="50" cy="130" r="14" fill="#0D9488" fillOpacity="0.2" />

                  {/* Moving Courier Icon on Path */}
                  <circle cx="150" cy="70" r="9" fill="#2563EB" />
                  <circle cx="150" cy="70" r="18" fill="#2563EB" fillOpacity="0.2" />

                  {/* Destination Metro Diagnostics Point */}
                  <circle cx="250" cy="40" r="7" fill="#16A34A" />
                  <circle cx="250" cy="40" r="14" fill="#16A34A" fillOpacity="0.2" />
                </svg>
              </div>

              {/* Courier Status Strip */}
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
