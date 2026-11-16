import { useState, useMemo } from 'react';
import { type LabFacility, UserRole } from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';
import { type AlertTriggerFn, type FormatLabelFn } from '../types';
import { type AdminPasswordTarget, type AdminTab } from './adminTypes';
import { LabDetailsPreviewModal } from './LabDetailsPreviewModal';
import { LabDocumentUploadModal } from './LabDocumentUploadModal';

export interface AdminLabsTabProps {
  activeTab: AdminTab;
  labs: LabFacility[];
  formatLabel: FormatLabelFn;
  onOpenAddUserModal: (role: UserRole) => void;
  onVerifyLab: (labId: string) => void;
  onOpenSetPasswordDialog: (target: AdminPasswordTarget) => void;
  onShowAlert: AlertTriggerFn;
}

export function AdminLabsTab({
  activeTab,
  labs,
  formatLabel,
  onOpenAddUserModal,
  onVerifyLab,
  onOpenSetPasswordDialog,
  onShowAlert,
}: AdminLabsTabProps) {
  const [selectedPreviewLab, setSelectedPreviewLab] = useState<LabFacility | null>(null);
  const [uploadTargetLab, setUploadTargetLab] = useState<LabFacility | null>(null);
  const [verifyFilter, setVerifyFilter] = useState<'ALL' | 'MISSING_DOCS' | 'MISSING_PHOTO' | 'PENDING_APPROVAL'>('ALL');

  const defaultRole = activeTab === 'labs-large' ? UserRole.LARGE_LAB : UserRole.SMALL_LAB;

  // Verification Counts
  const { missingDocsCount, missingPhotosCount, pendingReviewCount, totalVerifyCount } = useMemo(() => {
    let docsCount = 0;
    let photoCount = 0;
    let reviewCount = 0;
    let totalCount = 0;

    for (const l of labs) {
      const isUnverified = l.verificationStatus !== 'VERIFIED';
      const isMissingDocs = !l.documents || l.documents.length === 0;
      const isMissingPhoto = !l.exteriorPhotoUrl;

      if (isMissingDocs) docsCount++;
      if (isMissingPhoto) photoCount++;
      if (isUnverified) reviewCount++;
      if (isUnverified || isMissingDocs || isMissingPhoto) totalCount++;
    }

    return {
      missingDocsCount: docsCount,
      missingPhotosCount: photoCount,
      pendingReviewCount: reviewCount,
      totalVerifyCount: totalCount,
    };
  }, [labs]);

  const filteredLabs = useMemo(() => {
    return labs.filter((l) => {
      if (activeTab === 'labs-small') return l.type === 'SMALL_LAB';
      if (activeTab === 'labs-large') return l.type === 'LARGE_LAB';
      if (activeTab === 'labs-verify') {
        const isUnverified = l.verificationStatus !== 'VERIFIED';
        const isMissingDocs = !l.documents || l.documents.length === 0;
        const isMissingPhoto = !l.exteriorPhotoUrl;

        if (verifyFilter === 'MISSING_DOCS') return isMissingDocs;
        if (verifyFilter === 'MISSING_PHOTO') return isMissingPhoto;
        if (verifyFilter === 'PENDING_APPROVAL') return isUnverified;
        return isUnverified || isMissingDocs || isMissingPhoto;
      }
      return true;
    });
  }, [labs, activeTab, verifyFilter]);

  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <div>
          <h2 className="card-top-title">
            {activeTab === 'labs-verify'
              ? 'Laboratory Verification & Compliance Queue'
              : 'Registered Laboratories Directory'}
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
            {activeTab === 'labs-verify'
              ? 'Review pending labs, upload missing Trade Licenses, GST certificates, and exterior photos'
              : 'All Collection Centers, Reference Labs, Photos & Compliance KYC'}
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => onOpenAddUserModal(defaultRole)}
        >
          + Onboard Lab &amp; Credentials
        </button>
      </div>

      {/* Verification Filter Pills */}
      {activeTab === 'labs-verify' && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {[
            { id: 'ALL', label: `All Action Items (${totalVerifyCount})` },
            { id: 'MISSING_DOCS', label: `⚠️ Missing Documents (${missingDocsCount})` },
            { id: 'MISSING_PHOTO', label: `📸 Missing Exterior Photo (${missingPhotosCount})` },
            { id: 'PENDING_APPROVAL', label: `⏳ Pending Review (${pendingReviewCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={verifyFilter === tab.id ? 'btn-primary' : 'btn-secondary'}
              style={{
                fontSize: '0.76rem',
                padding: '5px 12px',
                borderRadius: '6px',
                fontWeight: verifyFilter === tab.id ? 700 : 500,
              }}
              onClick={() => setVerifyFilter(tab.id as typeof verifyFilter)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {filteredLabs.length === 0 ? (
        <EmptyStateBox
          title={
            activeTab === 'labs-verify'
              ? 'No Labs Requiring Action'
              : 'No Laboratories Added Yet'
          }
          description={
            activeTab === 'labs-verify'
              ? 'All registered laboratories have complete compliance documents, photos, and verified credentials.'
              : 'Onboard a Collection Center or Reference Lab together with its sign-in ID, front photo, live photo, documents, and credentials in one unified flow.'
          }
          actionLabel="+ Register First Lab"
          onAction={() => onOpenAddUserModal(defaultRole)}
        />
      ) : (
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>Lab ID &amp; Photo</th>
                <th>Name &amp; Address</th>
                <th>Type &amp; Tier</th>
                <th>City &amp; PIN</th>
                <th>Email / Contact</th>
                <th>Verification &amp; KYC Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLabs.map((lab) => {
                const isMissingDocs = !lab.documents || lab.documents.length === 0;
                const isMissingExterior = !lab.exteriorPhotoUrl;
                const isVerified = lab.verificationStatus === 'VERIFIED';

                return (
                  <tr key={lab.id} style={{ background: isMissingDocs ? '#FFFDFD' : undefined }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {lab.exteriorPhotoUrl ? (
                          <img
                            src={lab.exteriorPhotoUrl}
                            alt="Front"
                            style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '6px',
                              objectFit: 'cover',
                              border: '1px solid #CBD5E1',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                            onClick={() => setSelectedPreviewLab(lab)}
                            title="Click to view lab photos & details"
                          />
                        ) : lab.livePhotoUrl ? (
                          <img
                            src={lab.livePhotoUrl}
                            alt="Live"
                            style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '6px',
                              objectFit: 'cover',
                              border: '1px solid #CBD5E1',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                            onClick={() => setSelectedPreviewLab(lab)}
                            title="Click to view lab photos & details"
                          />
                        ) : (
                          <div
                            style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '6px',
                              background: '#FEF2F2',
                              border: '1px dashed #F87171',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.1rem',
                              flexShrink: 0,
                              cursor: 'pointer',
                            }}
                            onClick={() => setUploadTargetLab(lab)}
                            title="Click to upload exterior photo"
                          >
                            🏢
                          </div>
                        )}
                        <div>
                          <span className="user-code-badge">{lab.userCode || lab.id}</span>
                          {lab.serviceZoneName && (
                            <div style={{ fontSize: '0.68rem', color: '#0F766E', marginTop: '2px' }}>
                              {lab.serviceZoneName}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div><strong>{lab.name}</strong></div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{lab.address || 'Address pending'}</div>
                      {lab.contactPersonName && (
                        <div style={{ fontSize: '0.68rem', color: '#0F766E', marginTop: '2px' }}>
                          In-charge: {lab.contactPersonName}
                        </div>
                      )}
                    </td>
                    <td>
                      <div>
                        {lab.type === 'SMALL_LAB'
                          ? 'Small Collection Lab'
                          : lab.centerType === 'COLLECTION_CENTER'
                          ? 'Large Lab Branch'
                          : 'Large Lab Main Hub'}
                      </div>
                      {lab.parentLabId && (
                        <div style={{ fontSize: '0.72rem', color: '#0F766E' }}>
                          Parent HQ: {lab.parentLabName || lab.parentLabId}
                        </div>
                      )}
                    </td>
                    <td>
                      <div><strong>{lab.city}</strong></div>
                      {lab.pincode && (
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>PIN: {lab.pincode}</div>
                      )}
                      {lab.latitude && lab.longitude && (
                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                          GPS: {lab.latitude.toFixed(3)}, {lab.longitude.toFixed(3)}
                        </div>
                      )}
                    </td>
                    <td>
                      <div>{lab.email}</div>
                      {lab.phone && <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{lab.phone}</div>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span className={isVerified ? 'status-pill-green' : 'status-pill-amber'}>
                          {formatLabel(lab.verificationStatus)}
                        </span>
                        {isMissingDocs ? (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              color: '#DC2626',
                              background: '#FEF2F2',
                              border: '1px solid #FECACA',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              width: 'fit-content',
                            }}
                          >
                            ⚠️ 0 Documents (Upload Needed)
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              color: '#16A34A',
                              background: '#F0FDF4',
                              border: '1px solid #BBF7D0',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              width: 'fit-content',
                            }}
                          >
                            ✓ {lab.documents?.length || 0} Doc(s) Attached
                          </span>
                        )}
                        {isMissingExterior && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              color: '#D97706',
                              background: '#FFFBEB',
                              border: '1px solid #FDE68A',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              width: 'fit-content',
                            }}
                          >
                            ⚠️ Exterior Photo Missing
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ fontSize: '0.74rem', padding: '4px 10px', background: '#0F766E' }}
                          onClick={() => setSelectedPreviewLab(lab)}
                          title="Preview full lab details and documents"
                        >
                          👁️ Preview
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{
                            fontSize: '0.74rem',
                            padding: '4px 8px',
                            background: isMissingDocs ? '#FEF2F2' : '#F0FDFA',
                            color: isMissingDocs ? '#DC2626' : '#0F766E',
                            borderColor: isMissingDocs ? '#FECACA' : '#99F6E4',
                            fontWeight: 700,
                          }}
                          onClick={() => setUploadTargetLab(lab)}
                          title="Upload missing documents or facility photos"
                        >
                          📤 {isMissingDocs ? 'Upload Docs *' : 'Docs / Photos'}
                        </button>
                        {!isVerified && (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ fontSize: '0.74rem', padding: '4px 8px', color: '#16A34A', borderColor: '#BBF7D0' }}
                            onClick={() => {
                              if (isMissingDocs || isMissingExterior) {
                                onShowAlert({
                                  variant: 'warning',
                                  title: 'Compliance Documents Required',
                                  message: 'Cannot verify lab: Clinical/Trade License documents and Front Exterior Signboard Photo must be uploaded first.',
                                });
                                setUploadTargetLab(lab);
                                return;
                              }
                              onVerifyLab(lab.id);
                            }}
                            title="Mark this lab as verified"
                          >
                            ✓ Verify
                          </button>
                        )}
                        {lab.email && (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                            onClick={() =>
                              onOpenSetPasswordDialog({
                                email: lab.email,
                                name: lab.name,
                                userCode: lab.userCode || lab.id,
                                roleLabel:
                                  lab.type === 'SMALL_LAB'
                                    ? 'Small Collection Lab'
                                    : lab.centerType === 'COLLECTION_CENTER'
                                    ? 'Large Lab Branch'
                                    : 'Large Reference Lab HQ',
                                hasPassword: lab.initialPasswordSet,
                              })
                            }
                          >
                            🔑 {lab.initialPasswordSet ? 'Reset' : 'Set Pwd'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Lab Details Inspector Modal */}
      <LabDetailsPreviewModal
        open={Boolean(selectedPreviewLab)}
        lab={selectedPreviewLab}
        onClose={() => setSelectedPreviewLab(null)}
        onOpenUploadDocs={(targetLab) => setUploadTargetLab(targetLab)}
        onVerifyLab={(id) => {
          onVerifyLab(id);
          setSelectedPreviewLab((prev) => (prev ? { ...prev, verified: true, verificationStatus: 'VERIFIED' } : null));
        }}
        onOpenSetPassword={(targetLab) => {
          onOpenSetPasswordDialog({
            email: targetLab.email,
            name: targetLab.name,
            userCode: targetLab.userCode || targetLab.id,
            roleLabel:
              targetLab.type === 'SMALL_LAB'
                ? 'Small Collection Lab'
                : targetLab.centerType === 'COLLECTION_CENTER'
                ? 'Large Lab Branch'
                : 'Large Reference Lab HQ',
            hasPassword: targetLab.initialPasswordSet,
          });
        }}
      />

      {/* Dedicated Document & Photo Upload Modal for existing lab */}
      <LabDocumentUploadModal
        open={Boolean(uploadTargetLab)}
        lab={uploadTargetLab}
        onClose={() => setUploadTargetLab(null)}
        onShowAlert={onShowAlert}
        onLabUpdated={(updatedLab) => {
          if (selectedPreviewLab?.id === updatedLab.id) {
            setSelectedPreviewLab(updatedLab);
          }
        }}
      />
    </div>
  );
}
