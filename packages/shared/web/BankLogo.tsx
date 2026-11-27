/// <reference types="vite/client" />
import { useState, type CSSProperties } from 'react';
import { getBankBrandMeta } from '../src/utils/bankHelpers.js';

const BANK_LOGO_ASSETS = import.meta.glob('../assets/banks/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

export interface BankLogoProps {
  bankCode?: string | null;
  ifsc?: string | null;
  bankName?: string | null;
  size?: number;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Centralized BankLogo component for React web applications.
 * Uses explicit inline styles (no Tailwind dependency) so bank PNGs never overflow
 * and preserve aspect ratio cleanly across all portals.
 */
export function BankLogo({
  bankCode,
  ifsc,
  bankName,
  size = 36,
  width,
  height,
  className = '',
  style,
}: BankLogoProps) {
  const [failed, setFailed] = useState(false);
  const meta = getBankBrandMeta(ifsc || bankCode || bankName || undefined);
  const fallbackSrc = BANK_LOGO_ASSETS['../assets/banks/other-banks.png'] || '';
  const resolvedSrc = failed
    ? fallbackSrc
    : BANK_LOGO_ASSETS[`../assets/banks/${meta.logoAsset}`] || fallbackSrc;

  const boxHeight = height ?? size;
  const boxWidth = width ?? Math.round(boxHeight * 1.45);

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${boxWidth}px`,
        height: `${boxHeight}px`,
        minWidth: `${boxWidth}px`,
        minHeight: `${boxHeight}px`,
        maxWidth: `${boxWidth}px`,
        maxHeight: `${boxHeight}px`,
        overflow: 'hidden',
        borderRadius: '8px',
        border: '1px solid #E2E8F0',
        backgroundColor: '#FFFFFF',
        padding: '4px 6px',
        boxSizing: 'border-box',
        flexShrink: 0,
        ...style,
      }}
      title={meta.officialBankName}
    >
      {resolvedSrc ? (
        <img
          src={resolvedSrc}
          alt={meta.officialBankName}
          onError={() => setFailed(true)}
          style={{
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
          loading="lazy"
        />
      ) : (
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>{meta.shortName}</span>
      )}
    </div>
  );
}
