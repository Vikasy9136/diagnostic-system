import { useState } from 'react';
import { type CredentialSlipData } from '../../dashboards/types';
import { ModalFrame } from './ModalFrame';

export interface CredentialSlipModalProps {
  slip: CredentialSlipData | null;
  onClose: () => void;
}

export function CredentialSlipModal({ slip, onClose }: CredentialSlipModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function handleCopy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
    } catch {
      // Clipboard blocked silently
    }
  }

  if (!slip) return null;

  const canCopyAll = Boolean(slip.initialPassword && slip.email);

  return (
    <ModalFrame
      open={Boolean(slip)}
      onClose={onClose}
      title={slip.title || 'Credentials Ready'}
      maxWidth="520px"
      footer={
        <>
          {canCopyAll && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                void handleCopy(
                  'all',
                  `LabSetu Portal Access\nName: ${slip.name}\nRole: ${slip.roleLabel}\nAssigned ID: ${slip.userCode}\nEmail: ${slip.email}\nInitial Password: ${slip.initialPassword}`
                )
              }
            >
              {copiedKey === 'all' ? 'Copied Bundle' : 'Copy All'}
            </button>
          )}
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '0.85rem', color: '#0F766E', fontWeight: 600 }}>
          {slip.headline || `${slip.name} (${slip.roleLabel}) is provisioned cleanly.`}
        </div>

        <div
          style={{
            background: '#F8FAFC',
            border: '1px solid #CBD5E1',
            borderRadius: '10px',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '0.82rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <span>
              {slip.assignedIdLabel || 'Assigned ID'}: <strong>{slip.userCode}</strong>
            </span>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '3px 9px', fontSize: '0.72rem' }}
              onClick={() => void handleCopy('id', slip.userCode)}
            >
              {copiedKey === 'id' ? 'Copied' : 'Copy ID'}
            </button>
          </div>

          {slip.email && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <span>
                Login Email: <strong>{slip.email}</strong>
              </span>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '3px 9px', fontSize: '0.72rem' }}
                onClick={() => void handleCopy('email', slip.email || '')}
              >
                {copiedKey === 'email' ? 'Copied' : 'Copy Email'}
              </button>
            </div>
          )}

          {slip.subInfo && <div style={{ color: '#475569' }}>{slip.subInfo}</div>}

          {slip.initialPassword ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                borderTop: '1px dashed #CBD5E1',
                paddingTop: '8px',
              }}
            >
              <span>
                Initial Password: <code>{slip.initialPassword}</code>
              </span>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '3px 9px', fontSize: '0.72rem' }}
                onClick={() => void handleCopy('pwd', slip.initialPassword || '')}
              >
                {copiedKey === 'pwd' ? 'Copied' : 'Copy Password'}
              </button>
            </div>
          ) : (
            <div
              style={{
                color: '#64748B',
                fontSize: '0.78rem',
                borderTop: '1px dashed #CBD5E1',
                paddingTop: '8px',
              }}
            >
              {slip.noPasswordMessage ||
                'No initial password set — user can sign in with Google Sign-In or Email OTP (or use Reset Password anytime).'}
            </div>
          )}
        </div>

        {slip.initialPassword && (
          <div style={{ fontSize: '0.75rem', color: '#B45309' }}>
            Copy this credential slip now — plaintext passwords are never saved to database tables after creation.
          </div>
        )}
      </div>
    </ModalFrame>
  );
}

