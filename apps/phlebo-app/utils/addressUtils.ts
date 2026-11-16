/**
 * Address formatting utilities for Phlebotomist app
 * Ensures full proper location addresses are displayed instead of raw coordinates.
 */

export interface LocationPayload {
  address?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  contactPhone?: string;
}

export function formatFullProperAddress(
  loc?: LocationPayload,
  fallbackName?: string
): string {
  if (!loc && !fallbackName) {
    return 'Diagnostic Collection Center Address';
  }

  const raw = (loc?.address || '').trim();
  const pin = (loc?.pincode || '').trim();

  // Check if string is raw comma-separated coordinates e.g. "19.1234, 72.8765"
  const isRawCoords = /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?)[,\s]+[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/.test(
    raw
  );

  if (!raw || isRawCoords) {
    if (fallbackName) {
      return pin ? `${fallbackName}, Diagnostic Facility (PIN: ${pin})` : `${fallbackName}, Diagnostic Facility Address`;
    }
    return pin ? `Diagnostic Pickup Center • PIN: ${pin}` : 'Diagnostic Pickup Facility, Local Area';
  }

  // If address exists, ensure pincode is nicely appended if missing
  if (pin && !raw.includes(pin)) {
    return `${raw}, PIN: ${pin}`;
  }

  return raw;
}

export function formatRiderLiveLocation(
  zoneName?: string,
  resolvedAddress?: string,
  city?: string
): string {
  if (resolvedAddress && resolvedAddress.trim()) {
    return resolvedAddress.trim();
  }
  if (zoneName && zoneName.trim()) {
    return zoneName.trim();
  }
  if (city && city.trim()) {
    return `${city.trim()} Diagnostic Service Zone`;
  }
  return 'Active Diagnostic Operational Area';
}

export function getCleanPincode(loc?: LocationPayload): string | undefined {
  if (loc?.pincode?.trim()) return loc.pincode.trim();
  const match = (loc?.address || '').match(/\b\d{6}\b/);
  return match ? match[0] : undefined;
}
