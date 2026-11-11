import { LABSETU_THEME, ROLE_LABELS, UserRole } from '@diagnostic/shared';
import { ADMIN_LOGIN_EMAIL } from '../firebase';

interface LandingPageProps {
  onGoToLogin: (role?: UserRole) => void;
}

const ROLE_CARDS: {
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
    summary: 'Central network governance, role provisioning & billing reconciliation.',
    features: [
      'Provision Small Labs, Reference Labs & Phlebotomists',
      'Live Firestore bookings, cold-chain audit & SLA controls',
      'Dynamic GMV splits, settlements & master test catalogue',
    ],
  },
  {
    role: UserRole.SMALL_LAB,
    icon: '🏥',
    accentBg: '#EFF6FF',
    accentColor: '#2563EB',
    summary: 'Collection center sample dispatch, patient registry & report retrieval.',
    features: [
      'Create pickup bookings with live test catalogue & labs',
      'Patient directory & real-time chain-of-custody tracking',
      'Download pathologist-signed PDF reports from Storage',
    ],
  },
  {
    role: UserRole.LARGE_LAB,
    icon: '🔬',
    accentBg: '#F0FDFA',
    accentColor: '#0D9488',
    summary: 'Reference testing core lab QC accessioning, analyzers & reporting.',
    features: [
      'Inspect cooler arrival temperature (2°C–8°C) & specimen QC',
      'Department testing worklists & Firebase PDF publishing',
      'Manage B2B rate schedules, turnaround SLA & receivables',
    ],
  },
  {
    role: UserRole.PHLEBOTOMIST,
    icon: '🏍️',
    accentBg: '#FFFBEB',
    accentColor: '#D97706',
    summary: 'Certified field courier companion for cold-chain sample pickup & drop.',
    features: [
      'Accept open dispatch bookings & verify tube barcodes',
      'Log cooler temperature & 5-digit receiving handover OTP',
      'Track shift status (Online/Break/Offline) & live earnings',
    ],
  },
];

