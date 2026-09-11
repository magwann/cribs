import * as THREE from 'three';

// ---------------------------------------------------------------------------
// WORLD
// Renderer/scene/camera + the room shell. A crib has three areas (main,
// medium, small) connected by doors; buildArea() (re)builds the shell for a
// given area. PS2 look = low-res buffer upscaled hard, flat shading, fog.
// ---------------------------------------------------------------------------

export const ROOM_DEFAULTS = { floor: '#6b5844', wall: '#8a8fa5' };

// Area sizes, their doors (on a side wall at `at:[x,z]`), and where you land
// when you arrive from another area.
export const AREAS = {
  main:   { w: 12, d: 12, h: 4,   doors: [{ to: 'medium', at: [6, 0] }],
            entry: { medium: [4.6, 0] }, spawn: [0, 3] },
  medium: { w: 9,  d: 8,  h: 3.6, doors: [{ to: 'main', at: [-4.5, 0] }, { to: 'small', at: [4.5, 0] }],
            entry: { main: [-3.2, 0], small: [3.2, 0] }, spawn: [0, 2] },
  small:  { w: 6,  d: 6,  h: 3.4, doors: [{ to: 'medium', at: [-3, 0] }],
            entry: { medium: [-1.9, 0] }, spawn: [1, 1] },
};

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setClearColor(0x0a0a12);
  const ps2Ratio = () => Math.min(window.devicePixelRatio, 1) * 0.6;
  const vw = () => Math.round(window.visualViewport ? window.visualViewport.width : window.innerWidth);
  const vh = () => Math.round(window.visualViewport ? window.visualViewport.height : window.innerHeight);
  renderer.setPixelRatio(ps2Ratio());
  renderer.setSize(vw(), vh());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x14182a, 16, 30);
  const camera = new THREE.PerspectiveCamera(60, vw() / vh(), 0.1, 100);

  const ambient = new THREE.AmbientLight(0x8895b5, 1.1); scene.add(ambient);
  const key = new THREE.DirectionalLight(0xfff2d8, 1.4);
  key.position.set(6, 10, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -10; key.shadow.camera.right = 10;
  key.shadow.camera.top = 10; key.shadow.camera.bottom = -10;
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0xbfd0ff, 0x2a2030, 0.6));

  let curKey = 'main', shell = null;

  function buildArea(key) {
    const a = AREAS[key] || AREAS.main;
    curKey = key;
    if (shell) scene.remove(shell);
    shell = new THREE.Group();
    const { w, d, h } = a;

    const floorMat = new THREE.MeshLambertMaterial({ color: 0x6b5844, flatShading: true });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 'floor';
    shell.add(floor);

    const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a8fa5, flatShading: true, side: THREE.DoubleSide });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    back.position.set(0, h / 2, -d / 2); back.receiveShadow = true; shell.add(back);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat);
    left.rotation.y = Math.PI / 2; left.position.set(-w / 2, h / 2, 0); left.receiveShadow = true; shell.add(left);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat);
    right.rotation.y = -Math.PI / 2; right.position.set(w / 2, h / 2, 0); right.receiveShadow = true; shell.add(right);

    const winMat = new THREE.MeshLambertMaterial({ color: 0x2a4a6a, emissive: 0x1a3a5a });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(3, w * 0.4), 1.6), winMat);
    win.position.set(0, h * 0.55, -d / 2 + 0.02); shell.add(win);

    const doors = [];
    for (const door of a.doors) {
      const [dx, dz] = door.at;
      const dg = new THREE.Group();
      const frameMat = new THREE.MeshLambertMaterial({ color: 0x3a2a22, flatShading: true });
      const openMat = new THREE.MeshLambertMaterial({ color: 0x0a0a12, emissive: 0x16273e });
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.3, 1.5), frameMat);
      const opening = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.0, 1.1), openMat);
      dg.add(frame); dg.add(opening);
      dg.position.set(dx, 1.15, dz);
      dg.userData.door = door.to;
      shell.add(dg);
      doors.push({ to: door.to, x: dx, z: dz });
    }

    shell.userData.floorMat = floorMat;
    shell.userData.wallMat = wallMat;
    scene.add(shell);
    return { key, w, d, h, doors };
  }

  function onResize() {
    const w = vw(), h = vh();
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setPixelRatio(ps2Ratio());
    renderer.setSize(w, h, true);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => { onResize(); setTimeout(onResize, 250); setTimeout(onResize, 600); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

  const setFloorColor = (c) => { if (c && shell) shell.userData.floorMat.color.set(c); };
  const setWallColor = (c) => { if (c && shell) shell.userData.wallMat.color.set(c); };

  return { renderer, scene, camera, buildArea, setFloorColor, setWallColor, getArea: () => AREAS[curKey], getAreaKey: () => curKey };
}
