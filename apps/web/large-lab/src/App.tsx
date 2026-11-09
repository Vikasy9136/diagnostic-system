import { useState } from 'react';
import { LABSETU_THEME, SpecimenQualityStatus } from '@diagnostic/shared';

interface IncomingSampleItem {
  sampleId: string;
  fromLab: string;
  tests: string;
  receivedAt: string;
  temperatureCelsius: number;
  quality: SpecimenQualityStatus;
  status: 'Received' | 'In Testing' | 'Report Ready';
  department: 'Hematology' | 'Biochemistry' | 'Immunology' | 'Molecular';
}

const INITIAL_INCOMING_SAMPLES: IncomingSampleItem[] = [
  {
    sampleId: 'LS250101456',
    fromLab: 'Bhandup Care Lab',
    tests: 'CBC, LFT',
    receivedAt: '10:24 AM',
    temperatureCelsius: 4.2,
    quality: SpecimenQualityStatus.INTACT,
    status: 'In Testing',
    department: 'Hematology',
  },
  {
    sampleId: 'LS250101455',
    fromLab: 'City Health Lab',
    tests: 'TSH, FT4',
    receivedAt: '10:16 AM',
    temperatureCelsius: 4.5,
    quality: SpecimenQualityStatus.INTACT,
    status: 'Received',
    department: 'Immunology',
  },
  {
    sampleId: 'LS250101454',
    fromLab: 'LifeCare Lab',
    tests: 'KFT, Electrolytes',
    receivedAt: '09:58 AM',
    temperatureCelsius: 5.1,
    quality: SpecimenQualityStatus.INTACT,
    status: 'Report Ready',
    department: 'Biochemistry',
  },
  {
    sampleId: 'LS250101453',
    fromLab: 'Apex Care Clinic',
    tests: 'Lipid Profile, HbA1c',
    receivedAt: '09:30 AM',
    temperatureCelsius: 3.8,
    quality: SpecimenQualityStatus.INTACT,
    status: 'In Testing',
    department: 'Biochemistry',
  },
  {
    sampleId: 'LS250101452',
    fromLab: 'Kalyan Diagnostics',
    tests: 'D-Dimer, Ferritin',
    receivedAt: '09:12 AM',
    temperatureCelsius: 4.0,
    quality: SpecimenQualityStatus.INTACT,
    status: 'Report Ready',
    department: 'Hematology',
  },
];

const MOCK_RATE_SCHEDULE = [
  { code: 'CBC', name: 'Complete Blood Count', dept: 'Hematology', b2bRate: '₹220', mrp: '₹400', tat: '4 Hours' },
  { code: 'LFT', name: 'Liver Function Test', dept: 'Biochemistry', b2bRate: '₹420', mrp: '₹750', tat: '6 Hours' },
  { code: 'KFT', name: 'Kidney Function Test', dept: 'Biochemistry', b2bRate: '₹380', mrp: '₹700', tat: '6 Hours' },
  { code: 'TSH', name: 'Thyroid Stimulating Hormone', dept: 'Immunology', b2bRate: '₹180', mrp: '₹350', tat: '5 Hours' },
  { code: 'HbA1c', name: 'Glycated Hemoglobin HPLC', dept: 'Biochemistry', b2bRate: '₹280', mrp: '₹550', tat: '4 Hours' },
  { code: 'LIPID', name: 'Lipid Profile Full', dept: 'Biochemistry', b2bRate: '₹350', mrp: '₹650', tat: '6 Hours' },
];

const MOCK_SETTLEMENTS = [
  { labId: 'LAB-SM-001', name: 'Bhandup Care Lab', samples: 184, billingCycle: 'Oct 2026', totalBilled: '₹42,320', status: 'Settled' },
  { labId: 'LAB-SM-002', name: 'City Health Lab', samples: 142, billingCycle: 'Oct 2026', totalBilled: '₹31,500', status: 'Pending Review' },
  { labId: 'LAB-SM-003', name: 'LifeCare Clinic', samples: 96, billingCycle: 'Oct 2026', totalBilled: '₹22,140', status: 'Settled' },
];

