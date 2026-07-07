import { describe, expect, it } from 'vitest';
import { detectViewSlotsPage, parseViewSlotsPage } from '../parsers/viewSlotsPage';
import { detectCourseListPage } from '../parsers/courseListPage';
import { CaptureCourseSchema } from '../lib/schema';
import { loadFixture } from './helpers';

describe('view-slots page parser (real VTOP fixtures)', () => {
  it('detects the fixture pages as view-slots pages', () => {
    expect(detectViewSlotsPage(loadFixture('CSA3006.html'))).toBe(true);
    expect(detectViewSlotsPage(loadFixture('CSE3010.html'))).toBe(true);
    expect(detectViewSlotsPage(loadFixture('dashboard.html'))).toBe(false);
  });

  it('parses CSA3006 course info and all 11 option rows', () => {
    const course = parseViewSlotsPage(loadFixture('CSA3006.html'));
    expect(course).not.toBeNull();
    expect(course!.code).toBe('CSA3006');
    expect(course!.title).toBe('DATA MINING AND DATA WAREHOUSING');
    expect(course!.ltpjc).toEqual({ l: 2, t: 1, p: 1, j: 0, c: 4 });
    expect(course!.credits).toBe(4);
    expect(course!.options).toHaveLength(11);

    const first = course!.options[0];
    expect(first.rawSlotText).toBe('A11+A12+A13');
    expect(first.slotCombo).toEqual(['A11', 'A12', 'A13']);
    expect(first.venue).toBe('AB02-330');
    expect(first.faculty).toBe('NILAMADHAB MISHRA');
    expect(first.seats).toBe(0);
    expect(first.totalSeats).toBe(120);
    expect(first.unknownSlots).toEqual([]);

    const second = course!.options[1];
    expect(second.venue).toBe('LC-002');
    expect(second.faculty).toBe('RIZWAN UR RAHMAN');
    expect(second.seats).toBe(84);
  });

  it('parses CSE3010 options', () => {
    const course = parseViewSlotsPage(loadFixture('CSE3010.html'));
    expect(course).not.toBeNull();
    expect(course!.code).toBe('CSE3010');
    expect(course!.options).toHaveLength(11);
    expect(course!.options[0]).toMatchObject({
      rawSlotText: 'A11+A12',
      venue: 'AR-103',
      faculty: 'GAURAV SONI',
      seats: 30,
      totalSeats: 120,
    });
  });

  it('produces options that satisfy the capture schema', () => {
    for (const fixture of ['CSA3006.html', 'CSE3010.html']) {
      const course = parseViewSlotsPage(loadFixture(fixture));
      expect(() => CaptureCourseSchema.parse(course)).not.toThrow();
    }
  });

  it('does not detect fixtures as course-list pages', () => {
    // view-slots fixtures contain a Slot/Venue/Faculty table and must not be misrouted
    expect(detectCourseListPage(loadFixture('CSA3006.html'))).toBe(false);
  });
});
