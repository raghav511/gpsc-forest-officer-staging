// Paid access. The owner's script (tools/licence/Code.gs, in the owner's Google Sheet) is the only judge of who has
// paid, which plans exist and what is free; the app keeps the last answer so it also works offline.
// Off (everything free, no pay screen) until LICENCE_URL and Google sign-in are both set up.
import { $, esc, day, lsGet, lsSet, lsDel, toast, sheet, closeSheet, ICON, topbar, navHtml, IDX, META, getIndex, getMeta } from './core.js?v=gsscrfo-2fc7a97e47';
import { LICENCE_URL } from './config.js?v=gsscrfo-2fc7a97e47';
import * as G from './account.js?v=gsscrfo-2fc7a97e47';
import { forgetKeys } from './vault.js?v=gsscrfo-2fc7a97e47';

const LKEY = 'gsscrfo-licence';
export const enabled = () => !!LICENCE_URL && G.configured() && !window.__gpscTest; // the test suites check screens, not payment
export const lic = () => lsGet(LKEY, null);
const forMe = l => l && G.account() && l.email === (G.account().email || '').toLowerCase();
export function hasPaid() {
  if (!enabled()) return true;
  const l = lic(); if (!forMe(l)) return false;
  if (l.owner) return true;
  return l.status === 'paid' && (!l.expires || Date.parse(l.expires) > Date.now());
}
export const isOwner = () => enabled() && forMe(lic()) && !!lic().owner;

