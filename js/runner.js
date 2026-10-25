// Test runner, results and review (the same engine as GPSCavy):
// same saved-state shape and keys, same attempt records, same grading.
import {
  $, SC, esc, fmt, day, idle, getIndex, getKeys, getSet, setInfo, KEYS, H, findAttempt, addAttempt, removeAttempt, grade, tokens,
  loadState, stateKey, lsSet, lsDel, remaining, toast, hideToast, sheet, closeSheet, ICON, topbar, bar, lvlChip, srcTag, navHtml,
  SECS, SEC, LV, LVL, L5, TOPIC_NAMES, customs, saveCustom, findDef, NOTE_TOPICS, hasNotes, saveBtn, addCleared, delCleared, EXAM_INFO
} from './core.js?v=gsscrfo-2fc7a97e47';

const app = $('#app');
let API = null;

export async function route(r, me, api) {
  API = api;
  const [a, id] = r.path;
  await getIndex();
  if (a === 'test') return testRoute(decodeURIComponent(id || ''), r, me);
  await getKeys();
  const at = findAttempt(decodeURIComponent(id || ''));
  if (!at) { app.innerHTML = topbar('Attempt not found', '') + '<main class="pad"><div class="card"><p>This attempt is not on this device. Upload a progress file that has it, or open it on the device where you took the test.</p><a class="btn pri" href="#/tests/mine">My tests</a></div></main>' + navHtml('tests'); return; }
  if (a === 'result') return resultScreen(at, me);
  if (a === 'review') return reviewScreen(at, r, me);
}

function topicLabel(q) { return q.topic ? 'Topic ' + q.topic + ' · ' + (TOPIC_NAMES[q.topic] || '') : SEC[q.sec].name; }
function secTag(q) { return '<span class="chip s-' + q.sec + '-c">' + esc(q.sec === 'core' ? topicLabel(q) : SEC[q.sec].name) + '</span>'; }
function lvTag(q) { return q.lvl ? lvlChip(q.lvl) : ''; }
// GSSC questions have four options (GPSC's CBRT added a fifth, 'None of the above')
const optsOf = q => q.opts;

// ---------- intro / start ----------
async function testRoute(id, r, me) {
  let set;
  try { set = await getSet(id); } catch (e) { throw new Error('No test called ' + id + '.'); }
  const st = loadState(id);
  if (st && st.phase === 'exam') return runner(set, st, me);
  const def = findDef(id);
  if (r.q.go && def) return runner(set, fresh(set, def.mode || 'exam'), me);
  intro(set, r, me);
}
function fresh(set, mode) {
  const now = Date.now();
  const st = { set: set.id, phase: 'exam', cur: 0, answers: {}, flags: {}, seen: {}, startedAt: now, endAt: now + set.minutes * 60000, usedMs: 0, filter: 'all', mode, savedAt: now };
  if (mode === 'learn') { st.spentMs = 0; st.runFrom = now; }
  const def = findDef(set.id); if (def) st.def = def;
  return st;
}
function intro(set, r, me) {
  const info = setInfo(set.id) || {};
  const isQuiz = !!set.quiz, def = findDef(set.id);
  let mode = r.q.mode || (isQuiz ? 'learn' : def ? def.mode : 'exam');
  const atts = H.filter(a => a.set === set.id);
  const best = atts.reduce((m, a) => Math.max(m, a.score), -1);
  const secs = set.sections.map(s => '<span class="chip s-' + s.id + '-c">' + esc(SEC[s.id] ? SEC[s.id].name : s.short) + ' ' + set.questions.filter(q => q.sec === s.id).length + '</span>').join('');
  const level = info.level || set.lvlset;
  const mix = info.mix ? ['E', 'I', 'H'].filter(k => info.mix[k]).map(k => info.mix[k] + ' ' + LV[k].toLowerCase()).join(' · ') : '';
  const draw = () => {
    app.innerHTML = topbar(set.set, (set.short && set.short !== set.set ? set.short : '') || (set.core && !set.drill ? 'Core: ' + set.core : '')) +
      '<main class="pad stack"><section class="card intro"><h2 class="it">' + esc(displayName(set)) + '</h2>' +
      '<p class="sub">' + set.questions.length + ' questions · ' + set.minutes + ' minutes · 1 mark each, no negative marking</p>' +
      '<div class="chips">' + (level ? lvlChip(level) : '') + secs + '</div>' + (mix ? '<p class="sub">Mix: ' + mix + '</p>' : '') +
      (atts.length ? '<p class="sub">' + atts.length + (atts.length === 1 ? ' attempt' : ' attempts') + ' · best ' + best + '/' + set.questions.length + ' · <a class="lnk" href="#/result/' + encodeURIComponent(atts[0].id) + '">last result</a></p>' : '') +
      '</section><h2 class="label">Mode</h2><div class="seg mode" role="group" aria-label="Mode">' +
      '<button type="button" data-m="exam" class="' + (mode === 'exam' ? 'on' : '') + '" aria-pressed="' + (mode === 'exam') + '"><b>Exam mode</b><small>Timer runs, answers at the end</small></button>' +
      '<button type="button" data-m="learn" class="' + (mode === 'learn' ? 'on' : '') + '" aria-pressed="' + (mode === 'learn') + '"><b>Learn mode</b><small>Answer and explanation after each</small></button></div>' +
      '<button type="button" class="wide pri" id="go" data-focus>Start ' + (mode === 'exam' ? 'in exam mode' : 'in learn mode') + '</button>' +
      '<button type="button" class="wide sec" id="shr">' + ICON.share + ' Share this test</button>' +
      '</main>' + navHtml(set.quiz ? 'study' : 'tests');
    app.querySelector('.mode').onclick = e => { const b = e.target.closest('[data-m]'); if (b) { mode = b.dataset.m; draw(); } };
    $('#go').onclick = () => runner(set, fresh(set, mode), me);
    $('#shr').onclick = () => shareLink(location.href.split('#')[0] + '#/test/' + set.id, displayName(set));
  };
  draw();
}
export function shareLink(url, title) {
  if (navigator.share) navigator.share({ title: 'GSSC RFO · ' + title, text: title + ' on GSSC RFO', url }).catch(() => { });
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Link copied'), () => toast(url));
  else toast(url);
}
function displayName(set) {
  const id = set.id;
  if (id === 'end1' || id === 'end2') return 'Grammar drill ' + id.slice(3) + ': ' + set.short;
  if (id === 'end3' || id === 'end4') return 'Comprehension drill ' + (+id.slice(3) - 2) + ': ' + set.short.replace('Comprehension: ', '');
  return set.set;
}

