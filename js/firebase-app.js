// ================================================
// firebase-app.js — Firebase core & auth utilities
// ================================================
// SETUP: Replace the placeholder values below with
// your project config from the Firebase console:
// console.firebase.google.com
//   → Project Settings → General → Your apps → SDK setup
// ================================================

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithPopup,
  GoogleAuthProvider, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut as _signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Config ────────────────────────────────────── //
const firebaseConfig = {
  apiKey: "AIzaSyDPqpCLfcXLOVQgRfknrB7sB3ogtN_DA1w",
  authDomain: "babysitting-d5791.firebaseapp.com",
  projectId: "babysitting-d5791",
  storageBucket: "babysitting-d5791.firebasestorage.app",
  messagingSenderId: "664714812625",
  appId: "1:664714812625:web:16f206a4e667b6d0fbb9f0",
  measurementId: "G-DKN8S359M2"
};

const app         = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ── User Role ─────────────────────────────────── //
export async function getUserRole(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data().role ?? 'parent') : 'parent';
  } catch {
    return 'parent';
  }
}

// ── Google Sign-In ────────────────────────────── //
const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user   = result.user;
    const ref    = doc(db, 'users', user.uid);
    const snap   = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name:      user.displayName ?? '',
        email:     user.email       ?? '',
        role:      'parent',
        createdAt: serverTimestamp()
      });
    }
    return { success: true, user };
  } catch (err) {
    return { success: false, error: friendlyError(err.code) };
  }
}

// ── Email Sign-In ─────────────────────────────── //
export async function signInWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: result.user };
  } catch (err) {
    return { success: false, error: friendlyError(err.code) };
  }
}

// ── Email Sign-Up ─────────────────────────────── //
export async function signUpWithEmail(email, password, name) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', result.user.uid), {
      name:      name  ?? '',
      email:     email ?? '',
      role:      'parent',
      createdAt: serverTimestamp()
    });
    return { success: true, user: result.user };
  } catch (err) {
    return { success: false, error: friendlyError(err.code) };
  }
}

// ── Sign Out ──────────────────────────────────── //
export async function signOut() {
  try {
    await _signOut(auth);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Auth State Observer ───────────────────────── //
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ── Friendly Error Messages ───────────────────── //
function friendlyError(code) {
  const map = {
    'auth/user-not-found':       'No account found with that email.',
    'auth/wrong-password':       'Incorrect password. Please try again.',
    'auth/invalid-credential':   'Invalid email or password.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/too-many-requests':    'Too many attempts. Please try again later.'
  };
  return map[code] ?? 'An unexpected error occurred. Please try again.';
}
