/**
 * Passive capture content script. Read-only: parses whatever the student
 * renders while browsing; never clicks, never navigates, never touches
 * credentials. Re-parses on DOM changes (postbacks, pagination) with a
 * 300ms debounce.
 */

import { browser } from 'wxt/browser';
import { parsePage, resolveSemesterLabel } from '../parsers/registry';
import {
  addParseIssue,
  loadSemester,
  mergeCapturedCourse,
  mergeDiscovered,
  saveSemester,
} from '../lib/storage';

export default defineContentScript({
  matches: ['https://dev.vitbhopal.ac.in/*', 'https://apps.vitbhopal.ac.in/*'],
  runAt: 'document_idle',

  main() {
    if (!/registration/i.test(location.href)) return;

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const captureNow = async (): Promise<string> => {
      try {
        const result = parsePage(document);
        if (result.kind === 'unknown') return 'unknown-page';

        const label = resolveSemesterLabel(location.href, document);
        let state = await loadSemester(label);
        state.sourceUrl = location.href;

        if (result.kind === 'view-slots') {
          if (!result.course) {
            await addParseIssue({
              at: new Date().toISOString(),
              url: location.href,
              message: 'Detected a course detail page but could not extract the course',
            });
            return 'parse-failed';
          }
          state = mergeCapturedCourse(state, result.course);
          await saveSemester(state);
          return `captured:${result.course.code}:${result.course.options.length}`;
        }

        state = mergeDiscovered(state, result.discovered);
        await saveSemester(state);
        return `discovered:${result.discovered.length}`;
      } catch (err) {
        // Never let the observer crash — log and move on
        await addParseIssue({
          at: new Date().toISOString(),
          url: location.href,
          message: err instanceof Error ? err.message : String(err),
        }).catch(() => undefined);
        return 'error';
      }
    };

    const scheduleCapture = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void captureNow(), 300);
    };

    // Initial parse + observe postback/accordion/pagination re-renders
    scheduleCapture();
    const observer = new MutationObserver(scheduleCapture);
    observer.observe(document.body, { childList: true, subtree: true });

    // Popup actions
    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const msg = message as { type?: string };
      if (msg?.type === 'recapture') {
        void captureNow().then((status) => sendResponse({ status }));
        return true; // async response
      }
      if (msg?.type === 'ping') {
        sendResponse({ scanning: true });
      }
      return undefined;
    });
  },
});
