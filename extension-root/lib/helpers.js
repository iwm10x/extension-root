// lib/helpers.js
// 共通ユーティリティ（fetchWithTimeout, sha1Hex など）
// background.js に同様の実装があるため、必要に応じて共通化してください.

export async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') throw new Error('fetch timeout');
    throw err;
  }
}

export async function sha1Hex(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hash = await crypto.subtle.digest('SHA-1', data);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  return 'sha1:' + hex;
}