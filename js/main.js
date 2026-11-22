// App shell: state, history, panels and the wiring between the 2D plan, the 3D view and the coach.
import { CATALOG, CATEGORIES, ITEM_IDS, ROOM_TYPES, ROOM_TYPE_IDS, SQFT, layerOf } from './catalog.js';
import { STYLES, STYLE_IDS, FLOORS, FLOOR_IDS, paletteFor, swatchesFor, shade } from './styles.js';
import { makeRoom, autoLayout, findSpot, settle, fits, clampOpening, newId } from './layout.js';
import { evaluate, budget } from './coach.js';
import { Scene3D, renderThumbs } from './scene3d.js';
import { Plan2D } from './plan2d.js';
import { t, setLang, getLang, money } from './i18n.js';
import { clamp, round2, wallLength } from './geo.js';

const LS = 'dreamhome.v1';
const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ICONS = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="m8.2 10.8 6.6-3.6M8.2 13.2l6.6 3.6"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  plan: '<rect x="4" y="4" width="16" height="16"/><path d="M4 13h7v7M14 4v6"/>',
  split: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  top: '<rect x="5" y="5" width="14" height="14" rx="1"/><path d="M12 2v6M9.5 5.5 12 8l2.5-2.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  stop: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16v.4"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  wand: '<path d="m4 20 11-11M14 5l1-2 1 2 2 1-2 1-1 2-1-2-2-1zM18 13l.7-1.3.7 1.3 1.3.7-1.3.7-.7 1.3-.7-1.3-1.3-.7z"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m10 21 2-6-2.5-2.5 1-5 4 3 3 1M8 12l1.5-4M14 21l-1-4"/>',
  sofa: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM6 17v2M18 17v2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-.5-1.5 0-2.5 2-.5 3.5-.5A3.5 3.5 0 0 0 21 12.5C21 7 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/>',
  ruler: '<path d="m3 16 13-13 5 5L8 21z"/><path d="m7 12 2 2M10 9l2 2M13 6l2 2"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  cart: '<path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  bed: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>',
  table: '<path d="M3 8h18M5 8v11M19 8v11M8 8v4h8V8"/>',
  desk: '<path d="M3 8h18M4 8v11M20 8v11M14 8v6h6M14 11h6"/>',
  home: '<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M10 20v-6h4v6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
};
const icon = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const TYPE_ICON = { living: 'sofa', bedroom: 'bed', dining: 'table', office: 'desk', studio: 'home' };

const state = {
  project: null, sel: null, selOp: null, highlight: null,
  view: '3d', cam: 'doll', leftTab: 'add', rightTab: 'coach', mob: 'L', cat: 'seating',
  showWalk: false, modal: null, wiz: null, openCheck: null, confirmDel: false, photo: null, codeError: false,
};
let ev = null, scene = null, plan = null, roomDirty = true, queued = false;
const thumbs = {};
let history = [], hIndex = -1;
const lastHTML = new WeakMap();

const room = () => state.project.rooms.find(r => r.id === state.project.active) || state.project.rooms[0];
const itemName = id => t('i.' + id);

// ---------------------------------------------------------------------------
// Persistence, history, sharing
// ---------------------------------------------------------------------------
function sanitize(p) {
  if (!p || !Array.isArray(p.rooms) || !p.rooms.length) return null;
  for (const r of p.rooms) {
    if (!(r.w > 1 && r.d > 1) || !ROOM_TYPES[r.type]) return null;
    r.id = r.id || newId(); r.h = r.h || 2.6; r.hour = r.hour ?? 14;
    if (!STYLES[r.style]) r.style = 'japandi';
    r.items = (r.items || []).filter(i => CATALOG[i.t] && isFinite(i.x) && isFinite(i.z));
    r.items.forEach(i => { i.id = i.id || newId(); i.r = i.r || 0; });
    r.openings = (r.openings || []).filter(o => o.wall >= 0 && o.wall < 4);
    r.openings.forEach(o => { o.id = o.id || newId(); clampOpening(r, o); });
  }
  if (!p.rooms.some(r => r.id === p.active)) p.active = p.rooms[0].id;
  return p;
}

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 4096) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function encodeProject(p) {
  const slim = {
    v: 1, a: p.rooms.findIndex(r => r.id === p.active),
    r: p.rooms.map(r => ({
      n: r.name, y: r.type, w: r.w, d: r.d, s: r.style, wl: r.wall || 0, fl: r.floor || 0, h: r.hour,
      o: r.openings.map(o => [o.kind === 'door' ? 0 : 1, o.wall, o.pos, o.w]),
      i: r.items.map(i => [i.t, i.x, i.z, i.r].concat(i.c ? [i.c] : [])),
    })),
  };
  return b64(new TextEncoder().encode(JSON.stringify(slim)));
}
function decodeProject(code) {
  try {
    const clean = code.trim().replace(/^.*#d=/, '').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(clean);
    const slim = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    const rooms = slim.r.map(r => ({
      id: newId(), name: String(r.n || '').slice(0, 40), type: r.y, w: +r.w, d: +r.d, h: 2.6, style: r.s, wall: r.wl || null, floor: r.fl || null, hour: r.h ?? 14,
      openings: r.o.map(o => ({ id: newId(), kind: o[0] ? 'window' : 'door', wall: o[1], pos: +o[2], w: +o[3] })),
      items: r.i.map(i => ({ id: newId(), t: i[0], x: +i[1], z: +i[2], r: +i[3] || 0, ...(/^#[0-9a-f]{6}$/i.test(i[4] || '') ? { c: i[4] } : {}) })),
    }));
    return sanitize({ v: 1, rooms, active: rooms[slim.a] ? rooms[slim.a].id : rooms[0].id });
  } catch (e) { return null; }
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS, JSON.stringify({ ...state.project, lang: getLang() })); } catch (e) { /* storage unavailable: the design still works for this visit */ }
  }, 250);
}
const snap = () => JSON.stringify({ rooms: state.project.rooms, active: state.project.active });
function commit() {
  history = history.slice(0, hIndex + 1);
  history.push(snap());
  if (history.length > 80) history.shift();
  hIndex = history.length - 1;
  save(); touch();
}
function travel(dir) {
  const next = hIndex + dir;
  if (next < 0 || next >= history.length) return;
  hIndex = next;
  const s = JSON.parse(history[hIndex]);
  state.project.rooms = s.rooms; state.project.active = s.active;
  state.sel = null; state.selOp = null; state.highlight = null;
  save(); touch();
}

// ---------------------------------------------------------------------------
// Refresh pipeline
// ---------------------------------------------------------------------------
function touch() { roomDirty = true; schedule(); }
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; refresh(); });
}
function refresh() {
  const r = room();
  if (roomDirty || !ev) { ev = evaluate(r); roomDirty = false; }
  if (state.sel && !r.items.some(i => i.id === state.sel)) state.sel = null;
  if (state.selOp && !r.openings.some(o => o.id === state.selOp)) state.selOp = null;
  if (scene) scene.sync(r, state.sel, ev.flagged);
  if (plan) plan.draw(r, { sel: state.sel, selOp: state.selOp, flagged: ev.flagged, highlight: state.highlight, grid: ev.grid, showWalk: state.showWalk, name: itemName });
  render();
}
function setHTML(el, html) {
  if (lastHTML.get(el) === html) return false;
  lastHTML.set(el, html);
  el.innerHTML = html;
  return true;
}

