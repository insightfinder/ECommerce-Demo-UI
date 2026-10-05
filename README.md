# Demo Store — UI tier

The browser-facing tier of the demo e-commerce store: a static single-page app
(Vite + vanilla JavaScript) served by nginx, which also reverse-proxies `/api/*`
to the Python apiserver (the `ECommerce-Demo-APIServer` repo). It is built for
demonstrating an observability / RCA product, so backend failures are visible
in the browser, in the browser console and in nginx's JSON access log, all tied
together by one request id.

```
ECommerce-Demo-UI/
  web/                    Vite project (index.html, src/, package.json)
  nginx/nginx.conf        main config: JSON access log, request-id map, gzip
  nginx/conf.d/store.conf site config (a template: ${APISERVER_ADDR}, ${MONITORING_CIDR})
  mock/server.js          dependency-free mock of the apiserver, for development
  Dockerfile              node build → nginx:stable runtime
  docker-compose.yml      UI + mock API for local development
  deploy/install.sh       build and install into the system nginx on Ubuntu (EC2)
```

## Quick start (Docker)

```sh
docker compose up --build
open http://localhost:8080
```

This runs the UI image in front of the mock API (`mock/server.js`, exposed on
`localhost:8000`), so no Db2 or apiserver is needed. Simulate backend trouble:

