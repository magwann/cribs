import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createBuilder } from './builder.js';
import { createUI } from './ui.js';
import { createRemotes } from './remotes.js';
import { CATALOG_BY_ID } from './catalog.js';
import { saveCrib as saveLocal, loadCrib as loadLocal } from './storage.js';
import {
  onUser, getUser, getUid, saveMyCrib, loadCribById,
  signInGoogle, signInApple, signInEmail, signUpEmail, logOut,
} from './firebase.js';
import * as net from './net.js';

// ---------------------------------------------------------------------------
// MAIN — modules, mode state, render loop, and the online/room system.
// Local-first: building/exploring/visiting need no account. Going online adds
// presence, friend search, knock-to-enter live rooms, and chat.
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const { renderer, scene, camera } = createWorld(canvas);
const player = createPlayer(scene, camera, canvas);
const remotes = createRemotes(scene);

let building = false;
let visiting = false;   // in someone else's crib (read-only)
let cribId = null;      // ?crib target for static visits
let myHandle = null;
let roomHost = null;    // uid of the live room we're in (null when offline)
let roomConn = null;    // { update, leave }
const unsub = { players: null, chat: null, knocks: null, myKnock: null };
let posAcc = 0;

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
  onStart, onToggleBuild: toggleBuild, onToggleView: toggleView,
  onPick: (id) => builder.arm(id),
  onSave, onShare, onLeave, onAccount, onAuth,
  onClaimUsername, onSearch, onKnock, onRespondKnock, onLeaveRoom, onSendChat,
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
  if (building) return;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
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
    try { data = await loadCribById(cribId); } catch (e) { console.error(e); }
    if (!data) ui.toast('that crib could not be found');
  } else {
    data = loadLocal();
  }
  if (data && data.items) builder.loadItems(data.items);
  ui.setVisiting(visiting, data && data.name);
}

// ---- auth / online lifecycle ----
onUser(async (user) => {
  ui.setOnline(user, myHandle);
  if (!user) { teardownOnline(); return; }
  try {
    const prof = await net.getProfile(user.uid);
    if (prof && prof.handle) { myHandle = prof.handle; goOnline(); }
    else { ui.openUsername(suggestHandle(user)); }
  } catch (e) { console.error('profile load failed', e); ui.toast('could not load your profile'); }
});

async function onClaimUsername(value) {
  ui.setUsernameError('');
  try {
    myHandle = await net.claimUsername(value);
    ui.closeUsername();
    goOnline();
  } catch (e) { ui.setUsernameError(e.message || 'could not claim that handle'); }
}

async function goOnline() {
  ui.setOnline(getUser(), myHandle);
  net.goOnlinePresence(myHandle);
  try { await saveMyCrib(builder.getItemsData()); ui.toast('you’re online — crib published ✓'); }
  catch (e) { console.error('publish failed', e); }

  if (unsub.knocks) unsub.knocks();
  let known = 0;
  unsub.knocks = net.listenIncomingKnocks((list) => {
    ui.setKnocks(list);
    const pending = list.filter((k) => k.status === 'pending');
    if (pending.length > known) ui.toast(`@${pending[pending.length - 1].handle} wants to enter — see PEOPLE`);
    known = pending.length;
  });

  if (!visiting) enterRoom(getUid()); // host your own room
}

function teardownOnline() {
  myHandle = null;
  teardownRoom();
  if (unsub.knocks) { unsub.knocks(); unsub.knocks = null; }
  if (unsub.myKnock) { unsub.myKnock(); unsub.myKnock = null; }
  roomHost = null;
  ui.setRoomMode(false, false);
}

// ---- rooms ----
async function enterRoom(hostUid) {
  teardownRoom();
  roomHost = hostUid;
  const isVisiting = hostUid !== getUid();
  if (isVisiting) {
    let data = null;
    try { data = await loadCribById(hostUid); } catch (e) { console.error(e); }
    if (data && data.items) builder.loadItems(data.items); else ui.toast('their crib is empty');
    visiting = true;
    ui.setVisiting(true, data && data.name);
    player.stand();
  } else {
    visiting = false;
    ui.setVisiting(false, null);
  }
  roomConn = net.joinRoom(hostUid, myHandle);
  unsub.players = net.listenRoomPlayers(hostUid, (players) => {
    remotes.sync(players, getUid());
    ui.setRoster(players, getUid());
  });
  unsub.chat = net.listenChat(hostUid, (msgs) => ui.setChat(msgs));
  ui.setRoomMode(true, isVisiting);
}

