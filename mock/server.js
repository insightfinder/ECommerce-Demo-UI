// Mock of the Demo Store apiserver for UI development: same routes, response
// shapes and error bodies as the real FastAPI server, with in-memory data.
// No dependencies; run with `node server.js`.
//
// Failure simulation, per request or for every request:
//   ?simulate=slow      respond after SLOW_MS (default 3000 ms)
//   ?simulate=error     503 {"error":"db_lock_timeout","sqlcode":-911,...}
//   ?simulate=timeout   respond after 15 s, so nginx returns its own 504
//   MOCK_SIMULATE=slow|error|timeout   apply to every request
//   curl -X PUT 'localhost:8000/__mock/simulate?mode=error'   change it at runtime
//   (mode=off to clear)

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8000);
const SLOW_MS = Number(process.env.SLOW_MS || 3000);
const TIMEOUT_MS = 15000;
const MODES = new Set(['slow', 'error', 'timeout']);
let globalMode = MODES.has(process.env.MOCK_SIMULATE) ? process.env.MOCK_SIMULATE : null;

// ---------- data ----------

// Deterministic PRNG so the catalog is the same on every start.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const CATALOG = {
  Electronics: [[15, 900], ['Wireless', 'Pro', 'Ultra', 'Compact', 'Smart', 'Portable'], ['Headphones', 'Bluetooth Speaker', 'Smartwatch', 'Power Bank', 'Webcam', 'Mechanical Keyboard', 'Monitor', 'Earbuds']],
  'Home & Kitchen': [[8, 400], ['Stainless', 'Ceramic', 'Nonstick', 'Bamboo', 'Deluxe', 'Classic'], ['Skillet', 'Knife Set', 'Blender', 'Coffee Maker', 'Cutting Board', 'Dutch Oven', 'Kettle', 'Toaster']],
  Clothing: [[10, 220], ['Organic', 'Slim-Fit', 'Classic', 'Relaxed', 'Merino', 'Vintage'], ['T-Shirt', 'Hoodie', 'Jeans', 'Rain Jacket', 'Sweater', 'Chinos', 'Socks', 'Flannel Shirt']],
  'Sports & Outdoors': [[10, 600], ['Trail', 'Ultralight', 'Pro', 'All-Weather', 'Insulated', 'Folding'], ['Backpack', 'Tent', 'Yoga Mat', 'Water Bottle', 'Running Shoes', 'Bike Helmet', 'Headlamp', 'Camp Chair']],
  Books: [[6, 60], ['The Art of', 'A Field Guide to', 'Mastering', 'The Little Book of', 'Notes on', 'Learning'], ['Databases', 'Gardening', 'Sourdough', 'Distributed Systems', 'Watercolor', 'Chess', 'Observability', 'Bird Watching']],
  'Beauty & Personal Care': [[5, 120], ['Hydrating', 'Gentle', 'Daily', 'Botanical', 'Fragrance-Free', 'Revitalizing'], ['Face Cream', 'Shampoo', 'Body Wash', 'Sunscreen', 'Lip Balm', 'Serum', 'Hand Soap', 'Conditioner']],
  'Toys & Games': [[8, 150], ['Classic', 'Deluxe', 'Junior', 'Family', 'Wooden', 'Magnetic'], ['Puzzle', 'Board Game', 'Building Blocks', 'Card Game', 'Train Set', 'Plush Bear', 'Kite', 'Science Kit']],
  Grocery: [[2, 40], ['Organic', 'Roasted', 'Wildflower', 'Extra Virgin', 'Smoked', 'Stone-Ground'], ['Coffee Beans', 'Honey', 'Olive Oil', 'Almonds', 'Green Tea', 'Pasta', 'Maple Syrup', 'Dark Chocolate']],
};

const products = [];
for (const [category, [[lo, hi], mods, nouns]] of Object.entries(CATALOG)) {
  const names = new Set();
  while (names.size < 25) names.add(`${pick(mods)} ${pick(nouns)}`);
  for (const name of names) {
    const id = products.length + 1;
    const r = rand();
    products.push({
      product_id: id,
      name,
      description: `${name} from our ${category.toLowerCase()} range. A demo product for the Demo Store.`,
      category,
      price: Math.round((lo + rand() * (hi - lo)) * 100) / 100,
      image_url: null,
      // Mix of plenty, low and zero stock so every badge shows up.
      in_stock: r < 0.1 ? 0 : r < 0.25 ? between(1, 5) : between(10, 300),
    });
  }
}
const productById = new Map(products.map((p) => [p.product_id, p]));

