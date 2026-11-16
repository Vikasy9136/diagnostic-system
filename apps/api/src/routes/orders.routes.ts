import { Router, Request, Response, NextFunction } from 'express';
import {
  ApiResponse,
  PickupOrder,
  OrderStatus,
  OrderPriority,
  CustodyEvent,
  CustodyEventType,
  DEFAULT_STARTER_SERVICE_ZONES,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  PermissionCode,
  type ServiceZoneRecord,
  UserRole,
  evaluatePointServiceCoverage,
  isValidSpecimenBarcode,
  isTemperatureCompliant,
} from '@diagnostic/shared';
import { AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { AuthenticatedRequest } from '../middleware/rbac';
import { initializeFirebase } from '../config/firebase';
import { config } from '../config/env';
import { sendPlatformNotification } from '../services/notification.service';
import { dualList } from '../services/dualCollection';

export const ordersRouter = Router();

const VOLATILE_DEV_ORDERS: PickupOrder[] = [];

const ORDER_READ_PERMS: PermissionCode[] = [
  'VIEW_SUPER_ADMIN_DASHBOARD',
  'VIEW_OPERATIONS_DASHBOARD',
  'MANAGE_BOOKINGS_DISPATCH',
  'VIEW_FINANCE_DASHBOARD',
  'VIEW_PATIENT_METADATA',
  'VIEW_MEDICAL_REPORTS',
  'MANAGE_OPERATIONAL_QUALITY',
  'MANAGE_SUPPORT_TICKETS',
];

const ORDER_WRITE_PERMS: PermissionCode[] = [
  'MANAGE_BOOKINGS_DISPATCH',
  'MANAGE_OPERATIONAL_QUALITY',
  'MANAGE_RECONCILIATION',
];

function userCanAccessOrder(req: AuthenticatedRequest, order: PickupOrder, forWrite: boolean): boolean {
  const user = req.user;
  if (!user) return false;
  if (user.role === UserRole.ADMIN) {
    if (user.isSuperAdmin) return true;
    const allowed = forWrite ? ORDER_WRITE_PERMS : ORDER_READ_PERMS;
    return allowed.some((p) => user.permissions.includes(p));
  }
  if (user.role === UserRole.SMALL_LAB) {
    return Boolean(user.labId && (order.smallLabId === user.labId || order.targetLabId === user.labId));
  }
  if (user.role === UserRole.LARGE_LAB) {
    return Boolean(
      user.labId && (order.targetLabId === user.labId || order.targetParentLabId === user.labId)
    );
  }
  if (user.role === UserRole.PHLEBOTOMIST) {
    return Boolean(
      (user.phlebotomistId && order.phlebotomistId === user.phlebotomistId) ||
        (!forWrite && order.status === OrderStatus.READY_FOR_PICKUP && !order.phlebotomistId) ||
        (forWrite && order.status === OrderStatus.READY_FOR_PICKUP && !order.phlebotomistId)
    );
  }
  return false;
}

ordersRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (
      req.user?.role === UserRole.ADMIN &&
      !req.user.isSuperAdmin &&
      !ORDER_READ_PERMS.some((p) => req.user!.permissions.includes(p))
    ) {
      return next(
        new AppError(
          'Your department role does not include permission to inspect booking orders.',
          403,
          'PERMISSION_DENIED'
        )
      );
    }

    const { db, isMockMode } = initializeFirebase();
    const role = req.user?.role;
    const labId = req.user?.labId;
    const phleboId = req.user?.phlebotomistId;

    if (db && !isMockMode) {
      let ref: FirebaseFirestore.Query = db.collection('orders');
      if (role === UserRole.SMALL_LAB && labId) {
        ref = ref.where('smallLabId', '==', labId);
      } else if (role === UserRole.LARGE_LAB && labId) {
        ref = ref.where('targetLabId', '==', labId);
      }

      const snap = await ref.limit(200).get();
      const orderMap = new Map<string, PickupOrder>();
      snap.docs.forEach((doc) => {
        orderMap.set(doc.id, { id: doc.id, ...(doc.data() as Omit<PickupOrder, 'id'>) });
      });

      if (role === UserRole.LARGE_LAB && labId && !req.user?.parentLabId) {
        const parentSnap = await db
          .collection('orders')
          .where('targetParentLabId', '==', labId)
          .limit(200)
          .get();
        parentSnap.docs.forEach((doc) => {
          if (!orderMap.has(doc.id)) {
            orderMap.set(doc.id, { id: doc.id, ...(doc.data() as Omit<PickupOrder, 'id'>) });
          }
        });
      }

      let orders = Array.from(orderMap.values());

      if (role === UserRole.PHLEBOTOMIST && phleboId) {
        orders = orders.filter(
          (o) =>
            o.phlebotomistId === phleboId ||
            (o.status === OrderStatus.READY_FOR_PICKUP && !o.phlebotomistId)
        );
      }

      orders.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      return res.json({
        success: true,
        data: orders,
        message: 'Pickup orders loaded successfully',
        timestamp: new Date().toISOString(),
      });
    }

    let scoped = [...VOLATILE_DEV_ORDERS];
    if (role === UserRole.SMALL_LAB && labId) {
      scoped = scoped.filter((o) => o.smallLabId === labId || o.targetLabId === labId);
    } else if (role === UserRole.LARGE_LAB && labId) {
      scoped = scoped.filter((o) => o.targetLabId === labId || o.targetParentLabId === labId);
    }

    return res.json({
      success: true,
      data: scoped,
      message: 'Orders retrieved',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

ordersRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (
      req.user?.role === UserRole.PHLEBOTOMIST ||
      req.user?.role === UserRole.LARGE_LAB ||
      (req.user?.role === UserRole.ADMIN &&
        !req.user.isSuperAdmin &&
        !req.user.permissions.includes('MANAGE_BOOKINGS_DISPATCH'))
    ) {
      return next(
        new AppError('You do not have permission to create pickup orders.', 403, 'PERMISSION_DENIED')
      );
    }

    const { smallLabName, targetLabName, patient, specimens, priority } = req.body || {};
    if (!smallLabName || !patient) {
      return next(new AppError('Missing required fields: smallLabName and patient', 400, 'BAD_REQUEST'));
    }

    const now = new Date().toISOString();
    const orderNumber =
      req.body.orderNumber || `BK-${Math.floor(100000 + Math.random() * 899999)}`;

    const pickupLoc = req.body.pickupLocation || {
      address: smallLabName,
      latitude: 19.1438,
      longitude: 72.9378,
    };
    const pickupPincode =
      String(
        req.body.pickupPincode ||
          pickupLoc.pincode ||
          (typeof pickupLoc.address === 'string'
            ? pickupLoc.address.match(/\b[1-9]\d{5}\b/)?.[0] || ''
            : '')
      ).trim() || undefined;

    let zones = await dualList<ServiceZoneRecord>('service_zones');
    if (zones.length === 0) {
      zones = [...DEFAULT_STARTER_SERVICE_ZONES];
    }
    const coverage = evaluatePointServiceCoverage(
      zones,
      Number(pickupLoc.latitude),
      Number(pickupLoc.longitude),
      pickupPincode
    );
    if (!coverage.covered) {
      return next(
        new AppError(coverage.message, 400, 'OUTSIDE_SERVICE_ZONE', {
          nearestZone: coverage.nearestZone,
          distanceToNearestKm: coverage.distanceToNearestKm,
          activeZoneCount: coverage.activeZoneCount,
        })
      );
    }

    const newOrder: PickupOrder = {
      id: orderNumber,
      orderNumber,
      smallLabId: req.body.smallLabId || req.user?.labId || 'LAB-SM-UNASSIGNED',
      smallLabName,
      targetLabId: req.body.targetLabId || 'LAB-LG-UNASSIGNED',
      targetLabName: targetLabName || 'Partner Reference Lab',
      ...(req.body.targetParentLabId ? { targetParentLabId: req.body.targetParentLabId } : {}),
      ...(req.body.dropType ? { dropType: req.body.dropType } : {}),
      ...(req.body.phlebotomistId ? { phlebotomistId: req.body.phlebotomistId } : {}),
      ...(req.body.phlebotomistName ? { phlebotomistName: req.body.phlebotomistName } : {}),
      ...(coverage.matchedZone?.id ? { serviceZoneId: coverage.matchedZone.id } : {}),
      ...(coverage.matchedZone?.name ? { serviceZoneName: coverage.matchedZone.name } : {}),
      status: OrderStatus.READY_FOR_PICKUP,
      priority: priority || OrderPriority.ROUTINE,
      patient,
      specimens: Array.isArray(specimens) ? specimens : [],
      custodyHistory: [],
      pickupLocation: {
        ...pickupLoc,
        ...(pickupPincode ? { pincode: pickupPincode } : {}),
      },
      deliveryLocation: req.body.deliveryLocation || {
        address: targetLabName || 'Partner Reference Lab',
        latitude: 19.1726,
        longitude: 72.9565,
      },
      scheduledPickupAt: req.body.scheduledPickupAt || now,
      ...(typeof req.body.totalAmountInr === 'number' ? { totalAmountInr: req.body.totalAmountInr } : {}),
      ...(typeof req.body.courierFeeInr === 'number' ? { courierFeeInr: req.body.courierFeeInr } : {}),
      ...(typeof req.body.largeLabB2bAmountInr === 'number'
        ? { largeLabB2bAmountInr: req.body.largeLabB2bAmountInr }
        : {}),
      ...(typeof req.body.platformFeeInr === 'number' ? { platformFeeInr: req.body.platformFeeInr } : {}),
      ...(typeof req.body.packageSavingsInr === 'number'
        ? { packageSavingsInr: req.body.packageSavingsInr }
        : {}),
      ...(Array.isArray(req.body.matchedPackageNames)
        ? { matchedPackageNames: req.body.matchedPackageNames }
        : {}),
      ...(typeof req.body.distanceKm === 'number' ? { distanceKm: req.body.distanceKm } : {}),
      ...(typeof req.body.broadcastRadiusKm === 'number'
        ? { broadcastRadiusKm: req.body.broadcastRadiusKm }
        : {}),
      createdAt: now,
      updatedAt: now,
    };

    const { db, isMockMode } = initializeFirebase();
    if (db && !isMockMode) {
      await db.collection('orders').doc(orderNumber).set(newOrder);
    } else {
      VOLATILE_DEV_ORDERS.unshift(newOrder);
    }

    await sendPlatformNotification({
      title: `New Booking ${orderNumber} from ${smallLabName}`,
      message: `Priority ${newOrder.priority} sample pickup requested to ${newOrder.targetLabName}.`,
      category: NotificationCategory.BOOKING_CREATED,
      priority:
        newOrder.priority === OrderPriority.STAT_CRITICAL
          ? NotificationPriority.CRITICAL
          : NotificationPriority.NORMAL,
      recipientEmail: config.admin.email,
      recipientRole: UserRole.ADMIN,
      orderId: orderNumber,
      templateType:
        newOrder.priority === OrderPriority.STAT_CRITICAL
          ? 'EMERGENCY_ALERT'
          : 'OPERATIONAL_NOTIFICATION',
      metadata: {
        orderNumber,
        smallLabName: newOrder.smallLabName,
        targetLabName: newOrder.targetLabName,
      },
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH_FCM],
    });

    const response: ApiResponse<PickupOrder> = {
      success: true,
      data: newOrder,
      message: 'Booking created and admin notification dispatched',
      timestamp: now,
    };
    return res.status(201).json(response);
  } catch (err) {
    return next(err);
  }
});

