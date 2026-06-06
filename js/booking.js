// ================================================
// booking.js — Booking form & "My Bookings" list
//
// Date and time are real editable form fields.
// setBookingDateTime() pre-fills them when the
// calendar is clicked, but admin/parent can also
// enter any date and time directly without needing
// a calendar selection first.
// ================================================

import { db, auth } from './firebase-app.js';
import { collection, addDoc, getDocs, query, where, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let _myBookingsId = '';

// ── Public Init ───────────────────────────────── //
export function initBookingForm(formContainerId, myBookingsId) {
  _myBookingsId = myBookingsId ?? '';

  const container = document.getElementById(formContainerId);
  if (!container) return;

  container.querySelector('#booking-form')
    ?.addEventListener('submit', e => { e.preventDefault(); handleSubmit(); });

  loadMyBookings();
}

// ── Pre-fill from calendar selection ─────────── //
// Called from dashboard.html's onCalendarSelect().
// Both fields are still directly editable by the user.
export function setBookingDateTime(date, time) {
  const dateEl = document.getElementById('booking-date');
  const timeEl = document.getElementById('booking-time');

  // input[type="date"] expects YYYY-MM-DD natively
  if (dateEl && date) dateEl.value = date;

  // <select> options use the same "HH:MM" values
  if (timeEl && time) timeEl.value = time;

  // Scroll the form panel into view on first date pick
  if (date) {
    document.getElementById('booking-form-panel')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
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

  // Read directly from the form fields — no calendar dep
  const dateVal = val('booking-date');   // YYYY-MM-DD
  const timeVal = val('booking-time');   // "09:00" etc.

  if (!dateVal) { showMsg(errorEl, 'Please select or enter a date.'); return; }
  if (!timeVal) { showMsg(errorEl, 'Please select a time.');          return; }

  const parentName  = val('booking-parent-name');
  const phone       = val('booking-phone');
  const children    = val('booking-children');
  const numChildren = parseInt(val('booking-num-children') || '1', 10);

  if (!parentName) { showMsg(errorEl, 'Please enter your name.');         return; }
  if (!phone)      { showMsg(errorEl, 'Please enter a phone number.');    return; }
  if (!children)   { showMsg(errorEl, 'Please enter child name(s).');     return; }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting\u2026'; }

  try {
    await addDoc(collection(db, 'bookings'), {
      parentName,
      phone,
      children,
      numChildren:        isNaN(numChildren) ? 1 : numChildren,
      date:               dateVal,
      time:               timeVal,
      status:             'pending',
      assignedBabysitter: '',
      userId:             user.uid,
      createdAt:          serverTimestamp()
    });

    document.getElementById('booking-form')?.reset();
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

    // Sort client-side — avoids requiring a composite Firestore index
    const docs = snap.docs
      .map(d => d.data())
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));

    const list = document.createElement('div');
    list.className = 'bookings-list';

    docs.forEach(b => {
      const item = document.createElement('div');
      item.className = 'booking-item';
      item.innerHTML = `
        <div class="booking-item-date">${formatDisplayDate(b.date)} &mdash; ${formatTime(b.time)}</div>
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

function formatTime(str) {
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
