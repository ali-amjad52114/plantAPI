// @ts-nocheck
// Yard vehicles + paving: loading apron, front-left staff lot with pickups, haul truck on the apron, loader at the stockpiles.
// Also owns the asphalt loop road (front z=HZ+13, right x=HX+15, w=8) and the east lot at (HX+37, 4).
// dims = { HX, HZ, HH }: the hall spans x in [-HX, HX], z in [-HZ, HZ]. Decoration only.
export function addVehicleProps(THREE, scene, dims) {
  const { HX, HZ } = dims;
  const root = new THREE.Group(); root.name = 'props-vehicles'; scene.add(root);
  const std = (c, r = .8, m = 0, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...o });
  const flatMat = (c) => std(c, .95, 0, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const M = {
    apron: flatMat(0x7d868f), line: flatMat(0xffffff), bay: flatMat(0xe8c21a), lot: flatMat(0x8a929a),
    glass: std(0x1d2a36, .2, .3), tyre: std(0x1b1d20, .9), rim: std(0x9aa3ab, .5, .4), dark: std(0x3a4148, .7, .3),
    white: std(0xf2f4f6, .5, .1), grey: std(0x8f979e, .5, .2), blue: std(0x1f3a5f, .5, .2), haul: std(0xf2b705, .55, .1),
  };
  const G = { box: new THREE.BoxGeometry(1, 1, 1), plane: new THREE.PlaneGeometry(1, 1), wheel: new THREE.CylinderGeometry(1, 1, 1, 16) };
  const decor = (m) => { m.userData.decor = true; m.raycast = () => {}; return m; };
  const box = (p, mat, sx, sy, sz, x, y, z) => { const m = decor(new THREE.Mesh(G.box, mat)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; p.add(m); return m; };
  const flat = (mat, w, d, x, y, z) => { const m = decor(new THREE.Mesh(G.plane, mat)); m.rotation.x = -Math.PI / 2; m.scale.set(w, d, 1); m.position.set(x, y, z); m.receiveShadow = true; root.add(m); return m; };
  const wheel = (p, r, w, x, y, z) => { const m = decor(new THREE.Mesh(G.wheel, M.tyre)); m.rotation.x = Math.PI / 2; m.scale.set(r, w, r); m.position.set(x, y, z); m.castShadow = true; p.add(m); return m; };
  const veh = (x, z, ry) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g); return g; };

  // ---------- asphalt loop road (front z=HZ+13, right x=HX+15) with an exit east to the yard edge + spur to the east lot
  const R = { front: HZ + 13, back: -HZ - 19, left: -HX - 20, right: HX + 15, w: 8 }, EDGE = 195;
  const segs = [ // [x0, z0, x1, z1] centre lines; axis-aligned
    [R.left, R.front, EDGE, R.front], [R.left, R.back, R.right, R.back],
    [R.left, R.back, R.left, R.front], [R.right, R.back, R.right, R.front], [R.right, 4, R.right + 15, 4],
  ];
  const dashes = [];
  for (const [x0, z0, x1, z1] of segs) {
    const alongX = z0 === z1, len = alongX ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (alongX) { flat(M.apron, len + R.w, R.w, cx, .02, cz); for (const s of [-1, 1]) flat(M.line, len + R.w - .6, .18, cx, .03, cz + s * (R.w / 2 - .35)); }
    else { flat(M.apron, R.w, len + R.w, cx, .02, cz); for (const s of [-1, 1]) flat(M.line, .18, len + R.w - .6, cx + s * (R.w / 2 - .35), .03, cz); }
    for (let t = R.w / 2 + 1.5; t < len - R.w / 2 - 1; t += 5) dashes.push(alongX ? [x0 + t, z0, 0] : [x0, z0 + t, 1]);
  }
  const dm = decor(new THREE.InstancedMesh(G.plane, M.line, dashes.length)); dm.receiveShadow = true;
  const o = new THREE.Object3D();
  dashes.forEach(([x, z, v], i) => { o.position.set(x, .035, z); o.rotation.set(-Math.PI / 2, 0, v ? Math.PI / 2 : 0); o.scale.set(2.4, .2, 1); o.updateMatrix(); dm.setMatrixAt(i, o.matrix); });
  root.add(dm);

  // ---------- east lot at the end of the spur, 2 pickups
  const E = { x: R.right + 22, z: 4 };
  flat(M.lot, 14, 12, E.x, .025, E.z);
  for (let i = 0; i <= 4; i++) flat(M.bay, .18, 5, E.x - 6 + i * 3, .035, E.z - 3);

  // ---------- loading apron in front of the open front, between the hall and the loop road
  const apZ0 = HZ + 1, apZ1 = HZ + 9;
  flat(M.apron, HX * 2 - 4, apZ1 - apZ0, 0, .03, (apZ0 + apZ1) / 2);
  flat(M.line, HX * 2 - 4, .25, 0, .04, apZ1 - .2);                 // solid edge line on the road side
  for (let x = -HX + 6; x <= HX - 6; x += 6) flat(M.line, .2, 2.4, x, .04, apZ0 + 1.6); // dock stop marks

  // ---------- staff lot, front-left, beyond the loop road
  const L = { x: -HX - 4, z: HZ + 27, w: 26, d: 12 };
  flat(M.lot, L.w, L.d, L.x, .025, L.z);
  for (let i = 0; i <= 8; i++) flat(M.bay, .18, 5, L.x - L.w / 2 + 1 + i * 3, .035, L.z - L.d / 2 + 3);
  flat(M.bay, L.w - 2, .18, L.x, .035, L.z - L.d / 2 + 5.6);

  function pickup(x, z, ry, paint) {
    const g = veh(x, z, ry);
    box(g, paint, 1.9, .7, 4.8, 0, .85, 0);           // body
    box(g, paint, 1.8, .75, 2, 0, 1.55, .5);          // cab
    box(g, M.glass, 1.84, .45, 1.6, 0, 1.6, .55);     // glass band
    box(g, M.dark, 1.7, .15, 2.1, 0, 1.25, -1.3);     // bed floor
    for (const sx of [-.9, .9]) for (const sz of [-1.5, 1.5]) wheel(g, .42, .3, sx, .42, sz);
  }
  const bayX = (i) => L.x - L.w / 2 + 2.5 + i * 3;
  pickup(bayX(1), L.z - L.d / 2 + 3, 0, M.white);
  pickup(bayX(2), L.z - L.d / 2 + 3, 0, M.grey);
  pickup(bayX(5), L.z - L.d / 2 + 3, Math.PI, M.blue);
  pickup(E.x - 4.5, E.z - 3, 0, M.white);
  pickup(E.x + 1.5, E.z - 3, Math.PI, M.grey);

  // ---------- haul truck on the right end of the apron, nose toward the road
  (function haul(x, z, ry) {
    const g = veh(x, z, ry);
    box(g, M.dark, 7.5, .8, 2.6, 0, 1.5, 0);                               // chassis
    const bed = box(g, M.haul, 5, 1.8, 3.4, -1.3, 2.9, 0); bed.rotation.z = .08; // dump body, tipped slightly
    box(g, M.haul, 1.6, 1.6, 1.4, 2.8, 2.9, -.9);                          // raised cab
    box(g, M.glass, 1.2, .7, 1.45, 3, 3.2, -.9);                           // cab glass
    box(g, M.haul, 1.4, 1.1, 2.6, 3.2, 2.1, .4);                           // engine hood
    for (const sz of [-1.45, 1.45]) { wheel(g, .95, .7, 2.6, .95, sz); wheel(g, .95, .7, -1.6, .95, sz); wheel(g, .95, .7, -3.1, .95, sz); }
  })(HX - 6, HZ + 5, 0);

  // ---------- front-end loader beside the stockpiles, behind-left (clear of the left/back loop road)
  (function loader(x, z, ry) {
    const g = veh(x, z, ry);
    box(g, M.haul, 3.4, 1, 1.8, 0, 1.2, 0);              // body
    box(g, M.haul, 1.2, 1.3, 1.5, -.6, 2.3, 0);          // cab
    box(g, M.glass, 1, .8, 1.55, -.6, 2.45, 0);          // cab glass
    box(g, M.dark, 1.6, .25, .25, 2.2, 1.4, 0);          // lift arms
    box(g, M.dark, .5, .9, 2.4, 3, .65, 0);              // bucket
    for (const sx of [-1, 1.1]) for (const sz of [-1, 1]) wheel(g, .7, .5, sx, .7, sz);
  })(-HX - 34, -HZ - 29, -Math.PI / 4); // (-68,-50): clear of the left/back road and the (-54,-60) pile

  return root;
}
