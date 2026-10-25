// Ask AI: a study assistant on every screen. Text, voice, or a photo / video, about anything or about the page you are on.
// The student picks the AI company and model and uses their own API key. Keys stay on this device only (never in the
// progress file, never synced); calls go straight from the device to that company.
import { $, esc, sheet, closeSheet, sheetOpen, toast, lsGet, lsSet, lsDel } from './core.js?v=gsscrfo-2fc7a97e47';

const AKEY = 'gsscrfo-ai-v1';
const GAPI = 'https://generativelanguage.googleapis.com/v1beta/models';
// Each company's own recommended model is the default ("rec"). With the recommended setting, a model that is busy,
// retired or rate-limited falls through to the backups in turn. A model the student picks is used on its own.
export const PROVIDERS = {
  gemini: { name: 'Google Gemini', short: 'Gemini', rec: 'gemini-3.8-flash', backup: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'],
    keyUrl: 'https://aistudio.google.com/apikey', site: 'aistudio.google.com/apikey', keyHint: 'Free key from Google AI Studio. Starts with AIza or AQ.', video: true, audio: true },
  anthropic: { name: 'Anthropic Claude', short: 'Claude', rec: 'claude-opus-5-5', backup: ['claude-sonnet-5-5', 'claude-haiku-5-5'],
    keyUrl: 'https://console.anthropic.com/settings/keys', site: 'console.anthropic.com', keyHint: 'Paid key from the Claude Console. Starts with sk-ant-.' },
  openai: { name: 'OpenAI', short: 'ChatGPT', rec: 'gpt-6-astra', backup: ['gpt-6.1-sol', 'gpt-6-luna'],
    keyUrl: 'https://platform.openai.com/api-keys', site: 'platform.openai.com/api-keys', keyHint: 'Paid key from the OpenAI platform. Starts with sk-.' },
  openrouter: { name: 'OpenRouter', short: 'AI', rec: 'openrouter/auto', backup: [],
    keyUrl: 'https://openrouter.ai/keys', site: 'openrouter.ai/keys', keyHint: 'One key for models from many companies, some of them free. Starts with sk-or-.' }
};
const ORDER = ['gemini', 'anthropic', 'openai', 'openrouter'];
const WAIT = 12000; // with backups to try: a model that has not started answering by then is overloaded, move on
const MAX_MEDIA = 14 * 1024 * 1024; // Gemini's inline request limit is 20 MB; base64 adds a third
// settings: { provider, keys: {gemini, anthropic, …}, models: {gemini: '' = recommended, …}, lastBy: {gemini: model that last answered} }
export function conf() {
  const c = lsGet(AKEY, {}) || {};
  const provider = PROVIDERS[c.provider] ? c.provider : 'gemini';
  const keys = Object.assign({}, c.keys); if (c.key && !keys.gemini) keys.gemini = c.key; // the first version kept one Gemini key
  const models = Object.assign({}, c.models); if (c.model && models.gemini == null) models.gemini = c.model;
  return { provider, keys, models, lastBy: Object.assign({}, c.lastBy), key: keys[provider] || '', model: models[provider] || '', P: PROVIDERS[provider] };
}
function store(c) { lsSet(AKEY, { provider: c.provider, keys: c.keys, models: c.models, lastBy: c.lastBy }); }
export const label = () => 'Ask ' + conf().P.short;
export function summary() {
  const c = conf();
  if (!c.key) return { on: false, text: 'Not set up. Choose an AI company, paste your API key and pick a model.' };
  return { on: true, text: c.P.name + ' · ' + (c.model ? c.model : 'recommended model (' + c.P.rec + ')') + ' · key ending ' + c.key.slice(-4) + '. Saved only on this device.' };
}
export function removeKey() { const c = conf(); delete c.keys[c.provider]; store(c); }
const chat = []; // this session's conversation: {role:'user'|'model', parts:[...], view:{text, media, voice}}
let busy = null; // AbortController of the running request

export const ICONS = {
  spark: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><defs><linearGradient id="aig" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f8cff"/><stop offset=".55" stop-color="#9b6bff"/><stop offset="1" stop-color="#ff6fae"/></linearGradient></defs><path d="M12 2c.6 4.9 3.4 7.6 8.3 8.3v1.4C15.4 12.4 12.6 15.1 12 20h-1.4c-.6-4.9-3.4-7.6-8.3-8.3v-1.4C7.2 9.6 10 6.9 10.6 2z" fill="url(#aig)" transform="translate(.7 1)"/></svg>',
  text: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="3"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>',
  mic: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
  cam: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>'
};

