// GSSC RFO app shell: router, Home, Tests, drills, custom builder, Progress, progress-file sync.
import {
  $, $$, SC, esc, fmt, day, daysLeft, idle, lsGet, lsSet, settings, saveSettings, getIndex, getMeta, getKeys, getPool, setInfo, IDX, KEYS,
  H, loadAttempts, saveAttempts, findAttempt, cleanAttempt, grade, tokens, listInProgress, loadState, stateKey, remaining, stats, weakest,
  DRILL_FOR, wrongList, customs, saveCustom, deleteCustom, toast, hideToast, sheet, closeSheet, sheetOpen, ICON, navHtml, topbar, bar, lvlChip,
  SECS, SEC, LV, LVL, TOPIC_NAMES, EXAM_INFO, examDate, prefetchSet, findDef, CKEY, lsDel, NOTE_TOPICS, hasNotes, topBtns, refreshTopBtns, UI, setSaved, isSaved, savedAll, mergeSaved, cleared, addCleared, delCleared, mergeCleared, removeAttempts
} from './core.js?v=gsscrfo-2fc7a97e47';
import { today as thoughtToday } from './thought.js?v=gsscrfo-2fc7a97e47';
import * as G from './account.js?v=gsscrfo-2fc7a97e47';
import { fetchBlob } from './vault.js?v=gsscrfo-2fc7a97e47';
import * as L from './licence.js?v=gsscrfo-2fc7a97e47';

const app = $('#app');
let cur = null;          // current screen {hash, unmount, onPop}
let depth = 0;
const scrolls = new Map();
let runnerMod = null, studyMod = null;
// A lazily loaded module can come from a newer app version than the one already running; if it does not fit, reload once.
const safeImport = u => import(u).catch(e => { try { if (!sessionStorage.getItem('gsscrfo-reimport')) { sessionStorage.setItem('gsscrfo-reimport', '1'); location.reload(); } } catch (x) { } throw e; });
const loadRunner = () => runnerMod || (runnerMod = safeImport('./runner.js?v=gsscrfo-2fc7a97e47'));
const loadStudy = () => studyMod || (studyMod = safeImport('./study.js?v=gsscrfo-2fc7a97e47'));

