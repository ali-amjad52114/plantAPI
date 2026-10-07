// @ts-nocheck
// 3D site view scene (three.js). Imperative port of docs/plant-3d.html; typed loosely on purpose.
// root = the .sv element holding the HUD; deps = three modules; opts = { assets, onOpen(assetId) }.
export function buildScene(root, deps, opts) {
const { THREE, OrbitControls, CSS2DRenderer, CSS2DObject } = deps;

// missing HUD nodes (embed mode renders only #host) resolve to detached divs so wiring below stays simple
const $ = s => root.querySelector(s) || document.createElement('div');
const EMBED = !!opts.embed, FOCUS = opts.focus;

/* ------------------------------------------------------------ assets (Fiix seed + example plant equipment) */
const ASSETS = opts.assets;
const BY_ID = Object.fromEntries(ASSETS.map(a => [a.id, a]));

/* ------------------------------------------------------------ renderer, scene, camera */
const host = $('#host');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
host.append(renderer.domElement);
const css = new CSS2DRenderer(); css.domElement.className = 'css2d'; host.append(css.domElement);

// "Control Room" look: night-shift hall on deep steel, blueprint grid, safety-orange alarms.
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
scene.fog = new THREE.FogExp2(0x0b0f14, .0085);
const camera = new THREE.PerspectiveCamera(40, 1, .1, 500);
const HOME = { pos: new THREE.Vector3(-20, 58, 64), target: new THREE.Vector3(0, 0, -1) };
camera.position.set(56, 72, 84);   // intro: start wide on the other side, then fly in to HOME
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2, -4);
Object.assign(controls, { enableDamping: true, dampingFactor: .08, maxPolarAngle: 1.42, minDistance: 5, maxDistance: 130, screenSpacePanning: false, zoomToCursor: true, autoRotateSpeed: .35 });

// hemisphere (cool sky / warm floor bounce) + warm key with shadows + blue rim from behind
scene.add(new THREE.HemisphereLight(0xb8cde6, 0x2a2118, .9));
const sun = new THREE.DirectionalLight(0xffe6c8, 2.6);
sun.position.set(-30, 60, 35); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 35, bottom: -35, near: 10, far: 160 });
sun.shadow.bias = -.0005; sun.shadow.normalBias = .04;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x4da3ff, 1.6); rim.position.set(25, 30, -60); scene.add(rim);
const fill = new THREE.DirectionalLight(0xcfe0f2, .35); fill.position.set(30, 25, 40); scene.add(fill);
// blueprint grid on the yard around the hall (theme blue, 2 m cells, fades into fog)
const grid = new THREE.GridHelper(260, 130, 0x4da3ff, 0x4da3ff);
grid.material.transparent = true; grid.material.opacity = .14; grid.material.depthWrite = false; grid.position.y = -.02; scene.add(grid);
const yard = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x10161d, roughness: .95, metalness: 0 }));
yard.rotation.x = -Math.PI / 2; yard.position.y = -.05; yard.receiveShadow = true; scene.add(yard);

