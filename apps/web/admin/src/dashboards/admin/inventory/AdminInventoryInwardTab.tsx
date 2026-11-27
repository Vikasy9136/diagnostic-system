import { useState, useEffect } from 'react';
import {
  formatInr,
  type InventoryItemMaster,
  type StockInwardRecord,
  type SupplierRecord,
} from '@diagnostic/shared';
import {
  fetchInventoryItems,
  fetchInventorySuppliers,
  fetchStockInwardHistory,
  resolveSupplierBarcodeApi,
  submitStockInwardApi,
  type BarcodeResolutionResult,
} from '../../../services/inventoryApiService';
import { AdminInventoryScannerBridgeModal } from './AdminInventoryScannerBridgeModal';
import { usePersistentScannerBridge } from '../../../hooks/usePersistentScannerBridge';

interface AdminInventoryInwardTabProps {
  onShowAlert: (params: {
    variant: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    title: string;
    message: string;
    detail?: string;
  }) => void;
}

export function AdminInventoryInwardTab({ onShowAlert }: AdminInventoryInwardTabProps) {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [items, setItems] = useState<InventoryItemMaster[]>([]);
  const [inwardHistory, setInwardHistory] = useState<StockInwardRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [poNumber, setPoNumber] = useState(`PO-${Date.now().toString().slice(-6)}`);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Barcode & Item Input State
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isResolvingBarcode, setIsResolvingBarcode] = useState(false);
  const [resolutionResult, setResolutionResult] = useState<BarcodeResolutionResult | null>(null);

  const [selectedItemId, setSelectedItemId] = useState('');
  const scannerBridge = usePersistentScannerBridge({
    contextTitle: 'STOCK_INWARD',
    defaultMode: 'ONE_SCAN',
    onScanConfirmed: (ev) => {
      setBarcodeInput(ev.barcode);
      handleResolveBarcode(ev.barcode);
    },
  });
  const [packageUnit, setPackageUnit] = useState('BOX');
  const [packageQuantity, setPackageQuantity] = useState(5);
  const [unitsPerPackage, setUnitsPerPackage] = useState(100);
  const [batchNumber, setBatchNumber] = useState(`BATCH-${new Date().getFullYear()}-01`);
  const [expiryDate, setExpiryDate] = useState('2028-12-31');
  const [unitCostInr, setUnitCostInr] = useState(950);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [supList, itList, hist] = await Promise.all([
        fetchInventorySuppliers(),
        fetchInventoryItems(),
        fetchStockInwardHistory(),
      ]);
      setSuppliers(supList);
      setItems(itList);
      setInwardHistory(hist);
      if (supList.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(supList[0].id);
      }
      if (itList.length > 0 && !selectedItemId) {
        setSelectedItemId(itList[0].id);
        setUnitsPerPackage(itList[0].unitsPerPackage || 100);
      }
    } catch (err: any) {
      console.warn('Failed loading inventory inward prerequisites:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Handle Barcode Scanner / Manual Lookup
  async function handleResolveBarcode(overrideCode?: string) {
    const code = (overrideCode || barcodeInput).trim();
    if (!code) {
      onShowAlert({
        variant: 'warning',
        title: 'Empty Barcode',
        message: 'Please scan or type a supplier barcode or manufacturer SKU.',
      });
      return;
    }

    setIsResolvingBarcode(true);
    try {
      const res = await resolveSupplierBarcodeApi(code);
      setResolutionResult(res);

      if (res.found && res.item) {
        setSelectedItemId(res.item.id);
        setPackageUnit(res.packageUnit || res.item.purchasePackageUnit || 'BOX');
        setUnitsPerPackage(res.multiplierToBaseUnit || res.item.unitsPerPackage || 100);
        if (res.mapping?.supplierId) {
          setSelectedSupplierId(res.mapping.supplierId);
        }
        onShowAlert({
          variant: 'success',
          title: 'Barcode Matched!',
          message: `Identified ${res.item.name} (${res.packageUnit || 'Pack'} × ${res.multiplierToBaseUnit} units).`,
        });
      } else {
        onShowAlert({
          variant: 'info',
          title: 'Unmapped Barcode',
          message: `Barcode "${code}" is not yet mapped to a supplier packaging SKU. You can select the item manually below and map it.`,
        });
      }
    } catch (err: any) {
      onShowAlert({
        variant: 'error',
        title: 'Barcode Resolution Failed',
        message: err.message || 'Failed connecting to barcode resolver service.',
      });
    } finally {
      setIsResolvingBarcode(false);
    }
  }

  // Selected Item Master Reference
  const currentItem = items.find((i) => i.id === selectedItemId);
  const totalBaseUnits = packageQuantity * unitsPerPackage;
  const totalInwardValue = packageQuantity * unitCostInr;

  // Submit Inward Consignment
  async function handleSubmitInward(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItemId) {
      onShowAlert({ variant: 'warning', title: 'Select Item', message: 'Please select an item to inward.' });
      return;
    }
    if (!selectedSupplierId) {
      onShowAlert({ variant: 'warning', title: 'Select Supplier', message: 'Please select a supplier.' });
      return;
    }
    if (!batchNumber.trim()) {
      onShowAlert({ variant: 'warning', title: 'Batch Number Required', message: 'Please enter the manufacturer batch number.' });
      return;
    }
    if (!expiryDate) {
      onShowAlert({ variant: 'warning', title: 'Expiry Date Required', message: 'Please select the expiry date.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        supplierId: selectedSupplierId,
        poNumber: poNumber.trim() || undefined,
        invoiceNumber: invoiceNumber.trim() || undefined,
        warehouseId: 'WH-CENTRAL-MAIN',
        items: [
          {
            itemId: selectedItemId,
            scannedSupplierBarcode: barcodeInput.trim() || undefined,
            packageUnit,
            packageQuantity,
            unitsPerPackage,
            batchNumber: batchNumber.trim(),
            expiryDate,
            unitCostInr,
          },
        ],
        notes: notes.trim() || undefined,
      };

      await submitStockInwardApi(payload);

      onShowAlert({
        variant: 'success',
        title: 'Stock Inward Successful!',
        message: `Inwarded ${packageQuantity} ${packageUnit}s (${totalBaseUnits} ${currentItem?.baseUnit || 'units'}). Batch ${batchNumber} and stock ledger transaction generated successfully.`,
      });

      // Reset form and reload
      setBarcodeInput('');
      setNotes('');
      setResolutionResult(null);
      setInvoiceNumber('');
      setPoNumber(`PO-${Date.now().toString().slice(-6)}`);
      loadData();
    } catch (err: any) {
      onShowAlert({
        variant: 'error',
        title: 'Stock Inward Failed',
        message: err.message || 'Failed to submit stock inward consignment.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          color: '#FFFFFF',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.75rem' }}>📥</span>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>
                Supplier Barcode-Driven Stock Inward &amp; Conversion
              </h2>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: '#94A3B8' }}>
              Scan carton/box barcodes $\rightarrow$ auto-resolve item SKU, apply package multiplier, create FEFO batches &amp; write to immutable double-entry ledger.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: '#1E293B',
              color: '#F8FAFC',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            {isLoading ? 'Refreshing...' : '🔄 Refresh Inward Ledger'}
          </button>
        </div>
      </div>

      {/* Main Inward Form Card */}
      <div
        style={{
          background: '#FFFFFF',
          padding: '24px',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <form onSubmit={handleSubmitInward} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Section 1: Barcode Scan & Quick Detection */}
          <div
            style={{
              background: '#F8FAFC',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid #CBD5E1',
            }}
          >
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
              ⚡ Step 1: Scan Supplier / Manufacturer Barcode or Enter SKU
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px', position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Scan with USB barcode gun or type (e.g. BD-EDTA-3ML-BOX100, 8901234001001)..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleResolveBarcode();
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '2px solid #0D9488',
                    fontSize: '0.95rem',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => handleResolveBarcode()}
                disabled={isResolvingBarcode || !barcodeInput.trim()}
                style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  background: '#0D9488',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {isResolvingBarcode ? 'Resolving...' : '🔍 Scan / Resolve'}
              </button>
              <button
                type="button"
                onClick={() => void scannerBridge.openScanner()}
                style={{
                  padding: '12px 18px',
                  borderRadius: '8px',
                  background: scannerBridge.deviceStatus === 'CONNECTED' ? '#065F46' : '#6366F1',
                  color: '#FFFFFF',
                  border: scannerBridge.deviceStatus === 'CONNECTED' ? '1.5px solid #10B981' : 'none',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
                title="Connect mobile camera or Google Lens to scan barcodes wirelessly"
              >
                {scannerBridge.deviceStatus === 'CONNECTED'
                  ? `🟢 Mobile Connected (${scannerBridge.deviceName || 'Scanner'})`
                  : '📷 Scan with Mobile Camera / Google Lens'}
              </button>
            </div>

            {/* Quick Demo Pre-fill Pills */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>Quick Test Barcodes:</span>
              <button
                type="button"
                onClick={() => {
                  setBarcodeInput('BD-EDTA-3ML-BOX100');
                  handleResolveBarcode('BD-EDTA-3ML-BOX100');
                }}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                }}
              >
                BD EDTA Box (100)
              </button>
              <button
                type="button"
                onClick={() => {
                  setBarcodeInput('BD-SST-4ML-BOX100');
                  handleResolveBarcode('BD-SST-4ML-BOX100');
                }}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                }}
              >
                BD SST Gold Box (100)
              </button>
              <button
                type="button"
                onClick={() => {
                  setBarcodeInput('DISPO-NDL-21G-BOX100');
                  handleResolveBarcode('DISPO-NDL-21G-BOX100');
                }}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                }}
              >
                Dispovan 21G Needle Box
              </button>
              <button
                type="button"
                onClick={() => {
                  setBarcodeInput('MEDIPACK-ALC-SWAB-200');
                  handleResolveBarcode('MEDIPACK-ALC-SWAB-200');
                }}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                }}
              >
                MediPack Alcohol Swabs (200)
              </button>
            </div>

            {/* Resolution Status Banner */}
            {resolutionResult && resolutionResult.found && resolutionResult.item && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  background: '#ECFDF5',
                  border: '1px solid #6EE7B7',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>✅</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#065F46' }}>
                    Matched: {resolutionResult.item.name}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#047857' }}>
                    Manufacturer: {resolutionResult.item.manufacturer} • Package: {resolutionResult.packageUnit} (Multiplier: ×{resolutionResult.multiplierToBaseUnit} {resolutionResult.baseUnit}s)
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Consignment & Supplier Details */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Supplier / Manufacturer *
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.9rem',
                }}
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.city})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                PO Reference Number
              </label>
              <input
                type="text"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Supplier Invoice Number
              </label>
              <input
                type="text"
                placeholder="e.g. INV-BD-2026-908"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.9rem',
                }}
              />
            </div>
          </div>

          {/* Section 3: Item & Quantity Conversion Calculator */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Target Inventory Item *
              </label>
              <select
                value={selectedItemId}
                onChange={(e) => {
                  setSelectedItemId(e.target.value);
                  const found = items.find((it) => it.id === e.target.value);
                  if (found) {
                    setPackageUnit(found.purchasePackageUnit || 'BOX');
                    setUnitsPerPackage(found.unitsPerPackage || 100);
                  }
                }}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.9rem',
                }}
              >
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.iconEmoji} {it.name} [{it.sku}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Packaging Unit &amp; Conversion Multiplier
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={packageUnit}
                  onChange={(e) => setPackageUnit(e.target.value)}
                  style={{
                    flex: '1',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.9rem',
                  }}
                >
                  <option value="BOX">BOX</option>
                  <option value="PACK">PACK</option>
                  <option value="CARTON">CARTON</option>
                  <option value="CASE">CASE</option>
                  <option value="ROLL">ROLL</option>
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '0.85rem', color: '#64748B' }}>×</span>
                  <input
                    type="number"
                    min={1}
                    value={unitsPerPackage}
                    onChange={(e) => setUnitsPerPackage(Math.max(1, Number(e.target.value)))}
                    title="Units per Package"
                    style={{
                      width: '80px',
                      padding: '10px 8px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      textAlign: 'center',
                      fontWeight: 700,
                    }}
                  />
                  <span style={{ fontSize: '0.85rem', color: '#64748B' }}>{currentItem?.baseUnit || 'units'}/pkg</span>
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Package Quantity Received *
              </label>
              <input
                type="number"
                min={1}
                value={packageQuantity}
                onChange={(e) => setPackageQuantity(Math.max(1, Number(e.target.value)))}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                }}
              />
            </div>
          </div>

          {/* Section 4: Batch, Expiry & Cost */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Manufacturer Batch / Lot Number *
              </label>
              <input
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                required
                placeholder="e.g. BD26K01"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Batch Expiry Date (FEFO Tracking) *
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Cost Per {packageUnit} (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min={0.01}
                value={unitCostInr}
                onChange={(e) => setUnitCostInr(Number(e.target.value))}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                }}
              />
            </div>
          </div>

          {/* Quantity Conversion & Cost Preview Card */}
          <div
            style={{
              background: '#F0FDFA',
              border: '2px dashed #0D9488',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F766E', textTransform: 'uppercase' }}>
                Stock Inward Ledger Impact Preview
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#134E4A', marginTop: '4px' }}>
                {packageQuantity} {packageUnit}s × {unitsPerPackage} ={' '}
                <span style={{ color: '#0D9488' }}>
                  {totalBaseUnits} {currentItem?.baseUnit || 'units'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#0F766E', marginTop: '2px' }}>
                Warehouse: Central Diagnostic Hub (WH-CENTRAL-MAIN) • Unit Cost:{' '}
                {formatInr(unitsPerPackage > 0 ? unitCostInr / unitsPerPackage : unitCostInr)} / {currentItem?.baseUnit}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.82rem', color: '#64748B' }}>Total Inward Amount</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0F172A' }}>
                {formatInr(totalInwardValue)}
              </div>
            </div>
          </div>

          {/* Notes Input */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
              Consignment Remarks / QC Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Received intact, carton seal verified, stored in Rack 1 Shelf A"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '0.9rem',
              }}
            />
          </div>

          {/* Submit Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '14px 28px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 800,
                fontSize: '1rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)',
              }}
            >
              {isSubmitting ? 'Recording Inward...' : `Confirm & Inward ${totalBaseUnits} Loose ${currentItem?.baseUnit || 'Units'}`}
            </button>
          </div>
        </form>
      </div>

      {/* Recent Inward Consignments Table */}
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
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
              Recent Stock Inward Consignments ({inwardHistory.length})
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
              Audit history of verified supplier shipments received and credited to warehouse balances.
            </p>
          </div>
        </div>

        {inwardHistory.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>
            No stock inwards recorded yet. Use the form above to record your first supplier shipment.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Inward No / Date</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Supplier</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>PO / Invoice</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Items Received</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Total Units</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Value</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {inwardHistory.map((hist) => (
                  <tr key={hist.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>{hist.inwardNumber}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        {new Date(hist.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#334155' }}>
                      {hist.supplierName}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: '0.82rem', color: '#0F172A' }}>{hist.poNumber || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{hist.invoiceNumber || 'No Inv'}</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {hist.items.map((it, idx) => (
                        <div key={idx} style={{ fontSize: '0.82rem' }}>
                          • {it.itemName} ({it.packageQuantity} {it.packageUnit}s, Batch: {it.batchNumber})
                        </div>
                      ))}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0D9488' }}>
                      {hist.totalBaseUnits} Units
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F172A' }}>
                      {formatInr(hist.totalAmountInr)}
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
                        ✓ {hist.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AdminInventoryScannerBridgeModal
        isOpen={scannerBridge.isModalOpen}
        onClose={scannerBridge.closePopupOnly}
        onDisconnect={() => void scannerBridge.disconnectSession()}
        session={scannerBridge.session}
        activeMode={scannerBridge.activeMode}
        onSwitchMode={(m) => void scannerBridge.switchMode(m)}
        deviceStatus={scannerBridge.deviceStatus}
        uiPhase={scannerBridge.uiPhase}
        deviceName={scannerBridge.deviceName}
        scannedEvents={scannerBridge.sessionEvents}
        latestConfirmedBanner={scannerBridge.latestConfirmedEvent}
        context="STOCK_INWARD"
      />
    </div>
  );
}
