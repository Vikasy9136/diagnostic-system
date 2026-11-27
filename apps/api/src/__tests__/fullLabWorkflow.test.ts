process.env.FORCE_FIREBASE_MOCK = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OrderPriority,
  OrderStatus,
  type PickupOrder,
  SpecimenQualityStatus,
  SpecimenType,
  StorageTemperature,
  TubeType,
  UserRole,
} from '@diagnostic/shared';
import {
  discoverApprovedLargeLabOfferings,
  generateHandoverOtp,
  getAuthorizedReportDownload,
  listCollectionCentres,
  resetLabWorkflowTestStores,
  saveCollectionCentre,
  seedLabForWorkflowTest,
  seedOrderForWorkflowTest,
  setCatalogueApprovalByAdmin,
  transitionOrderProcessingStatus,
  uploadTestOrCombinedReport,
  upsertLargeLabTestOrPackage,
  verifyHandoverOtp,
} from '../services/labWorkflow.service';

const SAMPLE_PDF_B64 = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
).toString('base64');

function seedBaseLabs() {
  const ts = new Date().toISOString();
  seedLabForWorkflowTest({
    id: 'LAB-LG-ALPHA',
    name: 'Alpha Reference Diagnostics',
    type: 'LARGE_LAB',
    city: 'Mumbai',
    address: 'Andheri West, Mumbai',
    pincode: '400053',
    latitude: 19.136,
    longitude: 72.829,
    email: 'alpha@labsetu.in',
    phone: '+919800000001',
    verified: true,
    verificationStatus: 'VERIFIED',
    rating: 4.9,
    createdAt: ts,
    updatedAt: ts,
  });

  seedLabForWorkflowTest({
    id: 'LAB-LG-BETA',
    name: 'Beta Diagnostics Hub',
    type: 'LARGE_LAB',
    city: 'Mumbai',
    address: 'Dadar, Mumbai',
    pincode: '400014',
    latitude: 19.017,
    longitude: 72.847,
    email: 'beta@labsetu.in',
    phone: '+919800000002',
    verified: true,
    verificationStatus: 'VERIFIED',
    rating: 4.6,
    createdAt: ts,
    updatedAt: ts,
  });

  seedLabForWorkflowTest({
    id: 'LAB-LG-INACTIVE',
    name: 'Suspended Reference Lab',
    type: 'LARGE_LAB',
    city: 'Mumbai',
    address: 'Thane',
    pincode: '400601',
    latitude: 19.218,
    longitude: 72.978,
    email: 'inactive@labsetu.in',
    phone: '+919800000003',
    verified: false,
    verificationStatus: 'REJECTED',
    rating: 4.0,
    createdAt: ts,
    updatedAt: ts,
  });
}

