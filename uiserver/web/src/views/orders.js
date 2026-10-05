import { api } from '../api.js';
import { customerName } from '../header.js';
import { getCustomerId } from '../store.js';
import { esc, formatDate, money } from '../util.js';
import { errorState } from './shared.js';

const skeletonOrder = `
  <div class="order-card">
    <div class="skeleton skeleton-line short"></div>
    <div class="skeleton skeleton-line"></div>
    <div class="skeleton skeleton-line"></div>
  </div>`;

export async function renderOrders(app, _params, ctx) {
  const customerId = getCustomerId();
  if (!customerId) {
    app.innerHTML = `<div class="empty"><h1>Order history</h1><p class="muted">Choose a customer in “Signed in as” to see their orders.</p></div>`;
    return;
  }

  const who = customerName(customerId);
  app.innerHTML = `
    <div class="page-head"><h1>Order history</h1><span class="muted">${esc(who ?? 'Customer #' + customerId)} · last 20 orders</span></div>
    <div class="orders" id="orders">${skeletonOrder.repeat(3)}</div>`;
  const list = app.querySelector('#orders');

  let orders;
  try {
    ({ items: orders } = await api(`/api/orders?customer_id=${customerId}&limit=20`));
  } catch (err) {
    if (ctx.isCurrent()) errorState(list, err, 'your orders', ctx.rerender);
    return;
  }
  if (!ctx.isCurrent()) return;

  if (!orders.length) {
    list.innerHTML = `<div class="empty"><h2>No orders yet</h2><a class="btn btn-primary" href="#/">Start shopping</a></div>`;
    return;
  }

  list.innerHTML = orders
    .map(
      (o) => `
    <div class="order-card">
      <div class="order-head">
        <div><strong>Order #${esc(o.order_id)}</strong> <span class="muted">· ${esc(formatDate(o.order_date))}</span></div>
        <span class="badge badge-status">${esc(o.status)}</span>
      </div>
      ${o.items
        .map(
          (i) => `
        <div class="order-item order-item-compact">
          <a class="order-item-name" href="#/product/${i.product_id}">${esc(i.name)}</a>
          <span class="muted">${i.quantity} × ${money(i.unit_price)}</span>
          <span>${money(i.quantity * i.unit_price)}</span>
        </div>`,
        )
        .join('')}
      <div class="order-total"><span>Total</span><span>${money(o.total)}</span></div>
    </div>`,
    )
    .join('');
}
