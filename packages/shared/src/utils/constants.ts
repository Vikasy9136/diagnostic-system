import { StorageTemperature, OrderPriority } from '../types';

/**
 * Temperature range boundaries in Celsius
 */
export const TEMPERATURE_LIMITS = {
  [StorageTemperature.AMBIENT]: { min: 15.0, max: 25.0, label: 'Ambient (15°C - 25°C)' },
  [StorageTemperature.REFRIGERATED]: { min: 2.0, max: 8.0, label: 'Refrigerated (2°C - 8°C)' },
  [StorageTemperature.FROZEN]: { min: -80.0, max: -20.0, label: 'Frozen (-80°C - -20°C)' },
} as const;

/**
 * Target pickup SLA in minutes based on order priority
 */
export const SLA_TARGET_MINUTES: Record<OrderPriority, number> = {
  [OrderPriority.STAT_CRITICAL]: 60,
  [OrderPriority.URGENT]: 180,
  [OrderPriority.ROUTINE]: 360,
};

/**
 * Default System Constants
 */
export const SYSTEM_CONSTANTS = {
  BARCODE_SPECIMEN_PREFIX: 'SMP-',
  BARCODE_ORDER_PREFIX: 'ORD-',
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;
