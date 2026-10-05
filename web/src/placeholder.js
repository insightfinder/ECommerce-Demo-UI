// Product images are generated locally (no external image hosts): a colored
// tile per category, shaded per product, with the category icon and the
// product's initials.

import { esc } from './util.js';

const CATEGORY_STYLE = {
  Electronics: { hue: 222, icon: 'M5 5h14v10H5zM9 19h6M12 15v4' },
  'Home & Kitchen': { hue: 28, icon: 'M4 11 12 4l8 7M6 10v9h12v-9' },
  Clothing: { hue: 330, icon: 'M8 4 4 7l2 3 2-1v10h8V9l2 1 2-3-4-3a4 4 0 0 1-8 0z' },
  'Sports & Outdoors': { hue: 140, icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18' },
  Books: { hue: 265, icon: 'M5 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5zM19 4h-4a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h4z' },
  'Beauty & Personal Care': { hue: 350, icon: 'M10 3h4v5h-4zM8 8h8v13H8z' },
  'Toys & Games': { hue: 48, icon: 'M5 5h14v14H5zM9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01' },
  Grocery: { hue: 100, icon: 'M5 7h14l-2 12H7zM9 7a3 3 0 0 1 6 0' },
};

function hashHue(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function initials(name) {
  const words = String(name).split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w));
  return ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase() || '?';
}

export function productTile(product, { size = 'card' } = {}) {
  const style = CATEGORY_STYLE[product.category] || { hue: hashHue(product.category || ''), icon: 'M4 4h16v16H4z' };
  // Vary lightness a little per product so a grid of one category isn't uniform.
  const shade = (Number(product.product_id) * 7) % 14;
  const bg1 = `hsl(${style.hue} 70% ${84 - shade}%)`;
  const bg2 = `hsl(${(style.hue + 25) % 360} 65% ${72 - shade}%)`;
  const fg = `hsl(${style.hue} 55% 24%)`;
  const id = `g${product.product_id}-${size}`;
  return `
    <svg class="tile tile-${size}" viewBox="0 0 200 200" role="img" aria-label="${esc(product.name)}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>
      <rect width="200" height="200" fill="url(#${id})"/>
      <g transform="translate(14 14) scale(1.5)" fill="none" stroke="${fg}" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${style.icon}"/></g>
      <text x="100" y="118" text-anchor="middle" font-family="system-ui, sans-serif" font-size="64" font-weight="700" fill="${fg}" fill-opacity=".85">${esc(initials(product.name))}</text>
      <text x="100" y="176" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" font-weight="600" letter-spacing="1" fill="${fg}" fill-opacity=".7">${esc(String(product.category || '').toUpperCase())}</text>
    </svg>`;
}