// ---------- the page the user is looking at ----------
export function pageContext() {
  const app = $('#app'); if (!app) return null;
  const screen = document.body.dataset.screen || 'home';
  let label = '', text = '';
  const h1 = app.querySelector('h1');
  const nb = $('#nb');
  if (nb && nb.querySelector('.ns')) {
    // notes: the sections on screen and the one after, so "this" means what you are reading
    const secs = Array.from(nb.querySelectorAll('.ns'));
    const mid = innerHeight * 0.4;
    let i = secs.findIndex(s => { const r = s.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; });
    if (i < 0) i = Math.max(0, secs.findIndex(s => s.getBoundingClientRect().bottom > 0));
    const pick = secs.slice(i, i + 2);
    const h2 = pick[0].querySelector('h2');
    const hn = h2 && h2.querySelector('.nnum');
    const ht = h2 ? (hn ? hn.textContent.trim() + ' ' + h2.textContent.trim().slice(hn.textContent.trim().length).trim() : h2.textContent.trim()) : '';
    label = (h1 ? h1.textContent.trim() : 'Notes') + (ht ? ' · ' + ht : '');
    text = pick.map(s => s.innerText).join('\n\n');
  } else if (screen === 'runner' || app.querySelector('#rq')) {
    const qn = app.querySelector('.qn');
    label = qn ? qn.textContent.trim() : 'This question';
    text = app.innerText; // the passage, the question and its options
  } else {
    const main = app.querySelector('main') || app;
    label = (h1 && h1.textContent.trim()) || document.title;
    text = main.innerText;
  }
  text = text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 14000);
  return text.length > 40 ? { label: label.slice(0, 80), text } : null;
}

// ---------- the floating tab and its menu ----------
export function menu(tab) {
  const old = $('#aimenu'); if (old) { old.remove(); return; }
  const r = tab.getBoundingClientRect();
  const m = document.createElement('div');
  m.id = 'aimenu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', label());
  m.innerHTML = '<span class="aim-t">' + ICONS.spark + esc(label()) + '</span>' +
    [['text', 'Type'], ['voice', 'Speak'], ['camera', 'Camera']].map(([k, l]) => '<button type="button" role="menuitem" data-mode="' + k + '"><span class="aim-i">' + ICONS[k === 'voice' ? 'mic' : k === 'camera' ? 'cam' : 'text'] + '</span>' + l + '</button>').join('');
  document.body.appendChild(m);
  const top = Math.min(Math.max(r.top + r.height / 2 - m.offsetHeight / 2, 8), innerHeight - m.offsetHeight - 8);
  m.style.top = top + 'px';
  const off = e => { if (!m.contains(e.target) && e.target !== tab && !tab.contains(e.target)) close(); };
  const key = e => { if (e.key === 'Escape') { close(); tab.focus(); } };
  const close = () => { m.remove(); document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', key); window.removeEventListener('hashchange', close); };
  m.addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; close(); open(b.dataset.mode); });
  setTimeout(() => { document.addEventListener('pointerdown', off, true); document.addEventListener('keydown', key); window.addEventListener('hashchange', close); }, 0);
  m.querySelector('button').focus();
}

// ---------- the panel ----------
let ctx = null, useCtx = true, media = null;
export function open(mode) {
  if (!conf().key) return keySheet(() => open(mode));
  const L = label();
  ctx = pageContext(); useCtx = !!ctx; media = null;
  const el = sheet(
    '<div class="aih"><span class="aih-t">' + ICONS.spark + esc(L) + '</span><span class="sp"></span>' +
    (chat.length ? '<button type="button" class="ib aih-b" id="aiNew">New chat</button>' : '') +
    '<button type="button" class="ib aih-b" id="aiSet" aria-label="AI settings">' + ICONS.gear + '</button><button type="button" class="ib aih-b" data-close aria-label="Close">' + ICONS.x + '</button></div>' +
    (ctx ? '<button type="button" class="aictx on" id="aiCtx" aria-pressed="true"><span class="aictx-d"></span><span>Ask about this page: <b>' + esc(ctx.label) + '</b></span></button>' : '') +
    '<div class="aimsgs" id="aiMsgs" aria-live="polite"></div>' +
    '<div class="aiatt" id="aiAtt" hidden></div>' +
    '<div class="aibar"><button type="button" class="aiic" id="aiCam" aria-label="Photo or video">' + ICONS.cam + '</button>' +
    '<textarea id="aiIn" rows="1"' + (mode === 'text' ? ' data-focus' : '') + ' placeholder="' + (ctx ? 'Ask about this page…' : 'Ask anything…') + '" aria-label="Your question" enterkeyhint="send"></textarea>' +
    '<button type="button" class="aiic" id="aiMic" aria-label="Speak your question">' + ICONS.mic + '</button>' +
    '<button type="button" class="aiic aisend" id="aiSend" aria-label="Send">' + ICONS.send + '</button></div>' +
    '<input type="file" id="aiShot" accept="image/*,video/*" capture="environment" hidden><input type="file" id="aiPick" accept="image/*,video/*" hidden>',
    { label: L, onClose: () => { stopVoice(); if (busy) busy.abort(); } });
  el.classList.add('aisheet');
  renderMsgs();
  const inp = $('#aiIn');
  inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 140) + 'px'; });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  $('#aiSend').onclick = () => busy ? busy.abort() : send();
  $('#aiMic').onclick = () => voice();
  $('#aiCam').onclick = () => cameraChoice();
  $('#aiSet').onclick = () => keySheet(() => open('text'));
  const nw = $('#aiNew'); if (nw) nw.onclick = () => { chat.length = 0; open('text'); };
  const cb = $('#aiCtx'); if (cb) cb.onclick = () => { useCtx = !useCtx; cb.classList.toggle('on', useCtx); cb.setAttribute('aria-pressed', useCtx); };
  for (const id of ['aiShot', 'aiPick']) $('#' + id).onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) attach(f); };
  if (mode === 'voice') voice();
  else if (mode === 'camera') cameraChoice();
  else inp.focus({ preventScroll: true });
}