// ---------- runner ----------
function runner(set, S, me) {
  const QS = set.questions, N = QS.length, exam = S.mode !== 'learn';
  if (S.paused) { // resume a paused test: the clock restarts from the saved remaining time
    S.paused = false;
    if (exam) S.endAt = Date.now() + Math.max(0, S.remainMs || 0); else S.runFrom = Date.now();
  }
  if (!exam && !S.runFrom) { S.runFrom = Date.now(); S.spentMs = S.spentMs || 0; }
  S.cur = Math.max(0, Math.min(N - 1, S.cur || 0));
  S.answers = S.answers || {}; S.flags = S.flags || {}; S.seen = S.seen || {};
  let tick = 0, saveT = 0, allowLeave = false, done = false;
  const passOpen = {};

  const spent = () => exam ? set.minutes * 60000 - (S.endAt - Date.now()) : S.spentMs + (Date.now() - S.runFrom);
  function save(now) {
    clearTimeout(saveT);
    const w = () => { if (done) return; S.savedAt = Date.now(); lsSet(stateKey(S.set), S); };
    if (now) w(); else saveT = setTimeout(() => idle(w, 300), 300);
  }
  function pause() {
    if (exam) S.remainMs = Math.max(0, S.endAt - Date.now()); else { S.spentMs = spent(); }
    S.paused = true; save(true);
  }

  // ----- layout, built once -----
  const answered = () => Object.keys(S.answers).length;
  app.innerHTML =
    '<header class="rh"><button type="button" class="ib dk" id="rBack" aria-label="Leave test">' + ICON.back + '</button>' +
    '<div class="rt"><p class="rn">' + esc(displayName(set)) + (exam ? '' : ' · Learn') + '</p><p class="rc"><span id="clk">' + (exam ? fmt(S.endAt - Date.now()) : fmt(spent())) + '</span> ' + (exam ? 'left' : 'spent') + '</p></div>' +
    '<button type="button" class="pbtn" id="rPal" aria-label="All questions">' + ICON.grid + '<span id="rCnt">' + answered() + '/' + N + '</span></button>' +
    '<button type="button" class="sbtn" id="rSub">Submit</button><div class="rbar"><i id="rBar"></i></div></header>' +
    '<main class="rq" id="rq"></main>' +
    '<footer class="rf"><button type="button" class="btn sec" id="rPrev">Previous</button><button type="button" class="btn ghost" id="rClr">Clear</button><button type="button" class="btn pri" id="rNext">Save &amp; next</button></footer>' +
    '<div class="shade pal" id="palS" hidden><div class="sheet" role="dialog" aria-modal="true" aria-label="All questions"><div class="shh"><h2>All questions</h2><button type="button" class="ib" data-pclose aria-label="Close">' + ICON.close + '</button></div>' +
    '<div class="legend" id="leg"></div><div class="pgrid" id="pg"></div><button type="button" class="wide amb" id="pSub">Submit test</button></div></div>';
  document.body.dataset.screen = 'runner';
  const rq = $('#rq'), clk = $('#clk'), rBar = $('#rBar'), rCnt = $('#rCnt');

  // palette: built once, cells updated in place
  const pg = $('#pg');
  pg.innerHTML = set.sections.map(sec => {
    const qs = QS.filter(q => q.sec === sec.id); if (!qs.length) return '';
    return '<div class="pgs s-' + sec.id + '"><p class="pgh"><i></i>' + esc(SEC[sec.id] ? SEC[sec.id].name : sec.short) + ' · ' + qs[0].n + '–' + qs[qs.length - 1].n + '</p><div class="pcells">' +
      qs.map(q => '<button type="button" class="pc" data-n="' + q.n + '">' + q.n + '</button>').join('') + '</div></div>';
  }).join('');
  const cells = {}; pg.querySelectorAll('.pc').forEach(b => (cells[b.dataset.n] = b));
  function cellState(q) {
    const n = q.n, a = S.answers[n];
    if (!exam && a) return a === q.ans ? 'ok' : 'bad';
    if (S.flags[n]) return 'flag';
    if (a) return 'ans';
    if (S.seen[n]) return 'skip';
    return 'new';
  }
  function updCell(q) {
    const c = cells[q.n]; if (!c) return;
    const st = cellState(q);
    c.className = 'pc ' + st + (QS[S.cur].n === q.n ? ' cur' : '');
    c.setAttribute('aria-label', 'Question ' + q.n + ', ' + { ok: 'right', bad: 'wrong', flag: 'marked for review' + (S.answers[q.n] ? ', answered' : ''), ans: 'answered', skip: 'not answered', new: 'not seen' }[st]);
  }
  function legend() {
    const c = { ans: 0, flag: 0, skip: 0, new: 0, ok: 0, bad: 0 };
    QS.forEach(q => c[cellState(q)]++);
    $('#leg').innerHTML = (exam ? [['ans', 'Answered ' + c.ans], ['flag', 'Marked ' + c.flag], ['skip', 'Skipped ' + c.skip], ['new', 'Not seen ' + c.new]]
      : [['ok', 'Right ' + c.ok], ['bad', 'Wrong ' + c.bad], ['new', 'Left ' + (c.new + c.skip + c.flag)]]).map(x => '<span><i class="sw ' + x[0] + '"></i>' + x[1] + '</span>').join('');
  }
  QS.forEach(updCell);

  function counts() {
    const d = answered();
    rCnt.textContent = d + '/' + N;
    rBar.style.transform = 'scaleX(' + (d / N) + ')';
  }

  // ----- question view: only the current question is in the DOM -----
  function show() {
    const q = QS[S.cur], n = q.n, a = S.answers[n], locked = !exam && !!a;
    const prevCur = rq.dataset.n;
    S.seen[n] = 1;
    let h = '<div class="qh"><span class="qn">Question ' + n + ' of ' + N + '</span>' + lvTag(q) + secTag(q) + srcTag(q) + '</div>';
    if (q.passage && set.passages[q.passage]) {
      const p = set.passages[q.passage];
      const ns = QS.filter(x => x.passage === q.passage).map(x => x.n);
      const open = passOpen[q.passage] !== false;
      h += '<details class="passage"' + (open ? ' open' : '') + ' data-p="' + esc(q.passage) + '"><summary>' + esc(p.title) + ' · questions ' + Math.min(...ns) + '–' + Math.max(...ns) + '</summary><div>' + p.paras.map(t => '<p>' + esc(t) + '</p>').join('') + '</div></details>';
    }
    h += '<div class="qcol"><p class="qt" id="qt">' + esc(q.q) + '</p><div class="opts" role="group" aria-labelledby="qt">';
    optsOf(q).forEach((t, i) => {
      const L = L5[i];
      let cls = a === L ? ' sel' : '';
      if (locked) { if (L === q.ans) cls = ' right'; else if (a === L) cls = ' wrong'; }
      h += '<button type="button" class="opt' + cls + (i === 4 ? ' nota' : '') + '" data-o="' + L + '" aria-pressed="' + (a === L) + '"' + (locked ? ' aria-disabled="true"' : '') + '><span class="key">' + L + '</span><span class="ot">' + esc(t) + '</span></button>';
    });
    h += '</div>';
    if (locked) h += '<div class="fb ' + (a === q.ans ? 'ok' : 'no') + '"><b>' + (a === q.ans ? 'Correct' : 'Not quite · answer ' + q.ans) + '</b><span>' + esc(q.why) + '</span></div>';
    if (exam) h += '<button type="button" class="mark' + (S.flags[n] ? ' on' : '') + '" id="rFlag" aria-pressed="' + !!S.flags[n] + '">' + ICON.flag + (S.flags[n] ? 'Marked for review' : 'Mark for review') + '</button>';
    h += '</div>';
    rq.classList.toggle('split', !!(q.passage && set.passages[q.passage]));
    rq.innerHTML = h; rq.dataset.n = n;
    $('#rPrev').disabled = S.cur === 0;
    $('#rClr').disabled = !a || locked;
    $('#rNext').textContent = S.cur === N - 1 ? 'Finish' : exam ? 'Save & next' : 'Next';
    if (prevCur) { const pq = QS.find(x => String(x.n) === prevCur); if (pq) updCell(pq); }
    updCell(q); counts(); save();
  }
  function goQ(i) { S.cur = Math.max(0, Math.min(N - 1, i)); show(); SC().scrollTo(0, 0); }

  rq.addEventListener('click', e => {
    const o = e.target.closest('.opt');
    if (o) {
      const q = QS[S.cur];
      if (!exam && S.answers[q.n]) return;
      S.answers[q.n] = o.dataset.o;
      if (exam) { // update in place: no re-render of the question
        rq.querySelectorAll('.opt').forEach(b => { const on = b === o; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); });
        $('#rClr').disabled = false; updCell(q); counts(); save();
      } else show();
      return;
    }
    if (e.target.closest('#rFlag')) {
      const q = QS[S.cur];
      if (S.flags[q.n]) delete S.flags[q.n]; else S.flags[q.n] = 1;
      const f = $('#rFlag'); f.classList.toggle('on', !!S.flags[q.n]); f.setAttribute('aria-pressed', !!S.flags[q.n]);
      f.innerHTML = ICON.flag + (S.flags[q.n] ? 'Marked for review' : 'Mark for review');
      updCell(q); save();
    }
  });
  rq.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.p) passOpen[d.dataset.p] = d.open; }, true);
  $('#rPrev').onclick = () => goQ(S.cur - 1);
  $('#rNext').onclick = () => { if (S.cur === N - 1) askSubmit(); else goQ(S.cur + 1); };
  $('#rClr').onclick = () => { const q = QS[S.cur]; delete S.answers[q.n]; show(); };
  $('#rSub').onclick = askSubmit;
  $('#pSub').onclick = () => { palClose(); askSubmit(); };
  $('#rBack').onclick = askLeave;
  const palS = $('#palS');
  function palOpen() { legend(); palS.hidden = false; document.body.classList.add('noscroll'); requestAnimationFrame(() => palS.classList.add('on')); const c = cells[QS[S.cur].n]; if (c) { c.focus({ preventScroll: true }); c.scrollIntoView({ block: 'center' }); } }
  function palClose() { palS.classList.remove('on'); palS.hidden = true; document.body.classList.remove('noscroll'); }
  $('#rPal').onclick = palOpen;
  palS.addEventListener('click', e => {
    if (e.target === palS || e.target.closest('[data-pclose]')) return palClose();
    const c = e.target.closest('.pc'); if (c) { palClose(); goQ(QS.findIndex(q => q.n === +c.dataset.n)); }
  });

  // ----- timer: one text node, computed from Date.now() -----
  function paint() {
    if (done) return;
    if (exam) {
      const left = S.endAt - Date.now();
      clk.textContent = fmt(left);
      clk.parentNode.classList.toggle('low', left < 5 * 60000);
      if (left <= 0) finish(true);
    } else clk.textContent = fmt(spent());
  }
  tick = setInterval(paint, 1000);
  const vis = () => { if (document.visibilityState === 'hidden') save(true); else paint(); };
  const hide = () => save(true);
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('pagehide', hide);
  const key = e => {
    if (e.target.closest && e.target.closest('input,textarea') || document.querySelector('#sheet') || !palS.hidden) return;
    const k = e.key.toUpperCase();
    if (L5.includes(k) || '12345'.includes(k) && k.length === 1) { const L = L5['12345'.indexOf(k)] || k; const b = rq.querySelector('[data-o="' + L + '"]'); if (b) b.click(); }
    else if (e.key === 'ArrowRight') $('#rNext').click(); else if (e.key === 'ArrowLeft' && S.cur > 0) goQ(S.cur - 1);
  };
  document.addEventListener('keydown', key);

  function askLeave() {
    if (!palS.hidden) { palClose(); return; }
    const d = answered();
    const el = sheet('<div class="shh"><h2>Leave test?</h2></div><p>Your answers are saved' + (exam ? ' (' + d + ' of ' + N + ') and the timer pauses at ' + fmt(S.endAt - Date.now()) + '.' : '.') + ' Resume any time from Home or Tests.</p>' +
      '<button type="button" class="wide pri" id="lStay" data-focus>Keep going</button><button type="button" class="wide sec" id="lGo">Save and leave</button>' +
      '<button type="button" class="wide rst" id="lReset">' + ICON.close + ' Reset and exit</button><p class="sub">Started by mistake? Reset clears this attempt so it does not count.</p>', { label: 'Leave test' });
    el.querySelector('#lStay').onclick = () => closeSheet();
    el.querySelector('#lGo').onclick = () => { closeSheet(true); pause(); allowLeave = true; API.back(); };
    el.querySelector('#lReset').onclick = askReset;
  }
  function askReset() {
    const d = answered();
    const el = sheet('<div class="shh"><h2>Reset and exit?</h2></div><p>' + (d ? 'Your ' + d + (d === 1 ? ' answer' : ' answers') + ' in this attempt will be cleared' : 'This attempt will be cleared') +
      ' and it will not count in your progress. Your earlier attempts and results stay as they are.</p>' +
      '<button type="button" class="wide pri" id="rKeep" data-focus>Keep going</button><button type="button" class="wide rst" id="rDo">Reset and exit</button>', { label: 'Reset and exit' });
    el.querySelector('#rKeep').onclick = () => closeSheet();
    el.querySelector('#rDo').onclick = () => {
      const snap = JSON.parse(JSON.stringify(S));
      snap.paused = true;
      if (exam) snap.remainMs = Math.max(0, S.endAt - Date.now()); else snap.spentMs = spent();
      done = true; clearInterval(tick); clearTimeout(saveT); palClose(); closeSheet(true);
      lsDel(stateKey(S.set));
      addCleared(['prog:' + S.set + ':' + S.startedAt]); // so a sync does not bring it back
      window.dispatchEvent(new Event('gpsc-saved'));
      allowLeave = true;
      let shown = false;
      const tell = () => { if (shown) return; shown = true; window.removeEventListener('hashchange', later);
        toast('Test reset. This attempt was not saved.', { label: 'Undo', fn: () => { delCleared(['prog:' + snap.set + ':' + snap.startedAt]); lsSet(stateKey(snap.set), snap); API.go('#/test/' + snap.set, true); toast('Back in the test, at question ' + (snap.cur + 1)); } }, 10000); };
      const later = () => setTimeout(tell, 60);
      window.addEventListener('hashchange', later);
      setTimeout(tell, 700);
      API.back();
    };
  }
  function askSubmit() {
    const d = answered(), left = N - d, fl = Object.keys(S.flags).length;
    const first = QS.findIndex(q => !S.answers[q.n]);
    const el = sheet('<div class="shh"><h2>Submit test?</h2><button type="button" class="ib" data-close aria-label="Close">' + ICON.close + '</button></div>' +
      '<div class="three"><div class="t-grn"><b>' + d + '</b><span>answered</span></div><div class="t-org"><b>' + left + '</b><span>unanswered</span></div><div class="t-vio"><b>' + fl + '</b><span>flagged</span></div></div>' +
      '<p>' + (left ? left + (left === 1 ? ' question is' : ' questions are') + ' unanswered. There is no negative marking, so an answer is always worth a try.' : 'All questions answered.') + (fl ? ' ' + fl + (fl === 1 ? ' question is' : ' questions are') + ' marked to recheck.' : '') + '</p>' +
      (left ? '<button type="button" class="wide org" id="sFirst">Go to first unanswered (Q' + QS[first].n + ')</button>' : '') +
      '<button type="button" class="wide sec" id="sKeep" data-focus>Keep working</button><button type="button" class="wide amb" id="sGo">Submit now</button>', { label: 'Submit test' });
    el.querySelector('#sKeep').onclick = () => closeSheet();
    el.querySelector('#sGo').onclick = () => { closeSheet(true); finish(false); };
    const f = el.querySelector('#sFirst'); if (f) f.onclick = () => { closeSheet(true); goQ(first); };
  }
  async function finish(auto) {
    if (done) return;
    done = true; clearInterval(tick); palClose(); closeSheet(true);
    await getKeys();
    const total = set.minutes * 60000;
    const usedMs = exam ? Math.min(total, Math.max(0, total - (S.endAt - Date.now()))) : spent();
    const snapshot = JSON.parse(JSON.stringify(S));
    snapshot.remainAtSubmit = exam ? Math.max(0, S.endAt - Date.now()) : 0;
    if (!exam) snapshot.spentMs = spent();
    const g = grade(set.id, S.answers) || localGrade(set, S.answers);
    const att = { id: set.id + '-' + S.startedAt, set: set.id, setName: set.set, score: g.score, total: N, wrong: g.wrong, skipped: g.skipped, usedMs, auto: !!auto,
      submittedAt: new Date().toISOString(), answers: Object.assign({}, S.answers) };
    if (Object.keys(S.flags).length) att.flags = Object.assign({}, S.flags);
    if (!exam) att.mode = 'learn';
    if (set.custom) att.def = findDef(set.id);
    addAttempt(att);
    lsDel(stateKey(S.set));
    window.dispatchEvent(new Event('gpsc-saved'));
    allowLeave = true;
    API.go('#/result/' + encodeURIComponent(att.id), true);
    if (auto) toast('Time is up. Your test was submitted.', null, 4000);
    else toast('Test submitted', { label: 'Undo', fn: () => undo(att.id, snapshot) }, 10000);
  }
  function undo(id, snap) {
    removeAttempt(id);
    const st = snap, rem = st.remainAtSubmit || 0;
    delete st.remainAtSubmit;
    st.paused = true;
    if (exam) st.remainMs = Math.max(0, rem);
    lsSet(stateKey(st.set), st);
    API.go('#/test/' + st.set, true);
    toast('Back in the test, at question ' + (st.cur + 1));
  }

  me.onPop = () => { if (allowLeave || done) return false; askLeave(); return true; };
  me.onBack = () => { if (allowLeave || done) return false; askLeave(); return true; };
  me.unmount = () => {
    clearInterval(tick); clearTimeout(saveT);
    if (!done) { if (!S.paused && allowLeave) pause(); else { S.savedAt = Date.now(); lsSet(stateKey(S.set), S); } }
    document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', hide); document.removeEventListener('keydown', key);
    document.body.classList.remove('noscroll');
  };
  show(); save(true); paint();
  if (exam && S.endAt - Date.now() <= 0) finish(true);
}
function localGrade(set, answers) {
  const g = { score: 0, wrong: 0, skipped: 0 };
  set.questions.forEach(q => { const a = answers[q.n]; if (!a) g.skipped++; else if (a === q.ans) g.score++; else g.wrong++; });
  return g;
}

