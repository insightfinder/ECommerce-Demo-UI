import { api } from '../api.js';
import { productTile } from '../placeholder.js';
import { addToCart, getCart } from '../store.js';
import { esc, money, stockBadge } from '../util.js';
import { bindQuantityPicker, errorState, quantityPicker, toast } from './shared.js';

export async function renderProduct(app, [id], ctx) {
  app.innerHTML = `
    <a class="back" href="#/">← Back to products</a>
    <div class="detail">
      <div class="skeleton skeleton-tile detail-image"></div>
      <div class="detail-info">
        <div class="skeleton skeleton-line short"></div>
        <div class="skeleton skeleton-heading"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line short"></div>
      </div>
    </div>`;

  let p;
  try {
    p = await api(`/api/products/${id}`);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err.status === 404) {
      app.innerHTML = `<div class="empty"><h1>Product not found</h1><a class="btn" href="#/">Back to the store</a></div>`;
    } else {
      errorState(app.querySelector('.detail'), err, 'this product', ctx.rerender);
    }
    return;
  }
  if (!ctx.isCurrent()) return;

  const inCart = getCart().find((l) => l.product_id === p.product_id)?.quantity || 0;
  const canAdd = Math.max(0, p.in_stock - inCart);
  let qty = 1;

  app.innerHTML = `
    <a class="back" href="#/?category=${encodeURIComponent(p.category)}">← ${esc(p.category)}</a>
    <div class="detail">
      <div class="detail-image">${productTile(p, { size: 'large' })}</div>
      <div class="detail-info">
        <span class="eyebrow">${esc(p.category)}</span>
        <h1>${esc(p.name)}</h1>
        <div class="detail-price">${money(p.price)}</div>
        <div>${stockBadge(p.in_stock)}</div>
        <p class="description">${esc(p.description || '')}</p>
        ${
          canAdd > 0
            ? `<div class="buy-row">${quantityPicker(1, canAdd)}<button class="btn btn-primary" id="add" type="button">Add to cart</button></div>`
            : p.in_stock > 0
              ? `<p class="muted">You already have all ${p.in_stock} available in your cart.</p>`
              : ''
        }
        ${inCart ? `<p class="muted">${inCart} in your cart · <a href="#/cart">View cart</a></p>` : ''}
      </div>
    </div>`;

  if (canAdd > 0) {
    bindQuantityPicker(app.querySelector('[data-qty]'), canAdd, (v) => (qty = v));
    app.querySelector('#add').addEventListener('click', () => {
      addToCart(p, qty);
      toast(`Added ${qty} × <strong>${esc(p.name)}</strong> · <a href="#/cart">View cart</a>`);
      ctx.rerender();
    });
  }
}
