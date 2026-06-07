// ================================================
// sittercalendar.js — Schedule management
// Visible to: babysitter, admin
//
// Date management: interactive calendar grid —
//   click any future date to toggle it on/off.
//   Changes write to Firestore immediately with
//   an optimistic UI update so the toggle feels instant.
//
// Time management: 04:00–23:00 in 15-min slots.
//   A visual bar shows current availability at a glance.
//   Three range controls (Set / Block / Restore) each
//   have separate hour and minute selects.
// ================================================

import { db } from './firebase-app.js';
import {
  collection, doc, getDocs, setDoc, updateDoc,
  query, orderBy, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Time constants ────────────────────────────── //
// 15-min increments: 04:00, 04:15 … 22:45, 23:00
const ALL_SLOTS = (() => {
  const s = [];
  for (let h = 4; h <= 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 23 && m > 0) break;
      s.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    }
  }
  return s;
})();

const HOURS   = Array.from({ length: 20 }, (_, i) => i + 4); // 4 … 23
const MINUTES = ['00', '15', '30', '45'];

// ── Calendar constants ────────────────────────── //
const DAY_LABELS  = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ── Module state ──────────────────────────────── //
let _containerId      = '';
let _role             = '';
let _allSitters       = [];
let _activeSitterId   = null;
let _activeSitterData = null;
let _calYear, _calMonth;

// ════════════════════════════════════════════════
// PUBLIC INIT
// ════════════════════════════════════════════════
export async function initSitterCalendar(containerId, role, userEmail) {
  _containerId = containerId;
  _role        = role;

  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<div class="loading-indicator"><div class="spinner"></div> Loading schedule manager\u2026</div>';

  try {
    const snap = await getDocs(query(collection(db, 'babysitters'), orderBy('name')));
    _allSitters = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('sittercalendar: load error', err);
    container.innerHTML = '<div class="error-state">Failed to load babysitter data.</div>';
    return;
  }

  const now = new Date();
  _calYear  = now.getFullYear();
  _calMonth = now.getMonth();

  if (role === 'admin') {
    renderAdminPicker(container);
  } else {
    const own = _allSitters.find(s => s.email === userEmail);
    if (!own) {
      container.innerHTML = '<div class="empty-state">Your babysitter profile was not found. Contact an admin.</div>';
      return;
    }
    _activeSitterId   = own.id;
    _activeSitterData = { ...own };
    renderScheduleUI(container);
  }
}

// ════════════════════════════════════════════════
// ADMIN SITTER PICKER
// ════════════════════════════════════════════════
function renderAdminPicker(container) {
  if (!_allSitters.length) {
    container.innerHTML = '<div class="empty-state">No babysitters in database.</div>';
    return;
  }

  const opts = _allSitters
    .map(s => `<option value="${s.id}">${esc(s.name ?? 'Unnamed')}</option>`)
    .join('');

  container.innerHTML = `
    <div class="sitter-selector">
      <div class="form-group">
        <label>Manage Schedule For</label>
        <select class="form-control" id="sitter-select">
          <option value="">Select a babysitter\u2026</option>${opts}
        </select>
      </div>
    </div>
    <div id="schedule-ui"></div>`;

  container.querySelector('#sitter-select').addEventListener('change', e => {
    const id = e.target.value;
    const ui = document.getElementById('schedule-ui');
    if (!ui) return;
    if (!id) { ui.innerHTML = ''; return; }
    const sitter = _allSitters.find(s => s.id === id);
    if (!sitter) return;
    _activeSitterId   = id;
    _activeSitterData = { ...sitter };
    // Reset calendar to current month when switching sitters
    const now = new Date();
    _calYear  = now.getFullYear();
    _calMonth = now.getMonth();
    renderScheduleUI(ui);
  });
}

// ════════════════════════════════════════════════
// SCHEDULE UI — dates + times
// ════════════════════════════════════════════════
function renderScheduleUI(container) {
  if (!_activeSitterData) return;
  container.innerHTML = buildDateSection() + buildTimeSection();
  attachDateHandlers(container);
  attachTimeHandlers(container);
}

// ════════════════════════════════════════════════
// DATE SECTION — interactive calendar
// ════════════════════════════════════════════════
function buildDateSection() {
  return `
    <div class="schedule-section">
      <h4>Available Dates
        <span style="font-size:0.76rem;font-weight:400;text-transform:none;
                     letter-spacing:0;color:var(--text-muted)">
          \u2014 click a date to toggle it
        </span>
      </h4>
      <div id="sitter-date-cal-wrap">${buildDateCalHTML()}</div>
      <div id="date-msg" style="margin-top:0.5rem;font-size:0.84rem;min-height:1.2em"></div>
    </div>`;
}

