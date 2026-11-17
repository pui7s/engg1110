'use strict';
/* 桃花源耕讀 —— 水墨場景：遠山、溪流、桃林、屋舍、田畝，全以程式筆墨繪成 */
const Scene = (() => {
  const TAU = Math.PI * 2;
  const INK = '30,27,24';
  const PAPER = '239,231,211';
  const mul = seed => { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let cv, ctx, W = 0, H = 0, dpr = 1, U = 4, narrow = false;
  let back, front, fieldC, bc, fc, pc;
  let G = null, P = null, landKey = '', dirty = true, last = 0, onLayout = null;
  let V = { term: 6, weather: 'sun', built: {}, trees: 0, plots: [] };
  const farmer = { x: 0, y: 0, tx: 0, ty: 0, act: 0, face: 1, init: false };
  let precip = [], drift = [], mists = [], puffs = [], flock = null;

  /* ---------- 基本筆觸 ---------- */
  const sprites = {};
  function spr(rgb) {
    let s = sprites[rgb];
    if (!s) {
      s = mk(64, 64); const c = s.getContext('2d');
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(.5, `rgba(${rgb},.6)`); g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g; c.fillRect(0, 0, 64, 64); sprites[rgb] = s;
    }
    return s;
  }
  function blob(c, x, y, r, rgb, a, sx = 1, sy = 1) {
    if (r <= 0) return;
    c.globalAlpha = a; c.drawImage(spr(rgb), x - r * sx, y - r * sy, r * 2 * sx, r * 2 * sy); c.globalAlpha = 1;
  }
  function taper(c, x1, y1, qx, qy, x2, y2, w1, w2) {
    const n = 6; let px = x1, py = y1;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * x1 + 2 * u * t * qx + t * t * x2, y = u * u * y1 + 2 * u * t * qy + t * t * y2;
      c.lineWidth = Math.max(.5, w1 + (w2 - w1) * (t - .5 / n));
      c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke(); px = x; py = y;
    }
  }
  function leaf(c, x1, y1, x2, y2, w) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l * w, ny = dx / l * w;
    c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(mx + nx, my + ny, x2, y2); c.quadraticCurveTo(mx - nx, my - ny, x1, y1); c.fill();
  }
  function line(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }

  /* ---------- 時令設色 ---------- */
  function palette(term, wx) {
    const s = term < 6 ? 0 : term < 12 ? 1 : term < 18 ? 2 : 3;
    return {
      s,
      sky: ['228,176,168', '142,184,190', '216,176,116', '146,158,172'][s],
      skyA: [.24, .2, .22, .36][s],
      far: ['100,118,134', '88,118,128', '122,116,112', '110,120,134'][s],
      mid: ['74,92,104', '62,92,98', '98,90,84', '84,94,108'][s],
      near: ['44,58,58', '38,60,54', '68,58,48', '50,56,64'][s],
      tint: ['92,140,112', '62,122,98', '176,108,58', '168,174,182'][s],
      ground: ['150,166,112', '112,152,104', '182,150,92', '170,170,166'][s],
      grass: ['88,128,82', '64,116,78', '150,122,66', '122,118,106'][s],
      tree: term <= 1 ? 'bud' : term <= 5 ? 'bloom' : term <= 8 ? 'leaf' : term <= 11 ? 'fruit' : term <= 13 ? 'leaf' : term <= 17 ? 'autumn' : 'bare',
      snow: wx === 'snow', frost: wx === 'frost', wet: wx === 'rain' || wx === 'storm'
    };
  }

  /* ---------- 佈局 ---------- */
  function computeGeo() {
    narrow = W < 640;
    U = clamp(Math.min(H / 118, W / 150), 2.2, 6.2);
    const g = { hz: H * .45 };
    const fx0 = narrow ? .035 : .12, fx1 = narrow ? .845 : .7;
    g.fx0 = fx0; g.fx1 = fx1;
    g.fTop = H * (narrow ? .7 : .665); g.fBot = H * .968;
    const ins = (fx1 - fx0) * .075;
    const TL = [(fx0 + ins) * W, g.fTop], TR = [(fx1 - ins) * W, g.fTop], BR = [fx1 * W, g.fBot], BL = [fx0 * W, g.fBot];
    g.quad = [TL, TR, BR, BL];
    g.pt = (u, v) => { const ax = lerp(TL[0], TR[0], u), bx = lerp(BL[0], BR[0], u); return [lerp(ax, bx, v), lerp(g.fTop, g.fBot, v)]; };
    const vs = [0, .29, .62, 1], gu = .012, gv = .022;
    g.plots = [];
    for (let i = 0; i < 12; i++) {
      const r = i / 4 | 0, col = i % 4, u0 = col / 4 + gu, u1 = (col + 1) / 4 - gu, v0 = vs[r] + gv, v1 = vs[r + 1] - gv;
      const poly = [g.pt(u0, v0), g.pt(u1, v0), g.pt(u1, v1), g.pt(u0, v1)];
      const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      g.plots.push({ poly, u0, u1, v0, v1, box: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } });
    }
    // 溪流中線（x、y 為畫幅比例，w 為寬度比例）
    const sh = narrow ? .13 : 0, wm = narrow ? 1.5 : 1;
    g.river = [[.47, .462, .004], [.56, .492, .012], [.66 + sh * .6, .53, .022], [.745 + sh, .585, .034], [.81 + sh, .665, .05], [.885 + sh, .79, .075], [1.0 + sh, .93, .11], [1.08 + sh, 1.04, .14]]
      .map(p => [p[0] * W, p[1] * H, p[2] * W * wm]);
    g.riverAt = y => {
      const R = g.river;
      for (let i = 0; i < R.length - 1; i++) if (y <= R[i + 1][1]) { const t = clamp((y - R[i][1]) / (R[i + 1][1] - R[i][1]), 0, 1); return { x: lerp(R[i][0], R[i + 1][0], t), w: lerp(R[i][2], R[i + 1][2], t) }; }
      const e = R[R.length - 1]; return { x: e[0], w: e[2] };
    };
    const mx = f => (fx0 + (f - .12) / (.7 - .12) * (fx1 - fx0)) * W;
    const fy = g.fTop;
    g.site = {
      hut: [mx(.17), fy - U * 4.5], well: [mx(.31), fy - U * 2.2], coop: [mx(.445), fy - U * 3.6], compost: [mx(.6), fy - U * 2.4],
      study: [mx(.36), fy - U * 12.5], granary: [mx(.535), fy - U * 11.5], bamboo: [mx(.06), fy - U * 7]
    };
    const rw = g.riverAt(H * .64), rp = g.riverAt(H * .6), rb = g.riverAt(H * .755);
    g.site.wheel = [rw.x - rw.w * .5 + U * 1.5, H * .64];
    g.site.pavilion = [Math.min(W - U * 9, rp.x + rp.w * .5 + U * 11), H * .6];
    g.site.boat = [rb.x - rb.w * .08, H * .755];
    g.orchard = [.075, .24, .465, .625, .7, .01].map((f, i) => [mx(f) + (i === 5 ? U * 2 : 0), fy - U * (i % 2 ? 9.5 : 8.2)]);
    g.home = [mx(.25), fy - U * .2];
    g.spots = { hill: [W * .04, g.hz + H * .11], river: [g.site.boat[0] - rb.w * .55, g.site.boat[1] + U], home: g.home };
    return g;
  }

  /* ---------- 山 ---------- */
  function ridgeFn(seed, peaks, rough, hs) {
    const r = mul(seed);
    const n1 = Array.from({ length: 9 }, () => r()), n2 = Array.from({ length: 33 }, () => r()), n3 = Array.from({ length: 129 }, () => r());
    const samp = (arr, f) => { const p = f * (arr.length - 1), i = Math.floor(p), t = p - i; const a = arr[clamp(i, 0, arr.length - 1)], b = arr[clamp(i + 1, 0, arr.length - 1)]; return a + (b - a) * (1 - Math.cos(t * Math.PI)) / 2; };
    return x => {
      const f = clamp(x / W, 0, 1);
      const nz = (samp(n1, f) - .5) + (samp(n2, f) - .5) * .45 + (samp(n3, f) - .5) * .2;
      let h = 0;
      for (const p of peaks) { const t = Math.abs(f - p.c) / p.w; if (t < 1) h = Math.max(h, p.h * Math.pow(.5 + .5 * Math.cos(Math.PI * t), p.p) * (1 + nz * .4)); }
      return (h + (nz + .62) * rough) * hs;
    };
  }
  function drawRidge(c, hf, baseY, rgb, a, drop, step) {
    for (let x = 0; x < W; x += step) {
      const y = baseY - hf(x) * H, fade = Math.max(10, baseY - y + drop);
      const g = c.createLinearGradient(0, y, 0, y + fade);
      g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(.28, `rgba(${rgb},${a * .62})`); g.addColorStop(.7, `rgba(${rgb},${a * .16})`); g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g; c.fillRect(x, y, step + .6, fade);
    }
  }
  function ridgeLine(c, hf, baseY, r, rgb, a) {
    c.lineCap = 'round'; let px = 0, py = baseY - hf(0) * H;
    for (let x = 3; x <= W + 3; x += 3) {
      const y = baseY - hf(x) * H;
      if (r() > .14) { c.strokeStyle = `rgba(${rgb},${a * (.45 + r() * .55)})`; c.lineWidth = .6 + r() * 1.5; line(c, px, py, x, y); }
      px = x; py = y;
    }
  }
  function cun(c, hf, baseY, r, n, rgb, a) {
    c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = r() * W, y0 = baseY - hf(x) * H, depth = baseY - y0; if (depth < 14) continue;
      const y = y0 + r() * r() * depth * .75 + 2, sl = clamp((hf(x + 4) - hf(x - 4)) * H / 8, -1.3, 1.3), len = (5 + r() * 18) * U / 4;
      c.strokeStyle = `rgba(${rgb},${a * (.35 + r() * .65) * (1 - (y - y0) / depth * .7)})`; c.lineWidth = .5 + r() * 1.5;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - sl * len * .15, y + len * .5, x - sl * len * .55 + (r() - .5) * 2, y + len); c.stroke();
    }
  }
  function pine(c, x, y, h, rgb, a) {
    c.lineCap = 'round'; c.strokeStyle = `rgba(${rgb},${a})`; c.lineWidth = Math.max(.7, h * .07); line(c, x, y, x + h * .04, y - h);
    for (let k = 0; k < 4; k++) { const yy = y - h * (.34 + k * .2), w = h * (.34 - k * .065); c.lineWidth = Math.max(.9, h * .1); c.beginPath(); c.moveTo(x - w, yy + h * .05); c.quadraticCurveTo(x, yy - h * .07, x + w, yy + h * .04); c.stroke(); }
  }

  /* ---------- 草木 ---------- */
  function foliage(c, tips, s, r, mode, snow) {
    if (mode === 'bare') { if (snow) for (const t of tips) if (r() < .55) blob(c, t[0], t[1] - s * .8, s * 2.2, '252,252,250', .92); return; }
    for (const t of tips) {
      const x = t[0], y = t[1];
      if (mode === 'bloom') {
        const n = 3 + (r() * 3 | 0);
        for (let i = 0; i < n; i++) blob(c, x + (r() - .5) * s * 7, y + (r() - .5) * s * 5, s * (2.2 + r() * 3.4), r() < .5 ? '240,160,178' : '228,118,150', .3 + r() * .34);
        for (let i = 0; i < 3; i++) blob(c, x + (r() - .5) * s * 6, y + (r() - .5) * s * 5, s * (.6 + r() * .7), '196,58,104', .75);
        if (r() < .45) blob(c, x + (r() - .5) * s * 5, y + (r() - .5) * s * 4, s * 1.1, '253,240,238', .85);
      } else if (mode === 'bud') {
        for (let i = 0; i < 2; i++) blob(c, x + (r() - .5) * s * 4, y + (r() - .5) * s * 3, s * (.55 + r() * .5), '200,78,112', .75);
      } else if (mode === 'leaf' || mode === 'fruit') {
        const n = 3 + (r() * 2 | 0);
        for (let i = 0; i < n; i++) blob(c, x + (r() - .5) * s * 7, y + (r() - .5) * s * 5, s * (2.2 + r() * 3), r() < .5 ? '86,124,88' : '56,98,74', .3 + r() * .3);
        blob(c, x + (r() - .5) * s * 4, y + (r() - .5) * s * 3, s * 1.1, '34,62,48', .5);
        if (mode === 'fruit' && r() < .45) { blob(c, x + (r() - .5) * s * 4, y + s * (1 + r() * 2), s * 1.25, '238,138,110', .95); }
      } else if (mode === 'autumn') {
        if (r() < .7) for (let i = 0; i < 2; i++) blob(c, x + (r() - .5) * s * 7, y + (r() - .5) * s * 5, s * (1.8 + r() * 2.6), r() < .6 ? '190,136,58' : '172,92,52', .26 + r() * .26);
      }
    }
  }
  function tree(c, x, y, s, r, mode, snow) {
    const tips = [];
    c.lineCap = 'round'; c.strokeStyle = `rgba(${INK},.84)`;
    const br = (x, y, a, len, w, d) => {
      const bend = (r() - .5) * .9;
      const qx = x + Math.cos(a - bend * .5) * len * .55, qy = y + Math.sin(a - bend * .5) * len * .55;
      const ex = x + Math.cos(a + bend * .4) * len, ey = y + Math.sin(a + bend * .4) * len;
      taper(c, x, y, qx, qy, ex, ey, w, w * .66);
      if (d < 3) tips.push([qx, qy]);
      if (d <= 0 || w < .45) { tips.push([ex, ey]); return; }
      const n = d >= 3 ? 2 + (r() < .5 ? 1 : 0) : 2;
      for (let i = 0; i < n; i++) {
        const na = clamp(a + ((i - (n - 1) / 2) * (1 + r() * .3) + (r() - .5) * .5) * .78, -Math.PI + .1, -.1);
        br(ex, ey, na, len * (.66 + r() * .18), w * .64, d - 1);
      }
    };
    br(x, y, -Math.PI / 2 + (r() - .5) * .5, s * 10.5, s * 2.5, s > 1.15 ? 4 : s > .55 ? 3 : 2);
    foliage(c, tips, s, r, mode, snow);
  }
  // 自畫角探入的桃枝
  function bough(c, r, mode, snow) {
    const s = Math.min(W, H * 1.4) / 300, tips = [];
    c.lineCap = 'round'; c.strokeStyle = `rgba(${INK},.88)`;
    const br = (x, y, a, len, w, d) => {
      const bend = (r() - .5) * .7;
      const qx = x + Math.cos(a - bend * .6) * len * .5, qy = y + Math.sin(a - bend * .6) * len * .5;
      const ex = x + Math.cos(a + bend * .5) * len, ey = y + Math.sin(a + bend * .5) * len;
      taper(c, x, y, qx, qy, ex, ey, w, w * .7);
      tips.push([qx, qy]);
      if (d <= 0) { tips.push([ex, ey]); return; }
      br(ex, ey, a + (r() - .35) * .5, len * (.72 + r() * .15), w * .68, d - 1);
      if (r() < .85) br(ex, ey, a + (r() < .5 ? -1 : 1) * (.5 + r() * .5), len * (.45 + r() * .2), w * .5, Math.min(1, d - 1));
      if (d > 2 && r() < .6) br(qx, qy, a + (r() < .5 ? -1 : 1) * (.6 + r() * .4), len * .5, w * .42, 1);
    };
    br(-s * 8, H * .03, .2, s * (narrow ? 34 : 44), s * 5.2, 5);
    br(-s * 6, H * .16, -.12, s * 22, s * 2.6, 3);
    foliage(c, tips, s * 1.25, r, mode, snow);
  }
  function bamboo(c, x, y, s, r, snow) {
    c.lineCap = 'round';
    for (let k = 0; k < 8; k++) {
      const bx0 = x + (r() - .5) * s * 18, h = s * (20 + r() * 16), lean = (r() - .5) * s * 7, al = .4 + r() * .35;
      c.strokeStyle = `rgba(60,92,72,${al})`; c.lineWidth = Math.max(.9, s * .55);
      for (let i = 0; i < 6; i++) { const t0 = i / 6, t1 = (i + .88) / 6; line(c, bx0 + lean * t0 * t0, y - h * t0, bx0 + lean * t1 * t1, y - h * t1); }
      for (let i = 0; i < 10; i++) {
        const t = .42 + r() * .58, lx = bx0 + lean * t * t, ly = y - h * t, a = Math.PI * (.12 + r() * .3), len = s * (3.5 + r() * 4), dir = r() < .5 ? -1 : 1;
        c.fillStyle = `rgba(38,70,54,${.45 + r() * .4})`; leaf(c, lx, ly, lx + Math.cos(a) * len * dir, ly + Math.sin(a) * len, s * .8);
      }
      if (snow) blob(c, bx0 + lean, y - h, s * 3, '252,252,250', .9);
    }
  }
  function tuft(c, x, y, s, r, rgb, a) {
    c.strokeStyle = `rgba(${rgb},${a})`; c.lineWidth = Math.max(.6, s * .22); c.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const dx = (r() - .5) * s * 2.4; c.beginPath(); c.moveTo(x + dx * .3, y); c.quadraticCurveTo(x + dx * .5, y - s * 1.2, x + dx, y - s * (1.4 + r() * 1.4)); c.stroke(); }
  }
  function rock(c, x, y, s, r) {
    c.beginPath(); c.moveTo(x - s, y); c.quadraticCurveTo(x - s * 1.05, y - s * (.6 + r() * .4), x - s * .2, y - s * (.8 + r() * .4)); c.quadraticCurveTo(x + s * .8, y - s * .9, x + s, y); c.closePath();
    c.fillStyle = 'rgba(120,118,112,.34)'; c.fill(); c.strokeStyle = `rgba(${INK},.6)`; c.lineWidth = Math.max(.8, s * .09); c.stroke();
    c.strokeStyle = `rgba(${INK},.25)`; line(c, x - s * .3, y - s * .7, x - s * .1, y - s * .15);
  }

  /* ---------- 屋舍器物 ---------- */
  function inkPen(c, u, a = .82) { c.strokeStyle = `rgba(${INK},${a})`; c.lineWidth = Math.max(.9, u * .26); c.lineJoin = 'round'; c.lineCap = 'round'; }
  function thatch(c, x, y, u, hw, top, eave, h, rgb) {
    c.fillStyle = `rgba(${rgb || '180,146,88'},.92)`; inkPen(c, u);
    c.beginPath(); c.moveTo(x - eave * u, y); c.quadraticCurveTo(x - hw * u, y - h * u * .45, x - top * u, y - h * u); c.lineTo(x + top * u, y - h * u);
    c.quadraticCurveTo(x + hw * u, y - h * u * .45, x + eave * u, y); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(92,66,32,.42)'; c.lineWidth = Math.max(.5, u * .13);
    for (let k = -4; k <= 4; k++) line(c, x + k * top * u / 4.6, y - h * u * .92, x + k * eave * u / 4.6, y - u * .3);
  }
  function hut(c, x, y, u) {
    inkPen(c, u); c.fillStyle = 'rgba(244,237,220,.97)'; c.beginPath(); c.rect(x - 8 * u, y - 7 * u, 16 * u, 7 * u); c.fill(); c.stroke();
    thatch(c, x, y - 6.2 * u, u, 9, 5.5, 11, 7.2);
    c.fillStyle = `rgba(${INK},.78)`; c.fillRect(x - 1.8 * u, y - 5 * u, 3.6 * u, 5 * u);
    inkPen(c, u, .7); c.strokeRect(x + 3.3 * u, y - 4.8 * u, 3 * u, 2.6 * u); line(c, x + 4.8 * u, y - 4.8 * u, x + 4.8 * u, y - 2.2 * u);
    line(c, x - 6.4 * u, y - 4.6 * u, x - 4 * u, y - 4.6 * u); line(c, x - 6.4 * u, y - 3.2 * u, x - 4 * u, y - 3.2 * u);
  }
  function tileRoof(c, x, y, u, hw, top, h) {
    c.fillStyle = 'rgba(56,58,62,.92)'; inkPen(c, u);
    c.beginPath(); c.moveTo(x - hw * u, y - u * .9); c.quadraticCurveTo(x - hw * u * .72, y - h * u * .35, x - top * u, y - h * u); c.lineTo(x + top * u, y - h * u);
    c.quadraticCurveTo(x + hw * u * .72, y - h * u * .35, x + hw * u, y - u * .9); c.quadraticCurveTo(x, y + u * .5, x - hw * u, y - u * .9); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = `rgba(${PAPER},.2)`; c.lineWidth = Math.max(.5, u * .12);
    for (let k = -6; k <= 6; k++) line(c, x + k * top * u / 6.4, y - h * u * .94, x + k * hw * u / 6.8, y - u * .4);
    inkPen(c, u, .9); c.lineWidth = Math.max(1.4, u * .55); c.beginPath(); c.moveTo(x - (top + 1) * u, y - (h + .8) * u); c.quadraticCurveTo(x, y - h * u + u * .1, x + (top + 1) * u, y - (h + .8) * u); c.stroke();
  }
  function lattice(c, x, y, w, h, u) { inkPen(c, u, .6); c.fillStyle = 'rgba(226,214,186,.9)'; c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h); c.lineWidth = Math.max(.5, u * .14); for (let i = 1; i < 3; i++) line(c, x + w * i / 3, y, x + w * i / 3, y + h); line(c, x, y + h / 2, x + w, y + h / 2); }
  function house(c, x, y, u) {
    inkPen(c, u); c.fillStyle = 'rgba(246,241,228,.98)';
    c.beginPath(); c.rect(x + 9 * u, y - 6 * u, 9 * u, 6 * u); c.fill(); c.stroke(); tileRoof(c, x + 13.5 * u, y - 5.2 * u, u, 6.6, 3.4, 4.2);
    lattice(c, x + 11.6 * u, y - 4.4 * u, 3.8 * u, 2.4 * u, u);
    inkPen(c, u); c.fillStyle = 'rgba(246,241,228,.98)'; c.beginPath(); c.rect(x - 12 * u, y - 8.4 * u, 24 * u, 8.4 * u); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(96,52,36,.75)'; c.lineWidth = Math.max(1, u * .4); for (const k of [-12, -4.2, 4.2, 12]) line(c, x + k * u, y - 8.4 * u, x + k * u, y);
    c.fillStyle = 'rgba(112,46,34,.9)'; c.fillRect(x - 2.6 * u, y - 6.2 * u, 5.2 * u, 6.2 * u); inkPen(c, u, .7); line(c, x, y - 6.2 * u, x, y);
    lattice(c, x - 10.2 * u, y - 6 * u, 4.6 * u, 3 * u, u); lattice(c, x + 5.6 * u, y - 6 * u, 4.6 * u, 3 * u, u);
    tileRoof(c, x, y - 7.6 * u, u, 15.5, 8.5, 6.6);
  }
  function well(c, x, y, u) {
    inkPen(c, u); c.strokeStyle = 'rgba(86,58,36,.85)'; line(c, x - 3.4 * u, y - .6 * u, x - 3.4 * u, y - 7 * u); line(c, x + 3.4 * u, y - .6 * u, x + 3.4 * u, y - 7 * u);
    c.lineWidth = Math.max(1.2, u * .5); line(c, x - 4.6 * u, y - 6.6 * u, x + 4.6 * u, y - 6.6 * u);
    c.lineWidth = Math.max(.6, u * .16); line(c, x + .4 * u, y - 6.4 * u, x + .4 * u, y - 3.4 * u); c.strokeRect(x - .4 * u, y - 3.4 * u, 1.6 * u, 1.4 * u);
    inkPen(c, u); c.fillStyle = 'rgba(176,172,160,.95)'; c.beginPath(); c.ellipse(x, y - 1.4 * u, 3.6 * u, 1.5 * u, 0, 0, TAU); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 3.6 * u, y - 1.4 * u); c.lineTo(x - 3.3 * u, y + .4 * u); c.quadraticCurveTo(x, y + 1.7 * u, x + 3.3 * u, y + .4 * u); c.lineTo(x + 3.6 * u, y - 1.4 * u); c.quadraticCurveTo(x, y + .3 * u, x - 3.6 * u, y - 1.4 * u); c.fill(); c.stroke();
    c.fillStyle = `rgba(${INK},.7)`; c.beginPath(); c.ellipse(x, y - 1.4 * u, 2.4 * u, .9 * u, 0, 0, TAU); c.fill();
  }
  function coop(c, x, y, u, r) {
    inkPen(c, u); c.fillStyle = 'rgba(214,190,146,.95)'; c.beginPath(); c.rect(x - 5.5 * u, y - 4.2 * u, 11 * u, 4.2 * u); c.fill(); c.stroke();
    c.lineWidth = Math.max(.6, u * .16); for (let k = -4; k <= 4; k += 1.6) line(c, x + k * u, y - 4.2 * u, x + k * u, y);
    thatch(c, x, y - 3.8 * u, u, 6, 3.6, 7, 3.4);
    for (let i = 0; i < 3; i++) {
      const hx = x + (i * 4.6 - 9.5 + r() * 2) * u * (i === 2 ? -1 : 1), hy = y + (1 + r() * 2) * u, d = r() < .5 ? 1 : -1;
      c.fillStyle = i === 1 ? 'rgba(150,96,52,.95)' : 'rgba(248,244,236,.98)'; inkPen(c, u, .7); c.lineWidth = Math.max(.6, u * .16);
      c.beginPath(); c.ellipse(hx, hy - 1.1 * u, 1.3 * u, .95 * u, 0, 0, TAU); c.fill(); c.stroke();
      c.beginPath(); c.arc(hx + d * 1.1 * u, hy - 2.1 * u, .55 * u, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = 'rgba(184,52,40,.95)'; c.beginPath(); c.arc(hx + d * 1.1 * u, hy - 2.7 * u, .32 * u, 0, TAU); c.fill();
      line(c, hx - .3 * u, hy - .2 * u, hx - .3 * u, hy + .5 * u); line(c, hx + .4 * u, hy - .2 * u, hx + .4 * u, hy + .5 * u);
    }
  }
  function granary(c, x, y, u) {
    inkPen(c, u); c.fillStyle = 'rgba(226,206,160,.96)';
    c.beginPath(); c.moveTo(x - 5 * u, y - 7 * u); c.lineTo(x - 4.6 * u, y); c.quadraticCurveTo(x, y + 1.3 * u, x + 4.6 * u, y); c.lineTo(x + 5 * u, y - 7 * u); c.closePath(); c.fill(); c.stroke();
    c.lineWidth = Math.max(.5, u * .14); c.strokeStyle = 'rgba(92,66,32,.4)';
    for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(x - 4.9 * u, y - k * 1.8 * u); c.quadraticCurveTo(x, y - k * 1.8 * u + 1.1 * u, x + 4.9 * u, y - k * 1.8 * u); c.stroke(); }
    c.fillStyle = `rgba(${INK},.72)`; c.fillRect(x - 1.1 * u, y - 4.4 * u, 2.2 * u, 2 * u);
    c.fillStyle = 'rgba(176,140,82,.95)'; inkPen(c, u); c.beginPath(); c.moveTo(x - 6.6 * u, y - 6.4 * u); c.quadraticCurveTo(x - 2.5 * u, y - 9 * u, x, y - 12.4 * u); c.quadraticCurveTo(x + 2.5 * u, y - 9 * u, x + 6.6 * u, y - 6.4 * u); c.quadraticCurveTo(x, y - 5 * u, x - 6.6 * u, y - 6.4 * u); c.fill(); c.stroke();
    c.beginPath(); c.arc(x, y - 12.6 * u, .6 * u, 0, TAU); c.fillStyle = `rgba(${INK},.8)`; c.fill();
  }
  function compostPit(c, x, y, u) {
    blob(c, x, y - 1.2 * u, 5.4 * u, '70,54,38', .7, 1, .52);
    inkPen(c, u, .6); c.beginPath(); c.moveTo(x - 4.4 * u, y); c.quadraticCurveTo(x - 2 * u, y - 4 * u, x, y - 3.4 * u); c.quadraticCurveTo(x + 2.4 * u, y - 4.2 * u, x + 4.4 * u, y); c.stroke();
    c.strokeStyle = 'rgba(86,58,36,.8)'; for (const k of [-5, -2.5, 2.5, 5]) line(c, x + k * u, y + .6 * u, x + k * u, y - 2.6 * u); line(c, x - 5 * u, y - 1.6 * u, x + 5 * u, y - 1.6 * u);
    c.strokeStyle = 'rgba(96,124,80,.7)'; c.lineWidth = Math.max(.6, u * .16); for (let k = -2; k <= 2; k++) line(c, x + k * u, y - 2.6 * u, x + k * u + u * .5, y - 3.8 * u);
  }
  function study(c, x, y, u) {
    inkPen(c, u); c.fillStyle = 'rgba(246,241,228,.98)'; c.beginPath(); c.rect(x - 7 * u, y - 6 * u, 14 * u, 6 * u); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(96,52,36,.7)'; c.lineWidth = Math.max(.9, u * .32); for (const k of [-7, 7]) line(c, x + k * u, y - 6 * u, x + k * u, y);
    inkPen(c, u, .7); c.fillStyle = 'rgba(226,214,186,.95)'; c.beginPath(); c.arc(x + 2.6 * u, y - 3.1 * u, 1.9 * u, 0, TAU); c.fill(); c.stroke(); c.lineWidth = Math.max(.5, u * .14); line(c, x + .7 * u, y - 3.1 * u, x + 4.5 * u, y - 3.1 * u); line(c, x + 2.6 * u, y - 5 * u, x + 2.6 * u, y - 1.2 * u);
    c.fillStyle = `rgba(${INK},.75)`; c.fillRect(x - 5 * u, y - 4.6 * u, 3 * u, 4.6 * u);
    tileRoof(c, x, y - 5.3 * u, u, 9.6, 5, 4.8);
  }
  function pavilion(c, x, y, u) {
    blob(c, x, y, 8 * u, '90,90,84', .22, 1, .3);
    c.strokeStyle = 'rgba(150,52,40,.88)'; c.lineCap = 'round'; c.lineWidth = Math.max(1.1, u * .5);
    for (const k of [-4.4, -1.6, 1.6, 4.4]) line(c, x + k * u, y, x + k * u, y - 6.4 * u);
    c.lineWidth = Math.max(.7, u * .24); line(c, x - 4.4 * u, y - 1.6 * u, x - 1.6 * u, y - 1.6 * u); line(c, x + 1.6 * u, y - 1.6 * u, x + 4.4 * u, y - 1.6 * u); line(c, x - 4.4 * u, y - 5.6 * u, x + 4.4 * u, y - 5.6 * u);
    c.fillStyle = 'rgba(56,58,62,.93)'; inkPen(c, u);
    c.beginPath(); c.moveTo(x - 7.4 * u, y - 6.4 * u); c.quadraticCurveTo(x - 3.4 * u, y - 7 * u, x - .5 * u, y - 11.4 * u); c.lineTo(x + .5 * u, y - 11.4 * u); c.quadraticCurveTo(x + 3.4 * u, y - 7 * u, x + 7.4 * u, y - 6.4 * u); c.quadraticCurveTo(x + 6 * u, y - 5.6 * u, x + 5 * u, y - 5.8 * u); c.quadraticCurveTo(x, y - 5 * u, x - 5 * u, y - 5.8 * u); c.quadraticCurveTo(x - 6 * u, y - 5.6 * u, x - 7.4 * u, y - 6.4 * u); c.fill(); c.stroke();
    c.fillStyle = 'rgba(150,52,40,.95)'; c.beginPath(); c.arc(x, y - 12 * u, .75 * u, 0, TAU); c.fill();
  }
  function boat(c, x, y, u) {
    inkPen(c, u); c.fillStyle = 'rgba(96,76,56,.9)';
    c.beginPath(); c.moveTo(x - 7 * u, y - 1.2 * u); c.quadraticCurveTo(x, y + 1.4 * u, x + 7.4 * u, y - 1.8 * u); c.quadraticCurveTo(x + 3 * u, y + 1.6 * u, x - 4 * u, y + .9 * u); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(70,64,58,.85)'; c.beginPath(); c.moveTo(x - 2.6 * u, y - .4 * u); c.quadraticCurveTo(x - .2 * u, y - 4.4 * u, x + 2.6 * u, y - .6 * u); c.closePath(); c.fill(); c.stroke();
    c.lineWidth = Math.max(.6, u * .16); line(c, x - 5.4 * u, y - .8 * u, x - 7.4 * u, y - 7 * u);
  }
  function tinyHouse(c, x, y, s, r) {
    c.fillStyle = 'rgba(244,238,222,.9)'; c.fillRect(x - s * 2, y - s * 1.6, s * 4, s * 1.6);
    c.fillStyle = `rgba(${INK},${.5 + r() * .25})`; c.beginPath(); c.moveTo(x - s * 2.8, y - s * 1.5); c.lineTo(x - s * 1.4, y - s * 3); c.lineTo(x + s * 1.4, y - s * 3); c.lineTo(x + s * 2.8, y - s * 1.5); c.closePath(); c.fill();
    c.strokeStyle = `rgba(${INK},.45)`; c.lineWidth = .7; c.strokeRect(x - s * 2, y - s * 1.6, s * 4, s * 1.6);
  }

  /* ---------- 遠景層：紙、天、遠山 ---------- */
  let paperTile = null;
  function paperTex() {
    if (paperTile) return paperTile;
    const t = mk(320, 320), c = t.getContext('2d'), r = mul(77);
    for (let i = 0; i < 5200; i++) { c.fillStyle = r() < .5 ? `rgba(90,70,40,${r() * .05})` : `rgba(255,252,240,${r() * .09})`; c.fillRect(r() * 320, r() * 320, 1 + r() * 1.6, 1 + r() * 1.6); }
    c.lineWidth = .6;
    for (let i = 0; i < 150; i++) { const x = r() * 320, y = r() * 320, a = r() * TAU, l = 6 + r() * 26; c.strokeStyle = r() < .6 ? `rgba(120,96,60,${.03 + r() * .05})` : `rgba(255,253,244,${.08 + r() * .1})`; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * .5 + (r() - .5) * 6, y + Math.sin(a) * l * .5 + (r() - .5) * 6, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
    return paperTile = t;
  }
  function renderBack() {
    const c = bc; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    c.fillStyle = `rgb(${PAPER})`; c.fillRect(0, 0, W, H);
    c.fillStyle = c.createPattern(paperTex(), 'repeat'); c.fillRect(0, 0, W, H);
    const wx = V.weather, hz = G.hz;
    let g = c.createLinearGradient(0, 0, 0, hz + H * .12);
    g.addColorStop(0, `rgba(${P.sky},${P.skyA})`); g.addColorStop(.55, `rgba(${P.sky},${P.skyA * .45})`); g.addColorStop(1, `rgba(${P.sky},0)`);
    c.fillStyle = g; c.fillRect(0, 0, W, hz + H * .12);
    if (wx === 'rain' || wx === 'storm' || wx === 'snow') {
      const a = wx === 'storm' ? .5 : wx === 'rain' ? .3 : .26; g = c.createLinearGradient(0, 0, 0, H * .7);
      g.addColorStop(0, `rgba(58,66,76,${a})`); g.addColorStop(.6, `rgba(58,66,76,${a * .4})`); g.addColorStop(1, 'rgba(58,66,76,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H * .7);
      const r = mul(5); for (let i = 0; i < 9; i++) blob(c, r() * W, r() * H * .2, H * (.12 + r() * .14), '52,58,68', wx === 'storm' ? .3 : .16, 2.4, .8);
    }
    if (wx === 'scorch') { g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(214,132,60,.2)'); g.addColorStop(1, 'rgba(214,132,60,.04)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    // 日
    if (wx === 'sun' || wx === 'scorch' || wx === 'wind' || wx === 'frost') {
      const sx = W * (narrow ? .5 : .385), sy = H * .115, sr = Math.min(W, H) * (wx === 'scorch' ? .05 : .04), pale = wx === 'wind' || wx === 'frost';
      blob(c, sx, sy, sr * (wx === 'scorch' ? 4.4 : 2.8), '206,74,52', wx === 'scorch' ? .3 : .16);
      c.fillStyle = `rgba(190,58,42,${pale ? .46 : .8})`; c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill();
    }
    const veil = P.wet ? .55 : P.snow ? .7 : 1, hs = narrow ? .86 : 1;
    // 遠峰：武陵石峰
    const rA = mul(11), pA = [];
    for (let i = 0; i < 9; i++) pA.push({ c: .04 + i * .118 + (rA() - .5) * .07, w: .045 + rA() * .06, h: .13 + rA() * .19, p: 1.2 + rA() * 1.6 });
    drawRidge(c, ridgeFn(21, pA, .03, hs), hz - H * .012, P.far, .3 * veil, H * .03, 2);
    // 中山
    const pB = [{ c: .1, w: .2, h: .3, p: 1.3 }, { c: .25, w: .12, h: .19, p: 1.1 }, { c: .36, w: .08, h: .1, p: 1 }, { c: .5, w: .3, h: .05, p: 1 }, { c: .7, w: .09, h: .12, p: 1.2 }, { c: .82, w: .15, h: .25, p: 1.3 }, { c: .96, w: .14, h: .33, p: 1.2 }];
    const hB = ridgeFn(34, pB, .028, hs);
    drawRidge(c, hB, hz + H * .004, P.mid, .46 * veil, H * .035, 1.5);
    cun(c, hB, hz + H * .004, mul(35), Math.round(W * .5), P.mid, .16 * veil);
    ridgeLine(c, hB, hz + H * .004, mul(36), P.mid, .5 * veil);
    if (P.snow || P.s === 3) for (let x = 0; x < W; x += 6) { const h = hB(x); if (h > .09) blob(c, x, hz - h * H + H * .016, H * .028, '252,252,250', P.snow ? .7 : .4, 1.3, .7); }
    // 紙邊暈色
    g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .5, W / 2, H / 2, Math.hypot(W, H) * .56);
    g.addColorStop(0, 'rgba(150,118,70,0)'); g.addColorStop(1, 'rgba(150,118,70,.22)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }

  /* ---------- 近景層：近山、村落、溪、桃林、屋舍 ---------- */
  function renderFront() {
    const c = fc; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const hz = G.hz, hs = narrow ? .86 : 1, snow = P.snow, mode = P.tree, B = V.built || {};
    // 近山（青綠設色）
    const pC = [{ c: -.02, w: .27, h: .28, p: .9 }, { c: .17, w: .13, h: .13, p: 1 }, { c: 1.02, w: .25, h: .25, p: .9 }, { c: .855, w: .1, h: .1, p: 1 }];
    const hC = ridgeFn(52, pC, .012, hs), baseC = hz + H * .04;
    drawRidge(c, hC, baseC, P.near, .62, H * .03, 1);
    for (let x = 0; x < W; x += 4) { const h = hC(x); if (h > .03) blob(c, x, baseC - h * H * .55, h * H * .5, P.tint, P.s === 3 ? .1 : .16, 1.2, 1); }
    cun(c, hC, baseC, mul(53), Math.round(W * .9), INK, .2);
    ridgeLine(c, hC, baseC, mul(54), INK, .7);
    const rp = mul(55);
    for (let i = 0; i < W / 16; i++) { const x = rp() * W, h = hC(x); if (h > .05) pine(c, x, baseC - h * H + U * .6, U * (1.6 + rp() * 2.2), '26,40,36', .62); }
    if (snow || P.s === 3) for (let x = 0; x < W; x += 5) { const h = hC(x); if (h > .06) blob(c, x, baseC - h * H + H * .014, H * .026, '252,252,250', snow ? .82 : .45, 1.3, .7); }
    // 平野淡彩
    const rg = mul(61);
    for (let i = 0; i < 46; i++) { const y = lerp(hz + H * .03, H, Math.pow(rg(), .8)); blob(c, rg() * W, y, H * (.05 + rg() * .09), snow ? '250,250,248' : P.ground, snow ? .5 : .1 + rg() * .09, 3 + rg() * 2, .5); }
    if (P.frost) for (let i = 0; i < 40; i++) blob(c, rg() * W, lerp(hz + H * .05, H, rg()), H * .06, '246,250,252', .42, 3, .4);
    // 阡陌與遠村
    c.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const x = W * (.2 + rg() * .34), y = hz + H * (.035 + rg() * .075), w = W * (.03 + rg() * .05);
      c.strokeStyle = `rgba(${INK},${.1 + rg() * .1})`; c.lineWidth = .7; line(c, x, y, x + w, y + (rg() - .5) * 3); if (rg() < .5) line(c, x + w * .3, y, x + w * .2, y + H * .014);
      if (!snow && rg() < .6) blob(c, x + w * .5, y + H * .008, w * .5, P.grass, .13, 1, .25);
    }
    const rv = mul(63), vill = [[.3, .034], [.335, .04], [.375, .03], [.41, .043], [.44, .033], [.7, .036], [.735, .03]];
    for (const [fxv, fyv] of vill) {
      const x = fxv * W, y = hz + fyv * H, s = U * (.55 + rv() * .25);
      if (rv() < .8) tree(c, x - s * 5, y + s, s * .5, rv, mode, snow);
      tinyHouse(c, x, y, s, rv);
      if (rv() < .5) { c.strokeStyle = `rgba(${INK},.14)`; c.lineWidth = 1; c.beginPath(); c.moveTo(x + s, y - s * 3); c.bezierCurveTo(x + s * 2, y - s * 6, x - s, y - s * 8, x + s * 2.4, y - s * 12); c.stroke(); }
    }
    // 小徑
    c.strokeStyle = `rgba(${INK},.13)`; c.lineWidth = 1; c.setLineDash([U * 2.4, U * 1.6]);
    for (const off of [-U * .9, U * .9]) { c.beginPath(); c.moveTo(G.home[0] + off * 2, G.fTop - U); c.bezierCurveTo(G.home[0] + U * 16, G.fTop - U * 14, W * .34, hz + H * .1, W * .38 + off, hz + H * .05); c.stroke(); }
    c.setLineDash([]);
    // 溪
    const R = G.river, Lb = R.map(p => [p[0] - p[2] / 2, p[1]]), Rb = R.map(p => [p[0] + p[2] / 2, p[1]]);
    const curve = pts => { for (let i = 1; i < pts.length - 1; i++) c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2); const e = pts[pts.length - 1]; c.lineTo(e[0], e[1]); };
    c.beginPath(); c.moveTo(Lb[0][0], Lb[0][1]); curve(Lb); const rr = Rb.slice().reverse(); c.lineTo(rr[0][0], rr[0][1]); curve(rr); c.closePath();
    let g = c.createLinearGradient(0, hz, 0, H); g.addColorStop(0, 'rgba(246,246,240,.72)'); g.addColorStop(1, P.s === 3 ? 'rgba(228,236,240,.95)' : 'rgba(226,236,232,.95)');
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    const rw = mul(64);
    for (let i = 0; i < 70; i++) { const y = lerp(hz + H * .05, H, Math.pow(rw(), .7)), at = G.riverAt(y), x = at.x + (rw() - .5) * at.w * .8, l = at.w * (.08 + rw() * .2); c.strokeStyle = `rgba(60,96,112,${.1 + rw() * .14})`; c.lineWidth = .7 + rw(); c.beginPath(); c.moveTo(x - l, y); c.quadraticCurveTo(x, y - 1.5 - rw() * 2, x + l, y); c.stroke(); }
    for (let i = 0; i < 14; i++) { const y = lerp(hz + H * .1, H, rw()), at = G.riverAt(y); blob(c, at.x + (rw() - .5) * at.w, y, at.w * .5, '70,112,128', .1, 1.4, .3); }
    c.restore();
    for (const bank of [Lb, Rb]) { c.strokeStyle = `rgba(${INK},.42)`; c.lineWidth = 1.1; c.beginPath(); c.moveTo(bank[0][0], bank[0][1]); curve(bank); c.stroke(); }
    // 夾岸桃林（由遠及近）
    const items = [];
    const rt = mul(71);
    for (let y = hz + H * .045; y < H * 1.02; y += H * lerp(.022, .075, clamp((y - hz) / (H - hz), 0, 1))) {
      const at = G.riverAt(y), k = clamp((y - hz) / (H * .52), 0, 1), s = U * lerp(.22, 1.5, k * k) * (.8 + rt() * .4);
      for (const side of [-1, 1]) {
        if (rt() < .2) continue;
        const x = at.x + side * (at.w / 2 + s * (3 + rt() * 7));
        if (x > G.fx0 * W - U * 3 && x < G.pt(1, clamp((y - G.fTop) / (G.fBot - G.fTop), 0, 1))[0] + U * 5 && y > G.fTop - U * 2) continue;
        if (Math.abs(x - G.site.wheel[0]) < U * 7 && Math.abs(y - G.site.wheel[1]) < U * 6) continue;
        if (Math.abs(x - G.site.pavilion[0]) < U * 9 && Math.abs(y - G.site.pavilion[1]) < U * 8) continue;
        items.push({ y, f: () => tree(c, x, y, s, mul(700 + (y * 13 + side * 7 | 0)), mode, snow) });
      }
    }
    for (let i = 0; i < 9; i++) { const x = W * (rt() < .5 ? rt() * .1 : .9 + rt() * .1), y = hz + H * (.07 + rt() * .14), s = U * (.5 + rt() * .5), sd = 900 + i; items.push({ y, f: () => tree(c, x, y, s, mul(sd), mode, snow) }); }
    // 桃源遠處一片粉霞
    if (mode === 'bloom') for (let i = 0; i < 30; i++) { const y = hz + H * (.02 + rt() * .07), at = G.riverAt(y); blob(c, at.x + (rt() - .5) * W * .3, y, H * (.012 + rt() * .02), '236,150,172', .22 + rt() * .2, 2.2, .7); }
    else for (let i = 0; i < 30; i++) rt();
    // 竹
    const bs = G.site.bamboo; items.push({ y: bs[1], f: () => bamboo(c, bs[0], bs[1], U * .62, mul(81), snow) });
    // 親手栽的桃樹
    for (let i = 0; i < Math.min(V.trees || 0, G.orchard.length); i++) { const o = G.orchard[i]; items.push({ y: o[1], f: () => tree(c, o[0], o[1], U * .92, mul(1200 + i * 17), mode, snow) }); }
    // 屋舍
    const S = G.site, bu = U * .86;
    if (B.study) items.push({ y: S.study[1], f: () => study(c, S.study[0], S.study[1], bu * .9) });
    if (B.granary) items.push({ y: S.granary[1], f: () => granary(c, S.granary[0], S.granary[1], bu * .9) });
    if (B.house) items.push({ y: S.hut[1], f: () => house(c, S.hut[0] + bu * 2, S.hut[1], bu * .92) });
    else if (B.hut) items.push({ y: S.hut[1], f: () => hut(c, S.hut[0], S.hut[1], bu) });
    if (B.well) items.push({ y: S.well[1], f: () => well(c, S.well[0], S.well[1], bu * .9) });
    if (B.coop) items.push({ y: S.coop[1], f: () => coop(c, S.coop[0], S.coop[1], bu * .9, mul(91)) });
    if (B.compost) items.push({ y: S.compost[1], f: () => compostPit(c, S.compost[0], S.compost[1], bu * .9) });
    if (B.pavilion) items.push({ y: S.pavilion[1], f: () => pavilion(c, S.pavilion[0], S.pavilion[1], bu * .95) });
    items.push({ y: S.boat[1], f: () => boat(c, S.boat[0], S.boat[1], U * .8) });
    if (B.wheel) items.push({ y: S.wheel[1] - 1, f: () => { inkPen(c, U); c.strokeStyle = 'rgba(86,58,36,.85)'; const [x, y] = S.wheel; line(c, x - U * 4.6, y + U * .8, x - U * .4, y - U * 5.6); line(c, x + U * 3.8, y + U * 1.2, x - U * .4, y - U * 5.6); } });
    items.sort((a, b) => a.y - b.y).forEach(it => it.f());
    if (snow) for (const k of ['hut', 'study', 'granary', 'coop']) if (B[k] || (k === 'hut' && B.house)) blob(c, S[k][0], S[k][1] - bu * 11, bu * 9, '252,252,250', .85, 1, .3);
    // 近處石與草
    const rk = mul(95);
    rock(c, W * .012 + U * 3, H - U * 1.2, U * 4.4, rk); rock(c, W * .012 + U * 8.4, H - U * .6, U * 2.4, rk);
    for (let i = 0; i < 26; i++) { const x = rk() < .5 ? rk() * G.fx0 * W : W * (G.fx1 + rk() * (1 - G.fx1)), y = lerp(G.fTop, H, rk()); const at = G.riverAt(y); if (Math.abs(x - at.x) < at.w * .6) continue; tuft(c, x, y, U * (1 + rk()), rk, snow ? '120,118,110' : P.grass, .6); }
    for (let i = 0; i < 20; i++) tuft(c, G.pt(rk(), 0)[0], G.fTop - U * (.4 + rk() * 1.4), U * .8, rk, snow ? '120,118,110' : P.grass, .5);
    // 畫角桃枝
    bough(c, mul(104), mode, snow);
  }

  /* ---------- 田 ---------- */
  const C_LEAF = '70,112,76', C_DARK = '44,84,58', C_GOLD = '196,152,58', C_DEAD = '120,104,84';
  function plant(c, id, x, y, z, st, r, dead) {
    c.lineCap = 'round';
    if (dead) { c.strokeStyle = `rgba(${C_DEAD},.75)`; c.lineWidth = Math.max(.7, z * .22); for (let i = 0; i < 3; i++) { const dx = (r() - .5) * z * 2.6; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + dx * .4, y - z * 1.3, x + dx, y - z * .3); c.stroke(); } return; }
    if (st === 0) { c.fillStyle = `rgba(${INK},.5)`; c.beginPath(); c.arc(x, y - z * .15, Math.max(.8, z * .2), 0, TAU); c.fill(); return; }
    const sprout = (n, len, w, rgb, spread = 1.1) => { c.fillStyle = `rgba(${rgb},.88)`; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + ((i + .5) / n - .5) * spread * 2 + (r() - .5) * .25; leaf(c, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, w); } };
    if (st === 1 && id !== 'leek' && id !== 'wheat' && id !== 'rice') { sprout(2, z * 1.1, z * .34, C_LEAF, .7); return; }
    const k = st - 1; // 1..3
    switch (id) {
      case 'radish': {
        if (st === 4) { c.fillStyle = 'rgba(250,246,240,.98)'; c.strokeStyle = `rgba(${INK},.55)`; c.lineWidth = Math.max(.6, z * .12); c.beginPath(); c.ellipse(x, y - z * .15, z * .78, z * .62, 0, 0, TAU); c.fill(); c.stroke(); blob(c, x, y - z * .55, z * .7, '214,120,150', .5); }
        sprout(3 + k, z * (1.1 + k * .55), z * .36, C_LEAF, 1); break;
      }
      case 'cabbage': {
        const rad = z * (.5 + k * .34);
        c.fillStyle = 'rgba(96,142,96,.9)'; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * .62; leaf(c, x, y, x + Math.cos(a) * rad * 1.5, y - rad * .5 + Math.sin(a) * rad * .9, rad * .5); }
        c.fillStyle = st >= 3 ? 'rgba(224,236,200,.98)' : 'rgba(150,186,130,.95)'; c.strokeStyle = 'rgba(52,92,60,.7)'; c.lineWidth = Math.max(.6, z * .11);
        c.beginPath(); c.ellipse(x, y - rad * .75, rad * .78, rad * .86, 0, 0, TAU); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(x - rad * .3, y - rad * .2); c.quadraticCurveTo(x - rad * .1, y - rad, x + rad * .1, y - rad * 1.5); c.stroke(); break;
      }
      case 'leek': {
        const n = 4 + k * 2, h = z * (.9 + Math.max(0, k) * .75); c.strokeStyle = `rgba(52,116,70,.9)`; c.lineWidth = Math.max(.7, z * .16);
        for (let i = 0; i < n; i++) { const dx = ((i + .5) / n - .5) * z * 1.9; c.beginPath(); c.moveTo(x + dx * .3, y); c.quadraticCurveTo(x + dx * .6, y - h * .6, x + dx * 1.2 + (r() - .5) * z * .3, y - h * (.8 + r() * .3)); c.stroke(); } break;
      }
      case 'soy': {
        const h = z * (.9 + k * .62), ripe = st === 4; c.strokeStyle = ripe ? 'rgba(140,106,52,.9)' : `rgba(${C_DARK},.85)`; c.lineWidth = Math.max(.6, z * .13); line(c, x, y, x, y - h);
        for (let i = 0; i < 2 + k; i++) { const yy = y - h * (i + 1) / (3 + k); for (const d of [-1, 1]) { c.fillStyle = ripe ? 'rgba(188,150,70,.9)' : `rgba(${C_LEAF},.9)`; c.beginPath(); c.ellipse(x + d * z * .55, yy - z * .1, z * .44, z * .3, d * .5, 0, TAU); c.fill(); } }
        if (ripe) { c.strokeStyle = 'rgba(120,88,40,.95)'; c.lineWidth = Math.max(.9, z * .22); for (const d of [-1, 1]) line(c, x + d * z * .2, y - h * .45, x + d * z * .5, y - h * .2); } break;
      }
      case 'cucumber': {
        const h = z * 3.6; c.strokeStyle = 'rgba(120,92,52,.8)'; c.lineWidth = Math.max(.7, z * .13); line(c, x - z * 1.1, y, x + z * .25, y - h); line(c, x + z * 1.1, y, x - z * .25, y - h);
        const n = 2 + k * 3; for (let i = 0; i < n; i++) { const t = (i + .6) / (n + 1) * (.4 + k * .2), d = i % 2 ? 1 : -1; blob(c, x + d * z * 1.1 * (1 - t) + (r() - .5) * z * .4, y - h * t, z * (.7 + r() * .4), i % 3 ? '70,122,78' : '46,92,62', .78); }
        if (st === 3) for (let i = 0; i < 2; i++) blob(c, x + (r() - .5) * z * 1.6, y - h * (.3 + r() * .4), z * .32, '236,200,70', .95);
        if (st === 4) { c.strokeStyle = 'rgba(36,96,56,.95)'; c.lineWidth = Math.max(1.4, z * .44); for (const d of [-1, 1]) line(c, x + d * z * .62, y - h * .5, x + d * z * .7, y - h * .18); } break;
      }
      case 'eggplant': {
        const h = z * (1 + k * .68); c.strokeStyle = 'rgba(72,60,84,.85)'; c.lineWidth = Math.max(.7, z * .16); line(c, x, y, x, y - h);
        c.fillStyle = 'rgba(64,110,82,.9)'; for (let i = 0; i < 2 + k; i++) { const a = -Math.PI / 2 + (i % 2 ? 1 : -1) * (.7 + r() * .4), yy = y - h * (.4 + i * .18); leaf(c, x, yy, x + Math.cos(a) * z * 1.35, yy + Math.sin(a) * z * .9, z * .46); }
        if (st === 4) for (const d of [-1, 1]) { c.fillStyle = 'rgba(84,44,112,.96)'; c.beginPath(); c.ellipse(x + d * z * .55, y - h * .28, z * .32, z * .68, d * -.25, 0, TAU); c.fill(); } break;
      }
      case 'millet': {
        const h = z * (1.4 + k * 1.05); c.strokeStyle = st === 4 ? 'rgba(150,120,56,.9)' : `rgba(${C_DARK},.85)`; c.lineWidth = Math.max(.7, z * .15); line(c, x, y, x + z * .1, y - h);
        c.fillStyle = st === 4 ? 'rgba(170,150,80,.85)' : `rgba(${C_LEAF},.88)`; for (let i = 0; i < 2 + k; i++) { const d = i % 2 ? 1 : -1, yy = y - h * (.25 + i * .16); leaf(c, x, yy, x + d * z * 1.5, yy - z * (.5 - i * .1), z * .22); }
        if (st >= 3) { c.strokeStyle = st === 4 ? `rgba(${C_GOLD},.98)` : 'rgba(120,150,84,.95)'; c.lineWidth = Math.max(1.4, z * .5); c.beginPath(); c.moveTo(x + z * .1, y - h); c.quadraticCurveTo(x + z * .7, y - h - z * .7, x + z * 1.1, y - h + z * .5); c.stroke(); } break;
      }
      case 'wheat': case 'rice': {
        const gold = st === 4, h = z * (.7 + Math.max(0, k) * (id === 'rice' ? .78 : .86)), n = 3 + Math.max(0, k);
        c.strokeStyle = gold ? `rgba(${C_GOLD},.95)` : (id === 'rice' ? 'rgba(74,138,80,.92)' : 'rgba(68,122,74,.92)'); c.lineWidth = Math.max(.7, z * .15);
        for (let i = 0; i < n; i++) { const dx = ((i + .5) / n - .5) * z * 1.5, lean = id === 'rice' && st >= 3 ? z * .5 : 0; c.beginPath(); c.moveTo(x + dx * .4, y); c.quadraticCurveTo(x + dx * .8, y - h * .6, x + dx * 1.3 + lean, y - h * (.85 + r() * .25)); c.stroke(); }
        if (st >= 3) { c.strokeStyle = gold ? 'rgba(206,160,56,.98)' : 'rgba(128,160,90,.95)'; c.lineWidth = Math.max(1.2, z * .34); for (let i = 0; i < 2; i++) { const dx = (i - .5) * z * 1.1, lean = id === 'rice' ? z * .5 : 0; line(c, x + dx + lean * .6, y - h * .98, x + dx + lean, y - h * .72); } } break;
      }
    }
  }
  function drawPlot(c, i, p) {
    const g = G.plots[i], poly = g.poly, r = mul(4000 + i * 91), pt = (u, v) => G.pt(lerp(g.u0, g.u1, u), lerp(g.v0, g.v1, v));
    const path = () => { c.beginPath(); c.moveTo(poly[0][0], poly[0][1]); for (let k = 1; k < 4; k++) c.lineTo(poly[k][0], poly[k][1]); c.closePath(); };
    const ph = poly[3][1] - poly[0][1], pw = poly[2][0] - poly[3][0];
    if (!p || p.s === 0) {
      path(); c.fillStyle = P.snow ? 'rgba(250,250,248,.6)' : `rgba(${P.grass},.13)`; c.fill();
      c.setLineDash([3, 5]); c.strokeStyle = `rgba(${INK},.22)`; c.lineWidth = .8; c.stroke(); c.setLineDash([]);
      for (let k = 0; k < 9; k++) { const q = pt(.08 + r() * .84, .2 + r() * .75); tuft(c, q[0], q[1], ph * .1 * (.8 + r() * .6), r, P.snow ? '120,118,110' : P.grass, .7); }
      for (let k = 0; k < 2; k++) { const q = pt(.15 + r() * .7, .4 + r() * .5); rock(c, q[0], q[1], ph * .07 * (.8 + r() * .6), r); }
      return;
    }
    const wet = [['168,138,100', .34], ['128,104,78', .46], ['100,84,70', .56], ['76,68,64', .64]][clamp(p.m | 0, 0, 3)];
    path(); c.fillStyle = `rgba(${wet[0]},${wet[1]})`; c.fill();
    if (p.water) { c.fillStyle = 'rgba(150,186,196,.5)'; c.fill(); }
    c.strokeStyle = `rgba(${INK},.5)`; c.lineWidth = 1; c.stroke();
    c.save(); path(); c.clip();
    for (let k = 0; k < 5; k++) { const v = (k + .6) / 5, a = pt(0, v), b = pt(1, v); c.strokeStyle = p.water ? 'rgba(246,250,250,.45)' : `rgba(${INK},${.14 + r() * .1})`; c.lineWidth = p.water ? .8 : .7 + v * .6; c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo((a[0] + b[0]) / 2, a[1] - 1.5 + r() * 3, b[0], b[1]); c.stroke(); }
    if (p.m === 0 && !P.snow) { c.strokeStyle = 'rgba(96,70,44,.4)'; c.lineWidth = .7; for (let k = 0; k < 5; k++) { const q = pt(.1 + r() * .8, .15 + r() * .7); c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(q[0] + (r() - .5) * pw * .12, q[1] + ph * .1); c.lineTo(q[0] + (r() - .5) * pw * .16, q[1] + ph * .2); c.stroke(); } }
    c.restore();
    if (p.crop) {
      const rows = [.34, .62, .9], n = p.crop === 'leek' || p.crop === 'wheat' || p.crop === 'rice' ? 6 : 4;
      for (const v of rows) for (let k = 0; k < n; k++) { const q = pt((k + .5) / n + (r() - .5) * .03, v), z = ph * .105 * (.82 + v * .3); plant(c, p.crop, q[0], q[1], z, p.st, r, p.dead); }
    }
    if (p.weeds) for (let k = 0; k < 12; k++) { const q = pt(.06 + r() * .88, .25 + r() * .72); tuft(c, q[0], q[1], ph * .13 * (.8 + r() * .5), r, '132,150,62', .92); }
    if (p.cover) { c.save(); path(); c.clip(); c.strokeStyle = 'rgba(190,156,84,.75)'; c.lineWidth = Math.max(1, ph * .03); for (let k = 0; k < 46; k++) { const q = pt(r(), r()); line(c, q[0] - pw * .05, q[1] + (r() - .5) * 4, q[0] + pw * .05, q[1] + (r() - .5) * 4); } c.restore(); }
    if (P.snow) { c.save(); path(); c.clip(); for (let k = 0; k < 7; k++) { const q = pt(r(), r()); blob(c, q[0], q[1], pw * .16, '252,252,250', .7, 1, .45); } c.restore(); }
    else if (P.frost) { c.save(); path(); c.clip(); for (let k = 0; k < 6; k++) { const q = pt(r(), r()); blob(c, q[0], q[1], pw * .16, '240,248,252', .5, 1, .45); } c.restore(); }
  }
  function renderField() {
    const c = pc; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const q = G.quad, B = V.built || {}, cx = (q[0][0] + q[1][0]) / 2;
    blob(c, cx, (G.fTop + G.fBot) / 2, (q[2][0] - q[3][0]) * .62, P.snow ? '250,250,248' : '132,112,82', P.snow ? .5 : .2, 1, (G.fBot - G.fTop) / (q[2][0] - q[3][0]) * 1.15);
    if (B.ditch) {
      c.strokeStyle = 'rgba(86,130,146,.6)'; c.lineWidth = Math.max(2, U * .8); c.lineCap = 'round';
      c.beginPath(); c.moveTo(q[1][0] + U * 1.6, q[1][1]); c.lineTo(q[2][0] + U * 1.8, q[2][1] - U); const at = G.riverAt(q[2][1] - U); c.quadraticCurveTo(q[2][0] + U * 6, q[2][1] + U, Math.max(q[2][0] + U * 8, at.x - at.w * .5), q[2][1] + U * .5); c.stroke();
      c.strokeStyle = `rgba(${INK},.35)`; c.lineWidth = .8; line(c, q[1][0] + U * .8, q[1][1], q[2][0] + U * .9, q[2][1] - U);
    }
    if (B.fence) {
      c.strokeStyle = 'rgba(96,84,52,.85)'; c.lineCap = 'round';
      const seg = (a, b, n) => { for (let k = 0; k <= n; k++) { const x = lerp(a[0], b[0], k / n), y = lerp(a[1], b[1], k / n), h = U * lerp(2.2, 3.4, (y - G.fTop) / (G.fBot - G.fTop)); c.lineWidth = Math.max(1, U * .3); line(c, x, y, x, y - h); if (k < n) { const x2 = lerp(a[0], b[0], (k + 1) / n), y2 = lerp(a[1], b[1], (k + 1) / n); c.lineWidth = Math.max(.7, U * .18); line(c, x, y - h * .75, x2, y2 - h * .35); line(c, x, y - h * .35, x2, y2 - h * .75); } } };
      const o = U * 1.4; seg([q[0][0] - o, q[0][1] - o * .5], [q[1][0] + o, q[1][1] - o * .5], narrow ? 14 : 22); seg([q[0][0] - o, q[0][1] - o * .5], [q[3][0] - o, q[3][1]], 7);
    }
    for (let i = 0; i < 12; i++) drawPlot(c, i, V.plots[i]);
  }

  /* ---------- 動態：霧、鳥、雨雪、落英、炊煙、水車、農夫 ---------- */
  function initMotion() {
    const area = W * H / 450000, wx = V.weather;
    precip = [];
    const np = wx === 'storm' ? 230 : wx === 'rain' ? 110 : wx === 'snow' ? 120 : 0;
    for (let i = 0; i < np * clamp(area, .4, 2.4); i++) precip.push({ x: Math.random() * (W + 200) - 100, y: Math.random() * H, v: .7 + Math.random() * .6, s: Math.random() });
    drift = [];
    let nd = P.tree === 'bloom' ? 34 : P.tree === 'autumn' ? 16 : 0; if (wx === 'wind') nd = nd * 2 + 14; if (P.wet || P.snow) nd = Math.round(nd * .4);
    for (let i = 0; i < nd * clamp(area, .5, 2.2); i++) drift.push({ x: Math.random() * W, y: Math.random() * H, v: .6 + Math.random() * .8, ph: Math.random() * TAU, s: .7 + Math.random() * .8 });
    mists = [];
    const nm = (P.wet ? 8 : 5);
    for (let i = 0; i < nm; i++) mists.push({ x: Math.random() * W, y: G.hz + H * (-.06 + Math.random() * .1), r: H * (.1 + Math.random() * .12), v: (4 + Math.random() * 7) * (i % 2 ? 1 : -1), a: (P.wet ? .75 : .55) * (.6 + Math.random() * .4) });
    puffs = [];
    flock = { x: -W * .2, y: H * (.12 + Math.random() * .12), v: 16 + Math.random() * 10, n: 3 + (Math.random() * 4 | 0), wait: 3 + Math.random() * 10 };
  }
  function drawFarmer(c, t) {
    const f = farmer, u = U * .78, moving = Math.hypot(f.tx - f.x, f.ty - f.y) > 1.5;
    const bob = moving ? Math.sin(t * 14) * u * .35 : 0, work = f.act > 0 ? Math.sin(t * 16) : 0;
    const x = f.x, y = f.y + bob * .3, d = f.face;
    blob(c, x, y, u * 4, '40,36,30', .28, 1, .28);
    c.lineCap = 'round'; c.strokeStyle = `rgba(${INK},.85)`; c.lineWidth = Math.max(1, u * .55);
    const step = moving ? Math.sin(t * 14) * u : 0; line(c, x - u * .7, y - u * 3, x - u * .9 - step * .6, y); line(c, x + u * .7, y - u * 3, x + u * .9 + step * .6, y);
    c.fillStyle = 'rgba(54,76,96,.95)'; c.beginPath(); c.moveTo(x - u * 1.7, y - u * 2.6); c.quadraticCurveTo(x - u * 1.9, y - u * 5.6, x - u * .9, y - u * 6.6); c.lineTo(x + u * .9, y - u * 6.6); c.quadraticCurveTo(x + u * 1.9, y - u * 5.6, x + u * 1.7, y - u * 2.6); c.closePath(); c.fill();
    c.strokeStyle = `rgba(${INK},.7)`; c.lineWidth = Math.max(.7, u * .2); c.stroke();
    // 鋤
    const hx = x + d * u * 1.5, hy = y - u * 4.6, ang = (-.9 + work * .55) * d, ex = hx + Math.sin(ang) * u * 6.5 * d * d, ey = hy - Math.cos(ang) * u * 6.5;
    c.strokeStyle = 'rgba(96,66,40,.95)'; c.lineWidth = Math.max(.9, u * .32);
    if (f.act > 0) { const tx = x + d * u * 4.6, ty = y - u * (1.2 + work * 2.4); line(c, hx, hy, tx, ty); c.strokeStyle = `rgba(${INK},.9)`; c.lineWidth = Math.max(1.4, u * .6); line(c, tx, ty, tx - d * u * .4, ty + u * 1.3); }
    else { line(c, x - d * u * 1.4, y - u * 2, ex - d * u * 2.5, ey + u * 1.2); c.strokeStyle = `rgba(${INK},.9)`; c.lineWidth = Math.max(1.4, u * .6); line(c, ex - d * u * 2.5, ey + u * 1.2, ex - d * u * 1.2, ey + u * 1.6); }
    c.fillStyle = 'rgba(222,188,156,1)'; c.beginPath(); c.arc(x, y - u * 7.5, u * 1.05, 0, TAU); c.fill();
    c.fillStyle = 'rgba(186,150,88,1)'; c.strokeStyle = `rgba(${INK},.8)`; c.lineWidth = Math.max(.7, u * .2);
    c.beginPath(); c.moveTo(x - u * 2.9, y - u * 7.7); c.quadraticCurveTo(x, y - u * 8.6, x, y - u * 10.2); c.quadraticCurveTo(x, y - u * 8.6, x + u * 2.9, y - u * 7.7); c.quadraticCurveTo(x, y - u * 7.1, x - u * 2.9, y - u * 7.7); c.fill(); c.stroke();
  }
  function draw(now) {
    const t = now / 1000, dt = clamp((now - last) / 1000, 0, .05); last = now;
    const c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.drawImage(back, 0, 0, W, H);
    const wx = V.weather, wind = wx === 'wind' ? 1 : wx === 'storm' ? .6 : .12;
    // 鳥
    if (flock && !P.wet && !P.snow) {
      if (flock.wait > 0) flock.wait -= dt; else { flock.x += flock.v * dt; if (flock.x > W * 1.2) { flock.x = -W * .15; flock.y = H * (.1 + Math.random() * .14); flock.wait = 8 + Math.random() * 16; flock.n = 3 + (Math.random() * 4 | 0); } }
      c.strokeStyle = `rgba(${INK},.55)`; c.lineWidth = 1; c.lineCap = 'round';
      for (let i = 0; i < flock.n; i++) { const bx = flock.x - i * U * 3.4 - (i % 2) * U, by = flock.y + (i % 3) * U * 1.6 + Math.sin(t * 1.3 + i) * 2, fl = Math.sin(t * 7 + i * 1.7) * U * .45, s = U * .75; c.beginPath(); c.moveTo(bx - s, by - fl); c.quadraticCurveTo(bx - s * .4, by - s * .5, bx, by); c.quadraticCurveTo(bx + s * .4, by - s * .5, bx + s, by - fl); c.stroke(); }
    }
    for (const m of mists) { if (!reduce) { m.x += m.v * dt; if (m.x < -m.r * 3) m.x = W + m.r * 3; if (m.x > W + m.r * 3) m.x = -m.r * 3; } blob(c, m.x, m.y, m.r, '247,243,232', m.a, 3.2, .62); }
    c.drawImage(front, 0, 0, W, H);
    // 溪光
    if (!reduce) { c.lineCap = 'round'; for (let k = 0; k < 12; k++) { const ph = (t * .035 + k / 12) % 1, y = lerp(G.hz + H * .06, H, ph * ph), at = G.riverAt(y), x = at.x + Math.sin(k * 2.4 + t * .4) * at.w * .28, l = at.w * .14; c.strokeStyle = `rgba(255,255,255,${.55 * Math.sin(ph * Math.PI)})`; c.lineWidth = 1 + ph * 1.4; line(c, x - l, y, x + l, y); } }
    // 水車
    if (V.built && V.built.wheel) {
      const [x, y0] = G.site.wheel, y = y0 - U * 3.2, R = U * 5, a0 = reduce ? 0 : t * .7;
      c.strokeStyle = 'rgba(86,58,36,.9)'; c.lineCap = 'round'; c.lineWidth = Math.max(1, U * .34); c.beginPath(); c.arc(x, y, R, 0, TAU); c.stroke(); c.lineWidth = Math.max(.7, U * .2); c.beginPath(); c.arc(x, y, R * .72, 0, TAU); c.stroke();
      for (let k = 0; k < 10; k++) { const a = a0 + k * TAU / 10, ca = Math.cos(a), sa = Math.sin(a); line(c, x, y, x + ca * R, y + sa * R); c.lineWidth = Math.max(1.2, U * .5); line(c, x + ca * R - sa * U * .9, y + sa * R + ca * U * .9, x + ca * R + sa * U * .9, y + sa * R - ca * U * .9); c.lineWidth = Math.max(.7, U * .2); }
      c.fillStyle = `rgba(${INK},.85)`; c.beginPath(); c.arc(x, y, U * .6, 0, TAU); c.fill();
    }
    c.drawImage(fieldC, 0, 0, W, H);
    // 炊煙
    const B = V.built || {};
    if ((B.hut || B.house) && !reduce) {
      if (Math.random() < dt * 2.2) puffs.push({ x: G.site.hut[0] + U * 3, y: G.site.hut[1] - U * (B.house ? 13 : 11.5), a: .5, r: U * 1.2 });
      for (const p of puffs) { p.y -= dt * U * 3.2; p.x += dt * U * (1.4 + wind * 9) + Math.sin(t * 2 + p.y * .1) * .15; p.r += dt * U * 1.3; p.a -= dt * .1; blob(c, p.x, p.y, p.r, '110,108,104', Math.max(0, p.a)); }
      puffs = puffs.filter(p => p.a > 0);
    }
    // 農夫
    const f = farmer, dx = f.tx - f.x, dy = f.ty - f.y, dist = Math.hypot(dx, dy);
    if (dist > .5) { const sp = Math.max(W, H) * .9 * dt; if (reduce || dist <= sp) { f.x = f.tx; f.y = f.ty; } else { f.x += dx / dist * sp; f.y += dy / dist * sp; if (Math.abs(dx) > 2) f.face = dx > 0 ? 1 : -1; } }
    else if (f.act > 0) f.act -= dt;
    drawFarmer(c, reduce ? 0 : t);
    // 落英／落葉
    if (drift.length) {
      const autumn = P.tree === 'autumn' || P.tree === 'bare';
      for (const p of drift) {
        if (!reduce) { p.x += (16 + wind * 190) * p.v * dt + Math.sin(t * 1.6 + p.ph) * 14 * dt; p.y += (20 + wind * 26) * p.v * dt; if (p.y > H + 8) { p.y = -8; p.x = Math.random() * W; } if (p.x > W + 8) p.x = -8; }
        c.save(); c.translate(p.x, p.y); c.rotate(t * 1.5 * p.v + p.ph); c.scale(1, .55 + .4 * Math.sin(t * 2.4 + p.ph));
        c.fillStyle = autumn ? 'rgba(186,128,54,.85)' : (p.s > 1.1 ? 'rgba(226,116,150,.9)' : 'rgba(240,164,184,.92)'); c.beginPath(); c.ellipse(0, 0, U * .7 * p.s, U * .42 * p.s, 0, 0, TAU); c.fill(); c.restore();
      }
    }
    // 雨雪
    if (precip.length) {
      if (wx === 'snow') { c.fillStyle = 'rgba(255,255,255,.96)'; c.strokeStyle = 'rgba(110,120,134,.3)'; c.lineWidth = .6; for (const p of precip) { if (!reduce) { p.y += 34 * p.v * dt; p.x += Math.sin(t + p.s * 9) * 12 * dt; if (p.y > H) { p.y = -4; p.x = Math.random() * W; } } c.beginPath(); c.arc(p.x, p.y, 1.2 + p.s * 1.8, 0, TAU); c.fill(); c.stroke(); } }
      else { const sl = wx === 'storm' ? .32 : .12, sp = wx === 'storm' ? 900 : 620, len = wx === 'storm' ? 26 : 17; c.strokeStyle = `rgba(48,58,70,${wx === 'storm' ? .36 : .28})`; c.lineWidth = wx === 'storm' ? 1.2 : 1; c.lineCap = 'round'; c.beginPath(); for (const p of precip) { if (!reduce) { p.y += sp * p.v * dt; p.x -= sp * sl * p.v * dt; if (p.y > H) { p.y = -len; p.x = Math.random() * (W + 200); } } c.moveTo(p.x, p.y); c.lineTo(p.x - len * sl * p.v, p.y + len * p.v); } c.stroke(); }
    }
    if (wx === 'storm') { c.fillStyle = 'rgba(40,48,60,.14)'; c.fillRect(0, 0, W, H); }
  }
  function loop(now) { requestAnimationFrame(loop); if (!W || !G) return; if (reduce && !dirty) return; dirty = false; draw(now); }

  /* ---------- 對外 ---------- */
  function resize() {
    const box = cv.parentElement.getBoundingClientRect(), w = Math.round(box.width), h = Math.round(box.height);
    if (w < 40 || h < 40) return; if (w === W && h === H && G) return;
    W = w; H = h; dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    back = mk(W * dpr, H * dpr); front = mk(W * dpr, H * dpr); fieldC = mk(W * dpr, H * dpr);
    bc = back.getContext('2d'); fc = front.getContext('2d'); pc = fieldC.getContext('2d');
    G = computeGeo(); landKey = '';
    if (!farmer.init) { farmer.x = farmer.tx = G.home[0]; farmer.y = farmer.ty = G.home[1]; farmer.init = true; } else { farmer.x = farmer.tx = G.home[0]; farmer.y = farmer.ty = G.home[1]; }
    refresh(); if (onLayout) onLayout(layout());
  }
  function refresh() {
    if (!G) return;
    P = palette(V.term, V.weather);
    const key = [W, H, V.term, V.weather, Object.keys(V.built || {}).filter(k => V.built[k]).sort().join(), V.trees].join('|');
    if (key !== landKey) { const mot = landKey.split('|').slice(0, 4).join('|') !== key.split('|').slice(0, 4).join('|'); landKey = key; renderBack(); renderFront(); if (mot) initMotion(); }
    renderField(); dirty = true;
  }
  function layout() { return G ? { w: W, h: H, plots: G.plots.map(p => p.box) } : null; }
  return {
    init(canvas) { cv = canvas; ctx = cv.getContext('2d'); resize(); if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(cv.parentElement); window.addEventListener('resize', resize); last = performance.now(); requestAnimationFrame(loop); },
    update(view) { V = view; refresh(); },
    layout,
    set onLayout(fn) { onLayout = fn; },
    work(i) { if (!G) return; const b = G.plots[i].poly; farmer.tx = (b[2][0] + b[3][0]) / 2 - (b[2][0] - b[3][0]) * .28; farmer.ty = b[3][1] - (b[3][1] - b[0][1]) * .12; farmer.face = 1; farmer.act = .9; dirty = true; },
    go(spot) { if (!G) return; const s = G.spots[spot] || G.home; farmer.tx = s[0]; farmer.ty = s[1]; farmer.act = spot === 'home' ? 0 : .9; dirty = true; }
  };
})();
