// ---------------------------------------------------------------------------
// MUSIC — ambient background playlist + boombox playback of a user's own MP3.
// One <audio> channel: normally shuffles the background tracks; when someone
// loads a file through a boombox it plays that instead, then resumes the
// playlist. onTrack(title) lets the UI show what's playing.
// ---------------------------------------------------------------------------

const PLAYLIST = [
  'my thoughts are stored on a USB drive.mp3',
  'Ozowa.mp3',
  'Lotus Waters.mp3',
  'anchor store.mp3',
  'Logging In.mp3',
  'nostalgic breakdown.mp3',
];

export function createMusic(onTrack) {
  const audio = new Audio();
  audio.volume = 0.45;
  const title = (f) => f.replace(/\.[^.]+$/, '');

  // shuffled play order
  const order = PLAYLIST.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let pos = 0, mode = 'bg', enabled = true, pendingSeek = 0, roomKey = null;

  function playBg() {
    mode = 'bg';
    audio.src = 'music/' + encodeURIComponent(PLAYLIST[order[pos]]);
    onTrack && onTrack('♪ ' + title(PLAYLIST[order[pos]]));
    if (enabled) audio.play().catch(() => {});
  }
  audio.addEventListener('loadedmetadata', () => {
    if (mode === 'room' && pendingSeek > 0 && pendingSeek < (audio.duration || 1e9)) {
      try { audio.currentTime = pendingSeek; } catch {}
    }
    pendingSeek = 0;
  });
  audio.addEventListener('ended', () => {
    if (mode === 'room') { mode = 'bg'; } // a shared track finished → back to ambient
    pos = (pos + 1) % order.length;
    playBg();
  });

  return {
    start() { if (!audio.src) playBg(); else if (enabled) audio.play().catch(() => {}); },
    toggle() {
      enabled = !enabled;
      if (enabled) audio.play().catch(() => {}); else audio.pause();
      return enabled;
    },
    isOn() { return enabled; },
    // Play a shared room track from a URL, seeking to `at` seconds (late-join sync).
    // `key` dedupes repeat snapshots so we don't restart the same track.
    playRoom(url, name, at = 0, key = url) {
      if (key === roomKey && mode === 'room') return;
      roomKey = key;
      mode = 'room';
      pendingSeek = at;
      audio.src = url;
      enabled = true;
      onTrack && onTrack('▶ ' + title(name || 'track'));
      audio.play().catch(() => {});
    },
    resumeBg() { if (mode === 'room') { roomKey = null; playBg(); } },
  };
}
