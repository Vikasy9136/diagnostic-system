import React from 'react';
import { Image, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

const MASTER_FULL_LOGO = require('../../../packages/shared/assets/brand/logo/labsetu-logo.png');
const MASTER_ICON_ONLY = require('../../../packages/shared/assets/brand/icons/labsetu-icon-only.png');

export const BRAND_FONTS = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
};

export const BRAND_COLORS = {
  navyDeep: '#061D42',
  navyPrimary: '#0A2A5E',
  navyMid: '#0D3B7A',
  tealPrimary: '#0D9488',
  tealBright: '#14B8A6',
  tealSoft: '#E6F7F5',
  tealBorder: '#99F6E4',
  emerald: '#16A34A',
  emeraldSoft: '#DCFCE7',
  amber: '#F59E0B',
  amberSoft: '#FEF3C7',
  crimson: '#DC2626',
  crimsonSoft: '#FEE2E2',
  canvas: '#F4F7FB',
  white: '#FFFFFF',
  ink: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
};

export function LabSetuLogoMark({
  size = 56,
  variant = 'icon',
}: {
  size?: number;
  variant?: 'icon' | 'full';
}) {
  return (
    <Image
      source={variant === 'full' ? MASTER_FULL_LOGO : MASTER_ICON_ONLY}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel={variant === 'full' ? 'LabSetu official logo' : 'LabSetu icon'}
    />
  );
}

/**
 * Exact Phlebotomist Courier Rider on Bike / Scooter Icon from the Live Map
 */
export function PhleboCourierBikeMark({ size = 44 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Circle cx="16" cy="44" r="9" fill="#1E293B" stroke="#94A3B8" strokeWidth="2.5" />
      <Circle cx="16" cy="44" r="4" fill="#F8FAFC" stroke="#64748B" strokeWidth="1.5" />
      <Circle cx="48" cy="44" r="9" fill="#1E293B" stroke="#94A3B8" strokeWidth="2.5" />
      <Circle cx="48" cy="44" r="4" fill="#F8FAFC" stroke="#64748B" strokeWidth="1.5" />
      <Path d="M16 44 L28 40 L44 32 L48 44" stroke="#0A2A5E" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M28 40 L34 46 L40 46" stroke="#0D9488" strokeWidth="3" strokeLinecap="round" />
      <Path d="M42 32 L51 34 L49 39" stroke="#0D9488" strokeWidth="3.5" strokeLinecap="round" />
      <Circle cx="52" cy="34" r="2.2" fill="#FACC15" />
      <Path d="M42 27 L44 32 L40 31" stroke="#334155" strokeWidth="2.2" strokeLinecap="round" />
      <Path d="M28 35 L33 41 L35 44" stroke="#0A2A5E" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M26 31 L37 28 L42 29" stroke="#0A2A5E" strokeWidth="5" strokeLinecap="round" />
      <Circle cx="36" cy="20" r="6.2" fill="#0D9488" stroke="#0A2A5E" strokeWidth="1.6" />
      <Rect x="17" y="18" width="16" height="18" rx="3.5" fill="#FFFFFF" stroke="#0A2A5E" strokeWidth="1.8" />
      <Path d="M19 20 H31 L32 23.5 C32 25, 30 25.5, 29 24.5 C28 25.5, 26 25.5, 25.5 24.5 C25 25.5, 23 25.5, 22 24.5 C21 25.5, 19.5 25, 19 23.5 Z" fill="#0D9488" />
    </Svg>
  );
}

