import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createBuilder } from './builder.js';
import { createUI } from './ui.js';
import { CATALOG_BY_ID } from './catalog.js';
import { saveCrib as saveLocal, loadCrib as loadLocal } from './storage.js';
import {
  onUser, getUid, saveMyCrib, loadCribById,
  signInGoogle, signInApple, signInEmail, signUpEmail, logOut,
} from './firebase.js';

// ---------------------------------------------------------------------------
// MAIN — bootstraps modules, owns mode state + render loop.
// Local-first: building/exploring/visiting need no account. Signing in ("go
// online") publishes your crib to the cloud and unlocks social features.
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const { renderer, scene, camera } = createWorld(canvas);
const player = createPlayer(scene, camera, canvas);

let building = false;
let visiting = false; // true when in someone else's crib (read-only)
let cribId = null;    // the crib currently loaded (id when visiting)

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
  onAccount,
  onAuth,
  onObjAction: (act) => {
    if (act === 'rotate') builder.rotateSelected();
    if (act === 'delete') builder.deleteSelected();
  },
});

const builder = createBuilder(scene, camera, canvas, {
  onSelect: (item) => ui.setSelected(!!item),
});

// ---- click-a-seat-to-sit (explore mode only) ----
let downX = 0, downY = 0;
canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
canvas.addEventListener('pointerup', (e) => {
  if (building) return;                          // build mode handles its own clicks
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // was a camera drag
  const item = builder.pickItemAt(e.clientX, e.clientY);
  if (!item) return;
  const cat = CATALOG_BY_ID[item.id];
  if (cat && cat.sit) sitOn(item, cat);
});

function sitOn(item, cat) {
  item.group.updateMatrixWorld();
  let best = null, bestD = Infinity;
  for (const s of cat.sit) {
    const w = new THREE.Vector3(s.x, s.y, s.z).applyMatrix4(item.group.matrixWorld);
    const d = w.distanceTo(player.avatar.position);
    if (d < bestD) { bestD = d; best = { w, yaw: item.group.rotation.y + (s.yaw || 0) }; }
  }
  if (best) { player.sit(best.w, best.yaw); ui.toast('sitting — press W to stand'); }
}

// ---- boot (no auth) ----
initBoot();
async function initBoot() {
  const params = new URLSearchParams(location.search);
  cribId = params.get('crib');
  visiting = !!cribId;

  let data = null;
  if (visiting) {
    try { data = await loadCribById(cribId); }
    catch (e) { console.error('crib load failed', e); }
    if (!data) ui.toast('that crib could not be found');
  } else {
    data = loadLocal(); // your own crib lives locally until you go online
  }
  if (data && data.items) builder.loadItems(data.items);
  ui.setVisiting(visiting, data && data.name);
}

// Keep the account chip in sync; publish your crib the moment you go online.
let wasOnline = false;
onUser(async (user) => {
  ui.setOnline(user);
  if (user && !wasOnline && !visiting) {
    wasOnline = true;
    try {
      await saveMyCrib(builder.getItemsData());
      ui.toast('you’re online — crib published ✓');
    } catch (e) { console.error('publish failed', e); }
  }
  if (!user) wasOnline = false;
});

function onStart() { ui.showHUD(); }

function toggleBuild() {
  if (visiting) { ui.toast("this isn't your crib"); return; }
  player.stand();
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
  saveLocal(items); // always keep a local copy
  if (getUid()) {
    try { await saveMyCrib(items); ui.flashSave('saved to cloud ✓'); }
    catch (e) { console.error(e); ui.flashSave('saved locally (cloud error)'); }
  } else {
    ui.flashSave('saved locally');
  }
}

function onShare() {
  if (visiting) return share(cribId);
  const uid = getUid();
  if (!uid) { ui.toast('go online to share your crib'); ui.openAuth(); return; }
  share(uid);
}
function share(id) {
  const url = `${location.origin}${location.pathname}?crib=${id}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => ui.toast('crib link copied ✓'), () => ui.toast(url));
  } else ui.toast(url);
}

function onLeave() { location.href = `${location.origin}${location.pathname}`; }

function onAccount() {
  if (getUid()) {
    if (confirm('Sign out and go offline?')) logOut();
  } else {
    ui.openAuth();
  }
}

async function onAuth(kind, creds) {
  ui.setAuthError('');
  try {
    if (kind === 'google') await signInGoogle();
    else if (kind === 'apple') await signInApple();
    else if (kind === 'signin') await signInEmail(creds.email, creds.pass);
    else if (kind === 'signup') await signUpEmail(creds.email, creds.pass);
  } catch (e) {
    console.error('auth error', e);
    ui.setAuthError(prettyAuthError(e));
  }
}
function prettyAuthError(e) {
  const c = (e && e.code) || '';
  if (c.includes('popup-closed')) return 'sign-in cancelled';
  if (c.includes('operation-not-allowed')) return 'that provider isn’t enabled yet';
  if (c.includes('invalid-credential') || c.includes('wrong-password')) return 'wrong email or password';
  if (c.includes('email-already-in-use')) return 'that email already has an account';
  if (c.includes('weak-password')) return 'password too short (min 6)';
  if (c.includes('invalid-email')) return 'that email looks invalid';
  return (e && e.message) || 'sign-in failed';
}

// keyboard shortcuts
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.target && /input|textarea/i.test(e.target.tagName)) return; // don't hijack the email box
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
