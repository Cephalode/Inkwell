import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// E8 funnel capture: remember ?ref= for the session, then clean the URL.
const ref = new URLSearchParams(window.location.search).get('ref');
if (ref) {
  sessionStorage.setItem('inkwell_ref', ref);
  const url = new URL(window.location.href);
  url.searchParams.delete('ref');
  window.history.replaceState({}, '', url);
}
// Fire-and-forget once the app has bootstrapped a session (auth store handles it).
void (async () => {
  const stored = sessionStorage.getItem('inkwell_ref');
  if (!stored) return;
  try {
    const me = await (await fetch('/api/auth/me')).json();
    if (me.user) {
      await fetch('/api/auth/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: stored }),
      });
      sessionStorage.removeItem('inkwell_ref');
    }
  } catch { /* capture is best-effort */ }
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
