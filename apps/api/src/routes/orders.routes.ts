import { Router, Request, Response, NextFunction } from 'express';
import {
  ApiResponse,
  PickupOrder,
  OrderStatus,
  OrderPriority,
  CustodyEvent,
  CustodyEventType,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  UserRole,
  isValidSpecimenBarcode,
  isTemperatureCompliant,
} from '@diagnostic/shared';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { initializeFirebase } from '../config/firebase';
import { config } from '../config/env';
import { sendPlatformNotification } from '../services/notification.service';

export const ordersRouter = Router();

// Empty volatile store only when Admin SDK serviceAccountKey.json is not attached yet
const VOLATILE_DEV_ORDERS: PickupOrder[] = [];

/**
 * GET /api/v1/orders
 * Returns live Firestore pickup orders (no dummy seed records)
 */
ordersRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
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
      let orders = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<PickupOrder, 'id'>) }));

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
      scoped = scoped.filter((o) => o.smallLabId === labId);
    } else if (role === UserRole.LARGE_LAB && labId) {
      scoped = scoped.filter((o) => o.targetLabId === labId);
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

/**
 * POST /api/v1/orders
 * Creates a pickup order in Firestore and dispatches email + in-app notification
 */
ordersRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { smallLabName, targetLabName, patient, specimens, priority } = req.body || {};
    if (!smallLabName || !patient) {
      return next(new AppError('Missing required fields: smallLabName and patient', 400, 'BAD_REQUEST'));
    }

    const now = new Date().toISOString();
    const orderNumber =
      req.body.orderNumber || `BK-${Math.floor(100000 + Math.random() * 899999)}`;

    const newOrder: PickupOrder = {
      id: orderNumber,
      orderNumber,
      smallLabId: req.body.smallLabId || req.user?.labId || 'LAB-SM-UNASSIGNED',
      smallLabName,
      targetLabId: req.body.targetLabId || 'LAB-LG-UNASSIGNED',
      targetLabName: targetLabName || 'Partner Reference Lab',
      ...(req.body.phlebotomistId ? { phlebotomistId: req.body.phlebotomistId } : {}),
      ...(req.body.phlebotomistName ? { phlebotomistName: req.body.phlebotomistName } : {}),
      status: OrderStatus.READY_FOR_PICKUP,
      priority: priority || OrderPriority.ROUTINE,
      patient,
      specimens: Array.isArray(specimens) ? specimens : [],
      custodyHistory: [],
      pickupLocation: req.body.pickupLocation || {
        address: smallLabName,
        latitude: 19.1438,
        longitude: 72.9378,
      },
      deliveryLocation: req.body.deliveryLocation || {
        address: targetLabName || 'Partner Reference Lab',
        latitude: 19.1726,
        longitude: 72.9565,
      },
      scheduledPickupAt: req.body.scheduledPickupAt || now,
      ...(typeof req.body.totalAmountInr === 'number' ? { totalAmountInr: req.body.totalAmountInr } : {}),
      ...(typeof req.body.courierFeeInr === 'number' ? { courierFeeInr: req.body.courierFeeInr } : {}),
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

/**
 * PATCH /api/v1/orders/:id
 * Updates order lifecycle status, courier assignment, or QC details & records custody audit event
 */
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
      updatedAt: now,
    };

    const merged = { ...existing, ...patchPayload };

    if (db && !isMockMode) {
      await db.collection('orders').doc(orderId).set(patchPayload, { merge: true });
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

/**
 * GET /api/v1/orders/:id
 * Retrieve single order from Firestore
 */
ordersRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
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

    return res.json({
      success: true,
      data: order,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/v1/orders/validate-specimen
 * Validates specimen barcode structure & temperature compliance
 */
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
