import * as THREE from 'three';

// ---------------------------------------------------------------------------
// WORLD
// Sets up the renderer, scene, camera and the room shell. The signature PS2
// look comes from rendering at a low internal resolution (pixelRatio well
// below 1) and letting CSS upscale with hard pixel edges, plus flat shading,
// fog, and a limited light rig.
// ---------------------------------------------------------------------------

export const ROOM = { w: 12, d: 12, h: 4 }; // room interior dimensions

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setClearColor(0x0a0a12);
  // Chunky pixels: cap the internal buffer to roughly half-res.
  const ps2Ratio = () => Math.min(window.devicePixelRatio, 1) * 0.6;
  // visualViewport is the reliable size on iOS (innerWidth lags after rotation)
  const vw = () => Math.round(window.visualViewport ? window.visualViewport.width : window.innerWidth);
  const vh = () => Math.round(window.visualViewport ? window.visualViewport.height : window.innerHeight);
  renderer.setPixelRatio(ps2Ratio());
  renderer.setSize(vw(), vh());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap; // hard, cheap shadows

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x14182a, 14, 26);

  const camera = new THREE.PerspectiveCamera(60, vw() / vh(), 0.1, 100);

  // ---- Lighting rig ----
  const ambient = new THREE.AmbientLight(0x8895b5, 1.1);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xfff2d8, 1.4);
  key.position.set(6, 10, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  scene.add(key);

  const fill = new THREE.HemisphereLight(0xbfd0ff, 0x2a2030, 0.6);
  scene.add(fill);

  // ---- Room shell ----
  const room = buildRoom();
  scene.add(room);

  function onResize() {
    const w = vw(), h = vh();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(ps2Ratio());
    renderer.setSize(w, h, true);
  }
  window.addEventListener('resize', onResize);
  // iOS reports stale dimensions right after an orientation flip — re-check.
  window.addEventListener('orientationchange', () => { onResize(); setTimeout(onResize, 250); setTimeout(onResize, 600); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

  const setFloorColor = (c) => { if (c) room.userData.floorMat.color.set(c); };
  const setWallColor = (c) => { if (c) room.userData.wallMat.color.set(c); };

  return { renderer, scene, camera, room, setFloorColor, setWallColor };
}

// Defaults used when a crib has no saved room colors.
export const ROOM_DEFAULTS = { floor: '#6b5844', wall: '#8a8fa5' };

function buildRoom() {
  const g = new THREE.Group();
  const { w, d, h } = ROOM;

  const floorMat = new THREE.MeshLambertMaterial({ color: 0x6b5844, flatShading: true });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor'; // raycaster targets this for placement
  g.add(floor);

  const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a8fa5, flatShading: true, side: THREE.DoubleSide });

  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
  back.position.set(0, h / 2, -d / 2);
  back.receiveShadow = true;
  g.add(back);

  const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-w / 2, h / 2, 0);
  left.receiveShadow = true;
  g.add(left);

  const right = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(w / 2, h / 2, 0);
  right.receiveShadow = true;
  g.add(right);

  // A window strip on the back wall for a bit of life
  const winMat = new THREE.MeshLambertMaterial({ color: 0x2a4a6a, emissive: 0x1a3a5a });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.6), winMat);
  win.position.set(0, 2.2, -d / 2 + 0.02);
  g.add(win);

  // exposed so the room can be recolored (crib customization)
  g.userData.floorMat = floorMat;
  g.userData.wallMat = wallMat;
  return g;
}
