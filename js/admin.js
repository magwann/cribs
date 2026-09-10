import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, getCountFromServer } from 'firebase/firestore';
import { getDatabase, ref, onValue } from 'firebase/database';
import { firebaseConfig } from './firebase-config.js';

// ---------------------------------------------------------------------------
// CRIBS ADMIN — a separate live-ops dashboard (admin.html). Shares the Cribs
// Firebase project, so presence/rooms stream in live. Gated by an email
// allowlist; the underlying data is already public-read, so this gate is for
// convenience, not a hard security boundary.
// ---------------------------------------------------------------------------

const ADMINS = [
  'youngmasterphelps@icloud.com',
  'youngmasterphelps@gmail.com',
  'masterphelps@gmail.com',
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app), db = getFirestore(app), rdb = getDatabase(app);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = (which) => ['login', 'denied', 'dash'].forEach((s) => $(s).classList.toggle('hidden', s !== which));

$('g').onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => { $('login-err').textContent = e.message; });
$('si').onclick = () => signInWithEmailAndPassword(auth, $('em').value.trim(), $('pw').value).catch((e) => { $('login-err').textContent = e.message; });
$('out').onclick = () => signOut(auth);
$('out2').onclick = () => signOut(auth);
$('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('si').click(); });

let unsubP = null, countTimer = null;

onAuthStateChanged(auth, (u) => {
  teardown();
  if (!u) { show('login'); return; }
  if (!ADMINS.includes((u.email || '').toLowerCase())) {
    $('who').textContent = `${u.email || '(no email)'} · ${u.uid}`;
    show('denied');
    return;
  }
  show('dash');
  // Everything is derived from the public presence tree (readable by admins),
  // where each online person carries the room (host uid) they're in.
  unsubP = onValue(ref(rdb, 'presence'), (s) => render(s.val() || {}));
  refreshCounts();
  countTimer = setInterval(refreshCounts, 30000);
});

function teardown() {
  if (unsubP) { unsubP(); unsubP = null; }
  if (countTimer) { clearInterval(countTimer); countTimer = null; }
}

function render(p) {
  const entries = Object.entries(p);
  $('stat-online').textContent = entries.length;
  $('online-list').innerHTML = entries.length
    ? entries.map(([, v]) => `<div class="row"><span class="dot on"></span>@${esc(v.handle || '?')}</div>`).join('')
    : '<div class="muted">nobody online</div>';

  // group people by the room (host uid) they're in
  const rooms = {};
  for (const [uid, v] of entries) {
    const host = v.room || uid; // fallback: treat as their own room
    (rooms[host] ||= []).push({ uid, handle: v.handle });
  }
  const groups = Object.entries(rooms).map(([host, ppl]) => ({
    host,
    hostHandle: (p[host] && p[host].handle) || (ppl.find((x) => x.uid === host)?.handle) || host.slice(0, 6),
    count: ppl.length,
    who: ppl.map((x) => x.uid === host ? `@${esc(x.handle || '?')} (host)` : `@${esc(x.handle || 'guest')}`),
  })).sort((a, b) => b.count - a.count);

  $('stat-inrooms').textContent = entries.length;
  $('stat-rooms').textContent = groups.filter((g) => g.count >= 2).length;
  $('rooms-list').innerHTML = groups.length
    ? groups.map((g) => `<div class="room"><div class="room-h">@${esc(g.hostHandle)}'s crib · ${g.count}</div><div class="room-w">${g.who.join(', ')}</div></div>`).join('')
    : '<div class="muted">no active rooms</div>';
}

async function refreshCounts() {
  try { $('stat-users').textContent = (await getCountFromServer(collection(db, 'users'))).data().count; } catch {}
  try { $('stat-cribs').textContent = (await getCountFromServer(collection(db, 'cribs'))).data().count; } catch {}
}