function ensureThumbs() {
  const style = room().style;
  if (thumbs[style] || thumbs[style] === null) return;
  thumbs[style] = null;
  setTimeout(() => {
    try { thumbs[style] = renderThumbs(ITEM_IDS, paletteFor({ style })); } catch (e) { thumbs[style] = {}; }
    schedule();
  }, 60);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  const r = room();
  document.documentElement.lang = getLang() === 'zh' ? 'zh-Hant' : 'en';
  const stage = $('stage');
  stage.dataset.view = scene ? state.view : '2d';
  stage.classList.toggle('hasSel', !!(state.sel || state.selOp));
  document.body.dataset.mob = state.mob;
  ensureThumbs();
  renderBar(r); renderLeft(r); renderRight(r); renderHud(r); renderMobNav(); renderModal(r);
}

function renderBar(r) {
  const rooms = state.project.rooms.map(x => `<button class="chip ${x.id === r.id ? 'on' : ''}" data-act="room" data-id="${x.id}">${icon(TYPE_ICON[x.type])}<span>${esc(x.name)}</span></button>`).join('');
  setHTML($('bar'), `
    <div class="brand"><span class="mark" aria-hidden="true"></span><span class="bname">${t('brand')}</span></div>
    <div class="rooms" role="tablist">${rooms}<button class="chip add" data-act="addRoom" title="${t('addRoom')}">${icon('plus')}<span>${t('addRoom')}</span></button></div>
    <div class="tools">
      <button class="tool" data-act="undo" title="${t('undo')}" aria-label="${t('undo')}" ${hIndex <= 0 ? 'disabled' : ''}>${icon('undo')}</button>
      <button class="tool" data-act="redo" title="${t('redo')}" aria-label="${t('redo')}" ${hIndex >= history.length - 1 ? 'disabled' : ''}>${icon('redo')}</button>
      <button class="tool txt" data-act="lang" aria-label="Language">${icon('globe')}<span>${t('lang')}</span></button>
      <button class="tool primary" data-act="share">${icon('share')}<span>${t('share')}</span></button>
    </div>`);
}

function tabs(list, cur, act) {
  const ic = { add: 'sofa', style: 'palette', room: 'ruler', coach: 'spark', list: 'cart' };
  return `<div class="tabs" role="tablist">${list.map(id => `<button role="tab" aria-selected="${id === cur}" class="${id === cur ? 'on' : ''}" data-act="${act}" data-id="${id}">${icon(ic[id])}<span>${t('tab.' + id)}</span></button>`).join('')}</div>`;
}

