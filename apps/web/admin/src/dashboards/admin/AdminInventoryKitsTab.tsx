import { useState, useMemo, useEffect } from 'react';
import {
  formatInr,
  type InventoryKitItem,
  type InventoryMaterialItem,
  type KitAllocationRecord,
  type PhlebotomistProfile,
  type VendorPurchaseRecord,
} from '@diagnostic/shared';
import {
  assembleInventoryKits,
  allocateKitsToPhlebotomist,
  allocateSuppliesPackToPhlebotomist,
  recordVendorPurchaseOrder,
} from '../../services/firestoreService';
import {
  fetchInventorySettingsApi,
  updateInventorySettingsApi,
} from '../../services/inventoryApiService';
import { AdminInventoryInwardTab } from './inventory/AdminInventoryInwardTab';
import { AdminInventoryBatchesTab } from './inventory/AdminInventoryBatchesTab';
import { AdminInventorySuppliersTab } from './inventory/AdminInventorySuppliersTab';
import { AdminInventoryKitsMasterTab } from './inventory/AdminInventoryKitsMasterTab';
import { AdminInventoryBarcodeTab } from './inventory/AdminInventoryBarcodeTab';
import { AdminInventoryDashboardTab } from './inventory/AdminInventoryDashboardTab';
import { AdminInventoryStockLedgerTab } from './inventory/AdminInventoryStockLedgerTab';
import { AdminInventoryAdjustmentsTab } from './inventory/AdminInventoryAdjustmentsTab';
import { AdminInventoryScannerBridgeModal } from './inventory/AdminInventoryScannerBridgeModal';

interface AdminInventoryKitsTabProps {
  materials: InventoryMaterialItem[];
  kits: InventoryKitItem[];
  allocations: KitAllocationRecord[];
  purchases: VendorPurchaseRecord[];
  phlebotomists: PhlebotomistProfile[];
  adminEmail: string;
  onShowAlert: (params: {
    variant: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    title: string;
    message: string;
    detail?: string;
    onConfirm?: () => void;
  }) => void;
}

type InventorySubTab =
  | 'overview'
  | 'kits'
  | 'materials'
  | 'inward'
  | 'batches'
  | 'suppliers'
  | 'ledger'
  | 'adjustments'
  | 'allocations'
  | 'barcode-printing';

