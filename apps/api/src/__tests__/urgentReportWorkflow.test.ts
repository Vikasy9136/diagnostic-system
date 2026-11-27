process.env.FORCE_FIREBASE_MOCK = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LabVerificationStatus,
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
  resetLabWorkflowTestStores,
  seedLabForWorkflowTest,
  seedOrderForWorkflowTest,
  uploadTestOrCombinedReport,
} from '../services/labWorkflow.service';
import {
  checkAndFlagDelayedUrgentRequests,
  createUrgentReportRequest,
  getSeededOrderForUrgentTest,
  listUrgentReportRequests,
  resetUrgentReportTestStores,
  respondToUrgentRequest,
  seedOrderForUrgentTest,
  submitUrgentClarification,
} from '../services/urgentReport.service';

const SAMPLE_PDF_B64 = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
).toString('base64');

function createFiveTestOrder(): PickupOrder {
  const now = new Date().toISOString();
  return {
    id: 'LS-2026-00125',
    orderNumber: 'LS-2026-00125',
    smallLabId: 'LAB-SM-100',
    smallLabName: 'Care Point Diagnostics',
    targetLabId: 'LAB-LG-200',
    targetLabName: 'Apex Central Reference Lab',
    status: OrderStatus.UNDER_ANALYSIS,
    priority: OrderPriority.ROUTINE,
    department: 'Biochemistry',
    patient: {
      id: 'PAT-500',
      pseudonym: 'PT-500',
      age: 42,
      gender: 'FEMALE',
    },
    specimens: [
      { id: 'SP-1', testCode: 'CBC', testName: 'CBC', specimenType: SpecimenType.BLOOD, tubeType: TubeType.EDTA_LAVENDER, barcode: 'B1', temperatureRequirement: StorageTemperature.REFRIGERATED, qualityStatus: SpecimenQualityStatus.INTACT },
      { id: 'SP-2', testCode: 'LFT', testName: 'LFT', specimenType: SpecimenType.SERUM, tubeType: TubeType.SERUM_RED_GOLD, barcode: 'B2', temperatureRequirement: StorageTemperature.REFRIGERATED, qualityStatus: SpecimenQualityStatus.INTACT },
      { id: 'SP-3', testCode: 'KFT', testName: 'KFT', specimenType: SpecimenType.SERUM, tubeType: TubeType.SERUM_RED_GOLD, barcode: 'B3', temperatureRequirement: StorageTemperature.REFRIGERATED, qualityStatus: SpecimenQualityStatus.INTACT },
      { id: 'SP-4', testCode: 'TSH', testName: 'Thyroid Profile', specimenType: SpecimenType.SERUM, tubeType: TubeType.SERUM_RED_GOLD, barcode: 'B4', temperatureRequirement: StorageTemperature.REFRIGERATED, qualityStatus: SpecimenQualityStatus.INTACT },
      { id: 'SP-5', testCode: 'VITD', testName: 'Vitamin D', specimenType: SpecimenType.SERUM, tubeType: TubeType.SERUM_RED_GOLD, barcode: 'B5', temperatureRequirement: StorageTemperature.REFRIGERATED, qualityStatus: SpecimenQualityStatus.INTACT },
    ],
    bookingTestItems: [
      { testId: 'CBC', testCode: 'CBC', testName: 'CBC', priceInr: 150, reportStatus: 'PENDING', updatedAt: now },
      { testId: 'LFT', testCode: 'LFT', testName: 'LFT', priceInr: 300, reportStatus: 'PROCESSING', updatedAt: now },
      { testId: 'KFT', testCode: 'KFT', testName: 'KFT', priceInr: 280, reportStatus: 'PENDING', updatedAt: now },
      { testId: 'TSH', testCode: 'TSH', testName: 'Thyroid Profile', priceInr: 250, reportStatus: 'PENDING', updatedAt: now },
      { testId: 'VITD', testCode: 'VITD', testName: 'Vitamin D', priceInr: 600, reportStatus: 'PROCESSING', updatedAt: now },
    ],
    custodyHistory: [],
    pickupLocation: { address: 'Andheri', latitude: 19.13, longitude: 72.83 },
    deliveryLocation: { address: 'Dadar', latitude: 19.01, longitude: 72.84 },
    scheduledPickupAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

test('E2E Urgent Test Report Request: 5 tests, 2 available, urgent LFT accepted & completed, urgent Vitamin D rejected, Admin audit', async () => {
  resetLabWorkflowTestStores();
  resetUrgentReportTestStores();

  const ts = new Date().toISOString();
  seedLabForWorkflowTest({
    id: 'LAB-LG-200',
    name: 'Apex Central Reference Lab',
    type: 'LARGE_LAB',
    city: 'Mumbai',
    address: 'Dadar',
    email: 'apex@labsetu.in',
    verified: true,
    verificationStatus: 'VERIFIED' as LabVerificationStatus,
    createdAt: ts,
    updatedAt: ts,
  });

  // 1-4. Seed 5-test booking & publish CBC and KFT reports first
  const order = createFiveTestOrder();
  seedOrderForWorkflowTest(order);
  seedOrderForUrgentTest(order);

  const partial = await uploadTestOrCombinedReport({
    orderId: order.id,
    actorUid: 'PATH-1',
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-200',
    reportType: 'COMBINED',
    coveredTestIds: ['CBC', 'KFT'],
    pathologistName: 'Dr. Rao MD',
    authoriseNow: true,
    fileName: 'cbc-kft.pdf',
    mimeType: 'application/pdf',
    base64Data: SAMPLE_PDF_B64,
  });
  // Sync updated order into urgent test store
  seedOrderForUrgentTest(partial.order);

  // Negative: Urgent request for already available report (CBC) must fail
  const futureDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  await assert.rejects(
    () =>
      createUrgentReportRequest({
        orderId: order.id,
        testId: 'CBC',
        actorUid: 'SM-1',
        actorRole: UserRole.SMALL_LAB,
        actorLabId: 'LAB-SM-100',
        reason: 'Need CBC fast',
        requestedDeadline: futureDeadline,
      }),
    /already authorised and available/i
  );

  // 5. Small Lab requests urgent reports for ONLY LFT and Vitamin D
  const lftReq = await createUrgentReportRequest({
    orderId: order.id,
    testId: 'LFT',
    actorUid: 'SM-1',
    actorRole: UserRole.SMALL_LAB,
    actorLabId: 'LAB-SM-100',
    requestedPriority: 'CRITICAL',
    reason: 'Pre-op anesthesia clearance',
    requestedDeadline: futureDeadline,
  });
  const vitdReq = await createUrgentReportRequest({
    orderId: order.id,
    testId: 'VITD',
    actorUid: 'SM-1',
    actorRole: UserRole.SMALL_LAB,
    actorLabId: 'LAB-SM-100',
    requestedPriority: 'URGENT',
    reason: 'Doctor review at 6 PM',
    requestedDeadline: futureDeadline,
  });

  // Verify booking itself did NOT become urgent, and Thyroid Profile stays NORMAL
  const afterReqOrder = getSeededOrderForUrgentTest(order.id)!;
  assert.equal(afterReqOrder.priority, OrderPriority.ROUTINE);
  assert.equal(afterReqOrder.bookingTestItems?.find((t) => t.testId === 'TSH')?.urgentPriorityStatus, undefined);

  // 6. Large Lab receives both requests
  const lgList = await listUrgentReportRequests({
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-200',
  });
  assert.equal(lgList.length, 2);

  // 7. Large Lab accepts LFT and rejects Vitamin D with a reason
  const committedAt = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  const lftAccepted = await respondToUrgentRequest({
    requestId: lftReq.id,
    action: 'ACCEPT',
    actorUid: 'LG-1',
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-200',
    expectedCompletionAt: committedAt,
    assignedTeamOrCentre: 'STAT Biochemistry',
  });
  assert.equal(lftAccepted.status, 'URGENT_ACCEPTED');

  const vitdRejected = await respondToUrgentRequest({
    requestId: vitdReq.id,
    action: 'REJECT',
    actorUid: 'LG-1',
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-200',
    reason: 'Immunoassay batch runs once at 7 PM',
  });
  assert.equal(vitdRejected.status, 'URGENT_REJECTED');

  // 8-9. LFT enters urgent processing (status separate from report completion)
  const lftInProg = await respondToUrgentRequest({
    requestId: lftReq.id,
    action: 'START_PROCESSING',
    actorUid: 'LG-1',
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-200',
  });
  assert.equal(lftInProg.status, 'URGENT_IN_PROGRESS');

  // Sync latest order into labWorkflow store before publishing LFT
  seedOrderForWorkflowTest(getSeededOrderForUrgentTest(order.id)!);

  // 10-12. LFT report becomes authorised & immediately available -> LFT urgent request becomes URGENT_COMPLETED
  const lftReportRes = await uploadTestOrCombinedReport({
    orderId: order.id,
    actorUid: 'PATH-1',
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-200',
    reportType: 'INDIVIDUAL',
    coveredTestIds: ['LFT'],
    pathologistName: 'Dr. Rao MD',
    authoriseNow: true,
    fileName: 'lft.pdf',
    mimeType: 'application/pdf',
    base64Data: SAMPLE_PDF_B64,
  });

  // Booking is NOT completed yet because TSH and VITD are still pending
  assert.notEqual(lftReportRes.order.status, OrderStatus.COMPLETED);
  assert.notEqual(lftReportRes.order.status, OrderStatus.REPORT_AVAILABLE_TO_SMALL_LAB);
  assert.equal(lftReportRes.order.bookingTestItems?.find((t) => t.testId === 'LFT')?.reportStatus, 'AVAILABLE_TO_SMALL_LAB');
  assert.equal(lftReportRes.order.bookingTestItems?.find((t) => t.testId === 'LFT')?.urgentPriorityStatus, 'URGENT_COMPLETED');
  assert.equal(lftReportRes.order.bookingTestItems?.find((t) => t.testId === 'VITD')?.urgentPriorityStatus, 'URGENT_REJECTED');

  // 15. Admin sees complete urgent request history
  const adminList = await listUrgentReportRequests({ actorRole: UserRole.ADMIN });
  assert.equal(adminList.length, 2);
  const adminLft = adminList.find((r) => r.id === lftReq.id)!;
  assert.equal(adminLft.status, 'URGENT_COMPLETED');
  assert.ok(adminLft.history.length >= 4);
});

test('Urgent Report Negative & Edge Cases: Duplicates, Unauthorised Actors, Expired Deadline, Delay Detection, Clarification, Deadline Update', async () => {
  resetLabWorkflowTestStores();
  resetUrgentReportTestStores();

  const order = createFiveTestOrder();
  seedOrderForUrgentTest(order);

  const futureDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  // Expired / unrealistic deadline rejected
  await assert.rejects(
    () =>
      createUrgentReportRequest({
        orderId: order.id,
        testId: 'LFT',
        actorUid: 'SM-1',
        actorRole: UserRole.SMALL_LAB,
        actorLabId: 'LAB-SM-100',
        reason: 'Past deadline',
        requestedDeadline: new Date(Date.now() - 60000).toISOString(),
      }),
    /at least 15 minutes/i
  );

  // Unauthorised Small Lab cannot request urgency
  await assert.rejects(
    () =>
      createUrgentReportRequest({
        orderId: order.id,
        testId: 'LFT',
        actorUid: 'SM-OTHER',
        actorRole: UserRole.SMALL_LAB,
        actorLabId: 'LAB-SM-999',
        reason: 'Wrong owner',
        requestedDeadline: futureDeadline,
      }),
    /do not own/i
  );

  const req = await createUrgentReportRequest({
    orderId: order.id,
    testId: 'LFT',
    actorUid: 'SM-1',
    actorRole: UserRole.SMALL_LAB,
    actorLabId: 'LAB-SM-100',
    reason: 'Urgent clinical need',
    requestedDeadline: futureDeadline,
  });

  // Duplicate active urgent request rejected
  await assert.rejects(
    () =>
      createUrgentReportRequest({
        orderId: order.id,
        testId: 'LFT',
        actorUid: 'SM-1',
        actorRole: UserRole.SMALL_LAB,
        actorLabId: 'LAB-SM-100',
        reason: 'Duplicate request',
        requestedDeadline: futureDeadline,
      }),
    /already exists/i
  );

  // Unauthorised Large Lab cannot accept/reject
  await assert.rejects(
    () =>
      respondToUrgentRequest({
        requestId: req.id,
        action: 'ACCEPT',
        actorUid: 'LG-OTHER',
        actorRole: UserRole.LARGE_LAB,
        actorLabId: 'LAB-LG-999',
        expectedCompletionAt: futureDeadline,
      }),
    /not assigned/i
  );

  // Clarification flow
  await respondToUrgentRequest({
    requestId: req.id,
    action: 'REQUEST_CLARIFICATION',
    actorUid: 'LG-1',
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-200',
    reason: 'Confirm fasting status?',
  });
  const clarified = await submitUrgentClarification({
    requestId: req.id,
    actorUid: 'SM-1',
    actorRole: UserRole.SMALL_LAB,
    actorLabId: 'LAB-SM-100',
    clarificationResponse: 'Yes, 10-hour fasting sample.',
  });
  assert.equal(clarified.clarificationResponse, 'Yes, 10-hour fasting sample.');

  // Accept & test Delay Detection + Deadline Update with mandatory reason
  const committedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await respondToUrgentRequest({
    requestId: req.id,
    action: 'ACCEPT',
    actorUid: 'LG-1',
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-200',
    expectedCompletionAt: committedAt,
  });

  const delayed = await checkAndFlagDelayedUrgentRequests(Date.now() + 3 * 60 * 60 * 1000);
  assert.equal(delayed.length, 1);
  assert.equal(delayed[0].status, 'URGENT_DELAYED');

  // Updating deadline requires reason
  await assert.rejects(
    () =>
      respondToUrgentRequest({
        requestId: req.id,
        action: 'UPDATE_DEADLINE',
        actorUid: 'LG-1',
        actorRole: UserRole.LARGE_LAB,
        actorLabId: 'LAB-LG-200',
        expectedCompletionAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      }),
    /reason is required/i
  );

  const updatedDeadline = await respondToUrgentRequest({
    requestId: req.id,
    action: 'UPDATE_DEADLINE',
    actorUid: 'LG-1',
    actorRole: UserRole.LARGE_LAB,
    actorLabId: 'LAB-LG-200',
    expectedCompletionAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    reason: 'Analyzer calibration took 30 extra minutes',
  });
  assert.equal(updatedDeadline.delayReason, 'Analyzer calibration took 30 extra minutes');
});
