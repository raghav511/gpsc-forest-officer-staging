// GSSC RFO core: storage, data loading, grading, router helpers, small UI primitives.
// Storage keys start gssc-rfo- / gsscrfo- so this app never shares data with GPSCavy on the same website.

import { fetchText } from './vault.js?v=gsscrfo-2fc7a97e47';

export const HKEY = 'gssc-rfo-history-v1';
export const CKEY = 'gsscrfo-custom-v1';
export const SKEY = 'gsscrfo-settings-v1';
export const L5 = ['A', 'B', 'C', 'D', 'E'];
// Sections in the order the app lists them. CBT-II: Reasoning, Numerical, English (comprehension + grammar), Forestry & Science.
// Konkani is in CBT-I only (screening; 4 of 10 needed to pass).
export const SECS = ['lr', 'num', 'comp', 'gram', 'core', 'kon'];
export const SEC = {
  lr: { name: 'Reasoning', long: 'Test of reasoning', code: 'r' },
  num: { name: 'Numerical', long: 'Numerical ability', code: 'n' },
  comp: { name: 'Comprehension', long: 'English comprehension', code: 'c' },
  gram: { name: 'Grammar', long: 'English grammar', code: 'g' },
  core: { name: 'Forestry & Science', long: 'Forestry and science (subject test)', code: 'o', short: 'Forestry' },
  kon: { name: 'Konkani', long: 'Konkani language', code: 'k' }
};
export const CODE2SEC = { r: 'lr', n: 'num', c: 'comp', g: 'gram', o: 'core', k: 'kon' };
export const LV = { E: 'Easy', I: 'Intermediate', H: 'Hard' };
export const LVL = { easy: 'Easy', intermediate: 'Intermediate', hard: 'Hard' };
export const LVK = { easy: 'E', intermediate: 'I', hard: 'H' };
export const TOPIC_NAMES = { 1: 'Ecology', 2: 'Silviculture', 3: 'Trees & Botany', 4: 'Wildlife', 5: 'Forest laws', 6: 'Mensuration & GIS', 7: 'Protection', 8: 'Soil & Agroforestry', 9: 'General science', 10: 'Environment & Coast' };
// The CBT-II exam (GSSC Advertisement 2 of 2026, Range Forest Officer). GSSC had not announced the date by October 2026:
// the owner sets it in the access sheet (Settings tab, 'exam' row), or a student sets their own in Settings.
export const EXAM_INFO = { name: 'CBT-II', marks: 80, minutes: 100, sections: 4, pass: [['SC/ST', 35], ['OBC', 40], ['UR/EWS', 45]] };
export function examDate() {
  const d = settings.examDate || (lsGet('gsscrfo-licence', null) || {}).exam || ''; // the student's own date, else the owner's
  const t = d ? new Date(d + 'T00:00:00+05:30') : null;
  return t && !isNaN(t) ? t : null;
}

// the one scrolling area of the app (the page itself never scrolls)
export const SC = () => document.getElementById('app');
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
export function fmt(ms) { let s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60); s %= 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
export function mins(ms) { return Math.max(1, Math.round(ms / 60000)) + ' min'; }
export function day(iso) { const d = new Date(iso); if (isNaN(d)) return ''; try { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); } catch (e) { return d.toDateString().slice(4, 10); } }
export function daysLeft() { const e = examDate(); return e ? Math.max(0, Math.ceil((e - Date.now()) / 86400000)) : null; }
export const idle = window.requestIdleCallback ? (f, t) => requestIdleCallback(f, { timeout: t || 400 }) : f => setTimeout(f, 1);

// ---------- storage ----------
export function lsGet(k, def) { try { const r = localStorage.getItem(k); return r == null ? def : JSON.parse(r); } catch (e) { return def; } }
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
export function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
export function lsKeys() { const o = []; try { for (let i = 0; i < localStorage.length; i++) o.push(localStorage.key(i)); } catch (e) { } return o; }

export const settings = lsGet(SKEY, null) || {};
export function saveSettings() { lsSet(SKEY, settings); }

