import { OrderStatus, PickupOrder } from '../types/order.js';

export function formatInr(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `₹${safe.toLocaleString('en-IN')}`;
}

export function isOrderCompleted(status: OrderStatus): boolean {
  return status === OrderStatus.REPORT_UPLOADED || status === OrderStatus.COMPLETED;
}

export function isOrderInProgress(status: OrderStatus): boolean {
  return (
    status === OrderStatus.PICKED_UP ||
    status === OrderStatus.IN_TRANSIT ||
    status === OrderStatus.DELIVERED_TO_LAB ||
    status === OrderStatus.UNDER_ANALYSIS
  );
}

export function isOrderPendingOrAssigned(status: OrderStatus): boolean {
  return (
    status === OrderStatus.CREATED ||
    status === OrderStatus.READY_FOR_PICKUP ||
    status === OrderStatus.ASSIGNED_TO_PHLEBO
  );
}

export interface OrderTrendBucket {
  dateKey: string;
  label: string;
  total: number;
  completed: number;
}

export function computeBookingTrendPoints(
  orders: PickupOrder[],
  daysCount: number = 10
): OrderTrendBucket[] {
  const buckets: OrderTrendBucket[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = daysCount - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}`;
    const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    buckets.push({ dateKey: key, label, total: 0, completed: 0 });
  }

  const bucketMap = new Map(buckets.map((b) => [b.dateKey, b]));
  for (const order of orders) {
    const parsed = new Date(order.createdAt);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(
      parsed.getDate()
    ).padStart(2, '0')}`;
    const target = bucketMap.get(key);
    if (target) {
      target.total += 1;
      if (isOrderCompleted(order.status)) {
        target.completed += 1;
      }
    }
  }

  return buckets;
}

export interface OrderStatusBreakdown {
  total: number;
  completed: number;
  inProgress: number;
  assigned: number;
  rejected: number;
  cancelled: number;
  completedPct: string;
  inProgressPct: string;
  assignedPct: string;
  rejectedPct: string;
  cancelledPct: string;
}

export function computeStatusBreakdown(orders: PickupOrder[]): OrderStatusBreakdown {
  const total = orders.length;
  let completed = 0;
  let inProgress = 0;
  let assigned = 0;
  let rejected = 0;
  let cancelled = 0;

  for (const o of orders) {
    if (isOrderCompleted(o.status)) completed += 1;
    else if (isOrderInProgress(o.status)) inProgress += 1;
    else if (isOrderPendingOrAssigned(o.status)) assigned += 1;
    else if (o.status === OrderStatus.REJECTED) rejected += 1;
    else if (o.status === OrderStatus.CANCELLED) cancelled += 1;
  }

  const pct = (count: number) => (total === 0 ? '0.0%' : `${((count / total) * 100).toFixed(1)}%`);

  return {
    total,
    completed,
    inProgress,
    assigned,
    rejected,
    cancelled,
    completedPct: pct(completed),
    inProgressPct: pct(inProgress),
    assignedPct: pct(assigned),
    rejectedPct: pct(rejected),
    cancelledPct: pct(cancelled),
  };
}

export interface DailyVolumeBar {
  day: string;
  count: number;
  amountInr: number;
}

export function computeDailyVolumeBars(orders: PickupOrder[]): DailyVolumeBar[] {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const orderedLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const map = new Map<string, DailyVolumeBar>(
    orderedLabels.map((day) => [day, { day, count: 0, amountInr: 0 }])
  );

  for (const o of orders) {
    const parsed = new Date(o.createdAt);
    if (Number.isNaN(parsed.getTime())) continue;
    const label = dayNames[parsed.getDay()];
    const entry = map.get(label);
    if (entry) {
      entry.count += 1;
      entry.amountInr += o.totalAmountInr || 0;
    }
  }

  return orderedLabels.map((d) => map.get(d)!);
}

