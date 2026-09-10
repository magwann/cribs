// ---------------------------------------------------------------------------
// JOYSTICK — a touch thumbstick for mobile movement. Reports a normalized
// vector (x: strafe, y: forward-up) in [-1, 1] via onMove; snaps back to 0 on
// release. The base recenters under the first touch inside its zone so it
// works wherever the thumb lands.
// ---------------------------------------------------------------------------

export function createJoystick(baseEl, knobEl, onMove) {
  const R = 46; // max knob travel (px)
  let active = false, id = null, cx = 0, cy = 0;

  function setKnob(dx, dy) {
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  baseEl.addEventListener('pointerdown', (e) => {
    active = true; id = e.pointerId;
    const r = baseEl.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    baseEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  baseEl.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== id) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
    setKnob(dx, dy);
    onMove(dx / R, -dy / R); // up (screen -y) => forward (+)
    e.preventDefault();
  });

  const end = (e) => {
    if (e.pointerId !== id && id !== null) return;
    active = false; id = null;
    setKnob(0, 0);
    onMove(0, 0);
  };
  baseEl.addEventListener('pointerup', end);
  baseEl.addEventListener('pointercancel', end);
}
