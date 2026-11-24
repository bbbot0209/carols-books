/* Calendar Plus — client-only. The Google access token stays in this browser (sessionStorage);
   every request goes straight from the browser to www.googleapis.com. */
(function () {
'use strict';

const API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const PROP = 'cpCategory';
const OTHER = 'Other';
const LS = { cals: 'cp.cals', cats: 'cp.cats', local: 'cp.localcat', view: 'cp.view' };
const TOKEN_KEY = 'cp.token';
const APPV = '20261124a';

const DEFAULT_CATS = [
  { name: 'Birthdays', color: '#e07b9b', words: ['birthday', 'bday', 'b-day', 'b\'day'] },
  { name: 'Doctor & health', color: '#d8826f', words: ['dr', 'doctor', 'appointment', 'appt', 'dentist', 'dental', 'md', 'clinic', 'pt', 'physical therapy', 'physio', 'checkup', 'check-up', 'check up', 'physical', 'mammogram', 'dermatologist', 'derm', 'eye exam', 'optometrist', 'ophthalmologist', 'cardiologist', 'hospital', 'labs', 'lab work', 'blood test', 'bloodwork', 'x-ray', 'mri', 'ultrasound', 'therapist', 'colonoscopy', 'vaccine', 'flu shot', 'pharmacy', 'orthopedist', 'podiatrist', 'hygienist', 'surgery', 'urgent care', 'nurse', 'medical'] },
  { name: 'Exercise', color: '#6fae8c', words: ['gym', 'yoga', 'pilates', 'swim', 'swimming', 'walk', 'walking', 'hike', 'tennis', 'pickleball', 'golf', 'class', 'workout', 'exercise', 'fitness', 'spin', 'cycling', 'bike', 'run', 'running', 'barre', 'trainer', 'training', 'zumba', 'stretch', 'stretching', 'aqua', 'tai chi', 'weights'] },
  { name: 'Holidays', color: '#d9a441', words: ['holiday', 'thanksgiving', 'christmas', 'xmas', 'christmas eve', 'hanukkah', 'chanukah', 'passover', 'seder', 'easter', 'rosh hashanah', 'yom kippur', 'sukkot', 'purim', 'new year\'s', 'new years', 'new year’s', 'independence day', 'fourth of july', '4th of july', 'memorial day', 'labor day', 'mlk day', 'martin luther king', 'presidents day', 'presidents\' day', 'veterans day', 'columbus day', 'indigenous peoples', 'juneteenth', 'halloween', 'valentine', 'valentine\'s day', 'mother\'s day', 'mother’s day', 'mothers day', 'father\'s day', 'father’s day', 'fathers day', 'kwanzaa', 'diwali', 'ramadan', 'eid', 'lunar new year', 'good friday', 'st. patrick', 'election day'] },
  { name: 'Meetings', color: '#5b8fc7', words: ['meeting', 'mtg', 'reception', 'faculty', 'board', 'committee', 'conference', 'council', 'trustees', 'seminar', 'webinar', 'zoom', 'luncheon', 'town hall', 'staff', 'department', 'dept'] },
  { name: 'Reminders', color: '#7aa6a1', words: ['reminder', 'remind', 'renew', 'renewal', 'due', 'deadline', 'pay', 'bill', 'expires', 'expiration', 'to do', 'todo', 'rsvp'] },
  { name: 'Shows', color: '#8c7bc4', words: ['concert', 'theater', 'theatre', 'opera', 'ballet', 'symphony', 'philharmonic', 'orchestra', 'show', 'performance', 'tickets', 'ticket', 'matinee', 'museum', 'broadway', 'musical', 'recital', 'gallery', 'exhibit', 'exhibition', 'jazz', 'movie', 'film', 'cinema', 'festival', 'carnegie', 'lincoln center', 'met opera', 'play'] },
];
const EXTRA_COLORS = ['#d9a441', '#5b9bd5', '#c46fa0', '#7aa6a1', '#b5835a', '#9b9b4f', '#e07b9b', '#6c8ebf'];
const OTHER_COLOR = '#a8a29a';
// renamed categories: old name (still stored on events / in settings) -> new name
const RENAMED = { 'Performances & shows': 'Shows' };
const canon = n => RENAMED[n] || n;

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const S = {
  token: null, calendars: [], selected: load(LS.cals, null), items: [],
  view: load(LS.view, 'list'), cat: 'all', q: '', range: 'upcoming', sort: 'asc',
  from: '', to: '', month: null, selDay: null, editing: null, loading: false,
};

/* ---------------- categories ---------------- */
function catConfig() {
  const c = load(LS.cats, null) || {};
  const words = c.words || {};
  const custom = c.custom || [];
  const list = DEFAULT_CATS.map(d => ({ name: d.name, color: d.color, words: words[d.name] || words[Object.keys(RENAMED).find(k => RENAMED[k] === d.name)] || d.words.slice(), builtin: true }));
  custom.forEach((n, i) => { if (!list.some(x => x.name === n)) list.push({ name: n, color: EXTRA_COLORS[i % EXTRA_COLORS.length], words: words[n] || [], builtin: false }); });
  return list;
}
function saveCatConfig(list) {
  const words = {}; list.forEach(c => { words[c.name] = c.words; });
  save(LS.cats, { words, custom: list.filter(c => !c.builtin).map(c => c.name) });
}
let CATS = catConfig();
function allCats() {
  // configured + any names found on events (set on another device) + Other
  const names = CATS.map(c => c.name);
  const out = CATS.slice();
  S.items.forEach(it => {
    if (it.catSource === 'manual' && it.cat !== OTHER && !names.includes(it.cat)) {
      names.push(it.cat); out.push({ name: it.cat, color: EXTRA_COLORS[(out.length) % EXTRA_COLORS.length], words: [], builtin: false, found: true });
    }
  });
  out.push({ name: OTHER, color: OTHER_COLOR, words: [], builtin: true, other: true });
  return out;
}
function catColor(name) { const c = allCats().find(x => x.name === name); return c ? c.color : OTHER_COLOR; }

const reCache = new Map();
function wordRe(w) {
  if (!reCache.has(w)) {
    const e = w.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    reCache.set(w, new RegExp('(^|[^a-z0-9])' + e + '(s|es)?\\.?(?=$|[^a-z0-9])', 'i'));
  }
  return reCache.get(w);
}
// Google's own Birthdays / Holidays calendars sort straight into those categories.
function calCategory(cal, ev) {
  const id = String((cal && cal.id) || '');
  if ((ev && ev.eventType === 'birthday') || id.startsWith('addressbook#contacts@')) return 'Birthdays';
  if (id.includes('#holiday@')) return 'Holidays';
  return '';
}
function autoCategory(ev, cats) {
  cats = cats || CATS;
  // "Dr" anywhere wins (Carol 11/23). In location/notes it must be followed by a name, so "12 Oak Dr" (Drive) doesn't count.
  if (cats.some(c => c.name === 'Doctor & health')) {
    if (/(^|[^a-z0-9])dr\.?(?=$|[^a-z0-9])/i.test(String(ev.summary || '')) ||
        [ev.location, ev.description].some(x => /(^|[^A-Za-z0-9])[Dd][Rr]\.?\s*[A-Z]/.test(String(x || '')))) return 'Doctor & health';
  }
  const fields = [ev.summary, ev.location, ev.description].map(x => String(x || '').toLowerCase());
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (!f) continue;
    // bare "dr" outside the title is handled above (could be "Drive")
    for (const c of cats) if (c.words.some(w => w.trim() && !(i && /^dr\.?$/i.test(w.trim())) && wordRe(w).test(f))) return c.name;
  }
  return OTHER;
}

/* ---------------- dates ---------------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const fmtDay = d => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = d => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const fmtDate = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function normalize(cal, ev) {
  const allDay = !!(ev.start && ev.start.date);
  const start = allDay ? parseYmd(ev.start.date) : new Date(ev.start.dateTime);
  const end = ev.end ? (allDay ? parseYmd(ev.end.date) : new Date(ev.end.dateTime)) : start;
  const priv = (ev.extendedProperties && ev.extendedProperties.private) || {};
  const local = load(LS.local, {})[cal.id + '|' + ev.id];
  const manual = canon(priv[PROP] || local || '');
  const canEdit = cal.accessRole === 'owner' || cal.accessRole === 'writer';
  return {
    key: cal.id + '|' + ev.id, cal, ev, allDay, start, end,
    lastDay: allDay ? addDays(end, -1) : end,
    title: ev.summary || '(No title)', cat: manual || calCategory(cal, ev) || autoCategory(ev), catSource: manual ? 'manual' : 'auto', canEdit,
  };
}
function recategorize() { S.items = S.items.map(it => normalize(it.cal, it.ev)); }

/* ---------------- Google API ---------------- */
class AuthError extends Error {}
async function gapi(method, path, body) {
  if (!S.token) throw new AuthError('signed out');
  const r = await fetch(API + path, {
    method, headers: Object.assign({ Authorization: 'Bearer ' + S.token }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { signOutLocal(); throw new AuthError('expired'); }
  if (!r.ok) { let m = r.status + ''; try { m = (await r.json()).error.message || m; } catch (e) {} throw new Error(m); }
  return r.status === 204 ? null : r.json().catch(() => null);
}
const enc = encodeURIComponent;

async function loadCalendars() {
  let items = [], pt = '';
  do {
    const r = await gapi('GET', '/users/me/calendarList?maxResults=250' + (pt ? '&pageToken=' + enc(pt) : ''));
    items = items.concat(r.items || []); pt = r.nextPageToken;
  } while (pt);
  items.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || (a.summaryOverride || a.summary || '').localeCompare(b.summaryOverride || b.summary || ''));
  S.calendars = items;
  // no saved choice, or a saved choice that matches none of her calendars → the defaults (an empty list showed "No events")
  if (!S.selected || !items.some(c => S.selected.includes(c.id))) S.selected = items.filter(c => c.primary || c.selected).map(c => c.id);
  if (!S.selected.length && items.length) S.selected = [items[0].id];
}
async function loadEvents() {
  const now = new Date();
  const tMin = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()).toISOString();
  const tMax = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate() + 1).toISOString();
  const cals = S.calendars.filter(c => S.selected.includes(c.id));
  const bad = [];
  const per = await Promise.all(cals.map(async cal => { try {
    let out = [], pt = '';
    do {
      const r = await gapi('GET', '/calendars/' + enc(cal.id) + '/events?singleEvents=true&orderBy=startTime&maxResults=2500'
        + '&timeMin=' + enc(tMin) + '&timeMax=' + enc(tMax) + (pt ? '&pageToken=' + enc(pt) : ''));
      out = out.concat((r.items || []).filter(e => e.status !== 'cancelled' && e.start).map(e => normalize(cal, e)));
      pt = r.nextPageToken;
    } while (pt);
    return out;
  } catch (e) {
    // one calendar that won't load (holidays, birthdays, a shared one) must not blank all the others
    if (e instanceof AuthError) throw e;
    bad.push((cal.summaryOverride || cal.summary || 'a calendar') + ' (' + e.message + ')'); return [];
  } }));
  if (bad.length && bad.length === cals.length) throw new Error(bad.join('; '));
  S.items = per.flat();
  S.loadWarn = bad.length ? 'Could not load ' + bad.join('; ') : '';
}
async function reload() {
  S.loading = true; setStatus('Loading your calendar…'); render();
  try {
    await loadCalendars(); await loadEvents(); setStatus(S.loadWarn || '');
  } catch (e) {
    if (e instanceof AuthError) return showSignin();
    setStatus('Could not load: ' + e.message);
  } finally { S.loading = false; render(); }
}

/* ---------------- auth (Google Identity Services, token model) ---------------- */
let tokenClient = null;
function gisReady() {
  const cid = (window.CP_CONFIG || {}).clientId;
  const btn = $('#signinBtn');
  if (!cid) { btn.disabled = true; $('#signinNote').textContent = 'Sign-in is not set up yet.'; return; }
  if (!(window.google && google.accounts && google.accounts.oauth2)) return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: cid, scope: SCOPES,
    callback: resp => {
      if (!resp || resp.error || !resp.access_token) { toast('Sign-in did not finish.'); return; }
      if (google.accounts.oauth2.hasGrantedAllScopes && !google.accounts.oauth2.hasGrantedAllScopes(resp, ...SCOPES.split(' '))) {
        toast('Please allow calendar access to continue.');
      }
      setToken(resp.access_token, resp.expires_in);
      showApp(); reload();
    },
  });
  btn.disabled = false;
  btn.dataset.ready = '1';
}
window.cpGisReady = gisReady;
function setToken(t, expiresIn) {
  S.token = t;
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ t, exp: Date.now() + ((+expiresIn || 3600) - 60) * 1000 }));
}
function restoreToken() {
  try { const v = JSON.parse(sessionStorage.getItem(TOKEN_KEY)); if (v && v.t && v.exp > Date.now()) { S.token = v.t; return true; } } catch (e) {}
  return false;
}
function signOutLocal() { S.token = null; sessionStorage.removeItem(TOKEN_KEY); }
function signIn() { if (tokenClient) tokenClient.requestAccessToken({ prompt: '' }); }
function signOut() {
  const t = S.token; signOutLocal(); S.items = []; S.calendars = [];
  if (t && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(t, () => {});
  closeDlg($('#setDlg')); showSignin();
}
function showSignin() { $('#app').hidden = true; $('#signin').hidden = false; }
function showApp() { $('#signin').hidden = true; $('#app').hidden = false; }

/* ---------------- filtering ---------------- */
// the chosen date range as [from, to) — null = open-ended
function rangeBounds() {
  const today = startOfDay(new Date());
  let from = null, to = null;
  if (S.range === 'upcoming') from = today;
  else if (S.range === 'past') to = today;
  else if (S.range === 'today') { from = today; to = addDays(today, 1); }
  else if (S.range === 'tomorrow') { from = addDays(today, 1); to = addDays(today, 2); }  // next day's summary (Carol 11/23)
  else if (S.range === 'week') { from = addDays(today, -today.getDay()); to = addDays(from, 7); }  // Sun–Sat containing today
  else if (S.range === 'next7') { from = today; to = addDays(today, 7); }  // today + 6 days
  else if (S.range === 'custom') { if (S.from) from = parseYmd(S.from); if (S.to) to = addDays(parseYmd(S.to), 1); }
  return { from, to };
}
function filtered(ignoreRange) {
  const q = S.q.trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  let from = null, to = null;
  // a search looks through every loaded event — any date, any category (Carol 11/23)
  if (!ignoreRange && !terms.length) ({ from, to } = rangeBounds());
  const out = S.items.filter(it => {
    if (!terms.length && S.cat !== 'all' && it.cat !== S.cat) return false;
    if (from && !(it.end > from || (+it.end === +it.start && it.start >= from))) return false;
    if (to && it.start >= to) return false;
    if (terms.length) {
      const hay = [it.title, it.ev.location, it.ev.description, it.cat].join(' ').toLowerCase();
      if (!terms.every(t => hay.includes(t))) return false;
    }
    return true;
  });
  const dir = S.sort === 'desc' ? -1 : 1;
  out.sort((a, b) => dir * (a.start - b.start || a.title.localeCompare(b.title)));
  return out;
}
// e.g. "Doctor & health — Nov 23, 2026 to Feb 28, 2027" (print header)
function rangeLabel() {
  if (S.q.trim() || S.range === 'all') return 'All dates';
  const { from, to } = rangeBounds();
  const last = to && addDays(to, -1);
  if (from && last) return +from === +last ? fmtDate(from) : fmtDate(from) + ' to ' + fmtDate(last);
  if (from) return (S.range === 'upcoming' ? 'Upcoming from ' : 'From ') + fmtDate(from);
  if (last) return S.range === 'past' ? 'Before ' + fmtDate(to) : 'Through ' + fmtDate(last);
  return 'All dates';
}
function filterLabel() {
  if (S.q.trim()) return 'Search “' + S.q.trim() + '” — All dates';
  return (S.cat === 'all' ? 'All categories' : S.cat) + ' — ' + rangeLabel();
}

/* ---------------- render ---------------- */
function setStatus(t) { $('#status').textContent = t; }
let toastT;
function toast(t) { const m = $('#msg'); m.textContent = t; m.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => m.classList.remove('on'), 2600); }