function renderLeft(r) {
  let body = '';
  if (state.leftTab === 'add') {
    const th = thumbs[r.style] || {};
    const cats = CATEGORIES.map(c => `<button class="pill ${c === state.cat ? 'on' : ''}" data-act="cat" data-id="${c}">${t('cat.' + c)}</button>`).join('');
    const cards = ITEM_IDS.filter(id => CATALOG[id].cat === state.cat).map(id => {
      const d = CATALOG[id];
      const dims = layerOf(d) === 'wall' ? `${Math.round(d.w * 100)} × ${Math.round(d.h * 100)}` : `${Math.round(d.w * 100)} × ${Math.round(d.d * 100)}`;
      return `<button class="card" data-act="add" data-id="${id}">
        <span class="thumb">${th[id] ? `<img src="${th[id]}" alt="">` : ''}</span>
        <span class="cname">${itemName(id)}</span>
        <span class="cmeta"><span>${dims} cm</span><span>${money(d.price)}</span></span>
      </button>`;
    }).join('');
    body = `<p class="hint">${t('addHint')}</p><div class="pills">${cats}</div><div class="cards">${cards}</div>`;
  } else if (state.leftTab === 'style') {
    const pal = paletteFor(r);
    const styles = STYLE_IDS.map(id => styleCard(id, id === r.style, 'style')).join('');
    const walls = STYLES[r.style].walls.map(c => `<button class="sw ${pal.wall.toLowerCase() === c ? 'on' : ''}" style="--c:${c}" data-act="wall" data-id="${c}" aria-label="${c}"></button>`).join('');
    const floors = FLOOR_IDS.map(id => `<button class="floor ${pal.floorId === id ? 'on' : ''}" data-act="floor" data-id="${id}"><span class="fsw" style="--c:${FLOORS[id].base};--d:${FLOORS[id].dark}" data-kind="${FLOORS[id].kind}"></span><span>${t('floor.' + id)}</span></button>`).join('');
    body = `<h3>${t('styleTitle')}</h3><p class="hint">${t('styleHint')}</p><div class="styles">${styles}</div>
      <h3>${t('wallTitle')}</h3><div class="sws">${walls}<label class="sw custom" title="${t('custom')}"><input type="color" id="wallCustom" data-in="wallCustom" aria-label="${t('custom')}">${icon('plus')}</label></div>
      <h3>${t('floorTitle')}</h3><div class="floors">${floors}</div>`;
  } else {
    const area = r.w * r.d;
    body = `<label class="field"><span>${t('roomName')}</span><input type="text" id="roomName" data-in="name" maxlength="24" autocomplete="off"></label>
      <h3>${t('roomSize')}</h3>
      <label class="slider"><span>${t('width')}</span><input type="range" id="roomW" data-in="w" min="2.2" max="8" step="0.1"><output id="outW"></output></label>
      <label class="slider"><span>${t('depth')}</span><input type="range" id="roomD" data-in="d" min="2.2" max="8" step="0.1"><output id="outD"></output></label>
      <p class="areaLine"><span>${t('area')}</span><b id="outArea"></b></p>
      <h3>${t('openings')}</h3>
      <div class="row"><button class="btn" data-act="addDoor">${icon('plus')}${t('addDoor')}</button><button class="btn" data-act="addWindow">${icon('plus')}${t('addWindow')}</button></div>
      <p class="hint">${t('openingHint')}</p>
      <h3>${t('autoArrange')}</h3>
      <p class="hint">${t('autoHint')}</p>
      <div class="row"><button class="btn strong" data-act="auto">${icon('wand')}${t('autoArrange')}</button><button class="btn" data-act="clear">${t('clearRoom')}</button></div>
      <div class="danger">${state.confirmDel
        ? `<span>${t('confirmDelete')}</span><button class="btn bad" data-act="delYes">${t('yes')}</button><button class="btn" data-act="delNo">${t('cancel')}</button>`
        : `<button class="btn ghost" data-act="delRoom" ${state.project.rooms.length < 2 ? 'disabled' : ''}>${icon('trash')}${t('deleteRoom')}</button>`}</div>`;
    void area;
  }
  if (setHTML($('sideL'), tabs(['add', 'style', 'room'], state.leftTab, 'tabL') + `<div class="pbody" data-p="${state.leftTab}">${body}</div>`)) syncInputs(r, true);
  else syncInputs(r, false);
}

function styleCard(id, on, act) {
  const s = STYLES[id];
  const strip = [s.wall, FLOORS[s.floor].base, s.fabric, s.wood, s.accents[0], s.accents[1]].map(c => `<i style="background:${c}"></i>`).join('');
  return `<button class="style ${on ? 'on' : ''}" data-act="${act}" data-id="${id}"><span class="strip">${strip}</span><b>${t('style.' + id)}</b><small>${t('styleD.' + id)}</small></button>`;
}

function syncInputs(r, force) {
  const set = (id, v) => { const el = $(id); if (el && (force || document.activeElement !== el) && el.value !== String(v)) el.value = v; };
  set('roomName', r.name); set('roomW', r.w); set('roomD', r.d); set('hour', r.hour);
  const txt = (id, v) => { const el = $(id); if (el && el.textContent !== v) el.textContent = v; };
  txt('outW', r.w.toFixed(1) + ' m'); txt('outD', r.d.toFixed(1) + ' m');
  txt('outArea', `${(r.w * r.d).toFixed(1)} m² · ${Math.round(r.w * r.d * SQFT)} ${t('sqft')}`);
  const h = Math.floor(r.hour), m = r.hour % 1 ? '30' : '00';
  txt('outHour', `${String(h).padStart(2, '0')}:${m}`);
}

function gradeOf(score) { return score < 40 ? 0 : score < 60 ? 1 : score < 78 ? 2 : score < 92 ? 3 : 4; }
function ring(score, size = 76) {
  const R = 30, C = 2 * Math.PI * R, g = gradeOf(score);
  return `<svg class="ring g${g}" viewBox="0 0 76 76" width="${size}" height="${size}" role="img" aria-label="${t('score')} ${score}">
    <circle cx="38" cy="38" r="${R}" class="track"/><circle cx="38" cy="38" r="${R}" class="arc" stroke-dasharray="${(C * score / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 38 38)"/>
    <text x="38" y="39" text-anchor="middle" dominant-baseline="middle">${score}</text></svg>`;
}

