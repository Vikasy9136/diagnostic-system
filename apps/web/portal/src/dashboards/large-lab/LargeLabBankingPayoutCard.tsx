import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  getBankBrandMeta,
  type IfscLookupResult,
  type PhleboPaymentMethodSummary,
} from '@diagnostic/shared';
import { API_BASE_URL, auth } from '../../firebase';

async function callLargeLabFinanceApi<T>(path: string, init: RequestInit = {}): Promise<T> {
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

function statusPill(status?: string) {
  if (status === 'VERIFIED') return { bg: '#DCFCE7', fg: '#166534', label: 'Verified' };
  if (status === 'REVERIFICATION_REQUIRED') return { bg: '#FEF3C7', fg: '#92400E', label: 'Re-verification Required' };
  if (status === 'PENDING_VERIFICATION') return { bg: '#E0F2FE', fg: '#0369A1', label: 'Pending Verification' };
  if (status === 'FAILED') return { bg: '#FEE2E2', fg: '#991B1B', label: 'Failed' };
  return { bg: '#F1F5F9', fg: '#475569', label: 'Unverified' };
}

export function LargeLabBankingPayoutCard() {
  const [summary, setSummary] = useState<PhleboPaymentMethodSummary | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeEditor, setActiveEditor] = useState<'NONE' | 'BANK' | 'UPI'>('NONE');
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Bank form
  const [holderName, setHolderName] = useState('');
  const [ifscInput, setIfscInput] = useState('');
  const [ifscInfo, setIfscInfo] = useState<IfscLookupResult | null>(null);
  const [ifscLoading, setIfscLoading] = useState(false);
  const [acctNum, setAcctNum] = useState('');
  const [confirmAcctNum, setConfirmAcctNum] = useState('');
  const [savingBank, setSavingBank] = useState(false);

  // UPI form
  const [upiInput, setUpiInput] = useState('');
  const [confirmUpiInput, setConfirmUpiInput] = useState('');
  const [savingUpi, setSavingUpi] = useState(false);

  // QR upload
  const [qrBusy, setQrBusy] = useState(false);
  const [decodedQrUriInput, setDecodedQrUriInput] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [profileData, qrData] = await Promise.all([
        callLargeLabFinanceApi<PhleboPaymentMethodSummary>('/large-lab/payout-profile'),
        callLargeLabFinanceApi<{ available: boolean; signedUrl?: string; dataUrl?: string }>('/large-lab/payout-profile/qr').catch(
          (): { available: boolean; signedUrl?: string; dataUrl?: string } => ({ available: false })
        ),
      ]);
      setSummary(profileData);
      setQrPreviewUrl(qrData?.available ? qrData.signedUrl || qrData.dataUrl || null : null);
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Unable to load Banking & Payout Settings.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleLookupIfsc(raw?: string) {
    const clean = (raw ?? ifscInput).trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean)) {
      setIfscInfo(null);
      return;
    }
    setIfscLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
      const v1Base = base.endsWith('/api/v1') ? base : `${base.replace(/\/api$/, '')}/api/v1`;
      const res = await fetch(`${v1Base}/phlebo-payouts/ifsc/${encodeURIComponent(clean)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = (await res.json()) as { success?: boolean; data?: IfscLookupResult; message?: string };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || 'IFSC not found');
      }
      setIfscInfo(json.data);
    } catch (err) {
      setIfscInfo(null);
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'IFSC lookup failed.' });
    } finally {
      setIfscLoading(false);
    }
  }

  async function handleSaveBank(e: FormEvent) {
    e.preventDefault();
    setStatusMsg(null);
    setSavingBank(true);
    try {
      const data = await callLargeLabFinanceApi<PhleboPaymentMethodSummary>('/large-lab/payout-profile', {
        method: 'POST',
        body: JSON.stringify({
          type: 'BANK_ACCOUNT',
          accountHolderName: holderName.trim(),
          accountNumber: acctNum.replace(/\s+/g, ''),
          confirmAccountNumber: confirmAcctNum.replace(/\s+/g, ''),
          ifscCode: ifscInput.trim().toUpperCase(),
          selectedBankCode: ifscInfo?.bankCode,
          makeDefault: true,
        }),
      });
      setSummary(data);
      setActiveEditor('NONE');
      setAcctNum('');
      setConfirmAcctNum('');
      setStatusMsg({ type: 'ok', text: `Bank account verified & encrypted (Profile v${data.profileVersion || 1}).` });
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Unable to save bank account.' });
    } finally {
      setSavingBank(false);
    }
  }

  async function handleSaveUpi(e: FormEvent) {
    e.preventDefault();
    setStatusMsg(null);
    setSavingUpi(true);
    try {
      const data = await callLargeLabFinanceApi<PhleboPaymentMethodSummary>('/large-lab/payout-profile', {
        method: 'POST',
        body: JSON.stringify({
          type: 'UPI',
          upiId: upiInput.trim().toLowerCase(),
          confirmUpiId: confirmUpiInput.trim().toLowerCase(),
          makeDefault: summary?.defaultMethod === 'NONE',
        }),
      });
      setSummary(data);
      setActiveEditor('NONE');
      setUpiInput('');
      setConfirmUpiInput('');
      setStatusMsg({ type: 'ok', text: `UPI ID verified & encrypted (Profile v${data.profileVersion || 1}).` });
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Unable to save UPI ID.' });
    } finally {
      setSavingUpi(false);
    }
  }

  async function handleSetDefault(method: 'BANK_ACCOUNT' | 'UPI') {
    setStatusMsg(null);
    try {
      const data = await callLargeLabFinanceApi<PhleboPaymentMethodSummary>('/large-lab/payout-profile', {
        method: 'POST',
        body: JSON.stringify({ type: 'SET_DEFAULT', defaultMethod: method }),
      });
      setSummary(data);
      setStatusMsg({ type: 'ok', text: `Preferred payout method set to ${method === 'BANK_ACCOUNT' ? 'Bank Account' : 'UPI'}.` });
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Unable to update default method.' });
    }
  }

  async function handleQrUpload(file: File | undefined) {
    if (!file) return;
    setStatusMsg(null);
    setQrBusy(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
        reader.onerror = () => reject(new Error('Failed to read QR file.'));
        reader.readAsDataURL(file);
      });
      const data = await callLargeLabFinanceApi<PhleboPaymentMethodSummary>('/large-lab/payout-profile/qr', {
        method: 'POST',
        body: JSON.stringify({
          mimeType: file.type || 'image/png',
          base64Data,
          source: 'UPLOADED',
          decodedUpiUri: decodedQrUriInput.trim() || undefined,
        }),
      });
      setSummary(data);
      await loadAll();
      setStatusMsg({ type: 'ok', text: 'UPI QR uploaded to private encrypted storage.' });
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'QR upload failed.' });
    } finally {
      setQrBusy(false);
    }
  }

  async function handleDeleteQr() {
    if (!window.confirm('Delete your saved UPI QR code from private storage?')) return;
    setStatusMsg(null);
    setQrBusy(true);
    try {
      const data = await callLargeLabFinanceApi<PhleboPaymentMethodSummary>('/large-lab/payout-profile/qr', {
        method: 'DELETE',
      });
      setSummary(data);
      setQrPreviewUrl(null);
      setStatusMsg({ type: 'ok', text: 'UPI QR code deleted.' });
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Unable to delete QR.' });
    } finally {
      setQrBusy(false);
    }
  }

  const bankMeta = getBankBrandMeta(summary?.bankAccount?.bankCode || summary?.bankAccount?.ifsc);
  const bankStatus = statusPill(summary?.bankAccount?.verificationStatus);
  const upiStatus = statusPill(summary?.upiAccount?.verificationStatus);
  const qrStatus = statusPill(summary?.qrCode?.verificationStatus);

  return (
    <div className="chart-card-modern" style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
        <div>
          <h3 className="card-top-title" style={{ margin: 0 }}>
            Banking &amp; Payout Settings
          </h3>
          <p className="card-top-sub" style={{ margin: '2px 0 0 0' }}>
            Encrypted Bank Account, UPI ID &amp; Private UPI QR Code (Profile v{summary?.profileVersion || 1})
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={summary?.defaultMethod === 'BANK_ACCOUNT' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => void handleSetDefault('BANK_ACCOUNT')}
          >
            🏦 Bank {summary?.defaultMethod === 'BANK_ACCOUNT' ? '(Preferred)' : ''}
          </button>
          <button
            type="button"
            className={summary?.defaultMethod === 'UPI' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => void handleSetDefault('UPI')}
          >
            ⚡ UPI {summary?.defaultMethod === 'UPI' ? '(Preferred)' : ''}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '10px',
            marginBottom: '12px',
            background: statusMsg.type === 'ok' ? '#DCFCE7' : '#FEE2E2',
            color: statusMsg.type === 'ok' ? '#166534' : '#991B1B',
            fontSize: '0.84rem',
            fontWeight: 600,
          }}
        >
          {statusMsg.text}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#64748B', fontSize: '0.85rem' }}>Loading encrypted payout profile...</p>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          {/* 1. Bank Account */}
          <div style={{ padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {summary?.bankAccount && (
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: '8px',
                      background: bankMeta.accentColor,
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '0.72rem',
                    }}
                  >
                    {bankMeta.shortName}
                  </span>
                )}
                <strong style={{ fontSize: '0.92rem' }}>1. Bank Account</strong>
              </div>
              <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, background: bankStatus.bg, color: bankStatus.fg }}>
                {bankStatus.label}
              </span>
            </div>

            {summary?.bankAccount ? (
              <div style={{ marginTop: '8px', fontSize: '0.84rem', color: '#1E293B' }}>
                <div><strong>{summary.bankAccount.bankName}</strong> • {summary.bankAccount.maskedAccountNumber}</div>
                <div style={{ color: '#475569' }}>
                  {summary.bankAccount.accountHolderName} • IFSC: {summary.bankAccount.ifsc} ({summary.bankAccount.branchName})
                </div>
              </div>
            ) : (
              <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>No bank account added yet.</p>
            )}

            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: '10px', fontSize: '0.78rem', padding: '6px 12px' }}
              onClick={() => setActiveEditor(activeEditor === 'BANK' ? 'NONE' : 'BANK')}
            >
              {activeEditor === 'BANK' ? 'Close Bank Form' : summary?.bankAccount ? '✎ Edit / Replace Bank Account' : '+ Add Bank Account'}
            </button>

            {activeEditor === 'BANK' && (
              <form onSubmit={(e) => void handleSaveBank(e)} style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #CBD5E1', display: 'grid', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px' }}>
                  <input
                    className="form-input"
                    placeholder="IFSC Code (e.g. HDFC0000123)"
                    maxLength={11}
                    value={ifscInput}
                    onChange={(e) => {
                      const up = e.target.value.toUpperCase();
                      setIfscInput(up);
                      if (up.length === 11) void handleLookupIfsc(up);
                    }}
                    required
                  />
                  <button type="button" className="btn-secondary" disabled={ifscLoading} onClick={() => void handleLookupIfsc()}>
                    {ifscLoading ? 'Checking...' : 'Verify IFSC'}
                  </button>
                </div>
                {ifscInfo && (
                  <div style={{ padding: '8px 10px', borderRadius: '8px', background: '#ECFDF5', color: '#065F46', fontSize: '0.78rem' }}>
                    ✓ <strong>{ifscInfo.bank}</strong> — {ifscInfo.branch} ({ifscInfo.city}, {ifscInfo.state})
                  </div>
                )}
                <input
                  className="form-input"
                  placeholder="Account Holder / Lab Legal Name"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  required
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input
                    className="form-input"
                    type="password"
                    placeholder="Bank Account Number"
                    value={acctNum}
                    onChange={(e) => setAcctNum(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                  <input
                    className="form-input"
                    placeholder="Confirm Account Number"
                    value={confirmAcctNum}
                    onChange={(e) => setConfirmAcctNum(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={savingBank}>
                  {savingBank ? 'Encrypting & Saving...' : '🔒 Save & Verify Bank Account'}
                </button>
              </form>
            )}
          </div>

          {/* 2. UPI ID */}
          <div style={{ padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.92rem' }}>2. UPI ID</strong>
              <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, background: upiStatus.bg, color: upiStatus.fg }}>
                {upiStatus.label}
              </span>
            </div>
            {summary?.upiAccount ? (
              <div style={{ marginTop: '8px', fontSize: '0.84rem', color: '#1E293B' }}>
                Saved UPI: <strong>{summary.upiAccount.maskedUpiId}</strong> (@{summary.upiAccount.vpaHandle})
              </div>
            ) : (
              <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>No UPI ID added yet.</p>
            )}
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: '10px', fontSize: '0.78rem', padding: '6px 12px' }}
              onClick={() => setActiveEditor(activeEditor === 'UPI' ? 'NONE' : 'UPI')}
            >
              {activeEditor === 'UPI' ? 'Close UPI Form' : summary?.upiAccount ? '✎ Edit / Replace UPI ID' : '+ Add UPI ID'}
            </button>

            {activeEditor === 'UPI' && (
              <form onSubmit={(e) => void handleSaveUpi(e)} style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #CBD5E1', display: 'grid', gap: '8px' }}>
                <input
                  className="form-input"
                  placeholder="Enter UPI ID (e.g. metrolab@icici)"
                  value={upiInput}
                  onChange={(e) => setUpiInput(e.target.value)}
                  required
                />
                <input
                  className="form-input"
                  placeholder="Confirm UPI ID"
                  value={confirmUpiInput}
                  onChange={(e) => setConfirmUpiInput(e.target.value)}
                  required
                />
                <button type="submit" className="btn-primary" disabled={savingUpi}>
                  {savingUpi ? 'Encrypting & Saving...' : '🔒 Save & Verify UPI ID'}
                </button>
              </form>
            )}
          </div>

          {/* 3. UPI QR Code */}
          <div style={{ padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <strong style={{ fontSize: '0.92rem' }}>3. UPI QR Code (Private Encrypted Storage)</strong>
              <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, background: qrStatus.bg, color: qrStatus.fg }}>
                {summary?.qrCode?.available ? `${qrStatus.label} • ${summary.qrCode.consistencyStatus}` : 'Not Uploaded'}
              </span>
            </div>

            {qrPreviewUrl && (
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <img
                  src={qrPreviewUrl}
                  alt="Saved UPI QR"
                  style={{ width: 112, height: 112, objectFit: 'contain', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#FFFFFF', padding: 4 }}
                />
                <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                  <div>Source: <strong>{summary?.qrCode?.source || 'UPLOADED'}</strong></div>
                  {summary?.qrCode?.decodedUpiId && <div>Decoded Payee: {summary.qrCode.decodedUpiId}</div>}
                  <div>Consistency: <strong>{summary?.qrCode?.consistencyStatus}</strong></div>
                </div>
              </div>
            )}

            <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
              <input
                className="form-input"
                placeholder="Optional: Decoded UPI URI (upi://pay?pa=...) to check payee match"
                value={decodedQrUriInput}
                onChange={(e) => setDecodedQrUriInput(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <label className="btn-secondary" style={{ cursor: 'pointer', fontSize: '0.78rem', padding: '6px 12px' }}>
                  {qrBusy ? 'Uploading...' : summary?.qrCode?.available ? '🔄 Replace UPI QR' : '📷 Upload UPI QR'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    disabled={qrBusy}
                    onChange={(e) => void handleQrUpload(e.target.files?.[0])}
                  />
                </label>
                {summary?.qrCode?.available && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ color: '#B91C1C', fontSize: '0.78rem', padding: '6px 12px' }}
                    disabled={qrBusy}
                    onClick={() => void handleDeleteQr()}
                  >
                    🗑️ Delete QR
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
