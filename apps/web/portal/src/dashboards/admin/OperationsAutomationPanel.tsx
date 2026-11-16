import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DEFAULT_SUPER_ADMIN_EMAIL,
  hasPermission,
  isEffectiveSuperAdmin,
  type OnboardingEntityType,
  type OnboardingStage,
  type PhlebotomistProfile,
  type SupportTicketRecord,
  type TrainingRecord,
  type UserProfile,
  type VerificationReviewRecord,
} from '@diagnostic/shared';
import { type DynamicAlertVariant } from '../../components/DynamicAlertModal';
import {
  createOnboardingApi,
  createSupportTicketApi,
  createTrainingRecordApi,
  createVerificationReviewApi,
  decideVerificationReviewApi,
  getOpsOverviewApi,
  resolveOpsExceptionApi,
  runOpsDispatchMonitorApi,
  updateOnboardingApi,
  updateSupportTicketApi,
  updateTrainingRecordApi,
  type OpsOverviewData,
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

type OpsSubTab =
  | 'dispatch'
  | 'exceptions'
  | 'onboarding'
  | 'verification'
  | 'training'
  | 'tickets'
  | 'runs';

interface OperationsAutomationPanelProps {
  currentUser: UserProfile;
  bearerToken?: string;
  phlebotomists: PhlebotomistProfile[];
  onShowAlert: AlertTriggerFn;
}

export function OperationsAutomationPanel({
  currentUser,
  bearerToken,
  phlebotomists,
  onShowAlert,
}: OperationsAutomationPanelProps) {
  const [subTab, setSubTab] = useState<OpsSubTab>('dispatch');
  const [data, setData] = useState<OpsOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [runningMonitor, setRunningMonitor] = useState(false);

  // Exception Resolve Modal
  const [resolveExcId, setResolveExcId] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [backupPhleboId, setBackupPhleboId] = useState('');
  const [resolvingExc, setResolvingExc] = useState(false);

  // Onboarding Modal
  const [showOnbModal, setShowOnbModal] = useState(false);
  const [onbType, setOnbType] = useState<OnboardingEntityType>('SMALL_LAB');
  const [onbName, setOnbName] = useState('');
  const [onbCity, setOnbCity] = useState('Mumbai');
  const [onbContact, setOnbContact] = useState('');
  const [onbPhone, setOnbPhone] = useState('');
  const [onbEmail, setOnbEmail] = useState('');
  const [savingOnb, setSavingOnb] = useState(false);

  // Verification Queue Modal
  const [showVerModal, setShowVerModal] = useState(false);
  const [verEntityType, setVerEntityType] = useState<OnboardingEntityType>('SMALL_LAB');
  const [verEntityId, setVerEntityId] = useState('');
  const [verEntityName, setVerEntityName] = useState('');
  const [verDocType, setVerDocType] = useState<VerificationReviewRecord['documentType']>('LAB_REGISTRATION');
  const [savingVer, setSavingVer] = useState(false);

  // Training Modal
  const [showTrnModal, setShowTrnModal] = useState(false);
  const [trnType, setTrnType] = useState<TrainingRecord['traineeType']>('PHLEBOTOMIST');
  const [trnName, setTrnName] = useState('');
  const [trnEmail, setTrnEmail] = useState('');
  const [trnModule, setTrnModule] = useState('Cold-Chain 2°C-8°C & Barcode Scan SOP');
  const [savingTrn, setSavingTrn] = useState(false);

  // Support Ticket Modal
  const [showTktModal, setShowTktModal] = useState(false);
  const [tktSourceType, setTktSourceType] = useState<SupportTicketRecord['sourceType']>('SMALL_LAB');
  const [tktSourceName, setTktSourceName] = useState('');
  const [tktCategory, setTktCategory] = useState<SupportTicketRecord['category']>('PICKUP_DELAY');
  const [tktPriority, setTktPriority] = useState<SupportTicketRecord['priority']>('HIGH');
  const [tktSubject, setTktSubject] = useState('');
  const [tktDesc, setTktDesc] = useState('');
  const [savingTkt, setSavingTkt] = useState(false);

  const isSuperAdmin = useMemo(
    () => isEffectiveSuperAdmin(currentUser, DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser]
  );
  const canManageDispatch = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_BOOKINGS_DISPATCH', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canManageOnboarding = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_ONBOARDING', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canViewIdentityDocs = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'VIEW_IDENTITY_DOCS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canManageVerification = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_VERIFICATION', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canManageTraining = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_TRAINING', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canManageTickets = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_SUPPORT_TICKETS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );

  const loadOps = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getOpsOverviewApi(bearerToken);
      setData(res.data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load operations data.');
    } finally {
      setLoading(false);
    }
  }, [bearerToken]);

  useEffect(() => {
    void loadOps();
  }, [loadOps]);

  async function handleRunDispatchMonitor() {
    setRunningMonitor(true);
    try {
      const res = await runOpsDispatchMonitorApi(bearerToken);
      onShowAlert({
        variant: res.data.alertCount > 0 ? 'warning' : 'success',
        title: 'Dispatch & SLA Monitor Executed',
        message: res.data.summary,
      });
      await loadOps();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Monitor Failed',
        message: err instanceof Error ? err.message : 'Could not run dispatch monitor.',
      });
    } finally {
      setRunningMonitor(false);
    }
  }

  async function handleResolveExceptionSubmit(e: FormEvent) {
    e.preventDefault();
    if (!resolveExcId) return;
    setResolvingExc(true);
    const chosenPhlebo = phlebotomists.find((p) => p.id === backupPhleboId);
    try {
      await resolveOpsExceptionApi(
        resolveExcId,
        {
          status: 'RESOLVED',
          resolutionNotes: resolveNotes.trim() || 'Resolved by operations team',
          assignPhlebotomistId: chosenPhlebo?.id,
          assignPhlebotomistName: chosenPhlebo?.name,
        },
        bearerToken
      );
      setResolveExcId(null);
      setResolveNotes('');
      setBackupPhleboId('');
      onShowAlert({
        variant: 'success',
        title: 'Exception Resolved',
        message: chosenPhlebo
          ? `Assigned backup courier ${chosenPhlebo.name} and closed exception.`
          : 'Operational exception marked resolved.',
      });
      await loadOps();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Resolve Failed',
        message: err instanceof Error ? err.message : 'Unable to resolve exception.',
      });
    } finally {
      setResolvingExc(false);
    }
  }

  async function handleCreateOnboarding(e: FormEvent) {
    e.preventDefault();
    if (!onbName.trim() || !onbEmail.trim()) return;
    setSavingOnb(true);
    try {
      await createOnboardingApi(
        {
          entityType: onbType,
          entityName: onbName.trim(),
          city: onbCity.trim() || 'Mumbai',
          contactName: onbContact.trim() || onbName.trim(),
          contactPhone: onbPhone.trim() || undefined,
          contactEmail: onbEmail.trim().toLowerCase(),
        },
        bearerToken
      );
      setShowOnbModal(false);
      setOnbName('');
      setOnbEmail('');
      onShowAlert({ variant: 'success', title: 'Onboarding Record Added', message: 'Partner added to onboarding pipeline.' });
      await loadOps();
    } catch (err) {
      onShowAlert({ variant: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed to create onboarding record.' });
    } finally {
      setSavingOnb(false);
    }
  }

  async function handleCreateVerification(e: FormEvent) {
    e.preventDefault();
    if (!verEntityId.trim() || !verEntityName.trim()) return;
    setSavingVer(true);
    try {
      await createVerificationReviewApi(
        {
          entityType: verEntityType,
          entityId: verEntityId.trim(),
          entityName: verEntityName.trim(),
          documentType: verDocType,
        },
        bearerToken
      );
      setShowVerModal(false);
      setVerEntityId('');
      setVerEntityName('');
      onShowAlert({ variant: 'success', title: 'Queued for Verification', message: 'Added to human verification queue.' });
      await loadOps();
    } catch (err) {
      onShowAlert({ variant: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed to add verification item.' });
    } finally {
      setSavingVer(false);
    }
  }

  async function handleCreateTraining(e: FormEvent) {
    e.preventDefault();
    if (!trnName.trim() || !trnModule.trim()) return;
    setSavingTrn(true);
    try {
      await createTrainingRecordApi(
        {
          traineeType: trnType,
          traineeName: trnName.trim(),
          traineeEmail: trnEmail.trim().toLowerCase() || undefined,
          moduleName: trnModule.trim(),
        },
        bearerToken
      );
      setShowTrnModal(false);
      setTrnName('');
      setTrnEmail('');
      onShowAlert({ variant: 'success', title: 'Training Assigned', message: 'Training tracker updated.' });
      await loadOps();
    } catch (err) {
      onShowAlert({ variant: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Could not assign training.' });
    } finally {
      setSavingTrn(false);
    }
  }

  async function handleCreateTicket(e: FormEvent) {
    e.preventDefault();
    if (!tktSubject.trim() || !tktDesc.trim()) return;
    setSavingTkt(true);
    try {
      await createSupportTicketApi(
        {
          sourceType: tktSourceType,
          sourceName: tktSourceName.trim() || 'Partner Support Desk',
          category: tktCategory,
          priority: tktPriority,
          subject: tktSubject.trim(),
          description: tktDesc.trim(),
        },
        bearerToken
      );
      setShowTktModal(false);
      setTktSubject('');
      setTktDesc('');
      onShowAlert({ variant: 'success', title: 'Ticket Logged', message: 'Support ticket created.' });
      await loadOps();
    } catch (err) {
      onShowAlert({ variant: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Could not create ticket.' });
    } finally {
      setSavingTkt(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="chart-card-modern">
        <h2 className="card-top-title">Operations &amp; Partnerships Command</h2>
        <p style={{ color: '#64748B', fontSize: '0.86rem', marginTop: '8px' }}>
          Loading live 1–5 km dispatch matches, onboarding pipeline, KYC queue, and operational exceptions...
        </p>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="chart-card-modern">
        <div className="admin-auth-alert error">{errorMsg}</div>
        <button type="button" className="btn-primary" onClick={() => void loadOps()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header-row" style={{ marginBottom: 0 }}>
        <div className="page-title-group">
          <h1>Operations &amp; Partnerships (Akash)</h1>
          <p>
            1–5 km phlebotomist dispatch monitor, exception handling, onboarding, human-reviewed KYC/NABL compliance, training, support &amp; sample quality.
          </p>
        </div>
        {canManageDispatch && (
          <button
            type="button"
            className="btn-primary"
            disabled={runningMonitor}
            onClick={() => void handleRunDispatchMonitor()}
          >
            {runningMonitor ? 'Scanning Live Dispatch...' : 'Run Dispatch & SLA Monitor'}
          </button>
        )}
      </div>

      {/* KPI Row */}
      <section className="kpi-5-row" style={{ marginBottom: 0 }}>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-teal">📦</div>
          <div className="kpi-body">
            <span className="kpi-title">Open Bookings</span>
            <span className="kpi-main-number">{data?.kpis.openOrdersCount ?? 0}</span>
            <span className="kpi-sub-split">{data?.kpis.unassignedOrdersCount ?? 0} awaiting courier</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-blue">🏍️</div>
          <div className="kpi-body">
            <span className="kpi-title">Online Phlebos</span>
            <span className="kpi-main-number">{data?.kpis.onlinePhlebosCount ?? 0}</span>
            <span className="kpi-sub-split">1–5 km dispatch pool</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-orange">🚨</div>
          <div className="kpi-body">
            <span className="kpi-title">Open Exceptions</span>
            <span className="kpi-main-number">{data?.kpis.openExceptionsCount ?? 0}</span>
            <span className="kpi-sub-split">Timeout, delay &amp; temp alerts</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-purple">🛂</div>
          <div className="kpi-body">
            <span className="kpi-title">Onboarding Pipeline</span>
            <span className="kpi-main-number">{data?.kpis.pendingOnboardingCount ?? 0}</span>
            <span className="kpi-sub-split">{data?.kpis.pendingLabsVerificationCount ?? 0} labs pending review</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-indigo">🎫</div>
          <div className="kpi-body">
            <span className="kpi-title">Open Tickets</span>
            <span className="kpi-main-number">{data?.kpis.openTicketsCount ?? 0}</span>
            <span className="kpi-sub-split">Partner &amp; courier desk</span>
          </div>
        </div>
      </section>

      {/* Sub-tabs */}
      <div className="sub-tab-pills">
        <button type="button" className={`sub-tab-pill ${subTab === 'dispatch' ? 'active' : ''}`} onClick={() => setSubTab('dispatch')}>
          1–5 km Dispatch Pool ({data?.unassignedMatches.length || 0})
        </button>
        <button type="button" className={`sub-tab-pill ${subTab === 'exceptions' ? 'active' : ''}`} onClick={() => setSubTab('exceptions')}>
          Exceptions ({data?.kpis.openExceptionsCount || 0})
        </button>
        <button type="button" className={`sub-tab-pill ${subTab === 'onboarding' ? 'active' : ''}`} onClick={() => setSubTab('onboarding')}>
          Onboarding ({data?.onboarding.length || 0})
        </button>
        <button type="button" className={`sub-tab-pill ${subTab === 'verification' ? 'active' : ''}`} onClick={() => setSubTab('verification')}>
          Human Verification ({data?.verificationReviews.length || 0})
        </button>
        <button type="button" className={`sub-tab-pill ${subTab === 'training' ? 'active' : ''}`} onClick={() => setSubTab('training')}>
          Training ({data?.training.length || 0})
        </button>
        <button type="button" className={`sub-tab-pill ${subTab === 'tickets' ? 'active' : ''}`} onClick={() => setSubTab('tickets')}>
          Support Tickets ({data?.tickets.length || 0})
        </button>
        <button type="button" className={`sub-tab-pill ${subTab === 'runs' ? 'active' : ''}`} onClick={() => setSubTab('runs')}>
          Automation Runs
        </button>
      </div>

      {/* 1-5 KM DISPATCH POOL */}
      {subTab === 'dispatch' && (
        <div className="chart-card-modern">
          <div className="card-top-header">
            <div>
              <h2 className="card-top-title">Live Unassigned Pickups &amp; 1–5 km Phlebotomist Eligibility</h2>
              <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                Matches verified online phlebotomists inside each order&apos;s 1–5 km radius with fewer than 4 active loads.
              </p>
            </div>
          </div>
          {(data?.unassignedMatches || []).length === 0 ? (
            <div className="empty-state-box">
              <h4>No Unassigned Pickups Pending</h4>
              <p>All active bookings are assigned or completed.</p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Pickup -&gt; Hub</th>
                    <th>Broadcast Radius</th>
                    <th>Eligible Nearby Phlebos</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.unassignedMatches || []).map((m) => (
                    <tr key={m.orderId}>
                      <td><strong>{m.orderNumber}</strong></td>
                      <td>{m.smallLabName} -&gt; {m.targetLabName}</td>
                      <td><span className="status-pill-blue">{m.radiusKm} km</span></td>
                      <td>
                        {m.eligibleCandidates.length === 0 ? (
                          <span className="status-pill-red">0 within {m.radiusKm} km</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {m.eligibleCandidates.map((c) => (
                              <span key={c.phlebotomistId} className="status-pill-green">
                                {c.name} ({c.distanceKm} km • {c.activeLoad} active)
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* EXCEPTIONS */}
      {subTab === 'exceptions' && (
        <div className="chart-card-modern">
          <div className="card-top-header">
            <h2 className="card-top-title">Operational Exceptions ({data?.exceptions.length || 0})</h2>
          </div>
          {(data?.exceptions || []).length === 0 ? (
            <div className="empty-state-box">
              <h4>Zero Operational Exceptions</h4>
              <p>No unassigned timeouts, cold-chain excursions, or pickup delays logged.</p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Type &amp; Order</th>
                    <th>Severity</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.exceptions || []).map((exc) => (
                    <tr key={exc.id}>
                      <td>
                        <strong>{exc.exceptionType.replace(/_/g, ' ')}</strong>
                        <div style={{ fontSize: '0.73rem', color: '#64748B' }}>{exc.orderNumber || exc.id}</div>
                      </td>
                      <td><span className={exc.severity === 'CRITICAL' ? 'status-pill-red' : 'status-pill-amber'}>{exc.severity}</span></td>
                      <td style={{ maxWidth: '300px', fontSize: '0.78rem' }}>{exc.details}</td>
                      <td><span className={exc.status === 'RESOLVED' ? 'status-pill-green' : exc.status === 'ESCALATED' ? 'status-pill-red' : 'status-pill-amber'}>{exc.status}</span></td>
                      <td>
                        {exc.status !== 'RESOLVED' && canManageDispatch && (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => void resolveOpsExceptionApi(exc.id, { status: 'ACKNOWLEDGED' }, bearerToken).then(() => loadOps())}
                            >
                              Acknowledge
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => void resolveOpsExceptionApi(exc.id, { escalate: true }, bearerToken).then(() => loadOps())}
                            >
                              Escalate
                            </button>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => {
                                setResolveExcId(exc.id);
                                setResolveNotes('');
                                setBackupPhleboId('');
                              }}
                            >
                              Resolve
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ONBOARDING PIPELINE */}
      {subTab === 'onboarding' && (
        <div className="chart-card-modern">
          <div className="card-top-header">
            <h2 className="card-top-title">Partner &amp; Phlebotomist Onboarding ({data?.onboarding.length || 0})</h2>
            {canManageOnboarding && (
              <button type="button" className="btn-primary" onClick={() => setShowOnbModal(true)}>
                + Add Onboarding Record
              </button>
            )}
          </div>
          {(data?.onboarding || []).length === 0 ? (
            <div className="empty-state-box">
              <h4>No Partners in Onboarding Pipeline</h4>
              <p>Leads converted by Marketing &amp; Growth appear here automatically, or you can log a direct onboarding application.</p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Contact &amp; City</th>
                    <th>Stage</th>
                    <th>Verification</th>
                    <th>Training</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.onboarding || []).map((ob) => (
                    <tr key={ob.id}>
                      <td>
                        <strong>{ob.entityName}</strong>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{ob.entityType.replace(/_/g, ' ')} • {ob.id}</div>
                      </td>
                      <td>
                        <div>{ob.contactEmail}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{ob.city}</div>
                      </td>
                      <td>
                        {canManageOnboarding ? (
                          <select
                            className="form-select"
                            style={{ width: '190px' }}
                            value={ob.stage}
                            onChange={(e) =>
                              void updateOnboardingApi(ob.id, { stage: e.target.value as OnboardingStage }, bearerToken).then(() => loadOps())
                            }
                          >
                            <option value="APPLICATION_SUBMITTED">Application Submitted</option>
                            <option value="DOCUMENTS_UPLOADED">Documents Uploaded</option>
                            <option value="UNDER_VERIFICATION">Under Verification</option>
                            <option value="TRAINING_IN_PROGRESS">Training In Progress</option>
                            <option value="READY_FOR_ACTIVATION">Ready For Activation</option>
                            <option value="ACTIVE">Active</option>
                            <option value="REJECTED">Rejected</option>
                          </select>
                        ) : (
                          <span className="status-pill-blue">{ob.stage.replace(/_/g, ' ')}</span>
                        )}
                      </td>
                      <td><span className={ob.verificationStatus === 'VERIFIED' ? 'status-pill-green' : 'status-pill-amber'}>{ob.verificationStatus}</span></td>
                      <td><span className="status-pill-slate">{ob.trainingStatus.replace(/_/g, ' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* HUMAN VERIFICATION QUEUE */}
      {subTab === 'verification' && (
        <div className="chart-card-modern">
          <div className="card-top-header">
            <div>
              <h2 className="card-top-title">KYC &amp; NABL Human Verification Queue ({data?.verificationReviews.length || 0})</h2>
              <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                Strict Access &amp; Human Review: Document URLs are only visible to staff holding <code>VIEW_IDENTITY_DOCS</code>; final approvals require human action.
              </p>
            </div>
            {(canManageOnboarding || canManageVerification) && (
              <button type="button" className="btn-primary" onClick={() => setShowVerModal(true)}>
                + Queue Verification Review
              </button>
            )}
          </div>
          {(data?.verificationReviews || []).length === 0 ? (
            <div className="empty-state-box"><h4>No Pending Verification Reviews</h4></div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Entity &amp; Document Type</th>
                    <th>Document Inspection</th>
                    <th>Status</th>
                    <th>Human Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.verificationReviews || []).map((vr) => (
                    <tr key={vr.id}>
                      <td>
                        <strong>{vr.entityName}</strong>
                        <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                          {vr.entityType} • {vr.documentType.replace(/_/g, ' ')} ({vr.entityId})
                        </div>
                      </td>
                      <td>
                        {!canViewIdentityDocs ? (
                          <span className="status-pill-slate">Hidden (VIEW_IDENTITY_DOCS required)</span>
                        ) : vr.documentUrl ? (
                          <a href={vr.documentUrl} target="_blank" rel="noreferrer" className="btn-link-muted">
                            Inspect Uploaded Document -&gt;
                          </a>
                        ) : (
                          <span style={{ fontSize: '0.76rem', color: '#64748B' }}>No file link attached</span>
                        )}
                      </td>
                      <td>
                        <span className={vr.status === 'APPROVED' ? 'status-pill-green' : vr.status === 'REJECTED' ? 'status-pill-red' : 'status-pill-amber'}>
                          {vr.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        {vr.status === 'PENDING_REVIEW' ? (
                          canManageVerification ? (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={() => void decideVerificationReviewApi(vr.id, { decision: 'APPROVED' }, bearerToken).then(() => loadOps())}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => void decideVerificationReviewApi(vr.id, { decision: 'RESUBMIT_REQUIRED' }, bearerToken).then(() => loadOps())}
                              >
                                Request Resubmit
                              </button>
                              <button
                                type="button"
                                className="btn-danger-soft"
                                onClick={() => void decideVerificationReviewApi(vr.id, { decision: 'REJECTED' }, bearerToken).then(() => loadOps())}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Requires MANAGE_VERIFICATION</span>
                          )
                        ) : (
                          <span style={{ fontSize: '0.74rem', color: '#475569' }}>{vr.reviewerEmail || 'Reviewed'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TRAINING TRACKER */}
      {subTab === 'training' && (
        <div className="chart-card-modern">
          <div className="card-top-header">
            <h2 className="card-top-title">Training &amp; SOP Readiness ({data?.training.length || 0})</h2>
            {canManageTraining && (
              <button type="button" className="btn-primary" onClick={() => setShowTrnModal(true)}>
                + Assign Training Module
              </button>
            )}
          </div>
          {(data?.training || []).length === 0 ? (
            <div className="empty-state-box"><h4>No Training Sessions Assigned Yet</h4></div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Trainee</th>
                    <th>SOP Module</th>
                    <th>Trainer</th>
                    <th>Status</th>
                    {canManageTraining && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {(data?.training || []).map((tr) => (
                    <tr key={tr.id}>
                      <td><strong>{tr.traineeName}</strong><div style={{ fontSize: '0.72rem', color: '#64748B' }}>{tr.traineeType}</div></td>
                      <td>{tr.moduleName}</td>
                      <td>{tr.trainerName || 'Operations'}</td>
                      <td><span className={tr.status === 'COMPLETED' ? 'status-pill-green' : 'status-pill-amber'}>{tr.status}</span></td>
                      {canManageTraining && (
                        <td>
                          {tr.status !== 'COMPLETED' && (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => void updateTrainingRecordApi(tr.id, { status: 'COMPLETED', assessmentScorePct: 95 }, bearerToken).then(() => loadOps())}
                            >
                              Mark Completed
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUPPORT TICKETS */}
      {subTab === 'tickets' && (
        <div className="chart-card-modern">
          <div className="card-top-header">
            <h2 className="card-top-title">Partner &amp; Phlebo Support Tickets ({data?.tickets.length || 0})</h2>
            <button type="button" className="btn-primary" onClick={() => setShowTktModal(true)}>
              + Create Support Ticket
            </button>
          </div>
          {(data?.tickets || []).length === 0 ? (
            <div className="empty-state-box"><h4>No Active Support Tickets</h4></div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Source &amp; Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    {canManageTickets && <th>Update</th>}
                  </tr>
                </thead>
                <tbody>
                  {(data?.tickets || []).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.ticketNumber}: {t.subject}</strong>
                        <div style={{ fontSize: '0.74rem', color: '#64748B', maxWidth: '300px' }}>{t.description}</div>
                      </td>
                      <td>{t.sourceName} • {t.category.replace(/_/g, ' ')}</td>
                      <td><span className={t.priority === 'CRITICAL' ? 'status-pill-red' : 'status-pill-amber'}>{t.priority}</span></td>
                      <td><span className={t.status === 'RESOLVED' || t.status === 'CLOSED' ? 'status-pill-green' : 'status-pill-blue'}>{t.status}</span></td>
                      {canManageTickets && (
                        <td>
                          {t.status !== 'RESOLVED' && t.status !== 'CLOSED' && (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => void updateSupportTicketApi(t.id, { status: 'ESCALATED' }, bearerToken).then(() => loadOps())}
                              >
                                Escalate
                              </button>
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={() => void updateSupportTicketApi(t.id, { status: 'RESOLVED' }, bearerToken).then(() => loadOps())}
                              >
                                Resolve
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* AUTOMATION RUNS */}
      {subTab === 'runs' && (
        <div className="chart-card-modern">
          <h2 className="card-top-title">Operations Automation Run Log ({data?.automationRuns.length || 0})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            {(data?.automationRuns || []).length === 0 ? (
              <div className="empty-state-box"><h4>No Dispatch Automation Runs Yet</h4></div>
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
                  <span className={run.status === 'SUCCESS' ? 'status-pill-green' : 'status-pill-amber'}>{run.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: RESOLVE EXCEPTION */}
      {resolveExcId && (
        <div className="modal-overlay" onClick={() => !resolvingExc && setResolveExcId(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Resolve Operational Exception</h3>
              <button type="button" className="btn-secondary" onClick={() => setResolveExcId(null)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleResolveExceptionSubmit(e)}>
              <div className="modal-body">
                {phlebotomists.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Optional: Reassign Backup Phlebotomist</label>
                    <select className="form-select" value={backupPhleboId} onChange={(e) => setBackupPhleboId(e.target.value)}>
                      <option value="">No courier change</option>
                      {phlebotomists.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Resolution Notes</label>
                  <textarea className="form-input" rows={3} value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setResolveExcId(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={resolvingExc}>{resolvingExc ? 'Resolving...' : 'Confirm Resolution'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ONBOARDING */}
      {showOnbModal && (
        <div className="modal-overlay" onClick={() => !savingOnb && setShowOnbModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Add Onboarding Partner</h3><button type="button" className="btn-secondary" onClick={() => setShowOnbModal(false)}>✕</button></div>
            <form onSubmit={(e) => void handleCreateOnboarding(e)}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Entity Type</label>
                  <select className="form-select" value={onbType} onChange={(e) => setOnbType(e.target.value as OnboardingEntityType)}>
                    <option value="SMALL_LAB">Small Collection Lab</option>
                    <option value="LARGE_LAB">Large Reference Lab</option>
                    <option value="PHLEBOTOMIST">Field Phlebotomist</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Partner Name</label><input className="form-input" value={onbName} onChange={(e) => setOnbName(e.target.value)} required /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group"><label className="form-label">City</label><input className="form-input" value={onbCity} onChange={(e) => setOnbCity(e.target.value)} required /></div>
                  <div className="form-group"><label className="form-label">Contact Person</label><input className="form-input" value={onbContact} onChange={(e) => setOnbContact(e.target.value)} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={onbEmail} onChange={(e) => setOnbEmail(e.target.value)} required /></div>
                  <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={onbPhone} onChange={(e) => setOnbPhone(e.target.value)} /></div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowOnbModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingOnb}>{savingOnb ? 'Saving...' : 'Save Record'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VERIFICATION REVIEW */}
      {showVerModal && (
        <div className="modal-overlay" onClick={() => !savingVer && setShowVerModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Queue Human Verification</h3><button type="button" className="btn-secondary" onClick={() => setShowVerModal(false)}>✕</button></div>
            <form onSubmit={(e) => void handleCreateVerification(e)}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Entity Type</label>
                    <select className="form-select" value={verEntityType} onChange={(e) => setVerEntityType(e.target.value as OnboardingEntityType)}>
                      <option value="SMALL_LAB">Small Lab</option>
                      <option value="LARGE_LAB">Large Lab</option>
                      <option value="PHLEBOTOMIST">Phlebotomist</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Document Type</label>
                    <select className="form-select" value={verDocType} onChange={(e) => setVerDocType(e.target.value as VerificationReviewRecord['documentType'])}>
                      <option value="NABL_CERTIFICATE">NABL Certificate</option>
                      <option value="LAB_REGISTRATION">Lab Registration</option>
                      <option value="AADHAAR_PAN_KYC">KYC Document</option>
                      <option value="PHLEBO_DL_ID">Phlebo Driving License / ID</option>
                      <option value="COLD_BOX_AUDIT">Cold Box Audit</option>
                    </select>
                  </div>
                </div>
                <div className="form-group"><label className="form-label">Entity ID</label><input className="form-input" value={verEntityId} onChange={(e) => setVerEntityId(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Entity Name</label><input className="form-input" value={verEntityName} onChange={(e) => setVerEntityName(e.target.value)} required /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowVerModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingVer}>{savingVer ? 'Adding...' : 'Add to Queue'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TRAINING */}
      {showTrnModal && (
        <div className="modal-overlay" onClick={() => !savingTrn && setShowTrnModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Assign Training Session</h3><button type="button" className="btn-secondary" onClick={() => setShowTrnModal(false)}>✕</button></div>
            <form onSubmit={(e) => void handleCreateTraining(e)}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Trainee Role</label>
                  <select className="form-select" value={trnType} onChange={(e) => setTrnType(e.target.value as TrainingRecord['traineeType'])}>
                    <option value="PHLEBOTOMIST">Field Phlebotomist</option>
                    <option value="SMALL_LAB_STAFF">Small Lab Staff</option>
                    <option value="LARGE_LAB_STAFF">Large Lab Staff</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Trainee Name</label><input className="form-input" value={trnName} onChange={(e) => setTrnName(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Trainee Email (Optional)</label><input type="email" className="form-input" value={trnEmail} onChange={(e) => setTrnEmail(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Module Name</label><input className="form-input" value={trnModule} onChange={(e) => setTrnModule(e.target.value)} required /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowTrnModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingTrn}>{savingTrn ? 'Saving...' : 'Assign Module'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TICKET */}
      {showTktModal && (
        <div className="modal-overlay" onClick={() => !savingTkt && setShowTktModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Create Support Ticket</h3><button type="button" className="btn-secondary" onClick={() => setShowTktModal(false)}>✕</button></div>
            <form onSubmit={(e) => void handleCreateTicket(e)}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Source Type</label>
                    <select className="form-select" value={tktSourceType} onChange={(e) => setTktSourceType(e.target.value as SupportTicketRecord['sourceType'])}>
                      <option value="SMALL_LAB">Small Lab</option>
                      <option value="LARGE_LAB">Large Lab</option>
                      <option value="PHLEBOTOMIST">Phlebotomist</option>
                      <option value="INTERNAL">Internal Team</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select className="form-select" value={tktPriority} onChange={(e) => setTktPriority(e.target.value as SupportTicketRecord['priority'])}>
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group"><label className="form-label">Source / Partner Name</label><input className="form-input" value={tktSourceName} onChange={(e) => setTktSourceName(e.target.value)} /></div>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="form-select" value={tktCategory} onChange={(e) => setTktCategory(e.target.value as SupportTicketRecord['category'])}>
                      <option value="PICKUP_DELAY">Pickup Delay</option>
                      <option value="UNASSIGNED_BOOKING">Unassigned Booking</option>
                      <option value="COLD_CHAIN_ISSUE">Cold-Chain Issue</option>
                      <option value="REPORT_DELAY">Report Delay</option>
                      <option value="PARTNER_ONBOARDING">Partner Onboarding</option>
                      <option value="BILLING_QUERY">Billing Query</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>
                <div className="form-group"><label className="form-label">Subject</label><input className="form-input" value={tktSubject} onChange={(e) => setTktSubject(e.target.value)} required /></div>
                <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={3} value={tktDesc} onChange={(e) => setTktDesc(e.target.value)} required /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowTktModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingTkt}>{savingTkt ? 'Saving...' : 'Log Ticket'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

