import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DEFAULT_SUPER_ADMIN_EMAIL,
  hasPermission,
  isEffectiveSuperAdmin,
  type LeadRecord,
  type LeadStage,
  type MarketingCampaignRecord,
  type ServiceZoneRecord,
  type UserProfile,
} from '@diagnostic/shared';
import { type DynamicAlertVariant } from '../../components/DynamicAlertModal';
import {
  createCampaignApi,
  createLeadApi,
  getMarketingOverviewApi,
  getOrgOverviewApi,
  getServiceZonesApi,
  runMarketingFollowUpRemindersApi,
  updateCampaignApi,
  updateLeadApi,
  type MarketingOverviewData,
} from '../../services/orgApiService';

type AlertTriggerFn = (opts: {
  variant: DynamicAlertVariant;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
}) => void;

type MarketingSubTab = 'leads' | 'campaigns' | 'analytics' | 'runs';

const LEAD_STAGES: LeadStage[] = [
  'NEW',
  'CONTACTED',
  'DEMO_SCHEDULED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'CONVERTED_TO_LAB',
  'LOST',
];

const EST_REVENUE_PER_SAMPLE_INR = 750;

interface MarketingGrowthPanelProps {
  currentUser: UserProfile;
  bearerToken?: string;
  onShowAlert: AlertTriggerFn;
}

