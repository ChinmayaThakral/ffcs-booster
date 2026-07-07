import { useCallback, useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import type { ParseIssue } from '../../lib/schema';
import {
  buildDataset,
  clearSemester,
  courseStatus,
  getActiveSemesterLabel,
  getParseIssues,
  getSettings,
  loadSemester,
  saveSettings,
  type CourseStatus,
  type SemesterState,
} from '../../lib/storage';

const STATUS_META: Record<CourseStatus, { icon: string; label: string; cls: string }> = {
  captured: { icon: '✅', label: 'captured', cls: 'text-green-700' },
  stale: { icon: '🔄', label: 'stale (>10 min)', cls: 'text-amber-600' },
  pending: { icon: '⬜', label: 'not opened yet', cls: 'text-gray-500' },
};

export default function App() {
  const [state, setState] = useState<SemesterState | null>(null);
  const [scanning, setScanning] = useState(false);
  const [backendUrl, setBackendUrl] = useState('http://localhost:5000');
  const [issues, setIssues] = useState<ParseIssue[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const label = await getActiveSemesterLabel();
    if (label) setState(await loadSemester(label));
    setIssues(await getParseIssues());
  }, []);

  useEffect(() => {
    void refresh();
    void getSettings().then((s) => setBackendUrl(s.backendUrl));

    // Scanning indicator: is the active tab a portal registration page?
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        const url = tab?.url ?? '';
        setScanning(/vitbhopal\.ac\.in/i.test(url) && /registration/i.test(url));
      })
      .catch(() => setScanning(false));

    const listener = () => void refresh();
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [refresh]);

  const rows = useMemo(() => {
    if (!state) return [];
    const codes = new Set([...Object.keys(state.discovered), ...Object.keys(state.captured)]);
    return Array.from(codes)
      .sort()
      .map((code) => {
        const info = state.captured[code] ?? state.discovered[code];
        return {
          code,
          title: 'title' in info ? info.title : '',
          status: courseStatus(state, code),
          optionCount: state.captured[code]?.options.length ?? 0,
        };
      });
  }, [state]);

  const capturedCount = rows.filter((r) => r.status !== 'pending').length;

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  };

  const withDataset = (fn: (json: string) => void | Promise<void>) => {
    if (!state) return;
    void Promise.resolve(fn(JSON.stringify(buildDataset(state), null, 2)));
  };

  const recapturePage = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      const resp = (await browser.tabs.sendMessage(tab.id, { type: 'recapture' })) as {
        status?: string;
      };
      flash(`Re-captured (${resp?.status ?? 'ok'})`);
      await refresh();
    } catch {
      flash('This tab is not a portal page');
    }
  };

  const exportJson = () =>
    withDataset(async (json) => {
      const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
      const name = `ffcs-capture-${(state?.semesterLabel ?? 'semester').replace(/\s+/g, '-').toLowerCase()}.json`;
      await browser.downloads.download({ url, filename: name, saveAs: true });
    });

  const copyJson = () =>
    withDataset(async (json) => {
      await navigator.clipboard.writeText(json);
      flash('Copied to clipboard');
    });

  const sendToBackend = () =>
    withDataset(async (json) => {
      await saveSettings({ backendUrl });
      try {
        const resp = await fetch(`${backendUrl.replace(/\/$/, '')}/api/capture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json,
        });
        const body = (await resp.json()) as { summary?: { courses_processed?: number } };
        flash(
          resp.ok
            ? `Sent: ${body.summary?.courses_processed ?? 0} courses ingested`
            : `Backend error (${resp.status})`,
        );
      } catch {
        flash('Could not reach backend');
      }
    });

  const clearAll = async () => {
    if (!state) return;
    await clearSemester(state.semesterLabel);
    setState(null);
    flash('Cleared');
  };

  return (
    <div className="p-4 font-sans text-sm text-gray-900">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-bold">FFCS Booster</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            scanning ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {scanning ? 'Scanning: ON' : 'Scanning: OFF'}
        </span>
      </header>

      {state ? (
        <>
          <div className="mb-2 text-xs text-gray-600">
            <span className="font-medium">{state.semesterLabel}</span> — {capturedCount}/{rows.length} captured
          </div>

          <ul className="mb-3 max-h-52 divide-y divide-gray-100 overflow-y-auto rounded border border-gray-200">
            {rows.map((row) => {
              const meta = STATUS_META[row.status];
              return (
                <li key={row.code} className="flex items-center gap-2 px-2 py-1.5">
                  <span title={meta.label}>{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{row.code}</div>
                    <div className="truncate text-xs text-gray-500">{row.title}</div>
                  </div>
                  <span className={`text-xs ${meta.cls}`}>
                    {row.optionCount > 0 ? `${row.optionCount} options` : meta.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mb-3 rounded bg-gray-50 p-3 text-xs text-gray-600">
          No data yet. Log into the FFCS portal and browse course groups — every page you open is
          captured automatically. Open a course's <b>View</b> page to capture its faculty options.
        </p>
      )}

      {issues.length > 0 && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          {issues.length} page(s) could not be fully parsed — latest: {issues[issues.length - 1].message}
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">
        <button onClick={() => void recapturePage()} className="rounded bg-blue-600 px-2 py-1.5 font-medium text-white hover:bg-blue-700">
          Re-capture page
        </button>
        <button onClick={exportJson} className="rounded bg-gray-800 px-2 py-1.5 font-medium text-white hover:bg-gray-900" disabled={!state}>
          Export JSON
        </button>
        <button onClick={copyJson} className="rounded border border-gray-300 px-2 py-1.5 font-medium hover:bg-gray-50" disabled={!state}>
          Copy JSON
        </button>
        <button onClick={() => void clearAll()} className="rounded border border-red-300 px-2 py-1.5 font-medium text-red-700 hover:bg-red-50" disabled={!state}>
          Clear
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={backendUrl}
          onChange={(e) => setBackendUrl(e.target.value)}
          placeholder="Backend URL"
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs"
        />
        <button onClick={sendToBackend} className="rounded bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700" disabled={!state}>
          Send
        </button>
      </div>

      {notice && <div className="mt-2 text-center text-xs font-medium text-blue-700">{notice}</div>}

      <footer className="mt-3 border-t border-gray-100 pt-2 text-center text-[10px] text-gray-400">
        Read-only capture. This extension never registers, modifies or deletes courses for you.
      </footer>
    </div>
  );
}
