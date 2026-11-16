import { useState, useEffect, useMemo } from 'react';
import {
  formatInr,
  type StockBatchRecord,
  type StockTransactionRecord,
} from '@diagnostic/shared';
import {
  fetchStockBatches,
  fetchStockTransactions,
} from '../../../services/inventoryApiService';

interface AdminInventoryBatchesTabProps {
  onShowAlert: (params: {
    variant: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    title: string;
    message: string;
  }) => void;
}

export function AdminInventoryBatchesTab({ onShowAlert }: AdminInventoryBatchesTabProps) {
  const [batches, setBatches] = useState<StockBatchRecord[]>([]);
  const [transactions, setTransactions] = useState<StockTransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewFilter, setViewFilter] = useState<'ALL' | 'NEAR_EXPIRY' | 'HEALTHY'>('ALL');

  useEffect(() => {
    loadBatchesAndLedger();
  }, []);

  async function loadBatchesAndLedger() {
    setIsLoading(true);
    try {
      const [bList, txList] = await Promise.all([
        fetchStockBatches(),
        fetchStockTransactions(),
      ]);
      setBatches(bList);
      setTransactions(txList);
    } catch (err: any) {
      console.warn('Failed loading stock batches/ledger:', err);
      onShowAlert({
        variant: 'error',
        title: 'Failed Loading Batches',
        message: err.message || 'Could not fetch active batches or stock ledger movements.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Calculate days to expiry
  function getDaysToExpiry(expiryDateStr: string): number {
    const today = new Date();
    const expiry = new Date(expiryDateStr);
    const diffMs = expiry.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const days = getDaysToExpiry(b.expiryDate);
      if (viewFilter === 'NEAR_EXPIRY') return days <= 90;
      if (viewFilter === 'HEALTHY') return days > 90;
      return true;
    });
  }, [batches, viewFilter]);

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
              <span style={{ fontSize: '1.75rem' }}>📋</span>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0F172A' }}>
                FEFO Batch Inventory &amp; Double-Entry Stock Ledger
              </h2>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', color: '#64748B' }}>
              First-Expiry-First-Out (FEFO) material lots, shelf-life monitors &amp; immutable debit/credit stock movements.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setViewFilter('ALL')}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                background: viewFilter === 'ALL' ? '#0D9488' : '#FFFFFF',
                color: viewFilter === 'ALL' ? '#FFFFFF' : '#334155',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              All Batches ({batches.length})
            </button>
            <button
              type="button"
              onClick={() => setViewFilter('NEAR_EXPIRY')}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                background: viewFilter === 'NEAR_EXPIRY' ? '#D97706' : '#FFFFFF',
                color: viewFilter === 'NEAR_EXPIRY' ? '#FFFFFF' : '#334155',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              ⚠️ Near Expiry (&lt;90 Days)
            </button>
            <button
              type="button"
              onClick={loadBatchesAndLedger}
              disabled={isLoading}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                background: '#F8FAFC',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              {isLoading ? '...' : '🔄 Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Active Batches Table */}
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
          Active Manufacturer Batches ({filteredBatches.length})
        </h3>

        {filteredBatches.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>
            No active batches matching filter. Inward new inventory from the &quot;Stock Inward&quot; tab.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Batch / Lot</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Item SKU</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Supplier</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Stock (Avail / Init)</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Unit Cost</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Expiry Date</th>
                  <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Shelf Life</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map((b) => {
                  const days = getDaysToExpiry(b.expiryDate);
                  let badgeBg = '#DEF7EC';
                  let badgeColor = '#03543F';
                  let statusText = `${days} Days Left`;
                  if (days <= 0) {
                    badgeBg = '#FDE8E8';
                    badgeColor = '#9B1C1C';
                    statusText = 'EXPIRED';
                  } else if (days <= 90) {
                    badgeBg = '#FEF08A';
                    badgeColor = '#854D0E';
                    statusText = `⚠️ Expiring in ${days}d`;
                  }

                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
                          {b.batchNumber}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{b.warehouseId}</div>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#334155' }}>
                        {b.itemSku}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569' }}>{b.supplierName}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontWeight: 800, color: '#0D9488' }}>{b.availableQuantity}</span> /{' '}
                        <span style={{ color: '#64748B' }}>{b.initialQuantity}</span>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>
                        {formatInr(b.unitCostInr)}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>{b.expiryDate}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            background: badgeBg,
                            color: badgeColor,
                          }}
                        >
                          {statusText}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Double-Entry Stock Ledger Transactions Table */}
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
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
              Immutable Stock Ledger Movements ({transactions.length})
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
              Every unit movement (inward, kit assembly deduction, field dispatch) recorded with double-entry integrity.
            </p>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>
            No stock transactions recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                  <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Tx ID / Date</th>
                  <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Type</th>
                  <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Item SKU</th>
                  <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Batch</th>
                  <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Delta Units</th>
                  <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Movement Route</th>
                  <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Actor</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isPositive = tx.quantityDelta > 0;
                  return (
                    <tr key={tx.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>{tx.id}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          {new Date(tx.timestamp).toLocaleString('en-IN')}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: isPositive ? '#DEF7EC' : '#FDE8E8',
                            color: isPositive ? '#03543F' : '#9B1C1C',
                          }}
                        >
                          {tx.transactionType}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{tx.itemSku}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{tx.batchNumber || '—'}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 800, color: isPositive ? '#0D9488' : '#E11D48' }}>
                        {isPositive ? `+${tx.quantityDelta}` : tx.quantityDelta}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: '#475569' }}>
                        {tx.sourceLocation} $\rightarrow$ {tx.destinationLocation}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '0.78rem', color: '#64748B' }}>
                        {tx.actorEmail}
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