function cameraChoice() {
  const att = $('#aiAtt');
  att.hidden = false;
  att.innerHTML = '<div class="aicam"><button type="button" class="btn vio" id="aiTake">' + ICONS.cam + 'Take photo or video</button><button type="button" class="btn sec" id="aiLib">Choose from gallery</button></div>';
  $('#aiTake').onclick = () => $('#aiShot').click();
  $('#aiLib').onclick = () => $('#aiPick').click();
}

async function attach(f) {
  const att = $('#aiAtt');
  const isVid = /^video\//.test(f.type) || /\.(mov|mp4|webm|3gp)$/i.test(f.name);
  try {
    if (isVid && !conf().P.video) { toast('Videos work with Google Gemini only. Send a photo instead, or switch to Gemini in Settings.', null, 5000); return; }
    if (isVid) {
      if (f.size > MAX_MEDIA) { toast('That video is too long to send. Keep it under about 20 seconds.', null, 4500); return; }
      media = { mime: vidMime(f), data: await b64(f), kind: 'video', url: URL.createObjectURL(f) };
    } else {
      const small = await shrink(f);
      media = { mime: 'image/jpeg', data: small.split(',')[1], kind: 'image', url: small };
    }
  } catch (e) { toast('Could not read that file. Try another photo or video.'); return; }
  att.hidden = false;
  att.innerHTML = '<div class="aithumb">' + (media.kind === 'image' ? '<img src="' + media.url + '" alt="Attached photo">' : '<video src="' + media.url + '" muted playsinline></video>') +
    '<span>' + (media.kind === 'image' ? 'Photo attached' : 'Video attached') + '</span><button type="button" class="ib" id="aiRm" aria-label="Remove attachment">' + ICONS.x + '</button></div>';
  $('#aiRm').onclick = () => { media = null; att.hidden = true; att.innerHTML = ''; };
  const inp = $('#aiIn'); inp.placeholder = media.kind === 'image' ? 'Ask about this photo…' : 'Ask about this video…'; inp.focus({ preventScroll: true });
}
const vidMime = f => { const t = (f.type || '').toLowerCase(); if (t === 'video/quicktime' || /\.mov$/i.test(f.name)) return 'video/mov'; return t || 'video/mp4'; };
const b64 = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(f); });
function shrink(f) {
  return new Promise((ok, no) => {
    const img = new Image(); const u = URL.createObjectURL(f);
    img.onload = () => {
      const s = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', .85));
    };
    img.onerror = () => { URL.revokeObjectURL(u); no(new Error('image')); };
    img.src = u;
  });
}

