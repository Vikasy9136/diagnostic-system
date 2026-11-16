import { type OrderStatusBreakdown } from '@diagnostic/shared';

export interface StatusDonutCardProps {
  title: string;
  centerLabel?: string;
  breakdown: OrderStatusBreakdown;
  labels?: {
    completed?: string;
    inProgress?: string;
    assigned?: string;
    rejected?: string;
  };
  showPercentages?: boolean;
}

const CIRCUMFERENCE = 301.6;

export function StatusDonutCard({
  title,
  centerLabel = 'Orders',
  breakdown,
  labels,
  showPercentages = true,
}: StatusDonutCardProps) {
  const totalSafe = Math.max(1, breakdown.total);
  const compLen = (breakdown.completed / totalSafe) * CIRCUMFERENCE;
  const progLen = (breakdown.inProgress / totalSafe) * CIRCUMFERENCE;
  const assignLen = (breakdown.assigned / totalSafe) * CIRCUMFERENCE;
  const rejLen = (breakdown.rejected / totalSafe) * CIRCUMFERENCE;

  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <span className="card-top-title">{title}</span>
      </div>
      <div className="donut-chart-layout">
        <div className="donut-svg-wrap">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="48" fill="none" stroke="#F1F5F9" strokeWidth="18" />
            {breakdown.total > 0 && (
              <>
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="18"
                  strokeDasharray={`${compLen} ${CIRCUMFERENCE}`}
                  strokeDashoffset="75"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="18"
                  strokeDasharray={`${progLen} ${CIRCUMFERENCE}`}
                  strokeDashoffset={75 - compLen}
                />
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="18"
                  strokeDasharray={`${assignLen} ${CIRCUMFERENCE}`}
                  strokeDashoffset={75 - compLen - progLen}
                />
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="18"
                  strokeDasharray={`${rejLen} ${CIRCUMFERENCE}`}
                  strokeDashoffset={75 - compLen - progLen - assignLen}
                />
              </>
            )}
          </svg>
          <div className="donut-center-label">
            <div className="donut-center-number">{breakdown.total}</div>
            <div className="donut-center-sub">{centerLabel}</div>
          </div>
        </div>

        <div className="donut-legend-list">
          <div className="donut-legend-item">
            <span className="donut-label-group">● {labels?.completed || 'Completed'}</span>
            <span className="donut-val-group">
              {breakdown.completed}{' '}
              {showPercentages && <span className="donut-pct-text">{breakdown.completedPct}</span>}
            </span>
          </div>
          <div className="donut-legend-item">
            <span className="donut-label-group">● {labels?.inProgress || 'In Progress'}</span>
            <span className="donut-val-group">
              {breakdown.inProgress}{' '}
              {showPercentages && <span className="donut-pct-text">{breakdown.inProgressPct}</span>}
            </span>
          </div>
          <div className="donut-legend-item">
            <span className="donut-label-group">● {labels?.assigned || 'Assigned/Open'}</span>
            <span className="donut-val-group">
              {breakdown.assigned}{' '}
              {showPercentages && <span className="donut-pct-text">{breakdown.assignedPct}</span>}
            </span>
          </div>
          <div className="donut-legend-item">
            <span className="donut-label-group">● {labels?.rejected || 'Rejected'}</span>
            <span className="donut-val-group">
              {breakdown.rejected}{' '}
              {showPercentages && <span className="donut-pct-text">{breakdown.rejectedPct}</span>}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