function checkTitle(c, r) {
  const names = c.items.map(id => r.items.find(i => i.id === id)).filter(Boolean).map(i => itemName(i.t));
  const uniq = [...new Set(names)];
  const shown = uniq.slice(0, 2).join(getLang() === 'zh' ? '、' : ', ') + (uniq.length > 2 ? '…' : '');
  return t(`c.${c.id}.t`, { ...c.params, names: shown });
}

function renderRight(r) {
  let body = '';
  if (state.rightTab === 'coach') {
    const lvIcon = { bad: 'stop', warn: 'alert', tip: 'bulb', good: 'check' };
    const groups = ['bad', 'warn', 'tip', 'good'].map(lv => {
      const list = ev.checks.filter(c => c.level === lv);
      if (!list.length) return '';
      return `<section class="grp ${lv}"><h4>${t('lvl.' + lv)}<span>${list.length}</span></h4>${list.map(c => {
        const open = state.openCheck === c.id;
        return `<div class="chk ${open ? 'open' : ''}"><button class="chead" data-act="check" data-id="${c.id}" aria-expanded="${open}">${icon(lvIcon[lv])}<span>${esc(checkTitle(c, r))}</span></button>
          ${open ? `<div class="cbody"><p>${t(`c.${c.id}.w`, c.params)}</p>${c.fix ? `<button class="btn strong small" data-act="fix" data-id="${c.fix.add}">${icon('plus')}${t('fixAdd')}：${itemName(c.fix.add)}</button>` : ''}</div>` : ''}</div>`;
      }).join('')}</section>`;
    }).join('');
    body = `<div class="scoreBox">${ring(ev.score)}<div><b>${t('grade.' + gradeOf(ev.score))}</b><p>${t('coachIntro')}</p></div></div>${groups}`;
  } else {
    const b = budget(r), th = thumbs[r.style] || {};
    const rows = b.list.map(l => `<li><span class="lthumb">${th[l.t] ? `<img src="${th[l.t]}" alt="">` : ''}</span><span class="lname">${itemName(l.t)}${l.n > 1 ? ` <em>× ${l.n}</em>` : ''}</span><span class="lprice">${money(l.price * l.n)}</span></li>`).join('');
    const all = state.project.rooms.reduce((s, x) => s + budget(x).total, 0);
    body = `<h3>${t('listTitle')}</h3><p class="hint">${t('listHint')}</p>
      ${rows ? `<ul class="list">${rows}</ul>` : `<p class="hint">${t('empty')}</p>`}
      <div class="total"><span>${t('total')}</span><b>${money(b.total)}</b></div>
      ${state.project.rooms.length > 1 ? `<div class="total sub"><span>${t('allRooms')}</span><b>${money(all)}</b></div>` : ''}
      ${rows ? `<button class="btn" data-act="copyList">${icon('copy')}${t('copyList')}</button>` : ''}`;
  }
  setHTML($('sideR'), tabs(['coach', 'list'], state.rightTab, 'tabR') + `<div class="pbody" data-p="${state.rightTab}">${body}</div>`);
}

