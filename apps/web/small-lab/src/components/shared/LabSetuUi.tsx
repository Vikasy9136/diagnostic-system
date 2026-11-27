import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface LabButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  loading?: boolean;
  icon?: ReactNode;
}

export function LabButton({
  variant = 'primary',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: LabButtonProps) {
  const cls =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'secondary'
        ? 'btn-secondary'
        : variant === 'outline'
          ? 'btn-outline'
          : variant === 'ghost'
            ? 'btn-ghost'
            : variant === 'danger'
              ? 'btn-danger'
              : 'btn-success';

  return (
    <button
      type="button"
      className={`${cls} ${className}`.trim()}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span aria-hidden="true">⏳</span> : icon}
      <span>{children}</span>
    </button>
  );
}

export function LabBadge({
  tone = 'neutral',
  children,
}: {
  tone?: 'teal' | 'green' | 'amber' | 'red' | 'blue' | 'neutral';
  children: ReactNode;
}) {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    teal: { bg: '#F0FDFA', fg: '#0F766E', border: '#99F6E4' },
    green: { bg: '#DCFCE7', fg: '#15803D', border: '#86EFAC' },
    amber: { bg: '#FEF3C7', fg: '#B45309', border: '#FDE68A' },
    red: { bg: '#FEE2E2', fg: '#B91C1C', border: '#FCA5A5' },
    blue: { bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE' },
    neutral: { bg: '#F1F5F9', fg: '#475569', border: '#CBD5E1' },
  };
  const c = palette[tone] || palette.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: '999px',
        fontSize: '0.73rem',
        fontWeight: 700,
        backgroundColor: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function LabStatCard({
  title,
  value,
  subtitle,
  icon,
  onClick,
}: {
  title: string;
  value: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className="kpi-card-modern"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="kpi-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <span className="kpi-title">{title}</span>
          {icon && <span style={{ fontSize: '1.1rem' }}>{icon}</span>}
        </div>
        <span className="kpi-main-number">{value}</span>
        {subtitle && <span className="kpi-sub-split">{subtitle}</span>}
      </div>
    </div>
  );
}

export function LabSkeleton({ height = 20, width = '100%' }: { height?: number; width?: string | number }) {
  return <div className="ls-skeleton" style={{ height, width }} aria-hidden="true" />;
}
