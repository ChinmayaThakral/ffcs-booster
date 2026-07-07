import { describe, expect, it } from 'vitest';
import { detectCourseListPage, parseCourseListPage } from '../parsers/courseListPage';
import { parsePage } from '../parsers/registry';
import { loadFixture } from './helpers';

describe('course-list page parser (synthetic dashboard fixture)', () => {
  it('detects the dashboard fixture', () => {
    expect(detectCourseListPage(loadFixture('dashboard.html'))).toBe(true);
  });

  it('discovers all courses across group tables with categories', () => {
    const discovered = parseCourseListPage(loadFixture('dashboard.html'));
    expect(discovered).toHaveLength(3);

    const byCode = Object.fromEntries(discovered.map((d) => [d.code, d]));
    expect(byCode.CSA3006).toMatchObject({
      title: 'DATA MINING AND DATA WAREHOUSING',
      courseType: 'LTP',
      credits: 4,
      category: 'PC',
    });
    expect(byCode.HUM1001).toMatchObject({ credits: 3, category: 'UEOE' });
  });

  it('registry routes pages to the right parser', () => {
    expect(parsePage(loadFixture('dashboard.html')).kind).toBe('course-list');
    expect(parsePage(loadFixture('CSA3006.html')).kind).toBe('view-slots');
    const empty = new DOMParser().parseFromString('<html><body><p>hi</p></body></html>', 'text/html');
    expect(parsePage(empty).kind).toBe('unknown');
  });
});