function renderChips() {
  const cats = allCats();
  const counts = {}; S.items.forEach(it => { counts[it.cat] = (counts[it.cat] || 0) + 1; });
  if (S.cat !== 'all' && !cats.some(c => c.name === S.cat)) S.cat = 'all';
  $('#catChips').innerHTML = '<button data-cat="all" class="' + (S.cat === 'all' ? 'on' : '') + '">All</button>' +
    cats.map(c => '<button data-cat="' + esc(c.name) + '" class="' + (S.cat === c.name ? 'on' : '') + '"><span class="dot" style="background:' + c.color + '"></span>' + esc(c.name) + '</button>').join('');
}
function timeLabel(it, day) {
  if (it.allDay) return 'All day';
  if (day && startOfDay(it.start) < startOfDay(day)) return 'cont.';
  return fmtTime(it.start);
}
/* location → a link: a web address (Zoom etc.) opens itself, anything else opens Google Maps */
function locHref(loc) {
  loc = String(loc || '').trim(); if (!loc) return '';
  const m = loc.match(/\bhttps?:\/\/[^\s<>"']+/i) || loc.match(/(^|\s)(www\.[^\s<>"']+)/i);
  if (m) return m[2] ? 'https://' + m[2] : m[0];
  return 'https://www.google.com/maps/search/?api=1&query=' + enc(loc);
}
function locLink(loc, cls) {
  const h = locHref(loc); if (!h) return '';
  return '<a class="' + cls + '" href="' + esc(h) + '" target="_blank" rel="noopener">' + esc(String(loc).trim()) + '</a>';
}

/* overlaps: timed events whose times cross another timed event (all-day events don't count) */
const overlapsOf = (a, b) => a.start < b.end && b.start < a.end;
function sameEvent(a, b) { return a.ev.id === b.ev.id || (a.ev.iCalUID && a.ev.iCalUID === b.ev.iCalUID && +a.start === +b.start); }
let OVL = new Map();
function computeOverlaps() {
  const timed = S.items.filter(it => !it.allDay && it.end > it.start).sort((a, b) => a.start - b.start);
  const out = new Map();
  for (let i = 0; i < timed.length; i++) {
    const a = timed[i];
    for (let j = i + 1; j < timed.length && timed[j].start < a.end; j++) {
      const b = timed[j];
      if (sameEvent(a, b)) continue;  // one event on two calendars
      if (!out.has(a.key)) out.set(a.key, []); if (!out.has(b.key)) out.set(b.key, []);
      out.get(a.key).push(b); out.get(b.key).push(a);
    }
  }
  OVL = out;
}
function conflictsFor(start, end, skipKey) {
  return S.items.filter(it => !it.allDay && it.key !== skipKey && it.end > it.start && overlapsOf({ start, end }, it))
    .sort((a, b) => a.start - b.start);
}
function evRow(it, day) {
  const c = catColor(it.cat);
  const ov = OVL.get(it.key);
  return '<div class="ev" role="button" tabindex="0" data-key="' + esc(it.key) + '" style="--c:' + c + '">' +
    '<span class="tm">' + esc(timeLabel(it, day)) + '</span><span class="bd"><span class="t">' + esc(it.title) + '</span>' +
    (it.ev.location ? '<div class="loc">' + locLink(it.ev.location, 'loclink') + '</div>' : '') +
    (ov ? '<div class="ovl"><span aria-hidden="true">⚠</span> Overlaps with ' + esc(ov.map(x => x.title).join(', ')) + '</div>' : '') +
    '<span class="pill" style="--pc:' + c + '40">' + esc(it.cat) + '</span></span></div>';
}
function renderList() {
  const items = filtered();
  $('#count').textContent = S.loading && !S.items.length ? '' : items.length + (items.length === 1 ? ' event' : ' events');
  if (!items.length) { $('#list').innerHTML = S.loading ? '' : '<div class="empty">No events</div>'; return; }
  const today = ymd(new Date());
  let html = '', last = '';
  const CAP = 1500;
  items.slice(0, CAP).forEach(it => {
    const d = ymd(it.start);
    if (d !== last) { html += '<div class="day' + (d === today ? ' today' : '') + '">' + esc(fmtDay(it.start)) + (d === today ? ' · Today' : '') + '</div>'; last = d; }
    html += evRow(it);
  });
  if (items.length > CAP) html += '<div class="empty">Showing the first ' + CAP + '. Search or pick dates to narrow.</div>';
  $('#list').innerHTML = html;
}
function itemsOnDay(list, day) {
  const s = startOfDay(day), e = addDays(s, 1);
  return list.filter(it => it.start < e && (it.end > s || (+it.end === +it.start && it.start >= s))).sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
}
function renderMonth() {
  if (!S.month) { const n = new Date(); S.month = new Date(n.getFullYear(), n.getMonth(), 1); }
  const m = S.month;
  $('#mTitle').textContent = m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const list = filtered(true);
  const first = addDays(m, -m.getDay());
  const today = ymd(new Date());
  let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => '<div class="wd">' + d + '</div>').join('');
  const weeks = Math.ceil((m.getDay() + new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) / 7);
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(first, i), k = ymd(d);
    const evs = itemsOnDay(list, d);
    const cls = ['cell'];
    if (d.getMonth() !== m.getMonth()) cls.push('out');
    if (k === today) cls.push('today');
    if (k === S.selDay) cls.push('sel');
    html += '<button class="' + cls.join(' ') + '" data-day="' + k + '"><span class="n">' + d.getDate() + '</span>' +
      evs.slice(0, 3).map(it => '<span class="mt" style="--c:' + catColor(it.cat) + '">' + esc(it.title) + '</span>').join('') +
      (evs.length > 3 ? '<span class="more">+' + (evs.length - 3) + ' more</span>' : '') +
      '<span class="dots">' + evs.slice(0, 4).map(it => '<i style="--c:' + catColor(it.cat) + '"></i>').join('') + '</span></button>';
  }
  $('#mGrid').innerHTML = html;
  if (S.selDay) {
    const d = parseYmd(S.selDay), evs = itemsOnDay(list, d);
    $('#mDay').innerHTML = '<div class="day">' + esc(fmtDay(d)) + '</div>' + (evs.length ? evs.map(it => evRow(it, d)).join('') : '<div class="empty">No events</div>');
  } else $('#mDay').innerHTML = '';
}
function renderPrint() {
  // prints exactly what's filtered: category chip + date range (incl. chosen dates) or the search
  const items = filtered();
  const oneCat = S.cat !== 'all' && !S.q.trim();
  $('#printArea').innerHTML = '<h1>' + esc(filterLabel()) + '</h1><div class="sub">Calendar Plus · ' + items.length + (items.length === 1 ? ' event' : ' events') + ' · printed ' + esc(fmtDay(new Date())) + '</div>' +
    (items.length ? '<table>' + items.map(it => '<tr><td class="d">' + esc(fmtDay(it.start)) + '<br>' + esc(it.allDay ? 'All day' : fmtTime(it.start) + ' – ' + fmtTime(it.end)) + '</td><td><b>' + esc(it.title) + '</b>' +
      (it.ev.location ? '<br>' + esc(it.ev.location) : '') + '</td>' + (oneCat ? '' : '<td>' + esc(it.cat) + '</td>') + '</tr>').join('') + '</table>' : '<p>No events</p>');
}
function render() {
  document.querySelectorAll('#viewTabs button').forEach(b => b.classList.toggle('on', b.dataset.v === S.view));
  $('#listView').hidden = S.view !== 'list';
  $('#monthView').hidden = S.view !== 'month';
  $('#rangeBar').hidden = false;
  $('#range').hidden = $('#sort').hidden = S.view === 'month';
  $('#customRange').hidden = !(S.range === 'custom' && S.view === 'list');
  renderChips();
  computeOverlaps();
  if (S.view === 'list') renderList(); else renderMonth();
  renderPrint();
}

