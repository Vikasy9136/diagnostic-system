import { useEffect, useState } from 'react';
import { type InventoryItemMaster } from '@diagnostic/shared';
import {
  createStockAdjustmentApi,
  fetchInventoryItems,
  fetchStockAdjustmentsApi,
} from '../../../services/inventoryApiService';

interface AdminInventoryAdjustmentsTabProps {
  onShowAlert: (params: {
    variant: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    title: string;
    message: string;
    detail?: string;
  }) => void;
}

export function AdminInventoryAdjustmentsTab({ onShowAlert }: AdminInventoryAdjustmentsTabProps) {
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [items, setItems] = useState<InventoryItemMaster[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<
    'DAMAGE' | 'LOSS' | 'EXPIRY' | 'COUNT_RECONCILIATION' | 'SAMPLE_TESTING'
  >('DAMAGE');
  const [quantityDelta, setQuantityDelta] = useState<number>(-1);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [adjList, itemList] = await Promise.all([
        fetchStockAdjustmentsApi({ limit: 100 }),
        fetchInventoryItems(),
      ]);
      setAdjustments(adjList);
      setItems(itemList);
      if (itemList.length > 0 && !selectedItemId) {
        setSelectedItemId(itemList[0].id);
      }
    } catch (err: any) {
      console.warn('Failed loading stock adjustments:', err);
      onShowAlert({
        variant: 'error',
        title: 'Loading Failed',
        message: err.message || 'Could not load adjustments history.',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItemId || !batchNumber.trim() || quantityDelta === 0) {
      onShowAlert({
        variant: 'warning',
        title: 'Incomplete Details',
        message: 'Please choose an item, enter batch number, and provide a non-zero quantity delta.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await createStockAdjustmentApi({
        itemId: selectedItemId,
        batchNumber: batchNumber.trim(),
        quantityDelta: Number(quantityDelta),
        adjustmentType,
        reason: reason.trim() || `Manual adjustment for ${adjustmentType}`,
        notes: notes.trim() || undefined,
      });

      onShowAlert({
        variant: 'success',
        title: 'Adjustment Recorded',
        message: res.message || 'Stock updated and immutable audit transaction logged.',
      });

      setShowModal(false);
      setBatchNumber('');
      setReason('');
      setNotes('');
      setQuantityDelta(-1);
      loadData();
    } catch (err: any) {
      onShowAlert({
        variant: 'error',
        title: 'Adjustment Failed',
        message: err.message || 'Could not complete stock adjustment.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          padding: '16px 20px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>
            ⚖️ Stock Adjustments, Expiry & Damage Write-Offs
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
            Record damaged vacutainers, expired reagents, physical count discrepancies, and scrap write-offs.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            backgroundColor: '#DC2626',
            color: '#FFFFFF',
            border: 'none',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>+</span> Record Stock Write-Off / Adjustment
        </button>
      </div>

      {/* Adjustments Table */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#64748B' }}>
            Loading stock adjustment records...
          </div>
        ) : adjustments.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#94A3B8' }}>
            No stock adjustments or write-offs have been recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '10px 14px' }}>Date</th>
                  <th style={{ padding: '10px 14px' }}>Adjustment No.</th>
                  <th style={{ padding: '10px 14px' }}>SKU</th>
                  <th style={{ padding: '10px 14px' }}>Type</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Delta Units</th>
                  <th style={{ padding: '10px 14px' }}>Reason / Notes</th>
                  <th style={{ padding: '10px 14px' }}>Authorized By</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((adj) => (
                  <tr key={adj.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 14px', color: '#64748B', whiteSpace: 'nowrap' }}>
                      {new Date(adj.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, fontFamily: 'monospace' }}>
                      {adj.adjustmentNumber || adj.id}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>
                      {adj.itemSku}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor:
                            adj.adjustmentType === 'DAMAGE'
                              ? '#FEE2E2'
                              : adj.adjustmentType === 'EXPIRY'
                              ? '#FEF3C7'
                              : '#F1F5F9',
                          color:
                            adj.adjustmentType === 'DAMAGE'
                              ? '#DC2626'
                              : adj.adjustmentType === 'EXPIRY'
                              ? '#D97706'
                              : '#334155',
                        }}
                      >
                        {adj.adjustmentType}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '10px 14px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: adj.quantityDelta > 0 ? '#16A34A' : '#DC2626',
                      }}
                    >
                      {adj.quantityDelta > 0 ? `+${adj.quantityDelta}` : adj.quantityDelta}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#475569' }}>
                      {adj.reason}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748B' }}>
                      {adj.authorizedByEmail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialog */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                Record Stock Write-Off / Adjustment
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAdjustment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Target Inventory Item *
                </label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                  }}
                  required
                >
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({it.sku}) — {it.baseUnit}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Batch Number *
                </label>
                <input
                  type="text"
                  placeholder="e.g. BATCH-2026-04"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Adjustment Type *
                  </label>
                  <select
                    value={adjustmentType}
                    onChange={(e) => setAdjustmentType(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                    }}
                  >
                    <option value="DAMAGE">Damage / Broken Tube</option>
                    <option value="EXPIRY">Expired Material</option>
                    <option value="LOSS">Physical Loss / Missing</option>
                    <option value="COUNT_RECONCILIATION">Audit Reconciliation</option>
                    <option value="SAMPLE_TESTING">QA Testing Discard</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Quantity Delta * (Negative for reduction)
                  </label>
                  <input
                    type="number"
                    value={quantityDelta}
                    onChange={(e) => setQuantityDelta(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Write-Off Reason *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Broken vacuum seal during inward transit inspection"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Internal Audit Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional context for Chartered Accountant or QA audit review..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Recording...' : 'Confirm Write-Off'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
