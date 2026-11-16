import { type WeeklyVolumeBarItem } from '../../dashboards/types';

export interface WeeklyVolumeBarCardProps {
  title: string;
  bars: WeeklyVolumeBarItem[];
  barColor?: string;
}

export function WeeklyVolumeBarCard({
  title,
  bars,
  barColor = '#0D9488',
}: WeeklyVolumeBarCardProps) {
  const maxCount = Math.max(1, ...bars.map((b) => b.count));

  return (
    <div className="chart-card-modern">
      <h2 className="card-top-title">{title}</h2>
      <div
        style={{
          padding: '24px 0',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '18px',
          height: '220px',
          borderBottom: '1px solid #E2E8F0',
        }}
      >
        {bars.map((bar) => (
          <div
            key={bar.day}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{bar.count}</span>
            <div
              style={{
                width: '100%',
                maxWidth: '42px',
                height: `${Math.max(6, (bar.count / maxCount) * 150)}px`,
                background: barColor,
                borderRadius: '6px 6px 0 0',
              }}
            />
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{bar.day}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
