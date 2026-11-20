import { useState, useMemo, useRef, useEffect, type FormEvent } from 'react';
import {
  type CommissionConfig,
  type DiagnosticTestItem,
  type DropDestinationType,
  formatInr,
  type LabFacility,
  type LargeLabComparisonQuote,
  OrderPriority,
  type PatientRecord,
  type PhlebotomistProfile,
  type ServiceCoverageEvaluation,
  TUBE_METADATA,
  TubeType,
} from '@diagnostic/shared';
import { InteractiveMapPicker } from '../../components/InteractiveMapPicker';
import { EmptyStateBox } from '../../components/shared';
import { type FormatLabelFn } from '../types';
import {
  type ResolvedDropInfo,
  type SelectableCatalogEntry,
} from './smallLabTypes';

export interface SmallLabNewBookingTabProps {
  myLabFacility: LabFacility;
  patients: PatientRecord[];
  phlebotomists: PhlebotomistProfile[];
  commConfig: CommissionConfig;
  selectableCatalogEntries: SelectableCatalogEntry[];
  expandedRequestedCodes: string[];
  rankedLargeLabQuotes: LargeLabComparisonQuote[];
  activeQuote: LargeLabComparisonQuote | null;
  resolvedDropInfo: ResolvedDropInfo;
  resolvedSpecimensForOrder: DiagnosticTestItem[];
  pickupCoverage: ServiceCoverageEvaluation;
  formatLabel: FormatLabelFn;
  onOpenAddPatient: () => void;
  selectedPatientId: string;
  onSelectPatientId: (id: string) => void;
  adhocPatientName: string;
  onAdhocPatientNameChange: (val: string) => void;
  adhocPatientAge: number;
  onAdhocPatientAgeChange: (age: number) => void;
  adhocPatientGender: 'MALE' | 'FEMALE' | 'OTHER';
  onAdhocPatientGenderChange: (g: 'MALE' | 'FEMALE' | 'OTHER') => void;
  adhocPatientPhone?: string;
  onAdhocPatientPhoneChange?: (val: string) => void;
  adhocPatientAlternatePhone?: string;
  onAdhocPatientAlternatePhoneChange?: (val: string) => void;
  clinicalNote?: string;
  onClinicalNoteChange?: (val: string) => void;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  onPickupAddressChange: (val: string) => void;
  pickupPincode: string;
  onPickupPincodeChange: (val: string) => void;
  onPickupLocationChange: (loc: {
    latitude: number;
    longitude: number;
    address?: string;
    pincode?: string;
  }) => void;
  testSearchQuery: string;
  onTestSearchQueryChange: (val: string) => void;
  selectedTestCodes: string[];
  onClearSelectedTestCodes: () => void;
  onToggleTestCodeSelection: (code: string) => void;
  dropMode: DropDestinationType;
  onDropModeChange: (mode: DropDestinationType) => void;
  onSelectOrgAndCenter: (orgLabId: string, centerId: string) => void;
  selectedCenterLabId: string;
  onSelectCenterLabId: (centerId: string) => void;
  customDropLat: number;
  customDropLng: number;
  onCustomDropLocationChange: (loc: {
    latitude: number;
    longitude: number;
    address?: string;
    pincode?: string;
  }) => void;
  customDropName: string;
  onCustomDropNameChange: (val: string) => void;
  customDropPincode: string;
  onCustomDropPincodeChange: (val: string) => void;
  customDropAddress: string;
  onCustomDropAddressChange: (val: string) => void;
  bookingPriority: OrderPriority;
  onBookingPriorityChange: (p: OrderPriority) => void;
  pickupSlot: string;
  onPickupSlotChange: (slot: string) => void;
  selectedPhleboId: string;
  onSelectedPhleboIdChange: (id: string) => void;
  broadcastRadiusKm: number;
  onBroadcastRadiusKmChange: (km: number) => void;
  payImmediatelyOnBook: boolean;
  onPayImmediatelyOnBookChange: (val: boolean) => void;
  bookingStep?: 1 | 2 | 3 | 4;
  onBookingStepChange?: (step: 1 | 2 | 3 | 4) => void;
  submittingBooking: boolean;
  onSubmitBooking: (e: FormEvent) => Promise<void>;
  onShowAlert?: (params: {
    variant: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    title: string;
    message: string;
    detail?: string;
    onConfirm?: () => void;
  }) => void;
}

