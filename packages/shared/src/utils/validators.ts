import { StorageTemperature } from '../types/index.js';
import { TEMPERATURE_LIMITS } from './constants.js';

/**
 * Checks whether a measured temperature satisfies the required cold-chain range
 */
export function isTemperatureCompliant(
  temperatureCelsius: number,
  requirement: StorageTemperature
): boolean {
  const limits = TEMPERATURE_LIMITS[requirement];
  if (!limits) return false;
  return temperatureCelsius >= limits.min && temperatureCelsius <= limits.max;
}

/**
 * Validates specimen barcode structure (e.g. SMP-202611-ABC12)
 */
export function isValidSpecimenBarcode(barcode: string): boolean {
  if (!barcode || typeof barcode !== 'string') return false;
  const regex = /^SMP-[A-Z0-9]{4,16}$/i;
  return regex.test(barcode.trim());
}

/**
 * Validates pickup order number structure (e.g. ORD-202611-ABC12)
 */
export function isValidOrderNumber(orderNumber: string): boolean {
  if (!orderNumber || typeof orderNumber !== 'string') return false;
  const regex = /^ORD-[A-Z0-9]{4,16}$/i;
  return regex.test(orderNumber.trim());
}

