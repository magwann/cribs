// ---------------------------------------------------------------------------
// FIREBASE CONFIG
// These values are PUBLIC by design — they ship in the static site and that's
// expected. Security is enforced by Firebase Auth + Firestore rules, not by
// keeping this secret.
// ---------------------------------------------------------------------------

export const firebaseConfig = {
  apiKey: "AIzaSyDpoXIw6McEhYoHDkMG1Mm0oktIDdrFkc8",
  authDomain: "cribs-55ba7.firebaseapp.com",
  projectId: "cribs-55ba7",
  storageBucket: "cribs-55ba7.firebasestorage.app",
  messagingSenderId: "23575242497",
  appId: "1:23575242497:web:819f59fce3838f872d9d00",
  measurementId: "G-7RV9HHCKY9",
  // Fill this in AFTER creating the Realtime Database in the console.
  // It's shown at the top of the RTDB "Data" tab, e.g.
  //   https://cribs-55ba7-default-rtdb.firebaseio.com          (US)
  //   https://cribs-55ba7-default-rtdb.europe-west1.firebasedatabase.app  (EU)
  databaseURL: "https://cribs-55ba7-default-rtdb.firebaseio.com",
};
