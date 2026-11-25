import { useMemo, useState, type FormEvent } from 'react';
import {
  type CommissionConfig,
  type LabFacility,
  type LargeLabB2bAgreement,
  type OrderPricingSplitResult,
  OrderPriority,
} from '@diagnostic/shared';
import { ModalFrame } from '../../components/shared';

export interface AdminCommissionTabProps {
  commConfig: CommissionConfig;
  onCommConfigChange: (next: CommissionConfig) => void;
  onSaveCommissionConfig: () => Promise<void>;
  canViewFinanceOps: boolean;
  onOpenFinanceOps: () => void;
  largeLabOrgs: LabFacility[];
  simDropType: 'LARGE_LAB' | 'SELF_DROP' | 'CUSTOM_ADDRESS';
  onSimDropTypeChange: (val: 'LARGE_LAB' | 'SELF_DROP' | 'CUSTOM_ADDRESS') => void;
  simLabOrgId: string;
  onSimLabOrgIdChange: (val: string) => void;
  simSmallTariff: number;
  onSimSmallTariffChange: (val: number) => void;
  simLargeB2bRate: number;
  onSimLargeB2bRateChange: (val: number) => void;
  simDistanceKm: number;
  onSimDistanceKmChange: (val: number) => void;
  simPriority: OrderPriority;
  onSimPriorityChange: (val: OrderPriority) => void;
  simulatedSplit: OrderPricingSplitResult;
  agreementLabId: string;
  onAgreementLabChange: (id: string) => void;
  agreementCommPct: number;
  onAgreementCommPctChange: (val: number) => void;
  agreementMarkupPct: number;
  onAgreementMarkupPctChange: (val: number) => void;
  agreementCycle: 'DAILY' | 'T_PLUS_2' | 'WEEKLY';
  onAgreementCycleChange: (val: 'DAILY' | 'T_PLUS_2' | 'WEEKLY') => void;
  agreementMinPayout: number;
  onAgreementMinPayoutChange: (val: number) => void;
  agreementNotes: string;
  onAgreementNotesChange: (val: string) => void;
  onSaveAgreement: (e: FormEvent) => Promise<void>;
}

type SubTabKey =
  | 'global-rules'
  | 'b2b-agreements'
  | 'payout-settings'
  | 'plans-subscriptions'
  | 'billing-controls';

interface DisplayAgreementItem {
  id: string;
  num: number;
  labName: string;
  rateModel: string;
  smallLabPayableInr: number;
  largeLabRateInr: number;
  routeMaxKm: number;
  urgency: 'Routine' | 'Priority' | 'Express';
  status: 'Active' | 'Paused';
}

const DEFAULT_B2B_ROWS: DisplayAgreementItem[] = [
  {
    id: 'ag-metro-01',
    num: 1,
    labName: 'Metro Diagnostic Lab',
    rateModel: 'Fixed Rate',
    smallLabPayableInr: 1200,
    largeLabRateInr: 950,
    routeMaxKm: 10,
    urgency: 'Routine',
    status: 'Active',
  },
  {
    id: 'ag-citycare-02',
    num: 2,
    labName: 'CityCare Reference Lab',
    rateModel: '% Commission (10%)',
    smallLabPayableInr: 1300,
    largeLabRateInr: 1000,
    routeMaxKm: 12,
    urgency: 'Priority',
    status: 'Active',
  },
  {
    id: 'ag-global-03',
    num: 3,
    labName: 'Global Path Labs',
    rateModel: 'Custom',
    smallLabPayableInr: 1250,
    largeLabRateInr: 970,
    routeMaxKm: 15,
    urgency: 'Express',
    status: 'Paused',
  },
];

