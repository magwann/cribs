// ---------------------------------------------------------------------------
// STORAGE
// Local offline copy of the crib. A crib is now multi-area:
//   Crib = { version, updatedAt, name, areas: { main:{items,floor,wall}, ... } }
// Pure data (no Three.js) — the same shape we sync to Firestore.
// ---------------------------------------------------------------------------

const KEY = 'cribs.myCrib.v1';

export function saveCrib(doc) {
  localStorage.setItem(KEY, JSON.stringify({ version: 2, updatedAt: Date.now(), ...doc }));
  return doc;
}

export function loadCrib() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) || null; } catch { return null; }
}