/* ---------------- dialogs ---------------- */
function openDlg(d) { if (!d.open) d.showModal(); }
function closeDlg(d) { if (d.open) d.close(); }
/* small question box (confirmDlg): resolves with the chosen button's value, or null on Cancel/Escape */
let chooseDone = null;
function choose(title, body, buttons) {
  if (chooseDone) chooseDone(null);
  const d = $('#confirmDlg');
  $('#cTitle').textContent = title; $('#cBody').textContent = body || '';
  $('#cBtns').className = 'btns' + (buttons.length > 2 ? ' stack' : '');
  $('#cBtns').innerHTML = buttons.map((b, i) => '<button type="button" id="' + b.id + '" data-i="' + i + '"' + (b.cls ? ' class="' + b.cls + '"' : '') + '>' + esc(b.label) + '</button>').join('');
  return new Promise(res => {
    chooseDone = v => { chooseDone = null; closeDlg(d); res(v); };
    $('#cBtns').onclick = e => { const b = e.target.closest('[data-i]'); if (b && chooseDone) chooseDone(buttons[+b.dataset.i].value); };
    d.oncancel = e => { e.preventDefault(); if (chooseDone) chooseDone(null); };
    openDlg(d);
  });
}
function writableCals() { return S.calendars.filter(c => (c.accessRole === 'owner' || c.accessRole === 'writer')); }
function calName(c) { return c.summaryOverride || c.summary || c.id; }

