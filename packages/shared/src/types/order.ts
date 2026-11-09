import { SpecimenItem } from './specimen';
import { CustodyEvent } from './custody';

/**
 * Status lifecycle of a diagnostic pickup order
 */
export enum OrderStatus {
  CREATED = 'CREATED',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  ASSIGNED_TO_PHLEBO = 'ASSIGNED_TO_PHLEBO',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED_TO_LAB = 'DELIVERED_TO_LAB',
  UNDER_ANALYSIS = 'UNDER_ANALYSIS',
  REPORT_UPLOADED = 'REPORT_UPLOADED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

/**
 * Order urgency priority
 */
export enum OrderPriority {
  ROUTINE = 'ROUTINE',
  URGENT = 'URGENT',
  STAT_CRITICAL = 'STAT_CRITICAL',
}

/**
 * De-identified / Synthetic Patient Data structure for development
 */
export interface PatientMetadata {
  id: string;
  pseudonym: string; // e.g. "PT-9482" (no real names)
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
}

/**
 * Main Diagnostic Sample Pickup Order
 */
export interface PickupOrder {
  id: string;
  orderNumber: string; // e.g. "ORD-202611-0001"
  smallLabId: string;
  smallLabName: string;
  targetLabId: string;
  targetLabName: string;
  phlebotomistId?: string;
  phlebotomistName?: string;
  status: OrderStatus;
  priority: OrderPriority;
  patient: PatientMetadata;
  specimens: SpecimenItem[];
  custodyHistory: CustodyEvent[];
  pickupLocation: {
    address: string;
    latitude: number;
    longitude: number;
    contactPhone?: string;
  };
  deliveryLocation: {
    address: string;
    latitude: number;
    longitude: number;
  };
  scheduledPickupAt: string;
  actualPickupAt?: string;
  actualDeliveredAt?: string;
  reportDocumentUrl?: string;
  cancellationReason?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

