import { useEffect, useState } from 'react';
import {
  type LabFacility,
  type PhlebotomistProfile,
  type RoleAgreementTemplate,
} from '@diagnostic/shared';
import { uploadDiagnosticDocument } from '../../firebase';
import {
  DEFAULT_ROLE_AGREEMENTS,
  getRoleAgreementTemplates,
  saveRoleAgreementTemplate,
  toggleRoleAgreementActive,
} from '../../services/firestoreService';
import { type AlertTriggerFn } from '../types';

export interface AdminAgreementsTabProps {
  actorEmail: string;
  labs: LabFacility[];
  phlebotomists: PhlebotomistProfile[];
  onShowAlert: AlertTriggerFn;
}

export function AdminAgreementsTab({
  actorEmail,
  labs,
  phlebotomists,
  onShowAlert,
}: AdminAgreementsTabProps) {
  const [templates, setTemplates] = useState<RoleAgreementTemplate[]>(DEFAULT_ROLE_AGREEMENTS);
  const [loading, setLoading] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<'ALL' | 'PHLEBOTOMIST' | 'SMALL_LAB' | 'LARGE_LAB'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    void loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    try {
      const data = await getRoleAgreementTemplates();
      setTemplates(data);
    } catch {
      setTemplates(DEFAULT_ROLE_AGREEMENTS);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus(tmpl: RoleAgreementTemplate) {
    const nextActive = !tmpl.isActive;
    try {
      await toggleRoleAgreementActive(tmpl.id, nextActive, actorEmail);
      setTemplates((prev) =>
        prev.map((t) => (t.id === tmpl.id ? { ...t, isActive: nextActive } : t))
      );
      onShowAlert({
        variant: 'success',
        title: 'Agreement Status Updated',
        message: `${tmpl.title} is now ${nextActive ? 'ACTIVE' : 'DISABLED'}.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Update Failed',
        message: err instanceof Error ? err.message : 'Could not update status.',
      });
    }
  }

  async function handleUploadTemplate(file: File, tmpl: RoleAgreementTemplate) {
    setUploadingTarget(tmpl.id);
    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `agreements/templates/${tmpl.roleTarget.toLowerCase()}_${Date.now()}_${cleanName}`;
      const fileUrl = await uploadDiagnosticDocument(storagePath, file);

      const updated: RoleAgreementTemplate = {
        ...tmpl,
        templateFileUrl: fileUrl,
        fileName: file.name,
        fileSizeBytes: file.size,
        updatedBy: actorEmail,
        updatedAt: new Date().toISOString(),
      };

      await saveRoleAgreementTemplate(updated, actorEmail);
      setTemplates((prev) => prev.map((t) => (t.id === tmpl.id ? updated : t)));

      onShowAlert({
        variant: 'success',
        title: 'Agreement Template Uploaded',
        message: `New template for ${tmpl.title} uploaded successfully.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Upload Failed',
        message: err instanceof Error ? err.message : 'Failed to upload template file.',
      });
    } finally {
      setUploadingTarget(null);
    }
  }

  function handleDownloadTemplate(tmpl: RoleAgreementTemplate) {
    if (tmpl.templateFileUrl) {
      window.open(tmpl.templateFileUrl, '_blank');
      return;
    }

    const content = `================================================================================
LABSETU MASTER ${tmpl.roleTarget} SERVICE & COMPLIANCE AGREEMENT
================================================================================
Title: ${tmpl.title}
Version: ${tmpl.version}
Date: ${new Date().toLocaleDateString('en-IN')}

1. APPOINTMENT & SCOPE OF SERVICE:
This Agreement governs the commercial and operational engagement between LabSetu Diagnostic Network
and the undersigned partner entity / courier in accordance with applicable healthcare diagnostic guidelines.

2. SPECIMEN COLD-CHAIN & SECURITY PROTOCOLS:
- Mandatory continuous maintenance of sample temperature within validated 2°C – 8°C limits.
- Mandatory barcode / QR custody verification at both pickup and laboratory drop-off.
- Immediate incident reporting in case of any cold-chain deviation or specimen compromise.

3. COMMISSIONS, SETTLEMENTS & PAYOUT SCHEDULE:
- Automated calculation of platform fees, negotiated B2B rates and courier remuneration.
- 30-Minute instant payout SLA eligible upon confirmation of sample drop at testing hub.

4. REPRESENTATIONS & SIGNATURE:
Party / Facility Name: ___________________________________________________________
Signatory Name: _________________________________________________________________
Designation: ____________________________________________________________________
Government ID / Registration No: ________________________________________________
Place: ______________________________________ Date: _____________________________

Signature & Stamp: ______________________________________________________________
================================================================================
`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tmpl.fileName || `LabSetu_${tmpl.roleTarget}_Agreement_${tmpl.version}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Compile executed records across Labs & Phlebos
  const executedRecords = [
    ...phlebotomists.map((p) => ({
      id: p.id,
      code: p.userCode || p.id,
      name: p.name,
      role: 'PHLEBOTOMIST' as const,
      roleLabel: 'Field Phlebotomist',
      phone: p.phone,
      email: p.email,
      signerName: p.signerName || p.name,
      signedAgreementUrl: p.signedAgreementUrl,
      signedAt: p.signedAt,
      verified: p.verified,
    })),
    ...labs.map((l) => ({
      id: l.id,
      code: l.userCode || l.id,
      name: l.name,
      role: (l.type === 'LARGE_LAB' ? 'LARGE_LAB' : 'SMALL_LAB') as 'SMALL_LAB' | 'LARGE_LAB',
      roleLabel: l.type === 'LARGE_LAB' ? 'Reference Lab Hub' : 'Collection Center',
      phone: l.phone,
      email: l.email,
      signerName: l.signerName || l.contactPersonName || l.name,
      signedAgreementUrl: l.signedAgreementUrl,
      signedAt: l.signedAt,
      verified: l.verified,
    })),
  ];

  const filteredExecuted = executedRecords.filter((rec) => {
    if (filterRole !== 'ALL' && rec.role !== filterRole) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        rec.name.toLowerCase().includes(q) ||
        rec.code.toLowerCase().includes(q) ||
        rec.email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div className="chart-card-modern" style={{ margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>🤝</span>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Role-Based Master Agreements &amp; Signatures
              </h2>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '4px', marginBottom: 0 }}>
              Manage official agreement templates for Field Phlebotomists, Collection Centres, and Reference Labs. Download templates, toggle active enforcement, and track signed execution counterparts.
            </p>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={loadTemplates}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : '🔄 Refresh Agreements'}
          </button>
        </div>
      </div>

      {/* Top 3 Template Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {templates.map((tmpl) => {
          const roleIcon =
            tmpl.roleTarget === 'PHLEBOTOMIST'
              ? '🚴'
              : tmpl.roleTarget === 'SMALL_LAB'
              ? '🏢'
              : '🧪';

          return (
            <div
              key={tmpl.id}
              className="chart-card-modern"
              style={{
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                border: tmpl.isActive ? '1.5px solid #0D9488' : '1px solid #CBD5E1',
                backgroundColor: tmpl.isActive ? '#FFFFFF' : '#F8FAFC',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.5rem' }}>{roleIcon}</span>
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                      {tmpl.title}
                    </h3>
                    <div style={{ fontSize: '0.72rem', color: '#0D9488', fontWeight: 700 }}>
                      Version {tmpl.version} • Role: {tmpl.roleTarget}
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '20px',
                    backgroundColor: tmpl.isActive ? '#ECFDF5' : '#F1F5F9',
                    color: tmpl.isActive ? '#047857' : '#64748B',
                    border: tmpl.isActive ? '1px solid #A7F3D0' : '1px solid #E2E8F0',
                  }}
                >
                  {tmpl.isActive ? '● Active' : '● Disabled'}
                </span>
              </div>

              <p style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.4, flex: 1, marginBottom: '14px' }}>
                {tmpl.description}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '10px', borderTop: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ flex: 1, fontSize: '0.76rem', padding: '7px 10px' }}
                    onClick={() => handleDownloadTemplate(tmpl)}
                  >
                    📥 Download Template
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    style={{
                      fontSize: '0.76rem',
                      padding: '7px 10px',
                      color: tmpl.isActive ? '#B45309' : '#047857',
                    }}
                    onClick={() => void handleToggleStatus(tmpl)}
                  >
                    {tmpl.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>

                <label
                  className="btn-secondary"
                  style={{
                    fontSize: '0.74rem',
                    padding: '6px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    color: '#0F766E',
                    borderColor: '#99F6E4',
                    backgroundColor: '#F0FDFA',
                    margin: 0,
                  }}
                >
                  <span>
                    {uploadingTarget === tmpl.id ? '⏳ Uploading...' : '📄 Replace Template PDF'}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,text/plain"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadTemplate(f, tmpl);
                    }}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {/* Executed Signed Agreements Dossier */}
      <div className="chart-card-modern" style={{ margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Executed Signed Counterparts ({filteredExecuted.length})
            </h3>
            <div style={{ fontSize: '0.76rem', color: '#64748B' }}>
              Audit list of all signed agreements submitted by onboarded labs and phlebotomists.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search by name, ID or email..."
              className="form-input"
              style={{ width: '220px', padding: '6px 10px', fontSize: '0.78rem' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            {(['ALL', 'PHLEBOTOMIST', 'SMALL_LAB', 'LARGE_LAB'] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={filterRole === r ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: '0.74rem', padding: '5px 10px' }}
                onClick={() => setFilterRole(r)}
              >
                {r === 'ALL'
                  ? 'All Roles'
                  : r === 'PHLEBOTOMIST'
                  ? 'Phlebos'
                  : r === 'SMALL_LAB'
                  ? 'Small Labs'
                  : 'Large Labs'}
              </button>
            ))}
          </div>
        </div>

        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Entity Name</th>
                <th>Role</th>
                <th>Signer Name</th>
                <th>Agreement Status</th>
                <th>Signed Timestamp</th>
                <th style={{ textAlign: 'right' }}>Document</th>
              </tr>
            </thead>
            <tbody>
              {filteredExecuted.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
                    No executed agreement records matching the selected filter.
                  </td>
                </tr>
              ) : (
                filteredExecuted.map((rec) => (
                  <tr key={rec.id}>
                    <td>
                      <span className="user-code-badge">{rec.code}</span>
                    </td>
                    <td>
                      <strong style={{ color: '#0F172A' }}>{rec.name}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{rec.email}</div>
                    </td>
                    <td>
                      <span className="status-pill-blue" style={{ fontSize: '0.72rem' }}>
                        {rec.roleLabel}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>
                        {rec.signerName || '—'}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '12px',
                          backgroundColor: rec.signedAgreementUrl ? '#ECFDF5' : '#FEF2F2',
                          color: rec.signedAgreementUrl ? '#047857' : '#DC2626',
                        }}
                      >
                        {rec.signedAgreementUrl ? '✓ Signed & Archived' : '⚠️ Pending Signature'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.74rem', color: '#64748B' }}>
                      {rec.signedAt ? new Date(rec.signedAt).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {rec.signedAgreementUrl ? (
                        <a
                          href={rec.signedAgreementUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary"
                          style={{ fontSize: '0.72rem', padding: '4px 8px', textDecoration: 'none' }}
                        >
                          View Agreement ↗
                        </a>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Not Uploaded</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
