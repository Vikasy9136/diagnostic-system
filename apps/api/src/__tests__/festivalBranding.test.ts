import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SEASONAL_BRANDING_DOC,
  type FestivalBrandingConfig,
  findOverlappingFestivals,
  parseZonedDateTimeToEpochMs,
  resolveActiveFestivalBranding,
  type SeasonalBrandingDocument,
  validateFestivalSchedule,
} from '@diagnostic/shared';

function makeFestival(overrides: Partial<FestivalBrandingConfig> = {}): FestivalBrandingConfig {
  return {
    id: 'diwali_2026',
    festivalKey: 'diwali',
    festivalName: 'Diwali 2026',
    startDate: '2026-11-08',
    startTime: '00:00',
    endDate: '2026-11-12',
    endTime: '23:59',
    timezone: 'Asia/Kolkata',
    isActive: true,
    priority: 10,
    description: 'Diwali festival theme',
    createdBy: 'admin@labsetu.com',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

test('returns DEFAULT branding when no festivals are scheduled', () => {
  const res = resolveActiveFestivalBranding(DEFAULT_SEASONAL_BRANDING_DOC, Date.now());
  assert.equal(res.status, 'DEFAULT');
  assert.equal(res.resolvedIconKey, 'default');
  assert.equal(res.androidAliasKey, 'default');
  assert.equal(res.webFaviconPath, '/favicon-32x32.png');
});

test('activates festival within Asia/Kolkata schedule and restores default after expiration', () => {
  const doc: SeasonalBrandingDocument = {
    version: 2,
    forceDefaultBranding: false,
    festivals: [makeFestival()],
    updatedAt: '2026-11-01T10:00:00.000Z',
    updatedBy: 'admin@labsetu.com',
  };

  const duringMs = parseZonedDateTimeToEpochMs('2026-11-09', '14:30', 'Asia/Kolkata')!;
  const activeRes = resolveActiveFestivalBranding(doc, duringMs);
  assert.equal(activeRes.status, 'ACTIVE_FESTIVAL');
  assert.equal(activeRes.resolvedIconKey, 'diwali');
  assert.equal(activeRes.androidAliasKey, 'diwali');
  assert.equal(activeRes.webFaviconPath, '/festivals/diwali/favicon-32x32.png');

  const afterMs = parseZonedDateTimeToEpochMs('2026-11-13', '00:05', 'Asia/Kolkata')!;
  const expiredRes = resolveActiveFestivalBranding(doc, afterMs);
  assert.equal(expiredRes.status, 'DEFAULT');
  assert.equal(expiredRes.resolvedIconKey, 'default');
  assert.equal(expiredRes.expiredFestivals.length, 1);
});

test('resolves overlapping festivals strictly by highest priority', () => {
  const diwali = makeFestival({ id: 'diwali', festivalKey: 'diwali', priority: 10 });
  const newYear = makeFestival({
    id: 'new_year',
    festivalKey: 'new-year',
    festivalName: 'Special Event',
    priority: 50,
  });
  const doc: SeasonalBrandingDocument = {
    version: 3,
    forceDefaultBranding: false,
    festivals: [diwali, newYear],
    updatedAt: '2026-11-01T10:00:00.000Z',
    updatedBy: 'admin@labsetu.com',
  };

  const overlaps = findOverlappingFestivals(doc.festivals, diwali);
  assert.equal(overlaps.length, 1);
  assert.equal(overlaps[0].id, 'new_year');

  const duringMs = parseZonedDateTimeToEpochMs('2026-11-09', '12:00', 'Asia/Kolkata')!;
  const res = resolveActiveFestivalBranding(doc, duringMs);
  assert.equal(res.resolvedIconKey, 'new-year');
  assert.equal(res.androidAliasKey, 'new-year');
});

test('forceDefaultBranding overrides active festivals', () => {
  const doc: SeasonalBrandingDocument = {
    version: 4,
    forceDefaultBranding: true,
    festivals: [makeFestival()],
    updatedAt: '2026-11-09T10:00:00.000Z',
    updatedBy: 'admin@labsetu.com',
  };
  const duringMs = parseZonedDateTimeToEpochMs('2026-11-09', '14:00', 'Asia/Kolkata')!;
  const res = resolveActiveFestivalBranding(doc, duringMs);
  assert.equal(res.status, 'DEFAULT');
  assert.equal(res.resolvedIconKey, 'default');
});

test('custom uploaded icon updates web favicon while Android launcher falls back to default', () => {
  const custom = makeFestival({
    id: 'custom_1',
    festivalKey: 'custom',
    festivalName: 'Foundation Day',
    iconAssetUrl: 'https://storage.googleapis.com/labsetu/brand-icons/custom.png',
  });
  const doc: SeasonalBrandingDocument = {
    version: 5,
    forceDefaultBranding: false,
    festivals: [custom],
    updatedAt: '2026-11-01T10:00:00.000Z',
    updatedBy: 'admin@labsetu.com',
  };
  const duringMs = parseZonedDateTimeToEpochMs('2026-11-09', '14:00', 'Asia/Kolkata')!;
  const res = resolveActiveFestivalBranding(doc, duringMs);
  assert.equal(res.resolvedIconKey, 'custom');
  assert.equal(res.androidAliasKey, 'default');
  assert.equal(res.webFaviconPath, 'https://storage.googleapis.com/labsetu/brand-icons/custom.png');
});

test('rejects invalid date range where end <= start', () => {
  const bad = validateFestivalSchedule(
    makeFestival({ startDate: '2026-11-12', startTime: '12:00', endDate: '2026-11-10', endTime: '12:00' })
  );
  assert.equal(bad.valid, false);
});
