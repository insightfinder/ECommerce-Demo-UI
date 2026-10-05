// The single fetch wrapper for every /api call. It enforces the timeout, measures
// latency, logs each outcome to the console and reports it to the status UI.
// It never retries: a failure must stay visible.

import { reportCall } from './status.js';

export const TIMEOUT_MS = 10_000;

const DB_TROUBLE = 'The store is having trouble reaching the database';

// Friendly text for the `error` codes the apiserver and nginx return.
const FRIENDLY = {
  db_lock_timeout: DB_TROUBLE,
  db_pool_timeout: DB_TROUBLE,
  upstream_timeout: DB_TROUBLE,
  db_error: 'The store hit a database error',
  upstream_unavailable: 'The store’s API server is not responding',
  service_unavailable: 'The store is temporarily unavailable',
  internal_error: 'The store hit an unexpected error',
};

export class ApiError extends Error {
  constructor({ kind, status = null, code = null, body = null, requestId, method, path, latencyMs }) {
    super(code || kind);
    this.kind = kind; // 'network' | 'timeout' | 'http'
    this.status = status;
    this.code = code;
    this.body = body;
    this.requestId = requestId;
    this.method = method;
    this.path = path;
    this.latencyMs = latencyMs;
  }

  // Failures that mean the backend is unhealthy (shown in the red banner), as
  // opposed to 4xx answers like "out of stock" that the page handles itself.
  get isBackendFailure() {
    return this.kind !== 'http' || this.status >= 500;
  }

  get friendlyMessage() {
    if (this.kind === 'timeout') return `The store did not respond within ${TIMEOUT_MS / 1000} seconds`;
    if (this.kind === 'network') return 'Could not reach the store server';
    if (this.status === 504) return DB_TROUBLE;
    return FRIENDLY[this.code] || 'The server returned an error';
  }
}

// Request ids follow the apiserver's accepted format ([A-Za-z0-9._:-]{1,128}),
// so one id links the browser console, nginx log and apiserver log.
// crypto.randomUUID() needs a secure context, which a plain-http EC2 host isn't.
function newRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return 'ui-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// For local development against the mock API: open the app as
// http://host/?simulate=slow and every API call carries that flag.
const simulate = new URLSearchParams(location.search).get('simulate');

let seq = 0;

export async function api(path, { method = 'GET', body } = {}) {
  const id = ++seq;
  const requestId = newRequestId();
  const url = simulate ? `${path}${path.includes('?') ? '&' : '?'}simulate=${encodeURIComponent(simulate)}` : path;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = { Accept: 'application/json', 'X-Request-ID': requestId };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const started = performance.now();
  let res;
  let data = null;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null; // e.g. an HTML error page from something in front of nginx
      }
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    const error = new ApiError({
      kind: err.name === 'AbortError' ? 'timeout' : 'network',
      requestId,
      method,
      path,
      latencyMs,
    });
    finish(id, error, latencyMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Math.round(performance.now() - started);
  const responseId = data?.request_id || res.headers.get('X-Request-ID') || requestId;

  if (!res.ok) {
    const error = new ApiError({
      kind: 'http',
      status: res.status,
      code: data?.error || null,
      body: data,
      requestId: responseId,
      method,
      path,
      latencyMs,
    });
    finish(id, error, latencyMs);
    throw error;
  }

  finish(id, null, latencyMs, { method, path, status: res.status, requestId: responseId });
  return data;
}

function finish(id, error, latencyMs, ok) {
  if (error) {
    const outcome = error.kind === 'http' ? `HTTP ${error.status}${error.code ? ' ' + error.code : ''}` : error.kind.toUpperCase();
    const log = error.isBackendFailure ? console.error : console.warn;
    log(`[api] ${error.method} ${error.path} → ${outcome} in ${latencyMs} ms (request ${error.requestId})`, error.body ?? '');
  } else {
    console.info(`[api] ${ok.method} ${ok.path} → ${ok.status} in ${latencyMs} ms (request ${ok.requestId})`);
  }
  reportCall({ seq: id, error, latencyMs, method: ok?.method ?? error.method, path: ok?.path ?? error.path, status: ok?.status ?? error.status });
}
