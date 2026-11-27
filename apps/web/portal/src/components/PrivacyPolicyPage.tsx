import React from 'react';
import { LABSETU_THEME, UserRole } from '@diagnostic/shared';
import { LabSetuLogo } from '@diagnostic/shared/web/LabSetuLogo';
import { ADMIN_LOGIN_EMAIL } from '../firebase';

interface PrivacyPolicyPageProps {
  onBackToHome: () => void;
  onGoToLogin: (role?: UserRole) => void;
  onGoToTerms: () => void;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({
  onBackToHome,
  onGoToLogin,
  onGoToTerms,
}) => {
  return (
    <div className="landing-root" style={{ background: '#F8FAFC', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Navigation */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand" onClick={onBackToHome} role="button" tabIndex={0}>
            <LabSetuLogo variant="full" width={40} height={40} alt="LabSetu" />
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {LABSETU_THEME.brand.name}
              </div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Trust &amp; Privacy Center
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
            background: 'linear-gradient(135deg, #062226 0%, #0D3E46 100%)',
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
              Statutory Compliance &bull; DPDP Act 2023 &bull; IT Act 2000
            </span>
          </div>
          <h1 style={{ fontSize: '2.1rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            LabSetu Privacy Policy
          </h1>
          <p style={{ fontSize: '0.96rem', color: '#CBD5E1', lineHeight: 1.6, margin: 0, maxWidth: '780px' }}>
            This Privacy Policy describes how LabSetu Diagnostics Network (&quot;LabSetu&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, protects, processes, and safeguards personal data, diagnostic specimen telemetry, and business partner records across our web portals, APIs, and phlebotomy logistics mobile applications.
          </p>
          <div style={{ fontSize: '0.82rem', color: '#94A3B8', marginTop: '6px' }}>
            Effective Date: November 1, 2026 &bull; Version 2.4 (Enterprise Healthcare Release)
          </div>
        </div>

        {/* Policy Body in Structured White Card */}
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
              Platform Role &amp; Data Protection Principles
            </h2>
            <p>
              LabSetu operates an inter-laboratory diagnostic logistics and workflow technology network connecting Clinical Testing Laboratories (Reference Hubs), Small Diagnostic Centers/Collection Labs, and Certified Field Phlebotomists. We process health records and specimen tracking telemetry strictly as a secure technology facilitator and Data Fiduciary/Processor under the <strong>Digital Personal Data Protection Act (DPDP Act 2023)</strong> and the <strong>Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011</strong>.
            </p>
            <div style={{ background: '#F8FAFC', borderLeft: '4px solid #0D9488', padding: '14px 18px', borderRadius: '0 8px 8px 0', marginTop: '12px', fontSize: '0.9rem', color: '#475569' }}>
              <strong>Principle of Minimum Necessity:</strong> We collect only the data strictly essential to execute specimen pick-ups, preserve temperature cold-chain integrity, deliver doctor-signed diagnostic reports, and process verified billing settlements.
            </div>
          </section>

          {/* Section 2 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-flex', width: '28px', height: '28px', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800 }}>2</span>
              Categories of Information We Collect
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '14px' }}>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '18px' }}>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                  🏥 Partner Diagnostic Labs
                </h3>
                <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '0.88rem', color: '#475569' }}>
                  <li>Lab business legal name, clinical establishment license &amp; NABL certification</li>
                  <li>Physical pickup/drop facility addresses &amp; operating hours</li>
                  <li>Authorized lab director, technician names, phone numbers &amp; official email</li>
                  <li>Bank account details for payout processing &amp; GST identification numbers</li>
                </ul>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '18px' }}>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                  🛵 Phlebotomists &amp; Field Agents
                </h3>
                <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '0.88rem', color: '#475569' }}>
                  <li>Government identity proof (Aadhaar / PAN / Driving License) &amp; photo</li>
                  <li>Emergency contact details, verified mobile phone number &amp; age/gender</li>
                  <li>Real-time GPS location coordinates (only while marked On-Duty or actively transporting specimens)</li>
                  <li>Bank account / UPI VPA details for direct automated commission disbursements</li>
                </ul>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '18px' }}>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                  🧪 Specimen &amp; Patient Metadata
                </h3>
                <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '0.88rem', color: '#475569' }}>
                  <li>Patient basic demographic details (Name, Age, Gender, Contact number) provided by the originating lab</li>
                  <li>Test panels requested (e.g. CBC, Lipid Profile, Thyroid, HbA1c)</li>
                  <li>Specimen tube barcodes, vial types (EDTA, Serum, Sodium Fluoride) &amp; sample collection timestamps</li>
                  <li>Insulated bag / cold-box temperature logs (2°C–8°C compliance) during transit</li>
                </ul>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '18px' }}>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                  📱 Technical &amp; Device Data
                </h3>
                <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '0.88rem', color: '#475569' }}>
                  <li>Device model, OS version, unique hardware identifiers, and IP addresses</li>
                  <li>Network connectivity status (WiFi/Cellular) and battery metrics for logistics reliability</li>
                  <li>Audit access timestamps, crash analytics, and secure session tokens</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-flex', width: '28px', height: '28px', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800 }}>3</span>
              How We Use Collected Information
            </h2>
            <p>LabSetu uses collected data exclusively for authorized healthcare and logistics functions:</p>
            <ul style={{ paddingLeft: '22px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><strong>Dynamic Phlebotomist Dispatch:</strong> Matching pickup requests from collection labs with nearest available on-duty phlebotomists based on GPS proximity and specimen handling qualifications.</li>
              <li><strong>Chain-of-Custody Verification:</strong> Enforcing tamper-proof sample handovers through dual-party OTP authentication, barcode scanning, and timestamped digital signatures.</li>
              <li><strong>Cold-Chain Monitoring:</strong> Tracking and logging specimen cooling bag temperatures to prevent sample degradation or haemolysis during transport.</li>
              <li><strong>Diagnostic Report Delivery:</strong> Enabling testing hubs to upload doctor-verified PDF test reports securely to referring clinics.</li>
              <li><strong>Automated Financial Settlements:</strong> Calculating tiered split commissions, courier earnings, lab testing fees, and generating GST-compliant invoices.</li>
              <li><strong>Fraud Prevention &amp; Safety:</strong> Preventing unauthorized logins, role elevation tampering, and ensuring field personnel safety through live dispatch radar.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-flex', width: '28px', height: '28px', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800 }}>4</span>
              Data Protection &amp; Security Safeguards
            </h2>
            <p>
              We implement industry-grade technical and organizational security measures to protect healthcare information against loss, unauthorized access, or disclosure:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginTop: '12px' }}>
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontWeight: 700, color: '#0D9488', fontSize: '0.9rem', marginBottom: '4px' }}>🔒 256-Bit TLS &amp; AES Encryption</div>
                <div style={{ fontSize: '0.84rem', color: '#475569' }}>All data in transit is encrypted using TLS 1.3 / HTTPS. All database records and diagnostic reports at rest are secured with AES-256 encryption.</div>
              </div>
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontWeight: 700, color: '#0D9488', fontSize: '0.9rem', marginBottom: '4px' }}>🛡️ Strict Role-Based Isolation</div>
                <div style={{ fontSize: '0.84rem', color: '#475569' }}>Strict database security rules ensure Small Labs can only access their own patients, and field riders can only see their current active pickup.</div>
              </div>
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontWeight: 700, color: '#0D9488', fontSize: '0.9rem', marginBottom: '4px' }}>💳 PCI-DSS Compliant Payments</div>
                <div style={{ fontSize: '0.84rem', color: '#475569' }}>Payment processing is conducted via Reserve Bank of India (RBI) authorized aggregators (Razorpay). No credit card numbers or CVVs are stored on our servers.</div>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-flex', width: '28px', height: '28px', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800 }}>5</span>
              Data Sharing &amp; Third-Party Disclosures
            </h2>
            <p>
              We do <strong>not sell, trade, or rent</strong> diagnostic health data, patient records, or phlebotomist personal information to advertisers or non-affiliated third parties. Information is disclosed solely in the following controlled scenarios:
            </p>
            <ul style={{ paddingLeft: '22px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><strong>Designated Testing Laboratories:</strong> Sample identifiers, barcode tags, and clinical panel requests are shared with the specific reference lab chosen by the collection center to analyze the specimen.</li>
              <li><strong>Assigned Field Phlebotomists:</strong> Order pickup and delivery addresses, contact numbers, and special handling instructions (e.g. fasting, temperature sensitivity) are shared only with the accepted phlebotomist.</li>
              <li><strong>Cloud &amp; Infrastructure Providers:</strong> Highly certified enterprise infrastructure partners (Google Cloud Platform, Firebase) operating under strict data processing agreements.</li>
              <li><strong>Statutory and Legal Mandates:</strong> Where required by applicable Indian law, court subpoena, or public health disease surveillance mandates issued by authorized health authorities (e.g. ICMR/NCDC).</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-flex', width: '28px', height: '28px', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800 }}>6</span>
              Data Retention &amp; User Rights
            </h2>
            <p>
              Diagnostic specimen custody records, temperature logs, and patient report histories are retained in compliance with Indian clinical establishment guidelines and statutory medical record-keeping requirements (typically 3 to 5 years).
            </p>
            <p style={{ marginTop: '10px' }}>
              As a partner laboratory or registered user, you possess the right to:
            </p>
            <ul style={{ paddingLeft: '22px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>Request an audit copy of your laboratory profile and sample processing records.</li>
              <li>Update or correct inaccurate contact, billing, or representative details.</li>
              <li>Request account deactivation upon conclusion of contractual obligations and financial reconciliation.</li>
            </ul>
          </section>

          {/* Section 7 - Grievance Officer */}
          <section style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
              7. Grievance Redressal &amp; Data Protection Officer (DPO)
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '12px' }}>
              In accordance with the Information Technology Act 2000 and DPDP Act 2023, the designated Grievance Officer for LabSetu Diagnostics Network is:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.88rem' }}>
              <div><strong>Grievance Officer:</strong> Vikas (Founder &amp; Technology Lead)</div>
              <div><strong>Email:</strong> <a href={`mailto:${ADMIN_LOGIN_EMAIL}`} style={{ color: '#0D9488', fontWeight: 600, textDecoration: 'none' }}>{ADMIN_LOGIN_EMAIL}</a></div>
              <div><strong>Organization:</strong> LabSetu Diagnostics Healthcare Network</div>
              <div><strong>Response Turnaround:</strong> Within 48 hours for data privacy or security inquiries.</div>
            </div>
          </section>

          {/* Bottom Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <button
              type="button"
              onClick={onGoToTerms}
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
              Read Terms &amp; Conditions →
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
