import { WeeklyVolumeBarCard } from '../../components/shared';
import { type WeeklyVolumeBarItem } from '../types';

export interface LargeLabAnalyticsTabProps {
  weeklyBars: WeeklyVolumeBarItem[];
}

export function LargeLabAnalyticsTab({ weeklyBars }: LargeLabAnalyticsTabProps) {
  return (
    <WeeklyVolumeBarCard
      title="Weekly Specimen Volume & Turnaround (Live)"
      bars={weeklyBars}
      barColor="#0D9488"
    />
  );
}

