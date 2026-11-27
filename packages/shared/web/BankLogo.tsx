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
  className?: string;
  style?: CSSProperties;
}

/**
 * Centralized BankLogo component for React web applications.
 * Resolves the verified bank identity from @diagnostic/shared and renders
 * the authentic local PNG asset with neutral fallback and preserved aspect ratio.
 */
export function BankLogo({
  bankCode,
  ifsc,
  bankName,
  size = 40,
  className = '',
  style,
}: BankLogoProps) {
  const [failed, setFailed] = useState(false);
  const meta = getBankBrandMeta(ifsc || bankCode || bankName || undefined);
  const fallbackSrc = BANK_LOGO_ASSETS['../assets/banks/other-banks.png'] || '';
  const resolvedSrc = failed
    ? fallbackSrc
    : BANK_LOGO_ASSETS[`../assets/banks/${meta.logoAsset}`] || fallbackSrc;

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xs ${className}`}
      style={{ width: size, height: size, ...style }}
      title={meta.officialBankName}
    >
      {resolvedSrc ? (
        <img
          src={resolvedSrc}
          alt={meta.officialBankName}
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      ) : (
        <span className="text-[10px] font-bold text-slate-600">{meta.shortName}</span>
      )}
    </div>
  );
}
