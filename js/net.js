import { app, db, getUid } from './firebase.js';
import {
  doc, getDoc, setDoc, deleteDoc, runTransaction, serverTimestamp,
  collection, onSnapshot,
} from 'firebase/firestore';
import {
  getDatabase, ref, set, update, remove, onValue, push, onDisconnect, get,
} from 'firebase/database';

// ---------------------------------------------------------------------------
// NET — the social + realtime layer.
//   Firestore : usernames/{handle} -> {uid}   (unique handle claim)
//               users/{uid}        -> {handle, cribName}
//   RealtimeDB: presence/{uid}                 who is online (auto-cleared)
//               knocks/{host}/{visitor}        request-to-enter a crib
//               rooms/{host}/players/{uid}      live avatar positions
//               rooms/{host}/chat/{pushId}      room chat
//
// getDatabase() is called lazily (not at import) so the app still boots when
// no Realtime Database URL is configured yet.
// ---------------------------------------------------------------------------

let _db = null;
function rtdb() {
  if (!_db) _db = getDatabase(app);
  return _db;
}

const HANDLE_RE = /^[a-z0-9_]{3,16}$/;
export function normalizeHandle(h) {
  return (h || '').trim().toLowerCase().replace(/^@/, '');
}

// ---------- usernames / profiles (Firestore) ----------

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// Claim a globally-unique @handle for the current user (transactional).
export async function claimUsername(rawHandle, cribName = 'my crib') {
  const uid = getUid();
  if (!uid) throw new Error('not online');
  const handle = normalizeHandle(rawHandle);
  if (!HANDLE_RE.test(handle)) throw new Error('handle must be 3–16 chars: a–z, 0–9, _');

  await runTransaction(db, async (tx) => {
    const uref = doc(db, 'usernames', handle);
    const existing = await tx.get(uref);
    if (existing.exists() && existing.data().uid !== uid) {
      throw new Error('that handle is taken');
    }
    tx.set(uref, { uid });
    tx.set(doc(db, 'users', uid), { handle, cribName, updatedAt: serverTimestamp() });
  });
  return handle;
}

// Find a user by @handle -> { uid, handle } or null.
export async function lookupHandle(rawHandle) {
  const handle = normalizeHandle(rawHandle);
  if (!HANDLE_RE.test(handle)) return null;
  const snap = await getDoc(doc(db, 'usernames', handle));
  if (!snap.exists()) return null;
  return { uid: snap.data().uid, handle };
}

// ---------- presence (RTDB) ----------

export function goOnlinePresence(handle) {
  const uid = getUid();
  if (!uid) return;
  const r = ref(rtdb(), `presence/${uid}`);
  set(r, { handle, ts: Date.now() });
  onDisconnect(r).remove();
}

export async function isOnline(uid) {
  const snap = await get(ref(rtdb(), `presence/${uid}`));
  return snap.exists();
}

// ---------- knocks (request to enter) ----------

// Visitor asks to enter host's crib.
export function knock(hostUid, handle) {
  const uid = getUid();
  return set(ref(rtdb(), `knocks/${hostUid}/${uid}`), {
    handle, status: 'pending', ts: Date.now(),
  });
}

// Host listens for incoming knocks. cb receives an array of {visitorUid, handle, status}.
export function listenIncomingKnocks(cb) {
  const uid = getUid();
  return onValue(ref(rtdb(), `knocks/${uid}`), (snap) => {
    const val = snap.val() || {};
    cb(Object.entries(val).map(([visitorUid, v]) => ({ visitorUid, ...v })));
  });
}

// Host approves/denies a specific visitor.
export function respondKnock(visitorUid, approve) {
  const uid = getUid();
  return update(ref(rtdb(), `knocks/${uid}/${visitorUid}`), {
    status: approve ? 'approved' : 'denied',
  });
}

// Visitor listens for the host's decision on their own knock.
export function listenMyKnock(hostUid, cb) {
  const uid = getUid();
  return onValue(ref(rtdb(), `knocks/${hostUid}/${uid}`), (snap) => {
    cb(snap.val()); // {status,...} or null
  });
}

export function clearMyKnock(hostUid) {
  const uid = getUid();
  return remove(ref(rtdb(), `knocks/${hostUid}/${uid}`));
}

// ---------- rooms: live positions + chat (RTDB) ----------

// Join a room (host's crib). Returns { update(state), leave() }.
export function joinRoom(hostUid, handle) {
  const uid = getUid();
  const meRef = ref(rtdb(), `rooms/${hostUid}/players/${uid}`);
  set(meRef, { handle, x: 0, z: 3, ry: 0, sitting: false, ts: Date.now() });
  onDisconnect(meRef).remove();
  return {
    update(state) { update(meRef, { ...state, ts: Date.now() }); },
    leave() { remove(meRef); },
  };
}

// Subscribe to everyone in a room. cb gets a map { uid: {handle,x,z,ry,sitting} }.
export function listenRoomPlayers(hostUid, cb) {
  return onValue(ref(rtdb(), `rooms/${hostUid}/players`), (snap) => {
    cb(snap.val() || {});
  });
}

export function sendChat(hostUid, handle, text) {
  const t = (text || '').slice(0, 240);
  if (!t.trim()) return;
  return push(ref(rtdb(), `rooms/${hostUid}/chat`), { uid: getUid(), handle, text: t, ts: Date.now() });
}

// cb gets an array of {uid,handle,text,ts} in chronological order.
export function listenChat(hostUid, cb) {
  return onValue(ref(rtdb(), `rooms/${hostUid}/chat`), (snap) => {
    const val = snap.val() || {};
    cb(Object.values(val).sort((a, b) => a.ts - b.ts));
  });
}

// ---------- friends (Firestore) ----------
// users/{uid}/friends/{fid}   -> mutual friends
// users/{uid}/requests/{from} -> incoming friend requests

export function sendFriendRequest(toUid, myHandle) {
  const uid = getUid();
  if (!uid) throw new Error('not online');
  return setDoc(doc(db, 'users', toUid, 'requests', uid), { handle: myHandle, ts: Date.now() });
}

export function listenFriendRequests(cb) {
  const uid = getUid();
  return onSnapshot(collection(db, 'users', uid, 'requests'), (snap) => {
    cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
  });
}

export async function acceptFriend(fromUid, fromHandle, myHandle) {
  const uid = getUid();
  await setDoc(doc(db, 'users', uid, 'friends', fromUid), { handle: fromHandle, ts: Date.now() });
  await setDoc(doc(db, 'users', fromUid, 'friends', uid), { handle: myHandle, ts: Date.now() });
  await deleteDoc(doc(db, 'users', uid, 'requests', fromUid));
}

export function declineFriend(fromUid) {
  const uid = getUid();
  return deleteDoc(doc(db, 'users', uid, 'requests', fromUid));
}

export function listenFriends(cb) {
  const uid = getUid();
  return onSnapshot(collection(db, 'users', uid, 'friends'), (snap) => {
    cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
  });
}