export function MarketingGrowthPanel({
  currentUser,
  bearerToken,
  onShowAlert,
}: MarketingGrowthPanelProps) {
  const [subTab, setSubTab] = useState<MarketingSubTab>('leads');
  const [data, setData] = useState<MarketingOverviewData | null>(null);
  const [serviceZones, setServiceZones] = useState<ServiceZoneRecord[]>([]);
  const [teamRoster, setTeamRoster] = useState<
    Array<{ name: string; email: string; roleLabel: string; dept?: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<'ALL' | LeadStage>('ALL');
  const [cityFilter, setCityFilter] = useState('');
  const [runningFollowUps, setRunningFollowUps] = useState(false);

  // Add Lead Modal
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [leadLabName, setLeadLabName] = useState('');
  const [leadType, setLeadType] = useState<LeadRecord['leadType']>('SMALL_LAB');
  const [leadContact, setLeadContact] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadCity, setLeadCity] = useState('Mumbai');
  const [leadZone, setLeadZone] = useState('');
  const [leadSource, setLeadSource] = useState<LeadRecord['source']>('FIELD_VISIT');
  const [leadBookingsEst, setLeadBookingsEst] = useState('60');
  const [leadValueManual, setLeadValueManual] = useState(false);
  const [leadValueEst, setLeadValueEst] = useState(String(60 * EST_REVENUE_PER_SAMPLE_INR));
  const [leadFollowUpDate, setLeadFollowUpDate] = useState(() =>
    new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
  );
  const [leadCampaignId, setLeadCampaignId] = useState('');
  const [leadOwnerEmail, setLeadOwnerEmail] = useState(currentUser.email);
  const [leadNotes, setLeadNotes] = useState('');
  const [savingLead, setSavingLead] = useState(false);

  // Create Campaign Modal
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [cmpName, setCmpName] = useState('');
  const [cmpChannel, setCmpChannel] =
    useState<MarketingCampaignRecord['channel']>('FIELD_OUTREACH');
  const [cmpCity, setCmpCity] = useState('Mumbai');
  const [cmpBudget, setCmpBudget] = useState('25000');
  const [cmpStartDate, setCmpStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cmpNotes, setCmpNotes] = useState('');
  const [savingCampaign, setSavingCampaign] = useState(false);

  // Edit Campaign Metrics Modal
  const [editingCmp, setEditingCmp] = useState<MarketingCampaignRecord | null>(null);
  const [editCmpStatus, setEditCmpStatus] =
    useState<MarketingCampaignRecord['status']>('ACTIVE');
  const [editCmpSpent, setEditCmpSpent] = useState('0');
  const [editCmpLeads, setEditCmpLeads] = useState('0');
  const [editCmpConversions, setEditCmpConversions] = useState('0');
  const [updatingCmp, setUpdatingCmp] = useState(false);

  const isSuperAdmin = useMemo(
    () => isEffectiveSuperAdmin(currentUser, DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser]
  );
  const canManageLeads = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_LEADS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canManageCampaigns = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_CAMPAIGNS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canViewAnalytics = useMemo(
    () =>
      isSuperAdmin ||
      hasPermission(currentUser, 'VIEW_GROWTH_ANALYTICS', DEFAULT_SUPER_ADMIN_EMAIL) ||
      hasPermission(currentUser, 'VIEW_MARKETING_DASHBOARD', DEFAULT_SUPER_ADMIN_EMAIL) ||
      hasPermission(currentUser, 'MANAGE_FIELD_ACQUISITION', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [mktRes, zonesRes, orgRes] = await Promise.allSettled([
        getMarketingOverviewApi(bearerToken),
        getServiceZonesApi(false, bearerToken),
        getOrgOverviewApi(bearerToken),
      ]);
      if (mktRes.status === 'fulfilled') {
        setData(mktRes.value.data);
      } else {
        throw mktRes.reason;
      }
      if (zonesRes.status === 'fulfilled') {
        const zones = zonesRes.value.data || [];
        setServiceZones(zones);
        const firstActiveCity = zones.find((z) => z.isActive && z.city?.trim())?.city?.trim();
        if (firstActiveCity) {
          setLeadCity((prev) => prev || firstActiveCity);
          setCmpCity((prev) => prev || firstActiveCity);
        }
      }
      if (orgRes.status === 'fulfilled') {
        const orgData = orgRes.value.data;
        const candidates: Array<{ name: string; email: string; roleLabel: string; dept?: string }> = [];
        const seen = new Set<string>();
        for (const seat of orgData.founderSeats || []) {
          if (seat.assignedEmail) {
            const em = seat.assignedEmail.trim().toLowerCase();
            if (!seen.has(em)) {
              seen.add(em);
              candidates.push({
                name: seat.founderName,
                email: em,
                roleLabel: seat.title,
                dept: seat.primaryDepartmentId,
              });
            }
          }
        }
        for (const emp of orgData.employees || []) {
          if (emp.isActive && emp.email) {
            const em = emp.email.trim().toLowerCase();
            if (!seen.has(em)) {
              seen.add(em);
              candidates.push({
                name: emp.name,
                email: em,
                roleLabel: emp.designationTitle,
                dept: emp.departmentId,
              });
            }
          }
        }
        setTeamRoster(candidates);
        if (candidates.length > 0) {
          const mktOwner =
            candidates.find((c) => c.dept === 'MARKETING_GROWTH') || candidates[0];
          setLeadOwnerEmail((prev) => prev || mktOwner.email);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load marketing & growth data.');
    } finally {
      setLoading(false);
    }
  }, [bearerToken]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const activeZoneCities = useMemo(() => {
    const set = new Set<string>();
    for (const z of serviceZones) {
      if (z.city?.trim()) set.add(z.city.trim());
    }
    return Array.from(set).sort();
  }, [serviceZones]);

  const matchingZonesForLeadCity = useMemo(() => {
    const clean = leadCity.trim().toLowerCase();
    return serviceZones.filter((z) => !clean || z.city.trim().toLowerCase() === clean);
  }, [serviceZones, leadCity]);

  const filteredLeads = useMemo(() => {
    const leads = data?.leads || [];
    const q = cityFilter.trim().toLowerCase();
    return leads.filter((l) => {
      if (stageFilter !== 'ALL' && l.stage !== stageFilter) return false;
      if (!q) return true;
      return (
        l.labName.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q) ||
        (l.zone || '').toLowerCase().includes(q) ||
        l.contactPerson.toLowerCase().includes(q)
      );
    });
  }, [data, stageFilter, cityFilter]);

  const pipelineStats = useMemo(() => {
    const allLeads = data?.leads || [];
    const activeLeads = allLeads.filter((l) => l.stage !== 'LOST');
    const totalPipelineValueInr = activeLeads.reduce(
      (sum, l) =>
        sum + (l.estimatedMonthlyValueInr || (l.estimatedMonthlyBookings || 0) * EST_REVENUE_PER_SAMPLE_INR),
      0
    );
    return {
      activePipelineCount: activeLeads.length,
      totalPipelineValueInr,
    };
  }, [data]);

  function handleLeadBookingsChange(nextBookingsRaw: string) {
    setLeadBookingsEst(nextBookingsRaw);
    if (!leadValueManual) {
      const n = Math.max(0, Number(nextBookingsRaw || 0));
      setLeadValueEst(String(Math.round(n * EST_REVENUE_PER_SAMPLE_INR)));
    }
  }

  async function handleRunFollowUps() {
    setRunningFollowUps(true);
    try {
      const res = await runMarketingFollowUpRemindersApi(bearerToken);
      onShowAlert({
        variant: 'success',
        title: 'Lead Follow-Up Automation Complete',
        message: res.message || res.data.summary,
        detail: `Processed ${res.data.processedCount} due reminder(s) and skipped ${res.data.dedupSkippedCount} already notified within 24 hours.`,
      });
      await loadOverview();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Automation Failed',
        message: err instanceof Error ? err.message : 'Could not run lead follow-up automation.',
      });
    } finally {
      setRunningFollowUps(false);
    }
  }

  async function handleCreateLead(e: FormEvent) {
    e.preventDefault();
    if (!leadLabName.trim() || !leadContact.trim() || !leadPhone.trim() || !leadCity.trim()) {
      onShowAlert({
        variant: 'warning',
        title: 'Missing Required Fields',
        message: 'Lab name, contact person, phone number, and city are required.',
      });
      return;
    }
    const chosenOwner = teamRoster.find((m) => m.email === leadOwnerEmail);
    setSavingLead(true);
    try {
      await createLeadApi(
        {
          labName: leadLabName.trim(),
          leadType,
          contactPerson: leadContact.trim(),
          phone: leadPhone.trim(),
          email: leadEmail.trim() || undefined,
          city: leadCity.trim(),
          zone: leadZone.trim() || undefined,
          source: leadSource,
          estimatedMonthlyBookings: Number(leadBookingsEst || 0),
          estimatedMonthlyValueInr: Number(leadValueEst || 0),
          nextFollowUpAt: leadFollowUpDate ? new Date(`${leadFollowUpDate}T10:00:00.000Z`).toISOString() : undefined,
          campaignId: leadCampaignId || undefined,
          assignedOwnerEmail: chosenOwner?.email || currentUser.email,
          assignedOwnerName: chosenOwner?.name || currentUser.displayName,
          notes: leadNotes.trim() || undefined,
        },
        bearerToken
      );
      setShowLeadModal(false);
      setLeadLabName('');
      setLeadContact('');
      setLeadPhone('');
      setLeadEmail('');
      setLeadZone('');
      setLeadValueManual(false);
      setLeadNotes('');
      onShowAlert({
        variant: 'success',
        title: 'B2B Partner Lead Created',
        message: `${leadLabName.trim()} has been added to the acquisition pipeline.`,
      });
      await loadOverview();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Could Not Create Lead',
        message: err instanceof Error ? err.message : 'Failed to create B2B lead.',
      });
    } finally {
      setSavingLead(false);
    }
  }

  async function handleLeadStageChange(lead: LeadRecord, nextStage: LeadStage) {
    try {
      await updateLeadApi(
        lead.id,
        {
          stage: nextStage,
          lastContactedAt: new Date().toISOString(),
        },
        bearerToken
      );
      if (nextStage === 'CONVERTED_TO_LAB') {
        onShowAlert({
          variant: 'success',
          title: 'Lead Converted & Handed Off to Operations',
          message: `${lead.labName} is marked CONVERTED_TO_LAB. An onboarding application was automatically queued for Operations & Partnerships KYC verification.`,
        });
      }
      await loadOverview();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Stage Update Failed',
        message: err instanceof Error ? err.message : 'Unable to update lead stage.',
      });
    }
  }

  async function handleCreateCampaign(e: FormEvent) {
    e.preventDefault();
    if (!cmpName.trim() || !cmpCity.trim()) return;
    setSavingCampaign(true);
    try {
      await createCampaignApi(
        {
          name: cmpName.trim(),
          channel: cmpChannel,
          targetCity: cmpCity.trim(),
          status: 'ACTIVE',
          budgetInr: Number(cmpBudget || 0),
          startDate: cmpStartDate,
          notes: cmpNotes.trim() || undefined,
        },
        bearerToken
      );
      setShowCampaignModal(false);
      setCmpName('');
      setCmpNotes('');
      onShowAlert({
        variant: 'success',
        title: 'Campaign Launched',
        message: `${cmpName.trim()} is now live in ${cmpCity.trim()}.`,
      });
      await loadOverview();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Campaign Creation Failed',
        message: err instanceof Error ? err.message : 'Unable to create campaign.',
      });
    } finally {
      setSavingCampaign(false);
    }
  }

  function openEditCampaign(cmp: MarketingCampaignRecord) {
    setEditingCmp(cmp);
    setEditCmpStatus(cmp.status);
    setEditCmpSpent(String(cmp.spentInr || 0));
    setEditCmpLeads(String(cmp.leadsGenerated || 0));
    setEditCmpConversions(String(cmp.conversionsCount || 0));
  }

  async function handleSaveCampaignMetrics(e: FormEvent) {
    e.preventDefault();
    if (!editingCmp) return;
    setUpdatingCmp(true);
    try {
      await updateCampaignApi(
        editingCmp.id,
        {
          status: editCmpStatus,
          spentInr: Number(editCmpSpent || 0),
          leadsGenerated: Number(editCmpLeads || 0),
          conversionsCount: Number(editCmpConversions || 0),
        },
        bearerToken
      );
      setEditingCmp(null);
      await loadOverview();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Update Failed',
        message: err instanceof Error ? err.message : 'Unable to update campaign metrics.',
      });
    } finally {
      setUpdatingCmp(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="chart-card-modern">
        <h2 className="card-top-title">Marketing &amp; Growth Command (Vishal)</h2>
        <p style={{ color: '#64748B', fontSize: '0.86rem', marginTop: '8px' }}>
          Loading B2B partner pipeline, city growth coverage, and active campaigns...
        </p>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="chart-card-modern">
        <div className="admin-auth-alert error">{errorMsg}</div>
        <button type="button" className="btn-primary" onClick={() => void loadOverview()}>
          Retry Loading Pipeline
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Control Tower Header Row */}
      <div className="page-header-row" style={{ marginBottom: 0 }}>
        <div className="page-title-group">
          <h1>Marketing &amp; Growth Command (Vishal)</h1>
          <p>
            B2B Diagnostic Lab Lead CRM, Area Expansion Campaigns, Live Attribution &amp; Automated Follow-Ups.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {canManageLeads && (
            <button
              type="button"
              className="btn-secondary"
              disabled={runningFollowUps}
              onClick={() => void handleRunFollowUps()}
            >
              {runningFollowUps ? 'Sending Reminders...' : '⚡ Run Follow-Up Reminders'}
            </button>
          )}
          {canManageCampaigns && (
            <button type="button" className="btn-secondary" onClick={() => setShowCampaignModal(true)}>
              + Launch Campaign
            </button>
          )}
          {canManageLeads && (
            <button type="button" className="btn-primary" onClick={() => setShowLeadModal(true)}>
              + Add B2B Lab Lead
            </button>
          )}
        </div>
      </div>

      {/* KPI 5-Card Strip */}
      <section className="kpi-5-row" style={{ marginBottom: 0 }}>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-teal">🎯</div>
          <div className="kpi-body">
            <span className="kpi-title">Total B2B Leads</span>
            <span className="kpi-main-number">{data?.kpis.totalLeads ?? 0}</span>
            <span className="kpi-sub-split">
              Registered network labs: {data?.kpis.registeredSmallLabsCount ?? 0}
            </span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-green">🏥</div>
          <div className="kpi-body">
            <span className="kpi-title">Converted Partner Labs</span>
            <span className="kpi-main-number">{data?.kpis.convertedLeads ?? 0}</span>
            <span className="kpi-sub-split">Conversion rate: {data?.kpis.conversionRatePct ?? 0}%</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-indigo">📈</div>
          <div className="kpi-body">
            <span className="kpi-title">Est. Monthly Pipeline</span>
            <span className="kpi-main-number">
              ₹{pipelineStats.totalPipelineValueInr.toLocaleString('en-IN')}
            </span>
            <span className="kpi-sub-split">
              Across {pipelineStats.activePipelineCount} open partner lead(s)
            </span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-orange">⏰</div>
          <div className="kpi-body">
            <span className="kpi-title">Due Follow-Ups</span>
            <span className="kpi-main-number">{data?.kpis.dueFollowUpsCount ?? 0}</span>
            <span className="kpi-sub-split">Scheduled outreach &amp; auto-reminders</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-blue">📣</div>
          <div className="kpi-body">
            <span className="kpi-title">Active Campaigns</span>
            <span className="kpi-main-number">{data?.kpis.activeCampaignsCount ?? 0}</span>
            <span className="kpi-sub-split">
              Spend: ₹{(data?.kpis.totalCampaignSpendInr || 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </section>

      {/* PRIVACY SHIELD BANNER */}
      <div className="privacy-shield-banner" style={{ marginBottom: 0 }}>
        <strong>B2B Privacy Isolation Boundary Active:</strong> Marketing &amp; Growth roles have strict
        access only to partner acquisition leads, regional demand analytics, and marketing campaigns. Patient
        records, diagnostic reports, partner KYC documents, and financial ledgers are blocked at the security
        layer. Converted labs are handed off automatically to Operations &amp; Partnerships for verification.
      </div>

      {errorMsg && <div className="admin-auth-alert error">{errorMsg}</div>}

      {/* SUB-TABS */}
      <div className="sub-tab-pills" style={{ marginBottom: 0 }}>
        <button
          type="button"
          className={`sub-tab-pill ${subTab === 'leads' ? 'active' : ''}`}
          onClick={() => setSubTab('leads')}
        >
          Partner Leads CRM ({data?.leads.length || 0})
        </button>
        <button
          type="button"
          className={`sub-tab-pill ${subTab === 'campaigns' ? 'active' : ''}`}
          onClick={() => setSubTab('campaigns')}
        >
          Campaigns &amp; ROI ({data?.campaigns.length || 0})
        </button>
        {canViewAnalytics && (
          <button
            type="button"
            className={`sub-tab-pill ${subTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setSubTab('analytics')}
          >
            City &amp; Area Growth ({data?.areaGrowth.length || 0})
          </button>
        )}
        <button
          type="button"
          className={`sub-tab-pill ${subTab === 'runs' ? 'active' : ''}`}
          onClick={() => setSubTab('runs')}
        >
          Follow-Up Automation Runs ({data?.automationRuns.length || 0})
        </button>
      </div>

      {/* SUB-TAB: LEADS CRM */}
      {subTab === 'leads' && (
        <div className="chart-card-modern">
          <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <h2 className="card-top-title">B2B Lab Acquisition Pipeline</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                className="form-input"
                style={{ width: '210px', padding: '7px 11px' }}
                placeholder="Search lab, city, or contact..."
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              />
              <select
                className="form-select"
                style={{ width: '190px', padding: '7px 11px' }}
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as 'ALL' | LeadStage)}
              >
                <option value="ALL">All Stages ({data?.leads.length || 0})</option>
                {LEAD_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {st.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredLeads.length === 0 ? (
            <div className="empty-state-box">
              <h4>No B2B Partner Leads Recorded Yet</h4>
              <p>
                Add real prospective Small Labs, Large Labs, or Diagnostic Chains as outreach begins in your
                target zones.
              </p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Lead &amp; Lab</th>
                    <th>Contact &amp; Source</th>
                    <th>Est. Volume</th>
                    <th>Next Follow-Up</th>
                    <th>Pipeline Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => {
                    const isOverdue =
                      Boolean(lead.nextFollowUpAt) &&
                      lead.stage !== 'CONVERTED_TO_LAB' &&
                      lead.stage !== 'LOST' &&
                      new Date(lead.nextFollowUpAt!).getTime() <= Date.now();
                    return (
                      <tr key={lead.id}>
                        <td>
                          <strong>{lead.labName}</strong>
                          <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                            {lead.leadCode} • {lead.leadType.replace(/_/g, ' ')} • {lead.city}
                            {lead.zone ? ` (${lead.zone})` : ''}
                          </div>
                        </td>
                        <td>
                          <div>{lead.contactPerson}</div>
                          <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                            {lead.phone} • {lead.source.replace(/_/g, ' ')}
                          </div>
                        </td>
                        <td>
                          <div>{lead.estimatedMonthlyBookings || 0} samples/mo</div>
                          <div style={{ fontSize: '0.73rem', color: '#0D9488', fontWeight: 600 }}>
                            ₹{(lead.estimatedMonthlyValueInr || 0).toLocaleString('en-IN')}/mo
                          </div>
                        </td>
                        <td>
                          {lead.nextFollowUpAt ? (
                            <span className={isOverdue ? 'status-pill-amber' : 'status-pill-slate'}>
                              {lead.nextFollowUpAt.slice(0, 10)} {isOverdue ? '• DUE' : ''}
                            </span>
                          ) : (
                            <span style={{ color: '#94A3B8', fontSize: '0.76rem' }}>Not scheduled</span>
                          )}
                        </td>
                        <td>
                          <select
                            className="form-select"
                            style={{ minWidth: '175px', padding: '6px 10px' }}
                            disabled={!canManageLeads}
                            value={lead.stage}
                            onChange={(e) => void handleLeadStageChange(lead, e.target.value as LeadStage)}
                          >
                            {LEAD_STAGES.map((st) => (
                              <option key={st} value={st}>
                                {st.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB: CAMPAIGNS & ROI */}
      {subTab === 'campaigns' && (
        <div className="chart-card-modern">
          <div className="card-top-header">
            <h2 className="card-top-title">City Acquisition Campaigns &amp; ROI</h2>
            {canManageCampaigns && (
              <button type="button" className="btn-primary" onClick={() => setShowCampaignModal(true)}>
                + Launch Campaign
              </button>
            )}
          </div>
          {(data?.campaigns || []).length === 0 ? (
            <div className="empty-state-box">
              <h4>No Campaigns Launched Yet</h4>
              <p>Create regional field outreach, WhatsApp B2B, or medical expo campaigns to track CPL and conversions.</p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Target City &amp; Start</th>
                    <th>Budget vs Spend</th>
                    <th>Leads &amp; Conversions</th>
                    <th>Status</th>
                    {canManageCampaigns && <th>Update</th>}
                  </tr>
                </thead>
                <tbody>
                  {(data?.campaigns || []).map((cmp) => {
                    const cpl =
                      cmp.leadsGenerated > 0 ? Math.round(cmp.spentInr / cmp.leadsGenerated) : 0;
                    return (
                      <tr key={cmp.id}>
                        <td>
                          <strong>{cmp.name}</strong>
                          <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                            {cmp.channel.replace(/_/g, ' ')}
                          </div>
                        </td>
                        <td>
                          <div>{cmp.targetCity}</div>
                          <div style={{ fontSize: '0.73rem', color: '#64748B' }}>Started {cmp.startDate}</div>
                        </td>
                        <td>
                          <div>₹{cmp.spentInr.toLocaleString('en-IN')} spent</div>
                          <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                            of ₹{cmp.budgetInr.toLocaleString('en-IN')} budget
                          </div>
                        </td>
                        <td>
                          <div>
                            {cmp.leadsGenerated} leads • <strong>{cmp.conversionsCount}</strong> converted
                          </div>
                          <div style={{ fontSize: '0.73rem', color: '#0D9488' }}>
                            Est. CPL: ₹{cpl.toLocaleString('en-IN')}
                          </div>
                        </td>
                        <td>
                          <span
                            className={
                              cmp.status === 'ACTIVE'
                                ? 'status-pill-green'
                                : cmp.status === 'PAUSED'
                                ? 'status-pill-amber'
                                : 'status-pill-slate'
                            }
                          >
                            {cmp.status}
                          </span>
                        </td>
                        {canManageCampaigns && (
                          <td>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => openEditCampaign(cmp)}
                            >
                              Update Metrics
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB: CITY / AREA GROWTH ANALYTICS */}
      {subTab === 'analytics' && canViewAnalytics && (
        <div className="chart-card-modern">
          <div className="card-top-header">
            <h2 className="card-top-title">City &amp; Area Network Footprint</h2>
          </div>
          {(data?.areaGrowth || []).length === 0 ? (
            <div className="empty-state-box">
              <h4>No City Demand Data Yet</h4>
              <p>Regional metrics populate automatically from registered partner labs and B2B acquisition leads.</p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>City</th>
                    <th>Pipeline Leads</th>
                    <th>Converted Leads</th>
                    <th>Registered Small Labs</th>
                    <th>Registered Large Labs</th>
                    <th>Total Active Network</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.areaGrowth || []).map((row) => (
                    <tr key={row.city}>
                      <td><strong>{row.city}</strong></td>
                      <td>{row.leadsCount}</td>
                      <td>{row.convertedLeadsCount}</td>
                      <td>{row.registeredSmallLabs}</td>
                      <td>{row.registeredLargeLabs}</td>
                      <td>
                        <span className="status-pill-blue">
                          {row.registeredSmallLabs + row.registeredLargeLabs} labs
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB: FOLLOW-UP AUTOMATION RUNS */}
      {subTab === 'runs' && (
        <div className="chart-card-modern">
          <h2 className="card-top-title">Lead Follow-Up Automation Runs</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            {(data?.automationRuns || []).length === 0 ? (
              <div className="empty-state-box">
                <h4>No Follow-Up Reminder Runs Yet</h4>
              </div>
            ) : (
              (data?.automationRuns || []).map((run) => (
                <div key={run.id} className="automation-run-row">
                  <div>
                    <strong>{run.automationType.replace(/_/g, ' ')}</strong>
                    <div style={{ fontSize: '0.78rem', color: '#475569' }}>{run.summary}</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                      Triggered by {run.triggeredByEmail} • {new Date(run.createdAt).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <span className={run.status === 'SUCCESS' ? 'status-pill-green' : 'status-pill-amber'}>
                    {run.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADD LEAD */}
      {showLeadModal && (
        <div className="modal-overlay" onClick={() => !savingLead && setShowLeadModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add B2B Diagnostic Lab Lead</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowLeadModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleCreateLead(e)}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Prospective Lab / Chain Name *</label>
                  <input className="form-input" value={leadLabName} onChange={(e) => setLeadLabName(e.target.value)} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Lead Type</label>
                    <select className="form-select" value={leadType} onChange={(e) => setLeadType(e.target.value as LeadRecord['leadType'])}>
                      <option value="SMALL_LAB">Small Lab / Collection Center</option>
                      <option value="LARGE_LAB">Large Processing Lab</option>
                      <option value="DIAGNOSTIC_CHAIN">Diagnostic Chain</option>
                      <option value="CORPORATE_PARTNER">Corporate Partner</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Acquisition Source</label>
                    <select className="form-select" value={leadSource} onChange={(e) => setLeadSource(e.target.value as LeadRecord['source'])}>
                      <option value="FIELD_VISIT">Field Visit</option>
                      <option value="REFERRAL">Partner Referral</option>
                      <option value="DIGITAL_CAMPAIGN">Digital Campaign</option>
                      <option value="INBOUND_WEB">Inbound Website</option>
                      <option value="COLD_OUTREACH">Cold Outreach</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Contact Person *</label>
                    <input className="form-input" value={leadContact} onChange={(e) => setLeadContact(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number *</label>
                    <input className="form-input" value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} required />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">City (Active Launch Zones) *</label>
                    <input
                      className="form-input"
                      list="mkt-zone-cities"
                      value={leadCity}
                      onChange={(e) => setLeadCity(e.target.value)}
                      required
                    />
                    <datalist id="mkt-zone-cities">
                      {activeZoneCities.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Zone / Locality (Auto-Suggests City)</label>
                    <input
                      className="form-input"
                      list="mkt-zone-names"
                      value={leadZone}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLeadZone(val);
                        const match = serviceZones.find(
                          (z) => z.name.trim().toLowerCase() === val.trim().toLowerCase()
                        );
                        if (match?.city) setLeadCity(match.city);
                      }}
                      placeholder="e.g. Andheri West"
                    />
                    <datalist id="mkt-zone-names">
                      {matchingZonesForLeadCity.map((z) => (
                        <option key={z.id} value={z.name}>
                          {z.city} • {z.zoneCode} ({z.radiusKm} km)
                        </option>
                      ))}
                    </datalist>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Est. Samples / Mo</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      value={leadBookingsEst}
                      onChange={(e) => handleLeadBookingsChange(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Est. Monthly INR {!leadValueManual && <span style={{ color: '#0F766E' }}>(Auto ₹750/smp)</span>}
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      value={leadValueEst}
                      onChange={(e) => {
                        setLeadValueManual(true);
                        setLeadValueEst(e.target.value);
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Next Follow-Up</label>
                    <input
                      className="form-input"
                      type="date"
                      value={leadFollowUpDate}
                      onChange={(e) => setLeadFollowUpDate(e.target.value)}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Contact Email (optional)</label>
                    <input className="form-input" type="email" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Attributed Campaign</label>
                    <select
                      className="form-select"
                      value={leadCampaignId}
                      onChange={(e) => {
                        const cid = e.target.value;
                        setLeadCampaignId(cid);
                        const camp = (data?.campaigns || []).find((c) => c.id === cid);
                        if (camp?.targetCity) setLeadCity(camp.targetCity);
                      }}
                    >
                      <option value="">Organic / Direct</option>
                      {(data?.campaigns || []).map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.targetCity})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Assigned Lead Owner (Auto-Defaulted to Growth Lead)</label>
                  <select
                    className="form-select"
                    value={leadOwnerEmail}
                    onChange={(e) => setLeadOwnerEmail(e.target.value)}
                  >
                    {teamRoster.length === 0 && (
                      <option value={currentUser.email}>
                        {currentUser.displayName} ({currentUser.email})
                      </option>
                    )}
                    {teamRoster.map((member) => (
                      <option key={member.email} value={member.email}>
                        {member.name} — {member.roleLabel} ({member.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Outreach Notes</label>
                  <textarea className="form-input" rows={2} value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowLeadModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingLead}>
                  {savingLead ? 'Saving Lead...' : 'Save B2B Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LAUNCH CAMPAIGN */}
      {showCampaignModal && (
        <div className="modal-overlay" onClick={() => !savingCampaign && setShowCampaignModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Launch B2B Growth Campaign</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowCampaignModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleCreateCampaign(e)}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Campaign Name *</label>
                  <input className="form-input" value={cmpName} onChange={(e) => setCmpName(e.target.value)} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Channel</label>
                    <select className="form-select" value={cmpChannel} onChange={(e) => setCmpChannel(e.target.value as MarketingCampaignRecord['channel'])}>
                      <option value="FIELD_OUTREACH">Field Outreach</option>
                      <option value="WHATSAPP_B2B">WhatsApp B2B</option>
                      <option value="SEARCH_ADS">Search Ads</option>
                      <option value="SOCIAL_MEDIA">Social Media</option>
                      <option value="MEDICAL_EXPO">Medical Expo / CME</option>
                      <option value="REFERRAL_PROGRAM">Partner Referral Program</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Target City *</label>
                    <input
                      className="form-input"
                      list="mkt-cmp-cities"
                      value={cmpCity}
                      onChange={(e) => setCmpCity(e.target.value)}
                      required
                    />
                    <datalist id="mkt-cmp-cities">
                      {activeZoneCities.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Allocated Budget (INR)</label>
                    <input className="form-input" type="number" min="0" value={cmpBudget} onChange={(e) => setCmpBudget(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Start Date</label>
                    <input className="form-input" type="date" value={cmpStartDate} onChange={(e) => setCmpStartDate(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Campaign Scope / Notes</label>
                  <textarea className="form-input" rows={2} value={cmpNotes} onChange={(e) => setCmpNotes(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowCampaignModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingCampaign}>
                  {savingCampaign ? 'Launching...' : 'Launch Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: UPDATE CAMPAIGN METRICS */}
      {editingCmp && (
        <div className="modal-overlay" onClick={() => !updatingCmp && setEditingCmp(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Update Campaign ROI — {editingCmp.name}</h3>
              <button type="button" className="btn-secondary" onClick={() => setEditingCmp(null)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleSaveCampaignMetrics(e)}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Campaign Status</label>
                  <select className="form-select" value={editCmpStatus} onChange={(e) => setEditCmpStatus(e.target.value as MarketingCampaignRecord['status'])}>
                    <option value="PLANNED">PLANNED</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PAUSED">PAUSED</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Actual Spend (INR)</label>
                    <input className="form-input" type="number" min="0" value={editCmpSpent} onChange={(e) => setEditCmpSpent(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Leads Generated</label>
                    <input className="form-input" type="number" min="0" value={editCmpLeads} onChange={(e) => setEditCmpLeads(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Conversions</label>
                    <input className="form-input" type="number" min="0" value={editCmpConversions} onChange={(e) => setEditCmpConversions(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditingCmp(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={updatingCmp}>
                  {updatingCmp ? 'Updating...' : 'Save Metrics'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