// ---------- routing ----------
export function parse(h) {
  h = (h || location.hash || '#/').replace(/^#/, '');
  const [p, qs] = h.split('?');
  const q = {}; (qs || '').split('&').forEach(kv => { if (!kv) return; const [k, v] = kv.split('='); q[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
  return { path: p.split('/').filter(Boolean), q, hash: '#' + (h.startsWith('/') ? h : '/' + h) };
}
export function parentOf(hash) {
  const { path } = parse(hash);
  const [a, b, c] = path;
  if (!a) return null;
  if (a === 'tests' || a === 'study' && !b || a === 'progress' || a === 'search') return '#/';
  if (a === 'drills') return '#/tests/drills';
  if (a === 'custom') return '#/tests';
  if (a === 'test') return testParent(b);
  if (a === 'result') { const at = findAttempt(b); return at ? testParent(at.set) : '#/tests'; }
  if (a === 'review') return '#/result/' + b;
  if (a === 'study') {
    if (/^topic\d+$/.test(b)) return '#/study/core';
    if (b === 'playbook') return c === 'english-grammar' ? '#/study/gram' : c === 'english-comp' ? '#/study/comp' : c === 'konkani' ? '#/study/kon' : '#/study';
    if (b === 'cheat') return c === 'reasoning' ? '#/study/lr' : c === 'numerical' ? '#/study/num' : '#/study/gram';
    if (b === 'wrong' && c) return '#/study/wrong';
    return '#/study';
  }
  return '#/';
}
export function testParent(id) {
  if (!id) return '#/tests';
  if (id.startsWith('custom-')) return '#/tests/mine';
  if (id.startsWith('quiz-topic')) return '#/study/topic' + id.slice(10);
  if (/^grd\d/.test(id)) return '#/drills/en';
  if (/^lrd\d/.test(id)) return '#/drills/lr';
  if (/^numd\d/.test(id)) return '#/drills/num';
  if (/^kond\d/.test(id)) return '#/drills/kon';
  if (id.startsWith('compd')) return '#/drills/comp';
  return '#/tests';
}
export function go(hash, replace) {
  if (hash === location.hash && !replace) { render(); return; }
  remember();
  if (replace) history.replaceState({ d: depth }, '', hash);
  else { depth++; history.pushState({ d: depth }, '', hash); }
  render();
}
export function back() {
  if (closeSheet()) return;
  if (cur && cur.onBack && cur.onBack()) return;
  if (depth > 0) history.back();
  else go(parentOf(location.hash) || '#/', true);
}
function remember() { scrolls.set(location.hash, SC().scrollTop); }
window.addEventListener('popstate', e => {
  const d = (e.state && e.state.d) || 0;
  // a sheet open, or a running test: Back closes the sheet / asks before leaving
  if (sheetOpen()) { closeSheet(); history.pushState({ d: depth }, '', cur.hash); return; }
  if (cur && cur.onPop && cur.onPop()) { history.pushState({ d: depth }, '', cur.hash); return; }
  depth = d;
  render(true);
});

// A hash typed or opened from outside (e.g. a shared link while the app is open)
window.addEventListener('hashchange', () => {
  if (cur && parse().hash === cur.hash) return;
  if (!history.state || history.state.d == null) { depth++; history.replaceState({ d: depth }, '', location.hash); }
  render();
});

async function render(restore) {
  const r = parse();
  if (cur && cur.hash === r.hash && cur.live) return;
  if (cur && cur.unmount) { try { cur.unmount(); } catch (e) { } }
  closeSheet(true); hideToast();
  cur = { hash: r.hash };
  const me = cur;
  const [a, b] = r.path;
  document.body.dataset.screen = a || 'home';
  try {
    if (a === 'pay') { await L.payScreen(app, { back: r.q.back || '#/' }); return; }
    if (a === 'admin') { await L.adminScreen(app); return; }
    if (L.enabled() && !L.canHash(r.hash)) { await L.payScreen(app, { locked: true, back: r.hash, title: 'Unlock this' }); return; }
    if (!a && showWelcome()) welcomeScreen();
    else if (!a) homeScreen(r);
    else if (a === 'tests') await testsScreen(r);
    else if (a === 'drills') await drillsScreen(r);
    else if (a === 'custom') { r.restore = restore; await customScreen(r); }
    else if (a === 'progress') await progressScreen(r);
    else if (a === 'test' || a === 'result' || a === 'review') { const m = await loadRunner(); if (me !== cur) return; await m.route(r, me, api); }
    else if (a === 'study' || a === 'search') { const m = await loadStudy(); if (me !== cur) return; await m.route(r, me, api); }
    else homeScreen(r);
  } catch (e) {
    console.warn(e);
    if (e && e.code === 'locked') { await L.payScreen(app, { locked: true, back: r.hash, title: 'Unlock this' }); return; }
    app.innerHTML = topbar('Not found', '') + '<main class="pad"><div class="card"><p>This page could not be opened. ' + esc(e.message || '') + '</p><p><a class="btn pri" href="#/">Go home</a></p></div></main>' + navHtml('');
  }
  if (me !== cur) return;
  markLocked();
  const y = restore ? scrolls.get(r.hash) : 0;
  SC().scrollTo(0, y || 0);
}
// A small lock on links to things that need a plan (decided by the owner's free list)
function markLocked() {
  if (!L.enabled() || L.hasPaid()) return;
  app.querySelectorAll('a[href^="#/"]').forEach(a => { if (!L.canHash(a.getAttribute('href')) && !a.querySelector('.lk')) { a.classList.add('locked'); a.insertAdjacentHTML('beforeend', '<span class="lk" aria-label="Needs a plan">' + L.lockIcon + '</span>'); } });
}
// PDFs follow the same rule: a topic's PDF goes with its notes, the rest with "Printable PDFs"
document.addEventListener('click', e => {
  if (!L.enabled() || L.hasPaid()) return;
  const a = e.target.closest('a[href*="content/pdfs/"], [data-share]'); if (!a) return;
  const f = decodeURIComponent(a.getAttribute('href') || a.dataset.share || '');
  const m = /Topic-(\d+)-/.exec(f), item = m ? 'notes:' + m[1] : 'pdfs';
  if (!L.canOpen(item)) { e.preventDefault(); e.stopPropagation(); closeSheet(true); go('#/pay?back=' + encodeURIComponent(location.hash)); }
}, true);
// PDFs are stored scrambled on the website: fetch, unscramble, then open or save the real file
document.addEventListener('click', e => {
  const a = e.target.closest('a[href*="content/pdfs/"]'); if (!a || e.defaultPrevented) return;
  e.preventDefault();
  const url = a.getAttribute('href'), name = decodeURIComponent(url.split('/').pop()), save = a.hasAttribute('download');
  const win = save ? null : window.open('', '_blank'); // opened now, while the tap still counts, so it is not blocked
  toast('Preparing the PDF…', null, 8000);
  fetchBlob(url, 'application/pdf').then(b => {
    const u = URL.createObjectURL(b);
    if (save) { const x = document.createElement('a'); x.href = u; x.download = name; document.body.appendChild(x); x.click(); x.remove(); }
    else if (win) win.location.href = u; else location.href = u;
    hideToast(); setTimeout(() => URL.revokeObjectURL(u), 120000);
  }).catch(err => { if (win) win.close(); if (err && err.code === 'locked') go('#/pay?back=' + encodeURIComponent(location.hash)); else toast('Could not open the PDF. Check your connection and try again.', null, 5000); });
});
export const api = { go, back, parse, parentOf, testParent, render, openDownload, openUpload, loadRunner, loadStudy };

// Links: same-document hash links navigate through the router so every screen gets a history entry.
document.addEventListener('click', e => {
  const t = e.target;
  const bk = t.closest('[data-back]');
  if (bk) { e.preventDefault(); back(); return; }
  const a = t.closest('a[href^="#/"]');
  if (a && !e.defaultPrevented && !a.target) {
    e.preventDefault();
    const href = a.getAttribute('href');
    const nav = a.dataset.nav;
    if (nav && cur && cur.hash === href) { SC().scrollTo({ top: 0, behavior: 'smooth' }); return; }
    go(href, !!a.dataset.replace);
  }
});
// Prefetch a set file the moment a finger lands on its card.
const pf = e => { const el = e.target.closest && e.target.closest('[data-pf]'); if (el) { prefetchSet(el.dataset.pf); loadRunner(); } };
document.addEventListener('touchstart', pf, { passive: true });
document.addEventListener('pointerdown', pf, { passive: true });

// ---------- helpers ----------
// full mocks: CBT-II (tier 2, the main exam) and, when present, CBT-I (tier 1, with Konkani)
const practice = tier => IDX.sets.filter(s => s.num && (tier ? s.tier === tier : true));
const enDrills = () => IDX.sets.filter(s => /^grd\d+$/.test(s.id));
const lrDrills = () => IDX.sets.filter(s => /^lrd\d+$/.test(s.id));
const numDrills = () => IDX.sets.filter(s => /^numd\d+$/.test(s.id));
const konDrills = () => IDX.sets.filter(s => /^kond\d+$/.test(s.id));
const compDrills = () => IDX.sets.filter(s => s.id.startsWith('compd'));
const quizSets = () => IDX.sets.filter(s => s.quiz);
function attemptsOf(id) { return H.filter(a => a.set === id); }
function bestOf(id) { const m = attemptsOf(id); if (!m.length) return null; return m.reduce((b, a) => (a.score > b.score ? a : b), m[0]); }
// the app's mark: a tree, white on the brand tile
const LOGO = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22v-5"/><path d="M12 2 5.5 11h3.5L5 16.5h14L15 11h3.5z"/></svg>';
const RESET_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
const resetBtn = (id, name) => '<button type="button" class="rstb" data-reset="' + esc(id) + '" aria-label="Reset ' + esc(name) + '">' + RESET_ICON + '</button>';
// Reset a test from the list: clear the unfinished attempt, the scored attempts, or both. Undo for 10 seconds.
function openReset(id) {
  const info = setInfo(id) || { name: (findDef(id) || {}).name || id }, st = liveState(id), mine = H.filter(a => a.set === id);
  const n = Object.keys((st && st.answers) || {}).length;
  const el = sheet('<div class="shh"><h2>Reset ' + esc(info.name) + '?</h2><button type="button" class="ib" data-close aria-label="Close">' + ICON.close + '</button></div>' +
    (st ? '<label class="chk"><input type="checkbox" id="rsProg" checked><span>Clear the unfinished attempt (' + n + (n === 1 ? ' answer' : ' answers') + ' so far)</span></label>' : '') +
    (mine.length ? '<label class="chk"><input type="checkbox" id="rsAtt"' + (st ? '' : ' checked') + '><span>Remove ' + (mine.length === 1 ? 'your scored attempt (' + mine[0].score + '/' + mine[0].total + ')' : 'all ' + mine.length + ' scored attempts (best ' + Math.max.apply(null, mine.map(a => a.score)) + '/' + mine[0].total + ')') + ' from your progress</span></label>' : '') +
    '<p class="sub">The test goes back to the start, ready to take fresh. This also applies on your other devices when they sync. You can undo for 10 seconds.</p>' +
    '<button type="button" class="wide rst" id="rsGo">Reset</button><button type="button" class="wide sec" data-close>Cancel</button>', { label: 'Reset test' });
  el.querySelector('#rsGo').onclick = () => {
    const doProg = st && el.querySelector('#rsProg').checked, doAtt = mine.length && el.querySelector('#rsAtt') && el.querySelector('#rsAtt').checked;
    if (!doProg && !doAtt) { closeSheet(); return; }
    const keys = [];
    if (doProg) { keys.push('prog:' + id + ':' + st.startedAt); lsDel(stateKey(id)); }
    if (doAtt) { mine.forEach(a => keys.push('att:' + a.id)); removeAttempts(mine.map(a => a.id)); }
    addCleared(keys);
    closeSheet(true); cur = null; render(true);
    window.dispatchEvent(new Event('gpsc-saved'));
    toast(info.name + ' reset.', { label: 'Undo', fn: () => {
      delCleared(keys);
      if (doProg) lsSet(stateKey(id), st);
      if (doAtt) { mine.forEach(a => { if (!H.some(x => x.id === a.id)) H.push(a); }); saveAttempts(); }
      cur = null; render(true); window.dispatchEvent(new Event('gpsc-saved'));
    } }, 10000);
  };
}
function liveState(id) { const st = loadState(id); return st && st.phase === 'exam' ? st : null; }
export function nextMock() {
  const ps = practice();
  const todo = ps.find(s => !attemptsOf(s.id).length && !liveState(s.id));
  if (todo) return todo.id;
  const live = ps.find(s => liveState(s.id)); if (live) return live.id;
  // least recently attempted
  let best = ps[0], bt = '9';
  ps.forEach(s => { const l = attemptsOf(s.id)[0]; const t = l ? l.submittedAt : ''; if (t < bt) { bt = t; best = s; } });
  return best.id;
}
function setRow(s, opts) {
  opts = opts || {};
  const st = liveState(s.id), b = bestOf(s.id), lv = s.level ? LVL[s.level] : '';
  let meta, pill, cls = '';
  if (st) {
    const done = Object.keys(st.answers || {}).length;
    meta = (lv ? lv + ' · ' : '') + 'in progress · ' + done + '/' + s.n + ' answered';
    pill = '<span class="pill pill-res">Resume</span>'; cls = ' live';
  } else if (b) {
    meta = (lv ? lv + ' · ' : '') + 'best ' + b.score + '/' + b.total + ' · ' + day(b.submittedAt);
    pill = '<span class="pill pill-done">' + b.score + '</span>';
  } else {
    meta = (lv ? lv + ' · ' : '') + s.n + ' Q · ' + s.min + ' min · not attempted';
    pill = '<span class="pill pill-go ' + (opts.tone || '') + '">Start</span>';
  }
  if (opts.meta) meta = opts.meta(s, st, b) || meta;
  const badge = opts.badge ? opts.badge(s) : String(s.num || '');
  const badgeCls = opts.badgeCls || ('lvb-' + (s.level ? { easy: 'E', intermediate: 'I', hard: 'H' }[s.level] : 'I'));
  const a = '<a class="row' + cls + '" href="#/test/' + s.id + '" data-pf="' + s.id + '"><span class="num ' + badgeCls + '">' + esc(badge) + '</span><span class="rt"><span class="ttl">' + esc(opts.name ? opts.name(s) : s.name) + '</span><span class="sub">' + esc(meta) + '</span></span>' + pill + '</a>';
  return st || b ? '<div class="rwrap">' + a + resetBtn(s.id, s.name) + '</div>' : a;
}

// ---------- Home ----------
function homeScreen() {
  const st = listInProgress()[0];
  const last = H[0];
  let resume = '';
  if (st) {
    const info = setInfo(st.set) || findDef(st.set) && { name: findDef(st.set).name, n: findDef(st.set).refs.length } || { name: st.set, n: 0 };
    const total = info.n || (st.def ? st.def.refs.length : 0) || 60;
    const done = Object.keys(st.answers || {}).length;
    const left = st.mode === 'learn' ? 'learn mode' : fmt(remaining(st)) + ' left';
    resume = '<div class="rwrap home-rw"><a class="card resume" href="#/test/' + esc(st.set) + '" data-pf="' + esc(st.set) + '"><span class="ic ic-amb">' + ICON.play + '</span><span class="rt"><span class="ttl">Resume ' + esc(info.name) + '</span><span class="sub">' + done + ' of ' + total + ' answered · at question ' + ((st.cur || 0) + 1) + ' · ' + left + '</span>' + bar(done / total * 100, 'amb') + '</span></a>' + resetBtn(st.set, info.name) + '</div>';
  }
  const tday = NOTE_TOPICS[Math.floor((Date.now() + 19800000) / 86400000) % NOTE_TOPICS.length];
  const tnames = TOPIC_NAMES;
  const dl = daysLeft(), ed = examDate();
  const edTxt = ed ? ed.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }) : '';
  const total = last ? last.total : EXAM_INFO.marks;
  app.innerHTML =
    '<div class="ptop"><header class="hhead"><div class="brand"><span class="logo" aria-hidden="true">' + LOGO + '</span><span><b>GSSC RFO</b><small>Range Forest Officer · CBT-II</small></span></div><div class="hact">' + topBtns() + '<a class="ib white srch" href="#/search" aria-label="Search questions, notes and sets">' + ICON.search + '</a></div></header></div>' +
    '<main class="pad stack home">' +
    '<section class="hero"><div><p class="hk">' + (ed ? 'CBT-II on ' + esc(edTxt) : 'GSSC has not announced the CBT-II date yet') + '</p><p class="hd">' + (dl == null ? 'CBT-II next' : dl === 0 ? 'Exam day' : dl + (dl === 1 ? ' day left' : ' days left')) + '</p><p class="hs">80 marks · 100 minutes · no negative marking</p>' +
    '<button type="button" class="hdate" data-act="examdate">' + (ed ? 'Change exam date' : 'Set the exam date') + '</button></div>' +
    '<a class="badge" href="#/progress" aria-label="Last score ' + (last ? last.score : '–') + ' of ' + total + ', see progress"><small>Last score</small><b>' + (last ? last.score : '–') + '</b><small>of ' + total + '</small></a></section>' +
    streakCard() + thoughtCard() +
    '<div id="a2hs"></div>' + resume +
    '<div class="two"><a class="big dark" href="#/test/' + nextMock() + '" data-pf="' + nextMock() + '"><b>Full mock</b><small>80 Q · 100 min</small></a><a class="big sun" href="#/custom"><b>Pick subjects</b><small>custom test</small></a></div>' +
    '<section class="card"><div class="ch"><h2 class="label">Your accuracy by section</h2><a class="lnk" href="#/progress">All progress</a></div><div id="acc" class="acc"><p class="sub">Loading…</p></div></section>' +
    '<section class="card today"><span class="ic ic-core">' + ICON.book + '</span><span class="rt"><span class="ttl">Today\'s read: Topic ' + tday + ' · ' + tnames[tday] + '</span><span class="sub">then a quick-check quiz · <a href="#/test/quiz-topic' + tday + '">Quiz</a></span></span><a class="lnk" href="#/study/topic' + tday + '">Open</a></section>' +
    '</main>' + navHtml('home');
  installHint();
  getKeys().then(() => { if (cur && cur.hash === '#/') fillAcc($('#acc'), true); });
}
function accRows(s, showBest) {
  return SECS.map(k => {
    const b = s.sec[k], p = b.n ? Math.round(b.c / b.n * 100) : null;
    return '<div class="arow"><span>' + SEC[k].name + '</span>' + bar(p || 0, 's-' + k) + '<b>' + (p == null ? '–' : p + '%') + '</b>' +
      (showBest && b.n ? '<small>best ' + Math.round(b.best * 100) + '% · avg ' + Math.round(b.pcts.reduce((x, y) => x + y, 0) / b.pcts.length * 100) + '%</small>' : '') + '</div>';
  }).join('');
}
function fillAcc(el, home) {
  if (!el) return;
  if (!H.length) { el.innerHTML = '<p class="sub">No attempts yet. Take a full mock or a drill and your accuracy for each section shows here.</p>'; return; }
  const s = stats(), w = weakest(s);
  el.innerHTML = accRows(s, !home) + (w ? (home ? '<p class="sub">Weakest: ' + SEC[w].long + '. <a class="lnk" href="' + DRILL_FOR[w][0] + '">Practise ' + DRILL_FOR[w][1] + '</a></p>'
    : '<a class="wide sun" href="' + DRILL_FOR[w][0] + '">Practise weakest: ' + DRILL_FOR[w][1] + '</a>') : '');
}
// Today's practice and the run of practice days, so a daily habit is easy to see
function streakCard() {
  if (!H.length) return '';
  const days = new Set(H.map(a => new Date(a.submittedAt).toDateString()));
  const d = new Date(); let run = 0;
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1); // today not done yet: the run still counts up to yesterday
  while (days.has(d.toDateString())) { run++; d.setDate(d.getDate() - 1); }
  const today = new Date().toDateString();
  const q = H.filter(a => new Date(a.submittedAt).toDateString() === today).reduce((m, a) => m + Object.keys(a.answers || {}).length, 0);
  const goal = EXAM_INFO.marks, pct = Math.min(100, Math.round(q / goal * 100));
  return '<section class="card streak" aria-label="Daily practice"><div class="stk"><b>' + run + '</b><span>day' + (run === 1 ? '' : 's') + ' in a row</span></div>' +
    '<div class="stg"><span class="ttl">' + (q >= goal ? 'Daily goal done: ' + q + ' questions today' : q + ' of ' + goal + ' questions today') + '</span>' + bar(pct, q >= goal ? 'grn' : '') + '<span class="sub">' + (q >= goal ? 'Well done. Revise your mistakes next.' : run && !days.has(today) ? 'Practise today to keep your run going.' : 'One full mock a day is the goal.') + '</span></div></section>';
}
function thoughtCard() {
  const t = thoughtToday(), [en, by] = t.saying, [sa, src, mean] = t.shloka;
  const date = new Date(t.day * 86400000).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return '<section class="thought" aria-label="Thought for today"><p class="tlb">Thought for today<span>' + esc(date) + '</span></p>' +
    '<p class="ten">“' + esc(en) + '”</p><p class="tby">' + esc(by) + '</p><hr>' +
    '<p class="tsa" lang="sa">' + esc(sa) + '</p>' +
    '<div class="tft"><p class="tby">' + esc(src) + '</p><button type="button" class="tmn" data-act="meaning" aria-expanded="false" aria-controls="tmean">Meaning</button></div>' +
    '<p class="tmean" id="tmean" hidden>' + esc(mean) + '</p></section>';
}
function syncCard() {
  const ls = settings.lastSync;
  return '<section class="card sync"><div class="ch2"><span class="ic ic-grn">' + ICON.sync + '</span><span class="rt"><span class="ttl">Sync progress</span><span class="sub">' +
    (ls ? 'Last ' + esc(ls.what) + ' ' + day(ls.at) + ' · ' : '') + H.length + (H.length === 1 ? ' attempt' : ' attempts') + ' on this device</span></span></div>' +
    '<button type="button" class="wide grn" data-act="sync">' + ICON.sync + '<span>Sync progress</span></button></section>';
}
document.addEventListener('click', e => {
  const rs = e.target.closest('[data-reset]'); if (rs) { e.preventDefault(); openReset(rs.dataset.reset); return; }
  const sv = e.target.closest('[data-save]');
  if (sv) {
    const ref = sv.dataset.save, on = !isSaved(ref);
    setSaved(ref, sv.dataset.sec, on);
    document.querySelectorAll('[data-save="' + CSS.escape(ref) + '"]').forEach(x => { x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); x.setAttribute('aria-label', on ? 'Saved for revision. Tap to remove' : 'Save this question for revision'); x.lastChild.textContent = on ? 'Saved' : 'Save'; });
    toast(on ? 'Saved. Find it in Study, Saved.' : 'Removed from Saved.', null, 2500);
    return;
  }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'down') openDownload();
  else if (act === 'up') openUpload();
  else if (act === 'sync') { if (settings.syncUrl || G.signedIn()) syncNow(false); else openSignIn(); }
  else if (act === 'signin') openSignIn();
  else if (act === 'reset') openReset(b.dataset.id);
  else if (act === 'update') updateApp(b);
  else if (act === 'settings') openSettings();
  else if (act === 'meaning') { const m = $('#tmean'), on = m.hidden; m.hidden = !on; b.setAttribute('aria-expanded', on); b.textContent = on ? 'Hide meaning' : 'Meaning'; }
  else if (act === 'other') openOther();
  else if (act === 'examdate') openExamDate();
});

