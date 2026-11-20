import { useState, useMemo } from 'react';
import {
  DEFAULT_PLATFORM_FAQS,
  DEFAULT_PLATFORM_SOPS,
  DEFAULT_SUPPORT_CONTACTS,
  type PlatformFaqDocument,
  type PlatformSopDocument,
  type SupportContactsConfig,
} from '@diagnostic/shared';

export interface SmallLabSupportTabProps {
  facilityName: string;
  facilityId: string;
  accountEmail: string;
  supportContacts?: SupportContactsConfig;
  platformSops?: PlatformSopDocument[];
  platformFaqs?: PlatformFaqDocument[];
}

export function SmallLabSupportTab({
  facilityName,
  facilityId,
  accountEmail,
  supportContacts = DEFAULT_SUPPORT_CONTACTS,
  platformSops,
  platformFaqs,
}: SmallLabSupportTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'contacts' | 'sops' | 'faqs'>('contacts');
  const [sopCategoryFilter, setSopCategoryFilter] = useState<string>('all');
  const [faqCategoryFilter, setFaqCategoryFilter] = useState<string>('all');
  const [faqSearchQuery, setFaqSearchQuery] = useState('');
  const [expandedSopId, setExpandedSopId] = useState<string | null>('sop-draw');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>('faq-1');

  const contacts = supportContacts || DEFAULT_SUPPORT_CONTACTS;
  const emergencyPhone = contacts.emergencyPhone || '+9118008897388';
  const displayEmergencyPhone = contacts.displayEmergencyPhone || '1800-889-SETU (1800-889-7388)';
  const dispatchMobile = contacts.dispatchMobile || '+919820012345';
  const displayDirectMobile = contacts.displayDirectMobile || '+91 98200 12345';
  const supportEmail = contacts.supportEmail || 'support@labsetu.com';
  const operatingHours = contacts.operatingHours || '6:00 AM – 11:00 PM (All 7 Days)';
  const dispatchSla = contacts.dispatchSla || '< 5 Mins Immediate Dispatch Response';

  const cleanWaNumber = dispatchMobile.replace(/[^\d]/g, '');
  const whatsappUrl = `https://wa.me/${cleanWaNumber}?text=${encodeURIComponent(
    `Hello LabSetu Support Desk, I am contacting from Collection Lab: ${facilityName} (${facilityId}).`
  )}`;

  const sops = useMemo(() => {
    const list = platformSops && platformSops.length > 0 ? platformSops : DEFAULT_PLATFORM_SOPS;
    return list.filter(
      (s) =>
        s.isActive !== false &&
        (s.targetRoles.includes('ALL') || s.targetRoles.includes('SMALL_LAB'))
    );
  }, [platformSops]);

  const filteredSops = useMemo(() => {
    if (sopCategoryFilter === 'all') return sops;
    return sops.filter((s) => s.category === sopCategoryFilter);
  }, [sops, sopCategoryFilter]);

  const faqs = useMemo(() => {
    const list = platformFaqs && platformFaqs.length > 0 ? platformFaqs : DEFAULT_PLATFORM_FAQS;
    return list.filter(
      (f) =>
        f.isActive !== false &&
        (f.targetRoles.includes('ALL') || f.targetRoles.includes('SMALL_LAB'))
    );
  }, [platformFaqs]);

  const filteredFaqs = useMemo(() => {
    const q = faqSearchQuery.trim().toLowerCase();
    return faqs.filter((f) => {
      const matchCat = faqCategoryFilter === 'all' || f.category.toLowerCase() === faqCategoryFilter.toLowerCase();
      const matchSearch =
        !q ||
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [faqs, faqCategoryFilter, faqSearchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner Navigation */}
      <div
        className="chart-card-modern"
        style={{
          background: 'linear-gradient(135deg, #0A2A5E 0%, #0F766E 100%)',
          color: '#FFFFFF',
          borderRadius: '16px',
          padding: '24px',
          border: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px' }}>
              <span>🎧</span> Unified 24x7 Diagnostic Support &amp; Knowledge Base
            </div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: '0 0 6px', color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              Partner Lab Support &amp; Standard Operating Procedures
            </h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#E2E8F0', maxWidth: '640px', lineHeight: 1.5 }}>
              Dedicated assistance for <strong>{facilityName}</strong> ({facilityId}). Live dispatch hotline, specimen cold-chain SOPs, and billing answers synced live with Central Admin.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <a
              href={`tel:${emergencyPhone}`}
              className="btn-primary"
              style={{
                background: '#E11D48',
                borderColor: '#E11D48',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 700,
                textDecoration: 'none',
                padding: '9px 16px',
              }}
            >
              <span>🚨</span>
              <span>Emergency SOS: {displayEmergencyPhone}</span>
            </a>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
              style={{
                background: '#FFFFFF',
                color: '#0F766E',
                borderColor: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 700,
                textDecoration: 'none',
                padding: '9px 16px',
              }}
            >
              <span>💬</span>
              <span>WhatsApp Dispatch</span>
            </a>
          </div>
        </div>

        {/* Sub-tab pills */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '22px', borderTop: '1px solid rgba(255,255,255,0.18)', paddingTop: '16px' }}>
          <button
            type="button"
            onClick={() => setActiveSubTab('contacts')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: activeSubTab === 'contacts' ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
              color: activeSubTab === 'contacts' ? '#0A2A5E' : '#FFFFFF',
              transition: 'all 0.15s ease',
            }}
          >
            📞 Emergency &amp; Support Contacts
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('sops')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: activeSubTab === 'sops' ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
              color: activeSubTab === 'sops' ? '#0A2A5E' : '#FFFFFF',
              transition: 'all 0.15s ease',
            }}
          >
            📋 Official Diagnostic SOPs ({sops.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('faqs')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: activeSubTab === 'faqs' ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
              color: activeSubTab === 'faqs' ? '#0A2A5E' : '#FFFFFF',
              transition: 'all 0.15s ease',
            }}
          >
            ❓ Frequently Asked Questions ({faqs.length})
          </button>
        </div>
      </div>

      {/* VIEW 1: CONTACTS */}
      {activeSubTab === 'contacts' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div className="chart-card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                🚨
              </div>
              <div>
                <div style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                  Critical Specimen Emergency
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                  24x7 SOS Dispatch Hotline
                </div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#475569', lineHeight: 1.5 }}>
              Use immediately for temperature logger alerts (&gt;8°C), sample leakage, transit accidents, or emergency re-routing.
            </p>
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ fontSize: '0.74rem', color: '#991B1B', fontWeight: 600 }}>Toll-Free Hotline</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#DC2626' }}>{displayEmergencyPhone}</div>
            </div>
            <a
              href={`tel:${emergencyPhone}`}
              className="btn-primary"
              style={{ textAlign: 'center', textDecoration: 'none', background: '#DC2626', borderColor: '#DC2626' }}
            >
              Call SOS Desk Now
            </a>
          </div>

          <div className="chart-card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                💬
              </div>
              <div>
                <div style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                  Direct Operational Dispatch
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                  WhatsApp &amp; Live Calling
                </div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#475569', lineHeight: 1.5 }}>
              Live courier ETA coordination, surge radius adjustments, sample handover OTP verification, and vacutainer supply restocks.
            </p>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ fontSize: '0.74rem', color: '#166534', fontWeight: 600 }}>Mobile &amp; WhatsApp</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#16A34A' }}>{displayDirectMobile}</div>
            </div>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
              style={{ textAlign: 'center', textDecoration: 'none', background: '#059669', borderColor: '#059669' }}
            >
              Open WhatsApp Chat
            </a>
          </div>

          <div className="chart-card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#E0F2FE', color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                ✉️
              </div>
              <div>
                <div style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                  Billing &amp; Formal Enquiries
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                  Support Email &amp; SLA
                </div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#475569', lineHeight: 1.5 }}>
              Weekly B2B ledger reconciliations, invoice queries, doctor-signed PDF revisions, and new reference testing lab tie-ups.
            </p>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Official Email</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>{supportEmail}</div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>Account: {accountEmail}</div>
              <div style={{ fontSize: '0.72rem', color: '#0D9488', fontWeight: 700, marginTop: '4px' }}>
                ⚡ {dispatchSla} • {operatingHours}
              </div>
            </div>
            <a
              href={`mailto:${supportEmail}?subject=Support Request from ${encodeURIComponent(facilityName)} (${encodeURIComponent(facilityId)})`}
              className="btn-secondary"
              style={{ textAlign: 'center', textDecoration: 'none' }}
            >
              Send Support Email
            </a>
          </div>
        </div>
      )}

      {/* VIEW 2: STANDARD OPERATING PROCEDURES */}
      {activeSubTab === 'sops' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'All SOPs' },
                { id: 'draw', label: '🩸 Order of Draw' },
                { id: 'cold', label: '❄️ Cold-Chain' },
                { id: 'safety', label: '🛡️ Handover & OTP' },
                { id: 'general', label: '📋 General' },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSopCategoryFilter(c.id)}
                  className={`btn-secondary ${sopCategoryFilter === c.id ? 'active' : ''}`}
                  style={{
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: sopCategoryFilter === c.id ? '#0D9488' : undefined,
                    color: sopCategoryFilter === c.id ? '#FFFFFF' : undefined,
                    borderColor: sopCategoryFilter === c.id ? '#0D9488' : undefined,
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>
              Showing {filteredSops.length} active procedure{filteredSops.length === 1 ? '' : 's'}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {filteredSops.map((sop) => {
              const isOpen = expandedSopId === sop.id;
              return (
                <div
                  key={sop.id}
                  className="chart-card-modern"
                  style={{
                    borderRadius: '12px',
                    border: isOpen ? '1.5px solid #0D9488' : '1px solid #E2E8F0',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    onClick={() => setExpandedSopId(isOpen ? null : sop.id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0A2A5E', background: '#EFF6FF', padding: '2px 8px', borderRadius: '4px' }}>
                          {sop.number}
                        </span>
                        {sop.badge && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              color: sop.badgeColor || '#0D9488',
                              background: '#F0FDFA',
                              border: `1px solid ${sop.badgeColor || '#0D9488'}33`,
                              padding: '2px 7px',
                              borderRadius: '4px',
                            }}
                          >
                            {sop.badge}
                          </span>
                        )}
                      </div>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                        {sop.title}
                      </h3>
                      {sop.subtitle && (
                        <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                          {sop.subtitle}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.76rem', color: '#94A3B8', fontWeight: 600 }}>
                        {sop.steps?.length || 0} Steps
                      </span>
                      <span style={{ fontSize: '18px', color: '#0D9488', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        ▼
                      </span>
                    </div>
                  </div>

                  {isOpen && sop.steps && (
                    <div style={{ marginTop: '16px', borderTop: '1px solid #E2E8F0', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {sop.steps.map((step, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '10px',
                            padding: '12px 14px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                              {step.title}
                            </div>
                            {step.tag && (
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 800,
                                  color: step.tagColor || '#0D9488',
                                  background: '#FFFFFF',
                                  border: `1px solid ${step.tagColor || '#0D9488'}44`,
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                }}
                              >
                                {step.tag}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
                            {step.description}
                          </div>

                          {step.warning && (
                            <div
                              style={{
                                marginTop: '8px',
                                background: '#FEF2F2',
                                borderLeft: '3px solid #EF4444',
                                borderRadius: '4px',
                                padding: '6px 10px',
                                fontSize: '0.78rem',
                                color: '#991B1B',
                                fontWeight: 600,
                              }}
                            >
                              ⚠️ {step.warning}
                            </div>
                          )}

                          {step.tip && (
                            <div
                              style={{
                                marginTop: '8px',
                                background: '#F0FDFA',
                                borderLeft: '3px solid #0D9488',
                                borderRadius: '4px',
                                padding: '6px 10px',
                                fontSize: '0.78rem',
                                color: '#0F766E',
                                fontWeight: 600,
                              }}
                            >
                              💡 Tip: {step.tip}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 3: FREQUENTLY ASKED QUESTIONS */}
      {activeSubTab === 'faqs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'All FAQs' },
                { id: 'dispatch', label: '🚚 Dispatch' },
                { id: 'cold-chain', label: '❄️ Cold-Chain' },
                { id: 'payments', label: '💳 Payments' },
                { id: 'payouts', label: '⚡ Payouts' },
                { id: 'supplies', label: '📦 Supplies' },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFaqCategoryFilter(c.id)}
                  className={`btn-secondary ${faqCategoryFilter === c.id ? 'active' : ''}`}
                  style={{
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: faqCategoryFilter === c.id ? '#0D9488' : undefined,
                    color: faqCategoryFilter === c.id ? '#FFFFFF' : undefined,
                    borderColor: faqCategoryFilter === c.id ? '#0D9488' : undefined,
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div style={{ width: '260px' }}>
              <input
                type="text"
                placeholder="Search FAQ questions..."
                value={faqSearchQuery}
                onChange={(e) => setFaqSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  fontSize: '0.82rem',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredFaqs.length === 0 ? (
              <div className="chart-card-modern" style={{ textAlign: 'center', padding: '32px 20px', color: '#64748B' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔍</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A' }}>No matching FAQs found</div>
                <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>Try searching another keyword or clear filter.</div>
              </div>
            ) : (
              filteredFaqs.map((faq) => {
                const isOpen = expandedFaqId === faq.id;
                return (
                  <div
                    key={faq.id}
                    className="chart-card-modern"
                    style={{
                      borderRadius: '12px',
                      border: isOpen ? '1.5px solid #0D9488' : '1px solid #E2E8F0',
                      transition: 'all 0.15s ease',
                      padding: '16px 20px',
                    }}
                  >
                    <div
                      onClick={() => setExpandedFaqId(isOpen ? null : faq.id)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        userSelect: 'none',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            color: '#0D9488',
                            background: '#F0FDFA',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            marginRight: '8px',
                          }}
                        >
                          {faq.category}
                        </span>
                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                          {faq.question}
                        </span>
                      </div>
                      <span style={{ fontSize: '16px', color: '#0D9488', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
                        ▼
                      </span>
                    </div>

                    {isOpen && (
                      <div
                        style={{
                          marginTop: '12px',
                          borderTop: '1px solid #E2E8F0',
                          paddingTop: '12px',
                          fontSize: '0.84rem',
                          color: '#475569',
                          lineHeight: 1.6,
                        }}
                      >
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
