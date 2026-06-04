// ================================================
// sittercalendar.js — Schedule management
// Visible to: babysitter, admin
// Updates /babysitters/{id} and recalculates
// /calendar/main after every change
// ================================================

import { db } from './firebase-app.js';
import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc,
  query, orderBy, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Standard bookable time slots (24-hr strings)
const ALL_SLOTS = [
  '08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00','19:00'
];

let _containerId     = '';
let _role            = '';
let _allSitters      = [];
let _activeSitterId  = null;
let _activeSitterData = null;

// ── Public Init ───────────────────────────────── //
export async function initSitterCalendar(containerId, role, userEmail) {
  _containerId = containerId;
  _role        = role;

  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<div class="loading-indicator"><div class="spinner"></div> Loading schedule manager&hellip;</div>';

  try {
    const snap = await getDocs(query(collection(db, 'babysitters'), orderBy('name')));
    _allSitters = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('sittercalendar: load error', err);
    container.innerHTML = '<div class="error-state">Failed to load babysitter data.</div>';
    return;
  }

  if (role === 'admin') {
    renderAdminPicker(container);
  } else {
    // Babysitter: match by email
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

// ── Admin Sitter Picker ───────────────────────── //
function renderAdminPicker(container) {
  if (!_allSitters.length) {
    container.innerHTML = '<div class="empty-state">No babysitters in database.</div>';
    return;
  }

  const options = _allSitters
    .map(s => `<option value="${s.id}">${esc(s.name ?? 'Unnamed')}</option>`)
    .join('');

  container.innerHTML = `
    <div class="sitter-selector">
      <div class="form-group">
        <label>Manage Schedule For</label>
        <select class="form-control" id="sitter-select">
          <option value="">Select a babysitter&hellip;</option>
          ${options}
        </select>
      </div>
    </div>
    <div id="schedule-ui"></div>`;

  container.querySelector('#sitter-select').addEventListener('change', e => {
    const id = e.target.value;
    const schedUI = document.getElementById('schedule-ui');
    if (!schedUI) return;

    if (!id) { schedUI.innerHTML = ''; return; }

    const sitter = _allSitters.find(s => s.id === id);
    if (!sitter) return;

    _activeSitterId   = id;
    _activeSitterData = { ...sitter };
    renderScheduleUI(schedUI);
  });
}

// ── Schedule Management UI ────────────────────── //
function renderScheduleUI(container) {
  if (!_activeSitterData) return;

  const openDates = [...(_activeSitterData.openDates ?? [])].sort();
  const openTimes = new Set(_activeSitterData.openTimes ?? []);

  // Date tags
  const dateTags = openDates.length
    ? openDates.map(d => `
        <div class="blackout-tag" data-date="${esc(d)}">
          ${esc(formatDisplayDate(d))}
          <button type="button" aria-label="Remove ${esc(d)}" data-remove-date="${esc(d)}">&times;</button>
        </div>`).join('')
    : '<span style="font-size:0.84rem;color:var(--text-muted)">No open dates set.</span>';

  // Time slot toggles
  const timeToggles = ALL_SLOTS.map(t => {
    const active = openTimes.has(t) ? ' selected' : '';
    return `<button type="button" class="time-slot-btn${active}" data-time="${t}"
              title="${openTimes.has(t) ? 'Click to block' : 'Click to unblock'}"
              aria-pressed="${openTimes.has(t)}">${formatTime(t)}</button>`;
  }).join('');

  // Build time-range selects (re-used for block & restore)
  const timeOptions = ALL_SLOTS
    .map(t => `<option value="${t}">${formatTime(t)}</option>`).join('');

  container.innerHTML = `
    <div class="schedule-section">
      <h4>Open Dates</h4>
      <div class="blackout-list" id="open-dates-list">${dateTags}</div>
      <div class="inline-form" style="margin-top:0.85rem">
        <div class="form-group">
          <label>Add Available Date</label>
          <input type="date" class="form-control" id="add-date-input">
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="add-date-btn">Add Date</button>
      </div>
      <div id="schedule-msg" style="margin-top:0.5rem;font-size:0.84rem;min-height:1.2em"></div>
    </div>

    <div class="schedule-section">
      <h4>
        Available Time Slots
        <span style="font-size:0.76rem;font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-muted)">
          &mdash; click to toggle
        </span>
      </h4>
      <div class="time-slots-grid" id="time-slots-manage" style="gap:0.4rem">${timeToggles}</div>

      <div style="margin-top:1rem">
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end">
          <div class="form-group" style="margin:0;min-width:110px">
            <label style="font-size:0.76rem">Range From</label>
            <select class="form-control" id="range-from">${timeOptions}</select>
          </div>
          <div class="form-group" style="margin:0;min-width:110px">
            <label style="font-size:0.76rem">Range To</label>
            <select class="form-control" id="range-to">${timeOptions}</select>
          </div>
          <div style="display:flex;gap:0.4rem">
            <button type="button" class="btn btn-danger btn-sm" id="block-range-btn">Block Range</button>
            <button type="button" class="btn btn-secondary btn-sm" id="restore-range-btn">Restore Range</button>
          </div>
        </div>
        <div id="time-msg" style="margin-top:0.5rem;font-size:0.84rem;min-height:1.2em"></div>
      </div>
    </div>`;

  attachHandlers(container);
}

// ── Event Handlers ────────────────────────────── //
function attachHandlers(container) {
  // Remove date via tag X button
  container.querySelector('#open-dates-list')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-remove-date]');
    if (btn) await removeDateFromSitter(btn.dataset.removeDate);
  });

  // Add date
  container.querySelector('#add-date-btn')?.addEventListener('click', async () => {
    const input = container.querySelector('#add-date-input');
    const date  = input?.value;
    if (!date) { showMsg('schedule-msg', 'Please pick a date.', 'error'); return; }
    await addDateToSitter(date);
    if (input) input.value = '';
  });

  // Toggle individual time slot
  container.querySelector('#time-slots-manage')?.addEventListener('click', async e => {
    const btn = e.target.closest('.time-slot-btn');
    if (!btn) return;
    const time = btn.dataset.time;
    if (btn.classList.contains('selected')) {
      await removeTimesFromSitter([time], 'time-msg', `${formatTime(time)} blocked.`);
    } else {
      await addTimesToSitter([time], 'time-msg', `${formatTime(time)} restored.`);
    }
  });

  // Block range
  container.querySelector('#block-range-btn')?.addEventListener('click', async () => {
    const from = container.querySelector('#range-from')?.value;
    const to   = container.querySelector('#range-to')?.value;
    if (!from || !to || from >= to) {
      showMsg('time-msg', '"From" must be earlier than "To".', 'error'); return;
    }
    const slots = ALL_SLOTS.filter(t => t >= from && t < to);
    if (!slots.length) { showMsg('time-msg', 'No slots in that range.', 'error'); return; }
    await removeTimesFromSitter(slots, 'time-msg', `${slots.length} slot${slots.length > 1 ? 's' : ''} blocked.`);
  });

  // Restore range
  container.querySelector('#restore-range-btn')?.addEventListener('click', async () => {
    const from = container.querySelector('#range-from')?.value;
    const to   = container.querySelector('#range-to')?.value;
    if (!from || !to || from >= to) {
      showMsg('time-msg', '"From" must be earlier than "To".', 'error'); return;
    }
    const slots = ALL_SLOTS.filter(t => t >= from && t < to);
    if (!slots.length) { showMsg('time-msg', 'No slots in that range.', 'error'); return; }
    await addTimesToSitter(slots, 'time-msg', `${slots.length} slot${slots.length > 1 ? 's' : ''} restored.`);
  });
}