// What a screen needs: 'set:<id>', 'notes:<n>', 'playbook:<name>', 'cheat:<name>', 'custom', 'search', 'pdfs'. null = always open.
export function itemFor(hash) {
  const p = hash.replace(/^#\/?/, '').split('?')[0].split('/');
  if (p[0] === 'test' && p[1] && !p[1].startsWith('custom-')) return 'set:' + decodeURIComponent(p[1]);
  if (p[0] === 'study' && /^topic\d+$/.test(p[1] || '')) return 'notes:' + p[1].slice(5);
  if (p[0] === 'study' && p[1] === 'playbook') return 'playbook:' + ((p[2] || '').startsWith('english') ? 'english' : p[2] || '');
  if (p[0] === 'study' && p[1] === 'cheat') return 'cheat:' + (p[2] || '');
  if (p[0] === 'custom') return 'custom';
  if (p[0] === 'search') return 'search';
  return null;
}
export function canOpen(item) {
  if (!item || hasPaid()) return true;
  const l = lic(); return !!(l && (l.free || []).includes(item));
}
export const canHash = h => canOpen(itemFor(h));

async function call(body, anon) {
  const t = G.token(); if (!t && !anon) { const e = new Error('signin'); e.code = 'signin'; throw e; }
  const res = await fetch(LICENCE_URL, { method: 'POST', body: JSON.stringify(Object.assign({ token: t || '' }, body)), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
  const o = await res.json();
  if (!o.ok) { const e = new Error(o.error || 'error'); e.code = o.error; throw e; }
  return o;
}
function keep(o) { forgetKeys(); const l = { keys: o.keys || {}, email: o.email, status: o.status, owner: !!o.owner, plan: o.plan || '', expires: o.expires || '', requested: o.requested || '', plans: o.plans || [], free: o.free || [], upi: o.upi || '', upiName: o.upiName || '', exam: o.exam || '', checkedAt: Date.now() }; lsSet(LKEY, l); return l; }
// ask the owner's script for the latest (quietly; the last answer stays when offline or signed out of Google)
export async function refresh() {
  if (!enabled()) return lic();
  const anon = !G.signedIn() || !G.token();
  // signed in but Google's pass has run out: keep the last answer (it has this account's plan) until the next sign-in
  if (anon && G.signedIn() && forMe(lic())) return lic();
  try { return keep(await call({ action: 'status' }, anon)); } catch (e) { return lic(); }
}
export function forget() { lsDel(LKEY); }

// ---------- the pay screen ----------
const ERR = {
  bad_reference: 'That does not look like a UPI reference. It is the 12-digit number (UTR) in your UPI app\'s payment details.',
  reference_used: 'That UPI reference has already been used for another account.',
  bad_plan: 'Choose a plan first.', bad_code: 'That voucher code is not valid. Check it and try again.',
  code_used: 'That voucher code has already been used. Each code works for one account only.',
  already_paid: 'You already have access, so the code was not used. Give it to a friend.', signin: 'Sign in with Google first.'
};
const msg = e => ERR[e.code] || (navigator.onLine === false ? 'You are offline. Connect to the internet and try again.' : 'Could not reach GSSC RFO just now. Try again in a minute.');
const inr = n => '₹' + Number(n).toLocaleString('en-IN');
const planTxt = p => inr(p.price) + ' for ' + (p.days ? p.days + (p.days === 1 ? ' day' : ' days') : 'no end date');

export async function payScreen(app, opts) {
  opts = opts || {};
  document.body.dataset.screen = 'pay';
  const back = opts.back || '#/';
  const draw = (l, note) => {
    const plans = (l && l.plans) || [];
    let body = '';
    if (!G.signedIn()) {
      body = '<section class="card stack"><h2 class="h2">Sign in first</h2><p>GSSC RFO keeps your access with your Google account, so it works on all your devices.</p><button type="button" class="wide gbtn" data-act="signin">' + GLOGO + '<span>Sign in with Google</span></button></section>';
    } else if (hasPaid()) {
      body = '<section class="card stack"><h2 class="h2">You have full access</h2><p>' + esc(l.plan || 'All of GSSC RFO') + (l.expires ? ' · until ' + esc(day(l.expires)) : '') + '</p><a class="wide pri" href="' + esc(back) + '">Continue</a></section>';
    } else {
      const pend = l && l.status === 'pending';
      body = (pend ? '<section class="card stack pend"><h2 class="h2">Waiting for approval</h2><p>Your payment for <b>' + esc(l.plan) + '</b> was sent on ' + esc(day(l.requested)) + '. GSSC RFO unlocks by itself for <b>' + esc(l.email) + '</b> as soon as it is confirmed.</p><button type="button" class="wide sec" id="pyChk">Check again</button></section>' : '') +
        (l && l.status === 'expired' ? '<p class="note">Your plan ended on ' + esc(day(l.expires)) + '. Choose a plan to carry on.</p>' : '') +
        (l && l.status === 'rejected' ? '<p class="note">Your last payment could not be confirmed. Check the UPI reference, or contact the person who shared GSSC RFO with you.</p>' : '') +
        (plans.length ? '<section class="card stack"><h2 class="h2">1. Choose a plan</h2><div class="plans" role="radiogroup" aria-label="Plans">' + plans.map((p, i) => '<button type="button" role="radio" class="plan' + (i === 0 ? ' on' : '') + '" aria-checked="' + (i === 0) + '" data-i="' + i + '"><b>' + esc(p.name) + '</b><span>' + esc(planTxt(p)) + '</span></button>').join('') + '</div>' +
          '<h2 class="h2">2. Pay with any UPI app</h2><div class="upi"><div class="qr" id="pyQr" aria-label="UPI QR code"></div><div class="stack8"><p>Scan with GPay, PhonePe or Paytm, or pay to:</p><p class="upid"><b>' + esc(l.upi) + '</b></p><p class="sub">' + esc(l.upiName) + '</p><div class="two"><button type="button" class="btn sec" id="pyCopy">Copy UPI ID</button><a class="btn pri" id="pyApp" href="#">Open UPI app</a></div></div></div>' +
          '<h2 class="h2">3. Send the payment reference</h2><label class="ailab" for="pyRef">UPI reference number (UTR), in your UPI app\'s payment details</label><input id="pyRef" class="inp" inputmode="numeric" autocomplete="off" placeholder="12-digit number">' +
          '<label class="ailab" for="pyName">Your name (optional)</label><input id="pyName" class="inp" autocomplete="name">' +
          '<button type="button" class="wide grn" id="pySend">Send for approval</button><p class="err" id="pyErr" hidden></p><p class="sub">Access starts when the payment is confirmed, for ' + esc(l.email) + '.</p></section>' : '<p class="note">Plans are not available just now. Try again later, or use a voucher.</p>') +
        '<section class="card stack"><h2 class="h2">Have a voucher code?</h2><input id="pyCode" class="inp" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="GPS-XXXX-XXXX"><button type="button" class="wide sec" id="pyRedeem">Use voucher</button><p class="err" id="pyVErr" hidden></p><p class="sub">Each code works once, for one account.</p></section>';
    }
    app.innerHTML = topbar(opts.title || 'Unlock GSSC RFO', note || 'Full mocks, every topic, drills and more') + '<main class="pad stack pay">' + (opts.locked ? '<p class="note lockn">' + LOCK + 'This part of GSSC RFO needs a plan.</p>' : '') + body + '</main>' + navHtml('');
    wire(l);
  };
  const wire = l => {
    const chk = $('#pyChk'); if (chk) chk.onclick = async () => { chk.disabled = true; chk.textContent = 'Checking…'; await refresh(); if (hasPaid()) { toast('Approved. Welcome to GSSC RFO.'); location.hash = back; } else draw(lic()); };
    if (!l || !$('#pySend') && !$('#pyRedeem')) return;
    let plan = (l.plans || [])[0];
    const qr = () => { const box = $('#pyQr'); if (!box || !plan) return; const link = upiLink(l, plan); $('#pyApp').href = link; import('./qr.js?v=gsscrfo-2fc7a97e47').then(m => { const q = m.default(0, 'M'); q.addData(link); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }).catch(() => { box.textContent = ''; }); };
    document.querySelectorAll('.plan').forEach(b => b.onclick = () => { document.querySelectorAll('.plan').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); plan = l.plans[+b.dataset.i]; qr(); });
    qr();
    const cp = $('#pyCopy'); if (cp) cp.onclick = () => { try { navigator.clipboard.writeText(l.upi).then(() => toast('UPI ID copied')); } catch (e) { } };
    const send = $('#pySend');
    if (send) send.onclick = async () => {
      const err = $('#pyErr'), ref = ($('#pyRef').value || '').replace(/\s+/g, '');
      if (!/^[A-Za-z0-9]{8,30}$/.test(ref)) { err.hidden = false; err.textContent = ERR.bad_reference; return; }
      send.disabled = true; send.textContent = 'Sending…'; err.hidden = true;
      try { keep(await call({ action: 'request', plan: plan.name, utr: ref, name: ($('#pyName').value || '').trim() })); toast('Sent. You will get access as soon as it is confirmed.', null, 5000); draw(lic()); }
      catch (e) { if (e.code === 'signin') return G.signIn({ silent: true, then: 'pay' }); send.disabled = false; send.textContent = 'Send for approval'; err.hidden = false; err.textContent = msg(e); }
    };
    const red = $('#pyRedeem');
    if (red) red.onclick = async () => {
      const err = $('#pyVErr'), code = ($('#pyCode').value || '').trim();
      if (code.replace(/[^A-Za-z0-9]/g, '').length < 6) { err.hidden = false; err.textContent = ERR.bad_code; return; }
      red.disabled = true; red.textContent = 'Checking…'; err.hidden = true;
      try { keep(await call({ action: 'voucher', code })); if (hasPaid()) { toast('Voucher accepted. Welcome to GSSC RFO.', null, 4000); location.hash = back; return; } draw(lic()); }
      catch (e) { if (e.code === 'signin') return G.signIn({ silent: true, then: 'pay' }); red.disabled = false; red.textContent = 'Use voucher'; err.hidden = false; err.textContent = msg(e); }
    };
  };
  if (!lic()) app.innerHTML = topbar(opts.title || 'Unlock GSSC RFO', '') + '<main class="pad stack pay"><p class="sub">Checking what you can open…</p></main>' + navHtml('');
  else draw(lic());
  if (!G.signedIn() || G.token()) { const l = await refresh(); if (document.body.dataset.screen === 'pay') { if (opts.locked && canHash(opts.back)) { window.dispatchEvent(new Event('gpsc-rerender')); return; } draw(l); } }
  else if (G.signedIn() && !lic()) draw(null, 'Sign in again to see the plans');
}
const upiLink = (l, p) => 'upi://pay?' + new URLSearchParams({ pa: l.upi, pn: l.upiName, am: String(p.price), cu: 'INR', tn: 'GSSC RFO ' + p.name }).toString();
const LOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>';
export const lockIcon = LOCK;
const GLOGO = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg>';

// ---------- the owner's admin screen ----------
export async function adminScreen(app) {
  document.body.dataset.screen = 'admin';
  app.innerHTML = topbar('Paid access', 'Only you can see this') + '<main class="pad stack adm" id="adm"><p class="sub">Loading…</p></main>' + navHtml('');
  let A;
  try { A = await call({ action: 'admin' }); }
  catch (e) { $('#adm').innerHTML = '<div class="card"><p>' + esc(e.code === 'not_owner' ? 'This screen is only for the owner of GSSC RFO.' : e.code === 'signin' ? 'Sign in again (tap Sync) to open this screen.' : msg(e)) + '</p></div>'; return; }
  await Promise.all([getIndex(), getMeta()]);
  let tab = 'req';
  const draw = () => {
    const pend = A.users.filter(u => u.status === 'pending'), paid = A.users.filter(u => u.status === 'paid'), other = A.users.filter(u => u.status !== 'pending' && u.status !== 'paid');
    const tabs = [['req', 'Requests · ' + pend.length], ['ppl', 'People · ' + paid.length], ['plans', 'Plans'], ['free', 'Free content'], ['vou', 'Vouchers']];
    let h = '<div class="chips" role="tablist">' + tabs.map(t => '<button type="button" role="tab" class="fchip' + (tab === t[0] ? ' on' : '') + '" aria-selected="' + (tab === t[0]) + '" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>').join('') + '</div>';
    const urow = (u, btns) => '<article class="card urow"><div class="uh"><b>' + esc(u.email) + '</b><span class="pill ' + (u.status === 'paid' ? 'pill-done' : u.status === 'pending' ? 'pill-skip' : 'pill-bad') + '">' + esc(u.status) + '</span></div>' +
      '<p class="sub">' + esc([u.plan, u.how, u.ref && (u.how === 'Voucher' ? 'code ' : 'UPI ref ') + u.ref, u.name, u.requested && 'asked ' + day(u.requested), u.expires && 'until ' + day(u.expires)].filter(Boolean).join(' · ')) + '</p>' + (btns ? '<div class="two">' + btns + '</div>' : '') + '</article>';
    if (tab === 'req') h += pend.length ? '<p class="sub">Check each UPI reference in your bank or UPI app, then approve. Access starts at approval and runs for the plan\'s days.</p>' + pend.map(u => urow(u, '<button type="button" class="btn grn" data-ok="' + esc(u.email) + '">Approve</button><button type="button" class="btn sec" data-no="' + esc(u.email) + '">Reject</button>')).join('') : '<p class="empty">No payments waiting. New ones appear here.</p>';
    if (tab === 'ppl') h += (paid.length ? paid.map(u => urow(u, '<button type="button" class="btn sec" data-rv="' + esc(u.email) + '">Remove access</button>')).join('') : '<p class="empty">Nobody has access yet.</p>') + (other.length ? '<h2 class="label">Ended, rejected or removed</h2>' + other.map(u => urow(u, '<button type="button" class="btn sec" data-ok="' + esc(u.email) + '">Give access again</button>')).join('') : '');
    if (tab === 'plans') h += '<p class="sub">People choose one of these on the pay screen. Days 0 means no end date.</p><div class="stack8" id="plRows">' + A.plans.map(planRow).join('') + '</div><button type="button" class="wide sec" id="plAdd">Add a plan</button><button type="button" class="wide pri" id="plSave">Save plans</button>';
    if (tab === 'free') h += freeBox(A.free);
    if (tab === 'vou') {
      const unused = A.vouchers.filter(v => !v.usedBy);
      h += '<section class="card stack"><h2 class="h2">Make voucher codes</h2><div class="two"><label class="fld"><span class="ailab">How many</span><input id="vN" class="inp" type="number" min="1" max="50" value="1"></label><label class="fld"><span class="ailab">Days (0 = no end)</span><input id="vD" class="inp" type="number" min="0" value="30"></label></div><input id="vNote" class="inp" placeholder="Note, for example who it is for"><button type="button" class="wide pri" id="vMake">Make codes</button><div id="vMade"></div></section>' +
        '<h2 class="label">Not used yet · ' + unused.length + '</h2>' + (unused.length ? '<div class="list flat">' + unused.map(v => '<div class="row vrow"><span class="rt"><span class="ttl code">' + esc(v.code) + '</span><span class="sub">' + esc((v.days ? v.days + ' days' : 'no end') + (v.note ? ' · ' + v.note : '') + ' · made ' + day(v.made)) + '</span></span><button type="button" class="btn sec sm" data-cp="' + esc(v.code) + '">Copy</button></div>').join('') + '</div>' : '<p class="empty">None.</p>') +
        '<h2 class="label">Used · ' + (A.vouchers.length - unused.length) + '</h2>' + A.vouchers.filter(v => v.usedBy).map(v => '<p class="sub">' + esc(v.code + ' · ' + v.usedBy + ' · ' + day(v.usedOn)) + '</p>').join('');
    }
    $('#adm').innerHTML = h;
    bind();
  };
  const planRow = p => '<div class="plrow"><input class="inp pn" placeholder="Name, e.g. 1 week" value="' + esc(p.name || '') + '" aria-label="Plan name"><input class="inp pd" type="number" min="0" placeholder="Days" value="' + (p.days != null ? p.days : '') + '" aria-label="Days"><input class="inp pp" type="number" min="1" placeholder="₹" value="' + (p.price || '') + '" aria-label="Price in rupees"><button type="button" class="ib" data-del aria-label="Remove plan">' + ICON.close + '</button></div>';
  const freeBox = free => {
    const on = new Set(free);
    const sets = (IDX.sets || []);
    const grp = (title, items) => items.length ? '<section class="card stack8"><div class="ch"><h2 class="h2">' + esc(title) + '</h2><button type="button" class="lnk" data-all>All / none</button></div>' + items.map(([k, label]) => '<label class="chk"><input type="checkbox" data-k="' + esc(k) + '"' + (on.has(k) ? ' checked' : '') + '><span>' + esc(label) + '</span></label>').join('') + '</section>' : '';
    const of = re => sets.filter(s => re.test(s.id)).map(s => ['set:' + s.id, s.name]);
    return '<p class="sub">Tick what people can open without paying. Everything else shows the pay screen. Changes reach everyone within a minute.</p>' +
      grp('CBT-II mocks', of(/^cbt2-/)) + grp('CBT-I mocks', of(/^cbt1-/)) + grp('Numerical drills', of(/^numd\d/)) + grp('Reasoning drills', of(/^lrd\d/)) + grp('Grammar drills', of(/^grd\d/)) + grp('Comprehension drills', of(/^compd/)) + grp('Konkani drills', of(/^kond\d/)) + grp('Topic quizzes', of(/^quiz/)) +
      grp('Study notes', ((META && META.notes) || []).map(n => ['notes:' + n.t, 'Topic ' + n.t + ': ' + n.title + ' (and its PDF)'])) +
      grp('Playbooks', [['playbook:english', 'English Playbook'], ['playbook:konkani', 'Konkani notes']]) +
      grp('Cheat sheets', [['cheat:grammar', 'English grammar cheat sheet'], ['cheat:reasoning', 'Reasoning cheat sheet'], ['cheat:numerical', 'Numerical cheat sheet']]) +
      grp('Features', [['custom', 'Custom tests (Pick subjects)'], ['search', 'Search'], ['pdfs', 'Printable PDFs']]) +
      '<button type="button" class="wide pri" id="frSave">Save what is free</button>';
  };
  const run = async (b, body, okMsg) => { b.disabled = true; try { A = await call(body); if (okMsg) toast(okMsg); draw(); } catch (e) { b.disabled = false; toast(msg(e), null, 5000); } };
  const bind = () => {
    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
    document.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => run(b, { action: 'approve', email: b.dataset.ok }, 'Approved ' + b.dataset.ok));
    document.querySelectorAll('[data-no]').forEach(b => b.onclick = () => run(b, { action: 'reject', email: b.dataset.no }, 'Rejected'));
    document.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => { if (b.dataset.sure) run(b, { action: 'revoke', email: b.dataset.rv }, 'Access removed'); else { b.dataset.sure = 1; b.textContent = 'Tap again to remove'; } });
    document.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => { try { navigator.clipboard.writeText(b.dataset.cp).then(() => toast('Code copied')); } catch (e) { } });
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => b.closest('.plrow').remove());
    document.querySelectorAll('[data-all]').forEach(b => b.onclick = () => { const cs = b.closest('section').querySelectorAll('input[type=checkbox]'); const all = [...cs].every(c => c.checked); cs.forEach(c => (c.checked = !all)); });
    const add = $('#plAdd'); if (add) add.onclick = () => $('#plRows').insertAdjacentHTML('beforeend', planRow({}));
    const ps = $('#plSave'); if (ps) ps.onclick = () => {
      const plans = [...document.querySelectorAll('.plrow')].map(r => ({ name: r.querySelector('.pn').value.trim(), days: +r.querySelector('.pd').value, price: +r.querySelector('.pp').value })).filter(p => p.name || p.price);
      if (plans.some(p => !p.name || !(p.price > 0) || !(p.days >= 0))) return toast('Each plan needs a name, days (0 or more) and a price.', null, 4000);
      run(ps, { action: 'plans', plans }, 'Plans saved');
    };
    const fs = $('#frSave'); if (fs) fs.onclick = () => run(fs, { action: 'free', free: [...document.querySelectorAll('[data-k]')].filter(c => c.checked).map(c => c.dataset.k) }, 'Saved. Free content is updated for everyone.');
    const vm = $('#vMake'); if (vm) vm.onclick = async () => {
      vm.disabled = true;
      try { A = await call({ action: 'vouchers', count: +$('#vN').value || 1, days: +$('#vD').value || 0, note: $('#vNote').value.trim() }); const made = A.made || []; draw(); $('#vMade').innerHTML = '<p class="sub">New codes: send each to one person.</p>' + made.map(c => '<p class="code big">' + esc(c) + '</p>').join('') + '<button type="button" class="wide sec" id="vCopyAll">Copy all</button>'; $('#vCopyAll').onclick = () => { try { navigator.clipboard.writeText(made.join('\n')).then(() => toast('Codes copied')); } catch (e) { } }; }
      catch (e) { vm.disabled = false; toast(msg(e), null, 5000); }
    };
  };
  draw();
}
