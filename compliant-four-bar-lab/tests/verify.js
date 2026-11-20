/* Verification suite for the Compliant Four-Bar Dynamics Lab.  Run:  node tests/verify.js */
'use strict';
const E = require('../js/engine.js');
const D2R = Math.PI / 180;
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  pass  ' : '  FAIL  ') + name + (detail ? '  (' + detail + ')' : ''));
}
const fmt = (v) => (typeof v === 'number' ? v.toExponential(2) : String(v));

const PRESETS = {
  pusher: { r1: 180, r2: 60, r3: 165, r4: 120, th0: 70, asm: 'open', mat: 'steel', flex: 'all', lh: 12, t: 0.25, b: 12, w: 12, mp: 150, pc: 0.5, po: 35, zeta: 1, amp: 6, bias: 0, f: 4 },
  parallel: { r1: 80, r2: 50, r3: 80, r4: 50, th0: 90, asm: 'open', mat: 'al', flex: 'all', lh: 8, t: 0.3, b: 10, w: 10, mp: 100, pc: 0.5, po: 0, zeta: 1, amp: 4, bias: 0, f: 8 },
  pla: { r1: 150, r2: 55, r3: 135, r4: 105, th0: 60, asm: 'open', mat: 'pla', flex: 'all', lh: 11, t: 0.55, b: 8, w: 8, mp: 25, pc: 0.5, po: 25, zeta: 3, amp: 5, bias: 0, f: 6 },
  pp: { r1: 80, r2: 30, r3: 70, r4: 55, th0: 75, asm: 'open', mat: 'pp', flex: 'all', lh: 5, t: 0.5, b: 10, w: 8, mp: 15, pc: 0.5, po: 15, zeta: 4, amp: 6, bias: 0, f: 12.5 },
  ti: { r1: 150, r2: 50, r3: 140, r4: 100, th0: 80, asm: 'open', mat: 'ti', flex: 'ground', lh: 10, t: 0.3, b: 10, w: 8, mp: 40, pc: 0.6, po: 30, zeta: 1.5, amp: 10, bias: 0, f: 5.9 },
  // extra cases: crossed assembly, offset swing, heavy damping
  crossed: { r1: 120, r2: 40, r3: 110, r4: 80, th0: 70, asm: 'crossed', mat: 'steel', flex: 'all', lh: 15, t: 0.25, b: 12, w: 10, mp: 150, pc: 0.3, po: -10, zeta: 2, amp: 6, bias: 0, f: 5 },
  offset: { r1: 120, r2: 40, r3: 110, r4: 80, th0: 70, asm: 'open', mat: 'steel', flex: 'all', lh: 15, t: 0.25, b: 12, w: 10, mp: 150, pc: 0.5, po: 25, zeta: 8, amp: 5, bias: 6, f: 9 },
};

console.log('\n1. Benchmark A: parallelogram (closed form)');
const A = E.parallelogramBenchmark();
for (const r of A.rows) {
  const e = r.abs ? Math.abs(r.num - r.closed) : E.relErr(r.num, r.closed);
  check(r.q.replace(/\$/g, ''), e < 1e-6, 'closed ' + r.closed.toPrecision(8) + ', solver ' + r.num.toPrecision(8) + ', diff ' + fmt(e));
}

console.log('\n2. Benchmark B: forced vibration vs magnification factor');
const Bm = E.frfBenchmark();
for (const r of Bm.rows) { const e = E.relErr(r.sim, r.th); check('r = ' + r.r, e < 1e-3, 'sim ' + r.sim.toFixed(5) + '°, formula ' + r.th.toFixed(5) + '°, diff ' + fmt(e)); }

