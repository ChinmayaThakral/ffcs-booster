/*
 * E2E helper (skipped unless E2E_OUT is set): builds a CaptureDataset from the
 * fixtures and writes it to E2E_OUT, ready to POST to the backend:
 *   E2E_OUT=/tmp/dataset.json npx vitest run test/e2e-export.test.ts
 *   curl -c /tmp/c.txt -X POST localhost:5000/api/capture -H 'Content-Type: application/json' --data @/tmp/dataset.json
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildDataset, emptyState, mergeCapturedCourse, mergeDiscovered } from '../lib/storage';
import { parseCourseListPage } from '../parsers/courseListPage';
import { parseViewSlotsPage } from '../parsers/viewSlotsPage';
import { loadFixture } from './helpers';

it.runIf(process.env.E2E_OUT)('exports dataset for e2e', () => {
  let state = emptyState('WINTER SEMESTER 2025-26');
  state.sourceUrl = 'https://dev.vitbhopal.ac.in/WINTER%20SEMESTER%202025-26_ALL_registration/';
  state = mergeDiscovered(state, parseCourseListPage(loadFixture('dashboard.html')));
  state = mergeCapturedCourse(state, parseViewSlotsPage(loadFixture('CSA3006.html'))!);
  state = mergeCapturedCourse(state, parseViewSlotsPage(loadFixture('CSE3010.html'))!);
  writeFileSync(process.env.E2E_OUT!, JSON.stringify(buildDataset(state), null, 2));
});
