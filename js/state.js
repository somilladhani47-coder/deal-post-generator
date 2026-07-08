// state.js — single source of truth for the current run's data.
// Kept intentionally tiny and framework-free.

export const state = {
  // One entry per non-empty link input, in order.
  products: [], // { url, title, images, marketplace, error }
  collageBlob: null,
  combinedTitle: '',
  mode: 'single', // 'single' | 'multi'
};

export function resetResult() {
  state.products = [];
  state.collageBlob = null;
  state.combinedTitle = '';
  state.mode = 'single';
}
