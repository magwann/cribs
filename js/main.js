import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createBuilder } from './builder.js';
import { createUI } from './ui.js';
import { saveCrib, loadCrib } from './storage.js';

// ---------------------------------------------------------------------------
// MAIN — bootstraps modules, owns the mode state and the render loop.
// Modes: EXPLORE (walk around) and BUILD (place/edit furniture).
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const { renderer, scene, camera } = createWorld(canvas);
const player = createPlayer(scene, camera, canvas);

let building = false;

// ---- top-down build view ----
// A near-orthographic overhead camera for laying out furniture. -Z points to
// the top of the screen so the back wall reads as "up" on the map.
let topDown = false;
let tdHeight = 15; // camera height = zoom level
function applyTopDown() {
  camera.up.set(0, 0, -1);
  camera.position.set(0, tdHeight, 0);
  camera.lookAt(0, 0, 0);
}
function setView(td) {
  topDown = td;
  player.setCameraControl(!td);
  if (td) applyTopDown();
  else camera.up.set(0, 1, 0); // player.update repositions the orbit next frame
  ui.setView(td);
}
// wheel zooms the overhead view in/out
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
  onObjAction: (act) => {
    if (act === 'rotate') builder.rotateSelected();
    if (act === 'delete') builder.deleteSelected();
  },
});

const builder = createBuilder(scene, camera, canvas, {
  onSelect: (item) => ui.setSelected(!!item),
});

// Load any previously saved crib on boot.
const saved = loadCrib();
if (saved) builder.loadItems(saved.items);

function onStart() {
  ui.showHUD();
}

function toggleBuild() {
  building = !building;
  builder.setActive(building);
  player.setEnabled(!building);
  ui.setMode(building);
  // Default to the overhead view when building; restore 3D on exit.
  setView(building);
}

function toggleView() {
  if (!building) return; // top-down only applies while building
  setView(!topDown);
}

function onSave() {
  saveCrib(builder.getItemsData());
  ui.flashSave('saved ✓');
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
  if (topDown) applyTopDown(); // keep overhead framing on zoom / resize
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
