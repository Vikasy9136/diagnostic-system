import {
  type LabFacility,
  type PhlebotomistProfile,
  UserRole,
} from '@diagnostic/shared';
import { type AdminTab } from '../../admin';

export interface FieldOnboardingOverviewTabProps {
  labs: LabFacility[];
  phlebotomists: PhlebotomistProfile[];
  onSelectTab: (tab: AdminTab) => void;
  onOpenAddUserModal: (presetRole: UserRole) => void;
}

export function FieldOnboardingOverviewTab({
  labs,
  phlebotomists,
  onSelectTab,
  onOpenAddUserModal,
}: FieldOnboardingOverviewTabProps) {
  const smallLabs = labs.filter((l) => l.type === UserRole.SMALL_LAB);
  const largeLabs = labs.filter((l) => l.type === UserRole.LARGE_LAB);
  const pendingLabs = labs.filter((l) => !l.verified);
  const pendingPhlebos = phlebotomists.filter(
    (p) => (p as PhlebotomistProfile & { verificationStatus?: string }).verificationStatus !== 'VERIFIED'
  );
  const recentLabs = [...labs]
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Hero Banner */}
      <div
        className="chart-card-modern"
        style={{
          background: 'linear-gradient(135deg, #062226 0%, #0D9488 100%)',
          color: '#FFFFFF',
          border: 'none',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#99F6E4', textTransform: 'uppercase' }}>
            Field Onboarding &amp; Partner Acquisition Workspace
          </div>
          <h2 style={{ margin: '4px 0 6px 0', fontSize: '1.35rem', fontWeight: 800 }}>
            Onboard Small Labs, Large Reference Labs &amp; Field Phlebotomists
          </h2>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#E2E8F0', maxWidth: '640px' }}>
            Register partner diagnostic centres on-field, capture live verification photos &amp; KYC documents, pin accurate Google Maps GPS coordinates, and submit accounts for verification.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button
            type="button"
            className="btn-primary"
            style={{ background: '#FFFFFF', color: '#0F766E', fontWeight: 700 }}
            onClick={() => onOpenAddUserModal(UserRole.SMALL_LAB)}
          >
            + Onboard Small Lab
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ background: '#0F172A', color: '#FFFFFF', fontWeight: 700 }}
            onClick={() => onOpenAddUserModal(UserRole.LARGE_LAB)}
          >
            + Onboard Large Lab
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ background: '#14B8A6', color: '#042F2E', fontWeight: 700 }}
            onClick={() => onOpenAddUserModal(UserRole.PHLEBOTOMIST)}
          >
            + Onboard Phlebo
          </button>
        </div>
      </div>

      {/* Onboarding KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
        <div className="chart-card-modern" style={{ cursor: 'pointer' }} onClick={() => onSelectTab('labs-small')}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B' }}>SMALL COLLECTION LABS</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', margin: '6px 0' }}>
            {smallLabs.length}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#0D9488', fontWeight: 600 }}>View &amp; Onboard Collection Labs →</div>
        </div>

        <div className="chart-card-modern" style={{ cursor: 'pointer' }} onClick={() => onSelectTab('labs-large')}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B' }}>LARGE REFERENCE LABS</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', margin: '6px 0' }}>
            {largeLabs.length}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#0D9488', fontWeight: 600 }}>View &amp; Onboard Reference Hubs →</div>
        </div>

        <div className="chart-card-modern" style={{ cursor: 'pointer' }} onClick={() => onSelectTab('phlebotomists')}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B' }}>FIELD PHLEBOTOMISTS</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', margin: '6px 0' }}>
            {phlebotomists.length}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#0D9488', fontWeight: 600 }}>View &amp; Onboard Couriers →</div>
        </div>

        <div className="chart-card-modern" style={{ cursor: 'pointer' }} onClick={() => onSelectTab('labs-verify')}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B' }}>PENDING KYC VERIFICATION</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#D97706', margin: '6px 0' }}>
            {pendingLabs.length + pendingPhlebos.length}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#B45309', fontWeight: 600 }}>
            {pendingLabs.length} Labs • {pendingPhlebos.length} Phlebos →
          </div>
        </div>
      </div>

      {/* Recent Onboarded Labs */}
      <div className="chart-card-modern">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 className="card-top-title" style={{ margin: 0 }}>Recently Onboarded Partner Labs</h3>
          <button type="button" className="btn-secondary" onClick={() => onSelectTab('labs-verify')}>
            Open Verification Queue
          </button>
        </div>
        {recentLabs.length === 0 ? (
          <p style={{ fontSize: '0.84rem', color: '#64748B' }}>No partner labs onboarded yet. Use the buttons above to onboard your first Small or Large Lab.</p>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {recentLabs.map((lab) => (
              <div
                key={lab.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0F172A' }}>
                    {lab.name}{' '}
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0D9488' }}>
                      ({lab.type === UserRole.LARGE_LAB ? 'Large Reference Lab' : 'Small Collection Lab'})
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748B' }}>
                    {lab.userCode || lab.id} • {lab.city || 'City pending'} • {lab.email || 'No email'}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '999px',
                    background: lab.verified ? '#DCFCE7' : '#FEF3C7',
                    color: lab.verified ? '#166534' : '#92400E',
                  }}
                >
                  {lab.verified ? 'VERIFIED' : 'PENDING KYC'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
