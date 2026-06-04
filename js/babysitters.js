// ================================================
// babysitters.js — Babysitter cards section
// Loads all docs from /babysitters and renders cards
// ================================================

import { db } from './firebase-app.js';
import { collection, getDocs, query, orderBy }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Public Init ───────────────────────────────── //
export async function initBabysitters(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<div class="loading-indicator"><div class="spinner"></div> Loading...</div>';

  try {
    const snap = await getDocs(
      query(collection(db, 'babysitters'), orderBy('name'))
    );

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state">No babysitters listed yet. Check back soon.</div>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'sitters-grid';
    snap.forEach(doc => grid.appendChild(buildCard(doc.data())));

    container.innerHTML = '';
    container.appendChild(grid);

  } catch (err) {
    console.error('babysitters: load error', err);
    container.innerHTML = '<div class="error-state">Failed to load babysitters. Please refresh the page.</div>';
  }
}

// ── Build Card ────────────────────────────────── //
function buildCard(s) {
  const card = document.createElement('div');
  card.className = 'sitter-card';

  const initial = (s.name || '?')[0].toUpperCase();
  const photo   = s.photo
    ? `<img class="sitter-photo" src="${esc(s.photo)}" alt="${esc(s.name)}" loading="lazy">`
    : `<div class="sitter-photo-placeholder">${initial}</div>`;

  const certs = (s.certifications ?? []).join(' &middot; ');

  card.innerHTML = `
    ${photo}
    <div class="sitter-info">
      <div class="sitter-name">${esc(s.name ?? 'Sitter')}</div>
      ${s.age ? `<div class="sitter-age">Age ${s.age}</div>` : ''}
      ${s.bio ? `<div class="sitter-bio">${esc(s.bio)}</div>` : ''}
      ${certs ? `<div style="font-size:0.76rem;color:var(--text-muted);margin-top:0.5rem">${certs}</div>` : ''}
    </div>`;

  return card;
}

// ── Escape HTML ───────────────────────────────── //
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
