// Study: library with subject chips, notes reader with quick-check quizzes, playbooks, PDFs, Revise incorrect, past papers, search.
import { fetchBlob } from './vault.js?v=gsscrfo-2fc7a97e47';
import {
  $, $$, SC, esc, day, idle, getIndex, getMeta, getKeys, getSet, getText, getSearch, setInfo, IDX, META, H, wrongList, tokens,
  settings, saveSettings, saveCustom, toast, sheet, ICON, topbar, navHtml, lvlChip, srcTag, SEC, TOPIC_NAMES, loadAttempts, NOTE_TOPICS, hasNotes, topBtns, saveBtn, savedList
} from './core.js?v=gsscrfo-2fc7a97e47';

const app = $('#app');
let API = null;
const CHIPS = [['all', 'All'], ['core', 'Forestry'], ['num', 'Numerical'], ['lr', 'Reasoning'], ['gram', 'English Grammar'], ['comp', 'English Comprehension'], ['kon', 'Konkani'], ['papers', 'Past papers'], ['pdfs', 'PDFs'], ['wrong', 'Revise incorrect'], ['saved', 'Saved']];
const WSUB = [['all', 'All'], ['core', 'Forestry'], ['num', 'Numerical'], ['lr', 'Reasoning'], ['comp', 'English comprehension'], ['gram', 'English grammar'], ['kon', 'Konkani'], ['pdfs', 'PDFs']];
const TCOL = { 1: 'core', 2: 'ind', 3: 'num', 4: 'lr', 5: 'kon', 6: 'comp', 7: 'gram', 8: 'num', 9: 'lr', 10: 'comp' };
const ORDER = ['lr', 'num', 'comp', 'gram', 'core', 'kon'];

export async function route(r, me, api) {
  API = api;
  const [a, b, c] = r.path;
  await Promise.all([getIndex(), getMeta()]);
  if (a === 'search') return searchScreen(r, me);
  if (b && /^topic(\d+)$/.test(b)) return notesScreen(+b.slice(5), r, me);
  if (b === 'playbook') return playbookScreen(c || 'english', r, me);
  if (b === 'cheat') return cheatScreen(c || 'grammar', me);
  if (b === 'papers') return papersScreen();
  if (b === 'kon' && !hasKon()) return library('all', 'all', r, me);
  return library(b || 'all', c || 'all', r, me);
}

const hasKon = () => IDX.sets.some(x => /^kond\d/.test(x.id) || x.tier === 1) || !!(META.playbooks && META.playbooks['konkani-playbook']);
function readPct(t) { return (settings.read && settings.read[t]) || 0; }
function row(href, ic, cls, title, sub, extra) { return '<a class="row" href="' + href + '"><span class="num ' + cls + '">' + ic + '</span><span class="rt"><span class="ttl">' + esc(title) + '</span><span class="sub">' + esc(sub) + '</span></span>' + (extra || '<span class="chev">' + ICON.chev + '</span>') + '</a>'; }