| How | Effect |
|---|---|
| `http://localhost:8080/?simulate=slow` | every API call from that tab is slowed by 3 s (`SLOW_MS`) |
| `http://localhost:8080/?simulate=error` | every API call returns `503 db_lock_timeout` (SQLCODE -911) |
| `http://localhost:8080/?simulate=timeout` | the mock sleeps 15 s, so the call times out (see [Timeouts](#timeouts)) |
| `curl -X PUT 'localhost:8000/__mock/simulate?mode=error'` | same, for every client, until `mode=off` |
| `MOCK_SIMULATE=slow docker compose up` | same, from startup |

The SPA copies `?simulate=` from its own URL onto each API request. The real
apiserver ignores the parameter, so this does nothing in production.

To run against a real apiserver instead of the mock, run the UI image alone:

```sh
docker build -t demo-store-ui .
docker run --rm -p 8080:80 -e APISERVER_ADDR=10.0.1.23:8000 demo-store-ui
```

## Development

```sh
node mock/server.js                 # mock API on :8000
cd web && npm install && npm run dev # Vite on :5173, proxies /api to :8000
```

Set `API_PROXY_TARGET=http://host:8000` to point the Vite dev server at a real
apiserver. `npm run build` writes the static site to `web/dist/`.

## Configuration

| Variable | Default | Used by | Meaning |
|---|---|---|---|
| `APISERVER_ADDR` | `apiserver:8000` | nginx | `host:port` of the apiserver (the `upstream` server) |
| `MONITORING_CIDR` | `127.0.0.1/32` | nginx | network allowed to read `/nginx_status` (localhost is always allowed) |
| `MOCK_SIMULATE` | *(off)* | mock | `slow`, `error` or `timeout` for every request |
| `SLOW_MS` | `3000` | mock | delay for `slow` |
| `API_PROXY_TARGET` | `http://localhost:8000` | `npm run dev` | where the Vite dev server proxies `/api` |

In the Docker image, `nginx/conf.d/store.conf` is copied to
`/etc/nginx/templates/store.conf.template`. The official nginx entrypoint renders it
with `envsubst` at container start, limited to these two variables by
`NGINX_ENVSUBST_FILTER`. `install.sh` does the same rendering on a host.

nginx resolves `APISERVER_ADDR` when it starts. A hostname that doesn't resolve
stops nginx from starting (`host not found in upstream`), so use an IP or a name
that's in DNS or `/etc/hosts`.

The compose file sets `MONITORING_CIDR=172.16.0.0/12` so an exporter running
on the Docker network can scrape `/nginx_status`. That range also covers the
Docker host's gateway address, so the host can read it too.

## Deploying on an EC2 host (Ubuntu)

From a checkout of this directory on an Ubuntu 22.04 or 24.04 host:

```sh
APISERVER_ADDR=10.0.1.23:8000 MONITORING_CIDR=10.0.0.0/16 ./deploy/install.sh
```

The script:

1. Installs nginx.
2. Installs Node.js 22 from NodeSource if no Node ≥ 20.19 is present, then
   builds `web/`. Set `SKIP_BUILD=1` to deploy an existing `web/dist` instead.
3. Copies the build to `/usr/share/nginx/html`, replacing what's there.
4. Installs `nginx.conf` (with workers running as `www-data`) and the rendered
   `conf.d/store.conf`. The original `nginx.conf` is kept as `nginx.conf.orig`.
5. Adds a logrotate rule for `access.json`, since Ubuntu's stock rule only
   matches `*.log`.
6. Runs `nginx -t` and reloads nginx.

Run it as a normal user with sudo. Re-running it redeploys.

## What the UI does with failures

All API calls go through `web/src/api.js`:

- **Request id.** Each call sends a fresh `X-Request-ID` (`ui-<32 hex>`). nginx
  passes it to the apiserver, which logs it and echoes it back. The id appears
  in the banner, the console, the nginx access log and the apiserver log. If a
  request arrives without a valid id (e.g. from curl), nginx uses its own
  `$request_id`.
- **Timeout.** Each call is aborted after 10 s (`AbortController`). Calls are
  never retried automatically.
- **Latency.** Measured for every call and written to the console:
  `[api] GET /api/products?limit=12&offset=0 → 200 in 20 ms (request ui-…)`.
  Failures are logged with `console.error`, together with the JSON error body.
- **Red banner.** Network errors, timeouts and 5xx responses raise a banner:
  *Something went wrong — The store is having trouble reaching the database
  (HTTP 503, request ui-…)*. A detail line shows the call, `error` code,
  SQLCODE/reason/query if present, latency and time. 503
  `db_lock_timeout`/`db_pool_timeout` and every 504 map to "trouble reaching
  the database". The banner stays until a request *started after the failure*
  succeeds, so a slow success that was already in flight can't hide a newer
  failure.
- **4xx responses** don't raise the banner; the page handles them. 409
  `insufficient_stock` marks the affected cart lines with the available
  quantity, and 404 shows "Product not found".
- **Footer status bar.** Shows the last call's latency, endpoint and outcome,
  with a dot: green < 500 ms, amber < 2 s, red ≥ 2 s or a banner-level failure.
- **Skeleton loaders.** Shown on every page while data loads, so a slow
  backend reads as "slow", not "broken". A failed section shows an inline
  error with a manual "Try again" button.
- **Uncertain checkout.** If checkout times out or gets 502/504, the order may
  still have been committed, so the cart is kept and the user is pointed to
  Order history before trying again.

### Timeouts

The browser timeout and nginx's `proxy_read_timeout` are both 10 s. The
browser's clock starts first, so when the apiserver hangs:

- The browser aborts at 10 s and shows "did not respond within 10 seconds".
- nginx logs the request with status **499** (client closed the connection),
  not 504, and its JSON 504 body is never sent.

nginx's own 504 still appears when its timer fires first. That happens with
`proxy_connect_timeout` (3 s, e.g. the apiserver host is down), and for
clients without a 10 s timer, such as curl.

## nginx

- **Static files.** `try_files $uri /index.html` gives the SPA fallback.
  `/assets/*` (hashed by Vite) is served with
  `Cache-Control: public, max-age=31536000, immutable`; `index.html` and other
  files get `no-cache`. gzip is on for text, JS, CSS, JSON and SVG, including
  proxied API responses.
- **`/api/`** is proxied to `upstream apiserver` (keepalive 16) with
  `proxy_connect_timeout 3s`, `proxy_read_timeout 10s`,
  `proxy_send_timeout 10s` and `proxy_next_upstream off` (no retries). It sets
  `Host`, `X-Request-ID`, `X-Real-IP`, `X-Forwarded-For` and
  `X-Forwarded-Proto`. Responses carry `X-Request-ID` and
  `Cache-Control: no-store`.
- **Errors nginx generates itself** get JSON bodies. The apiserver's own error
  responses (e.g. its 503 `db_lock_timeout`) pass through unchanged, because
  `proxy_intercept_errors` is off.

  | Status | Body | Typical cause |
  |---|---|---|
  | 502 | `{"error":"upstream_unavailable","message":"…","request_id":"…"}` | connection refused/reset, apiserver down |
  | 503 | `{"error":"service_unavailable","message":"…","request_id":"…"}` | (reserved; nginx itself doesn't produce 503 in this config) |
  | 504 | `{"error":"upstream_timeout","message":"…","request_id":"…"}` | connect > 3 s or no response within 10 s |

- **`/nginx_status`** is `stub_status` for
  [nginx-prometheus-exporter](https://github.com/nginx/nginx-prometheus-exporter)
  (`--nginx.scrape-uri=http://<host>/nginx_status`). It's allowed from
  127.0.0.1, ::1 and `MONITORING_CIDR`, and not written to the access log.

### Access log format

`/var/log/nginx/access.json`, one JSON object per line:

```json
{"time_iso8601":"2026-10-05T20:39:35+00:00","request_id":"ui-2add7ae78c720d15ad0519ae6a81debf",
 "remote_addr":"172.19.0.1","method":"GET","uri":"/api/products?limit=12&offset=0","status":503,
 "body_bytes_sent":133,"request_time":0.251,"upstream_addr":"172.19.0.2:8000","upstream_status":"503",
 "upstream_response_time":"0.251","upstream_connect_time":"0.001","http_user_agent":"Mozilla/5.0 …"}
```

| Field | Type | Notes |
|---|---|---|
| `time_iso8601` | string | request end time |
| `request_id` | string | the client's `X-Request-ID` if valid (`[A-Za-z0-9._:-]{1,128}`), else nginx's `$request_id` |
| `remote_addr` | string | client address as seen by nginx |
| `method`, `uri` | string | `uri` includes the query string (`$request_uri`) |
| `status` | number | status sent to the client (499 = client gave up) |
| `body_bytes_sent` | number | |
| `request_time` | number | seconds, from first byte read to last byte sent |
| `upstream_addr` | string | `-` for static files; comma-separated if more than one was tried |
| `upstream_status` | string | `-` for static files. nginx records its own 502/504 here, so `upstream_status` 504 with `upstream_connect_time` `-` means the connect timed out |
| `upstream_response_time` | string | seconds |
| `upstream_connect_time` | string | seconds; `-` if no connection was made |
| `http_user_agent` | string | |

The upstream fields are strings because nginx writes `-` or comma-separated
lists in them. The error log stays at `/var/log/nginx/error.log`. In the Docker
image that path is linked to stderr; `access.json` is a regular file:

```sh
docker compose exec ui tail -f /var/log/nginx/access.json
```

## Pages

Routing uses the URL hash.

| Route | Page |
|---|---|
| `#/`, `#/?category=Books&page=2` | catalog: 12 per page, category filter, stock badges ("Only 3 left", "Out of stock") |
| `#/product/{id}` | product detail with quantity picker |
| `#/cart` | cart (localStorage), quantity editing, checkout → `POST /api/orders` |
| `#/order/{id}` | confirmation for the order just placed in this tab |
| `#/orders` | last 20 orders of the signed-in customer |

"Signed in as" lists the first 50 customers from `/api/customers`. The choice
is saved in localStorage, and the first customer is selected if none is saved.
Product images are SVG tiles generated in the browser: a category color and
icon, plus the product's initials. The apiserver's `image_url` isn't used, so
nothing is loaded from external hosts.

The UI follows the real apiserver's response shapes: lists are wrapped in
`{"items": [...]}` and stock is `in_stock`. `/api/products` has no total count,
so the page count comes from `product_count` in `/api/categories`.
