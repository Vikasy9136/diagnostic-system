import { type DynamicAlertVariant } from '../components/DynamicAlertModal';

export type AlertTriggerFn = (opts: {
  variant: DynamicAlertVariant;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
}) => void;

export type FormatLabelFn = (raw?: string | null) => string;

export function formatDashboardLabel(raw?: string | null): string {
  if (!raw) return '—';
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .replace(/\bEdta\b/g, 'EDTA')
    .replace(/\bStat\b/g, 'STAT');
}

export interface CredentialSlipData {
  title?: string;
  headline?: string;
  name: string;
  email?: string;
  assignedIdLabel?: string;
  userCode: string;
  roleLabel: string;
  subInfo?: string;
  initialPassword?: string;
  passwordConfigured?: boolean;
  noPasswordMessage?: string;
}

export interface SidebarSubItem<TTab extends string = string> {
  id: TTab;
  label: string;
  path?: string;
}

export interface SidebarNavItem<TTab extends string = string> {
  id: TTab;
  icon: string;
  label: string;
  path?: string;
  sectionLabel?: string;
  badgeCount?: number;
  badgeVariant?: 'teal' | 'green' | 'red';
  activeMatchIds?: TTab[];
  subItems?: SidebarSubItem<TTab>[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export interface WeeklyVolumeBarItem {
  day: string;
  count: number;
}

export interface StatusBreakdownSummary {
  total: number;
  completed: number;
  inProgress: number;
  assigned: number;
}
