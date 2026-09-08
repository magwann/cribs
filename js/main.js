import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createBuilder } from './builder.js';
import { createUI } from './ui.js';
import { saveCrib as saveLocal, loadCrib as loadLocal } from './storage.js';
import { authReady, saveMyCrib, loadCribById } from './firebase.js';

// ---------------------------------------------------------------------------
// MAIN — bootstraps modules, owns mode state + render loop, and orchestrates
// the cloud layer: anonymous auth, loading your own crib (or someone else's
// via ?crib=<id>), and saving to Firestore.
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const { renderer, scene, camera } = createWorld(canvas);
const player = createPlayer(scene, camera, canvas);

let building = false;
let visiting = false; // true when in someone else's crib (read-only)
let myUid = null;
let cribId = null;    // the crib currently loaded

// ---- top-down build view ----
let topDown = false;
let tdHeight = 15;
function applyTopDown() {
  camera.up.set(0, 0, -1);
  camera.position.set(0, tdHeight, 0);
  camera.lookAt(0, 0, 0);
}
function setView(td) {
  topDown = td;
  player.setCameraControl(!td);
  if (td) applyTopDown();
  else camera.up.set(0, 1, 0);
  ui.setView(td);
}
canvas.addEventListener('wheel', (e) => {
  if (!topDown) return;
  e.preventDefault();
  tdHeight = Math.max(8, Math.min(22, tdHeight + e.deltaY * 0.01));
}, { passive: false });

const ui = createUI({
  onStart,
  onToggleBuild: toggleBuild,
  onToggleView: toggleView,
  onPick: (id) => builder.arm(id),
  onSave,
  onShare,
  onLeave,
  onObjAction: (act) => {
    if (act === 'rotate') builder.rotateSelected();
    if (act === 'delete') builder.deleteSelected();
  },
});

const builder = createBuilder(scene, camera, canvas, {
  onSelect: (item) => ui.setSelected(!!item),
});

// ---- cloud boot ----
initCloud();
async function initCloud() {
  const params = new URLSearchParams(location.search);
  const targetId = params.get('crib');

  try {
    myUid = await authReady;
  } catch (e) {
    console.error('auth failed', e);
    ui.toast('offline — changes save locally only');
  }

  cribId = targetId || myUid;
  visiting = !!(cribId && myUid && cribId !== myUid);

  let data = null;
  try {
    if (cribId) data = await loadCribById(cribId);
  } catch (e) {
    console.error('crib load failed', e);
  }

  // First run on your own crib: migrate any milestone-1 local layout to cloud.
  if (!visiting && !data) {
    const local = loadLocal();
    if (local) data = local;
  }

  if (data && data.items) builder.loadItems(data.items);
  ui.setVisiting(visiting, data && data.name);
}

function onStart() { ui.showHUD(); }

function toggleBuild() {
  if (visiting) { ui.toast("this isn't your crib — visit ends when you leave"); return; }
  building = !building;
  builder.setActive(building);
  player.setEnabled(!building);
  ui.setMode(building);
  setView(building);
}

function toggleView() {
  if (!building) return;
  setView(!topDown);
}

async function onSave() {
  const items = builder.getItemsData();
  saveLocal(items); // offline mirror
  try {
    await saveMyCrib(items);
    ui.flashSave('saved to cloud ✓');
  } catch (e) {
    console.error('cloud save failed', e);
    ui.flashSave('saved locally (offline)');
  }
}

function onShare() {
  const id = visiting ? cribId : myUid;
  if (!id) { ui.toast('still connecting…'); return; }
  const url = `${location.origin}${location.pathname}?crib=${id}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(
      () => ui.toast('crib link copied ✓'),
      () => ui.toast(url)
    );
  } else {
    ui.toast(url);
  }
}

function onLeave() {
  // Drop the ?crib param to return to your own (editable) crib.
  location.href = `${location.origin}${location.pathname}`;
}

// keyboard shortcuts
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'b') toggleBuild();
  if (!building) return;
  if (k === 'v') toggleView();
  if (k === 'r') builder.rotateSelected();
  if (k === 'delete' || k === 'backspace') builder.deleteSelected();
});

// ---- render loop ----
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  player.update(dt);
  if (topDown) applyTopDown();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
