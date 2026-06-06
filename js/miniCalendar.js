// ================================================
// miniCalendar.js — Compact availability calendar
// Renders on index.html; clicking a date goes to
// dashboard.html?date=YYYY-MM-DD
// ================================================

import { db } from './firebase-app.js';
import { doc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const DAY_LABELS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const MONTH_NAMES  = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

let _year, _month;
let _available = new Set();

// ── Public Init ───────────────────────────────── //
export async function initMiniCalendar(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = spinner();

  try {
    const snap = await getDoc(doc(db, 'calendar', 'main'));
    if (snap.exists()) {
      (snap.data().openDates ?? []).forEach(d => _available.add(d));
    }
  } catch (err) {
    console.error('miniCalendar: load error', err);
  }

  const now = new Date();
  _year  = now.getFullYear();
  _month = now.getMonth();

  render(container);
}

// ── Render ────────────────────────────────────── //
function render(container) {
  container.innerHTML = buildHTML();

  container.querySelector('#mini-prev').addEventListener('click', () => {
    _month--;
    if (_month < 0) { _month = 11; _year--; }
    render(container);
  });

  container.querySelector('#mini-next').addEventListener('click', () => {
    _month++;
    if (_month > 11) { _month = 0; _year++; }
    render(container);
  });

  container.querySelectorAll('.mini-cal-day.available').forEach(el => {
    const go = () => {
      window.location.href = `./dashboard.html?date=${el.dataset.date}`;
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });
}

function buildHTML() {
  const today      = toStr(new Date());
  const firstDay   = new Date(_year, _month, 1).getDay();
  const totalDays  = new Date(_year, _month + 1, 0).getDate();

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += `<div class="mini-cal-day empty"></div>`;

  for (let d = 1; d <= totalDays; d++) {
    const str   = toStr(new Date(_year, _month, d));
    const past  = str < today;
    const avail = _available.has(str) && !past;
    const todayC = str === today ? ' today' : '';
    const pastC  = past ? ' past' : '';
    const availC = avail ? ' available' : '';

    if (avail) {
      cells += `<div class="mini-cal-day${availC}${todayC}" data-date="${str}" role="button" tabindex="0" aria-label="Available ${formatDisplayDate(str)}">${d}</div>`;
    } else {
      cells += `<div class="mini-cal-day${pastC}${todayC}">${d}</div>`;
    }
  }

  const dayHeaders = DAY_LABELS.map(l => `<span>${l}</span>`).join('');

  return `
    <div class="mini-calendar">
      <div class="mini-cal-header">
        <button class="mini-cal-nav" id="mini-prev" aria-label="Previous month">&#8249;</button>
        <h3>${MONTH_NAMES[_month]} ${_year}</h3>
        <button class="mini-cal-nav" id="mini-next" aria-label="Next month">&#8250;</button>
      </div>
      <div class="mini-cal-grid">
        <div class="mini-cal-days-header">${dayHeaders}</div>
        <div class="mini-cal-dates">${cells}</div>
      </div>
    </div>`;
}

// ── Helpers ───────────────────────────────────── //
function toStr(date) {
  const y  = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function formatDisplayDate(str) {
  const [y, mo, d] = str.split('-').map(Number);
  return new Date(y, mo - 1, d)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function spinner() {
  return '<div class="loading-indicator"><div class="spinner"></div> Loading...</div>';
}