function renderHud(r) {
  const view = scene ? state.view : '2d';
  const seg = (items, cur, act) => `<div class="seg">${items.map(([id, ic, label, cls]) => `<button class="${id === cur ? 'on' : ''} ${cls || ''}" data-act="${act}" data-id="${id}" title="${label}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>`;
  const viewSeg = scene ? seg([['3d', 'cube', t('view.3d')], ['2d', 'plan', t('view.2d')], ['split', 'split', t('view.split'), 'wide']], view, 'view') : '';
  const camSeg = view !== '2d' ? seg([['doll', 'cube', t('cam.doll')], ['top', 'top', t('cam.top')], ['eye', 'eye', t('cam.eye')]], state.cam, 'cam') : '';
  const walk = view !== '3d' ? `<button class="toggle ${state.showWalk ? 'on' : ''}" data-act="walk" aria-pressed="${state.showWalk}">${icon('walk')}<span>${t('walk')}</span></button>` : '';
  const photo = view !== '2d' ? `<button class="toggle" data-act="photo" title="${t('photo')}">${icon('camera')}<span>${t('photo')}</span></button>` : '';
  setHTML($('hudTop'), `<div class="hudL">${viewSeg}${camSeg}${walk}${photo}</div>
    <button class="scorePill g${gradeOf(ev.score)}" data-act="score" title="${t('score')}">${ring(ev.score, 34)}<span>${t('score')}</span></button>`);

  const sel = r.items.find(i => i.id === state.sel), op = r.openings.find(o => o.id === state.selOp);
  let selHTML = '';
  if (sel) {
    const d = CATALOG[sel.t], pal = paletteFor(r);
    const cur = (sel.c || '').toLowerCase();
    const sws = swatchesFor(r).map(c => `<button class="sw ${cur === c ? 'on' : ''}" style="--c:${c}" data-act="color" data-id="${c}" aria-label="${t('colour')} ${c}"></button>`).join('');
    void pal;
    selHTML = `<div class="selbar ${state.colorsOpen ? 'colors' : ''}">
      <div class="selname"><b>${itemName(sel.t)}</b><small>${Math.round(d.w * 100)} × ${Math.round(d.d * 100)} × ${Math.round(d.h * 100)} cm</small></div>
      <div class="selbtns">
        ${layerOf(d) !== 'wall' ? `<button class="tool" data-act="rot" title="${t('rotate')} (R)" aria-label="${t('rotate')}">${icon('rotate')}<span>90°</span></button><button class="tool r45" data-act="rot45" title="${t('rotate45')}" aria-label="${t('rotate45')}">${icon('rotate')}<span>45°</span></button>` : ''}
        <button class="tool mobonly ${state.colorsOpen ? 'on' : ''}" data-act="colors" aria-label="${t('colour')}" aria-pressed="${!!state.colorsOpen}">${icon('palette')}</button>
        <button class="tool" data-act="dup" title="${t('duplicate')}" aria-label="${t('duplicate')}">${icon('copy')}</button>
        <button class="tool bad" data-act="del" title="${t('remove')}" aria-label="${t('remove')}">${icon('trash')}</button>
      </div>
      <div class="selsw">${sws}${sel.c ? `<button class="tool" data-act="resetColor" title="${t('reset')}" aria-label="${t('reset')}">${icon('x')}</button>` : ''}</div>
    </div>`;
  } else if (op) {
    selHTML = `<div class="selbar"><div class="selname"><b>${t(op.kind)}</b><small>${Math.round(op.w * 100)} cm</small></div><div class="selbtns"><button class="tool bad" data-act="delOp" aria-label="${t('remove')}">${icon('trash')}<span>${t('remove')}</span></button></div></div>`;
  }
  setHTML($('hudSel'), selHTML);

  const hint = view === '2d' ? t('hint2d') : state.cam === 'eye' ? t('hintEye') : t('hint3d');
  const night = r.hour >= 18.5 || r.hour < 6.5;
  if (setHTML($('hudTime'), view === '2d' ? '' : `<label class="time" title="${t('hour')}"><span class="tic" id="timeIcon"></span><input type="range" id="hour" data-in="hour" min="6" max="22" step="0.5" aria-label="${t('hour')}"><output id="outHour"></output></label>`)) syncInputs(r, true);
  const ti = $('timeIcon'); if (ti) setHTML(ti, icon(night ? 'moon' : 'sun'));
  setHTML($('hudHint'), `<span>${hint}</span>`);
}

function renderMobNav() {
  const cur = state.mob === 'L' ? state.leftTab : state.rightTab;
  const ic = { add: 'sofa', style: 'palette', room: 'ruler', coach: 'spark', list: 'cart' };
  setHTML($('mobnav'), ['add', 'style', 'room', 'coach', 'list'].map(id => `<button class="${id === cur ? 'on' : ''}" data-act="mob" data-id="${id}">${icon(ic[id])}<span>${t('tab.' + id)}</span>${id === 'coach' ? `<i class="dot g${gradeOf(ev.score)}">${ev.score}</i>` : ''}</button>`).join(''));
}

