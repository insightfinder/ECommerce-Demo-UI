import { api } from '../api.js';
import { loadCategories } from '../data.js';
import { productTile } from '../placeholder.js';
import { addToCart, getCart } from '../store.js';
import { esc, money, stockBadge } from '../util.js';
import { errorState, toast } from './shared.js';

export const PAGE_SIZE = 12;

const skeletonCard = `
  <div class="card">
    <div class="skeleton skeleton-tile"></div>
    <div class="card-body">
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line short"></div>
    </div>
  </div>`;

function pageHref(category, page) {
  const q = new URLSearchParams();
  if (category) q.set('category', category);
  if (page > 1) q.set('page', page);
  const qs = q.toString();
  return `#/${qs ? '?' + qs : ''}`;
}

export async function renderCatalog(app, _params, ctx) {
  const category = ctx.query.get('category') || '';
  const page = Math.max(1, Number(ctx.query.get('page')) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  app.innerHTML = `
    <div class="page-head">
      <h1>${esc(category || 'All products')}</h1>
      <span class="muted" id="result-info"></span>
    </div>
    <div class="grid" id="grid">${skeletonCard.repeat(PAGE_SIZE)}</div>
    <div id="pager"></div>`;
  const grid = app.querySelector('#grid');

  const q = new URLSearchParams({ limit: PAGE_SIZE, offset });
  if (category) q.set('category', category);

  let products;
  try {
    ({ items: products } = await api(`/api/products?${q}`));
  } catch (err) {
    if (ctx.isCurrent()) errorState(grid, err, 'products', ctx.rerender);
    return;
  }
  if (!ctx.isCurrent()) return;

  if (!products.length) {
    grid.innerHTML = `<div class="empty"><h2>No products here</h2><a class="btn" href="#/">See all products</a></div>`;
  } else {
    grid.innerHTML = products.map(card).join('');
    grid.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = products.find((x) => x.product_id === Number(btn.dataset.add));
        const inCart = getCart().find((l) => l.product_id === p.product_id)?.quantity || 0;
        if (inCart >= p.in_stock) {
          toast(`All ${p.in_stock} available are already in your cart · <a href="#/cart">View cart</a>`);
          return;
        }
        addToCart(p, 1);
        toast(`Added <strong>${esc(p.name)}</strong> to your cart · <a href="#/cart">View cart</a>`);
      });
    });
  }

  // The products endpoint has no total count; the category counts give one.
  // If categories can't load, fall back to "is there a full page?".
  let total = null;
  try {
    const cats = await loadCategories();
    total = category
      ? cats.find((c) => c.category === category)?.product_count ?? null
      : cats.reduce((n, c) => n + c.product_count, 0);
  } catch {
    /* banner already shows the failure */
  }
  if (!ctx.isCurrent()) return;

  const pages = total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null;
  const hasNext = pages != null ? page < pages : products.length === PAGE_SIZE;
  if (total != null) app.querySelector('#result-info').textContent = `${total} products`;
  app.querySelector('#pager').innerHTML = `
    <nav class="pager">
      <a class="btn btn-ghost ${page <= 1 ? 'disabled' : ''}" href="${pageHref(category, page - 1)}">← Previous</a>
      <span class="muted">Page ${page}${pages ? ` of ${pages}` : ''}</span>
      <a class="btn btn-ghost ${hasNext ? '' : 'disabled'}" href="${pageHref(category, page + 1)}">Next →</a>
    </nav>`;
}

function card(p) {
  const out = p.in_stock <= 0;
  return `
    <div class="card">
      <a href="#/product/${p.product_id}" class="card-link">${productTile(p)}</a>
      <div class="card-body">
        <a href="#/product/${p.product_id}" class="card-title">${esc(p.name)}</a>
        <div class="card-meta">
          <span class="price">${money(p.price)}</span>
          ${stockBadge(p.in_stock)}
        </div>
        <button class="btn btn-small" type="button" data-add="${p.product_id}" ${out ? 'disabled' : ''}>
          ${out ? 'Unavailable' : 'Add to cart'}
        </button>
      </div>
    </div>`;
}