// ---------- results ----------
function resultScreen(at, me) {
  const g = grade(at.set, at.answers);
  const info = setInfo(at.set);
  const pct = Math.round(g.score / g.total * 100);
  const full = g.total === EXAM_INFO.marks && Object.keys(g.bySec).length >= 4;
  const head = pct >= 70 ? 'Well done' : pct >= 50 ? 'Good effort' : 'Keep practising';
  const sec = SECS.filter(s => g.bySec[s]).map(s => { const b = g.bySec[s]; return '<div class="arow"><span>' + SEC[s].name + '</span>' + bar(b.c / b.n * 100, 's-' + s) + '<b>' + b.c + '/' + b.n + '</b><small>' + b.c + ' right · ' + b.w + ' wrong · ' + b.s + ' skipped</small></div>'; }).join('');
  const lvN = ['E', 'I', 'H'].reduce((m, k) => m + (g.byLvl[k] ? g.byLvl[k].n : 0), 0);
  const lv = ['E', 'I', 'H'].filter(k => g.byLvl[k]).map(k => { const b = g.byLvl[k]; return '<div class="arow"><span>' + lvlChip(k) + '</span>' + bar(b.c / b.n * 100, 'l-' + k) + '<b>' + b.c + '/' + b.n + '</b><small>' + b.c + ' right · ' + b.w + ' wrong · ' + b.s + ' skipped</small></div>'; }).join('') +
    (lvN && lvN < g.total ? '<div class="arow"><span class="chip">Not tagged</span>' + bar(0) + '<b>' + (g.total - lvN) + '</b><small>questions without a difficulty tag</small></div>' : '');
  // GSSC pass marks for the CBT (Advt 2/2026): unreserved 45%, OBC 40%, SC/ST 35%
  const bands = [['Unreserved, EWS', 45, 'UR'], ['OBC', 40, 'OBC'], ['SC, ST', 35, 'SC/ST']];
  const need = b => Math.ceil(g.total * b[1] / 100);
  const met = bands.filter(b => g.score >= need(b)).reverse();
  const verdict = met.length === bands.length ? ['pill-done', 'Above the pass mark for every category']
    : met.length ? ['pill-skip', 'Above ' + met.map(b => b[2]).join(' and ') + ' · ' + (need(bands[0]) - g.score) + ' short of UR']
    : ['pill-bad', (need(bands[2]) - g.score) + ' short of the lowest pass mark'];
  const pass = full ? '<div class="pass"><div class="pbar" role="img" aria-label="' + pct + '% against GSSC pass marks of 35, 40 and 45%"><i style="width:' + pct + '%"></i>' +
    bands.map(b => '<span style="left:' + b[1] + '%"></span>').join('') + '</div>' +
    '<p class="sub">Pass marks: ' + bands.slice().reverse().map(b => b[2] + ' ' + b[1] + '% (' + need(b) + ')').join(' · ') + '</p>' +
    '<span class="pill ' + verdict[0] + '">' + verdict[1] + '</span></div>' : '';
  const wrongN = g.rows.filter(r => r.st === 'bad').length;
  const parent = API.testParent(at.set);
  app.innerHTML = topbar(at.setName, day(at.submittedAt) + (at.mode === 'learn' ? ' · learn mode' : '')) +
    '<main class="pad stack">' +
    '<section class="card score"><div class="ring" style="--p:' + pct + '"><div><b>' + g.score + '</b><small>of ' + g.total + '</small></div></div><div class="rt"><h2>' + head + '</h2>' +
    '<p>' + pct + '% · ' + g.score + ' right · ' + g.wrong + ' wrong · ' + g.skipped + ' skipped</p><p class="sub">' + fmt(at.usedMs) + ' used' + (info && info.min ? ' of ' + info.min + ':00' : '') + (at.auto ? ' · time ran out' : '') + ' · no negative marking</p></div>' + pass + '</section>' +
    '<div class="two"><a class="btn pri" href="#/review/' + encodeURIComponent(at.id) + (wrongN ? '?f=bad' : '') + '">Review answers</a><button type="button" class="btn amb" id="rw"' + (wrongN ? '' : ' disabled') + '>Retake wrong only' + (wrongN ? ' (' + wrongN + ')' : '') + '</button></div>' +
    '<section class="card"><h2 class="label">By section</h2><div class="acc">' + sec + '</div></section>' +
    (lv ? '<section class="card"><h2 class="label">By level</h2><div class="acc">' + lv + '</div></section>' : '') +
    '<div class="two"><a class="btn sec" href="' + parent + '">Back to tests</a><a class="btn sec" href="#/">Home</a></div>' +
    '<a class="wide ghost" href="#/test/' + esc(at.set) + '">Take this test again</a>' +
    '</main>' + navHtml('tests');
  const rw = $('#rw');
  if (rw) rw.onclick = () => {
    const rows = g.rows.filter(r => r.st === 'bad');
    const id = 'custom-' + Date.now().toString(36);
    const def = { id, name: 'Wrong answers · ' + at.setName.replace('Practice ', ''), minutes: Math.max(3, Math.round(rows.length * 1.25)), mode: 'exam', refs: rows.map(r => [r.ref, r.sec]), saved: false, createdAt: Date.now() };
    saveCustom(def);
    API.go('#/test/' + id + '?go=1');
  };
}

