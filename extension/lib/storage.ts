/**
 * chrome.storage.local persistence. Data is keyed by semester label and merged
 * incrementally: re-capturing a course replaces its options; the course-list
 * page only *discovers* courses (never overwrites captured options).
 */

import { browser } from 'wxt/browser';
import type { CaptureCourse, CaptureDataset, DiscoveredCourse, ParseIssue } from './schema';

export interface ExcludedCourse {
  code: string;
  title: string;
  excludedAt: string;
}

export interface SemesterState {
  semesterLabel: string;
  campus: string;
  sourceUrl?: string;
  discovered: Record<string, DiscoveredCourse>;
  captured: Record<string, CaptureCourse>;
  /** Courses the student opened by mistake and removed — never re-captured until restored. */
  excluded: Record<string, ExcludedCourse>;
  lastUpdated: string;
}

export interface Settings {
  backendUrl: string;
}

export const DEFAULT_SETTINGS: Settings = { backendUrl: 'http://localhost:5000' };

const semesterKey = (label: string) => `semester:${label}`;

export function emptyState(semesterLabel: string): SemesterState {
  return {
    semesterLabel,
    campus: 'VIT_BHOPAL',
    discovered: {},
    captured: {},
    excluded: {},
    lastUpdated: new Date().toISOString(),
  };
}

/** Pure merge: a freshly parsed course detail replaces that course's options. Excluded courses are ignored. */
export function mergeCapturedCourse(state: SemesterState, course: CaptureCourse): SemesterState {
  if (state.excluded[course.code]) return state;
  return {
    ...state,
    captured: { ...state.captured, [course.code]: course },
    lastUpdated: new Date().toISOString(),
  };
}

/** Pure merge: discovered courses are added/refreshed, captured data untouched. Excluded courses are ignored. */
export function mergeDiscovered(state: SemesterState, courses: DiscoveredCourse[]): SemesterState {
  const discovered = { ...state.discovered };
  for (const c of courses) {
    if (state.excluded[c.code]) continue;
    discovered[c.code] = c;
  }
  return { ...state, discovered, lastUpdated: new Date().toISOString() };
}

/**
 * Remove a course the student opened by mistake. It disappears from the
 * checklist immediately and is ignored by future captures/discoveries on the
 * same course code until restoreCourse() is called.
 */
export function excludeCourse(state: SemesterState, code: string): SemesterState {
  const title = state.captured[code]?.title ?? state.discovered[code]?.title ?? code;
  const captured = { ...state.captured };
  const discovered = { ...state.discovered };
  delete captured[code];
  delete discovered[code];
  return {
    ...state,
    captured,
    discovered,
    excluded: { ...state.excluded, [code]: { code, title, excludedAt: new Date().toISOString() } },
    lastUpdated: new Date().toISOString(),
  };
}

/** Undo an exclusion. The course reappears once its page is opened/re-parsed. */
export function restoreCourse(state: SemesterState, code: string): SemesterState {
  const excluded = { ...state.excluded };
  delete excluded[code];
  return { ...state, excluded, lastUpdated: new Date().toISOString() };
}

export type CourseStatus = 'captured' | 'stale' | 'pending';

export const STALE_AFTER_MS = 10 * 60 * 1000;

export function courseStatus(state: SemesterState, code: string, now = Date.now()): CourseStatus {
  const captured = state.captured[code];
  if (!captured) return 'pending';
  const at = captured.options[0]?.capturedAt;
  if (at && now - new Date(at).getTime() > STALE_AFTER_MS) return 'stale';
  return 'captured';
}

/** Build the exportable CaptureDataset from a semester's state. */
export function buildDataset(state: SemesterState): CaptureDataset {
  const courses: CaptureCourse[] = [];
  const codes = new Set([...Object.keys(state.captured), ...Object.keys(state.discovered)]);

  for (const code of Array.from(codes).sort()) {
    if (state.excluded[code]) continue; // defensive: merges already keep excluded courses out
    const captured = state.captured[code];
    const discovered = state.discovered[code];
    if (captured) {
      courses.push({
        ...captured,
        // enrich with dashboard-only fields when the detail page lacked them
        category: captured.category || discovered?.category,
        courseType: captured.courseType || discovered?.courseType,
      });
    } else if (discovered) {
      courses.push({
        code: discovered.code,
        title: discovered.title,
        courseType: discovered.courseType,
        credits: discovered.credits,
        category: discovered.category,
        slotless: false,
        options: [],
      });
    }
  }

  return {
    schemaVersion: 1,
    campus: state.campus,
    semesterLabel: state.semesterLabel,
    capturedAt: new Date().toISOString(),
    sourceUrl: state.sourceUrl,
    courses,
  };
}

// ---------- storage IO ----------

export async function loadSemester(label: string): Promise<SemesterState> {
  const key = semesterKey(label);
  const result = await browser.storage.local.get(key);
  const stored = result[key] as Partial<SemesterState> | undefined;
  if (!stored) return emptyState(label);
  // Back-compat: state saved before `excluded` existed.
  return { ...emptyState(label), ...stored, excluded: stored.excluded ?? {} };
}

export async function saveSemester(state: SemesterState): Promise<void> {
  await browser.storage.local.set({
    [semesterKey(state.semesterLabel)]: state,
    activeSemester: state.semesterLabel,
  });
}

export async function getActiveSemesterLabel(): Promise<string | null> {
  const result = await browser.storage.local.get('activeSemester');
  return (result.activeSemester as string | undefined) ?? null;
}

export async function clearSemester(label: string): Promise<void> {
  await browser.storage.local.remove(semesterKey(label));
}

export async function addParseIssue(issue: ParseIssue): Promise<void> {
  const result = await browser.storage.local.get('parseIssues');
  const issues = ((result.parseIssues as ParseIssue[] | undefined) ?? []).slice(-49);
  issues.push(issue);
  await browser.storage.local.set({ parseIssues: issues });
}

export async function getParseIssues(): Promise<ParseIssue[]> {
  const result = await browser.storage.local.get('parseIssues');
  return (result.parseIssues as ParseIssue[] | undefined) ?? [];
}

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...((result.settings as Partial<Settings> | undefined) ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}