export function LabSetuWordmark({
  darkBg = false,
  fontSize = 24,
  showTagline = false,
  subtitle,
}: {
  darkBg?: boolean;
  fontSize?: number;
  showTagline?: boolean;
  subtitle?: string;
}) {
  const taglineSize = Math.max(10.5, Math.round(fontSize * 0.41));
  return (
    <View style={{ alignItems: 'center', flexShrink: 1, minWidth: 0 }}>
      <Text
        maxFontSizeMultiplier={1.12}
        style={{
          fontSize,
          lineHeight: Math.ceil(fontSize * 1.25),
          fontFamily: BRAND_FONTS.extraBold,
          letterSpacing: -0.4,
          color: darkBg ? '#FFFFFF' : BRAND_COLORS.navyPrimary,
          includeFontPadding: true,
        }}
      >
        Lab
        <Text style={{ color: darkBg ? '#2DD4BF' : BRAND_COLORS.tealPrimary }}>Setu</Text>
      </Text>
      {showTagline ? (
        <Text
          maxFontSizeMultiplier={1.12}
          style={{
            marginTop: 2,
            fontSize: taglineSize,
            lineHeight: Math.ceil(taglineSize * 1.38),
            fontFamily: BRAND_FONTS.semiBold,
            color: darkBg ? '#CBD5E1' : BRAND_COLORS.navyPrimary,
            letterSpacing: 0.1,
            textAlign: 'center',
            includeFontPadding: true,
          }}
        >
          Connecting Labs. Empowering Phlebo.
        </Text>
      ) : null}
      {subtitle ? (
        <Text
          maxFontSizeMultiplier={1.1}
          style={{
            marginTop: 1,
            fontSize: 10.5,
            lineHeight: 15,
            fontFamily: BRAND_FONTS.medium,
            color: darkBg ? '#99F6E4' : BRAND_COLORS.muted,
            textAlign: 'center',
            includeFontPadding: true,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function SplashNetworkIllustration() {
  return (
    <Svg width={290} height={110} viewBox="0 0 290 110">
      <Path
        d="M55 72 Q 100 32, 145 48"
        stroke="#0A2A5E"
        strokeWidth="2"
        strokeDasharray="5,5"
        fill="none"
      />
      <Path
        d="M145 48 Q 195 30, 238 72"
        stroke="#0A2A5E"
        strokeWidth="2"
        strokeDasharray="5,5"
        fill="none"
      />

      {/* Left Mini Hub */}
      <G transform="translate(26, 44)">
        <Circle cx="24" cy="48" r="22" fill="#E0F2FE" opacity="0.7" />
        <Circle cx="24" cy="10" r="7" fill="#0D9488" />
        <Circle cx="24" cy="10" r="2.6" fill="#FFFFFF" />
        <Rect x="8" y="24" width="32" height="22" rx="4" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
        <Path d="M6 25 H42 L39 18 H9 Z" fill="#0A2A5E" />
        <Rect x="16" y="30" width="3" height="10" rx="1.5" fill="#0D9488" />
        <Rect x="22.5" y="30" width="3" height="10" rx="1.5" fill="#0A2A5E" />
        <Rect x="29" y="30" width="3" height="10" rx="1.5" fill="#DC2626" />
      </G>

      {/* Center Main Hub */}
      <G transform="translate(113, 18)">
        <Circle cx="32" cy="64" r="30" fill="#CCFBF1" opacity="0.65" />
        <Circle cx="32" cy="12" r="9" fill="#0D9488" />
        <Circle cx="32" cy="12" r="3.4" fill="#FFFFFF" />
        <Rect x="10" y="30" width="44" height="30" rx="5" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.8" />
        <Path d="M7 31 H57 L53 22 H11 Z" fill="#0A2A5E" />
        <Rect x="21" y="38" width="4" height="14" rx="2" fill="#0D9488" />
        <Rect x="30" y="38" width="4" height="14" rx="2" fill="#0A2A5E" />
        <Rect x="39" y="38" width="4" height="14" rx="2" fill="#DC2626" />
      </G>

      {/* Right Mini Hub */}
      <G transform="translate(214, 44)">
        <Circle cx="24" cy="48" r="22" fill="#E0F2FE" opacity="0.7" />
        <Circle cx="24" cy="10" r="7" fill="#0D9488" />
        <Circle cx="24" cy="10" r="2.6" fill="#FFFFFF" />
        <Rect x="8" y="24" width="32" height="22" rx="4" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
        <Path d="M6 25 H42 L39 18 H9 Z" fill="#0A2A5E" />
        <Rect x="16" y="30" width="3" height="10" rx="1.5" fill="#0D9488" />
        <Rect x="22.5" y="30" width="3" height="10" rx="1.5" fill="#0A2A5E" />
        <Rect x="29" y="30" width="3" height="10" rx="1.5" fill="#DC2626" />
      </G>
    </Svg>
  );
}

export function SampleVialHeroIllustration({ size = 112 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Circle cx="60" cy="60" r="52" fill="#E8F1FF" />
      <Circle cx="60" cy="60" r="42" fill="#F0FDFA" />
      {/* Tilted Vacutainer Tube */}
      <G transform="rotate(24, 56, 62)">
        <Rect x="44" y="22" width="24" height="12" rx="4" fill="#B91C1C" />
        <Rect x="42" y="32" width="28" height="6" rx="2" fill="#DC2626" />
        <Rect
          x="45"
          y="38"
          width="22"
          height="58"
          rx="11"
          fill="#FFFFFF"
          stroke="#CBD5E1"
          strokeWidth="2.5"
        />
        <Path
          d="M47 58 H65 V84 C65 90, 61 94, 56 94 C51 94, 47 90, 47 84 Z"
          fill="#DC2626"
        />
        <Rect x="51" y="45" width="3" height="32" rx="1.5" fill="#E2E8F0" opacity="0.85" />
      </G>
      {/* Blood Drop */}
      <Path
        d="M84 68 C89 76, 92 80, 92 84.5 C92 89.2, 88.4 93, 84 93 C79.6 93, 76 89.2, 76 84.5 C76 80, 79 76, 84 68 Z"
        fill="#DC2626"
      />
    </Svg>
  );
}

export function TopCornerWave({ height = 110 }: { height?: number }) {
  return (
    <View style={[waveStyles.topWrap, { height }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="none">
        <Path d="M0 0 H240 C170 40, 80 78, 0 112 Z" fill="#0A2A5E" />
        <Path d="M120 0 H330 C250 38, 175 74, 80 100 C120 70, 145 35, 120 0 Z" fill="#0D9488" opacity="0.92" />
      </Svg>
    </View>
  );
}

export function BottomWaveBackdrop({ height = 110 }: { height?: number }) {
  return (
    <View style={[waveStyles.bottomWrap, { height }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="none">
        <Path d="M0 78 Q 135 28, 265 65 T 400 32 L 400 120 L 0 120 Z" fill="#0D9488" opacity="0.9" />
        <Path d="M0 95 Q 150 48, 285 84 T 400 58 L 400 120 L 0 120 Z" fill="#062048" />
      </Svg>
    </View>
  );
}

const waveStyles = StyleSheet.create({
  topWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
  bottomWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
});

function resolveBrandFont(weight?: string | number): string {
  const w = String(weight || '');
  if (w === '800' || w === '900') return BRAND_FONTS.extraBold;
  if (w === '700' || w === 'bold') return BRAND_FONTS.bold;
  if (w === '600') return BRAND_FONTS.semiBold;
  if (w === '500') return BRAND_FONTS.medium;
  return BRAND_FONTS.regular;
}

export function BrandText({ style, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style) || {};
  const fontFamily = flat.fontFamily || resolveBrandFont(flat.fontWeight);
  return <Text {...props} style={[{ fontFamily }, style]} />;
}

export function BrandTextInput({ style, ...props }: TextInputProps) {
  const flat = StyleSheet.flatten(style) || {};
  const fontFamily = flat.fontFamily || resolveBrandFont(flat.fontWeight);
  return <TextInput {...props} style={[{ fontFamily }, style]} />;
}

