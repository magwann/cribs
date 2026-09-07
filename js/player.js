import * as THREE from 'three';
import { ROOM } from './world.js';

// ---------------------------------------------------------------------------
// PLAYER
// A low-poly avatar with third-person orbit camera. WASD moves relative to the
// camera facing; dragging the pointer orbits. Movement is clamped to the room.
// This module intentionally knows nothing about build mode — main.js pauses
// player control while building.
// ---------------------------------------------------------------------------

export function createPlayer(scene, camera, canvas) {
  const avatar = buildAvatar();
  avatar.position.set(0, 0, 3);
  scene.add(avatar);

  const state = {
    keys: {},
    yaw: 0,          // camera orbit around avatar
    pitch: 0.35,
    dist: 6,
    dragging: false,
    lastX: 0,
    lastY: 0,
    enabled: true,
    speed: 4,        // units / second
  };

  // ---- Input ----
  window.addEventListener('keydown', (e) => {
    state.keys[e.key.toLowerCase()] = true;
  });
  window.addEventListener('keyup', (e) => {
    state.keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (!state.enabled) return;
    state.dragging = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
  });
  window.addEventListener('pointerup', () => { state.dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!state.dragging || !state.enabled) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.yaw -= dx * 0.005;
    state.pitch = Math.max(0.05, Math.min(1.2, state.pitch + dy * 0.004));
  });

  function update(dt) {
    if (state.enabled) {
      // Movement basis from camera yaw
      const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
      const rightV = new THREE.Vector3(forward.z, 0, -forward.x);
      const move = new THREE.Vector3();
      if (state.keys['w']) move.sub(forward);
      if (state.keys['s']) move.add(forward);
      if (state.keys['a']) move.sub(rightV);
      if (state.keys['d']) move.add(rightV);

      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(state.speed * dt);
        avatar.position.add(move);
        // face travel direction
        avatar.rotation.y = Math.atan2(move.x, move.z);
      }

      // clamp inside room (leave a small margin)
      const mx = ROOM.w / 2 - 0.5;
      const mz = ROOM.d / 2 - 0.5;
      avatar.position.x = Math.max(-mx, Math.min(mx, avatar.position.x));
      avatar.position.z = Math.max(-mz, Math.min(mz, avatar.position.z));
    }

    // Camera follows avatar on an orbit
    const target = avatar.position.clone().add(new THREE.Vector3(0, 1, 0));
    const cx = Math.sin(state.yaw) * Math.cos(state.pitch) * state.dist;
    const cz = Math.cos(state.yaw) * Math.cos(state.pitch) * state.dist;
    const cy = Math.sin(state.pitch) * state.dist;
    camera.position.set(target.x + cx, target.y + cy, target.z + cz);
    camera.lookAt(target);
  }

  return {
    avatar,
    update,
    setEnabled: (v) => { state.enabled = v; if (!v) state.dragging = false; },
    getYaw: () => state.yaw,
  };
}

function buildAvatar() {
  const g = new THREE.Group();
  const mk = (geo, color) => {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }));
    m.castShadow = true;
    return m;
  };
  const body = mk(new THREE.CapsuleGeometry(0.25, 0.5, 2, 6), 0x7cf0c8);
  body.position.y = 0.75;
  g.add(body);
  const head = mk(new THREE.IcosahedronGeometry(0.22, 0), 0xffd8a8);
  head.position.y = 1.4;
  g.add(head);
  // little forward nose so you can read facing direction
  const nose = mk(new THREE.BoxGeometry(0.08, 0.08, 0.12), 0xff5c8a);
  nose.position.set(0, 1.4, 0.22);
  g.add(nose);
  return g;
}
