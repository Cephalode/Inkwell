// Inkwell observation pipeline — client collector.
// ponytail: fetch-on-write with sendBeacon; if volume ever hurts, batch window.
// Every click, SPA navigation, error, failed API call + 15s dwell heartbeat.
// Best-effort: never throws, never blocks the UI.

let sessionId = '';
try {
  sessionId = sessionStorage.getItem('inkwell_sid') || '';
} catch { /* storage blocked */ }
if (!sessionId) {
  sessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try { sessionStorage.setItem('inkwell_sid', sessionId); } catch { /* ignore */ }
}

type Event = { ts: number; type: string; name: string; path: string; detail?: object };
let queue: Event[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    const ok = navigator.sendBeacon('/api/events', new Blob(
      [JSON.stringify({ events: batch, session_id: sessionId })],
      { type: 'application/json' },
    ));
    if (!ok) throw new Error('beacon rejected');
  } catch {
    // sendBeacon can be rejected with large payloads; fall back to fetch.
    fetch('/api/events', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch, session_id: sessionId }),
    }).catch(() => { /* best-effort */ });
  }
}

function track(type: string, name: string, detail?: object): void {
  const e: Event = {
    ts: Date.now(),
    type,
    name,
    path: location.pathname,
    ...(detail ? { detail } : {}),
  };
  queue.push(e);
  if (queue.length >= 10) { flush(); return; } // piggyback on batch size
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 5000);
}

// ── Captures ────────────────────────────────────────────────────────────────
export function initTracker(): void {
  // 1. Every click: tag, text, classes, data-testid if any.
  document.addEventListener('click', (ev) => {
    const el = (ev.target as Element | null)?.closest('button,a,[role],input,select,textarea,label,[data-testid]');
    if (!el) return;
    const t = el as HTMLElement;
    track('click', t.tagName.toLowerCase(), {
      text: (t.textContent || '').trim().slice(0, 80),
      ...(t.getAttribute('data-testid') ? { testid: t.getAttribute('data-testid') } : {}),
      ...(t.getAttribute('aria-label') ? { aria: t.getAttribute('aria-label') } : {}),
      ...(t.getAttribute('href') ? { href: t.getAttribute('href') } : {}),
    });
  }, true);

  // 2. SPA navigations + per-path dwell time (wall time between route changes).
  let lastPath = location.pathname;
  let lastAt = Date.now();
  setInterval(() => {
    const now = Date.now();
    if (location.pathname !== lastPath) {
      track('dwell', lastPath, { ms: now - lastAt });
      track('navigate', location.pathname, { from: lastPath });
      lastPath = location.pathname;
    }
    lastAt = now;
  }, 1000);

  // 3. Dwell heartbeat for single-page sessions (reader sessions etc).
  setInterval(() => track('heartbeat', location.pathname, {}), 15000);

  // 4. Errors + unhandled rejections (crash capture).
  window.addEventListener('error', (e) => track('error', String(e.message || 'error').slice(0, 120), {
    stack: String((e as ErrorEvent).error instanceof Error ? (e as ErrorEvent).error.stack : '').split('\n').slice(0, 3).join(' | ').slice(0, 300),
    source: `${e.filename}:${e.lineno}`,
  }));
  window.addEventListener('unhandledrejection', (e) => track('error', `promise: ${String((e as PromiseRejectionEvent).reason).slice(0, 110)}`, {}));

  // 5. Failed/slow API calls: latency + status, per endpoint (friction signal).
  const origFetch = window.fetch;
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] instanceof URL ? args[0].href : (args[0] as Request).url);
    const method = (args[1]?.method || (args[0] as Request)?.method || 'GET').toUpperCase();
    const t0 = performance.now();
    try {
      const res = await origFetch(...args);
      if (url.startsWith('/api/')) {
        const ms = Math.round(performance.now() - t0);
        if (res.status >= 400 || ms > 5000) {
          track('api', `${method} ${new URL(url, location.origin).pathname}`, { status: res.status, ms });
        }
      }
      return res;
    } catch (err) {
      if (url.startsWith('/api/')) track('api', `${method} ${new URL(url, location.origin).pathname}`, { status: 0, ms: Math.round(performance.now() - t0) });
      throw err;
    }
  };
}

// Session end beacon on tab close.
window.addEventListener('pagehide', flush);
setInterval(flush, 30000); // keepalive

export { track };