// ── Firestore Mutations ───────────────────────── //
async function addDateToSitter(date) {
  if (!_activeSitterId) return;
  try {
    await updateDoc(doc(db, 'babysitters', _activeSitterId), { openDates: arrayUnion(date) });
    _activeSitterData.openDates = [...new Set([...(_activeSitterData.openDates ?? []), date])];
    await recalcGlobalCalendar();
    rerenderSchedule();
    showMsg('schedule-msg', `${formatDisplayDate(date)} added.`, 'success');
  } catch (err) {
    console.error('sittercalendar: addDate error', err);
    showMsg('schedule-msg', 'Failed to add date. Please try again.', 'error');
  }
}

async function removeDateFromSitter(date) {
  if (!_activeSitterId) return;
  try {
    await updateDoc(doc(db, 'babysitters', _activeSitterId), { openDates: arrayRemove(date) });
    _activeSitterData.openDates = (_activeSitterData.openDates ?? []).filter(d => d !== date);
    await recalcGlobalCalendar();
    rerenderSchedule();
    showMsg('schedule-msg', `${formatDisplayDate(date)} removed.`, 'success');
  } catch (err) {
    console.error('sittercalendar: removeDate error', err);
    showMsg('schedule-msg', 'Failed to remove date. Please try again.', 'error');
  }
}

