// @ts-nocheck
// Interior FLOOR set dressing for the 3D hall: floor markings, pallets, drums, racks, forklift, cones (wall/ceiling items live in props-walls.ts). Decoration only, no interaction.
// dims = { HX, HZ, HH }: hall half-width (x), half-depth (z), height. Back wall at z = -HZ, left wall at x = -HX.
export function addInteriorProps(THREE, scene, dims) {
  const { HX, HZ, HH } = dims;
  const root = new THREE.Group(); root.name = 'interior-props'; scene.add(root);
  const BZ = -HZ - .2;   // inner face of the back wall
  const LX = -HX - .2;   // inner face of the left wall

  /* ---------------- shared geometry + materials */
  const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 18), SPH = new THREE.SphereGeometry(1, 12, 8);
  const mcache = new Map();
  const mat = (color, rough = .7, metal = .1, extra = {}) => {
    const k = color + '|' + rough + '|' + metal + '|' + JSON.stringify(Object.keys(extra));
    if (!extra.map && mcache.has(k)) return mcache.get(k);
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
    if (!extra.map) mcache.set(k, m); return m;
  };
  const C = { steel: 0x9aa4ae, steelD: 0x6f7a86, dark: 0x3a4048, yellow: 0xf2b705, red: 0xd33a3a, blue: 0x1f6fd1, galv: 0xb8c0c8, wood: 0xb08a5a, card: 0xc49a6c, black: 0x1c1f23, white: 0xf4f6f8, orange: 0xe8650f, green: 0x11905a };

  function box(w, h, d, color, x, y, z, parent = root, o = {}) {
    const m = new THREE.Mesh(BOX, typeof color === 'number' ? mat(color, o.rough ?? .7, o.metal ?? .1) : color);
    m.scale.set(w, h, d); m.position.set(x, y, z); if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
    m.castShadow = o.cast !== false; m.receiveShadow = true; parent.add(m); return m;
  }
  // axis: 'y' (default), 'x' or 'z'
  function cyl(r, len, color, x, y, z, parent = root, o = {}) {
    const m = new THREE.Mesh(CYL, typeof color === 'number' ? mat(color, o.rough ?? .5, o.metal ?? .3) : color);
    m.scale.set(r, len, r); m.position.set(x, y, z);
    if (o.axis === 'x') m.rotation.z = Math.PI / 2; else if (o.axis === 'z') m.rotation.x = Math.PI / 2;
    m.castShadow = o.cast !== false; m.receiveShadow = true; parent.add(m); return m;
  }
  function inst(geo, material, items, o = {}) {   // items: [x,y,z,sx,sy,sz,rx,ry,rz,color?]
    const im = new THREE.InstancedMesh(geo, material, items.length), d = new THREE.Object3D(), col = new THREE.Color();
    items.forEach((it, i) => {
      d.position.set(it[0], it[1], it[2]); d.scale.set(it[3] ?? 1, it[4] ?? 1, it[5] ?? 1); d.rotation.set(it[6] || 0, it[7] || 0, it[8] || 0);
      d.updateMatrix(); im.setMatrixAt(i, d.matrix); if (it[9] != null) im.setColorAt(i, col.set(it[9]));
    });
    im.castShadow = o.cast !== false; im.receiveShadow = true; root.add(im); return im;
  }
  function canvasTex(W, H, draw, repeat) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; draw(cv.getContext('2d'), W, H);
    const t = new THREE.CanvasTexture(cv); if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  const FONT = '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif';
  function signTex(lines, bg, fg, opts = {}) {
    const W = opts.W || 512, H = opts.H || 360;
    return canvasTex(W, H, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.strokeStyle = opts.border || fg; g.lineWidth = W * .03; g.strokeRect(W * .03, W * .03, W - W * .06, H - W * .06);
      if (opts.band) { g.fillStyle = opts.band; g.fillRect(W * .03, W * .03, W - W * .06, H * .28); }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const n = lines.length;
      lines.forEach((ln, i) => {
        const size = (ln.size || 1) * H * (n > 2 ? .17 : .22);
        g.font = `700 ${size}px ${FONT}`; g.fillStyle = ln.color || fg;
        g.fillText(ln.t, W / 2, H * ((i + .5) / n * (opts.band ? .72 : .86) + (opts.band ? .28 : .07)), W * .88);
      });
    });
  }
  // a flat sign on a wall; wall: 'back' (faces +z) or 'left' (faces +x); u = x on back wall, z on left wall
  function plaque(tex, w, h, wall, u, y, parent = root, off = .03) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(0xffffff, .6, 0, { map: tex }));
    if (wall === 'back') m.position.set(u, y, BZ + off); else { m.position.set(LX + off, y, u); m.rotation.y = Math.PI / 2; }
    m.receiveShadow = true; parent.add(m); return m;
  }
  function floorPlane(w, d, x, z, material, y = .032) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; m.renderOrder = 1; root.add(m); return m;
  }
  const floorMat = (o) => new THREE.MeshStandardMaterial({ roughness: .85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false, transparent: true, ...o });
  const hatchCanvas = (g, W, H) => { g.fillStyle = '#1c1f23'; g.fillRect(0, 0, W, H); g.fillStyle = '#F2B705';
    for (let k = -W; k < W * 2; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 32, 0); g.lineTo(k + 32 - H, H); g.lineTo(k - H, H); g.closePath(); g.fill(); } };
  const hatch = (w, d, x, z) => floorPlane(w, d, x, z, floorMat({ map: canvasTex(128, 128, hatchCanvas, [w / 1.1, d / 1.1]) }));

  /* ---------------- floor markings: hatched keep-clear zones, forklift bay, pedestrian crossing, front walkway */
  hatch(6.2, 1.8, 26, -20.2);   // in front of the roller door
  const yellowLine = floorMat({ color: C.yellow, roughness: .7, transparent: false, depthWrite: true });
  for (const [w, d, x, z] of [[1.9, .1, -32.95, -5.85], [1.9, .1, -32.95, -.15], [.1, 5.8, -32.05, -3]]) floorPlane(w, d, x, z, yellowLine);
  floorPlane(66, .14, 0, 18.4, yellowLine); floorPlane(66, .14, 0, 20.6, yellowLine);
  const crossTex = canvasTex(128, 512, (g, W, H) => { g.clearRect(0, 0, W, H); g.fillStyle = '#F2B705'; for (let i = 0; i < 6; i++) g.fillRect(0, 18 + i * 84 + (i > 2 ? 20 : 0), W, 42); });
  floorPlane(2.0, 5.8, -9, 14.5, floorMat({ map: crossTex, alphaTest: .1 }));

  /* ---------------- pallets: boxed goods and sacks */
  const woodM = mat(C.wood, .9, 0), cardM = mat(C.card, .85, 0), sackM = mat(0xe4dccb, .95, 0);
  const pallet = (x, z, kind, ry = 0) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    box(1.2, .14, 1.0, woodM, 0, .07, 0, g);
    if (kind === 'boxes') { box(1.1, .55, .95, cardM, 0, .43, 0, g); box(.52, .5, .9, cardM, -.27, .96, 0, g); box(.52, .42, .9, mat(0xb98d60, .85, 0), .28, .92, 0, g); }
    else { let i = 0; for (let ly = 0; ly < 3; ly++) for (const [sx, sz] of [[-.28, -.25], [.28, -.25], [0, .25]]) {
      const s = new THREE.Mesh(SPH, sackM); s.scale.set(.32, .13, .24); s.position.set(sx + (ly % 2 ? .05 : 0), .26 + ly * .23, sz); s.rotation.y = (i++ % 2) * .3; s.castShadow = s.receiveShadow = true; g.add(s); } }
  };
  pallet(-11.0, -19.8, 'boxes'); pallet(-13.6, -19.8, 'sacks', .08); pallet(-31.8, -19.8, 'boxes', -.05); pallet(-32.6, 19.6, 'sacks', 1.57);

  /* ---------------- oil drums in a spill tray (back right corner) */
  box(3.0, .16, 1.6, C.yellow, 31.7, .08, -19.9);
  box(2.9, .02, 1.5, mat(C.black, .9, 0), 31.7, .17, -19.9, root, { cast: false });
  const drumB = mat(C.blue, .45, .35), drumY = mat(C.yellow, .45, .35);
  for (const [dx, dz, m] of [[30.75, -20.3, drumB], [31.45, -20.3, drumB], [32.15, -20.3, drumY], [32.85, -20.3, drumB], [30.75, -19.55, drumY], [31.45, -19.55, drumB]])
    cyl(.3, .9, m, dx, .63, dz);

  /* ---------------- parts rack with coloured bins */
  const rack = mat(C.blue, .5, .4), shelfM = mat(C.steel, .5, .5);
  for (const [ux, uz] of [[-1.45, -.33], [1.45, -.33], [-1.45, .33], [1.45, .33]]) box(.06, 2.5, .06, rack, 19.4 + ux, 1.25, -20.25 + uz);
  const bins = [];
  for (const sy of [.3, .95, 1.6, 2.25]) {
    box(3.0, .05, .72, shelfM, 19.4, sy, -20.25, root, { cast: false });
    if (sy < 2.2) for (let i = 0; i < 5; i++) bins.push([18.2 + i * .6, sy + .17, -20.15, .45, .28, .5, 0, 0, 0, [C.blue, C.yellow, C.red, C.blue, 0x9aa4ae][(i + Math.round(sy * 3)) % 5]]);
  }
  inst(BOX, mat(0xffffff, .6, .05), bins);

  /* ---------------- red tool cabinet */
  const redM = mat(C.red, .4, .3);
  box(1.1, 1.0, .62, redM, 15.6, .55, BZ + .32); box(1.0, .5, .5, redM, 15.6, 1.32, BZ + .26);
  for (const y of [.35, .6, .85, 1.25]) box(.92, .025, .02, C.galv, 15.6, y, y > 1 ? BZ + .52 : BZ + .64, root, { cast: false });
  for (const dx of [-.42, .42]) cyl(.05, .05, C.black, 15.6 + dx, .03, BZ + .5, root, { cast: false });

  /* ---------------- parked forklift by the left wall (forks pointing +z) */
  const fk = new THREE.Group(); fk.position.set(-32.95, 0, -3.3); root.add(fk);
  const fY = mat(C.yellow, .45, .25), fD = mat(C.dark, .6, .4), tyre = mat(C.black, .9, 0);
  box(1.2, .6, 2.0, fY, 0, .6, 0, fk); box(1.2, .75, .45, fD, 0, .75, -1.0, fk);
  box(.5, .32, .5, mat(C.black, .8, 0), 0, 1.05, -.35, fk); box(.5, .55, .08, mat(C.black, .8, 0), 0, 1.35, -.6, fk);
  for (const [px, pz] of [[-.55, -.75], [.55, -.75], [-.55, .45], [.55, .45]]) box(.06, 1.3, .06, fD, px, 1.55, pz, fk);
  box(1.2, .06, 1.3, fD, 0, 2.22, -.15, fk);
  for (const [wx, wz, r] of [[-.62, -.65, .27], [.62, -.65, .27], [-.62, .62, .3], [.62, .62, .3]]) cyl(r, .24, tyre, wx, r, wz, fk, { axis: 'x' });
  for (const mx of [-.32, .32]) box(.1, 2.3, .1, fD, mx, 1.2, 1.08, fk);
  box(.74, .08, .1, fD, 0, 2.3, 1.08, fk); box(.9, .45, .06, fD, 0, .35, 1.16, fk);
  for (const fx of [-.26, .26]) box(.12, .05, 1.1, fD, fx, .06, 1.72, fk);
  cyl(.06, .08, mat(C.orange, .4, .1, { emissive: C.orange, emissiveIntensity: .4 }), 0, 2.29, -.6, fk, { cast: false });

  /* ---------------- traffic cones */
  const coneM = mat(C.orange, .55, 0), coneBase = mat(C.black, .9, 0), bandM = mat(C.white, .5, 0);
  const coneGeo = new THREE.ConeGeometry(.17, .58, 14);
  for (const [x, z] of [[24.2, -18.3], [27.8, -18.3], [-31.6, -.9], [-30.4, 19.1], [-29.3, 19.1]]) {
    box(.38, .04, .38, coneBase, x, .02, z, root, { cast: false });
    const c = new THREE.Mesh(coneGeo, coneM); c.position.set(x, .33, z); c.castShadow = true; root.add(c);
    cyl(.105, .08, bandM, x, .42, z, root, { cast: false });
  }

  /* ---------------- decor is never pickable: let clicks fall through to the machines */
  root.traverse((o) => { o.userData.decor = true; if (o.isMesh) o.raycast = () => {}; });
  return root;
}