// ---------- voice: live speech-to-text where the browser has it, otherwise record and let Gemini listen ----------
let rec = null, recorder = null;
function stopVoice() { try { if (rec) rec.stop(); } catch (e) { } try { if (recorder && recorder.state === 'recording') recorder.stop(); } catch (e) { } }
function voice() {
  const mic = $('#aiMic'); if (!mic) return;
  if (rec || (recorder && recorder.state === 'recording')) { stopVoice(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const inp = $('#aiIn');
  if (SR) {
    try {
      rec = new SR(); rec.lang = 'en-IN'; rec.interimResults = true; rec.continuous = false;
      const before = inp.value ? inp.value.trim() + ' ' : '';
      let final = '', failed = false;
      rec.onresult = e => { let t = ''; final = ''; for (const r of e.results) { if (r.isFinal) final += r[0].transcript; else t += r[0].transcript; } inp.value = before + final + t; inp.dispatchEvent(new Event('input')); };
      rec.onerror = e => { failed = e.error; };
      rec.onend = () => {
        rec = null; mic.classList.remove('rec'); setHint('');
        // the browser's speech service is missing or blocked (common in installed iOS apps): record instead and let Gemini listen
        if (failed && failed !== 'no-speech' && failed !== 'aborted') { recordAudio(); return; }
        if (final.trim()) send();
      };
      rec.start(); mic.classList.add('rec'); setHint('Listening… speak your question. Tap the mic to stop.');
      return;
    } catch (e) { rec = null; }
  }
  recordAudio();
}
async function recordAudio() {
  const mic = $('#aiMic');
  if (!conf().P.audio) { toast('Voice typing is not available here. Type your question, or switch to Google Gemini in Settings to send a voice recording.', null, 5500); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Voice is not available in this browser. Type your question instead.', null, 4000); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { toast('Allow the microphone to ask by voice.', null, 4000); return; }
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
  const chunks = []; const t0 = Date.now();
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop()); mic.classList.remove('rec'); setHint('');
    const blob = new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' });
    if (Date.now() - t0 < 700 || !blob.size) return;
    setHint('Preparing your voice question…');
    // Gemini reads WAV everywhere; Safari records MP4/AAC and Chrome WebM, so convert to 16 kHz mono WAV first
    let audio;
    try { audio = { mime: 'audio/wav', data: await b64(await toWav(blob)) }; }
    catch (e) { audio = { mime: (blob.type || 'audio/webm').split(';')[0], data: await b64(blob) }; }
    setHint('');
    audio.secs = Math.max(1, Math.round((Date.now() - t0) / 1000));
    send({ audio });
  };
  recorder.start(); mic.classList.add('rec'); setHint('Recording… tap the mic again when you have asked.');
  setTimeout(() => { if (recorder && recorder.state === 'recording') recorder.stop(); }, 60000);
}
async function toWav(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  try {
    const ab = await blob.arrayBuffer();
    const src = await new Promise((ok, no) => { const p = ac.decodeAudioData(ab, ok, no); if (p && p.then) p.then(ok, no); });
    const rate = 16000, len = Math.ceil(src.duration * rate);
    const off = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, len, rate);
    const n = off.createBufferSource(); n.buffer = src; n.connect(off.destination); n.start(0);
    const out = await off.startRendering();
    const pcm = out.getChannelData(0), buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) { const x = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
    return new Blob([buf], { type: 'audio/wav' });
  } finally { try { ac.close(); } catch (e) { } }
}
function setHint(t) { const att = $('#aiAtt'); if (!att) return; if (t) { att.hidden = false; att.dataset.hint = '1'; att.innerHTML = '<p class="aihint"><span class="aipulse"></span>' + esc(t) + '</p>'; } else if (att.dataset.hint) { delete att.dataset.hint; att.innerHTML = ''; att.hidden = !media; } }

// ---------- conversation ----------
const SYSTEM = 'You are the study assistant inside GSSC RFO, an app for the Goa Staff Selection Commission (GSSC) exam for the post of Range Forest Officer ' +
  '(CBT-II: reasoning, numerical ability, English, and a forestry and science subject test; CBT-I also has Konkani). ' +
  'Answer clearly and briefly for exam revision: lead with the direct answer, then the key points. Use standard sources: Troup and Khanna on silviculture, ' +
  'Chaturvedi and Khanna on mensuration, the bare acts (Indian Forest Act 1927, Wild Life (Protection) Act 1972 as amended in 2022, Van (Sanrakshan Evam Samvardhan) Adhiniyam 1980, Forest Rights Act 2006, Biological Diversity Act 2002), ' +
  'Forest Survey of India reports, NCERT science, and Goa Forest Department material for Goa. When the page text is given, base the answer on it and say if the page does not cover the question. ' +
  'If you are not sure, say so. Use short paragraphs and bullet lists; no tables.';

function renderMsgs() {
  const box = $('#aiMsgs'); if (!box) return;
  if (!chat.length) {
    box.innerHTML = '<div class="aiempty"><p><b>Ask a question</b> by typing, speaking or showing a photo or video.</p>' +
      (ctx ? '<div class="aisug">' + ['Explain this page simply', 'Give me 3 MCQs from this page', 'What is most likely to be asked here?'].map(s => '<button type="button" class="fchip" data-q="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>' : '') + '</div>';
    box.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { $('#aiIn').value = b.dataset.q; send(); });
    return;
  }
  box.innerHTML = chat.map(m => '<div class="aim ' + m.role + '">' + (m.role === 'user' ? userView(m.view) : '<div class="aimd">' + md(m.view.text || '') + (m.view.err ? '<p class="aierr">' + esc(m.view.err) + '</p>' : '') + (m.view.via && m.view.text ? '<p class="aivia">' + esc(m.view.via) + '</p>' : '') + '</div>') + '</div>').join('') + (busy && chat[chat.length - 1].role === 'user' ? '<div class="aim model"><span class="aidots"><i></i><i></i><i></i></span></div>' : '');
  box.scrollTop = box.scrollHeight;
}
function userView(v) {
  return (v.media ? (v.media.kind === 'image' ? '<img class="aimedia" src="' + v.media.url + '" alt="Photo you sent">' : '<video class="aimedia" src="' + v.media.url + '" muted playsinline controls></video>') : '') +
    (v.voice ? '<p class="aivoice">' + ICONS.mic + 'Voice question · ' + v.voice + ' s</p>' : '') + (v.text ? '<p>' + esc(v.text) + '</p>' : '') +
    (v.page ? '<p class="aipg">About: ' + esc(v.page) + '</p>' : '');
}

