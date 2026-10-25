// Locked content. On the public website the questions, notes, playbooks, search and PDFs are stored scrambled
// (AES-GCM). Each item has its own key, made from the owner's master key; only the owner's access script knows the
// master key and hands out keys for what this person may open (free picks for everyone, everything once paid).
// File layout: 'GSSCRFO1' (8 bytes) + 12-byte IV + ciphertext with its tag. Plain files (a development build) pass through.
const MAGIC = 'GSSCRFO1';
const LKEY = 'gsscrfo-licence';
const enc = new TextEncoder();

// which item a file belongs to (must match tools/encrypt.py and the free list in the access script)
export function itemForPath(path) {
  let m;
  path = decodeURIComponent(path.replace(/^.*?\b(data|content)\//, '$1/').split('?')[0]);
  if ((m = /^data\/sets\/(.+)\.json$/.exec(path))) return 'set:' + m[1];
  if ((m = /^data\/notes\/topic(\d+)\.html$/.exec(path))) return 'notes:' + m[1];
  if ((m = /^data\/playbooks\/(english|konkani)-playbook\.html$/.exec(path))) return 'playbook:' + m[1];
  if ((m = /^data\/cheats\/(\w+)\.html$/.exec(path))) return 'cheat:' + m[1];
  if (path === 'data/search.json') return 'search';
  if (/^data\/pool\//.test(path)) return 'custom';
  if ((m = /^content\/pdfs\/Topic-(\d+)-/.exec(path))) return 'notes:' + m[1];
  if (/^content\/pdfs\//.test(path)) return 'pdfs';
  return null;
}
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const keyCache = new Map();
async function keyFor(item) {
  if (keyCache.has(item)) return keyCache.get(item);
  let l = null; try { l = JSON.parse(localStorage.getItem(LKEY) || 'null'); } catch (e) { }
  const ks = (l && l.keys) || {};
  let raw = null;
  if (ks[item]) raw = b64(ks[item]);
  else if (ks['*']) {
    const mk = await crypto.subtle.importKey('raw', b64(ks['*']), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    raw = new Uint8Array(await crypto.subtle.sign('HMAC', mk, enc.encode(item)));
  }
  if (!raw) { const e = new Error('locked'); e.code = 'locked'; e.item = item; throw e; }
  const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  keyCache.set(item, k);
  return k;
}
export function forgetKeys() { keyCache.clear(); }
export const isLocked = buf => { const u = new Uint8Array(buf, 0, Math.min(8, buf.byteLength)); return String.fromCharCode.apply(null, u) === MAGIC; };
// bytes of a file as stored → its real bytes (decrypted when needed)
export async function open(buf, path) {
  if (!isLocked(buf)) return buf;
  const item = itemForPath(path);
  const key = await keyFor(item);
  try { return await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 8, 12) }, key, new Uint8Array(buf, 20)); }
  catch (e) { keyCache.delete(item); const x = new Error('locked'); x.code = 'locked'; x.item = item; throw x; } // an old key (the owner changed the master key)
}
export async function fetchText(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
  return new TextDecoder().decode(await open(await r.arrayBuffer(), url));
}
export async function fetchBlob(url, type) {
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
  return new Blob([await open(await r.arrayBuffer(), url)], { type: type || 'application/octet-stream' });
}
