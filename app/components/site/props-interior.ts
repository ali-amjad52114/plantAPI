// @ts-nocheck
// Interior set dressing for the 3D hall: wall services, signage, floor markings, racks. Decoration only, no interaction.
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

  /* ---------------- pipe racks along back + left walls (blue water, yellow gas, grey air) */
  const PIPES = [{ y: 7.0, r: .13, c: C.blue }, { y: 7.45, r: .1, c: C.yellow }, { y: 7.95, r: .17, c: C.steel }];
  const PZ = -20.35, PX = -33.85, PZEND = 20.4;
  for (const p of PIPES) {
    const pm = mat(p.c, .4, .35);
    cyl(p.r, HX * 2 - .3, pm, .0 - .075, p.y, PZ, root, { axis: 'x' }).position.x = (PX + HX - .2) / 2;
    cyl(p.r, PZEND - PZ, pm, PX, p.y, (PZ + PZEND) / 2, root, { axis: 'z' });
    const elbow = new THREE.Mesh(SPH, pm); elbow.scale.setScalar(p.r * 1.05); elbow.position.set(PX, p.y, PZ); root.add(elbow);
  }
  const flanges = [], brackets = [];
  for (let x = -29.75; x < HX; x += 4.25) {
    for (const p of PIPES) flanges.push([x + 1.1, p.y, PZ, p.r * 1.45, .07, p.r * 1.45, 0, 0, Math.PI / 2]);
    brackets.push([x, 7.45, BZ + .06, .1, 1.5, .1]);
    for (const p of PIPES) brackets.push([x, p.y - p.r - .03, (BZ + PZ) / 2 + .1, .07, .06, .95]);
  }
  for (let z = -16.5; z < PZEND - 1; z += 4.25) {
    for (const p of PIPES) flanges.push([PX, p.y, z + 1.1, p.r * 1.45, .07, p.r * 1.45, Math.PI / 2, 0, 0]);
    brackets.push([LX + .06, 7.45, z, .1, 1.5, .1]);
    for (const p of PIPES) brackets.push([(LX + PX) / 2 + .1, p.y - p.r - .03, z, .95, .06, .07]);
  }
  inst(CYL, mat(C.steelD, .45, .5), flanges, { cast: false });
  inst(BOX, mat(C.dark, .6, .4), brackets, { cast: false });

  /* ---------------- cable trays (galvanised ladder tray with dark cable bundle) */
  const TY = 8.9, galv = mat(C.galv, .45, .6), cable = mat(C.black, .8, 0);
  box(HX * 2 - .4, .05, .55, galv, 0, TY, -20.3, root, { cast: false });
  box(HX * 2 - .4, .16, .04, galv, 0, TY + .08, -20.03, root, { cast: false });
  box(HX * 2 - .4, .09, .4, cable, 0, TY + .07, -20.3, root, { cast: false });
  box(.55, .05, 40, galv, -33.75, TY, -.5, root, { cast: false });
  box(.04, .16, 40, galv, -33.48, TY + .08, -.5, root, { cast: false });
  box(.4, .09, 40, cable, -33.75, TY + .07, -.5, root, { cast: false });

  /* ---------------- HVAC duct run high on the left wall, returning along the back wall */
  const duct = mat(0xc9ced4, .5, .45), grille = mat(C.steelD, .7, .3);
  box(.9, .8, 39, duct, -33.5, 13.5, -.8, root, { cast: false });
  box(31.5, .8, .7, duct, -18.5, 13.5, -20.75, root, { cast: false });
  const vents = [];
  for (let z = -15; z < 18; z += 6) vents.push([-33.03, 13.45, z, .04, .45, .9]);
  for (let x = -28; x < -3; x += 6) vents.push([x, 13.06, -20.75, .9, .04, .5]);
  inst(BOX, grille, vents, { cast: false });

  /* ---------------- high-bay lights hanging from roof purlins */
  const purlin = mat(C.steelD, .6, .4);
  const LZ = [-12, -1, 10];
  for (const z of LZ) box(HX * 2, .28, .2, purlin, 0, HH - .15, z, root, { cast: false });
  const rods = [], shades = [], lenses = [];
  for (const z of LZ) for (let x = -29.75; x < HX; x += 8.5) {
    rods.push([x, 14.3, z, .025, .9, .025]);
    shades.push([x, 13.88, z, .5, .3, .5]);
    lenses.push([x, 13.72, z, .44, .03, .44]);
  }
  inst(CYL, mat(C.dark, .6, .4), rods, { cast: false });
  inst(new THREE.CylinderGeometry(.55, 1, 1, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a949e, roughness: .4, metalness: .6, side: THREE.DoubleSide }), shades, { cast: false });
  inst(CYL, new THREE.MeshStandardMaterial({ color: 0xfffaf0, emissive: 0xfff3d6, emissiveIntensity: .9, roughness: .3 }), lenses, { cast: false });

  /* ---------------- big painted wall sign */
  const bigTex = canvasTex(1024, 192, (g, W, H) => {
    g.fillStyle = '#F4F6F8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#F2B705'; g.fillRect(0, 0, 150, H);
    g.fillStyle = '#13202C'; for (let k = -H; k < 150; k += 44) { g.beginPath(); g.moveTo(k, H); g.lineTo(k + 22, H); g.lineTo(k + 22 + H, 0); g.lineTo(k + H, 0); g.closePath(); g.fill(); }
    g.fillStyle = '#13202C'; g.font = `700 104px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText('LINE 2 · CRUSHING', 190, H / 2 + 4, W - 220);
    g.fillStyle = '#E8650F'; g.fillRect(150, H - 14, W - 150, 14);
  });
  plaque(bigTex, 7.4, 1.39, 'back', -12.75, 4.9);

  /* ---------------- safety signs */
  const blueSign = (a, b) => signTex([{ t: a }, { t: b, size: .8 }], '#1F6FD1', '#FFFFFF');
  plaque(blueSign('HARD HAT', 'AREA'), 1.0, .7, 'back', -29.75, 2.8);
  plaque(signTex([{ t: 'EAR' }, { t: 'PROTECTION' }, { t: 'REQUIRED', size: .8 }], '#1F6FD1', '#FFFFFF'), 1.0, .7, 'back', -21.25, 2.8);
  plaque(signTex([{ t: 'LOCKOUT' }, { t: 'TAGOUT', size: .9 }], '#F2B705', '#13202C', { band: '#13202C' }), .9, .63, 'back', 7.3, 2.5);
  plaque(signTex([{ t: 'CAUTION' }, { t: 'FORKLIFT TRAFFIC', size: .75 }], '#F2B705', '#13202C'), 1.1, .77, 'back', 30.7, 3.1);
  plaque(signTex([{ t: 'DANGER' }, { t: '480 VOLTS', size: .8 }], '#FFFFFF', '#13202C', { band: '#D33A3A' }), .8, .56, 'left', -14.6, 2.4, .62);
  plaque(signTex([{ t: 'FIRE EXIT  →' }], '#11905A', '#FFFFFF', { W: 512, H: 160 }), 1.2, .38, 'left', 4, 2.85);

  /* ---------------- personnel door on the left wall */
  box(.1, 2.5, 1.4, C.steelD, LX + .05, 1.25, 4, root, { cast: false });
  box(.06, 2.3, 1.15, 0x8f9aa5, LX + .11, 1.15, 4, root, { cast: false });
  box(.08, .06, .45, C.dark, LX + .17, 1.1, 4.25, root, { cast: false });

  /* ---------------- electrical: MCC lineup + disconnects (back wall) and a panel bank (left wall) */
  const panelM = mat(C.steel, .55, .35), panelD = mat(C.steelD, .55, .35);
  const lights = [];
  box(2.4, 2.2, .6, panelM, 3.2, 1.1, BZ + .3);
  for (const x of [2.4, 3.2, 4.0]) { box(.02, 2.0, .02, C.dark, x - .4, 1.1, BZ + .61, root, { cast: false }); box(.05, .25, .05, C.dark, x + .25, 1.2, BZ + .63, root, { cast: false });
    lights.push([x - .15, 1.85, BZ + .62, C.green], [x, 1.85, BZ + .62, C.red], [x + .15, 1.85, BZ + .62, C.yellow]); }
  for (const x of [5.25, 6.1]) { box(.6, .8, .3, panelD, x, 1.6, BZ + .15); box(.08, .3, .08, C.red, x + .22, 1.6, BZ + .34, root, { cast: false }); lights.push([x - .15, 1.85, BZ + .31, C.green]); }
  for (const x of [2.3, 2.9, 3.5, 4.1, 5.25, 6.1]) cyl(.035, TY - 2.1, C.galv, x, (TY + 2.1) / 2, BZ + .12, root, { cast: false });
  box(.6, 2.1, 2.0, panelM, LX + .3, 1.05, -14.6);
  box(.3, .8, .6, panelD, LX + .15, 1.6, -12.9); box(.3, .8, .6, panelD, LX + .15, 1.6, -12.1);
  for (const z of [-15.2, -14.6, -14.0]) lights.push([LX + .61, 1.8, z, z === -14.6 ? C.yellow : C.green]);
  for (const z of [-15.2, -14.2, -12.9, -12.1]) cyl(.035, TY - 2.1, C.galv, LX + .12, (TY + 2.1) / 2, z, root, { cast: false });
  inst(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: .55, roughness: .4 }), lights.map(l => [l[0], l[1], l[2], .045, .045, .045, 0, 0, 0, l[3]]), { cast: false });
  hatch(4.8, 1.5, 4.2, -19.8);
  hatch(1.3, 3.6, -33.0, -13.6);

  /* ---------------- fire extinguisher stations */
  const fireTex = signTex([{ t: 'FIRE' }, { t: 'EXTINGUISHER', size: .55 }], '#D33A3A', '#FFFFFF', { W: 256, H: 400 });
  const exM = mat(C.red, .35, .2);
  const extinguisher = (wall, u) => {
    plaque(fireTex, .45, .7, wall, u, 2.25);
    const off = .2, x = wall === 'back' ? u : LX + off, z = wall === 'back' ? BZ + off : u;
    cyl(.1, .55, exM, x, 1.05, z); cyl(.035, .12, C.black, x, 1.38, z, root, { cast: false });
  };
  extinguisher('back', -1.1); extinguisher('back', -23.4); extinguisher('back', 10.2); extinguisher('left', -8); extinguisher('left', 9.6);

  /* ---------------- wall clock + shift board */
  const clockTex = canvasTex(256, 256, (g, W) => {
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#13202C'; g.lineWidth = 10; g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 6, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.lineWidth = i % 3 ? 4 : 9;
      g.beginPath(); g.moveTo(W / 2 + Math.sin(a) * 100, W / 2 - Math.cos(a) * 100); g.lineTo(W / 2 + Math.sin(a) * 116, W / 2 - Math.cos(a) * 116); g.stroke(); }
    const hand = (a, len, w, c) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(W / 2, W / 2); g.lineTo(W / 2 + Math.sin(a) * len, W / 2 - Math.cos(a) * len); g.stroke(); };
    hand((10 + 10 / 60) / 12 * Math.PI * 2, 62, 9, '#13202C'); hand(10 / 60 * Math.PI * 2, 92, 6, '#13202C'); hand(.62 * Math.PI * 2, 100, 2, '#D33A3A');
  });
  cyl(.48, .08, C.dark, 12.75, 4.4, BZ + .04, root, { axis: 'z', cast: false });
  const face = new THREE.Mesh(new THREE.CircleGeometry(.43, 32), mat(0xffffff, .5, 0, { map: clockTex })); face.position.set(12.75, 4.4, BZ + .09); root.add(face);
  const boardTex = canvasTex(768, 410, (g, W, H) => {
    g.fillStyle = '#FBFCFD'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#13202C'; g.font = `700 40px ${FONT}`; g.fillText('SHIFT B · LINE 2', 28, 58);
    g.fillStyle = '#11905A'; g.font = `700 30px ${FONT}`; g.fillText('DAYS WITHOUT LOST-TIME INJURY: 214', 28, 108);
    g.font = `500 26px ${FONT}`; g.fillStyle = '#1F6FD1';
    ['□ CV-104 belt tracking check', '□ Jaw liner wear reading', '☑ Screen deck bolts torqued', '□ Grease cone crusher spider'].forEach((t, i) => g.fillText(t, 36, 168 + i * 46));
    g.fillStyle = '#D33A3A'; g.fillText('Lead: R. Ortega   ext 214', 36, 368);
    g.strokeStyle = '#B7791F'; g.lineWidth = 3; g.strokeRect(470, 150, 260, 200); g.fillStyle = '#B7791F'; g.font = `600 24px ${FONT}`; g.fillText('THROUGHPUT t/h', 490, 185);
    g.strokeStyle = '#1F6FD1'; g.lineWidth = 4; g.beginPath(); [[490, 320], [540, 290], [590, 300], [640, 250], [700, 230]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
  });
  box(3.1, 1.7, .06, C.galv, 12.75, 2.1, BZ + .03, root, { cast: false });
  plaque(boardTex, 2.95, 1.57, 'back', 12.75, 2.1, root, .07);
  box(2.4, .05, .12, C.galv, 12.75, 1.22, BZ + .1, root, { cast: false });

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
