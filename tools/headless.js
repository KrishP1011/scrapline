// Headless smoke-test rig for scrapline.html.
// Stubs just enough of the DOM/canvas/audio to run the real game script under node,
// then drives thousands of update()+draw() frames across every wave tier so a typo
// or a missing property in a new boss/weapon/buff surfaces as a crash instead of
// something the player finds. Not a substitute for playing it — a floor, not a ceiling.
const fs = require('fs');
const path = require('path');

const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'scrapline.html');
const html = fs.readFileSync(file, 'utf8');
const m = /<script>([\s\S]*)<\/script>/.exec(html);
if (!m) { console.error('no <script> block found'); process.exit(1); }
const src = m[1];

// ---- stubs ----
const noop = () => {};
function makeCtx() {
  const grad = { addColorStop: noop };
  const c = {
    canvas: null,
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', globalAlpha: 1,
    textAlign: '', lineDashOffset: 0, globalCompositeOperation: '', filter: '',
    shadowBlur: 0, shadowColor: '', lineCap: '', lineJoin: '', imageSmoothingEnabled: true,
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    createPattern: () => ({}),
    measureText: t => ({ width: String(t).length * 6 })
  };
  for (const k of ['save','restore','translate','rotate','scale','beginPath','closePath',
                   'moveTo','lineTo','arc','arcTo','ellipse','rect','quadraticCurveTo',
                   'bezierCurveTo','fill','stroke','fillRect','strokeRect','clearRect',
                   'fillText','strokeText','drawImage','setLineDash','clip','setTransform',
                   'resetTransform','putImageData'])
    c[k] = noop;
  c.getImageData = (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
  return c;
}
function makeCanvas() {
  const cv = { width: 300, height: 150, style: {}, getContext: () => makeCtx(),
               toDataURL: () => 'data:,', addEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 600 }) };
  return cv;
}
function makeEl() {
  const el = {
    style: {}, classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
    children: [], dataset: {},
    innerHTML: '', textContent: '', value: '', className: '', id: '',
    appendChild: noop, removeChild: noop, addEventListener: noop, removeEventListener: noop,
    setAttribute: noop, getAttribute: () => null, focus: noop, blur: noop, click: noop,
    querySelector: () => makeEl(), querySelectorAll: () => [], scrollTo: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 600 })
  };
  return el;
}
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.document = {
  hidden: false,
  getElementById: id => (id === 'game' ? makeCanvas() : makeEl()),
  createElement: t => (t === 'canvas' ? makeCanvas() : makeEl()),
  addEventListener: noop, removeEventListener: noop,
  querySelector: () => makeEl(), querySelectorAll: () => [],
  body: makeEl(), documentElement: makeEl()
};
global.window = global;
global.navigator = { maxTouchPoints: 0, userAgent: 'node' };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;      // the real loop never runs; we drive it
global.addEventListener = noop;
global.removeEventListener = noop;
global.matchMedia = () => ({ matches: false, addEventListener: noop });
global.location = { hash: '', href: 'file:///scrapline.html', search: '', reload: noop };
function FakeAudioNode() {
  return {
    connect: () => FakeAudioNode(), disconnect: noop, start: noop, stop: noop,
    frequency: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop },
    gain: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop },
    detune: { value: 0, setValueAtTime: noop },
    type: '', buffer: null, Q: { value: 0 }, playbackRate: { value: 1 }
  };
}
global.AudioContext = function () {
  return {
    currentTime: 0, destination: FakeAudioNode(), sampleRate: 44100, state: 'running',
    resume: () => Promise.resolve(),
    createOscillator: FakeAudioNode, createGain: FakeAudioNode, createBiquadFilter: FakeAudioNode,
    createBufferSource: FakeAudioNode, createDynamicsCompressor: FakeAudioNode,
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len), length: len })
  };
};
global.webkitAudioContext = global.AudioContext;