// ---------- review ----------
async function reviewScreen(at, r, me) {
  app.innerHTML = topbar('Review', at.setName) + '<main class="pad"><p class="sub">Loading…</p></main>' + navHtml('tests');
  let set;
  try { set = await getSet(at.set); } catch (e) { app.querySelector('main').innerHTML = '<div class="card"><p>The questions for this attempt are not available.</p></div>'; return; }
  const g = grade(at.set, at.answers) || { rows: set.questions.map(q => ({ n: q.n, a: at.answers[q.n], st: !at.answers[q.n] ? 'skip' : at.answers[q.n] === q.ans ? 'ok' : 'bad' })) };
  const flags = at.flags || {};
  const refOf = {}; g.rows.forEach(x => (refOf[x.n] = x.ref || (set.refs && set.refs[x.n - 1]) || at.set + ':' + x.n));
  const f = r.q.f || 'all', sf = r.q.s || 'all';
  const st = {}; g.rows.forEach(x => (st[x.n] = x.st));
  const match = q => (f === 'all' || (f === 'flag' ? flags[q.n] : st[q.n] === f)) && (sf === 'all' || q.sec === sf);
  const cnt = k => set.questions.filter(q => (k === 'all' || (k === 'flag' ? flags[q.n] : st[q.n] === k)) && (sf === 'all' || q.sec === sf)).length;
  const base = '#/review/' + encodeURIComponent(at.id);
  const link = (ff, ss) => base + '?f=' + ff + (ss !== 'all' ? '&s=' + ss : '');
  const fchips = [['all', 'All'], ['bad', 'Wrong'], ['skip', 'Skipped'], ['flag', 'Flagged'], ['ok', 'Right']].map(c => '<a class="fchip' + (f === c[0] ? ' on' : '') + '" href="' + link(c[0], sf) + '" data-replace="1" aria-pressed="' + (f === c[0]) + '">' + c[1] + ' ' + cnt(c[0]) + '</a>').join('');
  const secsIn = SECS.filter(s => set.questions.some(q => q.sec === s));
  const schips = secsIn.length > 1 ? '<div class="chips">' + [['all', 'All sections']].concat(secsIn.map(s => [s, SEC[s].name])).map(c => '<a class="schip2' + (c[0] !== 'all' ? ' s-' + c[0] + '-c' : '') + (sf === c[0] ? ' on' : '') + '" href="' + link(f, c[0]) + '" data-replace="1" aria-pressed="' + (sf === c[0]) + '">' + c[1] + '</a>').join('') + '</div>' : '';
  let lastP = null;
  const items = set.questions.filter(match).map(q => {
    const a = at.answers[q.n], s = st[q.n];
    let pass = '';
    if (q.passage && q.passage !== lastP && set.passages[q.passage]) { const p = set.passages[q.passage]; pass = '<details class="passage"><summary>Show ' + esc(p.title.toLowerCase()) + '</summary><div>' + p.paras.map(t => '<p>' + esc(t) + '</p>').join('') + '</div></details>'; }
    lastP = q.passage || null;
    return '<article class="rev"><div class="qh"><b>Q' + q.n + '</b><span class="pill ' + (s === 'ok' ? 'pill-done">Right' : s === 'bad' ? 'pill-bad">Wrong' : 'pill-skip">Skipped') + '</span>' + (flags[q.n] ? '<span class="pill pill-flag">Flagged</span>' : '') + lvTag(q) + secTag(q) + srcTag(q) + saveBtn(q.ref || refOf[q.n] || at.set + ':' + q.n, q.sec) + '</div>' + pass +
      '<p class="qt">' + esc(q.q) + '</p><ol class="ro">' + optsOf(q).map((t, i) => { const L = L5[i]; const c = L === q.ans ? 'right' : L === a ? 'mine' : ''; if (i === 4 && L !== q.ans && L !== a) return ''; return '<li class="' + c + '"><span class="key">' + L + '</span><span>' + esc(t) + '</span><em>' + (L === q.ans ? (L === a ? 'Correct, your answer' : 'Correct answer') : L === a ? 'Your answer' : '') + '</em></li>'; }).join('') + '</ol>' +
      '<p class="why"><b>Why ' + q.ans + ':</b> ' + esc(q.why) + '</p>' + (hasNotes(q.topic) ? '<a class="lnk" href="#/study/topic' + q.topic + '">Read Topic ' + q.topic + ' notes</a>' : '') + '</article>';
  }).join('');
  app.innerHTML = topbar('Review', at.setName + ' · ' + at.score + '/' + at.total) + '<main class="pad stack"><div class="chips" role="group" aria-label="Filter answers">' + fchips + '</div>' + schips +
    '<div class="rlist">' + (items || '<p class="empty">Nothing in this group.</p>') + '</div><a class="wide sec" href="#/result/' + encodeURIComponent(at.id) + '">Back to result</a></main>' + navHtml('tests');
}
