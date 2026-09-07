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

const ui = createUI({
  onStart,
  onToggleBuild: toggleBuild,
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
  if (k === 'r') builder.rotateSelected();
  if (k === 'delete' || k === 'backspace') builder.deleteSelected();
});

// ---- render loop ----
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  player.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
