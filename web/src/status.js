// The red error banner and the footer latency bar.

import { esc } from './util.js';

const banner = document.getElementById('error-banner');
const bar = document.getElementById('status-bar');

// Sequence number of the request that raised the banner. Only a success from a
// request started after it clears the banner, so a slow success that was already
// in flight can't hide a newer failure.
let failedSeq = 0;

export function reportCall({ seq, error, latencyMs, method, path, status }) {
  if (error?.isBackendFailure) {
    if (seq >= failedSeq) {
      failedSeq = seq;
      showBanner(error);
    }
  } else if (!error && seq > failedSeq) {
    hideBanner();
  }
  renderBar({ error, latencyMs, method, path, status });
}

function showBanner(err) {
  const where = err.kind === 'http' ? `HTTP ${err.status}` : err.kind === 'timeout' ? 'timeout' : 'network error';
  const details = [
    `${err.method} ${err.path}`,
    err.code,
    err.body?.sqlcode != null ? `SQLCODE ${err.body.sqlcode}` : null,
    err.body?.reason != null ? `reason ${err.body.reason}` : null,
    err.body?.query ? `query ${err.body.query}` : null,
    `${err.latencyMs} ms`,
    new Date().toLocaleTimeString(),
  ].filter(Boolean);

  banner.innerHTML = `
    <div class="error-banner-inner">
      <svg class="error-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm0 6 1 0v6h-2V8h1zm-1 8h2v2h-2v-2z" fill="currentColor"/></svg>
      <div>
        <div class="error-title">Something went wrong — ${esc(err.friendlyMessage)} (${esc(where)}, request ${esc(err.requestId)})</div>
        <div class="error-detail">${details.map(esc).join(' · ')}</div>
      </div>
    </div>`;
  banner.hidden = false;
}

function hideBanner() {
  banner.hidden = true;
  banner.innerHTML = '';
}

function level(error, latencyMs) {
  if (error?.isBackendFailure || latencyMs >= 2000) return 'red';
  if (latencyMs >= 500) return 'amber';
  return 'green';
}

function renderBar({ error, latencyMs, method, path, status }) {
  const outcome = error && error.kind !== 'http' ? error.kind : status;
  bar.innerHTML = `
    <div class="container status-inner">
      <span class="dot dot-${level(error, latencyMs)}" aria-hidden="true"></span>
      <span>Last API call <strong>${esc(latencyMs)} ms</strong></span>
      <span class="muted">${esc(method)} ${esc(path)} → ${esc(outcome)}</span>
      <span class="muted status-time">${esc(new Date().toLocaleTimeString())}</span>
    </div>`;
}

bar.innerHTML = `<div class="container status-inner"><span class="dot dot-idle" aria-hidden="true"></span><span class="muted">No API calls yet</span></div>`;
