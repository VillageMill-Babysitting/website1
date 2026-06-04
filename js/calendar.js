// ================================================
// calendar.js — Full booking calendar (dashboard)
// Renders month view; emits date+time via callback
// ================================================

import { db } from './firebase-app.js';
import { doc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const DAY_LABELS  = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

let _year, _month;
let _openDates   = new Set();
let _openTimes   = [];
let _selDate     = null;
let _selTime     = null;
let _onSelect    = null;
let _containerId = '';

// ── Public Init ───────────────────────────────── //
export async function initCalendar(containerId, onSelect) {
  _containerId = containerId;
  _onSelect    = onSelect ?? null;

  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<div class="loading-indicator"><div class="spinner"></div> Loading calendar...</div>';

  try {
    const snap = await getDoc(doc(db, 'calendar', 'main'));
    if (snap.exists()) {
      const data = snap.data();
      (data.openDates ?? []).forEach(d => _openDates.add(d));
      _openTimes = (data.openTimes ?? []).sort();
    }
  } catch (err) {
    console.error('calendar: load error', err);
    container.innerHTML = '<div class="error-state">Failed to load calendar. Please refresh.</div>';
    return;
  }

  // Pre-select date from URL param (from mini-calendar click)
  const params  = new URLSearchParams(window.location.search);
  const preDate = params.get('date');
  if (preDate && _openDates.has(preDate)) {
    _selDate = preDate;
    const [y, m] = preDate.split('-').map(Number);
    _year  = y;
    _month = m - 1;
  } else {
    const now = new Date();
    _year  = now.getFullYear();
    _month = now.getMonth();
  }

  render(container);
}

// ── Render ────────────────────────────────────── //
function render(container) {
  container.innerHTML = buildCalHTML() + buildTimeSlotsHTML();
  attachHandlers(container);
}

function buildCalHTML() {
  const today     = toStr(new Date());
  const firstDay  = new Date(_year, _month, 1).getDay();
  const totalDays = new Date(_year, _month + 1, 0).getDate();

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div class="full-cal-day empty"></div>';

  for (let d = 1; d <= totalDays; d++) {
    const str   = toStr(new Date(_year, _month, d));
    const past  = str < today;
    const avail = _openDates.has(str) && !past;
    const sel   = str === _selDate;

    let cls = 'full-cal-day';
    if (past)        cls += ' past';
    if (str===today) cls += ' today';
    if (avail)       cls += ' available';
    if (sel)         cls += ' selected';

    if (avail || sel) {
      cells += `<div class="${cls}" data-date="${str}" role="button" tabindex="0">${d}</div>`;
    } else {
      cells += `<div class="${cls}">${d}</div>`;
    }
  }

  const headers = DAY_LABELS.map(l => `<span>${l}</span>`).join('');

  return `
    <div class="full-calendar">
      <div class="full-cal-header">
        <button class="full-cal-nav" id="cal-prev" aria-label="Previous month">&#8249;</button>
        <h3>${MONTH_NAMES[_month]} ${_year}</h3>
        <button class="full-cal-nav" id="cal-next" aria-label="Next month">&#8250;</button>
      </div>
      <div class="full-cal-grid">
        <div class="full-cal-days-header">${headers}</div>
        <div class="full-cal-dates" id="cal-dates">${cells}</div>`;
}

function buildTimeSlotsHTML() {
  if (!_selDate) return '</div></div>';  // close .full-cal-grid and .full-calendar

  if (!_openTimes.length) {
    return `
        <div class="time-slots-container">
          <div class="empty-state" style="padding:0.5rem 0;text-align:left">No time slots available for this date.</div>
        </div>
      </div>
    </div>`;
  }

  const slots = _openTimes.map(t => {
    const sel = t === _selTime ? ' selected' : '';
    return `<button class="time-slot-btn${sel}" data-time="${t}">${formatTime(t)}</button>`;
  }).join('');

  return `
        <div class="time-slots-container">
          <div class="time-slots-title">Select a time &mdash; ${formatDisplayDate(_selDate)}</div>
          <div class="time-slots-grid" id="time-slots-grid">${slots}</div>
        </div>
      </div>
    </div>`;
}

function attachHandlers(container) {
  container.querySelector('#cal-prev')?.addEventListener('click', () => {
    _month--;
    if (_month < 0) { _month = 11; _year--; }
    render(container);
  });

  container.querySelector('#cal-next')?.addEventListener('click', () => {
    _month++;
    if (_month > 11) { _month = 0; _year++; }
    render(container);
  });

  container.querySelectorAll('.full-cal-day.available').forEach(el => {
    el.addEventListener('click', () => {
      _selDate = el.dataset.date;
      _selTime = null;
      render(container);
      if (_onSelect) _onSelect(_selDate, null);
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); el.click();
      }
    });
  });

  container.querySelectorAll('.time-slot-btn').forEach(el => {
    el.addEventListener('click', () => {
      _selTime = el.dataset.time;
      container.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
      el.classList.add('selected');
      if (_onSelect) _onSelect(_selDate, _selTime);
    });
  });
}

// ── Helpers ───────────────────────────────────── //
function toStr(date) {
  const y  = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

export function formatTime(str) {
  if (!str) return '';
  const [h, m] = str.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function formatDisplayDate(str) {
  if (!str) return '';
  const [y, mo, d] = str.split('-').map(Number);
  return new Date(y, mo - 1, d)
    .toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
}
