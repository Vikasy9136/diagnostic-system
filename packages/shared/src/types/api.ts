import { OrderStatus } from './order';
import { CustodyEventType, GeoLocation } from './custody';

/**
 * Standard API Success Response
 */
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
  timestamp: string;
}

/**
 * Standard API Error Response
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

/**
 * Paginated Query Results
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Phlebotomist Assignment Request payload
 */
export interface AssignPhlebotomistPayload {
  orderId: string;
  phlebotomistId: string;
  notes?: string;
}

/**
 * Status Update & Custody Transfer payload
 */
export interface TransitionOrderPayload {
  orderId: string;
  targetStatus: OrderStatus;
  eventType: CustodyEventType;
  location?: GeoLocation;
  temperatureCelsius?: number;
  digitalSignatureUrl?: string;
  notes?: string;
}

