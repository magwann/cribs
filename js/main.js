import * as THREE from 'three';
import { createWorld, ROOM_DEFAULTS } from './world.js';
import { createPlayer } from './player.js';
import { createBuilder } from './builder.js';
import { createUI } from './ui.js';
import { createRemotes } from './remotes.js';
import { createJoystick } from './joystick.js';
import { CATALOG_BY_ID } from './catalog.js';
import { saveCrib as saveLocal, loadCrib as loadLocal } from './storage.js';
import {
  onUser, getUser, getUid, saveMyCrib, loadCribById,
  signInGoogle, signInEmail, signUpEmail, logOut,
} from './firebase.js';
import * as net from './net.js';

// ---------------------------------------------------------------------------
// MAIN — login-first and always online. You sign in on the title screen, claim
// a @handle + avatar color, then you're in your crib and visible to friends.
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const { renderer, scene, camera, setFloorColor, setWallColor } = createWorld(canvas);
const player = createPlayer(scene, camera, canvas);
const remotes = createRemotes(scene);

// ---- mobile detection ----
// Robust across iOS "Request Desktop Website" (UA hides iPhone) and iPadOS
// (reports as Mac): fall back to touch + no-hover, which is true on phones.
const uaMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
const iPadOS = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
const touchPhone = navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches;
const isMobile = uaMobile || iPadOS || touchPhone;
const standalone = matchMedia('(display-mode: standalone)').matches ||
  matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
const mobileMode = isMobile && standalone; // installed to home screen → play
const $ = (id) => document.getElementById(id);

if (isMobile && !standalone) {
  // In a mobile browser: require install-to-home-screen first.
  $('a2hs').classList.remove('hidden');
}

let building = false;
let visiting = false;
let myHandle = null;
let myColor = '#7cf0c8';
let roomHost = null;
let roomConn = null;
const unsub = { players: null, chat: null, kicks: null, knocks: null, myKnock: null, friends: null, freq: null };
let posAcc = 0, lastChatTs = 0, friendsCache = [], currentRoster = [];
let roomFloor = ROOM_DEFAULTS.floor, roomWall = ROOM_DEFAULTS.wall;
let currentEmote = null, emoteTs = 0;
const activeTVs = new Set();
let animatedNodes = [];

// ---- top-down build view ----
let topDown = false, tdHeight = 15;
function applyTopDown() { camera.up.set(0, 0, -1); camera.position.set(0, tdHeight, 0); camera.lookAt(0, 0, 0); }
function setView(td) { topDown = td; player.setCameraControl(!td); if (td) applyTopDown(); else camera.up.set(0, 1, 0); ui.setView(td); }
canvas.addEventListener('wheel', (e) => { if (!topDown) return; e.preventDefault(); tdHeight = Math.max(8, Math.min(22, tdHeight + e.deltaY * 0.01)); }, { passive: false });

const ui = createUI({
  onToggleBuild: toggleBuild, onToggleView: toggleView,
  onPick: (id) => builder.arm(id),
  onSave, onShare, onLeave, onAccount, onAuth, onClaimUsername,
  onSearch, onKnock, onRespondKnock, onLeaveRoom, onSendChat, onKick, onClearChat,
  onRecolor: (c) => builder.setSelectedColor(c),
  onFloorColor: (c) => { roomFloor = c; setFloorColor(c); },
  onWallColor: (c) => { roomWall = c; setWallColor(c); },
  onEmote: doEmote,
  onAddFriend, onAcceptFriend, onDeclineFriend,
  onObjAction: (act) => { if (act === 'rotate') builder.rotateSelected(); if (act === 'delete') builder.deleteSelected(); },
});

const builder = createBuilder(scene, camera, canvas, {
  onSelect: (item) => ui.setSelected(!!item, !!(item && CATALOG_BY_ID[item.id] && CATALOG_BY_ID[item.id].recolor)),
  onChange: refreshAnimated,
});