async function send(extra) {
  const inp = $('#aiIn'); if (!inp || busy) return;
  const text = inp.value.trim();
  const audio = extra && extra.audio;
  if (!text && !media && !audio) { inp.focus(); return; }
  const parts = [];
  // send the page once per conversation (and again only if the student has moved to a different part of it)
  const pkey = ctx ? ctx.label + '|' + ctx.text.length : '';
  const pageOn = !!(useCtx && ctx && !chat.some(m => m.view && m.view.pkey === pkey));
  if (pageOn) parts.push({ text: 'The page the student is looking at in the app ("' + ctx.label + '"):\n"""\n' + ctx.text + '\n"""' });
  if (media) parts.push({ inlineData: { mimeType: media.mime, data: media.data } });
  if (audio) parts.push({ inlineData: { mimeType: audio.mime, data: audio.data } }, { text: 'The student asked the question above by voice. Answer it; begin with one line in italics restating the question you heard.' });
  if (text) parts.push({ text });
  chat.push({ role: 'user', parts, view: { text, media, voice: audio ? audio.secs : 0, page: pageOn ? ctx.label : '', pkey: pageOn ? pkey : '' } });
  inp.value = ''; inp.style.height = 'auto'; media = null; const att = $('#aiAtt'); att.hidden = true; att.innerHTML = '';
  inp.placeholder = 'Ask a follow-up…';
  await ask();
}

// ---------- one request to the chosen company: url, headers, body, and how to read its stream ----------
const live = m => !(m.view && m.view.err && !m.view.text); // failed replies are not sent back as history
function mediaNote(p) { return '[' + (/^video/.test(p.inlineData.mimeType) ? 'a video' : 'a voice recording') + ' that only Google Gemini can read]'; }
function request(c, model) {
  const p = c.provider;
  if (p === 'gemini') return {
    url: GAPI + '/' + encodeURIComponent(model) + ':streamGenerateContent?alt=sse',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
    body: { systemInstruction: { parts: [{ text: SYSTEM }] }, contents: chat.filter(live).map(m => ({ role: m.role, parts: m.parts })), generationConfig: { temperature: 0.4, maxOutputTokens: 8192 /* newer models think first; thinking counts towards this limit */ } }
  };
  if (p === 'anthropic') {
    const messages = [];
    for (const m of chat.filter(live)) {
      const role = m.role === 'user' ? 'user' : 'assistant';
      const content = m.parts.map(x => x.inlineData ? (/^image\//.test(x.inlineData.mimeType) ? { type: 'image', source: { type: 'base64', media_type: x.inlineData.mimeType, data: x.inlineData.data } } : { type: 'text', text: mediaNote(x) })
        : x.text ? { type: 'text', text: x.text } : null).filter(Boolean);
      if (!content.length) continue;
      const last = messages[messages.length - 1];
      if (last && last.role === role) last.content.push(...content); else messages.push({ role, content });
    }
    while (messages[0] && messages[0].role !== 'user') messages.shift();
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: { model, max_tokens: 8192, system: SYSTEM, messages, stream: true }
    };
  }
  // OpenAI and OpenRouter: the Chat Completions format
  const messages = [{ role: 'system', content: SYSTEM }];
  for (const m of chat.filter(live)) {
    if (m.role !== 'user') { const t = m.parts.map(x => x.text || '').join(''); if (t) messages.push({ role: 'assistant', content: t }); continue; }
    const content = m.parts.map(x => x.inlineData ? (/^image\//.test(x.inlineData.mimeType) ? { type: 'image_url', image_url: { url: 'data:' + x.inlineData.mimeType + ';base64,' + x.inlineData.data } } : { type: 'text', text: mediaNote(x) })
      : x.text ? { type: 'text', text: x.text } : null).filter(Boolean);
    if (content.length) messages.push({ role: 'user', content });
  }
  const or = p === 'openrouter';
  return {
    url: or ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions',
    headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key }, or ? { 'X-Title': 'GSSC RFO' } : {}),
    body: { model, messages, stream: true } // newer OpenAI models take neither temperature nor a token limit here
  };
}
// read one server-sent event; returns {text, cut, err}
function readEvent(p, data) {
  if (data === '[DONE]') return {};
  let j; try { j = JSON.parse(data); } catch (e) { return {}; }
  if (j.error) return { err: (j.error.message || 'error').slice(0, 160) };
  if (p === 'gemini') {
    const cand = j.candidates && j.candidates[0];
    return { text: ((cand && cand.content && cand.content.parts) || []).filter(x => !x.thought).map(x => x.text || '').join(''), cut: cand && cand.finishReason === 'MAX_TOKENS',
      err: j.promptFeedback && j.promptFeedback.blockReason ? 'Gemini did not answer this one (' + j.promptFeedback.blockReason.toLowerCase() + ').' : '' };
  }
  if (p === 'anthropic') {
    if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta') return { text: j.delta.text };
    if (j.type === 'message_delta' && j.delta && j.delta.stop_reason === 'max_tokens') return { cut: true };
    return {};
  }
  const ch = j.choices && j.choices[0];
  return { text: (ch && ch.delta && typeof ch.delta.content === 'string') ? ch.delta.content : '', cut: ch && ch.finish_reason === 'length' };
}

