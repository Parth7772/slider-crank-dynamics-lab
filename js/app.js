/*!
 * app.js — dashboard wiring: inputs → Engine.solve → results, plots, animation.
 */
(function () {
  'use strict';
  const E = window.Engine;
  const { Plot, HeatMap, Bars, COL, fmtVal, richHTML } = window.Plotter;
  const $ = (s) => document.querySelector(s);
  const D2R = Math.PI / 180;

  /* ================================================================ inputs */
  const SPEC = [
    { g: 'Geometry', k: 'bore', tex: 'D', name: 'Cylinder bore', unit: 'mm', min: 30, max: 600, log: true, sig: 3, hard: [5, 3000] },
    { g: 'Geometry', k: 'r', tex: 'r', name: 'Crank radius (stroke = 2r)', unit: 'mm', min: 10, max: 400, log: true, sig: 3, hard: [2, 2000] },
    { g: 'Geometry', k: 'n', tex: 'n', name: 'Obliquity ratio l / r', unit: '', min: 2.2, max: 8, step: 0.05, dp: 2, hard: [1.2, 20] },
    { g: 'Geometry', k: 'CR', tex: 'r_c', name: 'Compression ratio', unit: '', min: 4, max: 24, step: 0.1, dp: 1, hard: [1.5, 40] },
    { g: 'Masses', k: 'mp', tex: 'm_p', name: 'Reciprocating mass (piston + pin + rings)', unit: 'kg', min: 0.05, max: 500, log: true, sig: 3, hard: [0, 5000] },
    { g: 'Masses', k: 'mc', tex: 'm_c', name: 'Connecting-rod mass', unit: 'kg', min: 0.02, max: 500, log: true, sig: 3, hard: [0, 5000] },
    { g: 'Masses', k: 'lG', tex: 'l_G/l', name: 'Rod CG distance from crank pin', unit: '', min: 0.1, max: 0.6, step: 0.01, dp: 2, hard: [0, 1] },
    { g: 'Masses', k: 'kG', tex: 'k_G/l', name: 'Rod radius of gyration about G', unit: '', min: 0.1, max: 0.45, step: 0.01, dp: 2, hard: [0, 0.7] },
    { g: 'Operation', k: 'N', tex: 'N', name: 'Crank speed', unit: 'rpm', min: 50, max: 12000, log: true, sig: 3, hard: [1, 30000] },
    { g: 'Operation', k: 'orient', tex: '\\text{axis}', name: 'Cylinder axis', type: 'select', options: [['v', 'Vertical (piston above crank)'], ['h', 'Horizontal']] },
    { g: 'Combustion', k: 'model', tex: 'p(\\psi)', name: 'Pressure model', type: 'select', options: [['wiebe', 'Single-zone, Wiebe heat release'], ['otto', 'Ideal air-standard Otto cycle'], ['motoring', 'Motoring (no combustion)'], ['none', 'No gas force (inertia only)']] },
    { g: 'Combustion', k: 'load', tex: '\\text{load}', name: 'Fuelling / load', unit: '%', min: 0, max: 100, step: 1, dp: 0 },
    { g: 'Combustion', k: 'pin', tex: 'p_1', name: 'Intake pressure (absolute)', unit: 'bar', min: 0.3, max: 3.5, step: 0.01, dp: 2, hard: [0.05, 10] },
    { g: 'Combustion', k: 'gamma', tex: '\\gamma', name: 'Ratio of specific heats', unit: '', min: 1.2, max: 1.4, step: 0.005, dp: 3, hard: [1.05, 1.67] },
    { g: 'Combustion', k: 'soc', tex: '\\theta_s', name: 'Start of combustion, before TDC', unit: '°', min: 0, max: 40, step: 0.5, dp: 1 },
    { g: 'Combustion', k: 'dur', tex: '\\Delta\\theta_b', name: 'Combustion duration', unit: '°', min: 10, max: 100, step: 1, dp: 0 },
    { g: 'Flywheel', k: 'Cs', tex: 'C_s', name: 'Coefficient of fluctuation of speed', unit: '%', min: 0.2, max: 10, log: true, sig: 2, hard: [0.01, 50] },
    { g: 'Flywheel', k: 'Dfw', tex: 'D_f', name: 'Rim mean diameter', unit: 'mm', min: 80, max: 4000, log: true, sig: 3, hard: [20, 20000] },
    { g: 'Flywheel', k: 'rho', tex: '\\rho', name: 'Rim material', type: 'select', num: true, options: [[7250, 'Cast iron (7250 kg/m³, v ≤ 30 m/s)'], [7850, 'Steel (7850 kg/m³, v ≤ 50 m/s)']] },
    { g: 'Flywheel', k: 'bt', tex: 'b/t', name: 'Rim width / thickness', unit: '', min: 0.5, max: 4, step: 0.1, dp: 1 },
    { g: 'Balancing', k: 'cbal', tex: 'c', name: 'Fraction of reciprocating mass balanced', unit: '', min: 0, max: 1, step: 0.01, dp: 2 },
  ];
  const SPEC_BY = Object.fromEntries(SPEC.map((s) => [s.k, s]));
  const V_SAFE = { 7250: 30, 7850: 50 };

  const PRESETS = {
    car: { label: 'Car SI engine, one cylinder (0.5 L)', v: { bore: 86, r: 43, n: 3.4, CR: 10, mp: 0.45, mc: 0.55, lG: 0.30, kG: 0.28, N: 3000, orient: 'v', model: 'wiebe', load: 80, pin: 1.0, gamma: 1.30, soc: 20, dur: 50, Cs: 2, Dfw: 300, rho: 7850, bt: 2, cbal: 0.5 } },
    bike: { label: 'Motorcycle single (150 cc)', v: { bore: 57.3, r: 28.9, n: 3.6, CR: 9.5, mp: 0.20, mc: 0.18, lG: 0.30, kG: 0.28, N: 7500, orient: 'v', model: 'wiebe', load: 100, pin: 1.0, gamma: 1.30, soc: 25, dur: 45, Cs: 3, Dfw: 120, rho: 7850, bt: 1.5, cbal: 0.5 } },
    diesel: { label: 'Diesel generator set, one cylinder', v: { bore: 102, r: 55, n: 4.0, CR: 17.5, mp: 1.2, mc: 1.4, lG: 0.30, kG: 0.28, N: 1500, orient: 'v', model: 'wiebe', load: 75, pin: 1.0, gamma: 1.32, soc: 12, dur: 45, Cs: 1, Dfw: 380, rho: 7250, bt: 2, cbal: 0.5 } },
    truck: { label: 'Turbo-diesel truck cylinder (2 L)', v: { bore: 130, r: 75, n: 3.6, CR: 17, mp: 3.5, mc: 4.0, lG: 0.30, kG: 0.28, N: 1800, orient: 'v', model: 'wiebe', load: 80, pin: 2.5, gamma: 1.32, soc: 6, dur: 50, Cs: 1, Dfw: 500, rho: 7850, bt: 2, cbal: 0.5 } },
    textbook: { label: 'Large horizontal gas engine (textbook scale)', v: { bore: 500, r: 300, n: 4, CR: 6, mp: 250, mc: 150, lG: 0.35, kG: 0.30, N: 250, orient: 'h', model: 'otto', load: 60, pin: 1.0, gamma: 1.35, soc: 10, dur: 40, Cs: 2, Dfw: 2200, rho: 7250, bt: 2, cbal: 0.5 } },
  };

  const SENS_LABEL = {
    N: 'Speed $N$', r: 'Crank radius $r$', n: 'Obliquity $n$', bore: 'Bore $D$', mp: 'Recip. mass $m_p$', mc: 'Rod mass $m_c$',
    CR: 'Compr. ratio $r_c$', load: 'Load', pin: 'Intake press. $p_1$', Cs: 'Speed fluct. $C_s$', Dfw: 'Rim diameter $D_f$',
  };
  const SENS_OUT = {
    mrim: 'Flywheel rim mass', dE: 'Max. fluctuation of energy ΔE', P: 'Indicated power', Tmax: 'Peak turning moment',
    pinMax: 'Peak crank-pin load', FnMax: 'Peak side thrust', sh0Max: 'Peak shaking force (c = 0)',
  };

  /* ================================================================ state */
  let presetKey = 'car';
  let params = Object.assign({}, PRESETS.car.v);
  let R = null, base = null, sens = null;
  let psiDeg = 372;
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rps = 0.28;
  let showForces = true;
  let lastI = -1;
  const ctl = {};
  const plots = {};
  const cursorPlots = [];
  const allPlots = [];

  /* ================================================================ helpers */
  // words inside subscripts (T_{mean}, F_{Q,max}) are set upright, as \mathrm would
  const texFix = (s) => s.replace(/_\{([^{}]*)\}/g, (m, g) => '_{' + g.replace(/(^|[^\\A-Za-z])([A-Za-z]{2,})/g, (q, a, w) => a + '\\mathrm{' + w + '}') + '}');
  const tex = (s, display) => (window.katex ? katex.renderToString(texFix(s), { throwOnError: false, displayMode: !!display }) : s);
  const nf = (v, sig) => fmtVal(v, sig || 4).replace(/,/g, '{,}').replace(/\u2212/g, '-').replace(/×10\^(-?\d+)/, '\\times10^{$1}');
  const unitFmt = (u, k) => (v) => fmtVal(v * (k || 1)) + (u ? '\u2009' + u : '');
  const scale = (a, k) => { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] * k; return o; };
  const roundSig = (v, n) => { if (v === 0) return 0; const m = Math.pow(10, n - 1 - Math.floor(Math.log10(Math.abs(v)))); return Math.round(v * m) / m; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]); }
    for (const c of kids) e.append(c);
    return e;
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2200);
  }

  /* ================================================================ URL state */
  function readQuery() {
    const q = new URLSearchParams(location.search);
    if (q.has('preset') && PRESETS[q.get('preset')]) { presetKey = q.get('preset'); params = Object.assign({}, PRESETS[presetKey].v); }
    for (const s of SPEC) {
      if (!q.has(s.k)) continue;
      const raw = q.get(s.k);
      if (s.type === 'select') {
        const opt = s.options.find((o) => String(o[0]) === raw);
        if (opt) params[s.k] = opt[0];
      } else {
        const v = parseFloat(raw);
        if (isFinite(v)) params[s.k] = clamp(v, s.hard ? s.hard[0] : s.min, s.hard ? s.hard[1] : s.max);
      }
    }
  }
  function queryString() {
    const q = new URLSearchParams();
    q.set('preset', presetKey);
    for (const s of SPEC) q.set(s.k, String(params[s.k]));
    return q.toString();
  }
  let qT = null;
  function scheduleQuery() {
    clearTimeout(qT);
    qT = setTimeout(() => { try { history.replaceState(null, '', '?' + queryString() + location.hash); } catch (e) { /* file:// */ } }, 350);
  }

  /* ================================================================ controls */
  const toT = (s, v) => (s.log ? (v <= 0 ? 0 : clamp(1000 * Math.log(v / s.min) / Math.log(s.max / s.min), 0, 1000)) : clamp(v, s.min, s.max));
  const fromT = (s, t) => {
    if (s.log) return roundSig(s.min * Math.pow(s.max / s.min, t / 1000), s.sig || 3);
    let v = +t;
    if (s.step) v = Math.round(v / s.step) * s.step;
    return +v.toFixed(6);
  };
  const fmtIn = (s, v) => (s.dp != null ? (+v).toFixed(s.dp) : String(roundSig(+v, s.sig || 4)));

  function buildControls() {
    const host = $('#controls');
    const groups = [...new Set(SPEC.map((s) => s.g))];
    for (const g of groups) {
      const det = h('details', { class: 'grp', open: true }, h('summary', null, g));
      for (const s of SPEC.filter((q) => q.g === g)) det.append(buildRow(s));
      host.append(det);
    }
    const sel = $('#preset');
    for (const k in PRESETS) sel.append(h('option', { value: k }, PRESETS[k].label));
    sel.value = presetKey;
    sel.addEventListener('change', () => applyPreset(sel.value));
    $('#btnReset').addEventListener('click', () => applyPreset(presetKey));
    for (const s of SPEC) syncControl(s.k);
    updateEnabled();
  }
  function buildRow(s) {
    const sym = h('span', { class: 'ctl-sym' });
    sym.innerHTML = tex(s.tex);
    const row = h('div', { class: 'ctl', 'data-k': s.k });
    const head = h('div', { class: 'ctl-head' }, sym, h('span', { class: 'ctl-name' }, s.name));
    if (s.type === 'select') {
      const sel = h('select', { 'aria-label': s.name });
      for (const [v, lab] of s.options) sel.append(h('option', { value: String(v) }, lab));
      sel.addEventListener('change', () => setParam(s.k, s.num ? +sel.value : sel.value));
      row.append(head, sel);
      ctl[s.k] = { sel, row };
      return row;
    }
    const num = h('input', { type: 'number', step: 'any', inputmode: 'decimal', 'aria-label': s.name + (s.unit ? ' in ' + s.unit : '') });
    head.append(num, h('span', { class: 'ctl-unit' }, s.unit || ''));
    const rng = h('input', { type: 'range', 'aria-label': s.name + ' slider' });
    if (s.log) { rng.min = 0; rng.max = 1000; rng.step = 1; } else { rng.min = s.min; rng.max = s.max; rng.step = s.step || 'any'; }
    rng.addEventListener('input', () => setParam(s.k, fromT(s, +rng.value), 'slider'));
    const commit = () => {
      const v = parseFloat(num.value);
      if (!isFinite(v)) { syncControl(s.k); return; }
      setParam(s.k, clamp(v, s.hard ? s.hard[0] : s.min, s.hard ? s.hard[1] : s.max));
    };
    num.addEventListener('change', commit);
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); num.blur(); } });
    row.append(head, rng);
    ctl[s.k] = { num, rng, row };
    return row;
  }
  function syncControl(k, src) {
    const s = SPEC_BY[k], c = ctl[k];
    if (!c) return;
    if (s.type === 'select') { c.sel.value = String(params[k]); return; }
    if (src !== 'num' && document.activeElement !== c.num) c.num.value = fmtIn(s, params[k]);
    if (src !== 'slider') c.rng.value = toT(s, params[k]);
    const pct = s.log ? toT(s, params[k]) / 10 : 100 * (clamp(params[k], s.min, s.max) - s.min) / (s.max - s.min);
    c.rng.style.setProperty('--fill', pct.toFixed(1) + '%');
  }
  function updateEnabled() {
    const m = params.model;
    const off = { load: m === 'none' || m === 'motoring', soc: m !== 'wiebe', dur: m !== 'wiebe', pin: m === 'none', gamma: m === 'none' };
    for (const k in off) {
      ctl[k].row.classList.toggle('off', off[k]);
      ctl[k].row.title = off[k] ? 'Not used by the selected pressure model' : '';
    }
  }
  function setParam(k, v, src) {
    params[k] = v;
    syncControl(k, src);
    if (k === 'model') updateEnabled();
    schedule();
    scheduleQuery();
  }
  function applyPreset(k) {
    presetKey = k;
    params = Object.assign({}, PRESETS[k].v);
    $('#preset').value = k;
    for (const s of SPEC) syncControl(s.k);
    updateEnabled();
    schedule();
    scheduleQuery();
  }

  /* ================================================================ plots */
  const BANDS = [
    { x0: 0, x1: 180, label: 'suction', fill: 'rgba(31,119,180,0.045)' },
    { x0: 180, x1: 360, label: 'compression', fill: 'rgba(0,0,0,0)' },
    { x0: 360, x1: 540, label: 'power', fill: 'rgba(214,39,40,0.05)' },
    { x0: 540, x1: 720, label: 'exhaust', fill: 'rgba(0,0,0,0.035)' },
  ];
  const M_ = () => (R ? R.summary.M : 1440);
  const RES = () => (R ? R.summary.res : 0.5);
  const curI = () => ((Math.round(psiDeg / RES()) % M_()) + M_()) % M_();
  const tipPsi = (i) => richHTML('$ψ$') + ' = ' + (i * RES()).toFixed(1) + '°&ensp;' + richHTML('$θ$') + ' = ' + ((i * RES()) % 360).toFixed(1) + '°';
  const tipTheta = (i) => richHTML('$θ$') + ' = ' + (i * RES()).toFixed(1) + '°';

  function reg(p, cursor) { allPlots.push(p); if (cursor) cursorPlots.push(p); return p; }
  function crankPlot(id, o) {
    return reg(new Plot($('#' + id), Object.assign({
      xlim: [0, 720], xticks: [0, 90, 180, 270, 360, 450, 540, 630, 720], xlabel: 'Cycle angle $ψ$ [deg]',
      bands: BANDS, tipTitle: tipPsi, onPick: pick,
    }, o)), true);
  }
  function revPlot(id, o) {
    return reg(new Plot($('#' + id), Object.assign({
      xlim: [0, 360], xticks: [0, 60, 120, 180, 240, 300, 360], xlabel: 'Crank angle $θ$ [deg]', tipTitle: tipTheta, onPick: pick,
      mapIndex: (gi) => gi % (M_() / 2), unmapIndex: (li) => (curI() >= M_() / 2 ? li + M_() / 2 : li) % M_(),
    }, o)), true);
  }
  function xyPlot(id, o) {
    return reg(new Plot($('#' + id), Object.assign({ cursor: 'point', tipTitle: tipPsi, onPick: pick }, o)), true);
  }
  function createPlots() {
    const tight = { l: 62, r: 16, t: 12, b: 24 };
    plots.x = revPlot('figX', { h: 160, ylabel: '$x$ [mm]', xlabel: '', m: tight, legend: 'ur' });
    plots.v = revPlot('figV', { h: 160, ylabel: '$v$ [m/s]', xlabel: '', m: tight, legend: 'ur' });
    plots.a = revPlot('figA', { h: 196, ylabel: '$a$ [m/s²]', legend: 'ur', m: { l: 62, r: 16, t: 12, b: 42 } });
    plots.wc = revPlot('figWc', { h: 220, ylabel: '$ω_c$ [rad/s]', xticks: [0, 90, 180, 270, 360] });
    plots.ac = revPlot('figAc', { h: 220, ylabel: '$α_c$ [rad/s²]', xticks: [0, 90, 180, 270, 360] });
    plots.p = crankPlot('figP', { h: 260, ylabel: '$p$ [bar]', legend: 'ul' });
    plots.pv = xyPlot('figPV', { h: 300, xlabel: 'Cylinder volume $V$ [cm³]', ylabel: '$p$ [bar]', legend: 'ur' });
    plots.f1 = crankPlot('figF1', { h: 270, ylabel: 'Force [kN]', legend: 'ur' });
    plots.f2 = crankPlot('figF2', { h: 250, ylabel: 'Force [kN]', legend: 'ur' });
    plots.f3 = crankPlot('figF3', { h: 260, ylabel: 'Force [kN]', xticks: [0, 180, 360, 540, 720], legend: 'ur' });
    plots.polar = xyPlot('figPolar', { h: 260, equal: true, xlabel: 'Tangential $F_T$ [kN]', ylabel: 'Radial $F_R$ [kN]', legend: null });
    plots.t = crankPlot('figT', { h: 310, ylabel: 'Turning moment $T$ [N·m]', legend: 'ur' });
    plots.e = crankPlot('figE', { h: 230, ylabel: '$E$ [J]', xticks: [0, 180, 360, 540, 720], legend: null });
    plots.n = crankPlot('figN', { h: 230, ylabel: '$N$ [rpm]', xticks: [0, 180, 360, 540, 720], legend: null });
    plots.b1 = revPlot('figBal1', { h: 260, ylabel: 'Force [kN]', xticks: [0, 90, 180, 270, 360], legend: 'ur' });
    plots.b2 = reg(new Plot($('#figBal2'), { h: 260, cursor: 'point', equal: true, xlabel: '$F_{s,x}$ [kN] (along stroke)', ylabel: '$F_{s,y}$ [kN]', legend: 'ur', tipTitle: tipTheta, onPick: pick, mapIndex: (gi) => gi % (M_() / 2), unmapIndex: (li) => (curI() >= M_() / 2 ? li + M_() / 2 : li) % M_() }), true);
    plots.ver = crankPlot('figVer', { h: 260, ylabel: '$T$ [N·m]', legend: 'ur' });
    plots.sens = reg(new Bars($('#figSens'), { h: 330, xlabel: 'Elasticity  ∂ ln(result) / ∂ ln(parameter)' }), false);
    plots.mapA = reg(new HeatMap($('#mapA'), {
      h: 300, cmap: 'viridis', logc: true, xlabel: 'Crank speed $N$ [rpm]', ylabel: 'Obliquity ratio $n$', clabel: 'Rim mass $m_{rim}$ [kg]',
      tipLabel: '$m_{rim}$', fmt: (v) => fmtVal(v, 3) + ' kg', onPick: mapPick,
    }), false);
    plots.mapB = reg(new HeatMap($('#mapB'), {
      h: 300, cmap: 'coolwarm', diverging: true, xlabel: 'Crank speed $N$ [rpm]', ylabel: 'Obliquity ratio $n$', clabel: 'Change in peak crank-pin load [%]',
      tipLabel: 'Δ peak $F_C$', fmt: (v) => (v >= 0 ? '+' : '\u2212') + Math.abs(v).toFixed(1) + ' %', onPick: mapPick,
    }), false);
    // log–log toggle for the indicator diagram
    $('#chkLog').addEventListener('change', (e) => { plots.pv.o.xlog = plots.pv.o.ylog = e.target.checked; plots.pv.draw(); });
    const so = $('#sensOut');
    for (const k in SENS_OUT) so.append(h('option', { value: k }, SENS_OUT[k]));
    so.addEventListener('change', drawSens);
  }

  function renderPlots() {
    const s = R.summary, M = s.M, H = M / 2 + 1, c = R.c;
    const psi = R.psi, th = psi.subarray(0, H);
    const half = (a) => a.subarray(0, H);
    const B = base && base.summary.M === M ? base : null;
    const bl = (x, y) => (B ? { x, y, color: '#9a9a9a', lw: 1.3, dash: [5, 4], label: 'baseline', cursor: false } : null);
    const kN = 1e-3;

    // §1 kinematics
    plots.x.setData([{ x: th, y: scale(half(R.x), 1e3), color: COL.ink, label: '$x$', fmt: unitFmt('mm') }, B && bl(th, scale(half(B.x), 1e3))]);
    plots.v.setData([
      { x: th, y: half(R.v), color: COL.blue, label: '$v$ exact', fmt: unitFmt('m/s') },
      { x: th, y: half(R.vApx), color: COL.orange, lw: 1.3, dash: [6, 4], label: '$v$ approx.', cursor: false, fmt: unitFmt('m/s') },
      B && bl(th, half(B.v)),
    ]);
    plots.a.setData([
      { x: th, y: half(R.a), color: COL.red, label: '$a$ exact', fmt: unitFmt('m/s²') },
      { x: th, y: half(R.aApx), color: COL.orange, lw: 1.3, dash: [6, 4], label: '$a$ approx.', cursor: false, fmt: unitFmt('m/s²') },
      B && bl(th, half(B.a)),
    ]);
    plots.wc.setData([{ x: th, y: half(R.omc), color: COL.green, label: '$ω_c$', fmt: unitFmt('rad/s') }, B && bl(th, half(B.omc))], { legend: null });
    plots.ac.setData([{ x: th, y: half(R.alc), color: COL.purple, label: '$α_c$', fmt: unitFmt('rad/s²') }, B && bl(th, half(B.alc))], { legend: null });

    // §2 gas
    plots.p.setData([{ x: psi, y: R.pBar, color: COL.red, label: '$p$', fmt: unitFmt('bar') }, B && bl(psi, B.pBar)], {
      padTop: 0.24,
      marks: [{ x: s.psiPmax, y: s.pmax / 1e5, color: COL.red, label: '$p_{max}$ = ' + fmtVal(s.pmax / 1e5, 3) + ' bar', dx: 9, dy: -4 }],
    });
    const Vcc = scale(R.V, 1e6);
    plots.pv.setData([
      { x: Vcc, y: R.pBar, color: COL.ink, closed: true, label: 'cycle', fmt: (v, x) => fmtVal(v) + ' bar, ' + fmtVal(x) + ' cm³' },
      B && { x: scale(B.V, 1e6), y: B.pBar, color: '#9a9a9a', lw: 1.3, dash: [5, 4], closed: true, label: 'baseline', cursor: false },
    ]);

    // §3 forces
    plots.f1.setData([
      { x: psi, y: scale(R.Fg, kN), color: COL.red, label: 'gas force $F_g$', fmt: unitFmt('kN') },
      { x: psi, y: scale(R.Fi, kN), color: COL.blue, lw: 1.3, dash: [6, 3], label: 'inertia force $F_I = m_p a$', fmt: unitFmt('kN') },
      { x: psi, y: scale(R.Fp, kN), color: COL.ink, label: 'piston effort $F_P$', fmt: unitFmt('kN') },
      B && bl(psi, scale(B.Fp, kN)),
    ]);
    plots.f2.setData([
      { x: psi, y: scale(R.Fq, kN), color: COL.ink, label: 'rod thrust $F_Q$', fmt: unitFmt('kN') },
      { x: psi, y: scale(R.Fn, kN), color: COL.green, label: 'side thrust $F_N$', fmt: unitFmt('kN') },
      B && bl(psi, scale(B.Fq, kN)),
    ]);
    plots.f3.setData([
      { x: psi, y: scale(R.Ft, kN), color: COL.red, label: '$F_T$', fmt: unitFmt('kN') },
      { x: psi, y: scale(R.Fr, kN), color: COL.blue, label: '$F_R$', fmt: unitFmt('kN') },
      B && bl(psi, scale(B.Ft, kN)),
    ]);
    plots.polar.setData([
      { x: scale(R.Ft, kN), y: scale(R.Fr, kN), color: COL.ink, closed: true, label: 'load', fmt: (v, x) => '(' + fmtVal(x, 3) + ', ' + fmtVal(v, 3) + ') kN' },
      B && { x: scale(B.Ft, kN), y: scale(B.Fr, kN), color: '#9a9a9a', lw: 1.2, dash: [5, 4], closed: true, cursor: false },
    ], { marks: [{ x: 0, y: 0, r: 2.5, color: '#111' }] });

    // §4 turning moment, energy, speed
    plots.t.setData([
      { x: psi, y: R.T, color: COL.ink, lw: 1.7, label: 'total $T$', fill: { base: s.Tmean, pos: 'rgba(214,39,40,0.16)', neg: 'rgba(31,119,180,0.16)' }, fmt: unitFmt('N·m') },
      { x: psi, y: R.Tg, color: COL.red, lw: 1.1, dash: [5, 3], label: 'gas $T_g$', fmt: unitFmt('N·m') },
      { x: psi, y: R.Tin, color: COL.blue, lw: 1.1, dash: [2, 2], label: 'inertia $T_i$', fmt: unitFmt('N·m') },
      B && bl(psi, B.T),
    ], {
      hlines: [{ y: s.Tmean, color: '#111', dash: [8, 3, 2, 3], lw: 1, align: 'left', label: '$T_{mean}$ = ' + fmtVal(s.Tmean, 4) + ' N·m' }],
      marks: [{ x: s.psiTmax, y: s.Tmax, color: COL.ink, label: '$T_{max}$ = ' + fmtVal(s.Tmax, 4), dx: -9, dy: -3, align: 'right' }],
    });
    const eAl = (psiE) => (psiE > 560 ? { align: 'right', dx: -8 } : { align: 'left', dx: 8 });
    plots.e.setData([{ x: psi, y: R.E, color: COL.purple, label: '$E$', fmt: unitFmt('J') }, B && bl(psi, B.E)], {
      padTop: 0.3, padBot: 0.2,
      marks: [
        Object.assign({ x: s.psiEmax, y: s.Emax, color: COL.red, label: '$E_{max}$: speed max', dy: -7 }, eAl(s.psiEmax)),
        Object.assign({ x: s.psiEmin, y: s.Emin, color: COL.blue, label: '$E_{min}$: speed min', dy: 15 }, eAl(s.psiEmin)),
      ],
    });
    const Cs = params.Cs / 100;
    plots.n.setData([{ x: psi, y: R.Nfly, color: COL.ink, label: '$N$', fmt: unitFmt('rpm') }], {
      padTop: 0.22,
      hlines: [
        { y: params.N * (1 + Cs / 2), color: COL.red, dash: [4, 3], lw: 0.9 },
        { y: params.N, color: '#777', dash: [8, 3, 2, 3], lw: 0.8 },
        { y: params.N * (1 - Cs / 2), color: COL.blue, dash: [4, 3], lw: 0.9 },
      ],
    });

    // §5 balancing
    const mR = c.mp + c.lam * c.mc;
    const recip = new Float64Array(H);
    const priSec = new Float64Array(H);
    for (let i = 0; i < H; i++) { recip[i] = mR * R.a[i] * kN; priSec[i] = (R.prim[i] + R.sec[i]) * kN; }
    plots.b1.setData([
      { x: th, y: scale(half(R.prim), kN), color: COL.blue, label: 'primary $F_{pri}$', fmt: unitFmt('kN') },
      { x: th, y: scale(half(R.sec), kN), color: COL.orange, label: 'secondary $F_{sec}$', fmt: unitFmt('kN') },
      { x: th, y: priSec, color: COL.ink, lw: 1.2, dash: [6, 3], label: '$F_{pri}+F_{sec}$', fmt: unitFmt('kN') },
      { x: th, y: recip, color: COL.red, lw: 1.2, dash: [2, 2], label: 'exact $m_R a$', fmt: unitFmt('kN') },
    ]);
    const k = mR * c.R * c.w * c.w;
    const ox = new Float64Array(H), oy = new Float64Array(H);
    for (let i = 0; i < H; i++) { const t = i * s.res * D2R; ox[i] = (R.sh0x[i] - s.cOpt * k * Math.cos(t)) * kN; oy[i] = (R.sh0y[i] - s.cOpt * k * Math.sin(t)) * kN; }
    plots.b2.setData([
      { x: scale(half(R.sh0x), kN), y: scale(half(R.sh0y), kN), color: '#8a8a8a', lw: 1.2, dash: [5, 3], label: '$c$ = 0', cursor: false, fmt: unitFmt('kN') },
      { x: ox, y: oy, color: COL.green, lw: 1.2, dash: [2, 2], label: 'optimum $c$ = ' + s.cOpt.toFixed(2), cursor: false },
      { x: scale(half(R.shx), kN), y: scale(half(R.shy), kN), color: COL.red, label: 'chosen $c$ = ' + (+params.cbal).toFixed(2), fmt: (v, x) => '(' + fmtVal(x, 3) + ', ' + fmtVal(v, 3) + ') kN' },
    ], { marks: [{ x: 0, y: 0, r: 2.5, color: '#111' }] });

    // §7 verification plot
    plots.ver.setData([
      { x: psi, y: R.T, color: COL.ink, label: 'exact (Newton–Euler)', fmt: unitFmt('N·m') },
      { x: psi, y: R.Ttb, color: COL.orange, lw: 1.3, dash: [6, 3], label: 'textbook approximation', fmt: unitFmt('N·m') },
    ]);
  }

  /* ================================================================ results text */
  const KPIS = [
    { tex: 'P_i', lab: 'Indicated power', f: (s) => s.P / 1000, u: 'kW' },
    { tex: 'T_{mean}', lab: 'Mean turning moment', f: (s) => s.Tmean, u: 'N·m' },
    { tex: 'p_{mi}', lab: 'Indicated mean effective pressure', f: (s) => s.imep / 1e5, u: 'bar' },
    { tex: '\\eta_i', lab: 'Indicated thermal efficiency', f: (s) => s.eta * 100, u: '%' },
    { tex: 'p_{max}', lab: 'Peak cylinder pressure', f: (s) => s.pmax / 1e5, u: 'bar', x: (s) => 'at $ψ$ = ' + s.psiPmax.toFixed(1) + '°' },
    { tex: 'v_{max}', lab: 'Peak piston speed', f: (s) => s.vMax, u: 'm/s', x: (s) => 'mean ' + fmtVal(s.vMean, 3) + ' m/s' },
    { tex: 'a_{max}', lab: 'Peak piston acceleration', f: (s) => s.aMax, u: 'm/s²', x: (s) => '= ' + fmtVal(s.aMax / E.G0, 3) + ' $g$' },
    { tex: 'T_{max}', lab: 'Peak turning moment', f: (s) => s.Tmax, u: 'N·m', x: (s) => 'at $ψ$ = ' + s.psiTmax.toFixed(1) + '°' },
    { tex: '\\Delta E', lab: 'Max. fluctuation of energy', f: (s) => s.dE, u: 'J', x: (s) => '$C_E$ = ' + fmtVal(s.CE, 3) },
    { tex: 'I', lab: 'Flywheel moment of inertia', f: (s) => s.I, u: 'kg·m²', x: () => 'for $C_s$ = ' + fmtVal(+params.Cs, 3) + ' %' },
    { tex: 'm_{rim}', lab: 'Flywheel rim mass', f: (s) => s.mrim, u: 'kg', x: (s) => '$b$ × $t$ = ' + fmtVal(s.brim * 1e3, 3) + ' × ' + fmtVal(s.trim * 1e3, 3) + ' mm' },
    { tex: 'v_{rim}', lab: 'Rim peripheral speed', f: (s) => s.vr, u: 'm/s', x: (s) => (s.vr > (V_SAFE[params.rho] || 40) ? 'above safe limit! ' : '') + '$σ$ = ' + fmtVal(s.sigma / 1e6, 3) + ' MPa', warn: (s) => s.vr > (V_SAFE[params.rho] || 40) },
    { tex: 'F_{Q,max}', lab: 'Max. rod compression', f: (s) => s.FqMax / 1000, u: 'kN', x: (s) => (s.FqMin < 0 ? 'max. tension ' + fmtVal(-s.FqMin / 1000, 3) + ' kN' : 'never in tension') },
    { tex: '|F_N|_{max}', lab: 'Max. side thrust on wall', f: (s) => s.FnMax / 1000, u: 'kN' },
    { tex: 'F_{C,max}', lab: 'Max. crank-pin load', f: (s) => s.pinMax / 1000, u: 'kN' },
    { tex: 'F_{s,max}', lab: 'Max. shaking force (chosen c)', f: (s) => s.shMax / 1000, u: 'kN', x: (s) => 'optimum $c$ = ' + s.cOpt.toFixed(2) },
  ];
  const kpiRefs = [];
  function buildKPIs() {
    const host = $('#kpis');
    for (const k of KPIS) {
      const v = h('span', { class: 'v' }), x = h('div', { class: 'kpi-x' }), d = h('span', { class: 'delta' });
      const sym = h('div', { class: 'kpi-sym' }); sym.innerHTML = tex(k.tex);
      host.append(h('div', { class: 'kpi' }, sym, h('div', { class: 'kpi-val' }, v, h('span', { class: 'u' }, k.u)), h('div', { class: 'kpi-lab' }, k.lab), x, d));
      kpiRefs.push({ k, v, x, d });
    }
  }
  function renderKPIs() {
    const s = R.summary, b = base && base.summary;
    for (const { k, v, x, d } of kpiRefs) {
      const val = k.f(s);
      v.textContent = fmtVal(val, 4);
      x.innerHTML = k.x ? richHTML(k.x(s)) : '';
      v.parentElement.style.color = k.warn && k.warn(s) ? '#b35a00' : '';
      if (b) {
        const bv = k.f(b);
        const pct = isFinite(val) && isFinite(bv) && bv !== 0 ? (val - bv) / Math.abs(bv) * 100 : NaN;
        d.className = 'delta on' + (pct > 0.05 ? ' up' : pct < -0.05 ? ' down' : '');
        d.textContent = isFinite(pct) ? (pct > 0.05 ? '▲ ' : pct < -0.05 ? '▼ ' : '') + (Math.abs(pct) < 0.05 ? '0.0' : Math.abs(pct) >= 100 ? Math.abs(pct).toFixed(0) : Math.abs(pct).toFixed(1)) + ' %' : '—';
      } else d.className = 'delta';
    }
  }
  function renderDataLine() {
    const p = params, c = R.c;
    const models = { wiebe: '\\text{Wiebe}', otto: '\\text{Otto}', motoring: '\\text{motoring}', none: '\\text{no gas}' };
    const items = [
      `D=${nf(p.bore)}\\,\\text{mm}`, `r=${nf(p.r)}\\,\\text{mm}`, `n=l/r=${(+p.n).toFixed(2)}`, `l=${nf(c.L * 1e3)}\\,\\text{mm}`,
      `r_c=${(+p.CR).toFixed(1)}`, `m_p=${nf(p.mp)}\\,\\text{kg}`, `m_c=${nf(p.mc)}\\,\\text{kg}`, `l_G=${(+p.lG).toFixed(2)}\\,l`,
      `k_G=${(+p.kG).toFixed(2)}\\,l`, `N=${nf(p.N)}\\,\\text{rpm}\\;(\\omega=${nf(c.w)}\\,\\text{rad/s})`,
      `\\text{axis: ${p.orient === 'v' ? 'vertical' : 'horizontal'}}`, `p(\\psi):\\ ${models[p.model]}`,
      p.model === 'wiebe' || p.model === 'otto' ? `\\text{load}=${nf(p.load)}\\,\\%` : null,
      p.model !== 'none' ? `p_1=${(+p.pin).toFixed(2)}\\,\\text{bar}` : null,
      p.model !== 'none' ? `\\gamma=${(+p.gamma).toFixed(3)}` : null,
      p.model === 'wiebe' ? `\\theta_s=${nf(p.soc)}^\\circ` : null, p.model === 'wiebe' ? `\\Delta\\theta_b=${nf(p.dur)}^\\circ` : null,
      `C_s=${nf(p.Cs)}\\,\\%`, `D_f=${nf(p.Dfw)}\\,\\text{mm}`, `\\rho=${p.rho}\\,\\text{kg/m}^3`, `b/t=${(+p.bt).toFixed(1)}`, `c=${(+p.cbal).toFixed(2)}`,
    ].filter(Boolean);
    $('#dataLine').innerHTML = items.map((t) => '<span>' + tex(t) + '</span>').join('');
  }
  function resBox(id, items) {
    $(id).innerHTML = items.filter(Boolean).map((it) => {
      const [t, cls] = Array.isArray(it) ? it : [it, ''];
      return '<span class="ri ' + cls + '">' + tex(t) + '</span>';
    }).join('');
  }
  function renderResults() {
    const s = R.summary, c = R.c, p = params, M = s.M;
    const iBDC = Math.round(180 / s.res);
    resBox('#resKin', [
      `\\omega=${nf(c.w)}\\ \\text{rad/s}`,
      `v_{max}=${nf(s.vMax)}\\ \\text{m/s}`,
      `\\bar v_p=\\tfrac{4rN}{60}=${nf(s.vMean)}\\ \\text{m/s}`,
      `a_{TDC}=r\\omega^{2}\\big(1+\\tfrac1n\\big)=${nf(R.a[0])}\\ \\text{m/s}^2`,
      `a_{BDC}=-r\\omega^{2}\\big(1-\\tfrac1n\\big)=${nf(R.a[iBDC])}\\ \\text{m/s}^2`,
      `\\omega_{c,max}=${nf(s.omcMax)}\\ \\text{rad/s}`,
      `\\alpha_{c,max}=${nf(s.alcMax)}\\ \\text{rad/s}^2`,
    ]);
    const burns = p.model === 'wiebe' || p.model === 'otto';
    resBox('#resGas', [
      `V_s=${nf(s.Vs * 1e6)}\\ \\text{cm}^3`, `V_c=${nf(s.Vc * 1e6)}\\ \\text{cm}^3`,
      burns ? `Q_{in}=${nf(s.Q)}\\ \\text{J}` : null,
      `p_{max}=${nf(s.pmax / 1e5)}\\ \\text{bar}\\ (\\psi=${s.psiPmax.toFixed(1)}^\\circ)`,
      `W=\\oint p\\,dV=${nf(s.Wpdv)}\\ \\text{J}`, `p_{mi}=${nf(s.imep / 1e5)}\\ \\text{bar}`, `P_i=${nf(s.P / 1000)}\\ \\text{kW}`,
      burns ? `\\eta_i=${nf(s.eta * 100, 3)}\\,\\%\\ \\ (\\eta_{Otto}=${nf(s.etaOtto * 100, 3)}\\,\\%)` : null,
    ]);
    let FgMax = 0; for (let i = 0; i < M; i++) FgMax = Math.max(FgMax, R.Fg[i]);
    resBox('#resForce', [
      `F_{g,max}=${nf(FgMax / 1e3)}\\ \\text{kN}`,
      `F_{Q,max}=${nf(s.FqMax / 1e3)}\\ \\text{kN (comp.)}`,
      `F_{Q,min}=${nf(s.FqMin / 1e3)}\\ \\text{kN}${s.FqMin < 0 ? '\\ (\\text{tension})' : ''}`,
      `|F_N|_{max}=${nf(s.FnMax / 1e3)}\\ \\text{kN}`,
      `F_{C,max}=${nf(s.pinMax / 1e3)}\\ \\text{kN (crank pin)}`,
      `F_{G,max}=${nf(s.gudMax / 1e3)}\\ \\text{kN (gudgeon pin)}`,
    ]);
    const vs = V_SAFE[p.rho] || 40;
    resBox('#resTmd', [
      `T_{mean}=${nf(s.Tmean)}\\ \\text{N\\,m}`,
      `T_{max}=${nf(s.Tmax)}\\ \\text{N\\,m}\\ (\\psi=${s.psiTmax.toFixed(1)}^\\circ)`,
      `T_{min}=${nf(s.Tmin)}\\ \\text{N\\,m}`,
      `W=\\int T\\,d\\theta=${nf(s.W)}\\ \\text{J}`,
      `\\Delta E=${nf(s.dE)}\\ \\text{J}`, `C_E=${nf(s.CE, 3)}`,
      `I=${nf(s.I)}\\ \\text{kg\\,m}^2`, `m_{rim}=${nf(s.mrim)}\\ \\text{kg}`,
      `b\\times t=${nf(s.brim * 1e3, 3)}\\times${nf(s.trim * 1e3, 3)}\\ \\text{mm}`,
      [`v=\\omega R=${nf(s.vr, 3)}\\ \\text{m/s}\\ ${s.vr > vs ? '>' : '\\le'}\\ ${vs}\\ \\text{m/s}${s.vr > vs ? '\\ \\text{(too fast: use a smaller }D_f\\text{ or steel)}' : '\\ \\text{(safe)}'}`, s.vr > vs ? 'warn' : ''],
      `\\sigma_t=\\rho v^{2}=${nf(s.sigma / 1e6, 3)}\\ \\text{MPa}`,
      `N_{max}/N_{min}=${nf(s.Nmax)}/${nf(s.Nmin)}\\ \\text{rpm}`,
    ]);
    const mR = c.mp + c.lam * c.mc, mRot = (1 - c.lam) * c.mc;
    resBox('#resBal', [
      `m_R=${nf(mR)}\\ \\text{kg}`, `m_{rot}=${nf(mRot)}\\ \\text{kg}`,
      `m_B=${nf(mRot + p.cbal * mR)}\\ \\text{kg at } r`,
      `F_{pri,max}=${nf(s.primMax / 1e3)}\\ \\text{kN}`, `F_{sec,max}=${nf(s.secMax / 1e3)}\\ \\text{kN}`,
      `F_{s,max}(c{=}0)=${nf(s.sh0Max / 1e3)}\\ \\text{kN}`,
      `F_{s,max}(c{=}${(+p.cbal).toFixed(2)})=${nf(s.shMax / 1e3)}\\ \\text{kN}`,
      `c^{*}=${s.cOpt.toFixed(2)}\\ \\Rightarrow\\ F_{s,max}=${nf(s.shOpt / 1e3)}\\ \\text{kN}`,
    ]);
  }

  /* ================================================================ verification */
  let benchRows = null, otto = null;
  function renderVerification() {
    if (!benchRows) {
      benchRows = E.textbookBenchmark();
      otto = E.ottoBenchmark();
      const tb = $('#tblBench');
      tb.innerHTML = '<thead><tr><th>Quantity (θ = 60°)</th><th>Hand calculation</th><th>Exact solver</th><th>Difference</th></tr></thead><tbody>' +
        benchRows.map((r) => '<tr><td>' + richHTML(r.q.replace(/ (F_\w|T)$/, ' $$$1$$')) + '</td><td>' + (r.hand / 1000).toFixed(3) + ' k' + r.unit.replace(' ', '·') + '</td><td>' + (r.exact / 1000).toFixed(3) + ' k' + r.unit.replace(' ', '·') + '</td><td>' + (E.relErr(r.exact, r.hand) * 100).toFixed(3) + ' %</td></tr>').join('') +
        '</tbody>';
      const oe = E.relErr(otto.num, otto.exact);
      $('#tblOtto').innerHTML = '<thead><tr><th>Quantity</th><th>Numerical cycle</th><th>Closed form</th><th>Rel. error</th><th></th></tr></thead><tbody><tr><td>Thermal efficiency η</td><td>' +
        otto.num.toFixed(6) + '</td><td>' + otto.exact.toFixed(6) + '</td><td>' + oe.toExponential(1) + '</td><td class="' + (oe < 1e-4 ? 'ok">✓ pass' : 'bad">✗') + '</td></tr></tbody>';
    }
    const ch = R.checks, s = R.summary;
    const rows = [
      ['Crank torque: Newton–Euler vs energy (virtual-power) method', 'max |Δ$T$| / max |$T$|', ch.neVsEnergy, 1e-9],
      ['Cycle work: ∫$T$ d$θ$ (mechanism) vs ∮$p$ d$V$ (thermodynamics)', s.W.toFixed(3) + ' J vs ' + s.Wpdv.toFixed(3) + ' J', ch.workPdv, 2e-3],
      ['Net work of all inertia forces over one cycle', '∮$T_i$ d$θ$ / ∮|$T_i$| d$θ$', ch.inertiaWork, 1e-9],
      ['Piston velocity: closed form vs finite difference of $x$($θ$)', 'max error / $rω$', ch.vFD, 1e-6],
      ['Piston acceleration: closed form vs finite difference', 'max error / $rω$²', ch.aFD, 1e-4],
      ['Speed fluctuation with designed flywheel = requested $C_s$', ((s.Nmax - s.Nmin) / params.N * 100).toFixed(4) + ' % vs ' + (+params.Cs).toFixed(4) + ' %', E.relErr((s.Nmax - s.Nmin) / params.N, params.Cs / 100), 1e-3],
    ];
    $('#tblLive').innerHTML = '<thead><tr><th>Check</th><th>Compared</th><th>Rel. difference</th><th></th></tr></thead><tbody>' +
      rows.map(([a, b, e, tol]) => '<tr><td>' + richHTML(a) + '</td><td>' + richHTML(b) + '</td><td>' + (isFinite(e) ? e.toExponential(1) : '—') + '</td><td class="' + (e <= tol ? 'ok">✓ pass' : 'bad">✗') + '</td></tr>').join('') + '</tbody>';
  }

  /* ================================================================ sensitivity & maps */
  let slowT = null, mapId = 0, worker = null;
  function scheduleSlow() {
    clearTimeout(slowT);
    slowT = setTimeout(() => {
      sens = E.sensitivity(params);
      drawSens();
      runMaps();
    }, 160);
  }
  function drawSens() {
    if (!sens) return;
    const k = $('#sensOut').value;
    const items = E.SENS_KEYS.map((p) => ({ label: SENS_LABEL[p], v: sens[p][k] }))
      .filter((q) => isFinite(q.v)).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    plots.sens.o.xlabel = 'Elasticity of ' + SENS_OUT[k].toLowerCase();
    plots.sens.setData(items);
  }
  function initWorker() {
    if (new URLSearchParams(location.search).has('noworker')) return;   // debug: compute maps on the main thread
    try {
      worker = new Worker('js/worker.js');
      worker.onmessage = (e) => onMap(e.data);
      worker.onerror = (e) => { e.preventDefault && e.preventDefault(); worker = null; runMaps(); };
    } catch (e) { worker = null; }
  }
  function runMaps() {
    const N0 = +params.N, n0 = +params.n;
    const job = {
      id: ++mapId, p: Object.assign({}, params), nx: 44, ny: 30,
      Nlo: Math.max(30, N0 / 4), Nhi: Math.min(30000, N0 * 4),
      nlo: Math.max(1.4, Math.min(2.5, n0 - 0.4)), nhi: Math.max(8, n0 + 0.4),
    };
    if (worker) worker.postMessage(job);
    else setTimeout(() => { if (job.id === mapId) onMap(Object.assign({ id: job.id }, E.designMap(job.p, job.nx, job.ny, job.Nlo, job.Nhi, job.nlo, job.nhi))); }, 30);
  }
  function onMap(d) {
    if (d.id !== mapId || !R) return;
    // reference = map value interpolated at the design point (same resolution as the map)
    const fx = Math.log(params.N / d.Nlo) / Math.log(d.Nhi / d.Nlo) * (d.nx - 1), fy = (params.n - d.nlo) / (d.nhi - d.nlo) * (d.ny - 1);
    const i = clamp(Math.round(fx), 0, d.nx - 1), j = clamp(Math.round(fy), 0, d.ny - 1);
    const ref = d.pinMax[j * d.nx + i] || R.summary.pinMax;
    const zB = new Float32Array(d.pinMax.length);
    for (let q = 0; q < zB.length; q++) zB[q] = (d.pinMax[q] / ref - 1) * 100;
    const box = { nx: d.nx, ny: d.ny, x0: d.Nlo, x1: d.Nhi, y0: d.nlo, y1: d.nhi };
    const mk = { x: +params.N, y: +params.n };
    plots.mapA.setData(Object.assign({ z: d.mrim }, box), mk);
    plots.mapB.setData(Object.assign({ z: zB }, box), mk);
  }
  function mapPick(N, n) {
    params.N = roundSig(N, 3);
    params.n = Math.round(n * 20) / 20;
    syncControl('N'); syncControl('n');
    schedule(); scheduleQuery();
    toast('Design moved to N = ' + params.N + ' rpm, n = ' + params.n.toFixed(2));
  }

  /* ================================================================ compute */
  let pend = false;
  function schedule() {
    if (pend) return;
    pend = true;
    requestAnimationFrame(() => { pend = false; compute(); });
  }
  let mech = null, pipMech = null;
  function compute() {
    const t0 = performance.now();
    R = E.solve(params);
    R.checks = E.selfChecks(R);
    const t1 = performance.now();
    const s = R.summary;
    let fs = 0;
    for (let i = 0; i < s.M; i++) fs = Math.max(fs, Math.abs(R.Fp[i]), Math.abs(R.Fn[i]), Math.abs(R.Ft[i]), Math.abs(R.Fr[i]));
    R.Fscale = fs;
    let pmin = Infinity; for (let i = 0; i < s.M; i++) pmin = Math.min(pmin, R.P[i]);
    R.pmin = pmin;
    mech.setGeometry(R.c, params);
    pipMech.setGeometry(R.c, params);
    renderKPIs(); renderDataLine(); renderResults(); renderPlots(); renderVerification();
    scheduleSlow();
    updateSpeedLabel();
    $('#perf').textContent = 'Full cycle solved in ' + (t1 - t0).toFixed(1) + ' ms (' + s.M + ' crank positions, exact Newton–Euler).';
    lastI = -1;
    renderFrame();
  }

  /* ================================================================ animation */
  const strokeOf = (psi) => (psi < 180 ? 'Suction stroke' : psi < 360 ? 'Compression stroke' : psi < 540 ? 'Power stroke' : 'Exhaust stroke');
  const INST = [
    ['\\theta', 'th', '°'], ['x', 'x', 'mm'], ['v', 'v', 'm/s'], ['a', 'a', 'm/s²'], ['\\varphi', 'phi', '°'], ['\\omega_c', 'omc', 'rad/s'],
    ['\\alpha_c', 'alc', 'rad/s²'], ['p', 'p', 'bar'], ['F_g', 'Fg', 'kN'], ['F_I', 'Fi', 'kN'], ['F_P', 'Fp', 'kN'], ['F_Q', 'Fq', 'kN'],
    ['F_N', 'Fn', 'kN'], ['F_T', 'Ft', 'kN'], ['F_R', 'Fr', 'kN'], ['T', 'T', 'N·m'], ['E', 'E', 'J'], ['N_{fw}', 'Nf', 'rpm'],
  ];
  const instRefs = {};
  function buildInst() {
    const host = $('#inst');
    for (const [t, k, u] of INST) {
      const sym = h('span', { class: 's' }); sym.innerHTML = tex(t);
      const v = h('span');
      host.append(h('div', { class: 'it' }, sym, h('span', { class: 'v' }, v, h('small', null, u))));
      instRefs[k] = v;
    }
  }
  const f4 = (v) => fmtVal(v, 4);
  function renderFrame() {
    if (!R) return;
    const s = R.summary, M = s.M, res = s.res;
    const i = curI();
    if (i === lastI) return;
    lastI = i;
    const psi = i * res, th = psi * D2R;
    let gas;
    if (params.model === 'none') gas = 'rgba(0,0,0,0.04)';
    else if (psi < 180) gas = 'rgba(31,119,180,0.10)';
    else if (psi >= 540) gas = 'rgba(110,110,110,0.17)';
    else { const t = (R.P[i] - R.pmin) / ((s.pmax - R.pmin) || 1); gas = 'rgba(163,20,42,' + (0.06 + 0.55 * Math.sqrt(Math.max(0, t))).toFixed(3) + ')'; }
    const st = { th, gasColor: gas, cbal: +params.cbal, showForces, Fscale: R.Fscale, F: { Fp: R.Fp[i], Fn: R.Fn[i], Ft: R.Ft[i], Fr: R.Fr[i] } };
    mech.update(st);
    if (pipOn) pipMech.update(st);
    for (const p of cursorPlots) p.setCursor(i);
    const V = instRefs;
    const fx = (v, d) => v.toFixed(d).replace('-', '−');
    V.th.textContent = fx(psi % 360, 1);
    V.x.textContent = fx(R.x[i] * 1e3, 2);
    V.v.textContent = f4(R.v[i]); V.a.textContent = f4(R.a[i]);
    V.phi.textContent = fx(R.phi[i] / D2R, 2);
    V.omc.textContent = f4(R.omc[i]); V.alc.textContent = f4(R.alc[i]);
    V.p.textContent = fx(R.pBar[i], 2);
    V.Fg.textContent = f4(R.Fg[i] / 1e3); V.Fi.textContent = f4(R.Fi[i] / 1e3); V.Fp.textContent = f4(R.Fp[i] / 1e3);
    V.Fq.textContent = f4(R.Fq[i] / 1e3); V.Fn.textContent = f4(R.Fn[i] / 1e3); V.Ft.textContent = f4(R.Ft[i] / 1e3); V.Fr.textContent = f4(R.Fr[i] / 1e3);
    V.T.textContent = f4(R.T[i]); V.E.textContent = f4(R.E[i]); V.Nf.textContent = R.Nfly[i].toFixed(1);
    $('#scrub').value = psi;
    $('#scrubVal').textContent = psi.toFixed(1) + '°';
    $('#strokeName').textContent = strokeOf(psi);
    $('#psiLabel').innerHTML = richHTML('$ψ$') + ' = ' + psi.toFixed(1) + '°, ' + richHTML('$θ$') + ' = ' + (psi % 360).toFixed(1) + '°';
    $('#pipLabel').textContent = strokeOf(psi).replace(' stroke', '') + ' · ψ ' + psi.toFixed(0) + '°';
  }
  function setPsi(d) { psiDeg = ((d % 720) + 720) % 720; lastI = -1; renderFrame(); }
  function pick(gi) { setPlaying(false); setPsi(gi * RES()); }
  function setPlaying(on) {
    playing = on;
    for (const b of [$('#btnPlay'), $('#pipPlay')]) {
      b.firstElementChild.className = on ? 'ic-pause' : 'ic-play';
      b.setAttribute('aria-label', on ? 'Pause animation' : 'Play animation');
    }
  }
  function updateSpeedLabel() {
    $('#speedVal').textContent = rps.toFixed(2) + ' rev/s';
    const real = params.N / 60;
    $('#slowmo').textContent = real > rps ? 'slow motion: real engine is ' + fmtVal(real / rps, 3) + '× faster' : '';
  }
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (playing && !document.hidden) psiDeg = (psiDeg + dt * rps * 360) % 720;
    renderFrame();
    requestAnimationFrame(loop);
  }

  /* ================================================================ chrome: dots, pip, panel, buttons */
  let pipOn = false;
  function initChrome() {
    const dots = $('#dots');
    const sheets = [...document.querySelectorAll('.sheet')];
    const links = sheets.map((s) => { const a = h('a', { href: '#' + s.id, 'data-label': s.dataset.title, 'aria-label': s.dataset.title }); dots.append(a); return a; });
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) links.forEach((a, k) => a.classList.toggle('active', sheets[k] === e.target));
    }, { rootMargin: '-45% 0px -50% 0px' });
    sheets.forEach((s) => io.observe(s));
    // picture-in-picture mechanism when the main drawing is off screen
    const pip = $('#pip');
    let pipClosed = false;
    const setPip = (on) => {
      pipOn = on && !pipClosed;
      pip.classList.toggle('show', pipOn);
      pip.setAttribute('aria-hidden', String(!pipOn));
      lastI = -1;
    };
    // show only once the reader has scrolled past the main drawing
    new IntersectionObserver((es) => {
      const e = es[es.length - 1];
      setPip(!e.isIntersecting && e.boundingClientRect.top < 0);
    }, { threshold: 0.12 }).observe($('#mechHost'));
    $('#pipClose').addEventListener('click', () => { pipClosed = true; setPip(false); });

    $('#btnPlay').addEventListener('click', () => setPlaying(!playing));
    $('#pipPlay').addEventListener('click', () => setPlaying(!playing));
    $('#scrub').addEventListener('input', (e) => { setPlaying(false); setPsi(+e.target.value); });
    const sp = $('#speed');
    const spFrom = (t) => 0.05 * Math.pow(60, t / 1000);
    sp.value = Math.round(1000 * Math.log(rps / 0.05) / Math.log(60));
    sp.addEventListener('input', () => { rps = spFrom(+sp.value); updateSpeedLabel(); });
    $('#chkForces').addEventListener('change', (e) => { showForces = e.target.checked; lastI = -1; renderFrame(); });

    $('#btnBaseline').addEventListener('click', () => {
      const b = $('#btnBaseline');
      if (base) { base = null; b.textContent = 'Pin baseline'; b.classList.remove('on'); toast('Baseline cleared'); }
      else { base = R; b.textContent = 'Clear baseline'; b.classList.add('on'); toast('Baseline pinned. Change any parameter to compare'); }
      renderKPIs(); renderPlots();
    });
    $('#btnShare').addEventListener('click', async () => {
      const url = location.origin + location.pathname + '?' + queryString();
      try {
        if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: document.title, url }); return; }
        await navigator.clipboard.writeText(url);
        toast('Link copied. It opens this exact configuration');
      } catch (e) { prompt('Copy this link:', url); }
    });
    $('#btnCSV').addEventListener('click', downloadCSV);
    $('#btnPrint').addEventListener('click', () => window.print());
    window.addEventListener('beforeprint', () => allPlots.forEach((p) => { p.visible = true; p.draw(); }));

    const panel = $('#panel');
    const openP = (on) => { panel.classList.toggle('open', on); document.body.classList.toggle('panel-open', on); };
    $('#fab').addEventListener('click', () => openP(true));
    $('#panelClose').addEventListener('click', () => openP(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') openP(false);
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.target.isContentEditable) return;
      if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault(); setPlaying(false);
        setPsi(psiDeg + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1));
      }
    });
  }

  function downloadCSV() {
    const s = R.summary, M = s.M;
    const cols = [
      ['psi_deg', (i) => i * s.res], ['theta_deg', (i) => (i * s.res) % 360], ['x_mm', (i) => R.x[i] * 1e3], ['v_m_s', R.v], ['a_m_s2', R.a],
      ['phi_deg', (i) => R.phi[i] / D2R], ['omega_rod_rad_s', R.omc], ['alpha_rod_rad_s2', R.alc], ['p_bar', R.pBar], ['V_cm3', (i) => R.V[i] * 1e6],
      ['F_gas_N', R.Fg], ['F_inertia_N', R.Fi], ['F_piston_effort_N', R.Fp], ['F_rod_thrust_N', R.Fq], ['F_side_thrust_N', R.Fn],
      ['F_tangential_N', R.Ft], ['F_radial_N', R.Fr], ['crank_pin_load_N', R.pin], ['gudgeon_pin_load_N', R.gud],
      ['T_Nm', R.T], ['T_gas_Nm', R.Tg], ['T_inertia_Nm', R.Tin], ['E_J', R.E], ['N_flywheel_rpm', R.Nfly], ['shaking_x_N', R.shx], ['shaking_y_N', R.shy],
    ];
    const lines = ['# Slider-Crank Dynamics Lab - one four-stroke cycle', '# ' + SPEC.map((q) => q.k + '=' + params[q.k]).join(', '), cols.map((c) => c[0]).join(',')];
    for (let i = 0; i < M; i++) lines.push(cols.map((c) => { const v = typeof c[1] === 'function' ? c[1](i) : c[1][i]; return +v.toPrecision(8); }).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'slider-crank-cycle.csv' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function renderStaticTeX() {
    document.querySelectorAll('[data-tex]').forEach((el) => {
      const t = el.getAttribute('data-tex');
      if (window.katex) {
        try { katex.render(texFix(t), el, { displayMode: el.classList.contains('eq'), throwOnError: false }); } catch (e) { el.textContent = t; }
      } else el.textContent = t;
    });
  }

  /* ================================================================ boot */
  function boot() {
    readQuery();
    renderStaticTeX();
    buildControls();
    buildKPIs();
    buildInst();
    createPlots();
    mech = new window.Mechanism($('#mechHost'));
    pipMech = new window.Mechanism($('#pipHost'), { mini: true });
    initChrome();
    initWorker();
    setPlaying(playing);
    compute();
    requestAnimationFrame(loop);
    if (document.fonts && document.fonts.load) {
      Promise.all(['16px KaTeX_Main', 'italic 16px KaTeX_Math'].map((f) => document.fonts.load(f).catch(() => null)))
        .then(() => { for (const p of allPlots) p.draw(); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
