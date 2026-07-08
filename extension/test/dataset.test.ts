import { fakeBrowser } from '@webext-core/fake-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { CaptureDatasetSchema } from '../lib/schema';
import {
  buildDataset,
  courseStatus,
  emptyState,
  excludeCourse,
  loadSemester,
  mergeCapturedCourse,
  mergeDiscovered,
  restoreCourse,
  saveSemester,
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

  it('a fresh capture of the same course replaces stale seat counts (rapid seat churn)', () => {
    const firstVisit = parseViewSlotsPage(loadFixture('CSA3006.html'))!;
    expect(firstVisit.options[0].seats).toBe(0); // ground truth from the fixture
    expect(firstVisit.options[1].seats).toBe(84);

    // Simulate coming back to the same course after seats moved around
    const secondVisit = {
      ...firstVisit,
      options: firstVisit.options.map((o) => ({ ...o, seats: 999 })),
    };

    let state = emptyState('X');
    state = mergeCapturedCourse(state, firstVisit);
    state = mergeCapturedCourse(state, secondVisit);

    const finalOptions = buildDataset(state).courses[0].options;
    expect(finalOptions).toHaveLength(11);
    // every option now reflects the newer visit's seat count, not the stale first one
    expect(finalOptions.every((o) => o.seats === 999)).toBe(true);
  });
});

describe('curating captured courses (remove / restore)', () => {
  it('removing a course drops it from both discovered and captured', () => {
    let state = emptyState('X');
    state = mergeDiscovered(state, [
      { code: 'HUM1001', title: 'ETHICS', discoveredAt: new Date().toISOString() },
    ]);
    state = mergeCapturedCourse(state, parseViewSlotsPage(loadFixture('CSA3006.html'))!);

    state = excludeCourse(state, 'CSA3006');
    state = excludeCourse(state, 'HUM1001');

    expect(state.captured.CSA3006).toBeUndefined();
    expect(state.discovered.HUM1001).toBeUndefined();
    expect(buildDataset(state).courses).toHaveLength(0);
    expect(Object.keys(state.excluded).sort()).toEqual(['CSA3006', 'HUM1001']);
    expect(state.excluded.CSA3006.title).toBe('DATA MINING AND DATA WAREHOUSING');
  });

  it('a removed course is ignored by future captures and discoveries (never comes back on its own)', () => {
    let state = emptyState('X');
    const course = parseViewSlotsPage(loadFixture('CSA3006.html'))!;
    state = mergeCapturedCourse(state, course);
    state = excludeCourse(state, 'CSA3006');

    // student accidentally reopens the same course's page
    state = mergeCapturedCourse(state, course);
    expect(state.captured.CSA3006).toBeUndefined();

    // and it reappears on the dashboard too
    state = mergeDiscovered(state, [
      { code: 'CSA3006', title: 'DATA MINING AND DATA WAREHOUSING', discoveredAt: new Date().toISOString() },
    ]);
    expect(state.discovered.CSA3006).toBeUndefined();
    expect(buildDataset(state).courses).toHaveLength(0);
  });

  it('restoring a course lets it be captured again', () => {
    let state = emptyState('X');
    const course = parseViewSlotsPage(loadFixture('CSA3006.html'))!;
    state = mergeCapturedCourse(state, course);
    state = excludeCourse(state, 'CSA3006');
    state = restoreCourse(state, 'CSA3006');

    expect(state.excluded.CSA3006).toBeUndefined();
    state = mergeCapturedCourse(state, course);
    expect(state.captured.CSA3006).toBeDefined();
    expect(buildDataset(state).courses).toHaveLength(1);
  });
});

describe('storage IO (fake chrome.storage.local)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('round-trips a semester through storage', async () => {
    let state = emptyState('WINTER SEMESTER 2025-26');
    state = mergeCapturedCourse(state, parseViewSlotsPage(loadFixture('CSA3006.html'))!);
    state = excludeCourse(state, 'CSA3006');
    await saveSemester(state);

    const loaded = await loadSemester('WINTER SEMESTER 2025-26');
    expect(loaded.excluded.CSA3006).toBeDefined();
    expect(loaded.captured.CSA3006).toBeUndefined();
  });

  it('back-fills excluded:{} when loading state saved before that field existed', async () => {
    const legacyState = {
      semesterLabel: 'X',
      campus: 'VIT_BHOPAL',
      discovered: {},
      captured: {},
      lastUpdated: new Date().toISOString(),
      // no `excluded` key — simulates data captured before this feature shipped
    };
    await fakeBrowser.storage.local.set({ 'semester:X': legacyState });

    const loaded = await loadSemester('X');
    expect(loaded.excluded).toEqual({});
    // and the loaded state is safe to pass into excludeCourse etc.
    const next = excludeCourse(loaded, 'CSA3006');
    expect(next.excluded.CSA3006).toBeDefined();
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
