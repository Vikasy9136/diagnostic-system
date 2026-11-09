import { useState } from 'react';
import {
  UserRole,
  OrderStatus,
  OrderPriority,
  SpecimenQualityStatus,
  StorageTemperature,
  SpecimenType,
  TubeType,
  PickupOrder,
} from '@diagnostic/shared';

const MOCK_INBOUND_BATCH: PickupOrder[] = [
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
        qualityStatus: SpecimenQualityStatus.INTACT,
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
    scheduledPickupAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function App() {
  const [inbound] = useState<PickupOrder[]>(MOCK_INBOUND_BATCH);

  return (
    <div className="portal-container">
      <header className="header-card">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>
            Large Partner Reference Lab Portal
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Specimen Accessioning, Pre-Analytical Quality Check & Diagnostic Reporting
          </p>
        </div>
        <div>
          <span className="badge badge-large-lab">Role: {UserRole.LARGE_LAB}</span>
        </div>
      </header>

      <div className="grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Inbound Specimen Batches</h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Receiving Facility: <strong>National Reference Diagnostics (LAB-LG-100)</strong>
          </p>

          <table className="specimen-table">
            <thead>
              <tr>
                <th>Accession Barcode</th>
                <th>Source Origin</th>
                <th>Courier / Phlebo</th>
                <th>Specimen Tube</th>
                <th>Transit Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {inbound.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.specimens[0].barcode}</strong></td>
                  <td>{item.smallLabName}</td>
                  <td>{item.phlebotomistName}</td>
                  <td>{item.specimens[0].tubeType}</td>
                  <td>
                    <span className="badge badge-status">{item.status}</span>
                  </td>
                  <td>
                    <button className="btn" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                      Scan & Accession
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pre-Analytical QC Criteria</h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Automated verification parameters:
          </p>
          <ul style={{ paddingLeft: '20px', fontSize: '0.9rem' }}>
            <li>Container Integrity: <strong>{SpecimenQualityStatus.INTACT}</strong></li>
            <li>Cold-Chain Arrival Check: <strong>4.2°C (Compliant: 2°C - 8°C)</strong></li>
            <li>Volume Check: <strong>Adequate for Automated Hematology</strong></li>
          </ul>
          <div style={{ marginTop: '20px' }}>
            <button className="btn">+ Upload Final Verified Report (PDF)</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
