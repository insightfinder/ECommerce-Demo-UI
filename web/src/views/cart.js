import { api } from '../api.js';
import { customerName } from '../header.js';
import { productTile } from '../placeholder.js';
import { clearCart, getCart, getCustomerId, saveLastOrder, setQuantity, cartTotal, cartCount, updateStock } from '../store.js';
import { esc, money } from '../util.js';
import { bindQuantityPicker, quantityPicker } from './shared.js';

export function renderCart(app, _params, ctx) {
  // Message from the last checkout attempt; survives re-renders of this page.
  let notice = null;
  let placing = false;

  function draw() {
    const cart = getCart();
    if (!cart.length) {
      app.innerHTML = `
        <div class="page-head"><h1>Your cart</h1></div>
        <div class="empty"><h2>Your cart is empty</h2><a class="btn btn-primary" href="#/">Browse products</a></div>`;
      return;
    }

    const customerId = getCustomerId();
    const who = customerName(customerId);
    const blocked = cart.some((l) => l.quantity > l.in_stock);

    app.innerHTML = `
      <div class="page-head"><h1>Your cart</h1><span class="muted">${cartCount()} items</span></div>
      <div class="cart-layout">
        <div class="cart-lines">
          ${cart.map(line).join('')}
        </div>
        <aside class="summary">
          <h2>Order summary</h2>
          <div class="summary-row"><span>Subtotal</span><span>${money(cartTotal())}</span></div>
          <div class="summary-row summary-total"><span>Total</span><span>${money(cartTotal())}</span></div>
          <p class="muted small">${customerId ? `Ordering as <strong>${esc(who ?? 'customer #' + customerId)}</strong>` : 'Choose a customer in “Signed in as” to check out.'}</p>
          ${notice ? `<div class="notice notice-${notice.type}">${notice.html}</div>` : ''}
          <button class="btn btn-primary btn-block" id="checkout" type="button" ${!customerId || blocked || placing ? 'disabled' : ''}>
            ${placing ? '<span class="spinner"></span> Placing order…' : 'Checkout'}
          </button>
        </aside>
      </div>`;

    app.querySelectorAll('[data-qty]').forEach((el) => {
      const id = Number(el.dataset.id);
      const l = cart.find((x) => x.product_id === id);
      bindQuantityPicker(el, Math.max(1, l.in_stock), (v) => {
        setQuantity(id, v);
        draw();
      });
    });
    app.querySelectorAll('[data-remove]').forEach((btn) =>
      btn.addEventListener('click', () => {
        setQuantity(Number(btn.dataset.remove), 0);
        draw();
      }),
    );
    app.querySelector('#checkout').addEventListener('click', checkout);
  }

  async function checkout() {
    const cart = getCart();
    const customerId = getCustomerId();
    placing = true;
    notice = null;
    draw();

    let order;
    try {
      order = await api('/api/orders', {
        method: 'POST',
        body: { customer_id: customerId, items: cart.map((l) => ({ product_id: l.product_id, quantity: l.quantity })) },
      });
    } catch (err) {
      placing = false;
      notice = checkoutError(err);
      if (ctx.isCurrent()) draw();
      return;
    }

    // The response has product ids only; keep names from the cart for the confirmation page.
    const names = Object.fromEntries(cart.map((l) => [l.product_id, { name: l.name, category: l.category }]));
    order.items = order.items.map((i) => ({ ...i, ...names[i.product_id] }));
    saveLastOrder(order);
    clearCart();
    location.hash = `#/order/${order.order_id}`;
  }

  draw();
}

function checkoutError(err) {
  if (err.status === 409 && err.code === 'insufficient_stock') {
    for (const s of err.body.items || []) updateStock(s.product_id, s.available);
    return { type: 'warn', html: 'Some items no longer have enough stock. Adjust the highlighted quantities and try again.' };
  }
  if (!err.isBackendFailure) {
    return { type: 'error', html: `Order not placed: ${esc(err.body?.message || err.code || 'HTTP ' + err.status)}.` };
  }
  // A timeout or gateway error means the apiserver may still have committed it.
  if (err.kind !== 'http' || err.status === 502 || err.status === 504) {
    return {
      type: 'error',
      html: `We couldn’t confirm your order (${esc(err.friendlyMessage)}). Check <a href="#/orders">Order history</a> before trying again. Request ${esc(err.requestId)}.`,
    };
  }
  return { type: 'error', html: `Your order was not placed: ${esc(err.friendlyMessage)}. Request ${esc(err.requestId)}.` };
}

function line(l) {
  const short = l.quantity > l.in_stock;
  return `
    <div class="cart-line ${short ? 'cart-line-short' : ''}">
      <a href="#/product/${l.product_id}" class="cart-thumb">${productTile(l, { size: 'thumb' })}</a>
      <div class="cart-line-info">
        <a href="#/product/${l.product_id}" class="card-title">${esc(l.name)}</a>
        <span class="muted small">${money(l.price)} each</span>
        ${short ? `<span class="stock-warning">${l.in_stock > 0 ? `Only ${l.in_stock} available` : 'Out of stock — remove to continue'}</span>` : ''}
      </div>
      ${quantityPicker(l.quantity, Math.max(1, l.in_stock), { id: l.product_id })}
      <span class="line-total">${money(l.quantity * Number(l.price))}</span>
      <button class="icon-btn" type="button" data-remove="${l.product_id}" aria-label="Remove ${esc(l.name)}">✕</button>
    </div>`;
}
