import React from 'react';
import ReactDOM from 'react-dom/client';
import PlujApp from './PlujMarketplace';
import { initI18n } from './i18n';

/* ─── ERROR BOUNDARY ──────────────────────────────────────────────────────────
   PlujMarketplace is a single ~12,200-line component tree. Without a boundary,
   any render-time throw — one undefined.map on a vendor with no photos — unmounts
   the entire application and leaves a blank white page, with nothing logged
   anywhere you would see it.

   This catches the throw, keeps the user on something they can act on, and
   records the error. report() below is the single reporting point.
────────────────────────────────────────────────────────────────────────────── */

/* Seen this page load already. A render loop can throw the same error hundreds
   of times a second; there is no value in sending each one, and doing so would
   turn our own reporter into the thing taking the site down. */
const reported = new Set();

function report(error, info) {
  const message = String((error && error.message) || error || 'Unknown error');
  const stack = String((error && error.stack) || (info && info.componentStack) || '');

  /* Still log locally — this is what you read when you are sitting in front of
     the browser with devtools open. */
  console.error('[PLUJ]', message, stack);

  const key = message + '|' + stack.slice(0, 120);
  if (reported.has(key)) return;
  reported.add(key);

  /* Best-effort and deliberately silent. An error reporter that can itself
     throw, or that can block the page, is worse than no reporter at all. The
     server groups by fingerprint and throttles the email, so sending is cheap. */
  try {
    const body = JSON.stringify({
      message: message.slice(0, 500),
      stack: stack.slice(0, 4000),
      url: (window.location && window.location.href) || '',
      kind: 'client',
    });

    /* sendBeacon survives the page being torn down, which is exactly the moment
       a fatal error tends to happen. keepalive on fetch is the fallback. */
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/log-error', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch (e) {
    /* Never let reporting break the page. */
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    report(error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const wrap = {
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px', background: '#0A0A0A',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    };
    const card = { maxWidth: 460, width: '100%', textAlign: 'left', color: '#fff' };
    const btn = {
      display: 'inline-block', padding: '12px 22px', borderRadius: 999,
      background: '#1E40FF', color: '#fff', fontWeight: 700, fontSize: 15,
      border: 'none', cursor: 'pointer',
    };
    const ghost = {
      ...btn, background: 'transparent', color: 'rgba(255,255,255,0.7)',
      border: '1px solid rgba(255,255,255,0.25)', marginLeft: 10,
    };

    return (
      <div style={wrap}>
        <div style={card}>
          <p style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
            pluj
          </p>
          <h1 style={{ margin: '0 0 10px', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Something broke on our end.
          </h1>
          <p style={{ margin: '0 0 22px', fontSize: 15, lineHeight: 1.65, color: 'rgba(255,255,255,0.72)' }}>
            This is our fault, not yours — and nothing you were working on has been
            lost. Reloading usually clears it. We have been told automatically.
          </p>

          <button type="button" style={btn} onClick={() => window.location.reload()}>
            Reload the page
          </button>
          <button
            type="button"
            style={ghost}
            onClick={() => { window.location.href = '/'; }}
          >
            Start over
          </button>

          {/* The message is useful when someone reports the problem, but a raw
              stack trace on a consumer site is noise. Kept collapsed. */}
          <details style={{ marginTop: 26 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              Technical details
            </summary>
            <pre style={{
              marginTop: 10, padding: 12, borderRadius: 10, fontSize: 11,
              lineHeight: 1.55, color: 'rgba(255,255,255,0.6)',
              background: 'rgba(255,255,255,0.06)', whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', maxHeight: 180, overflow: 'auto',
            }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}

/* Async failures never reach componentDidCatch, so they are reported separately.
   Without these, a rejected fetch in an event handler disappears silently. */
window.addEventListener('unhandledrejection', (e) => {
  report(e.reason);
});
window.addEventListener('error', (e) => {
  if (e.error) report(e.error);
});

/* Spanish, when the visitor chose it (or their browser is in Spanish), is
   loaded before the first render so the page never flashes English. */
initI18n().finally(() => {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <ErrorBoundary>
      <PlujApp />
    </ErrorBoundary>
  );
});
