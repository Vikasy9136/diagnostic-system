import { Router, Request, Response, NextFunction } from 'express';
import {
  ApiResponse,
  PickupOrder,
  OrderStatus,
  OrderPriority,
  SpecimenType,
  TubeType,
  StorageTemperature,
  CustodyEventType,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  UserRole,
  isValidSpecimenBarcode,
  isTemperatureCompliant,
} from '@diagnostic/shared';
import { AppError } from '../middleware/errorHandler';
import { initializeFirebase } from '../config/firebase';
import { config } from '../config/env';
import { sendPlatformNotification } from '../services/notification.service';

export const ordersRouter = Router();

// Starter mock order (strictly adheres to PickupOrder type from @diagnostic/shared)
const STARTER_ORDERS: PickupOrder[] = [
  {
    id: 'ord_mock_001',
    orderNumber: 'ORD-202611-0001',
    smallLabId: 'LAB-SM-001',
    smallLabName: 'Apex Clinical Care Collection Center',
    targetLabId: 'LAB-LG-100',
    targetLabName: 'National Reference Diagnostics Core Lab',
    phlebotomistId: 'PHL-204',
    phlebotomistName: 'Rohan Sharma',
    status: OrderStatus.READY_FOR_PICKUP,
    priority: OrderPriority.URGENT,
    patient: {
      id: 'PT-9482',
      pseudonym: 'PT-9482',
      age: 42,
      gender: 'MALE',
    },
    specimens: [
      {
        id: 'SMP-202611-0001',
        barcode: 'SMP-202611-0001',
        testCode: 'CBC-01',
        testName: 'Complete Blood Count',
        specimenType: SpecimenType.BLOOD,
        tubeType: TubeType.EDTA_LAVENDER,
        temperatureRequirement: StorageTemperature.REFRIGERATED,
        collectedAt: new Date().toISOString(),
      },
    ],
    custodyHistory: [
      {
        id: 'EVT-001',
        orderId: 'ord_mock_001',
        eventType: CustodyEventType.ORDER_CREATED,
        timestamp: new Date().toISOString(),
        operatorId: 'USR-SM-01',
        operatorName: 'Dr. A. Verma',
        operatorRole: UserRole.SMALL_LAB,
        notes: 'Specimen collected and packed with cold ice gel pack',
      },
    ],
    pickupLocation: {
      address: 'Shop 4, Market Complex, Sector 15, Gurgaon, Haryana',
      latitude: 28.4595,
      longitude: 77.0266,
      contactPhone: '+91 98000 00000',
    },
    deliveryLocation: {
      address: 'Central Reference Lab, Okhla Phase 3, New Delhi',
      latitude: 28.5355,
      longitude: 77.2680,
    },
    scheduledPickupAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * GET /api/v1/orders
 * Returns list of pickup orders
 */
ordersRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { db, isMockMode } = initializeFirebase();
    if (db && !isMockMode) {
      const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(50).get();
      if (!snap.empty) {
        const orders = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<PickupOrder, 'id'>) }));
        return res.json({
          success: true,
          data: orders,
          message: 'Firestore pickup orders retrieved successfully',
          timestamp: new Date().toISOString(),
        });
      }
    }

    const response: ApiResponse<PickupOrder[]> = {
      success: true,
      data: STARTER_ORDERS,
      message: 'Starter mock orders retrieved successfully',
      timestamp: new Date().toISOString(),
    };
    return res.json(response);
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/v1/orders
 * Creates a pickup order in Firestore and dispatches email + in-app notification
 */
ordersRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { smallLabName, targetLabName, patient, specimens, priority } = req.body || {};
    if (!smallLabName || !patient) {
      return next(new AppError('Missing required fields: smallLabName and patient', 400, 'BAD_REQUEST'));
    }

    const now = new Date().toISOString();
    const orderNumber = `BK-${Math.floor(10500 + Math.random() * 89000)}`;
    const newOrder: PickupOrder = {
      id: orderNumber,
      orderNumber,
      smallLabId: req.body.smallLabId || 'LAB-SM-001',
      smallLabName,
      targetLabId: req.body.targetLabId || 'LAB-LG-100',
      targetLabName: targetLabName || 'Metro Diagnostics',
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
        address: targetLabName || 'Metro Diagnostics',
        latitude: 19.1726,
        longitude: 72.9565,
      },
      scheduledPickupAt: req.body.scheduledPickupAt || now,
      createdAt: now,
      updatedAt: now,
    };

    const { db, isMockMode } = initializeFirebase();
    if (db && !isMockMode) {
      await db.collection('orders').doc(orderNumber).set(newOrder);
    } else {
      STARTER_ORDERS.unshift(newOrder);
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
 * GET /api/v1/orders/:id
 * Retrieve single order
 */
ordersRouter.get('/:id', (req: Request, res: Response, next) => {
  const order = STARTER_ORDERS.find((o) => o.id === req.params.id);
  if (!order) {
    return next(new AppError(`Order not found: ${req.params.id}`, 404, 'NOT_FOUND'));
  }

  const response: ApiResponse<PickupOrder> = {
    success: true,
    data: order,
    timestamp: new Date().toISOString(),
  };
  res.json(response);
});

/**
 * POST /api/v1/orders/validate-specimen
 * Validates specimen barcode structure & temperature compliance
 */
ordersRouter.post('/validate-specimen', (req: Request, res: Response, next) => {
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

