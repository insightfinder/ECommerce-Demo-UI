// Shared, cached lookups. A failed load isn't cached, so the next page view
// asks again (a new user-driven request, not an automatic retry).

import { api } from './api.js';

let categories = null;
let categoriesPending = null;

export function loadCategories() {
  if (categories) return Promise.resolve(categories);
  categoriesPending ??= api('/api/categories')
    .then((data) => (categories = data.items))
    .finally(() => (categoriesPending = null));
  return categoriesPending;
}

export const cachedCategories = () => categories;
