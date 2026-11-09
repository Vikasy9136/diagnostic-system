import { UserRole } from './user';

/**
 * Types of custody events in the logistics lifecycle
 */
export enum CustodyEventType {
  ORDER_CREATED = 'ORDER_CREATED',
  PACKED_BY_SMALL_LAB = 'PACKED_BY_SMALL_LAB',
  PICKED_UP_BY_PHLEBO = 'PICKED_UP_BY_PHLEBO',
  COLD_CHAIN_CHECK = 'COLD_CHAIN_CHECK',
  DELIVERED_TO_PARTNER_LAB = 'DELIVERED_TO_PARTNER_LAB',
  ACCESSIONED_BY_PARTNER_LAB = 'ACCESSIONED_BY_PARTNER_LAB',
  REJECTED_AT_LAB = 'REJECTED_AT_LAB',
}

/**
 * Geographic GPS location
 */
export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  address?: string;
}

/**
 * Immutable Chain-of-Custody Event Entry
 */
export interface CustodyEvent {
  id: string;
  orderId: string;
  eventType: CustodyEventType;
  timestamp: string; // ISO 8601
  operatorId: string;
  operatorName: string;
  operatorRole: UserRole;
  location?: GeoLocation;
  temperatureCelsius?: number;
  digitalSignatureUrl?: string;
  notes?: string;
}