// ---------- data ----------
const cache = new Map();
function getJSON(url) {
  if (!cache.has(url)) {
    const p = fetchText(url).then(t => JSON.parse(t));
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url);
}
export let IDX = null, META = null, KEYS = null;
// core topics that have notes in the app (kept in step with tools/build.py)
export const NOTE_TOPICS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const hasNotes = t => NOTE_TOPICS.includes(+t);
const byId = new Map();
export const getIndex = () => getJSON('data/index.json').then(d => { if (!IDX) { IDX = d; d.sets.forEach(s => byId.set(s.id, s)); } return d; });
export const getMeta = () => getJSON('data/meta.json').then(d => (META = d));
export const getKeys = () => getJSON('data/keys.json').then(d => (KEYS = d));
export const getPool = sec => getJSON('data/pool/' + sec + '.json');
export const getSearch = () => getJSON('data/search.json');
export const getText = url => { if (!cache.has(url)) { const p = fetchText(url); p.catch(() => cache.delete(url)); cache.set(url, p); } return cache.get(url); };
export const setInfo = id => byId.get(id) || null;

// A set by id: a file in data/sets, or a custom test rebuilt from the pools.
export async function getSet(id) {
  if (id.startsWith('custom-')) return buildCustomSet(id);
  return getJSON('data/sets/' + id + '.json');
}
export function prefetchSet(id) { if (id && !id.startsWith('custom-')) getSet(id).catch(() => { }); }

// ---------- custom tests ----------
export const customs = () => lsGet(CKEY, {});
export function saveCustom(def) { const c = customs(); c[def.id] = def; lsSet(CKEY, c); }
export function deleteCustom(id) { const c = customs(); if (c[id]) { c[id].saved = false; lsSet(CKEY, c); } }
async function buildCustomSet(id) {
  const def = findDef(id);
  if (!def) throw new Error('Custom test not found');
  const secs = SECS.filter(s => def.refs.some(r => r[1] === s));
  const pools = {};
  await Promise.all(secs.map(s => getPool(s).then(p => (pools[s] = p))).concat([getKeys()]));
  const qs = [], passages = {};
  def.refs.forEach((r, i) => {
    const p = pools[r[1]];
    let row = p.q.find(x => x[0] === r[0]);
    if (!row) { const j = r[0].lastIndexOf(':'), t = tokens(r[0].slice(0, j)); const cid = t && t[+r[0].slice(j + 1) - 1] && t[+r[0].slice(j + 1) - 1].cid; row = p.q.find(x => x[8] === cid); }
    if (!row) return;
    const q = { n: i + 1, sec: r[1], q: row[3], opts: row[4], ans: row[5], why: row[6], ref: row[0] };
    if (row[1]) q.lvl = row[1];
    if (row[2]) q.topic = row[2];
    if (row[9]) q.src = row[9];
    if (row[7]) { if (!passages[row[7]]) passages[row[7]] = Object.assign({}, p.p[row[7]]); q.passage = row[7]; }
    qs.push(q);
  });
  // passage titles in test order
  Object.keys(passages).forEach((k, i) => { passages[k].title = 'Passage ' + (i + 1); });
  return { id, set: def.name, minutes: def.minutes, custom: true, mode: def.mode,
    sections: secs.map(s => ({ id: s, name: SEC[s].long, short: SEC[s].name, marks: qs.filter(q => q.sec === s).length })),
    passages, questions: qs, refs: def.refs.map(r => r[0]) };
}

// ---------- attempts ----------
export let H = [];
export function loadAttempts() { const a = lsGet(HKEY, []); H = Array.isArray(a) ? a.filter(x => x && x.id && x.set && x.answers) : []; sortH(); return H; }
function sortH() { H.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))); }
export function saveAttempts() { sortH(); lsSet(HKEY, H); }
export const findAttempt = id => H.find(a => a.id === id) || null;
export function addAttempt(a) { if (!findAttempt(a.id)) { H.push(a); saveAttempts(); } }
export function removeAttempt(id) { H = H.filter(a => a.id !== id); saveAttempts(); }
// Things the student cleared on purpose (a reset test in progress 'prog:<set>:<startedAt>', a removed attempt 'att:<id>'),
// with the time, so a sync from another device or the sync folder does not bring them back.
export const CLEARK = 'gsscrfo-cleared-v1';
export const cleared = () => lsGet(CLEARK, {}) || {};
export function addCleared(keys) { const m = cleared(), t = new Date().toISOString(); keys.forEach(k => (m[k] = t)); lsSet(CLEARK, m); }
export function delCleared(keys) { const m = cleared(); keys.forEach(k => delete m[k]); lsSet(CLEARK, m); }
export function mergeCleared(o) { if (!o || typeof o !== 'object') return cleared(); const m = cleared(); for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && (!m[k] || m[k] < v)) m[k] = v; lsSet(CLEARK, m); return m; }
export function removeAttempts(ids) { const s = new Set(ids); H = H.filter(a => !s.has(a.id)); saveAttempts(); }