// ---------- install hint ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; installHint(); });
function installHint() {
  const el = $('#a2hs'); if (!el) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (standalone || !mobile || settings.a2hs) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="card hint"><span class="rt"><span class="ttl">Add GSSC RFO to your home screen</span><span class="sub">' +
    (deferredPrompt ? 'Opens in one tap and works offline.' : 'In Chrome tap ⋮, then <b>Add to Home screen</b> or <b>Install app</b>. It then opens in one tap and works offline.') +
    '</span></span>' + (deferredPrompt ? '<button type="button" class="btn pri sm" id="a2hsGo">Install</button>' : '') + '<button type="button" class="ib" id="a2hsX" aria-label="Dismiss">' + ICON.close + '</button></div>';
  const x = $('#a2hsX'); if (x) x.onclick = () => { settings.a2hs = 1; saveSettings(); el.innerHTML = ''; };
  const g = $('#a2hsGo'); if (g) g.onclick = () => { deferredPrompt.prompt(); deferredPrompt.userChoice.finally(() => { deferredPrompt = null; settings.a2hs = 1; saveSettings(); el.innerHTML = ''; }); };
}

// ---------- Tests ----------
const TABS = [['', 'Mock sets'], ['level', 'By level'], ['drills', 'Drills'], ['mine', 'My tests']];
const tf = { status: 'all', level: 'all', tier: 2 };
async function testsScreen(r) {
  const tab = r.path[1] || '';
  const tabs = '<div class="seg4" role="tablist" aria-label="Test lists">' + TABS.map(t => '<a role="tab" href="#/tests' + (t[0] ? '/' + t[0] : '') + '" data-replace="1" aria-selected="' + (t[0] === tab) + '"' + (t[0] === tab ? ' class="on"' : '') + '>' + t[1] + '</a>').join('') + '</div>';
  let body = '';
  if (!tab) {
    const t1 = practice(1).length;
    if (!t1) tf.tier = 2;
    const ps = practice(tf.tier);
    const done = ps.filter(s => attemptsOf(s.id).length).length;
    const cnt = l => ps.filter(s => s.level === l).length;
    const chips = [['all', 'All ' + ps.length], ['todo', 'To do · ' + (ps.length - done)], ['done', 'Done · ' + done]].map(c => '<button type="button" class="fchip' + (tf.status === c[0] ? ' on' : '') + '" aria-pressed="' + (tf.status === c[0]) + '" data-st="' + c[0] + '">' + c[1] + '</button>').join('');
    const lchips = [['all', 'All levels'], ['easy', 'Easy · ' + cnt('easy')], ['intermediate', 'Intermediate · ' + cnt('intermediate')], ['hard', 'Hard · ' + cnt('hard')]].map(c => '<button type="button" class="lchip lc-' + c[0] + (tf.level === c[0] ? ' on' : '') + '" aria-pressed="' + (tf.level === c[0]) + '" data-lv="' + c[0] + '">' + c[1] + '</button>').join('');
    let list = ps.filter(s => (tf.level === 'all' || s.level === tf.level) && (tf.status === 'all' || (tf.status === 'done') === !!attemptsOf(s.id).length));
    list = list.filter(s => liveState(s.id)).concat(list.filter(s => !liveState(s.id)));
    const tiers = t1 ? '<div class="chips" role="group" aria-label="Which CBT">' + [[2, 'CBT-II · ' + practice(2).length], [1, 'CBT-I · ' + t1]].map(c => '<button type="button" class="fchip' + (tf.tier === c[0] ? ' on' : '') + '" aria-pressed="' + (tf.tier === c[0]) + '" data-tier="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>' : '';
    body = tiers + '<p class="sub pad0">' + (tf.tier === 1 ? 'CBT-I (screening): Konkani 10 · Reasoning 10 · Numerical 10 · English 30 = 60 questions, 75 minutes. Konkani needs 4 of 10.' : 'CBT-II: Reasoning 10 · Numerical 10 · English 20 · Forestry & Science 40 = 80 questions, 100 minutes. No negative marking.') + '</p>' +
      '<div class="chips">' + chips + '</div><div class="chips" role="group" aria-label="Filter by level">' + lchips + '</div><div class="list" id="tl">' +
      (list.map(s => setRow(s, { meta: (s2, st, b) => null })).join('') || '<p class="empty">No sets match these filters.</p>') + '</div>';
  } else if (tab === 'level') {
    body = '<p class="sub pad0">The full mocks sorted by difficulty. Start with Easy to build speed, then work up to Hard.</p>' +
      ['easy', 'intermediate', 'hard'].map(l => '<h2 class="label lvh lv-' + { easy: 'E', intermediate: 'I', hard: 'H' }[l] + '">' + LVL[l] + '</h2><div class="list">' +
        (practice().filter(s => s.level === l).map(s => setRow(s, { badge: s2 => (s2.tier === 1 ? 'I·' : '') + s2.num, meta: (s2, st, b) => mixText(s2.mix) + (st ? ' · in progress' : b ? ' · best ' + b.score + '/' + b.total : '') })).join('') || '<p class="empty">No mocks at this level yet.</p>') + '</div>').join('');
  } else if (tab === 'drills') {
    body = '<div class="list">' +
      drillCard('#/study/core', 'Fo', 'core', 'Forestry & Science topic quizzes', quizSets().length + ' topics · 20 questions each, with notes') +
      drillCard('#/drills/num', '%', 'num', 'Numerical ability drills', numDrills().length + ' drills · easy, intermediate and hard') +
      drillCard('#/drills/lr', 'LR', 'lr', 'Reasoning drills', lrDrills().length + ' drills · easy, intermediate and hard') +
      drillCard('#/drills/en', 'Gr', 'gram', 'English grammar drills', enDrills().length + ' drills · easy, intermediate and hard') +
      drillCard('#/drills/comp', 'Rc', 'comp', 'English comprehension drills', compDrills().length + ' drills · five passages each · 25 min') +
      (konDrills().length ? drillCard('#/drills/kon', 'को', 'kon', 'Konkani drills (CBT-I)', konDrills().length + ' drills') : '') + '</div>';
  } else if (tab === 'mine') {
    const cs = Object.values(customs()).filter(c => c.saved).sort((a, b) => b.createdAt - a.createdAt);
    body = '<h2 class="label">Saved tests</h2><div class="list">' + (cs.length ? cs.map(c => '<div class="row"><a class="rowa" href="#/test/' + c.id + '"><span class="num s-core-b">' + c.refs.length + '</span><span class="rt"><span class="ttl">' + esc(c.name) + '</span><span class="sub">' + c.refs.length + ' Q · ' + (c.mode === 'learn' ? 'learn mode' : c.minutes + ' min') + (attemptsOf(c.id).length ? ' · best ' + bestOf(c.id).score + '/' + c.refs.length : '') + '</span></span><span class="pill pill-go">Start</span></a><button type="button" class="ib" data-delc="' + c.id + '" aria-label="Delete ' + esc(c.name) + '">' + ICON.close + '</button></div>').join('')
      : '<p class="empty">Tests you build by subject and save are kept here so you can retake them.</p>') + '</div>' +
      '<h2 class="label">Past attempts</h2><div class="list cv">' + (H.length ? H.map(attRow).join('') : '<p class="empty">No attempts yet. Submit a test and it is listed here with its score, wrong answers and time used.</p>') + '</div>';
  }
  app.innerHTML = '<div class="ptop"><header class="ph"><h1>Tests</h1>' + topBtns() + '</header><div class="ptabs">' + tabs + '</div></div><main class="pad stack">' + body + '</main>' +
    '<div class="fab-wrap"><a class="fab" href="#/custom">' + ICON.plus + 'Build a test by subject</a></div>' + navHtml('tests');
  app.onclick = null;
  const main = app.querySelector('main');
  main.addEventListener('click', e => {
    const s = e.target.closest('[data-st]'), l = e.target.closest('[data-lv]'), d = e.target.closest('[data-delc]'), ti = e.target.closest('[data-tier]');
    if (ti) { tf.tier = +ti.dataset.tier; testsScreen(r); }
    else if (s) { tf.status = s.dataset.st; testsScreen(r); }
    else if (l) { tf.level = l.dataset.lv; testsScreen(r); }
    else if (d) { deleteCustom(d.dataset.delc); toast('Removed from My tests'); testsScreen(r); }
  });
}
function mixText(m) { return m ? ['E', 'I', 'H'].filter(k => m[k]).map(k => m[k] + ' ' + LV[k].toLowerCase()).join(' · ') : ''; }
function drillCard(href, ic, sec, title, sub) { return '<a class="row" href="' + href + '"><span class="num s-' + sec + '-b">' + ic + '</span><span class="rt"><span class="ttl">' + title + '</span><span class="sub">' + sub + '</span></span><span class="chev">' + ICON.chev + '</span></a>'; }
export function attRow(a) {
  return '<a class="row" href="#/result/' + encodeURIComponent(a.id) + '"><span class="num sc">' + a.score + '</span><span class="rt"><span class="ttl">' + esc(a.setName) + '</span><span class="sub">' + day(a.submittedAt) + ' · ' + a.score + '/' + a.total + ' · ' + a.wrong + ' wrong · ' + fmt(a.usedMs) + (a.auto ? ' · time ran out' : '') + '</span></span><span class="chev">' + ICON.chev + '</span></a>';
}

// ---------- drill pickers ----------
async function drillsScreen(r) {
  const k = r.path[1];
  let title, sub, list, tone, badge, sec, extra = '';
  if (k === 'num') { title = 'Numerical drills'; sec = 'num'; list = numDrills(); sub = list.length + ' drills · 10 questions each · 12 minutes'; badge = s => s.id.slice(4); }
  else if (k === 'kon') { title = 'Konkani drills'; sec = 'kon'; list = konDrills(); sub = list.length + ' drills · 10 questions each · CBT-I'; badge = s => s.id.slice(4); }
  else if (k === 'en') { title = 'Grammar drills'; sec = 'gram'; list = enDrills(); sub = list.length + ' drills · 10 questions each · 12 minutes'; badge = s => s.id.slice(3); }
  else if (k === 'lr') { title = 'Reasoning drills'; sec = 'lr'; list = lrDrills(); sub = list.length + ' drills · 10 questions each · 12 minutes'; badge = s => s.id.slice(3); }
  else if (k === 'comp') { title = 'Comprehension drills'; sec = 'comp'; list = compDrills(); sub = list.length + ' drills · 25 questions each · 25 minutes'; badge = s => 'P' + s.id.slice(5); }
  else { go('#/tests/drills', true); return; }
  const name = s => s.name;
  const meta = (s, st, b) => (s.short || s.core || '') + ' · ' + s.n + ' Q · ' + s.min + ' min' + (st ? ' · in progress' : b ? ' · best ' + b.score + '/' + b.total : '');
  // 25% easy, 50% intermediate, 25% hard: filter by level
  const lvf = r.q.l || 'all', hasLv = list.some(s => /^(grd|lrd|numd|kond)/.test(s.id));
  if (hasLv && lvf !== 'all') list = list.filter(s => s.level === lvf);
  const lvchips = hasLv ? '<div class="chips" role="group" aria-label="Filter by level">' + [['all', 'All'], ['easy', 'Easy'], ['intermediate', 'Intermediate'], ['hard', 'Hard']].map(c => '<a class="lchip' + (lvf === c[0] ? ' on' : '') + '" href="#/drills/' + k + (c[0] === 'all' ? '' : '?l=' + c[0]) + '" data-replace="1" aria-pressed="' + (lvf === c[0]) + '">' + c[1] + '</a>').join('') + '</div>' : '';
  const rows = list.map(s => setRow(s, { badge, badgeCls: 's-' + sec + '-b', name, meta, tone: 'pg-' + sec }));
  let html = rows.join('');
  app.innerHTML = topbar(title, sub) + '<main class="pad stack">' + lvchips + '<div class="list">' + html + '</div>' +
    (k === 'lr' ? '<a class="lnk" href="#/study/cheat/reasoning">Read the Reasoning cheat sheet first</a>' : k === 'num' ? '<a class="lnk" href="#/study/cheat/numerical">Read the Numerical cheat sheet first</a>' : k === 'kon' ? '<a class="lnk" href="#/study/kon">Read the Konkani notes first</a>' : '<a class="lnk" href="#/study/' + (k === 'en' ? 'cheat/grammar' : k) + '">Read the ' + (k === 'en' ? 'Grammar cheat sheet' : 'English playbook') + ' first</a>') + '</main>' + navHtml('tests');
}

// ---------- custom builder ----------
const CDEF = { lr: 10, num: 10, comp: 10, gram: 10, core: 40, kon: 10 };
let cb = null;
async function customScreen(r) {
  await getMeta();
  if (!cb || !r.restore) {
    cb = { secs: {}, topics: {}, diff: 'any', time: 'auto', custom: 30, mode: 'exam', norep: false };
    for (let t = 1; t <= 10; t++) cb.topics[t] = true;
    (r.q.sec ? r.q.sec.split(',') : []).forEach(s => { if (SEC[s]) cb.secs[s] = CDEF[s]; });
    if (r.q.topics) { for (let t = 1; t <= 10; t++) cb.topics[t] = false; r.q.topics.split(',').forEach(t => (cb.topics[t] = true)); }
  }
  const pools = {};
  function selected() { return SECS.filter(s => cb.secs[s]); }
  function avail(s) {
    const p = pools[s]; if (!p) return null;
    return candidates(s).length;
  }
  function candidates(s) {
    const p = pools[s]; if (!p) return [];
    const allT = Object.values(cb.topics).every(Boolean);
    const right = new Set();
    if (cb.norep && KEYS) H.forEach(a => { const g = grade(a.set, a.answers); if (g) g.rows.forEach(x => { if (x.st === 'ok') right.add(x.cid); }); });
    return p.q.filter(q => {
      if (cb.diff !== 'any' && q[1] !== cb.diff) return false;
      if (s === 'core' && !allT && !cb.topics[q[2]]) return false;
      if (cb.norep && KEYS) { const i = q[0].lastIndexOf(':'); const t = tokens(q[0].slice(0, i)); if (t && right.has(t[+q[0].slice(i + 1) - 1].cid)) return false; }
      return true;
    });
  }
  function total() { return selected().reduce((n, s) => n + Math.min(cb.secs[s], avail(s) == null ? cb.secs[s] : avail(s)), 0); }
  function minutes() { const t = total(); return cb.time === 'auto' ? Math.max(5, Math.round(EXAM_INFO.minutes * t / EXAM_INFO.marks)) : Math.max(1, +cb.custom || 1); }
  function name() {
    const ss = selected();
    let n = ss.map(s => s === 'core' ? coreName() : SEC[s].short || SEC[s].name).join(' + ');
    if (cb.diff !== 'any') n += ' · ' + LV[cb.diff];
    return 'Custom · ' + (n || 'empty');
  }
  function coreName() {
    const ts = Object.keys(cb.topics).filter(t => cb.topics[t]).map(Number);
    if (ts.length === 10) return 'Forestry';
    if (ts.length && ts[ts.length - 1] - ts[0] === ts.length - 1) return 'Forestry ' + (ts.length === 1 ? ts[0] : ts[0] + '–' + ts[ts.length - 1]);
    return 'Forestry ' + ts.join(',');
  }
  function draw() {
    const ss = selected();
    const secChips = SECS.map(s => '<button type="button" class="schip s-' + s + (cb.secs[s] ? ' on' : '') + '" aria-pressed="' + !!cb.secs[s] + '" data-sec="' + s + '"><i></i>' + SEC[s].name + '</button>').join('');
    const counts = ss.map(s => {
      const a = avail(s), step = s === 'comp' ? 5 : 5;
      return '<div class="cnt s-' + s + '"><span class="dot"></span><span class="rt"><span class="ttl">' + SEC[s].name + '</span><span class="sub">' + (a == null ? 'checking the bank…' : a + ' in the bank') + (s === 'comp' ? ' · whole passages of 5' : '') + '</span></span>' +
        '<button type="button" class="ib step" data-dec="' + s + '" aria-label="Fewer ' + SEC[s].name + ' questions">−</button><b class="cv" aria-live="polite">' + cb.secs[s] + '</b><button type="button" class="ib step" data-inc="' + s + '" aria-label="More ' + SEC[s].name + ' questions">+</button></div>';
    }).join('');
    const topics = cb.secs.core ? '<div class="ch"><h2 class="label">Forestry & Science topics</h2><button type="button" class="lnk" data-alltopics>' + (Object.values(cb.topics).every(Boolean) ? 'Clear all' : 'Select all') + '</button></div><div class="chips">' +
      Object.keys(TOPIC_NAMES).map(t => '<button type="button" class="tchip' + (cb.topics[t] ? ' on' : '') + '" aria-pressed="' + !!cb.topics[t] + '" data-topic="' + t + '">' + t + ' · ' + TOPIC_NAMES[t] + '</button>').join('') + '</div>' : '';
    const seg = (key, opts) => '<div class="seg" role="group">' + opts.map(o => '<button type="button" class="' + (cb[key] === o[0] ? 'on' : '') + '" aria-pressed="' + (cb[key] === o[0]) + '" data-' + key + '="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>';
    const t = total();
    app.innerHTML = topbar('Build a test', 'Questions are drawn from every mock, drill and quiz') + '<main class="pad stack cbuild">' +
      '<h2 class="label">Sections</h2><div class="sgrid">' + secChips + '</div>' +
      (ss.length ? '<h2 class="label">Questions per section</h2><div class="stack8">' + counts + '</div>' : '<p class="sub">Pick one or more sections. The test contains only the sections you pick.</p>') +
      topics +
      '<h2 class="label">Difficulty</h2>' + seg('diff', [['any', 'Any'], ['E', 'Easy'], ['I', 'Medium'], ['H', 'Hard']]) +
      '<h2 class="label">Time</h2>' + seg('time', [['auto', 'Auto · ' + Math.max(5, Math.round(EXAM_INFO.minutes * t / EXAM_INFO.marks)) + ' min'], ['custom', 'Custom']]) +
      (cb.time === 'custom' ? '<label class="inl">Minutes <input type="number" inputmode="numeric" min="1" max="300" value="' + cb.custom + '" id="cmin"></label>' : '') +
      '<h2 class="label">Mode</h2>' + seg('mode', [['exam', 'Exam · timer, answers at the end'], ['learn', 'Learn · answer after each']]) +
      '<label class="tog"><input type="checkbox" id="norep"' + (cb.norep ? ' checked' : '') + '><span><b>No repeats</b><small>Leave out questions you have already answered correctly</small></span></label>' +
      '</main><div class="foot"><p class="sub">' + (ss.length ? esc(name().replace('Custom · ', '')) + ' · ' + t + ' questions · ' + (cb.mode === 'learn' ? 'learn mode' : minutes() + ' min') : 'No sections picked') + '</p>' +
      '<div class="two"><button type="button" class="btn sec" id="csave"' + (t ? '' : ' disabled') + '>Save as my test</button><button type="button" class="btn pri" id="cgo"' + (t ? '' : ' disabled') + '>Start ' + t + ' questions</button></div></div>';
    const m = app.querySelector('main');
    m.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.sec) { if (cb.secs[d.sec]) delete cb.secs[d.sec]; else { cb.secs[d.sec] = CDEF[d.sec]; loadPool(d.sec); } }
      else if (d.inc) cb.secs[d.inc] = Math.min(cb.secs[d.inc] + 5, avail(d.inc) == null ? 100 : Math.max(5, avail(d.inc)));
      else if (d.dec) cb.secs[d.dec] = Math.max(5, cb.secs[d.dec] - 5);
      else if (d.topic) { cb.topics[d.topic] = !cb.topics[d.topic]; if (!Object.values(cb.topics).some(Boolean)) cb.topics[d.topic] = true; }
      else if ('alltopics' in d) { const all = Object.values(cb.topics).every(Boolean); for (let i = 1; i <= 10; i++) cb.topics[i] = !all; if (all) cb.topics[1] = true; }
      else if (d.diff) cb.diff = d.diff; else if (d.time) cb.time = d.time; else if (d.mode) cb.mode = d.mode;
      else return;
      const y = SC().scrollTop; draw(); SC().scrollTo(0, y);
    };
    const nr = $('#norep'); nr.onchange = () => { cb.norep = nr.checked; if (cb.norep) getKeys().then(draw); else draw(); };
    const cm = $('#cmin'); if (cm) cm.onchange = () => { cb.custom = Math.max(1, +cm.value || 1); draw(); };
    $('#cgo').onclick = () => make(false);
    $('#csave').onclick = () => make(true);
  }
  function loadPool(s) { if (pools[s]) return; getPool(s).then(p => { pools[s] = p; if (cur && cur.hash.startsWith('#/custom')) { const y = SC().scrollTop; draw(); SC().scrollTo(0, y); } }); }
  async function make(save) {
    await getKeys();
    const ss = selected();
    await Promise.all(ss.map(s => getPool(s).then(p => (pools[s] = p))));
    const refs = [];
    ss.forEach(s => {
      let c = candidates(s);
      shuffle(c);
      const want = cb.secs[s];
      if (s === 'comp') {
        const groups = new Map();
        c.forEach(q => { const k = q[7] || q[0]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q); });
        let n = 0;
        for (const g of groups.values()) { if (n + g.length > want && n > 0) continue; g.sort((a, b) => +a[0].split(':')[1] - +b[0].split(':')[1]); g.forEach(q => refs.push([q[0], s])); n += g.length; if (n >= want) break; }
      } else c.slice(0, want).forEach(q => refs.push([q[0], s]));
    });
    if (!refs.length) { toast('No questions match these choices'); return; }
    const id = 'custom-' + Date.now().toString(36);
    const def = { id, name: name(), minutes: minutes(), mode: cb.mode, refs, saved: !!save, createdAt: Date.now() };
    saveCustom(def);
    if (save) { toast('Saved to My tests'); go('#/tests/mine'); }
    else go('#/test/' + id + '?go=1');
  }
  draw();
  selected().forEach(loadPool);
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- Progress ----------
async function progressScreen() {
  const me = cur;
  app.innerHTML = '<div class="ptop"><header class="ph"><h1>Progress</h1>' + topBtns() + '</header></div><main class="pad stack" id="pm"><p class="sub">Loading…</p></main>' + navHtml('progress');
  await getKeys();
  if (me !== cur) return;
  const full = H.filter(a => a.total === EXAM_INFO.marks);
  const setsDone = new Set(full.map(a => a.set)).size;
  const best = full.reduce((m, a) => Math.max(m, a.score), 0);
  const avg = full.length ? Math.round(full.reduce((m, a) => m + a.score, 0) / full.length) : 0;
  const s = stats();
  const tiles = [['t-ind', setsDone, 'sets done'], ['t-grn', full.length ? best : '–', 'best /' + EXAM_INFO.marks], ['t-amb', full.length ? avg : '–', 'average'], ['t-pnk', daysLeft() == null ? '–' : daysLeft(), daysLeft() == null ? 'date not set' : 'days left']]
    .map(t => '<div class="tile ' + t[0] + '"><b>' + t[1] + '</b><span>' + t[2] + '</span></div>').join('');
  const lv = ['E', 'I', 'H'].map(k => { const b = s.lvl[k]; const p = b && b.n ? Math.round(b.c / b.n * 100) : null; return '<div class="arow"><span>' + lvlChip(k) + '</span>' + bar(p || 0, 'l-' + k) + '<b>' + (p == null ? '–' : p + '%') + '</b>' + (b ? '<small>' + b.c + ' of ' + b.n + ' right</small>' : '') + '</div>'; }).join('');
  document.getElementById('pm').innerHTML =
    '<div class="tiles">' + tiles + '</div>' +
    '<section class="card"><h2 class="label">Score in each full mock, oldest first</h2>' + trend(full) + '</section>' +
    '<section class="card"><h2 class="label">Accuracy by section, all attempts</h2><div class="acc" id="pacc"></div></section>' +
    '<section class="card"><h2 class="label">By difficulty</h2><div class="acc">' + lv + '</div></section>' +
    '<section class="card"><h2 class="label">Practice days</h2>' + heat() + '</section>' +
    '<section class="card"><h2 class="label">Weak areas</h2>' + weakAreas(s) + '</section>' +
    '<section class="card"><h2 class="label">Recent attempts</h2><div class="list flat cv">' + (H.length ? H.slice(0, 30).map(attRow).join('') : '<p class="empty">No attempts yet.</p>') + '</div>' + (H.length > 30 ? '<a class="lnk" href="#/tests/mine">All ' + H.length + ' attempts</a>' : '') + '</section>' +
    syncCard();
  fillAcc($('#pacc'), false);
}
function trend(full) {
  const pts = full.slice().reverse().slice(-14);
  if (pts.length < 2) return '<p class="sub">' + (pts.length ? 'One full mock so far: ' + pts[0].score + '/' + EXAM_INFO.marks + '. Take another to see your trend.' : 'Take two full mocks to see your score trend.') + '</p>';
  const W = 320, Hh = 140, lo = Math.max(0, Math.min(...pts.map(p => p.score)) - 5), hi = Math.min(EXAM_INFO.marks, Math.max(...pts.map(p => p.score)) + 5);
  const x = i => 30 + i * (W - 50) / (pts.length - 1), y = v => 12 + (Hh - 34) * (1 - (v - lo) / (hi - lo || 1));
  const line = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.score).toFixed(1)).join(' ');
  const grid = [lo, Math.round((lo + hi) / 2), hi].map(v => '<line x1="26" x2="' + (W - 10) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="gl"/><text x="2" y="' + (y(v) + 4) + '">' + v + '</text>').join('');
  const last = pts[pts.length - 1], diff = last.score - pts[0].score;
  return '<svg class="trend" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Scores ' + pts.map(p => p.score).join(', ') + '">' + grid +
    '<path d="' + line + '" class="ln"/>' + pts.map((p, i) => '<circle cx="' + x(i) + '" cy="' + y(p.score) + '" r="' + (i === pts.length - 1 ? 5 : 3.5) + '" class="' + (i === pts.length - 1 ? 'pl' : 'pt') + '"/>').join('') +
    '<text x="' + (x(pts.length - 1) - 8) + '" y="' + (y(last.score) - 10) + '" class="lv">' + last.score + '</text>' +
    '<text x="22" y="' + (Hh - 4) + '">' + day(pts[0].submittedAt) + '</text><text x="' + (W - 50) + '" y="' + (Hh - 4) + '">' + day(last.submittedAt) + '</text></svg>' +
    '<p class="sub">' + (diff > 0 ? 'Up ' + diff + ' marks since your first mock here.' : diff < 0 ? 'Down ' + -diff + ' marks since your first mock here.' : 'Level with your first mock here.') + '</p>';
}
function heat() {
  const per = {};
  H.forEach(a => { const d = new Date(a.submittedAt); if (isNaN(d)) return; const k = d.toDateString(); per[k] = (per[k] || 0) + 1; });
  const weeks = 10, today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - (weeks * 7 - 1) - ((today.getDay() + 6) % 7 === 6 ? 0 : 6 - (today.getDay() + 6) % 7));
  let cells = '', days = 0;
  for (let w = 0; w < weeks; w++) for (let d = 0; d < 7; d++) {
    const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d);
    const n = per[dt.toDateString()] || 0; if (n) days++;
    const fut = dt > today;
    cells += '<i class="h' + (fut ? 'f' : Math.min(3, n)) + '" style="grid-column:' + (w + 1) + ';grid-row:' + (d + 1) + '" title="' + dt.toDateString() + ': ' + n + '"></i>';
  }
  return '<div class="heat" role="img" aria-label="' + days + ' practice days in the last ' + weeks + ' weeks">' + cells + '</div><p class="sub">' + days + ' practice ' + (days === 1 ? 'day' : 'days') + ' in the last ' + weeks + ' weeks · darker means more tests that day</p>';
}
function weakAreas(s) {
  const out = [];
  SECS.forEach(k => { const b = s.sec[k]; if (b.n >= 5 && b.c / b.n < 0.65) out.push([b.c / b.n, '<a class="row" href="' + DRILL_FOR[k][0] + '"><span class="num s-' + k + '-b">' + Math.round(b.c / b.n * 100) + '%</span><span class="rt"><span class="ttl">' + SEC[k].long + '</span><span class="sub">Practise ' + DRILL_FOR[k][1] + '</span></span><span class="chev">' + ICON.chev + '</span></a>']); });
  const tp = {};
  H.forEach(a => { const g = grade(a.set, a.answers); if (g) g.rows.forEach(r => { if (r.sec === 'core' && r.topic) { const t = tp[r.topic] || (tp[r.topic] = { c: 0, n: 0 }); t.n++; if (r.st === 'ok') t.c++; } }); });
  Object.keys(tp).forEach(t => { const b = tp[t]; if (b.n >= 4 && b.c / b.n < 0.6) out.push([b.c / b.n, '<a class="row" href="' + (hasNotes(t) ? '#/study/topic' + t : '#/custom?sec=core&topics=' + t) + '"><span class="num s-core-b">' + Math.round(b.c / b.n * 100) + '%</span><span class="rt"><span class="ttl">Forestry topic ' + t + ': ' + TOPIC_NAMES[t] + '</span><span class="sub">' + (hasNotes(t) ? 'Read the notes, then take the quiz' : 'Practise a topic ' + t + ' test') + ' · ' + b.c + ' of ' + b.n + ' right</span></span><span class="chev">' + ICON.chev + '</span></a>']); });
  out.sort((a, b) => a[0] - b[0]);
  return out.length ? '<div class="list flat">' + out.slice(0, 6).map(o => o[1]).join('') + '</div>' : '<p class="sub">' + (H.length ? 'No weak areas yet: every section and topic you have tried is at 65% or better.' : 'Weak sections and Forestry topics show here once you have taken a few tests.') + '</p>';
}

