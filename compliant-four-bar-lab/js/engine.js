/*!
 * engine.js — computation engine of the Compliant Four-Bar Dynamics Lab.
 *
 * A planar four-bar O2-A-B-O4 whose joints are small-length flexural pivots (flexure hinges).
 * Pseudo-rigid-body model (PRBM): every flexure = pin joint + torsional spring K = E I / l.
 * Closed-form position / velocity / acceleration analysis, Lagrange equation of motion
 *   M(θ) θ¨ + ½ M'(θ) θ˙² + C(θ) θ˙ + V'(θ) = T,
 * Newton–Euler joint forces, hinge stresses and Goodman fatigue, free and forced vibration.
 *
 * Pure functions, no DOM: used by the page, by the Web Worker and by the Node test suite.
 * Internal units are SI (m, kg, s, rad, N); inputs use mm, g, deg, %, Hz.
 */
(function (root) {
  'use strict';
  const PI = Math.PI, TAU = 2 * PI, D2R = PI / 180;
  const { sin, cos, sqrt, abs, atan2, acos, hypot, max, min } = Math;
  const wrap = (a) => a - TAU * Math.round(a / TAU);
  const cross = (ax, ay, bx, by) => ax * by - ay * bx;

  /* ---------------------------------------------------------------- materials */
  // typical room-temperature values; Se = fully reversed fatigue strength of a polished flexure (~10^7 cycles)
  const MATERIALS = {
    steel: { label: 'Spring steel (AISI 1095, hardened)', short: 'spring steel', E: 205e9, rho: 7850, Sy: 1100e6, Sut: 1400e6, Se: 550e6 },
    ti: { label: 'Titanium alloy Ti-6Al-4V', short: 'Ti-6Al-4V', E: 114e9, rho: 4430, Sy: 880e6, Sut: 950e6, Se: 510e6 },
    al: { label: 'Aluminium 7075-T6', short: 'Al 7075-T6', E: 71.7e9, rho: 2810, Sy: 503e6, Sut: 572e6, Se: 159e6 },
    pla: { label: 'PLA, 3D-printed', short: 'PLA', E: 3.5e9, rho: 1240, Sy: 50e6, Sut: 55e6, Se: 16e6 },
    pp: { label: 'Polypropylene (living hinge)', short: 'polypropylene', E: 1.5e9, rho: 905, Sy: 32e6, Sut: 36e6, Se: 12e6 },
  };
  // flexures are named after their joints: O2 (frame–input), A (input–coupler), B (coupler–output), O4 (output–frame)
  const HINGE = ['O₂', 'A', 'B', 'O₄'];
  const HINGE_TEX = ['O_2', 'A', 'B', 'O_4'];
  const HINGE_AT = HINGE_TEX;

  /* ---------------------------------------------------------------- constants of a design */
  function derive(p) {
    const mat = MATERIALS[p.mat] || MATERIALS.steel;
    const c = {
      p, mat,
      r1: p.r1 / 1e3, r2: p.r2 / 1e3, r3: p.r3 / 1e3, r4: p.r4 / 1e3,
      sig: p.asm === 'crossed' ? -1 : 1,
      th0: p.th0 * D2R,
      E: mat.E, rho: mat.rho, Sy: mat.Sy, Sut: mat.Sut, Se: mat.Se,
      lh: p.lh / 1e3, t: p.t / 1e3, b: p.b / 1e3, w: p.w / 1e3,
      mp: p.mp / 1e3, pu: p.pc, pv: p.po / 1e3,
      zeta: p.zeta / 100, Th: p.amp * D2R, bias: p.bias * D2R, f: p.f, Om: TAU * p.f,
      flex: p.flex === 'ground' ? 'ground' : 'all',
    };
    c.thc = c.th0 + c.bias;                            // centre of the drive swing
    c.I = c.b * c.t * c.t * c.t / 12;                  // second moment of area of a hinge
    c.K = c.E * c.I / c.lh;                            // PRBM stiffness of a small-length flexural pivot
    c.Kj = [c.K, c.flex === 'all' ? c.K : 0, c.flex === 'all' ? c.K : 0, c.K];
    // links: uniform bars of width w and thickness b in the hinge material (monolithic mechanism)
    const ml = (r) => c.rho * c.b * c.w * r;
    c.m2 = ml(c.r2); c.m3 = ml(c.r3); c.m4 = ml(c.r4);
    const IG = (m, r) => m * (r * r + c.w * c.w) / 12;
    c.IG2 = IG(c.m2, c.r2); c.IG3 = IG(c.m3, c.r3); c.IG4 = IG(c.m4, c.r4);
    c.IO2 = c.IG2 + c.m2 * c.r2 * c.r2 / 4;
    c.IO4 = c.IG4 + c.m4 * c.r4 * c.r4 / 4;
    // points on the coupler, polar form relative to A and the direction AB
    c.qG3 = { rho: c.r3 / 2, d: 0 };
    c.qP = { rho: hypot(c.pu * c.r3, c.pv), d: atan2(c.pv, c.pu * c.r3) };
    c.mTot = c.m2 + c.m3 + c.m4 + c.mp;
    c.grashof = grashof(c);
    const k0 = kin(c, c.th0);
    if (!k0) { c.err = 'The links cannot be joined at the as-made input angle θ₂,₀ = ' + p.th0 + '°. Change the link lengths or the angle.'; return c; }
    c.t30 = k0.t3; c.t40 = k0.t4;
    c.cj = [0, 0, 0, 0]; c.beta = 0;
    const d0 = dyn(c, k0);
    c.Keq0 = d0.Vpp; c.M0 = d0.M;
    c.wn = sqrt(c.Keq0 / c.M0); c.fn = c.wn / TAU;
    c.beta = 2 * c.zeta / c.wn;                       // hinge damping proportional to hinge stiffness
    c.cj = c.Kj.map((k) => c.beta * k);
    c.C0 = c.beta * c.Keq0;                            // = 2 ζ ω_n M_0
    c.r = c.f / c.fn;                                  // drive frequency ratio
    c.g0 = d0.g.slice();
    return c;
  }

  function grashof(c) {
    const L = [['r1', c.r1], ['r2', c.r2], ['r3', c.r3], ['r4', c.r4]].sort((a, b) => a[1] - b[1]);
    const s = L[0][1], l = L[3][1], pq = L[1][1] + L[2][1];
    const sum = s + l;
    if (abs(sum - pq) < 1e-9 * l) return { grashof: true, kind: 'change-point (s + l = p + q)', s: L[0][0], sum, pq };
    if (sum > pq) return { grashof: false, kind: 'non-Grashof triple rocker', s: L[0][0], sum, pq };
    const kind = L[0][0] === 'r1' ? 'Grashof double crank' : L[0][0] === 'r3' ? 'Grashof double rocker' : 'Grashof crank–rocker';
    return { grashof: true, kind, s: L[0][0], sum, pq };
  }

  /* ---------------------------------------------------------------- kinematics (closed form) */
  // Position of the linkage at input angle t2 and the kinematic coefficients
  // h = dθ/dθ2 and h' = d²θ/dθ2² of coupler (3) and output (4). null if it cannot be assembled.
  function kin(c, t2) {
    const c2 = cos(t2), s2 = sin(t2);
    const Ax = c.r2 * c2, Ay = c.r2 * s2;
    const dx = c.r1 - Ax, dy = -Ay, s = hypot(dx, dy);
    const ca = (c.r3 * c.r3 + s * s - c.r4 * c.r4) / (2 * c.r3 * s);
    if (!(ca <= 1 && ca >= -1)) return null;
    const t3 = atan2(dy, dx) + c.sig * acos(ca);
    const c3 = cos(t3), s3 = sin(t3);
    const Bx = Ax + c.r3 * c3, By = Ay + c.r3 * s3;
    const t4 = atan2(By, Bx - c.r1);
    const c4 = cos(t4), s4 = sin(t4);
    const s34 = sin(t3 - t4);
    if (abs(s34) < 1e-9) return null;
    const h3 = c.r2 * sin(t4 - t2) / (c.r3 * s34);
    const h4 = c.r2 * sin(t3 - t2) / (c.r4 * s34);
    // acceleration loop with ω2 = 1, α2 = 0:  i r3 h3' e^{iθ3} − i r4 h4' e^{iθ4} = −K
    const re4 = -c.r2 * cos(t2 - t4) - c.r3 * h3 * h3 * cos(t3 - t4) + c.r4 * h4 * h4;   // Re(K e^{−iθ4})
    const re3 = -c.r2 * cos(t2 - t3) - c.r3 * h3 * h3 + c.r4 * h4 * h4 * cos(t4 - t3);   // Re(K e^{−iθ3})
    const h3p = re4 / (c.r3 * s34), h4p = re3 / (c.r4 * s34);
    const mu = abs(wrap(t4 - t3)) / D2R;               // transmission angle (deg)
    return { t2, t3, t4, c2, s2, c3, s3, c4, s4, Ax, Ay, Bx, By, h3, h4, h3p, h4p, s34, mu, cosAlpha: ca, sAO4: s, phiAO4: atan2(dy, dx) };
  }

  // a point fixed to the coupler (polar q relative to A and AB): position, d/dθ2, d²/dθ2²
  function cpt(c, k, q) {
    const a = k.t3 + q.d, ca = cos(a), sa = sin(a), r = q.rho;
    return {
      x: k.Ax + r * ca, y: k.Ay + r * sa,
      dx: -c.r2 * k.s2 - r * k.h3 * sa, dy: c.r2 * k.c2 + r * k.h3 * ca,
      ddx: -c.r2 * k.c2 + r * (-k.h3p * sa - k.h3 * k.h3 * ca), ddy: -c.r2 * k.s2 + r * (k.h3p * ca - k.h3 * k.h3 * sa),
    };
  }

  /* ---------------------------------------------------------------- PRBM energy and Lagrange coefficients */
  function dyn(c, k) {
    const h2 = c.r2 / 2, h4r = c.r4 / 2;
    const G2 = { x: h2 * k.c2, y: h2 * k.s2, dx: -h2 * k.s2, dy: h2 * k.c2, ddx: -h2 * k.c2, ddy: -h2 * k.s2 };
    const G4 = {
      x: c.r1 + h4r * k.c4, y: h4r * k.s4,
      dx: -h4r * k.h4 * k.s4, dy: h4r * k.h4 * k.c4,
      ddx: h4r * (-k.h4p * k.s4 - k.h4 * k.h4 * k.c4), ddy: h4r * (k.h4p * k.c4 - k.h4 * k.h4 * k.s4),
    };
    const G3 = cpt(c, k, c.qG3), P = cpt(c, k, c.qP);
    const M = c.IO2 + c.IO4 * k.h4 * k.h4 + c.IG3 * k.h3 * k.h3 + c.m3 * (G3.dx * G3.dx + G3.dy * G3.dy) + c.mp * (P.dx * P.dx + P.dy * P.dy);
    const Mp = 2 * (c.IO4 * k.h4 * k.h4p + c.IG3 * k.h3 * k.h3p + c.m3 * (G3.dx * G3.ddx + G3.dy * G3.ddy) + c.mp * (P.dx * P.ddx + P.dy * P.ddy));
    const t30 = c.t30 == null ? k.t3 : c.t30, t40 = c.t40 == null ? k.t4 : c.t40;
    const psi = [wrap(k.t2 - c.th0), wrap((k.t3 - k.t2) - (t30 - c.th0)), wrap((k.t4 - k.t3) - (t40 - t30)), wrap(k.t4 - t40)];
    const g = [1, k.h3 - 1, k.h4 - k.h3, k.h4];
    const gp = [0, k.h3p, k.h4p - k.h3p, k.h4p];
    let V = 0, Vp = 0, Vpp = 0, C = 0;
    for (let j = 0; j < 4; j++) {
      const K = c.Kj[j];
      V += 0.5 * K * psi[j] * psi[j];
      Vp += K * psi[j] * g[j];
      Vpp += K * (g[j] * g[j] + psi[j] * gp[j]);
      C += c.cj[j] * g[j] * g[j];
    }
    return { M, Mp, V, Vp, Vpp, C, psi, g, gp, G2, G3, G4, P };
  }

  /* ---------------------------------------------------------------- one instant: kinematics + dynamics + forces */
  function state(c, th, w2, a2) {
    const k = kin(c, th);
    if (!k) return null;
    const d = dyn(c, k);
    const w3 = k.h3 * w2, w4 = k.h4 * w2;
    const al3 = k.h3p * w2 * w2 + k.h3 * a2, al4 = k.h4p * w2 * w2 + k.h4 * a2;
    const acc = (q) => [q.ddx * w2 * w2 + q.dx * a2, q.ddy * w2 * w2 + q.dy * a2];
    const aG2 = acc(d.G2), aG3 = acc(d.G3), aP = acc(d.P), aG4 = acc(d.G4);
    const Mh = [0, 0, 0, 0], Mk = [0, 0, 0, 0];
    for (let j = 0; j < 4; j++) { Mk[j] = c.Kj[j] * d.psi[j]; Mh[j] = Mk[j] + c.cj[j] * d.g[j] * w2; }
    // Lagrange
    const TI = d.M * a2 + 0.5 * d.Mp * w2 * w2, TK = d.Vp, TD = d.C * w2, T = TI + TK + TD;
    // Newton–Euler. Link 4 about O4:  r_O4B × F34 − M_C − M_D = I_O4 α4
    // Link 3 about A:   r_AB × F43 − M_B + M_C = I_G3 α3 + r_AG3 × m3 a_G3 + r_AP × m_p a_P,  F43 = −F34
    const bx = k.Bx - c.r1, by = k.By, ux = k.Bx - k.Ax, uy = k.By - k.Ay;
    const R4 = c.IO4 * al4 + Mh[2] + Mh[3];
    const R3 = c.IG3 * al3 + c.m3 * cross(d.G3.x - k.Ax, d.G3.y - k.Ay, aG3[0], aG3[1]) + c.mp * cross(d.P.x - k.Ax, d.P.y - k.Ay, aP[0], aP[1]) + Mh[1] - Mh[2];
    const det = bx * uy - by * ux;
    const F34 = [(R4 * ux + bx * R3) / det, (by * R3 + uy * R4) / det];
    const F14 = [c.m4 * aG4[0] - F34[0], c.m4 * aG4[1] - F34[1]];
    const F23 = [c.m3 * aG3[0] + c.mp * aP[0] + F34[0], c.m3 * aG3[1] + c.mp * aP[1] + F34[1]];
    const F12 = [c.m2 * aG2[0] + F23[0], c.m2 * aG2[1] + F23[1]];
    // link 2 about O2:  T + r_O2A × F32 − M_A + M_B = I_O2 α2
    const Tne = c.IO2 * a2 + Mh[0] - Mh[1] + cross(k.Ax, k.Ay, F23[0], F23[1]);
    const F = [F12, F23, F34, F14];
    const Fm = F.map((v) => hypot(v[0], v[1]));
    // coupler moment balance about B (an equation the solution did not use): residual should vanish
    const res3B = cross(k.Ax - k.Bx, k.Ay - k.By, F23[0], F23[1]) - Mh[1] + Mh[2]
      - (c.IG3 * al3 + c.m3 * cross(d.G3.x - k.Bx, d.G3.y - k.By, aG3[0], aG3[1]) + c.mp * cross(d.P.x - k.Bx, d.P.y - k.By, aP[0], aP[1]));
    // hinge surface stresses: bending from the spring moment (σ = E t ψ / 2l) plus, conservatively,
    // bending from the joint force acting at mid-hinge (F l/2) and direct stress F/(b t)
    const sF = 3 * c.lh / (c.b * c.t * c.t) + 1 / (c.b * c.t);
    const sb = [0, 0, 0, 0], top = [0, 0, 0, 0], bot = [0, 0, 0, 0];
    for (let j = 0; j < 4; j++) {
      if (!c.Kj[j]) continue;
      sb[j] = c.E * c.t * d.psi[j] / (2 * c.lh);
      const ex = Fm[j] * sF;
      top[j] = sb[j] + ex; bot[j] = -sb[j] + ex;
    }
    const Fs = [-(c.m2 * aG2[0] + c.m3 * aG3[0] + c.mp * aP[0] + c.m4 * aG4[0]), -(c.m2 * aG2[1] + c.m3 * aG3[1] + c.mp * aP[1] + c.m4 * aG4[1])];
    return { th, w2, a2, k, d, w3, w4, al3, al4, aG2, aG3, aP, aG4, Mh, Mk, T, TI, TK, TD, Tne, F, Fm, Fs, sb, top, bot, res3B, R3, R4, det };
  }

  /* ---------------------------------------------------------------- one drive cycle (prescribed sinusoidal input) */
  // θ2(φ) = θ2,0 + δ + Θ sin φ,  φ = Ω t
  function solve(p, opt) {
    opt = opt || {};
    const c = derive(p);
    if (c.err) return { err: c.err, c };
    const N = opt.N || 720, n1 = N + 1;
    const F = () => new Float64Array(n1);
    const four = () => [F(), F(), F(), F()];
    const R = {
      c, N, phi: F(), th2: F(), th3: F(), th4: F(), w2: F(), a2: F(), w3: F(), w4: F(), al3: F(), al4: F(),
      Ax: F(), Ay: F(), Bx: F(), By: F(), Px: F(), Py: F(), vP: F(), aPm: F(), mu: F(),
      M: F(), Mp: F(), V: F(), Vp: F(), C: F(), T: F(), TI: F(), TK: F(), TD: F(), Tne: F(),
      KE: F(), Pw: F(), PwR: F(), Fsx: F(), Fsy: F(), Fsm: F(), res3B: F(),
      cA: F(), cB: F(), cC: F(),
      psi: four(), Fj: four(), sTop: four(), sBot: four(), sig: four(), Mk: four(),
    };
    for (let i = 0; i <= N; i++) {
      const ph = TAU * i / N;
      const sp = sin(ph), cp = cos(ph);
      const th = c.thc + c.Th * sp;
      const d1 = c.Th * cp, d2 = -c.Th * sp;                  // dθ/dφ, d²θ/dφ²
      const w2 = c.Om * d1, a2 = c.Om * c.Om * d2;
      const s = state(c, th, w2, a2);
      if (!s) return { err: 'The linkage cannot reach θ₂ = ' + (th / D2R).toFixed(1) + '° during the drive swing. Reduce the amplitude or the offset, or change the link lengths.', c };
      if (s.k.mu < 3 || s.k.mu > 177) return { err: 'The linkage passes through a toggle (dead-centre) position at θ₂ = ' + (th / D2R).toFixed(1) + '°. Reduce the amplitude or change the link lengths.', c };
      const k = s.k, d = s.d;
      R.phi[i] = ph / D2R; R.th2[i] = th; R.th3[i] = k.t3; R.th4[i] = k.t4;
      R.w2[i] = w2; R.a2[i] = a2; R.w3[i] = s.w3; R.w4[i] = s.w4; R.al3[i] = s.al3; R.al4[i] = s.al4;
      R.Ax[i] = k.Ax; R.Ay[i] = k.Ay; R.Bx[i] = k.Bx; R.By[i] = k.By; R.Px[i] = d.P.x; R.Py[i] = d.P.y;
      R.vP[i] = hypot(d.P.dx, d.P.dy) * abs(w2); R.aPm[i] = hypot(s.aP[0], s.aP[1]); R.mu[i] = k.mu;
      R.M[i] = d.M; R.Mp[i] = d.Mp; R.V[i] = d.V; R.Vp[i] = d.Vp; R.C[i] = d.C;
      R.T[i] = s.T; R.TI[i] = s.TI; R.TK[i] = s.TK; R.TD[i] = s.TD; R.Tne[i] = s.Tne;
      R.KE[i] = 0.5 * d.M * w2 * w2; R.Pw[i] = s.T * w2; R.PwR[i] = s.TI * w2;
      R.Fsx[i] = s.Fs[0]; R.Fsy[i] = s.Fs[1]; R.Fsm[i] = hypot(s.Fs[0], s.Fs[1]); R.res3B[i] = s.res3B;
      // torque as a function of Ω:  T = Ω² (M θ'' + ½ M' θ'²) + Ω C θ' + V'
      R.cA[i] = d.M * d2 + 0.5 * d.Mp * d1 * d1; R.cB[i] = d.C * d1; R.cC[i] = d.Vp;
      for (let j = 0; j < 4; j++) {
        R.psi[j][i] = d.psi[j]; R.Fj[j][i] = s.Fm[j]; R.sTop[j][i] = s.top[j]; R.sBot[j][i] = s.bot[j];
        R.sig[j][i] = max(s.top[j], s.bot[j]); R.Mk[j][i] = s.Mk[j];
      }
    }
    R.summary = summarize(R);
    return R;
  }

  function goodman(sa, sm, c) {
    // fully reversed + mean stress (modified Goodman); compressive mean stress taken as zero (conservative)
    const den = sa / c.Se + max(sm, 0) / c.Sut;
    return den > 0 ? 1 / den : Infinity;
  }

  function summarize(R) {
    const c = R.c, N = R.N;
    const s = { N, fn: c.fn, wn: c.wn, Keq0: c.Keq0, M0: c.M0, K: c.K, r: c.r, Q: c.zeta > 0 ? 1 / (2 * c.zeta) : Infinity };
    let Tmax = 0, iT = 0, TmaxR = 0, sq = 0, sqR = 0, Pk = 0, PkR = 0, Win = 0, Ed = 0, Umax = 0, KEmax = 0, Fsmax = 0, muMin = 180, muMax = 0;
    let PxMin = Infinity, PxMax = -Infinity, PyMin = Infinity, PyMax = -Infinity, vPmax = 0, aPmax = 0;
    const dphi = TAU / N;
    for (let i = 0; i < N; i++) {
      const T = R.T[i], TR = R.TI[i];
      if (abs(T) > Tmax) { Tmax = abs(T); iT = i; }
      TmaxR = max(TmaxR, abs(TR));
      sq += T * T; sqR += TR * TR;
      Pk = max(Pk, abs(R.Pw[i])); PkR = max(PkR, abs(R.PwR[i]));
      const dth = c.Th * cos(TAU * i / N) * dphi;      // dθ2 over one step
      Win += T * dth; Ed += R.TD[i] * dth;
      Umax = max(Umax, R.V[i]); KEmax = max(KEmax, R.KE[i]); Fsmax = max(Fsmax, R.Fsm[i]);
      muMin = min(muMin, R.mu[i]); muMax = max(muMax, R.mu[i]);
      PxMin = min(PxMin, R.Px[i]); PxMax = max(PxMax, R.Px[i]); PyMin = min(PyMin, R.Py[i]); PyMax = max(PyMax, R.Py[i]);
      vPmax = max(vPmax, R.vP[i]); aPmax = max(aPmax, R.aPm[i]);
    }
    Object.assign(s, {
      Tmax, phiTmax: iT * 360 / N, TmaxR, Trms: sqrt(sq / N), TrmsR: sqrt(sqR / N), Ppk: Pk, PpkR: PkR,
      Win, Ed, Pavg: Win * c.f, Umax, KEmax, Fsmax, muMin, muMax, vPmax, aPmax,
      Pstroke: hypot(PxMax - PxMin, PyMax - PyMin), PdX: PxMax - PxMin, PdY: PyMax - PyMin,
    });
    s.redRms = s.TrmsR > 0 ? 1 - s.Trms / s.TrmsR : NaN;
    s.redPk = s.TmaxR > 0 ? 1 - s.Tmax / s.TmaxR : NaN;
    // hinges
    s.hinges = [];
    let sigMax = 0, jSig = 0, nf = Infinity, jNf = 0, ny = Infinity, Fmax = 0, jF = 0;
    for (let j = 0; j < 4; j++) {
      const h = { j, name: HINGE[j], at: HINGE_AT[j], flex: c.Kj[j] > 0 };
      let pmin = Infinity, pmax = -Infinity, fm = 0;
      for (let i = 0; i < N; i++) { pmin = min(pmin, R.psi[j][i]); pmax = max(pmax, R.psi[j][i]); fm = max(fm, R.Fj[j][i]); }
      h.psiMin = pmin; h.psiMax = pmax; h.Fmax = fm;
      if (fm > Fmax) { Fmax = fm; jF = j; }
      if (h.flex) {
        let best = null;
        for (const arr of [R.sTop[j], R.sBot[j]]) {
          let lo = Infinity, hi = -Infinity;
          for (let i = 0; i < N; i++) { lo = min(lo, arr[i]); hi = max(hi, arr[i]); }
          const sa = (hi - lo) / 2, sm = (hi + lo) / 2, n = goodman(sa, sm, c);
          if (!best || n < best.nf) best = { sa, sm, nf: n, smax: max(abs(hi), abs(lo)) };
        }
        let smax = 0; for (let i = 0; i < N; i++) smax = max(smax, abs(R.sTop[j][i]), abs(R.sBot[j][i]));
        h.sa = best.sa; h.sm = best.sm; h.nf = best.nf; h.smax = smax; h.ny = smax > 0 ? c.Sy / smax : Infinity;
        h.sbMax = c.E * c.t * max(abs(pmin), abs(pmax)) / (2 * c.lh);
        if (smax > sigMax) { sigMax = smax; jSig = j; }
        if (h.nf < nf) { nf = h.nf; jNf = j; }
        ny = min(ny, h.ny);
      }
      s.hinges.push(h);
    }
    Object.assign(s, { sigMax, jSig, nf, jNf, ny, Fmax, jF });
    // best drive frequency (lowest RMS motor torque)
    const opt = optimalFrequency(R);
    s.fOpt = opt.f; s.TrmsOpt = opt.rms;
    return s;
  }

  /* ---------------------------------------------------------------- motor torque versus drive frequency */
  // The path θ2(φ) is the same at every frequency, so T(φ; Ω) = Ω² A(φ) + Ω B(φ) + C(φ) exactly.
  function torqueAt(R, f, rigid) {
    const Om = TAU * f, N = R.N;
    let pk = 0, sq = 0;
    for (let i = 0; i < N; i++) {
      const T = Om * Om * R.cA[i] + (rigid ? 0 : Om * R.cB[i] + R.cC[i]);
      pk = max(pk, abs(T)); sq += T * T;
    }
    return { pk, rms: sqrt(sq / N) };
  }
  function freqScan(R, f0, f1, n) {
    const out = { f: new Float64Array(n), pk: new Float64Array(n), rms: new Float64Array(n), pkR: new Float64Array(n), rmsR: new Float64Array(n) };
    for (let q = 0; q < n; q++) {
      const f = f0 * Math.pow(f1 / f0, q / (n - 1));
      const a = torqueAt(R, f, false), b = torqueAt(R, f, true);
      out.f[q] = f; out.pk[q] = a.pk; out.rms[q] = a.rms; out.pkR[q] = b.pk; out.rmsR[q] = b.rms;
    }
    return out;
  }
  function optimalFrequency(R) {
    const fn = R.c.fn, lo = 0.05 * fn, hi = 6 * fn, n = 160;
    let best = 0, bv = Infinity;
    const g = (q) => lo * Math.pow(hi / lo, q / (n - 1));
    for (let q = 0; q < n; q++) { const v = torqueAt(R, g(q), false).rms; if (v < bv) { bv = v; best = q; } }
    let a = g(max(0, best - 1)), b = g(min(n - 1, best + 1));
    const gr = (sqrt(5) - 1) / 2;
    let x1 = b - gr * (b - a), x2 = a + gr * (b - a), f1 = torqueAt(R, x1).rms, f2 = torqueAt(R, x2).rms;
    for (let it = 0; it < 60; it++) {
      if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - gr * (b - a); f1 = torqueAt(R, x1).rms; }
      else { a = x1; x1 = x2; f1 = f2; x2 = a + gr * (b - a); f2 = torqueAt(R, x2).rms; }
    }
    const f = (a + b) / 2;
    return { f, rms: torqueAt(R, f).rms };
  }

  /* ---------------------------------------------------------------- vibration: time integration (RK4) */
  function accel(c, th, w, T) {
    const k = kin(c, th);
    if (!k) return NaN;
    const d = dyn(c, k);
    return (T - 0.5 * d.Mp * w * w - d.C * w - d.Vp) / d.M;
  }
  function energy(c, th, w) {
    const k = kin(c, th);
    if (!k) return NaN;
    const d = dyn(c, k);
    return 0.5 * d.M * w * w + d.V;
  }
  // integrate from (th, w) for nSteps of dt; torque(t) optional; onStep(t, th, w) optional
  function rk4(c, th, w, dt, nSteps, torque, onStep, t0) {
    let t = t0 || 0;
    const Tq = torque || (() => 0);
    for (let n = 0; n < nSteps; n++) {
      const k1v = w, k1a = accel(c, th, w, Tq(t));
      const k2v = w + 0.5 * dt * k1a, k2a = accel(c, th + 0.5 * dt * k1v, k2v, Tq(t + 0.5 * dt));
      const k3v = w + 0.5 * dt * k2a, k3a = accel(c, th + 0.5 * dt * k2v, k3v, Tq(t + 0.5 * dt));
      const k4v = w + dt * k3a, k4a = accel(c, th + dt * k3v, k4v, Tq(t + dt));
      th += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
      w += dt / 6 * (k1a + 2 * k2a + 2 * k3a + k4a);
      t += dt;
      if (!isFinite(th) || !isFinite(w)) return { th: NaN, w: NaN, t, failed: true };
      if (onStep) onStep(t, th, w);
    }
    return { th, w, t };
  }

  // free vibration released from θ2,0 + a0 at rest; damped unless undamped = true
  function freeVibration(c, a0, nPer, undamped, perPeriod) {
    const cc = undamped ? Object.assign({}, c, { cj: [0, 0, 0, 0] }) : c;
    const spp = perPeriod || 160, Tn = TAU / c.wn, dt = Tn / spp, n = Math.round(nPer * spp);
    const t = new Float64Array(n + 1), x = new Float64Array(n + 1), v = new Float64Array(n + 1), En = new Float64Array(n + 1);
    let th = c.th0 + a0, w = 0, k = 0;
    t[0] = 0; x[0] = a0; v[0] = 0; En[0] = energy(cc, th, 0);
    const peaks = [], ups = [];
    let prevW = 0, prevTh = th, prevX = a0;
    const r = rk4(cc, th, w, dt, n, null, (tt, th1, w1) => {
      k++;
      t[k] = tt; x[k] = th1 - c.th0; v[k] = w1; En[k] = energy(cc, th1, w1);
      if (prevW > 0 && w1 <= 0) {               // a maximum of θ: interpolate
        const f = prevW / (prevW - w1);
        peaks.push({ t: tt - dt + f * dt, x: prevTh - c.th0 + f * (th1 - prevTh) });
      }
      if (prevX < 0 && th1 - c.th0 >= 0) { const f = -prevX / (th1 - c.th0 - prevX); ups.push(tt - dt + f * dt); }
      prevW = w1; prevTh = th1; prevX = th1 - c.th0;
    });
    const out = { t, x, v, E: En, n: k, peaks, ups, failed: !!r.failed };
    if (ups.length >= 2) out.period = (ups[ups.length - 1] - ups[0]) / (ups.length - 1);
    const pk = [{ t: 0, x: a0 }].concat(peaks);
    if (pk.length >= 3 && pk[pk.length - 1].x > 0) {
      const m = pk.length - 1;
      out.logDec = Math.log(pk[0].x / pk[m].x) / m;
    }
    return out;
  }

  /* ---------------------------------------------------------------- backbone: period of free oscillation by quadrature */
  function Vat(c, th) { const k = kin(c, th); return k ? dyn(c, k).V : NaN; }
  function Mat(c, th) { const k = kin(c, th); return k ? dyn(c, k).M : NaN; }
  // undamped oscillation between θ− and θ+ = θ0 + a:  T = 2 ∫ sqrt(M / (2 (E − V))) dθ
  function periodQuad(c, a, n) {
    n = n || 400;
    const thp = c.th0 + a, E = Vat(c, thp);
    if (!isFinite(E) || E <= 0) return NaN;
    let lo = c.th0 - a, it = 0;
    while (Vat(c, lo) < E && it < 40) { lo -= 0.5 * a; it++; if (!isFinite(Vat(c, lo))) return NaN; }
    let hi = c.th0;
    for (let q = 0; q < 80; q++) { const m = 0.5 * (lo + hi); if (Vat(c, m) > E) lo = m; else hi = m; }
    const thm = 0.5 * (lo + hi);
    const c0 = 0.5 * (thp + thm), h = 0.5 * (thp - thm);
    let sum = 0;
    for (let q = 0; q < n; q++) {
      const u = -PI / 2 + (q + 0.5) * PI / n;
      const th = c0 + h * sin(u);
      const k = kin(c, th);
      if (!k) return NaN;
      const d = dyn(c, k);
      const dE = E - d.V;
      if (dE <= 0) continue;
      sum += h * cos(u) * sqrt(d.M / (2 * dE));
    }
    return { T: 2 * sum * PI / n, thMinus: thm };
  }
  function backbone(c, aMax, n) {
    const a = [], f = [];
    for (let q = 1; q <= n; q++) {
      const aa = aMax * q / n;
      const P = periodQuad(c, aa);
      if (!P || !isFinite(P.T)) continue;
      a.push(aa / D2R); f.push(1 / P.T / c.fn);
    }
    return { a: Float64Array.from(a), ratio: Float64Array.from(f) };
  }

  /* ---------------------------------------------------------------- forced vibration under a harmonic torque */
  const MF = (r, z) => 1 / sqrt((1 - r * r) * (1 - r * r) + (2 * z * r) * (2 * z * r));
  const PHASE = (r, z) => atan2(2 * z * r, 1 - r * r) / D2R;
  // frequency sweep by time integration with continuation (each step starts from the last state)
  // settle: number of time constants 1/(ζ ω_n) simulated before the amplitude is measured
  function forcedSweep(c, rList, T0, dir, settle) {
    settle = settle || 6;
    const order = dir < 0 ? rList.slice().reverse() : rList.slice();
    let th = c.th0, w = 0, t = 0;
    const out = [];
    for (const r of order) {
      const Om = r * c.wn, Tf = TAU / Om, spp = 100, dt = Tf / spp;
      const nSet = Math.max(10, Math.min(160, Math.ceil(settle * r / (TAU * max(c.zeta, 0.002)))));
      const tq = (tt) => T0 * sin(Om * tt);
      let res = rk4(c, th, w, dt, nSet * spp, tq, null, t);
      if (res.failed) { out.push({ r, amp: NaN }); th = c.th0; w = 0; t = 0; continue; }
      th = res.th; w = res.w; t = res.t;
      let lo = Infinity, hi = -Infinity;
      res = rk4(c, th, w, dt, 2 * spp, tq, (tt, a) => { lo = min(lo, a); hi = max(hi, a); }, t);
      if (res.failed) { out.push({ r, amp: NaN }); th = c.th0; w = 0; t = 0; continue; }
      th = res.th; w = res.w; t = res.t;
      out.push({ r, amp: (hi - lo) / 2 });
    }
    return dir < 0 ? out.reverse() : out;
  }

  /* ---------------------------------------------------------------- static characteristic over a wide input range */
  function staticRange(c, span) {
    span = span || 60 * D2R;
    const st = 0.25 * D2R;
    let lo = c.th0, hi = c.th0;
    while (hi - c.th0 < span && kin(c, hi + st) && kin(c, hi + st).mu > 3 && kin(c, hi + st).mu < 177) hi += st;
    while (c.th0 - lo < span && kin(c, lo - st) && kin(c, lo - st).mu > 3 && kin(c, lo - st).mu < 177) lo -= st;
    const n = Math.max(2, Math.round((hi - lo) / st) + 1);
    const o = { th: new Float64Array(n), V: new Float64Array(n), Vp: new Float64Array(n), Vpp: new Float64Array(n), M: new Float64Array(n),
      h3: new Float64Array(n), h4: new Float64Array(n), mu: new Float64Array(n), psi: [0, 1, 2, 3].map(() => new Float64Array(n)), lo, hi };
    for (let q = 0; q < n; q++) {
      const th = lo + (hi - lo) * q / (n - 1), k = kin(c, th), d = dyn(c, k);
      o.th[q] = th / D2R; o.V[q] = d.V; o.Vp[q] = d.Vp; o.Vpp[q] = d.Vpp; o.M[q] = d.M; o.h3[q] = k.h3; o.h4[q] = k.h4; o.mu[q] = k.mu;
      for (let j = 0; j < 4; j++) o.psi[j][q] = d.psi[j] / D2R;
    }
    return o;
  }

  /* ---------------------------------------------------------------- live self-checks */
  function relErr(a, b) { const d = max(abs(a), abs(b)); return d === 0 ? 0 : abs(a - b) / d; }
  function selfChecks(R) {
    const c = R.c, N = R.N, ch = {};
    let e = 0, ref = 1e-30;
    for (let i = 0; i < N; i++) { e = max(e, abs(R.Tne[i] - R.T[i])); ref = max(ref, abs(R.T[i])); }
    ch.neVsLagrange = e / ref;
    // finite-difference checks at 9 points of the swing
    let eh = 0, ehp = 0, eM = 0, eV = 0, eVV = 0, eF = 0, eLoop = 0;
    const sc = { h: 1e-30, hp: 1e-30, M: 1e-30, V: 1e-30, VV: 1e-30 };
    const K1 = c.r1 / c.r2, K2 = c.r1 / c.r4, K3 = (c.r2 * c.r2 - c.r3 * c.r3 + c.r4 * c.r4 + c.r1 * c.r1) / (2 * c.r2 * c.r4);
    for (let q = 0; q < 9; q++) {
      const th = c.thc + c.Th * sin(TAU * q / 9 + 0.3), eps = 1e-6;
      const k = kin(c, th), kp = kin(c, th + eps), km = kin(c, th - eps);
      if (!k || !kp || !km) continue;
      const d = dyn(c, k), dp = dyn(c, kp), dm = dyn(c, km);
      eh = max(eh, abs((wrap(kp.t3 - km.t3)) / (2 * eps) - k.h3), abs(wrap(kp.t4 - km.t4) / (2 * eps) - k.h4)); sc.h = max(sc.h, abs(k.h3), abs(k.h4));
      ehp = max(ehp, abs((kp.h3 - km.h3) / (2 * eps) - k.h3p), abs((kp.h4 - km.h4) / (2 * eps) - k.h4p)); sc.hp = max(sc.hp, abs(k.h3p), abs(k.h4p), k.h3 * k.h3, k.h4 * k.h4);
      eM = max(eM, abs((dp.M - dm.M) / (2 * eps) - d.Mp)); sc.M = max(sc.M, abs(d.Mp), d.M);
      eV = max(eV, abs((dp.V - dm.V) / (2 * eps) - d.Vp)); sc.V = max(sc.V, abs(d.Vp));
      eVV = max(eVV, abs((dp.Vp - dm.Vp) / (2 * eps) - d.Vpp)); sc.VV = max(sc.VV, abs(d.Vpp));
      eF = max(eF, abs(K1 * cos(k.t4) - K2 * cos(k.t2) + K3 - cos(k.t2 - k.t4)));
      eLoop = max(eLoop, abs(hypot(k.Bx - c.r1, k.By) - c.r4) / c.r4);
    }
    ch.hFD = eh / sc.h; ch.hpFD = ehp / sc.hp; ch.MpFD = eM / sc.M; ch.VpFD = eV / sc.V; ch.VppFD = eVV / sc.VV; ch.freud = eF; ch.loop = eLoop;
    // energy balance over the cycle: input work = work of the damping torque; conservative torques do no net work
    const dphi = TAU / N;
    let Wd = 0, Wc = 0, Wabs = 1e-30;
    for (let i = 0; i < N; i++) {
      const dth = c.Th * cos(TAU * i / N) * dphi;
      Wd += R.TD[i] * dth; Wc += (R.TI[i] + R.TK[i]) * dth; Wabs += abs(R.TI[i] + R.TK[i]) * abs(dth);
    }
    ch.workBalance = relErr(R.summary.Win, Wd);
    ch.consWork = abs(Wc) / Wabs;
    let r3 = 0, r3ref = 1e-30;
    for (let i = 0; i < N; i++) { r3 = max(r3, abs(R.res3B[i])); r3ref = max(r3ref, abs(R.T[i]), abs(R.Mk[0][i]) + abs(R.Mk[1][i]) + abs(R.Mk[2][i])); }
    ch.momentB = r3 / r3ref;
    // undamped free vibration: energy conservation and small-amplitude frequency
    const fv = freeVibration(c, min(c.Th, 10 * D2R), 4, true, 400);
    let emax = 0; for (let q = 0; q <= fv.n; q++) emax = max(emax, abs(fv.E[q] - fv.E[0]));
    ch.energyDrift = fv.E[0] > 0 ? emax / fv.E[0] : NaN;
    const small = freeVibration(c, 0.02 * D2R, 3, true, 400);
    ch.linFreq = small.period ? relErr(1 / small.period, c.fn) : NaN;
    // backbone (quadrature) vs simulation at the larger amplitude
    const P = periodQuad(c, min(c.Th, 10 * D2R), 600);
    ch.quadVsSim = P && fv.period ? relErr(P.T, fv.period) : NaN;
    ch.quadT = P ? P.T : NaN; ch.simT = fv.period;
    // logarithmic decrement at small amplitude vs 2πζ/√(1−ζ²)
    if (c.zeta > 0 && c.zeta < 0.5) {
      const dv = freeVibration(c, 0.05 * D2R, 4, false, 400);
      ch.logDec = dv.logDec; ch.logDecTh = TAU * c.zeta / sqrt(1 - c.zeta * c.zeta);
      ch.logDecErr = relErr(dv.logDec, ch.logDecTh);
    } else ch.logDecErr = NaN;
    return ch;
  }

  /* ---------------------------------------------------------------- benchmarks */
  // A. Parallelogram (r1 = r3, r2 = r4) with four identical flexures: exact closed form
  //    h3 = 0, h4 = 1  ⇒  K_eq = 4K,  M = I_O2 + I_O4 + (m3 + m_p) r2²,  and the system is exactly linear.
  function parallelogramBenchmark() {
    const p = { r1: 80, r2: 50, r3: 80, r4: 50, th0: 90, asm: 'open', mat: 'al', flex: 'all', lh: 6, t: 0.4, b: 10, w: 10, mp: 100, pc: 0.5, po: 0, zeta: 1, amp: 15, bias: 0, f: 20 };
    const c = derive(p);
    const Keq = 4 * c.K, M = c.IO2 + c.IO4 + (c.m3 + c.mp) * c.r2 * c.r2;
    const fn = sqrt(Keq / M) / TAU;
    const fv = freeVibration(c, 15 * D2R, 4, true, 400);
    const k = kin(c, c.th0 + 0.2);
    return {
      p, rows: [
        { q: 'Equivalent stiffness $K_{eq}$', unit: 'N·m/rad', closed: Keq, num: c.Keq0 },
        { q: 'Equivalent inertia $M$', unit: 'kg·m²', closed: M, num: c.M0 },
        { q: 'Natural frequency $f_n$', unit: 'Hz', closed: fn, num: c.fn },
        { q: 'Frequency of a 15° free swing (RK4)', unit: 'Hz', closed: fn, num: 1 / fv.period },
        { q: 'Coupler coefficient $h_3$ at 101.5°', unit: '', closed: 0, num: k.h3, abs: true },
        { q: 'Output coefficient $h_4$ at 101.5°', unit: '', closed: 1, num: k.h4 },
      ],
    };
  }
  // B. Forced response of the (exactly linear) parallelogram: simulated amplitude vs magnification factor
  function frfBenchmark() {
    const p = { r1: 80, r2: 50, r3: 80, r4: 50, th0: 90, asm: 'open', mat: 'al', flex: 'all', lh: 6, t: 0.4, b: 10, w: 10, mp: 100, pc: 0.5, po: 0, zeta: 5, amp: 5, bias: 0, f: 20 };
    const c = derive(p);
    const Xst = 2 * D2R, T0 = c.Keq0 * Xst;
    const rows = [];
    for (const r of [0.5, 1, 1.5]) {
      const sw = forcedSweep(c, [r], T0, 1, 14)[0];
      rows.push({ r, sim: sw.amp / D2R, th: Xst * MF(r, c.zeta) / D2R });
    }
    return { zeta: c.zeta, Xst: Xst / D2R, rows };
  }

  /* ---------------------------------------------------------------- one instant for the step-by-step solution */
  function instant(c, phiDeg) {
    const ph = phiDeg * D2R;
    const th = c.thc + c.Th * sin(ph);
    const w2 = c.Om * c.Th * cos(ph), a2 = -c.Om * c.Om * c.Th * sin(ph);
    const s = state(c, th, w2, a2);
    return s;
  }

  /* ---------------------------------------------------------------- what-if */
  const SENS_KEYS = ['r2', 'r3', 'r4', 'lh', 't', 'b', 'w', 'mp', 'zeta', 'amp', 'f'];
  const SENS_OUTS = ['fn', 'Tmax', 'Trms', 'Pavg', 'sigMax', 'nf'];
  function outs(R) {
    if (!R || R.err) return null;
    const s = R.summary;
    return { fn: s.fn, Tmax: s.Tmax, Trms: s.Trms, Pavg: s.Pavg, sigMax: s.sigMax, nf: s.nf };
  }
  function sensitivity(p) {
    const res = {}, h = 0.01;
    for (const k of SENS_KEYS) {
      const up = outs(solve(Object.assign({}, p, { [k]: p[k] * (1 + h) }), { N: 360 }));
      const dn = outs(solve(Object.assign({}, p, { [k]: p[k] * (1 - h) }), { N: 360 }));
      res[k] = {};
      for (const o of SENS_OUTS) {
        res[k][o] = up && dn && up[o] > 0 && dn[o] > 0 && isFinite(up[o]) && isFinite(dn[o]) ? (Math.log(up[o]) - Math.log(dn[o])) / (Math.log(1 + h) - Math.log(1 - h)) : NaN;
      }
    }
    return res;
  }
  // design maps over hinge thickness t (log axis) and hinge length l
  function designMap(p, nx, ny, tlo, thi, llo, lhi) {
    const fn = new Float32Array(nx * ny), nf = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const t = tlo * Math.pow(thi / tlo, i / (nx - 1)), l = llo + (lhi - llo) * j / (ny - 1);
        const R = solve(Object.assign({}, p, { t, lh: l }), { N: 180 });
        fn[j * nx + i] = R.err ? NaN : R.c.fn;
        nf[j * nx + i] = R.err ? NaN : R.summary.nf;
      }
    }
    return { fn, nf, nx, ny, tlo, thi, llo, lhi };
  }

  const Engine = {
    MATERIALS, HINGE, HINGE_TEX, HINGE_AT, D2R, derive, kin, dyn, state, solve, instant, summarize, torqueAt, freqScan, optimalFrequency,
    freeVibration, periodQuad, backbone, forcedSweep, MF, PHASE, staticRange, selfChecks, parallelogramBenchmark, frfBenchmark,
    SENS_KEYS, SENS_OUTS, sensitivity, designMap, relErr, goodman, wrap,
  };
  root.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof self !== 'undefined' ? self : globalThis);
