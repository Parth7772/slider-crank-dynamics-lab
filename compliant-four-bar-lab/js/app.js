/*!
 * app.js — dashboard wiring: inputs → Engine.solve → results, plots, animation.
 */
(function () {
  'use strict';
  const E = window.Engine;
  const { Plot, HeatMap, Bars, COL, fmtVal, richHTML } = window.Plotter;
  const $ = (s) => document.querySelector(s);
  const D2R = Math.PI / 180;
  const MINUS = '\u2212';

  /* ================================================================ inputs */
  const GROUPS = [
    { g: 'Linkage geometry', open: true },
    { g: 'Flexure hinges', open: true },
    { g: 'Drive & damping', open: true },
    { g: 'Links & payload', open: true },
  ];
  const MAT_OPTS = Object.keys(E.MATERIALS).map((k) => [k, E.MATERIALS[k].label]);
  const SPEC = [
    { g: 'Linkage geometry', k: 'r1', tex: 'r_1', name: 'Frame link O₂O₄', unit: 'mm', min: 30, max: 300, log: true, sig: 3, hard: [5, 2000] },
    { g: 'Linkage geometry', k: 'r2', tex: 'r_2', name: 'Input link O₂A', unit: 'mm', min: 10, max: 200, log: true, sig: 3, hard: [2, 2000] },
    { g: 'Linkage geometry', k: 'r3', tex: 'r_3', name: 'Coupler AB', unit: 'mm', min: 20, max: 300, log: true, sig: 3, hard: [2, 2000] },
    { g: 'Linkage geometry', k: 'r4', tex: 'r_4', name: 'Output link O₄B', unit: 'mm', min: 10, max: 250, log: true, sig: 3, hard: [2, 2000] },
    { g: 'Linkage geometry', k: 'th0', tex: '\\theta_{2,0}', name: 'As-made (unstressed) input angle', unit: '°', min: 10, max: 170, step: 0.5, dp: 1, hard: [1, 179] },
    { g: 'Linkage geometry', k: 'asm', tex: '\\text{mode}', name: 'Assembly mode', type: 'select', options: [['open', 'Open (B on the upper branch)'], ['crossed', 'Crossed (B on the lower branch)']] },
    { g: 'Flexure hinges', k: 'mat', tex: 'E', name: 'Material (one-piece mechanism)', type: 'select', options: MAT_OPTS },
    { g: 'Flexure hinges', k: 'flex', tex: '\\text{joints}', name: 'Which joints are flexures', type: 'select', options: [['all', 'All four joints (fully compliant)'], ['ground', 'Frame joints O₂, O₄ only (pins at A, B)']] },
    { g: 'Flexure hinges', k: 'lh', tex: 'l', name: 'Hinge length', unit: 'mm', min: 1, max: 40, log: true, sig: 3, hard: [0.2, 200] },
    { g: 'Flexure hinges', k: 't', tex: 't', name: 'Hinge thickness', unit: 'mm', min: 0.1, max: 3, log: true, sig: 3, hard: [0.02, 20] },
    { g: 'Flexure hinges', k: 'b', tex: 'b', name: 'Out-of-plane width (hinges and links)', unit: 'mm', min: 2, max: 40, log: true, sig: 3, hard: [0.5, 200] },
    { g: 'Drive & damping', k: 'amp', tex: '\\Theta', name: 'Drive amplitude (input swing ±)', unit: '°', min: 0.5, max: 30, step: 0.1, dp: 1, hard: [0.05, 60] },
    { g: 'Drive & damping', k: 'f', tex: 'f', name: 'Drive frequency', unit: 'Hz', min: 0.2, max: 200, log: true, sig: 3, hard: [0.01, 2000] },
    { g: 'Drive & damping', k: 'bias', tex: '\\delta', name: 'Swing centre offset from as-made angle', unit: '°', min: -20, max: 20, step: 0.5, dp: 1, hard: [-60, 60] },
    { g: 'Drive & damping', k: 'zeta', tex: '\\zeta', name: 'Damping ratio of the flexures', unit: '%', min: 0.1, max: 20, log: true, sig: 2, hard: [0.01, 60] },
    { g: 'Links & payload', k: 'w', tex: 'w', name: 'Link width (sets link mass)', unit: 'mm', min: 2, max: 30, log: true, sig: 3, hard: [0.5, 200] },
    { g: 'Links & payload', k: 'mp', tex: 'm_p', name: 'Payload mass at P', unit: 'g', min: 1, max: 2000, log: true, sig: 3, hard: [0, 1e5] },
    { g: 'Links & payload', k: 'pc', tex: 'u_P/r_3', name: 'Payload position along AB', unit: '', min: 0, max: 1, step: 0.01, dp: 2, hard: [-1, 2] },
    { g: 'Links & payload', k: 'po', tex: 'v_P', name: 'Payload offset square to AB', unit: 'mm', min: -80, max: 80, step: 1, dp: 0, hard: [-500, 500] },
  ];
  const TIPS = {
    r1: 'Distance between the two frame pivots O₂ and O₄.',
    r2: 'Length of the input link driven by the motor.',
    r3: 'Length of the coupler that carries the payload.',
    r4: 'Length of the output link.',
    th0: 'Input angle at which the mechanism is made: all flexures are straight and unstressed here.',
    asm: 'A four-bar can be assembled in two ways for the same input angle.',
    mat: 'Material of the one-piece mechanism: sets E, density and fatigue strength.',
    flex: 'Fully compliant (four flexures) or partially compliant (flexures at the frame, pins at A and B).',
    lh: 'Length of each flexure hinge. Longer = softer and lower stress.',
    t: 'Thickness of each flexure. Stiffness grows with t³, stress with t.',
    b: 'Width of the mechanism out of the plane (same for hinges and links).',
    amp: 'Half the swing of the input link imposed by the motor.',
    f: 'Number of swings per second.',
    bias: 'Shifts the middle of the swing away from the as-made angle (adds a mean stress).',
    zeta: 'Energy lost in the flexure material, as a fraction of critical damping.',
    w: 'In-plane width of the links; with b and density it sets the link masses.',
    mp: 'Mass carried at point P of the coupler (tool, gripper, part).',
    pc: 'Where P lies along the coupler, from A (0) to B (1).',
    po: 'Offset of P square to the coupler line (positive to the left of A→B).',
  };
  for (const s of SPEC) s.tip = TIPS[s.k];
  const SPEC_BY = Object.fromEntries(SPEC.map((s) => [s.k, s]));

  const PRESETS = {
    pusher: { label: 'Packaging-machine pusher, spring-steel flexures', v: { r1: 180, r2: 60, r3: 165, r4: 120, th0: 70, asm: 'open', mat: 'steel', flex: 'all', lh: 12, t: 0.25, b: 12, w: 12, mp: 150, pc: 0.5, po: 35, zeta: 1, amp: 6, bias: 0, f: 4 } },
    parallel: { label: 'Parallel-guiding stage, aluminium flexures', v: { r1: 80, r2: 50, r3: 80, r4: 50, th0: 90, asm: 'open', mat: 'al', flex: 'all', lh: 8, t: 0.3, b: 10, w: 10, mp: 100, pc: 0.5, po: 0, zeta: 1, amp: 4, bias: 0, f: 8 } },
    pla: { label: '3D-printed PLA demonstrator', v: { r1: 150, r2: 55, r3: 135, r4: 105, th0: 60, asm: 'open', mat: 'pla', flex: 'all', lh: 11, t: 0.55, b: 8, w: 8, mp: 25, pc: 0.5, po: 25, zeta: 3, amp: 5, bias: 0, f: 6 } },
    pp: { label: 'Moulded polypropylene living hinges', v: { r1: 80, r2: 30, r3: 70, r4: 55, th0: 75, asm: 'open', mat: 'pp', flex: 'all', lh: 5, t: 0.5, b: 10, w: 8, mp: 15, pc: 0.5, po: 15, zeta: 4, amp: 6, bias: 0, f: 12.5 } },
    ti: { label: 'Titanium crank–rocker, flexures at the frame only', v: { r1: 150, r2: 50, r3: 140, r4: 100, th0: 80, asm: 'open', mat: 'ti', flex: 'ground', lh: 10, t: 0.3, b: 10, w: 8, mp: 40, pc: 0.6, po: 30, zeta: 1.5, amp: 10, bias: 0, f: 5.9 } },
  };

  const SENS_LABEL = {
    r2: 'Input link $r_2$', r3: 'Coupler $r_3$', r4: 'Output link $r_4$', lh: 'Hinge length $l$', t: 'Hinge thickness $t$', b: 'Width $b$',
    w: 'Link width $w$', mp: 'Payload $m_p$', zeta: 'Damping $ζ$', amp: 'Amplitude $Θ$', f: 'Drive frequency $f$',
  };
  const SENS_OUT = {
    Trms: 'RMS motor torque', Tmax: 'Peak motor torque', fn: 'Natural frequency', Pavg: 'Average motor power', sigMax: 'Peak hinge stress', nf: 'Fatigue safety factor',
  };

  /* ================================================================ state */
  let presetKey = 'pusher';
  let params = Object.assign({}, PRESETS.pusher.v);
  let R = null, base = null, sens = null;
  let phiDeg = 30;
  let wsPhi = 60;
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cps = 0.35;                         // animation speed, drive cycles per second
  let showTorque = true;
  let lastI = -1;
  let activeTab = 'solution';
  let checks = null;
  const ctl = {};
  const plots = {};
  const cursorPlots = [];
  const allPlots = [];
  const mqNarrow = matchMedia('(max-width: 1060px)');

  /* ================================================================ helpers */
  const texFix = (s) => s.replace(/_\{([^{}]*)\}/g, (m, g) => '_{' + g.replace(/(^|[^\\A-Za-z])([A-Za-z]{2,})/g, (q, a, w) => a + '\\mathrm{' + w + '}') + '}');
  const tex = (s, display) => (window.katex ? katex.renderToString(texFix(s), { throwOnError: false, displayMode: !!display }) : s);
  const UNSUP = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  const nf = (v, sig) => fmtVal(v, sig || 4).replace(/,/g, '{,}').replace(/\u2212/g, '-').replace(/×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (m, e) => '\\times10^{' + [...e].map((ch) => UNSUP[ch]).join('') + '}');
  const pn = (v, sig) => (v < 0 ? '(' + nf(v, sig) + ')' : nf(v, sig));
  const fx = (v, d) => v.toFixed(d).replace('-', MINUS);
  const unitFmt = (u, k) => (v) => fmtVal(v * (k || 1)) + (u ? '\u2009' + u : '');
  const scale = (a, k, off) => { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) o[i] = (a[i] + (off || 0)) * k; return o; };
  const roundSig = (v, n) => { if (v === 0) return 0; const m = Math.pow(10, n - 1 - Math.floor(Math.log10(Math.abs(v)))); return Math.round(v * m) / m; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rh = richHTML;
  const deg = (v) => v / D2R;
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]); }
    for (const c of kids) e.append(c);
    return e;
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2400);
  }
  const HN = (j) => E.HINGE[j];
  const HR = ['$O_2$', '$A$', '$B$', '$O_4$'];          // rich-text joint names

  /* ================================================================ URL state */
  function readQuery() {
    const q = new URLSearchParams(location.search);
    if (q.has('preset') && PRESETS[q.get('preset')]) { presetKey = q.get('preset'); params = Object.assign({}, PRESETS[presetKey].v); }
    for (const s of SPEC) {
      if (!q.has(s.k)) continue;
      const raw = q.get(s.k);
      if (s.type === 'select') { const opt = s.options.find((o) => String(o[0]) === raw); if (opt) params[s.k] = opt[0]; }
      else { const v = parseFloat(raw); if (isFinite(v)) params[s.k] = clamp(v, s.hard ? s.hard[0] : s.min, s.hard ? s.hard[1] : s.max); }
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
    GROUPS.forEach((G, gi) => {
      const det = h('details', { class: 'grp', open: G.open && (!mqNarrow.matches || gi < 2) }, h('summary', null, G.g));
      for (const s of SPEC.filter((q) => q.g === G.g)) det.append(buildRow(s));
      host.append(det);
    });
    const sel = $('#preset');
    for (const k in PRESETS) sel.append(h('option', { value: k }, PRESETS[k].label));
    sel.value = presetKey;
    sel.addEventListener('change', () => applyPreset(sel.value));
    $('#btnReset').addEventListener('click', () => applyPreset(presetKey));
    $('#qaOpt').addEventListener('click', () => { if (!R) return; setParam('f', roundSig(R.summary.fOpt, 3)); toast('Drive frequency set to the best value, f* = ' + roundSig(R.summary.fOpt, 3) + ' Hz'); });
    $('#qaFn').addEventListener('click', () => { if (!R) return; setParam('f', roundSig(R.c.fn, 3)); toast('Drive frequency set to the natural frequency, ' + roundSig(R.c.fn, 3) + ' Hz'); });
    for (const s of SPEC) syncControl(s.k);
  }
  function buildRow(s) {
    const sym = h('span', { class: 'ctl-sym' });
    sym.innerHTML = tex(s.tex);
    const row = h('div', { class: 'ctl', 'data-k': s.k });
    const head = h('div', { class: 'ctl-head' }, sym, h('span', { class: 'ctl-name', title: s.tip || null }, s.name));
    if (s.type === 'select') {
      const sel = h('select', { id: 'in-' + s.k, 'aria-label': s.name });
      for (const [v, lab] of s.options) sel.append(h('option', { value: String(v) }, lab));
      sel.addEventListener('change', () => setParam(s.k, sel.value));
      row.append(head, sel);
      ctl[s.k] = { sel, row };
      return row;
    }
    const num = h('input', { id: 'in-' + s.k, type: 'number', step: 'any', inputmode: 'decimal', 'aria-label': s.name + (s.unit ? ' in ' + s.unit : '') });
    head.append(num, h('span', { class: 'ctl-unit' }, s.unit || ''));
    const rng = h('input', { id: 'rng-' + s.k, type: 'range', 'aria-label': s.name + ' slider' });
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
  function setParam(k, v, src) {
    params[k] = v;
    syncControl(k, src);
    schedule();
    scheduleQuery();
  }
  function applyPreset(k) {
    presetKey = k;
    params = Object.assign({}, PRESETS[k].v);
    $('#preset').value = k;
    for (const s of SPEC) syncControl(s.k);
    schedule();
    scheduleQuery();
  }
  function placePanel() {
    const panel = $('#panel');
    if (mqNarrow.matches) { if (panel.parentElement !== $('#panelSlot')) $('#panelSlot').append(panel); }
    else if (panel.parentElement !== $('#layout')) $('#layout').prepend(panel);
  }

  /* ================================================================ tabs */
  function initTabs() {
    const bar = $('#tabs');
    const pages = [...document.querySelectorAll('.tab-page')];
    for (const p of pages) {
      const b = h('button', { class: 'tab', role: 'tab', id: 'tab-' + p.id, 'aria-controls': p.id, 'aria-selected': 'false' });
      b.innerHTML = p.dataset.tab;
      b.addEventListener('click', () => showTab(p.id, true));
      bar.append(b);
      p.setAttribute('aria-labelledby', 'tab-' + p.id);
    }
    bar.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const ids = pages.map((p) => p.id), k = ids.indexOf(activeTab);
      const nx = ids[(k + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
      showTab(nx, false); $('#tab-' + nx).focus();
    });
    const fromHash = location.hash.slice(1);
    if (fromHash) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* file:// */ } }
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    showTab(pages.some((p) => p.id === fromHash) ? fromHash : activeTab, false);
    window.scrollTo(0, 0);
    window.addEventListener('hashchange', () => { const id = location.hash.slice(1); const el = document.getElementById(id); if (el && el.classList.contains('tab-page')) showTab(id, true); });
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href').slice(1);
      const el = id && document.getElementById(id);
      if (el && el.classList.contains('tab-page')) { e.preventDefault(); showTab(id, true); }
    });
  }
  function showTab(id, scroll) {
    activeTab = id;
    for (const p of document.querySelectorAll('.tab-page')) p.hidden = p.id !== id;
    for (const b of document.querySelectorAll('.tab')) {
      const on = b.getAttribute('aria-controls') === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on) {
        const bar = b.parentElement, l = b.offsetLeft, r = l + b.offsetWidth;
        if (l < bar.scrollLeft) bar.scrollLeft = l - 8;
        else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth + 8;
      }
    }
    if (scroll) {
      const bar = $('#tabs');
      const top = bar.getBoundingClientRect().top + window.scrollY - 58;
      if (window.scrollY > top) window.scrollTo({ top, behavior: 'auto' });
    }
    lastI = -1;
    if (R && dirtyTabs.has(id)) renderTab(id);
  }

  /* ================================================================ plots */
  const N_ = () => (R ? R.N : 720);
  const curI = () => ((Math.round(phiDeg / 360 * N_()) % N_()) + N_()) % N_();
  const tipPhi = (i) => rh('$φ$') + ' = ' + (i * 360 / N_()).toFixed(1) + '°&ensp;' + rh('$θ_2$') + ' = ' + (R ? deg(R.th2[i]).toFixed(2) : '') + '°';
  function reg(p, cursor) { allPlots.push(p); if (cursor) cursorPlots.push(p); return p; }
  function phasePlot(id, o) {
    return reg(new Plot($('#' + id), Object.assign({ xlim: [0, 360], xticks: [0, 90, 180, 270, 360], xlabel: 'Drive phase $φ$ [deg]', tipTitle: tipPhi, onPick: pick }, o)), true);
  }
  function xyPlot(id, o, cursor) {
    return reg(new Plot($('#' + id), Object.assign({ cursor: 'point', tipTitle: tipPhi, onPick: pick }, o)), cursor !== false);
  }
  // static-range plots (against θ2): the cursor follows the current input angle
  let SR = null;
  const srMap = { mapIndex: (gi) => (SR && R ? clamp(Math.round((deg(R.th2[gi]) - SR.th[0]) / ((SR.th[SR.th.length - 1] - SR.th[0]) / (SR.th.length - 1))), 0, SR.th.length - 1) : 0) };
  function statPlot(id, o) {
    return reg(new Plot($('#' + id), Object.assign({ xlabel: 'Input angle $θ_2$ [deg]', tipTitle: (i) => rh('$θ_2$') + ' = ' + (SR ? SR.th[i].toFixed(2) : '') + '°' }, srMap, o)), true);
  }
  function plainPlot(id, o) { return reg(new Plot($('#' + id), Object.assign({ cursor: 'vline' }, o)), false); }

  function createPlots() {
    plots.ang = phasePlot('figAng', { h: 260, ylabel: 'Angle [deg]', legend: 'ur' });
    plots.path = xyPlot('figPath', { h: 260, equal: true, xlabel: '$x_P$ [mm]', ylabel: '$y_P$ [mm]', legend: null });
    plots.w = phasePlot('figW', { h: 240, ylabel: 'Angular velocity [rad/s]', legend: 'ur', xticks: [0, 90, 180, 270, 360] });
    plots.al = phasePlot('figAl', { h: 240, ylabel: 'Angular accel. [rad/s²]', legend: 'ur', xticks: [0, 90, 180, 270, 360] });
    plots.mu = phasePlot('figMu', { h: 220, ylabel: '$μ$ [deg]', legend: null, padTop: 0.14 });
    plots.V = statPlot('figV', { h: 240, ylabel: '$V$ [mJ]', legend: null });
    plots.TK = statPlot('figTK', { h: 240, ylabel: 'Holding torque [N·mm]', legend: 'ul' });
    plots.psi = statPlot('figPsi', { h: 240, ylabel: 'Flexure rotation $ψ$ [deg]', legend: 'ul' });
    plots.keq = statPlot('figKeq', { h: 240, ylabel: 'Ratio to value at $θ_{2,0}$', legend: 'ur' });
    plots.T = phasePlot('figT', { h: 300, ylabel: 'Torque [N·mm]', legend: 'ur', legendCols: 2, padTop: 0.32 });
    plots.Tf = plainPlot('figTf', { h: 290, xlog: true, ylog: true, xlabel: 'Drive frequency $f$ [Hz]', ylabel: 'Motor torque [N·mm]', legend: 'br', tipTitle: (i) => rh('$f$') + ' = ' + (plots.Tf.series[0] ? fmtVal(plots.Tf.series[0].x[i], 4) : '') + ' Hz' });
    plots.E = phasePlot('figE', { h: 240, ylabel: 'Energy [mJ]', legend: 'ul', legendCols: 3, xticks: [0, 90, 180, 270, 360], padTop: 0.42 });
    plots.loop = xyPlot('figLoop', { h: 240, xlabel: 'Input angle $θ_2$ [deg]', ylabel: '$T$ [N·mm]', legend: 'ul' });
    plots.Pw = phasePlot('figPw', { h: 240, ylabel: 'Motor power [mW]', legend: 'ur' });
    plots.free = plainPlot('figFree', { h: 260, xlabel: 'Time $t$ [s]', ylabel: '$θ_2-θ_{2,0}$ [deg]', legend: 'ur', tipTitle: (i) => rh('$t$') + ' = ' + (plots.free.series[0] ? fmtVal(plots.free.series[0].x[i], 4) : '') + ' s' });
    plots.MF = plainPlot('figMF', { h: 240, xlabel: 'Frequency ratio $r$', ylabel: 'Magnification $Θ/Θ_{st}$', ylog: true, legend: null, tipTitle: (i) => rh('$r$') + ' = ' + (plots.MF.series[0] ? plots.MF.series[0].x[i].toFixed(3) : '') });
    plots.ph = plainPlot('figPh', { h: 240, xlabel: 'Frequency ratio $r$', ylabel: 'Phase lag [deg]', legend: null, tipTitle: (i) => rh('$r$') + ' = ' + (plots.ph.series[0] ? plots.ph.series[0].x[i].toFixed(3) : '') });
    plots.back = plainPlot('figBack', { h: 230, xlabel: 'Amplitude of free swing $a$ [deg]', ylabel: '$f(a)/f_n$', legend: null, tipTitle: (i) => rh('$a$') + ' = ' + (plots.back.series[0] ? plots.back.series[0].x[i].toFixed(2) : '') + '°' });
    plots.sig = phasePlot('figSig', { h: 270, ylabel: 'Surface stress [MPa]', legend: 'ur', legendCols: 2, padTop: 0.3 });
    plots.good = reg(new Plot($('#figGood'), { h: 270, cursor: 'point', xlabel: 'Mean stress $σ_m$ [MPa]', ylabel: 'Alternating stress $σ_a$ [MPa]', legend: 'ur', zero: false }), false);
    plots.F = phasePlot('figF', { h: 270, ylabel: 'Joint force [N]', legend: 'ur', xticks: [0, 90, 180, 270, 360], padTop: 0.3 });
    plots.shake = xyPlot('figShake', { h: 280, equal: true, xlabel: '$F_{s,x}$ [N]', ylabel: '$F_{s,y}$ [N]', legend: null });
    plots.ver = phasePlot('figVer', { h: 250, ylabel: 'Motor torque [N·mm]', legend: 'ur' });
    plots.sens = reg(new Bars($('#figSens'), { h: 330, xlabel: 'Elasticity  ∂ ln(result) / ∂ ln(parameter)' }), false);
    const tFmt = (v) => fmtVal(v, 3) + ' mm';
    plots.mapA = reg(new HeatMap($('#mapA'), {
      h: 300, cmap: 'deep', logc: true, xlabel: 'Hinge thickness $t$ [mm]', ylabel: 'Hinge length $l$ [mm]', clabel: 'Natural frequency $f_n$ [Hz]',
      tipLabel: '$f_n$', fmt: (v) => fmtVal(v, 3) + ' Hz', onPick: mapPick, xname: '$t$', yname: '$l$', xfmt: tFmt, yfmt: tFmt,
    }), false);
    plots.mapB = reg(new HeatMap($('#mapB'), {
      h: 300, cmap: 'redblue', diverging: true, logc: true, center: 1, xlabel: 'Hinge thickness $t$ [mm]', ylabel: 'Hinge length $l$ [mm]', clabel: 'Fatigue safety factor $n_f$',
      tipLabel: '$n_f$', fmt: (v) => fmtVal(v, 3), onPick: mapPick, xname: '$t$', yname: '$l$', xfmt: tFmt, yfmt: tFmt, keyLevels: [{ v: 1, color: '#111', lw: 2.2 }],
    }), false);
    const so = $('#sensOut');
    for (const k in SENS_OUT) so.append(h('option', { value: k }, SENS_OUT[k]));
    so.addEventListener('change', drawSens);
  }

  const HC = [COL.blue, COL.red, COL.green, COL.purple];          // hinge colours A, B, C, D
  function renderPlots() {
    const s = R.summary, c = R.c, phi = R.phi;
    const B = base && base.N === R.N ? base : null;
    const bl = (x, y, label) => (B ? { x, y, color: '#9a9a9a', lw: 1.3, dash: [5, 4], label: label || 'baseline', cursor: false } : null);
    const dg = (a) => scale(a, 1 / D2R);
    plots.ang.setData([
      { x: phi, y: dg(R.th2), color: COL.ink, label: '$θ_2$ input', fmt: unitFmt('°') },
      { x: phi, y: dg(R.th3), color: COL.teal, label: '$θ_3$ coupler', fmt: unitFmt('°') },
      { x: phi, y: dg(R.th4), color: COL.purple, label: '$θ_4$ output', fmt: unitFmt('°') },
    ]);
    plots.path.setData([
      { x: scale(R.Px, 1e3), y: scale(R.Py, 1e3), color: COL.accent, label: '$P$', fmt: (v, x) => '(' + fmtVal(x, 4) + ', ' + fmtVal(v, 4) + ') mm' },
      B && { x: scale(B.Px, 1e3), y: scale(B.Py, 1e3), color: '#9a9a9a', lw: 1.2, dash: [5, 4], cursor: false },
    ]);
    plots.w.setData([
      { x: phi, y: R.w2, color: COL.ink, label: '$ω_2$', fmt: unitFmt('rad/s') },
      { x: phi, y: R.w3, color: COL.teal, label: '$ω_3$', fmt: unitFmt('rad/s') },
      { x: phi, y: R.w4, color: COL.purple, label: '$ω_4$', fmt: unitFmt('rad/s') },
    ]);
    plots.al.setData([
      { x: phi, y: R.a2, color: COL.ink, label: '$α_2$', fmt: unitFmt('rad/s²') },
      { x: phi, y: R.al3, color: COL.teal, label: '$α_3$', fmt: unitFmt('rad/s²') },
      { x: phi, y: R.al4, color: COL.purple, label: '$α_4$', fmt: unitFmt('rad/s²') },
    ]);
    plots.mu.setData([{ x: phi, y: R.mu, color: COL.accent, label: '$μ$', fmt: unitFmt('°') }, bl(phi, B && B.mu)], {
      hlines: [{ y: 40, color: COL.red, dash: [4, 3], lw: 0.9, label: '40°', align: 'left' }, { y: 140, color: COL.red, dash: [4, 3], lw: 0.9, label: '140°', align: 'left' }],
    });
    const k3 = 1e3;
    plots.T.setData([
      { x: phi, y: scale(R.T, k3), color: COL.ink, lw: 2, label: 'motor $T$', fmt: unitFmt('N·mm') },
      { x: phi, y: scale(R.TI, k3), color: COL.blue, lw: 1.3, dash: [6, 3], label: 'inertia $T_I$ (= rigid linkage)', fmt: unitFmt('N·mm') },
      { x: phi, y: scale(R.TK, k3), color: COL.teal, lw: 1.3, dash: [2, 2], label: 'flexures $T_K$', fmt: unitFmt('N·mm') },
      { x: phi, y: scale(R.TD, k3), color: COL.purple, lw: 1.2, label: 'damping $T_D$', fmt: unitFmt('N·mm') },
      bl(phi, B && scale(B.T, k3), 'baseline $T$'),
    ]);
    const sc = E.freqScan(R, c.fn / 20, c.fn * 8, 220);
    plots.Tf.setData([
      { x: sc.f, y: scale(sc.rms, k3), color: COL.ink, lw: 1.9, label: 'compliant, RMS', fmt: unitFmt('N·mm') },
      { x: sc.f, y: scale(sc.pk, k3), color: COL.teal, lw: 1.4, label: 'compliant, peak', fmt: unitFmt('N·mm') },
      { x: sc.f, y: scale(sc.rmsR, k3), color: '#8a8a8a', lw: 1.3, dash: [6, 3], label: 'rigid, RMS', fmt: unitFmt('N·mm') },
      { x: sc.f, y: scale(sc.pkR, k3), color: '#b0b0b0', lw: 1.2, dash: [2, 2], label: 'rigid, peak', fmt: unitFmt('N·mm') },
    ], {
      vlines: [
        { x: c.fn, color: COL.purple, dash: [4, 3], label: '$f_n$ = ' + fmtVal(c.fn, 3) + ' Hz', dy: 0, align: c.f > c.fn ? 'right' : 'left' },
        { x: s.fOpt, color: COL.green, dash: [2, 2], label: '$f^*$ = ' + fmtVal(s.fOpt, 3) + ' Hz', dy: 16, align: c.f > c.fn ? 'right' : 'left' },
        { x: c.f, color: COL.red, dash: [], lw: 1.3, label: 'drive $f$ = ' + fmtVal(c.f, 3) + ' Hz', dy: 32, align: c.f > c.fn ? 'left' : 'right' },
      ],
    });
    const PE = R.V;
    const tot = new Float64Array(R.N + 1); for (let i = 0; i <= R.N; i++) tot[i] = (R.KE[i] + PE[i]) * 1e3;
    plots.E.setData([
      { x: phi, y: scale(R.KE, 1e3), color: COL.blue, label: 'kinetic $E_k$', fmt: unitFmt('mJ') },
      { x: phi, y: scale(PE, 1e3), color: COL.teal, label: 'elastic $V$', fmt: unitFmt('mJ') },
      { x: phi, y: tot, color: COL.ink, lw: 1.3, dash: [6, 3], label: 'sum', fmt: unitFmt('mJ') },
    ]);
    plots.loop.setData([
      { x: dg(R.th2), y: scale(R.T, k3), color: COL.ink, closed: true, label: 'compliant', fmt: (v, x) => fmtVal(v) + ' N·mm at ' + fmtVal(x) + '°' },
      { x: dg(R.th2), y: scale(R.TI, k3), color: '#8a8a8a', lw: 1.2, dash: [5, 3], closed: true, label: 'rigid', cursor: false },
    ]);
    plots.Pw.setData([
      { x: phi, y: scale(R.Pw, 1e3), color: COL.ink, label: 'compliant', fmt: unitFmt('mW') },
      { x: phi, y: scale(R.PwR, 1e3), color: '#8a8a8a', lw: 1.3, dash: [6, 3], label: 'rigid', fmt: unitFmt('mW') },
      bl(phi, B && scale(B.Pw, 1e3)),
    ]);
    const sigS = [];
    for (let j = 0; j < 4; j++) if (c.Kj[j]) sigS.push({ x: phi, y: scale(R.sig[j], 1e-6), color: HC[j], label: 'flexure at ' + HR[j], fmt: unitFmt('MPa') });
    plots.sig.setData(sigS, { hlines: [{ y: c.Se / 1e6, color: COL.red, dash: [5, 3], lw: 1, label: '$S_e$ = ' + fmtVal(c.Se / 1e6, 3) + ' MPa', align: 'left' }] });
    plots.F.setData([0, 1, 2, 3].map((j) => ({ x: phi, y: R.Fj[j], color: HC[j], label: 'joint ' + HR[j] + (c.Kj[j] ? '' : ' (pin)'), fmt: unitFmt('N') })));
    plots.shake.setData([
      { x: R.Fsx, y: R.Fsy, color: COL.ink, closed: true, label: '$F_s$', fmt: (v, x) => '(' + fmtVal(x, 3) + ', ' + fmtVal(v, 3) + ') N' },
      B && { x: B.Fsx, y: B.Fsy, color: '#9a9a9a', lw: 1.2, dash: [5, 4], closed: true, cursor: false },
    ], { marks: [{ x: 0, y: 0, r: 2.5, color: '#111' }] });
    plots.ver.setData([
      { x: phi, y: scale(R.T, k3), color: COL.ink, lw: 2.4, alpha: 0.35, label: 'Lagrange', fmt: unitFmt('N·mm') },
      { x: phi, y: scale(R.Tne, k3), color: COL.red, lw: 1.3, dash: [6, 3], label: 'Newton–Euler', fmt: unitFmt('N·mm') },
    ]);
    // Goodman diagram
    const Sut = c.Sut / 1e6, Se = c.Se / 1e6, Sy = c.Sy / 1e6;
    const marks = [];
    s.hinges.forEach((hh, j) => { if (hh.flex) marks.push({ x: hh.sm / 1e6, y: hh.sa / 1e6, color: HC[j], r: 4.5, label: E.HINGE[j], dx: 8, dy: -5 }); });
    plots.good.setData([
      { x: [0, Sut], y: [Se, 0], color: COL.red, label: 'Goodman line', cursor: false },
      { x: [0, Sy], y: [Sy, 0], color: '#8a8a8a', dash: [5, 3], lw: 1.2, label: 'yield line', cursor: false },
    ], { marks, xlim: [0, Sut * 1.04], ylim: [0, Math.max(Se, Sy) * 1.08] });
  }

  /* ================================================================ static characteristic (Flexure stiffness tab) */
  function renderStiffness() {
    const c = R.c;
    SR = E.staticRange(c, Math.max(4 * c.Th, 30 * D2R));
    const th = SR.th, lo = deg(c.thc - c.Th), hi = deg(c.thc + c.Th);
    const band = [{ x0: lo, x1: hi, fill: 'rgba(14,111,124,0.08)', label: 'drive swing' }];
    const xl = [th[0], th[th.length - 1]];
    const lin = new Float64Array(th.length);
    for (let q = 0; q < th.length; q++) lin[q] = c.Keq0 * (th[q] - deg(c.th0)) * D2R * 1e3;
    plots.V.setData([{ x: th, y: scale(SR.V, 1e3), color: COL.teal, label: '$V$', fmt: unitFmt('mJ') }], { bands: band, xlim: xl });
    plots.TK.setData([
      { x: th, y: scale(SR.Vp, 1e3), color: COL.ink, label: 'exact $dV/dθ_2$', fmt: unitFmt('N·mm') },
      { x: th, y: lin, color: COL.purple, lw: 1.2, dash: [6, 3], label: 'linear $K_{eq}Δθ_2$', fmt: unitFmt('N·mm') },
    ], { bands: band, xlim: xl });
    const ps = [];
    for (let j = 0; j < 4; j++) ps.push({ x: th, y: SR.psi[j], color: HC[j], lw: c.Kj[j] ? 1.6 : 1, dash: c.Kj[j] ? [] : [3, 3], label: '$ψ$ at ' + HR[j] + (c.Kj[j] ? '' : ' (pin)'), fmt: unitFmt('°') });
    plots.psi.setData(ps, { bands: band, xlim: xl });
    plots.keq.setData([
      { x: th, y: scale(SR.Vpp, 1 / c.Keq0), color: COL.teal, label: '$K_{eq}/K_{eq,0}$', fmt: (v) => v.toFixed(4) },
      { x: th, y: scale(SR.M, 1 / c.M0), color: COL.blue, label: '$M/M_0$', fmt: (v) => v.toFixed(4) },
    ], { bands: band, xlim: xl });
    // flexure table
    const s = R.summary;
    let html = '<caption class="small muted" style="caption-side:bottom;text-align:left;padding-top:4px">Every flexure has ' + rh('$K$') + ' = ' + fmtVal(c.K * 1e3, 4) + ' N·mm/rad. ' + rh('$g_j$') + ' = rotation of the flexure per unit rotation of the input.</caption><thead><tr><th>Joint</th><th>Type</th><th>Rotation range ψ</th><th>' + rh('$g_j$') + ' at ' + rh('$θ_{2,0}$') + '</th><th>Share of ' + rh('$K_{eq}$') + '</th><th>Peak bending stress</th></tr></thead><tbody>';
    for (let j = 0; j < 4; j++) {
      const hh = s.hinges[j], g = c.g0[j], share = c.Kj[j] * g * g / c.Keq0 * 100;
      html += '<tr><td>' + HN(j) + '</td><td>' + (c.Kj[j] ? 'flexure' : 'pin joint') + '</td><td>' + fx(deg(hh.psiMin), 2) + '° … ' + fx(deg(hh.psiMax), 2) + '°</td><td>' + fx(g, 3) + '</td><td>' + (c.Kj[j] ? share.toFixed(1) + ' %' : '—') + '</td><td>' + (c.Kj[j] ? fmtVal(hh.sbMax / 1e6, 4) + ' MPa' : '—') + '</td></tr>';
    }
    html += '</tbody>';
    $('#tblHinge').innerHTML = html;
  }

  /* ================================================================ vibration tab */
  let VIB = null;
  function renderVibration() {
    const c = R.c;
    const fv = E.freeVibration(c, c.Th, 12, false, 120);
    const n = fv.n + 1;
    const t = fv.t.subarray(0, n), x = scale(fv.x.subarray(0, n), 1 / D2R);
    const envP = new Float64Array(n), envM = new Float64Array(n);
    for (let q = 0; q < n; q++) { envP[q] = deg(c.Th) * Math.exp(-c.zeta * c.wn * t[q]); envM[q] = -envP[q]; }
    plots.free.setData([
      { x: t, y: x, color: COL.ink, label: 'nonlinear (RK4)', fmt: unitFmt('°') },
      { x: t, y: envP, color: COL.red, lw: 1.1, dash: [5, 3], label: 'envelope', cursor: false, noTip: true },
      { x: t, y: envM, color: COL.red, lw: 1.1, dash: [5, 3], cursor: false, noTip: true },
    ]);
    const nr = 400, rr = new Float64Array(nr), mf = new Float64Array(nr), ph = new Float64Array(nr);
    for (let q = 0; q < nr; q++) { const r = 3 * (q + 0.5) / nr; rr[q] = r; mf[q] = E.MF(r, c.zeta); ph[q] = E.PHASE(r, c.zeta); }
    const rc = c.r;
    plots.MF.setData([{ x: rr, y: mf, color: COL.ink, label: 'MF', fmt: (v) => fmtVal(v, 4) }], { xlim: [0, 3], marks: rc <= 3 ? [{ x: rc, y: E.MF(rc, c.zeta), color: COL.red, r: 4.5, label: '$r$ = ' + rc.toFixed(2), dx: 8, dy: -6 }] : [] });
    plots.ph.setData([{ x: rr, y: ph, color: COL.ink, label: 'phase', fmt: unitFmt('°') }], { xlim: [0, 3], marks: rc <= 3 ? [{ x: rc, y: E.PHASE(rc, c.zeta), color: COL.red, r: 4.5, label: fmtVal(E.PHASE(rc, c.zeta), 3) + '°', dx: 8, dy: 12 }] : [] });
    const bb = E.backbone(c, Math.max(2 * c.Th, 10 * D2R), 24);
    const aNow = deg(c.Th);
    let rNow = NaN;
    for (let q = 0; q < bb.a.length - 1; q++) if (bb.a[q] <= aNow && bb.a[q + 1] >= aNow) rNow = bb.ratio[q] + (bb.ratio[q + 1] - bb.ratio[q]) * (aNow - bb.a[q]) / (bb.a[q + 1] - bb.a[q]);
    plots.back.setData([{ x: bb.a, y: bb.ratio, color: COL.teal, label: 'backbone', fmt: (v) => v.toFixed(5) }], {
      hlines: [{ y: 1, color: '#777', dash: [4, 3], lw: 0.9 }],
      marks: isFinite(rNow) ? [{ x: aNow, y: rNow, color: COL.red, r: 4.5, label: '$Θ$ = ' + aNow.toFixed(1) + '°', dx: 8, dy: -6 }] : [],
    });
    VIB = { fv, rNow, bb };
  }

  /* ================================================================ KPIs and results */
  const KPIS = [
    { tex: 'f_n', lab: 'Natural frequency', f: (s) => s.fn, u: 'Hz', x: (s) => '$ω_n$ = ' + fmtVal(s.wn, 4) + ' rad/s, $Q$ = ' + fmtVal(s.Q, 3) },
    { tex: 'K_{eq}', lab: 'Equivalent torsional stiffness', f: (s) => s.Keq0 * 1e3, u: 'N·mm/rad', x: (s) => 'one hinge $K$ = ' + fmtVal(s.K * 1e3, 4) + ' N·mm/rad' },
    { tex: 'M', lab: 'Equivalent inertia at the input', f: (s) => s.M0 * 1e6, u: 'kg·mm²', x: () => 'moving mass ' + fmtVal((R.c.m2 + R.c.m3 + R.c.m4 + R.c.mp) * 1e3, 4) + ' g' },
    { tex: 'T_{max}', lab: 'Peak motor torque', f: (s) => s.Tmax * 1e3, u: 'N·mm', x: (s) => 'rigid linkage: ' + fmtVal(s.TmaxR * 1e3, 4) + ' N·mm' },
    { tex: 'T_{rms}', lab: 'RMS motor torque', f: (s) => s.Trms * 1e3, u: 'N·mm', x: (s) => (s.redRms >= 0 ? fmtVal(s.redRms * 100, 3) + ' % below rigid' : fmtVal(-s.redRms * 100, 3) + ' % above rigid') },
    { tex: 'f^*', lab: 'Best drive frequency', f: (s) => s.fOpt, u: 'Hz', x: (s) => '$T_{rms}$ there ' + fmtVal(s.TrmsOpt * 1e3, 3) + ' N·mm' },
    { tex: '\\bar P', lab: 'Average motor power', f: (s) => s.Pavg * 1e3, u: 'mW', x: (s) => fmtVal(s.Ed * 1e3, 3) + ' mJ lost per cycle' },
    { tex: 'P_{peak}', lab: 'Peak motor power', f: (s) => s.Ppk * 1e3, u: 'mW', x: (s) => 'rigid: ' + fmtVal(s.PpkR * 1e3, 3) + ' mW' },
    { tex: 'V_{max}', lab: 'Max. energy stored in flexures', f: (s) => s.Umax * 1e3, u: 'mJ', x: (s) => 'max. kinetic ' + fmtVal(s.KEmax * 1e3, 3) + ' mJ' },
    { tex: '\\sigma_{max}', lab: 'Peak flexure stress', f: (s) => s.sigMax / 1e6, u: 'MPa', x: (s) => 'flexure at ' + HR[s.jSig] },
    { tex: 'n_f', lab: 'Fatigue safety factor (Goodman)', f: (s) => s.nf, u: '', x: (s) => 'yield $n_y$ = ' + fmtVal(s.ny, 3), warn: (s) => s.nf < 1 },
    { tex: 'F_{max}', lab: 'Peak joint force', f: (s) => s.Fmax, u: 'N', x: (s) => 'shaking force ' + fmtVal(s.Fsmax, 3) + ' N' },
  ];
  const KPI_GROUPS = ['Stiffness & frequency', 'Motor torque', 'Power & energy', 'Strength'];
  const kpiRefs = [];
  function buildKPIs() {
    const host = $('#kpis');
    KPI_GROUPS.forEach((title, gi) => {
      const grp = h('div', { class: 'kgrp' }, h('div', { class: 'kgrp-h' }, title));
      for (const k of KPIS.slice(gi * 3, gi * 3 + 3)) {
        const v = h('span', { class: 'v' }), x = h('div', { class: 'kpi-x' }), d = h('span', { class: 'delta' });
        const sym = h('div', { class: 'kpi-sym' }); sym.innerHTML = tex(k.tex);
        const val = h('div', { class: 'kpi-val' }, v, h('span', { class: 'u' }, k.u));
        grp.append(h('div', { class: 'kpi' }, sym, val, h('div', { class: 'kpi-lab' }, k.lab), x, d));
        kpiRefs.push({ k, v, x, d, val });
      }
      host.append(grp);
    });
  }
  function renderKPIs() {
    const s = R.summary, b = base && base.summary;
    for (const { k, v, x, d, val } of kpiRefs) {
      const value = k.f(s);
      v.textContent = fmtVal(value, 4);
      x.innerHTML = k.x ? rh(k.x(s)) : '';
      val.classList.toggle('warn', !!(k.warn && k.warn(s)));
      if (b) {
        const bv = k.f(b);
        const pct = isFinite(value) && isFinite(bv) && bv !== 0 ? (value - bv) / Math.abs(bv) * 100 : NaN;
        d.className = 'delta on' + (pct > 0.05 ? ' up' : pct < -0.05 ? ' down' : '');
        d.textContent = isFinite(pct) ? (pct > 0.05 ? '▲ ' : pct < -0.05 ? '▼ ' : '') + (Math.abs(pct) < 0.05 ? '0.0' : Math.abs(pct) >= 100 ? Math.abs(pct).toFixed(0) : Math.abs(pct).toFixed(1)) + ' %' : '—';
      } else d.className = 'delta';
    }
  }
  function renderDataLine() {
    const p = params, c = R.c;
    const items = [
      `r_1=${nf(p.r1)}\\,\\text{mm}`, `r_2=${nf(p.r2)}\\,\\text{mm}`, `r_3=${nf(p.r3)}\\,\\text{mm}`, `r_4=${nf(p.r4)}\\,\\text{mm}`,
      `\\theta_{2,0}=${nf(p.th0)}^\\circ\\ (${p.asm === 'crossed' ? '\\text{crossed}' : '\\text{open}'})`,
      `\\text{${c.mat.short}: }E=${nf(c.E / 1e9)}\\,\\text{GPa},\\ \\rho=${nf(c.rho)}\\,\\text{kg/m}^3`,
      `S_y=${nf(c.Sy / 1e6)},\\ S_{ut}=${nf(c.Sut / 1e6)},\\ S_e=${nf(c.Se / 1e6)}\\,\\text{MPa}`,
      `\\text{flexures: }${c.flex === 'all' ? 'O_2,A,B,O_4' : 'O_2,O_4\\ (\\text{pins at }A,B)'}`,
      `l=${nf(p.lh)}\\,\\text{mm}`, `t=${nf(p.t)}\\,\\text{mm}`, `b=${nf(p.b)}\\,\\text{mm}`, `w=${nf(p.w)}\\,\\text{mm}`,
      `m_p=${nf(p.mp)}\\,\\text{g}\\ \\text{at}\\ u_P=${(+p.pc).toFixed(2)}\\,r_3,\\ v_P=${nf(p.po)}\\,\\text{mm}`,
      `\\Theta=\\pm${nf(p.amp)}^\\circ`, `\\delta=${nf(p.bias)}^\\circ`, `f=${nf(p.f)}\\,\\text{Hz}\\ (\\Omega=${nf(c.Om)}\\,\\text{rad/s})`, `\\zeta=${nf(p.zeta)}\\,\\%`,
      `m_2,m_3,m_4=${nf(c.m2 * 1e3, 3)},\\,${nf(c.m3 * 1e3, 3)},\\,${nf(c.m4 * 1e3, 3)}\\,\\text{g}`,
    ];
    $('#dataLine').innerHTML = items.map((t) => '<span>' + tex(t) + '</span>').join('');
  }

  // only the open tab is typeset after each change; the others are rendered when opened
  let renderOnly = null;
  const dirtyTabs = new Set();
  const TAB_IDS = () => [...document.querySelectorAll('.tab-page')].map((p) => p.id);
  const wanted = (sel) => { if (!renderOnly) return true; const pg = $(sel).closest('.tab-page'); return !pg || pg.id === renderOnly; };
  function renderTab(id) {
    if (!R) return;
    dirtyTabs.delete(id);
    renderOnly = id;
    if (id === 'stiffness') renderStiffness();
    if (id === 'vibration') renderVibration();
    if (id === 'strength') renderFatigueTable();
    if (['kinematics', 'stiffness', 'drive', 'vibration', 'strength'].includes(id)) { renderResults(); renderObservations(); }
    if (id === 'solution') renderSolution();
    if (id === 'verification') renderVerification();
    if (id === 'theory') renderDataLine();
    if (id === 'sensitivity') scheduleSlow();
    renderOnly = null;
  }
  function resBox(id, items) {
    if (!wanted(id)) return;
    $(id).innerHTML = items.filter(Boolean).map((it) => {
      const [t, cls] = Array.isArray(it) ? it : [it, ''];
      return '<span class="ri ' + cls + '">' + tex(t) + '</span>';
    }).join('');
  }
  function swing(a) { let lo = Infinity, hi = -Infinity; for (let i = 0; i < R.N; i++) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); } return { lo, hi, amp: (hi - lo) / 2 }; }
  function renderResults() {
    const s = R.summary, c = R.c;
    const s3 = swing(R.th3), s4 = swing(R.th4);
    let w4 = 0, a4 = 0; for (let i = 0; i < R.N; i++) { w4 = Math.max(w4, Math.abs(R.w4[i])); a4 = Math.max(a4, Math.abs(R.al4[i])); }
    resBox('#resKin', [
      `\\Omega=2\\pi f=${nf(c.Om)}\\ \\text{rad/s}`,
      `\\omega_{2,max}=\\Theta\\Omega=${nf(c.Th * c.Om)}\\ \\text{rad/s}`,
      `\\Delta\\theta_4=\\pm${nf(deg(s4.amp), 3)}^\\circ,\\ \\Delta\\theta_3=\\pm${nf(deg(s3.amp), 3)}^\\circ`,
      `\\omega_{4,max}=${nf(w4)}\\ \\text{rad/s}`, `\\alpha_{4,max}=${nf(a4)}\\ \\text{rad/s}^2`,
      `v_{P,max}=${nf(s.vPmax)}\\ \\text{m/s}`, `a_{P,max}=${nf(s.aPmax)}\\ \\text{m/s}^2`,
      `\\mu=${nf(s.muMin, 3)}^\\circ\\ldots${nf(s.muMax, 3)}^\\circ`,
      `s+l=${nf(c.grashof.sum * 1e3)}\\ ${c.grashof.sum <= c.grashof.pq + 1e-12 ? '\\le' : '>'}\\ p+q=${nf(c.grashof.pq * 1e3)}\\ \\text{mm}`,
    ]);
    const wn = c.wn;
    resBox('#resStf', [
      `I=\\dfrac{bt^3}{12}=${nf(c.I * 1e12)}\\ \\text{mm}^4`, `K=\\dfrac{EI}{l}=${nf(c.K * 1e3)}\\ \\text{N\\,mm/rad}`,
      `K_{eq}=${nf(c.Keq0 * 1e3)}\\ \\text{N\\,mm/rad}`, `V_{max}=${nf(s.Umax * 1e3)}\\ \\text{mJ}`,
      `\\varepsilon_{allow}=S_e/E=${nf(c.Se / c.E * 100, 3)}\\,\\%`,
      `l/r_{min}=${nf(c.lh / Math.min(c.r2, c.r3, c.r4), 3)}`,
    ]);
    resBox('#resDrv', [
      `T_{max}=${nf(s.Tmax * 1e3)}\\ \\text{N\\,mm}\\ (\\text{rigid }${nf(s.TmaxR * 1e3)})`,
      `T_{rms}=${nf(s.Trms * 1e3)}\\ \\text{N\\,mm}\\ (\\text{rigid }${nf(s.TrmsR * 1e3)})`,
      `f^*=${nf(s.fOpt)}\\ \\text{Hz}\\ \\Rightarrow\\ T_{rms}=${nf(s.TrmsOpt * 1e3)}\\ \\text{N\\,mm}`,
      `\\oint T\\,d\\theta_2=${nf(s.Win * 1e3)}\\ \\text{mJ}`, `\\bar P=${nf(s.Pavg * 1e3)}\\ \\text{mW}`,
      `P_{peak}=${nf(s.Ppk * 1e3)}\\ \\text{mW}\\ (\\text{rigid }${nf(s.PpkR * 1e3)})`,
      `E_{k,max}=${nf(s.KEmax * 1e3)}\\ \\text{mJ}`, `V_{max}=${nf(s.Umax * 1e3)}\\ \\text{mJ}`,
    ]);
    const z = c.zeta, dlt = 2 * Math.PI * z / Math.sqrt(1 - z * z);
    resBox('#resVib', [
      `K_{eq}=${nf(c.Keq0 * 1e3)}\\ \\text{N\\,mm/rad}`, `M=${nf(c.M0 * 1e6)}\\ \\text{kg\\,mm}^2`,
      `\\omega_n=${nf(wn)}\\ \\text{rad/s}`, `f_n=${nf(c.fn)}\\ \\text{Hz}`, `\\omega_d=${nf(wn * Math.sqrt(Math.max(0, 1 - z * z)))}\\ \\text{rad/s}`,
      `C=2\\zeta\\omega_nM=${nf(c.C0 * 1e3)}\\ \\text{N\\,mm\\,s/rad}`,
      `\\delta=${nf(dlt, 3)}`, `Q=${nf(1 / (2 * z), 3)}`, `r=f/f_n=${nf(c.r, 3)}`,
      `\\text{MF}(r)=${nf(E.MF(c.r, z), 3)}`,
    ]);
    resBox('#resStr', [
      `\\sigma_{max}=${nf(s.sigMax / 1e6)}\\ \\text{MPa (flexure at }${E.HINGE_TEX[s.jSig]})`,
      `n_f=${nf(s.nf, 3)}${s.nf < 1 ? '\\ \\text{(unsafe)}' : ''}`, `n_y=${nf(s.ny, 3)}`,
      `F_{max}=${nf(s.Fmax)}\\ \\text{N (joint }${['O_2', 'A', 'B', 'O_4'][s.jF]})`,
      `F_{s,max}=${nf(s.Fsmax)}\\ \\text{N}`,
      `\\psi_{allow}(n{=}1.5)=${nf(deg(2 * c.lh * c.Se / (c.E * c.t * 1.5)), 3)}^\\circ`,
    ].map((t, q) => (q === 1 && s.nf < 1 ? [t, 'warn'] : t)));
  }

  /* ================================================================ plain-language observations */
  function obs(id, items) {
    if (!wanted(id)) return;
    $(id).innerHTML = '<div class="obs-h">What the results say</div><ul>' + items.filter(Boolean).map((t) => '<li>' + t + '</li>').join('') + '</ul>';
  }
  function renderObservations() {
    const s = R.summary, c = R.c, p = params;
    const s3 = swing(R.th3), s4 = swing(R.th4);
    const gk = c.grashof;
    obs('#obsKin', [
      `A swing of ±${fmtVal(p.amp, 3)}° at the input makes the output link swing <b>±${fmtVal(deg(s4.amp), 3)}°</b> and the coupler turn ±${fmtVal(deg(s3.amp), 3)}°. The payload point ${rh('$P$')} travels <b>${fmtVal(s.PdX * 1e3, 3)} mm</b> sideways and ${fmtVal(s.PdY * 1e3, 3)} mm up and down.`,
      `Peak payload acceleration ${rh('$a_P$')} = <b>${fmtVal(s.aPmax, 3)} m/s²</b> (${fmtVal(s.aPmax / 9.81, 3)} ${rh('$g$')}) at ${fmtVal(p.f, 3)} Hz; it grows with the square of the drive frequency.`,
      s.muMin >= 40 && s.muMax <= 140 ? `Transmission angle stays between ${fmtVal(s.muMin, 3)}° and ${fmtVal(s.muMax, 3)}°, inside the usual 40°–140° band, so the coupler pushes the output link efficiently.`
        : `<b>Warning:</b> the transmission angle reaches ${fmtVal(s.muMin < 40 ? s.muMin : s.muMax, 3)}°, outside 40°–140°: the joint forces grow and the motion becomes sensitive. Change the link lengths or the swing.`,
      `Link-length check (Grashof): ${gk.kind}. ${gk.grashof && /crank/.test(gk.kind) ? 'With pin joints the input could turn a full revolution; the flexures limit it to a small swing.' : 'The flexures limit the motion to a small swing anyway.'}`,
    ]);
    const shares = c.Kj.map((K, j) => K * c.g0[j] * c.g0[j] / c.Keq0 * 100);
    let jm = 0; shares.forEach((v, j) => { if (v > shares[jm]) jm = j; });
    const hiTh = c.thc + c.Th, kHi = E.kin(c, hiTh), dHi = kHi ? E.dyn(c, kHi) : null;
    const SRl = SR || E.staticRange(c, Math.max(4 * c.Th, 30 * D2R));
    let kmin = Infinity, kmax = -Infinity;
    for (let q = 0; q < SRl.th.length; q++) if (SRl.th[q] >= deg(c.thc - c.Th) && SRl.th[q] <= deg(c.thc + c.Th)) { kmin = Math.min(kmin, SRl.Vpp[q]); kmax = Math.max(kmax, SRl.Vpp[q]); }
    const lr = c.lh / Math.min(c.r2, c.r3, c.r4);
    obs('#obsStf', [
      `Each flexure is a torsional spring of ${rh('$K$')} = ${rh('$EI/l$')} = <b>${fmtVal(c.K * 1e3, 4)} N·mm/rad</b>. Seen from the motor they add up to ${rh('$K_{eq}$')} = <b>${fmtVal(c.Keq0 * 1e3, 4)} N·mm/rad</b>, because each one turns ${rh('$g_j$')} times as much as the input.`,
      `The flexure at ${HN(jm)} gives the largest share of the stiffness (<b>${shares[jm].toFixed(0)} %</b>): it turns ${fmtVal(Math.abs(c.g0[jm]), 3)} times as far as the input link.`,
      dHi ? `Holding the input at the end of the swing takes <b>${fmtVal(dHi.Vp * 1e3, 4)} N·mm</b> and stores ${fmtVal(dHi.V * 1e3, 3)} mJ in the flexures.` : null,
      isFinite(kmin) ? `Over the swing ${rh('$K_{eq}$')} varies between ${fmtVal(kmin / c.Keq0 * 100, 4)} % and ${fmtVal(kmax / c.Keq0 * 100, 4)} % of its as-made value, so the mechanism is ${Math.max(kmax / c.Keq0 - 1, 1 - kmin / c.Keq0) < 0.05 ? 'almost a linear spring' : 'a noticeably nonlinear spring'}.` : null,
      lr <= 0.2 ? `Hinge length / shortest link = ${fmtVal(lr, 2)}: short enough for the small-length flexural pivot model.` : `<b>Note:</b> hinge length / shortest link = ${fmtVal(lr, 2)} is large; the small-length pivot model becomes approximate (keep it below about 0.2).`,
    ]);
    const below = c.r < 1;
    obs('#obsDrv', [
      `At ${rh('$f$')} = ${fmtVal(p.f, 3)} Hz (${rh('$f/f_n$')} = ${fmtVal(c.r, 3)}) the motor needs a peak torque of <b>${fmtVal(s.Tmax * 1e3, 4)} N·mm</b>. The same linkage with pin joints would need <b>${fmtVal(s.TmaxR * 1e3, 4)} N·mm</b>, so the flexures ${s.Tmax < s.TmaxR ? 'cut the peak torque by <b>' + fmtVal((1 - s.Tmax / s.TmaxR) * 100, 3) + ' %</b>' : 'raise the peak torque by <b>' + fmtVal((s.Tmax / s.TmaxR - 1) * 100, 3) + ' %</b>'}.`,
      `${below ? 'Below' : 'Above'} the natural frequency the ${below ? 'flexure springs' : 'link inertia'} dominate${below ? '' : 's'}. At ${rh('$f^*$')} = <b>${fmtVal(s.fOpt, 3)} Hz</b> spring and inertia torques almost cancel and the RMS torque drops to <b>${fmtVal(s.TrmsOpt * 1e3, 3)} N·mm</b>. ${Math.abs(p.f / s.fOpt - 1) > 0.03 ? 'Use <i>Drive at best frequency</i> to move there.' : 'The drive is already there.'}`,
      `The average motor power is only <b>${fmtVal(s.Pavg * 1e3, 3)} mW</b>, all of it lost in the flexure material (${fmtVal(s.Ed * 1e3, 3)} mJ per cycle). The rest of the power flows back and forth between the motor and the mechanism (peak ${fmtVal(s.Ppk * 1e3, 3)} mW, rigid ${fmtVal(s.PpkR * 1e3, 3)} mW).`,
      `Kinetic energy (max ${fmtVal(s.KEmax * 1e3, 3)} mJ) and elastic energy (max ${fmtVal(s.Umax * 1e3, 3)} mJ) swap twice per cycle: for oscillating motion the flexures do the job a flywheel does for rotating machines.`,
    ]);
    const z = c.zeta, dlt = 2 * Math.PI * z / Math.sqrt(1 - z * z), nHalf = Math.log(2) / dlt;
    const MFc = E.MF(c.r, z);
    obs('#obsVib', [
      `Natural frequency ${rh('$f_n$')} = √(${rh('$K_{eq}/M$')}) / 2π = <b>${fmtVal(c.fn, 4)} Hz</b>; the drive runs at ${rh('$r$')} = ${fmtVal(c.r, 3)}.`,
      `With ${rh('$ζ$')} = ${fmtVal(p.zeta, 3)} % a free swing halves in about <b>${fmtVal(nHalf, 3)} cycles</b> (log decrement ${rh('$δ$')} = ${fmtVal(dlt, 3)}); quality factor ${rh('$Q$')} = ${fmtVal(1 / (2 * z), 3)}.`,
      `Under a harmonic torque at the drive frequency the swing would be <b>${fmtVal(MFc, 3)}×</b> the static deflection, lagging by ${fmtVal(E.PHASE(c.r, z), 3)}°. ${c.r > 0.85 && c.r < 1.15 ? 'This is why a small motor torque is enough near resonance.' : ''}`,
      VIB && isFinite(VIB.rNow) ? `Backbone: at ${fmtVal(p.amp, 3)}° the free-swing frequency is ${fmtVal(Math.abs(VIB.rNow - 1) * 100, 2)} % ${VIB.rNow >= 1 ? 'higher' : 'lower'} than ${rh('$f_n$')} (${VIB.rNow >= 1 ? 'hardening' : 'softening'}), so the linear model is ${Math.abs(VIB.rNow - 1) < 0.02 ? 'accurate' : 'only approximate'} at this amplitude.` : null,
    ]);
    const hj = s.hinges[s.jNf] || {};
    const psiMaxAll = Math.max(...s.hinges.filter((x) => x.flex).map((x) => Math.max(Math.abs(x.psiMin), Math.abs(x.psiMax))));
    obs('#obsStr', [
      `Most stressed flexure: the one at ${HN(s.jSig)}, <b>${fmtVal(s.sigMax / 1e6, 4)} MPa</b> peak, against a fatigue strength ${rh('$S_e$')} = ${fmtVal(c.Se / 1e6, 4)} MPa for ${c.mat.short}.`,
      s.nf >= 1.5 ? `Fatigue safety factor ${rh('$n_f$')} = <b>${fmtVal(s.nf, 3)}</b> (Goodman, flexure at ${E.HINGE[s.jNf]}): the flexures should survive about 10⁷ cycles.`
        : s.nf >= 1 ? `Fatigue safety factor ${rh('$n_f$')} = <b>${fmtVal(s.nf, 3)}</b> at the flexure at ${E.HINGE[s.jNf]}: safe, but with little margin. A thinner or longer hinge, or a smaller swing, adds margin.`
          : `<b>Unsafe:</b> ${rh('$n_f$')} = ${fmtVal(s.nf, 3)} at the flexure at ${E.HINGE[s.jNf]} (${rh('$σ_a$')} = ${fmtVal(hj.sa / 1e6, 3)} MPa). Make the hinge thinner or longer, reduce the swing, or choose a material with a higher ${rh('$S_e/E$')}.`,
      `Allowed flexure rotation for ${rh('$n$')} = 1.5: ${rh('$ψ_{allow}$')} = 2${rh('$l S_e$')}/(${rh('$E t n$')}) = <b>${fmtVal(deg(2 * c.lh * c.Se / (c.E * c.t * 1.5)), 3)}°</b>; the largest rotation used is ${fmtVal(deg(psiMaxAll), 3)}°.`,
      `Peak joint force <b>${fmtVal(s.Fmax, 3)} N</b> at joint ${HN(s.jF)}; the frame is shaken by up to ${fmtVal(s.Fsmax, 3)} N.`,
    ]);
  }

  function renderFatigueTable() {
    const s = R.summary;
    let html = '<thead><tr><th>Flexure</th><th>σ<sub>a</sub> [MPa]</th><th>σ<sub>m</sub> [MPa]</th><th>σ<sub>max</sub> [MPa]</th><th>n<sub>f</sub></th><th>n<sub>y</sub></th><th>Peak joint force [N]</th></tr></thead><tbody>';
    s.hinges.forEach((hh, j) => {
      if (!hh.flex) { html += '<tr><td>' + HN(j) + ' (pin)</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>' + fmtVal(hh.Fmax, 4) + '</td></tr>'; return; }
      html += '<tr' + (j === s.jNf ? ' class="hl"' : '') + '><td>' + HN(j) + '</td><td>' + fmtVal(hh.sa / 1e6, 4) + '</td><td>' + fmtVal(hh.sm / 1e6, 4) + '</td><td>' + fmtVal(hh.smax / 1e6, 4) + '</td><td class="' + (hh.nf >= 1 ? 'ok' : 'bad') + '">' + fmtVal(hh.nf, 3) + '</td><td class="' + (hh.ny >= 1 ? 'ok' : 'bad') + '">' + fmtVal(hh.ny, 3) + '</td><td>' + fmtVal(hh.Fmax, 4) + '</td></tr>';
    });
    html += '</tbody>';
    $('#tblFat').innerHTML = html;
  }

  /* ================================================================ step-by-step solution */
  function renderSolution() {
    if (!R) return;
    const c = R.c, p = params;
    const st = E.instant(c, wsPhi);
    if (!st) { $('#steps').innerHTML = '<li>The linkage cannot be assembled at this phase.</li>'; return; }
    const k = st.k, d = st.d, mm = 1e3;
    const th2 = deg(k.t2), th3 = deg(k.t3), th4 = deg(k.t4);
    const phiR = wsPhi * D2R;
    const angAO4 = deg(k.phiAO4), alpha = deg(Math.acos(Math.max(-1, Math.min(1, k.cosAlpha))));
    const fl = c.flex === 'all';
    const kT = (v) => nf(v * 1e3);                 // N·m → N·mm
    const psiD = d.psi.map(deg);
    const termK = fl ? `K\\big[\\psi_{O_2}(1)+\\psi_A(h_3-1)+\\psi_B(h_4-h_3)+\\psi_{O_4}\\,h_4\\big]` : `K\\big[\\psi_{O_2}(1)+\\psi_{O_4}\\,h_4\\big]`;
    const sub = fl
      ? `${nf(c.K * 1e3)}\\big[${pn(d.psi[0], 4)}+${pn(d.psi[1], 4)}(${pn(d.g[1], 4)})+${pn(d.psi[2], 4)}(${pn(d.g[2], 4)})+${pn(d.psi[3], 4)}(${pn(d.g[3], 4)})\\big]`
      : `${nf(c.K * 1e3)}\\big[${pn(d.psi[0], 4)}+${pn(d.psi[3], 4)}(${pn(d.g[3], 4)})\\big]`;
    const G3 = d.G3, P = d.P;
    const mG3 = c.m3 * (G3.dx * G3.dx + G3.dy * G3.dy), mP = c.mp * (P.dx * P.dx + P.dy * P.dy);
    let jS = 0, sMax = -1; for (let j = 0; j < 4; j++) if (c.Kj[j] && Math.max(st.top[j], st.bot[j]) > sMax) { sMax = Math.max(st.top[j], st.bot[j]); jS = j; }
    const sbj = st.sb[jS], Fj = st.Fm[jS];
    const steps = [
      ['Drive motion of the input link', '',
        `\\Omega=2\\pi f=2\\pi\\times${nf(+p.f)}=${nf(c.Om)}\\ \\text{rad/s},\\qquad \\theta_2=\\theta_{2,0}+\\delta+\\Theta\\sin\\phi=${nf(+p.th0)}^\\circ+${pn(+p.bias)}^\\circ+${nf(+p.amp)}^\\circ\\sin${nf(wsPhi)}^\\circ=${nf(th2, 5)}^\\circ`],
      ['', ' Input angular velocity and acceleration:',
        `\\omega_2=\\Theta\\Omega\\cos\\phi=${nf(c.Th, 4)}\\times${nf(c.Om)}\\times${pn(Math.cos(phiR), 4)}=${nf(st.w2)}\\ \\text{rad/s},\\qquad \\alpha_2=-\\Theta\\Omega^2\\sin\\phi=${nf(st.a2)}\\ \\text{rad/s}^2`],
      ['Position of A and diagonal O₄A', '',
        `A=(r_2\\cos\\theta_2,\\ r_2\\sin\\theta_2)=(${nf(k.Ax * mm)},\\ ${nf(k.Ay * mm)})\\ \\text{mm},\\qquad s=\\sqrt{(r_1-x_A)^2+y_A^2}=${nf(k.sAO4 * mm)}\\ \\text{mm}`],
      ['Coupler angle', ` (${p.asm === 'crossed' ? 'crossed: minus sign' : 'open: plus sign'})`,
        `\\cos\\alpha=\\dfrac{r_3^2+s^2-r_4^2}{2r_3s}=\\dfrac{${nf(+p.r3)}^2+${nf(k.sAO4 * mm)}^2-${nf(+p.r4)}^2}{2\\times${nf(+p.r3)}\\times${nf(k.sAO4 * mm)}}=${nf(k.cosAlpha, 5)}\\ \\Rightarrow\\ \\alpha=${nf(alpha)}^\\circ,\\qquad \\theta_3=${pn(angAO4)}^\\circ${p.asm === 'crossed' ? '-' : '+'}${nf(alpha)}^\\circ=${nf(th3, 5)}^\\circ`],
      ['Output angle', '',
        `B=A+r_3(\\cos\\theta_3,\\sin\\theta_3)=(${nf(k.Bx * mm)},\\ ${nf(k.By * mm)})\\ \\text{mm},\\qquad \\theta_4=\\operatorname{atan2}(y_B,\\,x_B-r_1)=${nf(th4, 5)}^\\circ`],
      ['Velocity analysis (kinematic coefficients)', '',
        `h_3=\\dfrac{r_2\\sin(\\theta_4-\\theta_2)}{r_3\\sin(\\theta_3-\\theta_4)}=${pn(k.h3, 4)},\\quad h_4=\\dfrac{r_2\\sin(\\theta_3-\\theta_2)}{r_4\\sin(\\theta_3-\\theta_4)}=${pn(k.h4, 4)},\\quad \\omega_3=${nf(st.w3)},\\ \\omega_4=${nf(st.w4)}\\ \\text{rad/s}`],
      ['Acceleration analysis', '',
        `h_3'=${pn(k.h3p, 4)},\\quad h_4'=${pn(k.h4p, 4)},\\qquad \\alpha_3=h_3'\\omega_2^2+h_3\\alpha_2=${nf(st.al3)},\\quad \\alpha_4=h_4'\\omega_2^2+h_4\\alpha_2=${nf(st.al4)}\\ \\text{rad/s}^2`],
      ['Stiffness of one flexure (pseudo-rigid-body model)', '',
        `I=\\dfrac{bt^3}{12}=\\dfrac{${nf(+p.b)}\\times${nf(+p.t)}^3}{12}=${nf(c.I * 1e12)}\\ \\text{mm}^4,\\qquad K=\\dfrac{EI}{l}=\\dfrac{${nf(c.E / 1e6)}\\times${nf(c.I * 1e12)}}{${nf(+p.lh)}}=${nf(c.K * 1e3)}\\ \\text{N\\,mm/rad}`],
      ['Flexure rotations from the as-made position', '',
        `\\psi_{O_2}=${pn(psiD[0])}^\\circ,\\quad \\psi_A=${pn(psiD[1])}^\\circ,\\quad \\psi_B=${pn(psiD[2])}^\\circ,\\quad \\psi_{O_4}=${pn(psiD[3])}^\\circ${fl ? '' : '\\quad(A,\\ B\\ \\text{are pins: no spring})'}`],
      ['Torque of the flexure springs at the motor', ' (ψ in rad)',
        `T_K=${termK}=${sub}=${kT(st.TK)}\\ \\text{N\\,mm}`],
      ['Equivalent inertia at the input', '',
        `M=I_{O2}+I_{O4}h_4^2+I_{G3}h_3^2+m_3|\\mathbf r_{G3}'|^2+m_p|\\mathbf r_P'|^2=${nf(c.IO2 * 1e6)}+${nf(c.IO4 * k.h4 * k.h4 * 1e6)}+${nf(c.IG3 * k.h3 * k.h3 * 1e6)}+${nf(mG3 * 1e6)}+${nf(mP * 1e6)}=${nf(d.M * 1e6)}\\ \\text{kg\\,mm}^2`],
      ['Inertia torque', '',
        `T_I=M\\alpha_2+\\tfrac12M'\\omega_2^2=${nf(d.M * 1e6)}\\times10^{-6}\\times${pn(st.a2)}+\\tfrac12\\times${pn(d.Mp * 1e6)}\\times10^{-6}\\times${nf(st.w2)}^2=${kT(st.TI)}\\ \\text{N\\,mm}`],
      ['Damping torque', '',
        `C=\\dfrac{2\\zeta}{\\omega_n}\\sum_jK_jg_j^2=${nf(d.C * 1e3)}\\ \\text{N\\,mm\\,s/rad},\\qquad T_D=C\\,\\omega_2=${kT(st.TD)}\\ \\text{N\\,mm}`],
      ['Motor torque', '',
        `T=T_I+T_K+T_D=${kT(st.TI)}+${pn(st.TK * 1e3)}+${pn(st.TD * 1e3)}=\\boxed{${kT(st.T)}\\ \\text{N\\,mm}}`],
      ['Stress in the most loaded flexure', ` (at ${E.HINGE[jS]})`,
        `\\sigma=\\dfrac{Et\\,|\\psi|}{2l}+F\\Big(\\dfrac{3l}{bt^2}+\\dfrac{1}{bt}\\Big)=${nf(Math.abs(sbj) / 1e6)}+${nf(Fj, 4)}\\Big(\\dfrac{3\\times${nf(+p.lh)}}{${nf(+p.b)}\\times${nf(+p.t)}^2}+\\dfrac{1}{${nf(+p.b)}\\times${nf(+p.t)}}\\Big)=${nf(sMax / 1e6)}\\ \\text{MPa}`],
    ];
    $('#steps').innerHTML = steps.map(([t, s2, eq]) =>
      '<li' + (t ? '' : ' class="cont"') + '><div class="step-t">' + t + (s2 ? '<span>' + s2 + '</span>' : '') + '</div><div class="step-eq">' + tex(eq, true) + '</div></li>').join('');
    const diff = Math.abs(st.Tne - st.T) / Math.max(Math.abs(st.T), 1e-12) * 100;
    resBox('#wsResult', [
      `\\text{Newton–Euler (joint forces): }T=${kT(st.Tne)}\\ \\text{N\\,mm}`,
      `\\text{difference }=${diff < 1e-6 ? '0' : nf(diff, 2)}\\,\\%`,
      `\\text{rigid linkage at this instant: }T_I=${kT(st.TI)}\\ \\text{N\\,mm}`,
    ]);
    $('#wsNum').value = wsPhi.toFixed(1);
    $('#wsRange').value = wsPhi;
    for (const b of document.querySelectorAll('.chip[data-phi]')) b.classList.toggle('on', +b.dataset.phi === wsPhi);
  }
  function initSolutionControls() {
    const set = (v) => { if (!isFinite(v)) return; wsPhi = ((Math.round(v * 2) / 2) % 360 + 360) % 360; renderSolution(); };
    $('#wsRange').addEventListener('input', (e) => set(+e.target.value));
    $('#wsNum').addEventListener('change', (e) => set(parseFloat(e.target.value)));
    for (const b of document.querySelectorAll('.chip[data-phi]')) b.addEventListener('click', () => set(+b.dataset.phi));
    $('#wsSync').addEventListener('click', () => set(curI() * 360 / N_()));
  }

  /* ================================================================ verification */
  let benchA = null, benchB = null;
  function renderVerification() {
    if (!benchA) {
      benchA = E.parallelogramBenchmark();
      benchB = E.frfBenchmark();
      const fmtB = (v) => (Math.abs(v) < 1e-12 ? '0' : fmtVal(v, 6));
      $('#tblBenchA').innerHTML = '<thead><tr><th>Quantity</th><th>Closed form</th><th>Solver</th><th>Difference</th><th></th></tr></thead><tbody>' +
        benchA.rows.map((r) => {
          const e = r.abs ? Math.abs(r.num - r.closed) : E.relErr(r.num, r.closed);
          return '<tr><td>' + rh(r.q) + '</td><td>' + fmtB(r.closed) + (r.unit ? ' ' + r.unit : '') + '</td><td>' + fmtB(r.num) + (r.unit ? ' ' + r.unit : '') + '</td><td>' + e.toExponential(1) + (r.abs ? ' (abs.)' : '') + '</td><td class="' + (e < 1e-6 ? 'ok">✓ pass' : 'bad">✗') + '</td></tr>';
        }).join('') + '</tbody>';
      $('#tblBenchB').innerHTML = '<thead><tr><th>Frequency ratio r</th><th>Time integration</th><th>Formula</th><th>Rel. difference</th><th></th></tr></thead><tbody>' +
        benchB.rows.map((r) => { const e = E.relErr(r.sim, r.th); return '<tr><td>' + r.r.toFixed(1) + '</td><td>' + r.sim.toFixed(5) + '°</td><td>' + r.th.toFixed(5) + '°</td><td>' + e.toExponential(1) + '</td><td class="' + (e < 1e-3 ? 'ok">✓ pass' : 'bad">✗') + '</td></tr>'; }).join('') + '</tbody>';
    }
    if (!checks || checks.R !== R) { checks = E.selfChecks(R); checks.R = R; }
    const ch = checks, s = R.summary;
    const rows = [
      ['Motor torque: Newton–Euler vs Lagrange', 'max |Δ$T$| / max |$T$|', ch.neVsLagrange, 1e-9],
      ['Coupler moment balance about $B$ (an equation the solution did not use)', 'max residual / max torque', ch.momentB, 1e-9],
      ['Velocity coefficients $h_3$, $h_4$ vs finite differences of $θ_3$, $θ_4$', 'max error / max |$h$|', ch.hFD, 1e-6],
      ['Acceleration coefficients $h_3$′, $h_4$′ vs finite differences', 'max error / scale', ch.hpFD, 1e-5],
      ['$dM/dθ_2$ vs finite difference of $M$', 'max error / scale', ch.MpFD, 1e-5],
      ['Spring torque $dV/dθ_2$ vs finite difference of $V$', 'max error / scale', ch.VpFD, 1e-5],
      ['$K_{eq}$ vs finite difference of $dV/dθ_2$', 'max error / scale', ch.VppFD, 1e-5],
      ['Freudenstein equation (independent closure check)', 'max |residual|', ch.freud, 1e-9],
      ['Loop closure |$O_4B$| = $r_4$', 'max error / $r_4$', ch.loop, 1e-9],
      ['Energy balance: motor work = damping loss per cycle', fmtVal(s.Win * 1e3, 5) + ' mJ vs ' + fmtVal(s.Ed * 1e3, 5) + ' mJ', ch.workBalance, 1e-6],
      ['Net work of inertia + spring torques over a cycle', '∮ / ∮|·|', ch.consWork, 1e-9],
      ['Undamped free vibration: energy drift (RK4, 4 periods)', 'max |Δ$E$| / $E$', ch.energyDrift, 1e-6],
      ['Small free swing: simulated frequency vs $f_n$', fmtVal(c0().fn, 6) + ' Hz', ch.linFreq, 1e-4],
      ['Free-swing period: energy-integral quadrature vs RK4', fmtVal(ch.quadT, 6) + ' s vs ' + fmtVal(ch.simT, 6) + ' s', ch.quadVsSim, 1e-4],
      ['Logarithmic decrement: simulated vs 2π$ζ$/√(1−$ζ$²)', fmtVal(ch.logDec, 5) + ' vs ' + fmtVal(ch.logDecTh, 5), ch.logDecErr, 2e-3],
    ];
    $('#tblLive').innerHTML = '<thead><tr><th>Check</th><th>Compared</th><th>Rel. difference</th><th></th></tr></thead><tbody>' +
      rows.map(([a, b, e, tol]) => '<tr><td>' + rh(a) + '</td><td>' + rh(b) + '</td><td>' + (isFinite(e) ? e.toExponential(1) : '—') + '</td><td class="' + (e <= tol ? 'ok">✓ pass' : 'bad">✗') + '</td></tr>').join('') + '</tbody>';
  }
  const c0 = () => R.c;

  /* ================================================================ sensitivity & maps */
  let slowT = null, mapId = 0, sensId = 0, worker = null, slowFor = '';
  function scheduleSlow() { clearTimeout(slowT); slowT = setTimeout(runSlow, 160); }
  function runSlow() {
    slowFor = queryString();
    const id = ++sensId;
    if (worker) worker.postMessage({ type: 'sens', id, p: Object.assign({}, params) });
    else setTimeout(() => { if (id === sensId) { sens = E.sensitivity(params); drawSens(); } }, 0);
    runMaps();
  }
  function runSlowSync() {
    if (slowFor === queryString() && sens && plots.mapA.data) return;
    slowFor = queryString();
    sens = E.sensitivity(params); drawSens();
    runMaps(true);
  }
  function drawSens() {
    if (!sens) return;
    const k = $('#sensOut').value;
    const items = E.SENS_KEYS.map((q) => ({ label: SENS_LABEL[q], v: sens[q][k] })).filter((q) => isFinite(q.v)).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    plots.sens.o.xlabel = 'Elasticity of ' + SENS_OUT[k].toLowerCase();
    plots.sens.setData(items);
  }
  function initWorker() {
    if (new URLSearchParams(location.search).has('noworker')) return;
    try {
      worker = new Worker('js/worker.js');
      worker.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'sens') { if (d.id === sensId) { sens = d.sens; drawSens(); } }
        else onMap(d);
      };
      worker.onerror = (e) => { if (e.preventDefault) e.preventDefault(); worker = null; runSlow(); };
    } catch (e) { worker = null; }
  }
  function runMaps(sync) {
    const t0 = +params.t, l0 = +params.lh;
    const job = { type: 'map', id: ++mapId, p: Object.assign({}, params), nx: 34, ny: 24, tlo: t0 / 3, thi: t0 * 3, llo: l0 / 3, lhi: l0 * 2.5 };
    const local = () => onMap(Object.assign({ id: job.id }, E.designMap(job.p, job.nx, job.ny, job.tlo, job.thi, job.llo, job.lhi)));
    if (sync) local();
    else if (worker) worker.postMessage(job);
    else setTimeout(() => { if (job.id === mapId) local(); }, 30);
  }
  function onMap(d) {
    if (d.id !== mapId || !R) return;
    const box = { nx: d.nx, ny: d.ny, x0: d.tlo, x1: d.thi, y0: d.llo, y1: d.lhi };
    const mk = { x: +params.t, y: +params.lh };
    plots.mapA.o.keyLevels = [{ v: +params.f, color: COL.red, lw: 2.2, dash: [6, 3] }];
    plots.mapA.setData(Object.assign({ z: d.fn }, box), mk);
    plots.mapB.setData(Object.assign({ z: d.nf }, box), mk);
  }
  function mapPick(t, l) {
    params.t = roundSig(t, 3);
    params.lh = roundSig(l, 3);
    syncControl('t'); syncControl('lh');
    schedule(); scheduleQuery();
    toast('Flexure changed to t = ' + params.t + ' mm, l = ' + params.lh + ' mm');
  }

  /* ================================================================ compute */
  let pend = false;
  function schedule() {
    if (pend) return;
    pend = true;
    requestAnimationFrame(() => { pend = false; compute(); });
  }
  let mech = null, pipMech = null, tabT = null, booted = false;
  function compute() {
    const t0 = performance.now();
    const next = E.solve(params);
    const t1 = performance.now();
    const banner = $('#errBanner');
    if (next.err) {
      banner.textContent = next.err + (R ? ' The page still shows the last design that works.' : '');
      banner.classList.add('on');
      if (R) return;
      // first load with an impossible design from a link: fall back to the default preset
      params = Object.assign({}, PRESETS.pusher.v); presetKey = 'pusher';
      for (const s of SPEC) syncControl(s.k);
      return compute();
    }
    banner.classList.remove('on');
    R = next;
    checks = null;
    mech.setGeometry(R);
    pipMech.setGeometry(R);
    renderKPIs(); renderPlots();
    for (const id of TAB_IDS()) dirtyTabs.add(id);
    clearTimeout(tabT);
    if (!booted) { renderTab(activeTab); booted = true; } else tabT = setTimeout(() => renderTab(activeTab), 120);
    updateSpeedLabel();
    const t2 = performance.now();
    $('#perf').textContent = 'Drive cycle solved in ' + (t1 - t0).toFixed(1) + ' ms, page updated in ' + (t2 - t0).toFixed(0) + ' ms (' + R.N + ' positions, Lagrange + Newton–Euler).';
    lastI = -1;
    renderFrame();
  }

  /* ================================================================ animation */
  const phaseName = (phi) => {
    const c = Math.cos(phi * D2R), s = Math.sin(phi * D2R);
    if (Math.abs(c) < 0.06) return s > 0 ? 'End of forward swing' : 'End of return swing';
    return c > 0 ? 'Forward swing (θ₂ increasing)' : 'Return swing (θ₂ decreasing)';
  };
  const INST = [
    ['Motion', [
      ['\\phi', 'phi', '°', 'drive phase'], ['\\theta_2', 'th2', '°', 'input angle'], ['\\theta_3', 'th3', '°', 'coupler angle'], ['\\theta_4', 'th4', '°', 'output angle'],
      ['\\omega_2', 'w2', 'rad/s', 'input ang. velocity'], ['\\omega_4', 'w4', 'rad/s', 'output ang. velocity'], ['v_P', 'vP', 'm/s', 'payload speed'], ['a_P', 'aP', 'm/s²', 'payload accel.']]],
    ['Flexures', [
      ['\\psi_{O_2}', 'pA', '°', 'flexure at O₂'], ['\\psi_A', 'pB', '°', 'flexure at A'], ['\\psi_B', 'pC', '°', 'flexure at B'], ['\\psi_{O_4}', 'pD', '°', 'flexure at O₄'],
      ['\\sigma', 'sg', 'MPa', 'highest stress now'], ['V', 'V', 'mJ', 'elastic energy'], ['E_k', 'KE', 'mJ', 'kinetic energy']]],
    ['Motor torque', [
      ['T', 'T', 'N·mm', 'motor torque'], ['T_I', 'TI', 'N·mm', 'inertia part'], ['T_K', 'TK', 'N·mm', 'flexure part'], ['T_D', 'TD', 'N·mm', 'damping part'],
      ['P', 'P', 'mW', 'motor power'], ['P_{rigid}', 'PR', 'mW', 'rigid linkage']]],
  ];
  const instRefs = {};
  function buildInst() {
    const host = $('#inst');
    for (const [title, rows] of INST) {
      const grp = h('div', { class: 'igrp' }, h('div', { class: 'igrp-h' }, title));
      for (const [t, k, u, name] of rows) {
        const sym = h('span', { class: 's' }); sym.innerHTML = tex(t);
        const v = h('span');
        grp.append(h('div', { class: 'it' }, h('span', { class: 'nm' }, name), sym, h('span', { class: 'v' }, v, h('small', null, u))));
        instRefs[k] = v;
      }
      host.append(grp);
    }
  }
  const f4 = (v) => fmtVal(v, 4);
  function renderFrame() {
    if (!R) return;
    const i = curI();
    if (i === lastI) return;
    lastI = i;
    const c = R.c, s = R.summary;
    const ratio = [0, 1, 2, 3].map((j) => (c.Kj[j] ? R.sig[j][i] / c.Se : 0));
    const st = { R, i, ratio, Tmax: s.Tmax, showTorque };
    const showHero = heroOn || printMode;
    if (showHero) mech.update(st);
    if (pipOn) pipMech.update(st);
    for (const p of cursorPlots) p.setCursor(i);
    const phi = i * 360 / R.N;
    if (showHero) {
      const V = instRefs;
      V.phi.textContent = fx(phi, 1);
      V.th2.textContent = fx(deg(R.th2[i]), 2); V.th3.textContent = fx(deg(R.th3[i]), 2); V.th4.textContent = fx(deg(R.th4[i]), 2);
      V.w2.textContent = f4(R.w2[i]); V.w4.textContent = f4(R.w4[i]); V.vP.textContent = f4(R.vP[i]); V.aP.textContent = f4(R.aPm[i]);
      V.pA.textContent = fx(deg(R.psi[0][i]), 2); V.pB.textContent = fx(deg(R.psi[1][i]), 2); V.pC.textContent = fx(deg(R.psi[2][i]), 2); V.pD.textContent = fx(deg(R.psi[3][i]), 2);
      let sg = 0; for (let j = 0; j < 4; j++) sg = Math.max(sg, R.sig[j][i]);
      V.sg.textContent = f4(sg / 1e6); V.V.textContent = f4(R.V[i] * 1e3); V.KE.textContent = f4(R.KE[i] * 1e3);
      V.T.textContent = f4(R.T[i] * 1e3); V.TI.textContent = f4(R.TI[i] * 1e3); V.TK.textContent = f4(R.TK[i] * 1e3); V.TD.textContent = f4(R.TD[i] * 1e3);
      V.P.textContent = f4(R.Pw[i] * 1e3); V.PR.textContent = f4(R.PwR[i] * 1e3);
      $('#scrub').value = phi;
      $('#scrubVal').textContent = phi.toFixed(1) + '°';
      $('#phaseName').textContent = phaseName(phi);
      $('#phiLabel').innerHTML = rh('$φ$') + ' = ' + phi.toFixed(1) + '°, ' + rh('$θ_2$') + ' = ' + deg(R.th2[i]).toFixed(2) + '°';
    }
    $('#pipLabel').textContent = 'φ ' + phi.toFixed(0) + '° · T ' + fmtVal(R.T[i] * 1e3, 3) + ' N·mm';
  }
  function setPhi(d) { phiDeg = ((d % 360) + 360) % 360; lastI = -1; renderFrame(); }
  function pick(gi) { setPlaying(false); setPhi(gi * 360 / N_()); }
  function setPlaying(on) {
    playing = on;
    for (const b of [$('#btnPlay'), $('#pipPlay')]) {
      b.firstElementChild.className = on ? 'ic-pause' : 'ic-play';
      b.setAttribute('aria-label', on ? 'Pause animation' : 'Play animation');
    }
  }
  function updateSpeedLabel() {
    $('#speedVal').textContent = cps.toFixed(2) + ' cycles/s';
    const real = +params.f;
    $('#slowmo').textContent = real > cps ? 'slow motion: the real mechanism swings ' + fmtVal(real / cps, 3) + '× faster' : '';
  }
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (playing && !document.hidden) phiDeg = (phiDeg + dt * cps * 360) % 360;
    renderFrame();
    requestAnimationFrame(loop);
  }

  /* ================================================================ chrome */
  let pipOn = false, heroOn = true, printMode = false;
  function initChrome() {
    const pip = $('#pip');
    let pipClosed = false;
    const setPip = (on) => { pipOn = on && !pipClosed; pip.classList.toggle('show', pipOn); pip.setAttribute('aria-hidden', String(!pipOn)); lastI = -1; };
    new IntersectionObserver((es) => { heroOn = es[es.length - 1].isIntersecting; lastI = -1; }, { threshold: 0.05 }).observe($('#mechHost'));
    new IntersectionObserver((es) => { const e = es[es.length - 1]; setPip(!e.isIntersecting && e.boundingClientRect.top < 0); }).observe($('#s-mech'));
    $('#pipClose').addEventListener('click', () => { pipClosed = true; setPip(false); });
    $('#pipTop').addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: 0 }); });
    const fab = $('#fab');
    new IntersectionObserver((es) => { const e = es[es.length - 1]; fab.classList.toggle('show', mqNarrow.matches && !e.isIntersecting && e.boundingClientRect.top < 0); }).observe($('#panel'));
    fab.addEventListener('click', () => $('#panel').scrollIntoView({ block: 'start' }));
    mqNarrow.addEventListener('change', placePanel);

    $('#btnPlay').addEventListener('click', () => setPlaying(!playing));
    $('#pipPlay').addEventListener('click', () => setPlaying(!playing));
    $('#scrub').addEventListener('input', (e) => { setPlaying(false); setPhi(+e.target.value); });
    const sp = $('#speed');
    const spFrom = (t) => 0.03 * Math.pow(100, t / 1000);
    sp.value = Math.round(1000 * Math.log(cps / 0.03) / Math.log(100));
    sp.addEventListener('input', () => { cps = spFrom(+sp.value); updateSpeedLabel(); });
    $('#chkTorque').addEventListener('change', (e) => { showTorque = e.target.checked; lastI = -1; renderFrame(); });

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
      } catch (e) { try { history.replaceState(null, '', '?' + queryString()); } catch (e2) { /* ignore */ } toast('Copy the link from the address bar'); }
    });
    $('#btnCSV').addEventListener('click', downloadCSV);
    $('#btnPrint').addEventListener('click', () => window.print());
    window.addEventListener('beforeprint', prepareReport);
    window.addEventListener('afterprint', () => {
      printMode = false; window.Plotter.forceDraw = false;
      for (const old of document.querySelectorAll('.print-img')) old.remove();
      document.body.classList.remove('printing');
      showTab(activeTab, false);
    });
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button' || e.target.isContentEditable) return;
      if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault(); setPlaying(false);
        setPhi(phiDeg + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1));
      }
    });
  }
  // printing = a complete report: every tab typeset, every plot drawn, What-if computed now
  function prepareReport() {
    printMode = true;
    window.Plotter.forceDraw = true;
    document.body.classList.add('printing');
    for (const id of TAB_IDS()) if (dirtyTabs.has(id) && id !== 'sensitivity') renderTab(id);
    dirtyTabs.delete('sensitivity');
    for (const pg of document.querySelectorAll('.tab-page')) pg.hidden = false;
    runSlowSync();
    for (const p of allPlots) { p.visible = true; p.resize(); }
    lastI = -1; renderFrame();
    for (const old of document.querySelectorAll('.print-img')) old.remove();
    for (const p of allPlots) {
      const cvs = p.el.querySelectorAll('canvas');
      if (!cvs.length || !cvs[0].width) continue;
      const tmp = document.createElement('canvas');
      tmp.width = cvs[0].width; tmp.height = cvs[0].height;
      const g = tmp.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, tmp.width, tmp.height);
      for (const cv of cvs) g.drawImage(cv, 0, 0);
      const img = h('img', { class: 'print-img', alt: '', src: tmp.toDataURL('image/png') });
      img.style.width = cvs[0].style.width;
      p.el.append(img);
    }
  }
  window.__prepareReport = prepareReport;
  window.__setPhase = (d) => { setPlaying(false); setPhi(d); };

  function downloadCSV() {
    const N = R.N;
    const dg = (a) => (i) => a[i] / D2R;
    const cols = [
      ['phi_deg', (i) => i * 360 / N], ['theta2_deg', dg(R.th2)], ['theta3_deg', dg(R.th3)], ['theta4_deg', dg(R.th4)],
      ['omega2_rad_s', R.w2], ['omega3_rad_s', R.w3], ['omega4_rad_s', R.w4], ['alpha2_rad_s2', R.a2], ['alpha3_rad_s2', R.al3], ['alpha4_rad_s2', R.al4],
      ['xP_mm', (i) => R.Px[i] * 1e3], ['yP_mm', (i) => R.Py[i] * 1e3], ['vP_m_s', R.vP], ['aP_m_s2', R.aPm], ['mu_deg', R.mu],
      ['psiA_deg', dg(R.psi[0])], ['psiB_deg', dg(R.psi[1])], ['psiC_deg', dg(R.psi[2])], ['psiD_deg', dg(R.psi[3])],
      ['T_Nmm', (i) => R.T[i] * 1e3], ['T_inertia_Nmm', (i) => R.TI[i] * 1e3], ['T_spring_Nmm', (i) => R.TK[i] * 1e3], ['T_damping_Nmm', (i) => R.TD[i] * 1e3], ['T_newton_euler_Nmm', (i) => R.Tne[i] * 1e3],
      ['kinetic_mJ', (i) => R.KE[i] * 1e3], ['elastic_mJ', (i) => R.V[i] * 1e3], ['power_mW', (i) => R.Pw[i] * 1e3], ['power_rigid_mW', (i) => R.PwR[i] * 1e3],
      ['F_O2_N', R.Fj[0]], ['F_A_N', R.Fj[1]], ['F_B_N', R.Fj[2]], ['F_O4_N', R.Fj[3]],
      ['stress_A_MPa', (i) => R.sig[0][i] / 1e6], ['stress_B_MPa', (i) => R.sig[1][i] / 1e6], ['stress_C_MPa', (i) => R.sig[2][i] / 1e6], ['stress_D_MPa', (i) => R.sig[3][i] / 1e6],
      ['shaking_x_N', R.Fsx], ['shaking_y_N', R.Fsy],
    ];
    const lines = ['# Compliant Four-Bar Dynamics Lab - one drive cycle', '# ' + SPEC.map((q) => q.k + '=' + params[q.k]).join(', '), cols.map((c) => c[0]).join(',')];
    for (let i = 0; i < N; i++) lines.push(cols.map((c) => { const v = typeof c[1] === 'function' ? c[1](i) : c[1][i]; return +v.toPrecision(8); }).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'compliant-four-bar-cycle.csv' });
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
    placePanel();
    buildControls();
    buildKPIs();
    buildInst();
    createPlots();
    mech = new window.Mechanism($('#mechHost'));
    pipMech = new window.Mechanism($('#pipHost'), { mini: true });
    initTabs();
    initChrome();
    initSolutionControls();
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
