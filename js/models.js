// Procedural low-poly furniture. Every piece is built in its own frame:
// centre of the footprint at the origin, floor at y = 0, back toward -z, front toward +z.
import * as THREE from '../vendor/three.module.min.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import { CATALOG } from './catalog.js';
import { shade } from './styles.js';

const mats = new Map();
const glowMats = new Set();
let glowLevel = 0;

function M(hex, rough = 0.85, opt = {}) {
  const key = hex + '|' + rough + '|' + JSON.stringify(opt);
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: opt.metal || 0, flatShading: !!opt.flat });
    if (opt.glow) {
      m.emissive = new THREE.Color(opt.glow);
      m.emissiveIntensity = glowLevel * (opt.power || 1);
      m.userData.power = opt.power || 1;
      glowMats.add(m);
    }
    if (opt.glass) { m.transparent = true; m.opacity = 0.28; m.depthWrite = false; }
    mats.set(key, m);
  }
  return m;
}
export const material = M;

// 0 = daytime (lamps off), 1 = night (lamps and screens glow).
export function setGlow(level) {
  glowLevel = level;
  for (const m of glowMats) m.emissiveIntensity = level * m.userData.power;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kit(g) {
  const put = (geo, m, x, y, z, shadow = true) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  return {
    g,
    // y is always the underside of the part.
    box: (m, w, h, d, x, y, z, r = 0) => put(
      r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)) : new THREE.BoxGeometry(w, h, d),
      m, x, y + h / 2, z),
    cyl: (m, rt, rb, h, x, y, z, seg = 24) => put(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z),
    blob: (m, r, x, y, z, detail = 0) => put(new THREE.IcosahedronGeometry(r, detail), m, x, y, z),
    flat: (m, w, h, d, x, y, z) => put(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z, false),
  };
}

function legs(k, m, w, d, h, inset = 0.06, r = 0.02) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(m, r, r * 0.75, h, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), 10);
}

function sofa(k, P, w, d, seats) {
  const main = M(P.main, 0.95), cush = M(shade(P.main, 0.1), 0.95);
  k.box(main, w, 0.2, d, 0, 0.1, 0, 0.04);
  k.box(main, w, 0.5, 0.2, 0, 0.26, -d / 2 + 0.1, 0.07);
  for (const s of [-1, 1]) k.box(main, 0.16, 0.36, d, s * (w / 2 - 0.08), 0.22, 0, 0.06);
  const sw = (w - 0.34) / seats;
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + 0.17 + sw * (i + 0.5);
    k.box(cush, sw - 0.02, 0.15, d - 0.3, x, 0.3, 0.08, 0.05);
    k.box(cush, sw - 0.05, 0.34, 0.14, x, 0.45, -d / 2 + 0.28, 0.06).rotation.x = -0.16;
  }
  legs(k, M(P.wood), w, d, 0.1, 0.08);
  if (seats > 1) {
    const p = k.box(M(P.accents[0], 0.95), 0.36, 0.36, 0.11, w / 2 - 0.4, 0.46, -d / 2 + 0.42, 0.05);
    p.rotation.set(-0.3, -0.25, 0.08);
  }
}

function sofaL(k, P) {
  const main = M(P.main, 0.95), cush = M(shade(P.main, 0.1), 0.95);
  k.box(main, 2.5, 0.2, 0.9, 0, 0.1, -0.35, 0.04);
  k.box(main, 0.9, 0.2, 0.75, -0.8, 0.1, 0.42, 0.04);
  k.box(main, 2.5, 0.5, 0.2, 0, 0.26, -0.7, 0.07);
  k.box(main, 0.16, 0.36, 0.9, 1.17, 0.22, -0.35, 0.06);
  k.box(main, 0.16, 0.36, 1.6, -1.17, 0.22, 0, 0.06);
  for (let i = 0; i < 2; i++) {
    const x = -0.36 + 0.73 + i * 0.73 - 0.365;
    k.box(cush, 0.71, 0.15, 0.6, x + 0.37, 0.3, -0.27, 0.05);
    k.box(cush, 0.68, 0.34, 0.14, x + 0.37, 0.45, -0.52, 0.06).rotation.x = -0.16;
  }
  k.box(cush, 0.72, 0.15, 1.3, -0.72, 0.3, 0.1, 0.05);
  k.box(cush, 0.68, 0.34, 0.14, -0.72, 0.45, -0.52, 0.06).rotation.x = -0.16;
  k.box(M(P.accents[0], 0.95), 0.36, 0.36, 0.11, 0.75, 0.46, -0.38, 0.05).rotation.set(-0.3, -0.25, 0.08);
  k.box(M(P.accents[1], 0.95), 0.32, 0.32, 0.1, -0.7, 0.46, -0.36, 0.05).rotation.set(-0.3, 0.2, -0.06);
}