export function AdminInventoryKitsTab({
  materials,
  kits,
  allocations,
  purchases,
  phlebotomists,
  adminEmail,
  onShowAlert,
}: AdminInventoryKitsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<InventorySubTab>('overview');
  const [showScannerBridgeModal, setShowScannerBridgeModal] = useState(false);
  const [kitsViewMode, setKitsViewMode] = useState<'BOM_ASSEMBLY' | 'READY_STOCK'>('BOM_ASSEMBLY');

  // Enterprise Feature Activation State
  const [isFeatureActive, setIsFeatureActive] = useState<boolean>(false);
  const [isTogglingFeature, setIsTogglingFeature] = useState<boolean>(false);

  useEffect(() => {
    fetchInventorySettingsApi()
      .then((settings) => setIsFeatureActive(Boolean(settings?.enterpriseKitInventoryActive)))
      .catch(() => {});
  }, []);

  async function handleToggleFeatureActivation() {
    setIsTogglingFeature(true);
    const targetState = !isFeatureActive;
    try {
      await updateInventorySettingsApi({
        enterpriseKitInventoryActive: targetState,
        enforceKitScanOnCollection: targetState,
        activatedByEmail: adminEmail,
      });
      setIsFeatureActive(targetState);
      onShowAlert({
        variant: targetState ? 'success' : 'info',
        title: targetState ? 'Enterprise Kit System Activated' : 'Switched to Preview Mode',
        message: targetState
          ? 'Central warehouse assembly, sealed kit issuance, and barcode scanning are now active across the platform.'
          : 'Enterprise Kit Inventory is now in preview mode. Phlebotomists operate in standard direct collection.',
      });
    } catch (err: any) {
      onShowAlert({
        variant: 'error',
        title: 'Activation Update Failed',
        message: err.message || 'Could not update inventory activation status.',
      });
    } finally {
      setIsTogglingFeature(false);
    }
  }

  // Assembly Modal State
  const [assemblingKit, setAssemblingKit] = useState<InventoryKitItem | null>(null);
  const [assembleQuantity, setAssembleQuantity] = useState<number>(10);
  const [isSubmittingAssembly, setIsSubmittingAssembly] = useState(false);

  // Dispatch Modal State
  const [dispatchingKit, setDispatchingKit] = useState<InventoryKitItem | null>(null);
  const [selectedPhleboId, setSelectedPhleboId] = useState<string>('');
  const [dispatchQuantity, setDispatchQuantity] = useState<number>(10);
  const [dispatchNotes, setDispatchNotes] = useState<string>('');
  const [isSubmittingDispatch, setIsSubmittingDispatch] = useState(false);

  // Custom Supply Pack Handover to Phlebotomist Modal State
  const [showPackHandoverModal, setShowPackHandoverModal] = useState(false);
  const [packPhleboId, setPackPhleboId] = useState('');
  const [packName, setPackName] = useState('Standard Phlebotomy Routine Pack (50 Collections)');
  const [packBatchCode, setPackBatchCode] = useState(`PACK-PHL-${Date.now().toString().slice(-6)}`);
  const [packNotes, setPackNotes] = useState('Field collection kit handover with tubes, needles, packs & gloves');
  const [packItemsQuantities, setPackItemsQuantities] = useState<Record<string, number>>({});
  const [isSubmittingPack, setIsSubmittingPack] = useState(false);

  // View mode for raw materials (Cards layout vs Table layout)
  const [materialViewMode, setMaterialViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');

  // Inward PO / Material Restock Modal State
  const [showInwardModal, setShowInwardModal] = useState(false);
  const [poVendorName, setPoVendorName] = useState('BD Life Sciences India');
  const [poNumber, setPoNumber] = useState(`PO-${Date.now().toString().slice(-6)}`);
  const [poInvoiceNumber, setPoInvoiceNumber] = useState('');
  const [poMaterialId, setPoMaterialId] = useState('');
  const [poQuantity, setPoQuantity] = useState<number>(100);
  const [poUnitPrice, setPoUnitPrice] = useState<number>(9.5);
  const [poBatchNumber, setPoBatchNumber] = useState(`BATCH-${new Date().getFullYear()}-01`);
  const [poExpiryDate, setPoExpiryDate] = useState('2028-12-31');
  const [isSubmittingPO, setIsSubmittingPO] = useState(false);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [materialStockFilter, setMaterialStockFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [kitStockFilter, setKitStockFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');

  // Filtered Kits by In-Stock availability
  const filteredKits = useMemo(() => {
    return kits.filter((kit) => {
      if (kitStockFilter === 'IN_STOCK' && (kit.currentAssembledStock || 0) <= 0) return false;
      if (kitStockFilter === 'LOW_STOCK' && (kit.currentAssembledStock || 0) > kit.reorderThreshold) return false;
      if (kitStockFilter === 'OUT_OF_STOCK' && (kit.currentAssembledStock || 0) > 0) return false;
      return true;
    });
  }, [kits, kitStockFilter]);

  // Filtered Materials by In-Stock availability and search
  const filteredMaterials = useMemo(() => {
    return materials.filter((mat) => {
      if (materialStockFilter === 'IN_STOCK' && (mat.currentStock || 0) <= 0) return false;
      if (materialStockFilter === 'LOW_STOCK' && (mat.currentStock || 0) > mat.reorderThreshold) return false;
      if (materialStockFilter === 'OUT_OF_STOCK' && (mat.currentStock || 0) > 0) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        mat.name.toLowerCase().includes(q) ||
        mat.vendorName.toLowerCase().includes(q) ||
        mat.batchNumber.toLowerCase().includes(q)
      );
    });
  }, [materials, materialStockFilter, searchQuery]);

  // Currently selected inward material item
  const currentInwardMat = useMemo(() => {
    return materials.find((m) => m.id === poMaterialId) || materials[0] || null;
  }, [materials, poMaterialId]);

  // Metrics
  const totalAssembledKits = useMemo(() => {
    return kits.reduce((acc, k) => acc + (k.currentAssembledStock || 0), 0);
  }, [kits]);

  const totalRawVacutainers = useMemo(() => {
    return materials
      .filter((m) => m.category === 'VACUTAINER')
      .reduce((acc, m) => acc + (m.currentStock || 0), 0);
  }, [materials]);

  const totalActiveFieldKits = useMemo(() => {
    return allocations
      .filter((a) => a.status === 'DISPATCHED' || a.status === 'RECEIVED')
      .reduce((acc, a) => acc + (a.quantityOnHand || 0), 0);
  }, [allocations]);

  const lowStockMaterialsCount = useMemo(() => {
    return materials.filter((m) => m.currentStock <= m.reorderThreshold).length;
  }, [materials]);

  // Handle Kit Assembly Action
  async function handleConfirmAssembly() {
    if (!assemblingKit) return;
    setIsSubmittingAssembly(true);
    try {
      await assembleInventoryKits({
        kit: assemblingKit,
        quantityToAssemble: assembleQuantity,
        availableMaterials: materials,
        actorEmail: adminEmail,
      });
      onShowAlert({
        variant: 'success',
        title: 'Kits Assembled Successfully',
        message: `Assembled ${assembleQuantity}x ${assemblingKit.kitName}. Raw component stock deducted from inventory.`,
      });
      setAssemblingKit(null);
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Assembly Failed',
        message: err instanceof Error ? err.message : 'Failed to assemble kits.',
      });
    } finally {
      setIsSubmittingAssembly(false);
    }
  }

  // Handle Kit Dispatch Action
  async function handleConfirmDispatch() {
    if (!dispatchingKit || !selectedPhleboId) {
      onShowAlert({
        variant: 'warning',
        title: 'Select Phlebotomist',
        message: 'Please choose an active field phlebotomist to receive this kit batch.',
      });
      return;
    }
    const phlebo = phlebotomists.find((p) => p.id === selectedPhleboId);
    if (!phlebo) return;

    setIsSubmittingDispatch(true);
    try {
      await allocateKitsToPhlebotomist({
        phlebo,
        kit: dispatchingKit,
        quantity: dispatchQuantity,
        actorEmail: adminEmail,
        notes: dispatchNotes,
      });
      onShowAlert({
        variant: 'success',
        title: 'Kits Dispatched to Phlebotomist',
        message: `Dispatched ${dispatchQuantity}x ${dispatchingKit.kitName} to ${phlebo.name}. Phlebo notified on app.`,
      });
      setDispatchingKit(null);
      setSelectedPhleboId('');
      setDispatchNotes('');
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Dispatch Failed',
        message: err instanceof Error ? err.message : 'Failed to dispatch kits.',
      });
    } finally {
      setIsSubmittingDispatch(false);
    }
  }

  // Direct 1-Click Inward on any specific material card
  function handleDirectInward(mat: InventoryMaterialItem) {
    setPoMaterialId(mat.id);
    setPoUnitPrice(mat.costPerUnitInr);
    setPoVendorName(mat.vendorName || 'BD Life Sciences India');
    setPoNumber(`PO-${Date.now().toString().slice(-6)}`);
    setPoQuantity(100);
    setShowInwardModal(true);
  }

  // Open Handover Pack Builder Modal
  function handleOpenPackHandoverModal(initialPreset?: 'ROUTINE_50' | 'CAMP_100') {
    if (phlebotomists.length > 0 && !packPhleboId) {
      setPackPhleboId(phlebotomists[0].id);
    }
    setPackBatchCode(`PACK-PHL-${Date.now().toString().slice(-6)}`);
    handleSelectPackPreset(initialPreset || 'ROUTINE_50');
    setShowPackHandoverModal(true);
  }

  // Configure Predefined Supply Pack Templates
  function handleSelectPackPreset(preset: 'ROUTINE_50' | 'CAMP_100' | 'EMPTY') {
    const qMap: Record<string, number> = {};
    if (preset === 'ROUTINE_50') {
      setPackName('Standard Phlebotomy Routine Pack (50 Collections)');
      for (const m of materials) {
        if (m.id === 'MAT-VAC-EDTA') qMap[m.id] = 20;
        else if (m.id === 'MAT-VAC-SST') qMap[m.id] = 15;
        else if (m.id === 'MAT-VAC-FLU') qMap[m.id] = 10;
        else if (m.id === 'MAT-VAC-CIT') qMap[m.id] = 5;
        else if (m.category === 'NEEDLE') qMap[m.id] = 30;
        else if (m.id === 'MAT-PKG-TRP' || m.id === 'MAT-PKG-BAG') qMap[m.id] = 30;
        else if (m.id === 'MAT-ACC-GLV') qMap[m.id] = 30;
        else if (m.id === 'MAT-ACC-COT' || m.id === 'MAT-ACC-SWB') qMap[m.id] = 50;
        else if (m.id === 'MAT-ACC-AID') qMap[m.id] = 30;
        else if (m.id === 'MAT-ACC-TRN') qMap[m.id] = 2;
        else if (m.id === 'MAT-LBL-50X25') qMap[m.id] = 1;
        else qMap[m.id] = 0;
      }
    } else if (preset === 'CAMP_100') {
      setPackName('High-Volume Health Camp Pack (100 Collections)');
      for (const m of materials) {
        if (m.id === 'MAT-VAC-EDTA') qMap[m.id] = 50;
        else if (m.id === 'MAT-VAC-SST') qMap[m.id] = 40;
        else if (m.id === 'MAT-VAC-FLU') qMap[m.id] = 25;
        else if (m.id === 'MAT-VAC-CIT') qMap[m.id] = 15;
        else if (m.category === 'NEEDLE') qMap[m.id] = 80;
        else if (m.id === 'MAT-PKG-TRP' || m.id === 'MAT-PKG-BAG') qMap[m.id] = 80;
        else if (m.id === 'MAT-ACC-GLV') qMap[m.id] = 60;
        else if (m.id === 'MAT-ACC-COT' || m.id === 'MAT-ACC-SWB') qMap[m.id] = 100;
        else if (m.id === 'MAT-ACC-AID') qMap[m.id] = 80;
        else if (m.id === 'MAT-ACC-TRN') qMap[m.id] = 4;
        else if (m.id === 'MAT-LBL-50X25') qMap[m.id] = 2;
        else qMap[m.id] = 0;
      }
    } else {
      setPackName('Custom Handover Supply Pack');
      for (const m of materials) qMap[m.id] = 0;
    }
    setPackItemsQuantities(qMap);
  }

  // Submit Multi-Item Supply Pack Handover to Phlebotomist
  async function handleConfirmCustomPackHandover() {
    const phlebo = phlebotomists.find((p) => p.id === packPhleboId);
    if (!phlebo) {
      onShowAlert({
        variant: 'warning',
        title: 'Phlebotomist Required',
        message: 'Please choose an active field phlebotomist for this supply handover.',
      });
      return;
    }

    const itemsManifest = materials
      .filter((m) => (packItemsQuantities[m.id] || 0) > 0)
      .map((m) => ({
        materialId: m.id,
        materialName: m.name,
        category: m.category,
        quantity: packItemsQuantities[m.id] || 0,
        unit: m.unit,
        iconEmoji: m.iconEmoji,
        tubeType: m.tubeType,
      }));

    if (itemsManifest.length === 0) {
      onShowAlert({
        variant: 'warning',
        title: 'Empty Pack',
        message: 'Please specify quantity for at least one supply item (tubes, needles, gloves, etc.).',
      });
      return;
    }

    // Validate available central stock
    for (const item of itemsManifest) {
      const mat = materials.find((m) => m.id === item.materialId);
      if (mat && mat.currentStock < item.quantity) {
        onShowAlert({
          variant: 'error',
          title: 'Insufficient Stock',
          message: `Cannot pack ${item.quantity} ${item.unit}s of ${item.materialName}. Available in stock: ${mat.currentStock} ${item.unit}s.`,
        });
        return;
      }
    }

    setIsSubmittingPack(true);
    try {
      await allocateSuppliesPackToPhlebotomist({
        phlebo,
        packName,
        packCode: packBatchCode,
        totalPacksCount: 1,
        itemsManifest,
        actorEmail: adminEmail,
        notes: packNotes,
      });

      const totalItemsCount = itemsManifest.reduce((acc, i) => acc + i.quantity, 0);
      onShowAlert({
        variant: 'success',
        title: 'Supplies Dispatched & Deducted',
        message: `Successfully handed over ${totalItemsCount} items (${itemsManifest.length} item types) to ${phlebo.name}. Central stock was automatically deducted and updated in courier app.`,
      });
      setShowPackHandoverModal(false);
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Dispatch Failed',
        message: err instanceof Error ? err.message : 'Failed to dispatch supplies pack.',
      });
    } finally {
      setIsSubmittingPack(false);
    }
  }

  // Handle Inward Purchase Order
  async function handleConfirmInwardPO() {
    const targetId = poMaterialId || (materials.length > 0 ? materials[0].id : '');
    const selectedMat = materials.find((m) => m.id === targetId);
    if (!selectedMat) {
      onShowAlert({
        variant: 'warning',
        title: 'Select Material',
        message: 'Please choose the raw material or vacutainer to inward.',
      });
      return;
    }

    setIsSubmittingPO(true);
    try {
      const totalAmount = poQuantity * poUnitPrice;
      await recordVendorPurchaseOrder({
        purchase: {
          poNumber,
          vendorName: poVendorName,
          invoiceNumber: poInvoiceNumber,
          items: [
            {
              materialId: selectedMat.id,
              materialName: selectedMat.name,
              category: selectedMat.category,
              quantity: poQuantity,
              unit: selectedMat.unit,
              unitPriceInr: poUnitPrice,
              totalInr: totalAmount,
              batchNumber: poBatchNumber,
              expiryDate: poExpiryDate,
            },
          ],
          totalAmountInr: totalAmount,
          status: 'RECEIVED',
        },
        autoReceiveStock: true,
        actorEmail: adminEmail,
      });

      onShowAlert({
        variant: 'success',
        title: 'Inward Stock Recorded',
        message: `Added ${poQuantity} ${selectedMat.unit}s of ${selectedMat.name} to central stock. Total Value: ${formatInr(totalAmount)}.`,
      });
      setShowInwardModal(false);
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Inward Failed',
        message: err instanceof Error ? err.message : 'Failed to record inward stock.',
      });
    } finally {
      setIsSubmittingPO(false);
    }
  }

  return (
    <div className="admin-inventory-page" style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.75rem' }}>🧪</span>
            <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              Central Vacutainers &amp; Kit Supply Chain
            </h1>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#64748B' }}>
            Manage bulk raw procurement, automated kit assembly, phlebotomist field dispatch, and thermal tube barcode printing.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const defaultMat = materials.find((m) => m.id === poMaterialId) || materials[0];
              if (defaultMat) {
                setPoMaterialId(defaultMat.id);
                setPoUnitPrice(defaultMat.costPerUnitInr);
                if (defaultMat.vendorName) setPoVendorName(defaultMat.vendorName);
              }
              setPoNumber(`PO-${Date.now().toString().slice(-6)}`);
              setShowInwardModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 600 }}
          >
            <span>📥</span> + Inward Stock / Vendor PO
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setActiveSubTab('barcode-printing')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 600, background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)' }}
          >
            <span>🏷️</span> Thermal Barcode Printing
          </button>
        </div>
      </div>

      {/* ENTERPRISE CENTRAL INVENTORY & KIT TRACKING ACTIVATION MASTER SWITCH */}
      <div
        style={{
          background: isFeatureActive ? '#F0FDF4' : '#FEF3C7',
          border: `1.5px solid ${isFeatureActive ? '#86EFAC' : '#FDE68A'}`,
          borderRadius: '16px',
          padding: '18px 24px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ flex: 1, minWidth: '280px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>{isFeatureActive ? '🟢' : '🏢'}</span>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: isFeatureActive ? '#166534' : '#92400E' }}>
                Enterprise Kit Inventory &amp; Central Warehouse System: {isFeatureActive ? 'ACTIVE & ENFORCED' : 'INACTIVE (PREVIEW MODE)'}
              </div>
              <div style={{ fontSize: '12.5px', color: isFeatureActive ? '#15803D' : '#B45309', marginTop: '2px' }}>
                {isFeatureActive
                  ? 'Active Mode: Central pre-assembled kits, 3-level barcode serialization (LS-KIT / LS-TUBE), and courier sealed kit verification are enforced across Phlebo & Lab workflows.'
                  : 'Inactive Mode: Stock management is currently in Draft/Preview mode. Phlebotomists operate in standard direct collection without mandatory kit custody scans until activated.'}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={handleToggleFeatureActivation}
            disabled={isTogglingFeature}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              backgroundColor: isFeatureActive ? '#DC2626' : '#0D9488',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 700,
              fontSize: '13px',
              cursor: isTogglingFeature ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            {isTogglingFeature ? (
              'Updating...'
            ) : isFeatureActive ? (
              <>
                <span>⏸️</span> Deactivate &amp; Switch to Preview Mode
              </>
            ) : (
              <>
                <span>⚡</span> Activate Enterprise Kit &amp; Central Warehouse
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Assembled Kits (Stock)
            </span>
            <span style={{ fontSize: '1.4rem' }}>📦</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '8px' }}>
            {totalAssembledKits} <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#64748B' }}>Kits Ready</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#10B981', marginTop: '4px', fontWeight: 600 }}>
            ✓ Ready for 1-Click Phlebotomist Dispatch
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Raw Vacutainers Stock
            </span>
            <span style={{ fontSize: '1.4rem' }}>🧪</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '8px' }}>
            {totalRawVacutainers} <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#64748B' }}>Tubes</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '4px' }}>
            EDTA, SST Gel, Fluoride, Citrate &amp; Heparin
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Field Stock (Phlebos)
            </span>
            <span style={{ fontSize: '1.4rem' }}>🛵</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '8px' }}>
            {totalActiveFieldKits} <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#64748B' }}>Kits with Couriers</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#0284C7', marginTop: '4px', fontWeight: 600 }}>
            Allocated across {phlebotomists.length} active couriers
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Reorder Alerts
            </span>
            <span style={{ fontSize: '1.4rem' }}>⚠️</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: lowStockMaterialsCount > 0 ? '#EF4444' : '#10B981', marginTop: '8px' }}>
            {lowStockMaterialsCount} <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#64748B' }}>Items Low</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: lowStockMaterialsCount > 0 ? '#EF4444' : '#10B981', marginTop: '4px', fontWeight: 600 }}>
            {lowStockMaterialsCount > 0 ? 'Requires Wholesaler PO Reorder' : 'All raw stocks healthy'} • {purchases.length} Inward POs
          </div>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #E2E8F0', marginBottom: '24px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveSubTab('overview')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeSubTab === 'overview' ? '3px solid #0D9488' : '3px solid transparent',
              color: activeSubTab === 'overview' ? '#0D9488' : '#64748B',
              fontWeight: activeSubTab === 'overview' ? 700 : 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📊</span> Overview &amp; Valuation
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('kits')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeSubTab === 'kits' ? '3px solid #0D9488' : '3px solid transparent',
              color: activeSubTab === 'kits' ? '#0D9488' : '#64748B',
              fontWeight: activeSubTab === 'kits' ? 700 : 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📦</span> Kit Master ({kits.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('materials')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeSubTab === 'materials' ? '3px solid #0D9488' : '3px solid transparent',
              color: activeSubTab === 'materials' ? '#0D9488' : '#64748B',
              fontWeight: activeSubTab === 'materials' ? 700 : 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🧪</span> Raw Materials ({materials.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('inward')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeSubTab === 'inward' ? '3px solid #0D9488' : '3px solid transparent',
              color: activeSubTab === 'inward' ? '#0D9488' : '#64748B',
              fontWeight: activeSubTab === 'inward' ? 700 : 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📥</span> Stock Inward
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('batches')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeSubTab === 'batches' ? '3px solid #0D9488' : '3px solid transparent',
              color: activeSubTab === 'batches' ? '#0D9488' : '#64748B',
              fontWeight: activeSubTab === 'batches' ? 700 : 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📋</span> FEFO Batches
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('suppliers')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeSubTab === 'suppliers' ? '3px solid #0D9488' : '3px solid transparent',
              color: activeSubTab === 'suppliers' ? '#0D9488' : '#64748B',
              fontWeight: activeSubTab === 'suppliers' ? 700 : 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🏭</span> Suppliers
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('ledger')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeSubTab === 'ledger' ? '3px solid #0D9488' : '3px solid transparent',
              color: activeSubTab === 'ledger' ? '#0D9488' : '#64748B',
              fontWeight: activeSubTab === 'ledger' ? 700 : 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📜</span> Stock Ledger
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('adjustments')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeSubTab === 'adjustments' ? '3px solid #0D9488' : '3px solid transparent',
              color: activeSubTab === 'adjustments' ? '#0D9488' : '#64748B',
              fontWeight: activeSubTab === 'adjustments' ? 700 : 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⚖️</span> Write-Offs
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('allocations')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeSubTab === 'allocations' ? '3px solid #0D9488' : '3px solid transparent',
              color: activeSubTab === 'allocations' ? '#0D9488' : '#64748B',
              fontWeight: activeSubTab === 'allocations' ? 700 : 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🛵</span> Kit Dispatches ({allocations.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('barcode-printing')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeSubTab === 'barcode-printing' ? '3px solid #0D9488' : '3px solid transparent',
              color: activeSubTab === 'barcode-printing' ? '#0D9488' : '#64748B',
              fontWeight: activeSubTab === 'barcode-printing' ? 700 : 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🏷️</span> Barcodes
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowScannerBridgeModal(true)}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            border: 'none',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}
        >
          <span>📱</span> Connect Mobile Scanner
        </button>
      </div>

      {/* VIEW 0: CENTRAL WAREHOUSE VALUATION & OVERVIEW */}
      {activeSubTab === 'overview' && (
        <AdminInventoryDashboardTab
          onShowAlert={onShowAlert}
          onNavigateSubtab={(tab) => setActiveSubTab(tab as any)}
        />
      )}

      {/* VIEW 1: DIAGNOSTIC COLLECTION KITS & ASSEMBLY */}
      {activeSubTab === 'kits' && (
        <div>
          {/* Kits View Mode Switcher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', background: '#F1F5F9', padding: '4px', borderRadius: '10px', border: '1px solid #CBD5E1' }}>
              <button
                type="button"
                onClick={() => setKitsViewMode('BOM_ASSEMBLY')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: kitsViewMode === 'BOM_ASSEMBLY' ? '#0D9488' : 'transparent',
                  color: kitsViewMode === 'BOM_ASSEMBLY' ? '#FFFFFF' : '#475569',
                  boxShadow: kitsViewMode === 'BOM_ASSEMBLY' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>⚙️</span> Enterprise Kit BOM &amp; Production Run
              </button>
              <button
                type="button"
                onClick={() => setKitsViewMode('READY_STOCK')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: kitsViewMode === 'READY_STOCK' ? '#0D9488' : 'transparent',
                  color: kitsViewMode === 'READY_STOCK' ? '#FFFFFF' : '#475569',
                  boxShadow: kitsViewMode === 'READY_STOCK' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>📦</span> Assembled Ready Kits Overview ({kits.length})
              </button>
            </div>
          </div>

          {kitsViewMode === 'BOM_ASSEMBLY' ? (
            <AdminInventoryKitsMasterTab onShowAlert={onShowAlert} />
          ) : (
            <div>
              {/* Kits In-Stock Filter Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 700, color: '#475569' }}>
                Stock Status:
              </label>
              <select
                value={kitStockFilter}
                onChange={(e) => setKitStockFilter(e.target.value as 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK')}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">📦 All Diagnostic Kits ({kits.length})</option>
                <option value="IN_STOCK">🟢 In Stock (&gt; 0 Ready)</option>
                <option value="LOW_STOCK">⚠️ Low Stock / Reorder Needed</option>
                <option value="OUT_OF_STOCK">🔴 Out of Stock (0 Ready)</option>
              </select>
            </div>
            <div style={{ fontSize: '0.84rem', color: '#64748B' }}>
              Showing {filteredKits.length} of {kits.length} Diagnostic Specimen Kits
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
            {filteredKits.map((kit) => {
              const isLowStock = kit.currentAssembledStock <= kit.reorderThreshold;
              return (
                <div
                  key={kit.id}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    {/* Kit Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            backgroundColor: `${kit.colorBadge}15`,
                            color: kit.colorBadge,
                            border: `2px solid ${kit.colorBadge}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.4rem',
                          }}
                        >
                          {kit.iconEmoji}
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
                            {kit.kitName}
                          </h3>
                          <span style={{ fontSize: '0.78rem', color: '#64748B', fontFamily: 'monospace' }}>
                            {kit.kitCode} • {kit.category}
                          </span>
                        </div>
                      </div>

                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          backgroundColor: isLowStock ? '#FEF2F2' : '#F0FDF4',
                          color: isLowStock ? '#DC2626' : '#16A34A',
                          border: `1px solid ${isLowStock ? '#FCA5A5' : '#BBF7D0'}`,
                        }}
                      >
                        {kit.currentAssembledStock} Ready
                      </span>
                    </div>

                    <p style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 1.5, margin: '0 0 14px 0' }}>
                      {kit.description}
                    </p>

                    {/* Target Diagnostic Tests */}
                    <div style={{ marginBottom: '14px' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                        Target Diagnostic Tests:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                        {kit.targetTestCodes.map((code) => (
                          <span
                            key={code}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              backgroundColor: '#F1F5F9',
                              color: '#334155',
                            }}
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Bill of Materials (BOM) */}
                    <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                        Bill of Materials (1 Kit = 1 Collection):
                      </span>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: '#334155', lineHeight: 1.6 }}>
                        {kit.billOfMaterials.map((comp, idx) => (
                          <li key={idx}>
                            <strong>{comp.quantity}x</strong> {comp.materialName} ({comp.category})
                          </li>
                        ))}
                      </ul>
                      <div style={{ marginTop: '8px', fontSize: '0.78rem', fontWeight: 600, color: '#0D9488', textAlign: 'right' }}>
                        Estimated Kit Cost: {formatInr(kit.costPerKitInr)}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid #F1F5F9', paddingTop: '14px' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setAssemblingKit(kit);
                        setAssembleQuantity(10);
                      }}
                      style={{ flex: 1, padding: '9px 12px', fontSize: '0.85rem', fontWeight: 600 }}
                    >
                      ⚙️ Assemble Kits
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setDispatchingKit(kit);
                        setDispatchQuantity(10);
                      }}
                      disabled={kit.currentAssembledStock <= 0}
                      style={{ flex: 1, padding: '9px 12px', fontSize: '0.85rem', fontWeight: 600 }}
                    >
                      🛵 Dispatch to Courier
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: RAW MATERIALS & VACUTAINERS INVENTORY */}
      {activeSubTab === 'materials' && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search supplies by name, brand, or batch..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.88rem',
                  width: '280px',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>
                  Stock Filter:
                </label>
                <select
                  value={materialStockFilter}
                  onChange={(e) => setMaterialStockFilter(e.target.value as 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    backgroundColor: '#FFFFFF',
                    color: '#0F172A',
                    cursor: 'pointer',
                  }}
                >
                  <option value="ALL">📦 All Raw Stocks ({materials.length})</option>
                  <option value="IN_STOCK">🟢 In Stock (&gt; 0)</option>
                  <option value="LOW_STOCK">⚠️ Low Stock Alerts ({lowStockMaterialsCount})</option>
                  <option value="OUT_OF_STOCK">🔴 Out of Stock</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', background: '#F1F5F9', padding: '3px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <button
                  type="button"
                  onClick={() => setMaterialViewMode('CARDS')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: materialViewMode === 'CARDS' ? '#0D9488' : 'transparent',
                    color: materialViewMode === 'CARDS' ? '#FFFFFF' : '#475569',
                    boxShadow: materialViewMode === 'CARDS' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  🗂️ Cards
                </button>
                <button
                  type="button"
                  onClick={() => setMaterialViewMode('TABLE')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: materialViewMode === 'TABLE' ? '#0D9488' : 'transparent',
                    color: materialViewMode === 'TABLE' ? '#FFFFFF' : '#475569',
                    boxShadow: materialViewMode === 'TABLE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  📑 Table
                </button>
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleOpenPackHandoverModal('ROUTINE_50')}
                style={{ padding: '7px 14px', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>📦</span> Pack Courier Supplies
              </button>

              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  if (materials.length > 0 && !poMaterialId) {
                    setPoMaterialId(materials[0].id);
                    setPoUnitPrice(materials[0].costPerUnitInr);
                    setPoVendorName(materials[0].vendorName || 'BD Life Sciences India');
                  }
                  setShowInwardModal(true);
                }}
                style={{ padding: '7px 14px', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>📥</span> + Inward Stock PO
              </button>
            </div>
          </div>

          {/* CARDS VIEW MODE */}
          {materialViewMode === 'CARDS' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                gap: '16px',
                padding: '20px',
              }}
            >
              {filteredMaterials.map((mat) => {
                const isLow = mat.currentStock <= mat.reorderThreshold;
                const isOut = mat.currentStock <= 0;
                const capColorMap: Record<string, string> = {
                  EDTA_LAVENDER: '#8B5CF6',
                  SERUM_RED_GOLD: '#EAB308',
                  SODIUM_FLUORIDE_GREY: '#64748B',
                  SODIUM_CITRATE_BLUE: '#3B82F6',
                  HEPARIN_GREEN: '#10B981',
                };
                const capColor = mat.tubeType ? capColorMap[mat.tubeType] || '#EF4444' : null;

                return (
                  <div
                    key={mat.id}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '12px',
                      border: `1.5px solid ${isOut ? '#FCA5A5' : isLow ? '#FDE68A' : '#E2E8F0'}`,
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    }}
                  >
                    <div>
                      {/* Top Row: Category tag and cap color indicator */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.70rem',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            backgroundColor:
                              mat.category === 'VACUTAINER'
                                ? '#EDE9FE'
                                : mat.category === 'NEEDLE'
                                ? '#E0F2FE'
                                : mat.category === 'PACKAGING'
                                ? '#FEF3C7'
                                : '#F1F5F9',
                            color:
                              mat.category === 'VACUTAINER'
                                ? '#6D28D9'
                                : mat.category === 'NEEDLE'
                                ? '#0369A1'
                                : mat.category === 'PACKAGING'
                                ? '#92400E'
                                : '#475569',
                          }}
                        >
                          {mat.category}
                        </span>

                        {capColor && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <div
                              style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                backgroundColor: capColor,
                                border: '1px solid rgba(0,0,0,0.15)',
                              }}
                            />
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569' }}>
                              {mat.tubeType}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Title & Emoji */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
                        <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{mat.iconEmoji || '🧪'}</span>
                        <div>
                          <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>
                            {mat.name}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'monospace' }}>
                            {mat.id}
                          </span>
                        </div>
                      </div>

                      {/* Stock Counter Box */}
                      <div
                        style={{
                          background: isOut ? '#FEF2F2' : isLow ? '#FFFBEB' : '#F0FDF4',
                          border: `1px solid ${isOut ? '#FCA5A5' : isLow ? '#FCD34D' : '#BBF7D0'}`,
                          borderRadius: '8px',
                          padding: '10px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '12px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.70rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                            Central In-Stock
                          </div>
                          <div
                            style={{
                              fontSize: '1.35rem',
                              fontWeight: 900,
                              color: isOut ? '#DC2626' : isLow ? '#D97706' : '#16A34A',
                              lineHeight: 1.1,
                            }}
                          >
                            {mat.currentStock}{' '}
                            <span style={{ fontSize: '0.80rem', fontWeight: 600 }}>{mat.unit}s</span>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              backgroundColor: isOut ? '#DC2626' : isLow ? '#D97706' : '#16A34A',
                              color: '#FFFFFF',
                            }}
                          >
                            {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'Healthy'}
                          </span>
                          <div style={{ fontSize: '0.70rem', color: '#64748B', marginTop: '4px' }}>
                            Min: {mat.reorderThreshold} {mat.unit}s
                          </div>
                        </div>
                      </div>

                      {/* Metadata Details */}
                      <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.6, marginBottom: '14px' }}>
                        <div><strong>Unit Cost:</strong> {formatInr(mat.costPerUnitInr)}</div>
                        <div><strong>Batch / Lot:</strong> {mat.batchNumber || 'STANDARD'}</div>
                        <div><strong>Expiry Date:</strong> {mat.expiryDate || 'N/A'}</div>
                        <div><strong>Supplier:</strong> {mat.vendorName || 'Direct Vendor'}</div>
                      </div>
                    </div>

                    {/* Bottom Action */}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleDirectInward(mat)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>📥</span> + Inward Stock PO
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            /* TABLE VIEW MODE */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 16px' }}>Item Name &amp; Category</th>
                    <th style={{ padding: '12px 16px' }}>Tube Type / Cap</th>
                    <th style={{ padding: '12px 16px' }}>Current Stock</th>
                    <th style={{ padding: '12px 16px' }}>Min Threshold</th>
                    <th style={{ padding: '12px 16px' }}>Unit Cost</th>
                    <th style={{ padding: '12px 16px' }}>Batch / Expiry</th>
                    <th style={{ padding: '12px 16px' }}>Manufacturer / Vendor</th>
                    <th style={{ padding: '12px 16px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaterials.map((mat) => {
                    const isLow = mat.currentStock <= mat.reorderThreshold;
                    return (
                      <tr key={mat.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '1.2rem' }}>{mat.iconEmoji}</span>
                            <div>
                              <div style={{ fontWeight: 600, color: '#0F172A' }}>{mat.name}</div>
                              <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                {mat.id} • {mat.category}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {mat.tubeType ? (
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                backgroundColor: '#F1F5F9',
                                color: '#1E293B',
                              }}
                            >
                              {mat.tubeType}
                            </span>
                          ) : (
                            <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: '20px',
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              backgroundColor: isLow ? '#FEF2F2' : '#F0FDF4',
                              color: isLow ? '#DC2626' : '#16A34A',
                              border: `1px solid ${isLow ? '#FCA5A5' : '#BBF7D0'}`,
                            }}
                          >
                            {mat.currentStock} {mat.unit}s
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748B' }}>
                          {mat.reorderThreshold} {mat.unit}s
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0F172A' }}>
                          {formatInr(mat.costPerUnitInr)}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                            {mat.batchNumber}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Exp: {mat.expiryDate}</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#475569', fontSize: '0.82rem' }}>
                          {mat.vendorName}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleDirectInward(mat)}
                            style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700 }}
                          >
                            📥 Inward
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW: STOCK INWARD WITH LIVE BARCODE RESOLVER */}
      {activeSubTab === 'inward' && (
        <AdminInventoryInwardTab onShowAlert={onShowAlert} />
      )}

      {/* VIEW: FEFO BATCHES & IMMUTABLE LEDGER */}
      {activeSubTab === 'batches' && (
        <AdminInventoryBatchesTab onShowAlert={onShowAlert} />
      )}

      {/* VIEW: SUPPLIERS & PACKAGING BARCODE MAPPINGS */}
      {activeSubTab === 'suppliers' && (
        <AdminInventorySuppliersTab onShowAlert={onShowAlert} />
      )}

      {/* VIEW 3: PHLEBOTOMIST KIT DISPATCHES */}
      {activeSubTab === 'allocations' && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>
              Field Phlebotomist Kit Allocation Ledger
            </h3>
            <span style={{ fontSize: '0.82rem', color: '#64748B' }}>
              Total Records: {allocations.length}
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>Dispatch Date</th>
                  <th style={{ padding: '12px 16px' }}>Phlebotomist</th>
                  <th style={{ padding: '12px 16px' }}>Kit Type</th>
                  <th style={{ padding: '12px 16px' }}>Allocated</th>
                  <th style={{ padding: '12px 16px' }}>Consumed</th>
                  <th style={{ padding: '12px 16px' }}>On-Hand</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Dispatched By</th>
                </tr>
              </thead>
              <tbody>
                {allocations.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#94A3B8' }}>
                      No kit dispatches recorded yet. Use the "Dispatch to Courier" button in the Kits tab to issue stock.
                    </td>
                  </tr>
                ) : (
                  allocations.map((alloc) => (
                    <tr key={alloc.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: '#64748B' }}>
                        {new Date(alloc.allocatedAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{alloc.phlebotomistName}</div>
                        <span style={{ fontSize: '0.74rem', color: '#64748B' }}>{alloc.phlebotomistId}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#0D9488' }}>{alloc.kitName}</div>
                        <span style={{ fontSize: '0.74rem', color: '#64748B' }}>{alloc.kitCode}</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0F172A' }}>
                        {alloc.quantityAllocated}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748B' }}>
                        {alloc.quantityConsumed}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontWeight: 700, color: alloc.quantityOnHand > 0 ? '#10B981' : '#EF4444' }}>
                          {alloc.quantityOnHand}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            backgroundColor:
                              alloc.status === 'DISPATCHED' ? '#FEF3C7' : alloc.status === 'RECEIVED' ? '#DCFCE7' : '#F1F5F9',
                            color:
                              alloc.status === 'DISPATCHED' ? '#B45309' : alloc.status === 'RECEIVED' ? '#15803D' : '#64748B',
                          }}
                        >
                          {alloc.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: '#64748B' }}>
                        {alloc.dispatchedBy}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 4: THERMAL BARCODE STICKER PRINTING CENTER */}
      {activeSubTab === 'barcode-printing' && (
        <AdminInventoryBarcodeTab onShowAlert={onShowAlert} />
      )}

      {/* VIEW 5: STOCK TRANSACTION LEDGER */}
      {activeSubTab === 'ledger' && (
        <AdminInventoryStockLedgerTab onShowAlert={onShowAlert} />
      )}

      {/* VIEW 6: STOCK ADJUSTMENTS & WRITE-OFFS */}
      {activeSubTab === 'adjustments' && (
        <AdminInventoryAdjustmentsTab onShowAlert={onShowAlert} />
      )}

      {/* MODAL: ASSEMBLE KITS */}
      {assemblingKit && (
        <div className="modal-overlay" onClick={() => setAssemblingKit(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>{assemblingKit.iconEmoji}</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                  Assemble Kits: {assemblingKit.kitName}
                </h3>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setAssemblingKit(null)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '0 0 16px 0' }}>
                Assembling kits will automatically verify raw inventory stock and deduct component items from central storage.
              </p>

              <div className="form-group">
                <label className="form-label">Number of Kits to Assemble *</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="form-input"
                  value={assembleQuantity}
                  onChange={(e) => setAssembleQuantity(Math.max(1, Number(e.target.value)))}
                  required
                />
              </div>

              {/* Required BOM preview */}
              <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px', border: '1px solid #E2E8F0', marginTop: '12px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  Required Component Stock (for {assembleQuantity} kits):
                </span>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: '#334155', lineHeight: 1.6 }}>
                  {assemblingKit.billOfMaterials.map((comp, idx) => {
                    const totalNeeded = comp.quantity * assembleQuantity;
                    const mat = materials.find((m) => m.id === comp.materialId);
                    const hasEnough = mat ? mat.currentStock >= totalNeeded : false;
                    return (
                      <li key={idx} style={{ color: hasEnough ? '#1E293B' : '#DC2626' }}>
                        <strong>{totalNeeded}x</strong> {comp.materialName} ({mat?.currentStock || 0} in stock) {!hasEnough && '⚠️ Insufficient'}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setAssemblingKit(null)} disabled={isSubmittingAssembly}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleConfirmAssembly} disabled={isSubmittingAssembly}>
                {isSubmittingAssembly ? 'Assembling...' : `Confirm Assembly of ${assembleQuantity} Kits`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DISPATCH KITS TO PHLEBO */}
      {dispatchingKit && (
        <div className="modal-overlay" onClick={() => setDispatchingKit(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>🛵</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                  Dispatch Kits: {dispatchingKit.kitName}
                </h3>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setDispatchingKit(null)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '0 0 16px 0' }}>
                Allocate assembled kits to a field phlebotomist. Stock will reflect immediately in their mobile app inventory.
              </p>

              <div className="form-group">
                <label className="form-label">Select Field Phlebotomist *</label>
                <select
                  className="form-select"
                  value={selectedPhleboId}
                  onChange={(e) => setSelectedPhleboId(e.target.value)}
                  required
                >
                  <option value="">-- Choose Active Courier --</option>
                  {phlebotomists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.phone}) {p.currentLocation ? `• ${p.currentLocation}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Dispatch Quantity (Available: {dispatchingKit.currentAssembledStock}) *</label>
                <input
                  type="number"
                  min={1}
                  max={dispatchingKit.currentAssembledStock}
                  className="form-input"
                  value={dispatchQuantity}
                  onChange={(e) => setDispatchQuantity(Math.min(dispatchingKit.currentAssembledStock, Math.max(1, Number(e.target.value))))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Dispatch Notes (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Morning route supply, Sector 4 corridor"
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setDispatchingKit(null)} disabled={isSubmittingDispatch}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleConfirmDispatch} disabled={isSubmittingDispatch || !selectedPhleboId}>
                {isSubmittingDispatch ? 'Dispatching...' : `Dispatch ${dispatchQuantity} Kits`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PACK & HANDOVER FIELD SUPPLIES TO PHLEBOTOMIST */}
      {showPackHandoverModal && (
        <div className="modal-overlay" onClick={() => setShowPackHandoverModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>📦</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                    Pack &amp; Handover Courier Supplies
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>
                    Assemble customized collection supplies bag. Stock is automatically deducted upon handover.
                  </p>
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setShowPackHandoverModal(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, paddingRight: '8px' }}>
              {/* Courier Selection */}
              <div className="form-group">
                <label className="form-label">Receiving Field Phlebotomist *</label>
                <select
                  className="form-select"
                  value={packPhleboId}
                  onChange={(e) => setPackPhleboId(e.target.value)}
                  style={{ fontWeight: 600 }}
                >
                  <option value="" disabled>-- Choose Field Phlebotomist --</option>
                  {phlebotomists.map((p) => (
                    <option key={p.id} value={p.id}>
                      🛵 {p.name} ({p.id}) • {p.phone || p.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pack Name & Batch Code */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Pack Package Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={packName}
                    onChange={(e) => setPackName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Bag / Batch Code *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={packBatchCode}
                    onChange={(e) => setPackBatchCode(e.target.value)}
                  />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Quick Pack Presets:
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleSelectPackPreset('ROUTINE_50')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid #0D9488',
                      background: '#F0FDFA',
                      color: '#0D9488',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🩸 Routine 50 Collections
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPackPreset('CAMP_100')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid #2563EB',
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ⛺ Health Camp 100 Collections
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPackPreset('EMPTY')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      background: '#FFFFFF',
                      color: '#64748B',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    🔄 Clear All / Custom
                  </button>
                </div>
              </div>

              {/* Item quantities builder */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                    Supplies to Include in Handover Bag:
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0D9488' }}>
                    Total Items: {Object.values(packItemsQuantities).reduce((a, b) => a + (Number(b) || 0), 0)}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {materials.map((mat) => {
                    const currentQty = packItemsQuantities[mat.id] || 0;
                    const isExceeding = currentQty > mat.currentStock;

                    return (
                      <div
                        key={mat.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: currentQty > 0 ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
                          border: `1px solid ${isExceeding ? '#FCA5A5' : currentQty > 0 ? '#0D9488' : '#E2E8F0'}`,
                          borderRadius: '8px',
                          padding: '8px 12px',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: '1.2rem' }}>{mat.iconEmoji || '🧪'}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {mat.name}
                            </div>
                            <div style={{ fontSize: '0.70rem', color: isExceeding ? '#DC2626' : '#64748B' }}>
                              Central Stock: <strong>{mat.currentStock} {mat.unit}s</strong>
                              {isExceeding && ' (Exceeds In-Stock!)'}
                            </div>
                          </div>
                        </div>

                        {/* Adjuster */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setPackItemsQuantities((prev) => ({
                                ...prev,
                                [mat.id]: Math.max(0, (prev[mat.id] || 0) - (mat.category === 'ACCESSORY' || mat.category === 'PACKAGING' ? 10 : 5)),
                              }));
                            }}
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              background: '#F1F5F9',
                              fontSize: '0.9rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={mat.currentStock * 2}
                            value={currentQty}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                              setPackItemsQuantities((prev) => ({ ...prev, [mat.id]: val }));
                            }}
                            style={{
                              width: '52px',
                              textAlign: 'center',
                              padding: '4px',
                              borderRadius: '6px',
                              border: `1.5px solid ${isExceeding ? '#DC2626' : currentQty > 0 ? '#0D9488' : '#CBD5E1'}`,
                              fontSize: '0.85rem',
                              fontWeight: 700,
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setPackItemsQuantities((prev) => ({
                                ...prev,
                                [mat.id]: (prev[mat.id] || 0) + (mat.category === 'ACCESSORY' || mat.category === 'PACKAGING' ? 10 : 5),
                              }));
                            }}
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              background: '#F1F5F9',
                              fontSize: '0.9rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Handover notes */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Handover Notes / Instructions</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Dispatched 50 collections bag with 20x EDTA, 15x SST, 30x Needles..."
                  value={packNotes}
                  onChange={(e) => setPackNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowPackHandoverModal(false)}
                disabled={isSubmittingPack}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmCustomPackHandover}
                disabled={
                  isSubmittingPack ||
                  !packPhleboId ||
                  Object.values(packItemsQuantities).reduce((a, b) => a + (Number(b) || 0), 0) === 0
                }
              >
                {isSubmittingPack
                  ? 'Deducting Stock & Handing Over...'
                  : `Handover Pack (${Object.values(packItemsQuantities).reduce((a, b) => a + (Number(b) || 0), 0)} Items) →`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: INWARD PURCHASE ORDER / STOCK ENTRY */}
      {showInwardModal && (
        <div className="modal-overlay" onClick={() => setShowInwardModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>📥</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                  Inward Stock &amp; Vendor Purchase Order
                </h3>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setShowInwardModal(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">PO Number *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Supplier / Manufacturer *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={poVendorName}
                    onChange={(e) => setPoVendorName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Select Raw Material / Vacutainer Stock *</label>
                  {currentInwardMat && (
                    <span style={{
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: currentInwardMat.currentStock <= currentInwardMat.reorderThreshold ? '#FEE2E2' : '#DCFCE7',
                      color: currentInwardMat.currentStock <= currentInwardMat.reorderThreshold ? '#DC2626' : '#15803D',
                    }}>
                      Current In-Stock: {currentInwardMat.currentStock} {currentInwardMat.unit}s
                    </span>
                  )}
                </div>
                <select
                  className="form-select"
                  value={poMaterialId || (materials[0]?.id ?? '')}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setPoMaterialId(nextId);
                    const mat = materials.find((m) => m.id === nextId);
                    if (mat) {
                      setPoUnitPrice(mat.costPerUnitInr);
                      if (mat.vendorName) setPoVendorName(mat.vendorName);
                    }
                  }}
                  required
                  style={{ fontWeight: 600 }}
                >
                  <optgroup label="🩸 Vacutainer Blood Collection Tubes">
                    {materials.filter((m) => m.category === 'VACUTAINER' || m.tubeType).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.iconEmoji} {m.name} — In-Stock: {m.currentStock} {m.unit}s (Min: {m.reorderThreshold})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="💉 Needles & Blood Collection Sets">
                    {materials.filter((m) => m.category === 'NEEDLE').map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.iconEmoji} {m.name} — In-Stock: {m.currentStock} {m.unit}s (Min: {m.reorderThreshold})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🏷️ Barcode Labels & Thermal Stickers">
                    {materials.filter((m) => m.category === 'LABEL_STICKER').map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.iconEmoji} {m.name} — In-Stock: {m.currentStock} {m.unit}s (Min: {m.reorderThreshold})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="📦 Specimen Bags, Boxes & Transport Kits">
                    {materials.filter((m) => m.category === 'PACKAGING').map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.iconEmoji} {m.name} — In-Stock: {m.currentStock} {m.unit}s (Min: {m.reorderThreshold})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🧪 Phlebotomy Accessories & Consumables">
                    {materials.filter((m) => m.category === 'ACCESSORY').map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.iconEmoji} {m.name} — In-Stock: {m.currentStock} {m.unit}s (Min: {m.reorderThreshold})
                      </option>
                    ))}
                  </optgroup>
                </select>

                {/* Real-time In-Stock Status Preview Card */}
                {currentInwardMat && (
                  <div style={{
                    marginTop: '10px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.3rem' }}>{currentInwardMat.iconEmoji}</span>
                      <div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                          {currentInwardMat.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          Category: <strong>{currentInwardMat.category}</strong> • ID: <code>{currentInwardMat.id}</code>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'right' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>CURRENT STOCK</div>
                        <div style={{
                          fontSize: '0.88rem',
                          fontWeight: 800,
                          color: currentInwardMat.currentStock <= currentInwardMat.reorderThreshold ? '#DC2626' : '#15803D'
                        }}>
                          {currentInwardMat.currentStock} {currentInwardMat.unit}s
                        </div>
                      </div>
                      <div style={{ borderLeft: '1px solid #CBD5E1', paddingLeft: '10px' }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>AFTER INWARD</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0369A1' }}>
                          +{poQuantity} = {(currentInwardMat.currentStock || 0) + (Number(poQuantity) || 0)} {currentInwardMat.unit}s
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Quantity Received *</label>
                  <input
                    type="number"
                    min={1}
                    className="form-input"
                    value={poQuantity}
                    onChange={(e) => setPoQuantity(Math.max(1, Number(e.target.value)))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Unit Cost (₹) *</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0.1}
                    className="form-input"
                    value={poUnitPrice}
                    onChange={(e) => setPoUnitPrice(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Manufacturer Batch Number *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={poBatchNumber}
                    onChange={(e) => setPoBatchNumber(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Expiry Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={poExpiryDate}
                    onChange={(e) => setPoExpiryDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Vendor Invoice Number (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. INV-BD-2026-889"
                  value={poInvoiceNumber}
                  onChange={(e) => setPoInvoiceNumber(e.target.value)}
                />
              </div>

              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', textAlign: 'right' }}>
                <span style={{ fontSize: '0.82rem', color: '#64748B' }}>Total Inward Value: </span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                  {formatInr(poQuantity * poUnitPrice)}
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowInwardModal(false)} disabled={isSubmittingPO}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleConfirmInwardPO} disabled={isSubmittingPO || (!poMaterialId && materials.length === 0)}>
                {isSubmittingPO ? 'Inwarding...' : `Receive & Inward ${poQuantity} Units`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE-TO-DESKTOP REMOTE SCANNER BRIDGE */}
      <AdminInventoryScannerBridgeModal
        isOpen={showScannerBridgeModal}
        onClose={() => setShowScannerBridgeModal(false)}
        contextTitle="Central Warehouse Inventory"
      />
    </div>
  );
}
