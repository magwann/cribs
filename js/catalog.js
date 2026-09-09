import * as THREE from 'three';

// ---------------------------------------------------------------------------
// CATALOG
// Every crib item is built procedurally from primitive boxes/cylinders so we
// ship zero 3D asset files. Flat shading + low segment counts give the chunky
// PS2 look. Each entry has an id, label, a swatch color for the palette UI,
// and build(color) returning a THREE.Group centered on the floor (y=0 base).
//
// Items flagged `recolor: true` use the passed color as their primary surface
// (accents are derived by lightening it). Non-recolorable items ignore it.
// ---------------------------------------------------------------------------

function mat(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}
function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rTop, rBot, h, color, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// Lighten (dl > 0) or darken (dl < 0) a color in HSL space.
function shade(color, dl) {
  const c = new THREE.Color(color);
  c.offsetHSL(0, 0, dl);
  return c;
}

// Swatch options offered when recoloring an item in build mode.
export const RECOLOR_SWATCHES = [
  '#c85a7a', '#4a6fa5', '#3fae5a', '#f0b429',
  '#8e44ad', '#c0392b', '#e8e6dd', '#2c3e50',
];

export const CATALOG = [
  {
    id: 'chair',
    label: 'Chair',
    swatch: '#c86b3c',
    recolor: true,
    sit: [{ x: 0, y: 0.45, z: 0, yaw: 0 }],
    build(color = '#c86b3c') {
      const g = new THREE.Group();
      const wood = '#8a5a34';
      g.add(box(0.5, 0.08, 0.5, color, 0, 0.45, 0));            // seat
      g.add(box(0.5, 0.5, 0.08, color, 0, 0.7, -0.21));         // back
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]])
        g.add(box(0.06, 0.45, 0.06, wood, x, 0.22, z));
      return g;
    },
  },
  {
    id: 'table',
    label: 'Table',
    swatch: '#9a6a3a',
    recolor: true,
    build(color = '#9a6a3a') {
      const g = new THREE.Group();
      g.add(box(1.2, 0.1, 0.8, color, 0, 0.7, 0));              // top
      for (const [x, z] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]])
        g.add(box(0.08, 0.7, 0.08, shade(color, -0.12), x, 0.35, z));
      return g;
    },
  },
  {
    id: 'sofa',
    label: 'Sofa',
    swatch: '#4a6fa5',
    recolor: true,
    sit: [
      { x: -0.38, y: 0.55, z: 0.05, yaw: 0 },
      { x: 0.38, y: 0.55, z: 0.05, yaw: 0 },
    ],
    build(color = '#4a6fa5') {
      const g = new THREE.Group();
      const cushion = shade(color, 0.1);
      g.add(box(1.8, 0.4, 0.8, color, 0, 0.3, 0));              // base
      g.add(box(1.8, 0.5, 0.25, color, 0, 0.6, -0.28));         // back
      g.add(box(0.25, 0.5, 0.8, color, -0.78, 0.55, 0));        // arm L
      g.add(box(0.25, 0.5, 0.8, color, 0.78, 0.55, 0));         // arm R
      g.add(box(0.7, 0.15, 0.7, cushion, -0.38, 0.55, 0.02));   // cushion L
      g.add(box(0.7, 0.15, 0.7, cushion, 0.38, 0.55, 0.02));    // cushion R
      return g;
    },
  },
  {
    id: 'lamp',
    label: 'Lamp',
    swatch: '#f0d060',
    build() {
      const g = new THREE.Group();
      g.add(cyl(0.18, 0.22, 0.05, '#333', 0, 0.025, 0));
      g.add(cyl(0.03, 0.03, 1.3, '#555', 0, 0.68, 0));
      const shadeMesh = cyl(0.18, 0.28, 0.3, '#f0d060', 0, 1.45, 0, 8);
      shadeMesh.material.emissive = new THREE.Color('#5a4a10');
      g.add(shadeMesh);
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
    tv: true, // click in explore mode to turn on/off
    build() {
      const g = new THREE.Group();
      g.add(box(0.9, 0.2, 0.4, '#3a2a22', 0, 0.1, 0));          // stand
      g.add(box(1.4, 0.85, 0.12, '#111', 0, 0.72, 0));          // frame
      const screen = box(1.28, 0.72, 0.02, '#0a1a2a', 0, 0.72, 0.07);
      screen.name = 'tv-screen';
      screen.material.emissive = new THREE.Color('#08131f');
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
      g.add(cyl(0.2, 0.25, 0.4, '#b5623a', 0, 0.2, 0, 8));
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), mat('#3fae5a'));
      leaf.position.y = 0.8; leaf.castShadow = true; g.add(leaf);
      const leaf2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), mat('#4fc06a'));
      leaf2.position.set(0.1, 1.05, 0.05); leaf2.castShadow = true; g.add(leaf2);
      return g;
    },
  },
  {
    id: 'shelf',
    label: 'Bookshelf',
    swatch: '#7a5028',
    recolor: true,
    build(color = '#7a5028') {
      const g = new THREE.Group();
      g.add(box(1.0, 1.8, 0.35, color, 0, 0.9, 0));             // body
      const cols = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad'];
      for (let s = 0; s < 3; s++)
        for (let b = 0; b < 5; b++)
          g.add(box(0.14, 0.3, 0.28, cols[(s + b) % cols.length], -0.4 + b * 0.18, 0.45 + s * 0.55, 0.02));
      return g;
    },
  },
  {
    id: 'rug',
    label: 'Rug',
    swatch: '#b0447a',
    recolor: true,
    build(color = '#b0447a') {
      const g = new THREE.Group();
      const r = box(1.8, 0.03, 1.2, color, 0, 0.015, 0);
      r.receiveShadow = true; r.castShadow = false;
      g.add(r);
      g.add(box(1.4, 0.032, 0.8, shade(color, 0.12), 0, 0.016, 0)); // inner pattern
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
      const woofer = cyl(0.13, 0.13, 0.05, '#444', 0, 0.35, 0.2, 10); woofer.rotation.x = Math.PI / 2; g.add(woofer);
      const tweeter = cyl(0.06, 0.06, 0.05, '#666', 0, 0.75, 0.2, 10); tweeter.rotation.x = Math.PI / 2; g.add(tweeter);
      return g;
    },
  },
  {
    id: 'stool', label: 'Stool', swatch: '#c0392b', recolor: true,
    sit: [{ x: 0, y: 0.55, z: 0, yaw: 0 }],
    build(color = '#c0392b') {
      const g = new THREE.Group();
      g.add(cyl(0.22, 0.22, 0.1, color, 0, 0.55, 0, 12));
      for (let a = 0; a < 3; a++) {
        const ang = (a / 3) * Math.PI * 2;
        g.add(box(0.05, 0.55, 0.05, '#333', Math.sin(ang) * 0.15, 0.27, Math.cos(ang) * 0.15));
      }
      return g;
    },
  },
  {
    id: 'beanbag', label: 'Bean Bag', swatch: '#8e44ad', recolor: true,
    sit: [{ x: 0, y: 0.35, z: 0, yaw: 0 }],
    build(color = '#8e44ad') {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), mat(color));
      b.scale.y = 0.7; b.position.y = 0.35; b.castShadow = true; g.add(b);
      return g;
    },
  },
  {
    id: 'coffee', label: 'Coffee Table', swatch: '#6b4a34', recolor: true,
    build(color = '#6b4a34') {
      const g = new THREE.Group();
      g.add(box(1.0, 0.08, 0.6, color, 0, 0.35, 0));
      for (const [x, z] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]])
        g.add(box(0.06, 0.35, 0.06, shade(color, -0.1), x, 0.17, z));
      return g;
    },
  },
  {
    id: 'desk', label: 'Desk', swatch: '#8a5a34', recolor: true,
    build(color = '#8a5a34') {
      const g = new THREE.Group();
      g.add(box(1.3, 0.1, 0.7, color, 0, 0.75, 0));
      g.add(box(0.5, 0.7, 0.6, shade(color, -0.08), 0.35, 0.375, 0));
      for (const z of [-0.28, 0.28]) g.add(box(0.06, 0.75, 0.06, shade(color, -0.15), -0.58, 0.375, z));
      return g;
    },
  },
  {
    id: 'arcade', label: 'Arcade', swatch: '#2a2a3a', tv: true,
    build() {
      const g = new THREE.Group();
      g.add(box(0.7, 1.6, 0.6, '#2a2a3a', 0, 0.8, 0));
      const screen = box(0.55, 0.45, 0.05, '#0a1a2a', 0, 1.18, 0.29);
      screen.name = 'tv-screen'; screen.material.emissive = new THREE.Color('#08131f'); g.add(screen);
      g.add(box(0.6, 0.1, 0.3, '#c0392b', 0, 0.78, 0.32)); // control panel
      g.add(box(0.7, 0.25, 0.05, '#f0b429', 0, 1.5, 0.3));  // marquee
      return g;
    },
  },
  {
    id: 'disco', label: 'Disco Ball', swatch: '#c0c8d8',
    build() {
      const g = new THREE.Group();
      g.add(cyl(0.015, 0.015, 0.5, '#444', 0, 1.75, 0)); // hang cord
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), mat('#c8d0e0'));
      ball.position.y = 1.35; ball.castShadow = true;
      ball.userData.anim = 'discoBall';
      g.add(ball);
      const light = new THREE.PointLight('#ffffff', 10, 9, 2);
      light.position.set(0, 1.35, 0);
      light.userData.anim = 'discoLight';
      g.add(light);
      return g;
    },
  },
  {
    id: 'lava', label: 'Lava Lamp', swatch: '#ff5c8a', recolor: true,
    build(color = '#ff5c8a') {
      const g = new THREE.Group();
      g.add(cyl(0.12, 0.16, 0.1, '#333', 0, 0.05, 0));
      g.add(cyl(0.1, 0.14, 0.7, '#20102a', 0, 0.45, 0, 10));
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), mat(color));
      blob.material.emissive = new THREE.Color(color);
      blob.position.y = 0.4;
      blob.userData.anim = 'lava';
      g.add(blob);
      g.add(cyl(0.1, 0.1, 0.08, '#333', 0, 0.82, 0));
      return g;
    },
  },
];

export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));