export function LandingPage({ onGoToLogin }: LandingPageProps) {
  return (
    <div className="landing-root">
      {/* Sticky Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="landing-brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                {LABSETU_THEME.brand.name}
              </div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0D9488' }}>
                Cold-Chain Diagnostic Network
              </div>
            </div>
          </div>

          <div className="landing-nav-links">
            <a href="#roles" className="landing-nav-link">Role Portals</a>
            <a href="#workflow" className="landing-nav-link">Custody Workflow</a>
            <a href="#security" className="landing-nav-link">RBAC &amp; Firebase</a>
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
              onClick={() => onGoToLogin()}
            >
              Role Login Portal →
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="landing-hero">
        <div className="landing-hero-inner">
          <div>
            <div className="landing-eyebrow">
              <span>●</span> Cloud Firestore Live • Project labsetu-diagnostics
            </div>

            <h1 className="landing-h1">
              Connected Diagnostic Sample Logistics &amp; Cold-Chain Network
            </h1>

            <p className="landing-lead">
              Unify Small Collection Centers, Certified Phlebotomists, NABL Reference Testing Labs,
              and Platform Admin Command on one strictly role-locked Firebase platform—backed 100% by
              live Cloud Firestore records and encrypted Storage reports.
            </p>

            <div className="landing-cta-row">
              <button
                type="button"
                className="btn-hero-primary"
                onClick={() => onGoToLogin()}
              >
                Select Your Role &amp; Sign In →
              </button>
              <a
                href="#workflow"
                className="btn-hero-secondary"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >
                Explore 4-Stage Custody Flow
              </a>
            </div>

            <div className="landing-spec-strip">
              <div className="landing-spec-pill">
                <strong style={{ color: '#5EEAD4' }}>2°C – 8°C</strong> Cold-Chain Band
              </div>
              <div className="landing-spec-pill">
                <strong style={{ color: '#5EEAD4' }}>45-Min</strong> STAT Dispatch SLA
              </div>
              <div className="landing-spec-pill">
                <strong style={{ color: '#5EEAD4' }}>Google + Password + OTP</strong> Auth
              </div>
              <div className="landing-spec-pill">
                <strong style={{ color: '#5EEAD4' }}>Strict Role Lock</strong> Zero Cross-Access
              </div>
            </div>
          </div>

          {/* Interactive Architecture Panel (Architecture & Live Specs — No Dummy Metrics) */}
          <div className="landing-hero-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#FFFFFF' }}>
                Live Role Access Gateway
              </span>
              <span style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.2)', color: '#6EE7B7', padding: '4px 10px', borderRadius: '999px', fontWeight: 700 }}>
                RBAC Enforced
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {ROLE_CARDS.map((card) => (
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
                    Login →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Role Selection Section */}
      <section id="roles" className="landing-section">
        <div className="landing-section-head">
          <h2>Choose Your Role Dashboard</h2>
          <p>
            Every account in LabSetu is provisioned by Platform Admin ({ADMIN_LOGIN_EMAIL}) and locked
            to a single dashboard role. Trying to sign in under another role automatically blocks access.
          </p>
        </div>

        <div className="role-portal-grid">
          {ROLE_CARDS.map((card) => (
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
                Login to {ROLE_LABELS[card.role]} →
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 4-Stage Custody Workflow */}
      <section id="workflow" style={{ background: '#FFFFFF', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
        <div className="landing-section">
          <div className="landing-section-head">
            <h2>100% Live Cloud Firestore Specimen Pipeline</h2>
            <p>
              From collection request to verified diagnostic report upload, every state change persists
              directly to Cloud Firestore and updates connected dashboards in real time.
            </p>
          </div>

          <div className="workflow-grid-4">
            <div className="workflow-step-card">
              <span className="workflow-step-num">STAGE 01 • SMALL LAB</span>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>
                Pickup Booking &amp; Barcode Issue
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#64748B', lineHeight: 1.55 }}>
                Collection centers register patients, choose panels from live test tariffs, and dispatch
                bookings with a 5-digit handover OTP.
              </p>
            </div>

            <div className="workflow-step-card">
              <span className="workflow-step-num">STAGE 02 • PHLEBOTOMIST</span>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>
                Cold-Chain Collection &amp; Handover
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#64748B', lineHeight: 1.55 }}>
                Couriers claim requests, verify vial barcodes, log cooler temperatures (2°C–8°C), and
                confirm lab delivery via OTP.
              </p>
            </div>

            <div className="workflow-step-card">
              <span className="workflow-step-num">STAGE 03 • REFERENCE LAB</span>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>
                QC Accessioning &amp; PDF Report
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#64748B', lineHeight: 1.55 }}>
                Receiving hubs check specimen integrity, run analyzer queues, and upload signed PDF reports
                to Firebase Cloud Storage.
              </p>
            </div>

            <div className="workflow-step-card">
              <span className="workflow-step-num">STAGE 04 • ADMIN COMMAND</span>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>
                Real-Time Governance &amp; Settlements
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#64748B', lineHeight: 1.55 }}>
                Platform Admin audits temperature logs, manages verified labs &amp; users, configures
                commissions, and reconciles payouts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* RBAC & Security Section */}
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
              Strict Zero-Trust Role Protection
            </span>
            <h2 style={{ fontSize: '1.65rem', fontWeight: 800, marginTop: '8px', marginBottom: '12px' }}>
              Role Selection Never Grants Unauthorized Access
            </h2>
            <p style={{ fontSize: '0.92rem', color: '#CBD5E1', lineHeight: 1.65 }}>
              Even if someone selects Platform Admin or Reference Lab on the login screen, Firebase
              Authentication &amp; Firestore Security Rules verify their email against the Admin-managed{' '}
              <code>user_directory</code> ({ADMIN_LOGIN_EMAIL}). Unprovisioned emails or mismatched roles
              are immediately signed out and blocked.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ background: 'rgba(255,255,255,0.08)', padding: '14px 16px', borderRadius: '12px', width: '100%' }}>
              <div style={{ fontSize: '0.75rem', color: '#99F6E4', fontWeight: 700 }}>
                ROOT PLATFORM OWNER ACCOUNT
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '4px' }}>
                {ADMIN_LOGIN_EMAIL}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#CBD5E1', marginTop: '2px' }}>
                Locked to ADMIN • Firebase Auth &amp; Security Rules verified
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

      <footer style={{ borderTop: '1px solid #E2E8F0', background: '#FFFFFF', padding: '24px', textAlign: 'center', fontSize: '0.82rem', color: '#64748B' }}>
        © {new Date().getFullYear()} {LABSETU_THEME.brand.name} Diagnostics Network • Live on Firebase Project{' '}
        <code>labsetu-diagnostics</code>
      </footer>
    </div>
  );
}

