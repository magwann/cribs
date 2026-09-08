import * as THREE from 'three';
import { CATALOG_BY_ID } from './catalog.js';
import { ROOM } from './world.js';

// ---------------------------------------------------------------------------
// BUILDER
// Owns every placed crib item and all of build-mode interaction:
//   - arm a catalog item  -> a translucent ghost follows the cursor
//   - click floor          -> place it
//   - click an item        -> select + drag to move
//   - R / rotate button    -> spin 45°
//   - Delete / button      -> remove
// Emits onSelect(itemOrNull) so the UI can show/hide the object toolbar.
// ---------------------------------------------------------------------------

export function createBuilder(scene, camera, canvas, { onSelect } = {}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const items = [];              // { id, group }
  let active = false;
  let pending = null;            // catalog id armed for placement
  let ghost = null;              // preview group
  let selected = null;          // currently selected item
  let dragging = false;

  const floor = scene.getObjectByName('floor');

  function screenToFloor(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(floor, false)[0];
    if (!hit) return null;
    const mx = ROOM.w / 2 - 0.3;
    const mz = ROOM.d / 2 - 0.3;
    return new THREE.Vector3(
      Math.max(-mx, Math.min(mx, hit.point.x)),
      0,
      Math.max(-mz, Math.min(mz, hit.point.z))
    );
  }

  function pickItem(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const meshes = [];
    for (const it of items) it.group.traverse((o) => o.isMesh && meshes.push(o));
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    return items.find((it) => {
      let found = false;
      it.group.traverse((o) => { if (o === hit.object) found = true; });
      return found;
    });
  }

  // ---- placement lifecycle ----
  function arm(catalogId) {
    clearGhost();
    select(null);
    pending = catalogId;
    ghost = CATALOG_BY_ID[catalogId].build();
    ghost.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.5;
        o.castShadow = false;
      }
    });
    ghost.visible = false;
    scene.add(ghost);
  }

  function clearGhost() {
    if (ghost) { scene.remove(ghost); ghost = null; }
    pending = null;
  }

  function place(pos) {
    const group = CATALOG_BY_ID[pending].build();
    group.position.copy(pos);
    group.rotation.y = ghost ? ghost.rotation.y : 0;
    scene.add(group);
    const item = { id: pending, group };
    items.push(item);
    clearGhost();
    select(item);
  }

  // ---- selection ----
  function select(item) {
    if (selected === item) return;
    if (selected) setTint(selected, false);
    selected = item;
    if (selected) setTint(selected, true);
    onSelect && onSelect(selected);
  }

  function setTint(item, on) {
    item.group.traverse((o) => {
      if (!o.isMesh) return;
      if (on) {
        o.userData._emissive = o.material.emissive ? o.material.emissive.clone() : null;
        if (o.material.emissive) o.material.emissive.setHex(0x224422);
      } else if (o.userData._emissive !== undefined) {
        if (o.material.emissive && o.userData._emissive)
          o.material.emissive.copy(o.userData._emissive);
      }
    });
  }

  function rotateSelected() {
    if (selected) selected.group.rotation.y += Math.PI / 4;
  }

  function deleteSelected() {
    if (!selected) return;
    scene.remove(selected.group);
    const i = items.indexOf(selected);
    if (i >= 0) items.splice(i, 1);
    const gone = selected;
    selected = null;
    setTint(gone, false);
    onSelect && onSelect(null);
  }

  // ---- pointer handling (only while build mode is active) ----
  function onDown(e) {
    if (!active) return;
    if (pending) {
      const pos = screenToFloor(e.clientX, e.clientY);
      if (pos) place(pos);
      return;
    }
    const item = pickItem(e.clientX, e.clientY);
    select(item);
    dragging = !!item;
  }

  function onMove(e) {
    if (!active) return;
    if (pending && ghost) {
      const pos = screenToFloor(e.clientX, e.clientY);
      if (pos) { ghost.position.copy(pos); ghost.visible = true; }
      return;
    }
    if (dragging && selected) {
      const pos = screenToFloor(e.clientX, e.clientY);
      if (pos) selected.group.position.copy(pos);
    }
  }

  function onUp() { dragging = false; }

  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  // ---- public API ----
  return {
    setActive(v) {
      active = v;
      if (!v) { clearGhost(); select(null); }
    },
    arm,
    rotateSelected,
    deleteSelected,
    getSelected: () => selected,
    // Used by explore-mode interaction (e.g. click a couch to sit).
    pickItemAt: (clientX, clientY) => pickItem(clientX, clientY),

    // serialization
    getItemsData() {
      return items.map((it) => ({
        id: it.id,
        x: it.group.position.x,
        z: it.group.position.z,
        rot: it.group.rotation.y,
      }));
    },
    loadItems(data) {
      // wipe existing
      for (const it of items) scene.remove(it.group);
      items.length = 0;
      select(null);
      for (const d of data || []) {
        const cat = CATALOG_BY_ID[d.id];
        if (!cat) continue;
        const group = cat.build();
        group.position.set(d.x, 0, d.z);
        group.rotation.y = d.rot || 0;
        scene.add(group);
        items.push({ id: d.id, group });
      }
    },
  };
}