function fillCatSelect(sel, current, autoName) {
  sel.innerHTML = '<option value="">Automatic' + (autoName ? ' (' + esc(autoName) + ')' : '') + '</option>' +
    allCats().map(c => '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>').join('');
  sel.value = current || '';
}
function syncLocLink() {
  const v = $('#fLoc').value.trim(), a = $('#fLocLink'), h = locHref(v);
  a.hidden = !h; if (!h) return;
  a.href = h; a.textContent = h.indexOf('https://www.google.com/maps/') === 0 ? 'Open in Google Maps' : 'Open link';
}
function syncAllDay() { document.querySelectorAll('.tmf').forEach(x => { x.hidden = $('#fAllDay').checked; }); }

function openEditor(it, presetDay) {
  S.editing = it || null;
  const f = $('#evForm'); f.reset();
  $('#evTitle').textContent = it ? 'Edit event' : 'New event';
  $('#evDelete').hidden = !(it && it.canEdit);
  $('#calWrap').hidden = !!it;
  const ro = it && !it.canEdit;
  ['fTitle', 'fAllDay', 'fSD', 'fST', 'fED', 'fET', 'fLoc', 'fNotes'].forEach(id => { $('#' + id).disabled = !!ro; });
  $('#fNote').hidden = true;
  if (it) {
    $('#fTitle').value = it.ev.summary || '';
    $('#fAllDay').checked = it.allDay;
    $('#fSD').value = ymd(it.start); $('#fED').value = ymd(it.lastDay);
    $('#fST').value = it.allDay ? '09:00' : hm(it.start); $('#fET').value = it.allDay ? '10:00' : hm(it.end);
    $('#fLoc').value = it.ev.location || ''; $('#fNotes').value = it.ev.description || '';
    const manual = it.catSource === 'manual' ? it.cat : '';
    fillCatSelect($('#fCat'), manual, autoCategory(it.ev));
    const notes = [];
    if (ro) notes.push('This calendar is view-only. Category saves on this device only.');
    if (it.ev.recurringEventId && it.canEdit) notes.push('Repeating event.');
    if (notes.length) { $('#fNote').textContent = notes.join(' '); $('#fNote').hidden = false; }
  } else {
    const d = presetDay ? parseYmd(presetDay) : new Date();
    $('#fSD').value = $('#fED').value = ymd(d);
    const h = presetDay ? 9 : Math.min(new Date().getHours() + 1, 22);
    $('#fST').value = pad(h) + ':00'; $('#fET').value = pad(h + 1) + ':00';
    fillCatSelect($('#fCat'), S.cat !== 'all' && S.cat !== OTHER ? S.cat : '', '');
    const cals = writableCals();
    $('#fCal').innerHTML = cals.map(c => '<option value="' + esc(c.id) + '">' + esc(calName(c)) + '</option>').join('');
    const prim = cals.find(c => c.primary); if (prim) $('#fCal').value = prim.id;
  }
  syncAllDay(); syncLocLink();
  openDlg($('#evDlg'));
  if (!it) setTimeout(() => $('#fTitle').focus(), 50);
}

