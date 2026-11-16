import { useState, useEffect } from 'react';
import { type LabDocumentRecord, type LabFacility } from '@diagnostic/shared';
import { LiveCameraCaptureModal, ModalFrame } from '../../components/shared';
import { uploadDiagnosticDocument } from '../../firebase';
import {
  updateLabMediaAndDocuments,
  updateLabVerification,
} from '../../services/firestoreService';
import { type AlertTriggerFn } from '../types';

export interface LabDocumentUploadModalProps {
  open: boolean;
  lab: LabFacility | null;
  onClose: () => void;
  onShowAlert: AlertTriggerFn;
  onLabUpdated?: (updatedLab: LabFacility) => void;
}

export function LabDocumentUploadModal({
  open,
  lab,
  onClose,
  onShowAlert,
  onLabUpdated,
}: LabDocumentUploadModalProps) {
  const [activeCameraTarget, setActiveCameraTarget] = useState<'exterior' | 'interior' | 'live' | null>(null);
  const [exteriorPhotoUrl, setExteriorPhotoUrl] = useState('');
  const [livePhotoUrl, setLivePhotoUrl] = useState('');
  const [interiorPhotoUrl, setInteriorPhotoUrl] = useState('');
  const [documents, setDocuments] = useState<LabDocumentRecord[]>([]);
  const [selectedDocType, setSelectedDocType] = useState<LabDocumentRecord['type']>('CLINICAL_ESTABLISHMENT_ACT');
  const [docTitleInput, setDocTitleInput] = useState('');
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lab) {
      setExteriorPhotoUrl(lab.exteriorPhotoUrl || '');
      setLivePhotoUrl(lab.livePhotoUrl || '');
      setInteriorPhotoUrl(lab.interiorPhotoUrl || '');
      setDocuments(lab.documents || []);
      setDocTitleInput('');
      setSelectedDocType('CLINICAL_ESTABLISHMENT_ACT');
    }
  }, [lab, open]);

  if (!open || !lab) return null;

  async function handleCameraCapture(blob: Blob, dataUrl: string) {
    if (!activeCameraTarget || !lab) return;
    setUploadingTarget(activeCameraTarget);
    try {
      let fileUrl = '';
      try {
        const fileName = `${lab.id}_${activeCameraTarget}_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        fileUrl = await uploadDiagnosticDocument(`live_camera/${fileName}`, file);
      } catch {
        fileUrl = dataUrl;
      }

      if (activeCameraTarget === 'exterior') {
        setExteriorPhotoUrl(fileUrl);
      } else if (activeCameraTarget === 'interior') {
        setInteriorPhotoUrl(fileUrl);
      } else if (activeCameraTarget === 'live') {
        setLivePhotoUrl(fileUrl);
      }

      onShowAlert({
        variant: 'success',
        title: 'Live Photo Captured',
        message: 'Photo captured from browser camera. Click "Save Changes" to persist.',
      });
    } catch (err: unknown) {
      onShowAlert({
        variant: 'error',
        title: 'Capture Failed',
        message: err instanceof Error ? err.message : 'Could not save camera capture.',
      });
    } finally {
      setUploadingTarget(null);
      setActiveCameraTarget(null);
    }
  }

  async function handleFileUpload(file: File) {
    try {
      setUploadingTarget('doc');
      let fileUrl = '';
      try {
        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `labs/${lab?.id || 'unknown'}/${Date.now()}_${cleanName}`;
        fileUrl = await uploadDiagnosticDocument(storagePath, file);
      } catch {
        fileUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      const newDoc: LabDocumentRecord = {
        id: `DOC-${Date.now()}`,
        type: selectedDocType,
        title: docTitleInput.trim() || selectedDocType.replace(/_/g, ' '),
        url: fileUrl,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        verified: true,
      };
      setDocuments((prev) => [...prev, newDoc]);
      setDocTitleInput('');

      onShowAlert({
        variant: 'success',
        title: 'Document Attached',
        message: `${file.name} attached successfully. Click "Save Changes" to persist.`,
      });
    } catch (err: unknown) {
      onShowAlert({
        variant: 'error',
        title: 'Upload Failed',
        message: err instanceof Error ? err.message : 'Could not process file upload.',
      });
    } finally {
      setUploadingTarget(null);
    }
  }

  async function handleSaveChanges(andVerify = false) {
    if (!lab) return;

    if (andVerify) {
      if (documents.length === 0) {
        onShowAlert({
          variant: 'warning',
          title: 'Regulatory Documents Required',
          message: 'Cannot verify laboratory: At least one regulatory document (Clinical Establishment Act, Trade License, or PCB NOC) must be uploaded.',
        });
        return;
      }
      if (!exteriorPhotoUrl.trim()) {
        onShowAlert({
          variant: 'warning',
          title: 'Live Outside Photo Required',
          message: 'Cannot verify laboratory: Live Front Exterior Signboard Photo is required.',
        });
        return;
      }
      if (!interiorPhotoUrl.trim()) {
        onShowAlert({
          variant: 'warning',
          title: 'Live Inside Photo Required',
          message: 'Cannot verify laboratory: Live Interior Facility Photo is required.',
        });
        return;
      }
    }

    setSaving(true);
    try {
      const updates = {
        exteriorPhotoUrl: exteriorPhotoUrl.trim() || undefined,
        livePhotoUrl: livePhotoUrl.trim() || undefined,
        interiorPhotoUrl: interiorPhotoUrl.trim() || undefined,
        documents: documents.length > 0 ? documents : [],
        verificationStatus: andVerify ? ('VERIFIED' as const) : lab.verificationStatus,
      };

      await updateLabMediaAndDocuments(lab.id, updates);

      if (andVerify) {
        await updateLabVerification(lab.id, 'VERIFIED');
      }

      const updatedLab: LabFacility = {
        ...lab,
        ...updates,
        verified: andVerify ? true : lab.verificationStatus === 'VERIFIED',
      };

      onLabUpdated?.(updatedLab);

      onShowAlert({
        variant: 'success',
        title: andVerify ? 'Lab Verified & Credentials Dispatched' : 'Lab Documents Updated',
        message: andVerify
          ? `${lab.name} has been verified. Onboarding credentials and login steps have been sent to ${lab.email}.`
          : `All photos and ${documents.length} document(s) have been saved for ${lab.name}.`,
      });
      onClose();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Save Failed',
        message: (err as Error).message || 'Could not update lab records.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      title={`Compliance KYC & Live Photos: ${lab.name}`}
      subtitle={`${lab.userCode || lab.id} • ${lab.city} • Manage Regulatory Docs & Live Camera Photos`}
      maxWidth="780px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Compliance Status Notice */}
        <div style={{ background: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: '10px', padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: '0.85rem', color: '#0F766E' }}>
                KYC &amp; Verification Status: {lab.verificationStatus}
              </strong>
              <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                Both Front Exterior and Interior live camera photos, plus regulatory documents, are required for approval.
              </div>
            </div>
            <span className={lab.verificationStatus === 'VERIFIED' ? 'status-pill-green' : 'status-pill-amber'}>
              {lab.verificationStatus === 'VERIFIED' ? '✓ Verified' : '⏳ Pending'}
            </span>
          </div>
        </div>

        {/* Section 1: Facility Photos (Strictly Live Camera for Exterior & Interior) */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
          <strong style={{ fontSize: '0.88rem', color: '#1E293B', display: 'block', marginBottom: '4px' }}>
            📸 Live Camera Facility Photos (Browser Live Webcam Only)
          </strong>
          <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '12px' }}>
            Live photos must be captured directly via camera for physical premise authenticity.
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Front Exterior Photo */}
            <div style={{ border: '1px solid #CBD5E1', borderRadius: '8px', padding: '10px', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F766E' }}>
                  🏢 Front Exterior Signboard Photo *
                </span>
                {exteriorPhotoUrl && (
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => setExteriorPhotoUrl('')}
                  >
                    Remove ✕
                  </button>
                )}
              </div>
              {exteriorPhotoUrl ? (
                <div style={{ position: 'relative', width: '100%', height: '110px', borderRadius: '6px', overflow: 'hidden' }}>
                  <img src={exteriorPhotoUrl} alt="Exterior" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'rgba(13, 148, 136, 0.9)', color: '#FFF', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>
                    ✓ Live Camera Captured
                  </div>
                </div>
              ) : (
                <div style={{ height: '110px', borderRadius: '6px', border: '1.5px dashed #0D9488', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FFF' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>No Outside Photo</span>
                </div>
              )}
              <button
                type="button"
                className="btn-secondary"
                style={{ width: '100%', marginTop: '8px', fontSize: '0.74rem', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                onClick={() => setActiveCameraTarget('exterior')}
              >
                <span>📷</span> {exteriorPhotoUrl ? 'Retake Outside Photo' : 'Capture Outside Photo'}
              </button>
            </div>

            {/* Interior Facility Photo */}
            <div style={{ border: '1px solid #CBD5E1', borderRadius: '8px', padding: '10px', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7C3AED' }}>
                  🔬 Interior Testing Desk Photo *
                </span>
                {interiorPhotoUrl && (
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => setInteriorPhotoUrl('')}
                  >
                    Remove ✕
                  </button>
                )}
              </div>
              {interiorPhotoUrl ? (
                <div style={{ position: 'relative', width: '100%', height: '110px', borderRadius: '6px', overflow: 'hidden' }}>
                  <img src={interiorPhotoUrl} alt="Interior" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'rgba(124, 58, 237, 0.9)', color: '#FFF', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>
                    ✓ Live Camera Captured
                  </div>
                </div>
              ) : (
                <div style={{ height: '110px', borderRadius: '6px', border: '1.5px dashed #7C3AED', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FFF' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>No Interior Photo</span>
                </div>
              )}
              <button
                type="button"
                className="btn-secondary"
                style={{ width: '100%', marginTop: '8px', fontSize: '0.74rem', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                onClick={() => setActiveCameraTarget('interior')}
              >
                <span>📷</span> {interiorPhotoUrl ? 'Retake Inside Photo' : 'Capture Inside Photo'}
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Upload New Compliance Document Form */}
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
          <strong style={{ fontSize: '0.88rem', color: '#1E293B', display: 'block', marginBottom: '4px' }}>
            ➕ Upload Regulatory Document
          </strong>
          <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '10px' }}>
            Attach Clinical Establishment Registration, Trade License, PCB NOC, NABL, or GSTIN
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr auto', gap: '10px', alignItems: 'center' }}>
            <select
              className="form-select"
              style={{ fontSize: '0.78rem' }}
              value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value as LabDocumentRecord['type'])}
            >
              <option value="CLINICAL_ESTABLISHMENT_ACT">Clinical Establishment Act / Registration</option>
              <option value="TRADE_LICENSE">Trade License / Municipal Shop Act</option>
              <option value="POLLUTION_CONTROL_NOC">Bio-Medical Waste / PCB NOC</option>
              <option value="NABL_CERT">NABL / ISO 15189 Certificate</option>
              <option value="GST_CERTIFICATE">GST Registration Certificate</option>
              <option value="PAN_CARD">Lab PAN Card</option>
              <option value="PATHOLOGIST_REG">Pathologist Degree / MCI Registration</option>
              <option value="OWNER_ID_PROOF">Director / Proprietor ID Proof</option>
              <option value="OTHER">Other Regulatory Document</option>
            </select>

            <input
              className="form-input"
              style={{ fontSize: '0.78rem' }}
              placeholder="Custom title / notes (optional)"
              value={docTitleInput}
              onChange={(e) => setDocTitleInput(e.target.value)}
            />

            <label
              className="btn-primary"
              style={{
                fontSize: '0.78rem',
                padding: '7px 14px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: '#0F766E',
                margin: 0,
              }}
            >
              {uploadingTarget === 'doc' ? '⏳ Uploading...' : '+ Attach File'}
              <input
                type="file"
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileUpload(file);
                }}
              />
            </label>
          </div>
        </div>

        {/* Section 3: Existing Uploaded Documents List */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
          <strong style={{ fontSize: '0.88rem', color: '#1E293B', display: 'block', marginBottom: '10px' }}>
            📄 Uploaded Documents on Record ({documents.length})
          </strong>

          {documents.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#94A3B8', fontSize: '0.8rem', background: '#F8FAFC', borderRadius: '8px' }}>
              No documents uploaded yet. Upload required trade and regulatory certificates above.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
              {documents.map((d) => (
                <div
                  key={d.id}
                  style={{
                    border: '1px solid #CBD5E1',
                    borderRadius: '8px',
                    padding: '10px',
                    background: '#F8FAFC',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <strong style={{ fontSize: '0.8rem', color: '#0F172A' }}>{d.title}</strong>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 700 }}
                      onClick={() => setDocuments((prev) => prev.filter((item) => item.id !== d.id))}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                    Category: <strong>{d.type.replace(/_/g, ' ')}</strong>
                  </div>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary"
                    style={{ fontSize: '0.72rem', padding: '3px 8px', marginTop: '6px', textAlign: 'center', textDecoration: 'none' }}
                  >
                    View Document ↗
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={() => void handleSaveChanges(false)}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {lab.verificationStatus !== 'VERIFIED' && (
              <button
                type="button"
                className="btn-primary"
                style={{ background: '#10B981', borderColor: '#059669', fontWeight: 700 }}
                disabled={saving}
                onClick={() => void handleSaveChanges(true)}
              >
                {saving ? 'Verifying...' : '✓ Save & Approve Lab Verification'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dedicated Live Camera Stream Modal */}
      <LiveCameraCaptureModal
        open={activeCameraTarget !== null}
        title={
          activeCameraTarget === 'exterior'
            ? 'Live Camera: Front Exterior Signboard Photo'
            : activeCameraTarget === 'interior'
            ? 'Live Camera: Interior Testing Desk Photo'
            : 'Live Camera Capture'
        }
        description={
          activeCameraTarget === 'exterior'
            ? 'Step outside the entrance and capture a live photo of the building facade with signboard.'
            : 'Capture a live photo inside the testing facility or sample collection counter.'
        }
        facingModeDefault="environment"
        guideType={activeCameraTarget === 'exterior' ? 'facade' : 'facility'}
        onClose={() => setActiveCameraTarget(null)}
        onCapture={handleCameraCapture}
        uploading={uploadingTarget !== null}
      />
    </ModalFrame>
  );
}
