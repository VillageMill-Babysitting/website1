// ================================================
// booking.js — Booking form & "My Bookings" list
//
// The calendar sets the date. Start and end time
// are both chosen directly in the booking form.
// End time options auto-filter to only show times
// after the selected start time.
// ================================================

import { db, auth } from './firebase-app.js';
import { collection, addDoc, getDocs, query, where, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const ALL_TIMES = [
  '08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00','19:00'
];

let _myBookingsId = '';

// ── Public Init ───────────────────────────────── //
export function initBookingForm(formContainerId, myBookingsId) {
  _myBookingsId = myBookingsId ?? '';

  const container = document.getElementById(formContainerId);
  if (!container) return;

  // Populate start time select
  const startSel = document.getElementById('booking-start');
  if (startSel) {
    startSel.innerHTML = '<option value="">Start time\u2026</option>' +
      ALL_TIMES.map(t => `<option value="${t}">${formatTime(t)}</option>`).join('');
  }

  // Populate end time select (initially all options)
  populateEndTimes('');

  // When start changes, re-filter end time options
  startSel?.addEventListener('change', e => populateEndTimes(e.target.value));

  // Form submit
  container.querySelector('#booking-form')
    ?.addEventListener('submit', e => { e.preventDefault(); handleSubmit(); });

  loadMyBookings();
}

// ── Called by calendar.js when a date is selected ─ //
export function setBookingDate(date) {
  const dateEl = document.getElementById('booking-date');
  if (dateEl && date) dateEl.value = date;

  if (date) {
    document.getElementById('booking-form-panel')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ── Populate end time options (only times > start) ─ //
function populateEndTimes(startVal) {
  const endSel = document.getElementById('booking-end');
  if (!endSel) return;

  const currentEnd = endSel.value;
  const available  = startVal
    ? ALL_TIMES.filter(t => t > startVal)
    : ALL_TIMES;

  endSel.innerHTML = '<option value="">End time\u2026</option>' +
    available.map(t => {
      const sel = t === currentEnd ? ' selected' : '';
      return `<option value="${t}"${sel}>${formatTime(t)}</option>`;
    }).join('');
}

// ── Handle Form Submit ────────────────────────── //
async function handleSubmit() {
  const errorEl   = document.getElementById('booking-error');
  const successEl = document.getElementById('booking-success');
  const submitBtn = document.getElementById('booking-submit');
  const user      = auth.currentUser;

  if (errorEl)   errorEl.textContent   = '';
  if (successEl) successEl.textContent = '';

  if (!user) { showMsg(errorEl, 'Please sign in to make a booking.'); return; }

  const dateVal  = val('booking-date');
  const startVal = val('booking-start');
  const endVal   = val('booking-end');

  if (!dateVal)  { showMsg(errorEl, 'Please select or enter a date.');  return; }
  if (!startVal) { showMsg(errorEl, 'Please select a start time.');      return; }
  if (!endVal)   { showMsg(errorEl, 'Please select an end time.');       return; }
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

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting\u2026'; }

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

    document.getElementById('booking-form')?.reset();
    populateEndTimes('');                          // reset end time options
    showMsg(successEl, 'Booking submitted. We will contact you to confirm.');
    await loadMyBookings();

  } catch (err) {
    console.error('booking: submit error', err);
    showMsg(errorEl, 'Failed to submit. Please try again.');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Booking'; }
  }
}

// ── Load User's Bookings ─────────────────────── //
async function loadMyBookings() {
  if (!_myBookingsId) return;
  const container = document.getElementById(_myBookingsId);
  if (!container) return;

  const user = auth.currentUser;
  if (!user) {
    container.innerHTML = '<div class="empty-state">Sign in to view your bookings.</div>';
    return;
  }

  container.innerHTML = '<div class="loading-indicator"><div class="spinner"></div> Loading bookings\u2026</div>';

  try {
    const snap = await getDocs(
      query(collection(db, 'bookings'), where('userId', '==', user.uid))
    );

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state">No bookings yet.</div>';
      return;
    }

    const docs = snap.docs
      .map(d => d.data())
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));

    const list = document.createElement('div');
    list.className = 'bookings-list';

    docs.forEach(b => {
      const item = document.createElement('div');
      item.className = 'booking-item';

      // Support both old single-time bookings and new start/end bookings
      const timeDisplay = b.startTime && b.endTime
        ? `${formatTime(b.startTime)} &ndash; ${formatTime(b.endTime)}`
        : b.startTime
          ? formatTime(b.startTime)
          : b.time ? formatTime(b.time) : '';

      item.innerHTML = `
        <div class="booking-item-date">${formatDisplayDate(b.date)}</div>
        ${timeDisplay ? `<div class="booking-item-details">${timeDisplay}</div>` : ''}
        <div class="booking-item-details">${esc(b.children)} &middot; ${b.numChildren ?? 1} child${(b.numChildren ?? 1) !== 1 ? 'ren' : ''}</div>
        ${b.assignedBabysitter ? `<div class="booking-item-details">Sitter: ${esc(b.assignedBabysitter)}</div>` : ''}
        <span class="booking-status status-${esc(b.status ?? 'pending')}">${esc(b.status ?? 'pending')}</span>`;
      list.appendChild(item);
    });

    container.innerHTML = '';
    container.appendChild(list);

  } catch (err) {
    console.error('booking: load bookings error', err);
    container.innerHTML = '<div class="error-state">Failed to load bookings. Please refresh.</div>';
  }
}

// ── Helpers ───────────────────────────────────── //
function val(id) {
  return (document.getElementById(id)?.value ?? '').trim();
}

function showMsg(el, msg) {
  if (el) el.textContent = msg;
}

export function formatTime(str) {
  if (!str) return '';
  const [h, m] = str.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatDisplayDate(str) {
  if (!str) return '';
  const [y, mo, d] = str.split('-').map(Number);
  return new Date(y, mo - 1, d)
    .toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