export function SmallLabNewBookingTab({
  myLabFacility,
  patients,
  phlebotomists,
  commConfig,
  selectableCatalogEntries,
  expandedRequestedCodes,
  rankedLargeLabQuotes,
  activeQuote,
  resolvedDropInfo,
  resolvedSpecimensForOrder,
  pickupCoverage,
  formatLabel,
  onOpenAddPatient,
  selectedPatientId,
  onSelectPatientId,
  adhocPatientName,
  onAdhocPatientNameChange,
  adhocPatientAge,
  onAdhocPatientAgeChange,
  adhocPatientGender,
  onAdhocPatientGenderChange,
  adhocPatientPhone,
  onAdhocPatientPhoneChange,
  adhocPatientAlternatePhone,
  onAdhocPatientAlternatePhoneChange,
  clinicalNote,
  onClinicalNoteChange,
  pickupLat,
  pickupLng,
  pickupAddress,
  onPickupAddressChange,
  pickupPincode,
  onPickupPincodeChange,
  onPickupLocationChange,
  testSearchQuery,
  onTestSearchQueryChange,
  selectedTestCodes,
  onClearSelectedTestCodes,
  onToggleTestCodeSelection,
  dropMode,
  onDropModeChange,
  onSelectOrgAndCenter,
  selectedCenterLabId,
  onSelectCenterLabId,
  customDropLat,
  customDropLng,
  onCustomDropLocationChange,
  customDropName,
  onCustomDropNameChange,
  customDropPincode,
  onCustomDropPincodeChange,
  customDropAddress,
  onCustomDropAddressChange,
  bookingPriority,
  onBookingPriorityChange,
  pickupSlot,
  onPickupSlotChange,
  selectedPhleboId,
  onSelectedPhleboIdChange,
  broadcastRadiusKm,
  onBroadcastRadiusKmChange,
  payImmediatelyOnBook,
  onPayImmediatelyOnBookChange,
  bookingStep,
  onBookingStepChange,
  submittingBooking,
  onSubmitBooking,
  onShowAlert,
}: SmallLabNewBookingTabProps) {
  // 4-Step Wizard State: 1 = Patient Details, 2 = Test Selection, 3 = Collection & Pickup, 4 = Review & Confirm
  const [internalStep, setInternalStep] = useState<1 | 2 | 3 | 4>(1);
  const currentStep = bookingStep ?? internalStep;
  const setCurrentStep = (step: 1 | 2 | 3 | 4) => {
    setInternalStep(step);
    onBookingStepChange?.(step);
  };
  const [patientMode, setPatientMode] = useState<'EXISTING' | 'NEW'>('EXISTING');
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [testCategoryFilter, setTestCategoryFilter] = useState('ALL');
  const [savedAddressOption, setSavedAddressOption] = useState('DEFAULT_CLINIC');
  const [copiedGps, setCopiedGps] = useState(false);

  // Local state fallbacks for phone and notes
  const [localMobile, setLocalMobile] = useState(adhocPatientPhone || '');
  const [localAltMobile, setLocalAltMobile] = useState(adhocPatientAlternatePhone || '');
  const [localNote, setLocalNote] = useState(clinicalNote || '');

  // Patient live search autocomplete state (no plain select dropdown)
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [showPatientResults, setShowPatientResults] = useState(false);
  const patientSearchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (patientSearchRef.current && !patientSearchRef.current.contains(e.target as Node)) {
        setShowPatientResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const chosenPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) || null,
    [patients, selectedPatientId]
  );

  const activePatientName = chosenPatient ? chosenPatient.name : adhocPatientName || 'New Patient';
  const activePatientAge = chosenPatient ? chosenPatient.age : adhocPatientAge || 25;
  const activePatientGender = chosenPatient ? chosenPatient.gender : adhocPatientGender;
  const activePatientMobile = chosenPatient ? chosenPatient.phone : localMobile || '+91 7700057018';
  const activePatientId = chosenPatient ? chosenPatient.id : '#LS-2025-0001';

  // Filtered patients for live autocomplete (by Name, Mobile, or ID) - strictly isolated to current lab
  const filteredPatientsList = useMemo(() => {
    const q = patientSearchQuery.trim().toLowerCase();
    const labOnly = patients.filter((p) => p.smallLabId === myLabFacility.id);
    if (!q) return labOnly.slice(0, 8);
    return labOnly.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
    );
  }, [patients, patientSearchQuery, myLabFacility.id]);

  // Available test department categories
  const testDepartments = useMemo(() => {
    const set = new Set<string>();
    selectableCatalogEntries.forEach((e) => {
      if (e.department) set.add(e.department);
    });
    return Array.from(set);
  }, [selectableCatalogEntries]);

  // Filtered test catalog entries
  const filteredCatalogEntries = useMemo(() => {
    return selectableCatalogEntries.filter((entry) => {
      const q = testSearchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        entry.code.toLowerCase().includes(q) ||
        entry.name.toLowerCase().includes(q) ||
        entry.department.toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (testCategoryFilter === 'ALL') return true;
      if (testCategoryFilter === 'PACKAGES') return entry.itemType === 'PACKAGE';
      return entry.department === testCategoryFilter;
    });
  }, [selectableCatalogEntries, testSearchQuery, testCategoryFilter]);

  function handleCopyGps() {
    const text = `${pickupLat.toFixed(4)}, ${pickupLng.toFixed(4)}`;
    void navigator.clipboard.writeText(text);
    setCopiedGps(true);
    setTimeout(() => setCopiedGps(false), 2000);
  }

  function handleNextStep(targetStep: 1 | 2 | 3 | 4) {
    if (targetStep === 2) {
      if (!chosenPatient && !adhocPatientName.trim()) {
        onShowAlert?.({
          variant: 'warning',
          title: 'Patient Required',
          message: 'Please select an existing registered patient or enter the patient name to proceed.',
        });
        return;
      }
      if (!pickupAddress.trim()) {
        onShowAlert?.({
          variant: 'warning',
          title: 'Collection Address Required',
          message: 'Please specify the sample collection address.',
        });
        return;
      }
    }
    if (targetStep === 3) {
      if (selectedTestCodes.length === 0) {
        onShowAlert?.({
          variant: 'warning',
          title: 'Test Selection Required',
          message: 'Please select at least one test or diagnostic package to continue.',
        });
        return;
      }
    }
    if (targetStep === 4) {
      if (dropMode === 'LARGE_LAB' && !resolvedDropInfo.targetLabId) {
        onShowAlert?.({
          variant: 'warning',
          title: 'Destination Lab Required',
          message: 'Please choose a partner reference lab destination center.',
        });
        return;
      }
      if (dropMode === 'CUSTOM_ADDRESS' && !customDropAddress.trim()) {
        onShowAlert?.({
          variant: 'warning',
          title: 'Drop Address Required',
          message: 'Please specify the custom drop address.',
        });
        return;
      }
    }
    setCurrentStep(targetStep);
  }

  return (
    <div className="booking-wizard-wrapper">
      {/* Page Header */}
      <div className="booking-wizard-header">
        <h1 className="booking-wizard-title">Create New Booking</h1>
        <p className="booking-wizard-subtitle">Book tests for your patient in just a few steps.</p>

        {/* Stepper Bar */}
        <div className="booking-stepper-bar">
          {[
            { stepNum: 1 as const, label: 'Patient Details' },
            { stepNum: 2 as const, label: 'Test Selection' },
            { stepNum: 3 as const, label: 'Collection & Pickup' },
            { stepNum: 4 as const, label: 'Review & Confirm' },
          ].map((item, idx) => {
            const isActive = currentStep === item.stepNum;
            const isCompleted = currentStep > item.stepNum;
            return (
              <div key={item.stepNum} style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  className={`booking-step-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                  onClick={() => {
                    if (isCompleted || item.stepNum < currentStep) {
                      setCurrentStep(item.stepNum);
                    }
                  }}
                >
                  <div className="booking-step-circle">
                    {isCompleted ? '✓' : item.stepNum}
                  </div>
                  <span className="booking-step-label">{item.label}</span>
                </div>
                {idx < 3 && <div className="booking-step-divider" />}
              </div>
            );
          })}
        </div>
      </div>

      <form onSubmit={(e) => void onSubmitBooking(e)}>
        <div className="booking-wizard-grid">
          {/* Main Wizard Form Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* ============================================================== */}
            {/* STEP 1: PATIENT DETAILS & PICKUP ADDRESS */}
            {/* ============================================================== */}
            {currentStep === 1 && (
              <>
                {/* 1A: Patient Details Card */}
                <div className="booking-step-card">
                  <div className="booking-card-top">
                    <div className="booking-card-icon-title">
                      <div className="booking-card-icon-box">👤</div>
                      <div>
                        <h3 className="booking-card-title">Patient Details</h3>
                        <p className="booking-card-subtitle">
                          Add new patient or select an existing patient to continue.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '6px 14px', color: '#0D9488', borderColor: '#CCFBF1' }}
                      onClick={onOpenAddPatient}
                    >
                      + Register New Patient
                    </button>
                  </div>

                  {/* Toggle: Existing Patient vs New Patient */}
                  <div className="booking-pill-toggle">
                    <button
                      type="button"
                      className={`booking-pill-btn ${patientMode === 'EXISTING' ? 'active' : ''}`}
                      onClick={() => setPatientMode('EXISTING')}
                    >
                      👤 Existing Patient
                    </button>
                    <button
                      type="button"
                      className={`booking-pill-btn ${patientMode === 'NEW' ? 'active' : ''}`}
                      onClick={() => {
                        setPatientMode('NEW');
                        onSelectPatientId('');
                      }}
                    >
                      ➕ New Patient
                    </button>
                  </div>

                  {/* Patient Search & Autocomplete (Replaces plain select dropdown) */}
                  {patientMode === 'EXISTING' ? (
                    <div ref={patientSearchRef} style={{ position: 'relative' }}>
                      {chosenPatient ? (
                        <div
                          style={{
                            background: '#F0FDFA',
                            border: '1.5px solid #0D9488',
                            borderRadius: '10px',
                            padding: '12px 14px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div
                              style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                background: '#0D9488',
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.1rem',
                                fontWeight: 700,
                              }}
                            >
                              👤
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <strong style={{ fontSize: '0.92rem', color: '#0F172A' }}>{chosenPatient.name}</strong>
                                <span
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    color: '#0F766E',
                                    background: '#CCFBF1',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                  }}
                                >
                                  {chosenPatient.id}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                                {chosenPatient.gender} • {chosenPatient.age} Years • 📞 {chosenPatient.phone}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{
                                fontSize: '0.76rem',
                                padding: '5px 12px',
                                color: '#0D9488',
                                borderColor: '#99F6E4',
                                fontWeight: 700,
                              }}
                              onClick={() => {
                                onSelectPatientId('');
                                setPatientSearchQuery('');
                                setShowPatientResults(true);
                              }}
                            >
                              ✏️ Search / Select Another Patient
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label className="form-label" style={{ fontWeight: 700, color: '#0F172A', marginBottom: 0 }}>
                              Search Registered Patient *
                            </label>
                            <span style={{ fontSize: '0.72rem', color: '#0D9488', fontWeight: 600 }}>
                              Find by Mobile No., Patient Name, or ID
                            </span>
                          </div>
                          <div style={{ position: 'relative' }}>
                            <input
                              className="form-input"
                              placeholder="Type patient name (e.g. Vikas), mobile number (+91...), or ID..."
                              value={patientSearchQuery}
                              onChange={(e) => {
                                setPatientSearchQuery(e.target.value);
                                setShowPatientResults(true);
                              }}
                              onFocus={() => setShowPatientResults(true)}
                              style={{
                                paddingLeft: '38px',
                                paddingRight: patientSearchQuery ? '36px' : '14px',
                                borderColor: showPatientResults ? '#0D9488' : '#CBD5E1',
                              }}
                            />
                            <span
                              style={{
                                position: 'absolute',
                                left: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: '#64748B',
                                fontSize: '0.95rem',
                              }}
                            >
                              🔍
                            </span>
                            {patientSearchQuery && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPatientSearchQuery('');
                                  setShowPatientResults(false);
                                }}
                                style={{
                                  position: 'absolute',
                                  right: '10px',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: '#94A3B8',
                                  fontSize: '0.85rem',
                                  padding: '4px',
                                }}
                                title="Clear search"
                              >
                                ✕
                              </button>
                            )}
                          </div>

                          {/* Live Patient Search Autocomplete Results Dropdown */}
                          {showPatientResults && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                zIndex: 50,
                                background: '#FFFFFF',
                                border: '1.5px solid #0D9488',
                                borderRadius: '10px',
                                boxShadow: '0 10px 25px -5px rgba(15,23,42,0.15)',
                                marginTop: '4px',
                                maxHeight: '280px',
                                overflowY: 'auto',
                              }}
                            >
                              <div
                                style={{
                                  padding: '8px 12px',
                                  background: '#F8FAFC',
                                  borderBottom: '1px solid #E2E8F0',
                                  fontSize: '0.72rem',
                                  color: '#64748B',
                                  fontWeight: 700,
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <span>{patientSearchQuery ? `Search Results for "${patientSearchQuery}"` : 'Registered Patients (Click to Select)'}</span>
                                <span>{filteredPatientsList.length} Found</span>
                              </div>

                              {filteredPatientsList.length === 0 ? (
                                <div style={{ padding: '16px', textAlign: 'center' }}>
                                  <div style={{ fontSize: '0.82rem', color: '#64748B' }}>
                                    No registered patient found matching &ldquo;{patientSearchQuery}&rdquo;
                                  </div>
                                  <button
                                    type="button"
                                    className="btn-primary"
                                    style={{
                                      fontSize: '0.75rem',
                                      padding: '5px 12px',
                                      marginTop: '8px',
                                      background: '#0D9488',
                                    }}
                                    onClick={() => {
                                      setPatientMode('NEW');
                                      onAdhocPatientNameChange(patientSearchQuery);
                                      setShowPatientResults(false);
                                    }}
                                  >
                                    + Register &ldquo;{patientSearchQuery}&rdquo; as New Patient
                                  </button>
                                </div>
                              ) : (
                                filteredPatientsList.map((pt) => (
                                  <div
                                    key={pt.id}
                                    style={{
                                      padding: '10px 14px',
                                      borderBottom: '1px solid #F1F5F9',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      transition: 'background 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F0FDFA')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
                                    onClick={() => {
                                      onSelectPatientId(pt.id);
                                      onAdhocPatientNameChange(pt.name);
                                      onAdhocPatientAgeChange(pt.age);
                                      onAdhocPatientGenderChange(pt.gender);
                                      if (pt.phone) {
                                        setLocalMobile(pt.phone);
                                        onAdhocPatientPhoneChange?.(pt.phone);
                                      }
                                      if (pt.address) {
                                        onPickupAddressChange(pt.address);
                                      }
                                      setShowPatientResults(false);
                                      setPatientSearchQuery('');
                                    }}
                                  >
                                    <div>
                                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0F172A' }}>
                                        {pt.name}
                                      </div>
                                      <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                                        {pt.gender} • {pt.age} Years {pt.address ? `• 📍 ${pt.address}` : ''}
                                      </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0D9488' }}>
                                        📞 {pt.phone}
                                      </div>
                                      <span
                                        style={{
                                          fontSize: '0.65rem',
                                          color: '#94A3B8',
                                          fontWeight: 600,
                                        }}
                                      >
                                        {pt.id}
                                      </span>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Patient ID (Auto-generated)</label>
                        <div
                          style={{
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                            padding: '9px 12px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            color: '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>{activePatientId}</span>
                          <span style={{ fontSize: '0.75rem', color: '#0D9488' }} title="System Generated">
                            🕒
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3-Column: Name, Gender, Age */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.2fr', gap: '12px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Patient Name *</label>
                      <input
                        className="form-input"
                        placeholder="e.g. Vikas Yadav"
                        value={adhocPatientName}
                        onChange={(e) => onAdhocPatientNameChange(e.target.value)}
                        required={patientMode === 'NEW'}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Gender *</label>
                      <select
                        className="form-select"
                        value={adhocPatientGender}
                        onChange={(e) => onAdhocPatientGenderChange(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
                      >
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Age *</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="35"
                        value={adhocPatientAge}
                        onChange={(e) => onAdhocPatientAgeChange(Number(e.target.value))}
                        min={1}
                        max={120}
                      />
                    </div>
                  </div>

                  {/* 2-Column: Mobile & Alternate */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Mobile Number *</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="form-input"
                          placeholder="+91 7700057018"
                          value={localMobile}
                          onChange={(e) => {
                            setLocalMobile(e.target.value);
                            onAdhocPatientPhoneChange?.(e.target.value);
                          }}
                          style={{ paddingRight: '36px' }}
                        />
                        <span
                          style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#10B981',
                            fontSize: '1rem',
                            cursor: 'pointer',
                          }}
                          title="WhatsApp Verified"
                        >
                          📱
                        </span>
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Alternate Number (Optional)</label>
                      <input
                        className="form-input"
                        placeholder="+91 9876543210"
                        value={localAltMobile}
                        onChange={(e) => {
                          setLocalAltMobile(e.target.value);
                          onAdhocPatientAlternatePhoneChange?.(e.target.value);
                        }}
                      />
                    </div>
                  </div>

                  {/* Clinical Note */}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label className="form-label" style={{ marginBottom: 0 }}>Clinical Note (Optional)</label>
                      <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{localNote.length}/500</span>
                    </div>
                    <textarea
                      className="form-input"
                      rows={2}
                      maxLength={500}
                      placeholder="e.g. 12-hour fasting required, diabetic patient, sensitive vein protocol..."
                      value={localNote}
                      onChange={(e) => {
                        setLocalNote(e.target.value);
                        onClinicalNoteChange?.(e.target.value);
                      }}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                </div>

                {/* 1B: Collection Address & Map Picker Card */}
                <div className="booking-step-card">
                  <div className="booking-card-top">
                    <div className="booking-card-icon-title">
                      <div className="booking-card-icon-box" style={{ background: '#0F766E' }}>📍</div>
                      <div>
                        <h3 className="booking-card-title">Saved Addresses</h3>
                        <p className="booking-card-subtitle">
                          Select from saved addresses or pin an exact collection location.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '6px 14px', color: '#0F766E', borderColor: '#CCFBF1' }}
                      onClick={() => {
                        setSavedAddressOption('CUSTOM');
                        onPickupAddressChange('');
                      }}
                    >
                      + Add New Address
                    </button>
                  </div>

                  {/* Saved Address Dropdown Selector */}
                  <div className="form-group" style={{ marginBottom: '8px' }}>
                    <select
                      className="form-select"
                      value={savedAddressOption}
                      onChange={(e) => {
                        const opt = e.target.value;
                        setSavedAddressOption(opt);
                        if (opt === 'HOME_ANDHERI') {
                          onPickupAddressChange('A-203, Sunrise Complex, Andheri West, Mumbai - 400053');
                          onPickupPincodeChange('400053');
                          onPickupLocationChange({ latitude: 19.1363, longitude: 72.8372 });
                        } else if (opt === 'DEFAULT_CLINIC') {
                          onPickupAddressChange(myLabFacility.address || `${myLabFacility.name}, ${myLabFacility.city}`);
                          if (myLabFacility.pincode) onPickupPincodeChange(myLabFacility.pincode);
                          onPickupLocationChange({
                            latitude: myLabFacility.latitude || 19.1363,
                            longitude: myLabFacility.longitude || 72.8372,
                          });
                        }
                      }}
                    >
                      <option value="DEFAULT_CLINIC">
                        🏢 Clinic / Lab Facility ({myLabFacility.name} — {myLabFacility.city})
                      </option>
                      <option value="HOME_ANDHERI">
                        🏠 Home - Andheri West (A-203, Sunrise Complex, Andheri West, Mumbai - 400053)
                      </option>
                      <option value="CUSTOM">📍 Custom Address (Search or Pin on Map Below)</option>
                    </select>
                  </div>

                  {/* Street & PIN Inputs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                    <input
                      className="form-input"
                      placeholder="Street address / clinic locality for sample pickup..."
                      value={pickupAddress}
                      onChange={(e) => onPickupAddressChange(e.target.value)}
                      required
                    />
                    <input
                      className="form-input"
                      placeholder="PIN Code (e.g. 400053)"
                      value={pickupPincode}
                      onChange={(e) => onPickupPincodeChange(e.target.value)}
                    />
                  </div>

                  {/* Interactive Map Picker & Coordinate Overlay */}
                  <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #CBD5E1' }}>
                    <InteractiveMapPicker
                      latitude={pickupLat}
                      longitude={pickupLng}
                      heightPx={240}
                      title="Pin Exact Sample Collection Point (Google Maps)"
                      subtitle="Drag pin, click map, or search Google Places to sync coordinates for rider navigation"
                      radiusKm={broadcastRadiusKm}
                      radiusColor="#0D9488"
                      nearbyPhlebos={phlebotomists}
                      onChange={onPickupLocationChange}
                    />
                  </div>

                  {/* Selected Location Pill & GPS Info Box */}
                  <div
                    style={{
                      background: '#F0FDFA',
                      border: '1px solid #99F6E4',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.74rem', color: '#0F766E', fontWeight: 700 }}>
                        📍 Selected Location
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#0F172A', fontWeight: 600, marginTop: '2px' }}>
                        {pickupAddress || 'Address on file'}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🌐 {pickupLat.toFixed(4)}, {pickupLng.toFixed(4)}</span>
                        <button
                          type="button"
                          onClick={handleCopyGps}
                          style={{ background: 'none', border: 'none', color: '#0D9488', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
                          title="Copy coordinates"
                        >
                          {copiedGps ? '✓ Copied' : '📋 Copy'}
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span className="status-pill-green" style={{ fontSize: '0.72rem', padding: '3px 8px' }}>
                        ✓ Verified Address
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                        Drag the pin to update location
                      </span>
                    </div>
                  </div>

                  {/* Service Zone & Pincode Coverage Alert Module */}
                  <div
                    style={{
                      borderRadius: '10px',
                      padding: '12px 16px',
                      background: pickupCoverage.covered ? '#F0FDF4' : '#FFFBEB',
                      border: `1.5px solid ${pickupCoverage.covered ? '#86EFAC' : '#FDE68A'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.1rem' }}>
                        {pickupCoverage.covered ? '✅' : '📍'}
                      </span>
                      <strong style={{ fontSize: '0.86rem', color: pickupCoverage.covered ? '#166534' : '#92400E' }}>
                        {pickupCoverage.covered
                          ? `Inside Enrolled Service Zone: ${pickupCoverage.matchedZone?.name || 'Active Zone'}`
                          : `Pilot Area Expansion: Pincode "${pickupPincode || 'Entered'}"`}
                      </strong>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: pickupCoverage.covered ? '#15803D' : '#78350F', lineHeight: 1.45 }}>
                      {pickupCoverage.covered
                        ? `This collection point is inside verified zone ${pickupCoverage.matchedZone?.zoneCode} (${pickupCoverage.matchedZone?.city}). Nearby online phlebotomists will receive priority cold-chain dispatch.`
                        : `This address is outside standard pre-enrolled clusters, but Flexible Dispatch is active. All nearby active phlebotomists within ${broadcastRadiusKm || 5} km on the Fleet Radar will receive and can accept this pickup.`}
                    </div>
                  </div>

                  {/* Step 1 Navigation Footer */}
                  <div className="booking-nav-footer">
                    <button type="button" className="btn-secondary" disabled>
                      ← Back
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: '9px 24px', fontSize: '0.85rem' }}
                      onClick={() => handleNextStep(2)}
                    >
                      Next: Test Selection →
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ============================================================== */}
            {/* STEP 2: TEST SELECTION */}
            {/* ============================================================== */}
            {currentStep === 2 && (
              <div className="booking-step-card">
                <div className="booking-card-top">
                  <div className="booking-card-icon-title">
                    <div className="booking-card-icon-box">🧪</div>
                    <div>
                      <h3 className="booking-card-title">Select Diagnostic Tests &amp; Packages</h3>
                      <p className="booking-card-subtitle">
                        Choose tests or health checkup packages — Combo packages auto-match lowest pricing.
                      </p>
                    </div>
                  </div>
                  {selectedTestCodes.length > 0 && (
                    <button
                      type="button"
                      className="btn-link-muted"
                      onClick={onClearSelectedTestCodes}
                    >
                      Clear Selection ({selectedTestCodes.length})
                    </button>
                  )}
                </div>

                {/* Search Bar */}
                <input
                  className="form-input"
                  placeholder="Search test code, panel name, or package..."
                  value={testSearchQuery}
                  onChange={(e) => onTestSearchQueryChange(e.target.value)}
                />

                {/* Category Pills */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['ALL', 'PACKAGES', ...testDepartments].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={testCategoryFilter === cat ? 'btn-primary' : 'btn-secondary'}
                      style={{ fontSize: '0.74rem', padding: '4px 10px', borderRadius: '6px' }}
                      onClick={() => setTestCategoryFilter(cat)}
                    >
                      {cat.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>

                {/* Catalog List */}
                {filteredCatalogEntries.length === 0 ? (
                  <EmptyStateBox
                    title="No Matching Tests Found"
                    description="Try searching for another test code or clear your department filter."
                  />
                ) : (
                  <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '8px' }}>
                    {filteredCatalogEntries.map((entry) => {
                      const checked = selectedTestCodes.includes(entry.code);
                      const tm = TUBE_METADATA[entry.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                      return (
                        <label
                          key={entry.code}
                          className="checkbox-row"
                          style={{
                            marginBottom: '6px',
                            background: checked ? '#F0FDFA' : undefined,
                            borderColor: checked ? '#99F6E4' : undefined,
                            padding: '10px 12px',
                            borderRadius: '8px',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleTestCodeSelection(entry.code)}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '0.88rem' }}>{entry.code}</strong>
                              <span style={{ fontSize: '0.85rem' }}>— {entry.name}</span>
                              {entry.itemType === 'PACKAGE' && (
                                <span className="package-match-pill" style={{ padding: '1px 7px', fontSize: '0.68rem' }}>
                                  📦 PACKAGE
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.73rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                              <span>{entry.department}</span>
                              <span className="tube-cap-pill" style={{ background: tm.bgHex, color: tm.colorHex, padding: '1px 7px', fontSize: '0.68rem' }}>
                                <span className="tube-cap-dot" style={{ background: tm.colorHex }} />
                                {tm.capColorName}
                              </span>
                              {entry.includedTestCodes?.length ? (
                                <span style={{ color: '#1D4ED8' }}>Includes: {entry.includedTestCodes.join(', ')}</span>
                              ) : null}
                            </div>
                          </div>
                          <strong style={{ fontSize: '0.92rem', color: '#0F766E' }}>From {formatInr(entry.minPrice)}</strong>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Selected Tests Summary Bar */}
                {selectedTestCodes.length > 0 && (
                  <div
                    style={{
                      background: '#F0FDFA',
                      border: '1px solid #99F6E4',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '0.8rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong>{selectedTestCodes.length} Test{selectedTestCodes.length === 1 ? '' : 's'} Selected</strong>
                      <span style={{ color: '#64748B', marginLeft: '6px' }}>({expandedRequestedCodes.length} unique vials/tubes)</span>
                    </div>
                    <span style={{ fontWeight: 700, color: '#0F766E' }}>
                      Estimated Tariff: {formatInr(resolvedDropInfo.split.smallLabTestTotalInr)}
                    </span>
                  </div>
                )}

                {/* Step 2 Navigation Footer */}
                <div className="booking-nav-footer">
                  <button type="button" className="btn-secondary" onClick={() => setCurrentStep(1)}>
                    ← Back: Patient Details
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '9px 24px', fontSize: '0.85rem' }}
                    onClick={() => handleNextStep(3)}
                  >
                    Next: Collection &amp; Pickup →
                  </button>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* STEP 3: COLLECTION & PICKUP (DROP DESTINATION & DISPATCH) */}
            {/* ============================================================== */}
            {currentStep === 3 && (
              <div className="booking-step-card">
                <div className="booking-card-top">
                  <div className="booking-card-icon-title">
                    <div className="booking-card-icon-box">🏥</div>
                    <div>
                      <h3 className="booking-card-title">Sample Drop Destination &amp; Cold-Chain</h3>
                      <p className="booking-card-subtitle">
                        Select reference lab for specimen testing and configure courier dispatch.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3 Drop Mode Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <button
                    type="button"
                    className={`center-option-card ${dropMode === 'LARGE_LAB' ? 'active' : ''}`}
                    onClick={() => onDropModeChange('LARGE_LAB')}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>🏥 Partner Large Lab</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                      Auto-ranked lowest price &amp; nearby center
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`center-option-card ${dropMode === 'SELF_DROP' ? 'active' : ''}`}
                    onClick={() => onDropModeChange('SELF_DROP')}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>🏠 Drop at Own Lab</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                      Return sample to {myLabFacility.name}
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`center-option-card ${dropMode === 'CUSTOM_ADDRESS' ? 'active' : ''}`}
                    onClick={() => onDropModeChange('CUSTOM_ADDRESS')}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>📍 Custom Drop</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                      Drop at any external address
                    </div>
                  </button>
                </div>

                {/* Partner Large Lab Quote Comparison */}
                {dropMode === 'LARGE_LAB' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {rankedLargeLabQuotes.length === 0 ? (
                      <div className="empty-state-box" style={{ padding: '16px' }}>
                        <h4>No Verified Partner Labs Match Selected Codes</h4>
                        <p>Choose &ldquo;Drop at Own Lab&rdquo; or &ldquo;Custom Drop&rdquo; to proceed.</p>
                      </div>
                    ) : (
                      <>
                        <div className="quote-cards-stack">
                          {rankedLargeLabQuotes.map((quote, idx) => {
                            const isSelected = activeQuote?.orgLabId === quote.orgLabId;
                            return (
                              <div
                                key={quote.orgLabId}
                                className={`quote-lab-card ${isSelected ? 'selected' : ''}`}
                                onClick={() => onSelectOrgAndCenter(quote.orgLabId, quote.nearestCenter.id)}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <span className="quote-rank-badge">
                                        {idx === 0 ? '★ #1 Lowest Price' : `#${idx + 1}`}
                                      </span>
                                      <strong style={{ fontSize: '0.94rem' }}>{quote.orgLabName}</strong>
                                      {quote.nablNumber && (
                                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{quote.nablNumber}</span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '4px' }}>
                                      Nearest center: <strong>{quote.nearestCenter.name}</strong> ({quote.nearestDistanceKm} km • ~
                                      {quote.centers[0]?.estimatedEtaMins || 15} mins) • Covered {quote.coveredCodes.length}/
                                      {quote.requestedCodes.length} tests
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0D9488' }}>
                                      {formatInr(quote.totalPayableInr)}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                      Tests {formatInr(quote.smallLabTestTotalInr)} + Courier{' '}
                                      {formatInr(quote.pricingSplit.courierFeeInr)}
                                    </div>
                                  </div>
                                </div>

                                {quote.matchedPackages.length > 0 && (
                                  <div style={{ marginTop: '8px' }}>
                                    <span className="package-match-pill">
                                      🎁 Package Auto-Matched: {quote.matchedPackages.map((p) => p.code).join(', ')} • Save {formatInr(quote.packageSavingsInr)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Center Hub Selection */}
                        {activeQuote && (
                          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px' }}>
                              Select Drop Center for {activeQuote.orgLabName} ({activeQuote.centers.length} available)
                            </div>
                            <div className="center-picker-grid">
                              {activeQuote.centers.map((c) => {
                                const chosen = selectedCenterLabId === c.lab.id;
                                return (
                                  <button
                                    key={c.lab.id}
                                    type="button"
                                    className={`center-option-card ${chosen ? 'active' : ''}`}
                                    onClick={() => onSelectCenterLabId(c.lab.id)}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                      <strong style={{ fontSize: '0.82rem' }}>{c.lab.name}</strong>
                                      <span className="status-pill-green" style={{ fontSize: '0.68rem', padding: '2px 7px' }}>
                                        {c.distanceKm} km
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                                      {c.lab.centerType === 'COLLECTION_CENTER' ? 'Branch Center' : 'Main HQ'} • ~{c.estimatedEtaMins} min
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Self Drop Note */}
                {dropMode === 'SELF_DROP' && (
                  <div style={{ background: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: '10px', padding: '12px', fontSize: '0.82rem', color: '#0F766E' }}>
                    <strong>Self Lab Return Activated:</strong> Phlebotomist will collect samples from the pickup location and deliver them back to your facility <strong>{myLabFacility.name}</strong>.
                  </div>
                )}

                {/* Custom Drop Inputs */}
                {dropMode === 'CUSTOM_ADDRESS' && (
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                      <input
                        className="form-input"
                        placeholder="Drop Contact / Facility Name"
                        value={customDropName}
                        onChange={(e) => onCustomDropNameChange(e.target.value)}
                        required
                      />
                      <input
                        className="form-input"
                        placeholder="Drop PIN Code"
                        value={customDropPincode}
                        onChange={(e) => onCustomDropPincodeChange(e.target.value)}
                      />
                    </div>
                    <input
                      className="form-input"
                      placeholder="Full Custom Drop Street Address..."
                      value={customDropAddress}
                      onChange={(e) => onCustomDropAddressChange(e.target.value)}
                      required
                    />
                    <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #CBD5E1' }}>
                      <InteractiveMapPicker
                        latitude={customDropLat}
                        longitude={customDropLng}
                        heightPx={180}
                        title="Pin Custom Drop Location"
                        subtitle="Drag pin to update custom delivery coordinates"
                        onChange={onCustomDropLocationChange}
                      />
                    </div>
                  </div>
                )}

                {/* Priority & Slot */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Urgency Priority</label>
                    <select
                      className="form-select"
                      value={bookingPriority}
                      onChange={(e) => onBookingPriorityChange(e.target.value as OrderPriority)}
                    >
                      <option value={OrderPriority.ROUTINE}>Routine (Standard 2–8°C Cold-Chain)</option>
                      <option value={OrderPriority.URGENT}>Urgent (Priority Batch)</option>
                      <option value={OrderPriority.STAT_CRITICAL}>
                        STAT Critical (+{formatInr(commConfig.statSurchargeInr)})
                      </option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Preferred Pickup Window</label>
                    <select
                      className="form-select"
                      value={pickupSlot}
                      onChange={(e) => onPickupSlotChange(e.target.value)}
                    >
                      <option value="Within 45 Mins (Express)">Within 45 Mins (Express)</option>
                      <option value="Morning Batch (10:00 AM)">Morning Batch (10:00 AM)</option>
                      <option value="Afternoon Batch (02:30 PM)">Afternoon Batch (02:30 PM)</option>
                      <option value="Evening Cutoff (07:30 PM)">Evening Cutoff (07:30 PM)</option>
                    </select>
                  </div>
                </div>

                {/* Dispatch Mode */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Phlebotomist Dispatch Pool</label>
                  <select
                    className="form-select"
                    value={selectedPhleboId}
                    onChange={(e) => onSelectedPhleboIdChange(e.target.value)}
                  >
                    <option value="">Open Live Broadcast Pool (Riders within {broadcastRadiusKm} km accept live)</option>
                    {phlebotomists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id}) — {formatLabel(p.status)} • {p.currentLocation}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Broadcast Radius Slider */}
                {!selectedPhleboId && (
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label className="form-label" style={{ marginBottom: 0 }}>Live Pickup Broadcast Radar</label>
                      <strong style={{ color: '#0D9488', fontSize: '0.88rem' }}>{broadcastRadiusKm} km</strong>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={0.5}
                      value={broadcastRadiusKm}
                      onChange={(e) => onBroadcastRadiusKmChange(Number(e.target.value))}
                      style={{ width: '100%' }}
                    />

                    {/* Rapido / Uber Style Live Phlebotomists Radar Map */}
                    <div style={{ marginTop: '12px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #CBD5E1' }}>
                      <InteractiveMapPicker
                        latitude={pickupLat}
                        longitude={pickupLng}
                        radiusKm={broadcastRadiusKm}
                        radiusColor="#0D9488"
                        heightPx={200}
                        showPresets={false}
                        nearbyPhlebos={phlebotomists}
                        title="Live Fleet Radar Around Collection Point"
                        subtitle="Rapido / Uber style real-time view of nearby phlebotomists"
                        onChange={onPickupLocationChange}
                      />
                    </div>
                  </div>
                )}

                {/* Step 3 Navigation Footer */}
                <div className="booking-nav-footer">
                  <button type="button" className="btn-secondary" onClick={() => setCurrentStep(2)}>
                    ← Back: Test Selection
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '9px 24px', fontSize: '0.85rem' }}
                    onClick={() => handleNextStep(4)}
                  >
                    Next: Review &amp; Confirm →
                  </button>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* STEP 4: REVIEW & CONFIRM (PAYMENT & DISPATCH) */}
            {/* ============================================================== */}
            {currentStep === 4 && (
              <div className="booking-step-card">
                <div className="booking-card-top">
                  <div className="booking-card-icon-title">
                    <div className="booking-card-icon-box">📋</div>
                    <div>
                      <h3 className="booking-card-title">Review Booking &amp; Select Payment</h3>
                      <p className="booking-card-subtitle">
                        Confirm patient details, sample drop destination, and choose settlement mode.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Manifest Overview Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {/* Patient & Pickup Box */}
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F766E', marginBottom: '6px' }}>
                      👤 Patient &amp; Pickup Origin
                    </div>
                    <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: '#1E293B' }}>
                      <div><strong>Name:</strong> {activePatientName} ({activePatientAge}y / {activePatientGender})</div>
                      <div><strong>Mobile:</strong> {activePatientMobile}</div>
                      <div><strong>Pickup:</strong> {pickupAddress} (PIN: {pickupPincode || 'N/A'})</div>
                      {localNote && <div><strong>Note:</strong> {localNote}</div>}
                    </div>
                  </div>

                  {/* Drop Destination Box */}
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F766E', marginBottom: '6px' }}>
                      🏥 Drop Destination &amp; Cold-Chain
                    </div>
                    <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: '#1E293B' }}>
                      <div><strong>Destination:</strong> {resolvedDropInfo.targetLabName}</div>
                      <div><strong>Address:</strong> {resolvedDropInfo.deliveryAddress}</div>
                      <div><strong>Distance:</strong> {resolvedDropInfo.distanceKm} km • ~15-20 min</div>
                      <div><strong>Temp SLA:</strong> 2.0°C – 8.0°C Cold-Chain Monitored</div>
                    </div>
                  </div>
                </div>

                {/* Specimen Tubes Required Manifest */}
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>
                    🧪 Specimen Tubes Required ({resolvedSpecimensForOrder.length} tubes)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {resolvedSpecimensForOrder.map((spec) => {
                      const tm = TUBE_METADATA[spec.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
                      return (
                        <span key={spec.code} className="tube-cap-pill" style={{ background: tm.bgHex, color: tm.colorHex, padding: '3px 8px' }}>
                          <span className="tube-cap-dot" style={{ background: tm.colorHex }} />
                          {spec.code} ({tm.shortTag})
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Payment Method Selector (Pay Now vs Pay Later before Drop) */}
                <div style={{ background: '#F0FDFA', border: '1.5px solid #99F6E4', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F766E', marginBottom: '4px' }}>
                    💳 Select Payment Method
                  </div>
                  <p style={{ fontSize: '0.76rem', color: '#64748B', marginBottom: '12px' }}>
                    Choose online payment now or pay later before sample drop-off at reference lab.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        borderRadius: '8px',
                        background: payImmediatelyOnBook ? '#FFFFFF' : '#F8FAFC',
                        border: `1.5px solid ${payImmediatelyOnBook ? '#0D9488' : '#CBD5E1'}`,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="bookingPaymentModeRadio"
                        checked={payImmediatelyOnBook}
                        onChange={() => onPayImmediatelyOnBookChange(true)}
                        style={{ accentColor: '#0D9488' }}
                      />
                      <div>
                        <strong style={{ fontSize: '0.86rem', color: '#0F172A' }}>
                          💳 Pay Online Now (UPI / Card / NetBanking)
                        </strong>
                        <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                          Instant online checkout via Razorpay upon booking confirmation.
                        </div>
                      </div>
                    </label>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        borderRadius: '8px',
                        background: !payImmediatelyOnBook ? '#FFFFFF' : '#F8FAFC',
                        border: `1.5px solid ${!payImmediatelyOnBook ? '#0D9488' : '#CBD5E1'}`,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="bookingPaymentModeRadio"
                        checked={!payImmediatelyOnBook}
                        onChange={() => onPayImmediatelyOnBookChange(false)}
                        style={{ accentColor: '#0D9488' }}
                      />
                      <div>
                        <strong style={{ fontSize: '0.86rem', color: '#0F172A' }}>
                          ⏱️ Pay Later (Before Sample Drop Location)
                        </strong>
                        <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                          Dispatch booking immediately. Settle invoice via cash or digital link before courier completes drop-off.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Step 4 Navigation Footer & Dispatch Button */}
                <div className="booking-nav-footer">
                  <button type="button" className="btn-secondary" onClick={() => setCurrentStep(3)}>
                    ← Back: Collection &amp; Pickup
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ padding: '10px 28px', fontSize: '0.9rem', fontWeight: 700 }}
                    disabled={submittingBooking}
                  >
                    {submittingBooking
                      ? payImmediatelyOnBook
                        ? 'Opening Checkout...'
                        : 'Dispatching Booking...'
                      : payImmediatelyOnBook
                        ? `💳 Pay ${formatInr(resolvedDropInfo.split.grossAmountInr)} & Dispatch Booking →`
                        : '🚚 Dispatch Booking (Pay Later Before Drop) →'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ============================================================== */}
          {/* RIGHT COLUMN: STICKY QUICK SUMMARY (Matching Design Screenshot) */}
          {/* ============================================================== */}
          <div className="booking-summary-sidebar">
            {/* Quick Summary Card */}
            <div className="summary-card-modern">
              <div className="summary-card-header">
                <h4 className="summary-card-title">
                  <span>📋</span> Quick Summary
                </h4>
                <span className="summary-step-badge">Step {currentStep} of 4</span>
              </div>

              {/* Patient Block */}
              <div className="summary-user-block">
                <div className="summary-user-avatar">👤</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: '0.88rem', color: '#0F172A', display: 'block' }}>
                    {activePatientName}
                  </strong>
                  <span style={{ fontSize: '0.74rem', color: '#64748B', display: 'block', marginTop: '1px' }}>
                    {activePatientGender} • {activePatientAge} Years
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#0D9488', fontWeight: 600 }}>
                  {activePatientMobile}
                </span>
              </div>

              {/* Collection Address Block */}
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  marginTop: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>📍</span> Collection Address
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    style={{ background: 'none', border: 'none', color: '#0D9488', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    ✏️ Change
                  </button>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#1E293B', fontWeight: 600, marginTop: '4px', lineHeight: 1.35 }}>
                  {pickupAddress || 'Address on file'}
                </div>
              </div>
            </div>

            {/* Booking Details Card */}
            <div className="summary-card-modern">
              <h4 className="summary-card-title" style={{ marginBottom: '10px' }}>
                <span>📑</span> Booking Details
              </h4>
              <div className="summary-details-row">
                <span className="summary-details-label">Tests Selected</span>
                <span className="summary-details-val">
                  {selectedTestCodes.length > 0 ? `${selectedTestCodes.length} Tests Selected` : '—'}
                </span>
              </div>
              <div className="summary-details-row">
                <span className="summary-details-label">Package</span>
                <span className="summary-details-val">
                  {activeQuote?.matchedPackages?.length
                    ? activeQuote.matchedPackages.map((p) => p.code).join(', ')
                    : '—'}
                </span>
              </div>
              <div className="summary-details-row">
                <span className="summary-details-label">Collection Type</span>
                <span className="status-pill-green" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                  Home Collection
                </span>
              </div>
              <div className="summary-details-row">
                <span className="summary-details-label">Preferred Time</span>
                <span className="summary-details-val">{pickupSlot || 'Within 45 Mins'}</span>
              </div>
              <div className="summary-details-row">
                <span className="summary-details-label">Pickup Partner</span>
                <span className="summary-details-val">
                  {selectedPhleboId
                    ? phlebotomists.find((p) => p.id === selectedPhleboId)?.name || 'Direct Assign'
                    : `Live Pool (${broadcastRadiusKm} km)`}
                </span>
              </div>
              <div className="summary-details-row" style={{ paddingTop: '10px', marginTop: '4px', borderTop: '1.5px solid #E2E8F0' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Estimated Total</span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0D9488' }}>
                  {formatInr(resolvedDropInfo.split.grossAmountInr)}
                </span>
              </div>
            </div>

            {/* Why Book with LabSetu Card */}
            <div className="summary-card-modern">
              <h4 className="summary-card-title" style={{ marginBottom: '6px' }}>
                <span>🛡️</span> Why Book with LabSetu?
              </h4>
              <div className="why-book-grid">
                <div className="why-book-item">
                  <div className="why-book-icon">⚡</div>
                  <span className="why-book-label">Faster Processing</span>
                </div>
                <div className="why-book-item">
                  <div className="why-book-icon">🛡️</div>
                  <span className="why-book-label">Verified Partners</span>
                </div>
                <div className="why-book-item">
                  <div className="why-book-icon">📍</div>
                  <span className="why-book-label">Live Tracking &amp; Updates</span>
                </div>
                <div className="why-book-item">
                  <div className="why-book-icon">🔒</div>
                  <span className="why-book-label">Secure &amp; Reliable</span>
                </div>
              </div>
            </div>

            {/* Need Help Support Card */}
            <div className="summary-card-modern" style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '1.1rem' }}>🎧</span>
                <strong style={{ fontSize: '0.85rem' }}>Need Help?</strong>
              </div>
              <p style={{ fontSize: '0.74rem', color: '#64748B', marginBottom: '10px' }}>
                Our support team is available 24/7.
              </p>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '5px 14px', borderRadius: '6px' }}
                onClick={() => setShowSupportModal(true)}
              >
                Contact Support
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Dynamic Support Helpdesk Modal */}
      {showSupportModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px',
          }}
          onClick={() => setShowSupportModal(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                padding: '20px 24px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  🎧
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#ffffff' }}>
                    LabSetu Operations &amp; Dispatch Support
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', opacity: 0.9 }}>
                    24x7 Dedicated Partner Support Desk
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSupportModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '22px',
                  cursor: 'pointer',
                  padding: '4px',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '22px 24px' }}>
              {/* Facility Identity Banner */}
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '18px',
                  fontSize: '0.82rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    Active Facility
                  </div>
                  <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                    {myLabFacility?.name || 'Collection Center'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    Facility ID
                  </div>
                  <div style={{ fontWeight: 700, color: '#0D9488', marginTop: '2px' }}>
                    {myLabFacility?.id || 'LAB-SM-ACTIVE'}
                  </div>
                </div>
              </div>

              {/* Contact Channels */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #CCFBF1',
                    backgroundColor: '#F0FDFA',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>📞</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0F766E' }}>
                        Cold-Chain &amp; Dispatch Hotline
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>1800-889-SETU • Toll Free 24/7</div>
                    </div>
                  </div>
                  <a
                    href="tel:18008897388"
                    style={{
                      padding: '6px 14px',
                      backgroundColor: '#0D9488',
                      color: '#ffffff',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                    }}
                  >
                    Call Now
                  </a>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #E0E7FF',
                    backgroundColor: '#EEF2FF',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>✉️</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#4338CA' }}>
                        Helpdesk &amp; Escalation Email
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>support@labsetu.com • SLA &lt; 15 mins</div>
                    </div>
                  </div>
                  <a
                    href="mailto:support@labsetu.com"
                    style={{
                      padding: '6px 14px',
                      backgroundColor: '#4F46E5',
                      color: '#ffffff',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                    }}
                  >
                    Send Email
                  </a>
                </div>
              </div>

              {/* Cold-Chain Handover SOP Summary */}
              <div
                style={{
                  backgroundColor: '#FEF3C7',
                  border: '1px solid #FCD34D',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '20px',
                  fontSize: '0.77rem',
                  color: '#92400E',
                  lineHeight: 1.5,
                }}
              >
                <strong>⚡ Sample Handover SOP:</strong>
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  <li>Maintain 2°C – 8°C pre-chilled gel packs in insulated pouch.</li>
                  <li>Verify matching tube cap color for each test before sealing.</li>
                  <li>Disclose the 5-digit Handover OTP only upon physical custody transfer.</li>
                </ul>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setShowSupportModal(false)}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close Support Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
