import * as THREE from 'three';

// ---------------------------------------------------------------------------
// CATALOG
// Every crib item is built procedurally from primitive boxes/cylinders so we
// ship zero 3D asset files. Flat shading + low segment counts give the chunky
// PS2 look. Each entry has an id, label, a swatch color for the palette UI,
// and a build() that returns a THREE.Group centered on the floor (y=0 base).
// ---------------------------------------------------------------------------

// Shared flat-shaded material helper — this is the core of the PS2 vibe.
function mat(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rTop, rBot, h, color, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export const CATALOG = [
  {
    id: 'chair',
    label: 'Chair',
    swatch: '#c86b3c',
    // sit anchors are local to the group; yaw is added to the item's rotation.
    // The chair's back is at -z, so you sit facing +z (yaw 0).
    sit: [{ x: 0, y: 0.45, z: 0, yaw: 0 }],
    build() {
      const g = new THREE.Group();
      const wood = '#8a5a34';
      g.add(box(0.5, 0.08, 0.5, '#c86b3c', 0, 0.45, 0));        // seat
      g.add(box(0.5, 0.5, 0.08, '#c86b3c', 0, 0.7, -0.21));      // back
      const legPos = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]];
      for (const [x, z] of legPos) g.add(box(0.06, 0.45, 0.06, wood, x, 0.22, z));
      return g;
    },
  },
  {
    id: 'table',
    label: 'Table',
    swatch: '#9a6a3a',
    build() {
      const g = new THREE.Group();
      const wood = '#9a6a3a';
      g.add(box(1.2, 0.1, 0.8, wood, 0, 0.7, 0));                // top
      const legPos = [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]];
      for (const [x, z] of legPos) g.add(box(0.08, 0.7, 0.08, '#7a5028', x, 0.35, z));
      return g;
    },
  },
  {
    id: 'sofa',
    label: 'Sofa',
    swatch: '#4a6fa5',
    sit: [
      { x: -0.38, y: 0.55, z: 0.05, yaw: 0 },
      { x: 0.38, y: 0.55, z: 0.05, yaw: 0 },
    ],
    build() {
      const g = new THREE.Group();
      const c = '#4a6fa5';
      g.add(box(1.8, 0.4, 0.8, c, 0, 0.3, 0));                   // base
      g.add(box(1.8, 0.5, 0.25, c, 0, 0.6, -0.28));              // back
      g.add(box(0.25, 0.5, 0.8, c, -0.78, 0.55, 0));             // arm L
      g.add(box(0.25, 0.5, 0.8, c, 0.78, 0.55, 0));              // arm R
      g.add(box(0.7, 0.15, 0.7, '#5f85bb', -0.38, 0.55, 0.02));  // cushion L
      g.add(box(0.7, 0.15, 0.7, '#5f85bb', 0.38, 0.55, 0.02));   // cushion R
      return g;
    },
  },
  {
    id: 'lamp',
    label: 'Lamp',
    swatch: '#f0d060',
    build() {
      const g = new THREE.Group();
      g.add(cyl(0.18, 0.22, 0.05, '#333', 0, 0.025, 0));         // base
      g.add(cyl(0.03, 0.03, 1.3, '#555', 0, 0.68, 0));           // pole
      const shade = cyl(0.18, 0.28, 0.3, '#f0d060', 0, 1.45, 0, 8);
      shade.material.emissive = new THREE.Color('#5a4a10');
      g.add(shade);
      // a soft point light so lamps actually light the room
      const light = new THREE.PointLight('#ffe9a8', 6, 6, 2);
      light.position.set(0, 1.45, 0);
      g.add(light);
      return g;
    },
  },
  {
    id: 'tv',
    label: 'TV',
    swatch: '#1a1a1a',
    build() {
      const g = new THREE.Group();
      g.add(box(0.9, 0.2, 0.4, '#3a2a22', 0, 0.1, 0));           // stand
      g.add(box(1.4, 0.85, 0.12, '#111', 0, 0.72, 0));           // frame
      const screen = box(1.28, 0.72, 0.02, '#0a1a2a', 0, 0.72, 0.07);
      screen.material.emissive = new THREE.Color('#0a2a4a');
      g.add(screen);
      return g;
    },
  },
  {
    id: 'plant',
    label: 'Plant',
    swatch: '#3fae5a',
    build() {
      const g = new THREE.Group();
      g.add(cyl(0.2, 0.25, 0.4, '#b5623a', 0, 0.2, 0, 8));       // pot
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), mat('#3fae5a'));
      leaf.position.y = 0.8; leaf.castShadow = true;
      g.add(leaf);
      const leaf2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), mat('#4fc06a'));
      leaf2.position.set(0.1, 1.05, 0.05); leaf2.castShadow = true;
      g.add(leaf2);
      return g;
    },
  },
  {
    id: 'shelf',
    label: 'Bookshelf',
    swatch: '#7a5028',
    build() {
      const g = new THREE.Group();
      const wood = '#7a5028';
      g.add(box(1.0, 1.8, 0.35, wood, 0, 0.9, 0));               // body
      // colorful books on 3 shelves
      const cols = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad'];
      for (let s = 0; s < 3; s++) {
        for (let b = 0; b < 5; b++) {
          const bk = box(0.14, 0.3, 0.28, cols[(s + b) % cols.length],
            -0.4 + b * 0.18, 0.45 + s * 0.55, 0.02);
          g.add(bk);
        }
      }
      return g;
    },
  },
  {
    id: 'rug',
    label: 'Rug',
    swatch: '#b0447a',
    build() {
      const g = new THREE.Group();
      const r = box(1.8, 0.03, 1.2, '#b0447a', 0, 0.015, 0);
      r.receiveShadow = true; r.castShadow = false;
      g.add(r);
      g.add(box(1.4, 0.032, 0.8, '#d46a9a', 0, 0.016, 0));       // inner pattern
      return g;
    },
  },
  {
    id: 'speaker',
    label: 'Speakers',
    swatch: '#222',
    build() {
      const g = new THREE.Group();
      g.add(box(0.4, 1.0, 0.4, '#222', 0, 0.5, 0));
      const woofer = cyl(0.13, 0.13, 0.05, '#444', 0, 0.35, 0.2, 10);
      woofer.rotation.x = Math.PI / 2;
      g.add(woofer);
      const tweeter = cyl(0.06, 0.06, 0.05, '#666', 0, 0.75, 0.2, 10);
      tweeter.rotation.x = Math.PI / 2;
      g.add(tweeter);
      return g;
    },
  },
];

export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));
