import { Router, Request, Response } from 'express';
import {
  ApiResponse,
  PickupOrder,
  OrderStatus,
  OrderPriority,
  SpecimenType,
  TubeType,
  StorageTemperature,
  isValidSpecimenBarcode,
  isTemperatureCompliant,
} from '@diagnostic/shared';
import { AppError } from '../middleware/errorHandler';

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
        eventType: 'ORDER_CREATED' as any,
        timestamp: new Date().toISOString(),
        operatorId: 'USR-SM-01',
        operatorName: 'Dr. A. Verma',
        operatorRole: 'SMALL_LAB' as any,
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
ordersRouter.get('/', (_req: Request, res: Response) => {
  const response: ApiResponse<PickupOrder[]> = {
    success: true,
    data: STARTER_ORDERS,
    message: 'Starter mock orders retrieved successfully',
    timestamp: new Date().toISOString(),
  };
  res.json(response);
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