// Per-question key tokens for a set: [{sec, ans, lvl, topic, cid, ref}]. Custom tests resolve through their source refs.
export function tokens(setId) {
  if (!KEYS) return null;
  const conv = (k, c, src) => { const out = []; for (let i = 0; i < c.length; i++) { const t = k.substr(i * 4, 4); out.push({ sec: CODE2SEC[t[0]], ans: t[1], lvl: t[2] === '-' ? '' : t[2], topic: t[3] === '-' ? 0 : t[3] === 'a' ? 10 : +t[3], cid: c[i], ref: src + ':' + (i + 1) }); } return out; };
  if (KEYS[setId]) return conv(KEYS[setId].k, KEYS[setId].c, setId);
  const def = findDef(setId);
  if (!def) return null;
  const out = [];
  for (const r of def.refs) {
    const i = r[0].lastIndexOf(':'), t = tokens(r[0].slice(0, i));
    if (!t || !t[+r[0].slice(i + 1) - 1]) return null;
    out.push(t[+r[0].slice(i + 1) - 1]);
  }
  return out;
}
// A custom test's definition: saved tests, an in-progress state, or the attempt that carries it.
export function findDef(id) {
  if (!id || !id.startsWith('custom-')) return null;
  const c = customs()[id]; if (c) return c;
  const st = loadState(id); if (st && st.def) return st.def;
  const a = H.find(x => x.set === id && x.def); return a ? a.def : null;
}

// Grade answers against a set's key. Works from keys.json, so no set file is needed.
export function grade(setId, answers) {
  const tk = tokens(setId);
  if (!tk) return null;
  const g = { score: 0, wrong: 0, skipped: 0, total: tk.length, bySec: {}, byLvl: {}, rows: [] };
  tk.forEach((t, i) => {
    const n = i + 1, a = (answers || {})[n] || null;
    const st = !a ? 'skip' : a === t.ans ? 'ok' : 'bad';
    const b = g.bySec[t.sec] || (g.bySec[t.sec] = { c: 0, w: 0, s: 0, n: 0 }); b.n++;
    if (st === 'ok') { g.score++; b.c++; } else if (st === 'bad') { g.wrong++; b.w++; } else { g.skipped++; b.s++; }
    if (t.lvl) { const l = g.byLvl[t.lvl] || (g.byLvl[t.lvl] = { c: 0, w: 0, s: 0, n: 0 }); l.n++; if (st === 'ok') l.c++; else if (st === 'bad') l.w++; else l.s++; }
    g.rows.push(Object.assign({ n, a, st }, t));
  });
  return g;
}

// Accept an attempt from any source (this app or the mock-exam page) and re-grade it.
export function cleanAttempt(a) {
  if (!a || typeof a !== 'object' || !a.id || !a.set || !a.answers || typeof a.answers !== 'object') return null;
  const g = grade(a.set, a.answers);
  if (!g) return null;
  const info = setInfo(a.set);
  const out = { id: String(a.id), set: a.set, setName: a.setName || (info && info.name) || a.set, score: g.score, total: g.total, wrong: g.wrong, skipped: g.skipped,
    usedMs: Number(a.usedMs) || 0, auto: !!a.auto, submittedAt: String(a.submittedAt || new Date().toISOString()), answers: a.answers };
  if (a.flags && typeof a.flags === 'object') out.flags = a.flags;
  if (a.mode) out.mode = a.mode;
  if (a.def) out.def = a.def;
  return out;
}

// ---------- in-progress tests (one key per test, same key as the mock-exam page) ----------
export const stateKey = id => 'gssc-rfo-' + id + '-v1';
export function loadState(id) { const o = lsGet(stateKey(id), null); if (o && !o.set) o.set = id; return o; }
export function listInProgress() {
  const out = [];
  lsKeys().forEach(k => {
    const m = /^gssc-rfo-(.+)-v1$/.exec(k || '');
    if (!m || k === HKEY) return;
    const st = loadState(m[1]);
    if (st && st.phase === 'exam' && (setInfo(st.set) || st.def || st.set.startsWith('custom-'))) out.push(st);
  });
  return out.sort((a, b) => (b.savedAt || b.startedAt || 0) - (a.savedAt || a.startedAt || 0));
}
export function remaining(st) { return st.paused ? st.remainMs : st.endAt - Date.now(); }