// ---- mobile mode: joystick, no building, landscape prompt ----
if (mobileMode) {
  document.body.classList.add('mobile');
  ui.setMobile(true); // hides the Build button; mobile users only hang out
  $('joystick').classList.remove('hidden');
  createJoystick($('joy-base'), $('joy-knob'), (x, y) => player.setMoveAxis(x, y));
  const checkOrient = () => $('rotate').classList.toggle('hidden', !matchMedia('(orientation: portrait)').matches);
  window.addEventListener('resize', checkOrient);
  matchMedia('(orientation: portrait)').addEventListener('change', checkOrient);
  checkOrient();
  try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch {}
}

// ---- explore-mode click: sit / toggle TV ----
let downX = 0, downY = 0;
canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
canvas.addEventListener('pointerup', (e) => {
  if (building) return;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
  const item = builder.pickItemAt(e.clientX, e.clientY);
  if (!item) return;
  const cat = CATALOG_BY_ID[item.id];
  if (cat && cat.tv) toggleTV(item);
  else if (cat && cat.sit) sitOn(item, cat);
});
let tvOffset = 0;
function toggleTV(item) {
  const screen = item.group.getObjectByName('tv-screen');
  if (!screen) return;
  if (!screen.userData._base) screen.userData._base = { color: screen.material.color.clone(), emissive: screen.material.emissive.clone() };
  screen.userData.on = !screen.userData.on;
  if (screen.userData.on) { screen.userData.offset = (tvOffset += 0.17); activeTVs.add(screen); ui.toast('TV on'); }
  else { activeTVs.delete(screen); screen.material.color.copy(screen.userData._base.color); screen.material.emissive.copy(screen.userData._base.emissive); }
}
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

// collect disco/lava nodes to animate each frame
function refreshAnimated() {
  animatedNodes = [];
  for (const { group } of builder.getGroups())
    group.traverse((o) => { if (o.userData && o.userData.anim) animatedNodes.push({ node: o, type: o.userData.anim, base: o.position.y }); });
}
function animate(elapsed) {
  for (const s of activeTVs) s.material.emissive.setHSL((elapsed * 0.12 + (s.userData.offset || 0)) % 1, 0.85, 0.42 + 0.08 * Math.sin(elapsed * 22));
  for (const a of animatedNodes) {
    if (a.type === 'discoBall') a.node.rotation.y = elapsed * 1.6;
    else if (a.type === 'discoLight') a.node.color.setHSL((elapsed * 0.35) % 1, 1, 0.6);
    else if (a.type === 'lava') { a.node.position.y = a.base + Math.sin(elapsed * 1.5) * 0.12; a.node.material.emissive.setHSL((elapsed * 0.1) % 1, 0.8, 0.5); }
  }
}

// ---- auth / session lifecycle ----
onUser(async (user) => {
  ui.setOnline(user, myHandle);
  if (!user) { teardownOnline(); ui.showLogin(); return; }
  try {
    const prof = await net.getProfile(user.uid);
    if (prof && prof.handle) { myHandle = prof.handle; myColor = prof.avatarColor || myColor; beginSession(); }
    else { ui.openUsername(suggestHandle(user)); }
  } catch (e) { console.error('profile load failed', e); ui.setAuthError('could not load your profile'); }
});

async function onAuth(kind, creds) {
  ui.setAuthError('');
  try {
    if (kind === 'google') await signInGoogle();
    else if (kind === 'signin') await signInEmail(creds.email, creds.pass);
    else if (kind === 'signup') await signUpEmail(creds.email, creds.pass);
  } catch (e) { console.error('auth error', e); ui.setAuthError(prettyAuthError(e)); }
}

async function onClaimUsername(value, color) {
  ui.setUsernameError('');
  try { myHandle = await net.claimUsername(value, color); myColor = color || myColor; beginSession(); }
  catch (e) { ui.setUsernameError(e.message || 'could not claim that handle'); }
}

async function beginSession() {
  ui.enterGame();
  ui.setOnline(getUser(), myHandle);
  player.setColor(myColor);
  net.goOnlinePresence(myHandle);

  if (unsub.knocks) unsub.knocks();
  let known = 0;
  unsub.knocks = net.listenIncomingKnocks((list) => {
    ui.setKnocks(list);
    const pending = list.filter((k) => k.status === 'pending');
    if (pending.length > known) ui.toast(`@${pending[pending.length - 1].handle} wants in — see PEOPLE`);
    known = pending.length;
  });
  if (unsub.friends) unsub.friends();
  unsub.friends = net.listenFriends((list) => { friendsCache = list; renderFriends(); });
  if (unsub.freq) unsub.freq();
  unsub.freq = net.listenFriendRequests((list) => ui.setFriendRequests(list));

  const target = new URLSearchParams(location.search).get('crib');
  enterRoom(target && target !== getUid() ? target : getUid());
}

