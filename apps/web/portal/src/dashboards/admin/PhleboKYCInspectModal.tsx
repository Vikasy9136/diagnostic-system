import { useState } from 'react';
import { type PhlebotomistProfile } from '@diagnostic/shared';
import { ModalFrame } from '../../components/shared';

export interface PhleboKYCInspectModalProps {
  open: boolean;
  phlebo: PhlebotomistProfile | null;
  onClose: () => void;
  onVerify?: (phleboId: string) => Promise<void> | void;
  onOpenSetPassword?: (phlebo: PhlebotomistProfile) => void;
}

export function PhleboKYCInspectModal({
  open,
  phlebo,
  onClose,
  onVerify,
  onOpenSetPassword,
}: PhleboKYCInspectModalProps) {
  const [verifying, setVerifying] = useState(false);

  if (!open || !phlebo) return null;

  const isVerified = phlebo.verified && phlebo.verificationStatus === 'VERIFIED';
  const docs = phlebo.documents || [];

  async function handleVerifyClick() {
    if (!onVerify || !phlebo) return;
    const confirmVerify = window.confirm(
      `Approve and verify ${phlebo.name} (${phlebo.userCode || phlebo.id})?\n\nThis will mark their profile VERIFIED and automatically dispatch account credentials and mobile app login instructions to ${phlebo.email}.`
    );
    if (!confirmVerify) return;

    setVerifying(true);
    try {
      await onVerify(phlebo.id);
      onClose();
    } finally {
      setVerifying(false);
    }
  }

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      title={`Phlebotomist Verification: ${phlebo.name}`}
      subtitle={`${phlebo.userCode || phlebo.id} • Registered Email: ${phlebo.email}`}
      maxWidth="700px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Top Header Card */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1E40AF 0%, #1D4ED8 100%)',
            color: '#FFFFFF',
            padding: '16px 20px',
            borderRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {phlebo.livePhotoUrl ? (
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '3px solid #FFFFFF',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}
              >
                <img
                  src={phlebo.livePhotoUrl}
                  alt={phlebo.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            ) : (
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.8rem',
                }}
              >
                👤
              </div>
            )}
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{phlebo.name}</h2>
              <div style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: '2px' }}>
                Courier ID: <strong>{phlebo.userCode || phlebo.id}</strong> • Phone: {phlebo.phone || '—'}
              </div>
              <div style={{ fontSize: '0.74rem', opacity: 0.85, marginTop: '2px' }}>
                Zone: {phlebo.assignedZoneName || phlebo.assignedCity || phlebo.currentLocation || 'Zone Pending'}
              </div>
            </div>
          </div>

          <div>
            <span
              style={{
                background: isVerified ? '#10B981' : '#F59E0B',
                color: '#FFFFFF',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{isVerified ? '✓' : '⏳'}</span>
              {isVerified ? 'VERIFIED' : 'PENDING VERIFICATION'}
            </span>
          </div>
        </div>

        {/* Live Photo Inspection Section */}
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
          <strong style={{ fontSize: '0.85rem', color: '#1E293B', display: 'block', marginBottom: '8px' }}>
            📸 Live Browser Camera Selfie Verification
          </strong>
          {phlebo.livePhotoUrl ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '130px',
                  height: '130px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  border: '2px solid #0D9488',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                }}
              >
                <img
                  src={phlebo.livePhotoUrl}
                  alt="Live Camera Snapshot"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F766E' }}>
                  ✓ Live Camera Captured
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '4px', maxWidth: '380px' }}>
                  This portrait was captured live via browser webcam at onboarding for identity and KYC compliance.
                </div>
                <a
                  href={phlebo.livePhotoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ marginTop: '8px', fontSize: '0.74rem', padding: '4px 10px', display: 'inline-block' }}
                >
                  🔍 View Full-Size Photo
                </a>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: '#EF4444', background: '#FEF2F2', padding: '10px', borderRadius: '6px' }}>
              ⚠️ Missing Live Camera Selfie. Live photo must be captured before verification can be approved.
            </div>
          )}
        </div>

        {/* Phlebotomist Vehicle & Identity KYC Overview */}
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
          <strong style={{ fontSize: '0.85rem', color: '#1E293B', display: 'block', marginBottom: '10px' }}>
            🚗 Vehicle &amp; Identity Verification Dossier
          </strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>DRIVING LICENSE (DL)</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                {phlebo.dlNumber || 'Pending Submission'}
              </div>
              {phlebo.dlDocumentUrl && (
                <a href={phlebo.dlDocumentUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: '#0D9488', fontWeight: 700, display: 'inline-block', marginTop: '2px' }}>
                  View DL Document ↗
                </a>
              )}
            </div>

            <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>VEHICLE REGISTRATION (RC)</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                {phlebo.vehicleNumber || 'Pending'} {phlebo.vehicleType ? `(${phlebo.vehicleType})` : ''}
              </div>
              {phlebo.rcDocumentUrl && (
                <a href={phlebo.rcDocumentUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: '#0D9488', fontWeight: 700, display: 'inline-block', marginTop: '2px' }}>
                  View Vehicle RC ↗
                </a>
              )}
            </div>

            <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>AADHAAR NUMBER</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                {phlebo.aadhaarNumber ? `•••• •••• ${phlebo.aadhaarNumber.slice(-4)}` : 'Pending'}
              </div>
              {phlebo.aadhaarDocumentUrl && (
                <a href={phlebo.aadhaarDocumentUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: '#0D9488', fontWeight: 700, display: 'inline-block', marginTop: '2px' }}>
                  View Aadhaar Scan ↗
                </a>
              )}
            </div>

            <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>PAN CARD NUMBER</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                {phlebo.panNumber || 'Pending'}
              </div>
              {phlebo.panDocumentUrl && (
                <a href={phlebo.panDocumentUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: '#0D9488', fontWeight: 700, display: 'inline-block', marginTop: '2px' }}>
                  View PAN Document ↗
                </a>
              )}
            </div>

            <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', gridColumn: 'span 2' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>MASTER SERVICE AGREEMENT (v2.1)</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: phlebo.signedAgreementUrl ? '#047857' : '#B45309' }}>
                  {phlebo.signedAgreementUrl ? `✓ Signed by ${phlebo.signerName || phlebo.name}` : '⚠️ Signature Agreement Pending'}
                </span>
                {phlebo.signedAgreementUrl && (
                  <a href={phlebo.signedAgreementUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.72rem', color: '#0D9488', fontWeight: 700 }}>
                    Download Signed Agreement ↗
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* KYC Documents Section */}
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
          <strong style={{ fontSize: '0.85rem', color: '#1E293B', display: 'block', marginBottom: '8px' }}>
            📄 Submitted KYC Documents ({docs.length})
          </strong>
          {docs.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {docs.map((docItem) => (
                <div
                  key={docItem.id}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                    📄 {docItem.title}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                    Type: {docItem.type.replace(/_/g, ' ')}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                    Uploaded: {new Date(docItem.uploadedAt).toLocaleDateString()}
                  </div>
                  <a
                    href={docItem.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary"
                    style={{
                      fontSize: '0.72rem',
                      padding: '4px 8px',
                      textAlign: 'center',
                      textDecoration: 'none',
                      marginTop: '4px',
                    }}
                  >
                    View Document ↗
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: '#EF4444', background: '#FEF2F2', padding: '10px', borderRadius: '6px' }}>
              ⚠️ No KYC documents uploaded. Phlebotomist must submit Aadhaar, Driving License, DMLT certificate, or PAN card before verification.
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            {onOpenSetPassword && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  onOpenSetPassword(phlebo);
                  onClose();
                }}
              >
                🔑 Set / Reset Password
              </button>
            )}

            {!isVerified && onVerify && (
              <button
                type="button"
                className="btn-primary"
                style={{
                  background: '#10B981',
                  borderColor: '#059669',
                  padding: '8px 18px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                }}
                disabled={verifying}
                onClick={() => void handleVerifyClick()}
              >
                {verifying ? '⏳ Verifying...' : '✓ Approve & Dispatch Credentials Email'}
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}
