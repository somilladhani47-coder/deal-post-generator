// ui.js — wires up the DOM: dynamic link rows, the Generate flow,
// progress messages, and mode-dependent buttons (single vs multi product).

import { MAX_PRODUCTS } from './config.js';
import { state, resetResult } from './state.js';
import { fetchProduct, isWorkerConfigured } from './api.js';
import { mergeSingleProduct, mergeMultiProduct } from './collage.js';
import { copyImageBlob, copyText } from './clipboard.js';
import { canShareFile, shareToWhatsApp } from './whatsapp.js';

let rowCount = 0;

const el = {
  linksContainer: document.getElementById('linksContainer'),
  addProductBtn: document.getElementById('addProductBtn'),
  genBtn: document.getElementById('genBtn'),
  status: document.getElementById('status'),
  resultCard: document.getElementById('resultCard'),
  previewImg: document.getElementById('previewImg'),
  titleBox: document.getElementById('titleBox'),
  copyImgBtn: document.getElementById('copyImgBtn'),
  copyTitleBtn: document.getElementById('copyTitleBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  shareBtn: document.getElementById('shareBtn'),
  warnings: document.getElementById('warnings'),
};

function setStatus(msg, isErr) {
  el.status.textContent = msg || '';
  el.status.className = 'status' + (isErr ? ' err' : '');
}

function setLoading(loading) {
  el.genBtn.disabled = loading;
  el.genBtn.innerHTML = loading ? '<span class="spinner"></span>Working…' : 'Generate';
}

function addLinkRow() {
  const rows = el.linksContainer.querySelectorAll('.link-row').length;
  if (rows >= MAX_PRODUCTS) return;

  rowCount += 1;
  const n = rowCount;

  const row = document.createElement('div');
  row.className = 'link-row';
  row.innerHTML = `
    <label>Link ${rows + 1}</label>
    <div class="link-input-row">
      <input type="text" class="link-input" placeholder="Paste any shopping link…" autocomplete="off" />
      <button type="button" class="remove-row-btn" title="Remove this link" aria-label="Remove this link">×</button>
    </div>
  `;
  row.querySelector('.remove-row-btn').addEventListener('click', () => {
    row.remove();
    renumberRows();
    updateAddButtonState();
  });

  el.linksContainer.appendChild(row);
  updateAddButtonState();
}

function renumberRows() {
  const rows = el.linksContainer.querySelectorAll('.link-row');
  rows.forEach((row, i) => {
    row.querySelector('label').textContent = 'Link ' + (i + 1);
  });
}

function updateAddButtonState() {
  const rows = el.linksContainer.querySelectorAll('.link-row').length;
  el.addProductBtn.disabled = rows >= MAX_PRODUCTS;
  el.addProductBtn.textContent =
    rows >= MAX_PRODUCTS ? `Maximum ${MAX_PRODUCTS} products` : '+ Add product';
}

function getLinkValues() {
  return [...el.linksContainer.querySelectorAll('.link-input')]
    .map((input) => input.value.trim())
    .filter(Boolean);
}

async function generate() {
  const links = getLinkValues();

  if (!links.length) {
    setStatus('Paste at least one product link.', true);
    return;
  }
  if (!isWorkerConfigured()) {
    setStatus('Set WORKER_URL in js/config.js to your deployed Cloudflare Worker URL.', true);
    return;
  }

  resetResult();
  el.resultCard.classList.add('hidden');
  el.warnings.classList.add('hidden');
  el.warnings.textContent = '';
  setLoading(true);
  setStatus(links.length > 1 ? 'Resolving links…' : 'Fetching product data…');

  const settled = await Promise.allSettled(links.map((link) => fetchProduct(link)));

  const succeeded = [];
  const failures = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      succeeded.push(result.value);
    } else {
      failures.push({ link: links[i], index: i + 1, message: result.reason.message });
    }
  });

  if (!succeeded.length) {
    setLoading(false);
    setStatus('Could not extract any of the links provided. ' + failures[0].message, true);
    return;
  }

  if (failures.length) {
    el.warnings.classList.remove('hidden');
    el.warnings.textContent =
      'Skipped ' +
      failures.length +
      ' link(s) that could not be read: ' +
      failures.map((f) => `Link ${f.index} (${f.message})`).join('; ');
  }

  state.products = succeeded;
  const isMulti = links.length > 1;
  state.mode = isMulti ? 'multi' : 'single';

  try {
    setStatus('Downloading images…');
    let blob;
    if (isMulti) {
      blob = await mergeMultiProduct(succeeded);
      state.combinedTitle = succeeded.map((p) => p.title).join('\n\n\n');
    } else {
      blob = await mergeSingleProduct(succeeded[0].images);
      state.combinedTitle = succeeded[0].title;
    }

    setStatus('Generating collage…');
    state.collageBlob = blob;

    renderResult(isMulti, succeeded.length);
    setStatus(
      isMulti
        ? `Done. Collage of ${succeeded.length} product(s) ready.`
        : `Done. ${succeeded[0].images.length} images merged.`
    );
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    setLoading(false);
  }
}

function renderResult(isMulti, count) {
  el.previewImg.src = URL.createObjectURL(state.collageBlob);
  el.titleBox.textContent = state.combinedTitle;

  el.copyImgBtn.textContent = isMulti ? 'Copy collage' : 'Copy image';
  el.copyTitleBtn.textContent = isMulti ? 'Copy titles' : 'Copy title';

  el.resultCard.classList.remove('hidden');

  if (canShareFile(state.collageBlob)) {
    el.shareBtn.classList.remove('hidden');
  } else {
    el.shareBtn.classList.add('hidden');
  }
}

function flashCopied(btn, resetLabel) {
  const original = resetLabel;
  btn.textContent = 'Copied ✓';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('copied');
  }, 1400);
}

async function onCopyImage() {
  if (!state.collageBlob) return;
  const label = state.mode === 'multi' ? 'Copy collage' : 'Copy image';
  try {
    await copyImageBlob(state.collageBlob);
    flashCopied(el.copyImgBtn, label);
  } catch {
    setStatus('Clipboard image copy is not supported in this browser. Use Download instead.', true);
  }
}

async function onCopyTitle() {
  if (!state.combinedTitle) return;
  const label = state.mode === 'multi' ? 'Copy titles' : 'Copy title';
  try {
    await copyText(state.combinedTitle);
    flashCopied(el.copyTitleBtn, label);
  } catch {
    setStatus('Could not copy automatically. Select the text above manually.', true);
  }
}

function onDownload() {
  if (!state.collageBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(state.collageBlob);
  a.download = state.mode === 'multi' ? 'deal-collage.png' : 'deal-post.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function onShare() {
  if (!state.collageBlob) return;
  try {
    await shareToWhatsApp(
      state.collageBlob,
      state.combinedTitle,
      state.mode === 'multi' ? 'deal-collage.png' : 'deal.png'
    );
  } catch {
    // user cancelled the share sheet — no action needed
  }
}

export function initUI() {
  addLinkRow(); // start with Link 1
  el.addProductBtn.addEventListener('click', addLinkRow);
  el.genBtn.addEventListener('click', generate);
  el.copyImgBtn.addEventListener('click', onCopyImage);
  el.copyTitleBtn.addEventListener('click', onCopyTitle);
  el.downloadBtn.addEventListener('click', onDownload);
  el.shareBtn.addEventListener('click', onShare);

  el.linksContainer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('link-input')) {
      e.preventDefault();
      generate();
    }
  });
}
