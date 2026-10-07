// @ts-nocheck
// Outdoor yard set dressing around the hall: fence, lighting, stockpiles, vehicles, trees. Decoration only.
// dims = { HX, HZ, HH }: hall half-width (x), half-depth (z), height. The hall spans x in [-HX, HX], z in [-HZ, HZ].
// Layout keeps the front (z > HZ) and right (x > HX) of the hall low for ~12 units so the cutaway view stays clear.
export function addYardProps(THREE, scene, dims) {
  const { HX, HZ } = dims;
  const root = new THREE.Group(); root.name = 'yard-props'; scene.add(root);

  // ---------- shared geometry + materials
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
    cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
    plane: new THREE.PlaneGeometry(1, 1),
    cone: new THREE.ConeGeometry(1, 1, 10),
    sph: new THREE.SphereGeometry(1, 14, 10),
    wheel: new THREE.CylinderGeometry(1, 1, 1, 14),
  };
  const std = (color, rough = .85, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const M = {
    asphalt: std(0x7d868f, .95), gravel: std(0xc4bfb5, 1), parkPad: std(0x858d95, .95),
    white: std(0xf4f5f2, .7), yellow: std(0xe0b52a, .7),
    ore: std(0x8c7b6b, 1), oreDark: std(0x7a6a5b, 1),
    steel: std(0x8f99a3, .55, .5), steelDark: std(0x56606a, .6, .4), galv: std(0xb7bfc6, .5, .55),
    haul: std(0xe3a72b, .6, .15), tire: std(0x2a2d31, .95), glass: std(0x3c5466, .25, .3),
    pickWhite: std(0xe9ecee, .5, .2), pickGrey: std(0x9aa3ab, .5, .3), pickBlue: std(0x47627d, .5, .3),
    contRed: std(0x8e4a3f, .8, .2), contBlue: std(0x3f5f7f, .8, .2), contGreen: std(0x55704f, .8, .2),
    office: std(0xe7e9e4, .8), officeTrim: std(0x6f7a84, .7), concrete: std(0xb9bdbf, .95),
    lamp: std(0xfff6dc, .4, 0, { emissive: 0xfff1c4, emissiveIntensity: .35 }),
    trunk: std(0x6b5644, 1), leaf: std(0xffffff, .95),
    hill: std(0xb9c4b0, 1), hill2: std(0xc6cfc0, 1),
    booth: std(0xd9dcd6, .8), gateArm: std(0xd33a3a, .6),
    belt: std(0x2f3337, .9), transformer: std(0x7f8b80, .6, .3),
    fenceMesh: new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: .6, metalness: .4, transparent: true, opacity: .28, side: THREE.DoubleSide, depthWrite: false }),
    tank: std(0xd6dbde, .5, .35),
  };

  const add = (parent, geo, mat, sx, sy, sz, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const flat = (parent, mat, w, d, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(G.plane, mat); m.rotation.x = -Math.PI / 2; m.rotation.z = ry; m.scale.set(w, d, 1);
    m.position.set(x, y, z); m.receiveShadow = true; parent.add(m); return m;
  };

  // ---------- ground: gravel apron around the hall. The asphalt road, lane/parking markings and vehicles
  // live in props-vehicles.ts (PROPS-VEH); R/P below only mirror that layout so poles/substation sit clear of it.
  flat(root, M.gravel, HX * 2 + 14, HZ * 2 + 14, 0, -.035, 0);
  const R = { front: HZ + 13, back: -HZ - 19, left: -HX - 20, right: HX + 15, w: 8 };
  const P = { x: R.right + 22, z: 4 };
  const o = new THREE.Object3D();

  // ---------- ore stockpiles + radial stacker (behind / left of the hall)
  const piles = [[-30, -66, 11, 7.5], [-54, -60, 8.5, 5.5], [-12, -72, 7, 4.5], [-66, -76, 6, 3.8]];
  for (const [x, z, r, h] of piles) {
    const p = add(root, G.cone, M.ore, r, h, r * (0.82 + Math.random() * .3), x, h / 2 - .05, z, Math.random() * 3);
    // lumpier skirt so they don't look like perfect cones
    add(root, G.cone, M.oreDark, r * .55, h * .45, r * .5, x + r * .55, h * .22, z + r * .2, 1.1);
    add(root, G.cone, M.oreDark, r * .5, h * .4, r * .45, x - r * .5, h * .2, z - r * .25, 2);
  }
  (function stacker() {
    const tip = new THREE.Vector3(-30, 11.5, -66), base = new THREE.Vector3(-10, 1.2, -44);
    const g = new THREE.Group(); root.add(g);
    const len = tip.distanceTo(base), mid = tip.clone().add(base).multiplyScalar(.5);
    const boom = new THREE.Group(); boom.position.copy(mid); boom.lookAt(tip); g.add(boom);
    add(boom, G.box, M.steel, 2.2, .45, len, 0, 0, 0);        // truss chord
    add(boom, G.box, M.belt, 1.4, .12, len, 0, .3, 0);        // belt
    add(boom, G.box, M.steelDark, 2.4, .9, .2, 0, -.5, len * .3);
    add(boom, G.box, M.steelDark, 2.4, .9, .2, 0, -.5, -len * .2);
    // support A-frame + bogie near the outer end
    const sx = -24, sz = -59.5, sh = 8.6;
    add(g, G.box, M.steel, .4, sh, .4, sx - 1.4, sh / 2, sz); add(g, G.box, M.steel, .4, sh, .4, sx + 1.4, sh / 2, sz);
    add(g, G.box, M.steelDark, 4, .8, 2, sx, .5, sz);
    // tail hopper + pivot
    add(g, G.cyl6, M.steelDark, 1.6, 2.2, 1.6, base.x, 1.1, base.z);
    add(g, G.box, M.haul, 2.6, 1.4, 2.6, base.x, 2.6, base.z);
  })();

  // ---------- shipping containers (left of the hall)
  const cont = [[-74, 6, M.contRed, 0, 0], [-74, 13, M.contBlue, 0, 0], [-74, 9.5, M.contGreen, 0, 2.6], [-78, 24, M.contBlue, .25, 0], [-66, 28, M.contRed, 1.4, 0]];
  for (const [x, z, mat, ry, y] of cont) {
    const c = add(root, G.box, mat, 12.2, 2.6, 2.45, x, y + 1.3, z, ry);
    for (let i = -5; i <= 5; i += 1) add(c, G.box, mat, .012, .92, 1.02, i / 12.2 * 1, 0, 0); // rib lines (in local unit space)
  }

  // ---------- site office trailer with windows + steps, muster point beside it
  (function office(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g);
    add(g, G.box, M.officeTrim, 14.6, .6, 4.4, 0, .5, 0);       // skirting
    add(g, G.box, M.office, 14.4, 3, 4.2, 0, 2.3, 0);
    add(g, G.box, M.officeTrim, 14.8, .25, 4.6, 0, 3.9, 0);     // roof edge
    for (const wx of [-5.4, -2.6, 2.6, 5.4]) add(g, G.box, M.glass, 1.6, 1.1, .08, wx, 2.6, 2.12);
    add(g, G.box, M.officeTrim, 1.1, 2.2, .1, 0, 1.9, 2.13);    // door
    for (let s = 0; s < 3; s++) add(g, G.box, M.steel, 1.8, .2, .55, 0, .3 + s * .27, 3.4 - s * .5);
    add(g, G.box, M.steel, 2.4, .12, 1.4, 0, .86, 2.85);         // landing
    add(g, G.box, M.steelDark, 1.4, .8, .9, -7.8, .4, 1.2);     // AC unit
  })(-64, 46);

  const musterTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#11905A'; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#11905A'; g.font = 'bold 140px IBM Plex Sans, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', 128, 136);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  flat(root, new THREE.MeshStandardMaterial({ map: musterTex, transparent: true, roughness: .8 }), 9, 9, -50, -.012, 50);

  // ---------- substation pad with a small fenced enclosure (back right)
  (function substation(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g);
    add(g, G.box, M.concrete, 16, .3, 12, 0, .15, 0);
    for (const tx of [-3.5, 3.5]) {
      add(g, G.box, M.transformer, 3.2, 3.2, 2.6, tx, 1.9, 0);
      for (let f = -1; f <= 1; f++) add(g, G.box, M.transformer, .15, 2.6, 2.9, tx + f * .9, 1.8, 0); // cooling fins
      for (const bz of [-.7, 0, .7]) add(g, G.cyl, M.white, .16, 1.1, .16, tx, 4, bz);              // bushings
    }
    add(g, G.box, M.steelDark, .3, 7, .3, -7, 3.5, -5); add(g, G.box, M.steelDark, .3, 7, .3, 7, 3.5, -5);
    add(g, G.box, M.steelDark, 14.3, .3, .3, 0, 6.9, -5);       // gantry
    for (const [w, fx, fz, ry] of [[16, 0, 6, 0], [16, 0, -6, 0], [12, -8, 0, Math.PI / 2], [12, 8, 0, Math.PI / 2]]) {
      const f = add(g, G.plane, M.fenceMesh, w, 2.6, 1, fx, 1.6, fz, ry); f.castShadow = false;
    }
  })(R.right + 30, -58);

  // ---------- water tower (left, behind the containers)
  (function waterTower(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g);
    for (const [lx, lz] of [[2.8, 2.8], [-2.8, 2.8], [2.8, -2.8], [-2.8, -2.8]]) add(g, G.cyl6, M.galv, .28, 18, .28, lx, 9, lz);
    for (const h of [6, 12]) { add(g, G.box, M.galv, 5.8, .18, .18, 0, h, 2.8); add(g, G.box, M.galv, 5.8, .18, .18, 0, h, -2.8); add(g, G.box, M.galv, .18, .18, 5.8, 2.8, h, 0); add(g, G.box, M.galv, .18, .18, 5.8, -2.8, h, 0); }
    add(g, G.cyl, M.tank, 4.6, 5.5, 4.6, 0, 20.5, 0);
    add(g, G.cone, M.tank, 4.9, 1.6, 4.9, 0, 24, 0);
    add(g, G.cyl, M.steelDark, .25, 18, .25, 0, 9, 0);          // riser
  })(-90, -18);

  // ---------- tall site light poles around the loop road
  const poles = [[R.left - 6, R.front + 6], [R.left - 6, R.back - 6], [R.right + 6, R.back - 6], [R.right + 6, R.front + 8], [-6 + 7, 70], [P.x + 13, P.z - 14], [-30, R.back - 6], [R.left - 6, -4]];
  for (const [x, z] of poles) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.lookAt(0, 0, 0); root.add(g);
    add(g, G.cyl, M.concrete, .7, .6, .7, 0, .3, 0);
    add(g, G.cyl, M.galv, .2, 16, .2, 0, 8, 0);
    add(g, G.box, M.galv, .14, .14, 3.4, 0, 15.8, 1.2);
    for (const hx of [-.9, .9]) add(g, G.box, M.lamp, 1.4, .35, .9, hx, 15.6, 2.4);
  }

  // ---------- chain-link perimeter fence with gate + guard booth
  const F = { x: 112, z: 100, h: 2.6 };
  const postPts = [];
  for (let x = -F.x; x <= F.x; x += 8) { postPts.push([x, -F.z]); if (Math.abs(x + 6) > 7) postPts.push([x, F.z]); }
  for (let z = -F.z + 8; z < F.z; z += 8) { postPts.push([-F.x, z]); postPts.push([F.x, z]); }
  const posts = new THREE.InstancedMesh(G.cyl6, M.galv, postPts.length);
  postPts.forEach(([x, z], i) => { o.position.set(x, F.h / 2, z); o.rotation.set(0, 0, 0); o.scale.set(.09, F.h, .09); o.updateMatrix(); posts.setMatrixAt(i, o.matrix); });
  posts.castShadow = true; root.add(posts);
  const gateHalf = 7, gx = -6;
  const panels = [
    [F.x * 2, 0, -F.z, 0], [F.z * 2, -F.x, 0, Math.PI / 2], [F.z * 2, F.x, 0, Math.PI / 2],
    [gx - gateHalf + F.x, (-F.x + gx - gateHalf) / 2, F.z, 0], [F.x - (gx + gateHalf), (F.x + gx + gateHalf) / 2, F.z, 0],
  ];
  for (const [w, x, z, ry] of panels) {
    add(root, G.plane, M.fenceMesh, w, F.h, 1, x, F.h / 2, z, ry).castShadow = false;
    add(root, G.box, M.galv, ry ? .08 : w, .08, ry ? w : .08, x, F.h, z);            // top rail
  }
  for (const s of [-1, 1]) add(root, G.box, M.steelDark, .35, 3.2, .35, gx + s * gateHalf, 1.6, F.z);
  const arm = add(root, G.box, M.gateArm, 6.4, .18, .18, gx - 3.4, 1.2, F.z); arm.castShadow = false;
  (function booth(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g);
    add(g, G.box, M.concrete, 4, .3, 4, 0, .15, 0);
    add(g, G.box, M.booth, 3, 2.6, 3, 0, 1.6, 0);
    add(g, G.box, M.glass, 3.05, .9, 2.4, 0, 2.1, 0);
    add(g, G.box, M.glass, 2.4, .9, 3.05, 0, 2.1, 0);
    add(g, G.box, M.officeTrim, 3.6, .25, 3.6, 0, 3.0, 0);
  })(gx - gateHalf - 4, F.z - 4);

  // ---------- low-poly trees in clusters along the fence (instanced)
  const treePts = [];
  const cluster = (cx, cz, n, spread) => { for (let i = 0; i < n; i++) treePts.push([cx + (Math.random() - .5) * spread, cz + (Math.random() - .5) * spread, .8 + Math.random() * .6]); };
  cluster(-95, 80, 9, 18); cluster(-100, 20, 7, 14); cluster(-95, -80, 9, 18); cluster(-40, -90, 7, 16);
  cluster(30, -90, 8, 18); cluster(95, -80, 7, 14); cluster(100, 30, 6, 12); cluster(60, 88, 8, 18); cluster(-60, 88, 6, 14);
  const trunks = new THREE.InstancedMesh(G.cyl6, M.trunk, treePts.length);
  const crowns = new THREE.InstancedMesh(G.cone, M.leaf, treePts.length);
  const tints = [new THREE.Color(0x6e8f5a), new THREE.Color(0x58744a), new THREE.Color(0x637f50)];
  treePts.forEach(([x, z, s], i) => {
    o.rotation.set(0, Math.random() * 6, 0);
    o.position.set(x, 1.2 * s, z); o.scale.set(.28 * s, 2.4 * s, .28 * s); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
    o.position.set(x, 4.6 * s, z); o.scale.set(2.3 * s, 6 * s, 2.3 * s); o.updateMatrix(); crowns.setMatrixAt(i, o.matrix);
    crowns.setColorAt(i, tints[i % 3]);
  });
  trunks.castShadow = crowns.castShadow = true; root.add(trunks, crowns);
  // a few round broadleaf trees mixed in
  const rounds = new THREE.InstancedMesh(G.sph, M.leaf, 12);
  for (let i = 0; i < 12; i++) {
    const [x, z, s] = treePts[(i * 5) % treePts.length];
    o.position.set(x + 4, 3.4 * s, z - 3); o.scale.set(2.4 * s, 2.1 * s, 2.4 * s); o.updateMatrix(); rounds.setMatrixAt(i, o.matrix);
    rounds.setColorAt(i, tints[(i + 1) % 3]);
  }
  rounds.castShadow = true; root.add(rounds);

  // ---------- distant low hills / berms on the horizon (fade into fog)
  const hills = [[-150, -175, 70, 14, 30], [-40, -190, 90, 18, 34], [90, -180, 80, 12, 28], [175, -60, 40, 10, 70], [-180, 40, 40, 12, 80], [160, 120, 50, 9, 40], [-130, 170, 70, 10, 30]];
  hills.forEach(([x, z, rx, ry, rz], i) => {
    const h = new THREE.Mesh(G.sph, i % 2 ? M.hill : M.hill2); h.scale.set(rx, ry, rz); h.position.set(x, -2, z); h.receiveShadow = true; root.add(h);
  });

  // ---------- decor only: never cast pick rays
  root.traverse((obj) => { obj.userData.decor = true; obj.raycast = () => {}; });
  return root;
}
