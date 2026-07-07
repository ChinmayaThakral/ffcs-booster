/** Page-detector registry: pure functions (Document) => parse result. */

import type { CaptureCourse, DiscoveredCourse } from '../lib/schema';
import { detectCourseListPage, parseCourseListPage } from './courseListPage';
import { detectViewSlotsPage, parseViewSlotsPage } from './viewSlotsPage';

export type PageParseResult =
  | { kind: 'view-slots'; course: CaptureCourse | null }
  | { kind: 'course-list'; discovered: DiscoveredCourse[] }
  | { kind: 'unknown' };

interface PageParser {
  kind: string;
  detect: (doc: Document) => boolean;
  parse: (doc: Document) => PageParseResult;
}

/** Ordered: most specific first. */
const registry: PageParser[] = [
  {
    kind: 'view-slots',
    detect: detectViewSlotsPage,
    parse: (doc) => ({ kind: 'view-slots', course: parseViewSlotsPage(doc) }),
  },
  {
    kind: 'course-list',
    detect: detectCourseListPage,
    parse: (doc) => ({ kind: 'course-list', discovered: parseCourseListPage(doc) }),
  },
];

export function parsePage(doc: Document): PageParseResult {
  for (const parser of registry) {
    if (parser.detect(doc)) return parser.parse(doc);
  }
  return { kind: 'unknown' };
}

/** "WINTER%20SEMESTER%202025-26_ALL_registration" -> "WINTER SEMESTER 2025-26" */
export function semesterLabelFromUrl(url: string): string | null {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    for (const segment of path.split('/')) {
      if (/registration/i.test(segment)) {
        const label = segment
          .replace(/_?all_?registration/i, '')
          .replace(/_?registration/i, '')
          .replace(/[_]+/g, ' ')
          .trim();
        if (label) return label.toUpperCase();
      }
    }
  } catch {
    // fall through
  }
  return null;
}

export function semesterLabelFromDocument(doc: Document): string | null {
  const text = doc.body?.textContent ?? '';
  const match = text.match(/(WINTER|FALL|SUMMER|INTERIM)[\s-]*SEMESTER[\s-]*([0-9]{2,4}\s*-\s*[0-9]{2,4})?/i);
  if (match) return match[0].replace(/\s+/g, ' ').trim().toUpperCase();
  return null;
}

export function resolveSemesterLabel(url: string, doc: Document): string {
  return semesterLabelFromUrl(url) ?? semesterLabelFromDocument(doc) ?? 'UNKNOWN SEMESTER';
}
