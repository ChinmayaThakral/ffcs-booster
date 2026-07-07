/**
 * Parser for the dashboard / course-list page: per-group tables of
 * Course Code | Course Title | Course Type | Credits | [View][Register].
 *
 * NOTE: built from the master-prompt description; no saved fixture of the real
 * dashboard exists yet. Verify against the live/mock portal and update
 * docs/PORTAL_NOTES.md + fixtures when real markup is available.
 */

import type { DiscoveredCourse } from '../lib/schema';
import { cellText, dataRows, hasHeaders, headerIndex, tablesWithHeaders } from './common';

const GROUP_CODES = [
  'PC', 'PE', 'UCNSC', 'UCBESC', 'UCSDC', 'UCHSSMC', 'UCPI',
  'UENSE', 'UEME', 'UEHSSME', 'UEOE',
];

function findCategoryFor(table: HTMLTableElement): string {
  // Walk previous siblings, then ancestors' previous siblings, looking for a
  // short text block naming a known course group.
  let node: Element | null = table;
  for (let depth = 0; depth < 4 && node; depth++) {
    let sib: Element | null = node.previousElementSibling;
    let hops = 0;
    while (sib && hops < 6) {
      const text = (sib.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text.length > 0 && text.length < 120) {
        const upper = text.toUpperCase();
        for (const g of GROUP_CODES) {
          if (new RegExp(`(^|[^A-Z])${g}([^A-Z]|$)`).test(upper)) return g;
        }
        if (/OPEN\s+ELECTIVE/.test(upper)) return 'OPEN_ELECTIVE';
        if (/RE-?REGISTRATION/.test(upper)) return 'RE_REGISTRATION';
      }
      sib = sib.previousElementSibling;
      hops++;
    }
    node = node.parentElement;
  }
  return '';
}

export function detectCourseListPage(doc: Document): boolean {
  return tablesWithHeaders(doc).some(
    (t) =>
      hasHeaders(t, ['course code', 'course title', 'course type']) &&
      !hasHeaders(t, ['slot', 'venue', 'faculty'])
  );
}

export function parseCourseListPage(doc: Document): DiscoveredCourse[] {
  const now = new Date().toISOString();
  const discovered: DiscoveredCourse[] = [];
  const seen = new Set<string>();

  for (const ht of tablesWithHeaders(doc)) {
    if (!hasHeaders(ht, ['course code', 'course title', 'course type'])) continue;
    if (hasHeaders(ht, ['slot', 'venue', 'faculty'])) continue;

    const codeIdx = headerIndex(ht, 'course code');
    const titleIdx = headerIndex(ht, 'course title');
    const typeIdx = headerIndex(ht, 'course type');
    const creditsIdx = headerIndex(ht, 'credits');
    const category = findCategoryFor(ht.table);

    for (const row of dataRows(ht.table)) {
      const code = cellText(row[codeIdx]).toUpperCase();
      if (!/^[A-Z0-9]{4,12}$/.test(code) || seen.has(code)) continue;
      const title = cellText(row[titleIdx]);
      if (!title) continue;

      const creditsText = creditsIdx >= 0 ? cellText(row[creditsIdx]) : '';
      const entry: DiscoveredCourse = {
        code,
        title,
        courseType: typeIdx >= 0 ? cellText(row[typeIdx]) : undefined,
        category: category || undefined,
        discoveredAt: now,
      };
      if (/^\d+$/.test(creditsText)) entry.credits = parseInt(creditsText, 10);

      seen.add(code);
      discovered.push(entry);
    }
  }

  return discovered;
}
