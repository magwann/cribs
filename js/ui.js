import { CATALOG, RECOLOR_SWATCHES } from './catalog.js';

// ---------------------------------------------------------------------------
// UI
// Thin DOM layer. Builds the catalog palette, wires buttons, and exposes small
// setters that main.js calls. Keeps all querySelector noise out of main.js.
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function createUI(handlers) {
  const $ = (id) => document.getElementById(id);

  const el = {
    title: $('title'),
    hud: $('hud'),
    modePill: $('mode-pill'),
    buildToggle: $('build-toggle'),
    builder: $('builder'),
    buildClose: $('build-close'),
    viewToggle: $('view-toggle'),
    catalog: $('catalog'),
    saveBtn: $('save-btn'),
    saveStatus: $('save-status'),
    objTools: $('obj-tools'),
    shareBtn: $('share-btn'),
    leaveBtn: $('leave-btn'),
    toast: $('toast'),
    accountBtn: $('account-btn'),
    authGoogle: $('auth-google'),
    authEmail: $('auth-email'),
    authPass: $('auth-pass'),
    authSignin: $('auth-signin'),
    authSignup: $('auth-signup'),
    authError: $('auth-error'),
    peopleBtn: $('people-btn'),
    leaveRoomBtn: $('leave-room'),
    people: $('people'),
    peopleClose: $('people-close'),
    friendSearch: $('friend-search'),
    friendGo: $('friend-go'),
    friendResults: $('friend-results'),
    knockList: $('knock-list'),
    roomRoster: $('room-roster'),
    friendsList: $('friends-list'),
    reqList: $('req-list'),
    colorSwatches: $('color-swatches'),
    chat: $('chat'),
    chatLog: $('chat-log'),
    chatInput: $('chat-input'),
    chatClear: $('chat-clear'),
    nameModal: $('name-modal'),
    nameInput: $('name-input'),
    nameSave: $('name-save'),
    nameError: $('name-error'),
    avatarColors: $('avatar-colors'),
    emoteBar: $('emote-bar'),
    floorSwatches: $('floor-swatches'),
    wallSwatches: $('wall-swatches'),
  };
  const creds = () => ({ email: el.authEmail.value.trim(), pass: el.authPass.value });
  let avatarColor = RECOLOR_SWATCHES[3]; // currently-selected avatar color
  let mobile = false;                    // mobile users can't build

  // --- build catalog palette ---
  for (const item of CATALOG) {
    const btn = document.createElement('button');
    btn.className = 'cat-item';
    btn.innerHTML = `<span class="swatch" style="background:${item.swatch}"></span>${item.label}`;
    btn.addEventListener('click', () => handlers.onPick(item.id));
    el.catalog.appendChild(btn);
  }

  // swatch-row builder used for recolor / avatar / floor / walls
  const buildSwatches = (container, onPick, big) => {
    for (const c of RECOLOR_SWATCHES) {
      const s = document.createElement('button');
      s.className = 'color-dot' + (big ? ' big' : '');
      s.style.background = c;
      s.addEventListener('click', () => onPick(c, s, container));
      container.appendChild(s);
    }
  };
  buildSwatches(el.colorSwatches, (c) => handlers.onRecolor(c));
  buildSwatches(el.floorSwatches, (c) => handlers.onFloorColor(c));
  buildSwatches(el.wallSwatches, (c) => handlers.onWallColor(c));
  buildSwatches(el.avatarColors, (c, s, container) => {
    avatarColor = c;
    container.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('sel'));
    s.classList.add('sel');
  }, true);

  // --- wire controls ---
  el.buildToggle.addEventListener('click', () => handlers.onToggleBuild());
  el.buildClose.addEventListener('click', () => handlers.onToggleBuild());
  el.viewToggle.addEventListener('click', () => handlers.onToggleView());
  el.saveBtn.addEventListener('click', () => handlers.onSave());
  el.shareBtn.addEventListener('click', () => handlers.onShare());
  el.leaveBtn.addEventListener('click', () => handlers.onLeave());

  // auth (now on the title screen)
  el.accountBtn.addEventListener('click', () => handlers.onAccount());
  el.authGoogle.addEventListener('click', () => handlers.onAuth('google'));
  el.authSignin.addEventListener('click', () => handlers.onAuth('signin', creds()));
  el.authSignup.addEventListener('click', () => handlers.onAuth('signup', creds()));
  el.authPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') handlers.onAuth('signin', creds()); });

  el.chatClear.addEventListener('click', () => handlers.onClearChat());

  // emotes
  el.emoteBar.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => handlers.onEmote(b.dataset.emote));
  });

  // people / rooms / chat
  el.peopleBtn.addEventListener('click', () => el.people.classList.toggle('hidden'));
  el.peopleClose.addEventListener('click', () => el.people.classList.add('hidden'));
  el.leaveRoomBtn.addEventListener('click', () => handlers.onLeaveRoom());
  const doSearch = () => handlers.onSearch(el.friendSearch.value);
  el.friendGo.addEventListener('click', doSearch);
  el.friendSearch.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  el.chatInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const t = el.chatInput.value; el.chatInput.value = '';
    if (t.trim()) handlers.onSendChat(t);
  });
  const claim = () => handlers.onClaimUsername(el.nameInput.value, avatarColor);
  el.nameSave.addEventListener('click', claim);
  el.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') claim(); });
  el.objTools.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => handlers.onObjAction(b.dataset.act));
  });

  return {
    setMode(building) {
      el.modePill.textContent = building ? 'BUILD' : 'EXPLORE';
      el.buildToggle.textContent = building ? 'DONE (B)' : 'BUILD (B)';
      el.builder.classList.toggle('hidden', !building);
      if (!building) el.objTools.classList.add('hidden');
    },
    setSelected(has, recolorable) {
      el.objTools.classList.toggle('hidden', !has);
      el.colorSwatches.classList.toggle('hidden', !(has && recolorable));
    },
    setView(topDown) {
      // label shows the view you'll switch TO
      el.viewToggle.textContent = topDown ? '⬔ 3D (V)' : '⬒ TOP (V)';
    },
    setVisiting(visiting, cribName) {
      // In someone else's crib you can walk around but not build (nor on mobile).
      el.buildToggle.classList.toggle('hidden', visiting || mobile);
      if (visiting) {
        el.modePill.textContent = cribName ? `VISITING · ${cribName}` : 'VISITING';
        el.builder.classList.add('hidden');
        el.objTools.classList.add('hidden');
      } else {
        el.modePill.textContent = 'EXPLORE';
      }
    },
    enterGame() {
      el.title.classList.add('hidden');
      el.nameModal.classList.add('hidden');
      el.hud.classList.remove('hidden');
      el.emoteBar.classList.remove('hidden');
    },
    showLogin() {
      el.title.classList.remove('hidden');
      el.hud.classList.add('hidden');
      el.emoteBar.classList.add('hidden');
      el.people.classList.add('hidden');
    },
    setMobile(on) {
      mobile = on; // mobile users can hang out but not build
      el.buildToggle.classList.toggle('hidden', on);
    },
    flashSave(text) {
      el.saveStatus.textContent = text;
      setTimeout(() => { el.saveStatus.textContent = ''; }, 2000);
    },
    toast(text) {
      el.toast.textContent = text;
      el.toast.classList.remove('hidden');
      clearTimeout(el.toast._t);
      el.toast._t = setTimeout(() => el.toast.classList.add('hidden'), 2600);
    },
    setAuthError(msg) { el.authError.textContent = msg || ''; },
    setOnline(user, handle) {
      // Always-online model: the chip just shows who you are.
      el.accountBtn.textContent = handle ? `● @${handle}` : '●';
      el.peopleBtn.classList.toggle('hidden', !user);
    },
    openUsername(prefill) {
      el.nameError.textContent = '';
      if (prefill) el.nameInput.value = prefill;
      el.nameModal.classList.remove('hidden');
      el.nameInput.focus();
    },
    closeUsername() { el.nameModal.classList.add('hidden'); },
    setUsernameError(msg) { el.nameError.textContent = msg || ''; },

    setSearchResults(list) {
      el.friendResults.innerHTML = '';
      if (!list || !list.length) { el.friendResults.innerHTML = '<div class="muted">no one found</div>'; return; }
      for (const r of list) {
        const row = document.createElement('div');
        row.className = 'person';
        row.innerHTML = `<span class="who"><span class="dot ${r.online ? 'on' : ''}"></span>@${escapeHtml(r.handle)}</span>`;
        if (r.self) {
          row.insertAdjacentHTML('beforeend', '<span class="muted">you</span>');
        } else {
          const knock = document.createElement('button');
          knock.textContent = 'Knock';
          knock.addEventListener('click', () => handlers.onKnock(r.uid, r.handle));
          const add = document.createElement('button');
          add.className = 'deny'; add.textContent = '+ Add';
          add.addEventListener('click', () => handlers.onAddFriend(r.uid, r.handle));
          const wrap = document.createElement('span');
          wrap.append(knock, document.createTextNode(' '), add);
          row.appendChild(wrap);
        }
        el.friendResults.appendChild(row);
      }
    },

    setFriends(list) {
      if (!list || !list.length) { el.friendsList.innerHTML = '<div class="muted">no friends yet</div>'; return; }
      el.friendsList.innerHTML = '';
      for (const f of list) {
        const row = document.createElement('div');
        row.className = 'person';
        row.innerHTML = `<span class="who"><span class="dot ${f.online ? 'on' : ''}"></span>@${escapeHtml(f.handle)}</span>`;
        const knock = document.createElement('button');
        knock.textContent = 'Knock';
        knock.addEventListener('click', () => handlers.onKnock(f.uid, f.handle));
        row.appendChild(knock);
        el.friendsList.appendChild(row);
      }
    },

    setFriendRequests(list) {
      if (!list || !list.length) { el.reqList.innerHTML = '<div class="muted">none</div>'; return; }
      el.reqList.innerHTML = '';
      for (const r of list) {
        const row = document.createElement('div');
        row.className = 'person';
        row.innerHTML = `<span class="who">@${escapeHtml(r.handle)}</span>`;
        const ok = document.createElement('button'); ok.textContent = 'Accept';
        ok.addEventListener('click', () => handlers.onAcceptFriend(r.uid, r.handle));
        const no = document.createElement('button'); no.className = 'deny'; no.textContent = 'Decline';
        no.addEventListener('click', () => handlers.onDeclineFriend(r.uid));
        const wrap = document.createElement('span'); wrap.append(ok, document.createTextNode(' '), no);
        row.appendChild(wrap);
        el.reqList.appendChild(row);
      }
    },

    setKnocks(list) {
      const pending = (list || []).filter((k) => k.status === 'pending');
      el.knockList.innerHTML = '';
      if (!pending.length) { el.knockList.innerHTML = '<div class="muted">none yet</div>'; return; }
      for (const k of pending) {
        const row = document.createElement('div');
        row.className = 'person';
        row.innerHTML = `<span class="who">@${k.handle}</span>
          <span><button data-ok="1">Let in</button> <button class="deny">Deny</button></span>`;
        const [ok, deny] = row.querySelectorAll('button');
        ok.addEventListener('click', () => handlers.onRespondKnock(k.visitorUid, true));
        deny.addEventListener('click', () => handlers.onRespondKnock(k.visitorUid, false));
        el.knockList.appendChild(row);
      }
    },

    setRoster(players, selfUid, isHost) {
      const entries = Object.entries(players || {});
      el.roomRoster.innerHTML = '';
      if (!entries.length) { el.roomRoster.innerHTML = '<div class="muted">just you</div>'; return; }
      for (const [uid, p] of entries) {
        const row = document.createElement('div');
        row.className = 'person';
        row.innerHTML = `<span class="who">${uid === selfUid ? 'you' : '@' + escapeHtml(p.handle || 'guest')}</span>`;
        if (isHost && uid !== selfUid) {
          const kick = document.createElement('button');
          kick.className = 'deny'; kick.textContent = 'Kick';
          kick.addEventListener('click', () => handlers.onKick(uid, p.handle || 'guest'));
          row.appendChild(kick);
        }
        el.roomRoster.appendChild(row);
      }
    },

    setRoomMode(inRoom, isVisiting) {
      el.chat.classList.toggle('hidden', !inRoom);
      el.leaveRoomBtn.classList.toggle('hidden', !inRoom);
      el.leaveRoomBtn.textContent = isVisiting ? '◄ LEAVE ROOM' : 'CLOSE CRIB';
      el.chatClear.classList.toggle('hidden', !(inRoom && !isVisiting)); // host only
    },

    setChat(msgs) {
      el.chatLog.innerHTML = (msgs || []).slice(-40)
        .map((m) => `<div class="msg"><b>@${escapeHtml(m.handle)}</b> ${escapeHtml(m.text)}</div>`).join('');
      el.chatLog.scrollTop = el.chatLog.scrollHeight;
    },
  };
}
