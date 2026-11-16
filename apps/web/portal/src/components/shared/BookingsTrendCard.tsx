import { type OrderTrendBucket } from '@diagnostic/shared';

export interface BookingsTrendCardProps {
  title: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  buckets: OrderTrendBucket[];
}

export function BookingsTrendCard({
  title,
  primaryLabel = 'Bookings',
  secondaryLabel = 'Completed',
  buckets,
}: BookingsTrendCardProps) {
  const trendMax = Math.max(4, ...buckets.map((b) => Math.max(b.total, b.completed)));
  const denom = Math.max(1, buckets.length - 1);

  const totalPolyline = buckets
    .map((b, i) => {
      const x = 35 + (i * 400) / denom;
      const y = 148 - (b.total / trendMax) * 124;
      return `${x},${y}`;
    })
    .join(' ');

  const completedPolyline = buckets
    .map((b, i) => {
      const x = 35 + (i * 400) / denom;
      const y = 148 - (b.completed / trendMax) * 124;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <span className="card-top-title">{title}</span>
        <div className="chart-legend-row">
          <span>
            <span className="legend-dot-teal" />
            {primaryLabel}
          </span>
          <span>
            <span className="legend-dot-blue" />
            {secondaryLabel}
          </span>
        </div>
      </div>
      <div style={{ height: '165px' }}>
        <svg width="100%" height="100%" viewBox="0 0 460 165" preserveAspectRatio="none">
          <line x1="30" y1="24" x2="445" y2="24" stroke="#F1F5F9" />
          <line x1="30" y1="66" x2="445" y2="66" stroke="#F1F5F9" />
          <line x1="30" y1="108" x2="445" y2="108" stroke="#F1F5F9" />
          <line x1="30" y1="148" x2="445" y2="148" stroke="#CBD5E1" />
          <text x="4" y="28" fontSize="10" fill="#94A3B8">
            {trendMax}
          </text>
          <text x="4" y="90" fontSize="10" fill="#94A3B8">
            {Math.round(trendMax / 2)}
          </text>
          <text x="10" y="151" fontSize="10" fill="#94A3B8">
            0
          </text>
          {buckets.length > 1 && (
            <>
              <polyline fill="none" stroke="#0D9488" strokeWidth="2.5" points={totalPolyline} />
              <polyline fill="none" stroke="#2563EB" strokeWidth="2.5" points={completedPolyline} />
            </>
          )}
        </svg>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          paddingLeft: '28px',
          fontSize: '10px',
          color: '#94A3B8',
        }}
      >
        {buckets.map((b) => (
          <span key={b.dateKey}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}
