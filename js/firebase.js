import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';

// ---------------------------------------------------------------------------
// FIREBASE
// Anonymous auth gives every visitor a stable UID that doubles as their crib
// id. Cribs live at cribs/{uid} in Firestore — publicly readable (anyone can
// visit) but writable only by the owner (enforced by the security rules).
// The saved shape matches storage.js exactly, so this is a drop-in for the
// old localStorage save.
// ---------------------------------------------------------------------------

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUid = null;

// Resolves with the signed-in UID once anonymous auth completes.
export const authReady = new Promise((resolve, reject) => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUid = user.uid;
      resolve(user.uid);
    }
  });
  signInAnonymously(auth).catch(reject);
});

export function getUid() {
  return currentUid;
}

// Write the caller's own crib. Doc id === uid, so the rules allow it.
export async function saveMyCrib(items, name = 'my crib') {
  if (!currentUid) throw new Error('not signed in');
  await setDoc(doc(db, 'cribs', currentUid), {
    name,
    items,
    updatedAt: serverTimestamp(),
  });
}

// Read any crib by id (yours or someone else's). Null if it doesn't exist.
export async function loadCribById(id) {
  const snap = await getDoc(doc(db, 'cribs', id));
  return snap.exists() ? snap.data() : null;
}