// ---------- library ----------
async function library(chip, sub, r, me) {
  await getKeys();
  if (me.hash !== location.hash) return;
  const wl = wrongList();
  const chips = CHIPS.filter(c => c[0] !== 'kon' || hasKon()).map(c => '<a role="tab" class="fchip' + (c[0] === 'wrong' ? ' wrongc' : '') + (chip === c[0] ? ' on' : '') + '" aria-selected="' + (chip === c[0]) + '" href="#/study' + (c[0] === 'all' ? '' : '/' + c[0]) + '" data-replace="1">' + c[1] + (c[0] === 'wrong' ? ' · ' + wl.length : c[0] === 'saved' ? ' · ' + savedList().length : '') + '</a>').join('');
  const show = k => chip === 'all' || chip === k;
  let body = '';
  if (show('core')) {
    body += '<h2 class="label">Forestry & Science notes · CBT-II subject test, 40 marks</h2><div class="tiles2">' + META.notes.map(n => {
      const p = readPct(n.t);
      return '<a class="ntile tc-' + TCOL[n.t] + (p > 0 && p < 95 ? ' cont' : '') + '" href="#/study/topic' + n.t + '"><span class="nk">Topic ' + n.t + '</span><span class="nt">' + esc(n.title) + '</span><span class="nm">' + (n.diagrams + (n.pics || 0) ? n.diagrams + (n.pics || 0) + ' pictures · ' : '') + (p >= 95 ? 'read' : p > 0 ? 'continue · ' + p + '%' : 'new') + '</span></a>';
    }).join('') + '</div>';
    const allPdf = META.pdfs.find(p => p.kind === 'notes');
    if (allPdf) body += '<h2 class="label">Forestry notes as PDF · to download or share</h2><div class="list">' + pdfRow(allPdf) + (chip === 'core' ? META.pdfs.filter(p => p.kind === 'topic').map(pdfRow).join('') : row('#/study/pdfs', 'PDF', 's-core-b', 'Each topic as its own PDF', '10 files, about 0.5 to 1.5 MB each')) + '</div>';
    if (chip === 'core') body += '<h2 class="label">Quick-check quizzes</h2><div class="list">' + META.notes.map(n => row('#/test/quiz-topic' + n.t, 'Q' + n.t, 's-core-b', 'Topic ' + n.t + ' quiz', n.quiz + ' questions from the notes · learn mode')).join('') + '</div>'  +
      '<p class="sub">Every mock has four questions from each topic. <a class="lnk" href="#/custom?sec=core&amp;topics=4,5">Practise wildlife and laws (topics 4–5)</a></p>';
  }
  if (show('num')) body += '<h2 class="label">Numerical ability · 10 marks</h2><div class="list">' + row('#/study/cheat/numerical', 'Cs', 's-num-b', 'Numerical cheat sheet', 'Percentages, ratio, interest, speed, work, areas and volumes, data tables') + row('#/drills/num', IDX.sets.filter(x => /^numd\d/.test(x.id)).length, 's-num-b', 'Numerical drills', 'Easy, intermediate and hard · 10 questions each') + '</div>';
  if (show('comp')) body += '<h2 class="label">English comprehension</h2><div class="list">' + row('#/study/playbook/english-comp', 'Rc', 's-comp-b', 'Reading a passage', 'English playbook: main idea, inference, tone, traps') + row('#/drills/comp', IDX.sets.filter(x => /^compd\d/.test(x.id)).length, 's-comp-b', 'Comprehension drills', 'Five passages each, 25 minutes') + '</div>';
  if (show('gram')) body += '<h2 class="label">English grammar</h2><div class="list">' + row('#/study/playbook/english-grammar', 'Gr', 's-gram-b', 'Grammar rules', 'English playbook: structure, voice, errors, idioms') + row('#/study/cheat/grammar', 'Cs', 's-gram-b', 'Grammar cheat sheet', 'Tenses, agreement, articles, voice, narration on one page') + row('#/drills/en', IDX.sets.filter(x => /^(end|grd)\d/.test(x.id)).length, 's-gram-b', 'Grammar drills', 'Easy, intermediate and hard · 10 questions each') + '</div>';
  if (show('kon') && hasKon()) body += '<h2 class="label">Konkani · CBT-I only (4 of 10 needed)</h2><div class="list">' + (META.playbooks['konkani-playbook'] ? row('#/study/playbook/konkani', 'को', 's-kon-b', 'Konkani notes', 'Grammar, words and usage for the CBT-I Konkani test') : '') + row('#/drills/kon', IDX.sets.filter(x => /^kond\d/.test(x.id)).length, 's-kon-b', 'Konkani drills', '10 questions each') + '</div>';
  if (show('lr')) body += '<h2 class="label">Reasoning · 10 marks</h2><div class="list">' + row('#/study/cheat/reasoning', 'Cs', 's-lr-b', 'Reasoning cheat sheet', 'Series, coding, relations, clocks, syllogisms, shortcuts') + row('#/drills/lr', IDX.sets.filter(x => /^lrd\d/.test(x.id)).length, 's-lr-b', 'Reasoning drills', 'Easy, intermediate and hard · 10 questions each') + '</div>';
  if (chip === 'all') body += '<h2 class="label">More</h2><div class="list">' + row('#/study/playbook/english', 'En', 's-comp-b', 'English Playbook (full)', 'Comprehension and grammar, with a 13-day plan') + row('#/study/papers', 'QP', 's-lr-b', 'Past question papers', META.papers.length + ' papers: forest posts and general tests') + row('#/study/pdfs', 'PDF', 's-ind-b', 'Printable PDFs', META.pdfs.length + ' files to print or share on WhatsApp') + '</div>';
  if (chip === 'pdfs') body += '<h2 class="label">Printable PDFs to share on WhatsApp</h2><div class="list">' + META.pdfs.map(pdfRow).join('') + '</div>';
  if (chip === 'wrong') body += await wrongBody(wl, sub, me);
  if (chip === 'saved') body += await savedBody();
  app.innerHTML = '<div class="ptop"><header class="ph"><h1>Study</h1>' + topBtns() + '</header><div class="ptabs"><div class="chips" role="tablist" aria-label="Subjects">' + chips + '</div></div></div>' +
    '<main class="pad stack"><form class="sbox" role="search" id="sf"><span aria-hidden="true">' + ICON.search + '</span><input type="search" name="q" placeholder="Search notes: teak, Schedule I, Mhadei…" aria-label="Search notes, questions and sets" enterkeyhint="search"></form>' +
    body + '</main>' + navHtml('study');
  bindPdf(app);
  const onc = app.querySelector('.ptabs .fchip.on'); if (onc && onc.scrollIntoView) onc.scrollIntoView({ block: 'nearest', inline: 'center' });
  $('#sf').onsubmit = e => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) API.go('#/search?q=' + encodeURIComponent(q)); };
  const wa = $('#wtest'); if (wa) wa.onclick = () => practiseWrong(wa.dataset.sub);
  const sa = $('#stest'); if (sa) sa.onclick = () => practiseRefs(savedList().slice(0, 60).map(x => [x.ref, x.sec]), 'Saved questions');
}
// ---------- Saved questions ----------
async function savedBody() {
  const list = savedList();
  let h = '<p class="sub">Questions you saved with the star in a review or in Revise incorrect. Tap the star again to remove one.</p>';
  if (!list.length) return h + '<p class="empty">Nothing saved yet. After a test, open the review and tap <b>Save</b> on any question you want to come back to.</p>';
  const ids = Array.from(new Set(list.map(x => x.ref.slice(0, x.ref.lastIndexOf(':')))));
  const sets = {};
  await Promise.all(ids.map(id => getSet(id).then(s => (sets[id] = s)).catch(() => { })));
  h += '<button type="button" class="wide pri" id="stest">' + (list.length === 1 ? 'Practise it as a test' : 'Practise these ' + Math.min(list.length, 60) + ' as a test') + '</button><div class="rlist">';
  h += list.map(x => {
    const sid = x.ref.slice(0, x.ref.lastIndexOf(':')), n = +x.ref.slice(x.ref.lastIndexOf(':') + 1), s = sets[sid];
    const q = s && s.questions[n - 1]; if (!q) return '';
    const opts = q.opts.concat(['None of the above']);
    return '<article class="rev"><div class="qh">' + (q.lvl ? lvlChip(q.lvl) : '') + '<span class="chip s-' + q.sec + '-c">' + esc(q.sec === 'core' && q.topic ? 'Topic ' + q.topic + ' · ' + TOPIC_NAMES[q.topic] : SEC[q.sec].name) + '</span><span class="sub">Saved ' + day(x.at) + '</span>' + saveBtn(x.ref, q.sec) + '</div>' +
      '<p class="qt">' + esc(q.q) + '</p><ol class="ro">' + opts.slice(0, q.ans === 'E' ? 5 : 4).map((t, i) => '<li class="' + ('ABCDE'[i] === q.ans ? 'right' : '') + '"><span class="key">' + 'ABCDE'[i] + '</span><span>' + esc(t) + '</span></li>').join('') + '</ol>' +
      '<details class="why"><summary>Why</summary><p>' + esc(q.why) + '</p></details>' + (hasNotes(q.topic) ? '<a class="lnk" href="#/study/topic' + q.topic + '">Read Topic ' + q.topic + ' notes</a>' : '') + '</article>';
  }).join('') + '</div>';
  return h;
}
function practiseRefs(pairs, name) {
  if (!pairs.length) return;
  const refs = pairs.slice().sort((a, b) => ORDER.indexOf(a[1]) - ORDER.indexOf(b[1]));
  const id = 'custom-' + Date.now().toString(36);
  saveCustom({ id, name, minutes: Math.max(3, Math.round(refs.length * 1.25)), mode: 'learn', refs, saved: false, createdAt: Date.now() });
  API.go('#/test/' + id + '?go=1');
}
const kbTxt = kb => kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB';
const pdfUrl = f => 'content/pdfs/' + encodeURIComponent(f);
function pdfRow(p) {
  return '<div class="row pdf"><a class="rowa" href="' + pdfUrl(p.f) + '" target="_blank" rel="noopener"><span class="num ' + (p.kind === 'topic' || p.kind === 'notes' ? 's-core-b' : 's-ind-b') + '">PDF</span><span class="rt"><span class="ttl">' + esc(p.name) + '</span><span class="sub">' + kbTxt(p.kb) + ' · opens in a new tab</span></span></a>' +
    '<a class="ib" href="' + pdfUrl(p.f) + '" download="' + esc(p.f) + '" aria-label="Download ' + esc(p.name) + '">' + ICON.down + '</a>' +
    '<button type="button" class="ib" data-share="' + esc(p.f) + '" aria-label="Share ' + esc(p.name) + '">' + ICON.share + '</button></div>';
}
// Share the PDF file itself (WhatsApp, Mail, Files…); falls back to sharing or copying the link
export async function sharePdf(f) {
  const url = new URL(pdfUrl(f), location.href).href;
  try {
    if (navigator.canShare) {
      toast('Preparing the PDF…');
      const blob = await fetchBlob(url, 'application/pdf');
      const file = new File([blob], f, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: f.replace(/\.pdf$/, '').replace(/-/g, ' ') }); return; }
    }
    if (navigator.share) { await navigator.share({ title: f, url }); return; }
    await navigator.clipboard.writeText(url); toast('Link copied. Paste it in WhatsApp to share.');
  } catch (err) { if (!err || err.name !== 'AbortError') toast('Could not share. Open the PDF and share from there.'); }
}
function bindPdf(root) {
  root.addEventListener('click', e => { const b = e.target.closest('[data-share]'); if (b) sharePdf(b.dataset.share); });
}
// The notes as PDF: this topic, or all ten in one file
function pdfSheet(t) {
  const one = META.pdfs.find(p => p.kind === 'topic' && p.topic === t), all = META.pdfs.find(p => p.kind === 'notes');
  const block = (p, lead) => p ? '<div class="pdfb"><p class="pdft"><b>' + esc(lead) + '</b><span class="sub">' + esc(p.name) + ' · ' + kbTxt(p.kb) + '</span></p><div class="row2"><a class="btn sec" href="' + pdfUrl(p.f) + '" download="' + esc(p.f) + '">' + ICON.down + 'Download</a><button type="button" class="btn vio" data-share="' + esc(p.f) + '">' + ICON.share + 'Share</button></div></div>' : '';
  const el = sheet('<h2>Notes as PDF</h2><p class="sub">In colour, with every picture and diagram. Share it with friends on WhatsApp, or keep it to read offline.</p>' +
    block(one, 'This topic') + block(all, 'All 10 core topics') + '<button type="button" class="btn sec" data-close>Close</button>', { label: 'Notes as PDF' });
  el.addEventListener('click', e => { const b = e.target.closest('[data-share]'); if (b) sharePdf(b.dataset.share); });
}

