/**
 * Parser for the "View / Register" course detail page:
 * one course-info table + one faculty-options table.
 * Matches the saved VTOP pages in test/fixtures (real portal output).
 */

import type { CaptureCourse, CaptureOption } from '../lib/schema';
import { optionId, parseSeats, parseSlotCombo } from '../lib/slots';
import { cellText, dataRows, hasHeaders, headerIndex, tablesWithHeaders, type HeaderTable } from './common';

function exactIndex(ht: HeaderTable, name: string): number {
  return ht.headers.indexOf(name);
}

export function detectViewSlotsPage(doc: Document): boolean {
  const tables = tablesWithHeaders(doc);
  const hasCourseTable = tables.some((t) => hasHeaders(t, ['course code', 'course title']));
  const hasOptionsTable = tables.some((t) => hasHeaders(t, ['slot', 'venue', 'faculty']));
  return hasCourseTable && hasOptionsTable;
}

export function parseViewSlotsPage(doc: Document): CaptureCourse | null {
  const tables = tablesWithHeaders(doc);

  const courseTable = tables.find((t) => hasHeaders(t, ['course code', 'course title']));
  const optionsTable = tables.find((t) => hasHeaders(t, ['slot', 'venue', 'faculty']));
  if (!courseTable || !optionsTable) return null;

  // --- course info ---
  const codeIdx = headerIndex(courseTable, 'course code');
  const titleIdx = headerIndex(courseTable, 'course title');
  // single-letter headers need exact matches (avoid "c" matching "course owner")
  const lIdx = exactIndex(courseTable, 'l');
  const tIdx = exactIndex(courseTable, 't');
  const pIdx = exactIndex(courseTable, 'p');
  const jIdx = exactIndex(courseTable, 'j');
  const cIdx = exactIndex(courseTable, 'c');

  let course: CaptureCourse | null = null;

  for (const row of dataRows(courseTable.table)) {
    if (row.length < courseTable.headers.length) continue;
    const code = cellText(row[codeIdx]).toUpperCase();
    const title = cellText(row[titleIdx]);
    if (!/^[A-Z0-9]{4,12}$/.test(code) || !title) continue;

    const int = (idx: number) => {
      const v = parseInt(cellText(row[idx]), 10);
      return Number.isFinite(v) ? v : 0;
    };
    const ltpjc = {
      l: lIdx >= 0 ? int(lIdx) : 0,
      t: tIdx >= 0 ? int(tIdx) : 0,
      p: pIdx >= 0 ? int(pIdx) : 0,
      j: jIdx >= 0 ? int(jIdx) : 0,
      c: cIdx >= 0 ? int(cIdx) : 0,
    };

    course = {
      code,
      title,
      credits: ltpjc.c,
      ltpjc,
      slotless: false,
      options: [],
    };
    break;
  }

  if (!course) return null;

  // --- faculty options ---
  const slotIdx = headerIndex(optionsTable, 'slot');
  const venueIdx = headerIndex(optionsTable, 'venue');
  const facultyIdx = headerIndex(optionsTable, 'faculty');
  const availIdx = headerIndex(optionsTable, 'available seats');
  const totalIdx = headerIndex(optionsTable, 'total seats');
  const statusIdx = headerIndex(optionsTable, 'slot status');
  const typeIdx = headerIndex(optionsTable, 'course type');

  const now = new Date().toISOString();
  const options: CaptureOption[] = [];

  for (const row of dataRows(optionsTable.table)) {
    if (row.length < 4) continue;
    const rawSlotText = cellText(row[slotIdx]);
    const faculty = cellText(row[facultyIdx]);
    if (!rawSlotText || /^slots?$/i.test(rawSlotText) || !faculty) continue;

    const { slotCombo, unknownSlots } = parseSlotCombo(rawSlotText);
    const seats = availIdx >= 0 ? parseSeats(cellText(row[availIdx])) : 'Full';
    const totalText = totalIdx >= 0 ? cellText(row[totalIdx]) : '';
    const slotStatus = statusIdx >= 0 ? cellText(row[statusIdx]) : '';

    const option: CaptureOption = {
      id: optionId(course.code, faculty, rawSlotText),
      slotCombo,
      rawSlotText,
      venue: venueIdx >= 0 ? cellText(row[venueIdx]) : '',
      faculty,
      seats,
      capturedAt: now,
      unknownSlots,
    };
    if (/^\d+$/.test(totalText)) option.totalSeats = parseInt(totalText, 10);
    if (slotStatus) option.slotStatus = slotStatus;
    options.push(option);
  }

  if (typeIdx >= 0) {
    const firstRow = dataRows(optionsTable.table)[0];
    if (firstRow) course.courseType = cellText(firstRow[typeIdx]);
  }

  course.options = options;
  return course;
}
