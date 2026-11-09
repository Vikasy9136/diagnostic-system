import { useState } from 'react';
import { LABSETU_THEME } from '@diagnostic/shared';

interface ActiveCourier {
  id: string;
  name: string;
  phone: string;
  activeOrders: number;
  currentLocation: string;
  battery: string;
  tempStatus: string;
}

const ACTIVE_COURIERS: ActiveCourier[] = [
  {
    id: 'PHL-204',
    name: 'Rahul Yadav',
    phone: '+91 98000 00000',
    activeOrders: 3,
    currentLocation: 'Mulund West Link Rd',
    battery: '88%',
    tempStatus: 'Normal (4.2°C)',
  },
  {
    id: 'PHL-188',
    name: 'Amit Salunkhe',
    phone: '+91 98111 22233',
    activeOrders: 2,
    currentLocation: 'Thane Station Area',
    battery: '74%',
    tempStatus: 'Normal (4.8°C)',
  },
  {
    id: 'PHL-312',
    name: 'Vikram Shinde',
    phone: '+91 98222 33344',
    activeOrders: 4,
    currentLocation: 'Ghatkopar East',
    battery: '92%',
    tempStatus: 'Normal (3.9°C)',
  },
];

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'labs' | 'phlebotomists' | 'bookings' | 'analytics'>('dashboard');
  const [selectedCourier, setSelectedCourier] = useState<ActiveCourier | null>(null);

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

          <li
            className={`nav-item ${activeTab === 'labs' ? 'active' : ''}`}
            onClick={() => setActiveTab('labs')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Labs
          </li>

          <li
            className={`nav-item ${activeTab === 'phlebotomists' ? 'active' : ''}`}
            onClick={() => setActiveTab('phlebotomists')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Phlebotomists
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

          <li className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
            Samples
          </li>

          <li className="nav-item">
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

          <li className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
              <path d="M12 18V6" />
            </svg>
            Commission
          </li>

          <li
            className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Analytics
          </li>

          <li className="nav-item" style={{ marginTop: 'auto' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </li>
        </ul>
      </aside>

      {/* 2. Main Wrapper */}
      <div className="main-wrapper">
        <header className="top-nav">
          <div className="top-greeting">
            <h2>Admin Dashboard</h2>
            <p>Platform Operations</p>
          </div>

          <div className="top-actions">
            <button className="icon-btn" aria-label="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>

            <div className="user-pill">
              <div className="user-avatar" style={{ background: '#0F766E' }}>A</div>
              <span className="user-name">Admin Operations</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </header>

        <main className="page-content">
          {/* 4 Platform KPI Cards */}
          <section className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-icon-box" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              </div>
              <div>
                <div className="kpi-val">124</div>
                <div className="kpi-label">Total Labs</div>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-box" style={{ background: '#FAF5FF', color: '#7E22CE' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <div className="kpi-val">312</div>
                <div className="kpi-label">Phlebotomists</div>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-box" style={{ background: '#FDF2F8', color: '#DB2777' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <div>
                <div className="kpi-val">1,428</div>
                <div className="kpi-label">Total Bookings</div>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-box" style={{ background: '#ECFDF5', color: '#16A34A' }}>
                <span style={{ fontSize: '1.3rem', fontWeight: 700 }}>₹</span>
              </div>
              <div>
                <div className="kpi-val">₹8,64,500</div>
                <div className="kpi-label">Revenue (MTD)</div>
              </div>
            </div>
          </section>

          {/* Live Operations Dispatch Screen */}
          <div className="surface-card">
            <div className="card-header-flex">
              <h3 className="card-title">Live Operations</h3>
              <div className="ops-chips-bar">
                <span className="ops-chip ops-chip-blue">
                  <span className="ops-dot" style={{ background: '#2563EB' }} />
                  342 In Progress
                </span>
                <span className="ops-chip ops-chip-green">
                  <span className="ops-dot" style={{ background: '#16A34A' }} />
                  1,028 Completed
                </span>
                <span className="ops-chip ops-chip-red">
                  <span className="ops-dot" style={{ background: '#DC2626' }} />
                  58 Delayed
                </span>
              </div>
            </div>

            {/* Interactive Live Route Network SVG Canvas */}
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                height: '320px',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="100%" height="100%" viewBox="0 0 800 320" preserveAspectRatio="none">
                {/* Street Grid network */}
                <path d="M 50 80 L 750 80 M 50 160 L 750 160 M 50 240 L 750 240 M 150 20 L 150 300 M 300 20 L 300 300 M 450 20 L 450 300 M 600 20 L 600 300" stroke="#E2E8F0" strokeWidth="1.5" />

                {/* Primary Hub route connections */}
                <path d="M 150 160 Q 250 80 400 120 T 650 200" fill="none" stroke="#0D9488" strokeWidth="3" strokeDasharray="6 4" />
                <path d="M 220 240 Q 320 200 480 180 T 700 90" fill="none" stroke="#2563EB" strokeWidth="3" strokeDasharray="6 4" />

                {/* Node Markers */}
                {/* Small Lab Nodes */}
                <circle cx="150" cy="160" r="9" fill="#0D9488" />
                <circle cx="220" cy="240" r="9" fill="#0D9488" />

                {/* Moving Phlebotomist Couriers */}
                <circle cx="320" cy="100" r="11" fill="#2563EB" cursor="pointer" />
                <circle cx="320" cy="100" r="20" fill="#2563EB" fillOpacity="0.25" />

                <circle cx="480" cy="180" r="11" fill="#2563EB" cursor="pointer" />
                <circle cx="480" cy="180" r="20" fill="#2563EB" fillOpacity="0.25" />

                {/* Reference Lab Hubs */}
                <circle cx="650" cy="200" r="14" fill="#0F766E" />
                <circle cx="700" cy="90" r="14" fill="#0F766E" />
              </svg>

              <div
                style={{
                  position: 'absolute',
                  bottom: '16px',
                  left: '16px',
                  background: 'rgba(255, 255, 255, 0.95)',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                  fontSize: '0.825rem',
                  display: 'flex',
                  gap: '16px',
                }}
              >
                <div>● <strong>Teal:</strong> Small Lab Collection Centers</div>
                <div>● <strong>Blue:</strong> Phlebotomists In Transit</div>
                <div>● <strong>Dark Teal:</strong> Partner Testing Hubs</div>
              </div>
            </div>

            {/* Courier Dispatch Table */}
            <div style={{ marginTop: '24px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#0F172A' }}>
                Active Couriers & Cold-Chain Telemetry
              </h4>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Courier ID</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Active Pickups</th>
                    <th>GPS Telemetry</th>
                    <th>Cooler Box Temp</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ACTIVE_COURIERS.map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.id}</strong></td>
                      <td>{c.name}</td>
                      <td>{c.phone}</td>
                      <td>{c.activeOrders} Batches</td>
                      <td>{c.currentLocation} (Battery: {c.battery})</td>
                      <td>
                        <span style={{ color: '#16A34A', fontWeight: 600 }}>
                          {c.tempStatus}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                          onClick={() => setSelectedCourier(c)}
                        >
                          View Telemetry
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Courier Telemetry Modal */}
      {selectedCourier && (
        <div className="modal-overlay" onClick={() => setSelectedCourier(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                Courier Telemetry: {selectedCourier.name} ({selectedCourier.id})
              </h3>
              <button
                onClick={() => setSelectedCourier(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Device Battery</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>{selectedCourier.battery}</div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Cooler Box Sensor</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#16A34A' }}>{selectedCourier.tempStatus}</div>
                </div>
              </div>
              <p style={{ fontSize: '0.875rem', color: '#64748B' }}>
                Current Road: <strong>{selectedCourier.currentLocation}</strong>
              </p>
              <p style={{ fontSize: '0.875rem', color: '#64748B' }}>
                SLA Status: <strong>On-Time (Next Stop ETA 12 mins)</strong>
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedCourier(null)}>
                Close
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  alert(`Direct Dispatch Radio opened for ${selectedCourier.name}`);
                  setSelectedCourier(null);
                }}
              >
                Dispatch Command Radio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