async function ask() {
  const c = conf(), P = c.P;
  busy = new AbortController();
  const sendBtn = $('#aiSend'); if (sendBtn) { sendBtn.innerHTML = ICONS.stop; sendBtn.setAttribute('aria-label', 'Stop'); }
  renderMsgs();
  const reply = { role: 'model', parts: [{ text: '' }], view: { text: '' } };
  // a model the student chose is used on its own; the recommended setting starts with the model that last
  // answered and falls through the company's backups when one is busy
  const first = c.model || c.lastBy[c.provider] || P.rec;
  const models = c.model ? [c.model] : [first].concat([P.rec].concat(P.backup).filter(m => m !== first));
  let err = '';
  try {
    for (let i = 0; i < models.length; i++) {
      const more = i < models.length - 1;
      const rq = request(c, models[i]);
      // each try has its own timer; Stop still cancels everything
      const ac = new AbortController(), user = busy.signal;
      const stop = () => ac.abort(); user.addEventListener('abort', stop);
      let slow = false; const timer = setTimeout(() => { slow = true; ac.abort(); }, more ? WAIT : 90000);
      let res;
      try { res = await fetch(rq.url, { method: 'POST', headers: rq.headers, body: JSON.stringify(rq.body), signal: ac.signal }); }
      catch (e) { clearTimeout(timer); if (slow && !user.aborted) { err = P.short + ' is very busy right now. Wait a moment and ask again.'; if (more) continue; break; } throw e; }
      clearTimeout(timer);
      if ([404, 429, 500, 502, 503, 529].includes(res.status) && more) { const e2 = await apiError(res, P); if (res.status !== 404) err = e2; continue; }
      err = '';
      if (!res.ok) { err = await apiError(res, P); if (c.model && (res.status === 404 || res.status === 400) && /model/i.test(err)) err += ' Choose another model in Settings.'; break; }
      if (!c.model && c.lastBy[c.provider] !== models[i]) { const c2 = conf(); c2.lastBy[c.provider] = models[i]; store(c2); }
      reply.view.via = models[i];
      chat.push(reply);
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
          if (!line.startsWith('data:')) continue;
          const ev = readEvent(c.provider, line.slice(5).trim());
          if (ev.cut) reply.view.err = 'The answer was cut short. Ask for a shorter answer, or ask it to continue.';
          if (ev.err) reply.view.err = ev.err;
          if (ev.text) { reply.view.text += ev.text; reply.parts[0].text = reply.view.text; paintLast(); }
        }
      }
      if (!reply.view.text && !reply.view.err) reply.view.err = 'No answer came back. Try asking again.';
      break;
    }
  } catch (e) {
    if (e.name === 'AbortError') { if (chat[chat.length - 1] === reply) reply.view.err = 'Stopped.'; else err = 'Stopped.'; }
    else err = navigator.onLine === false ? 'You are offline. ' + P.short + ' needs the internet.' : 'Could not reach ' + P.name + '. Check your connection and try again.';
  }
  if (err) chat.push({ role: 'model', parts: [{ text: '' }], view: { text: '', err } });
  if (!reply.parts[0].text && chat.includes(reply)) reply.parts[0].text = reply.view.err || '…';
  busy = null;
  if (sendBtn && document.body.contains(sendBtn)) { sendBtn.innerHTML = ICONS.send; sendBtn.setAttribute('aria-label', 'Send'); }
  renderMsgs();
}
function paintLast() {
  const box = $('#aiMsgs'); if (!box) return;
  const last = box.lastElementChild;
  const html = '<div class="aimd">' + md(chat[chat.length - 1].view.text) + '</div>';
  if (last && last.classList.contains('model') && !last.querySelector('.aidots')) last.innerHTML = html;
  else { if (last && last.querySelector('.aidots')) last.remove(); box.insertAdjacentHTML('beforeend', '<div class="aim model">' + html + '</div>'); }
  box.scrollTop = box.scrollHeight;
}
async function apiError(res, P) {
  let msg = '';
  try { const j = await res.json(); msg = (j.error && (j.error.message || (typeof j.error === 'string' ? j.error : ''))) || j.message || ''; } catch (e) { }
  if (res.status === 400 && /api key/i.test(msg) || res.status === 401 || res.status === 403) return 'Your ' + P.name + ' API key was not accepted. Open Settings (the gear) and check it.';
  if (res.status === 402) return 'Your ' + P.name + ' account has no credit left. Add credit on their site, or choose another AI company in Settings.';
  if (res.status === 429) return P.short + '\'s limit is used up for now. Wait a minute and ask again.';
  if (res.status === 503 || res.status === 529) return P.short + ' is very busy right now. Wait a moment and ask again.';
  if (res.status === 400 && /mime|unsupported|inline|image/i.test(msg)) return P.short + ' could not read that file. Try another photo.';
  return P.short + ' could not answer (' + res.status + (msg ? ': ' + String(msg).slice(0, 140) : '') + ').';
}

