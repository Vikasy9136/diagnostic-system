import { type FormEvent, useEffect, useState } from 'react';
import { type CollectionCentreRecord } from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';
import {
  listCollectionCentresApi,
  saveCollectionCentreApi,
} from '../../services/workflowApiService';

export interface LargeLabCentresTabProps {
  largeLabId: string;
  largeLabName: string;
  onAlert: (alert: {
    variant: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }) => void;
}

export function LargeLabCentresTab({
  largeLabId,
  largeLabName,
  onAlert,
}: LargeLabCentresTabProps) {
  const [centres, setCentres] = useState<CollectionCentreRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Mumbai');
  const [pincode, setPincode] = useState('');
  const [contactPersonName, setContactPersonName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [operatingHours, setOperatingHours] = useState('07:00 AM - 09:00 PM');
  const [isAvailable, setIsAvailable] = useState(true);

  async function loadCentres() {
    if (!largeLabId) return;
    setLoading(true);
    try {
      const list = await listCollectionCentresApi(largeLabId);
      setCentres(list);
    } catch (err) {
      onAlert({
        variant: 'error',
        title: 'Could Not Load Collection Centres',
        message: (err as Error).message,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCentres();
  }, [largeLabId]);

  function resetForm() {
    setEditingId(undefined);
    setName('');
    setAddress('');
    setCity('Mumbai');
    setPincode('');
    setContactPersonName('');
    setContactPhone('');
    setOperatingHours('07:00 AM - 09:00 PM');
    setIsAvailable(true);
  }

  function startEdit(c: CollectionCentreRecord) {
    setEditingId(c.id);
    setName(c.name);
    setAddress(c.address);
    setCity(c.city);
    setPincode(c.pincode);
    setContactPersonName(c.contactPersonName);
    setContactPhone(c.contactPhone);
    setOperatingHours(c.operatingHours);
    setIsAvailable(c.isAvailable);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !address.trim() || !city.trim() || !pincode.trim() || !contactPersonName.trim() || !contactPhone.trim()) {
      onAlert({
        variant: 'warning',
        title: 'Missing Required Fields',
        message: 'Fill Centre Name, Address, City, Pincode, Contact Person, and Contact Phone.',
      });
      return;
    }
    setSaving(true);
    try {
      await saveCollectionCentreApi({
        id: editingId,
        largeLabId,
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        pincode: pincode.trim(),
        contactPersonName: contactPersonName.trim(),
        contactPhone: contactPhone.trim(),
        operatingHours: operatingHours.trim() || '07:00 AM - 09:00 PM',
        isAvailable,
      });
      onAlert({
        variant: 'success',
        title: editingId ? 'Collection Centre Updated' : 'Collection Centre Added',
        message: `${name.trim()} is now ${isAvailable ? 'available' : 'paused'} for Small Lab bookings and Phlebo drop-offs.`,
      });
      resetForm();
      await loadCentres();
    } catch (err) {
      onAlert({
        variant: 'error',
        title: 'Save Failed',
        message: (err as Error).message,
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability(c: CollectionCentreRecord) {
    try {
      await saveCollectionCentreApi({
        ...c,
        isAvailable: !c.isAvailable,
      });
      await loadCentres();
    } catch (err) {
      onAlert({
        variant: 'error',
        title: 'Status Update Failed',
        message: (err as Error).message,
      });
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(380px, 1.4fr)', gap: '18px', alignItems: 'start' }}>
      <div className="chart-card-modern">
        <div className="card-top-header">
          <div>
            <h2 className="card-top-title">
              {editingId ? 'Edit Collection Centre' : 'Add Collection Centre / Processing Location'}
            </h2>
            <p style={{ fontSize: '0.78rem', color: '#64748B' }}>
              Configure drop-off centres &amp; receiving contact persons for {largeLabName}
            </p>
          </div>
        </div>
        <form onSubmit={handleSave} style={{ display: 'grid', gap: '12px' }}>
          <div>
            <label className="form-label">Centre Name *</label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Andheri West Processing Hub"
              required
            />
          </div>
          <div>
            <label className="form-label">Full Address *</label>
            <input
              className="form-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Building, Street, Landmark"
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label className="form-label">City *</label>
              <input className="form-input" value={city} onChange={(e) => setCity(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Pincode *</label>
              <input className="form-input" value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="400053" required />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label className="form-label">Contact Person *</label>
              <input
                className="form-input"
                value={contactPersonName}
                onChange={(e) => setContactPersonName(e.target.value)}
                placeholder="Dr. / Mr. / Ms. Name"
                required
              />
            </div>
            <div>
              <label className="form-label">Contact Phone *</label>
              <input
                className="form-input"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+91 98XXXXXXXX"
                required
              />
            </div>
          </div>
          <div>
            <label className="form-label">Operating Hours</label>
            <input
              className="form-input"
              value={operatingHours}
              onChange={(e) => setOperatingHours(e.target.value)}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', fontWeight: 600 }}>
            <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
            Active &amp; Available for Sample Handover
          </label>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancel Edit
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update Centre' : '+ Save Collection Centre'}
            </button>
          </div>
        </form>
      </div>

      <div className="chart-card-modern">
        <div className="card-top-header">
          <h2 className="card-top-title">Collection Centres &amp; Drop Locations ({centres.length})</h2>
          <button type="button" className="btn-secondary" onClick={() => void loadCentres()} disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
        {centres.length === 0 ? (
          <EmptyStateBox
            title="No Collection Centres Configured"
            description="Add at least one Collection Centre with a Contact Person so Small Labs and Phlebotomists know where to hand over samples."
          />
        ) : (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>Centre &amp; Address</th>
                  <th>Contact Person</th>
                  <th>Operating Hours</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {centres.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                        {c.address}, {c.city} - {c.pincode}
                      </div>
                    </td>
                    <td>
                      <strong>{c.contactPersonName}</strong>
                      <div style={{ fontSize: '0.74rem', color: '#475569' }}>{c.contactPhone}</div>
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>{c.operatingHours}</td>
                    <td>
                      <span className={c.isAvailable ? 'status-pill-green' : 'status-pill-red'}>
                        {c.isAvailable ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" className="btn-secondary" onClick={() => startEdit(c)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => void toggleAvailability(c)}
                        >
                          {c.isAvailable ? 'Pause' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
