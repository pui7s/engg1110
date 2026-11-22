// Top-down floor plan: the precise editor that mirrors the 3D view in real time.
import { CATALOG, layerOf } from './catalog.js';
import { FLOORS, paletteFor, shade, luminance } from './styles.js';
import { mainColor } from './models.js';
import { DOOR_CLEAR } from './layout.js';
import { rot, itemRects, frontZone, pointIn, corners, wallLength, wallPoint, nearestWall, openingZone, WALL_FACING, DEG, clamp } from './geo.js';

const ORDER = { rug: 0, floor: 1, top: 2, wall: 3, ceil: 4 };

export class Plan2D {
  constructor(canvas, cb) {
    this.canvas = canvas; this.cb = cb; this.g = canvas.getContext('2d');
    this.room = null; this.s = 60; this.ox = 0; this.oz = 0;
    this.opts = {};
    this.bind();
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = r.width; this.ch = r.height; this.dpr = dpr;
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    if (this.room) this.draw(this.room, this.opts);
  }

  // opts: { sel, selOp, flagged, grid (walk grid), showWalk, name(t), css }
  draw(room, opts) {
    this.room = room; this.opts = opts;
    if (!this.cw) return;
    const g = this.g, css = getComputedStyle(this.canvas);
    const C = n => css.getPropertyValue(n).trim();
    const ink = C('--ink'), muted = C('--muted'), blue = C('--blue'), red = C('--bad'), paper = C('--plan');
    const pal = paletteFor(room);
    const pad = this.cw < 480 ? 34 : 52, hud = 44; // keep the plan clear of the floating toolbar
    this.s = Math.min((this.cw - pad * 2) / room.w, (this.ch - pad * 2 - hud) / room.d);
    this.ox = (this.cw - room.w * this.s) / 2; this.oz = hud + (this.ch - hud - room.d * this.s) / 2;
    const s = this.s, X = x => this.ox + x * s, Z = z => this.oz + z * s;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = paper; g.fillRect(0, 0, this.cw, this.ch);

    // Floor.
    const floor = FLOORS[pal.floorId] || FLOORS.oak;
    g.fillStyle = shade(floor.base, 0.35); g.fillRect(X(0), Z(0), room.w * s, room.d * s);
    g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = 0.5; x < room.w; x += 0.5) { g.moveTo(X(x), Z(0)); g.lineTo(X(x), Z(room.d)); }
    for (let z = 0.5; z < room.d; z += 0.5) { g.moveTo(X(0), Z(z)); g.lineTo(X(room.w), Z(z)); }
    g.stroke();

    // Walking space reachable from the door.
    if (opts.showWalk && opts.grid) {
      const gr = opts.grid;
      g.fillStyle = 'rgba(38,160,110,0.26)';
      for (let iz = 0; iz < gr.nz; iz++) for (let ix = 0; ix < gr.nx; ix++) {
        if (gr.reach[iz * gr.nx + ix]) g.fillRect(X(ix * gr.cell), Z(iz * gr.cell), gr.cell * s + 0.5, gr.cell * s + 0.5);
      }
    }
    // Door swing areas.
    for (const o of room.openings) if (o.kind === 'door') {
      g.fillStyle = 'rgba(47,111,237,0.07)';
      this.poly(corners(openingZone(room, o, DOOR_CLEAR)));
      g.fill();
    }

    const items = [...room.items].sort((a, b) => ORDER[layerOf(CATALOG[a.t])] - ORDER[layerOf(CATALOG[b.t])]);
    const sel = room.items.find(i => i.id === opts.sel);
    if (sel) {
      const zone = frontZone(sel, CATALOG[sel.t]);
      if (zone) { g.fillStyle = 'rgba(47,111,237,0.14)'; this.poly(corners(zone)); g.fill(); }
    }
    for (const it of items) this.drawItem(it, pal, opts, ink);

