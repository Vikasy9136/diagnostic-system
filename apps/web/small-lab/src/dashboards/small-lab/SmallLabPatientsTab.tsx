import { type PatientRecord } from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';

export interface SmallLabPatientsTabProps {
  facilityName: string;
  filteredPatients: PatientRecord[];
  onOpenAddPatient: () => void;
  onBookForPatient: (patientId: string) => void;
}

export function SmallLabPatientsTab({
  facilityName,
  filteredPatients,
  onOpenAddPatient,
  onBookForPatient,
}: SmallLabPatientsTabProps) {
  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <div>
          <h2 className="card-top-title">Patient Directory ({filteredPatients.length})</h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Saved directly for {facilityName}</p>
        </div>
        <button type="button" className="btn-primary" onClick={onOpenAddPatient}>
          + Add Patient
        </button>
      </div>
      {filteredPatients.length === 0 ? (
        <EmptyStateBox
          title="No Registered Patients Yet"
          description="Add patients here for fast one-click selection during sample dispatch bookings."
          actionLabel="+ Add First Patient"
          onAction={onOpenAddPatient}
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Name</th>
                <th>Age / Gender</th>
                <th>Phone</th>
                <th>Total Orders</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.map((pt) => (
                <tr key={pt.id}>
                  <td>
                    <strong>{pt.id}</strong>
                  </td>
                  <td>{pt.name}</td>
                  <td>
                    {pt.age}y / {pt.gender}
                  </td>
                  <td>{pt.phone}</td>
                  <td>{pt.totalOrders || 0}</td>
                  <td>
                    <button type="button" className="btn-primary" onClick={() => onBookForPatient(pt.id)}>
                      Book Test →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