// ---- run the game, then drive it ----
const driver = `
;(function(){
  const report = { frames: 0, waves: [], errors: [] };
  const DT = 1 / 60;
  function drive(w, seconds, opts) {
    opts = opts || {};
    charIdx = opts.charIdx || 0;
    reset();
    wave = w - 1;
    nextWave();
    // give the run a plausible mid/late build so weapons + buffs actually execute
    if (opts.loaded) {
      p.slots = 2;
      p.weapons = [opts.wepA === undefined ? 0 : opts.wepA, opts.wepB === undefined ? 1 : opts.wepB];
      for (const u of POOL) { for (let k = 0; k < (opts.stacks || 3); k++) { u.f(); p.lvl[u.n] = (p.lvl[u.n] || 0) + 1; } }
      for (const u of CURSES) { u.f(); p.lvl[u.n] = 1; }
      p.hp = p.maxHp = 100000;   // survive long enough to see every phase
    }
    let t = 0, guard = 0;
    while (t < seconds && guard < 200000) {
      guard++;
      gt += DT;
      if (state === 'play') update(DT);
      else if (state === 'sweep') sweepUpdate(DT);
      draw();
      if (state === 'shop') { nextWave(); }
      if (state === 'dead') break;
      report.frames++;
      t += DT;
    }
    report.waves.push(w + (opts.tag ? ':' + opts.tag : ''));
  }
  const plan = [];
  for (let w = 1; w <= 12; w++) plan.push([w, 6, {}]);
  // every heavy wave in the rotation, with a loaded build so phases are reached
  for (let w = 5; w <= 100; w += 5) plan.push([w, 26, { loaded: true, tag: 'heavy' }]);
  // every weapon pairing, mid game
  for (let a = 0; a < WEAPONS.length; a++)
    plan.push([24, 8, { loaded: true, wepA: a, wepB: (a + 1) % WEAPONS.length, tag: 'wep' + a }]);
  // every rig
  for (let c = 0; c < CHARS.length; c++) plan.push([18, 8, { loaded: true, charIdx: c, tag: 'rig' + c }]);
  // deep late game
  plan.push([120, 20, { loaded: true, stacks: 12, tag: 'deep' }]);
  plan.push([160, 20, { loaded: true, stacks: 20, tag: 'deeper' }]);

  for (const [w, s, o] of plan) {
    try { drive(w, s, o); }
    catch (err) { report.errors.push('wave ' + w + ' ' + (o.tag || '') + ': ' + (err && err.stack || err)); }
  }
  // shop/manual/overlay paths
  try { makeOffer(); renderShop(); buildBook(); buildStatSheet(); showYard(); showPick(); buildSummary(); }
  catch (err) { report.errors.push('ui: ' + (err && err.stack || err)); }
  // buy every card repeatedly — catches maxed()/NOW() crashes and runaway stats
  try {
    reset(); wave = 30;
    for (let round = 0; round < 40; round++) {
      for (const u of POOL.concat(CURSES)) {
        if (u.maxed && u.maxed()) continue;
        u.f(); p.lvl[u.n] = (p.lvl[u.n] || 0) + 1;
        if (NOW[u.n]) NOW[u.n]();
      }
    }
    report.stacked = {
      dps: turretDps(), rate: +effRate().toFixed(2), dmg: +effDmg().toFixed(1),
      maxHp: Math.round(p.maxHp),
      rawSpeed: Math.round(p.speed), effSpeed: Math.round(effSpeed()),
      crit: +effCrit().toFixed(2), rawCrit: +p.crit.toFixed(2),
      chain: +effChain().toFixed(2), rawChain: +p.chain.toFixed(2),
      burnDps: Math.round(p.burnDps), burnCap: Math.round(igniteMax()),
      slow: +p.slowAmt.toFixed(2), streakMul: +streakMul().toFixed(2),
      wardCd: p.wardCdMax, regen: +p.regen.toFixed(2),
      offers: offerPool().length
    };
  } catch (err) { report.errors.push('stack: ' + (err && err.stack || err)); }

  // ---- survivability probe ----
  // The brief's stated failure mode: a fully stacked build that simply cannot be
  // killed by wave 20. Run a greedy stacker at real HP and see what actually happens.
  function probe(w, rounds, seconds, tag, opts) {
    opts = opts || {};
    try {
      charIdx = 0;
      reset();
      wave = w - 1;
      nextWave();
      const wpn = (opts.weapons || [0, 1]).map(i => Math.min(i, WEAPONS.length - 1));
      p.slots = 2; p.weapons = wpn;
      // POOL only by default: repeatedly buying every risk card floors max HP at 24,
      // which tells us nothing. Risk stacking gets its own probe with one of each.
      for (let r = 0; r < rounds; r++)
        for (const u of POOL) { if (u.maxed && u.maxed()) continue; u.f(); p.lvl[u.n] = (p.lvl[u.n] || 0) + 1; }
      if (opts.risk) for (const u of CURSES) { u.f(); p.lvl[u.n] = 1; }
      p.hp = p.maxHp;
      const startHp = p.hp;
      let minHp = p.hp, t = 0, waves = 0, died = false;
      const DT2 = 1 / 60;
      while (t < seconds) {
        gt += DT2;
        if (state === 'play') update(DT2);
        else if (state === 'sweep') sweepUpdate(DT2);
        if (state === 'shop') { waves++; nextWave(); }
        if (state === 'dead') { died = true; break; }
        minHp = Math.min(minHp, p.hp);
        t += DT2;
      }
      report[tag] = { fromWave: w, rounds: rounds, maxHp: Math.round(p.maxHp),
                      startHp: Math.round(startHp), minHp: Math.round(minHp),
                      endHp: Math.round(p.hp), wavesCleared: waves, died: died,
                      reachedWave: wave, dps: turretDps() };
    } catch (err) { report.errors.push(tag + ': ' + (err && err.stack || err)); }
  }
  // ---- campaign: a kiting bot that also shops, run from wave 1 ----
  // Crude on purpose. It backs away from whatever is closest, drifts to open floor,
  // dashes when cornered, and buys the cheapest thing it can afford each round.
  // It is not a good player — it is a fixed yardstick, so the same bot on two
  // builds of the game says something about how the difficulty curve moved.
  // the pre-expansion build has no heavy(); fall back so the same bot runs on both
  const isHeavy = (typeof heavy === 'function') ? heavy : (e => e.t === 'boss');
  function botInput() {
    let rx = 0, ry = 0;
    for (const e of enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > 220 || d < 0.001) continue;
      const wgt = (isHeavy(e) ? 2.5 : 1) * (220 - d) / 220;
      rx -= (e.x - p.x) / d * wgt; ry -= (e.y - p.y) / d * wgt;
    }
    for (const b of ebullets) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d > 110 || d < 0.001) continue;
      rx -= (b.x - p.x) / d * (110 - d) / 110 * 2; ry -= (b.y - p.y) / d * (110 - d) / 110 * 2;
    }
    // stay off the walls, they are where a kiter dies
    const M = 110;
    if (p.x < M) rx += (M - p.x) / M * 2.2;
    if (p.x > W - M) rx -= (p.x - (W - M)) / M * 2.2;
    if (p.y < M) ry += (M - p.y) / M * 2.2;
    if (p.y > H - M) ry -= (p.y - (H - M)) / M * 2.2;
    // hold position when nothing is actually threatening — this is what a player
    // does, and without it a rig that rewards standing still can never be judged
    let near = 1e9, nearHeavy = 1e9;
    for (const e of enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r;
      near = Math.min(near, d);
      if (isHeavy(e)) nearHeavy = Math.min(nearHeavy, d);
    }
    for (const b2 of ebullets) near = Math.min(near, Math.hypot(b2.x - p.x, b2.y - p.y));
    // Heavies get a much wider berth than ordinary enemies: a Foreman engages at
    // 190px and throws a ring out to 330, so a bot that held position at 170 simply
    // stood in the shockwave every time and made every rig look broken.
    if (near > 170 && nearHeavy > 340 && p.x > 120 && p.x < W - 120 && p.y > 120 && p.y < H - 120)
      return { dx: 0, dy: 0 };
    if (!rx && !ry) { rx = Math.cos(gt * 0.7); ry = Math.sin(gt * 0.7); }
    const l = Math.hypot(rx, ry) || 1;
    return { dx: rx / l, dy: ry / l };
  }
  function campaign(seconds, tag, opts) {
    opts = opts || {};
    try {
      charIdx = opts.charIdx || 0;
      reset();
      let t = 0, guard = 0, threat = 0, waveT = 0;
      const deathCtx = { heavy: null, secs: 0, foes: 0, dps: 0 };
      const DT2 = 1 / 60;
      while (t < seconds && guard < 2500000) {
        guard++;
        gt += DT2;
        if (state === 'play') {
          const inp = botInput();
          stick = { id: 1, ox: 0, oy: 0, dx: inp.dx, dy: inp.dy, mag: 1 };
          // dash away when something is genuinely on top of it
          threat = 999;
          for (const e of enemies) threat = Math.min(threat, Math.hypot(e.x - p.x, e.y - p.y) - e.r);
          keys[' '] = threat < 38;
          keys['e'] = true;                     // blast whenever it is up
          update(DT2);
        } else if (state === 'sweep') sweepUpdate(DT2);
        else if (state === 'shop') {
          // buy the cheapest affordable card, repeatedly, then move on
          for (let n = 0; n < 12; n++) {
            let best = -1, bc = 1e9;
            offer.forEach((o, ix) => { const c = cost(o.u); if (!o.bought && c <= scrap && c < bc) { bc = c; best = ix; } });
            if (best < 0) break;
            const o = offer[best];
            scrap -= bc; o.u.f();
            if (o.u.wep === undefined) p.lvl[o.u.n] = (p.lvl[o.u.n] || 0) + 1;
            o.bought = true;
          }
          nextWave();
        }
        if (state === 'play') waveT += DT2; else waveT = 0;
        if (state === 'dead') {
          deathCtx.heavy = (typeof isHeavyWave === 'function') ? isHeavyWave(wave) : false;
          deathCtx.secs = +waveT.toFixed(1);
          deathCtx.foes = enemies.length;
          deathCtx.dps = turretDps();
          break;
        }
        t += DT2;
      }
      report[tag] = { reachedWave: wave, kills: stats.totalKills, alive: state !== 'dead',
                      deathHeavy: deathCtx.heavy, deathSecs: deathCtx.secs, deathFoes: deathCtx.foes,
                      deathDps: deathCtx.dps,
                      seconds: Math.round(t), dps: turretDps(), maxHp: Math.round(p.maxHp),
                      cards: Object.values(p.lvl).reduce((a, b) => a + b, 0) };
    } catch (err) { report.errors.push(tag + ': ' + (err && err.stack || err)); }
  }
  const runs = [];
  for (let run = 0; run < (globalThis.SKIP_CAMPAIGN ? 0 : 40); run++) { campaign(900, 'c' + run); if (report['c' + run]) { runs.push(report['c' + run].reachedWave); delete report['c' + run]; } }
  runs.sort((a, b) => a - b);
  report.campaign = { n: runs.length, waves: runs,
                      mean: +(runs.reduce((a, b) => a + b, 0) / runs.length).toFixed(2),
                      median: runs[Math.floor(runs.length / 2)] };
  // every rig against the same bot, so no rig is quietly a trap
  if (!globalThis.SKIP_RIGS) {
    report.rigs = {};
    for (let ci = 0; ci < CHARS.length; ci++) {
      const rr = [];
      for (let run = 0; run < 24; run++) {
        campaign(900, 'r', { charIdx: ci });
        if (report.r) { rr.push({ w: report.r.reachedWave, h: report.r.deathHeavy,
                                  s: report.r.deathSecs, f: report.r.deathFoes, d: report.r.deathDps }); delete report.r; }
      }
      rr.sort((a, b) => a.w - b.w);
      const ws = rr.map(x => x.w);
      report.rigs[CHARS[ci].n] = { mean: +(ws.reduce((a, b) => a + b, 0) / ws.length).toFixed(2),
                                   median: ws[Math.floor(ws.length / 2)], best: ws[ws.length - 1],
                                   diedOnHeavy: rr.filter(x => x.h).length + '/' + rr.length,
                                   avgSecsIntoWave: +(rr.reduce((a, b) => a + b.s, 0) / rr.length).toFixed(1),
                                   avgFoesAtDeath: Math.round(rr.reduce((a, b) => a + b.f, 0) / rr.length),
                                   avgDps: Math.round(rr.reduce((a, b) => a + b.d, 0) / rr.length) };
    }
  }


  // ---- economy probe ----
  // An immortal shopper: kills at a plausible rate, buys everything it can afford
  // every round, and records where scrap comes from and where it goes. The question
  // is not "can it survive" but "does the bench ever stop being a constraint".
  function economy(toWave, tag, opts) {
    opts = opts || {};
    try {
      charIdx = opts.charIdx || 0;
      reset();
      p.maxHp = p.hp = 1e9;                     // survival is not what we are measuring
      if (opts.scrapMult) p.scrapMult = opts.scrapMult;
      const rows = [];
      let earnedAt = 0, spentTotal = 0, boughtTotal = 0;
      const DT2 = 1 / 60;
      let guard = 0;
      while (wave < toWave && guard < 4000000) {
        guard++;
        gt += DT2;
        if (state === 'play') {
          const inp = botInput();
          stick = { id: 1, ox: 0, oy: 0, dx: inp.dx, dy: inp.dy, mag: 1 };
          keys[' '] = false; keys['e'] = true;
          update(DT2);
        } else if (state === 'sweep') sweepUpdate(DT2);
        else if (state === 'shop') {
          const before = scrap, w = wave;
          let bought = 0;
          // buy anything affordable, cheapest first, until nothing is affordable
          for (let n = 0; n < 200; n++) {
            let best = -1, bc = 1e9;
            offer.forEach((o, ix) => { const c = cost(o.u); if (!o.bought && (opts.strong || !o.u.curse) && c <= scrap && c < bc) { bc = c; best = ix; } });
            if (best < 0) break;
            const o = offer[best];
            scrap -= bc; o.u.f();
            if (o.u.wep === undefined) p.lvl[o.u.n] = (p.lvl[o.u.n] || 0) + 1;
            const nx = drawCard(offer.map(x => x.u));
            if (nx) { o.u = nx; o.bought = false; } else o.bought = true;
            bought++;
          }
          spentTotal += before - scrap; boughtTotal += bought;
          p.maxHp = 1e9; p.frailty = 1;       // stay immortal across the whole run
          // can the build this economy paid for actually out-damage the wave?
          // incoming HP per second vs turret dps is the only ratio that matters.
          const k = kindStats('grunt');
          const perSec = (spawnBatch() / Math.max(0.0001, spawnRate()));
          const threat = Math.round(perSec * k.hp);
          rows.push({ w: w, earned: Math.round(stats.scrapEarned - earnedAt), spent: Math.round(before - scrap),
                      bank: Math.round(scrap), bought: bought, kills: stats.totalKills,
                      dps: turretDps(), threat: threat, ratio: +(turretDps() / threat).toFixed(2),
                      cheapest: Math.min.apply(null, offer.map(o => cost(o.u))) });
          earnedAt = stats.scrapEarned;
          p.hp = p.maxHp;
          nextWave();
        }
        if (state === 'dead') break;
      }
      report[tag] = { reachedWave: wave, died: state === 'dead', guardHit: guard >= 4000000,
                      rows: rows.filter(r => r.w % 2 === 0 || r.w <= 5),
                      finalBank: Math.round(scrap), totalEarned: Math.round(stats.scrapEarned),
                      totalSpent: Math.round(spentTotal), cardsBought: boughtTotal };
    } catch (err) { report.errors.push(tag + ': ' + (err && err.stack || err)); }
  }
  // weak build (no risk cards) and strong farming build (takes everything) —
  // the strong one is the case that produced the five-figure banks
  economy(21, 'weak_a');
  economy(21, 'weak_b');
  economy(21, 'strong_a', { strong: true });
  economy(21, 'strong_b', { strong: true });

  probe(20, 6, 240, 'w20_stacked');
  probe(20, 6, 240, 'w20_stacked_risk', { risk: true });
  probe(40, 14, 240, 'w40_stacked');
  probe(80, 30, 240, 'w80_stacked');
  probe(120, 40, 240, 'w120_stacked');
  // the specific combos worth watching: fire loop, crit/chain loop, close-range loop
  probe(40, 14, 240, 'w40_fire', { weapons: [6, 3] });     // Slag Thrower + Flak
  probe(40, 14, 240, 'w40_arc', { weapons: [5, 4] });      // Arc Thrower + Needler
  probe(40, 14, 240, 'w40_harpoon', { weapons: [7, 6] });  // Harpoon + Slag Thrower
  console.log('HEADLESS ' + JSON.stringify(report, null, 1));
})();
`;

try {
  // eslint-disable-next-line no-new-func
  new Function(src + driver)();
} catch (err) {
  console.error('FATAL', err && err.stack || err);
  process.exit(1);
}
