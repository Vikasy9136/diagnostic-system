import { LABSETU_THEME, ROLE_LABELS, UserRole } from '@diagnostic/shared';
import { LabSetuLogo } from '@diagnostic/shared/web/LabSetuLogo';
import { ADMIN_LOGIN_EMAIL } from '../firebase';

interface LandingPageProps {
  onGoToLogin: (role?: UserRole) => void;
  onGoToPrivacy?: () => void;
  onGoToTerms?: () => void;
}

const WEB_ROLE_CARDS: {
  role: UserRole;
  icon: string;
  accentBg: string;
  accentColor: string;
  summary: string;
  features: string[];
}[] = [
  {
    role: UserRole.ADMIN,
    icon: '🛡️',
    accentBg: '#F5F3FF',
    accentColor: '#7C3AED',
    summary: 'Manage partner accounts, monitor sample pickups, and review billing.',
    features: [
      'Add and manage Collection Centers, Reference Labs & Phlebotomists',
      'Track live sample pickups, cooling box temperatures & delivery times',
      'Manage billing splits, partner payouts & test price lists',
    ],
  },
  {
    role: UserRole.SMALL_LAB,
    icon: '🏥',
    accentBg: '#EFF6FF',
    accentColor: '#2563EB',
    summary: 'Book sample pickups, register patients, and download verified reports.',
    features: [
      'Create sample pickup bookings from live test prices & partner labs',
      'Keep a patient directory & follow every sample step live',
      'Download doctor-verified PDF test reports anytime',
    ],
  },
  {
    role: UserRole.LARGE_LAB,
    icon: '🔬',
    accentBg: '#F0FDFA',
    accentColor: '#0D9488',
    summary: 'Check arriving samples, run lab tests, and upload patient reports.',
    features: [
      'Verify arriving cooler temperature (2°C–8°C) & sample condition',
      'Manage department testing queues & publish verified PDF reports',
      'Update partner test rates, turnaround targets & payment summaries',
    ],
  },
];

