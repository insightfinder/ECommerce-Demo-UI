// Client-side state kept in localStorage: the cart and the "signed in" customer.
// Every access is guarded because storage can be unavailable (private windows).

const CART_KEY = 'demo-store.cart';
const CUSTOMER_KEY = 'demo-store.customer';
const LAST_ORDER_KEY = 'demo-store.last-order';

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

function read(key, fallback, storage = 'localStorage') {
  try {
    const raw = window[storage].getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value, storage = 'localStorage') {
  try {
    window[storage].setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: state lasts for this page load only */
  }
}

// Cart lines keep a snapshot of the product so the cart renders without API calls.
let cart = read(CART_KEY, []);

export const getCart = () => cart;
export const cartCount = () => cart.reduce((n, line) => n + line.quantity, 0);
export const cartTotal = () => cart.reduce((sum, line) => sum + line.quantity * Number(line.price), 0);

function saveCart() {
  write(CART_KEY, cart);
  emit();
}

export function addToCart(product, quantity) {
  const line = cart.find((l) => l.product_id === product.product_id);
  const max = product.in_stock;
  if (line) {
    line.quantity = Math.min(line.quantity + quantity, max);
    Object.assign(line, { name: product.name, price: product.price, in_stock: product.in_stock });
  } else {
    cart.push({
      product_id: product.product_id,
      name: product.name,
      category: product.category,
      price: product.price,
      in_stock: product.in_stock,
      quantity: Math.min(quantity, max),
    });
  }
  saveCart();
}

export function setQuantity(productId, quantity) {
  const line = cart.find((l) => l.product_id === productId);
  if (!line) return;
  if (quantity <= 0) cart = cart.filter((l) => l !== line);
  else line.quantity = quantity;
  saveCart();
}

export function updateStock(productId, available) {
  const line = cart.find((l) => l.product_id === productId);
  if (line) {
    line.in_stock = available;
    saveCart();
  }
}

export function clearCart() {
  cart = [];
  saveCart();
}

let customerId = read(CUSTOMER_KEY, null);
export const getCustomerId = () => customerId;
export function setCustomerId(id) {
  customerId = id;
  write(CUSTOMER_KEY, id);
  emit();
}

// The confirmation page reads the order placed in this tab (there is no
// GET /api/orders/{id} endpoint).
export const saveLastOrder = (order) => write(LAST_ORDER_KEY, order, 'sessionStorage');
export const getLastOrder = () => read(LAST_ORDER_KEY, null, 'sessionStorage');
