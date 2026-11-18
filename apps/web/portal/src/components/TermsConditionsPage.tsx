import React from 'react';
import { LABSETU_THEME, UserRole } from '@diagnostic/shared';
import { ADMIN_LOGIN_EMAIL } from '../firebase';

interface TermsConditionsPageProps {
  onBackToHome: () => void;
  onGoToLogin: (role?: UserRole) => void;
  onGoToPrivacy: () => void;
}

export const TermsConditionsPage: React.FC<TermsConditionsPageProps> = ({
  onBackToHome,
  onGoToLogin,
  onGoToPrivacy,
}) => {
  return (
    <div className="landing-root" style={{ background: '#F8FAFC', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Navigation */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand" onClick={onBackToHome} role="button" tabIndex={0}>
            <div className="landing-brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {LABSETU_THEME.brand.name}
              </div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Partner Terms &amp; Conditions
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={onBackToHome}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '0.86rem',
                fontWeight: 600,
                color: '#334155',
                background: '#F1F5F9',
                border: '1px solid #E2E8F0',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              ← Back to Home
            </button>
            <button
              type="button"
              className="btn-hero-primary"
              style={{ padding: '8px 18px', fontSize: '0.86rem' }}
              onClick={() => onGoToLogin()}
            >
              Portal Sign In
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main style={{ flex: 1, maxWidth: '960px', width: '100%', margin: '0 auto', padding: '40px 24px 64px' }}>
        {/* Banner Card */}
        <div
          style={{
            background: 'linear-gradient(135deg, #062226 0%, #11424B 100%)',
            color: '#FFFFFF',
            borderRadius: '20px',
            padding: '36px 32px',
            boxShadow: '0 10px 30px rgba(6, 34, 38, 0.15)',
            marginBottom: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(94, 234, 212, 0.12)', padding: '4px 10px', borderRadius: '6px' }}>
              B2B Partner Agreement &bull; Diagnostic Logistics Network
            </span>
          </div>
          <h1 style={{ fontSize: '2.1rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            LabSetu Terms of Service
          </h1>
          <p style={{ fontSize: '0.96rem', color: '#CBD5E1', lineHeight: 1.6, margin: 0, maxWidth: '780px' }}>
            These Terms of Service govern your access to and use of the LabSetu Diagnostic Logistics Platform, websites, mobile applications, APIs, and cold-chain sample delivery services.
          </p>
          <div style={{ fontSize: '0.82rem', color: '#94A3B8', marginTop: '6px' }}>
            Last Updated: November 1, 2026 &bull; Legally Enforceable Under the Indian Contract Act, 1872
          </div>
        </div>

        {/* Terms Body in Structured White Card */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid #E2E8F0',
            padding: '40px 36px',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            lineHeight: 1.7,
            color: '#334155',
            fontSize: '0.94rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '32px',
          }}
        >
          {/* Section 1 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-flex', width: '28px', height: '28px', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800 }}>1</span>
              Agreement &amp; Acceptance of Terms
            </h2>
            <p>
              By accessing the LabSetu website (<a href="https://labsetu-diagnostics.web.app" style={{ color: '#0D9488', textDecoration: 'none', fontWeight: 600 }}>labsetu-diagnostics.web.app</a>), installing the LabSetu Phlebo Mobile Application, or utilizing our sample pickup and diagnostic report delivery APIs, you agree to be bound by these Terms of Service. If you are entering into these terms on behalf of a diagnostic clinic, hospital, pathology laboratory, or collection center, you represent that you have the full legal authority to bind that entity.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-flex', width: '28px', height: '28px', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800 }}>2</span>
              Platform Architecture &amp; Roles
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                <strong style={{ color: '#0F172A' }}>A. Small Diagnostic Centers / Collection Labs:</strong> Authorized to create diagnostic test orders, generate unique barcode labels for blood/urine specimens, select partner testing hubs, request on-demand phlebotomist pickups, and track delivery status until final doctor-signed PDF report generation.
              </div>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                <strong style={{ color: '#0F172A' }}>B. Certified Testing Hubs / Reference Labs:</strong> Responsible for accepting arriving specimens, verifying cooler box temperature logs (2°C–8°C), evaluating specimen physical integrity (checking for hemolysis or clotting), conducting authorized clinical tests, and uploading authenticated pathology reports.
              </div>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                <strong style={{ color: '#0F172A' }}>C. Independent Certified Phlebotomists &amp; Field Couriers:</strong> Field logistics partners operating the LabSetu Mobile App. Responsible for inspecting sample barcodes, verifying OTPs upon pickup, maintaining thermal insulation during transport, and delivering specimens promptly to the designated testing facility.
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-flex', width: '28px', height: '28px', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800 }}>3</span>
              Specimen Custody, OTP Verification &amp; Cold Chain Mandates
            </h2>
            <ul style={{ paddingLeft: '22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <li><strong>Mandatory Digital Handshake:</strong> No sample may be handed over to a phlebotomist without completing the 4-digit pickup OTP verification in the mobile app. Handover without OTP verification is strictly prohibited and constitutes a breach of protocol.</li>
              <li><strong>Barcoding &amp; Labeling:</strong> The originating collection center is strictly responsible for adhering printed barcode labels onto the correct primary sample tubes (EDTA purple, plain red/gel serum, fluoride grey, etc.) matching the patient identifier.</li>
              <li><strong>Cold Chain Maintenance:</strong> All temperature-sensitive specimens must be transported within validated cooler boxes with conditioned frozen gel packs maintaining an internal temperature between <strong>2°C and 8°C</strong>. Any temperature excursions beyond permissible thresholds must be logged and reported immediately.</li>
              <li><strong>Sample Rejection Criteria:</strong> Reference laboratories reserve the absolute right to reject specimens that are haemolysed, lipaemic, clotted, improperly labeled, or outside acceptable temperature ranges upon delivery, as required by NABL / ISO 15189 diagnostic accreditation standards.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-flex', width: '28px', height: '28px', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800 }}>4</span>
              Turnaround Time (TAT) &amp; Cancellation Policy
            </h2>
            <p>
              Collection centers and testing hubs operate under agreed Turnaround Time (TAT) service levels:
            </p>
            <ul style={{ paddingLeft: '22px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li><strong>Pickup Window:</strong> On-duty phlebotomists are dispatched to arrive at the pickup location within the estimated arrival time shown in the app (typically 15 to 45 minutes depending on distance and traffic).</li>
              <li><strong>Order Cancellation:</strong> A collection center may cancel an order free of charge before a phlebotomist accepts or reaches within 500 meters of the pickup clinic. If cancelled after arrival, a nominal trip cancellation fee may apply to compensate the field rider.</li>
              <li><strong>Cancelled Bookings Gating:</strong> Once an order is officially marked cancelled, all custody actions (Pay Now, Barcode Print, Custody Handover) are immediately frozen and locked to prevent unauthorized processing.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-flex', width: '28px', height: '28px', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800 }}>5</span>
              Pricing, Multi-Party Settlements &amp; Invoicing
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginTop: '10px' }}>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>💳 Automated Escrow Splits</h3>
                <p style={{ fontSize: '0.86rem', color: '#475569', margin: 0 }}>
                  Order payments collected via online payment links or prepaid balances are securely split between reference lab testing charges, phlebotomy logistics compensation, and LabSetu network facilitation fees.
                </p>
              </div>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>📑 Tax Invoices &amp; GST</h3>
                <p style={{ fontSize: '0.86rem', color: '#475569', margin: 0 }}>
                  LabSetu issues GST-compliant tax invoices for platform software services. Diagnostic medical laboratory testing and clinical pathology services are billed directly by the performing licensed laboratory.
                </p>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-flex', width: '28px', height: '28px', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800 }}>6</span>
              Limitation of Medical Liability
            </h2>
            <div style={{ background: '#FFFBEB', borderLeft: '4px solid #F59E0B', padding: '16px 20px', borderRadius: '0 8px 8px 0', fontSize: '0.9rem', color: '#78350F' }}>
              <strong>Important Healthcare Disclaimer:</strong> LabSetu is a technology, routing, and logistics management platform. LabSetu does NOT operate medical diagnostic equipment, conduct biological analysis, or author clinical diagnostic findings. Clinical accuracy, diagnostic interpretations, and patient care decisions are the sole and exclusive medical responsibility of the analyzing laboratory and certifying medical pathologist.
            </div>
          </section>

          {/* Section 7 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-flex', width: '28px', height: '28px', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800 }}>7</span>
              Governing Law &amp; Dispute Resolution
            </h2>
            <p>
              These Terms of Service are governed by and construed in accordance with the laws of India. Any controversy, claim, or dispute arising out of or relating to these terms shall be settled through good-faith mutual negotiations. In the event negotiations fail, disputes shall be submitted to the exclusive jurisdiction of the competent courts of New Delhi, India.
            </p>
          </section>

          {/* Section 8 - Contact */}
          <section style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
              8. Contact &amp; Legal Support
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '12px' }}>
              For queries regarding these Terms of Service, partnership contracts, or billing reconciliation, please reach out to:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.88rem' }}>
              <div><strong>Operations Head:</strong> LabSetu Legal &amp; Compliance Team</div>
              <div><strong>Email:</strong> <a href={`mailto:${ADMIN_LOGIN_EMAIL}`} style={{ color: '#0D9488', fontWeight: 600, textDecoration: 'none' }}>{ADMIN_LOGIN_EMAIL}</a></div>
              <div><strong>Website:</strong> <a href="https://labsetu-diagnostics.web.app" style={{ color: '#0D9488', fontWeight: 600, textDecoration: 'none' }}>https://labsetu-diagnostics.web.app</a></div>
            </div>
          </section>

          {/* Bottom Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <button
              type="button"
              onClick={onGoToPrivacy}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#0D9488',
                fontWeight: 700,
                fontSize: '0.92rem',
                cursor: 'pointer',
                padding: '6px 0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              ← Read Privacy Policy
            </button>
            <button
              type="button"
              onClick={onBackToHome}
              className="btn-hero-primary"
              style={{ padding: '8px 20px', fontSize: '0.88rem' }}
            >
              Back to LabSetu Home
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #E2E8F0', background: '#FFFFFF', padding: '24px', textAlign: 'center', fontSize: '0.82rem', color: '#64748B', marginTop: 'auto' }}>
        © {new Date().getFullYear()} {LABSETU_THEME.brand.name} Diagnostics Network • Connected Sample Pickup &amp; Lab Reporting • All Rights Reserved
      </footer>
    </div>
  );
};
