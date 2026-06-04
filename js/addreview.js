// ================================================
// addreview.js — Add Review modal controller
// Opens on button click; writes to /reviews
// ================================================

import { db, auth } from './firebase-app.js';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { reloadReviews } from './reviews.js';

let _reviewsContainerId = '';

// ── Public Init ───────────────────────────────── //
export async function initAddReview(buttonId, modalId, reviewsContainerId) {
  _reviewsContainerId = reviewsContainerId ?? '';

  const btn   = document.getElementById(buttonId);
  const modal = document.getElementById(modalId);
  if (!btn || !modal) return;

  // Populate babysitter dropdown
  await populateSitters(modal);

  // Open modal
  btn.addEventListener('click', () => {
    if (!auth.currentUser) {
      // Trigger auth modal instead
      document.getElementById('auth-modal')?.classList.add('open');
      return;
    }
    resetForm(modal);
    modal.classList.add('open');
  });

  // Close modal
  modal.querySelector('.modal-close')?.addEventListener('click', () => close(modal));
  modal.addEventListener('click', e => { if (e.target === modal) close(modal); });

  // Submit
  modal.querySelector('#review-form')?.addEventListener('submit', e => {
    e.preventDefault();
    submitReview(modal);
  });
}

// ── Populate Babysitter Dropdown ──────────────── //
async function populateSitters(modal) {
  const select = modal.querySelector('#review-babysitter');
  if (!select) return;

  try {
    const snap = await getDocs(query(collection(db, 'babysitters'), orderBy('name')));
    const opts = snap.docs.map(d => {
      const name = d.data().name ?? 'Unknown';
      return `<option value="${esc(name)}">${esc(name)}</option>`;
    }).join('');
    select.innerHTML = `<option value="">Select a babysitter&hellip;</option>${opts}`;
  } catch (err) {
    console.error('addreview: sitter load error', err);
    select.innerHTML = '<option value="">Could not load sitters</option>';
  }
}

// ── Submit Review ─────────────────────────────── //
async function submitReview(modal) {
  const submitBtn = modal.querySelector('#review-submit');
  const errorEl   = modal.querySelector('#review-error');
  const user      = auth.currentUser;

  if (!user) { showError(errorEl, 'Please sign in to submit a review.'); return; }

  const babysitter  = modal.querySelector('#review-babysitter')?.value ?? '';
  const ratingInput = modal.querySelector('input[name="rating"]:checked');
  const reviewText  = (modal.querySelector('#review-text')?.value ?? '').trim();

  if (!babysitter)  { showError(errorEl, 'Please select a babysitter.');  return; }
  if (!ratingInput) { showError(errorEl, 'Please choose a star rating.'); return; }

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Submitting\u2026';
  if (errorEl) errorEl.textContent = '';

  try {
    const name = user.displayName || user.email?.split('@')[0] || 'Anonymous';
    await addDoc(collection(db, 'reviews'), {
      babysitter,
      rating:    parseInt(ratingInput.value, 10),
      review:    reviewText,
      reviewer:  name,
      createdAt: serverTimestamp()
    });

    close(modal);
    if (_reviewsContainerId) await reloadReviews(_reviewsContainerId);

  } catch (err) {
    console.error('addreview: submit error', err);
    showError(errorEl, 'Failed to submit. Please try again.');
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Submit Review';
  }
}

// ── Helpers ───────────────────────────────────── //
function close(modal) { modal.classList.remove('open'); }

function resetForm(modal) {
  modal.querySelector('#review-form')?.reset();
  const err = modal.querySelector('#review-error');
  if (err) err.textContent = '';
}

function showError(el, msg) {
  if (el) el.textContent = msg;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
