// @ts-nocheck
// Wall + ceiling set dressing for the 3D hall: pipe racks, cable trays, ducts, panels, signage, high-bay lights. Decoration only.
// dims = { HX, HZ, HH }: hall half-width (x), half-depth (z), height. Back wall at z = -HZ, left wall at x = -HX.
export function addWallProps(THREE, scene, dims) {
  const { HX, HZ, HH } = dims;
  const g = new THREE.Group(); g.name = "wall-props"; scene.add(g);
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, metalness: .25, ...o });
  const M = {
    grey: std(0x9aa4ae, { metalness: .4 }), yellow: std(0xf2b705), blue: std(0x1f6fd1),
    galv: std(0xb8c0c8, { metalness: .55, roughness: .45 }), steel: std(0x5b636b, { metalness: .5 }),
    panel: std(0xc9ced3, { metalness: .3 }), dark: std(0x2a2f35), red: std(0xc81e1e, { roughness: .45 }),
    green: std(0x22c55e, { emissive: 0x22c55e, emissiveIntensity: .8 }), redLed: std(0xef4444, { emissive: 0xef4444, emissiveIntensity: .8 }),
    lens: std(0xffffff, { emissive: 0xfff6e0, emissiveIntensity: 1.1, metalness: 0 }), frame: std(0x6b7480, { metalness: .4 }),
    door: std(0x8f99a3, { metalness: .35 }),
  };
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
  const PLANE = new THREE.PlaneGeometry(1, 1);
  const tmp = new THREE.Object3D();

  function box(sx, sy, sz, mat, x, y, z, cast = true) {
    const m = new THREE.Mesh(BOX, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    m.castShadow = cast; m.receiveShadow = true; g.add(m); return m;
  }
  function cyl(r, len, mat, x, y, z, axis = "y", cast = true) {
    const m = new THREE.Mesh(CYL, mat); m.scale.set(r, len, r); m.position.set(x, y, z);
    if (axis === "x") m.rotation.z = Math.PI / 2; if (axis === "z") m.rotation.x = Math.PI / 2;
    m.castShadow = cast; g.add(m); return m;
  }
  // instanced helper: list of [px,py,pz, sx,sy,sz, rx,ry,rz]
  function inst(geo, mat, list, cast = true) {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((a, i) => {
      tmp.position.set(a[0], a[1], a[2]); tmp.scale.set(a[3], a[4], a[5]); tmp.rotation.set(a[6] || 0, a[7] || 0, a[8] || 0);
      tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix);
    });
    im.instanceMatrix.needsUpdate = true; im.castShadow = cast; im.receiveShadow = true; g.add(im); return im;
  }
  function label(text, w, h, x, y, z, ry, o = {}) {
    const W = o.px || 512, H = Math.round(W * h / w);
    const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d");
    ctx.fillStyle = o.bg || "#ffffff"; ctx.fillRect(0, 0, W, H);
    if (o.band) { ctx.fillStyle = o.band; ctx.fillRect(0, 0, W, H * .26); }
    if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = H * .06; ctx.strokeRect(H * .03, H * .03, W - H * .06, H - H * .06); }
    ctx.fillStyle = o.fg || "#111"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const lines = String(text).split("\n"); const fs = o.fs || Math.min(H * .5 / lines.length * 1.4, W / (Math.max(...lines.map(l => l.length)) * .62));
    ctx.font = `${o.weight || 800} ${fs}px Inter, Arial, sans-serif`;
    const top = o.band ? H * .26 : 0, span = H - top;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + span * (i + .5) / lines.length));
    if (o.bandText) { ctx.fillStyle = "#fff"; ctx.font = `800 ${H * .17}px Inter, Arial, sans-serif`; ctx.fillText(o.bandText, W / 2, H * .13); }
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .7, metalness: 0, emissive: o.glow ? 0xffffff : 0x000000, emissiveMap: o.glow ? tex : null, emissiveIntensity: o.glow ? .6 : 0 });
    const m = new THREE.Mesh(PLANE, mat); m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m;
  }

  // ---- wall frames: back wall runs along x at z = zb (facing +z); left wall runs along z at x = xl (facing +x)
  const zb = -HZ + .45, xl = -HX + .35;  // just inside columns / wall face
  const backAt = (u, y, d) => [u, y, zb + d];      // u along x, d = offset into hall
  const leftAt = (u, y, d) => [xl + d, y, u];      // u along z
  const walls = [
    { at: backAt, from: -HX + 1, to: HX - 1, ry: 0, axis: "x" },
    { at: leftAt, from: -HZ + 1, to: HZ - 1, ry: Math.PI / 2, axis: "z" },
  ];
  const runs = [{ y: 6.4, r: .16, mat: M.grey, d: .35 }, { y: 7.1, r: .12, mat: M.yellow, d: .35 }, { y: 7.75, r: .14, mat: M.blue, d: .35 }];
  const flanges = [], brackets = [], arms = [], rungs = [], diffs = [], hangers = [];

  walls.forEach((W, wi) => {
    const len = W.to - W.from, mid = (W.to + W.from) / 2;
    const sx = (a, b) => (W.axis === "x" ? [a, b] : [b, a]); // swap extents for along-wall vs depth
    // pipe runs
    runs.forEach(R => { const p = W.at(mid, R.y, R.d); cyl(R.r, len, R.mat, p[0], p[1], p[2], W.axis); });
    // brackets + flanges every ~4 m
    for (let u = W.from + 1; u <= W.to - .5; u += 4) {
      const p = W.at(u, 7.05, .12); const [bx, bz] = sx(.12, .12); brackets.push([p[0], p[1], p[2], bx, 2.1, bz]);
      runs.forEach(R => {
        const a = W.at(u, R.y - R.r - .04, R.d * .55); const [ax, az] = sx(.08, R.d + .1); arms.push([a[0], a[1], a[2], ax, .06, az]);
        const f = W.at(u + 2, R.y, R.d);
        flanges.push([f[0], f[1], f[2], R.r * 1.45, .09, R.r * 1.45, W.axis === "z" ? Math.PI / 2 : 0, 0, W.axis === "x" ? Math.PI / 2 : 0]);
      });
    }
    // cable tray (ladder) above the pipes
    const ty = 8.45, td = .45;
    [-.22, .22].forEach(o => { const p = W.at(mid, ty, td + o); const [lx, lz] = sx(len, .05); box(lx, .12, lz, M.galv, p[0], p[1], p[2], false); });
    for (let u = W.from + .3; u < W.to; u += .6) { const p = W.at(u, ty - .04, td); const [rx, rz] = sx(.04, .44); rungs.push([p[0], p[1], p[2], rx, .03, rz]); }
    for (let u = W.from + 2; u < W.to; u += 4) { const p = W.at(u, ty + .35, td); hangers.push([p[0], p[1], p[2], .04, .7, .04]); }
    // HVAC duct near the top with diffusers
    const dy = 13.95, dd = .55; { const p = W.at(mid, dy, dd); const [dx, dz] = sx(len, .7); box(dx, .8, dz, M.galv, p[0], p[1], p[2]); }
    for (let u = W.from + 3; u < W.to; u += 6) { const p = W.at(u, dy - .47, dd); diffs.push([p[0], p[1], p[2], .5, .14, .5]); }
    for (let u = W.from + 1.5; u < W.to; u += 5) { const p = W.at(u, dy + .3, .15); const [sx2, sz2] = sx(.08, .5); arms.push([p[0], p[1], p[2], sx2, .08, sz2]); }
  });
  inst(BOX, M.steel, brackets); inst(BOX, M.steel, arms); inst(CYL, M.steel, flanges);
  inst(BOX, M.galv, rungs, false); inst(BOX, M.steel, hangers, false); inst(BOX, M.dark, diffs, false);

  // vertical drops with valves (avoid roller door at x≈26 on the back wall)
  const drops = [{ w: 0, u: -27, run: 0 }, { w: 0, u: 9, run: 2 }, { w: 1, u: -12, run: 1 }, { w: 1, u: 14, run: 0 }];
  drops.forEach(D => {
    const W = walls[D.w], R = runs[D.run], top = R.y, bot = 1.2, p = W.at(D.u, (top + bot) / 2, R.d);
    cyl(R.r * .8, top - bot, R.mat, p[0], p[1], p[2]);
    const v = W.at(D.u, 2.3, R.d); box(.32, .26, .32, M.dark, v[0], v[1], v[2]);
    const h = W.at(D.u, 2.3, R.d + .3); cyl(.2, .05, M.red, h[0], h[1], h[2], D.w === 0 ? "z" : "x");
    const e = W.at(D.u, bot - .05, R.d); cyl(R.r * 1.4, .1, M.steel, e[0], e[1], e[2]);
  });

  // ---- electrical panels / disconnects at 1–3 m
  const leds = [], ledsR = [];
  const panelsAt = [{ w: 0, u: -30.5, s: [1.4, 1.9] }, { w: 0, u: -28.6, s: [.7, .9] }, { w: 0, u: -6, s: [1.2, 1.6] }, { w: 0, u: -4.4, s: [1.2, 1.6] }, { w: 0, u: 15, s: [.7, .9] },
    { w: 1, u: -16, s: [1.4, 1.9] }, { w: 1, u: -2, s: [.7, .9] }, { w: 1, u: 17, s: [1.2, 1.6] }];
  panelsAt.forEach((P, i) => {
    const W = walls[P.w], [pw, ph] = P.s, y = 1.1 + ph / 2, p = W.at(P.u, y, .22);
    box(W.axis === "x" ? pw : .3, ph, W.axis === "x" ? .3 : pw, M.panel, p[0], p[1], p[2]);
    const l1 = W.at(P.u - pw * .25, y + ph * .32, .38), l2 = W.at(P.u, y + ph * .32, .38);
    leds.push([l1[0], l1[1], l1[2], .05, .05, .05]); ledsR.push([l2[0], l2[1], l2[2], .05, .05, .05]);
    if (pw < 1) { const hd = W.at(P.u + pw * .32, y, .42); box(.06, .3, .06, M.dark, hd[0], hd[1], hd[2]); }
  });
  inst(new THREE.SphereGeometry(1, 8, 6), M.green, leds, false); inst(new THREE.SphereGeometry(1, 8, 6), M.redLed, ledsR, false);

  // ---- big line sign on the back wall (below clerestory windows, above cable tray)
  box(16.4, 1.9, .08, M.dark, -4, 9.65, zb + .02, false);
  label("LINE 2  ·  CRUSHING", 16, 1.6, -4, 9.65, zb + .07, 0, { bg: "#1f2933", fg: "#F2B705", px: 2048, weight: 900 });

  // ---- safety plaques
  const plaque = (t, W, u, y, color) => { const p = W.at(u, y, .04); label(t, 1.3, .95, p[0], p[1], p[2], W.ry, { bg: "#ffffff", band: color, bandText: color === "#1F6FD1" ? "NOTICE" : color === "#C81E1E" ? "DANGER" : "CAUTION", fg: "#111", px: 384 }); };
  plaque("HARD HAT\nAREA", walls[0], -18, 2.6, "#1F6FD1");
  plaque("LOCKOUT /\nTAGOUT", walls[0], -2.2, 3.1, "#C81E1E");
  plaque("EAR PROTECTION\nREQUIRED", walls[0], 11.5, 2.6, "#1F6FD1");
  plaque("HARD HAT\nAREA", walls[1], 2, 2.6, "#1F6FD1");
  plaque("LOCKOUT /\nTAGOUT", walls[1], -13.8, 3.1, "#C81E1E");

  // ---- roll-up door outline + EXIT sign on the left wall
  { const W = walls[1], u = 8, p = W.at(u, 2.6, .02);
    box(.06, 5.2, 5.2, M.door, p[0], p[1], p[2], false);
    for (let k = 0; k < 9; k++) { const q = W.at(u, .5 + k * .55, .07); box(.03, .04, 5.1, M.frame, q[0], q[1], q[2], false); }
    [-2.7, 2.7].forEach(o => { const q = W.at(u + o, 2.7, .1); box(.18, 5.4, .18, M.yellow, q[0], q[1], q[2]); });
    const hd = W.at(u, 5.55, .25); box(.5, .5, 5.8, M.frame, hd[0], hd[1], hd[2]);
    const ex = W.at(u, 6.35, .08); label("EXIT", 1.2, .45, ex[0], ex[1], ex[2], W.ry, { bg: "#0f7a3a", fg: "#ffffff", px: 256, glow: true });
  }

  // ---- fire extinguishers with red marker panels
  [{ w: 0, u: -22 }, { w: 0, u: 19 }, { w: 1, u: -6 }].forEach(F => {
    const W = walls[F.w], mk = W.at(F.u, 2.4, .03);
    label("FIRE\nEXTINGUISHER", .7, 1.0, mk[0], mk[1], mk[2], W.ry, { bg: "#C81E1E", fg: "#fff", px: 256 });
    const b = W.at(F.u, 1.15, .1); box(.12, .12, .12, M.steel, b[0], b[1], b[2], false);
    const c = W.at(F.u, .85, .2); cyl(.12, .62, M.red, c[0], c[1], c[2]);
    const t = W.at(F.u, 1.22, .2); cyl(.05, .14, M.dark, t[0], t[1], t[2]);
  });

  // ---- wall clock + shift whiteboard
  { const p = walls[0].at(4, 4.3, .06);
    const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.beginPath(); x.arc(128, 128, 124, 0, 7); x.fill(); x.lineWidth = 10; x.strokeStyle = "#222"; x.stroke();
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.lineWidth = 6; x.beginPath(); x.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100); x.lineTo(128 + Math.sin(a) * 115, 128 - Math.cos(a) * 115); x.stroke(); }
    x.lineWidth = 9; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + 55, 128 - 30); x.stroke(); x.lineWidth = 5; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 - 20, 128 - 85); x.stroke();
    const tex = new THREE.CanvasTexture(c); if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.CircleGeometry(.4, 28), new THREE.MeshStandardMaterial({ map: tex, roughness: .5 })); m.position.set(...p); g.add(m);
  }
  { const p = walls[1].at(-9.5, 2.1, .04);
    box(.06, 1.35, 2.3, M.frame, p[0] - .02, p[1], p[2], false);
    label("SHIFT B  ·  LINE 2\nCRUSHER  OK   SCREEN  OK\nCONV-3  watch belt\n0 LTI  ·  412 days", 2.15, 1.2, p[0] + .02, p[1], p[2], Math.PI / 2, { bg: "#f8fafc", fg: "#1e3a8a", px: 768, weight: 600 });
  }

  // ---- high-bay lights on short rods under the roof
  const rods = [], housings = [], lenses = [];
  for (let x = -HX + 4; x <= HX - 4; x += 6) for (const z of [-HZ + 5, -HZ / 3, HZ / 3, HZ - 5]) {
    rods.push([x, HH - .45, z, .025, .9, .025]);
    housings.push([x, HH - 1.0, z, .42, .3, .42]);
    lenses.push([x, HH - 1.16, z, .36, .02, .36]);
  }
  const CONE = new THREE.CylinderGeometry(.6, 1, 1, 16, 1, true);
  inst(CYL, M.steel, rods, false); inst(CONE, M.grey, housings, false); inst(CYL, M.lens, lenses, false);

  // decor only: never pickable
  g.traverse(o => { if (o.isMesh) { o.userData.decor = true; o.raycast = () => {}; } });
  return g;
}
