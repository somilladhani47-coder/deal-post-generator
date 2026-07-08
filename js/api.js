// api.js — talks to the Cloudflare Worker.
import { WORKER_URL } from './config.js';

export async function fetchProduct(link) {
  const apiUrl = WORKER_URL + '/api?url=' + encodeURIComponent(link);
  const resp = await fetch(apiUrl);
  const data = await resp.json();
  if (!resp.ok || data.error) {
    throw new Error(data.error || 'Could not fetch product data.');
  }
  return data; // { title, images, marketplace, sourceUrl, resolvedUrl }
}

export function proxiedImageUrl(imageUrl) {
  return WORKER_URL + '/img?url=' + encodeURIComponent(imageUrl);
}

export function isWorkerConfigured() {
  return !WORKER_URL.includes('YOUR-WORKER-SUBDOMAIN');
}
