// collage.js — everything about turning image URLs into one merged PNG.
import { proxiedImageUrl } from './api.js';
import { CELL_SIZE } from './config.js';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}

// Draws `img` into a (w x h) rectangle at (dx,dy), cropping to cover
// (equivalent to CSS `object-fit: cover`) so every cell fills completely
// with no letterboxing, regardless of the source image's aspect ratio.
function drawCover(ctx, img, dx, dy, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const scaledW = img.width * scale;
  const scaledH = img.height * scale;
  const sx = dx - (scaledW - w) / 2;
  const sy = dy - (scaledH - h) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, w, h);
  ctx.clip();
  ctx.drawImage(img, sx, sy, scaledW, scaledH);
  ctx.restore();
}

/**
 * Balanced row-based grid plan for `n` items, no empty cells.
 * Matches the spec exactly for n = 1..8:
 *   1->[1] 2->[2] 3->[3] 4->[2,2] 5->[3,2] 6->[3,3] 7->[4,3] 8->[4,4]
 * Rows near the top get any remainder, so later rows are never emptier
 * than earlier ones.
 */
export function getGridPlan(n) {
  if (n <= 0) return [];
  if (n <= 3) return [n]; // single row

  let rows, maxCols;
  if (n === 4) { rows = 2; maxCols = 2; }
  else if (n <= 6) { rows = 2; maxCols = 3; }
  else { rows = 2; maxCols = 4; } // 7, 8

  const rowCounts = [];
  let remaining = n;
  for (let r = 0; r < rows; r++) {
    const rowsLeft = rows - r;
    const count = Math.min(Math.ceil(remaining / rowsLeft), maxCols);
    rowCounts.push(count);
    remaining -= count;
  }
  return rowCounts;
}

function borderColor() {
  return '#FBF6EE';
}

/**
 * Single-product mode (unchanged behavior from v2): merges up to 6 images
 * of ONE product into a square-celled 2x2 or 2x3 grid.
 */
export async function mergeSingleProduct(images) {
  const count = Math.min(images.length, 6);
  const cols = count <= 4 ? 2 : 3;
  const rows = 2;

  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL_SIZE;
  canvas.height = rows * CELL_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const loaded = await Promise.all(
    images.slice(0, cols * rows).map((u) => loadImage(proxiedImageUrl(u)).catch(() => null))
  );

  loaded.forEach((img, i) => {
    if (!img) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const dx = col * CELL_SIZE;
    const dy = row * CELL_SIZE;
    drawCover(ctx, img, dx, dy, CELL_SIZE, CELL_SIZE);
    ctx.strokeStyle = borderColor();
    ctx.lineWidth = 4;
    ctx.strokeRect(dx, dy, CELL_SIZE, CELL_SIZE);
  });

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
}

/**
 * Multi-product mode: merges the FIRST image of each product into one
 * balanced collage per getGridPlan(). Row cell width is computed per-row
 * (canvasWidth / itemsInThatRow), so every row fills edge-to-edge with
 * no empty space, and rows with fewer images simply get wider cells.
 */
export async function mergeMultiProduct(products) {
  const firstImages = products.map((p) => p.images && p.images[0]).filter(Boolean);
  const rowCounts = getGridPlan(firstImages.length);
  const rows = rowCounts.length;
  const maxCols = Math.max(...rowCounts);

  const canvas = document.createElement('canvas');
  canvas.width = maxCols * CELL_SIZE;
  canvas.height = rows * CELL_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const loaded = await Promise.all(
    firstImages.map((u) => loadImage(proxiedImageUrl(u)).catch(() => null))
  );

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const itemsInRow = rowCounts[r];
    const cellWidth = canvas.width / itemsInRow;
    for (let c = 0; c < itemsInRow; c++) {
      const img = loaded[idx++];
      const dx = c * cellWidth;
      const dy = r * CELL_SIZE;
      if (img) {
        drawCover(ctx, img, dx, dy, cellWidth, CELL_SIZE);
      }
      ctx.strokeStyle = borderColor();
      ctx.lineWidth = 4;
      ctx.strokeRect(dx, dy, cellWidth, CELL_SIZE);
    }
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
}
