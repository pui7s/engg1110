// Placement rules + the auto-layout that gives beginners a sensible starting room.
import { CATALOG, layerOf, isFloor, canShare } from './catalog.js';
import { evaluate } from './coach.js';
import {
  rot, overlap, insideRoom, itemRects, itemBounds, frontZone, openingZone, pointIn, rectDist,
  wallLength, wallPoint, nearestWall, WALL_FACING, clamp, round2,
} from './geo.js';

let seq = 0;
export const newId = () => (Date.now().toString(36).slice(-5) + (seq++).toString(36) + Math.floor(Math.random() * 1296).toString(36));

export const DOOR_CLEAR = 0.9;

// ---------------------------------------------------------------------------
// Snapping and validity
// ---------------------------------------------------------------------------
export function snapWall(room, item) {
  const def = CATALOG[item.t];
  const wall = nearestWall(room, item.x, item.z);
  const len = wallLength(room, wall);
  const along = clamp(wall % 2 === 0 ? item.x : item.z, def.w / 2 + 0.05, len - def.w / 2 - 0.05);
  const [wx, wz] = wallPoint(room, wall, along);
  const [dx, dz] = rot(0, def.d / 2, WALL_FACING[wall]);
  item.x = round2(wx + dx); item.z = round2(wz + dz); item.r = WALL_FACING[wall];
  return wall;
}

// Keep an item inside the room; floor pieces also snap flush when they get close to a wall.
export function settle(room, item) {
  const def = CATALOG[item.t];
  if (layerOf(def) === 'wall') { snapWall(room, item); return; }
  const snap = isFloor(def) ? 0.1 : 0;
  const b = itemBounds(item, def);
  if (b.x1 - b.x0 > room.w) item.x = room.w / 2;
  else if (b.x0 < snap) item.x -= b.x0;
  else if (b.x1 > room.w - snap) item.x += room.w - b.x1;
  if (b.z1 - b.z0 > room.d) item.z = room.d / 2;
  else if (b.z0 < snap) item.z -= b.z0;
  else if (b.z1 > room.d - snap) item.z += room.d - b.z1;
  item.x = round2(item.x); item.z = round2(item.z);
}

export function clampOpening(room, op) {
  const len = wallLength(room, op.wall);
  op.w = Math.min(op.w, len - 0.3);
  op.pos = round2(clamp(op.pos, op.w / 2 + 0.1, len - op.w / 2 - 0.1));
}

export function doorZones(room) {
  return room.openings.filter(o => o.kind === 'door').map(o => openingZone(room, o, DOOR_CLEAR));
}

function rectsHit(as, bs) {
  for (const a of as) for (const b of bs) if (overlap(a, b)) return true;
  return false;
}

// Pairs of floor pieces that overlap each other.
export function findCollisions(room) {
  const floor = room.items.filter(i => isFloor(CATALOG[i.t]));
  const rects = floor.map(i => itemRects(i, CATALOG[i.t]));
  const out = [];
  for (let a = 0; a < floor.length; a++) for (let b = a + 1; b < floor.length; b++) {
    if (canShare(CATALOG[floor[a].t], CATALOG[floor[b].t])) continue;
    if (rectsHit(rects[a], rects[b])) out.push([floor[a], floor[b]]);
  }
  return out;
}

// Does `item` sit in the room without hitting anything? `strict` also protects use-zones in front of furniture.
export function fits(room, item, { strict = false } = {}) {
  const def = CATALOG[item.t];
  const mine = itemRects(item, def);
  if (!mine.every(r => insideRoom(r, room))) return false;
  if (!isFloor(def)) return true;
  if (rectsHit(mine, doorZones(room))) return false;
  const myZone = strict ? frontZone(item, def) : null;
  if (myZone && !insideRoom(myZone, room, 0.05)) return false;
  if (strict && def.tall) {
    const wins = room.openings.filter(o => o.kind === 'window').map(o => openingZone(room, o, 0.5));
    if (rectsHit(mine, wins)) return false;
  }
  for (const other of room.items) {
    if (other.id === item.id) continue;
    const od = CATALOG[other.t];
    if (!isFloor(od) || canShare(def, od)) continue;
    const theirs = itemRects(other, od);
    if (rectsHit(mine, theirs)) return false;
    if (strict) {
      if (myZone && rectsHit([myZone], theirs)) return false;
      const oz = frontZone(other, od);
      if (oz && rectsHit(mine, [oz])) return false;
    }
  }
  return true;
}