function buildTimes() {
  const allDay = $('#fAllDay').checked;
  const sd = $('#fSD').value; let ed = $('#fED').value || sd;
  if (allDay) {
    if (ed < sd) ed = sd;
    return { start: { date: sd }, end: { date: ymd(addDays(parseYmd(ed), 1)) } };
  }
  const st = $('#fST').value || '09:00'; let et = $('#fET').value;
  let s = new Date(sd + 'T' + st), e = new Date(ed + 'T' + (et || st));
  if (!(e > s)) e = new Date(s.getTime() + 3600e3);
  const z = tz();
  return { start: { dateTime: ymd(s) + 'T' + hm(s) + ':00', timeZone: z }, end: { dateTime: ymd(e) + 'T' + hm(e) + ':00', timeZone: z } };
}

function timesChanged(it, t) {
  if (!!t.start.date !== it.allDay) return true;
  if (t.start.date) return t.start.date !== ymd(it.start) || t.end.date !== ymd(it.end);
  return +new Date(t.start.dateTime) !== +it.start || +new Date(t.end.dateTime) !== +it.end;
}
async function saveEditor(ev) {
  ev.preventDefault();
  const it = S.editing;
  const cat = $('#fCat').value;
  const title = $('#fTitle').value.trim();
  if (!title && !(it && !it.canEdit)) { toast('Add a title.'); $('#fTitle').focus(); return; }
  const editable = !(it && !it.canEdit);
  const t = editable ? buildTimes() : null;
  let scope = 'one';
  if (editable && !t.start.date && (!it || timesChanged(it, t))) {
    // warn before double-booking (new events, or when the time was changed)
    const s = new Date(t.start.dateTime), e = new Date(t.end.dateTime);
    const hits = conflictsFor(s, e, it && it.key);
    if (hits.length) {
      const h = hits[0];
      const go = await choose('Time overlap', 'This overlaps ' + h.title + ' at ' + fmtTime(h.start) + (hits.length > 1 ? ' and ' + (hits.length - 1) + ' more' : '') + '. Save anyway?',
        [{ id: 'cNo', label: 'Cancel', value: null }, { id: 'cYes', label: 'Save anyway', value: 'yes', cls: 'pri' }]);
      if (!go) return;
    }
  }
  if (editable && it && it.ev.recurringEventId) {
    scope = await choose('Change which dates?', it.title, [
      { id: 'cOne', label: 'This date only', value: 'one', cls: 'pri' },
      { id: 'cAll', label: 'All dates in the series', value: 'all', cls: 'pri' },
      { id: 'cNo', label: 'Cancel', value: null }]);
    if (!scope) return;
  }
  const btn = $('#evSave'); btn.disabled = true;
  try {
    if (!editable) {
      const local = load(LS.local, {}); if (cat) local[it.key] = cat; else delete local[it.key]; save(LS.local, local);
      replaceItem(it.cal, it.ev);
    } else if (scope === 'all') {
      const note = await saveSeries(it, title, cat, t);
      closeDlg($('#evDlg')); toast('Saved for all dates.' + (note ? ' ' + note : ''));
      await reload(); return;
    } else {
      if (it) {
        const body = Object.assign({}, it.ev, { summary: title, location: $('#fLoc').value, description: $('#fNotes').value, start: t.start, end: t.end });
        const ext = Object.assign({}, it.ev.extendedProperties || {});
        const priv = Object.assign({}, ext.private || {});
        if (cat || priv[PROP]) { priv[PROP] = cat; ext.private = priv; body.extendedProperties = ext; }
        const saved = await gapi('PUT', '/calendars/' + enc(it.cal.id) + '/events/' + enc(it.ev.id), body);
        replaceItem(it.cal, saved || body);
      } else {
        const cal = S.calendars.find(c => c.id === $('#fCal').value) || writableCals()[0];
        if (!cal) throw new Error('no calendar you can add to');
        const body = { summary: title, start: t.start, end: t.end };
        if ($('#fLoc').value.trim()) body.location = $('#fLoc').value.trim();
        if ($('#fNotes').value.trim()) body.description = $('#fNotes').value;
        if (cat) body.extendedProperties = { private: { [PROP]: cat } };
        const saved = await gapi('POST', '/calendars/' + enc(cal.id) + '/events', body);
        if (S.selected.includes(cal.id)) S.items.push(normalize(cal, saved || Object.assign({ id: 'tmp' + Date.now() }, body)));
      }
    }
    closeDlg($('#evDlg')); toast('Saved'); render();
  } catch (e) {
    if (e instanceof AuthError) { closeDlg($('#evDlg')); toast('Please sign in again.'); return showSignin(); }
    toast('Could not save: ' + e.message);
  } finally { btn.disabled = false; }
}
/* whole repeating series: PATCH the master event. Title/location/notes/category always; a changed time of day
   moves every date to that time (the series keeps its own days). Returns a short note when something wasn't applied. */
