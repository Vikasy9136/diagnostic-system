export interface SlaCountdownBadgeProps {
  isSettled: boolean;
  settledLabel?: string;
  payoutDueAt?: string;
  completedAt?: string;
  windowMinutes?: number;
  nowMs: number;
  pendingFallbackLabel?: string;
}

export function SlaCountdownBadge({
  isSettled,
  settledLabel = '✓ Settled',
  payoutDueAt,
  completedAt,
  windowMinutes = 30,
  nowMs,
  pendingFallbackLabel,
}: SlaCountdownBadgeProps) {
  if (isSettled) {
    return <span className="sla-countdown-chip settled">{settledLabel}</span>;
  }

  const targetIso =
    payoutDueAt ||
    (completedAt
      ? new Date(new Date(completedAt).getTime() + windowMinutes * 60000).toISOString()
      : undefined);

  if (!targetIso) {
    return (
      <span className="sla-countdown-chip on-time">
        {pendingFallbackLabel || `⏱ ${windowMinutes}m SLA after drop`}
      </span>
    );
  }

  const diffMs = new Date(targetIso).getTime() - nowMs;
  if (Number.isNaN(diffMs)) {
    return (
      <span className="sla-countdown-chip on-time">
        ⏱ {windowMinutes}m Window
      </span>
    );
  }

  if (diffMs <= 0) {
    const overdueMins = Math.abs(Math.floor(diffMs / 60000));
    return (
      <span className="sla-countdown-chip due-now">
        ⚡ DUE NOW ({overdueMins}m{overdueMins > 0 ? ' overdue' : ''})
      </span>
    );
  }

  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  return (
    <span className={`sla-countdown-chip ${mins < 10 ? 'urgent' : 'on-time'}`}>
      ⚡ {mins}m {String(secs).padStart(2, '0')}s left
    </span>
  );
}