// Things that leave less than `need` metres around a dining table, so chairs cannot be pulled out.
export function tableCrowders(room, table, need = 0.55) {
  const def = CATALOG[table.t];
  const body = def.round
    ? { cx: table.x, cz: table.z, hw: 0.001, hd: 0.001, r: 0 }
    : { cx: table.x, cz: table.z, hw: def.w / 2, hd: def.d / 2, r: table.r };
  const reach = need + (def.round ? def.w / 2 : 0);
  const out = [];
  for (const other of room.items) {
    const od = CATALOG[other.t];
    if (other.id === table.id || !isFloor(od) || od.tuck) continue;
    if (itemRects(other, od).some(r => rectDist(body, r) < reach)) out.push(other);
  }
  const b = itemBounds(table, def);
  const wallGap = Math.min(b.x0, b.z0, room.w - b.x1, room.d - b.z1);
  return { items: out, wall: wallGap < need - 0.1 };
}

// Height a small "top" item should stand at: the tallest surface under it, or the floor.
export function topY(room, item) {
  let y = 0;
  for (const other of room.items) {
    const od = CATALOG[other.t];
    if (!od.surface || other.id === item.id) continue;
    if (itemRects(other, od).some(r => pointIn(r, item.x, item.z))) y = Math.max(y, od.h);
  }
  return y;
}

function wallSpan(room, item) {
  const def = CATALOG[item.t];
  const wall = nearestWall(room, item.x, item.z);
  const along = wall % 2 === 0 ? item.x : item.z;
  return { wall, a: along - def.w / 2, b: along + def.w / 2 };
}