async function saveSeries(it, title, cat, t) {
  const path = '/calendars/' + enc(it.cal.id) + '/events/' + enc(it.ev.recurringEventId);
  const master = await gapi('GET', path);
  const body = { summary: title, location: $('#fLoc').value, description: $('#fNotes').value };
  const ext = Object.assign({}, master.extendedProperties || {});
  const priv = Object.assign({}, ext.private || {});
  if (cat || priv[PROP]) { priv[PROP] = cat; ext.private = priv; body.extendedProperties = ext; }
  let note = '';
  if (timesChanged(it, t)) {
    const masterAllDay = !!(master.start && master.start.date);
    if (!!t.start.date !== it.allDay || masterAllDay !== it.allDay) note = 'Times were not changed for the series.';
    else if (t.start.date) note = 'The series keeps its days.';
    else {
      const ns = new Date(t.start.dateTime), ne = new Date(t.end.dateTime);
      const s = startOfDay(new Date(master.start.dateTime)); s.setHours(ns.getHours(), ns.getMinutes());
      const e = new Date(s.getTime() + (ne - ns));
      const z = tz();
      body.start = { dateTime: ymd(s) + 'T' + hm(s) + ':00', timeZone: z };
      body.end = { dateTime: ymd(e) + 'T' + hm(e) + ':00', timeZone: z };
      if (ymd(ns) !== ymd(it.start)) note = 'The series keeps its days.';
    }
  }
  await gapi('PATCH', path, body);
  return note;
}
function replaceItem(cal, ev) {
  const key = cal.id + '|' + ev.id;
  const i = S.items.findIndex(x => x.key === key);
  const n = normalize(cal, ev);
  if (i >= 0) S.items[i] = n; else S.items.push(n);
}