// ---------- progress file ----------
export function progressFile() {
  const inProgress = listInProgress().map(st => {
    const o = JSON.parse(JSON.stringify(st));
    if (o.paused) o.endAt = Date.now() + (o.remainMs || 0); // the mock-exam page resumes while endAt is in the future
    if (!o.def && o.set.startsWith('custom-')) o.def = findDef(o.set);
    return o;
  });
  const best = {};
  H.forEach(a => { if (!(a.set in best) || a.score > best[a.set]) best[a.set] = a.score; });
  const cs = Object.values(customs()).filter(c => c.saved);
  return {
    format: 'gssc-rfo-progress', version: 1, exportedAt: new Date().toISOString(), exportedFrom: 'gsscrfo-app',
    note: 'GSSC RFO progress. Open the GSSC RFO app and choose Restore file.',
    summary: { attempts: H.length, best },
    attempts: H.map(a => { const o = { id: a.id, set: a.set, setName: a.setName, score: a.score, total: a.total, wrong: a.wrong, skipped: a.skipped, usedMs: a.usedMs, auto: a.auto, submittedAt: a.submittedAt, answers: a.answers };
      if (a.flags) o.flags = a.flags; if (a.mode) o.mode = a.mode; if (a.set.startsWith('custom-')) o.def = a.def || findDef(a.set); return o; }),
    inProgress, customTests: cs, saved: savedAll(), cleared: cleared()
  };
}
const fname = () => 'GSSC-RFO-progress-' + new Date().toISOString().slice(0, 10) + '.json';
export function openDownload() {
  const f = progressFile(), text = JSON.stringify(f), name = fname();
  const kb = Math.max(1, Math.round(text.length / 1024));
  const file = typeof File === 'function' ? new File([text], name, { type: 'application/json' }) : null;
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  const ip = f.inProgress[0];
  const wl = wrongList().length;
  const el = sheet('<div class="shh"><h2>Download progress</h2><button type="button" class="ib" data-close aria-label="Close">' + ICON.close + '</button></div>' +
    '<div class="fileb"><span class="jb">JSON</span><span class="rt"><span class="ttl">' + name + '</span><span class="sub">About ' + kb + ' KB · opens anywhere</span></span></div>' +
    '<div class="what"><b>What goes in the file</b><span>· ' + H.length + (H.length === 1 ? ' attempt' : ' attempts') + ' with every answer you gave</span>' +
    (ip ? '<span>· ' + esc((setInfo(ip.set) || { name: 'A custom test' }).name) + ', in progress at question ' + ((ip.cur || 0) + 1) + (f.inProgress.length > 1 ? ' (+' + (f.inProgress.length - 1) + ' more)' : '') + '</span>' : '') +
    '<span>· ' + wl + ' incorrect ' + (wl === 1 ? 'question' : 'questions') + ' to revise' + (f.customTests.length ? ', ' + f.customTests.length + ' saved tests' : '') + '</span></div>' +
    (canShare ? '<button type="button" class="wide grn" id="dShare" data-focus>Share on WhatsApp</button>' : '') +
    '<button type="button" class="wide ' + (canShare ? 'sec' : 'grn') + '" id="dSave"' + (canShare ? '' : ' data-focus') + '>Save to this device</button>' +
    '<p class="sub">Restore this file in GSSC RFO on another phone or iPad, or attach it in a chat with Claude.</p>', { label: 'Download progress' });
  const done = how => { settings.lastSync = { at: new Date().toISOString(), what: 'backup' }; saveSettings(); closeSheet(); toast(how); };
  const save = () => {
    try {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      done('Saved ' + name + ' to Downloads');
    } catch (e) { toast('Downloads are not available here'); }
  };
  el.querySelector('#dSave').onclick = save;
  const sh = el.querySelector('#dShare');
  if (sh) sh.onclick = () => {
    navigator.share({ files: [file], title: name, text: 'GSSC RFO progress file' })
      .then(() => done('Shared ' + name), e => { if (e && e.name === 'AbortError') return; save(); });
  };
}
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export function openUpload(given) {
  const draw = (inner, title) => sheet('<div class="shh"><h2>' + (title || 'Upload progress') + '</h2><button type="button" class="ib" data-close aria-label="Close">' + ICON.close + '</button></div>' + inner, { label: 'Upload progress' });
  const pick = () => {
    const el = draw('<p>Pick a progress file from WhatsApp, Downloads or Files. Nothing on this device is deleted; new attempts are added.</p>' +
      (IOS ? '<p class="sub">On iPad: in WhatsApp, open the file, tap Share, then Save to Files. Then tap the box below and pick it from Files.</p>' : '<p class="sub">Easiest from WhatsApp: open the chat, press and hold the file, tap Share, then choose GSSC RFO.</p>') +
      '<label class="fileb pickf"><span class="jb">JSON</span><span class="rt"><span class="ttl">Choose a GSSC-RFO-progress file</span><span class="sub">Saved by GSSC RFO on any device</span></span><input type="file" id="upf"></label>');
    el.querySelector('#upf').onchange = e => { const f = e.target.files && e.target.files[0]; if (f) read(f); };
  };
  const bad = (n, why) => { const el = draw('<div class="err"><b>' + esc(n) + '</b> ' + why + '</div><button type="button" class="wide pri" id="again" data-focus>Choose again</button>'); el.querySelector('#again').onclick = pick; };
  const read = f => {
    const r = new FileReader();
    r.onerror = () => bad(f.name, 'could not be read.');
    r.onload = async () => {
      let o; try { o = JSON.parse(String(r.result)); } catch (e) { return bad(f.name, 'is not a progress file. Choose a file whose name starts with GSSC-RFO-progress and ends in .json.'); }
      if (!o || o.format !== 'gssc-rfo-progress' || o.version !== 1 || !Array.isArray(o.attempts)) return bad(f.name, 'is not a GSSC RFO progress file (format gssc-rfo-progress, version 1). Choose a file made with Download progress.');
      await Promise.all([getKeys(), getIndex()]);
      const plan = planMerge(o);
      const el = draw('<div class="prev"><b>' + esc(f.name) + '</b><span class="sub">From ' + (o.exportedFrom === 'mock-exam' ? 'the Mock Exam page' : o.exportedFrom === 'gsscrfo-app' ? 'GSSC RFO' : esc(o.exportedFrom || 'unknown')) + (o.exportedAt ? ' · saved ' + day(o.exportedAt) : '') + '</span>' +
        '<div class="three"><div class="t-grn"><b>' + plan.add.length + '</b><span>new attempts</span></div><div><b>' + plan.had + '</b><span>already here</span></div><div class="t-amb"><b>' + plan.prog.length + '</b><span>in progress</span></div></div>' +
        (plan.add.length ? '<span class="sub">New: ' + esc(plan.add.slice(0, 8).map(a => a.setName.replace('Practice ', '') + ' (' + a.score + ')').join(', ')) + (plan.add.length > 8 ? '…' : '') + '</span>' : '') +
        (plan.unknown ? '<span class="sub">' + plan.unknown + ' for tests this app does not have</span>' : '') + '</div>' +
        '<button type="button" class="wide grn" id="merge" data-focus>Add to this device</button><button type="button" class="wide sec" id="other">Choose a different file</button>', 'Check before adding');
      el.querySelector('#other').onclick = pick;
      el.querySelector('#merge').onclick = () => { const msg = applyMerge(plan); closeSheet(); toast(msg, null, 4200); render(); };
    };
    r.readAsText(f);
  };
  if (given) read(given); else pick();
}
export function planMerge(o) {
  const plan = { add: [], replace: [], had: 0, unknown: 0, prog: [], customs: [], done: [], gone: [] };
  const ids = new Set(H.map(a => a.id));
  const gone = Object.assign({}, cleared()); for (const [k, v] of Object.entries((o && o.cleared) || {})) if (typeof v === 'string' && (!gone[k] || gone[k] < v)) gone[k] = v;
  plan.cleared = (o && o.cleared) || null;
  (Array.isArray(o.customTests) ? o.customTests : []).forEach(c => { if (c && c.id && Array.isArray(c.refs)) plan.customs.push(c); });
  // custom defs travel with attempts and in-progress states; make them resolvable before grading
  const tmp = customs(); let added = false;
  const addDef = d => { if (d && d.id && Array.isArray(d.refs) && !tmp[d.id]) { tmp[d.id] = Object.assign({}, d, { saved: !!d.saved }); added = true; } };
  plan.customs.forEach(addDef); o.attempts.forEach(a => a && addDef(a.def)); (o.inProgress || []).forEach(s => s && addDef(s.def));
  if (added) lsSet(CKEY, tmp);
  o.attempts.forEach(a => {
    if (a && gone['att:' + a.id]) return; // removed on purpose here or on another device
    if (a && ids.has(String(a.id))) {
      const mine = H.find(x => x.id === String(a.id));
      if (mine && String(a.submittedAt || '') > String(mine.submittedAt || '')) { const c = cleanAttempt(a); if (c) { if (c.set.startsWith('custom-')) c.def = findDef(c.set); plan.replace.push(c); return; } }
      plan.had++; return;
    }
    const c = cleanAttempt(a); if (!c) { plan.unknown++; return; }
    if (c.set.startsWith('custom-')) c.def = findDef(c.set);
    ids.add(c.id); plan.add.push(c);
  });
  (Array.isArray(o.inProgress) ? o.inProgress : []).forEach(st => {
    if (!st || st.phase !== 'exam' || !st.set || !(setInfo(st.set) || findDef(st.set))) return;
    if (ids.has(st.set + '-' + st.startedAt)) return; // already submitted somewhere
    if (gone['prog:' + st.set + ':' + st.startedAt]) return; // reset on purpose
    const local = loadState(st.set);
    if (!local || local.phase !== 'exam' || (local.startedAt || 0) < (st.startedAt || 0)) plan.prog.push(st);
  });
  // a test in progress here that another device has since submitted
  listInProgress().forEach(st => { if (ids.has(st.set + '-' + st.startedAt) || gone['prog:' + st.set + ':' + st.startedAt]) plan.done.push(st.set); });
  // attempts here that were removed on another device
  H.forEach(a => { if (gone['att:' + a.id]) plan.gone.push(a.id); });
  return plan;
}
export function applyMerge(plan, what) {
  if (plan.cleared) mergeCleared(plan.cleared);
  if (plan.gone && plan.gone.length) removeAttempts(plan.gone);
  plan.add.forEach(a => H.push(a));
  (plan.replace || []).forEach(a => { const i = H.findIndex(x => x.id === a.id); if (i >= 0) H[i] = a; else H.push(a); });
  (plan.done || []).forEach(id => lsDel(stateKey(id)));
  H.sort((p, q) => String(q.submittedAt).localeCompare(String(p.submittedAt)));
  saveAttempts();
  plan.prog.forEach(st => {
    const s = Object.assign({}, st);
    if (!s.paused) { s.paused = true; s.remainMs = Math.max(0, (s.endAt || 0) - Date.now()); }
    s.savedAt = Date.now();
    lsSet(stateKey(s.set), s);
  });
  settings.lastSync = { at: new Date().toISOString(), what: what || 'upload' }; saveSettings();
  return 'Added ' + plan.add.length + (plan.add.length === 1 ? ' attempt' : ' attempts') + (plan.had ? ', ' + plan.had + ' already here' : '') + (plan.prog.length ? ', ' + plan.prog.length + (plan.prog.length === 1 ? ' test' : ' tests') + ' in progress' : '') + (plan.unknown ? ', ' + plan.unknown + ' skipped' : '') + '.';
}