ordersRouter.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id;
    const updates = (req.body || {}) as Partial<PickupOrder> & {
      custodyEventType?: CustodyEventType;
      temperatureCelsius?: number;
      custodyNotes?: string;
    };
    const now = new Date().toISOString();

    const { db, isMockMode } = initializeFirebase();
    let existing: PickupOrder | null = null;

    if (db && !isMockMode) {
      const snap = await db.collection('orders').doc(orderId).get();
      if (snap.exists) {
        existing = { id: snap.id, ...(snap.data() as Omit<PickupOrder, 'id'>) };
      }
    } else {
      existing = VOLATILE_DEV_ORDERS.find((o) => o.id === orderId) || null;
    }

    if (!existing) {
      return next(new AppError(`Order not found: ${orderId}`, 404, 'NOT_FOUND'));
    }

    if (!userCanAccessOrder(req, existing, true)) {
      return next(
        new AppError('You do not have permission to update this booking order.', 403, 'PERMISSION_DENIED')
      );
    }

    const nextStatus = updates.status || existing.status;
    const isTerminalOrDelivered =
      nextStatus === OrderStatus.DELIVERED_TO_LAB ||
      nextStatus === OrderStatus.REPORT_UPLOADED ||
      nextStatus === OrderStatus.COMPLETED;
    const completedAtStamp = isTerminalOrDelivered ? existing.completedAt || now : existing.completedAt;
    const payoutDueAtStamp = isTerminalOrDelivered
      ? existing.payoutDueAt || new Date(Date.now() + 30 * 60 * 1000).toISOString()
      : existing.payoutDueAt;

    const patchPayload: Partial<PickupOrder> = {
      ...(updates.status ? { status: updates.status } : {}),
      ...(updates.phlebotomistId !== undefined ? { phlebotomistId: updates.phlebotomistId } : {}),
      ...(updates.phlebotomistName !== undefined ? { phlebotomistName: updates.phlebotomistName } : {}),
      ...(updates.actualPickupAt ? { actualPickupAt: updates.actualPickupAt } : {}),
      ...(updates.actualDeliveredAt ? { actualDeliveredAt: updates.actualDeliveredAt } : {}),
      ...(updates.arrivalTemperatureCelsius !== undefined
        ? { arrivalTemperatureCelsius: updates.arrivalTemperatureCelsius }
        : {}),
      ...(updates.qualityStatus ? { qualityStatus: updates.qualityStatus } : {}),
      ...(updates.reportDocumentUrl ? { reportDocumentUrl: updates.reportDocumentUrl } : {}),
      ...(updates.reportId ? { reportId: updates.reportId } : {}),
      ...(updates.rejectionReason ? { rejectionReason: updates.rejectionReason } : {}),
      ...(updates.cancellationReason ? { cancellationReason: updates.cancellationReason } : {}),
      ...(updates.phleboLiveLocation ? { phleboLiveLocation: updates.phleboLiveLocation } : {}),
      ...(updates.sampleCollectionPhotoUrl
        ? { sampleCollectionPhotoUrl: updates.sampleCollectionPhotoUrl }
        : {}),
      ...(Array.isArray(updates.specimens) ? { specimens: updates.specimens } : {}),
      ...(isTerminalOrDelivered
        ? {
            completedAt: completedAtStamp,
            payoutDueAt: payoutDueAtStamp,
            payoutWindowMinutes: 30,
            instantPayoutEligible: true,
          }
        : {}),
      updatedAt: now,
    };

    const merged = { ...existing, ...patchPayload };

    if (db && !isMockMode) {
      await db.collection('orders').doc(orderId).set(patchPayload, { merge: true });
      if (isTerminalOrDelivered) {
        const instantPatch = {
          completedAt: completedAtStamp,
          payoutDueAt: payoutDueAtStamp,
          payoutWindowMinutes: 30,
          instantPayoutEligible: true,
          updatedAt: now,
        };
        const directStlId = `STL-${orderId.replace(/^BK-/, '')}`;
        const directStlSnap = await db.collection('settlements').doc(directStlId).get();
        if (directStlSnap.exists) {
          await directStlSnap.ref.set(instantPatch, { merge: true });
        }
        const linkedStls = await db.collection('settlements').where('orderId', '==', orderId).get();
        for (const stlDoc of linkedStls.docs) {
          if (stlDoc.id !== directStlId || !directStlSnap.exists) {
            await stlDoc.ref.set(instantPatch, { merge: true });
          }
        }
      }
      if (updates.custodyEventType && req.user) {
        const evt: Omit<CustodyEvent, 'id'> = {
          orderId,
          eventType: updates.custodyEventType,
          timestamp: now,
          operatorId: req.user.uid,
          operatorName: req.user.email || req.user.uid,
          operatorRole: req.user.role,
          ...(typeof updates.temperatureCelsius === 'number'
            ? { temperatureCelsius: updates.temperatureCelsius }
            : {}),
          ...(updates.custodyNotes ? { notes: updates.custodyNotes } : {}),
        };
        await db.collection('custody_events').add(evt);
      }
    } else {
      const idx = VOLATILE_DEV_ORDERS.findIndex((o) => o.id === orderId);
      if (idx >= 0) VOLATILE_DEV_ORDERS[idx] = merged;
    }

    return res.json({
      success: true,
      data: merged,
      message: `Order ${orderId} updated`,
      timestamp: now,
    });
  } catch (err) {
    return next(err);
  }
});

