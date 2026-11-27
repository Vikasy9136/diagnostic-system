import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  formatInr,
  type PhleboPaymentMethodSummary,
  type PhleboWallet,
  type WalletTransaction,
  type WithdrawalConfig,
  type WithdrawalRequest,
} from '@diagnostic/shared';
import { API_BASE_URL, auth } from '../../firebase';

export interface LargeLabWalletTabProps {
  onOpenSettings: () => void;
}

async function callWalletApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const base = (API_BASE_URL || '/api/v1').replace(/\/+$/, '');
  const root = base.endsWith('/api/v1') ? base : `${base}/api/v1`;
  const res = await fetch(`${root}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message || json?.message || `Request failed (${res.status})`);
  }
  return json.data as T;
}

export function LargeLabWalletTab({ onOpenSettings }: LargeLabWalletTabProps) {
  const [wallet, setWallet] = useState<PhleboWallet | null>(null);
  const [config, setConfig] = useState<WithdrawalConfig | null>(null);
  const [payoutProfile, setPayoutProfile] = useState<PhleboPaymentMethodSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [amountInr, setAmountInr] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'BANK_ACCOUNT' | 'UPI'>('BANK_ACCOUNT');
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadWalletData = useCallback(async () => {
    setLoading(true);
    try {
      const [wRes, txRes, wdRes, ppRes] = await Promise.all([
        callWalletApi<{ wallet: PhleboWallet; config: WithdrawalConfig }>('/large-lab/wallet'),
        callWalletApi<WalletTransaction[]>('/large-lab/wallet/transactions').catch(() => []),
        callWalletApi<WithdrawalRequest[]>('/large-lab/wallet/withdrawals').catch(() => []),
        callWalletApi<PhleboPaymentMethodSummary>('/large-lab/payout-profile').catch(() => null),
      ]);
      setWallet(wRes.wallet);
      setConfig(wRes.config);
      setTransactions(txRes || []);
      setWithdrawals(wdRes || []);
      setPayoutProfile(ppRes);
      if (ppRes?.defaultMethod === 'UPI') setPaymentMethod('UPI');
      else setPaymentMethod('BANK_ACCOUNT');
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load Large Lab wallet.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWalletData();
  }, [loadWalletData]);

  const availInr = (wallet?.availableBalancePaise || 0) / 100;
  const pendingInr = (wallet?.pendingWithdrawalPaise || 0) / 100;
  const settledInr = ((wallet as any)?.totalSettledPaise ?? 0) / 100;
  const totalEarnedInr = (wallet?.totalEarnedPaise || 0) / 100;
  const minInr = (config?.minWithdrawalPaise ?? 10000) / 100;

  async function handleRequestWithdrawal(e: FormEvent) {
    e.preventDefault();
    const num = Number(amountInr);
    if (!Number.isFinite(num) || num <= 0) {
      setBanner({ type: 'err', text: 'Enter a valid withdrawal amount in INR.' });
      return;
    }
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await callWalletApi<{ wallet: PhleboWallet; message: string }>(
        '/large-lab/wallet/withdrawals',
        {
          method: 'POST',
          body: JSON.stringify({
            requestedAmountPaise: Math.round(num * 100),
            paymentMethod,
          }),
        }
      );
      setWallet(res.wallet);
      setAmountInr('');
      setBanner({
        type: 'ok',
        text: res.message || 'Withdrawal request submitted for settlement.',
      });
      await loadWalletData();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Withdrawal request failed.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {/* Header Banner */}
      <div
        className="card"
        style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #061D42 0%, #0A2A5E 65%, #0D5E6B 100%)',
          color: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
            Large Lab Wallet &amp; Payouts
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#CBD5E1' }}>
            Your earnings are added automatically after completed bookings. Admin processes payouts in 3–7 business days.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void loadWalletData()}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : '🔄 Refresh Wallet'}
        </button>
      </div>

      {banner && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            backgroundColor: banner.type === 'ok' ? '#DCFCE7' : '#FEE2E2',
            border: `1px solid ${banner.type === 'ok' ? '#86EFAC' : '#FCA5A5'}`,
            color: banner.type === 'ok' ? '#15803D' : '#B91C1C',
            fontWeight: 600,
            fontSize: '0.88rem',
          }}
        >
          {banner.text}
        </div>
      )}

      {/* Automatic Balance Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
          gap: '14px',
          width: '100%',
          minWidth: 0,
        }}
      >
        <div className="card" style={{ padding: '16px', borderLeft: '4px solid #0D9488', minWidth: 0 }}>
          <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
            AVAILABLE BALANCE
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F766E', marginTop: '4px' }}>
            {formatInr(availInr)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
            Minimum withdrawal: {formatInr(minInr)}
          </div>
        </div>

        <div className="card" style={{ padding: '16px', borderLeft: '4px solid #D97706', minWidth: 0 }}>
          <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
            PENDING PAYOUT
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#B45309', marginTop: '4px' }}>
            {formatInr(pendingInr)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
            Admin processes payouts in 3–7 business days
          </div>
        </div>

        <div className="card" style={{ padding: '16px', borderLeft: '4px solid #16A34A', minWidth: 0 }}>
          <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
            TOTAL PAID
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>
            {formatInr(settledInr)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
            Sent to your Bank or UPI account
          </div>
        </div>

        <div className="card" style={{ padding: '16px', borderLeft: '4px solid #1E3A8A', minWidth: 0 }}>
          <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
            TOTAL EARNED
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
            {formatInr(totalEarnedInr)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
            Added automatically from bookings
          </div>
        </div>
      </div>

      {/* Linked Payout Method & Withdrawal Request */}
      <div className="card" style={{ padding: '20px', minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '14px',
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 240px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
              Withdraw Balance
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
              Payouts are sent to your Bank Account or UPI ID saved in Banking &amp; Payouts within 3–7 business days.
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={onOpenSettings}>
            🏦 Manage Bank &amp; UPI Settings
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            alignItems: 'center',
            padding: '12px 14px',
            background: '#F8FAFC',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            marginBottom: '14px',
          }}
        >
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
            Payout Destination:
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="llWithdrawMethod"
              checked={paymentMethod === 'BANK_ACCOUNT'}
              onChange={() => setPaymentMethod('BANK_ACCOUNT')}
            />
            Bank ({payoutProfile?.bankAccount?.maskedAccountNumber || 'Not Added'})
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="llWithdrawMethod"
              checked={paymentMethod === 'UPI'}
              onChange={() => setPaymentMethod('UPI')}
            />
            UPI ({payoutProfile?.upiAccount?.maskedUpiId || 'Not Added'})
          </label>
        </div>

        <form
          onSubmit={(e) => void handleRequestWithdrawal(e)}
          style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}
        >
          <input
            type="number"
            min={minInr}
            step="1"
            className="form-input"
            style={{ width: '180px' }}
            placeholder={`Amount ₹ (min ${minInr})`}
            value={amountInr}
            onChange={(e) => setAmountInr(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || availInr < minInr}
          >
            {submitting ? 'Submitting...' : 'Request Withdrawal'}
          </button>
          {availInr > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setAmountInr(String(Math.floor(availInr)))}
            >
              Withdraw Max ({formatInr(availInr)})
            </button>
          )}
        </form>
      </div>

      {/* Withdrawal Requests & Automatic Transaction Ledger */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        <div className="card" style={{ padding: '18px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.98rem', fontWeight: 800 }}>
            Withdrawal Requests ({withdrawals.length})
          </h3>
          {withdrawals.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748B' }}>
              No withdrawal requests submitted yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {withdrawals.slice(0, 10).map((w) => (
                <div
                  key={w.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.82rem',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{formatInr(w.requestedAmountPaise / 100)}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                      {w.id} • {w.paymentMethod}
                    </div>
                  </div>
                  <span className="badge badge-info">{w.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '18px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.98rem', fontWeight: 800 }}>
            Automatic Wallet Ledger ({transactions.length})
          </h3>
          {transactions.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748B' }}>
              Automatic credits and withdrawal debits will appear here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {transactions.slice(0, 12).map((tx) => (
                <div
                  key={tx.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.82rem',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{tx.description || tx.type}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                      {new Date(tx.createdAt).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <strong
                    style={{
                      color: (tx as any).direction === 'CREDIT' || String(tx.type || '').includes('CREDIT') ? '#15803D' : '#B91C1C',
                    }}
                  >
                    {(tx as any).direction === 'CREDIT' || String(tx.type || '').includes('CREDIT') ? '+' : '-'}
                    {formatInr(tx.amountPaise / 100)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