test('E2E Full Lab Workflow: Catalogue, Discovery, Centres, Handover OTP, Processing & Test-Wise/Combined Reports', async () => {
  resetLabWorkflowTestStores();
  seedBaseLabs();

  // 1-2. Large Lab creates individual tests & multi-test package
  const cbcAlpha = await upsertLargeLabTestOrPackage({
    largeLabId: 'LAB-LG-ALPHA',
    largeLabName: 'Alpha Reference Diagnostics',
    item: {
      code: 'CBC',
      name: 'Complete Blood Count',
      itemType: 'TEST',
      department: 'Hematology',
      specimenType: SpecimenType.BLOOD,
      tubeType: TubeType.EDTA_LAVENDER,
      temperatureRequirement: StorageTemperature.REFRIGERATED,
      tatHours: 4,
      b2bPriceInr: 180,
      mrpInr: 350,
    },
  });

  const tshAlpha = await upsertLargeLabTestOrPackage({
    largeLabId: 'LAB-LG-ALPHA',
    largeLabName: 'Alpha Reference Diagnostics',
    item: {
      code: 'TSH',
      name: 'Thyroid Stimulating Hormone',
      itemType: 'TEST',
      department: 'Biochemistry',
      specimenType: SpecimenType.SERUM,
      tubeType: TubeType.SERUM_RED_GOLD,
      temperatureRequirement: StorageTemperature.REFRIGERATED,
      tatHours: 6,
      b2bPriceInr: 220,
      mrpInr: 450,
    },
  });

  const pkgAlpha = await upsertLargeLabTestOrPackage({
    largeLabId: 'LAB-LG-ALPHA',
    largeLabName: 'Alpha Reference Diagnostics',
    item: {
      code: 'WELL-BASIC',
      name: 'Basic Wellness Combo (CBC + TSH)',
      itemType: 'PACKAGE',
      includedTestIds: [cbcAlpha.id, tshAlpha.id],
      includedTestCodes: ['CBC', 'TSH'],
      department: 'Preventive Health',
      specimenType: SpecimenType.BLOOD,
      tubeType: TubeType.EDTA_LAVENDER,
      temperatureRequirement: StorageTemperature.REFRIGERATED,
      tatHours: 6,
      b2bPriceInr: 340,
      mrpInr: 800,
    },
  });

  // Lower-priced Beta CBC to test lowest-price sorting
  const cbcBeta = await upsertLargeLabTestOrPackage({
    largeLabId: 'LAB-LG-BETA',
    largeLabName: 'Beta Diagnostics Hub',
    item: {
      code: 'CBC',
      name: 'Complete Blood Count',
      itemType: 'TEST',
      department: 'Hematology',
      specimenType: SpecimenType.BLOOD,
      tubeType: TubeType.EDTA_LAVENDER,
      temperatureRequirement: StorageTemperature.REFRIGERATED,
      tatHours: 5,
      b2bPriceInr: 140,
      mrpInr: 320,
    },
  });

  // Inactive test & inactive Large Lab test (must NOT appear in discovery)
  await upsertLargeLabTestOrPackage({
    largeLabId: 'LAB-LG-ALPHA',
    largeLabName: 'Alpha Reference Diagnostics',
    item: {
      code: 'PAUSED-TEST',
      name: 'Paused Special Assay',
      itemType: 'TEST',
      department: 'Molecular',
      tatHours: 24,
      b2bPriceInr: 99,
      mrpInr: 500,
      isActive: false,
      isAvailable: false,
    },
  });

  await upsertLargeLabTestOrPackage({
    largeLabId: 'LAB-LG-INACTIVE',
    largeLabName: 'Suspended Reference Lab',
    item: {
      code: 'CBC',
      name: 'Complete Blood Count',
      itemType: 'TEST',
      department: 'Hematology',
      tatHours: 3,
      b2bPriceInr: 50,
      mrpInr: 200,
    },
  });

  // Admin approves active tests/packages
  await setCatalogueApprovalByAdmin({ itemId: cbcAlpha.id, approvalStatus: 'APPROVED', actorUid: 'ADMIN-1' });
  await setCatalogueApprovalByAdmin({ itemId: tshAlpha.id, approvalStatus: 'APPROVED', actorUid: 'ADMIN-1' });
  await setCatalogueApprovalByAdmin({ itemId: pkgAlpha.id, approvalStatus: 'APPROVED', actorUid: 'ADMIN-1' });
  await setCatalogueApprovalByAdmin({ itemId: cbcBeta.id, approvalStatus: 'APPROVED', actorUid: 'ADMIN-1' });

  // 3. Discovery + Lowest Price Sorting + Filtering
  const cbcDiscovery = await discoverApprovedLargeLabOfferings({
    q: 'CBC',
    itemType: 'TEST',
    sortBy: 'LOWEST_PRICE',
  });
  assert.equal(cbcDiscovery.items.length, 2, 'Inactive lab and paused test must be excluded');
  assert.equal(cbcDiscovery.items[0].labId, 'LAB-LG-BETA');
  assert.equal(cbcDiscovery.items[0].b2bPriceInr, 140);
  assert.equal(cbcDiscovery.items[1].labId, 'LAB-LG-ALPHA');
  assert.equal(cbcDiscovery.items[1].b2bPriceInr, 180);

  // 4. Collection Centre Management
  const centre = await saveCollectionCentre({
    largeLabId: 'LAB-LG-ALPHA',
    centre: {
      name: 'Andheri West Drop Desk',
      address: 'Link Road, Andheri West',
      city: 'Mumbai',
      pincode: '400053',
      contactPersonName: 'Dr. Meera',
      contactPhone: '+919820012345',
      operatingHours: '07:00 AM - 09:00 PM',
      isAvailable: true,
    },
  });
  const centres = await listCollectionCentres('LAB-LG-ALPHA');
  assert.equal(centres.length, 1);
  assert.equal(centres[0].contactPersonName, 'Dr. Meera');

  // 5. Seed Booking Order (Small Lab -> Alpha Lab, 2 tests: CBC & TSH)
  const now = new Date().toISOString();
  const order: PickupOrder = {
    id: 'BK-TEST-101',
    orderNumber: 'BK-TEST-101',
    smallLabId: 'LAB-SM-001',
    smallLabName: 'City Collection Point',
    targetLabId: 'LAB-LG-ALPHA',
    targetLabName: 'Alpha Reference Diagnostics',
    selectedCentreId: centre.id,
    selectedCentreName: centre.name,
    phlebotomistId: 'PHL-101',
    phlebotomistName: 'Ramesh Phlebo',
    status: OrderStatus.IN_TRANSIT,
    priority: OrderPriority.ROUTINE,
    patient: {
      id: 'PAT-101',
      pseudonym: 'PT-101',
      age: 34,
      gender: 'FEMALE',
    },
    specimens: [
      {
        id: 'SP-1',
        testCode: 'CBC',
        testName: 'Complete Blood Count',
        specimenType: SpecimenType.BLOOD,
        tubeType: TubeType.EDTA_LAVENDER,
        barcode: 'BC-101-A',
        temperatureRequirement: StorageTemperature.REFRIGERATED,
        qualityStatus: SpecimenQualityStatus.INTACT,
      },
      {
        id: 'SP-2',
        testCode: 'TSH',
        testName: 'Thyroid Stimulating Hormone',
        specimenType: SpecimenType.SERUM,
        tubeType: TubeType.SERUM_RED_GOLD,
        barcode: 'BC-101-B',
        temperatureRequirement: StorageTemperature.REFRIGERATED,
        qualityStatus: SpecimenQualityStatus.INTACT,
      },
    ],
    bookingTestItems: [
      { testId: 'CBC', testCode: 'CBC', testName: 'Complete Blood Count', priceInr: 180, reportStatus: 'PENDING', updatedAt: now },
      { testId: 'TSH', testCode: 'TSH', testName: 'Thyroid Stimulating Hormone', priceInr: 220, reportStatus: 'PENDING', updatedAt: now },
    ],
    custodyHistory: [],
    pickupLocation: { address: 'Malad', latitude: 19.18, longitude: 72.84 },
    deliveryLocation: { address: 'Andheri West', latitude: 19.136, longitude: 72.829 },
    scheduledPickupAt: now,
    createdAt: now,
    updatedAt: now,
  };
  seedOrderForWorkflowTest(order);

  // 6. Phlebo generates server-side Handover OTP
  const otpRes = await generateHandoverOtp({
    orderId: order.id,
    phleboId: 'PHL-101',
    ttlMinutes: 10,
    maxAttempts: 3,
  });
  assert.ok(otpRes.otpForNotificationOnly && otpRes.otpForNotificationOnly.length === 6);

  // Negative: wrong centre handover rejected
  await assert.rejects(
    () =>
      verifyHandoverOtp({
        orderId: order.id,
        phleboId: 'PHL-101',
        otp: otpRes.otpForNotificationOnly!,
        centreId: 'WRONG-CENTRE',
        temperatureCelsius: 4.5,
      }),
    /WRONG_CENTRE|wrong/i
  );

  // Negative: invalid OTP rejected
  await assert.rejects(
    () =>
      verifyHandoverOtp({
        orderId: order.id,
        phleboId: 'PHL-101',
        otp: '000000',
        centreId: centre.id,
        temperatureCelsius: 4.5,
      }),
    /Invalid Handover OTP/i
  );

  // Negative: expired OTP rejected
  await assert.rejects(
    () =>
      verifyHandoverOtp({
        orderId: order.id,
        phleboId: 'PHL-101',
        otp: otpRes.otpForNotificationOnly!,
        centreId: centre.id,
        temperatureCelsius: 4.5,
        nowMs: Date.now() + 20 * 60 * 1000,
      }),
    /expired/i
  );

  // Valid Handover OTP verification succeeds
  const handedOverOrder = await verifyHandoverOtp({
    orderId: order.id,
    phleboId: 'PHL-101',
    otp: otpRes.otpForNotificationOnly!,
    centreId: centre.id,
    receiverId: 'STAFF-MEERA',
    temperatureCelsius: 4.2,
    remarks: 'Cold box intact',
  });
  assert.equal(handedOverOrder.status, OrderStatus.SAMPLE_RECEIVED_AT_CENTRE);
  assert.ok(handedOverOrder.handoverVerifiedAt);

  // Negative: repeated OTP (anti-replay) rejected
  await assert.rejects(
    () =>
      verifyHandoverOtp({
        orderId: order.id,
        phleboId: 'PHL-101',
        otp: otpRes.otpForNotificationOnly!,
        centreId: centre.id,
      }),
    /already/i
  );

  // 7. Sample Processing Status Transitions
  const inLab = await transitionOrderProcessingStatus({
    orderId: order.id,
    nextStatus: OrderStatus.SAMPLE_IN_LAB,
    actorUid: 'LG-OP-1',
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-ALPHA',
  });
  assert.equal(inLab.status, OrderStatus.SAMPLE_IN_LAB);

  // Negative: unauthorized Small Lab cannot update processing status
  await assert.rejects(
    () =>
      transitionOrderProcessingStatus({
        orderId: order.id,
        nextStatus: OrderStatus.UNDER_ANALYSIS,
        actorUid: 'SM-OP-1',
        actorRole: UserRole.SMALL_LAB,
        actorLabId: 'LAB-SM-001',
      }),
    /Unauthorized/i
  );

  // Negative: Recollection / Rejection requires remarks
  await assert.rejects(
    () =>
      transitionOrderProcessingStatus({
        orderId: order.id,
        nextStatus: OrderStatus.RECOLLECTION_REQUIRED,
        actorUid: 'LG-OP-1',
        actorRole: UserRole.LARGE_LAB,
        actorLabId: 'LAB-LG-ALPHA',
      }),
    /remarks/i
  );

  await transitionOrderProcessingStatus({
    orderId: order.id,
    nextStatus: OrderStatus.UNDER_ANALYSIS,
    actorUid: 'LG-OP-1',
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-ALPHA',
  });
  await transitionOrderProcessingStatus({
    orderId: order.id,
    nextStatus: OrderStatus.PROCESSING_COMPLETED,
    actorUid: 'LG-OP-1',
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-ALPHA',
  });

  // 8. Individual Test-Wise Report Upload (ONLY CBC uploaded -> TSH still PENDING, order NOT completed)
  const cbcUpload = await uploadTestOrCombinedReport({
    orderId: order.id,
    actorUid: 'PATH-1',
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-ALPHA',
    reportType: 'INDIVIDUAL',
    coveredTestIds: ['CBC'],
    pathologistName: 'Dr. Anand MD',
    authoriseNow: true,
    fileName: 'cbc-report.pdf',
    mimeType: 'application/pdf',
    base64Data: SAMPLE_PDF_B64,
  });
  assert.equal(cbcUpload.report.coveredTestIds?.length, 1);
  assert.equal(cbcUpload.order.bookingTestItems?.[0].reportStatus, 'AVAILABLE_TO_SMALL_LAB');
  assert.equal(cbcUpload.order.bookingTestItems?.[1].reportStatus, 'PENDING');
  assert.notEqual(cbcUpload.order.status, OrderStatus.COMPLETED);

  // 9. Second Individual Report Upload (TSH) -> all tests uploaded -> order moves to REPORT_AVAILABLE_TO_SMALL_LAB
  const tshUpload = await uploadTestOrCombinedReport({
    orderId: order.id,
    actorUid: 'PATH-1',
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-ALPHA',
    reportType: 'INDIVIDUAL',
    coveredTestIds: ['TSH'],
    pathologistName: 'Dr. Anand MD',
    authoriseNow: true,
    fileName: 'tsh-report.pdf',
    mimeType: 'application/pdf',
    base64Data: SAMPLE_PDF_B64,
  });
  assert.equal(tshUpload.order.bookingTestItems?.[1].reportStatus, 'AVAILABLE_TO_SMALL_LAB');
  assert.equal(tshUpload.order.status, OrderStatus.REPORT_AVAILABLE_TO_SMALL_LAB);

  // 10. Authorized Report Download vs Unauthorized Access
  const smDownload = await getAuthorizedReportDownload({
    reportId: cbcUpload.report.id,
    actorUid: 'SM-OP-1',
    actorRole: UserRole.SMALL_LAB,
    actorLabId: 'LAB-SM-001',
  });
  assert.ok(smDownload.dataUrl?.startsWith('data:application/pdf;base64,'));

  // Negative: Phlebo cannot download medical report
  await assert.rejects(
    () =>
      getAuthorizedReportDownload({
        reportId: cbcUpload.report.id,
        actorUid: 'PHL-101',
        actorRole: UserRole.PHLEBOTOMIST,
      }),
    /not permitted/i
  );

  // Negative: Wrong Small Lab cannot download report
  await assert.rejects(
    () =>
      getAuthorizedReportDownload({
        reportId: cbcUpload.report.id,
        actorUid: 'SM-OTHER',
        actorRole: UserRole.SMALL_LAB,
        actorLabId: 'LAB-SM-999',
      }),
    /another Small Lab/i
  );
});

