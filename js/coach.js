// The design coach: turns interior-design rules of thumb into live checks on the current room.
// Every check returns a level (bad / warn / tip / good), a text key, and the pieces it is about.
import { CATALOG, layerOf, isFloor } from './catalog.js';
import { STYLES, hsl } from './styles.js';
import { findCollisions, doorZones, tableCrowders } from './layout.js';
import { rot, overlap, insideRoom, itemRects, frontZone, openingZone, pointIn, rectDist, wallPoint, WALL_FACING } from './geo.js';

const CELL = 0.1;
export const WALK_CLEAR = 0.28;

function hit(rects, others) {
  for (const a of rects) for (const b of others) if (overlap(a, b)) return true;
  return false;
}

// Flood-fill the floor from the door. `clear` is half the body width we insist on.
function walkGrid(room, clear) {
  const nx = Math.ceil(room.w / CELL), nz = Math.ceil(room.d / CELL);
  const blocked = new Uint8Array(nx * nz);
  const solid = [];
  for (const it of room.items) {
    const def = CATALOG[it.t];
    if (!isFloor(def) || def.tuck || it.t === 'pouf') continue; // chairs get pulled out of the way
    solid.push(...itemRects(it, def, clear));
  }
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const x = (ix + 0.5) * CELL, z = (iz + 0.5) * CELL;
    if (x < clear || z < clear || x > room.w - clear || z > room.d - clear) { blocked[iz * nx + ix] = 1; continue; }
    for (const r of solid) if (pointIn(r, x, z)) { blocked[iz * nx + ix] = 1; break; }
  }
  const reach = new Uint8Array(nx * nz);
  const queue = [];
  for (const door of room.openings.filter(o => o.kind === 'door')) {
    const [wx, wz] = wallPoint(room, door.wall, door.pos);
    // Step into the room from the doorway until we find standing space.
    for (let s = clear + 0.05; s < 1.2; s += CELL) {
      const [dx, dz] = rot(0, s, WALL_FACING[door.wall]);
      const ix = Math.floor((wx + dx) / CELL), iz = Math.floor((wz + dz) / CELL);
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
      if (!blocked[iz * nx + ix]) { reach[iz * nx + ix] = 1; queue.push(iz * nx + ix); break; }
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], ix = i % nx, iz = (i / nx) | 0;
    const nb = [ix > 0 ? i - 1 : -1, ix < nx - 1 ? i + 1 : -1, iz > 0 ? i - nx : -1, iz < nz - 1 ? i + nx : -1];
    for (const j of nb) if (j >= 0 && !blocked[j] && !reach[j]) { reach[j] = 1; queue.push(j); }
  }
  return { nx, nz, cell: CELL, reach, blocked, hasDoor: queue.length > 0 };
}

function reached(grid, x, z, radius = 0.25) {
  const n = Math.ceil(radius / CELL);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
    const ix = cx + dx, iz = cz + dz;
    if (ix >= 0 && iz >= 0 && ix < grid.nx && iz < grid.nz && grid.reach[iz * grid.nx + ix]) return true;
  }
  return false;
}