function buildDateCalHTML() {
  const todayStr  = localDateStr(new Date());
  const openDates = new Set(_activeSitterData.openDates ?? []);
  const firstDay  = new Date(_calYear, _calMonth, 1).getDay();
  const totalDays = new Date(_calYear, _calMonth + 1, 0).getDate();

  let cells = '';
  for (let i = 0; i < firstDay; i++) {
    cells += '<div class="sdc-day empty"></div>';
  }
  for (let d = 1; d <= totalDays; d++) {
    const str  = localDateStr(new Date(_calYear, _calMonth, d));
    const past = str < todayStr;
    const sel  = openDates.has(str);

    let cls = 'sdc-day';
    if (past)           cls += ' past';
    if (str===todayStr) cls += ' today';
    if (sel)            cls += ' selected';
    if (!past)          cls += ' clickable';

    cells += past
      ? `<div class="${cls}">${d}</div>`
      : `<div class="${cls}" data-sitter-date="${str}"
             role="button" tabindex="0" aria-pressed="${sel}">${d}</div>`;
  }

  const headers = DAY_LABELS.map(l => `<span>${l}</span>`).join('');

  return `
    <div class="sitter-date-cal">
      <div class="sdc-header">
        <button class="sdc-nav" id="sdc-prev" aria-label="Previous month">&#8249;</button>
        <span class="sdc-month-label">${MONTH_NAMES[_calMonth]} ${_calYear}</span>
        <button class="sdc-nav" id="sdc-next" aria-label="Next month">&#8250;</button>
      </div>
      <div class="sdc-grid">
        <div class="sdc-day-headers"
             style="display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:0.3rem">
          ${headers}
        </div>
        <div class="sdc-dates"
             style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">
          ${cells}
        </div>
      </div>
    </div>`;
}

// Replaces only the calendar inside #sitter-date-cal-wrap
function refreshDateCal(container) {
  const wrap = container.querySelector('#sitter-date-cal-wrap')
            ?? document.getElementById('sitter-date-cal-wrap');
  if (!wrap) return;

  wrap.innerHTML = buildDateCalHTML();

  // Re-bind nav on the fresh calendar nodes
  wrap.querySelector('#sdc-prev')?.addEventListener('click', () => {
    _calMonth--;
    if (_calMonth < 0) { _calMonth = 11; _calYear--; }
    refreshDateCal(container);
  });
  wrap.querySelector('#sdc-next')?.addEventListener('click', () => {
    _calMonth++;
    if (_calMonth > 11) { _calMonth = 0; _calYear++; }
    refreshDateCal(container);
  });

  bindDateCells(container);
}

function attachDateHandlers(container) {
  container.querySelector('#sdc-prev')?.addEventListener('click', () => {
    _calMonth--;
    if (_calMonth < 0) { _calMonth = 11; _calYear--; }
    refreshDateCal(container);
  });
  container.querySelector('#sdc-next')?.addEventListener('click', () => {
    _calMonth++;
    if (_calMonth > 11) { _calMonth = 0; _calYear++; }
    refreshDateCal(container);
  });
  bindDateCells(container);
}

function bindDateCells(container) {
  const wrap = container.querySelector('#sitter-date-cal-wrap')
            ?? document.getElementById('sitter-date-cal-wrap');
  if (!wrap) return;

  wrap.querySelectorAll('[data-sitter-date]').forEach(el => {
    const act = () => toggleDate(el.dataset.sitterDate, el);
    el.addEventListener('click', act);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); }
    });
  });
}

