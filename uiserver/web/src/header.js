import { api } from './api.js';
import { loadCategories, cachedCategories } from './data.js';
import { cartCount, getCustomerId, setCustomerId } from './store.js';
import { esc } from './util.js';

const header = document.getElementById('header');

header.innerHTML = `
  <div class="container header-top">
    <a class="brand" href="#/">
      <img src="/favicon.svg" alt="" width="28" height="28" />
      <span>Demo Store</span>
    </a>
    <div class="header-actions">
      <label class="signin">
        <span class="muted">Signed in as</span>
        <select id="customer-select" aria-label="Signed in as" disabled><option>Loading…</option></select>
      </label>
      <a class="header-link" href="#/orders">Orders</a>
      <a class="cart-link" href="#/cart" aria-label="Cart">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 4h2l2.4 11h11l2-8H6.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="9" cy="19.5" r="1.5" fill="currentColor"/><circle cx="17" cy="19.5" r="1.5" fill="currentColor"/></svg>
        <span id="cart-count" class="cart-count"></span>
      </a>
    </div>
  </div>
  <nav class="category-nav"><div class="container" id="category-nav"></div></nav>`;

const nav = header.querySelector('#category-nav');
const select = header.querySelector('#customer-select');
const countEl = header.querySelector('#cart-count');

select.addEventListener('change', () => setCustomerId(Number(select.value)));

export function updateCartCount() {
  const n = cartCount();
  countEl.textContent = n;
  countEl.hidden = n === 0;
}
updateCartCount();

let current = { path: '/', category: null };

function renderNav() {
  const cats = cachedCategories();
  const active = current.path === '/' ? current.category || '' : null;
  const link = (name, label) =>
    `<a href="#/${name ? '?category=' + encodeURIComponent(name) : ''}" class="${active === name ? 'active' : ''}">${esc(label)}</a>`;
  nav.innerHTML =
    link('', 'All products') +
    (cats
      ? cats.map((c) => link(c.category, c.category)).join('')
      : '<span class="skeleton skeleton-pill"></span>'.repeat(5));
}

export function renderHeader(path, query) {
  current = { path, category: query.get('category') };
  renderNav();
  if (!cachedCategories()) {
    loadCategories().then(renderNav, () => {
      nav.innerHTML = `${nav.querySelector('a').outerHTML}<span class="muted nav-error">Categories unavailable</span>`;
    });
  }
}

let customers = [];
let customersLoaded = false;

export const customerName = (id) => customers.find((c) => c.customer_id === id)?.name ?? null;
let customersPending = false;

export function ensureCustomers() {
  if (customersLoaded || customersPending) return;
  customersPending = true;
  api('/api/customers?limit=50')
    .then(({ items }) => {
      customers = items;
      customersLoaded = true;
      let selected = getCustomerId();
      if (!items.some((c) => c.customer_id === selected) && items.length) {
        selected = items[0].customer_id;
        setCustomerId(selected);
      }
      select.innerHTML = items
        .map((c) => `<option value="${c.customer_id}" title="${esc(c.email)}" ${c.customer_id === selected ? 'selected' : ''}>${esc(c.name)}</option>`)
        .join('');
      select.disabled = false;
      window.dispatchEvent(new Event('customers-loaded'));
    })
    .catch(() => {
      select.innerHTML = '<option>Unavailable</option>';
    })
    .finally(() => (customersPending = false));
}