// ---------- Revise incorrect ----------
function pdfFor(setId, srcSet) {
  const s = srcSet || setId;
  const info = setInfo(s);
  if (info && info.num) return META.pdfs.find(p => p.kind === 'set' && p.num === (info.tier || 2) * 100 + info.num);
  const q = /^quiz-topic(\d+)$/.exec(s); if (q) return META.pdfs.find(p => p.kind === 'topic' && p.topic === +q[1]);
  return null;
}
function wMatch(w, sub) { return sub === 'all' || sub === 'pdfs' || w.sec === sub; }
async function wrongBody(wl, sub, me) {
  const subs = WSUB.map(c => '<a role="tab" class="schip2' + (c[0] !== 'all' && c[0] !== 'pdfs' ? ' s-' + c[0] + '-c' : '') + (sub === c[0] ? ' on' : '') + '" aria-selected="' + (sub === c[0]) + '" href="#/study/wrong' + (c[0] === 'all' ? '' : '/' + c[0]) + '" data-replace="1">' + c[1] + (c[0] !== 'pdfs' ? ' · ' + wl.filter(w => wMatch(w, c[0])).length : '') + '</a>').join('');
  let h = '<p class="sub">Every question you answered wrongly in mocks, drills and quizzes, newest first. Get one right in a retest and it leaves this list.</p><div class="chips" role="tablist" aria-label="Filter incorrect questions">' + subs + '</div>';
  const list = wl.filter(w => wMatch(w, sub));
  if (!wl.length) return h + '<p class="empty">No incorrect answers yet. Questions you get wrong in any test show here so you can revise them.</p>';
  // load the question text for these items: each ref points at a set file
  const refSets = Array.from(new Set(list.map(w => w.ref.slice(0, w.ref.lastIndexOf(':')))));
  const sets = {};
  await Promise.all(refSets.map(id => getSet(id).then(s => (sets[id] = s)).catch(() => { })));
  if (sub === 'pdfs') {
    const per = new Map();
    list.forEach(w => {
      const sid = w.ref.slice(0, w.ref.lastIndexOf(':')), s = sets[sid];
      let src = sid;
      if (s && s.refs) { const rr = s.refs[+w.ref.slice(w.ref.lastIndexOf(':') + 1) - 1]; if (rr) src = rr.split(':')[0]; }
      const p = pdfFor(sid, src); if (!p) return;
      per.set(p.f, (per.get(p.f) || 0) + 1);
    });
    const ps = META.pdfs.filter(p => per.has(p.f));
    return h + (ps.length ? '<div class="list">' + ps.map(p => pdfRow(Object.assign({}, p, { name: p.name + ' · ' + per.get(p.f) + ' wrong' }))).join('') + '</div>' : '<p class="empty">These wrong answers came from tests that have no PDF.</p>');
  }
  if (!list.length) return h + '<p class="empty">No incorrect answers in this group.</p>';
  h += '<button type="button" class="wide pri" id="wtest" data-sub="' + sub + '">' + (list.length === 1 ? 'Practise it as a test' : 'Practise these ' + Math.min(list.length, 60) + ' as a test') + '</button><div class="rlist">';
  h += list.map(w => {
    const sid = w.ref.slice(0, w.ref.lastIndexOf(':')), n = +w.ref.slice(w.ref.lastIndexOf(':') + 1), s = sets[sid];
    const q = s && s.questions[n - 1]; if (!q) return '';
    const opts = q.opts.concat(['None of the above']);
    return '<article class="rev"><div class="qh">' + (q.lvl ? lvlChip(q.lvl) : '') + '<span class="chip s-' + q.sec + '-c">' + esc(q.sec === 'core' && q.topic ? 'Topic ' + q.topic + ' · ' + TOPIC_NAMES[q.topic] : SEC[q.sec].name) + '</span><span class="sub">' + esc((setInfo(w.set) || { name: w.set.startsWith('custom-') ? 'Custom test' : w.set }).name) + ' · ' + day(w.when) + '</span>' + srcTag(q) + saveBtn(w.ref, w.sec) + '</div>' +
      '<p class="qt">' + esc(q.q) + '</p><p class="yo"><span class="bad">You: ' + w.a + '. ' + esc(opts['ABCDE'.indexOf(w.a)] || '') + '</span><span class="good">Answer: ' + q.ans + '. ' + esc(opts['ABCDE'.indexOf(q.ans)]) + '</span></p>' +
      '<details class="why"><summary>Why</summary><p>' + esc(q.why) + '</p></details>' + (hasNotes(q.topic) ? '<a class="lnk" href="#/study/topic' + q.topic + '">Read Topic ' + q.topic + ' notes</a>' : '') + '</article>';
  }).join('') + '</div>';
  return h;
}
function practiseWrong(sub) {
  const list = wrongList().filter(w => wMatch(w, sub)).slice(0, 60);
  if (!list.length) return;
  const id = 'custom-' + Date.now().toString(36);
  const refs = list.map(w => [w.ref, w.sec]).sort((a, b) => ORDER.indexOf(a[1]) - ORDER.indexOf(b[1]));
  saveCustom({ id, name: 'Revise incorrect' + (sub !== 'all' ? ' · ' + WSUB.find(x => x[0] === sub)[1] : ''), minutes: Math.max(3, Math.round(refs.length * 1.25)), mode: 'learn', refs, saved: false, createdAt: Date.now() });
  API.go('#/test/' + id + '?go=1');
}

