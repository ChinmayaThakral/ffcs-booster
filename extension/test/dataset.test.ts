import { describe, expect, it } from 'vitest';
import { CaptureDatasetSchema } from '../lib/schema';
import {
  buildDataset,
  courseStatus,
  emptyState,
  mergeCapturedCourse,
  mergeDiscovered,
  STALE_AFTER_MS,
} from '../lib/storage';
import { parseViewSlotsPage } from '../parsers/viewSlotsPage';
import { parseCourseListPage } from '../parsers/courseListPage';
import { semesterLabelFromUrl } from '../parsers/registry';
import { loadFixture } from './helpers';

describe('semester state merging', () => {
  it('discovery then capture yields a schema-valid dataset', () => {
    let state = emptyState('WINTER SEMESTER 2025-26');
    state = mergeDiscovered(state, parseCourseListPage(loadFixture('dashboard.html')));
    state = mergeCapturedCourse(state, parseViewSlotsPage(loadFixture('CSA3006.html'))!);

    const dataset = buildDataset(state);
    expect(() => CaptureDatasetSchema.parse(dataset)).not.toThrow();

    // 3 discovered, 1 captured -> 3 courses total, CSA3006 with options
    expect(dataset.courses).toHaveLength(3);
    const csa = dataset.courses.find((c) => c.code === 'CSA3006')!;
    expect(csa.options).toHaveLength(11);
    // category comes from the dashboard even though the detail page lacks it
    expect(csa.category).toBe('PC');
    // never-opened courses are present with zero options (the checklist's ⬜ rows)
    expect(dataset.courses.find((c) => c.code === 'HUM1001')!.options).toHaveLength(0);
  });

  it('re-capturing a course replaces its options (no duplicates)', () => {
    const course = parseViewSlotsPage(loadFixture('CSA3006.html'))!;
    let state = emptyState('X');
    state = mergeCapturedCourse(state, course);
    state = mergeCapturedCourse(state, course);
    expect(buildDataset(state).courses[0].options).toHaveLength(11);
  });

  it('tracks capture status including staleness', () => {
    const course = parseViewSlotsPage(loadFixture('CSA3006.html'))!;
    let state = emptyState('X');
    state = mergeDiscovered(state, [
      { code: 'HUM1001', title: 'ETHICS', discoveredAt: new Date().toISOString() },
    ]);
    state = mergeCapturedCourse(state, course);

    expect(courseStatus(state, 'HUM1001')).toBe('pending');
    expect(courseStatus(state, 'CSA3006')).toBe('captured');
    expect(courseStatus(state, 'CSA3006', Date.now() + STALE_AFTER_MS + 1000)).toBe('stale');
  });
});

describe('semesterLabelFromUrl', () => {
  it('extracts the winter label', () => {
    expect(
      semesterLabelFromUrl(
        'https://dev.vitbhopal.ac.in/WINTER%20SEMESTER%202025-26_ALL_registration/StudentLogin.aspx',
      ),
    ).toBe('WINTER SEMESTER 2025-26');
  });

  it('extracts the fall label', () => {
    expect(
      semesterLabelFromUrl('https://dev.vitbhopal.ac.in/Fall_Semester_26_27_ALL_registration/'),
    ).toBe('FALL SEMESTER 26 27');
  });

  it('returns null for non-registration urls', () => {
    expect(semesterLabelFromUrl('https://example.com/foo')).toBeNull();
  });
});
