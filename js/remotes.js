import * as THREE from 'three';
import { buildAvatar } from './player.js';
import { attachBubble } from './bubble.js';

// ---------------------------------------------------------------------------
// REMOTES — manages the meshes for other players in a live room. Positions
// arrive at a low tick rate over the network, so each avatar lerps toward its
// latest target every frame for smooth motion. Each gets a name tag sprite and
// a deterministic body color derived from its uid.
// ---------------------------------------------------------------------------

function colorFromUid(uid) {
  let h = 0;
  for (const c of uid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return new THREE.Color(`hsl(${h % 360}, 65%, 60%)`).getHex();
}

function makeNameTag(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(10,10,18,0.75)';
  roundRect(ctx, 8, 8, 240, 48, 10); ctx.fill();
  ctx.fillStyle = '#e8e6dd';
  ctx.font = 'bold 28px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('@' + text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(1.4, 0.35, 1);
  return sprite;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function endRemoteEmote(e) {
  e.emote = null;
  e.group.rotation.z = 0;
  if (e.hand) { e.hand.visible = false; e.hand.rotation.z = 0; }
}

export function createRemotes(scene) {
  const map = new Map(); // uid -> { group, target:{x,y,z,ry}, handle }

  return {
    // players: { uid: {handle,x,z,ry,sitting} }. selfUid is excluded.
    sync(players, selfUid) {
      const seen = new Set();
      for (const [uid, p] of Object.entries(players || {})) {
        if (uid === selfUid || !p) continue;
        seen.add(uid);
        let e = map.get(uid);
        if (!e) {
          const group = buildAvatar(colorFromUid(uid));
          const tag = makeNameTag(p.handle || 'guest');
          tag.position.y = 1.95;
          group.add(tag);
          scene.add(group);
          e = {
            group, handle: p.handle,
            target: { x: p.x || 0, y: 0, z: p.z || 0, ry: p.ry || 0 },
            hand: group.getObjectByName('hand'),
          };
          e.group.position.set(e.target.x, 0, e.target.z);
          map.set(uid, e);
        }
        e.target.x = p.x || 0;
        e.target.z = p.z || 0;
        e.target.y = p.sitting ? -0.1 : 0;
        e.target.ry = p.ry || 0;
        if (p.color) e.group.traverse((o) => { if (o.isMesh && o.userData.body) o.material.color.set(p.color); });
        if (p.emote && p.emoteTs && p.emoteTs !== e.lastEmoteTs) {
          e.lastEmoteTs = p.emoteTs; e.emote = p.emote; e.emoteT = 0;
        }
      }
      for (const [uid, e] of map) {
        if (!seen.has(uid)) { scene.remove(e.group); map.delete(uid); }
      }
    },

    update(dt) {
      const k = Math.min(1, dt * 10);
      for (const [, e] of map) {
        e.group.position.x += (e.target.x - e.group.position.x) * k;
        e.group.position.y += (e.target.y - e.group.position.y) * k;
        e.group.position.z += (e.target.z - e.group.position.z) * k;
        if (e.emote === 'dance') {
          e.emoteT += dt;
          e.group.position.y += Math.abs(Math.sin(e.emoteT * 9)) * 0.18;
          e.group.rotation.y += dt * 6;
          if (e.emoteT > 4) endRemoteEmote(e);
        } else if (e.emote === 'wave') {
          e.emoteT += dt;
          if (e.hand) { e.hand.visible = true; e.hand.rotation.z = Math.sin(e.emoteT * 13) * 0.7; }
          if (e.emoteT > 1.8) endRemoteEmote(e);
        } else {
          // shortest-arc rotate toward target facing
          let d = e.target.ry - e.group.rotation.y;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          e.group.rotation.y += d * k;
        }
      }
    },

    showBubble(uid, text) {
      const e = map.get(uid);
      if (e) attachBubble(e.group, text, (e.bubble ||= {}));
    },
    count() { return map.size; },
    clear() { for (const [, e] of map) scene.remove(e.group); map.clear(); },
  };
}
