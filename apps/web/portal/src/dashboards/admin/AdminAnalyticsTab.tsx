import { WeeklyVolumeBarCard } from '../../components/shared';
import { type WeeklyVolumeBarItem } from '../types';

export interface AdminAnalyticsTabProps {
  weeklyBars: WeeklyVolumeBarItem[];
}

export function AdminAnalyticsTab({ weeklyBars }: AdminAnalyticsTabProps) {
  return (
    <WeeklyVolumeBarCard
      title="Live Weekday Booking Volume"
      bars={weeklyBars}
    />
  );
}
