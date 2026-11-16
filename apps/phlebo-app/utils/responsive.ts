import { Dimensions, PixelRatio, Platform, useWindowDimensions } from 'react-native';

const BASE_WIDTH = 375;

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * Computes responsive scale multiplier from a viewport width.
 * Keeps compact phones (320-360dp) legible without overflowing blocks,
 * and subtly scales up larger screens/tablets.
 */
export function getScaleFactor(width?: number): number {
  const w = width && width > 0 ? width : Dimensions.get('window').width || BASE_WIDTH;
  return clamp(w / BASE_WIDTH, 0.86, 1.08);
}

/**
 * Responsive font size scaled to screen width and rounded smoothly to pixel grid.
 */
export function rf(size: number, width?: number): number {
  const scaled = size * getScaleFactor(width);
  return Math.round(PixelRatio.roundToNearestPixel(scaled) * 2) / 2;
}

/**
 * Responsive spacing / padding / gap scaled cleanly to viewport width.
 */
export function rs(size: number, width?: number): number {
  const factor = clamp(getScaleFactor(width), 0.84, 1.1);
  return Math.round(size * factor);
}

/**
 * Safe line height (>= fontSize + 5) to avoid vertical glyph cropping on Android custom fonts.
 */
export function lh(fontSize: number, multiplier = 1.36): number {
  return Math.max(Math.ceil(fontSize * multiplier), Math.ceil(fontSize + 5));
}

/**
 * Caps extreme Android/MIUI accessibility font scaling in tight UI blocks (tabs, badges, pills)
 * so text never gets truncated horizontally/vertically while still respecting modest preferences.
 */
export const MAX_TEXT_SCALE = 1.15;
export const COMPACT_TEXT_SCALE = 1.08;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const safeWidth = width > 0 ? width : Dimensions.get('window').width || BASE_WIDTH;
  const safeHeight = height > 0 ? height : Dimensions.get('window').height || 760;
  const scale = getScaleFactor(safeWidth);
  const isCompactPhone = safeWidth < 360;
  const isWideViewport = safeWidth >= 600;

  return {
    width: safeWidth,
    height: safeHeight,
    scale,
    isCompactPhone,
    isWideViewport,
    rf: (size: number) => rf(size, safeWidth),
    rs: (size: number) => rs(size, safeWidth),
    isAndroid: Platform.OS === 'android',
  };
}

