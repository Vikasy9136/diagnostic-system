import { useEffect, useState, useMemo } from 'react';
import { type StockTransactionRecord } from '@diagnostic/shared';
import { fetchStockLedgerApi } from '../../../services/inventoryApiService';

interface AdminInventoryStockLedgerTabProps {
  onShowAlert: (params: {
    variant: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    title: string;
    message: string;
    detail?: string;
  }) => void;
}

export function AdminInventoryStockLedgerTab({ onShowAlert }: AdminInventoryStockLedgerTabProps) {
  const [ledger, setLedger] = useState<StockTransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    loadLedger();
  }, []);

  async function loadLedger() {
    setLoading(true);
    try {
      const records = await fetchStockLedgerApi({ limit: 200 });
      setLedger(records);
    } catch (err: any) {
      console.warn('Failed loading stock ledger:', err);
      onShowAlert({
        variant: 'error',
        title: 'Ledger Loading Failed',
        message: err.message || 'Could not fetch double-entry stock movements.',
      });
    } finally {
      setLoading(false);
    }
  }

  const filteredRecords = useMemo(() => {
    return ledger.filter((record) => {
      if (filterType !== 'ALL' && record.transactionType !== filterType) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          record.itemSku?.toLowerCase().includes(q) ||
          record.itemId?.toLowerCase().includes(q) ||
          record.batchNumber?.toLowerCase().includes(q) ||
          record.referenceId?.toLowerCase().includes(q) ||
          record.notes?.toLowerCase().includes(q) ||
          record.actorEmail?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [ledger, filterType, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header & Controls */}
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
            📜 Central Warehouse Double-Entry Stock Ledger
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
            Auditable, immutable ledger tracking every inward, kit assembly, dispatch, field consumption, and write-off.
          </p>
        </div>
        <button
          onClick={loadLedger}
          disabled={loading}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid #CBD5E1',
            backgroundColor: '#FFFFFF',
            color: '#334155',
            fontSize: '13px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Refreshing...' : '🔄 Refresh Ledger'}
        </button>
      </div>

      {/* Filters Bar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          backgroundColor: '#FFFFFF',
          borderRadius: '10px',
          padding: '12px 16px',
          border: '1px solid #E2E8F0',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 240px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by SKU, batch, reference ID, actor email..."
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              backgroundColor: '#FFFFFF',
            }}
          >
            <option value="ALL">All Transaction Types</option>
            <option value="INWARD_RECEIPT">Supplier Inwards</option>
            <option value="KIT_ASSEMBLY_DEDUCTION">Kit Assembly Deductions</option>
            <option value="KIT_DISPATCH">Kit Dispatches</option>
            <option value="BOOKING_CONSUMPTION">Booking Kit Consumptions</option>
            <option value="PHLEBO_PEER_TRANSFER">Courier Transfers</option>
            <option value="DAMAGE_WRITEOFF">Damage Write-Offs</option>
            <option value="EXPIRED_WRITEOFF">Expired Write-Offs</option>
            <option value="MANUAL_ADJUSTMENT">Manual Adjustments</option>
          </select>
        </div>
        <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, marginLeft: 'auto' }}>
          Showing {filteredRecords.length} records
        </div>
      </div>

      {/* Table */}
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
            Loading stock transaction ledger...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#94A3B8' }}>
            No transaction records found matching criteria.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '10px 14px' }}>Timestamp</th>
                  <th style={{ padding: '10px 14px' }}>Type</th>
                  <th style={{ padding: '10px 14px' }}>Item SKU</th>
                  <th style={{ padding: '10px 14px' }}>Batch</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Quantity Delta</th>
                  <th style={{ padding: '10px 14px' }}>Movement Path</th>
                  <th style={{ padding: '10px 14px' }}>Reference ID</th>
                  <th style={{ padding: '10px 14px' }}>Authorized By</th>
                  <th style={{ padding: '10px 14px' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r) => {
                  const isPositive = r.quantityDelta > 0;
                  const isNegative = r.quantityDelta < 0;
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 14px', color: '#64748B', whiteSpace: 'nowrap' }}>
                        {new Date(r.timestamp).toLocaleString('en-IN', {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor:
                              r.transactionType === 'INWARD_RECEIPT'
                                ? '#DCFCE7'
                                : r.transactionType === 'BOOKING_CONSUMPTION'
                                ? '#E0F2FE'
                                : r.transactionType.includes('WRITEOFF')
                                ? '#FEE2E2'
                                : '#F1F5F9',
                            color:
                              r.transactionType === 'INWARD_RECEIPT'
                                ? '#15803D'
                                : r.transactionType === 'BOOKING_CONSUMPTION'
                                ? '#0369A1'
                                : r.transactionType.includes('WRITEOFF')
                                ? '#B91C1C'
                                : '#334155',
                          }}
                        >
                          {r.transactionType}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>
                        {r.itemSku || r.itemId}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569', fontFamily: 'monospace' }}>
                        {r.batchNumber || '—'}
                      </td>
                      <td
                        style={{
                          padding: '10px 14px',
                          textAlign: 'right',
                          fontWeight: 700,
                          fontSize: '13px',
                          color: isPositive ? '#16A34A' : isNegative ? '#DC2626' : '#64748B',
                        }}
                      >
                        {isPositive ? `+${r.quantityDelta}` : r.quantityDelta}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569', fontSize: '11px' }}>
                        <span style={{ color: '#64748B' }}>{r.sourceLocation}</span>
                        <span style={{ margin: '0 4px', color: '#CBD5E1' }}>→</span>
                        <span style={{ fontWeight: 600 }}>{r.destinationLocation}</span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748B', fontFamily: 'monospace' }}>
                        {r.referenceId || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>
                        {r.actorEmail}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748B', maxWidth: '220px' }}>
                        {r.notes || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
