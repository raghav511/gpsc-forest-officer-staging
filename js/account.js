// Sign in with Google, and keep each student's progress in a private app folder in THEIR OWN Google Drive.
// Nothing goes to the app's maker: the browser talks straight to Google. The app only ever sees the one file
// it made (scope drive.appdata: Drive's hidden, per-app folder), plus the email address to show who is signed in.
// Sign-in uses Google's redirect page (works in iPad and iPhone home-screen apps, where pop-ups do not).
// Google gives a browser app a one-hour pass; after that, Sync signs in again in a second, without a password.
import { lsGet, lsSet, lsDel, settings, saveSettings } from './core.js?v=gsscrfo-2fc7a97e47';
import { GOOGLE_CLIENT_ID } from './config.js?v=gsscrfo-2fc7a97e47';

const TKEY = 'gsscrfo-gtoken';   // {token, exp} on this device only: never in the progress file or synced
const PKEY = 'gsscrfo-gpending'; // {state, back, then} while the student is on Google's page
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata openid email';
const FILE = window.__gpsStaging ? 'gsscrfo-progress-sandbox.json' : 'gsscrfo-progress.json'; // the sandbox website keeps its own file
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export const configured = () => /\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID || '');
export const account = () => settings.account || null;           // {email}
export function token() { const t = lsGet(TKEY, null); return t && t.exp > Date.now() + 60000 ? t.token : ''; }
export const signedIn = () => !!account();
const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

// Leave for Google's sign-in page. `then` ('sync') is done when the student comes back.
export function signIn(opts) {
  opts = opts || {};
  if (!configured()) throw new Error('not-configured');
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  lsSet(PKEY, { state, back: opts.back || location.hash || '#/', then: opts.then || 'sync', at: Date.now() });
  const p = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'token', scope: SCOPE, include_granted_scopes: 'true', state });
  const hint = opts.email || (account() && account().email);
  if (hint) p.set('login_hint', hint);
  if (opts.silent) p.set('prompt', 'none'); else if (!hint) p.set('prompt', 'select_account');
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
}

// Called first thing at start-up: if we are coming back from Google, keep the pass and tidy the address.
// Returns {ok, then, back, error} or null when this is a normal start.
export function takeRedirect() {
  const h = location.hash || '';
  if (!/[#&](access_token|error)=/.test(h)) return null;
  const q = new URLSearchParams(h.replace(/^#/, ''));
  const pend = lsGet(PKEY, null); lsDel(PKEY);
  const back = (pend && pend.back) || '#/';
  history.replaceState(null, '', location.pathname + location.search.replace(/[?&]fresh=\d+/, '') + back);
  if (!pend || q.get('state') !== pend.state) return { ok: false, back, error: 'state' };
  if (q.get('error')) return { ok: false, back, error: q.get('error'), then: pend.then };
  const scopes = (q.get('scope') || '').split(' ');
  if (!scopes.some(s => /drive\.appdata/.test(s))) return { ok: false, back, error: 'scope' };
  lsSet(TKEY, { token: q.get('access_token'), exp: Date.now() + (+q.get('expires_in') || 3600) * 1000 });
  return { ok: true, back, then: pend.then };
}

async function api(url, init) {
  const t = token();
  if (!t) { const e = new Error('expired'); e.code = 'expired'; throw e; }
  const res = await fetch(url, Object.assign({}, init, { headers: Object.assign({ Authorization: 'Bearer ' + t }, (init && init.headers) || {}) }));
  if (res.status === 401) { lsDel(TKEY); const e = new Error('expired'); e.code = 'expired'; throw e; }
  if (!res.ok) { const e = new Error('drive ' + res.status); e.code = res.status === 403 ? 'denied' : 'http'; e.status = res.status; throw e; }
  return res;
}
// who is signed in (shown in Settings, and used as the hint next time)
export async function whoAmI() {
  const j = await (await api('https://www.googleapis.com/oauth2/v3/userinfo')).json();
  settings.account = { email: j.email || '' }; saveSettings();
  return settings.account;
}
async function findFile() {
  const q = encodeURIComponent("name='" + FILE + "' and trashed=false");
  const j = await (await api(DRIVE + '?spaces=appDataFolder&q=' + q + '&fields=files(id,modifiedTime)&orderBy=modifiedTime desc')).json();
  return (j.files || [])[0] || null;
}
// the progress kept in Drive (null when this account has none yet)
export async function readDrive() {
  const f = await findFile();
  if (!f) return { id: null, data: null };
  const data = await (await api(DRIVE + '/' + f.id + '?alt=media')).json().catch(() => null);
  return { id: f.id, data };
}
export async function writeDrive(id, data) {
  const body = JSON.stringify(data);
  if (id) { await api(UPLOAD + '/' + id + '?uploadType=media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }); return id; }
  const b = 'gsscrfo' + Date.now();
  const multi = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: FILE, parents: ['appDataFolder'] }) +
    '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n--' + b + '--';
  const j = await (await api(UPLOAD + '?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: multi })).json();
  return j.id;
}
export function signOut() {
  const t = lsGet(TKEY, null);
  if (t && t.token) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.token), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).catch(() => { });
  lsDel(TKEY); delete settings.account; saveSettings();
}