async function addTimesToSitter(times, msgElId, successMsg) {
  if (!_activeSitterId) return;
  try {
    await updateDoc(doc(db, 'babysitters', _activeSitterId), { openTimes: arrayUnion(...times) });
    _activeSitterData.openTimes = [...new Set([...(_activeSitterData.openTimes ?? []), ...times])];
    await recalcGlobalCalendar();
    rerenderSchedule();
    showMsg(msgElId, successMsg, 'success');
  } catch (err) {
    console.error('sittercalendar: addTimes error', err);
    showMsg(msgElId, 'Failed to update. Please try again.', 'error');
  }
}

async function removeTimesFromSitter(times, msgElId, successMsg) {
  if (!_activeSitterId) return;
  try {
    await updateDoc(doc(db, 'babysitters', _activeSitterId), { openTimes: arrayRemove(...times) });
    _activeSitterData.openTimes = (_activeSitterData.openTimes ?? []).filter(t => !times.includes(t));
    await recalcGlobalCalendar();
    rerenderSchedule();
    showMsg(msgElId, successMsg, 'success');
  } catch (err) {
    console.error('sittercalendar: removeTimes error', err);
    showMsg(msgElId, 'Failed to update. Please try again.', 'error');
  }
}

// ── Recalculate Global Calendar ───────────────── //
// Called after every schedule change.
// Recomputes openDates/openTimes from all sitters.
async function recalcGlobalCalendar() {
  try {
    const snap     = await getDocs(collection(db, 'babysitters'));
    const allDates = new Set();
    const allTimes = new Set();

    snap.forEach(d => {
      const data = d.data();
      (data.openDates ?? []).forEach(date => allDates.add(date));
      (data.openTimes ?? []).forEach(time => allTimes.add(time));
    });

    await setDoc(doc(db, 'calendar', 'main'), {
      openDates: [...allDates].sort(),
      openTimes: [...allTimes].sort()
    });
  } catch (err) {
    console.error('sittercalendar: recalc error', err);
  }
}

// ── Re-render After Mutation ──────────────────── //
function rerenderSchedule() {
  if (_role === 'admin') {
    const ui = document.getElementById('schedule-ui');
    if (ui) renderScheduleUI(ui);
  } else {
    const container = document.getElementById(_containerId);
    if (container) renderScheduleUI(container);
  }
}

// ── Status Messages ───────────────────────────── //
function showMsg(elId, msg, type = 'info') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'error'
    ? '#C0392B'
    : type === 'success'
      ? '#065F46'
      : 'var(--text-muted)';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { if (el) el.textContent = ''; }, 3500);
}

// ── Helpers ───────────────────────────────────── //
function formatTime(str) {
  if (!str) return '';
  const [h, m] = str.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatDisplayDate(str) {
  if (!str) return str;
  const [y, mo, d] = str.split('-').map(Number);
  return new Date(y, mo - 1, d)
    .toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
