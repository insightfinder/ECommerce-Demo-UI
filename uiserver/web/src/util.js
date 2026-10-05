export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (n) => usd.format(Number(n));

export const LOW_STOCK = 5;

export function stockBadge(inStock) {
  if (inStock <= 0) return '<span class="badge badge-out">Out of stock</span>';
  if (inStock <= LOW_STOCK) return `<span class="badge badge-low">Only ${inStock} left</span>`;
  return '<span class="badge badge-ok">In stock</span>';
}

export function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