const FIRST = ['James', 'Mary', 'Priya', 'Wei', 'Diego', 'Sofia', 'Omar', 'Fatima', 'Noah', 'Olivia', 'Hiroshi', 'Ananya', 'Lucas', 'Emma', 'Mateo'];
const LAST = ['Smith', 'Garcia', 'Chen', 'Patel', 'Kim', 'Nguyen', 'Rossi', 'Silva', 'Murphy', 'Tanaka', 'Novak', 'Berg', 'Cohen', 'Dubois'];
const customers = Array.from({ length: 60 }, (_, i) => {
  const first = pick(FIRST);
  const last = pick(LAST);
  return {
    customer_id: i + 1,
    name: `${first} ${last}`,
    email: `${first}.${last}${i + 1}@example.com`.toLowerCase(),
    created_at: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 19),
  };
});

const orders = [];
let nextOrderId = 1;
function addOrder(customerId, lines, date, status) {
  const items = lines.map(({ product_id, quantity }) => ({
    product_id,
    name: productById.get(product_id).name,
    quantity,
    unit_price: productById.get(product_id).price,
  }));
  const total = Math.round(items.reduce((s, i) => s + i.quantity * i.unit_price, 0) * 100) / 100;
  const order = { order_id: nextOrderId++, customer_id: customerId, order_date: date.toISOString().slice(0, 19), status, total, items };
  orders.push(order);
  return order;
}
for (let i = 0; i < 400; i++) {
  const lines = new Map();
  for (let n = between(1, 3); n > 0; n--) lines.set(between(1, products.length), between(1, 3));
  const date = new Date(Date.now() - between(1, 365) * 86400000 - between(0, 86400) * 1000);
  addOrder(between(1, customers.length), [...lines].map(([product_id, quantity]) => ({ product_id, quantity })), date, 'DELIVERED');
}
orders.sort((a, b) => a.order_date.localeCompare(b.order_date));

// ---------- http ----------

const VALID_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function intParam(q, name, def, min, max) {
  const raw = q.get(name);
  if (raw == null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || (max != null && n > max)) {
    throw { status: 422, error: 'validation_error', details: [{ loc: ['query', name], msg: `must be an integer between ${min} and ${max ?? '∞'}` }] };
  }
  return n;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    return JSON.parse(raw);
  } catch {
    throw { status: 422, error: 'validation_error', details: [{ loc: ['body'], msg: 'invalid JSON' }] };
  }
}

function placeOrder(body) {
  const bad = (msg) => ({ status: 422, error: 'validation_error', details: [{ loc: ['body'], msg }] });
  if (!body || !Number.isInteger(body.customer_id)) throw bad('customer_id must be an integer');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) throw bad('items must have 1-50 entries');
  const wanted = new Map();
  for (const it of body.items) {
    if (!Number.isInteger(it?.product_id) || !Number.isInteger(it?.quantity) || it.quantity < 1 || it.quantity > 100) {
      throw bad('each item needs an integer product_id and quantity 1-100');
    }
    wanted.set(it.product_id, (wanted.get(it.product_id) || 0) + it.quantity);
  }
  if (!customers.some((c) => c.customer_id === body.customer_id)) {
    throw { status: 404, error: 'customer_not_found', message: `customer ${body.customer_id} not found`, customer_id: body.customer_id };
  }
  const ids = [...wanted.keys()].sort((a, b) => a - b);
  const shortages = [];
  for (const pid of ids) {
    const p = productById.get(pid);
    if (!p) throw { status: 404, error: 'product_not_found', message: `product ${pid} not found`, product_id: pid };
    if (p.in_stock < wanted.get(pid)) shortages.push({ product_id: pid, requested: wanted.get(pid), available: p.in_stock });
  }
  if (shortages.length) throw { status: 409, error: 'insufficient_stock', message: 'insufficient stock for one or more items', items: shortages };
  for (const pid of ids) productById.get(pid).in_stock -= wanted.get(pid);
  const order = addOrder(body.customer_id, ids.map((product_id) => ({ product_id, quantity: wanted.get(product_id) })), new Date(), 'PLACED');
  return {
    ...order,
    items: order.items.map(({ product_id, quantity, unit_price }) => ({ product_id, quantity, unit_price })),
  };
}