// ---------- stats ----------
export function stats() {
  // Section accuracy over all attempts, best/avg per section, level breakdown
  const sec = {}, lvl = {};
  SECS.forEach(s => (sec[s] = { c: 0, n: 0, best: 0, pcts: [] }));
  H.forEach(a => {
    const g = grade(a.set, a.answers); if (!g) return;
    Object.keys(g.bySec).forEach(s => { const b = g.bySec[s]; if (!sec[s]) return; sec[s].c += b.c; sec[s].n += b.n; const p = b.c / b.n; sec[s].pcts.push(p); if (p > sec[s].best) sec[s].best = p; });
    Object.keys(g.byLvl).forEach(k => { const l = lvl[k] || (lvl[k] = { c: 0, n: 0 }); l.c += g.byLvl[k].c; l.n += g.byLvl[k].n; });
  });
  return { sec, lvl };
}
export function weakest(st) {
  let w = null;
  SECS.forEach(s => { const b = st.sec[s]; if (b.n >= 3 && (!w || b.c / b.n < st.sec[w].c / st.sec[w].n)) w = s; });
  return w;
}
export const DRILL_FOR = { comp: ['#/drills/comp', 'Comprehension drills'], gram: ['#/drills/en', 'Grammar drills'], num: ['#/drills/num', 'Numerical drills'], kon: ['#/drills/kon', 'Konkani drills'], lr: ['#/drills/lr', 'Reasoning drills'], core: ['#/study/core', 'the Forestry notes'] };

// Wrong answers across attempts: latest answer per question decides (get it right later and it leaves the list).
// Saved questions (bookmarks): ref ('set:n', the question's home set) → {at, sec, off?}. A removed one keeps a dated
// 'off' entry so a sync from another device does not bring it back.
export const SAVEDK = 'gsscrfo-saved-v1';
export const savedAll = () => lsGet(SAVEDK, {}) || {};
export const savedList = () => Object.entries(savedAll()).filter(([, v]) => !v.off).sort((a, b) => b[1].at.localeCompare(a[1].at)).map(([ref, v]) => ({ ref, sec: v.sec, at: v.at }));
export const isSaved = ref => { const v = savedAll()[ref]; return !!(v && !v.off); };
export function setSaved(ref, sec, on) { const m = savedAll(); m[ref] = on ? { at: new Date().toISOString(), sec } : { at: new Date().toISOString(), sec, off: true }; lsSet(SAVEDK, m); }
export function mergeSaved(other) {
  if (!other || typeof other !== 'object') return 0;
  const m = savedAll(); let n = 0;
  for (const [ref, v] of Object.entries(other)) { if (!v || !v.at) continue; if (!m[ref] || m[ref].at < v.at) { if (!v.off && (!m[ref] || m[ref].off)) n++; m[ref] = v; } }
  lsSet(SAVEDK, m); return n;
}
export function saveBtn(ref, sec) {
  const on = isSaved(ref);
  return '<button type="button" class="savb' + (on ? ' on' : '') + '" data-save="' + esc(ref) + '" data-sec="' + esc(sec) + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Saved for revision. Tap to remove' : 'Save this question for revision') + '">' + ICON.star + '<span>' + (on ? 'Saved' : 'Save') + '</span></button>';
}

export function wrongList() {
  const seen = new Map();
  H.forEach(a => { // H is newest first
    const g = grade(a.set, a.answers); if (!g) return;
    g.rows.forEach(r => {
      if (!r.a || seen.has(r.cid)) return;
      seen.set(r.cid, { cid: r.cid, ok: r.st === 'ok', a: r.a, sec: r.sec, topic: r.topic, lvl: r.lvl, ans: r.ans, ref: r.ref, attempt: a.id, set: a.set, n: r.n, when: a.submittedAt });
    });
  });
  return Array.from(seen.values()).filter(x => !x.ok);
}

// ---------- UI primitives ----------
let toastT = 0;
export function toast(msg, action, ms) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button" class="tbtn">' + esc(action.label) + '</button>' : '');
  el.className = 'on';
  if (action) el.querySelector('button').onclick = () => { hideToast(); action.fn(); };
  clearTimeout(toastT); toastT = setTimeout(hideToast, ms || 2800);
}
export function hideToast() { const el = $('#toast'); if (el) el.className = ''; clearTimeout(toastT); }

