import { useState } from 'react';
import {
  UserRole,
  OrderStatus,
  OrderPriority,
  PickupOrder,
  StorageTemperature,
  SpecimenType,
  TubeType,
} from '@diagnostic/shared';

const MOCK_ADMIN_ORDERS: PickupOrder[] = [
  {
    id: 'ord_mock_001',
    orderNumber: 'ORD-202611-0001',
    smallLabId: 'LAB-SM-001',
    smallLabName: 'Apex Clinical Care Collection Center',
    targetLabId: 'LAB-LG-100',
    targetLabName: 'National Reference Diagnostics Core Lab',
    phlebotomistId: 'PHL-204',
    phlebotomistName: 'Rohan Sharma',
    status: OrderStatus.IN_TRANSIT,
    priority: OrderPriority.STAT_CRITICAL,
    patient: {
      id: 'PT-9482',
      pseudonym: 'PT-9482',
      age: 42,
      gender: 'MALE',
    },
    specimens: [
      {
        id: 'SMP-202611-0001',
        barcode: 'SMP-202611-0001',
        testCode: 'CBC-01',
        testName: 'Complete Blood Count',
        specimenType: SpecimenType.BLOOD,
        tubeType: TubeType.EDTA_LAVENDER,
        temperatureRequirement: StorageTemperature.REFRIGERATED,
        collectedAt: new Date().toISOString(),
      },
    ],
    custodyHistory: [],
    pickupLocation: {
      address: 'Sector 15, Gurgaon',
      latitude: 28.4595,
      longitude: 77.0266,
    },
    deliveryLocation: {
      address: 'Okhla Phase 3, New Delhi',
      latitude: 28.5355,
      longitude: 77.2680,
    },
    scheduledPickupAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function App() {
  const [orders] = useState<PickupOrder[]>(MOCK_ADMIN_ORDERS);

  return (
    <div className="portal-container">
      <header className="header-card">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>
            Admin Logistics & Dispatch Command Center
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Multi-Lab Fleet Monitoring, SLA Alarms & Specimen Chain-of-Custody Audit
          </p>
        </div>
        <div>
          <span className="badge badge-admin">Role: {UserRole.ADMIN}</span>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Active Pickups</span>
          <div className="kpi-num">14</div>
        </div>
        <div className="kpi-card">
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Field Phlebotomists</span>
          <div className="kpi-num">8 Active</div>
        </div>
        <div className="kpi-card">
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>SLA Compliance Rate</span>
          <div className="kpi-num" style={{ color: '#15803d' }}>98.4%</div>
        </div>
        <div className="kpi-card">
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Cold-Chain Excursions</span>
          <div className="kpi-num" style={{ color: '#15803d' }}>0 Alarms</div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Live Dispatch Ledger</h3>
          <table className="specimen-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Priority</th>
                <th>Small Lab Origin</th>
                <th>Phlebotomist</th>
                <th>Status</th>
                <th>Target Reference Lab</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.orderNumber}</strong></td>
                  <td>
                    <span style={{ color: '#b91c1c', fontWeight: 600 }}>{o.priority}</span>
                  </td>
                  <td>{o.smallLabName}</td>
                  <td>{o.phlebotomistName}</td>
                  <td>
                    <span className="badge badge-status">{o.status}</span>
                  </td>
                  <td>{o.targetLabName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Fleet Telemetry Status</h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Phlebotomist: <strong>Rohan Sharma (PHL-204)</strong>
          </p>
          <ul style={{ paddingLeft: '20px', fontSize: '0.9rem' }}>
            <li>GPS Telemetry: <strong>Active (28.4595, 77.0266)</strong></li>
            <li>Cooler Box Temp: <strong>4.8°C (Safe)</strong></li>
            <li>Speed: <strong>26 km/h</strong></li>
            <li>ETA to Reference Lab: <strong>24 mins</strong></li>
          </ul>
          <button className="btn" style={{ width: '100%', marginTop: '16px' }}>
            Open Live Telemetry Map
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
