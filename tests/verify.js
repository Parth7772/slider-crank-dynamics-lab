#!/usr/bin/env node
/*
 * Verification suite for js/engine.js — run with:  node tests/verify.js
 *
 * Every check compares the engine against an independent result:
 *   1. a textbook hand-calculation (approximate method) vs the exact Newton–Euler solver
 *   2. the air-standard Otto efficiency 1 − r_c^(1−γ) vs the numerically integrated cycle
 *   3. Newton–Euler crank torque vs the energy (virtual-power) method, for every preset
 *   4. closed-form piston velocity/acceleration vs finite differences of the displacement
 *   5. ∫T dθ (through the mechanism) vs ∮p dV (thermodynamics)
 *   6. inertia forces do no net work over a cycle
 *   7. massless rod ⇒ two-force member:  F_N = F_P tanφ,  F_Q = F_P / cosφ,  F_T = F_Q sin(θ+φ)
 *   8. flywheel: designed inertia reproduces the requested coefficient of fluctuation of speed
 */
'use strict';
const E = require('../js/engine.js');

let pass = 0, fail = 0;
function check(name, got, want, tol) {
  const err = E.relErr(got, want);
  const ok = err <= tol;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} got ${fmt(got)}  expected ${fmt(want)}  rel.err ${err.toExponential(2)}`);
}
function checkSmall(name, val, tol) {
  const ok = Math.abs(val) <= tol;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} value ${Math.abs(val).toExponential(2)}  (tol ${tol.toExponential(0)})`);
}
function fmt(v) { return (Math.abs(v) >= 1e4 || Math.abs(v) < 1e-2) ? v.toExponential(5) : v.toFixed(5); }

const PRESETS = {
  car: { bore: 86, r: 43, n: 3.4, CR: 10, mp: 0.45, mc: 0.55, lG: 0.30, kG: 0.28, N: 3000, orient: 'v', model: 'wiebe', load: 80, pin: 1.0, gamma: 1.30, soc: 20, dur: 50, Cs: 2, Dfw: 300, rho: 7250, bt: 2, cbal: 0.5 },
  bike: { bore: 57.3, r: 28.9, n: 3.6, CR: 9.5, mp: 0.20, mc: 0.18, lG: 0.30, kG: 0.28, N: 7500, orient: 'v', model: 'wiebe', load: 100, pin: 1.0, gamma: 1.30, soc: 25, dur: 45, Cs: 3, Dfw: 160, rho: 7850, bt: 1.5, cbal: 0.5 },
  diesel: { bore: 102, r: 55, n: 4.0, CR: 17.5, mp: 1.2, mc: 1.4, lG: 0.30, kG: 0.28, N: 1500, orient: 'v', model: 'wiebe', load: 75, pin: 1.0, gamma: 1.32, soc: 12, dur: 45, Cs: 1, Dfw: 450, rho: 7250, bt: 2, cbal: 0.5 },
  textbook: { bore: 500, r: 300, n: 4, CR: 6, mp: 250, mc: 150, lG: 0.35, kG: 0.30, N: 250, orient: 'h', model: 'otto', load: 60, pin: 1.0, gamma: 1.35, soc: 10, dur: 40, Cs: 2, Dfw: 2500, rho: 7250, bt: 2, cbal: 0.5 },
};

console.log('\n== 1. Textbook benchmark (horizontal engine, θ = 60°) ==');
for (const row of E.textbookBenchmark()) {
  console.log(`      ${row.q.padEnd(34)} hand ${(row.hand / 1000).toFixed(3)} k${row.unit}   exact ${(row.exact / 1000).toFixed(3)} k${row.unit}`);
  // the hand method uses the approximate acceleration; agreement to 0.2 % is expected
  check(`textbook: ${row.q}`, row.exact, row.hand, 2e-3);
}

console.log('\n== 2. Air-standard Otto cycle efficiency ==');
const ot = E.ottoBenchmark();
check('η numeric vs 1 − r_c^(1−γ)  (r_c = 8, γ = 1.4)', ot.num, ot.exact, 1e-4);

for (const [name, p] of Object.entries(PRESETS)) {
  console.log(`\n== preset: ${name} ==`);
  const R = E.solve(p);
  const s = R.summary;
  const sc = E.selfChecks(R);
  checkSmall('3. Newton–Euler vs energy-method torque (max err / max|T|)', sc.neVsEnergy, 1e-9);
  checkSmall('4. velocity: closed form vs finite difference', sc.vFD, 1e-6);
  checkSmall('4. acceleration: closed form vs finite difference', sc.aFD, 1e-4);
  check('5. ∫T dθ vs ∮p dV', s.W, s.Wpdv, 2e-3);
  checkSmall('6. net work of inertia torque over cycle (relative)', sc.inertiaWork, 1e-9);
  // 8. flywheel reproduces C_s
  const Cs = (s.Nmax - s.Nmin) / p.N;
  check('8. speed fluctuation with designed flywheel = C_s', Cs, p.Cs / 100, 1e-3);
  console.log(`      P = ${(s.P / 1000).toFixed(2)} kW, T_mean = ${s.Tmean.toFixed(1)} N·m, p_max = ${(s.pmax / 1e5).toFixed(1)} bar @ ${s.psiPmax}°, ` +
    `imep = ${(s.imep / 1e5).toFixed(2)} bar, η_i = ${(s.eta * 100).toFixed(1)} %, ΔE = ${s.dE.toFixed(1)} J, I = ${s.I.toExponential(3)} kg·m², m_rim = ${s.mrim.toFixed(2)} kg`);
}

console.log('\n== 7. Massless rod ⇒ two-force member (car geometry, several angles) ==');
{
  const p = Object.assign({}, PRESETS.car, { mc: 0, orient: 'h' });
  const c = E.setup(p, { gx: 0, gy: 0 });
  let eN = 0, eQ = 0, eT = 0;
  for (let deg = 5; deg < 360; deg += 17) {
    const th = deg * E.D2R;
    const o = E.point(c, th, 2.5e6, {});
    const phi = Math.asin(Math.sin(th) / c.n);
    eN = Math.max(eN, Math.abs(o.Fn - o.Fp * Math.tan(phi)) / Math.abs(o.Fp));
    eQ = Math.max(eQ, Math.abs(o.Fq - o.Fp / Math.cos(phi)) / Math.abs(o.Fp));
    const FQ = o.Fp / Math.cos(phi);
    eT = Math.max(eT, Math.abs(o.Ft - FQ * Math.sin(th + phi)) / Math.abs(FQ));
  }
  checkSmall('F_N = F_P tanφ', eN, 1e-10);
  checkSmall('F_Q = F_P / cosφ', eQ, 1e-10);
  checkSmall('F_T = F_Q sin(θ+φ)', eT, 1e-10);
}

console.log('\n== 9. Grid convergence of cycle work (Wiebe model) ==');
{
  const a = E.solve(PRESETS.car, { res: 1, light: true }).summary.W;
  const b = E.solve(PRESETS.car, { res: 0.5, light: true }).summary.W;
  const c = E.solve(PRESETS.car, { res: 0.25, light: true }).summary.W;
  console.log(`      W(1°) = ${a.toFixed(4)} J, W(0.5°) = ${b.toFixed(4)} J, W(0.25°) = ${c.toFixed(4)} J`);
  check('W at 0.5° vs 0.25° resolution', b, c, 1e-4);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