    // Walls with gaps for openings.
    g.lineCap = 'butt';
    const T = Math.max(5, s * 0.12);
    for (let w = 0; w < 4; w++) {
      const len = wallLength(room, w);
      const ops = room.openings.filter(o => o.wall === w).sort((a, b) => a.pos - b.pos);
      let u = -0.06;
      const seg = (a, b) => {
        if (b - a < 0.005) return;
        const [x0, z0] = wallPoint(room, w, a), [x1, z1] = wallPoint(room, w, b);
        const [nx, nz] = rot(0, -0.06, WALL_FACING[w]);
        g.strokeStyle = ink; g.lineWidth = T;
        g.beginPath(); g.moveTo(X(x0 + nx), Z(z0 + nz)); g.lineTo(X(x1 + nx), Z(z1 + nz)); g.stroke();
      };
      for (const o of ops) { seg(u, o.pos - o.w / 2); u = o.pos + o.w / 2; }
      seg(u, len + 0.06);
      for (const o of ops) {
        const a = wallPoint(room, w, o.pos - o.w / 2), b = wallPoint(room, w, o.pos + o.w / 2);
        const [nx, nz] = rot(0, -0.06, WALL_FACING[w]);
        const picked = opts.selOp === o.id;
        if (o.kind === 'window') {
          g.strokeStyle = picked ? blue : '#7fb6d9'; g.lineWidth = T;
          g.beginPath(); g.moveTo(X(a[0] + nx), Z(a[1] + nz)); g.lineTo(X(b[0] + nx), Z(b[1] + nz)); g.stroke();
          g.strokeStyle = paper; g.lineWidth = Math.max(1, T * 0.28);
          g.beginPath(); g.moveTo(X(a[0] + nx), Z(a[1] + nz)); g.lineTo(X(b[0] + nx), Z(b[1] + nz)); g.stroke();
        } else {
          // Door leaf and its swing arc.
          const [dx, dz] = rot(0, o.w, WALL_FACING[w]);
          g.strokeStyle = picked ? blue : muted; g.lineWidth = picked ? 2.5 : 1.5;
          g.beginPath(); g.moveTo(X(a[0]), Z(a[1])); g.lineTo(X(a[0] + dx), Z(a[1] + dz)); g.stroke();
          g.setLineDash([4, 4]);
          g.beginPath();
          const a0 = Math.atan2(dz, dx), a1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
          let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          g.arc(X(a[0]), Z(a[1]), o.w * s, a0, a0 + d, d < 0);
          g.stroke(); g.setLineDash([]);
        }
      }
    }