// Where you need to stand to use a piece.
function accessPoints(it, def) {
  const pts = [];
  const p = (side, dist) => { const [dx, dz] = rot(side, dist, it.r); pts.push([it.x + dx, it.z + dz]); };
  if (def.bed) { p(def.w / 2 + 0.35, 0.2); p(-def.w / 2 - 0.35, 0.2); p(0, def.d / 2 + 0.35); }
  else if (def.dining) { p(0, def.d / 2 + 0.45); p(0, -def.d / 2 - 0.45); p(def.w / 2 + 0.45, 0); p(-def.w / 2 - 0.45, 0); }
  else if (def.seat) { p(0, def.d / 2 + 0.38); p(def.w / 2 - 0.1, def.d / 2 + 0.38); p(-def.w / 2 + 0.1, def.d / 2 + 0.38); }
  else if (def.front) p(0, def.d / 2 + 0.38);
  return pts;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const gap = (a, b) => {
  let m = Infinity;
  for (const ra of itemRects(a, CATALOG[a.t])) for (const rb of itemRects(b, CATALOG[b.t])) m = Math.min(m, rectDist(ra, rb));
  return m;
};

export function evaluate(room) {
  const checks = [];
  const push = (level, id, items = [], params = {}, fix = null) => checks.push({ level, id, items: items.map(i => i.id || i), params, fix });
  const items = room.items;
  const D = it => CATALOG[it.t];
  const floor = items.filter(i => isFloor(D(i)));
  const has = pred => items.filter(i => pred(D(i), i));
  const area = room.w * room.d;

  if (!items.length) {
    return { score: 0, checks: [{ level: 'tip', id: 'start', items: [], params: {}, fix: null }], flagged: new Set(), grid: walkGrid(room, WALK_CLEAR) };
  }

  // 1. Nothing overlaps.
  const pairs = findCollisions(room);
  const flagged = new Set();
  pairs.forEach(([a, b]) => { flagged.add(a.id); flagged.add(b.id); });
  if (pairs.length) push('bad', 'overlap', [...flagged]);

  // 2. The door can open.
  const dz = doorZones(room);
  const inDoor = floor.filter(i => hit(itemRects(i, D(i)), dz));
  if (inDoor.length) { push('bad', 'door', inDoor); inDoor.forEach(i => flagged.add(i.id)); }

  // 3. You can walk to everything.
  const grid = walkGrid(room, WALK_CLEAR);
  if (grid.hasDoor) {
    const loose = walkGrid(room, 0.17);
    const blockedItems = [], tightItems = [];
    for (const it of floor) {
      const pts = accessPoints(it, D(it));
      if (!pts.length || flagged.has(it.id)) continue;
      if (pts.some(([x, z]) => reached(grid, x, z))) continue;
      (pts.some(([x, z]) => reached(loose, x, z)) ? tightItems : blockedItems).push(it);
    }
    if (blockedItems.length) push('bad', 'reach', blockedItems);
    if (tightItems.length) push('warn', 'tight', tightItems);
    if (!blockedItems.length && !tightItems.length && !inDoor.length) push('good', 'walk');
  }

  // 4. Room to use each piece (open the wardrobe, pull out the chair...).
  const cramped = [];
  for (const it of floor) {
    const def = D(it), zone = frontZone(it, def);
    if (!zone || flagged.has(it.id)) continue;
    let bad = !insideRoom(zone, room, 0.06);
    for (const other of floor) {
      if (bad) break;
      if (other === it) continue;
      const od = D(other);
      if (od.tuck && (def.table || def.deskLike)) continue;
      if (hit([zone], itemRects(other, od))) bad = true;
    }
    if (bad) cramped.push(it);
  }
  if (cramped.length) push('warn', 'use', cramped, { cm: Math.round(D(cramped[0]).front * 100) });

  // 5. How full the floor is.
  const used = floor.reduce((s, i) => s + (D(i).rects || [[0, 0, D(i).w, D(i).d]]).reduce((a, r) => a + r[2] * r[3], 0), 0);
  const ratio = used / area;
  const pct = Math.round(ratio * 100);
  if (ratio > 0.55) push('warn', 'crowd', [], { pct });
  else if (ratio < 0.14) push('tip', 'empty', [], { pct });
  else push('good', 'space', [], { pct });

  // 6. Daylight.
  const winZones = room.openings.filter(o => o.kind === 'window').map(o => openingZone(room, o, 0.5));
  const shade = floor.filter(i => D(i).tall && hit(itemRects(i, D(i)), winZones));
  if (shade.length) push('warn', 'window', shade);

  // 7. Layers of light.
  const lamps = has(d => d.light);
  if (lamps.length === 0) push('warn', 'light0', [], {}, { add: 'floorLamp' });
  else if (lamps.length === 1) push('tip', 'light1', [], {}, { add: 'tableLamp' });
  else push('good', 'light', [], { n: lamps.length });

  // 8. Something alive, something on the walls.
  if (!has(d => d.plant).length) push('tip', 'plant', [], {}, { add: 'plantL' });
  if (!has(d => layerOf(d) === 'wall').length) push('tip', 'wallDecor', [], {}, { add: 'art' });

  // 9. Colour: count clearly different strong hues in play.
  const style = STYLES[room.style] || STYLES.japandi;
  const hues = [];
  const note = hex => {
    const [h, s, l] = hsl(hex);
    if (s < 0.28 || l < 0.16 || l > 0.86) return; // neutrals don't count
    if ((h < 50 || h > 340) && s < 0.5 && l > 0.3) return; // wood and beige tones read as neutral
    if (!hues.some(x => Math.min(Math.abs(x - h), 360 - Math.abs(x - h)) < 35)) hues.push(h);
  };
  note(room.wall || style.wall);
  for (const it of items) {
    const slot = D(it).slot;
    note(it.c || (slot === 'accent' ? style.accents[0] : slot === 'fabric' ? style.fabric : slot === 'rug' ? style.rug : '#888888'));
  }
  if (hues.length > 3) push('warn', 'colors', has((d, i) => i.c), { n: hues.length });
  else push('good', 'palette', [], { n: Math.max(1, hues.length) });

  // 10. Essentials for this kind of room.
  const seats = has(d => d.seat && d.kind !== 'chair'), sofas = items.filter(i => /^sofa/.test(i.t));
  const beds = has(d => d.bed), tvs = items.filter(i => i.t === 'tv');
  const desks = has(d => d.deskLike), tables = has(d => d.dining);
  const need = { living: [seats, 'needSofa', 'sofa2'], bedroom: [beds, 'needBed', 'bedDouble'], dining: [tables, 'needTable', 'dining4'], office: [desks, 'needDesk', 'desk'], studio: [beds, 'needBed', 'bedDouble'] }[room.type];
  if (need && !need[0].length) push('tip', need[1], [], {}, { add: need[2] });

  // Sofa + TV.
  if (sofas.length && tvs.length) {
    const tv = tvs[0];
    const sofa = sofas.reduce((a, b) => (dist(a, tv) < dist(b, tv) ? a : b));
    const g = gap(sofa, tv);
    const [fx, fz] = rot(0, 1, sofa.r);
    const to = [tv.x - sofa.x, tv.z - sofa.z], len = Math.hypot(...to) || 1;
    const facing = (fx * to[0] + fz * to[1]) / len;
    const m = Math.round(g * 10) / 10;
    if (g < 1.5) push('warn', 'tvNear', [sofa, tv], { m });
    else if (g > 4.2) push('warn', 'tvFar', [sofa, tv], { m });
    else if (sofa.t !== 'sofaL' && facing < 0.6) push('warn', 'tvFace', [sofa, tv]);
    else push('good', 'tv', [sofa, tv], { m });
  }
  // Coffee table reach.
  const coffees = items.filter(i => /^coffee/.test(i.t));
  if (sofas.length && coffees.length) {
    const c = coffees[0];
    const sofa = sofas.reduce((a, b) => (gap(a, c) < gap(b, c) ? a : b));
    const g = gap(sofa, c), cm = Math.round(g * 100);
    if (g < 0.28) push('warn', 'coffeeNear', [sofa, c], { cm });
    else if (g > 0.65) push('tip', 'coffeeFar', [sofa, c], { cm });
    else push('good', 'coffee', [sofa, c], { cm });
  }
  // Rug anchoring.
  const rugs = has(d => layerOf(d) === 'rug');
  const anchors = [...seats, ...beds, ...tables];
  if (anchors.length && (room.type === 'living' || room.type === 'bedroom' || room.type === 'studio')) {
    if (!rugs.length) push('tip', 'rugNone', [], {}, { add: area > 13 ? 'rugL' : 'rugS' });
    else {
      const floating = rugs.filter(r => !anchors.some(a => hit(itemRects(r, D(r)), itemRects(a, D(a)))));
      if (floating.length === rugs.length) push('tip', 'rugFloat', floating);
      else push('good', 'rug', rugs);
    }
  }

  // Bed.
  for (const bed of beds.slice(0, 1)) {
    const def = D(bed);
    const [hx, hz] = rot(0, -def.d / 2, bed.r);
    const px = bed.x + hx, pz = bed.z + hz;
    const wallGap = Math.min(px, pz, room.w - px, room.d - pz);
    if (wallGap > 0.2) push('warn', 'bedHead', [bed]);
    const sideFree = sgn => {
      const [dx, dz2] = rot(sgn * (def.w / 2 + 0.26), 0.25, bed.r);
      const zone = { cx: bed.x + dx, cz: bed.z + dz2, hw: 0.24, hd: 0.6, r: bed.r };
      if (!insideRoom(zone, room, 0.04)) return false;
      return !floor.some(o => o !== bed && hit([zone], itemRects(o, D(o))));
    };
    const free = [sideFree(1), sideFree(-1)].filter(Boolean).length;
    if (free === 0) push('warn', 'bedSides0', [bed]);
    else if (free === 1 && bed.t !== 'bedSingle' && room.type === 'bedroom' && area >= 10) push('tip', 'bedSides1', [bed]);
    else if (wallGap <= 0.2) push('good', 'bed', [bed]);
    const near = items.some(i => (i.t === 'bedside' || i.t === 'sideTable') && gap(i, bed) < 0.45);
    if (!near) push('tip', 'bedside', [bed], {}, { add: 'bedside' });
  }

  // Desk.
  for (const desk of desks.slice(0, 1)) {
    const chair = items.some(i => D(i).tuck && gap(i, desk) < 0.5);
    if (!chair) push('tip', 'deskChair', [desk], {}, { add: 'officeChair' });
    const wins = room.openings.filter(o => o.kind === 'window');
    const nearWin = wins.some(o => { const [x, z] = wallPoint(room, o.wall, o.pos); return Math.hypot(x - desk.x, z - desk.z) < 2.2; });
    const lamp = lamps.some(l => dist(l, desk) < 1.1);
    if (!nearWin && !lamp) push('tip', 'deskLight', [desk], {}, { add: 'tableLamp' });
    else if (chair) push('good', 'desk', [desk]);
  }

  // Dining table.
  for (const table of tables.slice(0, 1)) {
    const def = D(table);
    const chairs = items.filter(i => D(i).tuck && gap(i, table) < 0.45);
    const crowd = tableCrowders(room, table);
    if (chairs.length < 2) push('tip', 'diningSeats', [table], {}, { add: 'chair' });
    else if (crowd.items.length || crowd.wall) push('warn', 'diningClear', [table, ...crowd.items]);
    else push('good', 'dining', [table], { n: chairs.length });
  }

  const order = { bad: 0, warn: 1, tip: 2, good: 3 };
  checks.sort((a, b) => order[a.level] - order[b.level]);
  const count = l => checks.filter(c => c.level === l).length;
  const score = Math.max(5, Math.min(100, 100 - 14 * count('bad') - 7 * count('warn') - 3 * count('tip')));
  return { score, checks, flagged, grid };
}

export function budget(room) {
  const lines = new Map();
  for (const it of room.items) {
    const l = lines.get(it.t) || { t: it.t, n: 0, price: CATALOG[it.t].price };
    l.n++; lines.set(it.t, l);
  }
  const list = [...lines.values()].sort((a, b) => b.price * b.n - a.price * a.n);
  return { list, total: list.reduce((s, l) => s + l.n * l.price, 0) };
}