async function askDelete() {
  const it = S.editing; if (!it) return;
  const body = it.title + ' — ' + fmtDay(it.start) + (it.allDay ? '' : ', ' + fmtTime(it.start));
  const scope = it.ev.recurringEventId
    ? await choose('Delete which dates?', body, [
        { id: 'cOne', label: 'This date only', value: 'one', cls: 'danger' },
        { id: 'cAll', label: 'All dates in the series', value: 'all', cls: 'danger' },
        { id: 'cNo', label: 'Cancel', value: null }])
    : await choose('Delete this event?', body, [{ id: 'cNo', label: 'Cancel', value: null }, { id: 'cYes', label: 'Delete', value: 'one', cls: 'danger' }]);
  if (scope) doDelete(it, scope);
}
async function doDelete(it, scope) {
  try {
    const all = scope === 'all';
    await gapi('DELETE', '/calendars/' + enc(it.cal.id) + '/events/' + enc(all ? it.ev.recurringEventId : it.ev.id));
    closeDlg($('#evDlg'));
    if (all) { toast('Deleted all dates'); await reload(); return; }
    S.items = S.items.filter(x => x.key !== it.key);
    toast('Deleted'); render();
  } catch (e) {
    if (e instanceof AuthError) { closeDlg($('#evDlg')); return showSignin(); }
    toast('Could not delete: ' + e.message);
  }
}

/* ---------------- settings ---------------- */
function renderCalList() {
  $('#calList').innerHTML = S.calendars.length ? S.calendars.map(c => '<label class="calrow"><input type="checkbox" data-cal="' + esc(c.id) + '"' + (S.selected.includes(c.id) ? ' checked' : '') + '>' +
    '<span class="sw" style="background:' + esc(c.backgroundColor || '#999') + '"></span>' + esc(calName(c)) + '</label>').join('') : '<div class="note">None loaded.</div>';
}
function renderSettings() {
  $('#catList').innerHTML = CATS.map((c, i) => '<div class="catblock"><div class="nm"><span class="sw" style="background:' + c.color + '"></span>' + esc(c.name) +
    (c.builtin ? '' : '<button data-rm="' + i + '">Remove</button>') + '</div><textarea data-words="' + i + '" aria-label="Words for ' + esc(c.name) + '">' + esc(c.words.join(', ')) + '</textarea></div>').join('');
}
function openSettings() { renderCalList(); renderSettings(); openDlg($('#setDlg')); }
async function closeSettings() {
  document.querySelectorAll('[data-words]').forEach(t => { CATS[+t.dataset.words].words = t.value.split(',').map(s => s.trim()).filter(Boolean); });
  saveCatConfig(CATS); reCache.clear();
  const sel = Array.from(document.querySelectorAll('[data-cal]')).filter(x => x.checked).map(x => x.dataset.cal);
  const changed = S.calendars.length && sel.sort().join() !== S.selected.slice().sort().join();
  if (S.calendars.length) { S.selected = sel; save(LS.cals, sel); }
  closeDlg($('#setDlg'));
  recategorize(); render();
  if (changed) { setStatus('Loading your calendar…'); try { await loadEvents(); setStatus(S.loadWarn || ''); } catch (e) { if (e instanceof AuthError) return showSignin(); setStatus('Could not load: ' + e.message); } render(); }
}

