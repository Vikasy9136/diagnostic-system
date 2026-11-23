import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ADMIN_SUB_ROLE_LABELS,
  type AdminTeamRole,
  type CreateManagedUserPayload,
  evaluatePointServiceCoverage,
  type LabCenterType,
  type LabDocumentRecord,
  type LabFacility,
  LOCALITY_GPS_PRESETS,
  resolveReportingManagerForRole,
  ROLE_LABELS,
  type ServiceZoneRecord,
  UserRole,
} from '@diagnostic/shared';
import { InteractiveMapPicker } from '../../components/InteractiveMapPicker';
import {
  LiveCameraCaptureModal,
  ModalFrame,
  PasswordInputWithGenerator,
} from '../../components/shared';
import { uploadDiagnosticDocument } from '../../firebase';
import {
  computeNextAssignedIdForRole,
  provisionRoleUser,
} from '../../services/firestoreService';
import { type AlertTriggerFn, type CredentialSlipData } from '../types';

export interface AdminOnboardingModalProps {
  open: boolean;
  presetRole: UserRole;
  presetCenterType?: LabCenterType;
  onClose: () => void;
  isSuperAdmin: boolean;
  rootAdminEmail: string;
  currentUserEmail?: string;
  currentUserName?: string;
  bearerToken?: string;
  largeLabOrgs: LabFacility[];
  serviceZones: ServiceZoneRecord[];
  allExistingAssignedCodes: string[];
  onShowAlert: AlertTriggerFn;
  onProvisioned: (slip: CredentialSlipData) => void;
}