async function route(req, url) {
  const q = url.searchParams;
  const path = url.pathname;
  const m = path.match(/^\/api\/products\/(\d+)$/);

  if (req.method === 'GET' && path === '/healthz') return [200, { status: 'ok' }];
  if (req.method === 'GET' && path === '/readyz') return [200, { status: 'ready' }];

  if (req.method === 'GET' && path === '/api/categories') {
    const items = Object.keys(CATALOG)
      .sort()
      .map((category) => {
        const ps = products.filter((p) => p.category === category);
        return { category, product_count: ps.length, in_stock_count: ps.filter((p) => p.in_stock > 0).length };
      });
    return [200, { items }];
  }

  if (req.method === 'GET' && path === '/api/products') {
    const limit = intParam(q, 'limit', 20, 1, 100);
    const offset = intParam(q, 'offset', 0, 0);
    const category = q.get('category');
    const list = category ? products.filter((p) => p.category === category) : products;
    return [200, { items: list.slice(offset, offset + limit), limit, offset }];
  }

  if (req.method === 'GET' && m) {
    const p = productById.get(Number(m[1]));
    if (!p) throw { status: 404, error: 'product_not_found', message: `product ${m[1]} not found`, product_id: Number(m[1]) };
    return [200, p];
  }

  if (req.method === 'GET' && path === '/api/customers') {
    const limit = intParam(q, 'limit', 50, 1, 1000);
    const items = customers.slice(0, limit).map((c) => ({ ...c, order_count: orders.filter((o) => o.customer_id === c.customer_id).length }));
    return [200, { items }];
  }

  if (req.method === 'GET' && path === '/api/orders') {
    const limit = intParam(q, 'limit', 20, 1, 100);
    const customerId = q.has('customer_id') ? intParam(q, 'customer_id', null, -(2 ** 31)) : null;
    const list = (customerId != null ? orders.filter((o) => o.customer_id === customerId) : orders).slice().reverse().slice(0, limit);
    return [200, { items: list.map(({ items, ...o }) => ({ ...o, items: items.map((i) => ({ ...i })) })) }];
  }

  if (req.method === 'POST' && path === '/api/orders') {
    return [201, placeOrder(await readJson(req))];
  }

  throw { status: 404, error: 'not_found', message: 'Not Found' };
}

const server = http.createServer(async (req, res) => {
  const started = performance.now();
  const incoming = req.headers['x-request-id'];
  const requestId = incoming && VALID_ID.test(incoming) ? incoming : crypto.randomUUID().replaceAll('-', '');
  res.setHeader('X-Request-ID', requestId);
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/__mock/simulate' && req.method === 'PUT') {
    const mode = url.searchParams.get('mode');
    globalMode = MODES.has(mode) ? mode : null;
    send(res, 200, { mode: globalMode ?? 'off' });
    return log(req, url, 200, started, requestId);
  }

  const mode = MODES.has(url.searchParams.get('simulate')) ? url.searchParams.get('simulate') : globalMode;
  let status;
  try {
    if (mode === 'slow') await sleep(SLOW_MS);
    if (mode === 'timeout') await sleep(TIMEOUT_MS);
    if (mode === 'error' && url.pathname.startsWith('/api/')) {
      await sleep(250);
      throw { status: 503, error: 'db_lock_timeout', sqlcode: -911, reason: 68, query: 'simulated' };
    }
    const [code, body] = await route(req, url);
    status = code;
    send(res, code, body);
  } catch (err) {
    if (err instanceof Error) {
      console.error(err);
      err = { status: 500, error: 'internal_error', message: 'internal server error' };
    }
    const { status: code, ...body } = err;
    status = code;
    send(res, code, { ...body, request_id: requestId });
  }
  log(req, url, status, started, requestId, mode);
});

function log(req, url, status, started, requestId, mode = null) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      logger: 'mockapi.access',
      request_id: requestId,
      method: req.method,
      path: url.pathname + url.search,
      status,
      duration_ms: Math.round((performance.now() - started) * 1000) / 1000,
      simulate: mode,
    }),
  );
}

server.listen(PORT, () => {
  console.log(JSON.stringify({ message: `mock apiserver listening on :${PORT}`, products: products.length, customers: customers.length, orders: orders.length, simulate: globalMode }));
});
