// ---------------------------------------------------------------------------
// STORAGE
// Milestone 1 persists the crib layout to localStorage. The save format is a
// plain JSON doc so that swapping in Firebase later is a matter of changing
// saveCrib/loadCrib to read/write the same shape from Firestore.
//
//   Crib = { version, updatedAt, items: [ { id, x, z, rot } ] }
//
// (x,z are floor coords; rot is Y rotation in radians. Nothing here imports
//  Three.js — it's pure data, which is exactly what we'll sync to the cloud.)
// ---------------------------------------------------------------------------

const KEY = 'cribs.myCrib.v1';
const VERSION = 1;

export function saveCrib(items) {
  const doc = {
    version: VERSION,
    updatedAt: Date.now(),
    items: items.map((it) => ({
      id: it.id,
      x: round(it.x),
      y: round(it.y || 0),
      z: round(it.z),
      rot: round(it.rot),
      color: it.color || null,
    })),
  };
  localStorage.setItem(KEY, JSON.stringify(doc));
  return doc;
}

export function loadCrib() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const doc = JSON.parse(raw);
    if (!doc || !Array.isArray(doc.items)) return null;
    return doc;
  } catch {
    return null;
  }
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
