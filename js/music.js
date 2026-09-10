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
  let pos = 0, mode = 'bg', enabled = true, boomUrl = null;

  const revokeBoom = () => { if (boomUrl) { URL.revokeObjectURL(boomUrl); boomUrl = null; } };
  function playBg() {
    mode = 'bg';
    audio.src = 'music/' + encodeURIComponent(PLAYLIST[order[pos]]);
    onTrack && onTrack('♪ ' + title(PLAYLIST[order[pos]]));
    if (enabled) audio.play().catch(() => {});
  }
  audio.addEventListener('ended', () => {
    if (mode === 'boom') revokeBoom();
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
    // play a user-picked MP3 through the boombox
    playFile(file) {
      revokeBoom();
      mode = 'boom';
      boomUrl = URL.createObjectURL(file);
      audio.src = boomUrl;
      enabled = true;
      onTrack && onTrack('▶ ' + title(file.name));
      audio.play().catch(() => {});
    },
  };
}