export function LandingPage({ onGoToLogin, onGoToPrivacy, onGoToTerms }: LandingPageProps) {
  return (
    <div className="landing-root">
      {/* Sticky Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <LabSetuLogo variant="full" width={42} height={42} alt="LabSetu" />
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                {LABSETU_THEME.brand.name}
              </div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0D9488' }}>
                Diagnostic Sample Pickup &amp; Lab Network
              </div>
            </div>
          </div>

          <div className="landing-nav-links">
            <a href="#roles" className="landing-nav-link">Partner Portals</a>
            <a href="#workflow" className="landing-nav-link">How It Works</a>
            <a href="#security" className="landing-nav-link">Account Security</a>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onGoToLogin(UserRole.ADMIN)}
            >
              Admin Sign In
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => onGoToLogin(UserRole.SMALL_LAB)}
            >
              Partner Login →
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="landing-hero">
        <div className="landing-hero-inner">
          <div>
            <div className="landing-eyebrow">
              <span>●</span> Live Sample Pickup &amp; Lab Reporting Network
            </div>

            <h1 className="landing-h1">
              Connected Diagnostic Sample Pickups &amp; Cold-Chain Care
            </h1>

            <p className="landing-lead">
              Bring Collection Centers, Field Phlebotomists, Reference Testing Labs, and Admin
              Operations together on one simple, secure platform with live tracking and verified
              test reports.
            </p>

            <div className="landing-cta-row">
              <button
                type="button"
                className="btn-hero-primary"
                onClick={() => onGoToLogin(UserRole.SMALL_LAB)}
              >
                Choose Your Portal &amp; Sign In →
              </button>
              <a
                href="#workflow"
                className="btn-hero-secondary"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >
                See How It Works
              </a>
            </div>

            <div className="landing-spec-strip">
              <div className="landing-spec-pill">
                <strong style={{ color: '#5EEAD4' }}>2°C – 8°C</strong> Temperature Control
              </div>
              <div className="landing-spec-pill">
                <strong style={{ color: '#5EEAD4' }}>45-Min</strong> Urgent Pickup Target
              </div>
              <div className="landing-spec-pill">
                <strong style={{ color: '#5EEAD4' }}>Google, Password &amp; OTP</strong> Sign-In
              </div>
              <div className="landing-spec-pill">
                <strong style={{ color: '#5EEAD4' }}>Role-Locked</strong> Private Dashboards
              </div>
            </div>
          </div>

          {/* Interactive Role Access Gateway */}
          <div className="landing-hero-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#FFFFFF' }}>
                Website Partner Portals
              </span>
              <span style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.2)', color: '#6EE7B7', padding: '4px 10px', borderRadius: '999px', fontWeight: 700 }}>
                Role Verified
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {WEB_ROLE_CARDS.map((card) => (
                <button
                  key={card.role}
                  type="button"
                  onClick={() => onGoToLogin(card.role)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1.35rem' }}>{card.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                        {ROLE_LABELS[card.role]}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>
                        {card.summary}
                      </div>
                    </div>
                  </div>
                  <span style={{ color: '#5EEAD4', fontWeight: 700, fontSize: '0.85rem' }}>
                    Sign In →
                  </span>
                </button>
              ))}

              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.14)',
                  border: '1px solid rgba(251, 191, 36, 0.35)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  color: '#FEF3C7',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <span style={{ fontSize: '1.35rem' }}>🏍️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#FDE68A' }}>
                    Field Phlebotomists — Mobile App Only
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#FEF3C7', marginTop: '2px' }}>
                    Field riders sign in exclusively through the LabSetu Mobile App.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Role Selection Section */}
      <section id="roles" className="landing-section">
        <div className="landing-section-head">
          <h2>Choose Your Workspace Portal</h2>
          <p>
            Every account is added by our Platform Admin ({ADMIN_LOGIN_EMAIL}) and opens only its
            matching dashboard. Signing into another role portal is automatically blocked.
          </p>
        </div>

        <div className="role-portal-grid">
          {WEB_ROLE_CARDS.map((card) => (
            <div key={card.role} className="role-portal-card">
              <div
                className="role-portal-badge"
                style={{ background: card.accentBg, color: card.accentColor }}
              >
                {card.icon}
              </div>

              <div>
                <h3 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#0F172A' }}>
                  {ROLE_LABELS[card.role]}
                </h3>
                <p style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '6px', lineHeight: 1.5 }}>
                  {card.summary}
                </p>
              </div>

              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                {card.features.map((feat) => (
                  <li key={feat} style={{ fontSize: '0.8rem', color: '#334155', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#0D9488', fontWeight: 800 }}>✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className="btn-primary btn-full"
                onClick={() => onGoToLogin(card.role)}
              >
                Sign In to {ROLE_LABELS[card.role]} →
              </button>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: '20px',
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderRadius: '14px',
            padding: '18px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.6rem' }}>🏍️</span>
            <div>
              <div style={{ fontWeight: 700, color: '#92400E', fontSize: '0.96rem' }}>
                Field Phlebotomist Login Is on the LabSetu Mobile App
              </div>
              <div style={{ fontSize: '0.84rem', color: '#B45309', marginTop: '2px' }}>
                For safety and live GPS sample tracking, phlebotomists can only sign in using the
                LabSetu Mobile App — website sign-in is disabled for courier accounts.
              </div>
            </div>
          </div>
          <span
            style={{
              background: '#FEF3C7',
              color: '#92400E',
              fontWeight: 700,
              fontSize: '0.78rem',
              padding: '6px 12px',
              borderRadius: '999px',
              border: '1px solid #FCD34D',
            }}
          >
            Mobile App Exclusive
          </span>
        </div>
      </section>

      {/* 4-Stage Custody Workflow */}
      <section id="workflow" style={{ background: '#FFFFFF', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
        <div className="landing-section">
          <div className="landing-section-head">
            <h2>Live End-to-End Sample Journey</h2>
            <p>
              From sample pickup booking to verified patient report delivery, every update appears
              instantly across all connected partner screens.
            </p>
          </div>

          <div className="workflow-grid-4">
            <div className="workflow-step-card">
              <span className="workflow-step-num">STEP 01 • COLLECTION CENTER</span>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>
                Pickup Booking &amp; Tube Barcode
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#64748B', lineHeight: 1.55 }}>
                Collection centers register patients, choose tests from live price lists, and
                book a sample pickup with a 5-digit handover code.
              </p>
            </div>

            <div className="workflow-step-card">
              <span className="workflow-step-num">STEP 02 • MOBILE APP ONLY</span>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>
                Cold-Box Collection &amp; Drop
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#64748B', lineHeight: 1.55 }}>
                Field phlebotomists use the LabSetu Mobile App to claim pickups, verify tube codes,
                record box temperatures (2°C–8°C), and confirm lab handover.
              </p>
            </div>

            <div className="workflow-step-card">
              <span className="workflow-step-num">STEP 03 • REFERENCE LAB</span>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>
                Sample Check &amp; PDF Report
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#64748B', lineHeight: 1.55 }}>
                Reference labs check incoming sample condition, process tests across departments,
                and upload signed PDF reports for the collection lab.
              </p>
            </div>

            <div className="workflow-step-card">
              <span className="workflow-step-num">STEP 04 • ADMIN TEAM</span>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>
                Live Monitoring &amp; Settlements
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#64748B', lineHeight: 1.55 }}>
                Platform Admin monitors temperature safety, manages registered partners and users,
                sets service fees, and settles partner payouts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Account Security Section */}
      <section id="security" className="landing-section">
        <div
          style={{
            background: '#062226',
            color: '#FFFFFF',
            borderRadius: '20px',
            padding: '36px 32px',
            display: 'grid',
            gridTemplateColumns: '1.2fr 0.8fr',
            gap: '24px',
            alignItems: 'center',
          }}
        >
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Protected Role Access
            </span>
            <h2 style={{ fontSize: '1.65rem', fontWeight: 800, marginTop: '8px', marginBottom: '12px' }}>
              Every Account Opens Only Its Own Dashboard
            </h2>
            <p style={{ fontSize: '0.92rem', color: '#CBD5E1', lineHeight: 1.65 }}>
              Even if someone selects Admin or Reference Lab on the sign-in screen, their account
              is checked against the Admin-approved directory before opening any dashboard.
              Unregistered emails or mismatched roles are immediately signed out.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ background: 'rgba(255,255,255,0.08)', padding: '14px 16px', borderRadius: '12px', width: '100%' }}>
              <div style={{ fontSize: '0.75rem', color: '#99F6E4', fontWeight: 700 }}>
                PRIMARY ADMIN CONTACT
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '4px' }}>
                {ADMIN_LOGIN_EMAIL}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#CBD5E1', marginTop: '2px' }}>
                Supports Google, Password &amp; Email OTP Sign-In
              </div>
            </div>
            <button
              type="button"
              className="btn-hero-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => onGoToLogin(UserRole.ADMIN)}
            >
              Sign In to Admin Portal →
            </button>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid #E2E8F0', background: '#FFFFFF', padding: '32px 24px', textAlign: 'center', fontSize: '0.84rem', color: '#64748B' }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <a
              href="#roles"
              style={{ color: '#475569', textDecoration: 'none', fontWeight: 600 }}
            >
              Partner Portals
            </a>
            <span style={{ color: '#CBD5E1' }}>•</span>
            <a
              href="#workflow"
              style={{ color: '#475569', textDecoration: 'none', fontWeight: 600 }}
            >
              Workflow
            </a>
            <span style={{ color: '#CBD5E1' }}>•</span>
            <a
              href="#security"
              style={{ color: '#475569', textDecoration: 'none', fontWeight: 600 }}
            >
              Security
            </a>
            <span style={{ color: '#CBD5E1' }}>•</span>
            <button
              type="button"
              onClick={onGoToPrivacy}
              style={{ background: 'none', border: 'none', padding: 0, color: '#0D9488', fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem' }}
            >
              Privacy Policy
            </button>
            <span style={{ color: '#CBD5E1' }}>•</span>
            <button
              type="button"
              onClick={onGoToTerms}
              style={{ background: 'none', border: 'none', padding: 0, color: '#0D9488', fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem' }}
            >
              Terms &amp; Conditions
            </button>
          </div>
          <div>
            © {new Date().getFullYear()} {LABSETU_THEME.brand.name} Diagnostics Network • Connected Sample Pickup &amp; Lab Reporting • All Rights Reserved
          </div>
        </div>
      </footer>
    </div>
  );
}