/* ------------------------------------------------------------ textures and materials */
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(rx, ry); return t;
}
const concreteTex = canvasTex(1024, 1024, (g, w, h) => {
  g.fillStyle = '#b4b3ad'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30000; i++) { const v = 140 + Math.random() * 70 | 0; g.fillStyle = `rgba(${v},${v - 2},${v - 8},${Math.random() * .2})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  for (let i = 0; i < 50; i++) { const x = Math.random() * w, y = Math.random() * h, r = 40 + Math.random() * 140; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(70,64,56,.14)'); gr.addColorStop(1, 'rgba(70,64,56,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  g.strokeStyle = 'rgba(70,72,74,.35)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
}, 8, 5);
const beltTex = () => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#1c1c1d'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { const v = 40 + Math.random() * 60 | 0; g.fillStyle = `rgb(${v + 10},${v + 4},${v})`; g.beginPath(); g.arc(Math.random() * w, 10 + Math.random() * (h - 20), 1 + Math.random() * 3.5, 0, 7); g.fill(); }
});
const millTex = canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = '#cfc6b2'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(80,70,55,.35)'; for (let x = 0; x < w; x += 32) for (let y = 8; y < h; y += 24) g.fillRect(x + 14, y, 4, 4);
  g.fillStyle = 'rgba(120,100,70,.18)'; for (let i = 0; i < 12; i++) g.fillRect(Math.random() * w, 0, 2 + Math.random() * 10, h);
}, 1, 1);
const slurryTex = canvasTex(256, 256, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, '#5b4e40'); gr.addColorStop(.7, '#6d604f'); gr.addColorStop(1, '#4a3f33');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.06)'; for (let r = 20; r < w / 2; r += 14) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.stroke(); }
});
const signTex = (text, sub, bg = '#e9ecee', fg = '#1b232b') => canvasTex(512, 160, (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = '#d4101a'; g.fillRect(0, 0, w, 14);
  g.fillStyle = fg; g.font = 'bold 72px Arial'; g.textAlign = 'center'; g.fillText(text, w / 2, 92); g.font = 'bold 30px Arial'; g.fillText(sub, w / 2, 138);
});

const std = (color, rough = .6, metal = .1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const M = {
  floor: std(0x6f7882, .82, .05, { map: concreteTex }),
  steel: std(0x8f979e, .45, .6), steelDark: std(0x3d454c, .55, .5), struct: std(0x6b7680, .5, .55),
  machine: std(0x5f7489, .5, .35), machine2: std(0x8a8f86, .55, .3),
  yellow: std(0xf0b400, .45, .2), orange: std(0xe0601a, .5, .1), red: std(0xb3261e, .45, .2),
  white: std(0xe8ebec, .55, .1), concrete: std(0xa8a6a0, .9, 0), ore: std(0x2e2a27, .95, 0), oreLight: std(0x4a443e, .95, 0),
  rubber: std(0x1c1c1d, .9, 0), pipe: std(0xb3b9be, .35, .7), mill: std(0xffffff, .55, .25, { map: millTex }),
  slurry: std(0xffffff, .25, .05, { map: slurryTex }), wall: std(0x2a3644, .7, .35), glassWin: std(0x9fc8ff, .2, 0, { emissive: 0x4da3ff, emissiveIntensity: .8 }),
  asphalt: std(0x7d7f80, .9, 0), skin: std(0xc99a76, .8, 0), vest: std(0xff6a13, .7, 0, { emissive: 0x401400, emissiveIntensity: .4 }), helmet: std(0xf7f7f2, .4, 0),
  helmetY: std(0xf2c200, .4, 0), dark: std(0x222629, .7, .2), beacon: std(0xff2a1a, .3, 0, { emissive: 0xff2a1a, emissiveIntensity: 2 }),
  amberLight: std(0xffa500, .3, 0, { emissive: 0xffa000, emissiveIntensity: 1.6 }),
};

/* ------------------------------------------------------------ helpers */
const G = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(.5, .5, 1, 24), sph: new THREE.SphereGeometry(.5, 16, 12) };
function box(w, h, d, mat, x, y, z, parent, o = {}) {
  const m = new THREE.Mesh(G.box, mat); m.scale.set(w, h, d); m.position.set(x, y, z);
  if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz; if (o.rx) m.rotation.x = o.rx;
  m.castShadow = o.cast !== false; m.receiveShadow = true; parent.add(m); return m;
}
function cyl(r, h, mat, x, y, z, parent, o = {}) {
  const geo = o.geo || G.cyl; const m = new THREE.Mesh(geo, mat);
  if (!o.geo) m.scale.set(r * 2, h, r * 2);
  m.position.set(x, y, z); if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz; if (o.ry) m.rotation.y = o.ry;
  m.castShadow = o.cast !== false; m.receiveShadow = true; parent.add(m); return m;
}
function pipe(points, r, mat, parent) {
  const g = new THREE.Group(); parent.add(g);
  for (let i = 0; i < points.length - 1; i++) {
    const a = new THREE.Vector3(...points[i]), b = new THREE.Vector3(...points[i + 1]);
    const mid = a.clone().add(b).multiplyScalar(.5), len = a.distanceTo(b);
    const m = new THREE.Mesh(G.cyl, mat); m.scale.set(r * 2, len, r * 2); m.position.copy(mid);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); m.castShadow = true; g.add(m);
    if (i > 0) { const s = new THREE.Mesh(G.sph, mat); s.scale.setScalar(r * 2.2); s.position.copy(a); g.add(s); }
  }
  return g;
}
function railing(x1, z1, x2, z2, y, parent, mat = M.yellow) {
  const len = Math.hypot(x2 - x1, z2 - z1), ang = Math.atan2(z2 - z1, x2 - x1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  box(len, .05, .05, mat, cx, y + 1.05, cz, parent, { ry: -ang, cast: false });
  box(len, .04, .04, mat, cx, y + .55, cz, parent, { ry: -ang, cast: false });
  const n = Math.max(1, Math.round(len / 1.5));
  for (let i = 0; i <= n; i++) { const t = i / n; box(.05, 1.05, .05, mat, x1 + (x2 - x1) * t, y + .52, z1 + (z2 - z1) * t, parent, { cast: false }); }
}
const anim = [];   // per-frame updates: fn(dt, t)

/* ------------------------------------------------------------ building */
const HX = 34, HZ = 21, HH = 15;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 + 6, HZ * 2 + 6), M.floor);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
// main aisle along the front, with yellow edge lines and crossing lanes
box(HX * 2, .02, 6, M.asphalt, 0, .01, 14.5, scene, { cast: false });
for (const z of [11.4, 17.6]) box(HX * 2, .025, .18, M.yellow, 0, .015, z, scene, { cast: false });
for (let x = -HX + 3; x < HX; x += 4) box(1.6, .026, .14, M.white, x, .016, 14.5, scene, { cast: false });
// steel columns, roof trusses, crane rails
// cutaway: full columns along the back, a light row along the open front so the crane rail has support
for (let x = -HX; x <= HX; x += 8.5) box(.6, HH, .6, M.struct, x, HH / 2, -HZ, scene);
for (let x = -HX; x <= HX; x += 17) box(.35, 12.3, .35, M.struct, x, 6.15, HZ - .9, scene);
for (const z of [-HZ + .9, HZ - .9]) box(HX * 2, .6, .5, M.struct, 0, 12, z, scene, { cast: false });
// cutaway walls: back and left only, with clerestory windows
box(HX * 2, HH, .4, M.wall, 0, HH / 2, -HZ - .4, scene);
box(.4, HH, HZ * 2, M.wall, -HX - .4, HH / 2, 0, scene);
for (let x = -HX + 4; x < HX; x += 8.5) box(6.5, 2.6, .1, M.glassWin, x, 11.5, -HZ - .15, scene, { cast: false });
for (let z = -HZ + 4; z < HZ; z += 8.5) box(.1, 2.6, 6.5, M.glassWin, -HX - .15, 11.5, z, scene, { cast: false });
box(7, 6, .1, M.dark, 26, 3, -HZ - .15, scene, { cast: false }); // roller door
// overhead gantry crane (moves along x)
const crane = new THREE.Group(); scene.add(crane);
box(1.1, 1.3, HZ * 2 - 1.5, M.yellow, 0, 12.9, 0, crane);
box(2.2, .9, 2.4, M.yellow, 0, 12.2, -4, crane);
cyl(.03, 6, M.dark, 0, 9, -4, crane, { cast: false });
box(.6, .5, .6, M.dark, 0, 5.8, -4, crane);
anim.push((dt, t) => { crane.position.x = Math.sin(t * .05) * 22; });

// painted area zones + floor labels
const AREAS = [
  { name: 'Crushing Line 2', x1: -32, x2: -2, z1: -18, z2: 9, color: 0xe0601a },
  { name: 'Grinding', x1: -2, x2: 15, z1: -18, z2: 9, color: 0x2d6fb7 },
  { name: 'Wash plant', x1: 15, x2: 32, z1: -18, z2: 9, color: 0x2f8f5b },
];
for (const A of AREAS) {
  const w = A.x2 - A.x1, d = A.z2 - A.z1, cx = (A.x1 + A.x2) / 2, cz = (A.z1 + A.z2) / 2;
  const tint = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: A.color, transparent: true, opacity: .07, depthWrite: false }));
  tint.rotation.x = -Math.PI / 2; tint.position.set(cx, .02, cz); scene.add(tint);
  for (const [bw, bd, bx, bz] of [[w, .15, cx, A.z1], [w, .15, cx, A.z2], [.15, d, A.x1, cz], [.15, d, A.x2, cz]]) box(bw, .02, bd, M.yellow, bx, .02, bz, scene, { cast: false });
  const el = document.createElement('div'); el.className = 'area'; el.textContent = A.name;
  const o = new CSS2DObject(el); o.position.set(cx, .05, A.z2 - 1.2); scene.add(o);
}

/* ------------------------------------------------------------ machine builders (each returns a Group registered as an asset) */
const assetGroups = new Map();
function asset(id, group) { group.userData.asset = id; assetGroups.set(id, group); scene.add(group); return group; }

function conveyorMesh(a, b, width, parent) {
  // belt from a to b (world points on the belt surface); returns texture so it can run
  const dir = b.clone().sub(a), L = dir.length(), horiz = Math.hypot(dir.x, dir.z);
  const g = new THREE.Group(); g.position.copy(a.clone().add(b).multiplyScalar(.5));
  g.rotation.order = 'YZX'; g.rotation.y = Math.atan2(-dir.z, dir.x); g.rotation.z = Math.atan2(dir.y, horiz);
  parent.add(g);
  const tex = beltTex(); tex.repeat.set(L / 2.5, 1);
  box(L, .08, width, std(0xffffff, .8, 0, { map: tex }), 0, 0, 0, g);
  for (const s of [-1, 1]) box(L, .38, .1, M.steel, 0, -.18, s * (width / 2 + .1), g);
  for (let x = -L / 2 + .6; x < L / 2; x += 1.4) cyl(.07, width, M.steelDark, x, -.08, 0, g, { rx: Math.PI / 2, cast: false });
  cyl(.28, width + .1, M.steelDark, L / 2, -.12, 0, g, { rx: Math.PI / 2 }); cyl(.24, width + .1, M.steelDark, -L / 2, -.12, 0, g, { rx: Math.PI / 2 });
  // walkway + handrail on one side
  box(L, .05, .8, M.steelDark, 0, -.38, width / 2 + .6, g, { cast: false });
  railing(-L / 2, width / 2 + 1, L / 2, width / 2 + 1, -.38, g);
  // legs down to the floor, placed in world space
  for (let t = .08; t <= .95; t += Math.max(.12, 3.5 / L)) {
    const p = a.clone().lerp(b, t);
    if (p.y < 1.2) continue;
    for (const s of [-1, 1]) {
      const off = new THREE.Vector3(0, 0, s * (width / 2 + .1)).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y);
      box(.14, p.y - .3, .14, M.struct, p.x + off.x, (p.y - .3) / 2, p.z + off.z, parent);
    }
  }
  return { tex, group: g, L };
}

function jawCrusher(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  box(4.4, 1.4, 4, M.concrete, 0, .7, 0, g);
  box(2.8, 2.4, 2.6, M.machine, 0, 2.6, 0, g);
  box(2.9, .3, 2.7, M.steelDark, 0, 3.9, 0, g);
  const fw = [];
  for (const s of [-1, 1]) fw.push(cyl(1.25, .28, M.steelDark, -.2, 2.6, s * 1.55, g, { rx: Math.PI / 2 }));
  // feed hopper (inverted pyramid) with ore
  const hop = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.2, 2, 4, 1, true), std(0x4b5258, .6, .4, { side: THREE.DoubleSide }));
  hop.rotation.y = Math.PI / 4; hop.position.set(0, 5.1, 0); hop.castShadow = true; g.add(hop);
  const pile = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.2, 9), M.ore); pile.position.set(0, 5.6, 0); g.add(pile);
  for (let i = 0; i < 4; i++) box(.18, 4.3, .18, M.struct, (i % 2 ? 1 : -1) * 1.7, 2.15 + 2, (i < 2 ? 1 : -1) * 1.7, g);
  cyl(.5, 1.2, M.machine2, 2.5, 2.2, 1.2, g, { rz: Math.PI / 2 });
  anim.push((dt) => { if (BY_ID['JC-101'].status === 'ok') fw.forEach(f => f.rotation.y += dt * 3); });
  return asset('JC-101', g);
}
function screen(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const deck = new THREE.Group(); deck.position.set(0, 2.6, 0); deck.rotation.z = -.2; g.add(deck);
  box(5.4, .5, 2.4, M.machine2, 0, 0, 0, deck);
  for (let i = 0; i < 3; i++) box(5.2, .05, 2.2, std(0x30363b, .7, .4), 0, .3 + i * .02, 0, deck, { cast: false });
  for (let i = 0; i < 26; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(.12 + Math.random() * .12), M.ore); r.position.set(-2.4 + Math.random() * 4.8, .4, -1 + Math.random() * 2); deck.add(r); }
  for (const s of [-1, 1]) box(5.4, 1, .12, M.machine2, 0, .45, s * 1.25, deck);
  for (const [lx, lh] of [[-2.2, 3.1], [2.2, 1.6]]) for (const s of [-1, 1]) { box(.25, lh, .25, M.struct, lx, lh / 2, s * 1.3, g); cyl(.15, .5, M.orange, lx, lh + .1, s * 1.3, g); }
  box(1, .7, .7, M.machine, -2.8, 3.4, 1.8, g);
  anim.push((dt, t) => { deck.position.y = 2.6 + (BY_ID['VS-102'].status === 'ok' ? Math.sin(t * 40) * .02 : 0); });
  return asset('VS-102', g);
}
function coneCrusher(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  box(4, 1.6, 4, M.concrete, 0, .8, 0, g);
  cyl(1.45, 1.6, M.machine, 0, 2.4, 0, g);
  cyl(1.6, .3, M.orange, 0, 3.3, 0, g);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.2, 24), M.machine2); top.position.set(0, 4, 0); top.castShadow = true; g.add(top);
  cyl(.9, .9, M.steelDark, 0, 4.9, 0, g);
  box(1.6, 1, 1, M.machine2, 2.6, 2, 0, g); box(1.6, .4, .3, M.orange, 1.6, 2.2, .7, g);
  for (const [px, pz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) box(.15, .9, .15, M.yellow, px, 2.05, pz, g, { cast: false });
  return asset('CC-103', g);
}
function motor(x, y, z, ry) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
  box(2.6, .2, 1.6, M.steelDark, 0, y - .1, 0, g);
  for (const [px, pz] of [[-1.1, -.6], [1.1, -.6], [-1.1, .6], [1.1, .6]]) box(.14, y - .2, .14, M.struct, px, (y - .2) / 2, pz, g);
  cyl(.42, 1.1, std(0x2c5d8f, .45, .4), -.5, y + .45, 0, g, { rz: Math.PI / 2 });
  for (let i = 0; i < 6; i++) box(1, .04, .9, std(0x244c75, .5, .4), -.5, y + .45, 0, g, { rx: i * Math.PI / 6, cast: false });
  box(.8, .8, .8, M.machine2, .55, y + .45, 0, g);
  box(.5, .4, .5, M.orange, 1.1, y + .45, 0, g);
  // red beacon for the open incident
  const pole = cyl(.04, 1, M.dark, -.5, y + 1.4, .55, g, { cast: false });
  const bulb = new THREE.Mesh(G.sph, M.beacon); bulb.scale.setScalar(.32); bulb.position.set(-.5, y + 2, .55); g.add(bulb);
  const light = new THREE.PointLight(0xff3020, 6, 9, 1.6); light.position.copy(bulb.position); g.add(light);
  const alarm = BY_ID['MTR-104']?.status === 'down';
  if (!alarm) { bulb.visible = false; light.intensity = 0; }
  else anim.push((dt, t) => { const k = .5 + .5 * Math.sin(t * 6); M.beacon.emissiveIntensity = .6 + k * 2.4; light.intensity = 2 + k * 9; });
  return asset('MTR-104', g);
}
function eHouse(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  box(7.4, .4, 3.2, M.concrete, 0, .2, 0, g);
  box(7, 3, 2.9, M.white, 0, 1.9, 0, g);
  box(7.2, .15, 3.1, std(0xc4c9cc, .6, .3), 0, 3.45, 0, g);
  box(1, 2.1, .06, std(0x8a9399, .5, .4), -2.2, 1.45, 1.47, g);
  box(1.2, .9, .6, std(0xd2d6d8, .6, .2), 1.2, 1.6, 1.75, g); box(1.2, .9, .6, std(0xd2d6d8, .6, .2), 2.7, 1.6, 1.75, g);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .75), std(0xffffff, .6, 0, { map: signTex('MCC-03', '480 V · LINE 2') })); sign.position.set(.2, 2.8, 1.46); g.add(sign);
  const lamp = new THREE.Mesh(G.sph, M.amberLight); lamp.scale.setScalar(.25); lamp.position.set(-3.2, 3.7, 1.2); g.add(lamp);
  if (BY_ID['MCC-03']?.status !== 'ok') anim.push((dt, t) => { M.amberLight.emissiveIntensity = Math.sin(t * 4) > 0 ? 2 : .2; });
  else M.amberLight.emissiveIntensity = 0;
  return asset('MCC-03', g);
}
function ballMill(id, x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const spin = new THREE.Group(); spin.position.set(0, 3.4, 0); g.add(spin);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 6.4, 48), M.mill); shell.rotation.z = Math.PI / 2; shell.castShadow = shell.receiveShadow = true; spin.add(shell);
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1, 1, 48), M.mill); head.rotation.z = s * -Math.PI / 2; head.position.x = s * 3.7; head.castShadow = true; spin.add(head);
    cyl(.85, 1.2, M.steel, s * 4.6, 0, 0, spin, { rz: Math.PI / 2 });
    box(1.6, 3, 2.4, M.concrete, s * 4.7, 1.2, 0, g);
  }
  for (const xx of [-2.2, -.7, .8, 2.3]) { const band = new THREE.Mesh(new THREE.TorusGeometry(2.42, .05, 6, 48), M.steelDark); band.rotation.y = Math.PI / 2; band.position.x = xx; spin.add(band); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.75, .18, 8, 64), M.steelDark); ring.rotation.y = Math.PI / 2; ring.position.x = 2.9; spin.add(ring);
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, .7, 40, 1, true, 0, Math.PI), std(0xe0601a, .5, .1, { side: THREE.DoubleSide }));
  guard.rotation.z = Math.PI / 2; guard.rotation.x = Math.PI / 2; guard.position.set(2.9, 3.4, 0); guard.castShadow = true; g.add(guard);
  box(2.2, 1.4, 1.6, M.machine2, 3.2, .9, 3.6, g); cyl(.6, 2, std(0x2c5d8f, .45, .4), 5.2, .95, 3.6, g, { rz: Math.PI / 2 });
  box(10.5, .1, 1, M.steelDark, 0, .05, -3.2, g, { cast: false });
  anim.push((dt) => { spin.rotation.x += dt * .5; });
  return asset(id, g);
}
function cyclones(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const py = 6.2;
  box(5, .2, 5, M.steelDark, 0, py, 0, g);
  for (const [px, pz] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]) box(.25, py, .25, M.struct, px, py / 2, pz, g);
  railing(-2.5, -2.5, 2.5, -2.5, py, g); railing(-2.5, 2.5, 2.5, 2.5, py, g); railing(-2.5, -2.5, -2.5, 2.5, py, g);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, cx = Math.cos(a) * 1.3, cz = Math.sin(a) * 1.3;
    cyl(.38, .9, M.pipe, cx, py + .55, cz, g);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.38, 1.8, 18), M.pipe); cone.rotation.x = Math.PI; cone.position.set(cx, py - .9, cz); cone.castShadow = true; g.add(cone);
    pipe([[cx, py + 1, cz], [cx * .3, py + 1.8, cz * .3]], .1, M.pipe, g); }
  cyl(.5, 1.2, M.steelDark, 0, py + 2.1, 0, g);
  // stairs
  for (let i = 0; i < 14; i++) box(1, .08, .35, M.steelDark, 3.4, .4 + i * .43, 2 - i * .32, g, { cast: false });
  return asset('CY-203', g);
}
function pump(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  box(3, .35, 1.3, M.concrete, 0, .17, 0, g);
  box(2.8, .12, 1.1, M.steelDark, 0, .41, 0, g);
  cyl(.6, .45, M.machine, -.9, 1.1, 0, g, { rx: Math.PI / 2 });
  cyl(.42, 1.2, std(0x2c5d8f, .45, .4), .6, .95, 0, g, { rz: Math.PI / 2 });
  box(.5, .55, .6, M.orange, -.25, .95, 0, g);
  pipe([[-.9, 1.7, 0], [-.9, 3.2, 0], [3, 3.2, 0]], .2, M.pipe, g);
  pipe([[-1.6, 1.1, 0], [-3, 1.1, 0]], .22, M.pipe, g);
  return asset('P-302', g);
}
function valve(x, y, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  box(.7, .7, .7, M.red, 0, y, 0, g);
  cyl(.06, .8, M.steel, 0, y + .7, 0, g, { cast: false });
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(.4, .05, 6, 24), M.red); wheel.rotation.x = Math.PI / 2; wheel.position.y = y + 1.1; g.add(wheel);
  box(.7, y - .35, .5, M.struct, 0, (y - .35) / 2, 0, g);
  return asset('FV-221', g);
}
function thickener(id, x, z, r) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const base = 1.4, h = 2.4;
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; box(.3, base, .3, M.struct, Math.cos(a) * (r - .4), base / 2, Math.sin(a) * (r - .4), g); }
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 64, 1, true), std(0x9aa1a6, .5, .5, { side: THREE.DoubleSide })); wall.position.y = base + h / 2; wall.castShadow = wall.receiveShadow = true; g.add(wall);
  const bottom = new THREE.Mesh(new THREE.ConeGeometry(r, 1.2, 64, 1, true), std(0x7d858b, .5, .5, { side: THREE.DoubleSide })); bottom.rotation.x = Math.PI; bottom.position.y = base - .1; g.add(bottom);
  const surf = new THREE.Mesh(new THREE.CircleGeometry(r - .05, 64), M.slurry); surf.rotation.x = -Math.PI / 2; surf.position.y = base + h - .35; surf.receiveShadow = true; g.add(surf);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(r, .12, 8, 64), M.steel); lip.rotation.x = Math.PI / 2; lip.position.y = base + h; g.add(lip);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(r + .05, .04, 6, 64), M.yellow); rail.rotation.x = Math.PI / 2; rail.position.y = base + h + 1; g.add(rail);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; box(.04, 1, .04, M.yellow, Math.cos(a) * (r + .05), base + h + .5, Math.sin(a) * (r + .05), g, { cast: false }); }
  // bridge to the centre drive
  box(r + 1.5, .25, 1.1, M.steelDark, -(r + 1.5) / 2 + .3, base + h + .35, 0, g);
  railing(-r - 1.2, -.55, 0, -.55, base + h + .45, g); railing(-r - 1.2, .55, 0, .55, base + h + .45, g);
  cyl(.7, 1.1, M.machine, 0, base + h + .8, 0, g);
  const rake = new THREE.Group(); rake.position.y = base + h - .25; g.add(rake);
  for (let i = 0; i < 4; i++) { const arm = box(r - .4, .14, .3, M.steelDark, (r - .4) / 2, 0, 0, rake, { cast: false }); const p = new THREE.Group(); p.rotation.y = i * Math.PI / 2; p.add(arm); rake.add(p);
    for (let k = 1; k < 7; k++) box(.05, .3, .5, M.steelDark, k * (r - .6) / 7, -.1, 0, p, { cast: false, ry: .6 }); }
  anim.push((dt) => { rake.rotation.y += dt * .12; });
  for (let i = 0; i < 16; i++) box(1.1, .08, .38, M.steelDark, -r - 1.1, .3 + i * .27, -3.6 + i * .25, g, { cast: false });
  return asset(id, g);
}

/* ------------------------------------------------------------ lay out the plant (flow runs left to right) */
const jc = jawCrusher(-27, -10);
const vs = screen(-19.5, -10);
coneCrusher(-27, 1);
conveyorMesh(new THREE.Vector3(-24.6, 2.2, -10), new THREE.Vector3(-21.8, 3.3, -10), 1.2, scene);           // jaw crusher → screen
conveyorMesh(new THREE.Vector3(-24.5, 4.6, 1), new THREE.Vector3(-17.5, 2.2, -7.2), 1, scene);   // cone crusher recirculation

// CV-104: screen undersize → ball mill 1 feed. The asset group holds the belt so it is clickable.
const cvGroup = new THREE.Group(); asset('CV-104', cvGroup);
const cv = conveyorMesh(new THREE.Vector3(-16.6, 1.6, -10), new THREE.Vector3(-4.4, 6.4, -10), 1.2, cvGroup);
box(1.2, 2.6, 1.2, std(0x4b5258, .6, .4), -3.8, 5.3, -10, cvGroup);   // discharge chute into the mill
box(.8, .8, 1.2, std(0x4b5258, .6, .4), -2.9, 4, -10, cvGroup, { rz: -.6 });
const ore104 = [];
for (let i = 0; i < 26; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(.1 + Math.random() * .1), M.oreLight); r.position.set((Math.random() - .5) * cv.L * .95, .12, (Math.random() - .5) * .8); cv.group.add(r); ore104.push(r); }

motor(-5.4, 6.6, -12.6, 0);
eHouse(-12, 4);
// cable tray from MCC-03 up to the CV-104 drive
pipe([[-12, 3.6, 2.5], [-12, 8.5, 2.5], [-5.4, 8.5, 2.5], [-5.4, 8.5, -12.6], [-5.4, 7.2, -12.6]], .12, M.dark, scene);

ballMill('BM-201', 2.6, -10);
ballMill('BM-202', 2.6, 1.5);
cyclones(11, -10);
pump(11.5, 3);
valve(16.5, 2.4, -4.5);
thickener('TK-301', 24.5, -9, 5.2);
thickener('TK-302', 24.5, 3.5, 4.6);
// process piping between areas
pipe([[2.6, 1.2, -6.4], [8, 1.2, -6.4], [8, 6.6, -6.4], [11, 6.6, -8]], .22, M.pipe, scene);
pipe([[11, 8.3, -10], [16, 8.3, -10], [16, 2.4, -4.5]], .2, M.pipe, scene);
pipe([[16.5, 2.4, -4.5], [19.5, 2.4, -4.5], [19.5, 4.6, -9]], .2, M.pipe, scene);
pipe([[14.5, 3.2, 3], [18, 3.2, 3], [18, 5.2, 3.5]], .2, M.pipe, scene);
pipe([[2.6, 1, 4.9], [2.6, 1, 7.2], [9.5, 1, 7.2], [9.5, 1.1, 3]], .2, M.pipe, scene);
for (const x of [-30, -22, -14, -6, 6, 14, 22, 30]) box(1.2, 1.5, 1.2, M.ore, x, .75, -17, scene);  // stockpiled ore bins along the back wall

// walkways with yellow handrails between machines
box(26, .12, 1.4, M.steelDark, -15, 6.3, -13.2, scene); railing(-28, -12.5, -2, -12.5, 6.3, scene); railing(-28, -13.9, -2, -13.9, 6.3, scene);
for (const x of [-26, -18, -10]) box(.2, 6.3, .2, M.struct, x, 3.15, -13.2, scene);

/* ------------------------------------------------------------ people and forklifts */
const people = [];
function worker(path, speed, helmet = M.helmet) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.22, .75, 4, 10), M.vest); body.position.y = .8; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(G.sph, M.skin); head.scale.setScalar(.3); head.position.y = 1.5; g.add(head);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), helmet); hat.position.y = 1.56; g.add(hat);
  scene.add(g); people.push({ g, path: path.map(p => new THREE.Vector3(p[0], 0, p[1])), i: 0, speed, wait: 0 });
  g.position.copy(people[people.length - 1].path[0]);
}
worker([[-30, 13], [30, 13]], 1.3); worker([[25, 16], [-20, 16]], 1.1, M.helmetY); worker([[-8, 12], [-8, -6], [-16, -6]], 1);
worker([[6, 8], [6, -4], [12, -4], [12, 8]], .9); worker([[20, 10], [20, -2], [30, -2]], 1.1, M.helmetY); worker([[-30, 7], [-20, 7], [-20, -4]], 1);
// two people at the CV-104 drive (stationary): shift supervisor and electrician
for (const [x, z, h] of [[-6.4, -14.6, M.helmet], [-4.6, -14.8, M.helmetY]]) { worker([[x, z], [x, z]], 0, h); people[people.length - 1].g.position.y = 6.36; people[people.length - 1].g.lookAt(-5.4, 6.36, -12.6); }

const forks = [];
function forklift(z, x0, speed) {
  const g = new THREE.Group();
  box(1.3, .9, 2.1, M.orange, 0, .75, 0, g);
  box(1.2, .1, 1.3, M.dark, 0, 2.2, -.2, g);
  for (const [px, pz] of [[-.55, .4], [.55, .4], [-.55, -.8], [.55, -.8]]) box(.06, 1.1, .06, M.dark, px, 1.65, pz, g, { cast: false });
  box(.12, 2.4, .12, M.dark, -.4, 1.4, 1.15, g); box(.12, 2.4, .12, M.dark, .4, 1.4, 1.15, g);
  box(.15, .06, 1.1, M.steel, -.3, .25, 1.7, g); box(.15, .06, 1.1, M.steel, .3, .25, 1.7, g);
  box(1, .7, 1, std(0x8a6a44, .9, 0), 0, .63, 1.7, g);
  for (const [px, pz] of [[-.65, .6], [.65, .6], [-.65, -.6], [.65, -.6]]) cyl(.28, .22, M.dark, px, .28, pz, g, { rz: Math.PI / 2 });
  scene.add(g); forks.push({ g, z, x: x0, dir: 1, speed });
}
forklift(13, -20, 3.2); forklift(16, 18, 2.6); forklift(13, 6, 2.2);

/* ------------------------------------------------------------ asset labels, materials per asset (for hover glow) */
const pickables = [];
const labels = new Map();
for (const [id, g] of assetGroups) {
  g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.userData.asset = id; pickables.push(o); } });
  const a = BY_ID[id];
  const bb = new THREE.Box3().setFromObject(g), c = bb.getCenter(new THREE.Vector3());
  g.userData.center = c; g.userData.size = bb.getSize(new THREE.Vector3()).length();
  const el = document.createElement('div'); el.className = 'lbl ' + (a.status === 'down' ? 'down' : a.status === 'warn' ? 'warn' : '');
  el.innerHTML = `${a.id}<small>${a.status === 'down' ? 'DOWN · OPEN INCIDENT' : a.name}</small>`;
  el.addEventListener('pointerenter', () => hover(id)); el.addEventListener('pointerleave', () => hover(null));
  el.addEventListener('click', e => { e.stopPropagation(); openAsset(id); });
  const o = new CSS2DObject(el); o.position.set(c.x, bb.max.y + .8, c.z); scene.add(o); labels.set(id, el);
}
// CV-104 belt glows red while down
const cvMats = []; cvGroup.traverse(o => { if (o.isMesh) cvMats.push(o.material); });
if (BY_ID['CV-104']?.status === 'down') anim.push((dt, t) => { const k = .35 + .35 * Math.sin(t * 5); for (const m of cvMats) { if (hovered === 'CV-104') continue; m.emissive.setRGB(k * .55, k * .05, 0); } });
// every asset that is down (real open incident) gets a pulsing safety-orange ring + light column on the floor
const ringGeo = new THREE.RingGeometry(.86, 1, 64), discGeo = new THREE.CircleGeometry(1, 64);
for (const [id, g] of assetGroups) {
  const isDown = BY_ID[id]?.status === 'down';
  if (!isDown && !(EMBED && id === FOCUS)) continue;   // embed: the focused asset always gets a ring (blue when healthy)
  const hot = isDown ? 0xff7a1a : 0x4da3ff, hot2 = isDown ? 0xff5a5a : 0x4da3ff;
  const c = g.userData.center, r = Math.max(3, Math.min(9, g.userData.size * .45));
  const mk = (geo, color, op) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.rotation.x = -Math.PI / 2; m.position.set(c.x, .06, c.z); m.scale.setScalar(r); m.renderOrder = 2; m.userData.keepFor = id; scene.add(m); return m; };
  const disc = mk(discGeo, isDown ? 0xff5a1a : 0x4da3ff, .16), ring = mk(ringGeo, hot, .9), wave = mk(ringGeo, hot2, .6);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(r * .92, r * .92, 14, 48, 1, true), new THREE.MeshBasicMaterial({ color: hot, transparent: true, opacity: .07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.set(c.x, 7, c.z); beam.userData.keepFor = id; beam.visible = !EMBED; scene.add(beam);
  const glowL = new THREE.PointLight(isDown ? 0xff6a1a : 0x4da3ff, 18, r * 3.2, 1.8); glowL.position.set(c.x, 2.5, c.z); scene.add(glowL);
  if (isDown && EMBED && id === FOCUS) {   // fault pulse on the hero object (orange/red emissive)
    const mats = []; g.traverse(o => { if (o.isMesh && o.material.emissive) mats.push(o.material); });
    anim.push((dt, t) => { const k = .2 + .2 * Math.sin(t * 4); for (const m of mats) if (m !== M.beacon) m.emissive.setRGB(k * .55, k * .08, 0); });
  }
  anim.push((dt, t) => {
    const k = .5 + .5 * Math.sin(t * 4);
    ring.material.opacity = .55 + .4 * k; disc.material.opacity = .08 + .12 * k; beam.material.opacity = .04 + .06 * k; glowL.intensity = 10 + 16 * k;
    const u = (t * .6) % 1; wave.scale.setScalar(r * (1 + u * .9)); wave.material.opacity = .7 * (1 - u);
  });
}

/* ------------------------------------------------------------ asset list panel */
const panel = $('#panel');
let html = '';
for (const area of ['Crushing Line 2', 'Grinding', 'Wash plant']) {
  html += `<h3>${area}</h3>`;
  for (const a of ASSETS.filter(x => x.area === area))
    html += `<button class="asset" data-id="${a.id}"><span class="d ${a.status}"></span><span class="id">${a.id}</span><span class="n">${a.name}</span></button>`;
}
panel.innerHTML = html + '<p class="fiix">CV-104, MTR-104, MCC-03, P-302 and FV-221 are the Fiix seed assets. The rest are example equipment.</p>';
panel.querySelectorAll('.asset').forEach(b => {
  b.addEventListener('pointerenter', () => hover(b.dataset.id)); b.addEventListener('pointerleave', () => hover(null));
  b.addEventListener('click', () => openAsset(b.dataset.id));
});

/* ------------------------------------------------------------ hover, picking, tooltip */
let hovered = null;
const tip = $('#tip');
function glow(id, on) {
  const g = assetGroups.get(id); if (!g) return;
  g.traverse(o => { if (o.isMesh && o.material.emissive && o.material !== M.beacon) o.material.emissive.setRGB(on ? .35 : 0, on ? .22 : 0, 0); });
}
function hover(id) {
  if (hovered === id) return;
  if (hovered) { glow(hovered, false); labels.get(hovered)?.classList.remove('hov'); panel.querySelector(`[data-id="${hovered}"]`)?.classList.remove('hov'); }
  hovered = id;
  if (id) { glow(id, true); labels.get(id)?.classList.add('hov'); panel.querySelector(`[data-id="${id}"]`)?.classList.add('hov'); }
  renderer.domElement.style.cursor = id ? 'pointer' : '';
  if (!id) tip.style.display = 'none';
}
function showTip(id, x, y) {
  const a = BY_ID[id];
  tip.innerHTML = `<b>${a.id} · ${a.name}</b><span>${a.area} · ${a.note}</span><br><span>${a.last}</span><em>Click to open in control room</em>`;
  tip.style.display = 'block';
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(x + 16, innerWidth - w - 8) + 'px'; tip.style.top = Math.min(y + 16, innerHeight - h - 8) + 'px';
}
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  return hit ? hit.object.userData.asset : null;
}
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
renderer.domElement.addEventListener('pointermove', e => {
  if (EMBED || e.buttons || flight) return;
  const id = pick(e); hover(id); if (id) showTip(id, e.clientX, e.clientY);
});
renderer.domElement.addEventListener('pointerleave', () => hover(null));
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 500) return;
  const id = pick(e); if (id) openAsset(id);
});

/* ------------------------------------------------------------ camera flights */
let flight = null;
const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
function flyTo(pos, target, dur, done) {
  controls.autoRotate = false;
  flight = { fp: camera.position.clone(), ft: controls.target.clone(), pos, target, dur, t: 0, done };
}
// gentle auto-orbit after the intro, until the first user interaction
let touched = false;
controls.addEventListener('start', () => { touched = true; controls.autoRotate = false; if (flight && !flight.locked) flight = null; });
function viewOf(id, k = 1) {
  const g = assetGroups.get(id), c = g.userData.center, s = Math.max(6, g.userData.size) * k;
  return { pos: c.clone().add(new THREE.Vector3(s * .55, s * .45, s * .75)), target: c.clone() };
}
const stage = $('#stage'), fade = $('#fade');
function openAsset(id) {
  if (EMBED) return;   // embed (iframe): never navigate
  if (flight && flight.locked) return;
  hover(null);
  const v = viewOf(id);
  stage.textContent = `Opening ${id}…`; stage.classList.add('on');
  flyTo(v.pos, v.target, 1.3, () => {
    // fade canvas + HUD out (~350ms) before routing, so the view doesn't just vanish
    root.classList.add('leaving'); fade.classList.add('on');
    setTimeout(() => opts.onOpen(id), 350);
  });
  flight.locked = true;
}
function showAsset(id) { if (!assetGroups.has(id)) return; const v = viewOf(id, EMBED ? .95 : 1); flyTo(v.pos, v.target, 1.4, EMBED && !reduce ? () => { controls.autoRotate = true; } : undefined); }
function home() { if (EMBED && assetGroups.has(FOCUS)) return showAsset(FOCUS); flyTo(HOME.pos.clone(), HOME.target.clone(), 1.4); }

$('#homeBtn').onclick = home;
$('#labelsBtn').onclick = () => { const on = root.classList.toggle('nolabels'); $('#labelsBtn').setAttribute('aria-pressed', String(!on)); };
$('#assetsBtn').onclick = () => root.classList.toggle('showlist');
const onKey = e => {
  if (e.key === 'Escape') home();
  if (e.key === 'l' || e.key === 'L') $('#labelsBtn').click();
};
addEventListener('keydown', onKey);

/* ------------------------------------------------------------ loop */
function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h); css.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
const clock = new THREE.Clock();
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (EMBED && assetGroups.has(FOCUS)) {
  // embed: one "levitating" hero object. Hide everything except the focused asset, its ring, lights, grid and dark ground.
  const fg = assetGroups.get(FOCUS), c = fg.userData.center, lift = .7;
  for (const o of [...scene.children]) { if (o === fg || o.isLight || o === grid || o === yard || o.userData.keepFor === FOCUS) continue; o.visible = false; }
  const pivot = new THREE.Group(); pivot.position.set(c.x, 0, c.z); scene.add(pivot); pivot.attach(fg);
  pivot.position.y = lift;
  anim.push((dt, t) => {   // slow bob (~0.2 u, 3 s period), yaw ~10 deg/s, slight sway
    pivot.position.y = lift + Math.sin(t * Math.PI * 2 / 3) * .2;
    pivot.rotation.y += dt * .1745;
    pivot.rotation.z = Math.sin(t * .8) * .025; pivot.rotation.x = Math.sin(t * .6 + 1) * .02;
  });
  const v = viewOf(FOCUS, 1.3); const up = new THREE.Vector3(0, lift, 0);
  camera.position.copy(v.pos.add(up)); controls.target.copy(v.target.add(up));
  controls.enabled = false; controls.autoRotate = false;   // camera fixed on the hero object
}
else if (reduce || EMBED) { camera.position.copy(HOME.pos); controls.target.copy(HOME.target); controls.autoRotate = EMBED && !reduce; }
else flyTo(HOME.pos.clone(), HOME.target.clone(), 3.2, () => { if (!touched) controls.autoRotate = true; });
renderer.setAnimationLoop(() => {
  const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
  if (!reduce) {
    for (const f of anim) f(dt, t);
    for (const p of people) {
      if (!p.speed) continue;
      const tgt = p.path[(p.i + 1) % p.path.length], d = tgt.clone().sub(p.g.position); d.y = 0;
      const dist = d.length();
      if (dist < .1) { p.i = (p.i + 1) % p.path.length; continue; }
      p.g.position.add(d.normalize().multiplyScalar(Math.min(dist, p.speed * dt)));
      p.g.lookAt(tgt.x, p.g.position.y, tgt.z); p.g.position.y = Math.abs(Math.sin(t * 8)) * .04;
    }
    for (const f of forks) {
      f.x += f.dir * f.speed * dt; if (Math.abs(f.x) > 29) { f.dir *= -1; f.x = Math.sign(f.x) * 29; }
      f.g.position.set(f.x, 0, f.z); f.g.rotation.y = f.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }
  if (flight) {
    flight.t += dt; const u = Math.min(1, flight.t / flight.dur), e = ease(u);
    camera.position.lerpVectors(flight.fp, flight.pos, e); controls.target.lerpVectors(flight.ft, flight.target, e);
    if (u >= 1) { const done = flight.done; flight = null; done && done(); }
  }
  controls.update();
  renderer.render(scene, camera); css.render(scene, camera);
});
return {
  show: id => showAsset(id),
  open: id => openAsset(id),
  dispose() {
    renderer.setAnimationLoop(null);
    removeEventListener('resize', resize); removeEventListener('keydown', onKey);
    controls.dispose(); renderer.dispose();
    host.innerHTML = '';
  },
};
}
