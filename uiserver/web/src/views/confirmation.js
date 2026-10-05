import { productTile } from '../placeholder.js';
import { getLastOrder } from '../store.js';
import { esc, formatDate, money } from '../util.js';

export function renderConfirmation(app, [id]) {
  const order = getLastOrder();
  if (!order || String(order.order_id) !== id) {
    app.innerHTML = `
      <div class="empty">
        <h1>Order #${esc(id)}</h1>
        <p class="muted">The details of this order are in your order history.</p>
        <a class="btn btn-primary" href="#/orders">View order history</a>
      </div>`;
    return;
  }

  app.innerHTML = `
    <div class="confirm">
      <div class="confirm-check" aria-hidden="true">✓</div>
      <h1>Thanks — your order is placed</h1>
      <p class="muted">Order <strong>#${esc(order.order_id)}</strong> · ${esc(formatDate(order.order_date))} · ${esc(order.status)}</p>
      <div class="order-card">
        ${order.items
          .map(
            (i) => `
          <div class="order-item">
            <span class="order-thumb">${productTile({ product_id: i.product_id, name: i.name || '#' + i.product_id, category: i.category || '' }, { size: 'thumb' })}</span>
            <span class="order-item-name">${esc(i.name || 'Product #' + i.product_id)}</span>
            <span class="muted">${i.quantity} × ${money(i.unit_price)}</span>
            <span>${money(i.quantity * i.unit_price)}</span>
          </div>`,
          )
          .join('')}
        <div class="order-total"><span>Total</span><span>${money(order.total)}</span></div>
      </div>
      <div class="confirm-actions">
        <a class="btn btn-primary" href="#/">Continue shopping</a>
        <a class="btn btn-ghost" href="#/orders">Order history</a>
      </div>
    </div>`;
}
