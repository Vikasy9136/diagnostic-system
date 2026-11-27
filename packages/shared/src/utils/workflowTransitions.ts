import { OrderStatus } from '../types/order.js';

export const ALLOWED_PROCESSING_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.CREATED]: [OrderStatus.READY_FOR_PICKUP, OrderStatus.CANCELLED],
  [OrderStatus.READY_FOR_PICKUP]: [
    OrderStatus.ASSIGNED_TO_PHLEBO,
    OrderStatus.PICKED_UP,
    OrderStatus.DELIVERED_TO_LAB,
    OrderStatus.SAMPLE_RECEIVED_AT_CENTRE,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.ASSIGNED_TO_PHLEBO]: [
    OrderStatus.PICKED_UP,
    OrderStatus.ON_HOLD,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PICKED_UP]: [
    OrderStatus.IN_TRANSIT,
    OrderStatus.DELIVERED_TO_LAB,
    OrderStatus.SAMPLE_RECEIVED_AT_CENTRE,
    OrderStatus.ON_HOLD,
  ],
  [OrderStatus.IN_TRANSIT]: [
    OrderStatus.DELIVERED_TO_LAB,
    OrderStatus.SAMPLE_RECEIVED_AT_CENTRE,
    OrderStatus.ON_HOLD,
  ],
  [OrderStatus.DELIVERED_TO_LAB]: [
    OrderStatus.SAMPLE_RECEIVED_AT_CENTRE,
    OrderStatus.SAMPLE_IN_LAB,
    OrderStatus.UNDER_ANALYSIS,
    OrderStatus.INSUFFICIENT_SAMPLE,
    OrderStatus.RECOLLECTION_REQUIRED,
    OrderStatus.REJECTED,
    OrderStatus.ON_HOLD,
  ],
  [OrderStatus.SAMPLE_RECEIVED_AT_CENTRE]: [
    OrderStatus.SAMPLE_IN_LAB,
    OrderStatus.INSUFFICIENT_SAMPLE,
    OrderStatus.RECOLLECTION_REQUIRED,
    OrderStatus.REJECTED,
    OrderStatus.ON_HOLD,
  ],
  [OrderStatus.SAMPLE_IN_LAB]: [
    OrderStatus.UNDER_ANALYSIS,
    OrderStatus.INSUFFICIENT_SAMPLE,
    OrderStatus.RECOLLECTION_REQUIRED,
    OrderStatus.REJECTED,
    OrderStatus.ON_HOLD,
  ],
  [OrderStatus.UNDER_ANALYSIS]: [
    OrderStatus.PROCESSING_COMPLETED,
    OrderStatus.PROCESSING_FAILED,
    OrderStatus.INSUFFICIENT_SAMPLE,
    OrderStatus.RECOLLECTION_REQUIRED,
    OrderStatus.ON_HOLD,
  ],
  [OrderStatus.PROCESSING_COMPLETED]: [
    OrderStatus.REPORT_PENDING,
    OrderStatus.REPORT_UPLOADED,
    OrderStatus.REPORT_AVAILABLE_TO_SMALL_LAB,
  ],
  [OrderStatus.REPORT_PENDING]: [
    OrderStatus.REPORT_UPLOADED,
    OrderStatus.REPORT_AVAILABLE_TO_SMALL_LAB,
    OrderStatus.ON_HOLD,
  ],
  [OrderStatus.REPORT_UPLOADED]: [
    OrderStatus.REPORT_AVAILABLE_TO_SMALL_LAB,
    OrderStatus.COMPLETED,
  ],
  [OrderStatus.REPORT_AVAILABLE_TO_SMALL_LAB]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.INSUFFICIENT_SAMPLE]: [OrderStatus.RECOLLECTION_REQUIRED, OrderStatus.CANCELLED],
  [OrderStatus.RECOLLECTION_REQUIRED]: [
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.SAMPLE_RECEIVED_AT_CENTRE,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.ON_HOLD]: [
    OrderStatus.SAMPLE_IN_LAB,
    OrderStatus.UNDER_ANALYSIS,
    OrderStatus.PROCESSING_COMPLETED,
    OrderStatus.REPORT_PENDING,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PROCESSING_FAILED]: [OrderStatus.RECOLLECTION_REQUIRED, OrderStatus.CANCELLED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REJECTED]: [OrderStatus.RECOLLECTION_REQUIRED],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_PROCESSING_TRANSITIONS[from] || [];
  return allowed.includes(to);
}