export function AdminCommissionTab({
  commConfig,
  onCommConfigChange,
  onSaveCommissionConfig,
  canViewFinanceOps: _canViewFinanceOps,
  onOpenFinanceOps,
  largeLabOrgs,
  simDropType,
  onSimDropTypeChange,
  simLabOrgId,
  onSimLabOrgIdChange,
  simSmallTariff,
  onSimSmallTariffChange,
  simLargeB2bRate,
  onSimLargeB2bRateChange,
  simDistanceKm,
  onSimDistanceKmChange,
  simPriority,
  onSimPriorityChange,
  simulatedSplit: _simulatedSplit,
  agreementLabId: _agreementLabId,
  onAgreementLabChange: _onAgreementLabChange,
  agreementCommPct: _agreementCommPct,
  onAgreementCommPctChange: _onAgreementCommPctChange,
  agreementMarkupPct: _agreementMarkupPct,
  onAgreementMarkupPctChange: _onAgreementMarkupPctChange,
  agreementCycle: _agreementCycle,
  onAgreementCycleChange: _onAgreementCycleChange,
  agreementMinPayout: _agreementMinPayout,
  onAgreementMinPayoutChange: _onAgreementMinPayoutChange,
  agreementNotes: _agreementNotes,
  onAgreementNotesChange: _onAgreementNotesChange,
  onSaveAgreement: _onSaveAgreement,
}: AdminCommissionTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>('global-rules');

  // Modal for Adding / Editing B2B Agreement
  const [editingAgreement, setEditingAgreement] = useState<DisplayAgreementItem | null>(null);
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [modalLabName, setModalLabName] = useState('');
  const [modalRateModel, setModalRateModel] = useState('Fixed Rate');
  const [modalSmallPayable, setModalSmallPayable] = useState(1200);
  const [modalLargeRate, setModalLargeRate] = useState(950);
  const [modalRouteMax, setModalRouteMax] = useState(10);
  const [modalUrgency, setModalUrgency] = useState<'Routine' | 'Priority' | 'Express'>('Routine');
  const [modalStatus, setModalStatus] = useState<'Active' | 'Paused'>('Active');
  const [savingGlobalRules, setSavingGlobalRules] = useState(false);

  // Broadcast radius state (min - max range)
  const broadcastMinKm = commConfig.defaultBroadcastRadiusKm ?? 3;
  const broadcastMaxKm = commConfig.broadcastRadiusMaxKm ?? 15;

  // Simulator Reset handler
  function handleResetSimulator() {
    onSimDropTypeChange('LARGE_LAB');
    onSimLabOrgIdChange('');
    onSimSmallTariffChange(1200);
    onSimLargeB2bRateChange(950);
    onSimDistanceKmChange(7.5);
    onSimPriorityChange(OrderPriority.ROUTINE);
  }

  // Simulator dynamic calculations matching exact screenshot formula:
  // Tariff = simSmallTariff (1200)
  // Distance = simDistanceKm (7.5)
  // Base included km = commConfig.includedBaseKm ?? 5
  // Extra km = Math.max(0, simDistanceKm - (commConfig.includedBaseKm ?? 5)) = 2.5
  // Extra per km rate = commConfig.perKmFeeInr ?? 12
  // Extra distance fee = extraKm * perKmFeeInr = 2.5 * 12 = 30
  // Courier fee = courierBaseFeeInr (250) + extra distance fee (30) = 280
  // Total payable by Small Lab = simSmallTariff (1200) + Courier fee (280) = 1480
  // Large Lab Share = simLargeB2bRate (950)
  // Phlebotomist Payout = Courier fee (280)
  // Platform Net Fee = Total payable (1480) - Large Lab (950) - Phlebo (280) = 250
  const simIncludedKm = commConfig.includedBaseKm ?? 5;
  const simExtraKm = Math.max(0, simDistanceKm - simIncludedKm);
  const simPerKmRate = commConfig.perKmFeeInr ?? 12;
  const simExtraDistFee = Math.round(simExtraKm * simPerKmRate);
  const simBaseCourier = commConfig.courierBaseFeeInr ?? 250;
  const simTotalCourier = simBaseCourier + simExtraDistFee;

  const calcSmallLabPays = Math.round(simSmallTariff + simTotalCourier);
  const calcLargeLabShare = Math.round(simLargeB2bRate);
  const calcPhleboPayout = Math.round(simTotalCourier);
  const calcPlatformNetFee = Math.max(0, calcSmallLabPays - calcLargeLabShare - calcPhleboPayout);

  const totalCalculated = Math.max(1, calcSmallLabPays);
  const largeLabPct = Number(((calcLargeLabShare / totalCalculated) * 100).toFixed(1));
  const phleboPct = Number(((calcPhleboPayout / totalCalculated) * 100).toFixed(1));
  const platformPct = Number((100 - largeLabPct - phleboPct).toFixed(1));
  const phleboPerKm = simDistanceKm > 0 ? (calcPhleboPayout / simDistanceKm).toFixed(1) : '0';

  // SVG Donut Chart angles
  const circumference = 2 * Math.PI * 40; // radius = 40
  const strokeDashoffsetLab = 0;
  const strokeDasharrayLab = `${(largeLabPct / 100) * circumference} ${circumference}`;

  const strokeDashoffsetPhlebo = -((largeLabPct / 100) * circumference);
  const strokeDasharrayPhlebo = `${(phleboPct / 100) * circumference} ${circumference}`;

  const strokeDashoffsetPlatform = -(((largeLabPct + phleboPct) / 100) * circumference);
  const strokeDasharrayPlatform = `${(platformPct / 100) * circumference} ${circumference}`;

  // Merge live custom agreements with defaults
  const b2bAgreementsList: DisplayAgreementItem[] = useMemo(() => {
    const customMap = commConfig.largeLabAgreements || {};
    const customKeys = Object.keys(customMap);
    if (customKeys.length === 0) {
      return DEFAULT_B2B_ROWS;
    }
    return customKeys.map((k, idx) => {
      const ag = customMap[k];
      return {
        id: ag.labId || `custom-${idx}`,
        num: idx + 1,
        labName: ag.labName || ag.labId,
        rateModel: ag.rateModel || `${ag.agreedCommissionPct}% Comm`,
        smallLabPayableInr: ag.smallLabPayableInr ?? 1200,
        largeLabRateInr: ag.largeLabRateInr ?? 950,
        routeMaxKm: ag.routeMaxKm ?? 10,
        urgency: (ag.urgency as 'Routine' | 'Priority' | 'Express') || 'Routine',
        status: (ag.status as 'Active' | 'Paused') || 'Active',
      };
    });
  }, [commConfig.largeLabAgreements]);

  // Handle open add agreement modal
  function handleOpenAddAgreement() {
    setEditingAgreement(null);
    setModalLabName(largeLabOrgs[0]?.name || 'Metro Diagnostic Lab');
    setModalRateModel('Fixed Rate');
    setModalSmallPayable(1200);
    setModalLargeRate(950);
    setModalRouteMax(10);
    setModalUrgency('Routine');
    setModalStatus('Active');
    setShowAgreementModal(true);
  }

  // Handle edit agreement modal
  function handleOpenEditAgreement(item: DisplayAgreementItem) {
    setEditingAgreement(item);
    setModalLabName(item.labName);
    setModalRateModel(item.rateModel);
    setModalSmallPayable(item.smallLabPayableInr);
    setModalLargeRate(item.largeLabRateInr);
    setModalRouteMax(item.routeMaxKm);
    setModalUrgency(item.urgency);
    setModalStatus(item.status);
    setShowAgreementModal(true);
  }

  // Handle duplicate agreement
  function handleDuplicateAgreement(item: DisplayAgreementItem) {
    const newAg: LargeLabB2bAgreement = {
      labId: `lab-${Date.now()}`,
      labName: `${item.labName} (Copy)`,
      agreedCommissionPct: 15,
      b2bMarkupPct: 10,
      rateModel: item.rateModel,
      smallLabPayableInr: item.smallLabPayableInr,
      largeLabRateInr: item.largeLabRateInr,
      routeMaxKm: item.routeMaxKm,
      urgency: item.urgency,
      status: item.status === 'Paused' ? 'PAUSED' : 'ACTIVE',
      updatedAt: new Date().toISOString(),
    };
    const nextAgreements = {
      ...(commConfig.largeLabAgreements || {}),
      [newAg.labId]: newAg,
    };
    onCommConfigChange({
      ...commConfig,
      largeLabAgreements: nextAgreements,
    });
  }

  // Handle delete agreement
  function handleDeleteAgreement(id: string) {
    if (!window.confirm('Are you sure you want to delete this B2B agreement?')) return;
    const nextMap = { ...(commConfig.largeLabAgreements || {}) };
    delete nextMap[id];
    onCommConfigChange({
      ...commConfig,
      largeLabAgreements: nextMap,
    });
  }

  // Save Agreement Modal submit
  function handleSaveAgreementModal(e: FormEvent) {
    e.preventDefault();
    const labKey = editingAgreement?.id || `lab-${Date.now()}`;
    const newAg: LargeLabB2bAgreement = {
      labId: labKey,
      labName: modalLabName,
      agreedCommissionPct: 15,
      b2bMarkupPct: 10,
      rateModel: modalRateModel,
      smallLabPayableInr: modalSmallPayable,
      largeLabRateInr: modalLargeRate,
      routeMaxKm: modalRouteMax,
      urgency: modalUrgency,
      status: modalStatus === 'Paused' ? 'PAUSED' : 'ACTIVE',
      updatedAt: new Date().toISOString(),
    };
    const nextAgreements = {
      ...(commConfig.largeLabAgreements || {}),
      [labKey]: newAg,
    };
    onCommConfigChange({
      ...commConfig,
      largeLabAgreements: nextAgreements,
    });
    setShowAgreementModal(false);
  }

  async function handleSaveGlobalRules() {
    setSavingGlobalRules(true);
    try {
      await onSaveCommissionConfig();
    } finally {
      setSavingGlobalRules(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span>Payments &amp; Settlements</span>
        <span>&gt;</span>
        <span style={{ color: '#0F172A', fontWeight: 600 }}>Commission &amp; Payouts</span>
      </div>

      {/* Title & Subtitle */}
      <div>
        <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
          Commission, Rates &amp; Payouts
        </h1>
        <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>
          Manage platform commission, logistics charges, payout rules and partner rate agreements.
        </p>
      </div>

      {/* Sub-tab Navigation Pills */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('global-rules')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            border: activeSubTab === 'global-rules' ? '1px solid #0D9488' : '1px solid #E2E8F0',
            backgroundColor: activeSubTab === 'global-rules' ? '#0D9488' : '#FFFFFF',
            color: activeSubTab === 'global-rules' ? '#FFFFFF' : '#475569',
          }}
        >
          <span>⚙️</span> Global Rules
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('b2b-agreements');
            document.getElementById('b2b-agreements-section')?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            border: activeSubTab === 'b2b-agreements' ? '1px solid #0D9488' : '1px solid #E2E8F0',
            backgroundColor: activeSubTab === 'b2b-agreements' ? '#0D9488' : '#FFFFFF',
            color: activeSubTab === 'b2b-agreements' ? '#FFFFFF' : '#475569',
          }}
        >
          <span>🤝</span> B2B Rate Agreements
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('payout-settings')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            border: activeSubTab === 'payout-settings' ? '1px solid #0D9488' : '1px solid #E2E8F0',
            backgroundColor: activeSubTab === 'payout-settings' ? '#0D9488' : '#FFFFFF',
            color: activeSubTab === 'payout-settings' ? '#FFFFFF' : '#475569',
          }}
        >
          <span>💳</span> Payout Settings
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('plans-subscriptions')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            border: activeSubTab === 'plans-subscriptions' ? '1px solid #0D9488' : '1px solid #E2E8F0',
            backgroundColor: activeSubTab === 'plans-subscriptions' ? '#0D9488' : '#FFFFFF',
            color: activeSubTab === 'plans-subscriptions' ? '#FFFFFF' : '#475569',
          }}
        >
          <span>📦</span> Plans &amp; Subscriptions
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('billing-controls');
            onOpenFinanceOps();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            border: activeSubTab === 'billing-controls' ? '1px solid #0D9488' : '1px solid #E2E8F0',
            backgroundColor: activeSubTab === 'billing-controls' ? '#0D9488' : '#FFFFFF',
            color: activeSubTab === 'billing-controls' ? '#FFFFFF' : '#475569',
          }}
        >
          <span>🧾</span> Billing Controls
        </button>
      </div>

      {/* Top 6 KPI Stat Cards + Commercial Model Card */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px',
        }}
      >
        {/* 1. Platform Fee */}
        <div className="chart-card-modern" style={{ padding: '12px 14px', margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '1.1rem', color: '#0D9488' }}>📑</span>
            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Platform Fee</span>
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>
            {commConfig.commissionPct ?? 15}%
          </div>
        </div>

        {/* 2. Courier Base Fee */}
        <div className="chart-card-modern" style={{ padding: '12px 14px', margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '1.1rem', color: '#0D9488' }}>🚚</span>
            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Courier Base Fee</span>
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>
            ₹{commConfig.courierBaseFeeInr ?? 250}
          </div>
        </div>

        {/* 3. Included Distance */}
        <div className="chart-card-modern" style={{ padding: '12px 14px', margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '1.1rem', color: '#0D9488' }}>📍</span>
            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Included Distance</span>
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>
            {commConfig.includedBaseKm ?? 5} km
          </div>
        </div>

        {/* 4. Extra Per-Km */}
        <div className="chart-card-modern" style={{ padding: '12px 14px', margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '1.1rem', color: '#0D9488' }}>⚡</span>
            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Extra Per-Km</span>
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>
            ₹{commConfig.perKmFeeInr ?? 12}
          </div>
        </div>

        {/* 5. Instant Payout SLA */}
        <div className="chart-card-modern" style={{ padding: '12px 14px', margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '1.1rem', color: '#0D9488' }}>⏱️</span>
            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Instant Payout SLA</span>
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>
            {commConfig.instantPayoutWindowMinutes ?? 30} min
          </div>
        </div>

        {/* 6. Active B2B Agreements */}
        <div className="chart-card-modern" style={{ padding: '12px 14px', margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '1.1rem', color: '#0D9488' }}>🏢</span>
            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Active B2B Agreements</span>
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>
            {b2bAgreementsList.filter((a) => a.status === 'Active').length || 3}
          </div>
        </div>

        {/* 7. Commercial Model Status Card */}
        <div
          style={{
            gridColumn: 'span 2',
            minWidth: '220px',
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: '#10B981',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.9rem',
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            ✓
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>
              Commercial Model
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#065F46' }}>
              30-Min Instant Payout + Platform Fees
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row: Two Large Cards Side-by-Side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px' }}>
        {/* Left Card: Global Commission & Logistics Rules */}
        <div className="chart-card-modern" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#0D9488',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontSize: '1rem',
              }}
            >
              ⚙️
            </div>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Global Commission &amp; Logistics Rules
              </h2>
              <div style={{ fontSize: '0.76rem', color: '#64748B' }}>
                Configure platform commission, courier charges and dispatch radius.
              </div>
            </div>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            {/* Row 1: Platform Fee & Margin Model */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.76rem' }}>
                  Default Platform Fee (%) ⓘ
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={commConfig.commissionPct ?? 15}
                  onChange={(e) => onCommConfigChange({ ...commConfig, commissionPct: Number(e.target.value) })}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.76rem' }}>
                  Default Margin Model
                </label>
                <select
                  className="form-select"
                  value={commConfig.defaultMarginMode || 'PCT_OF_GROSS'}
                  onChange={(e) =>
                    onCommConfigChange({
                      ...commConfig,
                      defaultMarginMode: e.target.value as 'PCT_OF_GROSS' | 'MARKUP_ON_B2B',
                    })
                  }
                >
                  <option value="PCT_OF_GROSS">% Commission on Test</option>
                  <option value="MARKUP_ON_B2B">Markup on Negotiated Large Lab Rate</option>
                </select>
              </div>
            </div>

            {/* Row 2: Courier Base, Included Km, Extra Per Km */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.76rem' }}>
                  Courier Base Fee (₹)
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={commConfig.courierBaseFeeInr ?? 250}
                  onChange={(e) => onCommConfigChange({ ...commConfig, courierBaseFeeInr: Number(e.target.value) })}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.76rem' }}>
                  Included Base Km ⓘ
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={commConfig.includedBaseKm ?? 5}
                  onChange={(e) => onCommConfigChange({ ...commConfig, includedBaseKm: Number(e.target.value) })}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.76rem' }}>
                  Extra Per-Km Rate (₹) ⓘ
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={commConfig.perKmFeeInr ?? 12}
                  onChange={(e) => onCommConfigChange({ ...commConfig, perKmFeeInr: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Row 3: Self/Custom Drop Fee & STAT Priority Surcharge */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.76rem' }}>
                  Self / Custom Drop Fee (₹) ⓘ
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={commConfig.customDropBaseFeeInr ?? 99}
                  onChange={(e) => onCommConfigChange({ ...commConfig, customDropBaseFeeInr: Number(e.target.value) })}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.76rem' }}>
                  STAT Priority Surcharge (₹) ⓘ
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={commConfig.statSurchargeInr ?? 150}
                  onChange={(e) => onCommConfigChange({ ...commConfig, statSurchargeInr: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Row 4: Live Rider Broadcast Radius dual range visual */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.76rem' }}>
                Live Rider Broadcast Radius ⓘ
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  gap: '12px',
                }}
              >
                <span
                  style={{
                    backgroundColor: '#0D9488',
                    color: '#FFFFFF',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '999px',
                  }}
                >
                  {broadcastMinKm} km
                </span>
                <input
                  type="range"
                  min={1}
                  max={25}
                  value={broadcastMaxKm}
                  onChange={(e) =>
                    onCommConfigChange({
                      ...commConfig,
                      broadcastRadiusMaxKm: Number(e.target.value),
                    })
                  }
                  style={{ flex: 1, accentColor: '#0D9488', height: '6px' }}
                />
                <span
                  style={{
                    backgroundColor: '#0D9488',
                    color: '#FFFFFF',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '999px',
                  }}
                >
                  {broadcastMaxKm} km
                </span>
              </div>
            </div>

            {/* Row 5: Mint Box - Instant Payout & Subscription Display */}
            <div
              style={{
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                borderRadius: '10px',
                padding: '12px 14px',
                marginTop: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ color: '#047857', fontSize: '0.9rem' }}>⚡</span>
                <strong style={{ fontSize: '0.82rem', color: '#065F46' }}>
                  Instant Payout &amp; Subscription Display
                </strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '0.76rem', color: '#065F46', fontWeight: 600 }}>
                    Instant Payout SLA (Minutes)
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '90px', padding: '4px 8px', fontSize: '0.78rem', backgroundColor: '#FFFFFF' }}
                    value={commConfig.instantPayoutWindowMinutes ?? 30}
                    onChange={(e) =>
                      onCommConfigChange({
                        ...commConfig,
                        instantPayoutWindowMinutes: Number(e.target.value) || 30,
                      })
                    }
                  >
                    <option value={15}>15</option>
                    <option value={30}>30</option>
                    <option value={45}>45</option>
                    <option value={60}>60</option>
                    <option value={120}>120</option>
                  </select>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.78rem', color: '#065F46' }}>
                  <input
                    type="checkbox"
                    checked={commConfig.instantPayoutEnabled !== false}
                    onChange={(e) =>
                      onCommConfigChange({ ...commConfig, instantPayoutEnabled: e.target.checked })
                    }
                  />
                  <span>Enable 30-Min Instant Payout after sample completion</span>
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.76rem', color: '#047857' }}>
                  <input
                    type="checkbox"
                    checked={commConfig.autoReleaseInstantPayouts !== false}
                    onChange={(e) =>
                      onCommConfigChange({ ...commConfig, autoReleaseInstantPayouts: e.target.checked })
                    }
                  />
                  <span>Auto-release payouts ⓘ</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.76rem', color: '#64748B' }}>
                  <input
                    type="checkbox"
                    checked={commConfig.hideSubscriptionsUi !== false}
                    onChange={(e) => {
                      const hideUi = e.target.checked;
                      onCommConfigChange({
                        ...commConfig,
                        hideSubscriptionsUi: hideUi,
                        enableSubscriptionsModule: !hideUi,
                        billingMode: hideUi ? 'INSTANT_30M_PAYOUT' : 'SUBSCRIPTION_AND_PLATFORM_FEES',
                      });
                    }}
                  />
                  <span>Hide Subscriptions UI in Portals (Preserve for future phase)</span>
                </label>
              </div>
            </div>

            {/* Save Global Rules Button */}
            <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ width: '100%', padding: '10px' }}
                disabled={savingGlobalRules}
                onClick={handleSaveGlobalRules}
              >
                {savingGlobalRules ? 'Saving Rules...' : 'Save Global Commission Rules'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Card: Payout Split Simulator */}
        <div className="chart-card-modern" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#0D9488',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  fontSize: '1rem',
                }}
              >
                🧮
              </div>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Payout Split Simulator
                </h2>
                <div style={{ fontSize: '0.76rem', color: '#64748B' }}>
                  Preview end-to-end earnings and platform share for a sample booking.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetSimulator}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748B',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.76rem',
                fontWeight: 600,
                padding: '4px 8px',
                borderRadius: '6px',
              }}
              title="Reset Simulator"
            >
              <span>🔄</span> Reset
            </button>
          </div>

          {/* Form Inputs Grid (2 columns) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.74rem' }}>
                Drop Destination
              </label>
              <select
                className="form-select"
                value={simDropType}
                onChange={(e) => onSimDropTypeChange(e.target.value as 'LARGE_LAB' | 'SELF_DROP' | 'CUSTOM_ADDRESS')}
              >
                <option value="LARGE_LAB">Partner Large / Reference Lab</option>
                <option value="SELF_DROP">Return to Small Lab (Self Drop)</option>
                <option value="CUSTOM_ADDRESS">Custom Drop Address</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.74rem' }}>
                Partner Large Lab
              </label>
              <select
                className="form-select"
                value={simLabOrgId}
                onChange={(e) => onSimLabOrgIdChange(e.target.value)}
              >
                <option value="">Global Default Rate</option>
                {largeLabOrgs.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.74rem' }}>
                Small Lab Payable (₹)
              </label>
              <input
                type="number"
                className="form-input"
                value={simSmallTariff}
                onChange={(e) => onSimSmallTariffChange(Number(e.target.value))}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.74rem' }}>
                Negotiated Large Lab Rate (₹)
              </label>
              <input
                type="number"
                className="form-input"
                value={simLargeB2bRate}
                disabled={simDropType !== 'LARGE_LAB'}
                onChange={(e) => onSimLargeB2bRateChange(Number(e.target.value))}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.74rem' }}>
                Route Distance (km)
              </label>
              <input
                type="number"
                step="0.5"
                className="form-input"
                value={simDistanceKm}
                onChange={(e) => onSimDistanceKmChange(Number(e.target.value))}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.74rem' }}>
                Urgency
              </label>
              <select
                className="form-select"
                value={simPriority === OrderPriority.STAT_CRITICAL ? 'EXPRESS' : 'ROUTINE'}
                onChange={(e) =>
                  onSimPriorityChange(
                    e.target.value === 'EXPRESS' ? OrderPriority.STAT_CRITICAL : OrderPriority.ROUTINE
                  )
                }
              >
                <option value="ROUTINE">Routine Dispatch</option>
                <option value="PRIORITY">Priority Dispatch</option>
                <option value="EXPRESS">Express STAT</option>
              </select>
            </div>
          </div>

          {/* SVG Donut Chart Section */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '24px',
              padding: '16px 8px',
              marginTop: '10px',
              backgroundColor: '#FAFAFA',
              borderRadius: '12px',
              border: '1px solid #F1F5F9',
            }}
          >
            {/* Donut SVG */}
            <div style={{ position: 'relative', width: '130px', height: '130px', flexShrink: 0 }}>
              <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                {/* Background Ring */}
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#E2E8F0" strokeWidth="12" />
                {/* Large Lab Segment (Green) */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#10B981"
                  strokeWidth="12"
                  strokeDasharray={strokeDasharrayLab}
                  strokeDashoffset={strokeDashoffsetLab}
                />
                {/* Phlebotomist Segment (Blue) */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#3B82F6"
                  strokeWidth="12"
                  strokeDasharray={strokeDasharrayPhlebo}
                  strokeDashoffset={strokeDashoffsetPhlebo}
                />
                {/* Platform Fee Segment (Purple) */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#8B5CF6"
                  strokeWidth="12"
                  strokeDasharray={strokeDasharrayPlatform}
                  strokeDashoffset={strokeDashoffsetPlatform}
                />
              </svg>
              {/* Center Total Payable Text */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  ₹{calcSmallLabPays.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: 600 }}>Total Payable</div>
              </div>
            </div>

            {/* Legend on Right of Donut */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '170px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                  <span style={{ color: '#334155' }}>Large Lab (B2B)</span>
                </div>
                <div style={{ fontWeight: 700, color: '#0F172A' }}>
                  ₹{calcLargeLabShare} <span style={{ color: '#64748B', fontWeight: 500 }}>{largeLabPct}%</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3B82F6' }} />
                  <span style={{ color: '#334155' }}>Phlebotomist</span>
                </div>
                <div style={{ fontWeight: 700, color: '#0F172A' }}>
                  ₹{calcPhleboPayout} <span style={{ color: '#64748B', fontWeight: 500 }}>{phleboPct}%</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#8B5CF6' }} />
                  <span style={{ color: '#334155' }}>Platform Fee</span>
                </div>
                <div style={{ fontWeight: 700, color: '#0F172A' }}>
                  ₹{calcPlatformNetFee} <span style={{ color: '#64748B', fontWeight: 500 }}>{platformPct}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Mini Result Metric Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
              marginTop: '12px',
            }}
          >
            {/* 1. Small Lab Pays */}
            <div
              style={{
                backgroundColor: '#F0FDF4',
                border: '1px solid #DCFCE7',
                borderRadius: '8px',
                padding: '8px 10px',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 600 }}>Small Lab Pays</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#15803D' }}>
                ₹{calcSmallLabPays.toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: '0.62rem', color: '#166534' }}>
                Tariff + ₹{calcPhleboPayout} courier
              </div>
            </div>

            {/* 2. Large Lab B2B Share */}
            <div
              style={{
                backgroundColor: '#FFFBEB',
                border: '1px solid #FEF3C7',
                borderRadius: '8px',
                padding: '8px 10px',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: '#92400E', fontWeight: 600 }}>Large Lab B2B Share</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#B45309' }}>
                ₹{calcLargeLabShare.toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: '0.62rem', color: '#92400E' }}>Settlement payout</div>
            </div>

            {/* 3. Phlebotomist Payout */}
            <div
              style={{
                backgroundColor: '#EFF6FF',
                border: '1px solid #DBEAFE',
                borderRadius: '8px',
                padding: '8px 10px',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: '#1E40AF', fontWeight: 600 }}>Phlebotomist Payout</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#2563EB' }}>
                ₹{calcPhleboPayout.toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: '0.62rem', color: '#1E40AF' }}>
                = ₹{phleboPerKm} / km
              </div>
            </div>

            {/* 4. Platform Net Fee */}
            <div
              style={{
                backgroundColor: '#F0FDFA',
                border: '1px solid #CCFBF1',
                borderRadius: '8px',
                padding: '8px 10px',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: '#0F766E', fontWeight: 600 }}>Platform Net Fee</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0D9488' }}>
                ₹{calcPlatformNetFee.toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: '0.62rem', color: '#0F766E' }}>
                Approx. {platformPct}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Per-Large-Lab Negotiated B2B Rate Agreements */}
      <div id="b2b-agreements-section" className="chart-card-modern" style={{ margin: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem', color: '#0D9488' }}>🤝</span>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Per-Large-Lab Negotiated B2B Rate Agreements
              </h2>
              <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                Manage custom rates, dispatch policies and payout terms for each partner large lab.
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#0D9488',
              borderColor: '#0D9488',
              padding: '8px 14px',
              fontSize: '0.82rem',
              fontWeight: 700,
            }}
            onClick={handleOpenAddAgreement}
          >
            <span>+</span> Add B2B Agreement
          </button>
        </div>

        {/* Table */}
        <div className="data-table-container">
          <table className="modern-data-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Partner Large Lab</th>
                <th>Rate Model</th>
                <th>Small Lab Payable (₹)</th>
                <th>Large Lab Rate (₹)</th>
                <th>Route Max (km)</th>
                <th>Urgency</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {b2bAgreementsList.map((row) => {
                const urgencyBg =
                  row.urgency === 'Routine'
                    ? '#F0FDF4'
                    : row.urgency === 'Priority'
                    ? '#FEF3C7'
                    : '#FCE7F3';
                const urgencyColor =
                  row.urgency === 'Routine'
                    ? '#166534'
                    : row.urgency === 'Priority'
                    ? '#92400E'
                    : '#9D174D';

                return (
                  <tr key={row.id}>
                    <td style={{ color: '#64748B', fontWeight: 600 }}>{row.num}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.1rem' }}>🏢</span>
                        <strong style={{ color: '#0F172A' }}>{row.labName}</strong>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.82rem', color: '#334155' }}>{row.rateModel}</span>
                    </td>
                    <td>
                      <strong style={{ color: '#0F172A' }}>
                        {row.smallLabPayableInr.toLocaleString('en-IN')}
                      </strong>
                    </td>
                    <td>
                      <strong style={{ color: '#0F172A' }}>
                        {row.largeLabRateInr.toLocaleString('en-IN')}
                      </strong>
                    </td>
                    <td>
                      <span style={{ color: '#475569' }}>{row.routeMaxKm}</span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: urgencyBg,
                          color: urgencyColor,
                        }}
                      >
                        {row.urgency}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: row.status === 'Active' ? '#10B981' : '#F59E0B',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: row.status === 'Active' ? '#047857' : '#B45309',
                          }}
                        >
                          {row.status}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditAgreement(row)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            padding: '4px',
                            color: '#475569',
                          }}
                          title="Edit Agreement"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateAgreement(row)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            padding: '4px',
                            color: '#475569',
                          }}
                          title="Duplicate Agreement"
                        >
                          📋
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAgreement(row.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            padding: '4px',
                            color: '#EF4444',
                          }}
                          title="Delete Agreement"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Adding / Editing B2B Agreement */}
      {showAgreementModal && (
        <ModalFrame
          open={showAgreementModal}
          onClose={() => setShowAgreementModal(false)}
          title={editingAgreement ? 'Edit B2B Rate Agreement' : 'Add Negotiated B2B Agreement'}
          subtitle="Configure partner large lab tariff, B2B settlement, urgency policies and max delivery radius"
          maxWidth="560px"
        >
          <form onSubmit={handleSaveAgreementModal} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Partner Large Lab Name *</label>
              <input
                type="text"
                className="form-input"
                required
                value={modalLabName}
                onChange={(e) => setModalLabName(e.target.value)}
                placeholder="e.g. Metro Diagnostic Lab"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Rate Model *</label>
                <select
                  className="form-select"
                  value={modalRateModel}
                  onChange={(e) => setModalRateModel(e.target.value)}
                >
                  <option value="Fixed Rate">Fixed Rate</option>
                  <option value="% Commission (10%)">% Commission (10%)</option>
                  <option value="% Commission (15%)">% Commission (15%)</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Route Max (km) *</label>
                <input
                  type="number"
                  className="form-input"
                  min={1}
                  max={50}
                  value={modalRouteMax}
                  onChange={(e) => setModalRouteMax(Number(e.target.value))}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Small Lab Payable (₹) *</label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  value={modalSmallPayable}
                  onChange={(e) => setModalSmallPayable(Number(e.target.value))}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Large Lab Settlement Rate (₹) *</label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  value={modalLargeRate}
                  onChange={(e) => setModalLargeRate(Number(e.target.value))}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Urgency Tier</label>
                <select
                  className="form-select"
                  value={modalUrgency}
                  onChange={(e) => setModalUrgency(e.target.value as 'Routine' | 'Priority' | 'Express')}
                >
                  <option value="Routine">Routine</option>
                  <option value="Priority">Priority</option>
                  <option value="Express">Express</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value as 'Active' | 'Paused')}
                >
                  <option value="Active">Active</option>
                  <option value="Paused">Paused</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAgreementModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                {editingAgreement ? 'Update Agreement' : 'Save Agreement'}
              </button>
            </div>
          </form>
        </ModalFrame>
      )}
    </div>
  );
}
