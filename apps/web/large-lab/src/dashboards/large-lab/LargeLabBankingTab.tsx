import { LargeLabBankingPayoutCard } from './LargeLabBankingPayoutCard';

export interface LargeLabBankingTabProps {
  onOpenWallet: () => void;
}

export function LargeLabBankingTab({ onOpenWallet }: LargeLabBankingTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '860px' }}>
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
          gap: '14px',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
            Banking &amp; Payout Settings
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#CBD5E1' }}>
            Configure your verified Bank Account, UPI ID, and Private UPI QR Code for automatic settlements.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={onOpenWallet}>
          💰 Open Wallet &amp; Payouts
        </button>
      </div>

      <LargeLabBankingPayoutCard />
    </div>
  );
}