// ---------- Sync progress (Google Drive hub through the owner's Apps Script web app) ----------
// One tap merges this device with the hub: attempts are a union by id (a later submission of the same id wins),
// tests in progress keep the newest copy, and nothing on either side is ever removed.
let syncing = false, lastSig = '';
const HUB_RE = /^https:\/\/script\.google(usercontent)?\.com\/macros\/s\/[\w-]+\/exec$/;
const sig = () => H.length + ':' + (H[0] ? H[0].id + H[0].submittedAt : '') + ':' + listInProgress().map(st => st.set + (st.savedAt || 0)).join(',');
function setSyncBusy(on) { syncing = on; UI.syncing = on; refreshTopBtns(); }
function syncText(m) { const el = $('#syncMsg'); if (el) el.innerHTML = m; }
// One sync round with the owner's Apps Script hub (a sync link).
async function hubRound() {
  const res = await fetch(settings.syncUrl, { method: 'POST', body: JSON.stringify({ progress: progressFile() }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
  const o = await res.json();
  if (!o || !o.ok || !o.progress) throw new Error((o && o.error) || 'bad reply');
  await Promise.all([getKeys(), getIndex()]);
  const plan = planMerge(o.progress);
  applyMerge(plan, 'sync');
  mergeSaved(o.progress.saved);
  settings.hubCount = (o.progress.attempts || []).length;
  return { added: plan.add.length, fresh: plan.add.length + plan.replace.length + plan.prog.length + plan.done.length + (plan.gone || []).length };
}
// One sync round with the student's own Google Drive: read, merge in (nothing is ever removed), write back the union.
async function driveRound() {
  const { id, data } = await G.readDrive();
  let added = 0, fresh = 0;
  if (data && Array.isArray(data.attempts)) {
    await Promise.all([getKeys(), getIndex()]);
    const plan = planMerge(data);
    applyMerge(plan, 'sync');
    mergeSaved(data.saved);
    added = plan.add.length; fresh = plan.add.length + plan.replace.length + plan.prog.length + plan.done.length + (plan.gone || []).length;
  }
  await G.writeDrive(id, progressFile());
  return { added, fresh };
}
export async function syncNow(quiet) {
  const hub = !!settings.syncUrl, drive = G.signedIn();
  if (!hub && !drive) { if (!quiet) openSignIn(); return null; }
  if (syncing) return null;
  if (quiet && navigator.onLine === false) return null;
  // Google's one-hour pass has run out: a tap on Sync signs in again (a second, no password); automatic syncs wait
  if (drive && !G.token() && !hub) { if (!quiet) G.signIn({ silent: true, then: 'sync' }); else refreshTopBtns(); return null; }
  setSyncBusy(true);
  try {
    let added = 0, fresh = 0;
    if (hub) { const r = await hubRound(); added += r.added; fresh += r.fresh; }
    if (drive && G.token()) { const r = await driveRound(); added += r.added; fresh += r.fresh; }
    lastSig = sig();
    UI.syncErr = false; settings.lastSync = { at: new Date().toISOString(), what: 'sync' }; saveSettings();
    const msg = 'Synced. ' + (added ? added + (added === 1 ? ' attempt' : ' attempts') + ' added from your other devices. ' : 'Nothing new from other devices. ') + H.length + (H.length === 1 ? ' attempt' : ' attempts') + ' on this device.';
    if (fresh && document.body.dataset.screen !== 'runner' && !sheetOpen()) render();
    if (!quiet || added) toast(msg, null, 4200);
    syncText(esc(msg));
    return msg;
  } catch (e) {
    if (e.code === 'expired') { if (!quiet) G.signIn({ silent: true, then: 'sync' }); return null; }
    UI.syncErr = navigator.onLine !== false;
    const m = navigator.onLine === false ? 'You are offline. Your progress is safe on this device and will sync when you are back online.'
      : drive && !hub ? 'Could not reach your Google Drive. Your progress is safe on this device; try again in a minute.'
      : 'Could not reach your sync folder. Your progress is safe on this device; try again in a minute.';
    if (!quiet) toast(m, null, 5000);
    syncText(esc(m));
    return null;
  } finally { setSyncBusy(false); }
}

// ---------- Sign in with Google: the start page, a sheet, and coming back from Google ----------
const GNOTE = 'Your progress is saved in a private app folder in <b>your own Google Drive</b>. Only GSSC RFO on your devices can open it; nobody else, not even the app\'s maker, can see it.';
const GBTN = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg>';
function signInForm(id) {
  return '<label class="ailab" for="' + id + 'E">Your Gmail address</label>' +
    '<input id="' + id + 'E" class="inp" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@gmail.com"' + (settings.account && settings.account.email ? ' value="' + esc(settings.account.email) + '"' : '') + '>' +
    '<button type="button" class="wide gbtn" id="' + id + 'Go">' + GBTN + '<span>Continue with Google</span></button>' +
    '<p class="sub gnote">' + GNOTE + ' Google asks for your password or a code on its own page.</p>' +
    '<p class="err" id="' + id + 'Err" hidden></p>';
}
function wireSignIn(id, back) {
  const go = $('#' + id + 'Go'); if (!go) return;
  go.onclick = () => {
    const e = ($('#' + id + 'E').value || '').trim(), err = $('#' + id + 'Err');
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { err.hidden = false; err.textContent = 'That is not an email address. Leave it empty to choose your account on Google\'s page.'; return; }
    if (!navigator.onLine) { err.hidden = false; err.textContent = 'You are offline. Connect to the internet to sign in.'; return; }
    go.disabled = true; go.lastChild.textContent = 'Opening Google…';
    try { G.signIn({ email: e, back: back || location.hash || '#/', then: 'sync' }); } catch (x) { go.disabled = false; go.lastChild.textContent = 'Continue with Google'; err.hidden = false; err.textContent = 'Google sign-in is not set up in this copy of the app yet.'; }
  };
}
export function openSignIn() {
  if (!G.configured()) { openSyncSetup(); return; }
  sheet('<div class="shh"><h2>Sync your progress</h2><button type="button" class="ib" data-close aria-label="Close">' + ICON.close + '</button></div>' +
    '<p>Sign in with Google to keep your progress safe and carry on from any phone, iPad or computer.</p>' + signInForm('gs') +
    '<details class="other"><summary>Other ways</summary><div class="two"><button type="button" class="btn grn-o" data-act="down">' + ICON.down + '<span>Backup file</span></button><button type="button" class="btn grn-o" data-act="up">' + ICON.up + '<span>Restore file</span></button></div>' +
    '<button type="button" class="lnk" id="gsLink">Use a sync link instead</button></details>', { label: 'Sync your progress' });
  wireSignIn('gs');
  $('#gsLink').onclick = () => { closeSheet(true); openSyncSetup(); };
}
// First start on a new device: sign in, or carry on without
const showWelcome = () => !window.__gpscTest && G.configured() && !G.signedIn() && !settings.syncUrl && !settings.welcomed && !H.length && !listInProgress().length;
function welcomeScreen() {
  document.body.dataset.screen = 'welcome';
  app.innerHTML = '<main class="welcome"><div class="wcard">' +
    '<div class="brand wb"><span class="logo" aria-hidden="true">' + LOGO + '</span><span><b>GSSC RFO</b><small>Range Forest Officer · CBT-II</small></span></div>' +
    '<h1>Practise for the GSSC Range Forest Officer exam, on every device</h1>' +
    '<ul class="wlist"><li>Full 80-question CBT-II mocks and drills</li><li>Forestry & Science notes for all ten topics, with quick quizzes</li><li>Your progress on your phone, iPad and computer</li></ul>' +
    signInForm('gw') +
    '<button type="button" class="wide sec" id="gwSkip">Use without signing in</button>' +
    '<p class="sub">Without signing in, your progress stays on this device. You can sign in later from Settings.</p></div></main>';
  wireSignIn('gw', '#/');
  $('#gwSkip').onclick = () => { settings.welcomed = 1; saveSettings(); render(); };
}
function pushOnLeave() {
  const url = settings.syncUrl;
  if (!url || !navigator.sendBeacon || sig() === lastSig) return;
  try { if (navigator.sendBeacon(url, new Blob([JSON.stringify({ progress: progressFile() })], { type: 'text/plain;charset=utf-8' }))) lastSig = sig(); } catch (e) { }
}
export function openSync() {
  if (!settings.syncUrl) return openSyncSetup();
  const ls = settings.lastSync;
  const el = sheet('<div class="shh"><h2>Sync progress</h2><button type="button" class="ib" data-close aria-label="Close">' + ICON.close + '</button></div>' +
    '<p id="syncMsg" class="syncmsg">Syncing…</p>' +
    '<p class="sub">Every attempt from this device and your other devices is combined in your Google Drive. Nothing is ever removed. This device also syncs by itself when it opens, after each test, and when you leave the app.</p>' +
    '<button type="button" class="wide grn" id="syncAgain" data-focus>' + ICON.sync + '<span>Sync again</span></button>' +
    '<button type="button" class="wide sec" id="syncCopy">Copy sync link for another device</button>' +
    '<details class="other"><summary>Other ways</summary><div class="two"><button type="button" class="btn grn-o" data-act="down">' + ICON.down + '<span>Backup file</span></button><button type="button" class="btn grn-o" data-act="up">' + ICON.up + '<span>Restore file</span></button></div>' +
    '<button type="button" class="lnk" id="syncOff">Disconnect sync on this device</button></details><input id="syncLink" class="inp" hidden readonly>', { label: 'Sync progress' });
  el.querySelector('#syncAgain').onclick = () => { syncText('Syncing…'); syncNow(false); };
  el.querySelector('#syncCopy').onclick = () => copyText(settings.syncUrl, 'Sync link copied. Paste it in GSSC RFO on your other device: Sync progress, then paste.');
  el.querySelector('#syncOff').onclick = () => { delete settings.syncUrl; UI.syncErr = false; saveSettings(); refreshTopBtns(); closeSheet(); toast('Sync disconnected on this device. Your progress here is kept.'); };
  syncNow(true).then(m => { if (!m && ls) syncText('Last synced ' + esc(day(ls.at)) + '.'); });
}
function copyText(t, ok) {
  const done = () => toast(ok, null, 5000);
  try { navigator.clipboard.writeText(t).then(done, () => prompt0(t)); } catch (e) { prompt0(t); }
}
function prompt0(t) { const i = $('#syncLink'); if (i) { i.value = t; i.hidden = false; i.select(); } toast('Select the link and copy it'); }
function openSyncSetup() {
  const el = sheet('<div class="shh"><h2>Sync progress</h2><button type="button" class="ib" data-close aria-label="Close">' + ICON.close + '</button></div>' +
    '<p>Connect this device once. Paste your sync link: it starts with <b>https://script.google.com/macros/s/</b> and ends with <b>/exec</b>.</p>' +
    '<input id="syncIn" class="inp" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" data-focus>' +
    '<p class="err" id="syncErr" hidden></p>' +
    '<button type="button" class="wide grn" id="syncGo">' + ICON.sync + '<span>Connect and sync</span></button>' +
    '<p class="sub">Your other device already synced? Open GSSC RFO there, tap Sync progress, then Copy sync link, and send it to yourself.</p>' +
    '<input id="syncLink" class="inp" hidden readonly>' +
    '<details class="other"><summary>Other ways</summary><div class="two"><button type="button" class="btn grn-o" data-act="down">' + ICON.down + '<span>Backup file</span></button><button type="button" class="btn grn-o" data-act="up">' + ICON.up + '<span>Restore file</span></button></div></details>', { label: 'Sync progress' });
  const inp = el.querySelector('#syncIn'), err = el.querySelector('#syncErr'), go = el.querySelector('#syncGo');
  go.onclick = async () => {
    const u = (inp.value || '').trim().replace(/\?.*$/, '');
    if (!HUB_RE.test(u)) { err.hidden = false; err.textContent = 'That is not a sync link. It should start with https://script.google.com/macros/s/ and end with /exec.'; return; }
    err.hidden = true; go.disabled = true; go.lastChild.textContent = 'Connecting…';
    try {
      const o = await (await fetch(u + '?ping=1', { redirect: 'follow' })).json();
      if (!o || !o.ok) throw new Error('no');
    } catch (e) { go.disabled = false; go.lastChild.textContent = 'Connect and sync'; err.hidden = false; err.textContent = 'Could not reach that link. Check it was copied in full and that you are online.'; return; }
    settings.syncUrl = u; saveSettings(); closeSheet(); openSync();
  };
}
export function openOther() { openDownload(); }

// ---------- Settings: one place for sync, the AI assistant, notes text size, backups and the app itself ----------
const appVersion = () => { const m = document.querySelector('meta[name="gps-v"]'); return m ? m.content.replace('gsscrfo-', '') : 'dev'; };
// The CBT-II date: GSSC announces it late. The owner can set it for everyone in the access sheet; anyone can set their own here.
function openExamDate() {
  const cur0 = settings.examDate || '';
  const el = sheet('<div class="shh"><h2>CBT-II exam date</h2><button type="button" class="ib" data-close aria-label="Close">' + ICON.close + '</button></div>' +
    '<p class="sub">Check the date on gssc.goa.gov.in or in your admit card, then set it here. The countdown on Home uses it.</p>' +
    '<label class="inl">Exam date <input type="date" id="edIn" value="' + esc(cur0) + '" min="2026-01-01" max="2028-12-31"></label>' +
    '<div class="two"><button type="button" class="btn pri" id="edSave">Save</button><button type="button" class="btn sec" id="edClear"' + (cur0 ? '' : ' disabled') + '>Clear</button></div>', { label: 'Exam date' });
  el.querySelector('#edSave').onclick = () => { const v = el.querySelector('#edIn').value; if (!v) { toast('Pick a date first'); return; } settings.examDate = v; saveSettings(); closeSheet(); render(); toast('Exam date saved'); };
  el.querySelector('#edClear').onclick = () => { delete settings.examDate; saveSettings(); closeSheet(); render(); };
}
function openSettings() {
  const ls = settings.lastSync, fs = settings.fs || 1;
  const when = ls && ls.what === 'sync' ? 'Last synced ' + esc(day(ls.at)) + ' at ' + esc(new Date(ls.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })) + '.' : 'Not synced yet.';
  const st = !settings.syncUrl ? 'Not connected on this device.' : 'Connected. ' + when;
  const acct = G.signedIn() ? '<section class="sset"><div class="ssh"><span class="ic ic-grn">' + ICON.sync + '</span><span class="rt"><span class="ttl">Signed in as ' + esc(G.account().email || 'your Google account') + '</span><span class="sub" id="stSync">Progress is kept in a private app folder in your own Google Drive. ' + when + '</span></span></div>' +
      '<div class="two"><button type="button" class="btn grn" id="stSyncGo">Sync now</button><button type="button" class="btn sec" id="stOut">Sign out</button></div>' +
      '<p class="sub" id="stOutQ" hidden>Signing out keeps your progress on this device and in your Drive. <button type="button" class="lnk" id="stOutGo">Sign out now</button></p></section>'
    : G.configured() ? '<section class="sset"><div class="ssh"><span class="ic ic-grn">' + ICON.sync + '</span><span class="rt"><span class="ttl">Sync progress</span><span class="sub" id="stSync">Not signed in: your progress is only on this device. Sign in with Google to keep it in your own Drive and use it on all your devices.</span></span></div>' +
      '<button type="button" class="wide gbtn" data-act="signin">' + GBTN + '<span>Sign in with Google</span></button></section>' : '';
  const link = settings.syncUrl || !G.configured();
  const lc = L.lic(), paidTxt = !L.enabled() ? '' : L.isOwner() ? 'You are the owner: you have full access.' : L.hasPaid() ? 'Full access' + (lc && lc.plan ? ': ' + esc(lc.plan) : '') + (lc && lc.expires ? ', until ' + esc(day(lc.expires)) : '') + '.' : lc && lc.status === 'pending' ? 'Waiting for your payment to be confirmed.' : 'Free part only. Choose a plan to unlock everything.';
  const plus = !L.enabled() ? '' : '<section class="sset"><div class="ssh"><span class="ic ic-amb">' + L.lockIcon + '</span><span class="rt"><span class="ttl">' + (L.isOwner() ? 'Paid access' : 'Your plan') + '</span><span class="sub">' + paidTxt + '</span></span></div>' +
    (L.isOwner() ? '<a class="wide pri" href="#/admin" data-close>Requests, plans, free content and vouchers</a>' : L.hasPaid() ? '' : '<a class="wide pri" href="#/pay" data-close>See plans or use a voucher</a>') + '</section>';
  const sz = [[1, 'Normal'], [1.12, 'Large'], [1.25, 'Larger']];
  const el = sheet('<div class="shh"><h2>Settings</h2><button type="button" class="ib" data-close aria-label="Close">' + ICON.close + '</button></div>' +
    acct + plus + (link ? '<section class="sset"><div class="ssh"><span class="ic ic-grn">' + ICON.sync + '</span><span class="rt"><span class="ttl">' + (G.configured() ? 'Sync link' : 'Sync progress') + '</span><span class="sub" id="stLinkSt">' + st + '</span></span></div>' +
    '<div class="two"><button type="button" class="btn ' + (G.signedIn() ? 'sec' : 'grn') + '" id="stLinkGo">' + (settings.syncUrl ? 'Sync now' : 'Connect sync') + '</button>' +
    (settings.syncUrl ? '<button type="button" class="btn sec" id="stCopy">Copy sync link</button>' : '') + '</div>' +
    (settings.syncUrl ? '<button type="button" class="lnk" id="stOff">Disconnect sync on this device</button>' : '') + '<input id="syncLink" class="inp" hidden readonly></section>' : '') +
    '<section class="sset"><div class="ssh"><span class="ic ic-vio">✦</span><span class="rt"><span class="ttl">AI assistant</span><span class="sub" id="stAi">…</span></span></div>' +
    '<div class="two"><button type="button" class="btn sec" id="stKey">Choose AI and model</button><button type="button" class="btn sec" id="stKeyDel" hidden>Remove key</button></div></section>' +
    '<section class="sset"><div class="ssh"><span class="ic ic-core">Aa</span><span class="rt"><span class="ttl">Notes text size</span><span class="sub">For the study notes and playbooks.</span></span></div>' +
    '<div class="seg" role="group" aria-label="Notes text size">' + sz.map(([v, t]) => '<button type="button" data-fs="' + v + '" class="' + (Math.abs(fs - v) < .01 ? 'on' : '') + '" aria-pressed="' + (Math.abs(fs - v) < .01) + '">' + t + '</button>').join('') + '</div></section>' +
    '<section class="sset"><div class="ssh"><span class="ic ic-amb">' + ICON.down + '</span><span class="rt"><span class="ttl">Backup</span><span class="sub">' + H.length + (H.length === 1 ? ' attempt' : ' attempts') + ' on this device. Save a file you can restore on any device.</span></span></div>' +
    '<div class="two"><button type="button" class="btn sec" data-act="down">' + ICON.down + '<span>Backup file</span></button><button type="button" class="btn sec" data-act="up">' + ICON.up + '<span>Restore file</span></button></div></section>' +
    '<section class="sset"><div class="ssh"><span class="ic ic-pri">' + ICON.upd + '</span><span class="rt"><span class="ttl">App</span><span class="sub">Version ' + esc(appVersion()) + '. New versions install by themselves, never during a test.</span></span></div>' +
    '<div class="two"><button type="button" class="btn sec" data-act="update">' + ICON.upd + '<span>Update app</span></button><button type="button" class="btn sec" id="stFix">Repair app</button></div>' +
    '<p class="sub" id="stFixQ" hidden>Repair downloads a fresh copy of the app. Your progress, sync link, AI keys and reading places stay on this device. <button type="button" class="lnk" id="stFixGo">Repair now</button></p></section>',
    { label: 'Settings' });
  const runSync = (b, ok) => { const s0 = el.querySelector(b); s0.textContent = 'Syncing…'; syncNow(false).then(m => { s0.textContent = m ? ok : 'Could not sync just now. Your progress is safe on this device.'; }); };
  const sg = el.querySelector('#stSyncGo'); if (sg) sg.onclick = () => runSync('#stSync', 'Progress is kept in a private app folder in your own Google Drive. Last synced just now.');
  const lg = el.querySelector('#stLinkGo'); if (lg) lg.onclick = () => { if (!settings.syncUrl) { closeSheet(true); openSyncSetup(); return; } runSync('#stLinkSt', 'Connected. Last synced just now.'); };
  const so = el.querySelector('#stOut'); if (so) so.onclick = () => { el.querySelector('#stOutQ').hidden = false; };
  const sgo = el.querySelector('#stOutGo'); if (sgo) sgo.onclick = () => { G.signOut(); refreshTopBtns(); toast('Signed out. Your progress is still on this device.'); openSettings(); };
  const cp = el.querySelector('#stCopy'); if (cp) cp.onclick = () => copyText(settings.syncUrl, 'Sync link copied. Paste it in GSSC RFO on your other device: Settings, Connect sync.');
  const off = el.querySelector('#stOff'); if (off) off.onclick = () => { delete settings.syncUrl; UI.syncErr = false; saveSettings(); refreshTopBtns(); toast('Sync disconnected on this device. Your progress here is kept.'); openSettings(); };
  el.querySelector('#stKey').onclick = () => safeImport('./ai.js?v=gsscrfo-2fc7a97e47').then(m => m.keySheet(openSettings));
  safeImport('./ai.js?v=gsscrfo-2fc7a97e47').then(m => {
    const a = m.summary(), t = el.querySelector('#stAi'), kd = el.querySelector('#stKeyDel'); if (!t) return;
    t.textContent = a.text; el.querySelector('#stKey').textContent = a.on ? 'Change AI or model' : 'Set up AI';
    kd.hidden = !a.on; kd.onclick = () => { m.removeKey(); toast('API key removed from this device.'); openSettings(); };
  }).catch(() => { });
  el.querySelectorAll('[data-fs]').forEach(b => b.onclick = () => { settings.fs = +b.dataset.fs; saveSettings(); el.querySelectorAll('[data-fs]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); });
  el.querySelector('#stFix').onclick = () => { el.querySelector('#stFixQ').hidden = false; };
  el.querySelector('#stFixGo').onclick = () => { if (window.__gpsRepair) window.__gpsRepair('manual'); else location.reload(); };
}

// ---------- Update app: fetch the newest version now ----------
let swUpdating = false;
const UPD_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>';
const waitInstalled = w => new Promise(r => { const f = () => { if (w.state !== 'installing') { w.removeEventListener('statechange', f); r(); } }; w.addEventListener('statechange', f); f(); });
// Called by the boot guard when the website has a newer version than this copy (checked on every launch).
window.__gpsUpdate = () => {
  const go = () => { if (document.body.dataset.screen === 'runner' || sheetOpen()) return setTimeout(go, 15000); updateApp(null, true); };
  go();
};
export async function updateApp(btn, auto) {
  const busy = on => { if (btn) { btn.classList.toggle('busy', on); btn.disabled = on; } };
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') { location.reload(); return; }
  busy(true);
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { location.reload(); return; }
    await reg.update();
    let w = reg.installing || reg.waiting;
    if (!w) {
      busy(false);
      // the website says there is a newer version but this copy did not get it: fetch it fresh (once per half hour)
      if (auto && window.__gpsNewer) {
        const f = lsGet('gsscrfo-forced', {}) || {};
        if (f.v !== window.__gpsNewer || Date.now() - f.at > 1800000) { lsSet('gsscrfo-forced', { v: window.__gpsNewer, at: Date.now() }); if (window.__gpsRepair) window.__gpsRepair('newer version ' + window.__gpsNewer); }
        return;
      }
      if (!auto) toast('GSSC RFO is up to date.');
      return;
    }
    if (!auto) toast('Updating GSSC RFO…', null, 6000);
    await waitInstalled(w);
    w = reg.waiting || w;
    swUpdating = true;
    if (!navigator.serviceWorker.controller || w.state === 'activated') { location.reload(); return; }
    w.postMessage('skipWaiting');
    setTimeout(() => location.reload(), 4000); // in case the switch-over event is missed
  } catch (e) {
    busy(false);
    toast(navigator.onLine === false ? 'You are offline. Connect to the internet and tap Update app again.' : 'Could not check for updates just now. Try again in a minute.', null, 5000);
  }
}

// ---------- Ask AI: a small tab tucked into the right-hand margin of every screen ----------
function aiTab() {
  const t = document.createElement('button');
  t.type = 'button'; t.id = 'aitab'; t.setAttribute('aria-label', 'Ask AI'); t.setAttribute('aria-haspopup', 'menu');
  t.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="aitg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f8cff"/><stop offset=".55" stop-color="#9b6bff"/><stop offset="1" stop-color="#ff6fae"/></linearGradient></defs><path d="M12 1.5c.7 5.6 3.9 8.8 9.5 9.5v2c-5.6.7-8.8 3.9-9.5 9.5h-2c-.7-5.6-3.9-8.8-9.5-9.5v-2C6.1 10.3 9.3 7.1 10 1.5z" fill="url(#aitg)" transform="translate(1 0)"/></svg>';
  const place = y => { const v = Math.min(0.78, Math.max(0.14, y)); t.style.top = Math.round(v * innerHeight) + 'px'; return v; };
  place(typeof settings.aiY === 'number' ? settings.aiY : 0.56);
  // drag it up or down if it ever sits over something you want to see
  let sy = 0, moved = false, startTop = 0;
  t.addEventListener('pointerdown', e => { sy = e.clientY; moved = false; startTop = t.getBoundingClientRect().top + t.offsetHeight / 2; t.setPointerCapture && t.setPointerCapture(e.pointerId); });
  t.addEventListener('pointermove', e => { if (!sy) return; const d = e.clientY - sy; if (Math.abs(d) > 8) moved = true; if (moved) place((startTop + d) / innerHeight); });
  t.addEventListener('pointerup', e => { if (moved) { settings.aiY = parseFloat(t.style.top) / innerHeight; saveSettings(); } sy = 0; });
  t.addEventListener('click', e => { if (moved) { moved = false; e.preventDefault(); return; } safeImport('./ai.js?v=gsscrfo-2fc7a97e47').then(m => m.menu(t)); });
  document.body.appendChild(t);
  // Never cover content: look at what lies under the tab and slide it to the nearest clear spot in the margin.
  const FREE = 'html,body,#app,main,.pad,.notes,#nb,.ns,.nb,.stack';
  const clearAt = y => {
    for (const x of [innerWidth - 2, innerWidth - 9, innerWidth - 15]) for (let dy = -28; dy <= 28; dy += 8) {
      const els = document.elementsFromPoint(x, y + dy).filter(e => e !== t && !t.contains(e));
      const top = els[0];
      if (top && !top.matches(FREE)) return false;
    }
    return true;
  };
  const settle = () => {
    if (!t.isConnected || t.offsetParent === null) return;
    const pref = (typeof settings.aiY === 'number' ? settings.aiY : 0.56) * innerHeight;
    const lo = innerHeight * 0.14, hi = innerHeight * 0.78;
    for (let d = 0; d <= hi - lo; d += 12) {
      for (const y of d ? [pref - d, pref + d] : [pref]) {
        if (y < lo || y > hi) continue;
        if (clearAt(y)) { t.style.top = Math.round(y) + 'px'; t.classList.remove('thin'); return; }
      }
    }
    t.style.top = Math.round(pref) + 'px'; t.classList.add('thin'); // nowhere clear: shrink to a sliver
  };
  let st = 0;
  const later = ms => { clearTimeout(st); st = setTimeout(settle, ms); };
  // fade while scrolling so it never draws the eye away from reading, then find a clear spot again
  document.addEventListener('scroll', e => { if (e.target !== SC()) return; t.classList.add('dim'); later(160); clearTimeout(t._f); t._f = setTimeout(() => t.classList.remove('dim'), 700); }, { passive: true, capture: true });
  window.addEventListener('resize', () => later(200));
  new MutationObserver(() => later(250)).observe($('#app'), { childList: true, subtree: true });
  t.addEventListener('pointerup', () => later(50));
  later(300);
}

// Back from Google's page: say who is signed in and sync straight away
async function afterGoogle(r) {
  if (!r.ok) {
    if (r.error === 'interaction_required' || r.error === 'login_required' || r.error === 'consent_required') { if (G.signedIn() || r.then === 'sync') G.signIn({ then: 'sync' }); return; } // the quick sign-in needs the student: show Google's page
    toast(r.error === 'access_denied' ? 'Sign-in was cancelled. Your progress is safe on this device.' : r.error === 'scope' ? 'GSSC RFO needs permission to keep its own file in your Google Drive. Sign in again and tick the box.' : 'Could not sign in just now. Try again.', null, 6000);
    return;
  }
  try { if (!G.signedIn()) { const a = await G.whoAmI(); settings.welcomed = 1; saveSettings(); toast('Signed in as ' + a.email + '. Syncing…', null, 3000); } } catch (e) { }
  if (L.enabled()) await L.refresh();
  if (r.then === 'pay') { go('#/pay'); return; }
  cur = null; render();
  syncNow(false);
}

window.addEventListener('gpsc-rerender', () => { cur = null; render(); });
// ---------- boot ----------
async function boot() {
  window.__gpsLoaded = true; // the boot guard in index.html: the code arrived, now loading the question index
  const back = G.takeRedirect(); // coming back from Google's sign-in page
  loadAttempts();
  await getIndex();
  // Deep link opened fresh (e.g. from WhatsApp): put its parents under it so Back moves up a level instead of leaving the app.
  const target = parse().hash;
  if (target !== '#/' && !(history.state && history.state.d)) {
    const chain = [];
    let p = parentOf(target);
    while (p && chain.length < 4) { chain.unshift(p); p = parentOf(p); }
    if (chain[0] !== '#/') chain.unshift('#/');
    history.replaceState({ d: 0 }, '', chain[0]);
    chain.slice(1).forEach((h, i) => history.pushState({ d: i + 1 }, '', h));
    depth = chain.length;
    history.pushState({ d: depth }, '', target);
  } else depth = (history.state && history.state.d) || 0;
  if (!history.state) history.replaceState({ d: 0 }, '', location.hash || '#/');
  await render();
  window.__gpsBooted = true; // only now: the first screen is on show
  if (window.__gpsOK) window.__gpsOK();
  if (back) afterGoogle(back);
  else if (L.enabled()) {
    // the owner's script can take a few seconds the first time; redraw only if what this person can open has changed
    const key = () => { const l = L.lic(); return JSON.stringify(l ? [l.free, l.status, l.expires, l.owner] : null); }, k0 = key();
    L.refresh().then(() => { if (key() !== k0 && !sheetOpen() && document.body.dataset.screen !== 'runner') { cur = null; render(); } });
  }
  aiTab();
  if (/[?&]shared=1/.test(location.search) && 'caches' in window) {
    history.replaceState(history.state, '', location.pathname + (location.hash || '#/'));
    caches.open('inbox-gsscrfo').then(c => c.match('inbox').then(res => {
      if (!res) return toast('No shared file arrived. Try Upload progress instead.');
      const name = decodeURIComponent(res.headers.get('x-name') || 'shared-file.json');
      return res.blob().then(b => { c.delete('inbox'); openUpload(new File([b], name, { type: 'application/json' })); });
    })).catch(() => toast('Could not open the shared file. Try Upload progress instead.'));
  }
  idle(() => { getKeys().catch(() => { }); getMeta().catch(() => { }); }, 1500);
  if (settings.syncUrl) setTimeout(() => syncNow(true), 1200);
  window.addEventListener('gpsc-saved', () => setTimeout(() => syncNow(true), 15000)); // after the Undo window
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pushOnLeave();
    else if (settings.syncUrl && (!settings.lastSync || Date.now() - Date.parse(settings.lastSync.at) > 300000)) syncNow(true);
  });
  window.addEventListener('pagehide', pushOnLeave);
  window.addEventListener('online', () => { if (settings.syncUrl) syncNow(true); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Updates apply by themselves: the new version takes over and the app reloads, never in the middle of a test.
    const offer = w => { if (!navigator.serviceWorker.controller) return; const go = () => { if (document.body.dataset.screen === 'runner' || sheetOpen()) return setTimeout(go, 15000); swUpdating = true; w.postMessage('skipWaiting'); }; go(); };
    // A new version took over this tab: switch to it straight away, or as soon as no test or sheet is open.
    const reloadWhenFree = () => { if (document.body.dataset.screen === 'runner' || sheetOpen()) return setTimeout(reloadWhenFree, 15000); location.reload(); };
    let hadCtrl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (swUpdating || hadCtrl) reloadWhenFree(); hadCtrl = true; });
    // Look for a new version whenever the tab comes back into view, and every 30 minutes while it is open.
    const checkUpdate = () => navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => { });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
    addEventListener('pageshow', e => { if (e.persisted) checkUpdate(); });
    addEventListener('focus', checkUpdate);
    setInterval(() => { if (document.visibilityState === 'visible') checkUpdate(); }, 30 * 60 * 1000);
    // Register after the first paint. boot() awaits data first, so the load event has often fired already.
    const regSW = () => idle(() => navigator.serviceWorker.register('sw.js').then(reg => {
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); }); });
    }).catch(() => { }), 3000);
    if (document.readyState === 'complete') regSW(); else window.addEventListener('load', regSW, { once: true });
  }
  if (window.__gpscTest) window.__gpsc = { api, progressFile, planMerge, applyMerge, H: () => H };
}
boot();