function teardownRoom() {
  if (roomConn) { roomConn.leave(); roomConn = null; }
  if (unsub.players) { unsub.players(); unsub.players = null; }
  if (unsub.chat) { unsub.chat(); unsub.chat = null; }
  remotes.clear();
}

function onLeaveRoom() {
  const local = loadLocal();
  builder.loadItems(local && local.items ? local.items : []);
  enterRoom(getUid());
}

async function onSearch(value) {
  const res = await net.lookupHandle(value);
  if (!res) { ui.setSearchResults([]); return; }
  let online = false;
  try { online = await net.isOnline(res.uid); } catch {}
  ui.setSearchResults([{ handle: res.handle, uid: res.uid, online, self: res.uid === getUid() }]);
}

async function onKnock(hostUid, handle) {
  if (!getUid()) { ui.toast('go online first'); ui.openAuth(); return; }
  try { await net.knock(hostUid, myHandle); } catch (e) { console.error(e); ui.toast('knock failed'); return; }
  ui.toast(`knock sent to @${handle}…`);
  if (unsub.myKnock) unsub.myKnock();
  unsub.myKnock = net.listenMyKnock(hostUid, (k) => {
    if (!k) return;
    if (k.status === 'approved') {
      unsub.myKnock(); unsub.myKnock = null; net.clearMyKnock(hostUid);
      ui.toast(`@${handle} let you in!`);
      enterRoom(hostUid);
    } else if (k.status === 'denied') {
      unsub.myKnock(); unsub.myKnock = null; net.clearMyKnock(hostUid);
      ui.toast(`@${handle} said not right now`);
    }
  });
}

function onRespondKnock(visitorUid, approve) {
  net.respondKnock(visitorUid, approve).catch((e) => console.error(e));
}

function onSendChat(text) {
  if (roomHost && myHandle) net.sendChat(roomHost, myHandle, text);
}

function suggestHandle(u) {
  const base = (u.displayName || u.email || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16);
  return base.length >= 3 ? base : '';
}

// ---- local modes ----
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
function toggleView() { if (building) setView(!topDown); }

async function onSave() {
  const items = builder.getItemsData();
  saveLocal(items);
  if (getUid()) {
    try { await saveMyCrib(items); ui.flashSave('saved to cloud ✓'); }
    catch (e) { console.error(e); ui.flashSave('saved locally (cloud error)'); }
  } else ui.flashSave('saved locally');
}

function onShare() {
  if (visiting && cribId) return share(cribId);
  const uid = getUid();
  if (!uid) { ui.toast('go online to share your crib'); ui.openAuth(); return; }
  share(uid);
}
function share(id) {
  const url = `${location.origin}${location.pathname}?crib=${id}`;
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => ui.toast('crib link copied ✓'), () => ui.toast(url));
  else ui.toast(url);
}
function onLeave() { location.href = `${location.origin}${location.pathname}`; }

function onAccount() {
  if (getUid()) { if (confirm('Sign out and go offline?')) logOut(); }
  else ui.openAuth();
}
async function onAuth(kind, creds) {
  ui.setAuthError('');
  try {
    if (kind === 'google') await signInGoogle();
    else if (kind === 'apple') await signInApple();
    else if (kind === 'signin') await signInEmail(creds.email, creds.pass);
    else if (kind === 'signup') await signUpEmail(creds.email, creds.pass);
  } catch (e) { console.error('auth error', e); ui.setAuthError(prettyAuthError(e)); }
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
  if (e.target && /input|textarea/i.test(e.target.tagName)) return;
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
  remotes.update(dt);
  if (topDown) applyTopDown();

  // stream my position to the room a few times a second
  if (roomConn) {
    posAcc += dt;
    if (posAcc >= 0.12) {
      posAcc = 0;
      roomConn.update({
        x: player.avatar.position.x,
        z: player.avatar.position.z,
        ry: player.avatar.rotation.y,
        sitting: player.isSitting(),
      });
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