function teardownOnline() {
  myHandle = null;
  teardownRoom();
  for (const k of ['knocks', 'myKnock', 'friends', 'freq']) if (unsub[k]) { unsub[k](); unsub[k] = null; }
  friendsCache = []; roomHost = null;
}

async function renderFriends() {
  const withOnline = await Promise.all((friendsCache || []).map(async (f) => ({ ...f, online: await net.isOnline(f.uid).catch(() => false) })));
  ui.setFriends(withOnline);
}
function onAddFriend(uid, handle) { net.sendFriendRequest(uid, myHandle).then(() => ui.toast(`friend request sent to @${handle}`)).catch((e) => { console.error(e); ui.toast('could not send request'); }); }
function onAcceptFriend(uid, handle) { net.acceptFriend(uid, handle, myHandle).then(() => ui.toast(`you and @${handle} are friends`)).catch((e) => { console.error(e); ui.toast('could not accept'); }); }
function onDeclineFriend(uid) { net.declineFriend(uid).catch((e) => console.error(e)); }

// ---- rooms ----
async function enterRoom(hostUid) {
  teardownRoom();
  roomHost = hostUid;
  const isVisiting = hostUid !== getUid();
  let data = null;
  try { data = await loadCribById(hostUid); } catch (e) { console.error(e); }
  if (!data && !isVisiting) data = loadLocal();
  builder.loadItems(data && data.items ? data.items : []);
  const room = (data && data.room) || {};
  setFloorColor(room.floor || ROOM_DEFAULTS.floor);
  setWallColor(room.wall || ROOM_DEFAULTS.wall);
  if (!isVisiting) { roomFloor = room.floor || ROOM_DEFAULTS.floor; roomWall = room.wall || ROOM_DEFAULTS.wall; }
  visiting = isVisiting;
  ui.setVisiting(isVisiting, data && data.name);
  if (isVisiting) player.stand();

  lastChatTs = Date.now();
  roomConn = net.joinRoom(hostUid, myHandle);
  net.setPresenceRoom(hostUid); // so the admin dashboard can group people by room
  unsub.players = net.listenRoomPlayers(hostUid, (players) => {
    currentRoster = Object.keys(players || {});
    remotes.sync(players, getUid());
    ui.setRoster(players, getUid(), !isVisiting); // host sees Kick buttons
  });
  // if visiting, watch for being kicked by the host
  if (isVisiting) {
    let firstKick = true;
    unsub.kicks = net.listenKicks(hostUid, (kicks) => {
      if (firstKick) { firstKick = false; return; }
      if (kicks && kicks[getUid()]) { ui.toast('you were kicked from this crib'); enterRoom(getUid()); }
    });
  }
  unsub.chat = net.listenChat(hostUid, (msgs) => {
    ui.setChat(msgs);
    for (const m of msgs) {
      if (m.ts <= lastChatTs || !m.uid) continue;
      if (m.uid === getUid()) player.showBubble(m.text); else remotes.showBubble(m.uid, m.text);
    }
    if (msgs.length) lastChatTs = Math.max(lastChatTs, msgs[msgs.length - 1].ts);
  });
  ui.setRoomMode(true, isVisiting);
}
function teardownRoom() {
  if (roomConn) { roomConn.leave(); roomConn = null; }
  if (unsub.players) { unsub.players(); unsub.players = null; }
  if (unsub.chat) { unsub.chat(); unsub.chat = null; }
  if (unsub.kicks) { unsub.kicks(); unsub.kicks = null; }
  remotes.clear();
  currentRoster = [];
}
function onLeaveRoom() {
  if (roomHost !== getUid()) { enterRoom(getUid()); return; } // visitor → go home
  // host → close the crib: send every guest home
  const guests = currentRoster.filter((u) => u !== getUid());
  guests.forEach((u) => net.kickPlayer(getUid(), u));
  ui.toast(guests.length ? 'sent everyone home' : 'nobody else here');
}
function onKick(uid, handle) {
  net.kickPlayer(getUid(), uid);
  ui.toast(`kicked @${handle}`);
}

