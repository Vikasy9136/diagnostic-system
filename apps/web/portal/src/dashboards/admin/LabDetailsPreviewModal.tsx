import { useState } from 'react';
import { type LabDocumentRecord, type LabFacility } from '@diagnostic/shared';
import { ModalFrame } from '../../components/shared';

export interface LabDetailsPreviewModalProps {
  open: boolean;
  lab: LabFacility | null;
  onClose: () => void;
  onVerifyLab?: (labId: string) => void;
  onOpenSetPassword?: (lab: LabFacility) => void;
  onOpenUploadDocs?: (lab: LabFacility) => void;
}

export function LabDetailsPreviewModal({
  open,
  lab,
  onClose,
  onVerifyLab,
  onOpenSetPassword,
  onOpenUploadDocs,
}: LabDetailsPreviewModalProps) {
  const [activePhotoTab, setActivePhotoTab] = useState<'ALL' | 'EXTERIOR' | 'LIVE' | 'INTERIOR'>('ALL');
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);

  if (!open || !lab) return null;

  const isVerified = lab.verificationStatus === 'VERIFIED';
  const roleTitle =
    lab.type === 'SMALL_LAB'
      ? 'Small Collection Center'
      : lab.centerType === 'COLLECTION_CENTER'
      ? `Large Lab Branch (${lab.parentLabName || lab.parentLabId || 'HQ'})`
      : 'Large Reference Lab HQ';

  const hasPhotos = Boolean(lab.exteriorPhotoUrl || lab.livePhotoUrl || lab.interiorPhotoUrl || (lab.photos && lab.photos.length > 0));
  const docs: LabDocumentRecord[] = lab.documents || [];

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      title={`Lab Inspector: ${lab.name}`}
      subtitle={`${lab.userCode || lab.id} • ${lab.city} • ${roleTitle}`}
      maxWidth="780px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Top Header Card */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)',
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{lab.name}</h2>
              <span
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  color: '#FFFFFF',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {lab.userCode || lab.id}
              </span>
              <span
                style={{
                  background: isVerified ? '#10B981' : '#F59E0B',
                  color: '#FFFFFF',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}
              >
                {isVerified ? '✓ VERIFIED' : '⏳ PENDING VERIFICATION'}
              </span>
            </div>
            <div style={{ fontSize: '0.82rem', marginTop: '4px', opacity: 0.9 }}>
              {roleTitle} • {lab.city}{lab.pincode ? ` (${lab.pincode})` : ''} • ⭐ {lab.rating ? lab.rating.toFixed(1) : '5.0'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {onOpenUploadDocs && (
              <button
                type="button"
                className="btn-secondary"
                style={{
                  fontSize: '0.8rem',
                  padding: '6px 12px',
                  background: '#F0FDFA',
                  color: '#0F766E',
                  border: '1px solid #99F6E4',
                  fontWeight: 700,
                }}
                onClick={() => {
                  onOpenUploadDocs(lab);
                  onClose();
                }}
              >
                📤 Upload Documents &amp; Photos
              </button>
            )}
            {!isVerified && onVerifyLab && (
              <button
                type="button"
                className="btn-primary"
                style={{ background: '#10B981', borderColor: '#059669', fontSize: '0.8rem', padding: '6px 12px' }}
                onClick={() => {
                  onVerifyLab(lab.id);
                  onClose();
                }}
              >
                ✓ Verify Lab
              </button>
            )}
            {onOpenSetPassword && lab.email && (
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(255,255,255,0.15)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.3)' }}
                onClick={() => {
                  onOpenSetPassword(lab);
                  onClose();
                }}
              >
                🔑 Reset Credentials
              </button>
            )}
          </div>
        </div>

        {/* Section 1: Facility Photos Gallery (Front Exterior + Live Photo + Interior) */}
        <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div>
              <strong style={{ fontSize: '0.9rem', color: '#1E293B' }}>
                📸 Facility Photos Gallery (Front Exterior &amp; Live Verification)
              </strong>
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                Exterior facade photo, live onboarding capture, and interior testing desk
              </div>
            </div>
            {hasPhotos && (
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['ALL', 'EXTERIOR', 'LIVE', 'INTERIOR'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    style={{
                      fontSize: '0.68rem',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid #CBD5E1',
                      background: activePhotoTab === t ? '#0F766E' : '#FFFFFF',
                      color: activePhotoTab === t ? '#FFFFFF' : '#475569',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                    onClick={() => setActivePhotoTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {/* Front Exterior Photo */}
            {(activePhotoTab === 'ALL' || activePhotoTab === 'EXTERIOR') && (
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0F766E' }}>
                  🏢 Front Exterior Signboard Photo
                </div>
                {lab.exteriorPhotoUrl ? (
                  <div
                    style={{ position: 'relative', width: '100%', height: '140px', borderRadius: '6px', overflow: 'hidden', cursor: 'pointer', background: '#000000' }}
                    onClick={() => setZoomPhotoUrl(lab.exteriorPhotoUrl || null)}
                  >
                    <img
                      src={lab.exteriorPhotoUrl}
                      alt="Lab Front Exterior"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <span style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', color: '#FFF', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px' }}>
                      🔍 Zoom
                    </span>
                  </div>
                ) : (
                  <div style={{ height: '140px', borderRadius: '6px', background: '#F1F5F9', border: '1px dashed #CBD5E1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.74rem', gap: '4px' }}>
                    <span>🏢 No Exterior Photo</span>
                    <span style={{ fontSize: '0.68rem' }}>Upload during onboarding</span>
                  </div>
                )}
              </div>
            )}

            {/* Live Onboarding Photo */}
            {(activePhotoTab === 'ALL' || activePhotoTab === 'LIVE') && (
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#2563EB' }}>
                  📷 Live Onboarding / Visit Photo
                </div>
                {lab.livePhotoUrl ? (
                  <div
                    style={{ position: 'relative', width: '100%', height: '140px', borderRadius: '6px', overflow: 'hidden', cursor: 'pointer', background: '#000000' }}
                    onClick={() => setZoomPhotoUrl(lab.livePhotoUrl || null)}
                  >
                    <img
                      src={lab.livePhotoUrl}
                      alt="Live Onboarding Photo"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <span style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', color: '#FFF', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px' }}>
                      🔍 Zoom
                    </span>
                  </div>
                ) : (
                  <div style={{ height: '140px', borderRadius: '6px', background: '#F1F5F9', border: '1px dashed #CBD5E1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.74rem', gap: '4px' }}>
                    <span>📷 No Live Photo</span>
                    <span style={{ fontSize: '0.68rem' }}>Capture via field device</span>
                  </div>
                )}
              </div>
            )}

            {/* Interior Photo */}
            {(activePhotoTab === 'ALL' || activePhotoTab === 'INTERIOR') && (
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#7C3AED' }}>
                  🔬 Interior / Work Area Photo
                </div>
                {lab.interiorPhotoUrl ? (
                  <div
                    style={{ position: 'relative', width: '100%', height: '140px', borderRadius: '6px', overflow: 'hidden', cursor: 'pointer', background: '#000000' }}
                    onClick={() => setZoomPhotoUrl(lab.interiorPhotoUrl || null)}
                  >
                    <img
                      src={lab.interiorPhotoUrl}
                      alt="Interior Work Area"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <span style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', color: '#FFF', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px' }}>
                      🔍 Zoom
                    </span>
                  </div>
                ) : (
                  <div style={{ height: '140px', borderRadius: '6px', background: '#F1F5F9', border: '1px dashed #CBD5E1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.74rem', gap: '4px' }}>
                    <span>🔬 No Interior Photo</span>
                    <span style={{ fontSize: '0.68rem' }}>Optional facility snap</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Location, Contact & Logistics Details */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          {/* Location Box */}
          <div style={{ background: '#FFFFFF', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F766E', marginBottom: '6px' }}>
              📍 Location &amp; Service Radius
            </div>
            <div style={{ fontSize: '0.82rem', color: '#1E293B', lineHeight: 1.5 }}>
              <div><strong>Address:</strong> {lab.address || 'Address on file'}</div>
              <div><strong>City:</strong> {lab.city} • <strong>PIN:</strong> {lab.pincode || 'N/A'}</div>
              {lab.latitude && lab.longitude && (
                <div><strong>GPS:</strong> {lab.latitude.toFixed(4)}, {lab.longitude.toFixed(4)}</div>
              )}
              {lab.serviceRadiusKm && (
                <div><strong>Delivery Radius:</strong> {lab.serviceRadiusKm} km coverage</div>
              )}
              {lab.serviceZoneName && (
                <div><strong>Zone Hub:</strong> {lab.serviceZoneName}</div>
              )}
            </div>
          </div>

          {/* Contact & SLA Box */}
          <div style={{ background: '#FFFFFF', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F766E', marginBottom: '6px' }}>
              📞 Contact &amp; Operating Window
            </div>
            <div style={{ fontSize: '0.82rem', color: '#1E293B', lineHeight: 1.5 }}>
              <div><strong>Email:</strong> {lab.email}</div>
              <div><strong>Phone:</strong> {lab.phone || 'Phone on file'}</div>
              {lab.contactPersonName && (
                <div><strong>Proprietor/Manager:</strong> {lab.contactPersonName}</div>
              )}
              <div><strong>Cutoff Window:</strong> {lab.cutoffWindow || '08:30 PM Daily Cutoff'}</div>
              <div><strong>NABL / Clinical Reg:</strong> {lab.nablNumber || 'Standard Registered Center'}</div>
            </div>
          </div>
        </div>

        {/* Section 3: Required Compliance Documents */}
        <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div>
              <strong style={{ fontSize: '0.9rem', color: '#1E293B' }}>
                📄 Required Compliance Documents ({docs.length})
              </strong>
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                Trade License, GST Certificate, Pathologist Reg, &amp; KYC
              </div>
            </div>
            {onOpenUploadDocs && (
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.72rem', padding: '4px 10px', color: '#0F766E', borderColor: '#99F6E4', fontWeight: 600 }}
                onClick={() => {
                  onOpenUploadDocs(lab);
                  onClose();
                }}
              >
                + Add / Manage Documents
              </button>
            )}
          </div>

          {docs.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
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
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          background: '#E0F2FE',
                          color: '#0369A1',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {docItem.type.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: '#10B981', fontWeight: 600 }}>
                        ✓ Uploaded
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B', marginTop: '6px' }}>
                      {docItem.title}
                    </div>
                    {docItem.fileName && (
                      <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{docItem.fileName}</div>
                    )}
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
                      color: '#0F766E',
                      fontWeight: 700,
                    }}
                  >
                    View Document &rarr;
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '8px',
                padding: '16px',
                border: '1px dashed #CBD5E1',
                textAlign: 'center',
                color: '#64748B',
                fontSize: '0.8rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>⚠️ No compliance documents attached to this record yet.</span>
              {onOpenUploadDocs && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ fontSize: '0.75rem', padding: '5px 12px', background: '#0F766E' }}
                  onClick={() => {
                    onOpenUploadDocs(lab);
                    onClose();
                  }}
                >
                  + Upload Documents &amp; Licenses Now
                </button>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close Inspector
          </button>
        </div>
      </div>

      {/* Lightbox Zoom Photo Preview */}
      {zoomPhotoUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setZoomPhotoUrl(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={zoomPhotoUrl}
              alt="Zoom Preview"
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '8px', objectFit: 'contain' }}
            />
            <button
              type="button"
              style={{
                position: 'absolute',
                top: '-12px',
                right: '-12px',
                background: '#EF4444',
                color: '#FFF',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                fontSize: '1rem',
                fontWeight: 900,
                cursor: 'pointer',
              }}
              onClick={() => setZoomPhotoUrl(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </ModalFrame>
  );
}