// ---------- notes reader ----------
async function notesScreen(t, r, me) {
  const n = META.notes.find(x => x.t === t);
  if (!n) throw new Error('No notes for topic ' + t);
  const fs = settings.fs || 1;
  app.innerHTML = '<header class="nhd tc-' + TCOL[t] + '"><div class="nrow"><button type="button" class="ib glass" data-back aria-label="Back">' + ICON.back + '</button><span class="sp"></span>' +
    '<button type="button" class="ib glass wide-ib" id="nPdf" aria-label="Download these notes as PDF">' + ICON.down + 'PDF</button><button type="button" class="ib glass" id="nShare" aria-label="Share these notes">' + ICON.share + '</button><button type="button" class="ib glass" id="nFs" aria-label="Text size">Aa</button></div>' +
    '<p class="nk">Forestry & Science, topic ' + t + '</p><h1>' + esc(n.title) + '</h1><div class="nprog"><div class="trk wht"><i id="nBar" style="width:' + readPct(t) + '%"></i></div><span id="nPct">' + readPct(t) + '% read</span></div></header>' +
    '<nav class="toc" aria-label="Contents"><div class="tocs" id="toc">' + n.toc.map(x => '<a href="#' + x[0] + '" data-sec="' + x[0] + '">' + esc(x[1].replace(/^(\d+\.\d+)\s.*$/, '$1') === x[1] ? x[1] : shortSec(x[1])) + '</a>').join('') + '</div></nav>' +
    '<main class="notes" id="nb" style="--fs:' + fs + '"><p class="sub pad">Loading notes…</p></main>' +
    '<footer class="nfoot"><button type="button" class="btn sec" id="nNext">Next section</button><a class="btn vio" href="#/test/quiz-topic' + t + '">Quiz me on Topic ' + t + '</a></footer>';
  let html;
  try { html = await getText('data/notes/topic' + t + '.html'); } catch (e) { if (e && e.code === 'locked') { API.go('#/pay?back=' + encodeURIComponent(location.hash), true); return; } $('#nb').innerHTML = '<div class="card"><p>These notes could not be loaded. Check your connection and try again.</p></div>'; return; }
  if (me.hash !== location.hash) return;
  const nb = $('#nb');
  nb.innerHTML = html;
  nb.querySelectorAll('figure.diagram svg').forEach(s => { s.removeAttribute('width'); s.removeAttribute('height'); s.setAttribute('role', s.getAttribute('role') || 'img'); });
  nb.addEventListener('click', e => {
    const z = e.target.closest('.illus .zoom'); if (z) { openZoom(z.querySelector('img')); return; }
    const b = e.target.closest('.nh'); if (!b) return;
    const sec = b.closest('.ns'); const closed = sec.classList.toggle('closed'); b.setAttribute('aria-expanded', !closed);
  });
  // pictures load lazily as you scroll; once the page is idle, fetch the rest so they are there offline too
  const pics = Array.from(nb.querySelectorAll('figure.illus img'), i => i.getAttribute('src'));
  if (pics.length && !(navigator.connection && navigator.connection.saveData)) setTimeout(() => idle(() => pics.forEach(u => fetch(u).catch(() => { }))), 4000);
  const toc = $('#toc');
  const secs = Array.from(nb.querySelectorAll('.ns'));
  function goSec(id) { const el = document.getElementById(id); if (!el) return; el.classList.remove('closed'); el.querySelector('.nh').setAttribute('aria-expanded', 'true'); const y = el.getBoundingClientRect().top + SC().scrollTop - tocH(); SC().scrollTo({ top: y, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  const tocH = () => (toc.parentNode.getBoundingClientRect().height || 56) + 8;
  toc.addEventListener('click', e => { const a = e.target.closest('a[data-sec]'); if (!a) return; e.preventDefault(); goSec(a.dataset.sec); });
  let active = null;
  function setActive(id) {
    if (id === active) return; active = id;
    toc.querySelectorAll('a').forEach(a => { const on = a.dataset.sec === id; a.classList.toggle('on', on); if (on) { a.setAttribute('aria-current', 'true'); const l = a.offsetLeft - 16; toc.scrollTo({ left: l, behavior: 'auto' }); } else a.removeAttribute('aria-current'); });
    const i = secs.findIndex(s => s.id === id), nx = secs[i + 1];
    const nn = $('#nNext'); nn.textContent = nx ? (/^\d+\.\d+/.test(n.toc[i + 1][1]) ? 'Next: ' + n.toc[i + 1][1].split(' ')[0] : 'Next section') : 'Back to top'; nn.dataset.to = nx ? nx.id : '';
  }
  $('#nNext').onclick = e => { const to = e.currentTarget.dataset.to; if (to) goSec(to); else SC().scrollTo(0, 0); };
  setActive(secs[0] && secs[0].id);
  let raf = 0, saveT = 0;
  const bar = $('#nBar'), pct = $('#nPct');
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const sc = SC(), H = sc.scrollHeight - sc.clientHeight;
      const p = Math.min(100, Math.round(H > 0 ? sc.scrollTop / H * 100 : 100));
      const top = tocH() + 10;
      let cur = secs[0];
      for (const s of secs) { if (s.offsetTop - top <= sc.scrollTop) cur = s; else break; }
      if (cur) setActive(cur.id);
      if (p > readPct(t)) {
        bar.style.width = p + '%'; pct.textContent = p + '% read';
        settings.read = settings.read || {}; settings.read[t] = p;
        clearTimeout(saveT); saveT = setTimeout(() => idle(saveSettings), 800);
      }
    });
  };
  const scEl = SC(); scEl.addEventListener('scroll', onScroll, { passive: true });
  me.unmount = () => { scEl.removeEventListener('scroll', onScroll); clearTimeout(saveT); saveSettings(); };
  $('#nFs').onclick = () => { settings.fs = settings.fs >= 1.25 ? 1 : (settings.fs || 1) >= 1.12 ? 1.25 : 1.12; nb.style.setProperty('--fs', settings.fs); saveSettings(); };
  $('#nPdf').onclick = () => pdfSheet(t);
  $('#nShare').onclick = () => import('./runner.js?v=gsscrfo-2fc7a97e47').then(m => m.shareLink(location.href.split('#')[0] + '#/study/topic' + t, 'Topic ' + t + ' notes: ' + n.title));
  if (r.q.h) requestAnimationFrame(() => { const el = document.getElementById(r.q.h); if (el) { const s = el.closest('.ns'); if (s) s.classList.remove('closed'); SC().scrollTo(0, el.getBoundingClientRect().top + SC().scrollTop - tocH()); } });
}
function openZoom(img) {
  const z = document.createElement('div');
  z.className = 'zm'; z.setAttribute('role', 'dialog'); z.setAttribute('aria-modal', 'true'); z.setAttribute('aria-label', img.alt);
  z.innerHTML = '<div class="zs"></div><span class="zh">Tap the picture to zoom</span><button type="button" class="zx" aria-label="Close">×</button>';
  const zs = z.firstChild, big = img.cloneNode(); big.removeAttribute('loading'); zs.appendChild(big);
  const close = () => { z.remove(); document.documentElement.classList.remove('zoomed'); document.removeEventListener('keydown', key); window.removeEventListener('hashchange', close); };
  const key = e => { if (e.key === 'Escape') close(); };
  z.addEventListener('click', e => {
    if (e.target === big) { const r = big.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height; z.classList.toggle('big'); zs.scrollTo(fx * big.offsetWidth - innerWidth / 2, big.offsetTop + fy * big.offsetHeight - innerHeight / 2); }
    else close();
  });
  document.addEventListener('keydown', key); window.addEventListener('hashchange', close);
  document.documentElement.classList.add('zoomed'); document.body.appendChild(z); z.querySelector('.zx').focus();
}
function shortSec(t) { const m = /^(\d+\.\d+)\s+(.*)$/.exec(t); if (m) return m[1] + ' ' + m[2].split(/[,:]| and /)[0]; return t.length > 28 ? t.split(/[,:(]/)[0].trim() : t; }

// ---------- playbooks ----------
const PB = {
  english: { file: 'english-playbook', title: 'English Playbook', sub: 'Comprehension and grammar · 20 marks in CBT-II', cls: 'tc-comp', secs: null },
  konkani: { file: 'konkani-playbook', title: 'Konkani notes', sub: 'CBT-I Konkani test · 10 marks, 4 to pass', cls: 'tc-kon', secs: null },
  'english-comp': { file: 'english-playbook', title: 'Reading a passage', sub: 'English playbook · comprehension part', cls: 'tc-comp', secs: ['comp', 'pattern', 'syllabus'] },
  'english-grammar': { file: 'english-playbook', title: 'Grammar rules', sub: 'English playbook · grammar part', cls: 'tc-gram', secs: ['grammar', 'older'] }
};
async function playbookScreen(name, r, me) {
  const pb = PB[name]; if (!pb) throw new Error('No playbook ' + name);
  const all = META.playbooks[pb.file];
  const secs = pb.secs ? all.filter(s => pb.secs.includes(s[0])).sort((a, b) => pb.secs.indexOf(a[0]) - pb.secs.indexOf(b[0])) : all;
  app.innerHTML = '<header class="nhd ' + pb.cls + '"><div class="nrow"><button type="button" class="ib glass" data-back aria-label="Back">' + ICON.back + '</button><span class="sp"></span><button type="button" class="ib glass wide-ib" id="hideA" aria-pressed="false">Hide answers</button></div>' +
    '<p class="nk">' + esc(pb.sub) + '</p><h1>' + esc(pb.title) + '</h1></header>' +
    '<nav class="toc" aria-label="Contents"><div class="tocs">' + secs.map(s => '<a href="#pb-' + s[0] + '" data-sec="pb-' + s[0] + '">' + esc(s[1].split(/[,:]/)[0]) + '</a>').join('') + (pb.secs ? '<a href="#/study/playbook/english" class="full">Full playbook</a>' : '') + '</div></nav>' +
    '<main class="pb" id="pb"><p class="sub pad">Loading…</p></main>' + navHtml('study');
  let html;
  try { html = await getText('data/playbooks/' + pb.file + '.html'); } catch (e) { if (e && e.code === 'locked') { API.go('#/pay?back=' + encodeURIComponent(location.hash), true); return; } $('#pb').innerHTML = '<div class="card"><p>The playbook could not be loaded.</p></div>'; return; }
  if (me.hash !== location.hash) return;
  const box = $('#pb');
  box.innerHTML = html;
  box.querySelectorAll('section[id]').forEach(s => { s.id = 'pb-' + s.id; });
  if (pb.secs) {
    const hero = box.querySelector('header.hero'); if (hero) hero.remove();
    const keep = pb.secs.map(id => box.querySelector('#pb-' + id)).filter(Boolean);
    box.querySelectorAll('section').forEach(s => { if (!keep.includes(s)) s.remove(); });
    keep.forEach(s => box.appendChild(s));
    const ft = box.querySelector('footer'); if (ft) ft.remove();
  }
  box.querySelectorAll('a[href^="#"]:not([href^="#/"])').forEach(a => { const id = a.getAttribute('href').slice(1); a.dataset.sec = 'pb-' + id; });
  const go = id => { const el = document.getElementById(id); if (el) SC().scrollTo({ top: el.getBoundingClientRect().top + SC().scrollTop - 70, behavior: 'smooth' }); };
  document.querySelector('.toc').addEventListener('click', e => { const a = e.target.closest('a[data-sec]'); if (a) { e.preventDefault(); go(a.dataset.sec); } });
  box.addEventListener('click', e => {
    const a = e.target.closest('a[data-sec]'); if (a) { e.preventDefault(); go(a.dataset.sec); return; }
    if (!box.classList.contains('hide-ans')) return;
    const t = e.target.closest('td.a, .ans'); if (t) t.classList.toggle('show');
  });
  const hb = $('#hideA');
  hb.onclick = () => { const on = box.classList.toggle('hide-ans'); hb.setAttribute('aria-pressed', on); hb.textContent = on ? 'Show answers' : 'Hide answers'; if (!on) box.querySelectorAll('.show').forEach(x => x.classList.remove('show')); };
}

// ---------- cheat sheets ----------
const CS = { grammar: { title: 'English grammar cheat sheet', sub: 'English Language & Comprehension · grammar', cls: 'tc-gram', drills: '#/drills/en' }, reasoning: { title: 'Reasoning cheat sheet', sub: 'Test of Reasoning · 10 marks', cls: 'tc-lr', drills: '#/drills/lr' }, numerical: { title: 'Numerical ability cheat sheet', sub: 'Test of Numerical Ability · 10 marks', cls: 'tc-num', drills: '#/drills/num' } };
async function cheatScreen(name, me) {
  const cs = CS[name]; if (!cs) throw new Error('No cheat sheet ' + name);
  const secs = (META.cheats && META.cheats[name]) || [];
  app.innerHTML = '<header class="nhd ' + cs.cls + '"><div class="nrow"><button type="button" class="ib glass" data-back aria-label="Back">' + ICON.back + '</button><span class="sp"></span></div>' +
    '<p class="nk">' + esc(cs.sub) + '</p><h1>' + esc(cs.title) + '</h1></header>' +
    '<nav class="toc" aria-label="Contents"><div class="tocs">' + secs.map(s => '<a href="#cs-' + s[0] + '" data-sec="cs-' + s[0] + '">' + esc(s[1].split(/[,:(]| and /)[0]) + '</a>').join('') + '</div></nav>' +
    '<main class="notes cheat" id="nb" style="--fs:' + (settings.fs || 1) + '"><p class="sub pad">Loading…</p></main>' + navHtml('study');
  let html;
  try { html = await getText('data/cheats/' + name + '.html'); } catch (e) { if (e && e.code === 'locked') { API.go('#/pay?back=' + encodeURIComponent(location.hash), true); return; } $('#nb').innerHTML = '<div class="card"><p>The cheat sheet could not be loaded.</p></div>'; return; }
  if (me.hash !== location.hash) return;
  const box = $('#nb');
  box.innerHTML = html + '<p><a class="wide pri" href="' + cs.drills + '">Practise with the drills</a></p>';
  box.querySelectorAll('h2[id]').forEach(h => { h.id = 'cs-' + h.id; });
  document.querySelector('.toc').addEventListener('click', e => { const a = e.target.closest('a[data-sec]'); if (!a) return; e.preventDefault(); const el = document.getElementById(a.dataset.sec); if (el) SC().scrollTo({ top: el.getBoundingClientRect().top + SC().scrollTop - 70, behavior: 'smooth' }); });
}

// ---------- past papers ----------
function papersScreen() {
  app.innerHTML = topbar('Past question papers', META.papers.length + ' papers · open on the commission\'s website') + '<main class="pad stack"><p class="sub">Papers marked <span class="chip s-core-c">forest</span> are closest to the RFO subject test.</p><div class="list">' +
    META.papers.map(p => '<a class="row" href="' + esc(p.url) + '" target="_blank" rel="noopener"><span class="num s-lr-b">QP</span><span class="rt"><span class="ttl">' + esc(p.post) + '</span><span class="sub">' + esc(p.date) + (p.match ? ' · <span class="chip s-core-c">forest</span>' : '') + '</span></span><span class="chev">' + ICON.ext + '</span></a>').join('') + '</div></main>' + navHtml('study');
  $$('.row .sub').forEach(s => { s.innerHTML = s.textContent.replace(' · forest', ' · <span class="chip s-core-c">forest</span>'); });
}

// ---------- search ----------
async function searchScreen(r, me) {
  const q0 = r.q.q || '';
  app.innerHTML = topbar('Search', 'Questions, notes and sets') + '<main class="pad stack"><form class="sbox" role="search" id="sf"><span aria-hidden="true">' + ICON.search + '</span><input type="search" name="q" id="sq" value="' + esc(q0) + '" placeholder="Ledum, PCOD, IMR, Goa statehood…" aria-label="Search" enterkeyhint="search" autocomplete="off"></form><div id="sr"><p class="sub">Type at least 3 letters.</p></div></main>' + navHtml('');
  const inp = $('#sq'), out = $('#sr');
  let data = null, t = 0;
  const run = async () => {
    const q = inp.value.trim().toLowerCase();
    if (q.length < 3) { out.innerHTML = '<p class="sub">Type at least 3 letters.</p>'; return; }
    if (!data) { out.innerHTML = '<p class="sub">Loading the search index…</p>'; data = await getSearch(); if (me.hash.split('?')[0] !== location.hash.split('?')[0]) return; }
    const words = q.split(/\s+/);
    const hit = s => { s = s.toLowerCase(); return words.every(w => s.includes(w)); };
    const sets = IDX.sets.filter(s => !s.hidden && hit(s.name + ' ' + (s.core || '') + ' ' + (s.short || ''))).slice(0, 8);
    const notes = data.n.filter(n => hit(n[3] + ' ' + n[4])).slice(0, 20);
    const qs = data.q.filter(x => hit(x[3] + ' ' + x[4])).slice(0, 40);
    out.innerHTML = (sets.length ? '<h2 class="label">Sets</h2><div class="list">' + sets.map(s => row('#/test/' + s.id, s.num || 'T', 's-ind-b', s.name, s.n + ' Q · ' + s.min + ' min' + (s.core ? ' · ' + s.core : ''))).join('') + '</div>' : '') +
      (notes.length ? '<h2 class="label">Notes</h2><div class="list">' + notes.map(n => row('#/study/topic' + n[1] + '?h=' + encodeURIComponent(n[2]), 'T' + n[1], 's-core-b', n[3], snippet(n[4], words[0]))).join('') + '</div>' : '') +
      (qs.length ? '<h2 class="label">Questions</h2><div class="rlist">' + qs.map(x => '<details class="rev sq"><summary><span class="chip s-' + x[6] + '-c">' + SEC[x[6]].name + '</span> ' + esc(x[3]) + '</summary><p class="good">Answer: ' + esc(x[4]) + '</p><p class="why">' + esc(x[5]) + '</p><p class="sub">' + esc((setInfo(x[1]) || { name: x[1] }).name) + ', Q' + x[2] + '</p></details>').join('') + '</div>' : '') +
      (!sets.length && !notes.length && !qs.length ? '<p class="empty">Nothing matches “' + esc(inp.value) + '”. Try a remedy, a disease or a term like IMR.</p>' : '');
  };
  inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { history.replaceState(history.state, '', '#/search?q=' + encodeURIComponent(inp.value)); me.hash = location.hash; run(); }, 180); };
  $('#sf').onsubmit = e => { e.preventDefault(); inp.blur(); run(); };
  if (q0) run(); else setTimeout(() => inp.focus(), 50);
}
function snippet(t, w) { const i = t.toLowerCase().indexOf(w); if (i < 0) return t.slice(0, 110); const s = Math.max(0, i - 40); return (s ? '…' : '') + t.slice(s, s + 120) + '…'; }
