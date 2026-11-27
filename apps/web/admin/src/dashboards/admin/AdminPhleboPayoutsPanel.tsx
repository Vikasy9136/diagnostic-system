import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatInr,
  type PayoutErrorLogRecord,
  type PayoutLedgerRecord,
} from '@diagnostic/shared';
import { BankLogo } from '@diagnostic/shared/web/BankLogo';
import { API_BASE_URL, auth } from '../../firebase';

interface PhleboPayoutOverviewData {
  kpis: {
    totalEarningsInr: number;
    totalPendingInr: number;
    totalProcessingInr: number;
    totalPaidInr: number;
    totalFailedInr: number;
    totalOnHoldInr: number;
    totalReversedInr: number;
    missingBankCount: number;
    unverifiedBankCount: number;
  };
  ledgers: PayoutLedgerRecord[];
  errors: PayoutErrorLogRecord[];
  providerConfig: {
    razorpayXEnabled: boolean;
    webhookSecretConfigured: boolean;
  };
}

async function callPayoutAdminApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const res = await fetch(`${base}/phlebo-payouts${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const json = (await res.json()) as { success?: boolean; data?: T; message?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Request failed (${res.status})`);
  }
  return json.data as T;
}

export function AdminPhleboPayoutsPanel() {
  const [data, setData] = useState<PhleboPayoutOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'CUSTOM'>('ALL');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [failedOnly, setFailedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [revealedInfo, setRevealedInfo] = useState<{
    phleboId: string;
    accountNumber?: string;
    ifsc?: string;
    bankName?: string;
    upiId?: string;
    expiresAt: string;
  } | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await callPayoutAdminApi<PhleboPayoutOverviewData>('/admin/overview');
      setData(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load Phlebo payout ledger.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!revealedInfo) return;
    const msLeft = Math.max(1000, new Date(revealedInfo.expiresAt).getTime() - Date.now());
    const t = setTimeout(() => setRevealedInfo(null), msLeft);
    return () => clearTimeout(t);
  }, [revealedInfo]);

  const filteredLedgers = useMemo(() => {
    const list = data?.ledgers || [];
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    const yestStr = yest.toISOString().slice(0, 10);
    const sevenAgo = new Date(now);
    sevenAgo.setDate(now.getDate() - 7);
    const monthPrefix = todayStr.slice(0, 7);

    return list.filter((row) => {
      if (failedOnly && !['FAILED', 'REVERSED', 'NEEDS_REVIEW'].includes(row.status)) return false;
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (methodFilter !== 'ALL' && row.payoutMethod !== methodFilter) return false;

      const day = row.createdAt.slice(0, 10);
      if (dateFilter === 'TODAY' && day !== todayStr) return false;
      if (dateFilter === 'YESTERDAY' && day !== yestStr) return false;
      if (dateFilter === 'LAST_7_DAYS' && new Date(row.createdAt) < sevenAgo) return false;
      if (dateFilter === 'THIS_MONTH' && !day.startsWith(monthPrefix)) return false;
      if (dateFilter === 'CUSTOM') {
        if (customFrom && day < customFrom) return false;
        if (customTo && day > customTo) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${row.bookingId} ${row.orderNumber} ${row.phleboId} ${row.phleboName} ${row.bankName || ''} ${row.errorCode || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, dateFilter, customFrom, customTo, statusFilter, methodFilter, failedOnly, searchQuery]);

  const handleRetry = async (ledgerId: string) => {
    setBusyId(ledgerId);
    setActionMsg(null);
    try {
      await callPayoutAdminApi(`/admin/${ledgerId}/retry`, { method: 'POST' });
      setActionMsg(`Retry triggered safely for ${ledgerId}.`);
      await loadOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleHold = async (ledgerId: string) => {
    const reason = window.prompt('Enter reason to put this payout on hold:');
    if (!reason || !reason.trim()) return;
    setBusyId(ledgerId);
    try {
      await callPayoutAdminApi(`/admin/${ledgerId}/hold`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setActionMsg(`Payout ${ledgerId} placed on hold.`);
      await loadOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Hold failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleManualReconcile = async (ledgerId: string) => {
    const utrNumber = window.prompt('Enter verified external Bank UTR / UPI Reference ID (min 6 chars):');
    if (!utrNumber || utrNumber.trim().length < 6) return;
    setBusyId(ledgerId);
    try {
      await callPayoutAdminApi(`/admin/${ledgerId}/manual-reconcile`, {
        method: 'POST',
        body: JSON.stringify({ utrNumber: utrNumber.trim(), notes: 'Admin manual UTR reconciliation' }),
      });
      setActionMsg(`Manually reconciled ${ledgerId} with UTR ${utrNumber.trim()}.`);
      await loadOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Manual reconciliation failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleAuditedReveal = async (phleboId: string) => {
    const reason = window.prompt('AUDIT REQUIRED: Enter reason for viewing full bank/UPI details (min 8 chars):');
    if (!reason || reason.trim().length < 8) return;
    setBusyId(phleboId);
    try {
      const res = await callPayoutAdminApi<{
        phleboId: string;
        accountNumber?: string;
        ifsc?: string;
        bankName?: string;
        upiId?: string;
        expiresAt: string;
      }>('/admin/reveal-bank', {
        method: 'POST',
        body: JSON.stringify({ phleboId, reason: reason.trim() }),
      });
      setRevealedInfo(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Reveal failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) {
    return <div className="chart-card-modern"><p>Loading Phlebo Payout Engine &amp; Error Monitor...</p></div>;
  }

  const kpis = data?.kpis;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Provider Configuration Status */}
      {data && (!data.providerConfig.razorpayXEnabled || !data.providerConfig.webhookSecretConfigured) && (
        <div style={{ padding: '14px 16px', borderRadius: '12px', backgroundColor: '#FEF3C7', border: '1.5px solid #F59E0B', color: '#92400E' }}>
          <strong>CONFIGURATION REQUIRED:</strong>{' '}
          {!data.providerConfig.razorpayXEnabled && 'RAZORPAYX_ACCOUNT_NUMBER is not configured. '}
          {!data.providerConfig.webhookSecretConfigured && 'RAZORPAY_WEBHOOK_SECRET is not configured. '}
          Live bank transfers require activated Razorpay Route Linked Accounts or RazorpayX account credentials in backend environment.
        </div>
      )}

      {errorMsg && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: '#FEE2E2', color: '#991B1B', fontWeight: 600 }}>
          {errorMsg}
        </div>
      )}
      {actionMsg && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: '#DCFCE7', color: '#166534', fontWeight: 600 }}>
          {actionMsg}
        </div>
      )}

      {revealedInfo && (
        <div style={{ padding: '14px 16px', borderRadius: '12px', backgroundColor: '#EFF6FF', border: '1.5px solid #3B82F6', color: '#1E3A8A' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>🔓 Audited Sensitive Reveal ({revealedInfo.phleboId}) — Auto-hides in 30s</strong>
            <button type="button" onClick={() => setRevealedInfo(null)} style={{ cursor: 'pointer', border: 'none', background: 'transparent', fontWeight: 700 }}>✕ Close</button>
          </div>
          <div style={{ marginTop: '6px', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {revealedInfo.accountNumber && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BankLogo ifsc={revealedInfo.ifsc} bankName={revealedInfo.bankName} size={28} />
                <span>Account Number: <strong>{revealedInfo.accountNumber}</strong> | IFSC: <strong>{revealedInfo.ifsc}</strong> ({revealedInfo.bankName})</span>
              </div>
            )}
            {revealedInfo.upiId && <div>UPI ID: <strong>{revealedInfo.upiId}</strong></div>}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {kpis && (
        <div className="kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '12px' }}>
          <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Total Phlebo Earnings</span><span className="kpi-main-number">{formatInr(kpis.totalEarningsInr)}</span></div></div>
          <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Payout Pending</span><span className="kpi-main-number">{formatInr(kpis.totalPendingInr)}</span></div></div>
          <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Payout Processing</span><span className="kpi-main-number">{formatInr(kpis.totalProcessingInr)}</span></div></div>
          <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Successfully Paid</span><span className="kpi-main-number" style={{ color: '#15803D' }}>{formatInr(kpis.totalPaidInr)}</span></div></div>
          <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Failed Payouts</span><span className="kpi-main-number" style={{ color: '#B91C1C' }}>{formatInr(kpis.totalFailedInr)}</span></div></div>
          <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">On Hold / Reversed</span><span className="kpi-main-number">{formatInr(kpis.totalOnHoldInr + kpis.totalReversedInr)}</span></div></div>
          <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Missing Bank Details</span><span className="kpi-main-number" style={{ color: '#C2410C' }}>{kpis.missingBankCount}</span></div></div>
          <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Unverified Bank Details</span><span className="kpi-main-number" style={{ color: '#B45309' }}>{kpis.unverifiedBankCount}</span></div></div>
        </div>
      )}

      {/* Filters & Ledger Table */}
      <div className="chart-card-modern">
        <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 className="card-top-title">Phlebo Payout Ledger ({filteredLedgers.length})</h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Integer-paise verified payouts with idempotent retry &amp; webhook reconciliation</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void loadOverview()}>↻ Refresh</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: '220px' }}
            placeholder="Search Booking / Phlebo / Error..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select className="form-input" style={{ maxWidth: '150px' }} value={dateFilter} onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}>
            <option value="ALL">All Dates</option>
            <option value="TODAY">Today</option>
            <option value="YESTERDAY">Yesterday</option>
            <option value="LAST_7_DAYS">Last 7 Days</option>
            <option value="THIS_MONTH">This Month</option>
            <option value="CUSTOM">Custom Range</option>
          </select>
          {dateFilter === 'CUSTOM' && (
            <>
              <input type="date" className="form-input" style={{ maxWidth: '145px' }} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <input type="date" className="form-input" style={{ maxWidth: '145px' }} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </>
          )}
          <select className="form-input" style={{ maxWidth: '160px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All Statuses</option>
            <option value="READY_FOR_PAYOUT">READY_FOR_PAYOUT</option>
            <option value="INITIATED">INITIATED</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="PROCESSED">PROCESSED</option>
            <option value="SETTLED">SETTLED</option>
            <option value="FAILED">FAILED</option>
            <option value="ON_HOLD">ON_HOLD</option>
            <option value="REVERSED">REVERSED</option>
            <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
          </select>
          <select className="form-input" style={{ maxWidth: '150px' }} value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
            <option value="ALL">All Methods</option>
            <option value="BANK_ACCOUNT">Bank Account</option>
            <option value="UPI">UPI</option>
            <option value="RAZORPAY_ROUTE">Razorpay Route</option>
            <option value="MANUAL">Manual UTR</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600 }}>
            <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} />
            Failed Only
          </label>
        </div>

        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Phlebo</th>
                <th>Gross / Fee / Net</th>
                <th>Method &amp; Masked Dest</th>
                <th>Provider Ref</th>
                <th>Status &amp; Error</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedgers.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#64748B' }}>No payout ledger entries match current filters.</td></tr>
              ) : filteredLedgers.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.orderNumber}</strong>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{row.bookingId}</div>
                  </td>
                  <td>
                    <strong>{row.phleboName}</strong>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{row.phleboId}</div>
                  </td>
                  <td>
                    <div>{formatInr(row.grossEarningInr)} - {formatInr(row.platformFeeInr)}</div>
                    <strong style={{ color: '#0F766E' }}>Net: {formatInr(row.netPayableInr)}</strong>
                  </td>
                  <td>
                    <div>{row.payoutMethod}</div>
                    <div style={{ fontSize: '0.74rem', color: '#475569' }}>{row.maskedDestination}</div>
                  </td>
                  <td style={{ fontSize: '0.75rem' }}>
                    {row.providerPayoutId || row.providerTransferId || row.utrNumber || '—'}
                  </td>
                  <td>
                    <span className={row.status === 'SETTLED' || row.status === 'PROCESSED' ? 'status-pill-green' : 'status-pill-amber'}>
                      {row.status}
                    </span>
                    {row.errorCode && (
                      <div style={{ fontSize: '0.72rem', color: '#B91C1C', marginTop: '4px', fontWeight: 700 }}>
                        {row.errorCode}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {row.retryEligible && (
                        <button type="button" className="btn-secondary" disabled={busyId === row.id} onClick={() => void handleRetry(row.id)}>Retry</button>
                      )}
                      {!['PROCESSED', 'SETTLED', 'ON_HOLD'].includes(row.status) && (
                        <button type="button" className="btn-secondary" disabled={busyId === row.id} onClick={() => void handleHold(row.id)}>Hold</button>
                      )}
                      {!['SETTLED'].includes(row.status) && (
                        <button type="button" className="btn-secondary" disabled={busyId === row.id} onClick={() => void handleManualReconcile(row.id)}>UTR Reconcile</button>
                      )}
                      <button type="button" className="btn-secondary" disabled={busyId === row.phleboId} onClick={() => void handleAuditedReveal(row.phleboId)}>Reveal</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error Monitoring Log */}
      <div className="chart-card-modern">
        <h2 className="card-top-title">🚨 Payout Error Monitoring ({data?.errors.length || 0})</h2>
        <div className="data-table-container" style={{ marginTop: '12px' }}>
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Booking &amp; Phlebo</th>
                <th>Amount</th>
                <th>Error Code &amp; Reason</th>
                <th>Recommended Action</th>
              </tr>
            </thead>
            <tbody>
              {(!data?.errors || data.errors.length === 0) ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: '#64748B' }}>No payout errors logged.</td></tr>
              ) : data.errors.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontSize: '0.75rem' }}>{new Date(e.createdAt).toLocaleString('en-IN')}</td>
                  <td><strong>{e.orderNumber}</strong><div style={{ fontSize: '0.72rem', color: '#64748B' }}>{e.phleboName} ({e.phleboId})</div></td>
                  <td>{formatInr(e.amountInr)}</td>
                  <td><strong style={{ color: '#B91C1C' }}>{e.errorCode}</strong><div style={{ fontSize: '0.75rem' }}>{e.message}</div></td>
                  <td style={{ fontSize: '0.76rem', color: '#334155' }}>{e.recommendedAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