ordersRouter.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id;
    const { db, isMockMode } = initializeFirebase();

    let order: PickupOrder | null = null;
    if (db && !isMockMode) {
      const snap = await db.collection('orders').doc(orderId).get();
      if (snap.exists) {
        order = { id: snap.id, ...(snap.data() as Omit<PickupOrder, 'id'>) };
      }
    } else {
      order = VOLATILE_DEV_ORDERS.find((o) => o.id === orderId) || null;
    }

    if (!order) {
      return next(new AppError(`Order not found: ${orderId}`, 404, 'NOT_FOUND'));
    }

    if (!userCanAccessOrder(req, order, false)) {
      return next(
        new AppError('You do not have permission to view this booking order.', 403, 'PERMISSION_DENIED')
      );
    }

    return res.json({
      success: true,
      data: order,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

ordersRouter.post('/validate-specimen', (req: Request, res: Response, next: NextFunction) => {
  const { barcode, temperatureCelsius, temperatureRequirement } = req.body;

  if (!barcode) {
    return next(new AppError('Missing required field: barcode', 400, 'BAD_REQUEST'));
  }

  const isBarcodeValid = isValidSpecimenBarcode(barcode);
  const isTempValid =
    typeof temperatureCelsius === 'number' && temperatureRequirement
      ? isTemperatureCompliant(temperatureCelsius, temperatureRequirement)
      : null;

  const response: ApiResponse<{
    barcode: string;
    isBarcodeValid: boolean;
    isTemperatureCompliant: boolean | null;
  }> = {
    success: true,
    data: {
      barcode,
      isBarcodeValid,
      isTemperatureCompliant: isTempValid,
    },
    message: isBarcodeValid ? 'Barcode format is valid' : 'Invalid barcode format',
    timestamp: new Date().toISOString(),
  };

  res.json(response);
});
