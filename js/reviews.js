// ================================================
// reviews.js — Reviews display
// Loads recent docs from /reviews, renders cards
// ================================================

import { db } from './firebase-app.js';
import { collection, getDocs, query, orderBy, limit as fsLimit }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Public Init ───────────────────────────────── //
export async function initReviews(containerId, limitCount = 6) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<div class="loading-indicator"><div class="spinner"></div> Loading reviews...</div>';

  try {
    const snap = await getDocs(
      query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), fsLimit(limitCount))
    );

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state">No reviews yet. Be the first to leave one.</div>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'reviews-grid';
    snap.forEach(doc => grid.appendChild(buildCard(doc.data())));

    container.innerHTML = '';
    container.appendChild(grid);

  } catch (err) {
    console.error('reviews: load error', err);
    container.innerHTML = '<div class="error-state">Failed to load reviews. Please refresh.</div>';
  }
}

// Re-export as alias for addreview.js to call
export const reloadReviews = initReviews;

// ── Build Card ────────────────────────────────── //
function buildCard(r) {
  const card = document.createElement('div');
  card.className = 'review-card';

  const name  = formatName(r.reviewer ?? 'Anonymous');
  const stars = buildStars(r.rating ?? 0);

  card.innerHTML = `
    <div class="review-header">
      <span class="review-reviewer">${esc(name)}</span>
      <span class="star-rating" aria-label="${r.rating ?? 0} out of 5 stars">${stars}</span>
    </div>
    ${r.babysitter ? `<div class="review-sitter">Sitter: ${esc(r.babysitter)}</div>` : ''}
    ${r.review     ? `<div class="review-text">${esc(r.review)}</div>` : ''}`;

  return card;
}

// ── Helpers ───────────────────────────────────── //
function buildStars(rating) {
  const n = Math.round(Math.max(0, Math.min(5, rating)));
  return '&#9733;'.repeat(n) + '&#9734;'.repeat(5 - n);
}

function formatName(fullName) {
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