function bed(k, P, w, d) {
  const frame = M(P.wood), sheet = M(P.white, 0.95), duvet = M(P.main, 0.95);
  k.box(frame, w, 0.22, d, 0, 0.08, 0, 0.02);
  legs(k, frame, w, d, 0.08, 0.07, 0.025);
  k.box(M(shade(P.main, -0.12), 0.95), w, 0.88, 0.08, 0, 0.08, -d / 2 + 0.04, 0.03);
  k.box(sheet, w - 0.06, 0.2, d - 0.12, 0, 0.3, 0.02, 0.06);
  k.box(duvet, w - 0.02, 0.09, d * 0.62, 0, 0.45, d * 0.17, 0.04);
  k.box(M(shade(P.main, 0.18), 0.95), w - 0.02, 0.095, 0.22, 0, 0.45, d * 0.17 - d * 0.31 + 0.1, 0.04);
  const n = w > 1.2 ? 2 : 1, pw = Math.min(0.62, (w - 0.16) / n - 0.04);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (pw + 0.08);
    k.box(sheet, pw, 0.12, 0.38, x, 0.5, -d / 2 + 0.34, 0.055).rotation.x = -0.12;
  }
  if (n > 1) k.box(M(P.accents[0], 0.95), 0.4, 0.14, 0.26, 0, 0.52, -d / 2 + 0.56, 0.06);
}

function fronts(k, m, handle, w, y0, h, z, cols, rows = 1, knob = false) {
  const cw = w / cols, rh = h / rows;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const x = -w / 2 + cw * (c + 0.5), y = y0 + rh * r;
    k.box(m, cw - 0.012, rh - 0.012, 0.018, x, y + 0.006, z);
    if (knob) k.box(handle, Math.min(0.16, cw * 0.3), 0.014, 0.02, x, y + rh - 0.07, z + 0.016);
    else k.box(handle, 0.014, Math.min(0.3, rh * 0.25), 0.02, x + (c % 2 ? -1 : 1) * (cw / 2 - 0.05), y + rh * 0.45, z + 0.016);
  }
}

function books(k, P, seed, x0, x1, y, depthZ, maxH) {
  const r = rng(seed);
  const colours = [P.accents[0], P.accents[1], P.accents[2], P.white, shade(P.fabric, -0.2), shade(P.wood, 0.3), '#3d4043'];
  let x = x0 + 0.02;
  while (x < x1 - 0.05) {
    if (r() < 0.16) { x += 0.05 + r() * 0.08; continue; }
    const bw = 0.022 + r() * 0.03, bh = maxH * (0.62 + r() * 0.3);
    if (x + bw > x1 - 0.01) break;
    k.box(M(colours[Math.floor(r() * colours.length)], 0.9), bw, bh, 0.15 + r() * 0.04, x + bw / 2, y, depthZ);
    x += bw + 0.003;
  }
}

function plantLeaves(k, P, seed, n, spread, y0, size) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r(), rad = spread * (0.35 + r() * 0.65);
    const b = k.blob(M(i % 2 ? P.leaf : P.leafDark, 0.9, { flat: true }), size * (0.75 + r() * 0.5), Math.cos(a) * rad, y0 + r() * spread * 1.4, Math.sin(a) * rad);
    b.scale.set(1, 0.72 + r() * 0.4, 1);
    b.rotation.set(r() * 3, r() * 3, r() * 3);
  }
}

