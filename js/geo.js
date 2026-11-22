// Geometry helpers shared by the 2D plan, the 3D scene, the auto-layout and the coach.
// Room space: x runs 0..room.w (west -> east), z runs 0..room.d (north -> south).
// Item rotation r is in degrees around the vertical axis; at r = 0 the item's front faces +z (south).

export const DEG = Math.PI / 180;

export function rot(lx, lz, r) {
  const a = r * DEG, c = Math.cos(a), s = Math.sin(a);
  return [lx * c + lz * s, -lx * s + lz * c];
}

// Oriented box: { cx, cz, hw, hd, r }
export function corners(o) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const [dx, dz] = rot(sx * o.hw, sz * o.hd, o.r);
    return [o.cx + dx, o.cz + dz];
  });
}

export function aabb(o) {
  const cs = corners(o);
  return {
    x0: Math.min(...cs.map(c => c[0])), x1: Math.max(...cs.map(c => c[0])),
    z0: Math.min(...cs.map(c => c[1])), z1: Math.max(...cs.map(c => c[1])),
  };
}

function axes(o) {
  const [ax, az] = rot(1, 0, o.r), [bx, bz] = rot(0, 1, o.r);
  return [[ax, az], [bx, bz]];
}

// Separating-axis test. `slack` lets boxes touch (or overlap a hair) without counting as a collision.
export function overlap(a, b, slack = 0.02) {
  const ca = corners(a), cb = corners(b);
  for (const [nx, nz] of [...axes(a), ...axes(b)]) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of ca) { const p = x * nx + z * nz; a0 = Math.min(a0, p); a1 = Math.max(a1, p); }
    for (const [x, z] of cb) { const p = x * nx + z * nz; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
    if (a1 - slack <= b0 || b1 - slack <= a0) return false;
  }
  return true;
}

export function pointIn(o, x, z) {
  const dx = x - o.cx, dz = z - o.cz;
  const a = -o.r * DEG, c = Math.cos(a), s = Math.sin(a);
  const lx = dx * c + dz * s, lz = -dx * s + dz * c;
  return Math.abs(lx) <= o.hw && Math.abs(lz) <= o.hd;
}

// Footprint boxes of an item (L-shaped pieces have more than one).
export function itemRects(item, def, grow = 0) {
  const parts = def.rects || [[0, 0, def.w, def.d]];
  return parts.map(([ox, oz, w, d]) => {
    const [dx, dz] = rot(ox, oz, item.r);
    return { cx: item.x + dx, cz: item.z + dz, hw: w / 2 + grow, hd: d / 2 + grow, r: item.r };
  });
}

// The strip of floor in front of an item that must stay free so the item can be used.
export function frontZone(item, def, depth = def.front) {
  if (!depth) return null;
  const [dx, dz] = rot(0, def.d / 2 + depth / 2, item.r);
  return { cx: item.x + dx, cz: item.z + dz, hw: def.w / 2 - 0.03, hd: depth / 2, r: item.r };
}

export function itemBounds(item, def) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const r of itemRects(item, def)) {
    const b = aabb(r);
    x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1);
  }
  return { x0, x1, z0, z1 };
}

export function insideRoom(o, room, tol = 0.02) {
  const b = aabb(o);
  return b.x0 >= -tol && b.z0 >= -tol && b.x1 <= room.w + tol && b.z1 <= room.d + tol;
}

// Walls: 0 north (z = 0), 1 east (x = w), 2 south (z = d), 3 west (x = 0).
export function wallLength(room, wall) { return wall % 2 === 0 ? room.w : room.d; }

// Centre point on the inner face of a wall, `pos` metres along it.
export function wallPoint(room, wall, pos) {
  if (wall === 0) return [pos, 0];
  if (wall === 1) return [room.w, pos];
  if (wall === 2) return [pos, room.d];
  return [0, pos];
}
export const WALL_FACING = [0, 270, 180, 90]; // rotation that faces into the room

export function nearestWall(room, x, z) {
  const ds = [z, room.w - x, room.d - z, x];
  let best = 0;
  for (let i = 1; i < 4; i++) if (ds[i] < ds[best]) best = i;
  return best;
}

// Floor area in front of an opening (door swing / window access).
export function openingZone(room, op, depth) {
  const [x, z] = wallPoint(room, op.wall, op.pos);
  const r = WALL_FACING[op.wall];
  const [dx, dz] = rot(0, depth / 2, r);
  return { cx: x + dx, cz: z + dz, hw: op.w / 2, hd: depth / 2, r };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const round2 = v => Math.round(v * 100) / 100;

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  const t = l2 ? clamp(((px - ax) * vx + (pz - az) * vz) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
// Shortest gap between two oriented boxes (0 when they overlap).
export function rectDist(a, b) {
  if (overlap(a, b, 0)) return 0;
  const ca = corners(a), cb = corners(b);
  let m = Infinity;
  for (const [p, q] of [[ca, cb], [cb, ca]]) {
    for (const [x, z] of p) for (let i = 0; i < 4; i++) {
      const [ax, az] = q[i], [bx, bz] = q[(i + 1) % 4];
      m = Math.min(m, segDist(x, z, ax, az, bx, bz));
    }
  }
  return m;
}
