import { useEffect, useState } from 'react';
import { formatInr } from '@diagnostic/shared';
import {
  fetchInventoryDashboardSummaryApi,
  type InventoryDashboardSummaryDto,
} from '../../../services/inventoryApiService';

interface AdminInventoryDashboardTabProps {
  onShowAlert: (params: {
    variant: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    title: string;
    message: string;
    detail?: string;
  }) => void;
  onNavigateSubtab?: (tab: string) => void;
}

export function AdminInventoryDashboardTab({
  onShowAlert,
  onNavigateSubtab,
}: AdminInventoryDashboardTabProps) {
  const [data, setData] = useState<InventoryDashboardSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadSummary();
  }, []);

  async function loadSummary() {
    setLoading(true);
    try {
      const summary = await fetchInventoryDashboardSummaryApi();
      setData(summary);
    } catch (err: any) {
      console.warn('Dashboard summary fetch failed:', err);
      onShowAlert({
        variant: 'error',
        title: 'Failed to load Dashboard',
        message: err.message || 'Could not fetch central inventory statistics.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    loadSummary();
  }

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748B' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
        <div>Calculating Warehouse Stock Valuation & Kit Traceability...</div>
      </div>
    );
  }

  const valuation = data?.valuation || {
    totalStockValuationInr: 0,
    totalActiveSkus: 0,
    totalStockUnits: 0,
  };
  const kits = data?.kits || {
    totalAssembled: 0,
    warehouseKits: 0,
    inTransitKits: 0,
    availableWithPhleboKits: 0,
    consumedKits: 0,
  };
  const alerts = data?.alerts || {
    lowStockItems: [],
    expiringBatches: [],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner & Refresh */}
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
            📊 Central Warehouse Valuation & Inventory KPI Overview
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
            Real-time FEFO batch valuation, 3-level serialization status, and proactive stock alerts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 600,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🔄</span> {refreshing ? 'Refreshing...' : 'Refresh Statistics'}
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Total Stock Valuation */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '18px',
            borderLeft: '4px solid #0D9488',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
            Total Stock Valuation
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
            {formatInr(valuation.totalStockValuationInr)}
          </div>
          <div style={{ fontSize: '12px', color: '#0D9488', fontWeight: 600, marginTop: '4px' }}>
            {valuation.totalActiveSkus} Active SKUs • {valuation.totalStockUnits.toLocaleString('en-IN')} units on hand
          </div>
        </div>

        {/* Assembled Ready Kits */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '18px',
            borderLeft: '4px solid #3B82F6',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
            Central Warehouse Kits
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#1E40AF', marginTop: '6px' }}>
            {kits.warehouseKits}{' '}
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#64748B' }}>
              / {kits.totalAssembled} assembled
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
            Ready for dispatch to field phlebotomists
          </div>
        </div>

        {/* Kits in Phlebo Custody */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '18px',
            borderLeft: '4px solid #8B5CF6',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
            Phlebotomist Field Stock
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#6D28D9', marginTop: '6px' }}>
            {kits.availableWithPhleboKits}{' '}
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748B' }}>
              ({kits.inTransitKits} in-transit)
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#7C3AED', marginTop: '4px' }}>
            In active mobile custody for home collections
          </div>
        </div>

        {/* Consumed / Accessioned Kits */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '18px',
            borderLeft: '4px solid #10B981',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
            Consumed & Handed Over
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#047857', marginTop: '6px' }}>
            {kits.consumedKits}
          </div>
          <div style={{ fontSize: '12px', color: '#059669', marginTop: '4px' }}>
            Collected at patient site & verified at testing lab
          </div>
        </div>
      </div>

      {/* Alerts Row: Low Stock & Batch Expiries */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Low Stock Alerts */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            padding: '16px 20px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#B45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⚠️</span> Low Stock Warnings ({alerts.lowStockItems.length})
            </h3>
            {onNavigateSubtab && (
              <button
                onClick={() => onNavigateSubtab('inward')}
                style={{
                  fontSize: '12px',
                  color: '#0D9488',
                  background: 'none',
                  border: 'none',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Restock Inward →
              </button>
            )}
          </div>
          {alerts.lowStockItems.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#10B981', fontSize: '13px' }}>
              ✓ All active inventory items meet minimum warehouse threshold.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {alerts.lowStockItems.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#FEF3C7',
                    border: '1px solid #FDE68A',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400E' }}>{item.name}</div>
                    <div style={{ fontSize: '11px', color: '#B45309' }}>
                      SKU: {item.sku} • Reorder Level: {item.reorderLevel} {item.unit}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '999px',
                        backgroundColor: item.currentStock === 0 ? '#EF4444' : '#F59E0B',
                        color: '#FFFFFF',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      {item.currentStock} {item.unit} left
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expiring Batches Alerts */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            padding: '16px 20px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⏱️</span> FEFO Expiry Watch (&lt; 90 Days) ({alerts.expiringBatches.length})
            </h3>
            {onNavigateSubtab && (
              <button
                onClick={() => onNavigateSubtab('batches')}
                style={{
                  fontSize: '12px',
                  color: '#0D9488',
                  background: 'none',
                  border: 'none',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Inspect All Batches →
              </button>
            )}
          </div>
          {alerts.expiringBatches.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#10B981', fontSize: '13px' }}>
              ✓ No warehouse batches expiring within the next 90 days.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {alerts.expiringBatches.slice(0, 5).map((batch) => (
                <div
                  key={batch.batchNumber}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: batch.isExpired ? '#FEE2E2' : '#FFF7ED',
                    border: `1px solid ${batch.isExpired ? '#FECACA' : '#FFEDD5'}`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: batch.isExpired ? '#991B1B' : '#C2410C' }}>
                      Batch: {batch.batchNumber} ({batch.sku})
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                      Expires: {batch.expiryDate} • Qty: {batch.currentQuantity} units
                    </div>
                  </div>
                  <div>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '999px',
                        backgroundColor: batch.isExpired ? '#DC2626' : '#EA580C',
                        color: '#FFFFFF',
                        fontSize: '11px',
                        fontWeight: 700,
                      }}
                    >
                      {batch.isExpired ? 'EXPIRED' : `${batch.daysUntilExpiry} days left`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Ledger Activity Preview */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          padding: '16px 20px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
            📜 Recent Central Stock Ledger Transactions
          </h3>
          {onNavigateSubtab && (
            <button
              onClick={() => onNavigateSubtab('ledger')}
              style={{
                fontSize: '12px',
                color: '#0D9488',
                background: 'none',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Full Ledger View →
            </button>
          )}
        </div>
        {(!data?.recentTransactions || data.recentTransactions.length === 0) ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: '13px' }}>
            No recent stock movements recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                  <th style={{ padding: '8px 12px' }}>Timestamp</th>
                  <th style={{ padding: '8px 12px' }}>Transaction Type</th>
                  <th style={{ padding: '8px 12px' }}>Item / SKU</th>
                  <th style={{ padding: '8px 12px' }}>Qty Delta</th>
                  <th style={{ padding: '8px 12px' }}>From → To</th>
                  <th style={{ padding: '8px 12px' }}>Notes / Performer</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTransactions.slice(0, 10).map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '8px 12px', color: '#64748B' }}>
                      {new Date(tx.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0F172A' }}>
                      <span
                        style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          backgroundColor:
                            tx.transactionType === 'INWARD_RECEIPT'
                              ? '#DCFCE7'
                              : tx.transactionType === 'BOOKING_CONSUMPTION'
                              ? '#E0F2FE'
                              : tx.transactionType.includes('WRITEOFF')
                              ? '#FEE2E2'
                              : '#F1F5F9',
                          color:
                            tx.transactionType === 'INWARD_RECEIPT'
                              ? '#15803D'
                              : tx.transactionType === 'BOOKING_CONSUMPTION'
                              ? '#0369A1'
                              : tx.transactionType.includes('WRITEOFF')
                              ? '#B91C1C'
                              : '#334155',
                        }}
                      >
                        {tx.transactionType}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{tx.itemSku || tx.itemId}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: tx.quantityDelta >= 0 ? '#16A34A' : '#DC2626' }}>
                      {tx.quantityDelta > 0 ? `+${tx.quantityDelta}` : tx.quantityDelta}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#475569' }}>
                      {tx.sourceLocation} → {tx.destinationLocation}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#64748B' }}>
                      {tx.notes || tx.actorEmail}
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