const BUILD = {
  sofa2: (k, P, d) => sofa(k, P, d.w, d.d, 2),
  sofa3: (k, P, d) => sofa(k, P, d.w, d.d, 3),
  sofaL: (k, P) => sofaL(k, P),
  armchair: (k, P, d) => sofa(k, P, d.w, d.d, 1),
  pouf: (k, P) => {
    k.cyl(M(P.main, 0.95), 0.24, 0.25, 0.34, 0, 0.02, 0, 28);
    k.cyl(M(shade(P.main, 0.12), 0.95), 0.2, 0.24, 0.04, 0, 0.36, 0, 28);
  },
  chair: (k, P) => {
    const m = M(P.main), seat = M(P.fabric, 0.95);
    for (const sx of [-1, 1]) {
      k.cyl(m, 0.018, 0.014, 0.44, sx * 0.18, 0, 0.19, 8);
      k.cyl(m, 0.018, 0.014, 0.84, sx * 0.18, 0, -0.21, 8);
    }
    k.box(m, 0.42, 0.035, 0.44, 0, 0.42, 0, 0.012);
    k.box(seat, 0.38, 0.03, 0.38, 0, 0.45, 0.01, 0.014);
    k.box(m, 0.4, 0.2, 0.025, 0, 0.62, -0.21, 0.01);
  },
  officeChair: (k, P) => {
    const metal = M('#2a2c2f', 0.5, { metal: 0.4 }), cloth = M(P.main, 0.95);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const arm = k.box(metal, 0.3, 0.025, 0.04, Math.cos(a) * 0.14, 0.05, Math.sin(a) * 0.14);
      arm.rotation.y = -a;
      k.cyl(metal, 0.028, 0.028, 0.04, Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27, 10);
    }
    k.cyl(metal, 0.025, 0.025, 0.36, 0, 0.07, 0, 10);
    k.box(cloth, 0.48, 0.08, 0.46, 0, 0.43, 0.02, 0.035);
    k.box(metal, 0.05, 0.3, 0.03, 0, 0.45, -0.22);
    k.box(cloth, 0.44, 0.42, 0.07, 0, 0.58, -0.22, 0.03).rotation.x = -0.1;
  },

  coffee: (k, P, d) => {
    const m = M(P.main, 0.6);
    k.box(m, d.w, 0.04, d.d, 0, 0.36, 0, 0.012);
    k.box(M(shade(P.main, -0.15), 0.6), d.w - 0.14, 0.02, d.d - 0.12, 0, 0.12, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(m, 0.04, 0.36, 0.04, sx * (d.w / 2 - 0.05), 0, sz * (d.d / 2 - 0.05));
    k.box(M(P.accents[1], 0.9), 0.24, 0.03, 0.17, -0.2, 0.4, 0.02);
    k.box(M(P.white, 0.9), 0.2, 0.025, 0.15, -0.2, 0.43, 0.02).rotation.y = 0.3;
  },
  coffeeRound: (k, P, d) => {
    k.cyl(M(P.main, 0.6), d.w / 2, d.w / 2, 0.04, 0, 0.36, 0, 40);
    const metal = M(P.metal, 0.45, { metal: 0.5 });
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; k.cyl(metal, 0.014, 0.014, 0.36, Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26, 8); }
    k.cyl(metal, 0.27, 0.27, 0.012, 0, 0.1, 0, 28);
  },
  sideTable: (k, P, d) => {
    const metal = M(P.metal, 0.45, { metal: 0.5 });
    k.cyl(M(P.main, 0.6), d.w / 2, d.w / 2, 0.03, 0, 0.47, 0, 32);
    k.cyl(metal, 0.016, 0.016, 0.46, 0, 0.01, 0, 10);
    k.cyl(metal, 0.15, 0.16, 0.015, 0, 0, 0, 28);
  },
  dining4: (k, P, d) => BUILD.dining6(k, P, d),
  dining6: (k, P, d) => {
    const m = M(P.main, 0.55);
    k.box(m, d.w, 0.045, d.d, 0, 0.705, 0, 0.014);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(m, 0.03, 0.02, 0.705, sx * (d.w / 2 - 0.09), 0, sz * (d.d / 2 - 0.09), 12);
    k.cyl(M(P.accents[0], 0.7), 0.07, 0.05, 0.16, 0, 0.75, 0, 16);
    plantLeaves(k, P, 5, 5, 0.07, 0.95, 0.06);
  },
  diningRound: (k, P, d) => {
    const m = M(P.main, 0.55);
    k.cyl(m, d.w / 2, d.w / 2, 0.04, 0, 0.71, 0, 48);
    k.cyl(m, 0.05, 0.07, 0.69, 0, 0.02, 0, 16);
    k.cyl(m, 0.28, 0.3, 0.025, 0, 0, 0, 32);
    k.cyl(M(P.accents[0], 0.7), 0.06, 0.045, 0.14, 0, 0.75, 0, 16);
  },
  desk: (k, P, d) => {
    const m = M(P.main, 0.6), metal = M(P.metal, 0.5, { metal: 0.4 });
    k.box(m, d.w, 0.035, d.d, 0, 0.715, 0, 0.01);
    for (const sz of [-1, 1]) k.box(metal, 0.03, 0.715, 0.03, -d.w / 2 + 0.06, 0, sz * (d.d / 2 - 0.06));
    k.box(M(shade(P.main, -0.1), 0.6), 0.38, 0.6, d.d - 0.08, d.w / 2 - 0.2, 0.115, 0);
    fronts(k, M(shade(P.main, 0.06), 0.6), metal, 0.36, 0.13, 0.57, d.d / 2 - 0.035, 1, 3, true);
    k.box(M('#2d2f33', 0.5), 0.34, 0.014, 0.23, -0.12, 0.75, 0.05);
    k.box(M('#2d2f33', 0.5), 0.34, 0.22, 0.012, -0.12, 0.76, -0.075).rotation.x = -0.2;
  },
  tv: (k, P, d) => {
    const m = M(P.main, 0.6);
    k.box(m, d.w, 0.36, d.d, 0, 0.1, 0, 0.012);
    legs(k, M(P.metal, 0.5, { metal: 0.4 }), d.w, d.d, 0.1, 0.07, 0.016);
    fronts(k, M(shade(P.main, 0.07), 0.6), M(P.metal, 0.5), d.w - 0.03, 0.115, 0.33, d.d / 2 - 0.004, 3);
    const black = M('#17181a', 0.4);
    k.box(black, 0.3, 0.02, 0.18, 0, 0.46, -0.04);
    k.box(black, 0.05, 0.08, 0.03, 0, 0.48, -0.06);
    k.box(black, 1.22, 0.7, 0.03, 0, 0.53, -0.06, 0.006);
    k.flat(M('#0d1014', 0.25, { glow: '#5f7fae', power: 0.5 }), 1.18, 0.66, 0.004, 0, 0.55, -0.043);
  },

  bedSingle: (k, P, d) => bed(k, P, d.w, d.d),
  bedDouble: (k, P, d) => bed(k, P, d.w, d.d),
  bedQueen: (k, P, d) => bed(k, P, d.w, d.d),
  bedside: (k, P, d) => {
    const m = M(P.main, 0.6);
    k.box(m, d.w, 0.36, d.d, 0, 0.14, 0, 0.012);
    legs(k, m, d.w, d.d, 0.14, 0.05, 0.016);
    fronts(k, M(shade(P.main, 0.07), 0.6), M(P.metal, 0.5), d.w - 0.03, 0.155, 0.33, d.d / 2 - 0.004, 1, 2, true);
  },

  wardrobe: (k, P, d) => {
    k.box(M('#2b2a29'), d.w - 0.04, 0.06, d.d - 0.06, 0, 0, 0);
    k.box(M(P.main, 0.6), d.w, d.h - 0.06, d.d - 0.02, 0, 0.06, -0.01, 0.008);
    fronts(k, M(shade(P.main, 0.07), 0.6), M(P.metal, 0.5, { metal: 0.3 }), d.w - 0.02, 0.07, d.h - 0.08, d.d / 2 - 0.016, Math.round(d.w / 0.6));
  },
  wardrobeL: (k, P, d) => BUILD.wardrobe(k, P, d),
  bookshelf: (k, P, d) => {
    const m = M(P.main, 0.6), t = 0.025;
    k.box(M(shade(P.main, -0.08), 0.6), d.w, d.h, 0.012, 0, 0, -d.d / 2 + 0.006);
    for (const s of [-1, 1]) k.box(m, t, d.h, d.d, s * (d.w / 2 - t / 2), 0, 0);
    const n = 5, gap = (d.h - t) / n;
    for (let i = 0; i <= n; i++) k.box(m, d.w - t * 2, t, d.d - 0.012, 0, i * gap, 0.006);
    for (let i = 0; i < n; i++) {
      if (i === 2) {
        k.cyl(M(P.accents[0], 0.7), 0.06, 0.045, 0.16, -0.15, i * gap + t, 0.02, 16);
        books(k, P, 30 + i, 0, d.w / 2 - t, i * gap + t, 0.02, gap - t - 0.03);
      } else books(k, P, 30 + i, -d.w / 2 + t, d.w / 2 - t, i * gap + t, 0.02, gap - t - 0.03);
    }
  },
  cabinet: (k, P, d) => {
    const m = M(P.main, 0.6);
    k.box(m, d.w, d.h - 0.16, d.d, 0, 0.16, 0, 0.012);
    legs(k, M(P.metal, 0.5, { metal: 0.4 }), d.w, d.d, 0.16, 0.07, 0.016);
    fronts(k, M(shade(P.main, 0.07), 0.6), M(P.metal, 0.5), d.w - 0.03, 0.175, d.h - 0.19, d.d / 2 - 0.004, 3);
  },
  drawers: (k, P, d) => {
    const m = M(P.main, 0.6);
    k.box(m, d.w, d.h - 0.1, d.d, 0, 0.1, 0, 0.012);
    legs(k, m, d.w, d.d, 0.1, 0.06, 0.02);
    fronts(k, M(shade(P.main, 0.07), 0.6), M(P.metal, 0.5), d.w - 0.03, 0.115, d.h - 0.13, d.d / 2 - 0.004, 1, 4, true);
  },
  shoeCab: (k, P, d) => {
    k.box(M(P.main, 0.6), d.w, d.h - 0.04, d.d, 0, 0.04, 0, 0.01);
    fronts(k, M(shade(P.main, 0.07), 0.6), M(P.metal, 0.5), d.w - 0.03, 0.055, d.h - 0.07, d.d / 2 - 0.004, 1, 2, true);
  },

  floorLamp: (k, P) => {
    const metal = M(P.main, 0.45, { metal: 0.5 });
    k.cyl(metal, 0.14, 0.15, 0.02, 0, 0, 0, 28);
    k.cyl(metal, 0.012, 0.012, 1.34, 0, 0.02, 0, 8);
    k.cyl(M('#f3e6cf', 0.9, { glow: '#ffc98a', power: 1.6 }), 0.13, 0.17, 0.26, 0, 1.32, 0, 28).castShadow = false;
  },
  tableLamp: (k, P) => {
    k.cyl(M(P.accents[0], 0.6), 0.05, 0.075, 0.2, 0, 0, 0, 20);
    k.cyl(M(P.main, 0.45, { metal: 0.5 }), 0.008, 0.008, 0.08, 0, 0.2, 0, 8);
    k.cyl(M('#f3e6cf', 0.9, { glow: '#ffc98a', power: 1.6 }), 0.085, 0.125, 0.18, 0, 0.26, 0, 24).castShadow = false;
  },
  pendant: (k, P, d, H) => {
    const y = H - 0.95;
    k.cyl(M('#3a3a3a'), 0.004, 0.004, H - y - 0.2, 0, y + 0.2, 0, 6).castShadow = false;
    k.cyl(M(P.main, 0.5, { metal: 0.4 }), 0.05, 0.22, 0.2, 0, y, 0, 32).castShadow = false;
    k.blob(M('#fff1d6', 0.9, { glow: '#ffd9a0', power: 2.2 }), 0.06, 0, y + 0.03, 0, 2).castShadow = false;
  },

  rugS: (k, P, d) => {
    k.flat(M(P.main, 1), d.w, 0.012, d.d, 0, 0, 0);
    k.flat(M(shade(P.main, 0.14), 1), d.w - 0.24, 0.014, d.d - 0.24, 0, 0, 0);
    k.flat(M(P.main, 1), d.w - 0.34, 0.016, d.d - 0.34, 0, 0, 0);
  },
  rugL: (k, P, d) => BUILD.rugS(k, P, d),
  rugRound: (k, P, d) => {
    const disc = (m, r, h) => { const c = k.cyl(m, r, r, h, 0, 0, 0, 48); c.castShadow = false; };
    disc(M(P.main, 1), d.w / 2, 0.012);
    disc(M(shade(P.main, 0.14), 1), d.w / 2 - 0.12, 0.014);
    disc(M(P.main, 1), d.w / 2 - 0.18, 0.016);
  },
  plantL: (k, P) => {
    k.cyl(M(P.main, 0.7), 0.17, 0.13, 0.34, 0, 0, 0, 24);
    k.cyl(M('#4a3b2c', 1), 0.155, 0.155, 0.01, 0, 0.33, 0, 20);
    k.cyl(M('#6a5238', 1), 0.018, 0.024, 0.6, 0, 0.34, 0, 8);
    plantLeaves(k, P, 11, 11, 0.22, 0.86, 0.17);
  },
  plantS: (k, P) => {
    k.cyl(M(P.main, 0.7), 0.065, 0.05, 0.11, 0, 0, 0, 18);
    plantLeaves(k, P, 3, 5, 0.05, 0.16, 0.055);
  },
  art: (k, P, d) => {
    const y = d.y;
    k.box(M(shade(P.wood, -0.25), 0.6), d.w, d.h, 0.03, 0, y, -0.005);
    k.flat(M(P.white, 0.95), d.w - 0.07, d.h - 0.07, 0.004, 0, y + 0.035, 0.011);
    k.flat(M(P.main, 0.95), d.w * 0.34, d.h * 0.5, 0.004, -d.w * 0.2, y + 0.09, 0.014);
    k.flat(M(P.fabric, 0.95), d.w * 0.5, d.h * 0.16, 0.004, d.w * 0.08, y + 0.1, 0.016);
    const c = k.cyl(M(P.accents[1], 0.95), d.h * 0.19, d.h * 0.19, 0.004, d.w * 0.2, y + d.h * 0.62 - 0.002, 0.016, 32);
    c.rotation.x = Math.PI / 2; c.castShadow = false;
  },
  mirror: (k, P, d) => {
    k.box(M(P.main, 0.45, { metal: 0.5 }), d.w, d.h, 0.03, 0, d.y, -0.005, 0.01);
    k.flat(M('#d3e2ea', 0.08, { metal: 0.35 }), d.w - 0.05, d.h - 0.05, 0.004, 0, d.y + 0.025, 0.011);
  },
  wallShelf: (k, P, d) => {
    const y = d.y;
    k.box(M(P.main, 0.6), d.w, 0.03, d.d, 0, y, 0);
    for (const s of [-1, 1]) k.box(M(P.metal, 0.5, { metal: 0.4 }), 0.02, 0.12, 0.02, s * (d.w / 2 - 0.1), y - 0.12, -d.d / 2 + 0.01);
    books(k, P, 77, -d.w / 2 + 0.02, 0.02, y + 0.03, 0, 0.24);
    k.cyl(M(P.pot, 0.7), 0.05, 0.04, 0.09, d.w / 2 - 0.14, y + 0.03, 0, 16);
    const g2 = new THREE.Group(); g2.position.set(d.w / 2 - 0.14, y + 0.03, 0); k.g.add(g2);
    plantLeaves(kit(g2), P, 9, 4, 0.04, 0.13, 0.045);
  },

  kitchen: (k, P, d) => {
    const m = M(P.main, 0.5), metal = M('#b9bcc0', 0.35, { metal: 0.6 }), top = M(P.wood, 0.55);
    const bd = d.d - 0.04;
    k.box(M('#2b2a29'), d.w - 0.02, 0.09, bd - 0.06, 0, 0, -0.04);
    k.box(m, d.w, 0.77, bd, 0, 0.09, -0.02);
    fronts(k, M(shade(P.main, P.main === P.white ? -0.04 : 0.07), 0.5), metal, d.w - 0.02, 0.1, 0.75, bd / 2 - 0.016, 3, 1, true);
    k.box(top, d.w, 0.04, d.d, 0, 0.86, 0);
    k.flat(M(shade(P.white, -0.06), 0.4), d.w, 0.55, 0.012, 0, 0.9, -d.d / 2 + 0.006);
    k.flat(M('#8d9196', 0.3, { metal: 0.6 }), 0.42, 0.006, 0.34, -0.5, 0.9, 0.02);
    k.cyl(metal, 0.012, 0.012, 0.2, -0.5, 0.9, -0.2, 8);
    k.box(metal, 0.02, 0.02, 0.12, -0.5, 1.08, -0.15);
    k.flat(M('#17181a', 0.25), 0.52, 0.008, 0.4, 0.45, 0.9, 0.02);
    for (const [x, z] of [[-0.12, -0.09], [0.12, -0.09], [-0.12, 0.1], [0.12, 0.1]]) {
      const ring = k.cyl(M('#3a3c40', 0.4), 0.07, 0.07, 0.004, 0.45 + x, 0.908, 0.02 + z, 20);
      ring.castShadow = false;
    }
    k.box(m, d.w, 0.62, 0.34, 0, 1.46, -d.d / 2 + 0.17);
    fronts(k, M(shade(P.main, P.main === P.white ? -0.04 : 0.07), 0.5), metal, d.w - 0.02, 1.47, 0.6, -d.d / 2 + 0.34 - 0.004, 3);
  },
  fridge: (k, P, d) => {
    const m = M(P.main, 0.35, { metal: 0.25 }), metal = M('#9da1a6', 0.35, { metal: 0.6 });
    k.box(m, d.w, d.h, d.d - 0.05, 0, 0, -0.025, 0.012);
    k.box(M(shade(P.main, -0.05), 0.35, { metal: 0.25 }), d.w - 0.012, 1.02, 0.03, 0, 0.66, d.d / 2 - 0.03, 0.008);
    k.box(M(shade(P.main, -0.05), 0.35, { metal: 0.25 }), d.w - 0.012, 0.62, 0.03, 0, 0.02, d.d / 2 - 0.03, 0.008);
    k.box(metal, 0.018, 0.4, 0.025, -d.w / 2 + 0.06, 0.78, d.d / 2);
    k.box(metal, 0.018, 0.3, 0.025, -d.w / 2 + 0.06, 0.28, d.d / 2);
  },
};

export function slotColor(slot, pal) {
  return { fabric: pal.fabric, wood: pal.wood, accent: pal.accents[0], metal: pal.metal, rug: pal.rug, pot: pal.pot, white: pal.white }[slot] || pal.fabric;
}
export function mainColor(item, pal) {
  return item.c || slotColor(CATALOG[item.t].slot, pal);
}

export function buildItem(item, pal, H = 2.6) {
  const def = CATALOG[item.t];
  const g = new THREE.Group();
  const P = { ...pal, main: mainColor(item, pal) };
  (BUILD[item.t] || ((k) => k.box(M(P.main), def.w, def.h, def.d, 0, 0, 0)))(kit(g), P, def, H);
  g.userData.id = item.id;
  return g;
}

export function disposeGroup(g) {
  g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
}