test('Negative Validations: Duplicate Package Tests, Invalid Pricing, Max OTP Attempts', async () => {
  resetLabWorkflowTestStores();
  seedBaseLabs();

  // Duplicate tests inside package rejected
  await assert.rejects(
    () =>
      upsertLargeLabTestOrPackage({
        largeLabId: 'LAB-LG-ALPHA',
        largeLabName: 'Alpha Reference Diagnostics',
        item: {
          code: 'DUP-PKG',
          name: 'Duplicate Test Package',
          itemType: 'PACKAGE',
          includedTestIds: ['TST-1', 'TST-1'],
          includedTestCodes: ['CBC', 'CBC'],
          tatHours: 6,
          b2bPriceInr: 200,
          mrpInr: 400,
        },
      }),
    /duplicate/i
  );

  // Invalid price (b2bPriceInr <= 0) rejected
  await assert.rejects(
    () =>
      upsertLargeLabTestOrPackage({
        largeLabId: 'LAB-LG-ALPHA',
        largeLabName: 'Alpha Reference Diagnostics',
        item: {
          code: 'ZERO-TEST',
          name: 'Free Test',
          itemType: 'TEST',
          tatHours: 6,
          b2bPriceInr: 0,
          mrpInr: 100,
        },
      }),
    /greater than 0/i
  );

  // Max OTP attempts lock
  const now = new Date().toISOString();
  seedOrderForWorkflowTest({
    id: 'BK-LOCK-1',
    orderNumber: 'BK-LOCK-1',
    smallLabId: 'LAB-SM-001',
    smallLabName: 'City Collection Point',
    targetLabId: 'LAB-LG-ALPHA',
    targetLabName: 'Alpha Reference Diagnostics',
    selectedCentreId: 'CENTRE-1',
    phlebotomistId: 'PHL-202',
    status: OrderStatus.IN_TRANSIT,
    priority: OrderPriority.ROUTINE,
    patient: { id: 'PAT-LOCK', pseudonym: 'PT-LOCK', age: 40, gender: 'MALE' },
    specimens: [],
    custodyHistory: [],
    pickupLocation: { address: 'Malad', latitude: 19.18, longitude: 72.84 },
    deliveryLocation: { address: 'Andheri', latitude: 19.136, longitude: 72.829 },
    scheduledPickupAt: now,
    createdAt: now,
    updatedAt: now,
  });

  await generateHandoverOtp({
    orderId: 'BK-LOCK-1',
    phleboId: 'PHL-202',
    maxAttempts: 2,
  });

  await assert.rejects(() =>
    verifyHandoverOtp({ orderId: 'BK-LOCK-1', phleboId: 'PHL-202', otp: '111111', centreId: 'CENTRE-1' })
  );
  await assert.rejects(() =>
    verifyHandoverOtp({ orderId: 'BK-LOCK-1', phleboId: 'PHL-202', otp: '222222', centreId: 'CENTRE-1' })
  );
  await assert.rejects(
    () =>
      verifyHandoverOtp({ orderId: 'BK-LOCK-1', phleboId: 'PHL-202', otp: '333333', centreId: 'CENTRE-1' }),
    /Maximum OTP/i
  );
});
