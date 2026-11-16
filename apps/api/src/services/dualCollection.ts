import { type AutomationRunRecord, deepCleanFirestorePayload } from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { DEV_DATA_STORE } from './devStore';

export type DevMapKey =
  | 'departments'
  | 'designations'
  | 'founderSeats'
  | 'employees'
  | 'subscriptionPlans'
  | 'labSubscriptions'
  | 'invoices'
  | 'paymentRecords'
  | 'reconciliationAlerts'
  | 'expenses'
  | 'budgets'
  | 'refunds'
  | 'onboarding'
  | 'verificationReviews'
  | 'training'
  | 'supportTickets'
  | 'operationalExceptions'
  | 'leads'
  | 'campaigns'
  | 'healthChecks'
  | 'backups'
  | 'techIssues'
  | 'serviceZones';

const COLLECTION_TO_DEV_MAP: Record<string, DevMapKey> = {
  departments: 'departments',
  designations: 'designations',
  founder_seats: 'founderSeats',
  employees: 'employees',
  subscription_plans: 'subscriptionPlans',
  lab_subscriptions: 'labSubscriptions',
  invoices: 'invoices',
  payment_records: 'paymentRecords',
  reconciliation_alerts: 'reconciliationAlerts',
  expenses: 'expenses',
  financial_budgets: 'budgets',
  refund_requests: 'refunds',
  onboarding_records: 'onboarding',
  verification_reviews: 'verificationReviews',
  training_records: 'training',
  support_tickets: 'supportTickets',
  operational_exceptions: 'operationalExceptions',
  leads: 'leads',
  campaigns: 'campaigns',
  system_health_checks: 'healthChecks',
  backup_records: 'backups',
  tech_issues: 'techIssues',
  service_zones: 'serviceZones',
};

export async function dualList<T>(collectionName: string, limit = 300): Promise<T[]> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection(collectionName).limit(limit).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
  }
  const mapKey = COLLECTION_TO_DEV_MAP[collectionName];
  if (!mapKey) return [];
  const map = DEV_DATA_STORE[mapKey] as unknown as Map<string, T>;
  return Array.from(map.values()).slice(0, limit);
}

export async function dualGet<T>(collectionName: string, docId: string): Promise<T | null> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection(collectionName).doc(docId).get();
    return snap.exists ? ({ id: snap.id, ...snap.data() } as T) : null;
  }
  const mapKey = COLLECTION_TO_DEV_MAP[collectionName];
  if (!mapKey) return null;
  const map = DEV_DATA_STORE[mapKey] as unknown as Map<string, T>;
  return map.get(docId) || null;
}

export async function dualSet<T extends Record<string, any>>(
  collectionName: string,
  docId: string,
  value: T,
  merge = false
): Promise<void> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db.collection(collectionName).doc(docId).set(deepCleanFirestorePayload(value), { merge });
  }
  const mapKey = COLLECTION_TO_DEV_MAP[collectionName];
  if (mapKey) {
    const map = DEV_DATA_STORE[mapKey] as unknown as Map<string, T>;
    const existing = map.get(docId);
    map.set(docId, merge && existing ? { ...existing, ...value } : value);
  }
}

export async function dualDelete(collectionName: string, docId: string): Promise<void> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db.collection(collectionName).doc(docId).delete();
  }
  const mapKey = COLLECTION_TO_DEV_MAP[collectionName];
  if (mapKey) {
    const map = DEV_DATA_STORE[mapKey] as unknown as Map<string, unknown>;
    map.delete(docId);
  }
}

export async function recordDualAutomationRun(run: AutomationRunRecord): Promise<void> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db.collection('automation_runs').doc(run.id).set(deepCleanFirestorePayload(run));
  }
  DEV_DATA_STORE.automationRuns.unshift(run);
  if (DEV_DATA_STORE.automationRuns.length > 200) DEV_DATA_STORE.automationRuns.length = 200;
}
