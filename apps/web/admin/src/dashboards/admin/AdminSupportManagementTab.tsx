import { useState, useMemo, type FormEvent } from 'react';
import {
  DEFAULT_PLATFORM_FAQS,
  DEFAULT_PLATFORM_SOPS,
  DEFAULT_SUPPORT_CONTACTS,
  type PlatformFaqDocument,
  type PlatformSopDocument,
  type SupportContactsConfig,
} from '@diagnostic/shared';
import {
  saveSupportContacts,
  savePlatformSop,
  deletePlatformSop,
  savePlatformFaq,
  deletePlatformFaq,
} from '../../services/firestoreService';

export interface AdminSupportManagementTabProps {
  adminEmail: string;
  supportContacts: SupportContactsConfig;
  platformSops: PlatformSopDocument[];
  platformFaqs: PlatformFaqDocument[];
  onShowAlert: (params: {
    variant: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    title: string;
    message: string;
    detail?: string;
    onConfirm?: () => void;
  }) => void;
}

export function AdminSupportManagementTab({
  adminEmail,
  supportContacts,
  platformSops,
  platformFaqs,
  onShowAlert,
}: AdminSupportManagementTabProps) {
  const [activeSection, setActiveSection] = useState<'contacts' | 'sops' | 'faqs'>('contacts');

  // Support Contacts Form State
  const [contactsForm, setContactsForm] = useState<SupportContactsConfig>({
    ...DEFAULT_SUPPORT_CONTACTS,
    ...supportContacts,
  });
  const [savingContacts, setSavingContacts] = useState(false);

  // SOP Modal & State
  const [editingSop, setEditingSop] = useState<PlatformSopDocument | null>(null);
  const [isSopModalOpen, setIsSopModalOpen] = useState(false);
  const [savingSop, setSavingSop] = useState(false);
  const [sopCategoryFilter, setSopCategoryFilter] = useState('all');

  // FAQ Modal & State
  const [editingFaq, setEditingFaq] = useState<PlatformFaqDocument | null>(null);
  const [isFaqModalOpen, setIsFaqModalOpen] = useState(false);
  const [savingFaq, setSavingFaq] = useState(false);
  const [faqCategoryFilter, setFaqCategoryFilter] = useState('all');

  const sops = useMemo(() => {
    return platformSops && platformSops.length > 0 ? platformSops : DEFAULT_PLATFORM_SOPS;
  }, [platformSops]);

  const faqs = useMemo(() => {
    return platformFaqs && platformFaqs.length > 0 ? platformFaqs : DEFAULT_PLATFORM_FAQS;
  }, [platformFaqs]);

  const filteredSops = useMemo(() => {
    if (sopCategoryFilter === 'all') return sops;
    return sops.filter((s) => s.category === sopCategoryFilter);
  }, [sops, sopCategoryFilter]);

  const filteredFaqs = useMemo(() => {
    if (faqCategoryFilter === 'all') return faqs;
    return faqs.filter((f) => f.category.toLowerCase() === faqCategoryFilter.toLowerCase());
  }, [faqs, faqCategoryFilter]);

  async function handleSaveContactsSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingContacts(true);
    try {
      await saveSupportContacts(contactsForm, adminEmail);
      onShowAlert({
        variant: 'success',
        title: 'Support Contacts Saved',
        message: 'Updated emergency hotlines and dispatch contacts. All partner apps (Small Labs & Phlebo App) reflect these numbers live!',
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Failed to Save Contacts',
        message: (err as Error).message || 'Could not update support contacts in Firestore.',
      });
    } finally {
      setSavingContacts(false);
    }
  }

  function handleOpenAddSop() {
    setEditingSop({
      id: `sop-${Date.now()}`,
      category: 'general',
      number: `SOP 0${sops.length + 1}`,
      title: '',
      subtitle: '',
      badge: 'STANDARD',
      badgeColor: '#0D9488',
      icon: 'document-text',
      steps: [
        {
          title: 'Step 1',
          description: '',
        },
      ],
      isActive: true,
      orderIndex: sops.length + 1,
      targetRoles: ['ALL'],
      updatedAt: new Date().toISOString(),
    });
    setIsSopModalOpen(true);
  }

  function handleOpenEditSop(sop: PlatformSopDocument) {
    setEditingSop(JSON.parse(JSON.stringify(sop)) as PlatformSopDocument);
    setIsSopModalOpen(true);
  }

  async function handleSaveSopSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editingSop || !editingSop.title.trim()) return;
    setSavingSop(true);
    try {
      await savePlatformSop(editingSop, adminEmail);
      setIsSopModalOpen(false);
      setEditingSop(null);
      onShowAlert({
        variant: 'success',
        title: 'Diagnostic SOP Saved',
        message: `${editingSop.number}: ${editingSop.title} has been saved and synchronized across the network.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Failed to Save SOP',
        message: (err as Error).message || 'Could not save SOP.',
      });
    } finally {
      setSavingSop(false);
    }
  }

  function handleDeleteSop(sop: PlatformSopDocument) {
    onShowAlert({
      variant: 'confirm',
      title: `Delete ${sop.number}?`,
      message: `Are you sure you want to delete "${sop.title}"? This procedure will be removed from all mobile and web portals.`,
      onConfirm: async () => {
        try {
          await deletePlatformSop(sop.id);
          onShowAlert({
            variant: 'success',
            title: 'SOP Deleted',
            message: `${sop.number} was removed from the database.`,
          });
        } catch (err) {
          onShowAlert({
            variant: 'error',
            title: 'Delete Failed',
            message: (err as Error).message || 'Could not delete SOP.',
          });
        }
      },
    });
  }

  async function handleToggleSopActive(sop: PlatformSopDocument) {
    try {
      await savePlatformSop({ ...sop, isActive: !sop.isActive }, adminEmail);
      onShowAlert({
        variant: 'info',
        title: sop.isActive ? 'SOP Deactivated' : 'SOP Activated',
        message: `${sop.number} is now ${sop.isActive ? 'hidden' : 'visible'} on user portals.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Update Failed',
        message: (err as Error).message || 'Could not toggle SOP status.',
      });
    }
  }

  function handleOpenAddFaq() {
    setEditingFaq({
      id: `faq-${Date.now()}`,
      category: 'General',
      question: '',
      answer: '',
      orderIndex: faqs.length + 1,
      isActive: true,
      targetRoles: ['ALL'],
      updatedAt: new Date().toISOString(),
    });
    setIsFaqModalOpen(true);
  }

  function handleOpenEditFaq(faq: PlatformFaqDocument) {
    setEditingFaq(JSON.parse(JSON.stringify(faq)) as PlatformFaqDocument);
    setIsFaqModalOpen(true);
  }

  async function handleSaveFaqSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editingFaq || !editingFaq.question.trim()) return;
    setSavingFaq(true);
    try {
      await savePlatformFaq(editingFaq, adminEmail);
      setIsFaqModalOpen(false);
      setEditingFaq(null);
      onShowAlert({
        variant: 'success',
        title: 'FAQ Saved',
        message: `Saved FAQ question: "${editingFaq.question}"`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Failed to Save FAQ',
        message: (err as Error).message || 'Could not save FAQ.',
      });
    } finally {
      setSavingFaq(false);
    }
  }

  function handleDeleteFaq(faq: PlatformFaqDocument) {
    onShowAlert({
      variant: 'confirm',
      title: 'Delete FAQ?',
      message: `Delete question: "${faq.question}"?`,
      onConfirm: async () => {
        try {
          await deletePlatformFaq(faq.id);
          onShowAlert({
            variant: 'success',
            title: 'FAQ Deleted',
            message: 'Question removed from FAQ list.',
          });
        } catch (err) {
          onShowAlert({
            variant: 'error',
            title: 'Delete Failed',
            message: (err as Error).message || 'Could not delete FAQ.',
          });
        }
      },
    });
  }

  async function handleToggleFaqActive(faq: PlatformFaqDocument) {
    try {
      await savePlatformFaq({ ...faq, isActive: !faq.isActive }, adminEmail);
      onShowAlert({
        variant: 'info',
        title: faq.isActive ? 'FAQ Hidden' : 'FAQ Published',
        message: `FAQ is now ${faq.isActive ? 'hidden' : 'visible'} on user portals.`,
      });
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Update Failed',
        message: (err as Error).message || 'Could not toggle FAQ status.',
      });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Card */}
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
              <span>⚙️</span> Platform Master Operations &amp; Support Hub
            </div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: '0 0 6px', color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              Dynamic Support Contacts, SOPs &amp; FAQ Management
            </h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#E2E8F0', maxWidth: '640px', lineHeight: 1.5 }}>
              Centrally update 24x7 SOS hotlines, WhatsApp numbers, CLSI / NABL standard operating procedures, and partner help desk FAQs. All updates sync live in real-time to Small Labs, Large Labs, and the Phlebo Mobile App.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {activeSection === 'sops' && (
              <button
                type="button"
                className="btn-primary"
                onClick={handleOpenAddSop}
                style={{ background: '#0D9488', borderColor: '#0D9488', fontWeight: 700 }}
              >
                + Add Diagnostic SOP
              </button>
            )}
            {activeSection === 'faqs' && (
              <button
                type="button"
                className="btn-primary"
                onClick={handleOpenAddFaq}
                style={{ background: '#0D9488', borderColor: '#0D9488', fontWeight: 700 }}
              >
                + Add FAQ Item
              </button>
            )}
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '22px', borderTop: '1px solid rgba(255,255,255,0.18)', paddingTop: '16px' }}>
          <button
            type="button"
            onClick={() => setActiveSection('contacts')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: activeSection === 'contacts' ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
              color: activeSection === 'contacts' ? '#0A2A5E' : '#FFFFFF',
              transition: 'all 0.15s ease',
            }}
          >
            📞 Emergency Hotlines &amp; Contacts
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('sops')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: activeSection === 'sops' ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
              color: activeSection === 'sops' ? '#0A2A5E' : '#FFFFFF',
              transition: 'all 0.15s ease',
            }}
          >
            📋 Standard Operating Procedures ({sops.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('faqs')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: activeSection === 'faqs' ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
              color: activeSection === 'faqs' ? '#0A2A5E' : '#FFFFFF',
              transition: 'all 0.15s ease',
            }}
          >
            ❓ FAQs Management ({faqs.length})
          </button>
        </div>
      </div>

      {/* SECTION 1: SUPPORT CONTACTS CONFIG */}
      {activeSection === 'contacts' && (
        <form onSubmit={handleSaveContactsSubmit} className="chart-card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '14px' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 4px', color: '#0F172A' }}>
                Platform Emergency Hotlines &amp; Central Dispatch Desk
              </h2>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748B' }}>
                Numbers saved here are dynamically displayed in the Phlebo Mobile App, Small Lab Portal, and Reference Hubs.
              </p>
            </div>
            <button
              type="submit"
              disabled={savingContacts}
              className="btn-primary"
              style={{ background: '#0D9488', borderColor: '#0D9488', padding: '9px 20px', fontWeight: 700 }}
            >
              {savingContacts ? 'Saving Changes...' : '💾 Save Support Contacts'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                🚨 24x7 Emergency SOS Phone (E.164 Format)
              </label>
              <input
                type="text"
                value={contactsForm.emergencyPhone || ''}
                onChange={(e) => setContactsForm({ ...contactsForm, emergencyPhone: e.target.value })}
                placeholder="+9118008897388"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                required
              />
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Used for 1-click calling on phlebotomist emergency SOS buttons.</span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                Emergency Display Phone Text
              </label>
              <input
                type="text"
                value={contactsForm.displayEmergencyPhone || ''}
                onChange={(e) => setContactsForm({ ...contactsForm, displayEmergencyPhone: e.target.value })}
                placeholder="1800-889-SETU (1800-889-7388)"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                required
              />
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Human-readable text shown on banners.</span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                💬 Central Dispatch Mobile &amp; WhatsApp (E.164 Format)
              </label>
              <input
                type="text"
                value={contactsForm.dispatchMobile || ''}
                onChange={(e) => setContactsForm({ ...contactsForm, dispatchMobile: e.target.value })}
                placeholder="+919820012345"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                required
              />
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Powers WhatsApp direct chat buttons.</span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                Dispatch Display Mobile Text
              </label>
              <input
                type="text"
                value={contactsForm.displayDirectMobile || ''}
                onChange={(e) => setContactsForm({ ...contactsForm, displayDirectMobile: e.target.value })}
                placeholder="+91 98200 12345"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                required
              />
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Formatted text shown on partner screen.</span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                ✉️ Dedicated Operations Support Email
              </label>
              <input
                type="email"
                value={contactsForm.supportEmail || ''}
                onChange={(e) => setContactsForm({ ...contactsForm, supportEmail: e.target.value })}
                placeholder="support@labsetu.com"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                required
              />
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Primary recipient for diagnostic support tickets.</span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                ⏰ Operating Hours Description
              </label>
              <input
                type="text"
                value={contactsForm.operatingHours || ''}
                onChange={(e) => setContactsForm({ ...contactsForm, operatingHours: e.target.value })}
                placeholder="6:00 AM – 11:00 PM (All 7 Days)"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                ⚡ Dispatch SLA Commitment
              </label>
              <input
                type="text"
                value={contactsForm.dispatchSla || ''}
                onChange={(e) => setContactsForm({ ...contactsForm, dispatchSla: e.target.value })}
                placeholder="< 5 Mins Immediate Dispatch Response"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
            <button
              type="submit"
              disabled={savingContacts}
              className="btn-primary"
              style={{ background: '#0D9488', borderColor: '#0D9488', padding: '10px 24px', fontWeight: 700 }}
            >
              {savingContacts ? 'Saving Changes...' : '💾 Save Support Contacts'}
            </button>
          </div>
        </form>
      )}

      {/* SECTION 2: SOPS MANAGEMENT */}
      {activeSection === 'sops' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'All SOPs' },
                { id: 'draw', label: '🩸 Tube Draw' },
                { id: 'cold', label: '❄️ Cold-Chain' },
                { id: 'safety', label: '🛡️ Safety & Handover' },
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

            <button
              type="button"
              className="btn-primary"
              onClick={handleOpenAddSop}
              style={{ background: '#0D9488', borderColor: '#0D9488', fontSize: '0.84rem' }}
            >
              + Add Diagnostic SOP
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredSops.map((sop) => (
              <div
                key={sop.id}
                className="chart-card-modern"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  opacity: sop.isActive ? 1 : 0.6,
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
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: sop.isActive ? '#059669' : '#94A3B8',
                        background: sop.isActive ? '#DCFCE7' : '#F1F5F9',
                        padding: '2px 7px',
                        borderRadius: '4px',
                      }}
                    >
                      {sop.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                    {sop.title}
                  </h3>
                  {sop.subtitle && (
                    <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                      {sop.subtitle}
                    </p>
                  )}
                  <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: '6px' }}>
                    Target: {sop.targetRoles?.join(', ') || 'ALL'} • {sop.steps?.length || 0} Steps • Order: {sop.orderIndex}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => void handleToggleSopActive(sop)}
                    className="btn-secondary"
                    style={{ fontSize: '0.74rem', padding: '5px 10px' }}
                  >
                    {sop.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditSop(sop)}
                    className="btn-secondary"
                    style={{ fontSize: '0.74rem', padding: '5px 10px', color: '#0D9488', borderColor: '#99F6E4' }}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSop(sop)}
                    className="btn-secondary"
                    style={{ fontSize: '0.74rem', padding: '5px 10px', color: '#EF4444', borderColor: '#FECACA' }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 3: FAQS MANAGEMENT */}
      {activeSection === 'faqs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'All FAQs' },
                { id: 'general', label: 'General' },
                { id: 'dispatch', label: 'Dispatch' },
                { id: 'cold-chain', label: 'Cold-Chain' },
                { id: 'payments', label: 'Payments' },
                { id: 'payouts', label: 'Payouts' },
                { id: 'supplies', label: 'Supplies' },
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

            <button
              type="button"
              className="btn-primary"
              onClick={handleOpenAddFaq}
              style={{ background: '#0D9488', borderColor: '#0D9488', fontSize: '0.84rem' }}
            >
              + Add FAQ Item
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredFaqs.map((faq) => (
              <div
                key={faq.id}
                className="chart-card-modern"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  opacity: faq.isActive ? 1 : 0.6,
                  gap: '16px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0D9488', background: '#F0FDFA', padding: '2px 8px', borderRadius: '4px' }}>
                      {faq.category}
                    </span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: faq.isActive ? '#059669' : '#94A3B8', background: faq.isActive ? '#DCFCE7' : '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                      {faq.isActive ? 'Active' : 'Hidden'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                      Order: {faq.orderIndex} • Target: {faq.targetRoles?.join(', ') || 'ALL'}
                    </span>
                  </div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '0.94rem', fontWeight: 800, color: '#0F172A' }}>
                    {faq.question}
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: '#475569', lineHeight: 1.5 }}>
                    {faq.answer}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => void handleToggleFaqActive(faq)}
                    className="btn-secondary"
                    style={{ fontSize: '0.74rem', padding: '5px 10px' }}
                  >
                    {faq.isActive ? 'Hide' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditFaq(faq)}
                    className="btn-secondary"
                    style={{ fontSize: '0.74rem', padding: '5px 10px', color: '#0D9488', borderColor: '#99F6E4' }}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteFaq(faq)}
                    className="btn-secondary"
                    style={{ fontSize: '0.74rem', padding: '5px 10px', color: '#EF4444', borderColor: '#FECACA' }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: ADD / EDIT SOP */}
      {isSopModalOpen && editingSop && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                {editingSop.number ? `Edit ${editingSop.number}` : 'Add Standard Operating Procedure'}
              </h2>
              <button
                type="button"
                onClick={() => setIsSopModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSopSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                    SOP Number
                  </label>
                  <input
                    type="text"
                    value={editingSop.number}
                    onChange={(e) => setEditingSop({ ...editingSop, number: e.target.value })}
                    placeholder="SOP 04"
                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                    Category
                  </label>
                  <select
                    value={editingSop.category}
                    onChange={(e) => setEditingSop({ ...editingSop, category: e.target.value as any })}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  >
                    <option value="draw">🩸 Tube Order of Draw</option>
                    <option value="cold">❄️ Cold-Chain & Chiller</option>
                    <option value="safety">🛡️ Safety & Handover</option>
                    <option value="photo">📸 Photo & Barcode Verification</option>
                    <option value="general">📋 General Diagnostic Protocol</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                  Title
                </label>
                <input
                  type="text"
                  value={editingSop.title}
                  onChange={(e) => setEditingSop({ ...editingSop, title: e.target.value })}
                  placeholder="e.g. Correct Order of Draw for Phlebotomists"
                  style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                  Subtitle
                </label>
                <input
                  type="text"
                  value={editingSop.subtitle}
                  onChange={(e) => setEditingSop({ ...editingSop, subtitle: e.target.value })}
                  placeholder="e.g. Standard Sequence to prevent additive cross-contamination"
                  style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                    Badge Text
                  </label>
                  <input
                    type="text"
                    value={editingSop.badge || ''}
                    onChange={(e) => setEditingSop({ ...editingSop, badge: e.target.value })}
                    placeholder="MANDATORY NABL"
                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                    Badge Color
                  </label>
                  <input
                    type="text"
                    value={editingSop.badgeColor || '#0D9488'}
                    onChange={(e) => setEditingSop({ ...editingSop, badgeColor: e.target.value })}
                    placeholder="#DC2626"
                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                    Order Index
                  </label>
                  <input
                    type="number"
                    value={editingSop.orderIndex}
                    onChange={(e) => setEditingSop({ ...editingSop, orderIndex: Number(e.target.value) || 1 })}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  />
                </div>
              </div>

              {/* Dynamic Steps Editor */}
              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                    Step-by-Step Procedure ({editingSop.steps?.length || 0})
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const nextSteps = [...(editingSop.steps || [])];
                      nextSteps.push({
                        title: `Step ${nextSteps.length + 1}`,
                        description: '',
                      });
                      setEditingSop({ ...editingSop, steps: nextSteps });
                    }}
                    className="btn-secondary"
                    style={{ fontSize: '0.74rem', padding: '4px 10px', color: '#0D9488', borderColor: '#99F6E4' }}
                  >
                    + Add Step
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
                  {(editingSop.steps || []).map((step, sIdx) => (
                    <div
                      key={sIdx}
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={step.title}
                          onChange={(e) => {
                            const next = [...editingSop.steps];
                            next[sIdx].title = e.target.value;
                            setEditingSop({ ...editingSop, steps: next });
                          }}
                          placeholder="Step Title (e.g. 1. Lavender Top)"
                          style={{ flex: 1, padding: '6px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #CBD5E1', fontWeight: 700 }}
                          required
                        />
                        <input
                          type="text"
                          value={step.tag || ''}
                          onChange={(e) => {
                            const next = [...editingSop.steps];
                            next[sIdx].tag = e.target.value;
                            setEditingSop({ ...editingSop, steps: next });
                          }}
                          placeholder="Tag (e.g. Invert 8x)"
                          style={{ width: '110px', padding: '6px 8px', fontSize: '0.78rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = editingSop.steps.filter((_, idx) => idx !== sIdx);
                            setEditingSop({ ...editingSop, steps: next });
                          }}
                          style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '16px' }}
                        >
                          ✕
                        </button>
                      </div>

                      <textarea
                        value={step.description}
                        onChange={(e) => {
                          const next = [...editingSop.steps];
                          next[sIdx].description = e.target.value;
                          setEditingSop({ ...editingSop, steps: next });
                        }}
                        placeholder="Detailed instruction for this step..."
                        rows={2}
                        style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #CBD5E1', resize: 'vertical' }}
                        required
                      />

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <input
                          type="text"
                          value={step.warning || ''}
                          onChange={(e) => {
                            const next = [...editingSop.steps];
                            next[sIdx].warning = e.target.value;
                            setEditingSop({ ...editingSop, steps: next });
                          }}
                          placeholder="Optional Warning (e.g. Do not shake)"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #FECACA', background: '#FEF2F2' }}
                        />
                        <input
                          type="text"
                          value={step.tip || ''}
                          onChange={(e) => {
                            const next = [...editingSop.steps];
                            next[sIdx].tip = e.target.value;
                            setEditingSop({ ...editingSop, steps: next });
                          }}
                          placeholder="Optional Pro Tip"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #99F6E4', background: '#F0FDFA' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '14px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsSopModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSop}
                  className="btn-primary"
                  style={{ background: '#0D9488', borderColor: '#0D9488', fontWeight: 700 }}
                >
                  {savingSop ? 'Saving...' : 'Save SOP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT FAQ */}
      {isFaqModalOpen && editingFaq && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                {editingFaq.question ? 'Edit FAQ Item' : 'Add FAQ Item'}
              </h2>
              <button
                type="button"
                onClick={() => setIsFaqModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveFaqSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                    Category
                  </label>
                  <select
                    value={editingFaq.category}
                    onChange={(e) => setEditingFaq({ ...editingFaq, category: e.target.value as any })}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  >
                    <option value="General">General</option>
                    <option value="Dispatch">Dispatch & Pickups</option>
                    <option value="Cold-Chain">Cold-Chain & Integrity</option>
                    <option value="Payments">Payments & Billing</option>
                    <option value="Payouts">Instant Payouts</option>
                    <option value="Supplies">Vacutainers & Supplies</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={editingFaq.orderIndex}
                    onChange={(e) => setEditingFaq({ ...editingFaq, orderIndex: Number(e.target.value) || 1 })}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                  Question
                </label>
                <input
                  type="text"
                  value={editingFaq.question}
                  onChange={(e) => setEditingFaq({ ...editingFaq, question: e.target.value })}
                  placeholder="e.g. What if patient is unreachable or address is incorrect?"
                  style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                  Answer
                </label>
                <textarea
                  value={editingFaq.answer}
                  onChange={(e) => setEditingFaq({ ...editingFaq, answer: e.target.value })}
                  placeholder="Clear operational answer..."
                  rows={4}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #CBD5E1', resize: 'vertical' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '14px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsFaqModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFaq}
                  className="btn-primary"
                  style={{ background: '#0D9488', borderColor: '#0D9488', fontWeight: 700 }}
                >
                  {savingFaq ? 'Saving...' : 'Save FAQ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