async function toggleDate(date, cell) {
  if (!_activeSitterId) return;

  const current  = _activeSitterData.openDates ?? [];
  const removing = current.includes(date);

  // Optimistic UI — flip the cell instantly before the write
  if (cell) {
    if (removing) {
      cell.classList.remove('selected');
      cell.setAttribute('aria-pressed', 'false');
    } else {
      cell.classList.add('selected');
      cell.setAttribute('aria-pressed', 'true');
    }
  }

  try {
    if (removing) {
      await updateDoc(doc(db, 'babysitters', _activeSitterId), { openDates: arrayRemove(date) });
      _activeSitterData.openDates = current.filter(d => d !== date);
    } else {
      await updateDoc(doc(db, 'babysitters', _activeSitterId), { openDates: arrayUnion(date) });
      _activeSitterData.openDates = [...new Set([...current, date])];
    }
    await recalcGlobalCalendar();
    showMsg('date-msg', `${fmtShortDate(date)} ${removing ? 'removed' : 'added'}.`, 'success');
  } catch (err) {
    console.error('sittercalendar: toggleDate', err);
    // Revert optimistic update on failure
    if (cell) {
      if (removing) {
        cell.classList.add('selected');
        cell.setAttribute('aria-pressed', 'true');
      } else {
        cell.classList.remove('selected');
        cell.setAttribute('aria-pressed', 'false');
      }
    }
    showMsg('date-msg', 'Failed to update. Please try again.', 'error');
  }
}

// ════════════════════════════════════════════════
// TIME SECTION — bar + range controls
// ════════════════════════════════════════════════
function buildTimeSection() {
  const hourOpts = HOURS.map(h =>
    `<option value="${h}">${fmtHourLabel(h)}</option>`
  ).join('');

  const minOpts = MINUTES.map(m =>
    `<option value="${m}">:${m}</option>`
  ).join('');

  // Reusable hour+minute pair for a given prefix
  const timePair = (prefix) => `
    <div class="time-picker">
      <select class="form-control time-hour" id="${prefix}-h" aria-label="Hour">
        <option value="">Hour</option>${hourOpts}
      </select>
      <span class="time-sep">:</span>
      <select class="form-control time-min" id="${prefix}-m" aria-label="Minute">
        <option value="">Min</option>${minOpts}
      </select>
    </div>`;

  const rangeRow = (label, prefix, btnId, btnCls, btnTxt) => `
    <div class="time-range-row">
      <span class="time-range-label">${label}</span>
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        ${timePair(`${prefix}-from`)}
        <span style="font-size:0.82rem;color:var(--text-muted)">to</span>
        ${timePair(`${prefix}-to`)}
        <button type="button" class="btn ${btnCls} btn-sm" id="${btnId}">${btnTxt}</button>
      </div>
    </div>`;

  return `
    <div class="schedule-section">
      <h4>Available Time Slots</h4>

      <div class="sitter-time-bar-wrap">
        <div class="sitter-time-bar-labels">
          <span>4 AM</span><span>12 PM</span><span>11 PM</span>
        </div>
        <div class="sitter-time-bar" id="sitter-time-bar">${buildTimeBarSlots()}</div>
      </div>

      ${rangeRow('Set range',     'set',     'set-range-btn',     'btn-primary',   'Set Available')}
      ${rangeRow('Block range',   'block',   'block-range-btn',   'btn-danger',    'Block')}
      ${rangeRow('Restore range', 'restore', 'restore-range-btn', 'btn-secondary', 'Restore')}

      <div id="time-msg" style="margin-top:0.5rem;font-size:0.84rem;min-height:1.2em"></div>
    </div>`;
}

function buildTimeBarSlots() {
  const open = new Set(_activeSitterData.openTimes ?? []);
  return ALL_SLOTS
    .map(t => `<div class="stb-slot${open.has(t) ? ' on' : ''}" title="${fmtTime(t)}"></div>`)
    .join('');
}

function refreshTimeBar() {
  const bar = document.getElementById('sitter-time-bar');
  if (bar) bar.innerHTML = buildTimeBarSlots();
}

function attachTimeHandlers(container) {
  // Set Available — replaces openTimes entirely with the chosen range
  container.querySelector('#set-range-btn')?.addEventListener('click', async () => {
    const from = readTime('set-from');
    const to   = readTime('set-to');
    if (!validateRange(from, to, 'time-msg')) return;
    const slots = ALL_SLOTS.filter(t => t >= from && t <= to);
    if (!slots.length) { showMsg('time-msg', 'No slots in that range.', 'error'); return; }
    await writeOpenTimes(
      slots, 'time-msg',
      `Available set: ${fmtTime(from)} \u2013 ${fmtTime(to)}`
    );
  });

  // Block — removes slots from openTimes
  container.querySelector('#block-range-btn')?.addEventListener('click', async () => {
    const from = readTime('block-from');
    const to   = readTime('block-to');
    if (!validateRange(from, to, 'time-msg')) return;
    const slots = ALL_SLOTS.filter(t => t >= from && t < to);
    if (!slots.length) { showMsg('time-msg', 'No slots in that range.', 'error'); return; }
    await removeSlots(slots, 'time-msg',
      `${slots.length} slot${slots.length !== 1 ? 's' : ''} blocked.`);
  });

  // Restore — adds slots back to openTimes
  container.querySelector('#restore-range-btn')?.addEventListener('click', async () => {
    const from = readTime('restore-from');
    const to   = readTime('restore-to');
    if (!validateRange(from, to, 'time-msg')) return;
    const slots = ALL_SLOTS.filter(t => t >= from && t <= to);
    if (!slots.length) { showMsg('time-msg', 'No slots in that range.', 'error'); return; }
    await addSlots(slots, 'time-msg',
      `${slots.length} slot${slots.length !== 1 ? 's' : ''} restored.`);
  });
}

