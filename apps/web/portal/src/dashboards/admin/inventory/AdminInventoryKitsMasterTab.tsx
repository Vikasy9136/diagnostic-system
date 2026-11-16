import { useState, useEffect } from 'react';
import {
  formatInr,
  type KitAssemblyRecord,
  type KitBOMComponent,
  type KitBOMVersionRecord,
  type KitDefinitionMaster,
} from '@diagnostic/shared';
import {
  executeKitAssemblyApi,
  fetchKitAssembliesHistory,
  fetchKitBom,
  fetchKitDefinitions,
  validateKitAssemblyFeasibilityApi,
  type AssemblyValidationResponse,
} from '../../../services/inventoryApiService';

interface AdminInventoryKitsMasterTabProps {
  onShowAlert: (params: {
    variant: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    title: string;
    message: string;
    detail?: string;
  }) => void;
}

export function AdminInventoryKitsMasterTab({ onShowAlert }: AdminInventoryKitsMasterTabProps) {
  const [kits, setKits] = useState<KitDefinitionMaster[]>([]);
  const [assemblies, setAssemblies] = useState<KitAssemblyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Selected Kit for BOM Inspection
  const [inspectingKit, setInspectingKit] = useState<KitDefinitionMaster | null>(null);
  const [inspectingBom, setInspectingBom] = useState<KitBOMVersionRecord | null>(null);
  const [isLoadingBom, setIsLoadingBom] = useState(false);

  // Assembly Modal State
  const [assemblingKit, setAssemblingKit] = useState<KitDefinitionMaster | null>(null);
  const [assembleQuantity, setAssembleQuantity] = useState(10);
  const [validationResult, setValidationResult] = useState<AssemblyValidationResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isExecutingAssembly, setIsExecutingAssembly] = useState(false);
  const [assemblyNotes, setAssemblyNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [kitList, asmList] = await Promise.all([
        fetchKitDefinitions(),
        fetchKitAssembliesHistory(),
      ]);
      setKits(kitList);
      setAssemblies(asmList);
    } catch (err: any) {
      console.warn('Failed loading kit definitions & assemblies:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Open BOM Recipe Inspector
  async function handleInspectBOM(kit: KitDefinitionMaster) {
    setInspectingKit(kit);
    setIsLoadingBom(true);
    try {
      const bom = await fetchKitBom(kit.id);
      setInspectingBom(bom);
    } catch (err: any) {
      onShowAlert({
        variant: 'error',
        title: 'BOM Load Failed',
        message: err.message || 'Could not load Bill of Materials recipe.',
      });
      setInspectingKit(null);
    } finally {
      setIsLoadingBom(false);
    }
  }

  // Open Assembly Run Modal and run Feasibility Validation
  async function handleOpenAssemblyModal(kit: KitDefinitionMaster) {
    setAssemblingKit(kit);
    setAssembleQuantity(10);
    setAssemblyNotes('');
    await runValidation(kit.id, 10);
  }

  async function runValidation(kitId: string, qty: number) {
    setIsValidating(true);
    try {
      const res = await validateKitAssemblyFeasibilityApi(kitId, qty);
      setValidationResult(res);
    } catch (err: any) {
      console.warn('Feasibility validation warning:', err);
      setValidationResult(null);
    } finally {
      setIsValidating(false);
    }
  }

  // Handle Quantity Change in Assembly Modal
  function handleQuantityChange(newQty: number) {
    const val = Math.max(1, newQty);
    setAssembleQuantity(val);
    if (assemblingKit) {
      runValidation(assemblingKit.id, val);
    }
  }

  // Execute Production Run
  async function handleConfirmAssembly() {
    if (!assemblingKit) return;
    if (!validationResult?.feasible) {
      onShowAlert({
        variant: 'warning',
        title: 'Cannot Assemble',
        message: 'Insufficient loose warehouse materials. Please inward required stock first.',
      });
      return;
    }

    setIsExecutingAssembly(true);
    try {
      const result = await executeKitAssemblyApi({
        kitDefinitionId: assemblingKit.id,
        quantityToAssemble: assembleQuantity,
        warehouseId: 'WH-CENTRAL-MAIN',
        notes: assemblyNotes.trim() || undefined,
      });

      onShowAlert({
        variant: 'success',
        title: 'Production Assembly Completed!',
        message: `Successfully assembled ${result.assemblyRecord.assembledQuantity}x ${assemblingKit.name}. Components deducted from warehouse lots with earliest component expiry: ${result.assemblyRecord.earliestComponentExpiry}.`,
      });

      setAssemblingKit(null);
      setValidationResult(null);
      loadData();
    } catch (err: any) {
      onShowAlert({
        variant: 'error',
        title: 'Assembly Run Failed',
        message: err.message || 'Failed executing kit assembly production run.',
      });
    } finally {
      setIsExecutingAssembly(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)',
          color: '#FFFFFF',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(15, 118, 110, 0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.75rem' }}>📦</span>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>
                Central Warehouse Pre-Assembled Kit Engine &amp; BOM Master
              </h2>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: '#CCFBF1' }}>
              <strong>Operational Rule:</strong> 1 Collection = 1 Kit (`LS-KIT-XXXXXX`). Central Warehouse alone assembles kits; couriers receive sealed pre-assembled kits.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            {isLoading ? 'Refreshing...' : '🔄 Refresh Kits'}
          </button>
        </div>
      </div>

      {/* Kit Recipes Master Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {kits.map((kit) => (
          <div
            key={kit.id}
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              padding: '22px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '2rem' }}>{kit.iconEmoji}</span>
                  <div>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        color: kit.colorBadge,
                        background: `${kit.colorBadge}15`,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        marginBottom: '4px',
                      }}
                    >
                      {kit.kitCode} • BOM v{kit.activeBOMVersion}
                    </span>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                      {kit.name}
                    </h3>
                  </div>
                </div>
              </div>

              <p style={{ margin: '0 0 16px 0', fontSize: '0.84rem', color: '#64748B', lineHeight: '1.4' }}>
                {kit.description}
              </p>

              {/* Target Panels */}
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
                  Applicable Test Panels:
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {kit.targetTestCodes.map((tc, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '0.72rem',
                        background: '#F1F5F9',
                        color: '#475569',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 600,
                      }}
                    >
                      {tc}
                    </span>
                  ))}
                </div>
              </div>

              {/* Economics */}
              <div
                style={{
                  background: '#F8FAFC',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '18px',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>Estimated BOM Cost:</span>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                  {formatInr(kit.estimatedCostPerKitInr)} / Kit
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => handleInspectBOM(kit)}
                style={{
                  flex: '1',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#334155',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                🔍 Inspect BOM Recipe
              </button>
              <button
                type="button"
                onClick={() => handleOpenAssemblyModal(kit)}
                style={{
                  flex: '1.2',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(13, 148, 136, 0.25)',
                }}
              >
                ⚙️ Assemble Kits
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Production Assembly Batches */}
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
              Central Warehouse Assembly Production Runs ({assemblies.length})
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
              Record of pre-assembled diagnostic kits ready for barcode serialization and courier issue.
            </p>
          </div>
        </div>

        {assemblies.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>
            No assembly runs executed yet. Click &quot;Assemble Kits&quot; above to run your first central production batch.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Assembly Code</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Kit Recipe</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Quantity Assembled</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Serialized Tubes</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Batch Expiry</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Assembled At</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {assemblies.map((asm) => (
                  <tr key={asm.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
                        {asm.assemblyCode}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{asm.warehouseId}</div>
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#334155' }}>
                      {asm.kitName} ({asm.kitCode})
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 800, color: '#0D9488' }}>
                      {asm.assembledQuantity} Kits
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                      {asm.totalTubesSerialized} Tubes
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#E11D48' }}>
                      {asm.earliestComponentExpiry}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '0.8rem', color: '#64748B' }}>
                      {new Date(asm.assembledAt).toLocaleString('en-IN')}
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
                        ✓ {asm.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: BOM Recipe Inspector */}
      {inspectingKit && (
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
              maxWidth: '640px',
              padding: '24px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0D9488', textTransform: 'uppercase' }}>
                  Bill of Materials Recipe (v{inspectingBom?.version || 1})
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', fontWeight: 800 }}>
                  {inspectingKit.iconEmoji} {inspectingKit.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingKit(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            {isLoadingBom ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748B' }}>Loading recipe...</div>
            ) : inspectingBom?.components ? (
              <div>
                <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '12px' }}>
                  Every pre-assembled kit contains the following verified components sealed in a biohazard transport pouch:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {inspectingBom.components.map((c: KitBOMComponent, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem' }}>
                          {c.itemName}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          SKU: {c.sku} • Category: {c.category} {c.isIndividuallySerialized && '• (Individual Barcode Serialized)'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0D9488' }}>
                          {c.quantity}
                        </span>{' '}
                        <span style={{ fontSize: '0.8rem', color: '#64748B' }}>{c.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setInspectingKit(null)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Central Warehouse Assembly Run Modal with Live Feasibility Check */}
      {assemblingKit && (
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
              maxWidth: '680px',
              padding: '24px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0D9488', textTransform: 'uppercase' }}>
                  Central Warehouse Assembly Run
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', fontWeight: 800 }}>
                  {assemblingKit.iconEmoji} Assemble {assemblingKit.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAssemblingKit(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            {/* Quantity Selector */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Batch Quantity to Assemble (Kits) *
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="number"
                  min={1}
                  value={assembleQuantity}
                  onChange={(e) => handleQuantityChange(Number(e.target.value))}
                  style={{
                    width: '120px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '2px solid #0D9488',
                    fontSize: '1.1rem',
                    fontWeight: 800,
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleQuantityChange(10)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  10 Kits
                </button>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(25)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  25 Kits
                </button>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(50)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  50 Kits
                </button>
              </div>
            </div>

            {/* Live Feasibility Check Results */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                  Component Loose Stock Availability Check
                </label>
                {isValidating ? (
                  <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Validating stock...</span>
                ) : validationResult?.feasible ? (
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#059669', background: '#DEF7EC', padding: '2px 8px', borderRadius: '6px' }}>
                    ✓ 100% Sufficient Stock in Warehouse
                  </span>
                ) : (
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#DC2626', background: '#FEE2E2', padding: '2px 8px', borderRadius: '6px' }}>
                    ⚠️ Deficit in {validationResult?.unmetRequirementsCount} Component(s)
                  </span>
                )}
              </div>

              {validationResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {validationResult.components.map((c, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: c.hasSufficientStock ? '#F8FAFC' : '#FEF2F2',
                        border: `1px solid ${c.hasSufficientStock ? '#E2E8F0' : '#FECACA'}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0F172A' }}>
                          {c.itemName}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: c.hasSufficientStock ? '#64748B' : '#DC2626' }}>
                          Need: {c.totalRequired} • Available in Central WH: {c.availableLooseStock}{' '}
                          {c.deficit > 0 && `(Missing: ${c.deficit})`}
                        </div>
                      </div>
                      <div>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: c.hasSufficientStock ? '#DEF7EC' : '#FEE2E2',
                            color: c.hasSufficientStock ? '#047857' : '#B91C1C',
                          }}
                        >
                          {c.hasSufficientStock ? '✓ Stock OK' : `Deficit: -${c.deficit}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Estimated Batch Cost Preview */}
            <div
              style={{
                background: '#F0FDFA',
                border: '1.5px solid #0D9488',
                borderRadius: '10px',
                padding: '14px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F766E', textTransform: 'uppercase' }}>
                  Estimated Production Run Cost
                </div>
                <div style={{ fontSize: '0.85rem', color: '#134E4A', marginTop: '2px' }}>
                  {assembleQuantity} Kits × {formatInr(validationResult?.estimatedCostPerKitInr || 0)}
                </div>
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0F172A' }}>
                {formatInr(validationResult?.estimatedTotalBatchCostInr || 0)}
              </div>
            </div>

            {/* Production Notes */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Assembly Production Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Central cleanroom batch #1 for North Zone dispatch"
                value={assemblyNotes}
                onChange={(e) => setAssemblyNotes(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.9rem' }}
              />
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setAssemblingKit(null)}
                style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', fontWeight: 700 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAssembly}
                disabled={isExecutingAssembly || !validationResult?.feasible}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: validationResult?.feasible ? 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)' : '#94A3B8',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: validationResult?.feasible ? 'pointer' : 'not-allowed',
                  boxShadow: validationResult?.feasible ? '0 4px 12px rgba(13, 148, 136, 0.25)' : 'none',
                }}
              >
                {isExecutingAssembly ? 'Assembling Kits...' : `Confirm Production of ${assembleQuantity} Kits`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
