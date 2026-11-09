import { useState } from 'react';
import {
  UserRole,
  OrderStatus,
  OrderPriority,
  StorageTemperature,
  SpecimenType,
  TubeType,
  PickupOrder,
} from '@diagnostic/shared';

const MOCK_SMALL_LAB_ORDER: PickupOrder = {
  id: 'ord_mock_001',
  orderNumber: 'ORD-202611-0001',
  smallLabId: 'LAB-SM-001',
  smallLabName: 'Apex Clinical Care Collection Center',
  targetLabId: 'LAB-LG-100',
  targetLabName: 'National Reference Diagnostics Core Lab',
  phlebotomistId: 'PHL-204',
  phlebotomistName: 'Rohan Sharma',
  status: OrderStatus.READY_FOR_PICKUP,
  priority: OrderPriority.URGENT,
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
    address: 'Shop 4, Sector 15 Market, Gurgaon',
    latitude: 28.4595,
    longitude: 77.0266,
  },
  deliveryLocation: {
    address: 'Core Diagnostics Reference Lab, New Delhi',
    latitude: 28.5355,
    longitude: 77.2680,
  },
  scheduledPickupAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export function App() {
  const [orders] = useState<PickupOrder[]>([MOCK_SMALL_LAB_ORDER]);

  return (
    <div className="portal-container">
      <header className="header-card">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>
            Small Diagnostic Lab Web Portal
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Specimen Manifests & Phlebotomist Pickup Dispatch
          </p>
        </div>
        <div>
          <span className="badge badge-small-lab">Role: {UserRole.SMALL_LAB}</span>
        </div>
      </header>

      <div className="grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Active Pickup Requests</h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Collection Center: <strong>Apex Clinical Care (LAB-SM-001)</strong>
          </p>

          <table className="specimen-table">
            <thead>
              <tr>
                <th>Order Number</th>
                <th>Priority</th>
                <th>Specimens</th>
                <th>Target Reference Lab</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td><strong>{order.orderNumber}</strong></td>
                  <td>
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>
                      {order.priority}
                    </span>
                  </td>
                  <td>{order.specimens.length} tubes ({order.specimens[0].tubeType})</td>
                  <td>{order.targetLabName}</td>
                  <td>
                    <span className="badge badge-status">{order.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
            <button className="btn">+ Book New Specimen Pickup</button>
            <button className="btn" style={{ background: '#475569' }}>Print Sample Barcodes</button>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Cold-Chain Compliance Preview</h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Prescribed storage parameters for current batch:
          </p>
          <ul style={{ paddingLeft: '20px', fontSize: '0.9rem' }}>
            <li>EDTA Blood Tube: <strong>Refrigerated (2°C to 8°C)</strong></li>
            <li>Assigned Phlebotomist: <strong>{MOCK_SMALL_LAB_ORDER.phlebotomistName}</strong></li>
            <li>Estimated Courier ETA: <strong>18 minutes</strong></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
