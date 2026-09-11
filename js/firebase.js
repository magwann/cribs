import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signOut,
  signInWithPopup, GoogleAuthProvider, OAuthProvider, signInAnonymously,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, deleteUser,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';

// ---------------------------------------------------------------------------
// FIREBASE
// Local-first: nothing here runs until the player chooses to GO ONLINE, except
// reading a published crib for a visit (public read, no auth needed). Going
// online signs in with Google / Apple / email+password; the uid is the crib id.
// Cribs live at cribs/{uid} — public read, owner-only write (security rules).
// ---------------------------------------------------------------------------

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Shared with the realtime/social layer (net.js).
export { app, auth, db };

let currentUser = null;
const listeners = [];
onAuthStateChanged(auth, (u) => {
  currentUser = u;
  listeners.forEach((cb) => cb(u));
});

export function onUser(cb) { listeners.push(cb); cb(currentUser); }
export function getUser() { return currentUser; }
export function getUid() { return currentUser ? currentUser.uid : null; }

// ---- sign-in methods (only invoked from the GO ONLINE flow) ----
export function signInGoogle() { return signInWithPopup(auth, new GoogleAuthProvider()); }
export function signInApple() { return signInWithPopup(auth, new OAuthProvider('apple.com')); }
export function signInEmail(email, pw) { return signInWithEmailAndPassword(auth, email, pw); }
export function signUpEmail(email, pw) { return createUserWithEmailAndPassword(auth, email, pw); }
export function signInGuest() { return signInAnonymously(auth); }
// delete the current (anonymous) user so guest sessions don't pile up
export function deleteMe() { return currentUser ? deleteUser(currentUser) : Promise.resolve(); }
export function logOut() { return signOut(auth); }

// ---- crib persistence ----
// doc = { name, areas: { main:{items,floor,wall}, medium:{...}, small:{...} } }
export async function saveMyCrib(doc_) {
  if (!currentUser) throw new Error('not online');
  await setDoc(doc(db, 'cribs', currentUser.uid), {
    ...doc_,
    owner: currentUser.uid,
    updatedAt: serverTimestamp(),
  });
}

// Read any crib by id — works unauthenticated (public read) so visits need no account.
export async function loadCribById(id) {
  const snap = await getDoc(doc(db, 'cribs', id));
  return snap.exists() ? snap.data() : null;
}