async function onSearch(value) {
  const res = await net.lookupHandle(value);
  if (!res) { ui.setSearchResults([]); return; }
  let online = false; try { online = await net.isOnline(res.uid); } catch {}
  ui.setSearchResults([{ handle: res.handle, uid: res.uid, online, self: res.uid === getUid() }]);
}
async function onKnock(hostUid, handle) {
  try { await net.knock(hostUid, myHandle); } catch (e) { console.error(e); ui.toast('knock failed'); return; }
  ui.toast(`knock sent to @${handle}…`);
  if (unsub.myKnock) unsub.myKnock();
  unsub.myKnock = net.listenMyKnock(hostUid, (k) => {
    if (!k) return;
    if (k.status === 'approved') { unsub.myKnock(); unsub.myKnock = null; net.clearMyKnock(hostUid); ui.toast(`@${handle} let you in!`); enterRoom(hostUid); }
    else if (k.status === 'denied') { unsub.myKnock(); unsub.myKnock = null; net.clearMyKnock(hostUid); ui.toast(`@${handle} said not right now`); }
  });
}
function onRespondKnock(visitorUid, approve) { net.respondKnock(visitorUid, approve).catch((e) => console.error(e)); }
function onSendChat(text) { if (roomHost && myHandle) net.sendChat(roomHost, myHandle, text); }
function onClearChat() {
  if (roomHost !== getUid()) return; // host only
  net.clearChat(getUid()).then(() => ui.toast('chat cleared')).catch((e) => console.error(e));
}

function doEmote(name) { player.emote(name); currentEmote = name; emoteTs = Date.now(); }

function suggestHandle(u) {
  const base = (u.displayName || u.email || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16);
  return base.length >= 3 ? base : '';
}

// ---- build / crib ----
function toggleBuild() {
  if (mobileMode) { ui.toast('building is on desktop only — hang out & visit on mobile'); return; }
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
  try { await saveMyCrib(items, 'my crib', { floor: roomFloor, wall: roomWall }); ui.flashSave('saved ✓'); }
  catch (e) { console.error(e); ui.flashSave('save error'); }
}

function onShare() {
  const id = visiting ? roomHost : getUid();
  if (!id) return;
  const url = `${location.origin}${location.pathname}?crib=${id}`;
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => ui.toast('crib link copied ✓'), () => ui.toast(url));
  else ui.toast(url);
}
function onLeave() { location.href = `${location.origin}${location.pathname}`; }
function onAccount() { if (confirm('Sign out?')) logOut(); }

function prettyAuthError(e) {
  const c = (e && e.code) || '';
  if (c.includes('popup-closed')) return 'sign-in cancelled';
  if (c.includes('operation-not-allowed')) return 'that provider isn’t enabled yet';
  if (c.includes('invalid-credential') || c.includes('wrong-password')) return 'wrong email or password';
  if (c.includes('email-already-in-use')) return 'that email already has an account — log in instead';
  if (c.includes('weak-password')) return 'password too short (min 6)';
  if (c.includes('invalid-email')) return 'that email looks invalid';
  return (e && e.message) || 'sign-in failed';
}

// keyboard
window.addEventListener('keydown', (e) => {
  if (e.target && /input|textarea/i.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'b') return toggleBuild();
  if (building) {
    if (k === 'v') toggleView();
    if (k === 'r') builder.rotateSelected();
    if (k === 'delete' || k === 'backspace') builder.deleteSelected();
    return;
  }
  if (k === 'z') doEmote('wave');
  if (k === 'x') doEmote('dance');
});

// ---- render loop ----
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  player.update(dt);
  remotes.update(dt);
  animate(clock.getElapsedTime());
  if (topDown) applyTopDown();
  if (roomConn) {
    posAcc += dt;
    if (posAcc >= 0.12) {
      posAcc = 0;
      roomConn.update({ x: player.avatar.position.x, z: player.avatar.position.z, ry: player.avatar.rotation.y, sitting: player.isSitting(), color: myColor, emote: currentEmote, emoteTs });
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
