// whatsapp.js — Web Share API wrapper. Extended from v2 to accept any
// blob + text combination, so it works identically for one product or many.

export function canShareFile(blob, filename = 'deal.png') {
  if (!navigator.canShare) return false;
  const file = new File([blob], filename, { type: 'image/png' });
  return navigator.canShare({ files: [file] });
}

export async function shareToWhatsApp(blob, text, filename = 'deal.png') {
  const file = new File([blob], filename, { type: 'image/png' });
  await navigator.share({
    files: [file],
    text,
    title: text,
  });
}