console.log('\n3. Live self-checks on every preset');
const tol = { neVsLagrange: 1e-9, momentB: 1e-9, hFD: 1e-6, hpFD: 1e-5, MpFD: 1e-5, VpFD: 1e-5, VppFD: 1e-5, freud: 1e-9, loop: 1e-9, workBalance: 1e-6, consWork: 1e-9, energyDrift: 1e-6, linFreq: 1e-4, quadVsSim: 1e-4, logDecErr: 2e-3 };
for (const k in PRESETS) {
  const R = E.solve(PRESETS[k]);
  if (R.err) { check(k + ' solves', false, R.err); continue; }
  const ch = E.selfChecks(R);
  const bad = Object.keys(tol).filter((q) => !(ch[q] <= tol[q]));
  check(k + ': ' + Object.keys(tol).length + ' checks', bad.length === 0, bad.length ? bad.map((q) => q + '=' + fmt(ch[q])).join(', ') : 'worst ' + fmt(Math.max(...Object.keys(tol).map((q) => ch[q] / tol[q]))) + ' of tolerance');
}

console.log('\n4. Physics sanity');
{
  const R = E.solve(PRESETS.pusher), s = R.summary;
  check('resonant drive saves torque (RMS below rigid at f ≈ f*)', s.Trms < 0.5 * s.TrmsR, (s.redRms * 100).toFixed(1) + ' % saving');
  const lo = E.solve(Object.assign({}, PRESETS.pusher, { f: 0.5 })).summary;
  check('quasi-static drive: compliant needs more torque than rigid', lo.Trms > lo.TrmsR);
  const st = E.solve(Object.assign({}, PRESETS.pusher, { f: 1e-4 }));
  let ei = 0; for (let i = 0; i < st.N; i++) ei = Math.max(ei, Math.abs(st.TI[i]));
  check('f → 0: inertia torque vanishes (∝ f²), motor torque → spring torque', ei < 1e-8 * st.summary.Tmax, 'max |T_I| / T_max = ' + fmt(ei / st.summary.Tmax));
  const und = E.solve(Object.assign({}, PRESETS.pusher, { zeta: 1e-9 })).summary;
  check('undamped: no average power', Math.abs(und.Pavg) < 1e-9, fmt(und.Pavg) + ' W');
  const c = R.c;
  const z = E.solve(Object.assign({}, PRESETS.pusher, { mp: 300 })).c;
  check('heavier payload lowers f_n', z.fn < c.fn);
  const thick = E.solve(Object.assign({}, PRESETS.pusher, { t: 0.5 })).c;
  check('K ∝ t³ (doubling t → 8 K)', Math.abs(thick.K / c.K - 8) < 1e-9, (thick.K / c.K).toFixed(9));
  check('f_n² ∝ K (doubling t → f_n × √8)', Math.abs(thick.fn / c.fn - Math.sqrt(8)) < 1e-9);
  check('optimum frequency within 5 % of f_n', Math.abs(s.fOpt / c.fn - 1) < 0.05, 'f* = ' + s.fOpt.toFixed(3) + ', f_n = ' + c.fn.toFixed(3));
  check('presets stay inside the small-length pivot model (l ≤ 0.2 × shortest link)', ['pusher', 'parallel', 'pla', 'pp', 'ti'].every((k) => { const c = E.derive(PRESETS[k]); return c.lh <= 0.2 * Math.min(c.r2, c.r3, c.r4) + 1e-12; }));
  check('Goodman safety factor ≥ 1 on all presets', Object.keys(PRESETS).filter((k) => ['pusher', 'parallel', 'pla', 'pp', 'ti'].includes(k)).every((k) => E.solve(PRESETS[k]).summary.nf >= 1));
  const bad = E.solve(Object.assign({}, PRESETS.pusher, { r3: 30 }));
  check('impossible linkage is reported, not computed', !!bad.err, bad.err && bad.err.slice(0, 60) + '…');
  const rocker = { r1: 100, r2: 70, r3: 40, r4: 80, th0: 60, asm: 'open', mat: 'steel', flex: 'all', lh: 15, t: 0.25, b: 12, w: 10, mp: 150, pc: 0.5, po: 25, zeta: 1, amp: 5, bias: 0, f: 5 };
  check('Grashof double rocker: small swing solves', !E.solve(rocker).err);
  const far = E.solve(Object.assign({}, rocker, { amp: 60 }));
  check('Grashof double rocker: swing beyond the reachable range is reported', !!far.err, far.err && far.err.slice(0, 60) + '…');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
