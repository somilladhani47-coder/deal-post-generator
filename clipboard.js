// clipboard.js — unchanged behavior from v2, just isolated into its own module.

export async function copyImageBlob(blob) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}