// ---------- minimal, safe markdown ----------
export function md(s) {
  const lines = esc(s).split('\n'); let out = '', list = '';
  const inl = t => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const end = () => { if (list) { out += '</' + list + '>'; list = ''; } };
  for (const l of lines) {
    let m;
    if ((m = /^\s*[-*•]\s+(.*)/.exec(l))) { if (list !== 'ul') { end(); out += '<ul>'; list = 'ul'; } out += '<li>' + inl(m[1]) + '</li>'; }
    else if ((m = /^\s*\d+[.)]\s+(.*)/.exec(l))) { if (list !== 'ol') { end(); out += '<ol>'; list = 'ol'; } out += '<li>' + inl(m[1]) + '</li>'; }
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { end(); out += '<hr>'; }
    else if ((m = /^#{1,4}\s+(.*)/.exec(l))) { end(); out += '<p class="aihd">' + inl(m[1]) + '</p>'; }
    else if (l.trim()) { end(); out += '<p>' + inl(l) + '</p>'; }
    else end();
  }
  end();
  return out;
}

// ---------- AI settings: company, key and model ----------
const listed = {}; // provider → model list fetched with the key, for this session
async function listModels(p, key) {
  const get = (u, h) => fetch(u, { headers: h }).then(async r => { if (!r.ok) { const e = new Error('http'); e.status = r.status; throw e; } return r.json(); });
  let out = [];
  if (p === 'gemini') {
    const j = await get(GAPI + '?pageSize=200', { 'x-goog-api-key': key });
    out = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/.test(m.name) && !/tts|image|embed|live|audio|robotics|transcribe|veo|lyria|omni|research|antigravity/i.test(m.name))
      .map(m => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || '' }));
  } else if (p === 'anthropic') {
    const j = await get('https://api.anthropic.com/v1/models?limit=100', { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
    out = (j.data || []).map(m => ({ id: m.id, name: m.display_name || '' }));
  } else if (p === 'openai') {
    const j = await get('https://api.openai.com/v1/models', { Authorization: 'Bearer ' + key });
    out = (j.data || []).map(m => m.id).filter(id => /^(gpt|o\d|chatgpt)/.test(id) && !/audio|realtime|transcribe|tts|image|search|embed|instruct|moderation|codex|dall/i.test(id)).sort().reverse().map(id => ({ id, name: '' }));
  } else {
    await get('https://openrouter.ai/api/v1/key', { Authorization: 'Bearer ' + key }); // checks the key
    const j = await get('https://openrouter.ai/api/v1/models', {});
    out = (j.data || []).filter(m => { const a = m.architecture || {}; return !a.output_modalities || a.output_modalities.includes('text'); }).map(m => ({ id: m.id, name: m.name || '' })).sort((a, b) => a.id.localeCompare(b.id));
  }
  return out;
}
export function keySheet(then) {
  const c = conf();
  let p = c.provider;
  const draft = { keys: Object.assign({}, c.keys), models: Object.assign({}, c.models) };
  sheet('<div class="shh"><h2>AI assistant</h2><button type="button" class="ib" data-close aria-label="Close">' + ICONS.x + '</button></div>' +
    '<p class="sub">Use your own API key from the AI company you prefer. Keys are saved only on this device: never in your progress file, never synced.</p>' +
    '<p class="ailab" id="aiPL">AI company</p><div class="aiprov" role="radiogroup" aria-labelledby="aiPL">' +
    ORDER.map(k => '<button type="button" role="radio" data-p="' + k + '"><b>' + esc(PROVIDERS[k].name) + '</b><small>' + (k === 'gemini' ? 'free key' : k === 'openrouter' ? 'many models, some free' : 'paid key') + '</small></button>').join('') + '</div>' +
    '<div id="aiPbox"></div>' +
    '<p class="aierr" id="aiKeyErr" hidden></p>' +
    '<div class="row2"><button type="button" class="btn sec" id="aiDel">Remove key</button><button type="button" class="btn vio" id="aiSave">Save</button></div>',
    { label: 'AI assistant' });
  const box = $('#aiPbox'), e = $('#aiKeyErr');
  const keyNow = () => ($('#aiKey') ? $('#aiKey').value.trim() : draft.keys[p] || '');
  const keep = () => { const k = $('#aiKey'); if (k) draft.keys[p] = k.value.trim(); const sel = $('#aiModel'); if (sel) draft.models[p] = sel.value === '*' ? ($('#aiModelId').value.trim()) : sel.value; };
  function modelOptions() {
    const P = PROVIDERS[p], cur = draft.models[p] || '', list = listed[p] || [];
    const ids = list.map(m => m.id);
    let o = '<option value="">Recommended · ' + esc(P.rec) + '</option>';
    if (cur && !ids.includes(cur)) o += '<option value="' + esc(cur) + '">' + esc(cur) + '</option>';
    o += list.map(m => '<option value="' + esc(m.id) + '">' + esc(m.id) + (m.name && m.name !== m.id ? ' · ' + esc(m.name) : '') + '</option>').join('');
    o += '<option value="*">Type a model ID…</option>';
    return o;
  }
  function paint() {
    const P = PROVIDERS[p];
    document.querySelectorAll('.aiprov [data-p]').forEach(b => { const on = b.dataset.p === p; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    box.innerHTML =
      '<label class="ailab" for="aiKey">' + esc(P.name) + ' API key</label>' +
      '<input id="aiKey" class="aikey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste your key" value="' + esc(draft.keys[p] || '') + '">' +
      '<p class="sub aikh">' + esc(P.keyHint) + ' Get one at <a href="' + P.keyUrl + '" target="_blank" rel="noopener">' + esc(P.site) + '</a>.</p>' +
      '<label class="ailab" for="aiModel">Model</label>' +
      '<div class="aimodel"><select id="aiModel" class="aikey">' + modelOptions() + '</select><button type="button" class="btn sec" id="aiLoad">' + (listed[p] ? 'Refresh model list' : 'Show all models') + '</button></div>' +
      '<input id="aiModelId" class="aikey" placeholder="Model ID, for example ' + esc(P.backup[0] || P.rec) + '" hidden>' +
      '<p class="sub" id="aiMNote">Recommended is the model ' + esc(P.name.split(' ')[0]) + ' suggests to start with. ' + (P.video ? 'Text, voice, photos and videos.' : 'Text, voice typing and photos. Videos and voice recordings need Google Gemini.') + (p === 'gemini' ? ' With the recommended model, a busy model is skipped for the next one.' : '') + '</p>';
    const sel = $('#aiModel'); sel.value = draft.models[p] || '';
    sel.onchange = () => { const t = $('#aiModelId'); t.hidden = sel.value !== '*'; if (!t.hidden) t.focus(); };
    $('#aiLoad').onclick = load;
    $('#aiKey').oninput = () => { e.hidden = true; };
    $('#aiDel').hidden = !draft.keys[p];
  }
  async function load() {
    keep();
    const k = keyNow(), b = $('#aiLoad');
    if (!k) { e.hidden = false; e.textContent = 'Paste your API key first.'; return; }
    b.disabled = true; b.textContent = 'Checking…'; e.hidden = true;
    try { listed[p] = await listModels(p, k); paint(); toast('Key accepted. ' + listed[p].length + ' models available.'); }
    catch (x) { b.disabled = false; b.textContent = 'Show all models'; e.hidden = false; e.textContent = x.status === 401 || x.status === 403 || x.status === 400 ? 'That key was not accepted by ' + PROVIDERS[p].name + '. Check it was copied in full.' : 'Could not reach ' + PROVIDERS[p].name + '. Check your connection.'; }
  }
  document.querySelectorAll('.aiprov [data-p]').forEach(b => b.onclick = () => { keep(); p = b.dataset.p; e.hidden = true; paint(); });
  paint();
  $('#aiDel').onclick = () => { delete draft.keys[p]; const c2 = conf(); delete c2.keys[p]; store(c2); toast(PROVIDERS[p].name + ' key removed from this device.'); paint(); };
  $('#aiSave').onclick = () => {
    keep();
    const k = draft.keys[p] || '';
    if (!/^\S{20,}$/.test(k)) { e.hidden = false; e.textContent = 'That does not look like an API key. It is a long code with no spaces. ' + PROVIDERS[p].keyHint; return; }
    if ($('#aiModel').value === '*' && !draft.models[p]) { e.hidden = false; e.textContent = 'Type the model ID, or choose the recommended model.'; return; }
    const c2 = conf();
    store({ provider: p, keys: draft.keys, models: draft.models, lastBy: c2.lastBy });
    closeSheet(true); toast(PROVIDERS[p].name + ' is connected' + (draft.models[p] ? ' (' + draft.models[p] + ').' : ', using its recommended model.'));
    if (then) then();
  };
}

export const ready = () => !!conf().key;
export const isBusy = () => !!busy || sheetOpen();