/* ---------------- wire up ---------------- */
function bind() {
  $('#signinBtn').addEventListener('click', signIn);
  $('#viewTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.view = b.dataset.v; save(LS.view, S.view); render(); });
  let qT; $('#q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { S.q = e.target.value; if (S.q.trim() && S.view === 'month') { S.view = 'list'; save(LS.view, S.view); document.querySelectorAll('#viewTabs button').forEach(b => b.classList.toggle('on', b.dataset.v === 'list')); } render(); }, 120); });
  $('#catChips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.cat = b.dataset.cat; render(); });
  $('#range').addEventListener('change', e => {
    S.range = e.target.value; S.sort = S.range === 'past' ? 'desc' : 'asc'; $('#sort').value = S.sort;
    if (S.range === 'custom' && !S.from) { const t = new Date(); S.from = ymd(new Date(t.getFullYear(), t.getMonth(), 1)); S.to = ymd(new Date(t.getFullYear(), t.getMonth() + 1, 0)); $('#from').value = S.from; $('#to').value = S.to; }
    render();
  });
  $('#sort').addEventListener('change', e => { S.sort = e.target.value; render(); });
  $('#from').addEventListener('change', e => { S.from = e.target.value; render(); });
  $('#to').addEventListener('change', e => { S.to = e.target.value; render(); });
  $('#printBtn').addEventListener('click', () => { renderPrint(); window.print(); });
  $('#mPrev').addEventListener('click', () => { S.month = new Date(S.month.getFullYear(), S.month.getMonth() - 1, 1); render(); });
  $('#mNext').addEventListener('click', () => { S.month = new Date(S.month.getFullYear(), S.month.getMonth() + 1, 1); render(); });
  $('#mGrid').addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (!b) return; S.selDay = S.selDay === b.dataset.day ? null : b.dataset.day; render(); });
  document.addEventListener('click', e => {
    if (e.target.closest('a')) return;  // location link opens Maps, not the editor
    const b = e.target.closest('.ev[data-key]'); if (!b) return;
    const it = S.items.find(x => x.key === b.dataset.key); if (it) openEditor(it);
  });
  document.addEventListener('keydown', e => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches || !e.target.matches('.ev[data-key]')) return;
    e.preventDefault(); e.target.click();
  });
  $('#addBtn').addEventListener('click', () => openEditor(null, S.view === 'month' ? S.selDay : null));
  $('#fAllDay').addEventListener('change', syncAllDay);
  $('#fSD').addEventListener('change', () => { if (!$('#fED').value || $('#fED').value < $('#fSD').value) $('#fED').value = $('#fSD').value; });
  $('#evForm').addEventListener('submit', saveEditor);
  $('#evCancel').addEventListener('click', () => closeDlg($('#evDlg')));
  $('#evDelete').addEventListener('click', askDelete);
  $('#fLoc').addEventListener('input', syncLocLink);
  $('#menuBtn').addEventListener('click', openSettings);
  $('#setDone').addEventListener('click', closeSettings);
  $('#setDlg').addEventListener('cancel', e => { e.preventDefault(); closeSettings(); });
  $('#catList').addEventListener('click', e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    document.querySelectorAll('[data-words]').forEach(t => { CATS[+t.dataset.words].words = t.value.split(',').map(s => s.trim()).filter(Boolean); });
    CATS.splice(+b.dataset.rm, 1); renderSettings();
  });
  $('#addCat').addEventListener('click', () => {
    const n = $('#newCat').value.trim(); if (!n) return;
    document.querySelectorAll('[data-words]').forEach(t => { CATS[+t.dataset.words].words = t.value.split(',').map(s => s.trim()).filter(Boolean); });
    if (n.toLowerCase() === OTHER.toLowerCase() || CATS.some(c => c.name.toLowerCase() === n.toLowerCase())) { toast('That category already exists.'); return; }
    const custom = CATS.filter(c => !c.builtin).length;
    CATS.push({ name: n, color: EXTRA_COLORS[custom % EXTRA_COLORS.length], words: [], builtin: false });
    $('#newCat').value = ''; renderSettings();
  });
  $('#resetWords').addEventListener('click', () => { DEFAULT_CATS.forEach(d => { const c = CATS.find(x => x.name === d.name); if (c) c.words = d.words.slice(); }); renderSettings(); });
  $('#reloadBtn').addEventListener('click', () => { closeDlg($('#setDlg')); reload(); });
  $('#signoutBtn').addEventListener('click', signOut);
}

/* ---------------- updates: a newer published version reloads the page past any cache ---------------- */
async function latestVersion() {
  try { const r = await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' }); return r.ok ? (await r.text()).trim() : null; } catch (e) { return null; }
}
function freshLoad(v) {
  const u = new URL(location.href); u.searchParams.set('v', v || String(Date.now())); location.replace(u.toString());
}
async function checkUpdate() {
  const v = await latestVersion();
  if (!v || v === APPV) return;
  if (sessionStorage.getItem('cp.updTried') === v) return;  // one forced reload per version, no loops
  sessionStorage.setItem('cp.updTried', v); freshLoad(v);
}
async function refreshApp() {
  const v = await latestVersion();
  if (v && v !== APPV) { sessionStorage.setItem('cp.updTried', v); return freshLoad(v); }
  if (S.token) { toast('Up to date. Reloading your calendar…'); reload(); } else freshLoad(v);
}

function init() {
  bind();
  $('#refreshBtn').addEventListener('click', refreshApp);
  checkUpdate();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
  $('#range').value = S.range; $('#sort').value = S.sort;
  if (restoreToken()) { showApp(); reload(); } else showSignin();
  if (window.google && google.accounts && google.accounts.oauth2) gisReady();
  else if (!(window.CP_CONFIG || {}).clientId) gisReady();
}
window.CalendarPlus = { autoCategory, calCategory, locHref, DEFAULT_CATS, state: S };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
