// The live 3D view: room shell, furniture, time-of-day lighting, camera and drag-to-move.
import * as THREE from '../vendor/three.module.min.js';
import { CATALOG, layerOf } from './catalog.js';
import { FLOORS, paletteFor, shade, hexToRgb } from './styles.js';
import { buildItem, disposeGroup, setGlow, material, mainColor } from './models.js';
import { topY } from './layout.js';
import { itemRects, nearestWall, wallLength, DEG, clamp } from './geo.js';

const WALL_T = 0.12, DOOR_H = 2.05, SILL = 0.9, WIN_TOP = 2.1;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---- floor textures ---------------------------------------------------------
const texCache = new Map();
function floorTexture(id) {
  if (texCache.has(id)) return texCache.get(id);
  const f = FLOORS[id] || FLOORS.oak;
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = id.length * 7919;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let size = 2; // metres covered by one tile of the texture
  g.fillStyle = f.base; g.fillRect(0, 0, S, S);
  if (f.kind === 'wood') {
    const rows = 16, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * 200;
      while (x < S) {
        const len = 150 + rnd() * 170;
        g.fillStyle = shade(f.base, (rnd() - 0.5) * 0.16);
        g.fillRect(x, r * rh, len, rh);
        g.fillStyle = 'rgba(0,0,0,0.05)';
        for (let i = 0; i < 4; i++) g.fillRect(x + rnd() * len, r * rh + rnd() * rh, 20 + rnd() * 60, 1);
        g.fillStyle = f.dark; g.fillRect(x + len - 1, r * rh, 1.5, rh);
        x += len;
      }
      g.fillStyle = f.dark; g.globalAlpha = 0.7; g.fillRect(0, r * rh, S, 1.2); g.globalAlpha = 1;
    }
  } else if (f.kind === 'concrete') {
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.015 + rnd() * 0.03})`;
      const r = 4 + rnd() * 40;
      g.beginPath(); g.ellipse(rnd() * S, rnd() * S, r, r * (0.4 + rnd() * 0.6), rnd() * 3, 0, 7); g.fill();
    }
  } else {
    size = 1.2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = shade(f.base, (rnd() - 0.5) * 0.04);
      g.fillRect(i * S / 2, j * S / 2, S / 2, S / 2);
    }
    g.strokeStyle = f.dark; g.lineWidth = 3;
    for (const p of [0, S / 2, S]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.moveTo(0, p); g.lineTo(S, p); g.stroke(); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const out = { tex, size };
  texCache.set(id, out);
  return out;
}

export class Scene3D {
  constructor(canvas, cb) {
    this.canvas = canvas; this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#dfe9f1');
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#b9a892', 1);
    this.sun = new THREE.DirectionalLight('#fff3e0', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 5;
    this.fill = new THREE.DirectionalLight('#dfe8ff', 0.5);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fill);
    this.lamps = [];
    for (let i = 0; i < 5; i++) {
      const l = new THREE.PointLight('#ffcf94', 0, 7, 1.6);
      this.lamps.push(l); this.scene.add(l);
    }

    this.world = new THREE.Group();   // shifted so the room centre sits at the origin
    this.shell = new THREE.Group();
    this.itemsG = new THREE.Group();
    this.marks = new THREE.Group();
    this.world.add(this.shell, this.itemsG, this.marks);
    this.scene.add(this.world);
    this.groups = new Map();          // item id -> { g, sig }
    this.walls = [];
    this.shellSig = '';
    this.room = null;
    this.selId = null; this.flagged = new Set();

    this.mode = 'doll';
    this.orbit = { theta: 0.62, phi: 0.92, radius: 9 };
    this.eye = { x: 0, z: 0, yaw: 0, pitch: -0.08 };
    this.tween = null;
    this.dirty = true;

    this.ray = new THREE.Raycaster();
    this.bindPointer();
    const loop = () => { this.frame(); this.raf = requestAnimationFrame(loop); };
    loop();
  }

  // ---- public ---------------------------------------------------------------
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    if (this.room && this.mode !== 'eye' && !this.userZoomed) this.orbit.radius = this.fitRadius();
    this.dirty = true;
  }

  sync(room, selId, flagged) {
    const first = !this.room || this.room.id !== room.id;
    this.room = room; this.selId = selId; this.flagged = flagged || new Set();
    this.world.position.set(-room.w / 2, 0, -room.d / 2);
    const pal = paletteFor(room);
    const sig = [room.w, room.d, room.h, pal.wall, pal.floorId, JSON.stringify(room.openings)].join('|');
    if (sig !== this.shellSig) { this.buildShell(room, pal); this.shellSig = sig; if (!this.userZoomed) this.orbit.radius = this.fitRadius(); }
    if (first) { this.userZoomed = false; this.orbit.radius = this.fitRadius(); if (this.mode === 'eye') this.placeEye(); }

    const seen = new Set();
    for (const it of room.items) {
      seen.add(it.id);
      const s = it.t + '|' + (it.c || '') + '|' + room.style + '|' + room.h;
      let e = this.groups.get(it.id);
      if (!e || e.sig !== s) {
        if (e) { this.itemsG.remove(e.g); disposeGroup(e.g); }
        e = { g: buildItem(it, pal, room.h), sig: s };
        this.groups.set(it.id, e);
        this.itemsG.add(e.g);
      }
      const def = CATALOG[it.t];
      const y = layerOf(def) === 'top' ? topY(room, it) : 0;
      e.g.position.set(it.x, y, it.z);
      e.g.rotation.y = it.r * DEG;
      e.wall = layerOf(def) === 'wall' ? nearestWall(room, it.x, it.z) : -1;
    }
    for (const [id, e] of this.groups) if (!seen.has(id)) { this.itemsG.remove(e.g); disposeGroup(e.g); this.groups.delete(id); }
    this.buildMarks(room);
    this.setHour(room.hour ?? 14);
    this.dirty = true;
  }

  setHour(h) {
    this.hour = h;
    const t = (h - 5.5) / 13.5;                       // 0 at dawn, 1 at dusk
    const up = Math.sin(Math.PI * clamp(t, 0, 1));    // sun height 0..1
    const day = h >= 19 ? 0 : smooth(0, 0.3, up);
    this.day = day;
    const el = lerp(10, 58, up) * DEG, az = lerp(20, 160, clamp(t, 0, 1)) * DEG;
    this.sun.position.set(Math.cos(az) * Math.cos(el) * 14, Math.sin(el) * 14, Math.abs(Math.sin(az)) * Math.cos(el) * 14 + 3);
    this.sun.color.set('#ffb070').lerp(new THREE.Color('#fff6ea'), smooth(0.15, 0.7, up));
    this.sun.intensity = 2.9 * day;
    this.fill.position.set(8, 6, 3);
    this.fill.intensity = 0.7 * day + 0.08;
    // At night, lit lamps bounce warm light around the room; without lamps it stays cold and dim.
    const sources = this.room ? this.room.items.filter(i => CATALOG[i.t].light) : [];
    const warm = Math.min(1, sources.length / 2);
    this.hemi.color.set('#3c4a6b').lerp(new THREE.Color('#b08e66'), warm * 0.85).lerp(new THREE.Color('#ffffff'), day);
    this.hemi.groundColor.set('#1d2029').lerp(new THREE.Color('#6b5038'), warm * 0.8).lerp(new THREE.Color('#c9b8a2'), day);
    this.hemi.intensity = lerp(0.45 + warm * 0.4, 1.15, day);
    const sky = new THREE.Color('#121a2b').lerp(new THREE.Color('#f1c8a4'), smooth(0, 0.35, day)).lerp(new THREE.Color('#d6e6f2'), smooth(0.3, 1, day));
    this.scene.background.copy(sky);
    setGlow(1 - day);
    this.lamps.forEach((l, i) => {
      const it = sources[i];
      if (!it || day > 0.97) { l.intensity = 0; return; }
      const def = CATALOG[it.t];
      const y = (layerOf(def) === 'top' ? topY(this.room, it) : 0) + def.light;
      l.position.set(it.x - this.room.w / 2, y, it.z - this.room.d / 2);
      l.intensity = (1 - day) * (it.t === 'pendant' ? 9 : it.t === 'floorLamp' ? 7 : 4.5);
    });
    if (this.glass) this.glass.opacity = lerp(0.5, 0.25, day);
    if (this.glass) this.glass.color.set('#27324d').lerp(new THREE.Color('#bfe0f5'), day);
    this.dirty = true;
  }

  setMode(mode) {
    if (mode === this.mode && mode !== 'eye') { this.userZoomed = false; }
    const from = this.pose();
    this.mode = mode;
    if (mode === 'doll') { this.orbit.phi = 0.92; this.orbit.theta = 0.62; this.orbit.radius = this.fitRadius(); this.userZoomed = false; }
    if (mode === 'top') { this.orbit.phi = 0.02; this.orbit.theta = 0; this.orbit.radius = this.fitRadius(true); this.userZoomed = false; }
    if (mode === 'eye') this.placeEye();
    this.tween = { from, t: 0 };
    this.dirty = true;
  }

  snapshot() {
    this.render();
    return this.canvas.toDataURL('image/jpeg', 0.92);
  }

  // ---- room shell -------------------------------------------------------------
  buildShell(room, pal) {
    disposeGroup(this.shell);
    this.shell.clear();
    this.walls = [];
    const W = room.w, D = room.d, H = room.h;
    const { tex, size } = floorTexture(pal.floorId);
    const ft = tex.clone(); ft.needsUpdate = true; ft.repeat.set(W / size, D / size);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.75 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, D / 2); floor.receiveShadow = true;
    floor.userData.floor = true;
    this.floor = floor;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + WALL_T * 2, 0.12, D + WALL_T * 2), material('#8f8a83', 0.9));
    slab.position.set(W / 2, -0.061, D / 2); slab.receiveShadow = true;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), material('#f6f4ef', 1));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(W / 2, H, D / 2);
    this.shell.add(floor, slab, ceil);

    const wallM = material(pal.wall, 0.95), trim = material('#f4f2ed', 0.7), stubM = material(shade(pal.wall, -0.12), 0.95);
    this.glass = new THREE.MeshBasicMaterial({ color: '#bfe0f5', transparent: true, opacity: 0.25, depthWrite: false });
    for (let w = 0; w < 4; w++) {
      const g = new THREE.Group(), len = wallLength(room, w);
      const horizontal = w % 2 === 0;
      // Place a box given its span along the wall (u0..u1), height span and depth offset from the inner face.
      const put = (m, u0, u1, y0, y1, t0, t1, parent = g, shadow = false) => {
        if (u1 - u0 < 1e-3 || y1 - y0 < 1e-3) return null;
        const out = (w === 0 || w === 3) ? -1 : 1; // which way "outside" is
        const base = (w === 0 || w === 3) ? 0 : (horizontal ? D : W);
        const depth = t1 - t0, mid = base + out * (t0 + depth / 2);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? u1 - u0 : depth, y1 - y0, horizontal ? depth : u1 - u0), m);
        mesh.position.set(horizontal ? (u0 + u1) / 2 : mid, (y0 + y1) / 2, horizontal ? mid : (u0 + u1) / 2);
        mesh.receiveShadow = true; mesh.castShadow = shadow;
        parent.add(mesh);
        return mesh;
      };
      const ext = horizontal ? WALL_T : 0; // long walls cover the corners
      const ops = room.openings.filter(o => o.wall === w).sort((a, b) => a.pos - b.pos);
      let u = -ext;
      for (const o of ops) {
        const a = o.pos - o.w / 2, b = o.pos + o.w / 2;
        put(wallM, u, a, 0, H, 0, WALL_T);
        put(trim, u, a, 0, 0.07, -0.012, 0);
        if (o.kind === 'door') {
          put(wallM, a, b, DOOR_H, H, 0, WALL_T);
          put(trim, a - 0.05, a, 0, DOOR_H + 0.05, -0.015, WALL_T + 0.005);
          put(trim, b, b + 0.05, 0, DOOR_H + 0.05, -0.015, WALL_T + 0.005);
          put(trim, a, b, DOOR_H, DOOR_H + 0.05, -0.015, WALL_T + 0.005);
          put(material(shade(pal.wood, 0.12), 0.6), a + 0.01, b - 0.01, 0.005, DOOR_H - 0.005, 0.04, 0.085);
          put(material(pal.metal, 0.4, { metal: 0.6 }), b - 0.14, b - 0.04, 0.98, 1.0, 0.0, 0.04);
        } else {
          put(wallM, a, b, 0, SILL, 0, WALL_T);
          put(wallM, a, b, WIN_TOP, H, 0, WALL_T);
          put(trim, a, b, 0, 0.07, -0.012, 0);
          put(trim, a - 0.02, b + 0.02, SILL - 0.03, SILL, -0.05, WALL_T);
          put(trim, a, a + 0.04, SILL, WIN_TOP, 0.03, 0.09);
          put(trim, b - 0.04, b, SILL, WIN_TOP, 0.03, 0.09);
          put(trim, a, b, WIN_TOP - 0.04, WIN_TOP, 0.03, 0.09);
          put(trim, o.pos - 0.02, o.pos + 0.02, SILL, WIN_TOP, 0.04, 0.08);
          const pane = put(this.glass, a, b, SILL, WIN_TOP, 0.055, 0.065);
          if (pane) pane.receiveShadow = false;
        }
        u = b;
      }
      put(wallM, u, len + ext, 0, H, 0, WALL_T);
      put(trim, u, len + ext, 0, 0.07, -0.012, 0);
      const stub = new THREE.Group();
      put(stubM, -ext, len + ext, 0, 0.1, 0, WALL_T, stub);
      this.shell.add(g, stub);
      const n = [[0, -1], [1, 0], [0, 1], [-1, 0]][w];
      const c = [[W / 2, 0], [W, D / 2], [W / 2, D], [0, D / 2]][w];
      this.walls.push({ g, stub, nx: n[0], nz: n[1], cx: c[0] - W / 2, cz: c[1] - D / 2 });
    }
    // Shadow frustum that covers the room.
    const s = Math.hypot(W, D) / 2 + 1;
    const cam = this.sun.shadow.camera;
    cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 1; cam.far = 40;
    cam.updateProjectionMatrix();
  }

  buildMarks(room) {
    disposeGroup(this.marks);
    this.marks.clear();
    const edge = (rect, color) => {
      const g = new THREE.Group();
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false });
      const w = rect.hw * 2 + 0.1, d = rect.hd * 2 + 0.1, t = 0.035;
      for (const [bw, bd, x, z] of [[w, t, 0, -d / 2], [w, t, 0, d / 2], [t, d, -w / 2, 0], [t, d, w / 2, 0]]) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw + (bd === t ? t : 0), 0.004, bd), m);
        mesh.position.set(x, 0, z); mesh.renderOrder = 5;
        g.add(mesh);
      }
      g.position.set(rect.cx, 0.02, rect.cz); g.rotation.y = rect.r * DEG;
      this.marks.add(g);
    };
    for (const it of room.items) {
      const sel = it.id === this.selId, bad = this.flagged.has(it.id);
      if (!sel && !bad) continue;
      const def = CATALOG[it.t];
      for (const r of itemRects(it, def)) edge(r, bad ? '#e5484d' : '#2f6fed');
    }
  }

  // ---- camera -------------------------------------------------------------------
  fitRadius(top = false) {
    const room = this.room; if (!room) return 9;
    const v = this.camera.fov * DEG / 2, h = Math.atan(Math.tan(v) * this.camera.aspect);
    if (top) return Math.max((room.d / 2 + 0.7) / Math.tan(v), (room.w / 2 + 0.7) / Math.tan(h)) + room.h * 0.5;
    // Fit the sphere that encloses the whole room shell.
    const half = Math.hypot(room.w, room.d, room.h) / 2 + 0.15;
    return clamp(half / Math.sin(Math.min(v, h)) * 0.93, 4, 45);
  }

  placeEye() {
    const room = this.room; if (!room) return;
    const door = room.openings.find(o => o.kind === 'door');
    let x = room.w / 2, z = room.d - 0.6;
    if (door) {
      const p = door.wall % 2 === 0 ? [door.pos, door.wall === 0 ? 0.55 : room.d - 0.55] : [door.wall === 3 ? 0.55 : room.w - 0.55, door.pos];
      x = p[0]; z = p[1];
    }
    this.eye.x = x - room.w / 2; this.eye.z = z - room.d / 2;
    this.eye.yaw = Math.atan2(-this.eye.x, -this.eye.z);
    this.eye.pitch = -0.1;
  }

  pose() {
    if (this.mode === 'eye') {
      const e = this.eye, c = Math.cos(e.pitch);
      const pos = new THREE.Vector3(e.x, 1.55, e.z);
      return { pos, look: pos.clone().add(new THREE.Vector3(Math.sin(e.yaw) * c, Math.sin(e.pitch), Math.cos(e.yaw) * c)), fov: 68 };
    }
    const o = this.orbit, ty = this.mode === 'top' ? 0 : 1.0;
    const sp = Math.sin(o.phi);
    return {
      pos: new THREE.Vector3(o.radius * sp * Math.sin(o.theta), ty + o.radius * Math.cos(o.phi), o.radius * sp * Math.cos(o.theta)),
      look: new THREE.Vector3(0, ty, 0), fov: 38,
    };
  }

  frame() {
    if (this.tween) { this.tween.t = Math.min(1, this.tween.t + 0.06); this.dirty = true; }
    if (!this.dirty) return;
    this.dirty = false;
    this.render();
    if (this.tween && this.tween.t >= 1) this.tween = null;
  }

  render() {
    let p = this.pose();
    if (this.tween) {
      const k = smooth(0, 1, this.tween.t), f = this.tween.from;
      p = { pos: f.pos.clone().lerp(p.pos, k), look: f.look.clone().lerp(p.look, k), fov: lerp(f.fov, p.fov, k) };
    }
    this.camera.position.copy(p.pos);
    this.camera.up.set(0, 1, 0);
    if (this.mode === 'top' && !this.tween) this.camera.up.set(0, 0, -1);
    this.camera.lookAt(p.look);
    if (Math.abs(this.camera.fov - p.fov) > 0.01) { this.camera.fov = p.fov; this.camera.updateProjectionMatrix(); }
    // Cut away the walls between the camera and the room.
    const inside = this.mode === 'eye' && !this.tween;
    const hidden = [];
    for (const [i, w] of this.walls.entries()) {
      const outside = (p.pos.x - w.cx) * w.nx + (p.pos.z - w.cz) * w.nz > 0;
      const hide = !inside && outside && this.mode !== 'top';
      w.g.visible = !hide; w.stub.visible = hide;
      hidden[i] = hide;
    }
    for (const e of this.groups.values()) e.g.visible = e.wall < 0 || !hidden[e.wall];
    this.sun.target.position.set(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  // ---- pointer ----------------------------------------------------------------
  pick(ev) {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    return this.ray;
  }
  hitItem(ev) {
    const ray = this.pick(ev);
    const hits = ray.intersectObjects(this.itemsG.children.filter(g => g.visible), true);
    // Rugs lie under everything, so prefer whatever stands on them.
    let best = null;
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.id) o = o.parent;
      if (!o) continue;
      const item = this.room.items.find(i => i.id === o.userData.id);
      if (!item) continue;
      if (!best) best = { item, point: h.point };
      if (layerOf(CATALOG[item.t]) !== 'rug') return { item, point: h.point };
    }
    return best;
  }
  planePoint(ev, y) {
    const ray = this.pick(ev);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), out) ? out : null;
  }

  bindPointer() {
    const el = this.canvas;
    const pts = new Map();
    let drag = null, pinch = 0, moved = false, start = null, tapped = null;
    el.addEventListener('pointerdown', ev => {
      if (!this.room) return;
      el.setPointerCapture(ev.pointerId);
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); drag = null; return; }
      moved = false; start = { x: ev.clientX, y: ev.clientY };
      const hit = this.hitItem(ev);
      tapped = null;
      if (hit && layerOf(CATALOG[hit.item.t]) === 'rug' && hit.item.id !== this.selId) {
        // A rug covers most of the floor: the first tap only selects it, so dragging the floor still turns the view.
        tapped = hit.item.id; drag = null;
      } else if (hit) {
        this.cb.onSelect(hit.item.id);
        const p = this.planePoint(ev, hit.point.y);
        if (p) drag = { id: hit.item.id, y: hit.point.y, ox: hit.item.x - (p.x + this.room.w / 2), oz: hit.item.z - (p.z + this.room.d / 2) };
      } else drag = null;
    });
    el.addEventListener('pointermove', ev => {
      const prev = pts.get(ev.pointerId);
      if (!prev) return;
      const dx = ev.clientX - prev.x, dy = ev.clientY - prev.y;
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch && this.mode !== 'eye') { this.orbit.radius = clamp(this.orbit.radius * pinch / d, 2.5, 45); this.userZoomed = true; }
        pinch = d; this.dirty = true;
        return;
      }
      if (start && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 4) moved = true;
      if (!moved) return;
      if (drag) {
        const p = this.planePoint(ev, drag.y);
        if (p) this.cb.onMove(drag.id, p.x + this.room.w / 2 + drag.ox, p.z + this.room.d / 2 + drag.oz);
        el.style.cursor = 'grabbing';
        return;
      }
      if (this.mode === 'eye') {
        this.eye.yaw += dx * 0.005; this.eye.pitch = clamp(this.eye.pitch + dy * 0.004, -1.1, 0.9);
      } else {
        if (this.mode === 'top') this.mode = 'doll';
        this.orbit.theta -= dx * 0.007;
        this.orbit.phi = clamp(this.orbit.phi - dy * 0.006, 0.05, 1.5);
      }
      this.dirty = true;
    });
    const up = ev => {
      if (!pts.has(ev.pointerId)) return;
      pts.delete(ev.pointerId);
      el.style.cursor = '';
      if (pts.size) { pinch = 0; return; }
      if (drag && moved) this.cb.onMoveEnd();
      else if (!drag && !moved && tapped) this.cb.onSelect(tapped);
      else if (!drag && !moved && start) {
        // A tap on empty floor: deselect, or walk there when standing in the room.
        const p = this.mode === 'eye' ? this.planePoint(ev, 0) : null;
        if (p && Math.abs(p.x) < this.room.w / 2 - 0.3 && Math.abs(p.z) < this.room.d / 2 - 0.3) {
          const from = this.pose();
          this.eye.x = p.x; this.eye.z = p.z;
          this.tween = { from, t: 0 };
        }
        this.cb.onSelect(null);
      }
      drag = null; start = null; this.dirty = true;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', ev => {
      ev.preventDefault();
      if (this.mode === 'eye') return;
      this.orbit.radius = clamp(this.orbit.radius * Math.exp(ev.deltaY * 0.0012), 2.5, 45);
      this.userZoomed = true; this.dirty = true;
    }, { passive: false });
  }
}

// ---- catalogue thumbnails -----------------------------------------------------
// Each piece is rendered once per style with a throwaway renderer, so the cards show the real model in the room's colours.
export function renderThumbs(types, pal, px = 132) {
  const out = {};
  let renderer;
  try {
    const c = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) { return out; }
  renderer.setSize(px, px, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#b5a590', 1.5));
  const sun = new THREE.DirectionalLight('#fff4e4', 2.2); sun.position.set(3, 6, 4); scene.add(sun);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  const saved = material('#000000'); // keep the cache warm; glow is forced off for thumbnails below
  void saved;
  for (const t of types) {
    const g = buildItem({ id: 't', t }, pal, 2.6);
    if (t === 'pendant') g.position.y = -1.3;
    scene.add(g);
    const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    if (t === 'pendant') { size.y = 0.5; mid.y = box.max.y - 0.75; size.x = size.z = 0.5; }
    const flat = size.y < 0.05;
    const dir = flat ? new THREE.Vector3(0.5, 1.6, 1) : new THREE.Vector3(0.75, 0.62, 1);
    cam.position.copy(mid).add(dir.normalize().multiplyScalar(12));
    cam.lookAt(mid);
    const half = Math.max(Math.hypot(size.x, size.z) * 0.5, size.y * 0.62, 0.22) * 1.08;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    out[t] = renderer.domElement.toDataURL('image/png');
    scene.remove(g); disposeGroup(g);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

export { hexToRgb, mainColor };
