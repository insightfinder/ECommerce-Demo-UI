import './style.css';
import './status.js';
import { renderHeader, updateCartCount, ensureCustomers } from './header.js';
import { onChange, getCustomerId } from './store.js';
import { renderCatalog } from './views/catalog.js';
import { renderProduct } from './views/product.js';
import { renderCart } from './views/cart.js';
import { renderConfirmation } from './views/confirmation.js';
import { renderOrders } from './views/orders.js';

const app = document.getElementById('app');

const routes = [
  [/^\/$/, renderCatalog],
  [/^\/product\/(\d+)$/, renderProduct],
  [/^\/cart$/, renderCart],
  [/^\/order\/(\d+)$/, renderConfirmation],
  [/^\/orders$/, renderOrders],
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, query: new URLSearchParams(qs) };
}

// Each render gets a token; a view checks isCurrent() after every await so a
// slow response for a page the user already left doesn't overwrite the new one.
let renderToken = 0;

function route() {
  const token = ++renderToken;
  const { path, query } = parseHash();
  const ctx = { query, isCurrent: () => token === renderToken, rerender: route };
  renderHeader(path, query);
  ensureCustomers();
  window.scrollTo(0, 0);

  for (const [pattern, view] of routes) {
    const m = path.match(pattern);
    if (m) return view(app, m.slice(1), ctx);
  }
  app.innerHTML = `<div class="empty"><h1>Page not found</h1><a class="btn" href="#/">Back to the store</a></div>`;
}

// Pages that depend on the signed-in customer re-render when it changes.
const rerenderCustomerPages = () => {
  if (['/orders', '/cart'].includes(parseHash().path)) route();
};

let lastCustomer = getCustomerId();
onChange(() => {
  updateCartCount();
  if (getCustomerId() !== lastCustomer) {
    lastCustomer = getCustomerId();
    rerenderCustomerPages();
  }
});
// The cart shows the customer's name; no API call, so re-rendering is free.
window.addEventListener('customers-loaded', () => parseHash().path === '/cart' && route());

window.addEventListener('hashchange', route);
route();