type PartnerTab =
  | 'dashboard'
  | 'incoming'
  | 'testing'
  | 'reports'
  | 'rates'
  | 'settlements'
  | 'analytics'
  | 'settings';

export function App() {
  const [activeTab, setActiveTab] = useState<PartnerTab>('dashboard');
  const [samples, setSamples] = useState<IncomingSampleItem[]>(INITIAL_INCOMING_SAMPLES);
  const [selectedSample, setSelectedSample] = useState<IncomingSampleItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [filterDept, setFilterDept] = useState('ALL');
  const [barcodeSearch, setBarcodeSearch] = useState('');

  const handlePublishReport = (sampleId: string) => {
    setSamples((prev) =>
      prev.map((s) => (s.sampleId === sampleId ? { ...s, status: 'Report Ready' } : s))
    );
    setSelectedSample(null);
    setToastMessage(`Diagnostic report published and synced for ${sampleId}`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <div className="app-shell">
      {/* 1. Left Sidebar Navigation (Dark Slate Teal - Consistent with Design System) */}
      <aside className="sidebar-dark">
        <div className="brand-header">
          <div className="brand-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
          </div>
          <div className="brand-title-wrap">
            <span className="brand-title">{LABSETU_THEME.brand.name}</span>
            <span className="brand-subtitle">Partner Reference Lab Portal</span>
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
            className={`sidebar-nav-item ${activeTab === 'incoming' ? 'active' : ''}`}
            onClick={() => setActiveTab('incoming')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Incoming Samples</span>
            <span className="nav-badge-teal">36</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'testing' ? 'active' : ''}`}
            onClick={() => setActiveTab('testing')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
            <span>Testing</span>
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
            className={`sidebar-nav-item ${activeTab === 'rates' ? 'active' : ''}`}
            onClick={() => setActiveTab('rates')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span>Rate Management</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'settlements' ? 'active' : ''}`}
            onClick={() => setActiveTab('settlements')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            <span>Settlements</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>Analytics</span>
          </li>

          <li
            className={`sidebar-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </li>
        </ul>

        {/* Sidebar Footer Help Card */}
        <div
          className="sidebar-footer-card"
          onClick={() => setActiveTab('settings')}
        >
          <div className="sidebar-footer-icon">🎧</div>
          <div>
            <div className="sidebar-footer-title">Help & Support</div>
            <div className="sidebar-footer-subtitle">Reference Lab Assistance</div>
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
              placeholder="Search incoming specimen, lab, or test..."
              value={barcodeSearch}
              onChange={(e) => setBarcodeSearch(e.target.value)}
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
              <div className="user-photo-avatar">M</div>
              <div className="user-profile-info">
                <span className="user-profile-name">Metro Diagnostics</span>
                <span className="user-profile-role">Partner Testing Hub</span>
              </div>
            </div>
          </div>
        </header>

        <main className="dashboard-content">
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
              }}
            >
              {toastMessage}
            </div>
          )}

          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <>
              {/* Page Title Row */}
              <div className="page-header-row">
                <div className="page-title-group">
                  <h1>Good Morning, Metro Diagnostics</h1>
                  <p>Partner Laboratory Accessioning & Diagnostic Testing Dashboard</p>
                </div>
              </div>

              {/* 4 KPI Cards */}
              <section className="kpi-row">
                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-teal">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </div>
                  <div className="kpi-body">
                    <span className="kpi-title">Incoming Samples</span>
                    <span className="kpi-main-number">36</span>
                  </div>
                </div>

                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-blue">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
                    </svg>
                  </div>
                  <div className="kpi-body">
                    <span className="kpi-title">In Testing</span>
                    <span className="kpi-main-number">28</span>
                  </div>
                </div>

                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-green">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <div className="kpi-body">
                    <span className="kpi-title">Reports Ready</span>
                    <span className="kpi-main-number">22</span>
                  </div>
                </div>

                <div className="kpi-card-modern">
                  <div className="kpi-icon-box-teal">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div className="kpi-body">
                    <span className="kpi-title">On-Time TAT</span>
                    <span className="kpi-main-number">98%</span>
                  </div>
                </div>
              </section>

              {/* Incoming Samples Table */}
              <div className="chart-card-modern">
                <div className="card-top-header">
                  <span className="card-top-title">Incoming Samples (36)</span>
                  <div>
                    <select className="btn-secondary">
                      <option>Today</option>
                      <option>Yesterday</option>
                    </select>
                  </div>
                </div>

                <div className="data-table-container">
                  <table className="modern-data-table">
                    <thead>
                      <tr>
                        <th>Sample ID</th>
                        <th>From Lab</th>
                        <th>Test(s)</th>
                        <th>Received</th>
                        <th>Arrival Temp</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {samples.map((item) => (
                        <tr key={item.sampleId}>
                          <td>
                            <strong style={{ color: '#0F172A' }}>{item.sampleId}</strong>
                          </td>
                          <td>{item.fromLab}</td>
                          <td style={{ color: '#64748B' }}>{item.tests}</td>
                          <td>{item.receivedAt}</td>
                          <td>
                            <span style={{ color: '#16A34A', fontWeight: 600 }}>
                              {item.temperatureCelsius}°C
                            </span>
                          </td>
                          <td>
                            <span
                              className={`status-pill ${
                                item.status === 'Report Ready'
                                  ? 'status-report-ready'
                                  : item.status === 'In Testing'
                                  ? 'status-testing'
                                  : 'status-in-transit'
                              }`}
                            >
                              ● {item.status}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                              onClick={() => setSelectedSample(item)}
                            >
                              Manage QC
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: INCOMING SAMPLES (ACCESSIONING & QC) */}
          {activeTab === 'incoming' && (
            <div className="surface-card">
              <div className="card-header-flex">
                <div>
                  <h3 className="card-title">Specimen Accessioning Worklist</h3>
                  <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                    Match arriving cooler bags, verify cold-chain logger values, and log custody accessioning
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="Scan or type barcode..."
                  className="form-input"
                  style={{ width: '220px', padding: '6px 12px' }}
                  value={barcodeSearch}
                  onChange={(e) => setBarcodeSearch(e.target.value)}
                />
              </div>

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Barcode Accession</th>
                      <th>Origin Lab</th>
                      <th>Test Panel</th>
                      <th>Time Received</th>
                      <th>Cold-Chain Sensor</th>
                      <th>QC Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {samples
                      .filter((s) => s.sampleId.toLowerCase().includes(barcodeSearch.toLowerCase()))
                      .map((s) => (
                        <tr key={s.sampleId}>
                          <td><strong>{s.sampleId}</strong></td>
                          <td>{s.fromLab}</td>
                          <td>{s.tests}</td>
                          <td>{s.receivedAt}</td>
                          <td>
                            <span style={{ color: '#16A34A', fontWeight: 600 }}>
                              {s.temperatureCelsius}°C (Safe)
                            </span>
                          </td>
                          <td>
                            <span className="status-pill status-sample-picked">● {s.quality}</span>
                          </td>
                          <td>
                            <button
                              className="btn-primary"
                              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                              onClick={() => setSelectedSample(s)}
                            >
                              Inspect & Accession
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: TESTING WORKLIST */}
          {activeTab === 'testing' && (
            <div className="surface-card">
              <div className="card-header-flex">
                <div>
                  <h3 className="card-title">Laboratory Analytical Queue</h3>
                  <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                    Specimens currently undergoing automated analyzer or manual bench evaluation
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['ALL', 'Hematology', 'Biochemistry', 'Immunology'].map((dept) => (
                    <button
                      key={dept}
                      className={filterDept === dept ? 'btn-primary' : 'btn-secondary'}
                      style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                      onClick={() => setFilterDept(dept)}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              </div>

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sample ID</th>
                      <th>Department</th>
                      <th>Tests Assigned</th>
                      <th>Source Center</th>
                      <th>Analyzer Status</th>
                      <th>Target Completion</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {samples
                      .filter((s) => filterDept === 'ALL' || s.department === filterDept)
                      .map((s) => (
                        <tr key={s.sampleId}>
                          <td><strong>{s.sampleId}</strong></td>
                          <td>{s.department}</td>
                          <td>{s.tests}</td>
                          <td>{s.fromLab}</td>
                          <td>
                            <span className="status-pill status-testing">
                              ● {s.status === 'Report Ready' ? 'Analysis Complete' : 'On Analyzer (45%)'}
                            </span>
                          </td>
                          <td>Within 2.5 Hours</td>
                          <td>
                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                              onClick={() => setSelectedSample(s)}
                            >
                              Enter Results
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: REPORTS CENTER */}
          {activeTab === 'reports' && (
            <div className="surface-card">
              <div className="card-header-flex">
                <div>
                  <h3 className="card-title">Diagnostic Reports & Pathologist Approval</h3>
                  <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                    Review analytical results, apply digital signature, and publish to small lab portals
                  </p>
                </div>
              </div>

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sample Barcode</th>
                      <th>Origin Lab</th>
                      <th>Tests Performed</th>
                      <th>Turnaround Time</th>
                      <th>Reporting Pathologist</th>
                      <th>Report Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {samples.map((s) => (
                      <tr key={s.sampleId}>
                        <td><strong>{s.sampleId}</strong></td>
                        <td>{s.fromLab}</td>
                        <td>{s.tests}</td>
                        <td>3h 45m</td>
                        <td>Dr. S. Kulkarni (MD Path)</td>
                        <td>
                          <span className={`status-pill ${s.status === 'Report Ready' ? 'status-report-ready' : 'status-testing'}`}>
                            ● {s.status}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            onClick={() => setSelectedSample(s)}
                          >
                            Upload Verified PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: RATE MANAGEMENT */}
          {activeTab === 'rates' && (
            <div className="surface-card">
              <div className="card-header-flex">
                <div>
                  <h3 className="card-title">B2B Partner Laboratory Tariff Schedule</h3>
                  <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                    Agreed institutional pricing contracted with affiliated local diagnostic collection centers
                  </p>
                </div>
                <button className="btn-primary" onClick={() => alert('New test panel added to pricing master.')}>
                  + Add Test Panel
                </button>
              </div>

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Test Code</th>
                      <th>Panel Name</th>
                      <th>Department</th>
                      <th>B2B Contracted Price</th>
                      <th>Retail MRP</th>
                      <th>Guaranteed TAT</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_RATE_SCHEDULE.map((r) => (
                      <tr key={r.code}>
                        <td><strong style={{ color: '#0D9488' }}>{r.code}</strong></td>
                        <td>{r.name}</td>
                        <td>{r.dept}</td>
                        <td><strong>{r.b2bRate}</strong></td>
                        <td><span style={{ color: '#64748B' }}>{r.mrp}</span></td>
                        <td>{r.tat}</td>
                        <td>
                          <button
                            className="btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            onClick={() => alert(`Edit rate for ${r.code}`)}
                          >
                            Edit Rate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: SETTLEMENTS */}
          {activeTab === 'settlements' && (
            <div className="surface-card">
              <div className="card-header-flex">
                <div>
                  <h3 className="card-title">B2B Lab Billing & Settlements</h3>
                  <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                    Monthly accounts receivable from small diagnostic clinics and sample pickup centers
                  </p>
                </div>
              </div>

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Client Lab ID</th>
                      <th>Diagnostic Center</th>
                      <th>Samples Handled</th>
                      <th>Billing Period</th>
                      <th>Total Receivable</th>
                      <th>Settlement Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_SETTLEMENTS.map((settle) => (
                      <tr key={settle.labId}>
                        <td><strong>{settle.labId}</strong></td>
                        <td>{settle.name}</td>
                        <td>{settle.samples} Units</td>
                        <td>{settle.billingCycle}</td>
                        <td><strong style={{ color: '#0F172A' }}>{settle.totalBilled}</strong></td>
                        <td>
                          <span className={`status-pill ${settle.status === 'Settled' ? 'status-sample-picked' : 'status-testing'}`}>
                            ● {settle.status}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            onClick={() => alert(`Invoice generated for ${settle.name}`)}
                          >
                            View Invoice
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: ANALYTICS */}
          {activeTab === 'analytics' && (
            <div>
              <div className="kpi-row" style={{ marginBottom: '20px' }}>
                <div className="kpi-card">
                  <div>
                    <div className="kpi-val">98.2%</div>
                    <div className="kpi-label">On-Time Report Delivery</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <div>
                    <div className="kpi-val">4.1 hrs</div>
                    <div className="kpi-label">Average Sample Turnaround</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <div>
                    <div className="kpi-val">0.18%</div>
                    <div className="kpi-label">Pre-Analytical Rejection Rate</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <div>
                    <div className="kpi-val">1,248</div>
                    <div className="kpi-label">Specimens Processed MTD</div>
                  </div>
                </div>
              </div>

              <div className="surface-card">
                <h3 className="card-title">Daily Processing Volume Trend</h3>
                <div style={{ padding: '24px 0', display: 'flex', alignItems: 'flex-end', gap: '20px', height: '220px', borderBottom: '1px solid #E2E8F0' }}>
                  {[
                    { day: 'Mon', count: 180 },
                    { day: 'Tue', count: 210 },
                    { day: 'Wed', count: 195 },
                    { day: 'Thu', count: 240 },
                    { day: 'Fri', count: 265 },
                    { day: 'Sat', count: 310 },
                    { day: 'Sun', count: 140 },
                  ].map((bar) => (
                    <div key={bar.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>{bar.count}</span>
                      <div
                        style={{
                          width: '100%',
                          maxWidth: '44px',
                          height: `${(bar.count / 320) * 160}px`,
                          backgroundColor: '#0D9488',
                          borderRadius: '6px 6px 0 0',
                        }}
                      />
                      <span style={{ fontSize: '0.8rem', color: '#0F172A', fontWeight: 600 }}>{bar.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="surface-card" style={{ maxWidth: '720px' }}>
              <h3 className="card-title">Partner Reference Laboratory Profile</h3>
              <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '4px' }}>
                Operational credentials, NABL accreditation certificates, and pickup cut-off times
              </p>

              <div style={{ marginTop: '20px' }}>
                <div className="form-group">
                  <label className="form-label">Laboratory Official Name</label>
                  <input type="text" className="form-input" value="Metro Diagnostics Core Testing Facility" disabled />
                </div>
                <div className="form-group">
                  <label className="form-label">Accreditation ID</label>
                  <input type="text" className="form-input" value="NABL MC-2024-ISO15189" disabled />
                </div>
                <div className="form-group">
                  <label className="form-label">Evening Sample Cut-off Window</label>
                  <input type="text" className="form-input" defaultValue="08:30 PM (Samples arriving later processed next morning)" />
                </div>
                <div className="form-group">
                  <label className="form-label">Cold-Chain Handover Mandatory Temp Range</label>
                  <input type="text" className="form-input" value="2.0°C to 8.0°C (Automated data-logger sync)" disabled />
                </div>
                <button className="btn-primary" onClick={() => alert('Settings updated.')}>
                  Save Preferences
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* QC & Report Modal */}
      {selectedSample && (
        <div className="modal-overlay" onClick={() => setSelectedSample(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                Specimen QC & Report: {selectedSample.sampleId}
              </h3>
              <button
                onClick={() => setSelectedSample(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#64748B' }}>
                Origin: <strong>{selectedSample.fromLab}</strong> | Tests: <strong>{selectedSample.tests}</strong>
              </p>
              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.85rem', color: '#16A34A', fontWeight: 600 }}>
                  ✓ Arrival Temperature: {selectedSample.temperatureCelsius}°C (Pass: 2°C - 8°C)
                </div>
                <div style={{ fontSize: '0.85rem', color: '#16A34A', fontWeight: 600, marginTop: '4px' }}>
                  ✓ Specimen Integrity: Intact / No Hemolysis
                </div>
              </div>

              <div style={{ border: '2px dashed #CBD5E1', padding: '24px', textAlign: 'center', borderRadius: '8px' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" style={{ margin: '0 auto 8px auto' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Drag and drop verified PDF report</div>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>or click to browse from laboratory LIMS</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedSample(null)}>
                Close
              </button>
              <button
                className="btn-primary"
                onClick={() => handlePublishReport(selectedSample.sampleId)}
              >
                Approve & Publish Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
