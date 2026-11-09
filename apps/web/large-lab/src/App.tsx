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
  },
  {
    sampleId: 'LS250101455',
    fromLab: 'City Health Lab',
    tests: 'TSH, FT4',
    receivedAt: '10:16 AM',
    temperatureCelsius: 4.5,
    quality: SpecimenQualityStatus.INTACT,
    status: 'Received',
  },
  {
    sampleId: 'LS250101454',
    fromLab: 'LifeCare Lab',
    tests: 'KFT, Electrolytes',
    receivedAt: '09:58 AM',
    temperatureCelsius: 5.1,
    quality: SpecimenQualityStatus.INTACT,
    status: 'Report Ready',
  },
  {
    sampleId: 'LS250101453',
    fromLab: 'Apex Care Clinic',
    tests: 'Lipid Profile, HbA1c',
    receivedAt: '09:30 AM',
    temperatureCelsius: 3.8,
    quality: SpecimenQualityStatus.INTACT,
    status: 'In Testing',
  },
];

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'incoming' | 'testing' | 'reports'>('dashboard');
  const [samples, setSamples] = useState<IncomingSampleItem[]>(INITIAL_INCOMING_SAMPLES);
  const [selectedSample, setSelectedSample] = useState<IncomingSampleItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
            className={`nav-item ${activeTab === 'incoming' ? 'active' : ''}`}
            onClick={() => setActiveTab('incoming')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Incoming Samples
          </li>

          <li
            className={`nav-item ${activeTab === 'testing' ? 'active' : ''}`}
            onClick={() => setActiveTab('testing')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
            Testing
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
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            Rate Management
          </li>

          <li className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            Settlements
          </li>

          <li className="nav-item">
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
            <h2>Good Morning, Metro Diagnostics</h2>
            <p>Partner Lab Dashboard</p>
          </div>

          <div className="top-actions">
            <button className="icon-btn" aria-label="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>

            <div className="user-pill">
              <div className="user-avatar" style={{ background: '#2563EB' }}>M</div>
              <span className="user-name">Metro Diagnostics (Partner Lab)</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </header>

        <main className="page-content">
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

          {/* 4 KPI Cards */}
          <section className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-icon-box" style={{ background: '#F0FDFA', color: '#0D9488' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div>
                <div className="kpi-val">36</div>
                <div className="kpi-label">Incoming Samples</div>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-box" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
                </svg>
              </div>
              <div>
                <div className="kpi-val">28</div>
                <div className="kpi-label">In Testing</div>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-box" style={{ background: '#ECFDF5', color: '#16A34A' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <div>
                <div className="kpi-val">22</div>
                <div className="kpi-label">Reports Ready</div>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-box" style={{ background: '#FAF5FF', color: '#7E22CE' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <div className="kpi-val">98%</div>
                <div className="kpi-label">On-Time TAT</div>
              </div>
            </div>
          </section>

          {/* Incoming Samples Table */}
          <div className="surface-card">
            <div className="card-header-flex">
              <h3 className="card-title">Incoming Samples (36)</h3>
              <div>
                <select className="btn-secondary" style={{ padding: '6px 12px' }}>
                  <option>Today</option>
                  <option>Yesterday</option>
                </select>
              </div>
            </div>

            <div className="data-table-container">
              <table className="data-table">
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
