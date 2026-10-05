import { esc } from '../util.js';

// Inline error state for a page section. The banner already says what failed;
// this keeps the page from looking empty and offers a manual reload.
export function errorState(container, err, what, onRetry) {
  const reason = err.isBackendFailure
    ? `${err.friendlyMessage}. Request ${err.requestId}.`
    : err.body?.message || `HTTP ${err.status}`;
  container.innerHTML = `
    <div class="empty">
      <h2>Couldn’t load ${esc(what)}</h2>
      <p class="muted">${esc(reason)}</p>
      <button class="btn" type="button">Try again</button>
    </div>`;
  container.querySelector('button').addEventListener('click', onRetry);
}

export function quantityPicker(value, max, { id = '' } = {}) {
  return `
    <div class="qty" data-qty ${id ? `data-id="${id}"` : ''}>
      <button type="button" class="qty-btn" data-step="-1" aria-label="Decrease" ${value <= 1 ? 'disabled' : ''}>−</button>
      <input type="number" min="1" max="${max}" value="${value}" aria-label="Quantity" />
      <button type="button" class="qty-btn" data-step="1" aria-label="Increase" ${value >= max ? 'disabled' : ''}>+</button>
    </div>`;
}

// Wires a quantityPicker; onChange receives the clamped value.
export function bindQuantityPicker(el, max, onChange) {
  const input = el.querySelector('input');
  const [dec, inc] = el.querySelectorAll('button');
  const set = (v) => {
    v = Math.max(1, Math.min(max, Number.isFinite(v) ? Math.round(v) : 1));
    input.value = v;
    dec.disabled = v <= 1;
    inc.disabled = v >= max;
    onChange(v);
  };
  dec.addEventListener('click', () => set(Number(input.value) - 1));
  inc.addEventListener('click', () => set(Number(input.value) + 1));
  input.addEventListener('change', () => set(Number(input.value)));
}

export function toast(html) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = html;
  document.body.append(el);
  setTimeout(() => el.remove(), 3000);
}