// ════════════════════════════════════════════════
// FIRESTORE WRITES
// ════════════════════════════════════════════════
async function writeOpenTimes(slots, msgId, successMsg) {
  if (!_activeSitterId) return;
  try {
    await updateDoc(doc(db, 'babysitters', _activeSitterId), { openTimes: slots });
    _activeSitterData.openTimes = slots;
    await recalcGlobalCalendar();
    refreshTimeBar();
    showMsg(msgId, successMsg, 'success');
  } catch (err) {
    console.error('sittercalendar: writeOpenTimes', err);
    showMsg(msgId, 'Failed to update. Please try again.', 'error');
  }
}

async function addSlots(slots, msgId, successMsg) {
  if (!_activeSitterId) return;
  try {
    await updateDoc(doc(db, 'babysitters', _activeSitterId), { openTimes: arrayUnion(...slots) });
    _activeSitterData.openTimes = [
      ...new Set([...(_activeSitterData.openTimes ?? []), ...slots])
    ];
    await recalcGlobalCalendar();
    refreshTimeBar();
    showMsg(msgId, successMsg, 'success');
  } catch (err) {
    console.error('sittercalendar: addSlots', err);
    showMsg(msgId, 'Failed to update. Please try again.', 'error');
  }
}

async function removeSlots(slots, msgId, successMsg) {
  if (!_activeSitterId) return;
  try {
    await updateDoc(doc(db, 'babysitters', _activeSitterId), { openTimes: arrayRemove(...slots) });
    _activeSitterData.openTimes = (_activeSitterData.openTimes ?? []).filter(t => !slots.includes(t));
    await recalcGlobalCalendar();
    refreshTimeBar();
    showMsg(msgId, successMsg, 'success');
  } catch (err) {
    console.error('sittercalendar: removeSlots', err);
    showMsg(msgId, 'Failed to update. Please try again.', 'error');
  }
}

async function recalcGlobalCalendar() {
  try {
    const snap     = await getDocs(collection(db, 'babysitters'));
    const allDates = new Set();
    const allTimes = new Set();
    snap.forEach(d => {
      (d.data().openDates ?? []).forEach(v => allDates.add(v));
      (d.data().openTimes ?? []).forEach(v => allTimes.add(v));
    });
    await setDoc(doc(db, 'calendar', 'main'), {
      openDates: [...allDates].sort(),
      openTimes: [...allTimes].sort()
    });
  } catch (err) {
    console.error('sittercalendar: recalcGlobalCalendar', err);
  }
}

// ════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════
function readTime(prefix) {
  const h = document.getElementById(`${prefix}-h`)?.value;
  const m = document.getElementById(`${prefix}-m`)?.value;
  if (!h || m === '' || m == null) return null;
  return `${String(h).padStart(2,'0')}:${m}`;
}

function validateRange(from, to, msgId) {
  if (!from)      { showMsg(msgId, 'Select a start hour and minute.', 'error'); return false; }
  if (!to)        { showMsg(msgId, 'Select an end hour and minute.',   'error'); return false; }
  if (from >= to) { showMsg(msgId, 'End time must be after start time.', 'error'); return false; }
  return true;
}

function fmtHourLabel(h) {
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function fmtTime(str) {
  if (!str) return '';
  const [h, m] = str.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtShortDate(str) {
  if (!str) return str;
  const [y, mo, d] = str.split('-').map(Number);
  return new Date(y, mo - 1, d)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Use local date string to avoid UTC offset bugs when constructing dates
function localDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function showMsg(elId, msg, type = 'info') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'error' ? '#C0392B'
    : type === 'success' ? '#065F46'
    : 'var(--text-muted)';
  clearTimeout(el._t);
  el._t = setTimeout(() => { if (el) el.textContent = ''; }, 3500);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