function renderModal(r) {
  let html = '';
  const m = state.modal;
  if (m === 'welcome') {
    html = `<div class="modal welcome" role="dialog" aria-modal="true" aria-labelledby="mt">
      <p class="eyebrow">${t('brandSub')} · ${t('brand')}</p><h2 id="mt">${t('welcomeTitle')}</h2><p class="lead">${t('welcomeLead')}</p>
      <ol class="steps">${[1, 2, 3].map(i => `<li><b>${t(`w${i}t`)}</b><span>${t(`w${i}d`)}</span></li>`).join('')}</ol>
      <div class="mfoot"><button class="btn" data-act="close">${t('explore')}</button><button class="btn strong big" data-act="startOwn">${t('startOwn')}</button></div>
    </div>`;
  } else if (m === 'wizard') {
    const w = state.wiz;
    let inner = '';
    if (w.step === 0) {
      inner = `<h3>${t('wizType')}</h3><div class="opts types">${ROOM_TYPE_IDS.map(id => `<button class="opt ${w.type === id ? 'on' : ''}" data-act="wizType" data-id="${id}">${icon(TYPE_ICON[id])}<b>${t('type.' + id)}</b><small>${t('typeD.' + id)}</small></button>`).join('')}</div>`;
    } else if (w.step === 1) {
      const sizes = ROOM_TYPES[w.type].sizes;
      const k = 110 / Math.max(w.w, w.d);
      inner = `<h3>${t('wizSize')}</h3><p class="hint">${t('wizSizeHint')}</p>
        <div class="opts sizes">${sizes.map(([a, b], i) => `<button class="opt ${w.size === i ? 'on' : ''}" data-act="wizSize" data-id="${i}"><b>${t('size.' + i)}</b><span class="mono">${a.toFixed(1)} × ${b.toFixed(1)} m</span><small>${(a * b).toFixed(0)} m² · ${Math.round(a * b * SQFT)} ${t('sqft')}</small></button>`).join('')}</div>
        <div class="custom">
          <div class="mini"><i style="width:${(w.w * k).toFixed(0)}px;height:${(w.d * k).toFixed(0)}px"></i></div>
          <div class="csl">
            <label class="slider"><span>${t('width')}</span><input type="range" id="wizW" data-in="wizW" min="2.2" max="8" step="0.1" value="${w.w}"><output>${w.w.toFixed(1)} m</output></label>
            <label class="slider"><span>${t('depth')}</span><input type="range" id="wizD" data-in="wizD" min="2.2" max="8" step="0.1" value="${w.d}"><output>${w.d.toFixed(1)} m</output></label>
            <p class="areaLine"><span>${t('area')}</span><b>${(w.w * w.d).toFixed(1)} m² · ${Math.round(w.w * w.d * SQFT)} ${t('sqft')}</b></p>
          </div>
        </div>`;
    } else {
      inner = `<h3>${t('wizStyle')}</h3><div class="styles wide">${STYLE_IDS.map(id => styleCard(id, w.style === id, 'wizStyle')).join('')}</div>`;
    }
    html = `<div class="modal wizard" role="dialog" aria-modal="true" aria-labelledby="mt">
      <header><div><p class="eyebrow">${t('step', { a: w.step + 1, b: 3 })}</p><h2 id="mt">${t('wizTitle')}</h2></div><button class="tool" data-act="close" aria-label="${t('close')}">${icon('x')}</button></header>
      <div class="prog"><i style="width:${(w.step + 1) / 3 * 100}%"></i></div>
      <div class="wbody">${inner}</div>
      <div class="mfoot">${w.step > 0 ? `<button class="btn" data-act="wizBack">${t('back')}</button>` : '<span></span>'}
        ${w.step < 2 ? `<button class="btn strong big" data-act="wizNext">${t('next')}</button>` : `<button class="btn strong big" data-act="wizCreate">${icon('wand')}${t('create')}</button>`}</div>
    </div>`;
  } else if (m === 'share') {
    const code = encodeProject(state.project);
    const link = location.origin + location.pathname + '#d=' + code;
    html = `<div class="modal share" role="dialog" aria-modal="true" aria-labelledby="mt">
      <header><h2 id="mt">${t('shareTitle')}</h2><button class="tool" data-act="close" aria-label="${t('close')}">${icon('x')}</button></header>
      <p class="hint">${t('shareHint')}</p>
      ${framed ? '' : `<label class="field"><span>${t('shareLink')}</span><div class="copyrow"><input type="text" id="shareLink" readonly value="${esc(link)}"><button class="btn strong" data-act="copyField" data-id="shareLink">${icon('copy')}${t('copy')}</button></div></label>`}
      <label class="field"><span>${t('shareCode')}</span><div class="copyrow"><input type="text" id="shareCode" readonly value="${code}"><button class="btn ${framed ? 'strong' : ''}" data-act="copyField" data-id="shareCode">${icon('copy')}${t('copy')}</button></div></label>
      <label class="field"><span>${t('loadCode')}</span><div class="copyrow"><input type="text" id="loadCode" placeholder="${t('loadPh')}" autocomplete="off"><button class="btn" data-act="loadCode">${t('load')}</button></div></label>
      ${state.codeError ? `<p class="err">${t('badCode')}</p>` : ''}
    </div>`;
  } else if (m === 'photo') {
    html = `<div class="modal photo" role="dialog" aria-modal="true" aria-labelledby="mt">
      <header><h2 id="mt">${t('photoTitle')}：${esc(r.name)}</h2><button class="tool" data-act="close" aria-label="${t('close')}">${icon('x')}</button></header>
      <img src="${state.photo}" alt="${esc(r.name)}">
      <div class="mfoot"><p class="hint">${t('photoHint')}</p>${framed ? '' : `<a class="btn strong" href="${state.photo}" download="dream-home-${esc(r.name)}.jpg">${t('download')}</a>`}</div>
    </div>`;
  }
  const host = $('modal');
  host.classList.toggle('show', !!html);
  setHTML(host, html ? `<div class="scrim" data-act="scrim"></div>${html}` : '');
}

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
function addItem(id) {
  const r = room();
  const it = findSpot(r, id);
  r.items.push(it);
  state.sel = it.id; state.selOp = null; state.highlight = null;
  commit();
  toast(t('added', { name: itemName(id) }));
}
function uniqueName(base) {
  const names = new Set(state.project.rooms.map(r => r.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}
function openWizard() {
  const type = 'living', [w, d] = ROOM_TYPES[type].sizes[1];
  state.wiz = { step: 0, type, size: 1, w, d, style: room() ? room().style : 'japandi' };
  state.modal = 'wizard';
}
async function copyText(text, fieldId) {
  try { await navigator.clipboard.writeText(text); toast(t('copied')); }
  catch (e) { const el = fieldId && $(fieldId); if (el) { el.focus(); el.select(); } }
}
function moveFocusIntoModal() {
  requestAnimationFrame(() => { const b = document.querySelector('#modal .btn.strong, #modal .tool'); if (b) b.focus({ preventScroll: true }); });
}

const ACT = {
  tabL: id => { state.leftTab = id; state.confirmDel = false; },
  tabR: id => { state.rightTab = id; },
  mob: id => { if (['add', 'style', 'room'].includes(id)) { state.leftTab = id; state.mob = 'L'; } else { state.rightTab = id; state.mob = 'R'; } },
  score: () => { state.rightTab = 'coach'; state.mob = 'R'; },
  cat: id => { state.cat = id; },
  add: id => addItem(id),
  fix: id => addItem(id),
  style: id => { const r = room(); r.style = id; r.wall = null; r.floor = null; r.items.forEach(i => delete i.c); commit(); },
  wall: id => { room().wall = id; commit(); },
  floor: id => { room().floor = id; commit(); },
  view: id => { state.view = id; requestAnimationFrame(resizeViews); },
  cam: id => { state.cam = id; if (scene) scene.setMode(id); },
  walk: () => { state.showWalk = !state.showWalk; },
  colors: () => { state.colorsOpen = !state.colorsOpen; },
  undo: () => travel(-1),
  redo: () => travel(1),
  lang: () => { setLang(getLang() === 'zh' ? 'en' : 'zh'); save(); },
  share: () => { state.modal = 'share'; state.codeError = false; moveFocusIntoModal(); },
  photo: () => { if (scene) { state.photo = scene.snapshot(); state.modal = 'photo'; moveFocusIntoModal(); } },
  room: id => { state.project.active = id; state.sel = null; state.selOp = null; state.highlight = null; state.confirmDel = false; save(); roomDirty = true; },
  addRoom: () => { openWizard(); moveFocusIntoModal(); },
  startOwn: () => { openWizard(); state.replaceSample = true; },
  rot: () => rotateSel(90),
  rot45: () => rotateSel(45),
  dup: () => {
    const r = room(), it = r.items.find(i => i.id === state.sel); if (!it) return;
    let c = { ...it, id: newId(), x: it.x + 0.35, z: it.z + 0.35 };
    settle(r, c);
    if (layerOf(CATALOG[c.t]) === 'floor' && !fits(r, c)) c = { ...findSpot(r, c.t), ...(it.c ? { c: it.c } : {}) };
    r.items.push(c); state.sel = c.id; commit();
  },
  del: () => { const r = room(); r.items = r.items.filter(i => i.id !== state.sel); state.sel = null; commit(); },
  delOp: () => { const r = room(); r.openings = r.openings.filter(o => o.id !== state.selOp); state.selOp = null; commit(); },
  color: id => { const it = room().items.find(i => i.id === state.sel); if (it) { it.c = id; commit(); } },
  resetColor: () => { const it = room().items.find(i => i.id === state.sel); if (it) { delete it.c; commit(); } },
  check: id => {
    state.openCheck = state.openCheck === id ? null : id;
    const c = ev.checks.find(x => x.id === id);
    state.highlight = state.openCheck && c ? c.items : null;
    if (state.highlight && state.highlight.length === 1) state.sel = state.highlight[0];
    touch();
  },
  addDoor: () => addOpening('door'),
  addWindow: () => addOpening('window'),
  auto: () => { autoLayout(room()); state.sel = null; commit(); },
  clear: () => { room().items = []; state.sel = null; commit(); },
  delRoom: () => { state.confirmDel = true; },
  delNo: () => { state.confirmDel = false; },
  delYes: () => {
    const p = state.project;
    if (p.rooms.length < 2) return;
    p.rooms = p.rooms.filter(r => r.id !== p.active); p.active = p.rooms[0].id;
    state.confirmDel = false; state.sel = null; commit();
  },
  wizType: id => { const w = state.wiz; w.type = id; w.size = 1; [w.w, w.d] = ROOM_TYPES[id].sizes[1]; },
  wizSize: id => { const w = state.wiz; w.size = +id; [w.w, w.d] = ROOM_TYPES[w.type].sizes[w.size]; },
  wizStyle: id => { state.wiz.style = id; },
  wizNext: () => { state.wiz.step++; },
  wizBack: () => { state.wiz.step--; },
  wizCreate: () => {
    const w = state.wiz, p = state.project;
    const r = makeRoom(w.type, w.w, w.d, w.style, '');
    if (state.replaceSample && p.sample) { p.rooms = []; p.sample = false; }
    r.name = p.rooms.length ? uniqueName(t('type.' + w.type)) : t('type.' + w.type);
    p.rooms.push(r); p.active = r.id;
    state.replaceSample = false; state.modal = null; state.sel = null; state.leftTab = 'add';
    state.cat = { bedroom: 'beds', dining: 'tables', office: 'tables' }[w.type] || 'seating';
    commit();
  },
  close: () => { state.modal = null; state.replaceSample = false; },
  scrim: () => { if (state.modal !== 'welcome') { state.modal = null; state.replaceSample = false; } },
  copyField: id => copyText($(id).value, id),
  loadCode: () => {
    const p = decodeProject($('loadCode').value || '');
    if (!p) { state.codeError = true; return; }
    state.project = p; state.modal = null; state.sel = null; commit(); toast(t('loaded'));
  },
  copyList: () => {
    const r = room(), b = budget(r);
    const lines = b.list.map(l => `${itemName(l.t)}${l.n > 1 ? ' × ' + l.n : ''}\t${money(l.price * l.n)}`);
    copyText(`${r.name} (${r.w.toFixed(1)} × ${r.d.toFixed(1)} m)\n${lines.join('\n')}\n${t('total')}\t${money(b.total)}`);
  },
};

function rotateSel(deg) {
  const r = room(), it = r.items.find(i => i.id === state.sel);
  if (!it || layerOf(CATALOG[it.t]) === 'wall') return;
  it.r = (Math.round((it.r + deg) / deg) * deg) % 360;
  settle(r, it);
  commit();
}
function addOpening(kind) {
  const r = room();
  // Use the wall with the most free length.
  let best = { wall: 0, pos: r.w / 2, free: -1 };
  for (let w = 0; w < 4; w++) {
    const len = wallLength(r, w), used = r.openings.filter(o => o.wall === w).sort((a, b) => a.pos - b.pos);
    let u = 0;
    for (const o of [...used, { pos: len, w: 0 }]) {
      const gap = o.pos - o.w / 2 - u;
      if (gap > best.free) best = { wall: w, pos: u + gap / 2, free: gap };
      u = o.pos + o.w / 2;
    }
  }
  const op = { id: newId(), kind, wall: best.wall, pos: best.pos, w: kind === 'door' ? 0.85 : 1.2 };
  clampOpening(r, op);
  r.openings.push(op);
  state.selOp = op.id; state.sel = null;
  if (state.view === '3d') { state.view = scene && window.innerWidth >= 900 ? 'split' : '2d'; requestAnimationFrame(resizeViews); }
  commit();
}

const INPUT = {
  hour: v => { const r = room(); r.hour = +v; if (scene) scene.setHour(r.hour); syncInputs(r, false); renderHud(r); save(); },
  w: v => resizeRoom('w', +v),
  d: v => resizeRoom('d', +v),
  name: v => { room().name = v.slice(0, 24) || t('type.' + room().type); save(); renderBar(room()); },
  wallCustom: v => { room().wall = v; touch(); save(); },
  wizW: v => { state.wiz.w = +v; state.wiz.size = -1; schedule(); },
  wizD: v => { state.wiz.d = +v; state.wiz.size = -1; schedule(); },
};
function resizeRoom(axis, v) {
  const r = room();
  r[axis] = round2(clamp(v, 2.2, 8));
  r.openings.forEach(o => clampOpening(r, o));
  r.items.forEach(i => settle(r, i));
  touch();
}

// Live editing callbacks shared by both views.
const editing = {
  onSelect: id => { if (state.sel !== id || state.selOp) { state.sel = id; state.selOp = null; state.highlight = null; schedule(); } },
  onSelectOpening: id => { state.selOp = id; state.sel = null; schedule(); },
  onMove: (id, x, z) => {
    const r = room(), it = r.items.find(i => i.id === id); if (!it) return;
    it.x = x; it.z = z; settle(r, it); touch();
  },
  onRotate: (id, deg) => { const r = room(), it = r.items.find(i => i.id === id); if (!it) return; it.r = deg; settle(r, it); touch(); },
  onOpening: (id, wall, pos) => { const r = room(), o = r.openings.find(x => x.id === id); if (!o) return; o.wall = wall; o.pos = pos; clampOpening(r, o); touch(); },
  onMoveEnd: () => commit(),
};

function resizeViews() { if (scene) scene.resize(); if (plan) plan.resize(); }

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function boot() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { saved = null; }
  const nav = (navigator.language || 'zh').toLowerCase();
  setLang(saved && saved.lang ? saved.lang : nav.startsWith('zh') ? 'zh' : 'en');

  let project = sanitize(saved);
  const hash = location.hash.startsWith('#d=') ? decodeProject(location.hash) : null;
  if (hash) project = hash;
  if (!project) {
    const r = makeRoom('living', 4.2, 3.4, 'japandi', `${t('type.living')}（${t('sample')}）`);
    project = { v: 1, rooms: [r], active: r.id, sample: true };
    state.modal = 'welcome';
  }
  state.project = project;
  history = [snap()]; hIndex = 0;

  try {
    scene = new Scene3D($('c3'), editing);
  } catch (e) { scene = null; state.view = '2d'; }
  plan = new Plan2D($('c2'), editing);
  if (window.innerWidth >= 1280) state.view = scene ? 'split' : '2d';

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = ACT[el.dataset.act];
    if (fn) { fn(el.dataset.id); schedule(); }
  });
  document.addEventListener('input', e => {
    const k = e.target.dataset && e.target.dataset.in;
    if (k && INPUT[k]) INPUT[k](e.target.value);
  });
  document.addEventListener('change', e => {
    const k = e.target.dataset && e.target.dataset.in;
    if (k === 'w' || k === 'd' || k === 'wallCustom' || k === 'name') commit();
  });
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === 'Escape') { if (state.modal && state.modal !== 'welcome') state.modal = null; else state.sel = null; schedule(); return; }
    if (tag === 'input' || tag === 'textarea' || state.modal) return;
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); travel(e.shiftKey ? 1 : -1); return; }
    if (mod && key === 'y') { e.preventDefault(); travel(1); return; }
    if (mod) return;
    const it = room().items.find(i => i.id === state.sel);
    if (!it) return;
    if (key === 'delete' || key === 'backspace') { e.preventDefault(); ACT.del(); }
    else if (key === 'r') rotateSel(90);
    else if (key === 'd') ACT.dup();
    else if (key.startsWith('arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 0.25 : 0.05;
      it.x += key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
      it.z += key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
      settle(room(), it); commit();
    }
  });

  const ro = new ResizeObserver(() => resizeViews());
  ro.observe($('v3')); ro.observe($('v2'));
  window.addEventListener('resize', resizeViews);
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mq.addEventListener) mq.addEventListener('change', schedule);
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  refresh();
  resizeViews();
  refresh();
  if (state.modal) moveFocusIntoModal();
}

boot();
void shade;
