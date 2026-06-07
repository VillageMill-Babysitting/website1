// ================================================
// booking.js — Booking form & "My Bookings" list
//
// Times: 04:00 – 23:00 in 15-minute increments.
// Start and end each have a separate hour select
// and a minute select (:00 :15 :30 :45).
// booking.js populates all four selects on init.
// ================================================

import { db, auth } from './firebase-app.js';
import { collection, addDoc, getDocs, query, where, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// 04:00 → 23:00 in 15-min steps
const ALL_TIMES = (() => {
  const t = [];
  for (let h = 4; h <= 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 23 && m > 0) break; // last bookable slot is 23:00
      t.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    }
  }
  return t;
})();

const HOURS   = Array.from({ length: 20 }, (_, i) => i + 4); // 4 … 23
const MINUTES = ['00', '15', '30', '45'];

let _myBookingsId = '';

// ════════════════════════════════════════════════
// PUBLIC INIT
// ════════════════════════════════════════════════
export function initBookingForm(formContainerId, myBookingsId) {
  _myBookingsId = myBookingsId ?? '';

  const container = document.getElementById(formContainerId);
  if (!container) return;

  populateTimeSelects();

  container.querySelector('#booking-form')
    ?.addEventListener('submit', e => { e.preventDefault(); handleSubmit(); });

  loadMyBookings();
}

// Fills all four hour/minute selects with the correct options.
// Called once on init. form.reset() leaves the options in place
// and just resets selections to the placeholder, so no need to
// call this again after submission.
function populateTimeSelects() {
  const hourOpts = HOURS.map(h =>
    `<option value="${h}">${fmtHourLabel(h)}</option>`
  ).join('');

  const minOpts = MINUTES.map(m =>
    `<option value="${m}">:${m}</option>`
  ).join('');

  ['booking-start-hour', 'booking-end-hour'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">Hour</option>${hourOpts}`;
  });

  ['booking-start-min', 'booking-end-min'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">Min</option>${minOpts}`;
  });
}

// ── Pre-fill date from calendar click ────────── //
export function setBookingDate(date) {
  const el = document.getElementById('booking-date');
  if (el && date) el.value = date;
  if (date) {
    document.getElementById('booking-form-panel')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ════════════════════════════════════════════════
// SUBMIT
// ════════════════════════════════════════════════
async function handleSubmit() {
  const errorEl   = document.getElementById('booking-error');
  const successEl = document.getElementById('booking-success');
  const submitBtn = document.getElementById('booking-submit');
  const user      = auth.currentUser;

  if (errorEl)   errorEl.textContent   = '';
  if (successEl) successEl.textContent = '';

  if (!user) { showMsg(errorEl, 'Please sign in to make a booking.'); return; }

  const dateVal  = val('booking-date');
  const startVal = readTime('booking-start');
  const endVal   = readTime('booking-end');

  if (!dateVal)  { showMsg(errorEl, 'Please select or enter a date.');           return; }
  if (!startVal) { showMsg(errorEl, 'Please select a start hour and minute.');   return; }
  if (!endVal)   { showMsg(errorEl, 'Please select an end hour and minute.');    return; }
  if (endVal <= startVal) {
    showMsg(errorEl, 'End time must be after start time.');
    return;
  }

  const parentName  = val('booking-parent-name');
  const phone       = val('booking-phone');
  const children    = val('booking-children');
  const numChildren = parseInt(val('booking-num-children') || '1', 10);

  if (!parentName) { showMsg(errorEl, 'Please enter your name.');      return; }
  if (!phone)      { showMsg(errorEl, 'Please enter a phone number.'); return; }
  if (!children)   { showMsg(errorEl, 'Please enter child name(s).');  return; }

  if (submitBtn) {
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Submitting\u2026';
  }

  try {
    await addDoc(collection(db, 'bookings'), {
      parentName,
      phone,
      children,
      numChildren:        isNaN(numChildren) ? 1 : numChildren,
      date:               dateVal,
      startTime:          startVal,
      endTime:            endVal,
      status:             'pending',
      assignedBabysitter: '',
      userId:             user.uid,
      createdAt:          serverTimestamp()
    });

    // reset() returns selects to index 0 (the placeholder), options stay intact
    document.getElementById('booking-form')?.reset();

    showMsg(successEl, 'Booking submitted. We will contact you to confirm.');
    await loadMyBookings();

  } catch (err) {
    console.error('booking: submit error', err);
    showMsg(errorEl, 'Failed to submit. Please try again.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Submit Booking';
    }
  }
}

// ════════════════════════════════════════════════
// MY BOOKINGS
// ════════════════════════════════════════════════
async function loadMyBookings() {
  if (!_myBookingsId) return;
  const container = document.getElementById(_myBookingsId);
  if (!container) return;

  const user = auth.currentUser;
  if (!user) {
    container.innerHTML = '<div class="empty-state">Sign in to view your bookings.</div>';
    return;
  }

  container.innerHTML =
    '<div class="loading-indicator"><div class="spinner"></div> Loading bookings\u2026</div>';

  try {
    const snap = await getDocs(
      query(collection(db, 'bookings'), where('userId', '==', user.uid))
    );

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state">No bookings yet.</div>';
      return;
    }

    // Sort newest first without requiring a composite Firestore index
    const docs = snap.docs
      .map(d => d.data())
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));

    const list = document.createElement('div');
    list.className = 'bookings-list';

    docs.forEach(b => {
      const item = document.createElement('div');
      item.className = 'booking-item';

      // Support both old single-time and new start/end bookings
      const timeStr = b.startTime && b.endTime
        ? `${fmtTime(b.startTime)} \u2013 ${fmtTime(b.endTime)}`
        : b.startTime ? fmtTime(b.startTime)
        : b.time      ? fmtTime(b.time)
        : '';

      item.innerHTML = `
        <div class="booking-item-date">${fmtDisplayDate(b.date)}</div>
        ${timeStr ? `<div class="booking-item-details">${timeStr}</div>` : ''}
        <div class="booking-item-details">
          ${esc(b.children)} &middot; ${b.numChildren ?? 1} child${(b.numChildren ?? 1) !== 1 ? 'ren' : ''}
        </div>
        ${b.assignedBabysitter
          ? `<div class="booking-item-details">Sitter: ${esc(b.assignedBabysitter)}</div>`
          : ''}
        <span class="booking-status status-${esc(b.status ?? 'pending')}">
          ${esc(b.status ?? 'pending')}
        </span>`;

      list.appendChild(item);
    });

    container.innerHTML = '';
    container.appendChild(list);

  } catch (err) {
    console.error('booking: loadMyBookings', err);
    container.innerHTML =
      '<div class="error-state">Failed to load bookings. Please refresh.</div>';
  }
}

// ════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════

// Reads a pair of hour+minute selects and returns "HH:MM" or null
function readTime(prefix) {
  const h = document.getElementById(`${prefix}-hour`)?.value;
  const m = document.getElementById(`${prefix}-min`)?.value;
  if (!h || m === '' || m == null) return null;
  return `${String(h).padStart(2,'0')}:${m}`;
}

function val(id) {
  return (document.getElementById(id)?.value ?? '').trim();
}

function showMsg(el, msg) {
  if (el) el.textContent = msg;
}

function fmtHourLabel(h) {
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function fmtTime(str) {
  if (!str) return '';
  const [h, m] = str.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtDisplayDate(str) {
  if (!str) return '';
  const [y, mo, d] = str.split('-').map(Number);
  return new Date(y, mo - 1, d)
    .toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
