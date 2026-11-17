'use strict';
/* 桃花源耕讀 —— 規則與介面 */
(function () {
  const KEY = 'taohuayuan-save-v1';
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const WX = {
    sun: { n: '晴', g: '晴', cat: 'sun', txt: '天朗氣清，惠風和暢。' },
    rain: { n: '雨', g: '雨', cat: 'rain', txt: '細雨如絲，田土都濕透了。' },
    storm: { n: '暴雨', g: '雷', cat: 'rain', txt: '雷雨大作，溪水漲了半尺。' },
    wind: { n: '大風', g: '風', cat: 'wind', txt: '大風呼嘯，竹林東倒西歪。' },
    frost: { n: '霜凍', g: '霜', cat: 'cold', txt: '夜來嚴霜，田裏白茫茫一片。' },
    snow: { n: '雪', g: '雪', cat: 'cold', txt: '大雪紛飛，遠山近樹皆白。' },
    scorch: { n: '烈日', g: '炎', cat: 'sun', txt: '烈日當空，曬得地皮發燙。' }
  };
  const CATS = {
    sun: { n: '晴好', g: '晴', tip: '晴天土乾得快，記得澆水。' },
    rain: { n: '降雨', g: '雨', tip: '若真要下雨，今天就不必費力澆水了。' },
    wind: { n: '大風', g: '風', tip: '高稈和爬藤的作物怕風，竹籬能擋一擋。' },
    cold: { n: '霜雪', g: '霜', tip: '怕霜的瓜、豆、茄，熟了趕緊收；沒熟的覆草保暖。' }
  };
  const MOIST = ['乾裂', '微潤', '濕潤', '飽水'];
  const STAGE = ['剛播下', '出苗', '生長', '將熟', '成熟'];
  const COST = { till: 3, sow: 1, water: 1, weed: 1, bug: 1, fert: 1, cover: 1, harvest: 1, clear: 1 };
  const ACT = { till: '開墾', sow: '播種', water: '澆水', weed: '除草', bug: '捉蟲', fert: '施肥', cover: '覆草', harvest: '收成', clear: '鏟除' };
  const RES = { wood: '木', stone: '石', coins: '錢' };
  const GRACE = 9, MAX_TREES = 6, SAPLING = 30;

  let S = null;
  const ui = { pop: -1, sticky: null, sheet: null, tab: 'crops', quiz: null, report: null, page: 0, askReset: false, busy: false, ev: null, pendingEnd: false };

  /* ---------- 存檔 ---------- */
  function fresh() {
    return {
      v: 1, turn: 0, t: 6, year: 1, coins: 0, wood: 0, stone: 0, fert: 0, sta: 6, know: 0, hungry: false,
      inv: {}, seeds: { radish: 6 },
      plots: Array.from({ length: 12 }, () => ({ s: 0, crop: null, prog: 0, q: 100, m: 1, weeds: 0, bugs: 0, cover: 0, fert: 0, nfix: 0, last: null, vern: 0, ripeT: 0, dead: 0, sweet: 0 })),
      built: {}, trees: [], weather: 'sun', next: 'rain', sign: 'mayi', guess: null,
      learned: {}, terms: { 2: 1 }, asked: -1, firsts: {}, harvested: {}, goals: {}, ended: false, intro: false
    };
  }
  function load() { try { const j = localStorage.getItem(KEY); if (j) { const d = JSON.parse(j); if (d && d.v === 1 && Array.isArray(d.plots)) return d; } } catch (e) { /* 無法讀檔就重新開始 */ } return null; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 存不了也照常玩 */ } }

  /* ---------- 推算 ---------- */
  const term = () => S.t / 3 | 0, hou = () => S.t % 3, temp = () => TEMP[term()];
  const rankIdx = () => { let r = 0; RANKS.forEach((k, i) => { if (S.know >= k.at) r = i; }); return r; };
  const maxSta = () => 6 + (S.built.hut ? 2 : 0) + (S.built.house ? 2 : 0) - (S.hungry ? 2 : 0);
  const inRange = (t, a, b) => a <= b ? t >= a && t <= b : t >= a || t <= b;
  const inSeason = (id, t) => CROPS[id].sow.some(([a, b]) => inRange(t === undefined ? term() : t, a, b));
  const unlocked = id => rankIdx() >= CROPS[id].rank;
  const item = id => CROPS[id] || GOODS[id];
  const foodCount = () => Object.values(S.inv).reduce((a, b) => a + b, 0);
  const sign = () => SIGNS.find(s => s.id === S.sign) || SIGNS[0];
  const quizKey = () => S.year * 24 + term();
  const uniq = a => [...new Set(a)].join('、');
  const ALL_IDS = CROP_ORDER.concat(Object.keys(GOODS));
  function price(id) {
    const h = Math.abs(Math.sin((term() + 1) * 12.9898 + ALL_IDS.indexOf(id) * 78.233 + S.year * 3.7) * 43758.5453) % 1;
    return Math.max(1, Math.round(item(id).price * (.85 + h * .4) * (S.built.granary ? 1.15 : 1)));
  }
  function stageOf(p) { if (!p.crop) return 0; const f = p.prog / CROPS[p.crop].grow; return f >= 1 ? 4 : f >= .68 ? 3 : f >= .34 ? 2 : f >= .1 ? 1 : 0; }
  function rateOf(p, T) { const k = CROPS[p.crop].kind; return (k === 'cool' ? [0, 1, 1, .5] : k === 'warm' ? [0, .5, 1, 1] : [.25, 1, 1, .5])[T]; }
  function weatherWeights(tm) {
    let w = { sun: 50, rain: 25, wind: 10 };
    if (tm <= 2) { w.frost = [18, 12, 8][tm]; if (tm === 0) w.snow = 8; }
    else if (tm <= 5) { w.rain = 32; if (tm <= 4) w.frost = tm === 3 ? 4 : 2; }
    else if (tm <= 12) w = { sun: 34, scorch: tm >= 8 ? 20 : 8, rain: 22, storm: tm >= 8 ? 14 : 6, wind: 8 };
    else if (tm <= 15) { w = { sun: 55, rain: 20, wind: 12 }; if (tm === 13) w.storm = 6; }
    else if (tm === 16) w = { sun: 52, rain: 18, wind: 12, frost: 8 };
    else if (tm === 17) w = { sun: 46, rain: 14, wind: 12, frost: 24 };
    else w = { sun: 42, wind: 12, frost: 22, snow: tm >= 19 ? 22 : 10, rain: tm === 18 ? 10 : 3 };
    return w;
  }
  function rollWeather(tm) { const w = weatherWeights(tm), tot = Object.values(w).reduce((a, b) => a + b, 0); let r = Math.random() * tot; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return 'sun'; }
  function pickSign(wx, tm) {
    const cat = WX[wx].cat;
    const ok = SIGNS.filter(s => (s.wx ? s.wx.includes(wx) : (s.accept || [s.cat]).includes(cat)) && (!s.terms || inRange(tm, s.terms[0], s.terms[1])) && s.id !== S.sign);
    const fresh1 = ok.filter(s => !S.learned[s.id]), pool = fresh1.length && Math.random() < .65 ? fresh1 : ok;
    return (pool[Math.random() * pool.length | 0] || SIGNS.find(s => s.cat === cat)).id;
  }

  /* ---------- 提示 ---------- */
  function toast(msg, cls) {
    const d = document.createElement('div'); d.className = 'toast' + (cls ? ' ' + cls : ''); d.textContent = msg;
    const box = $('#toasts'); box.appendChild(d); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 2600 + msg.length * 75);
  }
  function notify(msg, cls) { if (ui.ev) ui.ev.push({ k: cls === 'learn' ? 'learn' : 'info', t: msg }); else toast(msg, cls); }
  function gain(n) {
    const before = rankIdx(); S.know += Math.ceil(n * (S.built.study ? 1.5 : 1)); const after = rankIdx();
    if (after > before) {
      const names = CROP_ORDER.filter(id => CROPS[id].rank > before && CROPS[id].rank <= after).map(id => CROPS[id].name);
      if (before < 3 && after >= 3) names.push('桃樹苗');
      notify(`農識精進——你如今是「${RANKS[after].n}」了。${names.length ? '市集上多了：' + names.join('、') + '。' : ''}`, 'learn');
    }
  }
  function first(k, n, msg) { if (S.firsts[k]) return; S.firsts[k] = 1; gain(n); if (msg) notify(msg, 'learn'); }
  function hint() {
    const f = S.firsts, tilled = S.plots.filter(p => p.s === 1).length;
    if (!f.till) return '田翁：「先挑一塊荒地，點它，把它開墾出來。」';
    if (!f.sow) return '田翁：「地翻好了。再點這塊田，把蘿蔔籽播下去——驚蟄正是時候。」';
    if (!f.water) return '田翁：「種子入土要澆一遍透水，才發得了芽。」';
    if (!f.guess && !S.guess) return '田翁：「幹完活，點『觀天』看看天象，猜猜下一候是晴是雨。」';
    if (S.turn === 0) return '田翁：「力氣用完就『歇息』。五日為一候，三候為一節氣，日子就這麼過。」';
    if (S.hungry) return '田翁：「餓着肚子可幹不動活。去溪邊釣幾尾魚，或者留些收成自己吃。」';
    if (!S.built.hut) return `田翁：「上山砍柴、下溪採石，攢夠木 12、石 4，就能在『營造』蓋一間茅屋。」（木 ${S.wood}／石 ${S.stone}）`;
    if (S.asked !== quizKey()) return `田翁：「${TERMS[term()].n}了，有空來找我聊聊這個節氣——點『請教』。」`;
    if (tilled < 4) return '田翁：「一塊田養不活人。趁有力氣，多開幾塊荒地。」';
    const g = GOALS.find(x => !S.goals[x.id]);
    return g ? `心願：${g.n}——${g.d}。` : '黃髮垂髫，並怡然自樂。';
  }

  /* ---------- 農活 ---------- */
  function can(i, a, arg) {
    const p = S.plots[i];
    switch (a) {
      case 'till': return p.s === 0;
      case 'sow': return p.s === 1 && !p.crop && S.seeds[arg] > 0 && (!CROPS[arg].needs || !!S.built[CROPS[arg].needs]);
      case 'water': return p.s === 1 && !!p.crop && !p.dead && p.m < 3;
      case 'weed': return !!p.weeds;
      case 'bug': return !!p.bugs;
      case 'fert': return !!p.crop && !p.dead && !p.fert && S.fert > 0;
      case 'cover': return !!p.crop && !p.dead && p.cover <= 0;
      case 'harvest': return !!p.crop && !p.dead && stageOf(p) === 4;
      case 'clear': return !!p.crop;
    }
    return false;
  }
  function resetCrop(p) { Object.assign(p, { crop: null, prog: 0, q: 100, weeds: 0, bugs: 0, cover: 0, fert: 0, vern: 0, ripeT: 0, dead: 0, sweet: 0 }); }
  function doAct(i, a, arg) {
    if (ui.busy || !can(i, a, arg)) return false;
    if (S.sta < COST[a]) { toast('力氣用盡了——歇息一候再做吧。'); return false; }
    const p = S.plots[i]; S.sta -= COST[a];
    switch (a) {
      case 'till': {
        p.s = 1; p.m = 1; let got = [];
        if (Math.random() < .7) { S.wood++; got.push('木 1'); } if (Math.random() < .5) { S.stone++; got.push('石 1'); }
        if (got.length) toast(`開出一塊田，還撿得${got.join('、')}。`);
        first('till', 2, '農識 +2。荒地翻成熟土，草根石塊都要清走，莊稼的根才扎得下去。'); break;
      }
      case 'sow': {
        const c = CROPS[arg]; S.seeds[arg]--; resetCrop(p); p.crop = arg;
        if (p.nfix) { p.q = 115; p.nfix = 0; toast('這是豆茬地，地力正肥——這一茬會長得格外好。', 'learn'); }
        else if (p.last === arg && !c.perennial && !c.paddy) { p.q = 85; toast(`同一塊地連着種${c.name}，地力偏耗、病蟲累積。下回換一種，叫「輪作」。`, 'learn'); }
        if (!inSeason(arg)) toast(`${c.name}眼下不合時令（${c.how}）種下去怕是長不好。`, 'learn');
        first('sow', 2, '農識 +2。「不違農時」——什麼節氣種什麼，是農夫的第一課。'); break;
      }
      case 'water': {
        const row = i / 4 | 0;
        if (S.built.well) S.plots.forEach((q, k) => { if ((k / 4 | 0) === row && q.s === 1) q.m = 3; }); else p.m = 3;
        first('water', 1, '農識 +1。晴天每候土會乾一分，乾透了莊稼就停長。下雨天老天替你澆。'); break;
      }
      case 'weed': p.weeds = 0; first('weed', 2, '農識 +2。「種豆南山下，草盛豆苗稀」——雜草搶水搶肥，見了就除。'); break;
      case 'bug': p.bugs = 0; first('bug', 2, '農識 +2。蟲子專咬嫩葉。養一群雞，牠們會替你捉。'); break;
      case 'fert': p.fert = 1; S.fert--; first('fert', 2, '農識 +2。施了肥，長得快兩成半，收得也多兩成半。'); break;
      case 'cover': p.cover = 3; first('cover', 2, '農識 +2。蓋一層乾草，夜裏地面的熱散得慢，苗就不怕霜（保三候）。'); break;
      case 'harvest': {
        const c = CROPS[p.crop]; let n = Math.max(1, Math.round(c.yield * p.q / 100 * (p.fert ? 1.25 : 1)));
        if (c.vern && p.vern < 3) { n = 0; toast('這麥子沒熬過寒冬，只長葉不抽穗——冬小麥要秋天播，受過凍才結實。', 'learn'); }
        else {
          S.inv[c.id] = (S.inv[c.id] || 0) + n;
          toast(`收得${c.name} ${n} ${c.unit}${p.sweet ? '（經霜，格外甜）' : p.q >= 110 ? '（豐收）' : p.q < 60 ? '（長勢差，歉收）' : ''}。`);
          if (!S.harvested[c.id]) { S.harvested[c.id] = 1; gain(5); toast(`第一次收${c.name}，農識 +5。`, 'learn'); } else gain(1);
        }
        const wasFert = p.fert; p.last = c.id;
        if (c.perennial) { p.prog = c.grow - c.regrow; p.ripeT = 0; p.fert = 0; p.q = Math.max(p.q, 80); if (!S.firsts.regrow) { S.firsts.regrow = 1; toast('韭菜割了還會再長，三候後又是一茬。', 'learn'); } }
        else { resetCrop(p); if (c.nfix) p.nfix = 1; }
        void wasFert; break;
      }
      case 'clear': p.last = p.crop; resetCrop(p); break;
    }
    Scene.work(i); Sound.tap(i);
    closePop(); setSticky(a === 'clear' ? null : { a, arg });
    after(); return true;
  }
  function after() { checkGoals(); save(); render(); }

  function dockAct(a) {
    if (ui.busy) return;
    if (a === 'rest') return endTurn();
    if (a === 'wood' || a === 'stone' || a === 'fish') {
      closePop(); setSticky(null);
      if (S.sta < 2) { toast('力氣用盡了——歇息一候再做吧。'); return; }
      S.sta -= 2;
      if (a === 'wood') { const n = 4 + (Math.random() < .4 ? 1 : 0); S.wood += n; Scene.go('hill'); toast(`上山砍柴，得木 ${n}。`); first('wood', 1); }
      else if (a === 'stone') { const n = 3 + (Math.random() < .3 ? 1 : 0); S.stone += n; Scene.go('river'); toast(`在溪灘揀石，得石 ${n}。`); first('stone', 1); }
      else {
        const r = Math.random(), n = r < .18 ? 0 : r < .72 ? 1 : 2; Scene.go('river');
        if (n) { S.inv.fish = (S.inv.fish || 0) + n; toast(`釣上溪魚 ${n} 尾。可以吃，也可以拿去市集換錢。`); } else toast('守了半日，魚兒不上鈎。');
        first('fish', 1);
      }
      Sound.tap(3); after(); return;
    }
    openSheet(a);
  }

  /* ---------- 歇息：過一候 ---------- */
  function endTurn() {
    if (ui.busy) return;
    closePop(); setSticky(null);
    const ev = []; ui.ev = ev;
    const T0 = temp(), died = [], frozen = [];
    S.plots.forEach(p => {
      if (p.s !== 1 || !p.crop || p.dead) return;
      const c = CROPS[p.crop]; let rate = rateOf(p, T0);
      if (c.kind === 'cool' && T0 === 3) p.q -= 6;
      if (c.kind === 'warm' && T0 === 0) p.q -= 30;
      if (c.kind === 'cool' && T0 === 0 && !c.perennial) { p.q -= 8; frozen.push(c.name); }
      if (!c.drought && T0 > 0) { const need = c.thirsty ? 2 : 1; if (p.m < need) { rate *= p.m === 0 ? 0 : .5; p.q -= p.m === 0 ? 12 : 5; } }
      if (p.weeds) { rate *= .5; p.q -= c.weedy ? 12 : 6; }
      if (p.bugs) p.q -= 10;
      if (p.fert) rate *= 1.25;
      if (c.vern && T0 === 0) p.vern++;
      if (p.prog >= c.grow) { p.ripeT++; if (p.ripeT > c.hold) p.q -= 9; } else p.prog = Math.min(c.grow, p.prog + rate);
      if (p.cover > 0) p.cover--;
      if (p.q <= 0) { p.dead = 1; died.push(c.name); }
    });
    S.turn++; S.t++; if (S.t >= 72) { S.t = 0; S.year++; }
    const wx = S.weather = S.next, tm = term(), T = TEMP[tm], newTerm = S.t % 3 === 0, wet = wx === 'rain' || wx === 'storm';
    const hit = { frost: [], sweet: [], saved: [], flood: [], washed: [], lodge: [], sprout: [], snow: 0 };
    S.plots.forEach(p => {
      if (p.s !== 1) return;
      if (wet || wx === 'snow') p.m = 3; else if (wx === 'scorch') p.m = Math.max(0, p.m - 2); else if ((wx === 'sun' || wx === 'wind') && T > 0) p.m = Math.max(0, p.m - 1);
      if (S.built.wheel) p.m = Math.max(p.m, 2);
      if (!p.crop || p.dead) return;
      const c = CROPS[p.crop], f = p.prog / c.grow;
      if (wx === 'frost' || wx === 'snow') {
        if (c.frost === 'kill') { if (p.cover > 0) hit.saved.push(c.name); else { p.dead = 1; hit.frost.push(c.name); } }
        else if (c.frost === 'sweet' && f >= .5 && !p.sweet) { p.sweet = 1; p.q = Math.min(130, p.q + 20); hit.sweet.push(c.name); }
        if (wx === 'snow' && c.kind === 'winter') { p.q = Math.min(130, p.q + 8); hit.snow++; }
      }
      if (wx === 'storm' && !S.built.ditch && !c.paddy && Math.random() < .35) { if (f < .3 && Math.random() < .5) { p.dead = 1; hit.washed.push(c.name); } else { p.q -= 22; hit.flood.push(c.name); } }
      if (wx === 'wind' && !S.built.fence && c.tall && f > .4 && Math.random() < .35) { p.q -= 18; hit.lodge.push(c.name); }
      if (wx === 'scorch' && c.kind === 'cool') p.q -= 6;
      if (wet && c.id === 'wheat' && f >= 1) { p.q -= 25; hit.sprout.push(c.name); }
      if (p.q <= 0 && !p.dead) { p.dead = 1; died.push(c.name); }
    });
    const bad = t => ev.push({ k: 'bad', t }), good = t => ev.push({ k: 'good', t }), info = t => ev.push({ k: 'info', t });
    if (hit.frost.length) bad(`霜凍：${uniq(hit.frost)}凍死了。喜溫的作物一遇霜就完——看到霜兆，熟的先收，沒熟的覆草。`);
    if (hit.saved.length) good(`覆草護住了${uniq(hit.saved)}，沒讓霜打壞。`);
    if (hit.sweet.length) good(`${uniq(hit.sweet)}經了霜，把澱粉化成糖來抗凍——更甜了，收成也更好。`);
    if (hit.snow) good('大雪給麥苗蓋了一層棉被。「冬天麥蓋三層被，來年枕着饅頭睡。」');
    if (hit.washed.length) bad(`暴雨沖走了剛出苗的${uniq(hit.washed)}。`);
    if (hit.flood.length) bad(`田裏積了水，${uniq(hit.flood)}受了澇。挖一條排水溝就不怕了。`);
    if (hit.lodge.length) bad(`大風吹倒了${uniq(hit.lodge)}。編一道竹籬可以擋風。`);
    if (hit.sprout.length) bad('熟透的麥子淋了雨，在穗上發了芽——麥熟要搶收，這叫「虎口奪糧」。');
    if (frozen.length) bad(`天寒地凍，地裏的${uniq(frozen)}正在凍壞——「立冬蘿蔔小雪菜」，快收！`);
    if (died.length) bad(`${uniq(died)}枯死了。缺水、草荒、蟲咬、過熟不收，都會要了莊稼的命。`);
    // 草與蟲
    if (S.turn >= 3) {
      let nw = 0, nb = 0;
      S.plots.forEach(p => {
        if (p.s !== 1 || !p.crop || p.dead) return;
        if (T > 0 && !p.weeds && Math.random() < .1 * (T >= 2 ? 1.6 : 1) * (wet ? 1.5 : 1)) { p.weeds = 1; nw++; }
        if (T >= 2 && !p.bugs && Math.random() < .07 * (S.built.coop ? .3 : 1)) { p.bugs = 1; nb++; }
      });
      if (nw) { info(`${nw} 塊田冒出了雜草${S.firsts.weedSeen ? '。' : '——雜草和莊稼爭水爭肥，會讓它長得慢、收得少。天暖、雨後最愛長。'}`); S.firsts.weedSeen = 1; }
      if (nb) { info(`${nb} 塊田鬧了蟲${S.firsts.bugSeen ? '。' : '——天一暖，蟲子就來咬葉子。'}`); S.firsts.bugSeen = 1; }
    }
    // 出產
    if (S.built.coop) S.inv.egg = (S.inv.egg || 0) + 1;
    if (newTerm) { const f = (S.built.compost ? 1 : 0) + (S.built.coop ? 1 : 0); if (f) { S.fert += f; good(`漚好了 ${f} 份肥料。`); } }
    if (S.t === 30 && S.trees.length) {
      const n = S.trees.filter(tt => S.turn - tt >= 18).length;
      if (n) { S.inv.peach = (S.inv.peach || 0) + n * 6; good(`小暑，桃子熟了：${n} 株桃樹共摘得 ${n * 6} 個。`); }
      if (n < S.trees.length) info('新栽的桃樹還小，要等明年才結果——「桃三杏四梨五年」，種樹急不得。');
    }
    // 吃飯
    if (S.turn === 1) info('村人輪流請你到家裏吃飯——「便要還家，設酒殺雞作食」。頭三個節氣不愁吃。');
    if (S.turn === GRACE) info('村人的款待到此為止。往後每候要吃掉 1 份存糧——收成別全賣光。');
    if (S.turn >= GRACE) {
      const ids = Object.keys(S.inv).filter(k => S.inv[k] > 0).sort((a, b) => item(a).price - item(b).price);
      if (ids.length) { S.inv[ids[0]]--; S.hungry = false; } else { S.hungry = true; bad('家無存糧，只能餓着肚子下田：體力上限 −2。'); }
    }
    // 觀天對答案
    const sg = sign(), cat = WX[wx].cat;
    if (S.guess) {
      const ok = S.guess === cat || (sg.accept && sg.accept.includes(S.guess) && sg.accept.includes(cat)), isNew = !S.learned[sg.id];
      if (ok) { good(`觀天應驗：你料定「${CATS[S.guess].n}」，果然${WX[wx].n}。農識 +${isNew ? 3 : 2}。`); gain(isNew ? 3 : 2); }
      else info(`觀天失準：你料「${CATS[S.guess].n}」，來的卻是${WX[wx].n}。`);
      if (isNew) { S.learned[sg.id] = 1; ev.push({ k: 'learn', t: `記下一條農諺：「${sg.say}」——${sg.why}` }); }
    }
    if (newTerm && !S.terms[tm]) { S.terms[tm] = 1; gain(1); }
    S.next = rollWeather((((S.t + 1) % 72) / 3) | 0); S.sign = pickSign(S.next, tm); S.guess = null;
    S.sta = maxSta();
    checkGoals(); ui.ev = null; save();
    ui.report = { ev, wx, newTerm };
    transition(() => { render(); openSheet('report'); });
  }
  function transition(done) {
    $('#vTerm').textContent = TERMS[term()].n; $('#vHou').textContent = `${HOU_NAME[hou()]} · ${TERMS[term()].hou[hou()]}`;
    if (reduceMotion) { Scene.go('home'); done(); return; }
    const v = $('#veil'); ui.busy = true; v.classList.add('on');
    setTimeout(() => { render(); Scene.go('home'); }, 380);
    setTimeout(() => v.classList.remove('on'), 1200);
    setTimeout(() => { ui.busy = false; done(); }, 1420);
  }

  /* ---------- 心願 ---------- */
  function goalMet(id) {
    switch (id) {
      case 'home': return !!S.built.hut;
      case 'land': return S.plots.filter(p => p.s === 1).length >= 10 && !!S.built.wheel;
      case 'peach': return S.trees.length >= 4;
      case 'fowl': return !!S.built.coop;
      case 'store': return !!S.built.granary && foodCount() >= 40;
      case 'wise': return Object.keys(S.terms).length >= 24 && Object.keys(S.learned).length >= 12;
      case 'joy': return !!S.built.study && !!S.built.pavilion;
    }
    return false;
  }
  function goalProgress(id) {
    switch (id) {
      case 'land': return `已墾 ${S.plots.filter(p => p.s === 1).length}／10 塊，水車${S.built.wheel ? '已建' : '未建'}`;
      case 'peach': return `已栽 ${S.trees.length}／4 株`;
      case 'store': return `糧倉${S.built.granary ? '已建' : '未建'}，存糧 ${foodCount()}／40`;
      case 'wise': return `節氣 ${Object.keys(S.terms).length}／24，農諺 ${Object.keys(S.learned).length}／12`;
      case 'joy': return `書齋${S.built.study ? '已建' : '未建'}，桃花亭${S.built.pavilion ? '已建' : '未建'}`;
    }
    return '';
  }
  function checkGoals() {
    GOALS.forEach(g => { if (!S.goals[g.id] && goalMet(g.id)) { S.goals[g.id] = 1; gain(5); notify(`心願達成：${g.n}。「${g.quote}」`, 'learn'); } });
    if (!S.ended && GOALS.every(g => S.goals[g.id])) { S.ended = true; ui.pendingEnd = true; }
  }

  /* ---------- 畫面 ---------- */
  function view() {
    return {
      term: term(), weather: S.weather, built: S.built, trees: S.trees.length,
      plots: S.plots.map(p => ({ s: p.s, crop: p.crop, dead: !!p.dead, st: stageOf(p), m: p.m, weeds: !!p.weeds, cover: p.cover > 0, water: p.crop === 'rice' && !p.dead }))
    };
  }
  function plotLabel(p, i) {
    if (p.s === 0) return `第 ${i + 1} 塊：荒地`;
    if (!p.crop) return `第 ${i + 1} 塊：空田`;
    const c = CROPS[p.crop]; return `第 ${i + 1} 塊：${c.name}，${p.dead ? '已枯死' : STAGE[stageOf(p)]}`;
  }
  function render() {
    const tm = term(), t = TERMS[tm];
    $('#hTerm').textContent = t.n;
    $('#hHou').textContent = `${HOU_NAME[hou()]} · ${t.hou[hou()]}`;
    $('#hYear').textContent = `${YEAR_NAME[S.year] || '第 ' + S.year + ' 年'} · ${SEASONS[tm / 6 | 0]}`;
    $('#hWxG').textContent = WX[S.weather].g; $('#hWx').textContent = `${WX[S.weather].n} · ${TEMP_NAME[TEMP[tm]]}`;
    $('#rCoins').textContent = S.coins; $('#rFood').textContent = foodCount(); $('#rWood').textContent = S.wood; $('#rStone').textContent = S.stone; $('#rFert').textContent = S.fert;
    const mx = maxSta(), full = 6 + (S.built.hut ? 2 : 0) + (S.built.house ? 2 : 0); let pips = '';
    for (let i = 0; i < full; i++) pips += `<i class="${i < S.sta ? 'on' : i >= mx ? 'lost' : ''}"></i>`;
    $('#hPips').innerHTML = pips; $('#hPips').setAttribute('aria-label', `體力 ${S.sta}／${mx}`);
    const r = rankIdx(), nx = RANKS[r + 1];
    $('#hRankName').textContent = RANKS[r].n; $('#hRankBar').style.width = (nx ? clamp((S.know - RANKS[r].at) / (nx.at - RANKS[r].at), 0, 1) * 100 : 100) + '%';
    $('#hRank').title = nx ? `農識 ${S.know}，距「${nx.n}」還差 ${nx.at - S.know}` : `農識 ${S.know}`;
    $('#hint').textContent = hint();
    $('#dotSky').hidden = !!S.guess; $('#dotAsk').hidden = S.asked === quizKey();
    $('#dotBuild').hidden = !BUILDINGS.some(b => canBuild(b));
    S.plots.forEach((p, i) => {
      const el = plotEls[i]; if (!el) return; let tags = '';
      if (p.crop) {
        const c = CROPS[p.crop];
        if (p.dead) tags += '<span class="tag dead">枯</span>';
        else {
          if (stageOf(p) === 4) tags += '<span class="tag ripe">熟</span>';
          if (!c.drought && p.m < (c.thirsty ? 2 : 1) && TEMP[tm] > 0) tags += '<span class="tag dry">渴</span>';
          if (p.weeds) tags += '<span class="tag weed">草</span>';
          if (p.bugs) tags += '<span class="tag bug">蟲</span>';
        }
      }
      el.innerHTML = `<span class="tags">${tags}</span>`; el.setAttribute('aria-label', plotLabel(p, i)); el.classList.toggle('sel', ui.pop === i);
    });
    Scene.update(view());
    if (ui.pop >= 0) renderPop();
    if (ui.pendingEnd && !ui.sheet && !ui.busy) { ui.pendingEnd = false; openSheet('ending'); }
  }
  const plotEls = [];
  function placePlots(L) {
    if (!L) return;
    L.plots.forEach((b, i) => { const el = plotEls[i]; if (!el) return; el.style.left = b.x + 'px'; el.style.top = b.y + 'px'; el.style.width = b.w + 'px'; el.style.height = b.h + 'px'; });
    if (ui.pop >= 0) renderPop();
  }

  /* ---------- 田間小箋 ---------- */
  function btn(a, label, cost, cls, arg) { return `<button class="btn${cls ? ' ' + cls : ''}" type="button" data-pa="${a}"${arg ? ` data-arg="${arg}"` : ''}>${label}${cost ? `<small>力${cost}</small>` : ''}</button>`; }
  function popHTML(i) {
    const p = S.plots[i];
    if (p.s === 0) return `<h3>荒地</h3><p>雜草叢生，碎石遍地。開墾出來才能耕種。</p><div class="acts">${btn('till', '開墾', 3, 'pri')}</div>`;
    if (!p.crop) {
      const have = CROP_ORDER.filter(id => S.seeds[id] > 0);
      let h = `<h3>空田 <small>${MOIST[p.m]}</small></h3>`;
      if (p.nfix) h += '<p class="good">豆茬地：地力正肥，下一茬長勢更好。</p>';
      else if (p.last) h += `<p>上一茬種的是${CROPS[p.last].name}。換一種來種，地力才養得住。</p>`;
      if (!have.length) return h + `<p>手上沒有種子了。</p><div class="acts"><button class="btn pri" type="button" data-pa="market">去市集</button></div>`;
      h += '<div class="acts">' + have.map(id => {
        const c = CROPS[id], blocked = c.needs && !S.built[c.needs], ok = inSeason(id);
        return `<button class="btn" type="button" data-pa="sow" data-arg="${id}"${blocked ? ' disabled' : ''}>播${c.name} ×${S.seeds[id]} <span class="chip ${blocked || !ok ? 'no' : 'ok'}">${blocked ? '需水車' : ok ? '合時令' : '不合時'}</span></button>`;
      }).join('') + '</div>';
      return h;
    }
    const c = CROPS[p.crop];
    if (p.dead) return `<h3>${c.name} <small>已枯死</small></h3><p>這一茬沒保住。清掉殘株，換個時令再來。</p><div class="acts">${btn('clear', '清理殘株', 1, 'pri')}</div>`;
    const st = stageOf(p), T = temp(), rate = rateOf(p, T);
    const tnote = st === 4 ? '可以收了' : c.kind === 'winter' && T === 0 ? '越冬中，長得極慢' : rate === 0 ? '天寒，休眠不長' : rate < 1 ? (T === 3 ? '天太熱，長得慢' : '天偏涼，長得慢') : '時令正好';
    const eff = rate * (p.fert ? 1.25 : 1) * (p.weeds ? .5 : 1), left = st === 4 ? 0 : eff > 0 ? Math.ceil((c.grow - p.prog) / eff) : null;
    const ql = p.q >= 110 ? '極佳' : p.q >= 90 ? '茁壯' : p.q >= 65 ? '尚可' : p.q >= 35 ? '瘦弱' : '垂危';
    const need = c.thirsty ? 2 : 1, dry = !c.drought && p.m < need;
    let h = `<h3>${c.name} <small>${STAGE[st]}</small></h3><div class="bar"><i style="width:${Math.round(clamp(p.prog / c.grow, 0, 1) * 100)}%"></i></div>`;
    h += `<dl class="facts"><dt>長勢</dt><dd class="${p.q < 65 ? 'warn' : ''}">${ql}${p.sweet ? '・經霜回甜' : ''}${p.fert ? '・已施肥' : ''}</dd><dt>水分</dt><dd class="${dry ? 'warn' : ''}">${MOIST[p.m]}${c.drought ? '（耐旱，不必澆）' : c.thirsty ? '（耗水）' : ''}</dd><dt>時令</dt><dd class="${rate < 1 && st < 4 ? 'warn' : ''}">${tnote}</dd><dt>成熟</dt><dd>${st === 4 ? (p.ripeT > c.hold ? '<span class="warn">過熟了，快收</span>' : `再放 ${Math.max(0, c.hold - p.ripeT)} 候就老了`) : left === null ? '要等回暖' : `約 ${left} 候後`}</dd></dl>`;
    const iss = [];
    if (p.weeds) iss.push('雜草叢生：生長減半'); if (p.bugs) iss.push('有蟲在咬'); if (p.cover > 0) iss.push(`覆着乾草（還能保 ${p.cover} 候）`);
    if (iss.length) h += `<p class="${p.weeds || p.bugs ? 'warn' : ''}">${iss.join('；')}</p>`;
    let b = '';
    if (can(i, 'harvest')) b += btn('harvest', '收成', 1, 'pri');
    if (can(i, 'water')) b += btn('water', S.built.well ? '澆水（整排）' : '澆水', 1, dry ? 'pri' : '');
    if (can(i, 'weed')) b += btn('weed', '除草', 1, 'pri');
    if (can(i, 'bug')) b += btn('bug', '捉蟲', 1, 'pri');
    if (!p.fert) b += `<button class="btn" type="button" data-pa="fert"${S.fert > 0 ? '' : ' disabled'}>施肥<small>力1 肥1</small></button>`;
    if (can(i, 'cover') && c.frost === 'kill') b += btn('cover', '覆草防霜', 1);
    b += btn('clear', '鏟除', 1, 'quiet');
    return h + `<div class="acts">${b}</div>`;
  }
  function renderPop() {
    const el = $('#pop'), i = ui.pop; if (i < 0) { el.hidden = true; return; }
    el.innerHTML = popHTML(i); el.hidden = false;
    const L = Scene.layout(); if (!L) return; const b = L.plots[i], pw = el.offsetWidth, ph = el.offsetHeight;
    let y = b.y - ph - 8; if (y < 8) y = Math.max(8, Math.min(L.h - ph - 8, b.y + b.h + 8));
    el.style.left = clamp(b.x + b.w / 2 - pw / 2, 8, Math.max(8, L.w - pw - 8)) + 'px'; el.style.top = y + 'px';
  }
  function openPop(i) { ui.pop = i; render(); const f = $('#pop button'); if (f) f.focus({ preventScroll: true }); }
  function closePop() { if (ui.pop < 0) return; ui.pop = -1; $('#pop').hidden = true; plotEls.forEach(e => e.classList.remove('sel')); }
  function setSticky(s) {
    ui.sticky = s; const el = $('#sticky'); if (!s) { el.hidden = true; return; }
    el.textContent = `連續${ACT[s.a]}${s.arg ? '：' + CROPS[s.arg].name : ''} · 點別的田直接做（點此取消）`; el.hidden = false;
  }
  function onPlot(i) {
    if (ui.busy) return;
    if (ui.sticky && can(i, ui.sticky.a, ui.sticky.arg)) { doAct(i, ui.sticky.a, ui.sticky.arg); return; }
    setSticky(null); if (ui.pop === i) { closePop(); return; } openPop(i);
  }

  /* ---------- 手卷面板 ---------- */
  function canAfford(cost) { return Object.keys(cost).every(k => S[k] >= cost[k]); }
  function canBuild(b) { return !S.built[b.id] && (!b.req || S.built[b.req]) && canAfford(b.cost); }
  function costHTML(cost) { return `<span class="cost">${Object.keys(cost).map(k => `<span class="${S[k] < cost[k] ? 'lack' : ''}">${RES[k]} ${cost[k]}</span>`).join('')}</span>`; }
  function advice() {
    const tm = term(), nt = (tm + 1) % 24, out = [];
    const avail = CROP_ORDER.filter(id => unlocked(id) && (!CROPS[id].needs || S.built[CROPS[id].needs]));
    const now = avail.filter(id => inSeason(id));
    out.push(now.length ? `眼下宜種：${now.map(id => CROPS[id].name).join('、')}。` : '眼下沒有合時令的種子可播。不違農時——等一等，先養地、備料。');
    const last = now.filter(id => !inSeason(id, nt)); if (last.length) out.push(`${last.map(id => CROPS[id].name).join('、')}的播期只到這個節氣為止，要種得趁早。`);
    const live = S.plots.filter(p => p.crop && !p.dead);
    const tender = uniq(live.filter(p => CROPS[p.crop].frost === 'kill').map(p => CROPS[p.crop].name));
    if (tender && (weatherWeights(tm).frost || weatherWeights(nt).frost)) out.push(`田裏的${tender}怕霜，霜期近了：熟的先收，沒熟的覆草。`);
    const cool = uniq(live.filter(p => CROPS[p.crop].kind === 'cool' && !CROPS[p.crop].perennial).map(p => CROPS[p.crop].name));
    if (cool && TEMP[nt] === 0 && TEMP[tm] > 0) out.push(`下個節氣地就凍了，${cool}要趕在那之前收。`);
    if (cool && TEMP[nt] === 3 && TEMP[tm] < 3) out.push(`天要熱了，${cool}喜涼怕熱，能收的早些收。`);
    const dry = live.filter(p => !CROPS[p.crop].drought && p.m === 0).length; if (dry && TEMP[tm] > 0) out.push(`有 ${dry} 塊田乾透了，莊稼正渴着。`);
    const weeds = live.filter(p => p.weeds).length; if (weeds) out.push(`有 ${weeds} 塊田長了草，別拖。`);
    return out;
  }
  const SHEETS = {
    intro() {
      const pages = [
        `<div class="story"><p>「晉太元中，武陵人捕魚為業。緣溪行，忘路之遠近。忽逢桃花林，夾岸數百步，中無雜樹，芳草鮮美，落英繽紛。」</p><p>「林盡水源，便得一山，山有小口，彷彿若有光。」</p><p class="muted">——陶淵明《桃花源記》</p></div>`,
        `<div class="story"><p>你不是那位漁人。</p><p>你是個丟了田地、兩手空空的農夫。兵荒馬亂之中，你順着溪水一直走，走到桃林的盡頭，側身鑽過那個只容一人的山口——</p><p>「復行數十步，豁然開朗。土地平曠，屋舍儼然，有良田美池桑竹之屬。」</p></div>`,
        `<div class="story"><p>村裏的田翁打量着你空空的雙手，笑了。</p><p>「先世避秦時亂，來此絕境，誰不是兩手空空來的？溪畔有片荒地，你肯下力氣，它就是你的。」</p><p>他借你一把舊鋤，又塞來一小包蘿蔔籽。「驚蟄了，桃花開了，正是下種的時候。種地沒有別的訣竅——看天，看地，看節氣。慢慢學。」</p></div><div class="note">點田地做農活，每件事都要花體力；力氣用盡就「歇息」，日子往前走一候（五天）。三候為一節氣，二十四節氣為一年。存檔會自動留在這個瀏覽器裏。</div>`
      ];
      const last = ui.page >= pages.length - 1;
      return { title: ['桃花源記', '豁然開朗', '一把舊鋤'][ui.page], html: pages[ui.page] + `<div class="sheet-foot"><span class="muted">${ui.page + 1}／${pages.length}</span>${last ? '' : '<button class="btn quiet" type="button" data-do="close">跳過</button>'}<button class="btn pri" type="button" data-do="${last ? 'close' : 'page'}">${last ? '下田去' : '往下讀'}</button></div>` };
    },
    report() {
      const R = ui.report, t = TERMS[term()], mk = { good: '吉', bad: '凶', info: '記', learn: '識' };
      let h = `<p class="lead"><span class="glyph">${WX[R.wx].g}</span> ${WX[R.wx].txt}</p>`;
      if (R.newTerm) h += `<div class="note"><b>${t.n}</b>——${t.mean}<br>農諺：「${t.say}」<br>${t.tip}</div>`;
      h += R.ev.length ? `<ul class="events">${R.ev.map(e => `<li class="${e.k}"><span class="mk">${mk[e.k]}</span><span>${e.t}</span></li>`).join('')}</ul>` : '<p class="muted">一夜無事，莊稼靜靜地長。</p>';
      h += `<p class="muted">今日所見：${sign().obs}</p><div class="sheet-foot"><button class="btn" type="button" data-do="open" data-arg="sky">觀天</button><button class="btn pri" type="button" data-do="close">下田</button></div>`;
      return { title: `${t.n} · ${HOU_NAME[hou()]}「${t.hou[hou()]}」`, html: h };
    },
    sky() {
      const sg = sign(), known = S.learned[sg.id];
      return { title: '觀天', html: `<p class="lead">${sg.obs}</p>` +
        (known ? `<p class="quote">「${sg.say}」</p><p class="muted">${sg.why}</p>` : '<p class="muted">你還不認得這個徵兆。先憑直覺猜一猜——下一候自見分曉，到時就知道其中的道理。</p>') +
        `<h4 class="sec">下一候的天氣，你料是</h4><div class="choices">${Object.keys(CATS).map(k => `<button class="choice${S.guess === k ? ' on' : ''}" type="button" data-do="guess" data-arg="${k}"><span class="glyph">${CATS[k].g}</span>${CATS[k].n}</button>`).join('')}</div>` +
        (S.guess ? `<p class="note">記下了：<b>${CATS[S.guess].n}</b>。${CATS[S.guess].tip}</p>` : '') +
        `<div class="sheet-foot"><span class="muted">已識農諺 ${Object.keys(S.learned).length}／${SIGNS.length}</span><button class="btn pri" type="button" data-do="close">回田裏</button></div>` };
    },
    ask() {
      const t = TERMS[term()], done = S.asked === quizKey();
      let h = `<p class="lead"><b>${t.n}</b>——${t.mean}</p><p class="quote">「${t.say}」</p><p>${t.tip}</p><h4 class="sec">田翁看了看你的田</h4><ul class="events">${advice().map(a => `<li class="info"><span class="mk">囑</span><span>${a}</span></li>`).join('')}</ul>`;
      if (!done || ui.quiz && ui.quiz.picked !== null) {
        if (!ui.quiz || ui.quiz.key !== quizKey()) { const o = [0, 1, 2]; for (let i = 2; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [o[i], o[j]] = [o[j], o[i]]; } ui.quiz = { key: quizKey(), order: o, picked: null }; }
        const Q = t.quiz, picked = ui.quiz.picked;
        h += `<h4 class="sec">田翁考你一題</h4><p class="lead">${Q.q}</p><div class="answers">${ui.quiz.order.map(k => `<button class="choice${picked === null ? '' : k === 0 ? ' right' : k === picked ? ' wrong' : ''}" type="button" data-do="answer" data-arg="${k}"${picked === null ? '' : ' disabled'}>${Q.a[k]}</button>`).join('')}</div>`;
        if (picked !== null) h += `<p class="note">${picked === 0 ? '<b class="good">答對了，農識 +4。</b>' : '<b class="warn">不對，不過記住就好，農識 +1。</b>'}${Q.why}</p>`;
      } else h += '<p class="muted">這個節氣的功課已經問過了。下個節氣再來。</p>';
      return { title: '請教田翁', html: h + '<div class="sheet-foot"><button class="btn pri" type="button" data-do="close">多謝田翁</button></div>' };
    },
    market() {
      const sell = ALL_IDS.filter(id => S.inv[id] > 0), r = rankIdx();
      let h = `<p class="muted">村人以物易物，也認銅錢。價錢隨節氣起落${S.built.granary ? '；你有糧倉，賣價多一成半' : ''}。手上有 <b>${S.coins}</b> 錢。</p><h4 class="sec">賣出</h4>`;
      h += sell.length ? `<div class="rows">${sell.map(id => { const it = item(id), pr = price(id), base = Math.round(it.price * (S.built.granary ? 1.15 : 1)); return `<div class="row"><div class="main"><b>${it.name}</b> ×${S.inv[id]} <span class="chip ${pr > base ? 'ok' : pr < base ? 'no' : ''}">${pr > base ? '價好' : pr < base ? '價賤' : '平價'}</span></div><div class="num">每${it.unit} ${pr} 錢</div><div class="acts"><button class="btn" type="button" data-do="sell" data-arg="${id}">賣 1</button><button class="btn" type="button" data-do="sellall" data-arg="${id}">全賣 +${pr * S.inv[id]}</button></div></div>`; }).join('')}</div><p class="muted">存糧也是口糧：每候要吃 1 份，別全賣光。</p>` : '<p class="muted">沒有可賣的東西。種出收成，或者去溪邊釣魚。</p>';
      h += '<h4 class="sec">種子</h4><div class="rows">' + CROP_ORDER.map(id => {
        const c = CROPS[id];
        if (c.rank > r) return `<div class="row"><div class="main"><b class="muted">${c.name}</b><span>要到「${RANKS[c.rank].n}」才懂得種</span></div></div>`;
        const blocked = c.needs && !S.built[c.needs], ok = inSeason(id);
        return `<div class="row"><div class="main"><b>${c.name}</b> <span class="chip ${ok && !blocked ? 'ok' : 'no'}">${blocked ? '需先建水車' : ok ? '合時令' : '不合時'}</span><span>${c.trait}・手上 ${S.seeds[id] || 0} 份</span></div><div class="num">${c.seed} 錢</div><div class="acts"><button class="btn" type="button" data-do="buy" data-arg="${id}"${S.coins >= c.seed ? '' : ' disabled'}>買 1</button><button class="btn" type="button" data-do="buy5" data-arg="${id}"${S.coins >= c.seed * 5 ? '' : ' disabled'}>買 5</button></div></div>`;
      }).join('') + '</div><h4 class="sec">雜貨</h4><div class="rows">';
      const misc = [['fert', '肥料', '施在田裏，長得快、收得多', 6], ['wood', '木材', '蓋房子用', 3], ['stone', '石料', '蓋房子用', 4]];
      h += misc.map(([id, n, d, pr]) => `<div class="row"><div class="main"><b>${n}</b><span>${d}・手上 ${S[id]}</span></div><div class="num">${pr} 錢</div><div class="acts"><button class="btn" type="button" data-do="buyres" data-arg="${id}"${S.coins >= pr ? '' : ' disabled'}>買 1</button><button class="btn" type="button" data-do="buyres5" data-arg="${id}"${S.coins >= pr * 5 ? '' : ' disabled'}>買 5</button></div></div>`).join('');
      h += r >= 3 ? `<div class="row"><div class="main"><b>桃樹苗</b><span>栽在屋後，春天開花，來年小暑結果・已栽 ${S.trees.length}／${MAX_TREES}</span></div><div class="num">${SAPLING} 錢</div><div class="acts"><button class="btn" type="button" data-do="tree"${S.coins >= SAPLING && S.trees.length < MAX_TREES ? '' : ' disabled'}>栽 1 株</button></div></div>` : `<div class="row"><div class="main"><b class="muted">桃樹苗</b><span>要到「${RANKS[3].n}」才懂得栽</span></div></div>`;
      return { title: '市集', html: h + '</div>' };
    },
    build() {
      let h = `<p class="muted">一磚一木，都是自己掙來的。手上有木 <b>${S.wood}</b>、石 <b>${S.stone}</b>、錢 <b>${S.coins}</b>。</p><div class="rows">`;
      h += BUILDINGS.map(b => {
        const done = S.built[b.id], lock = b.req && !S.built[b.req];
        return `<div class="row"><div class="main"><b>${b.name}</b> ${done ? '<span class="chip ok">已建成</span>' : lock ? `<span class="chip">需先有${BUILDINGS.find(x => x.id === b.req).name}</span>` : ''}<span>${b.desc}</span></div>${done ? '' : `<div class="num">${costHTML(b.cost)}</div><div class="acts"><button class="btn pri" type="button" data-do="build" data-arg="${b.id}"${canBuild(b) ? '' : ' disabled'}>營造</button></div>`}</div>`;
      }).join('');
      return { title: '營造', html: h + '</div>' };
    },
    book() {
      const tabs = [['crops', '作物'], ['terms', '節氣'], ['signs', '農諺'], ['goals', '心願'], ['more', '其他']], tm = term(), r = rankIdx();
      let h = `<div class="tabs" role="tablist">${tabs.map(([k, n]) => `<button class="tab${ui.tab === k ? ' on' : ''}" type="button" role="tab" aria-selected="${ui.tab === k}" data-do="tab" data-arg="${k}">${n}</button>`).join('')}</div>`;
      if (ui.tab === 'crops') {
        h += `<p class="muted">農識 ${S.know}・${RANKS[r].n}${RANKS[r + 1] ? `（距「${RANKS[r + 1].n}」還差 ${RANKS[r + 1].at - S.know}）` : ''}。色塊是適合播種的節氣，自立春排到大寒。</p><div class="cal-key"><span><i></i>宜播</span><span><i class="n"></i>現在</span></div><div>`;
        h += CROP_ORDER.map(id => {
          const c = CROPS[id];
          if (c.rank > r) return `<div class="crop-card"><h3 class="muted">${c.name} <span class="chip">「${RANKS[c.rank].n}」方可學</span></h3></div>`;
          let cal = ''; for (let k = 0; k < 24; k++) cal += `<i class="${inSeason(id, k) ? 'sow' : ''}${k === tm ? ' now' : ''}" title="${TERMS[k].n}"></i>`;
          return `<div class="crop-card"><h3>${c.name} <span class="chip">${c.trait}</span> <span class="chip">${c.kind === 'winter' ? '越冬約 40 候' : c.grow + ' 候成熟'}</span></h3><div><div class="cal-head"><span>春</span><span>夏</span><span>秋</span><span>冬</span></div><div class="cal" role="img" aria-label="宜播節氣：${c.sow.map(([a, b]) => TERMS[a].n + '至' + TERMS[b].n).join('、')}">${cal}</div></div><p><b>${c.how}</b></p><p>${c.lore}</p></div>`;
        }).join('') + '</div>';
      } else if (ui.tab === 'terms') {
        h += `<p class="muted">二十四節氣，七十二候。親身過了一個節氣，它才記在書裏。已歷 ${Object.keys(S.terms).length}／24。</p><div class="term-grid">${TERMS.map((t, k) => S.terms[k] ? `<div class="term-cell${k === tm ? ' now' : ''}"><b>${t.n}</b>${t.hou.join('・')}<br>「${t.say}」</div>` : `<div class="term-cell un"><b>${t.n}</b>未歷</div>`).join('')}</div>`;
      } else if (ui.tab === 'signs') {
        const got = SIGNS.filter(s => S.learned[s.id]);
        h += `<p class="muted">每候「觀天」猜一次天氣，應驗與否，都會記下那條農諺和它的道理。已識 ${got.length}／${SIGNS.length}。</p>`;
        h += got.length ? `<div class="rows">${got.map(s => `<div class="row"><div class="main"><b>「${s.say}」</b> <span class="chip">主${CATS[s.cat].n}</span><span>所見：${s.obs}</span><span>${s.why}</span></div></div>`).join('')}</div>` : '<p>還沒有記下任何農諺。點「觀天」試試。</p>';
      } else if (ui.tab === 'goals') {
        h += `<p class="muted">你想要的生活，一樣一樣掙出來。</p><div>${GOALS.map(g => `<div class="goal${S.goals[g.id] ? ' done' : ''}"><span class="mk">成</span><div><b>${g.n}</b><span>${g.d}${!S.goals[g.id] && goalProgress(g.id) ? '（' + goalProgress(g.id) + '）' : ''}</span><em>「${g.quote}」</em></div></div>`).join('')}</div>`;
      } else {
        h += `<div class="rows"><div class="row"><div class="main"><b>琴音</b><span>幾聲疏疏落落的五聲音階</span></div><div class="acts"><button class="btn" type="button" data-do="music">${Sound.playing() ? '止琴' : '撫琴'}</button></div></div>`;
        h += `<div class="row"><div class="main"><b>重新來過</b><span>抹去存檔，再做一回初來的客人</span></div><div class="acts">${ui.askReset ? '<button class="btn pri" type="button" data-do="reset">確定抹去</button><button class="btn" type="button" data-do="noreset">算了</button>' : '<button class="btn" type="button" data-do="askreset">重新來過</button>'}</div></div></div>`;
        h += `<div class="note">玩法：點田地開墾、播種、澆水、除草、收成；做過一次的活，可以接着點別的田連續做。每候「觀天」猜天氣，每個節氣向田翁「請教」一次。收成拿到「市集」換錢，攢木石在「營造」蓋房。</div>`;
      }
      return { title: '農書', html: h };
    },
    ending() {
      return { title: '怡然自樂', html: `<div class="story"><p>不知不覺，你在桃花源已經住了${YEAR_NAME[S.year] ? YEAR_NAME[S.year].replace('第', '').replace('年', '') : S.year}年。</p><p>屋後桃樹成林，溪上水車咿呀；倉裏有糧，案頭有書。清晨雞鳴，你荷鋤出門，田埂上有人招呼你去亭子裏喝一盞新茶。</p><p>你來的時候一無所有。如今你有一樣別人拿不走的東西——你看得懂天，認得了節氣，知道一粒種子什麼時候該入土。</p><p class="quote">「黃髮垂髫，並怡然自樂。」</p><p>外頭是什麼年月，你已經不大記得了。</p></div><div class="sheet-foot"><button class="btn pri" type="button" data-do="close">繼續過日子</button></div>` };
    }
  };
  function openSheet(id) {
    if (!SHEETS[id]) return; closePop(); setSticky(null);
    if (id === 'intro') ui.page = 0; if (id === 'book') ui.askReset = false; if (id === 'ask' && S.asked === quizKey()) ui.quiz = null;
    ui.sheet = id; renderSheet(true); $('#sheet').hidden = false;
    const f = $('#sheetBody .btn.pri') || $('#sheetCard'); f.focus({ preventScroll: true });
  }
  function renderSheet(top) {
    const body = $('#sheetBody'), y = body.scrollTop, s = SHEETS[ui.sheet]();
    $('#sheetTitle').textContent = s.title; body.innerHTML = s.html; body.scrollTop = top ? 0 : y;
  }
  function closeSheet() {
    if (!ui.sheet) return;
    if (ui.sheet === 'intro') { S.intro = true; save(); }
    ui.sheet = null; $('#sheet').hidden = true; render();
  }
  function handle(act, arg) {
    switch (act) {
      case 'close': closeSheet(); return;
      case 'open': openSheet(arg); return;
      case 'page': ui.page++; renderSheet(true); return;
      case 'tab': ui.tab = arg; ui.askReset = false; renderSheet(true); return;
      case 'guess': S.guess = arg; if (!S.firsts.guess) { S.firsts.guess = 1; gain(1); } break;
      case 'answer': { if (!ui.quiz || ui.quiz.picked !== null) return; const k = +arg; ui.quiz.picked = k; S.asked = quizKey(); gain(k === 0 ? 4 : 1); break; }
      case 'sell': if (S.inv[arg] > 0) { S.inv[arg]--; S.coins += price(arg); } break;
      case 'sellall': if (S.inv[arg] > 0) { S.coins += price(arg) * S.inv[arg]; S.inv[arg] = 0; } break;
      case 'buy': case 'buy5': { const n = act === 'buy' ? 1 : 5, c = CROPS[arg]; if (c && unlocked(arg) && S.coins >= c.seed * n) { S.coins -= c.seed * n; S.seeds[arg] = (S.seeds[arg] || 0) + n; } break; }
      case 'buyres': case 'buyres5': { const n = act === 'buyres' ? 1 : 5, pr = { fert: 6, wood: 3, stone: 4 }[arg]; if (pr && S.coins >= pr * n) { S.coins -= pr * n; S[arg] += n; } break; }
      case 'tree': if (rankIdx() >= 3 && S.coins >= SAPLING && S.trees.length < MAX_TREES) { S.coins -= SAPLING; S.trees.push(S.turn); first('tree', 3, '栽下第一株桃樹。「桃三杏四梨五年」——嫁接的苗結果早，來年小暑就有桃子吃。'); } break;
      case 'build': { const b = BUILDINGS.find(x => x.id === arg); if (b && canBuild(b)) { Object.keys(b.cost).forEach(k => { S[k] -= b.cost[k]; }); S.built[b.id] = 1; if (b.id === 'hut' || b.id === 'house') S.sta = Math.min(maxSta(), S.sta + 2); gain(3); toast(`${b.name}落成了。${b.desc}`, 'learn'); Sound.tap(5); } break; }
      case 'music': if (Sound.playing()) Sound.off(); else Sound.on(); break;
      case 'askreset': ui.askReset = true; break;
      case 'noreset': ui.askReset = false; break;
      case 'reset': try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ } S = fresh(); ui.askReset = false; ui.quiz = null; ui.report = null; ui.sheet = null; $('#sheet').hidden = true; render(); openSheet('intro'); return;
      default: return;
    }
    checkGoals(); save(); render(); if (ui.sheet) renderSheet(false);
  }

  /* ---------- 琴 ---------- */
  const Sound = (() => {
    let ac = null, timer = null, idx = 4;
    const scale = [196, 220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
    function pluck(f, when, vol) {
      const t = ac.currentTime + (when || 0), o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
      o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.004; lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(420, t + 1.5);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0006, t + 2.8);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(ac.destination); o.start(t); o2.start(t); o.stop(t + 2.9); o2.stop(t + 2.9);
    }
    function step() { idx = clamp(idx + [-2, -1, -1, 1, 1, 2][Math.random() * 6 | 0], 0, 8); pluck(scale[idx], 0, .15); if (Math.random() < .3) pluck(scale[Math.max(0, idx - 4)], .14, .08); timer = setTimeout(step, 900 + Math.random() * 2300); }
    return {
      on() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch (e) { toast('這個瀏覽器彈不了琴。'); return; } if (!timer) step(); },
      off() { clearTimeout(timer); timer = null; },
      playing: () => !!timer,
      tap(n) { if (ac && timer) pluck(scale[n % 9] * 2, 0, .06); }
    };
  })();

  /* ---------- 開局 ---------- */
  function start(data) {
    S = data && data.v === 1 && Array.isArray(data.plots) ? data : load() || fresh();
    const box = $('#plots');
    for (let i = 0; i < 12; i++) { const b = document.createElement('button'); b.type = 'button'; b.className = 'plot'; b.dataset.i = i; box.appendChild(b); plotEls.push(b); }
    box.addEventListener('click', e => { const b = e.target.closest('.plot'); if (b) onPlot(+b.dataset.i); else { closePop(); } });
    $('#pop').addEventListener('click', e => { const b = e.target.closest('[data-pa]'); if (!b || b.disabled) return; if (b.dataset.pa === 'market') { openSheet('market'); return; } doAct(ui.pop, b.dataset.pa, b.dataset.arg); });
    $('#sticky').addEventListener('click', () => setSticky(null));
    document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) dockAct(b.dataset.act); });
    $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') { closeSheet(); return; } const b = e.target.closest('[data-do]'); if (b && !b.disabled) handle(b.dataset.do, b.dataset.arg); });
    $('#sheetX').addEventListener('click', closeSheet);
    document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (ui.sheet) closeSheet(); else if (ui.pop >= 0) closePop(); else setSticky(null); });
    Scene.onLayout = placePlots;
    Scene.update(view());
    Scene.init($('#scene'));
    placePlots(Scene.layout());
    render();
    if (!S.intro) openSheet('intro');
  }
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => S);
  if (hot && typeof hot.ready === 'function') hot.ready(start); else start((hot && hot.data) || {});
})();
