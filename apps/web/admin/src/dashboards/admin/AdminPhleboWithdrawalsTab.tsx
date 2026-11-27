import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatInr,
  type ManualPaymentMethod,
  type ManualSettlementRecord,
  type PhleboPaymentMethodSummary,
  type PhleboWallet,
  type WalletReconciliationReport,
  type WithdrawalConfig,
  type WithdrawalRequest,
} from '@diagnostic/shared';
import { BankLogo } from '@diagnostic/shared/web/BankLogo';
import { API_BASE_URL, auth } from '../../firebase';

async function callWalletAdminApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const root = base.replace(/\/api\/v1$/, '/api');
  const res = await fetch(`${root}${path}`, {
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

type TabKey = 'ALL' | 'PENDING' | 'PROCESSING' | 'SETTLED' | 'ON_HOLD' | 'REJECTED' | 'FAILED';

export function AdminPhleboWithdrawalsTab() {
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [settlements, setSettlements] = useState<ManualSettlementRecord[]>([]);
  const [config, setConfig] = useState<WithdrawalConfig | null>(null);
  const [recon, setRecon] = useState<WalletReconciliationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>('ALL');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'AMT_DESC' | 'AMT_ASC'>('DATE_DESC');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Detail modal state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{
    request: WithdrawalRequest;
    payoutProfile: PhleboPaymentMethodSummary;
    qrAccess: { available: boolean; signedUrl?: string; dataUrl?: string };
    wallet: PhleboWallet;
    settlement: ManualSettlementRecord | null;
    sensitiveDetails?: { accountNumber?: string; upiId?: string };
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [revealingSensitive, setRevealingSensitive] = useState(false);

  // Manual settlement form state
  const [payMethod, setPayMethod] = useState<ManualPaymentMethod>('UPI');
  const [actualAmountInr, setActualAmountInr] = useState('');
  const [trxRef, setTrxRef] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payTime, setPayTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const [wdData, reconData] = await Promise.all([
        callWalletAdminApi<{
          requests: WithdrawalRequest[];
          settlements: ManualSettlementRecord[];
          config: WithdrawalConfig;
        }>('/admin/withdrawals'),
        callWalletAdminApi<WalletReconciliationReport>('/admin/finance/reconciliation').catch(() => null),
      ]);
      setRequests(wdData.requests || []);
      setSettlements(wdData.settlements || []);
      setConfig(wdData.config || null);
      if (reconData) setRecon(reconData);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to load Phlebo withdrawals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setErrMsg(null);
    try {
      const data = await callWalletAdminApi<NonNullable<typeof detailData>>(`/admin/withdrawals/${id}`);
      setDetailData(data);
      setActualAmountInr(String(data.request.requestedAmountPaise / 100));
      setTrxRef('');
      setRemarks('');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to open withdrawal details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const kpis = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const pending = requests.filter((r) => ['PENDING_ADMIN_SETTLEMENT', 'UNDER_REVIEW'].includes(r.status));
    const settledWeek = requests.filter((r) => r.status === 'MANUAL_PAID' && r.settledAt && new Date(r.settledAt) >= weekAgo);
    return {
      totalRequests: requests.length,
      pendingCount: pending.length,
      pendingAmountInr: pending.reduce((s, r) => s + r.requestedAmountPaise, 0) / 100,
      settledWeekInr: settledWeek.reduce((s, r) => s + r.requestedAmountPaise, 0) / 100,
      failedCount: requests.filter((r) => ['FAILED', 'NEEDS_REVIEW'].includes(r.status)).length,
      onHoldCount: requests.filter((r) => r.status === 'ON_HOLD').length,
    };
  }, [requests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = requests.filter((r) => {
      if (tab === 'PENDING' && !['PENDING_ADMIN_SETTLEMENT', 'UNDER_REVIEW'].includes(r.status)) return false;
      if (tab === 'PROCESSING' && r.status !== 'PROCESSING_MANUALLY') return false;
      if (tab === 'SETTLED' && r.status !== 'MANUAL_PAID') return false;
      if (tab === 'ON_HOLD' && r.status !== 'ON_HOLD') return false;
      if (tab === 'REJECTED' && r.status !== 'REJECTED') return false;
      if (tab === 'FAILED' && !['FAILED', 'NEEDS_REVIEW'].includes(r.status)) return false;
      if (dateFilter && r.requestedAt.slice(0, 10) !== dateFilter) return false;
      if (q) {
        const hay = `${r.id} ${r.phleboName} ${r.phleboId} ${r.manualTransactionRef || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return list.sort((a, b) => {
      if (sortBy === 'DATE_ASC') return a.requestedAt.localeCompare(b.requestedAt);
      if (sortBy === 'AMT_DESC') return b.requestedAmountPaise - a.requestedAmountPaise;
      if (sortBy === 'AMT_ASC') return a.requestedAmountPaise - b.requestedAmountPaise;
      return b.requestedAt.localeCompare(a.requestedAt);
    });
  }, [requests, tab, search, dateFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const exportCsv = () => {
    const header = ['RequestID', 'PhleboID', 'PhleboName', 'RequestedINR', 'Method', 'Status', 'RequestedAt', 'UTR_Masked', 'SettledAt'];
    const rows = filtered.map((r) => [
      r.id,
      r.phleboId,
      `"${r.phleboName.replace(/"/g, '""')}"`,
      (r.requestedAmountPaise / 100).toFixed(2),
      r.paymentMethod,
      r.status,
      r.requestedAt,
      r.manualTransactionRef ? `****${r.manualTransactionRef.slice(-4)}` : '',
      r.settledAt || '',
    ]);
    const csv = [header.join(','), ...rows.map((x) => x.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labsetu-phlebo-withdrawals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLifecycleAction = async (action: 'review' | 'hold' | 'reject' | 'process') => {
    if (!detailData) return;
    let reason = '';
    if (action === 'hold' || action === 'reject') {
      const promptRes = window.prompt(`Enter mandatory reason to ${action.toUpperCase()} this request:`);
      if (!promptRes || promptRes.trim().length < 5) return;
      reason = promptRes.trim();
    }
    setSubmitting(true);
    setErrMsg(null);
    try {
      await callWalletAdminApi(`/admin/withdrawals/${detailData.request.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setOkMsg(`Withdrawal ${detailData.request.id} updated (${action}).`);
      await openDetail(detailData.request.id);
      await loadAll();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Status update failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualSettle = async () => {
    if (!detailData) return;
    if (!trxRef.trim() || trxRef.trim().length < 6) {
      setErrMsg('Valid external UTR / UPI Transaction Reference (min 6 chars) is mandatory.');
      return;
    }
    if (!window.confirm(`Confirm recording manual settlement of ₹${actualAmountInr} with Ref "${trxRef.trim()}"?`)) {
      return;
    }
    setSubmitting(true);
    setErrMsg(null);
    try {
      await callWalletAdminApi(`/admin/withdrawals/${detailData.request.id}/settle`, {
        method: 'POST',
        body: JSON.stringify({
          actualAmountPaise: Math.round(Number(actualAmountInr) * 100),
          paymentMethod: payMethod,
          transactionReference: trxRef.trim(),
          paymentDate: payDate,
          paymentTime: payTime,
          remarks: remarks.trim() || undefined,
        }),
      });
      setOkMsg(`Manual settlement recorded for ${detailData.request.id}.`);
      await openDetail(detailData.request.id);
      await loadAll();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Settlement recording failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {errMsg && <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: '#FEE2E2', color: '#991B1B', fontWeight: 600 }}>{errMsg}</div>}
      {okMsg && <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: '#DCFCE7', color: '#166534', fontWeight: 600 }}>{okMsg}</div>}

      {/* KPI Summary Cards */}
      <div className="kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '12px' }}>
        <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Total Requests</span><span className="kpi-main-number">{kpis.totalRequests}</span></div></div>
        <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Pending Admin Settlement</span><span className="kpi-main-number" style={{ color: '#B45309' }}>{kpis.pendingCount}</span></div></div>
        <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Total Amount Pending</span><span className="kpi-main-number">{formatInr(kpis.pendingAmountInr)}</span></div></div>
        <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Settled This Week</span><span className="kpi-main-number" style={{ color: '#15803D' }}>{formatInr(kpis.settledWeekInr)}</span></div></div>
        <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">Failed / Needs Review</span><span className="kpi-main-number" style={{ color: '#B91C1C' }}>{kpis.failedCount}</span></div></div>
        <div className="kpi-card-modern"><div className="kpi-body"><span className="kpi-title">On Hold Requests</span><span className="kpi-main-number">{kpis.onHoldCount}</span></div></div>
      </div>

      {/* Tabs + Controls */}
      <div className="chart-card-modern">
        <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 className="card-top-title">Phlebo Withdrawals &amp; Manual Bank/UPI Settlement</h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              7-Day Cycle • Min Withdrawal: {formatInr((config?.minWithdrawalPaise ?? 10000) / 100)} • All settlements are ADMIN_RECORDED with mandatory UTR
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={exportCsv}>⬇ Export CSV</button>
            <button type="button" className="btn-secondary" onClick={() => void loadAll()}>↻ Refresh</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {(['ALL', 'PENDING', 'PROCESSING', 'SETTLED', 'ON_HOLD', 'REJECTED', 'FAILED'] as TabKey[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? 'btn-primary' : 'btn-secondary'}
              onClick={() => { setTab(t); setPage(1); }}
            >
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: '240px' }}
            placeholder="Search Phlebo, Request ID, UTR..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <input
            type="date"
            className="form-input"
            style={{ maxWidth: '155px' }}
            value={dateFilter}
            onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
          />
          <select className="form-input" style={{ maxWidth: '175px' }} value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="DATE_DESC">Newest First</option>
            <option value="DATE_ASC">Oldest First</option>
            <option value="AMT_DESC">Amount: High to Low</option>
            <option value="AMT_ASC">Amount: Low to High</option>
          </select>
        </div>

        {loading && requests.length === 0 ? (
          <p>Loading withdrawal requests...</p>
        ) : (
          <div className="data-table-container">
            <table className="modern-data-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Phlebo</th>
                  <th>Amount</th>
                  <th>Method &amp; Destination</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '18px', color: '#64748B' }}>No withdrawal requests found.</td></tr>
                ) : paged.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.id}</strong></td>
                    <td>
                      <strong>{r.phleboName}</strong>
                      <div style={{ fontSize: '0.73rem', color: '#64748B' }}>{r.phleboId} {r.phleboPhone ? `• ${r.phleboPhone}` : ''}</div>
                    </td>
                    <td><strong>{formatInr(r.requestedAmountPaise / 100)}</strong></td>
                    <td>
                      <div>{r.paymentMethod} ({r.bankVerificationStatus})</div>
                      <div style={{ fontSize: '0.73rem', color: '#475569' }}>{r.maskedDestination}</div>
                    </td>
                    <td>
                      <span className={r.status === 'MANUAL_PAID' ? 'status-pill-green' : 'status-pill-amber'}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.76rem' }}>{new Date(r.requestedAt).toLocaleString('en-IN')}</td>
                    <td>
                      <button type="button" className="btn-primary" onClick={() => void openDetail(r.id)}>
                        {r.status === 'MANUAL_PAID' ? 'View Receipt' : 'Review & Settle'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748B' }}>Page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
              <button type="button" className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Reconciliation Summary */}
      {recon && (
        <div className="chart-card-modern">
          <h3 className="card-top-title">⚖️ Wallet &amp; Settlement Reconciliation ({recon.totalWalletsChecked} Wallets Checked)</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '8px', fontSize: '0.85rem' }}>
            <span>Mismatched Wallets: <strong style={{ color: recon.mismatchedWallets.length ? '#B91C1C' : '#15803D' }}>{recon.mismatchedWallets.length}</strong></span>
            <span>Duplicate UTRs: <strong style={{ color: recon.duplicateUtrs.length ? '#B91C1C' : '#15803D' }}>{recon.duplicateUtrs.length}</strong></span>
            <span>Orphaned Withdrawals: <strong style={{ color: recon.orphanedWithdrawals.length ? '#B91C1C' : '#15803D' }}>{recon.orphanedWithdrawals.length}</strong></span>
            <span>Recorded Manual Settlements: <strong>{settlements.length}</strong></span>
          </div>
        </div>
      )}

      {/* Settlement Detail Modal */}
      {selectedId && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', maxWidth: '720px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Withdrawal Settlement Detail — {selectedId}</h2>
              <button type="button" className="btn-secondary" onClick={() => { setSelectedId(null); setDetailData(null); }}>✕ Close</button>
            </div>

            {detailLoading || !detailData ? (
              <p>Loading beneficiary &amp; wallet details...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <strong>Beneficiary Information ({detailData.request.beneficiaryType === 'LARGE_LAB' ? 'Large Reference Lab' : 'Phlebotomist'})</strong>
                    <div style={{ fontSize: '0.84rem', marginTop: '6px' }}>
                      <div>Name: {detailData.request.beneficiaryName || detailData.request.phleboName}</div>
                      <div>ID: {detailData.request.beneficiaryId || detailData.request.phleboId}</div>
                      <div>Mobile: {detailData.request.phleboPhone || 'N/A'}</div>
                      <div>Payout Profile Version: <strong>v{detailData.request.payoutProfileVersion || detailData.payoutProfile.profileVersion || 1}</strong></div>
                    </div>
                  </div>
                  <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <strong>Withdrawal Information</strong>
                    <div style={{ fontSize: '0.84rem', marginTop: '6px' }}>
                      <div>Requested: <strong>{formatInr(detailData.request.requestedAmountPaise / 100)}</strong></div>
                      <div>Balance Before: {formatInr(detailData.request.availableBalanceBeforePaise / 100)}</div>
                      <div>Status: <strong>{detailData.request.status}</strong></div>
                      <div>Requested At: {new Date(detailData.request.requestedAt).toLocaleString('en-IN')}</div>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#F0FDFA', border: '1px solid #99F6E4' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <strong>Verified Beneficiary Payment Details (v{detailData.payoutProfile.profileVersion || detailData.request.payoutProfileVersion || 1})</strong>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                      disabled={revealingSensitive}
                      onClick={() => {
                        void (async () => {
                          setRevealingSensitive(true);
                          try {
                            const full = await callWalletAdminApi<typeof detailData>(`/admin/withdrawals/${selectedId}?reveal=1`);
                            setDetailData(full);
                          } finally {
                            setRevealingSensitive(false);
                          }
                        })();
                      }}
                    >
                      {revealingSensitive ? 'Decrypting...' : detailData.sensitiveDetails ? '🔓 Full Details Revealed (Audited)' : '🔒 Reveal Full Details (Audited)'}
                    </button>
                  </div>
                  <div style={{ fontSize: '0.84rem', marginTop: '8px', display: 'grid', gap: '4px' }}>
                    <div>Preferred Method: <strong>{detailData.payoutProfile.defaultMethod}</strong></div>
                    {detailData.payoutProfile.bankAccount && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <BankLogo
                          bankCode={detailData.payoutProfile.bankAccount.bankCode}
                          ifsc={detailData.payoutProfile.bankAccount.ifsc}
                          bankName={detailData.payoutProfile.bankAccount.bankName}
                          size={32}
                        />
                        <span>
                          {detailData.payoutProfile.bankAccount.bankName} ({detailData.payoutProfile.bankAccount.branchName}) •{' '}
                          <strong>{detailData.sensitiveDetails?.accountNumber || detailData.payoutProfile.bankAccount.maskedAccountNumber}</strong> •{' '}
                          IFSC: {detailData.payoutProfile.bankAccount.ifsc} ({detailData.payoutProfile.bankAccount.accountHolderName}) [{detailData.payoutProfile.bankAccount.verificationStatus}]
                        </span>
                      </div>
                    )}
                    {detailData.payoutProfile.upiAccount && (
                      <div>
                        UPI: <strong>{detailData.sensitiveDetails?.upiId || detailData.payoutProfile.upiAccount.maskedUpiId}</strong> [{detailData.payoutProfile.upiAccount.verificationStatus}]
                      </div>
                    )}
                    {detailData.qrAccess.available && (detailData.qrAccess.signedUrl || detailData.qrAccess.dataUrl) && (
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#0F766E', fontWeight: 700 }}>
                          Private Verified UPI QR ({detailData.payoutProfile.qrCode?.consistencyStatus || 'VERIFIED'}):
                        </div>
                        <img
                          src={detailData.qrAccess.signedUrl || detailData.qrAccess.dataUrl}
                          alt="Beneficiary UPI QR"
                          style={{ width: '140px', height: '140px', objectFit: 'contain', marginTop: '4px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', padding: '4px' }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {detailData.settlement ? (
                  <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#DCFCE7', border: '1px solid #86EFAC' }}>
                    <strong>✅ Manual Settlement Recorded ({detailData.settlement.referenceSource})</strong>
                    <div style={{ fontSize: '0.84rem', marginTop: '6px' }}>
                      <div>Settlement ID: {detailData.settlement.id}</div>
                      <div>Method: {detailData.settlement.paymentMethod} • Ref: {detailData.settlement.transactionReference}</div>
                      <div>Date/Time: {detailData.settlement.paymentDate} {detailData.settlement.paymentTime}</div>
                      <div>Recorded By: {detailData.settlement.recordedBy}</div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Lifecycle buttons */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      <button type="button" className="btn-secondary" disabled={submitting} onClick={() => void handleLifecycleAction('review')}>Mark Under Review</button>
                      <button type="button" className="btn-secondary" disabled={submitting} onClick={() => void handleLifecycleAction('process')}>Start Manual Transfer</button>
                      <button type="button" className="btn-secondary" disabled={submitting} onClick={() => void handleLifecycleAction('hold')}>Put On Hold</button>
                      <button type="button" className="btn-secondary" style={{ color: '#B91C1C' }} disabled={submitting} onClick={() => void handleLifecycleAction('reject')}>Reject &amp; Release Funds</button>
                    </div>

                    {/* Manual Settlement Form */}
                    {!['REJECTED', 'CANCELLED'].includes(detailData.request.status) && (
                      <div style={{ padding: '14px', borderRadius: '12px', border: '1.5px solid #0D9488', backgroundColor: '#FFFFFF' }}>
                        <strong>Record External Bank / UPI Settlement (ADMIN_RECORDED)</strong>
                        <p style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '2px' }}>
                          Transfer the exact amount via your approved bank/UPI app first, then record the verified UTR below.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '10px' }}>
                          <div>
                            <label className="form-label">Payment Method *</label>
                            <select className="form-input" value={payMethod} onChange={(e) => setPayMethod(e.target.value as ManualPaymentMethod)}>
                              <option value="UPI">UPI</option>
                              <option value="IMPS">IMPS</option>
                              <option value="NEFT">NEFT</option>
                              <option value="RTGS">RTGS</option>
                              <option value="OTHER_BANK_TRANSFER">Other Bank Transfer</option>
                            </select>
                          </div>
                          <div>
                            <label className="form-label">Actual Amount (₹) *</label>
                            <input type="number" className="form-input" value={actualAmountInr} onChange={(e) => setActualAmountInr(e.target.value)} />
                          </div>
                          <div>
                            <label className="form-label">UTR / Bank Ref ID *</label>
                            <input type="text" className="form-input" placeholder="e.g. 432198765432" value={trxRef} onChange={(e) => setTrxRef(e.target.value)} />
                          </div>
                          <div>
                            <label className="form-label">Payment Date *</label>
                            <input type="date" className="form-input" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                          </div>
                          <div>
                            <label className="form-label">Payment Time *</label>
                            <input type="time" className="form-input" value={payTime} onChange={(e) => setPayTime(e.target.value)} />
                          </div>
                          <div>
                            <label className="form-label">Remarks (Optional)</label>
                            <input type="text" className="form-input" placeholder="Settled via HDFC" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                          </div>
                        </div>
                        <button type="button" className="btn-primary" style={{ marginTop: '12px' }} disabled={submitting} onClick={() => void handleManualSettle()}>
                          {submitting ? 'Saving Settlement...' : '✓ Confirm & Mark as MANUAL_PAID'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
