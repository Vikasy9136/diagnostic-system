/// <reference types="vite/client" />
import type { CSSProperties } from 'react';
import fullLogoSrc from '../assets/brand/logo/labsetu-logo.png';
import iconOnlySrc from '../assets/brand/icons/labsetu-icon-only.png';
import type { LabSetuLogoVariant } from '../src/brand.js';

export type { LabSetuLogoVariant };

export interface LabSetuLogoProps {
  variant?: LabSetuLogoVariant;
  width?: number | string;
  height?: number | string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  showWordmark?: boolean;
  subtitle?: string;
}

/**
 * Centralized official LabSetu brand logo component for React web applications.
 * Uses the master PNGs from @diagnostic/shared/assets/brand without distortion.
 */
export function LabSetuLogo({
  variant = 'full',
  width,
  height,
  alt,
  className,
  style,
  showWordmark = false,
  subtitle,
}: LabSetuLogoProps) {
  const isIconVariant = variant === 'icon' || variant === 'compact';
  const src = isIconVariant ? iconOnlySrc : fullLogoSrc;
  const defaultSize =
    variant === 'icon' ? 32 : variant === 'compact' ? 38 : 72;
  const resolvedWidth = width ?? defaultSize;
  const resolvedHeight = height ?? defaultSize;
  const resolvedAlt =
    alt ?? (isIconVariant ? 'LabSetu icon' : 'LabSetu official logo');

  const isDarkSurface = variant === 'dark';
  const isLightSurface = variant === 'light';

  const badgeStyle: CSSProperties | undefined =
    isDarkSurface || isLightSurface || variant === 'compact'
      ? {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isIconVariant ? 4 : 3,
          borderRadius: isIconVariant ? 10 : 14,
          backgroundColor: isDarkSurface
            ? 'rgba(255, 255, 255, 0.96)'
            : isLightSurface
              ? '#FFFFFF'
              : 'rgba(255, 255, 255, 0.96)',
          boxShadow: isDarkSurface
            ? '0 2px 8px rgba(15, 23, 42, 0.25)'
            : '0 1px 4px rgba(15, 23, 42, 0.08)',
          flexShrink: 0,
        }
      : undefined;

  const imgEl = (
    <img
      src={src}
      alt={resolvedAlt}
      draggable={false}
      style={{
        width: resolvedWidth,
        height: resolvedHeight,
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
        userSelect: 'none',
        ...(!badgeStyle ? style : undefined),
      }}
      className={!badgeStyle && !showWordmark ? className : undefined}
    />
  );

  if (!showWordmark) {
    if (badgeStyle) {
      return (
        <span className={className} style={{ ...badgeStyle, ...style }}>
          {imgEl}
        </span>
      );
    }
    return imgEl;
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        ...style,
      }}
    >
      {badgeStyle ? <span style={badgeStyle}>{imgEl}</span> : imgEl}
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span
          style={{
            fontWeight: 800,
            fontSize: '1.05rem',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            color: isDarkSurface ? '#FFFFFF' : '#0F172A',
          }}
        >
          LabSetu
        </span>
        {subtitle ? (
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: isDarkSurface ? '#94A3B8' : '#0D9488',
              lineHeight: 1.2,
            }}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