let sheetClose = null;
export function sheet(html, opts) {
  closeSheet(true);
  const sh = document.createElement('div');
  sh.className = 'shade'; sh.id = 'sheet';
  sh.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc((opts && opts.label) || 'Dialog') + '">' + html + '</div>';
  document.body.appendChild(sh);
  document.body.classList.add('noscroll');
  sh.addEventListener('click', e => { if (e.target === sh || e.target.closest('[data-close]')) closeSheet(); });
  sh.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeSheet(); } });
  sheetClose = opts && opts.onClose;
  requestAnimationFrame(() => { sh.classList.add('on'); const f = sh.querySelector('[data-focus]') || sh.querySelector('button'); if (f) f.focus({ preventScroll: true }); });
  return sh.firstChild;
}
export function closeSheet(silent) {
  const sh = $('#sheet'); if (!sh) return false;
  sh.remove(); document.body.classList.remove('noscroll');
  const f = sheetClose; sheetClose = null; if (!silent && f) f();
  return true;
}
export const sheetOpen = () => !!$('#sheet');

export const ICON = {
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  play: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  book: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/></svg>',
  sync: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 0114-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 01-14 5.3L4 15"/><path d="M4 20v-5h5"/></svg>',
  down: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>',
  up: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5"/><path d="M5 20h14"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  grid: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>',
  star: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  flag: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  share: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg>',
  plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  ext: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>',
  gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  upd: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
  chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
};
export const NAV = [
  ['home', '#/', 'Home', '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>'],
  ['tests', '#/tests', 'Tests', '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'],
  ['study', '#/study', 'Study', '<path d="M2 5h7a3 3 0 013 3v12a2 2 0 00-2-2H2z"/><path d="M22 5h-7a3 3 0 00-3 3v12a2 2 0 012-2h8z"/>'],
  ['progress', '#/progress', 'Progress', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>']
];
export function navHtml(on) {
  return '<nav class="bnav" aria-label="Main">' + NAV.map(n => '<a href="' + n[1] + '"' + (n[0] === on ? ' class="on" aria-current="page"' : '') + ' data-nav="' + n[0] + '"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + n[3] + '</svg>' + n[2] + '</a>').join('') + '</nav>';
}
export function topbar(title, sub, opts) {
  opts = opts || {};
  return '<header class="tb' + (opts.cls ? ' ' + opts.cls : '') + '"><button type="button" class="ib back" data-back aria-label="Back">' + ICON.back + '</button><div class="tbt"><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' + (opts.right || '') + topBtns(true) + '</header>';
}
// Update app, Sync progress and Settings: the same three buttons at the top right of every screen
// (labels on wide screens, icons on phones and iPad portrait; always icons beside a page title).
export const UI = { syncing: false, syncErr: false };
export function syncState() {
  if (!settings.syncUrl && !settings.account) return 'off';
  if (UI.syncErr) return 'err';
  const ls = settings.lastSync;
  return ls && ls.what === 'sync' && Date.now() - Date.parse(ls.at) < 600000 ? 'ok' : 'on';
}
const SYNC_TXT = { off: 'Sync progress, not signed in', err: 'Sync progress, last try failed', ok: 'Synced', on: 'Sync progress' };
export function topBtns(compact) {
  const st = syncState();
  return '<div class="tbtns' + (compact ? ' cpt' : '') + '">' +
    '<button type="button" class="tbn updb" data-act="update" aria-label="Update app" title="Update app">' + ICON.upd + '<span>Update app</span></button>' +
    '<button type="button" class="tbn syncb' + (UI.syncing ? ' busy' : '') + '" data-act="sync" data-st="' + st + '" aria-label="' + SYNC_TXT[st] + '" title="' + SYNC_TXT[st] + '">' + ICON.sync + '<span>' + (st === 'ok' ? 'Synced' : 'Sync progress') + '</span></button>' +
    '<button type="button" class="tbn gear" data-act="settings" aria-label="Settings" title="Settings">' + ICON.gear + '</button></div>';
}
export function refreshTopBtns() {
  const st = syncState();
  $$('.tbn.syncb').forEach(b => { b.dataset.st = st; b.classList.toggle('busy', UI.syncing); b.setAttribute('aria-label', SYNC_TXT[st]); b.title = SYNC_TXT[st]; const t = b.querySelector('span'); if (t) t.textContent = st === 'ok' ? 'Synced' : 'Sync progress'; });
}
export function bar(pct, cls) { return '<div class="trk ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>'; }
// the past exam a question appeared in, a small tag at the right of the question header
export function srcTag(q) { return q && q.src ? '<span class="qsrc">(' + esc(q.src) + ')</span>' : ''; }
export function lvlChip(level) { if (!level) return ''; const k = LVK[level] || level; return '<span class="chip lv-' + k + '">' + (LV[k] || LVL[level]) + '</span>'; }
