import { useState, useEffect } from 'react';
import {
  type InventoryItemMaster,
  type SupplierBarcodeMapping,
  type SupplierRecord,
} from '@diagnostic/shared';
import {
  createInventorySupplierApi,
  createSupplierBarcodeMappingApi,
  fetchInventoryItems,
  fetchInventorySuppliers,
  fetchSupplierBarcodeMappings,
} from '../../../services/inventoryApiService';

interface AdminInventorySuppliersTabProps {
  onShowAlert: (params: {
    variant: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    title: string;
    message: string;
  }) => void;
}

export function AdminInventorySuppliersTab({ onShowAlert }: AdminInventorySuppliersTabProps) {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [mappings, setMappings] = useState<SupplierBarcodeMapping[]>([]);
  const [items, setItems] = useState<InventoryItemMaster[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Add Supplier Modal
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [supName, setSupName] = useState('');
  const [supGstin, setSupGstin] = useState('');
  const [supPerson, setSupPerson] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supCity, setSupCity] = useState('');
  const [supState, setSupState] = useState('');
  const [isSubmittingSupplier, setIsSubmittingSupplier] = useState(false);

  // Add Mapping Modal
  const [showAddMappingModal, setShowAddMappingModal] = useState(false);
  const [mapBarcode, setMapBarcode] = useState('');
  const [mapItemId, setMapItemId] = useState('');
  const [mapSupplierId, setMapSupplierId] = useState('');
  const [mapPackageUnit, setMapPackageUnit] = useState('BOX_OF_100');
  const [mapUnitsPerPackage, setMapUnitsPerPackage] = useState(100);
  const [mapNotes, setMapNotes] = useState('');
  const [isSubmittingMapping, setIsSubmittingMapping] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [supList, mapList, itList] = await Promise.all([
        fetchInventorySuppliers(),
        fetchSupplierBarcodeMappings(),
        fetchInventoryItems(),
      ]);
      setSuppliers(supList);
      setMappings(mapList);
      setItems(itList);
      if (itList.length > 0 && !mapItemId) {
        setMapItemId(itList[0].id);
      }
      if (supList.length > 0 && !mapSupplierId) {
        setMapSupplierId(supList[0].id);
      }
    } catch (err: any) {
      console.warn('Failed loading suppliers data:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Handle Add Supplier
  async function handleCreateSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!supName.trim()) {
      onShowAlert({ variant: 'warning', title: 'Name Required', message: 'Supplier name cannot be empty.' });
      return;
    }
    setIsSubmittingSupplier(true);
    try {
      await createInventorySupplierApi({
        name: supName.trim(),
        gstin: supGstin.trim() || undefined,
        contactPerson: supPerson.trim() || undefined,
        contactPhone: supPhone.trim(),
        contactEmail: supEmail.trim(),
        address: 'Direct Factory Warehouse',
        city: supCity.trim() || 'Mumbai',
        state: supState.trim() || 'Maharashtra',
        pincode: '400001',
        leadTimeDays: 3,
        paymentTermsDays: 30,
        isActive: true,
      });

      onShowAlert({
        variant: 'success',
        title: 'Supplier Added!',
        message: `Registered ${supName} in diagnostic suppliers directory.`,
      });
      setShowAddSupplierModal(false);
      setSupName('');
      setSupGstin('');
      setSupPhone('');
      setSupEmail('');
      loadData();
    } catch (err: any) {
      onShowAlert({
        variant: 'error',
        title: 'Failed to Add Supplier',
        message: err.message || 'Error creating supplier record.',
      });
    } finally {
      setIsSubmittingSupplier(false);
    }
  }

  // Handle Add Mapping
  async function handleCreateMapping(e: React.FormEvent) {
    e.preventDefault();
    if (!mapBarcode.trim()) {
      onShowAlert({ variant: 'warning', title: 'Barcode Required', message: 'Enter or scan supplier barcode.' });
      return;
    }
    const selectedItem = items.find((i) => i.id === mapItemId);
    const selectedSup = suppliers.find((s) => s.id === mapSupplierId);
    if (!selectedItem || !selectedSup) {
      onShowAlert({ variant: 'warning', title: 'Incomplete Form', message: 'Select item and supplier.' });
      return;
    }

    setIsSubmittingMapping(true);
    try {
      await createSupplierBarcodeMappingApi({
        supplierBarcode: mapBarcode.trim(),
        itemId: selectedItem.id,
        itemSku: selectedItem.sku,
        supplierId: selectedSup.id,
        supplierName: selectedSup.name,
        packageUnit: mapPackageUnit,
        unitsPerPackage: Number(mapUnitsPerPackage) || 1,
        verified: true,
        notes: mapNotes.trim() || undefined,
      });

      onShowAlert({
        variant: 'success',
        title: 'Barcode Mapped Successfully!',
        message: `Linked barcode "${mapBarcode}" to ${selectedItem.name} (${mapPackageUnit} = ${mapUnitsPerPackage} units).`,
      });
      setShowAddMappingModal(false);
      setMapBarcode('');
      setMapNotes('');
      loadData();
    } catch (err: any) {
      onShowAlert({
        variant: 'error',
        title: 'Mapping Failed',
        message: err.message || 'Error saving barcode mapping.',
      });
    } finally {
      setIsSubmittingMapping(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header Card */}
      <div
        style={{
          background: '#FFFFFF',
          padding: '24px',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.75rem' }}>🏭</span>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0F172A' }}>
                Suppliers &amp; Packaging Barcode Mappings
              </h2>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', color: '#64748B' }}>
              Map manufacturer carton &amp; box barcodes to internal specimen item SKUs and conversion multipliers.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setShowAddSupplierModal(true)}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#0F172A',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
              }}
            >
              + Add Supplier
            </button>
            <button
              type="button"
              onClick={() => setShowAddMappingModal(true)}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: 'none',
                background: '#0D9488',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
              }}
            >
              + Map Supplier Barcode
            </button>
          </div>
        </div>
      </div>

      {/* Supplier Barcode Mappings Grid */}
      <div
        style={{
          background: '#FFFFFF',
          padding: '24px',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
            Configured Supplier Barcode Rules ({mappings.length})
          </h3>
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              background: '#F8FAFC',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            {isLoading ? '...' : '🔄 Refresh'}
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Scanned Barcode / SKU</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Supplier</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Mapped Item SKU</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Packaging Unit</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Multiplier</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
                      {m.supplierBarcode}
                    </div>
                    {m.notes && <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{m.notes}</div>}
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: '#334155' }}>
                    {m.supplierName}
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0D9488' }}>
                    {m.itemSku}
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{m.packageUnit}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 800, color: '#0F172A' }}>
                    ×{m.unitsPerPackage} Units
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: '#DEF7EC',
                        color: '#03543F',
                      }}
                    >
                      ✓ Verified
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Registered Suppliers Table */}
      <div
        style={{
          background: '#FFFFFF',
          padding: '24px',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
          Registered Suppliers &amp; Manufacturers ({suppliers.length})
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Company Name</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>GSTIN</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Contact Person</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Phone / Email</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Location</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Lead Time</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 800, color: '#0F172A' }}>{s.name}</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {s.gstin || '—'}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#334155' }}>{s.contactPerson || '—'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div>{s.contactPhone}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{s.contactEmail}</div>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#475569' }}>
                    {s.city}, {s.state}
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{s.leadTimeDays} Days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Supplier Modal */}
      {showAddSupplierModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 800 }}>+ Register Diagnostic Supplier</h3>
            <form onSubmit={handleCreateSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                  Supplier / Company Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Becton Dickinson India"
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                  Contact Person (Representative)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ajay Sharma (Key Account Manager)"
                  value={supPerson}
                  onChange={(e) => setSupPerson(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                  GSTIN Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 07AAACB0123M1Z5"
                  value={supGstin}
                  onChange={(e) => setSupGstin(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                    Contact Phone *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+91 98..."
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                    Contact Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="sales@..."
                    value={supEmail}
                    onChange={(e) => setSupEmail(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                    City
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mumbai"
                    value={supCity}
                    onChange={(e) => setSupCity(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                    State
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Maharashtra"
                    value={supState}
                    onChange={(e) => setSupState(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddSupplierModal(false)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSupplier}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0D9488',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isSubmittingSupplier ? 'Saving...' : 'Register Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Barcode Mapping Modal */}
      {showAddMappingModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 800 }}>+ Map Supplier Barcode Rule</h3>
            <form onSubmit={handleCreateMapping} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                  Supplier / Manufacturer Barcode *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Scan or enter barcode (e.g. BD-EDTA-3ML-BOX100, 890123...)"
                  value={mapBarcode}
                  onChange={(e) => setMapBarcode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                  Select Master Item *
                </label>
                <select
                  value={mapItemId}
                  onChange={(e) => setMapItemId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                >
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.iconEmoji} {it.name} [{it.sku}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                  Supplier *
                </label>
                <select
                  value={mapSupplierId}
                  onChange={(e) => setMapSupplierId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                    Packaging Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BOX_OF_100"
                    value={mapPackageUnit}
                    onChange={(e) => setMapPackageUnit(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                    Base Units Multiplier *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={mapUnitsPerPackage}
                    onChange={(e) => setMapUnitsPerPackage(Math.max(1, Number(e.target.value)))}
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: 700 }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddMappingModal(false)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingMapping}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0D9488',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isSubmittingMapping ? 'Saving...' : 'Save Mapping'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