export function wallSpotFree(room, item) {
  const def = CATALOG[item.t];
  const me = wallSpan(room, item);
  for (const o of room.openings) {
    if (o.wall === me.wall && me.a < o.pos + o.w / 2 + 0.1 && me.b > o.pos - o.w / 2 - 0.1) return false;
  }
  for (const other of room.items) {
    if (other.id === item.id) continue;
    const od = CATALOG[other.t];
    if (layerOf(od) === 'wall') {
      const s = wallSpan(room, other);
      if (s.wall === me.wall && me.a < s.b + 0.1 && me.b > s.a - 0.1) return false;
    } else if (isFloor(od) && od.h > (def.y || 0) - 0.1) {
      const zone = { cx: item.x, cz: item.z, hw: def.w / 2, hd: 0.2, r: item.r };
      if (rectsHit([zone], itemRects(other, od))) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Finding a free spot for a newly added piece
// ---------------------------------------------------------------------------
export function findSpot(room, t, strictOnly = false) {
  const def = CATALOG[t];
  const item = { id: newId(), t, x: room.w / 2, z: room.d / 2, r: 0 };
  const layer = layerOf(def);

  if (layer === 'wall') {
    let best = null;
    for (const wall of [0, 3, 1, 2]) {
      const len = wallLength(room, wall);
      for (let p = def.w / 2 + 0.2; p <= len - def.w / 2 - 0.2; p += 0.2) {
        const [x, z] = wallPoint(room, wall, p);
        const c = { ...item, x, z };
        snapWall(room, c);
        if (wallSpotFree(room, c)) { best = c; break; }
      }
      if (best) break;
    }
    if (best) return best;
    snapWall(room, item);
    return item;
  }

  if (layer === 'top') {
    // Prefer an empty surface (a lamp belongs on a side table, not the floor).
    const tops = room.items.filter(i => layerOf(CATALOG[i.t]) === 'top');
    const host = room.items.find(i => CATALOG[i.t].surface && !CATALOG[i.t].dining &&
      !tops.some(s => Math.hypot(s.x - i.x, s.z - i.z) < 0.3));
    if (host) { item.x = host.x; item.z = host.z; }
    return item;
  }

  if (layer !== 'floor') {
    // Rugs and pendants: centre them on the room's main piece when there is one.
    const anchor = room.items.find(i => (layer === 'ceil' ? CATALOG[i.t].dining : CATALOG[i.t].seat || CATALOG[i.t].bed));
    if (anchor) {
      const ad = CATALOG[anchor.t];
      const [dx, dz] = layer === 'rug' && ad.seat ? rot(0, ad.d / 2 + 0.5, anchor.r) : [0, 0];
      item.x = anchor.x + dx; item.z = anchor.z + dz; item.r = anchor.r;
    }
    settle(room, item);
    return item;
  }

  let best = null, bestScore = Infinity;
  const step = 0.2;
  for (const r of [0, 90, 180, 270]) {
    for (let x = 0.1; x <= room.w - 0.1; x += step) for (let z = 0.1; z <= room.d - 0.1; z += step) {
      const c = { ...item, x, z, r };
      settle(room, c);
      if (!fits(room, c, { strict: true })) continue;
      let score;
      if (def.back) {
        // Storage, beds and TVs want their back against a wall.
        const [bx, bz] = rot(0, -def.d / 2, c.r);
        const px = c.x + bx, pz = c.z + bz;
        score = Math.min(px, pz, room.w - px, room.d - pz) * 10 + Math.hypot(c.x - room.w / 2, c.z - room.d / 2) * 0.1;
      } else if (def.corner) {
        score = Math.min(c.x, room.w - c.x) + Math.min(c.z, room.d - c.z);
      } else {
        score = Math.hypot(c.x - room.w / 2, c.z - room.d / 2);
      }
      if (score < bestScore - 1e-6) { bestScore = score; best = c; }
    }
  }
  if (best || strictOnly) return best;
  // Nothing free with comfortable clearance: accept any non-overlapping spot, then give up and drop it in the middle.
  for (let x = 0.3; x <= room.w - 0.3; x += step) for (let z = 0.3; z <= room.d - 0.3; z += step) {
    const c = { ...item, x, z };
    settle(room, c);
    if (fits(room, c)) return c;
  }
  settle(room, item);
  return item;
}

// ---------------------------------------------------------------------------
// Auto-layout
// ---------------------------------------------------------------------------
export function defaultOpenings(type, w, d) {
  const door = { id: newId(), kind: 'door', wall: 2, pos: w - 0.75, w: 0.85 };
  const win = { id: newId(), kind: 'window', wall: 0, pos: w / 2, w: clamp(w * 0.45, 1.0, 2.2) };
  if (type === 'studio') win.pos = w * 0.32;
  if (type === 'bedroom' || type === 'office') win.w = clamp(w * 0.4, 0.9, 1.6);
  return [door, win];
}

export function makeRoom(type, w, d, style, name) {
  const room = { id: newId(), type, name, w: round2(w), d: round2(d), h: 2.6, style, wall: null, floor: null, hour: 14, openings: defaultOpenings(type, w, d), items: [] };
  room.openings.forEach(o => clampOpening(room, o));
  autoLayout(room);
  return room;
}

export function autoLayout(room) {
  room.items = [];
  const W = room.w, D = room.d, area = W * D;
  const def = t => CATALOG[t];

  const add = (t, cands, strict = true) => {
    for (const c of [].concat(cands)) {
      if (!c) continue;
      const item = { id: newId(), t, x: c.x, z: c.z, r: ((c.r % 360) + 360) % 360 };
      settle(room, item);
      if (layerOf(def(t)) === 'wall' ? wallSpotFree(room, item) : fits(room, item, { strict })) {
        room.items.push(item);
        return item;
      }
    }
    return null;
  };
  // Try every free spot for a finishing touch and keep the one the coach likes best (or none if it hurts).
  const auto = t => {
    const before = evaluate(room).score;
    let best = null, bestScore = -Infinity;
    for (let x = 0.3; x <= W - 0.29; x += 0.3) for (let z = 0.3; z <= D - 0.29; z += 0.3) {
      const c = { id: newId(), t, x, z, r: 0 };
      settle(room, c);
      if (Math.min(c.x, W - c.x, c.z, D - c.z) > 0.45 || !fits(room, c, { strict: true })) continue;
      room.items.push(c);
      const sc = evaluate(room).score - (Math.min(c.x, W - c.x) + Math.min(c.z, D - c.z)) * 0.5;
      room.items.pop();
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    if (!best || bestScore < before - 2) return null;
    room.items.push(best);
    return best;
  };
  const count = pred => room.items.filter(i => pred(def(i.t))).length;
  // Back against wall `wall`, centred `pos` metres along it, `gap` off the wall.
  const atWall = (t, wall, pos, gap = 0.03) => {
    const [wx, wz] = wallPoint(room, wall, pos);
    const [dx, dz] = rot(0, def(t).d / 2 + gap, WALL_FACING[wall]);
    return { x: wx + dx, z: wz + dz, r: WALL_FACING[wall] };
  };
  // A point in another item's own frame: `dist` metres ahead of its centre, `side` metres to its side.
  const rel = (base, dist, side = 0, dr = 0) => {
    const [dx, dz] = rot(side, dist, base.r);
    return { x: base.x + dx, z: base.z + dz, r: base.r + dr };
  };
  const alongWall = (t, walls, fracs = [0.5, 0.3, 0.7, 0.15, 0.85]) => {
    const out = [];
    for (const wall of walls) {
      const len = wallLength(room, wall), half = def(t).w / 2 + 0.05;
      for (const f of fracs) out.push(atWall(t, wall, clamp(len * f, half, len - half)));
    }
    return out;
  };
  const corners = (inset = 0.38) => [
    { x: inset, z: inset, r: 0 }, { x: W - inset, z: inset, r: 0 },
    { x: inset, z: D - inset, r: 0 }, { x: W - inset, z: D - inset, r: 0 },
  ];
  const onWallOf = (t, base) => {
    const wall = nearestWall(room, ...Object.values(rel(base, -def(base.t).d / 2)).slice(0, 2));
    const along = wall % 2 === 0 ? base.x : base.z;
    const [x, z] = wallPoint(room, wall, along);
    return { x, z, r: 0 };
  };
  const rug = (base, dist, big = true) => {
    const tries = big ? ['rugL', 'rugS'] : ['rugS'];
    for (const t of tries) {
      const c = rel(base, dist + def(t).d / 2);
      const probe = { id: 'p', t, ...c };
      if (itemRects(probe, def(t)).every(r => insideRoom(r, room))) return add(t, c);
    }
    return null;
  };

  const livingZone = (sofaT, sofaC, tvC) => {
    const sofa = add(sofaT, sofaC);
    if (!sofa) return null;
    const sd = def(sofa.t);
    add('tv', tvC);
    rug(sofa, sd.d / 2 - 0.25, area > 13);
    add(area > 12 ? 'coffee' : 'coffeeRound', rel(sofa, sd.d / 2 + 0.4 + def(area > 12 ? 'coffee' : 'coffeeRound').d / 2));
    const side = add('sideTable', [rel(sofa, -sd.d / 2 + 0.26, sd.w / 2 + 0.3), rel(sofa, -sd.d / 2 + 0.26, -sd.w / 2 - 0.3)]);
    if (side) add('tableLamp', { x: side.x, z: side.z, r: 0 });
    add('floorLamp', [rel(sofa, -sd.d / 2 + 0.22, -sd.w / 2 - 0.28), rel(sofa, -sd.d / 2 + 0.22, sd.w / 2 + 0.28)]);
    add('art', onWallOf('art', sofa));
    return sofa;
  };

  if (room.type === 'living') {
    const sofaT = D >= 3.3 && area >= 12 ? 'sofa3' : 'sofa2';
    const sd = def(sofaT);
    const sofaC = [], tvC = [];
    for (const f of [0.45, 0.5, 0.4, 0.55, 0.35]) {
      const pos = clamp(D * f, sd.w / 2 + 0.35, D - sd.w / 2 - 0.35);
      // Keep the sofa within about 3.2 m of the TV: in a deep room it floats off the wall.
      const gap = Math.max(0.03, W - 0.45 - 3.2 - sd.d);
      sofaC.push(atWall(sofaT, 3, pos, gap));
      tvC.push(atWall('tv', 1, pos));
    }
    const sofa = livingZone(sofaT, sofaC, tvC);
    if (sofa && area >= 13 && D >= sd.w + 1.8) {
      const cd = def('coffee');
      add('armchair', [
        rel(sofa, sd.d / 2 + 0.75, cd.w / 2 + 0.95, -90),
        rel(sofa, sd.d / 2 + 0.75, -(cd.w / 2 + 0.95), 90),
      ]);
    }
    const cab = add(area >= 14 ? 'bookshelf' : 'cabinet', alongWall(area >= 14 ? 'bookshelf' : 'cabinet', [0, 2, 1], [0.88, 0.12, 0.3, 0.5, 0.7]));
    if (cab && def(cab.t).surface) add('plantS', { x: cab.x, z: cab.z, r: 0 });
  }

  if (room.type === 'bedroom') {
    const bedT = area >= 11 && Math.min(W, D) >= 3 ? 'bedQueen' : area >= 7.5 ? 'bedDouble' : 'bedSingle';
    const bd = def(bedT);
    const bedC = [];
    for (const wall of [3, 1, 0]) {
      const len = wallLength(room, wall);
      if (len >= bd.w + 1.2) for (const f of [0.5, 0.42, 0.58]) bedC.push(atWall(bedT, wall, len * f));
    }
    // Small room: tuck the bed into a corner away from the door.
    bedC.push(atWall(bedT, 3, bd.w / 2 + 0.03), atWall(bedT, 0, bd.w / 2 + 0.03), atWall(bedT, 1, bd.w / 2 + 0.03));
    const bed = add(bedT, bedC);
    if (bed) {
      const s1 = add('bedside', rel(bed, -bd.d / 2 + 0.23, bd.w / 2 + 0.26));
      const s2 = add('bedside', rel(bed, -bd.d / 2 + 0.23, -bd.w / 2 - 0.26));
      for (const s of [s1, s2]) if (s) add('tableLamp', { x: s.x, z: s.z, r: 0 });
      add('art', onWallOf('art', bed));
    }
    const wt = area >= 12 ? 'wardrobeL' : 'wardrobe';
    add(wt, alongWall(wt, [1, 2, 0, 3], [0.12, 0.88, 0.5]));
    if (area >= 8.5) {
      const desk = add('desk', alongWall('desk', [0, 1, 2], [0.8, 0.2, 0.5]));
      if (desk) add('officeChair', rel(desk, def('desk').d / 2 + 0.18, 0, 180), false);
    }
    if (bed) rug(bed, bd.d / 2 - 0.9 - 0.85, area > 10);
    add('mirror', [{ x: W * 0.3, z: D, r: 0 }, { x: W, z: D * 0.7, r: 0 }, { x: 0, z: D * 0.8, r: 0 }]);
  }

  if (room.type === 'dining') {
    const tt = area >= 12 ? 'dining6' : area >= 8.5 ? 'dining4' : 'diningRound';
    const td = def(tt);
    const table = add(tt, { x: W / 2, z: D / 2 - 0.1, r: W >= D ? 0 : 90 });
    if (table) {
      const cd = def('chair');
      if (td.round) {
        for (const a of [0, 90, 180, 270]) {
          const [dx, dz] = rot(0, td.d / 2 + 0.13, a);
          add('chair', { x: table.x + dx, z: table.z + dz, r: a + 180 }, false);
        }
      } else {
        const n = tt === 'dining6' ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const sx = (i - (n - 1) / 2) * (td.w - 0.2) / n;
          add('chair', rel(table, td.d / 2 + cd.d / 2 - 0.12, sx, 180), false);
          add('chair', rel(table, -(td.d / 2 + cd.d / 2 - 0.12), sx, 0), false);
        }
      }
      add('pendant', { x: table.x, z: table.z, r: 0 });
      add('rugL', { x: table.x, z: table.z, r: table.r });
    }
    const roomy = () => !table || (!tableCrowders(room, table, 0.6).items.length);
    const keep = it => { if (it && !roomy()) { room.items.pop(); return null; } return it; };
    let cab = null;
    for (const c of alongWall('cabinet', [3, 1, 0, 2])) { cab = keep(add('cabinet', c)); if (cab) break; }
    if (cab) { add('plantS', rel(cab, 0, 0.35)); add('art', onWallOf('art', cab)); }
    else add('art', [{ x: 0, z: D / 2, r: 0 }, { x: W / 2, z: 0, r: 0 }]);
    for (const c of corners(0.3)) if (keep(add('floorLamp', c))) break;
  }

  if (room.type === 'office') {
    // Desk on a side wall next to the window: daylight from the side, no screen glare.
    const desk = add('desk', [atWall('desk', 3, 0.85), atWall('desk', 1, 0.85), ...alongWall('desk', [3, 1, 0])]);
    if (desk) {
      add('officeChair', rel(desk, def('desk').d / 2 + 0.18, 0, 180), false);
      add('tableLamp', rel(desk, -0.12, -0.4));
      add('wallShelf', onWallOf('wallShelf', desk));
    }
    add('bookshelf', alongWall('bookshelf', [1, 3, 2], [0.5, 0.75, 0.25]));
    if (area >= 8) {
      const chair = add('armchair', [{ x: W - 0.6, z: D - 1.6, r: 225 }, { x: 0.6, z: D - 0.6, r: 135 }, { x: W - 0.6, z: 0.6, r: 315 }]);
      if (chair) add('floorLamp', [rel(chair, -0.55, 0.3), rel(chair, -0.2, 0.6), rel(chair, -0.2, -0.6)]);
      add('rugS', { x: W / 2, z: D / 2, r: 0 });
    } else {
      add('floorLamp', corners(0.3));
    }
    add('art', [{ x: W, z: D * 0.5, r: 0 }, { x: W * 0.4, z: D, r: 0 }]);
  }

  if (room.type === 'studio') {
    const kw = def('kitchen').w, fw = def('fridge').w;
    add('kitchen', atWall('kitchen', 2, kw / 2 + 0.05));
    add('fridge', atWall('fridge', 2, kw + 0.1 + fw / 2));
    const free = kw + 0.15 + fw; // where the south wall is free again
    const bedT = W >= 5.6 ? 'bedQueen' : 'bedDouble';
    const bd = def(bedT);
    const bed = add(bedT, [atWall(bedT, 0, W - bd.w / 2 - 0.05), atWall(bedT, 1, bd.w / 2 + 0.05)]);
    if (bed) {
      const sofaT = D >= 4 ? 'sofa3' : 'sofa2';
      const sd = def(sofaT);
      const zc = clamp(D * 0.28, sd.w / 2 + 0.05, D - sd.w / 2 - 0.05);
      // The TV unit doubles as a divider between the living and sleeping zones.
      // It only goes in when the sofa still sits a comfortable distance away.
      const tvX = Math.min(bed.x - bd.w / 2 - 0.75, 0.9 + 3.2);
      livingZone(sofaT, [atWall(sofaT, 3, zc)], tvX - 0.2 - (sd.d + 0.03) >= 1.6 ? [{ x: tvX, z: zc, r: 270 }] : []);
      const side = add('bedside', rel(bed, -bd.d / 2 + 0.23, -bd.w / 2 - 0.26));
      if (side) add('tableLamp', { x: side.x, z: side.z, r: 0 });
    }
    add('wardrobe', [atWall('wardrobe', 2, free + 0.65), ...alongWall('wardrobe', [1, 0], [0.85, 0.7, 0.5])]) ||
      add('drawers', [atWall('drawers', 2, free + 0.45), ...alongWall('drawers', [1, 0, 3])]);
    for (const c of [[W - 2.2, D - 1.2], [W * 0.6, D - 1.2], [W * 0.55, D * 0.6], [W * 0.5, D * 0.5]]) {
      const table = add('diningRound', { x: c[0], z: c[1], r: 0 });
      if (!table) continue;
      const crowd = tableCrowders(room, table, 0.6);
      if (crowd.items.length || crowd.wall) { room.items.pop(); continue; }
      for (const a of [90, 270]) {
        const [dx, dz] = rot(0, 0.63, a);
        add('chair', { x: table.x + dx, z: table.z + dz, r: a + 180 }, false);
      }
      add('pendant', { x: table.x, z: table.z, r: 0 });
      break;
    }
  }

  // Every starter room gets layered light and something green.
  if (count(d => d.light) < 2) auto('floorLamp');
  if (count(d => d.light) < 2) add('pendant', { x: W / 2, z: D / 2, r: 0 });
  if (!count(d => d.plant) && !auto('plantL')) {
    const host = room.items.find(i => def(i.t).surface && !def(i.t).dining && def(i.t).h > 0.45);
    if (host) add('plantS', rel(host, 0, def(host.t).w / 2 - 0.2));
  }

  return room;
}