export function AdminOnboardingModal({
  open,
  presetRole,
  presetCenterType = 'MAIN_HUB',
  onClose,
  isSuperAdmin: _isSuperAdmin,
  rootAdminEmail,
  currentUserEmail,
  currentUserName,
  bearerToken,
  largeLabOrgs,
  serviceZones,
  allExistingAssignedCodes,
  onShowAlert,
  onProvisioned,
}: AdminOnboardingModalProps) {
  const [role, setRole] = useState<UserRole>(presetRole);
  const [adminSubRole, setAdminSubRole] = useState<AdminTeamRole>('OPS_DISPATCH');
  const [centerType, setCenterType] = useState<LabCenterType>(presetCenterType);
  const [parentLabId, setParentLabId] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [labId, setLabId] = useState('');
  const [phleboId, setPhleboId] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [city, setCity] = useState('Mumbai');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [nabl, setNabl] = useState('');
  const [radiusKm, setRadiusKm] = useState<number>(15);
  const [vehicle, setVehicle] = useState('Cold-Chain Two-Wheeler');
  const [dlNumber, setDlNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<'BIKE' | 'SCOOTER' | 'EV_BIKE' | 'BICYCLE' | 'OTHER'>('BIKE');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [dlDocUrl, setDlDocUrl] = useState('');
  const [rcDocUrl, setRcDocUrl] = useState('');
  const [aadhaarDocUrl, setAadhaarDocUrl] = useState('');
  const [panDocUrl, setPanDocUrl] = useState('');
  const [signedAgreementUrl, setSignedAgreementUrl] = useState('');
  const [signerName, setSignerName] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [lat, setLat] = useState<number>(LOCALITY_GPS_PRESETS[0].latitude);
  const [lng, setLng] = useState<number>(LOCALITY_GPS_PRESETS[0].longitude);
  const [saving, setSaving] = useState(false);

  // Live Camera and Document states
  const [activeCameraTarget, setActiveCameraTarget] = useState<'exterior' | 'interior' | 'live' | null>(null);
  const [exteriorPhotoUrl, setExteriorPhotoUrl] = useState('');
  const [interiorPhotoUrl, setInteriorPhotoUrl] = useState('');
  const [livePhotoUrl, setLivePhotoUrl] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [operatingHours, setOperatingHours] = useState('08:00 AM – 08:30 PM Daily');
  const [uploadedDocs, setUploadedDocs] = useState<LabDocumentRecord[]>([]);
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const [selectedDocType, setSelectedDocType] = useState<LabDocumentRecord['type']>('CLINICAL_ESTABLISHMENT_ACT');
  const [docTitleInput, setDocTitleInput] = useState('');
  const [gpsAccuracyMsg, setGpsAccuracyMsg] = useState<string | null>(null);
  const [detectingGps, setDetectingGps] = useState(false);

  const defaultActiveZone = useMemo(
    () => serviceZones.find((z) => z.isActive) || serviceZones[0] || null,
    [serviceZones]
  );

  const selectedPhleboZone = useMemo(
    () => serviceZones.find((z) => z.id === selectedZoneId) || null,
    [serviceZones, selectedZoneId]
  );

  useEffect(() => {
    if (!open) return;
    const initZone = serviceZones.find((z) => z.isActive) || serviceZones[0] || null;
    setRole(presetRole);
    setAdminSubRole('OPS_DISPATCH');
    setCenterType(presetCenterType);
    setParentLabId(largeLabOrgs[0]?.id || '');
    setEmail('');
    setName('');
    setPhone('');
    setPassword('');
    setShowPassword(false);
    setCity(
      presetRole === UserRole.PHLEBOTOMIST && initZone
        ? initZone.city
        : 'Mumbai'
    );
    setAddress('');
    setPincode('');
    setNabl('');
    setRadiusKm(15);
    setVehicle('Cold-Chain Two-Wheeler');
    setDlNumber('');
    setVehicleNumber('');
    setVehicleType('BIKE');
    setAadhaarNumber('');
    setPanNumber('');
    setDlDocUrl('');
    setRcDocUrl('');
    setAadhaarDocUrl('');
    setPanDocUrl('');
    setSignedAgreementUrl('');
    setSignerName('');
    setSelectedZoneId(initZone?.id || '');
    setLat(
      presetRole === UserRole.PHLEBOTOMIST && initZone
        ? initZone.centerLatitude
        : LOCALITY_GPS_PRESETS[0].latitude
    );
    setLng(
      presetRole === UserRole.PHLEBOTOMIST && initZone
        ? initZone.centerLongitude
        : LOCALITY_GPS_PRESETS[0].longitude
    );
    setLabId(
      presetRole === UserRole.SMALL_LAB || presetRole === UserRole.LARGE_LAB
        ? computeNextAssignedIdForRole({
            role: presetRole,
            centerType: presetRole === UserRole.LARGE_LAB ? presetCenterType : undefined,
            existingCodes: allExistingAssignedCodes,
          })
        : ''
    );
    setPhleboId(
      presetRole === UserRole.PHLEBOTOMIST
        ? computeNextAssignedIdForRole({
            role: UserRole.PHLEBOTOMIST,
            existingCodes: allExistingAssignedCodes,
          })
        : ''
    );
    setExteriorPhotoUrl('');
    setLivePhotoUrl('');
    setInteriorPhotoUrl('');
    setContactPerson('');
    setOperatingHours('08:00 AM – 08:30 PM Daily');
    setUploadedDocs([]);
    setDocTitleInput('');
    setUploadingTarget(null);
    setActiveCameraTarget(null);
    setGpsAccuracyMsg(null);
    setDetectingGps(false);
    setSelectedDocType(
      presetRole === UserRole.PHLEBOTOMIST ? 'AADHAAR_CARD' : 'CLINICAL_ESTABLISHMENT_ACT'
    );
  }, [open, presetRole, presetCenterType, serviceZones]);

  // Adjust default doc type when role changes
  useEffect(() => {
    if (role === UserRole.PHLEBOTOMIST) {
      setSelectedDocType('AADHAAR_CARD');
    } else {
      setSelectedDocType('CLINICAL_ESTABLISHMENT_ACT');
    }
  }, [role]);

  const autoManager = useMemo(
    () =>
      resolveReportingManagerForRole({
        role,
        adminSubRole: role === UserRole.ADMIN ? adminSubRole : undefined,
        isSuperAdmin: role === UserRole.ADMIN && adminSubRole === 'SUPER_ADMIN',
        targetEmail: email,
        rootAdminEmail,
      }),
    [role, adminSubRole, email, rootAdminEmail]
  );

  const previewRoleCode = useMemo(() => {
    if (role === UserRole.SMALL_LAB || role === UserRole.LARGE_LAB) {
      return (
        labId.trim() ||
        computeNextAssignedIdForRole({
          role,
          centerType: role === UserRole.LARGE_LAB ? centerType : undefined,
          existingCodes: allExistingAssignedCodes,
        })
      );
    }
    if (role === UserRole.PHLEBOTOMIST) {
      return (
        phleboId.trim() ||
        computeNextAssignedIdForRole({
          role: UserRole.PHLEBOTOMIST,
          existingCodes: allExistingAssignedCodes,
        })
      );
    }
    return computeNextAssignedIdForRole({
      role: UserRole.ADMIN,
      isEmployee: adminSubRole === 'DEPARTMENT_EMPLOYEE',
      existingCodes: allExistingAssignedCodes,
    });
  }, [role, centerType, adminSubRole, labId, phleboId, allExistingAssignedCodes]);

  const userLocCoverage = useMemo(
    () => evaluatePointServiceCoverage(serviceZones, Number(lat), Number(lng), pincode, city),
    [serviceZones, lat, lng, pincode, city]
  );

  // Available document types based on selected role
  const docTypeOptions: Array<{ value: LabDocumentRecord['type']; label: string }> = useMemo(() => {
    if (role === UserRole.PHLEBOTOMIST) {
      return [
        { value: 'AADHAAR_CARD', label: 'Aadhaar Card (Govt ID Proof)' },
        { value: 'DRIVING_LICENSE', label: 'Driving License (Motorbike / Transport)' },
        { value: 'DMLT_CERTIFICATE', label: 'DMLT / Phlebotomy Certificate' },
        { value: 'PAN_CARD', label: 'PAN Card' },
        { value: 'OTHER', label: 'Other Document' },
      ];
    }
    return [
      { value: 'CLINICAL_ESTABLISHMENT_ACT', label: 'Clinical Establishment Act / Registration Certificate' },
      { value: 'TRADE_LICENSE', label: 'Trade License / Municipal Shop Act' },
      { value: 'POLLUTION_CONTROL_NOC', label: 'Bio-Medical Waste / PCB Authorization NOC' },
      { value: 'NABL_CERT', label: 'NABL / ISO 15189 Certificate' },
      { value: 'GST_CERTIFICATE', label: 'GSTIN Registration Certificate' },
      { value: 'PAN_CARD', label: 'Laboratory PAN Card' },
      { value: 'PATHOLOGIST_REG', label: 'Pathologist Degree / MCI Registration' },
      { value: 'OWNER_ID_PROOF', label: 'Proprietor / Director ID Proof' },
      { value: 'OTHER', label: 'Other Regulatory Document' },
    ];
  }, [role]);

  // Accurate GPS Detection via HTML5 Geolocation with high accuracy
  function handleDetectAccurateGps() {
    if (!navigator.geolocation) {
      onShowAlert({
        variant: 'warning',
        title: 'GPS Unsupported',
        message: 'Geolocation is not supported by your browser.',
      });
      return;
    }
    setDetectingGps(true);
    setGpsAccuracyMsg(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setDetectingGps(false);
        const latVal = Math.round(pos.coords.latitude * 1000000) / 1000000;
        const lngVal = Math.round(pos.coords.longitude * 1000000) / 1000000;
        const accuracyMeters = Math.round(pos.coords.accuracy || 10);

        setLat(latVal);
        setLng(lngVal);
        setGpsAccuracyMsg(`Accurate GPS Locked: ${latVal.toFixed(5)}, ${lngVal.toFixed(5)} (±${accuracyMeters}m accuracy)`);

        try {
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
          const res = await fetch(`${apiUrl}/maps/geocode?latlng=${latVal},${lngVal}`);
          if (res.ok) {
            const data = (await res.json()) as {
              results?: Array<{
                formatted_address: string;
                address_components?: Array<{ types: string[]; long_name: string }>;
              }>;
            };
            const firstResult = data.results?.[0];
            if (firstResult) {
              if (firstResult.formatted_address) {
                setAddress(firstResult.formatted_address);
              }
              firstResult.address_components?.forEach((c) => {
                if (c.types.includes('locality')) setCity(c.long_name);
                if (c.types.includes('postal_code')) {
                  setPincode(c.long_name.replace(/\D/g, '').slice(0, 6));
                }
              });
            }
          }
        } catch {
          // Geocode fallback completed
        }
      },
      (err) => {
        setDetectingGps(false);
        onShowAlert({
          variant: 'error',
          title: 'GPS Detection Failed',
          message: `Could not fetch live GPS: ${err.message}. Please check browser location permissions.`,
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // Handle Live Camera Snapshot upload
  async function handleCameraCapture(blob: Blob, dataUrl: string) {
    if (!activeCameraTarget) return;
    setUploadingTarget(activeCameraTarget);
    try {
      let fileUrl = '';
      try {
        const fileName = `${activeCameraTarget}_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        fileUrl = await uploadDiagnosticDocument(`live_camera/${fileName}`, file);
      } catch {
        fileUrl = dataUrl;
      }

      if (activeCameraTarget === 'exterior') {
        setExteriorPhotoUrl(fileUrl);
      } else if (activeCameraTarget === 'interior') {
        setInteriorPhotoUrl(fileUrl);
      } else if (activeCameraTarget === 'live') {
        setLivePhotoUrl(fileUrl);
      }
    } catch (err: unknown) {
      onShowAlert({
        variant: 'error',
        title: 'Live Photo Save Failed',
        message: err instanceof Error ? err.message : 'Could not process captured live photo.',
      });
    } finally {
      setUploadingTarget(null);
      setActiveCameraTarget(null);
    }
  }

  // Handle Document Upload (PDF / images for trade license, etc.)
  async function handleDocumentUpload(file: File) {
    try {
      setUploadingTarget('doc');
      let fileUrl = '';
      try {
        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `documents/${Date.now()}_${cleanName}`;
        fileUrl = await uploadDiagnosticDocument(storagePath, file);
      } catch {
        fileUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      const matchingOption = docTypeOptions.find((d) => d.value === selectedDocType);
      const newDoc: LabDocumentRecord = {
        id: `DOC-${Date.now()}`,
        type: selectedDocType,
        title: docTitleInput.trim() || matchingOption?.label || selectedDocType.replace(/_/g, ' '),
        url: fileUrl,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        verified: false,
      };
      setUploadedDocs((prev) => [...prev, newDoc]);
      setDocTitleInput('');
    } catch (err: unknown) {
      onShowAlert({
        variant: 'error',
        title: 'Document Upload Failed',
        message: err instanceof Error ? err.message : 'Could not process document file.',
      });
    } finally {
      setUploadingTarget(null);
    }
  }

  // Handle Dedicated Secure Document Upload (DL, RC, Aadhaar, PAN, Signed Agreement)
  async function handleDirectDocUpload(
    file: File,
    category: 'DL' | 'RC' | 'AADHAAR' | 'PAN' | 'AGREEMENT'
  ) {
    try {
      setUploadingTarget(category.toLowerCase());
      let fileUrl = '';
      const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `documents/${category.toLowerCase()}/${Date.now()}_${cleanName}`;
      try {
        fileUrl = await uploadDiagnosticDocument(storagePath, file);
      } catch {
        fileUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      if (category === 'DL') setDlDocUrl(fileUrl);
      else if (category === 'RC') setRcDocUrl(fileUrl);
      else if (category === 'AADHAAR') setAadhaarDocUrl(fileUrl);
      else if (category === 'PAN') setPanDocUrl(fileUrl);
      else if (category === 'AGREEMENT') setSignedAgreementUrl(fileUrl);

      const categoryLabels: Record<string, string> = {
        DL: `Driving License (${dlNumber || 'Transport DL'})`,
        RC: `Vehicle RC (${vehicleNumber || 'Vehicle Registration'})`,
        AADHAAR: `Aadhaar Card (${aadhaarNumber || 'UIDAI'})`,
        PAN: `PAN Card (${panNumber || 'Income Tax Dept'})`,
        AGREEMENT: `Signed Master Agreement (${signerName || 'Authorized Signatory'})`,
      };

      const docRecord: LabDocumentRecord = {
        id: `DOC-${Date.now()}`,
        type:
          category === 'DL'
            ? 'DRIVING_LICENSE'
            : category === 'AADHAAR'
            ? 'AADHAAR_CARD'
            : category === 'PAN'
            ? 'PAN_CARD'
            : 'OTHER',
        title: categoryLabels[category],
        url: fileUrl,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        verified: false,
      };
      setUploadedDocs((prev) => [...prev, docRecord]);

      onShowAlert({
        variant: 'success',
        title: 'Document Secured',
        message: `${file.name} uploaded and securely attached to verification file.`,
      });
    } catch (err: unknown) {
      onShowAlert({
        variant: 'error',
        title: 'Upload Failed',
        message: err instanceof Error ? err.message : 'Could not upload document.',
      });
    } finally {
      setUploadingTarget(null);
    }
  }

  // Download Master Agreement Template
  function handleDownloadAgreementTemplate(targetRole: 'PHLEBOTOMIST' | 'SMALL_LAB' | 'LARGE_LAB') {
    const agreementTitle =
      targetRole === 'PHLEBOTOMIST'
        ? 'LabSetu Field Phlebotomist & Cold-Chain Transit Service Agreement (v2.1)'
        : targetRole === 'SMALL_LAB'
        ? 'LabSetu Collection Centre B2B Dispatch & Tariff Agreement (v2.1)'
        : 'LabSetu Central Reference Laboratory Testing & SLA Agreement (v2.1)';

    const content = `================================================================================
${agreementTitle.toUpperCase()}
================================================================================
Platform: LabSetu Diagnostic Logistics & Cold-Chain Network
Version: 2.1 (Active Standard Agreement)
Date of Generation: ${new Date().toLocaleDateString('en-IN')}

1. PARTIES & ENGAGEMENT:
This Master Agreement is executed between LabSetu Healthcare Technologies Private Limited ("Platform")
and the undersigned Onboarding Partner ("Partner / Courier / Laboratory").

2. OPERATIONAL ROLES & RESPONSIBILITIES:
- Compliance with cold-chain protocols (2°C - 8°C vacutainer carrier integrity).
- Mandatory sample scan, QR custody barcode chain-of-custody handshakes.
- Instant 30-minute payout settlement eligibility upon validated test drop verification.
- Accurate GPS dispatch radar and verified route tracking.

3. DATA PROTECTION & HIPAA / NABH COMPLIANCE:
All patient identifiers, test manifests, and diagnostic specimens shall remain strictly encrypted
and confidential under Applicable Indian Information Technology & Healthcare Laws.

4. EXECUTION & SIGNATURE:
Party Name / Laboratory / Courier: _____________________________________________
Authorized Signer Name: _______________________________________________________
Designation / Relationship: ___________________________________________________
Contact Phone / Email: ________________________________________________________
Govt ID / Aadhaar / DL / PAN No: ______________________________________________
Place: ____________________________________ Date: _____________________________

Signature & Official Seal: ____________________________________________________
================================================================================
Instructions: Download, print/sign with official signature, and upload scan/PDF in the onboarding verification portal.
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LabSetu_${targetRole}_Master_Agreement_v2.1.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return;
    const cleanPassword = password.trim();
    if (cleanPassword && cleanPassword.length < 6) {
      onShowAlert({
        variant: 'warning',
        title: 'Password Too Short',
        message: 'Initial password must be at least 6 characters long (or leave empty to use Email OTP / Google Sign-In).',
      });
      return;
    }

    const isLargeCenter = role === UserRole.LARGE_LAB && centerType === 'COLLECTION_CENTER';
    const parentOrg = isLargeCenter ? largeLabOrgs.find((l) => l.id === parentLabId) : undefined;
    if (isLargeCenter && !parentOrg) {
      onShowAlert({
        variant: 'warning',
        title: 'Parent Hub Required',
        message: 'Select the parent Large Reference Lab Hub before creating a Collection Center login.',
      });
      return;
    }

    setSaving(true);
    try {
      const autoSeqCode = computeNextAssignedIdForRole({
        role,
        centerType: role === UserRole.LARGE_LAB ? centerType : undefined,
        isEmployee: role === UserRole.ADMIN && adminSubRole === 'DEPARTMENT_EMPLOYEE',
        existingCodes: allExistingAssignedCodes,
      });
      const resolvedLabId =
        role === UserRole.SMALL_LAB || role === UserRole.LARGE_LAB
          ? labId.trim() || autoSeqCode
          : undefined;
      const resolvedPhleboId =
        role === UserRole.PHLEBOTOMIST ? phleboId.trim() || autoSeqCode : undefined;
      const resolvedUserCode = resolvedLabId || resolvedPhleboId || autoSeqCode;

      const payload: CreateManagedUserPayload = {
        email: email.trim().toLowerCase(),
        displayName: name.trim(),
        role,
        adminSubRole: role === UserRole.ADMIN ? adminSubRole : undefined,
        reportingManagerName: autoManager.reportingManagerName,
        reportingManagerEmail: autoManager.reportingManagerEmail,
        phoneNumber: phone.trim() || undefined,
        userCode: resolvedUserCode,
        userCodeUpper: resolvedUserCode.toUpperCase(),
        labId: resolvedLabId,
        parentLabId: isLargeCenter ? parentOrg?.id : undefined,
        phlebotomistId: resolvedPhleboId,
        password: cleanPassword || undefined,
        isActive: true,
      };
      const effectiveZone =
        role === UserRole.PHLEBOTOMIST
          ? selectedPhleboZone || userLocCoverage.matchedZone || defaultActiveZone
          : null;

      const { profile } = await provisionRoleUser(bearerToken || '', payload, {
        createFacilityRecord: true,
        city: effectiveZone?.city || city,
        address: address.trim() || undefined,
        pincode: pincode.trim() || undefined,
        latitude: Number(lat),
        longitude: Number(lng),
        serviceRadiusKm:
          role === UserRole.SMALL_LAB || role === UserRole.LARGE_LAB ? Number(radiusKm) || 15 : undefined,
        centerType: role === UserRole.LARGE_LAB ? centerType : undefined,
        parentLabName: parentOrg?.name,
        nablNumber: nabl.trim() || undefined,
        vehicleInfo:
          role === UserRole.PHLEBOTOMIST
            ? `${vehicleType} (${vehicleNumber.trim() || 'Reg Pending'}) — ${vehicle.trim()}`
            : vehicle.trim() || undefined,
        dlNumber: dlNumber.trim() || undefined,
        vehicleNumber: vehicleNumber.trim() || undefined,
        vehicleType: role === UserRole.PHLEBOTOMIST ? vehicleType : undefined,
        aadhaarNumber: aadhaarNumber.trim() || undefined,
        panNumber: panNumber.trim() || undefined,
        dlDocumentUrl: dlDocUrl || undefined,
        rcDocumentUrl: rcDocUrl || undefined,
        aadhaarDocumentUrl: aadhaarDocUrl || undefined,
        panDocumentUrl: panDocUrl || undefined,
        signedAgreementUrl: signedAgreementUrl || undefined,
        signerName: signerName.trim() || undefined,
        signedAt: signedAgreementUrl ? new Date().toISOString() : undefined,
        onboardedByEmail: currentUserEmail,
        onboardedByName: currentUserName,
        assignedZoneId: effectiveZone?.id,
        assignedZoneCode: effectiveZone?.zoneCode,
        assignedZoneName: effectiveZone?.name,
        assignedCity: effectiveZone?.city || city,
        existingCodes: allExistingAssignedCodes,
        exteriorPhotoUrl: exteriorPhotoUrl.trim() || undefined,
        interiorPhotoUrl: interiorPhotoUrl.trim() || undefined,
        livePhotoUrl: livePhotoUrl.trim() || undefined,
        documents: uploadedDocs.length > 0 ? uploadedDocs : undefined,
        contactPersonName: contactPerson.trim() || undefined,
        operatingHours: operatingHours.trim() || undefined,
        verified: false,
        verificationStatus: 'PENDING',
      });

      onClose();
      const roleLabel =
        profile.role === UserRole.ADMIN && profile.adminSubRole
          ? ADMIN_SUB_ROLE_LABELS[profile.adminSubRole]
          : ROLE_LABELS[profile.role];

      onProvisioned({
        email: profile.email,
        name: profile.displayName,
        roleLabel,
        userCode: profile.userCode || resolvedUserCode,
        initialPassword: cleanPassword || undefined,
        passwordConfigured: Boolean(cleanPassword),
      });

      onShowAlert({
        variant: 'success',
        title: 'Onboarding Submitted for Verification',
        message: `${profile.displayName} (${profile.email}) onboarding record submitted. Status is set to Pending Verification. Review submitted documents and live camera photos in the Verification Queue to approve and dispatch login credentials.`,
      });
    } catch (err: unknown) {
      onShowAlert({
        variant: 'error',
        title: 'Provisioning Error',
        message: (err as Error).message || 'Failed to create user account.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      title={
        role === UserRole.PHLEBOTOMIST
          ? 'Onboard Field Phlebotomist'
          : role === UserRole.ADMIN
          ? 'Onboard Administrator'
          : 'Onboard Diagnostic Laboratory'
      }
      subtitle="Complete regulatory KYC, capture live camera verification photos, pin accurate location & configure credentials"
      maxWidth="680px"
    >
      <form onSubmit={handleSubmit} className="admin-onboarding-form">
        {/* Role Selection */}
        <div className="form-group">
          <label className="form-label">Role *</label>
          <select
            className="form-select"
            value={role}
            onChange={(e) => {
              const nextRole = e.target.value as UserRole;
              setRole(nextRole);
              if (nextRole === UserRole.LARGE_LAB && !parentLabId && largeLabOrgs[0]) {
                setParentLabId(largeLabOrgs[0].id);
              }
            }}
          >
            <option value={UserRole.SMALL_LAB}>Small Collection Lab</option>
            <option value={UserRole.LARGE_LAB}>Large Partner / Reference Lab</option>
            <option value={UserRole.PHLEBOTOMIST}>Field Phlebotomist (Mobile App)</option>
            <option value={UserRole.ADMIN}>Platform Admin Team</option>
          </select>
        </div>

        {/* Large Lab Center Type */}
        {role === UserRole.LARGE_LAB && (
          <div className="form-group">
            <label className="form-label">Large Lab Center Classification *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                className={`btn-secondary ${centerType === 'MAIN_HUB' ? 'active-pill' : ''}`}
                style={{
                  fontWeight: centerType === 'MAIN_HUB' ? 700 : 500,
                  borderColor: centerType === 'MAIN_HUB' ? '#0D9488' : '#CBD5E1',
                  background: centerType === 'MAIN_HUB' ? '#F0FDFA' : '#FFF',
                  color: centerType === 'MAIN_HUB' ? '#0F766E' : '#334155',
                }}
                onClick={() => setCenterType('MAIN_HUB')}
              >
                🏢 Main Processing Hub
              </button>
              <button
                type="button"
                className={`btn-secondary ${centerType === 'COLLECTION_CENTER' ? 'active-pill' : ''}`}
                style={{
                  fontWeight: centerType === 'COLLECTION_CENTER' ? 700 : 500,
                  borderColor: centerType === 'COLLECTION_CENTER' ? '#0D9488' : '#CBD5E1',
                  background: centerType === 'COLLECTION_CENTER' ? '#F0FDFA' : '#FFF',
                  color: centerType === 'COLLECTION_CENTER' ? '#0F766E' : '#334155',
                }}
                onClick={() => setCenterType('COLLECTION_CENTER')}
              >
                🏥 Collection Center Branch
              </button>
            </div>
          </div>
        )}

        {/* Large Lab Branch Parent Organization */}
        {role === UserRole.LARGE_LAB && centerType === 'COLLECTION_CENTER' && (
          <div className="form-group">
            <label className="form-label">Parent Reference Lab Hub *</label>
            <select
              className="form-select"
              value={parentLabId}
              onChange={(e) => setParentLabId(e.target.value)}
              required
            >
              {largeLabOrgs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.userCode || l.id}) — {l.city}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Phlebotomist Zone Assignment */}
        {role === UserRole.PHLEBOTOMIST && (
          <div className="form-group">
            <label className="form-label">Primary Assigned Service Zone *</label>
            <select
              className="form-select"
              value={selectedZoneId}
              onChange={(e) => {
                const zId = e.target.value;
                setSelectedZoneId(zId);
                const found = serviceZones.find((z) => z.id === zId);
                if (found) {
                  setCity(found.city);
                  setLat(found.centerLatitude);
                  setLng(found.centerLongitude);
                }
              }}
            >
              {serviceZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.zoneCode} • {z.name} ({z.city}) — {z.radiusKm} km radar
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Basic Name & Email */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="form-group">
            <label className="form-label">
              {role === UserRole.PHLEBOTOMIST
                ? 'Phlebotomist Full Name *'
                : role === UserRole.ADMIN
                ? 'Admin Staff Name *'
                : 'Laboratory Center Name *'}
            </label>
            <input
              className="form-input"
              placeholder={role === UserRole.PHLEBOTOMIST ? 'e.g. Ramesh Kumar' : 'e.g. Apex Diagnostics Center'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Registered Email Address *</label>
            <input
              type="email"
              className="form-input"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Auto Generated Assigned Code Preview */}
        <div className="form-group">
          <label className="form-label">
            {role === UserRole.PHLEBOTOMIST
              ? 'Assigned Courier ID'
              : role === UserRole.ADMIN
              ? 'Assigned Staff ID'
              : 'Assigned Lab ID'}
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              className="form-input"
              value={role === UserRole.PHLEBOTOMIST ? phleboId : labId}
              placeholder={`Auto-assigned: ${previewRoleCode}`}
              onChange={(e) => {
                if (role === UserRole.PHLEBOTOMIST) {
                  setPhleboId(e.target.value.toUpperCase());
                } else {
                  setLabId(e.target.value.toUpperCase());
                }
              }}
            />
            <span className="user-code-badge" style={{ whiteSpace: 'nowrap', padding: '6px 12px' }}>
              {previewRoleCode}
            </span>
          </div>
        </div>

        {/* Address and Interactive Map with Google Maps & Live Location */}
        {(role === UserRole.SMALL_LAB || role === UserRole.LARGE_LAB || role === UserRole.PHLEBOTOMIST) && (
          <>
            <div className="form-group">
              <label className="form-label">Street Address *</label>
              <input
                className="form-input"
                placeholder="Click 'Detect Accurate Live Location' or search Google Maps below"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              {/* GPS Detection Bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                  background: '#F8FAFC',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.8rem', color: '#1E293B', display: 'block' }}>
                    🛰️ Live Geolocation &amp; Google Maps Search
                  </strong>
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                    Detect precise GPS coordinates with one click or search landmarks via Google Maps
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    fontSize: '0.76rem',
                    padding: '6px 12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#F0FDFA',
                    color: '#0F766E',
                    borderColor: '#99F6E4',
                    fontWeight: 700,
                  }}
                  onClick={handleDetectAccurateGps}
                  disabled={detectingGps}
                >
                  <span>🛰️</span> {detectingGps ? 'Detecting GPS...' : 'Detect Accurate Live Location (GPS)'}
                </button>
              </div>

              {gpsAccuracyMsg && (
                <div
                  style={{
                    fontSize: '0.74rem',
                    color: '#047857',
                    background: '#ECFDF5',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    marginBottom: '8px',
                    border: '1px solid #A7F3D0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>✓</span> {gpsAccuracyMsg}
                </div>
              )}

              <InteractiveMapPicker
                latitude={lat}
                longitude={lng}
                heightPx={220}
                title={
                  role === UserRole.PHLEBOTOMIST
                    ? 'Pin Base Zone Coordinates (Google Maps)'
                    : 'Pin Center Location (Google Maps)'
                }
                subtitle="Search landmark or address, tap map, or drag marker to autofill City, Pincode & GPS"
                onChange={(loc) => {
                  setLat(loc.latitude);
                  setLng(loc.longitude);
                  if (loc.city) setCity(loc.city);
                  if (loc.address) setAddress(loc.address);
                  if (loc.pincode) setPincode(loc.pincode);
                }}
              />

              <div
                className={`zone-coverage-pill ${userLocCoverage.covered ? 'covered' : 'uncovered'}`}
                style={{ marginTop: '8px' }}
              >
                {userLocCoverage.covered
                  ? `✓ Inside Active Service Area: ${userLocCoverage.matchedZone?.city} — ${userLocCoverage.matchedZone?.name} (${userLocCoverage.matchedZone?.zoneCode}${pincode.trim() ? ` • Pincode ${pincode.trim()} Covered` : ''})`
                  : `ⓘ Area Expansion Pending: ${userLocCoverage.message}`}
              </div>
            </div>
          </>
        )}

        {/* City & Contact Phone */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="form-group">
            <label className="form-label">City *</label>
            <input className="form-input" value={city} onChange={(e) => setCity(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Phone Number *</label>
            <input
              className="form-input"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Contact Person & Operating Window for Labs */}
        {(role === UserRole.SMALL_LAB || role === UserRole.LARGE_LAB) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label className="form-label">Proprietor / Lab In-Charge Name</label>
              <input
                className="form-input"
                placeholder="Dr. / Mr. / Ms. Contact Person"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Daily Operating / Cutoff Window</label>
              <input
                className="form-input"
                placeholder="08:00 AM – 08:30 PM Daily"
                value={operatingHours}
                onChange={(e) => setOperatingHours(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* NABL & Service Radius for Labs */}
        {(role === UserRole.SMALL_LAB || role === UserRole.LARGE_LAB) && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label className="form-label">NABL / Clinical Registration ID (Optional)</label>
              <input
                className="form-input"
                placeholder="e.g. NABL ISO 15189 / Reg No"
                value={nabl}
                onChange={(e) => setNabl(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Service Radius (km)</label>
              <input
                type="number"
                min="1"
                max="100"
                className="form-input"
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        {/* SECTION 1: LIVE CAMERA CAPTURE (Strictly browser camera stream, NO file uploads) */}
        {(role === UserRole.SMALL_LAB || role === UserRole.LARGE_LAB) && (
          <div
            style={{
              background: '#F0FDFA',
              border: '1px solid #99F6E4',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.85rem', color: '#0F766E' }}>
                📸 Mandatory Live Camera Facility Photos (Browser Live Webcam / Camera Only)
              </strong>
              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                Strict live camera capture is required for fraud prevention. File uploads are disabled for physical verification photos.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {/* 1. Live Front Exterior / Signboard Photo */}
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0F766E' }}>
                  🏢 Live Outside / Front Signboard Photo *
                </span>
                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                  Step outside and capture building storefront with lab board.
                </div>
                {exteriorPhotoUrl ? (
                  <div style={{ position: 'relative', width: '100%', height: '110px', borderRadius: '6px', overflow: 'hidden' }}>
                    <img src={exteriorPhotoUrl} alt="Live Exterior" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '4px',
                        left: '4px',
                        background: 'rgba(13, 148, 136, 0.9)',
                        color: '#FFF',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                      }}
                    >
                      ✓ Live Camera Captured
                    </div>
                    <button
                      type="button"
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: '#EF4444',
                        color: '#FFF',
                        border: 'none',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                      }}
                      onClick={() => setExteriorPhotoUrl('')}
                      title="Remove & Retake"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{
                      height: '90px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      background: '#F8FAFC',
                      border: '1.5px dashed #0D9488',
                      color: '#0F766E',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={() => setActiveCameraTarget('exterior')}
                  >
                    <span style={{ fontSize: '1.3rem' }}>📷</span>
                    <span>Open Camera: Outside Photo</span>
                  </button>
                )}
              </div>

              {/* 2. Live Interior Facility Photo */}
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#7C3AED' }}>
                  🔬 Live Inside / Interior Facility Photo *
                </span>
                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                  Capture interior testing desk or sample collection room.
                </div>
                {interiorPhotoUrl ? (
                  <div style={{ position: 'relative', width: '100%', height: '110px', borderRadius: '6px', overflow: 'hidden' }}>
                    <img src={interiorPhotoUrl} alt="Live Interior" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '4px',
                        left: '4px',
                        background: 'rgba(124, 58, 237, 0.9)',
                        color: '#FFF',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                      }}
                    >
                      ✓ Live Camera Captured
                    </div>
                    <button
                      type="button"
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: '#EF4444',
                        color: '#FFF',
                        border: 'none',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                      }}
                      onClick={() => setInteriorPhotoUrl('')}
                      title="Remove & Retake"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{
                      height: '90px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      background: '#F8FAFC',
                      border: '1.5px dashed #7C3AED',
                      color: '#7C3AED',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={() => setActiveCameraTarget('interior')}
                  >
                    <span style={{ fontSize: '1.3rem' }}>📷</span>
                    <span>Open Camera: Inside Photo</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 1B: PHLEBOTOMIST LIVE SELFIE PHOTO (Browser Live Camera Only) */}
        {role === UserRole.PHLEBOTOMIST && (
          <div
            style={{
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.85rem', color: '#1D4ED8' }}>
                📸 Mandatory Live Phlebotomist Selfie (Browser Live Webcam / Camera Only)
              </strong>
              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                Capture live rider face portrait via webcam for rider identity verification. File upload is strictly disabled.
              </div>
            </div>

            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #DBEAFE',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              {livePhotoUrl ? (
                <div style={{ position: 'relative', width: '100px', height: '100px', borderRadius: '50%', overflow: 'hidden', border: '3px solid #1D4ED8' }}>
                  <img src={livePhotoUrl} alt="Live Phlebo Selfie" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    type="button"
                    style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      background: '#EF4444',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                    onClick={() => setLivePhotoUrl('')}
                    title="Remove & Retake"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '50%',
                    background: '#F1F5F9',
                    border: '2px dashed #93C5FD',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                    color: '#94A3B8',
                  }}
                >
                  👤
                </div>
              )}

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
                  {livePhotoUrl ? '✓ Live Camera Selfie Captured' : 'Take Live Camera Selfie'}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', marginBottom: '8px' }}>
                  Ensure proper lighting and face clearly centered in frame.
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  style={{
                    fontSize: '0.76rem',
                    padding: '6px 14px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onClick={() => setActiveCameraTarget('live')}
                >
                  <span>📷</span> {livePhotoUrl ? 'Retake Live Selfie' : 'Open Camera & Snap Selfie'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: REQUIRED DOCUMENTS UPLOAD (Trade License, GST, Aadhaar, PAN, etc.) */}
        {(role === UserRole.SMALL_LAB || role === UserRole.LARGE_LAB || role === UserRole.PHLEBOTOMIST) && (
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.85rem', color: '#1E293B' }}>
                📄 Required Regulatory &amp; KYC Documents Upload
              </strong>
              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                {role === UserRole.PHLEBOTOMIST
                  ? 'Attach Aadhaar Card, Driving License, DMLT Certificate, and PAN Card (PDF or Scan)'
                  : 'Attach Clinical Establishment Registration, Trade License, PCB NOC, NABL, GSTIN & PAN'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr auto', gap: '8px', alignItems: 'center' }}>
              <select
                className="form-select"
                style={{ fontSize: '0.78rem' }}
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value as LabDocumentRecord['type'])}
              >
                {docTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <input
                className="form-input"
                style={{ fontSize: '0.78rem' }}
                placeholder="Custom title / notes (optional)"
                value={docTitleInput}
                onChange={(e) => setDocTitleInput(e.target.value)}
              />

              <label
                className="btn-secondary"
                style={{
                  fontSize: '0.78rem',
                  padding: '7px 14px',
                  cursor: 'pointer',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                }}
              >
                {uploadingTarget === 'doc' ? '⏳ Uploading...' : '+ Attach File'}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleDocumentUpload(file);
                  }}
                />
              </label>
            </div>

            {/* Uploaded Documents List */}
            {uploadedDocs.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {uploadedDocs.map((docItem) => (
                  <span
                    key={docItem.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #BFDBFE',
                    }}
                  >
                    <span>📄 {docItem.title}</span>
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#EF4444',
                        cursor: 'pointer',
                        fontWeight: 900,
                        padding: 0,
                        fontSize: '0.75rem',
                      }}
                      onClick={() => setUploadedDocs((prev) => prev.filter((d) => d.id !== docItem.id))}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                No documents attached yet. Documents must be submitted and verified by Admin before approval.
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: PHLEBOTOMIST VEHICLE & REGULATORY KYC (DL, Vehicle, Aadhaar, PAN) */}
        {role === UserRole.PHLEBOTOMIST && (
          <div
            style={{
              background: '#F8FAFC',
              border: '1.5px solid #CBD5E1',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.2rem' }}>🚗</span>
              <div>
                <strong style={{ fontSize: '0.86rem', color: '#0F172A', display: 'block' }}>
                  Phlebotomist Transport &amp; Regulatory KYC
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                  Mandatory vehicle registration, driving license, Aadhaar and PAN verification documents
                </span>
              </div>
            </div>

            {/* Vehicle Type, Vehicle Number & Vehicle Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr', gap: '10px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.74rem' }}>Vehicle Type *</label>
                <select
                  className="form-select"
                  style={{ fontSize: '0.78rem' }}
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as 'BIKE' | 'SCOOTER' | 'EV_BIKE' | 'BICYCLE' | 'OTHER')}
                >
                  <option value="BIKE">Motorcycle / Bike</option>
                  <option value="SCOOTER">Scooter / Moped</option>
                  <option value="EV_BIKE">Electric Two-Wheeler (EV)</option>
                  <option value="BICYCLE">Bicycle</option>
                  <option value="OTHER">Other Transport</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.74rem' }}>Vehicle Reg. Number *</label>
                <input
                  className="form-input"
                  style={{ fontSize: '0.78rem', textTransform: 'uppercase' }}
                  placeholder="e.g. MH-02-EH-4921"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.74rem' }}>Vehicle Description / Make</label>
                <input
                  className="form-input"
                  style={{ fontSize: '0.78rem' }}
                  placeholder="e.g. Hero Splendor Plus / Honda Activa"
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                />
              </div>
            </div>

            {/* DL Number & DL Document Upload */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr auto', gap: '10px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.74rem' }}>Driving License (DL) Number *</label>
                <input
                  className="form-input"
                  style={{ fontSize: '0.78rem', textTransform: 'uppercase' }}
                  placeholder="e.g. MH02-20220012345"
                  value={dlNumber}
                  onChange={(e) => setDlNumber(e.target.value)}
                />
              </div>

              <div>
                <label
                  className="btn-secondary"
                  style={{
                    fontSize: '0.75rem',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: dlDocUrl ? '#ECFDF5' : '#FFFFFF',
                    borderColor: dlDocUrl ? '#10B981' : '#CBD5E1',
                    color: dlDocUrl ? '#047857' : '#334155',
                  }}
                >
                  <span>{dlDocUrl ? '✓ DL Attached' : '📄 Upload DL (PDF/Photo)'}</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleDirectDocUpload(f, 'DL');
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Vehicle RC Document Upload Slot */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.76rem', color: '#334155' }}>
                <strong>Vehicle RC Book / Smart Card Document</strong>
                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Registration certificate copy showing vehicle ownership</div>
              </div>
              <label
                className="btn-secondary"
                style={{
                  fontSize: '0.75rem',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  backgroundColor: rcDocUrl ? '#ECFDF5' : '#FFFFFF',
                  borderColor: rcDocUrl ? '#10B981' : '#CBD5E1',
                  color: rcDocUrl ? '#047857' : '#334155',
                }}
              >
                <span>{rcDocUrl ? '✓ RC Attached' : '📄 Upload RC'}</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleDirectDocUpload(f, 'RC');
                  }}
                />
              </label>
            </div>

            {/* Aadhaar Number & Aadhaar Document Upload */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr auto', gap: '10px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.74rem' }}>Aadhaar Card Number *</label>
                <input
                  className="form-input"
                  style={{ fontSize: '0.78rem' }}
                  placeholder="e.g. 5412-3489-0123"
                  maxLength={14}
                  value={aadhaarNumber}
                  onChange={(e) => setAadhaarNumber(e.target.value)}
                />
              </div>

              <div>
                <label
                  className="btn-secondary"
                  style={{
                    fontSize: '0.75rem',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: aadhaarDocUrl ? '#ECFDF5' : '#FFFFFF',
                    borderColor: aadhaarDocUrl ? '#10B981' : '#CBD5E1',
                    color: aadhaarDocUrl ? '#047857' : '#334155',
                  }}
                >
                  <span>{aadhaarDocUrl ? '✓ Aadhaar Attached' : '📄 Upload Aadhaar (Front/Back)'}</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleDirectDocUpload(f, 'AADHAAR');
                    }}
                  />
                </label>
              </div>
            </div>

            {/* PAN Card Number & PAN Document Upload */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr auto', gap: '10px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.74rem' }}>PAN Card Number *</label>
                <input
                  className="form-input"
                  style={{ fontSize: '0.78rem', textTransform: 'uppercase' }}
                  placeholder="e.g. ABCDE1234F"
                  maxLength={10}
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value)}
                />
              </div>

              <div>
                <label
                  className="btn-secondary"
                  style={{
                    fontSize: '0.75rem',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: panDocUrl ? '#ECFDF5' : '#FFFFFF',
                    borderColor: panDocUrl ? '#10B981' : '#CBD5E1',
                    color: panDocUrl ? '#047857' : '#334155',
                  }}
                >
                  <span>{panDocUrl ? '✓ PAN Attached' : '📄 Upload PAN Card'}</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleDirectDocUpload(f, 'PAN');
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: ROLE MASTER AGREEMENT (Template Download & Signed Document Upload) */}
        {(role === UserRole.PHLEBOTOMIST || role === UserRole.SMALL_LAB || role === UserRole.LARGE_LAB) && (
          <div
            style={{
              background: '#F0FDFA',
              border: '1px solid #99F6E4',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem', color: '#0F766E' }}>🤝</span>
                <div>
                  <strong style={{ fontSize: '0.86rem', color: '#0F766E', display: 'block' }}>
                    Role Master Agreement &amp; Signed Counterpart
                  </strong>
                  <span style={{ fontSize: '0.72rem', color: '#115E59' }}>
                    Download official template, acquire counterparty signature, and upload signed copy
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="btn-secondary"
                style={{
                  fontSize: '0.74rem',
                  padding: '6px 12px',
                  fontWeight: 700,
                  backgroundColor: '#FFFFFF',
                  borderColor: '#0D9488',
                  color: '#0F766E',
                }}
                onClick={() =>
                  handleDownloadAgreementTemplate(
                    role === UserRole.PHLEBOTOMIST
                      ? 'PHLEBOTOMIST'
                      : role === UserRole.LARGE_LAB
                      ? 'LARGE_LAB'
                      : 'SMALL_LAB'
                  )
                }
              >
                📥 Download Agreement Template (v2.1)
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr auto', gap: '10px', alignItems: 'flex-end', marginTop: '4px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.74rem' }}>Signer Full Name / Representative</label>
                <input
                  className="form-input"
                  style={{ fontSize: '0.78rem' }}
                  placeholder="e.g. Vikas Yadav / Lab Director"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                />
              </div>

              <div>
                <label
                  className="btn-secondary"
                  style={{
                    fontSize: '0.75rem',
                    padding: '8px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: signedAgreementUrl ? '#ECFDF5' : '#FFFFFF',
                    borderColor: signedAgreementUrl ? '#10B981' : '#0D9488',
                    color: signedAgreementUrl ? '#047857' : '#0F766E',
                    fontWeight: 700,
                  }}
                >
                  <span>{signedAgreementUrl ? '✓ Signed Agreement Uploaded' : '📄 Upload Signed Agreement (PDF/Scan)'}</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleDirectDocUpload(f, 'AGREEMENT');
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Password Setup */}
        <div
          style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '12px 14px',
            marginTop: '4px',
            marginBottom: '12px',
          }}
        >
          <label className="form-label" style={{ marginBottom: '6px' }}>
            Initial Sign-In Password (Stored Safely in Auth Vault)
          </label>
          <PasswordInputWithGenerator
            value={password}
            onChange={setPassword}
            showPassword={showPassword}
            onToggleShow={() => setShowPassword((v) => !v)}
            placeholder="Min 6 chars (leave empty for Google / Email OTP sign-in)"
          />
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '5px' }}>
            Passwords are encrypted in the secure authentication vault — credentials email will be sent automatically when Admin verifies this account.
          </div>
        </div>

        <div className="modal-footer" style={{ padding: 0, borderTop: 'none' }}>
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Submit for Admin Verification'}
          </button>
        </div>
      </form>

      {/* Dedicated Live Camera Stream Modal */}
      <LiveCameraCaptureModal
        open={activeCameraTarget !== null}
        title={
          activeCameraTarget === 'exterior'
            ? 'Live Camera: Front Exterior Signboard Photo'
            : activeCameraTarget === 'interior'
            ? 'Live Camera: Interior Facility Photo'
            : 'Live Camera: Phlebotomist Live Selfie'
        }
        description={
          activeCameraTarget === 'exterior'
            ? 'Step outside the entrance and capture a live photo of the building facade with signboard.'
            : activeCameraTarget === 'interior'
            ? 'Capture a live photo inside the testing facility or sample collection counter.'
            : 'Hold device in front of your face and take a clear, well-lit live selfie.'
        }
        facingModeDefault={activeCameraTarget === 'live' ? 'user' : 'environment'}
        guideType={activeCameraTarget === 'live' ? 'face' : activeCameraTarget === 'exterior' ? 'facade' : 'facility'}
        onClose={() => setActiveCameraTarget(null)}
        onCapture={handleCameraCapture}
        uploading={uploadingTarget !== null}
      />
    </ModalFrame>
  );
}