    // Outlines: problems in red, selection in blue with a rotate handle.
    for (const it of room.items) {
      const bad = opts.flagged && opts.flagged.has(it.id), isSel = it.id === opts.sel;
      const hi = opts.highlight && opts.highlight.includes(it.id);
      if (!bad && !isSel && !hi) continue;
      g.strokeStyle = bad ? red : blue; g.lineWidth = isSel ? 2.5 : 2;
      if (hi && !isSel) g.setLineDash([6, 4]);
      for (const r of itemRects(it, CATALOG[it.t], 0.04)) { this.poly(corners(r)); g.stroke(); }
      g.setLineDash([]);
    }
    if (sel && layerOf(CATALOG[sel.t]) !== 'wall') {
      const [hx, hz] = this.handle(sel);
      const [fx, fz] = rot(0, CATALOG[sel.t].d / 2, sel.r);
      g.strokeStyle = blue; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(X(sel.x + fx), Z(sel.z + fz)); g.lineTo(X(hx), Z(hz)); g.stroke();
      g.fillStyle = paper; g.beginPath(); g.arc(X(hx), Z(hz), 8, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.arc(X(hx), Z(hz), 3.5, 0.6, 5.4); g.stroke();
    }

    // Dimensions, the way a floor plan shows them.
    g.fillStyle = muted; g.strokeStyle = muted; g.lineWidth = 1;
    g.font = `500 11px ${C('--mono') || 'monospace'}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const top = Z(0) - T - 14, left = X(0) - T - 14;
    g.beginPath();
    g.moveTo(X(0), top); g.lineTo(X(room.w), top); g.moveTo(X(0), top - 4); g.lineTo(X(0), top + 4); g.moveTo(X(room.w), top - 4); g.lineTo(X(room.w), top + 4);
    g.moveTo(left, Z(0)); g.lineTo(left, Z(room.d)); g.moveTo(left - 4, Z(0)); g.lineTo(left + 4, Z(0)); g.moveTo(left - 4, Z(room.d)); g.lineTo(left + 4, Z(room.d));
    g.stroke();
    const label = (txt, x, y, turn) => {
      g.save(); g.translate(x, y); if (turn) g.rotate(-Math.PI / 2);
      const w = g.measureText(txt).width + 10;
      g.fillStyle = paper; g.fillRect(-w / 2, -8, w, 16);
      g.fillStyle = muted; g.fillText(txt, 0, 0.5); g.restore();
    };
    label(room.w.toFixed(2) + ' m', X(room.w / 2), top, false);
    label(room.d.toFixed(2) + ' m', left, Z(room.d / 2), true);
  }

  poly(pts) {
    const g = this.g;
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(this.ox + x * this.s, this.oz + z * this.s) : g.moveTo(this.ox + x * this.s, this.oz + z * this.s)));
    g.closePath();
  }

  drawItem(it, pal, opts, ink) {
    const g = this.g, def = CATALOG[it.t], s = this.s, layer = layerOf(def);
    const col = mainColor(it, pal), dark = shade(col, -0.22), line = shade(col, luminance(col) > 0.25 ? -0.45 : 0.5);
    const w = def.w * s, d = def.d * s;
    g.save();
    g.translate(this.ox + it.x * s, this.oz + it.z * s);
    g.rotate(-it.r * DEG);
    g.lineWidth = 1.2; g.strokeStyle = line; g.fillStyle = col;
    const rr = (x, y, ww, hh, r = 3) => { g.beginPath(); g.roundRect(x, y, ww, hh, Math.min(r, ww / 2, hh / 2)); };
    const body = () => { if (def.round) { g.beginPath(); g.ellipse(0, 0, w / 2, d / 2, 0, 0, 7); } else rr(-w / 2, -d / 2, w, d, layer === 'rug' ? 2 : 4); };

    if (layer === 'ceil') {
      g.setLineDash([4, 3]); g.strokeStyle = ink; g.globalAlpha = 0.75; body(); g.stroke();
      g.setLineDash([]); g.beginPath(); g.arc(0, 0, 3, 0, 7); g.fillStyle = '#f5c542'; g.fill(); g.stroke();
    } else if (def.kind === 'sofaL') {
      const u = s;
      g.beginPath();
      g.moveTo(-1.25 * u, -0.8 * u); g.lineTo(1.25 * u, -0.8 * u); g.lineTo(1.25 * u, 0.1 * u); g.lineTo(-0.35 * u, 0.1 * u); g.lineTo(-0.35 * u, 0.8 * u); g.lineTo(-1.25 * u, 0.8 * u);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = dark; g.fillRect(-1.25 * u + 1, -0.8 * u + 1, 2.5 * u - 2, 0.2 * u);
    } else if (def.kind === 'sofa') {
      body(); g.fill(); g.stroke();
      g.fillStyle = dark;
      rr(-w / 2 + 1, -d / 2 + 1, w - 2, d * 0.24, 3); g.fill();
      rr(-w / 2 + 1, -d / 2 + 1, 0.15 * s, d - 2, 3); g.fill();
      rr(w / 2 - 1 - 0.15 * s, -d / 2 + 1, 0.15 * s, d - 2, 3); g.fill();
    } else if (def.kind === 'bed') {
      body(); g.fillStyle = pal.white; g.fill(); g.stroke();
      g.fillStyle = col; rr(-w / 2 + 1, -d * 0.16, w - 2, d * 0.66 - 1, 3); g.fill(); g.stroke();
      g.fillStyle = dark; g.fillRect(-w / 2 + 1, -d / 2 + 1, w - 2, 0.07 * s);
      const n = def.w > 1.2 ? 2 : 1, pw = Math.min(0.6, def.w / n - 0.14) * s;
      g.fillStyle = pal.white; g.strokeStyle = shade(pal.white, -0.3);
      for (let i = 0; i < n; i++) { rr((i - (n - 1) / 2) * (pw + 0.08 * s) - pw / 2, -d / 2 + 0.14 * s, pw, 0.36 * s, 4); g.fill(); g.stroke(); }
    } else if (def.kind === 'tv') {
      body(); g.fill(); g.stroke();
      g.fillStyle = '#17181a'; g.fillRect(-0.61 * s, -d / 2 + 0.12 * s, 1.22 * s, Math.max(3, 0.05 * s));
    } else if (def.kind === 'plant') {
      g.fillStyle = pal.leaf; g.strokeStyle = pal.leafDark;
      const R = Math.max(w / 2, 5);
      g.beginPath();
      for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 2, r = R * (i % 2 ? 1 : 0.72); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = pal.leafDark; g.beginPath(); g.arc(0, 0, R * 0.22, 0, 7); g.fill();
    } else if (def.kind === 'lamp') {
      const R = Math.max(w / 2, 5);
      const grad = g.createRadialGradient(0, 0, 1, 0, 0, R * 2.4);
      grad.addColorStop(0, 'rgba(255,205,90,0.55)'); grad.addColorStop(1, 'rgba(255,205,90,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(0, 0, R * 2.4, 0, 7); g.fill();
      g.fillStyle = '#f6e3b4'; g.strokeStyle = '#8a7340'; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); g.stroke();
    } else if (def.kind === 'rug') {
      g.globalAlpha = 0.9; body(); g.fill(); g.stroke();
      g.strokeStyle = shade(col, 0.3); g.lineWidth = 2;
      if (def.round) { g.beginPath(); g.arc(0, 0, w / 2 - 0.12 * s, 0, 7); g.stroke(); } else { g.strokeRect(-w / 2 + 0.12 * s, -d / 2 + 0.12 * s, w - 0.24 * s, d - 0.24 * s); }
    } else if (def.kind === 'chair') {
      body(); g.fill(); g.stroke();
      g.fillStyle = dark; rr(-w / 2 + 1, -d / 2 + 1, w - 2, d * 0.22, 2); g.fill();
    } else if (layer === 'wall') {
      g.fillStyle = col; g.strokeStyle = ink;
      rr(-w / 2, -Math.max(d, 4) / 2, w, Math.max(d, 4), 1.5); g.fill(); g.stroke();
    } else {
      body(); g.fill(); g.stroke();
      if (def.front && !def.round) { g.strokeStyle = line; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(-w / 2 + 4, d / 2 - 3.5); g.lineTo(w / 2 - 4, d / 2 - 3.5); g.stroke(); }
    }
    g.restore();

    // Name label when there is room for it.
    if (opts.name && layer !== 'wall' && layer !== 'top' && layer !== 'ceil') {
      const name = opts.name(it.t);
      g.font = `600 ${this.cw < 480 ? 9 : 10.5}px ${getComputedStyle(this.canvas).getPropertyValue('--body') || 'sans-serif'}`;
      const tw = g.measureText(name).width;
      const span = Math.abs(Math.cos(it.r * DEG)) > 0.7 ? w : d, deep = Math.abs(Math.cos(it.r * DEG)) > 0.7 ? d : w;
      if (tw < span - 8 && deep > 16 && def.kind !== 'plant' && def.kind !== 'lamp') {
        const [lx, lz] = def.kind === 'bed' ? rot(0, def.d * 0.17, it.r) : def.kind === 'sofa' ? rot(0, def.d * 0.1, it.r) : def.kind === 'sofaL' ? rot(0.3, -0.3, it.r) : [0, 0];
        g.fillStyle = luminance(col) > 0.5 ? 'rgba(20,28,38,0.82)' : 'rgba(255,255,255,0.92)';
        if (layer === 'rug') g.globalAlpha = 0.55;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const ly = layer === 'rug' ? (Math.abs(Math.cos(it.r * DEG)) > 0.7 ? def.d : def.w) * s / 2 - 9 : 0;
        g.fillText(name, this.ox + (it.x + lx) * s, this.oz + (it.z + lz) * s + ly);
        g.globalAlpha = 1;
      }
    }
  }

  handle(it) {
    const def = CATALOG[it.t];
    const [dx, dz] = rot(0, def.d / 2 + Math.max(0.3, 26 / this.s), it.r);
    return [it.x + dx, it.z + dz];
  }

  // ---- pointer ----------------------------------------------------------------
  toRoom(ev) {
    const r = this.canvas.getBoundingClientRect();
    return [(ev.clientX - r.left - this.ox) / this.s, (ev.clientY - r.top - this.oz) / this.s];
  }
  itemAt(x, z) {
    const items = [...this.room.items].sort((a, b) => ORDER[layerOf(CATALOG[b.t])] - ORDER[layerOf(CATALOG[a.t])]);
    const grow = Math.max(0.03, 7 / this.s);
    for (const it of items) {
      const def = CATALOG[it.t];
      const g = def.w < 0.4 || layerOf(def) === 'wall' ? grow * 1.6 : 0.01;
      if (itemRects(it, def, g).some(r => pointIn(r, x, z))) return it;
    }
    return null;
  }
  openingAt(x, z) {
    const tol = Math.max(0.18, 12 / this.s);
    for (const o of this.room.openings) {
      const [wx, wz] = wallPoint(this.room, o.wall, o.pos);
      const along = o.wall % 2 === 0 ? Math.abs(x - wx) : Math.abs(z - wz);
      const off = o.wall % 2 === 0 ? Math.abs(z - wz) : Math.abs(x - wx);
      if (along < o.w / 2 && off < tol) return o;
    }
    return null;
  }

  bind() {
    const el = this.canvas;
    let drag = null, moved = false, start = null;
    el.addEventListener('pointerdown', ev => {
      if (!this.room) return;
      el.setPointerCapture(ev.pointerId);
      const [x, z] = this.toRoom(ev);
      moved = false; start = [ev.clientX, ev.clientY];
      const sel = this.room.items.find(i => i.id === this.opts.sel);
      if (sel && layerOf(CATALOG[sel.t]) !== 'wall') {
        const [hx, hz] = this.handle(sel);
        if (Math.hypot(x - hx, z - hz) * this.s < 16) { drag = { kind: 'rot', id: sel.id }; return; }
      }
      const op = this.openingAt(x, z);
      const it = this.itemAt(x, z);
      if (it && !(op && layerOf(CATALOG[it.t]) === 'rug')) {
        this.cb.onSelect(it.id);
        drag = { kind: 'item', id: it.id, ox: it.x - x, oz: it.z - z };
      } else if (op) {
        this.cb.onSelectOpening(op.id);
        drag = { kind: 'op', id: op.id };
      } else { drag = null; }
    });
    el.addEventListener('pointermove', ev => {
      if (!start) {
        const [x, z] = this.toRoom(ev);
        el.style.cursor = this.room && (this.itemAt(x, z) || this.openingAt(x, z)) ? 'grab' : '';
        return;
      }
      if (Math.hypot(ev.clientX - start[0], ev.clientY - start[1]) > 3) moved = true;
      if (!drag || !moved) return;
      const [x, z] = this.toRoom(ev);
      if (drag.kind === 'item') this.cb.onMove(drag.id, x + drag.ox, z + drag.oz);
      else if (drag.kind === 'rot') {
        const it = this.room.items.find(i => i.id === drag.id);
        if (!it) return;
        const a = Math.atan2(x - it.x, z - it.z) / DEG;
        this.cb.onRotate(drag.id, ((Math.round(a / 15) * 15) % 360 + 360) % 360);
      } else {
        const wall = nearestWall(this.room, clamp(x, 0, this.room.w), clamp(z, 0, this.room.d));
        this.cb.onOpening(drag.id, wall, wall % 2 === 0 ? x : z);
      }
      el.style.cursor = 'grabbing';
    });
    const up = () => {
      if (!start) return;
      if (drag && moved) this.cb.onMoveEnd();
      else if (!drag && !moved) this.cb.onSelect(null);
      drag = null; start = null; el.style.cursor = '';
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
}
