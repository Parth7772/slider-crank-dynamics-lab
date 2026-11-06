/*!
 * engine.js — computation engine for the single-cylinder slider-crank IC engine
 * Dynamics of Machinery course project.
 *
 * Everything here is pure computation (no DOM), so the same file runs in the
 * browser, in a Web Worker and in Node (tests/verify.js).
 *
 * Sign conventions
 *   • Origin at crank centre O; x-axis along the line of stroke, pointing toward the piston.
 *   • Crank angle θ is measured from the inner dead centre (TDC), counter-clockwise, constant ω.
 *   • Piston displacement x is measured from TDC toward the crank (x = 0 … 2r).
 *   • Gas force, piston effort, rod thrust: positive when they push toward the crank
 *     (rod thrust positive = compression).
 *   • Crankshaft torque T: positive when it drives the shaft in the direction of rotation.
 *   • Four-stroke cycle angle ψ = 0 … 720°: 0 TDC (start of suction), 180 BDC,
 *     360 firing TDC, 540 BDC, 720 TDC.
 *
 * Units: SI internally (m, kg, s, N, Pa, J). User inputs are converted in setup().
 */
(function (root) {
  'use strict';

  const G0 = 9.80665;            // m/s²
  const P_ATM = 101325;          // Pa — crank-case pressure
  const P_EXH = 1.05 * P_ATM;    // Pa — exhaust back-pressure
  const Q_FULL = 2.6e6;          // J/m³ — net heat released per m³ of swept volume at full load, 1 atm intake (= 2.6 kJ/L)
  const WIEBE_A = 5;             // Wiebe efficiency parameter (99.3 % burned at end of Δθ_b)
  const WIEBE_M = 2;             // Wiebe form factor
  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;

  const DEFAULTS = {
    bore: 86, r: 43, n: 3.4, CR: 10,
    mp: 0.45, mc: 0.55, lG: 0.30, kG: 0.28,
    N: 3000, orient: 'v',
    model: 'wiebe', load: 80, pin: 1.0, gamma: 1.30, soc: 20, dur: 50,
    Cs: 2, Dfw: 300, rho: 7250, bt: 2,
    cbal: 0.5,
  };

  /* ------------------------------------------------------------------ setup */
  function setup(p, over) {
    const R = p.r / 1000;
    const n = Math.max(+p.n, 1.05);
    const L = n * R;
    const D = p.bore / 1000;
    const A = Math.PI * D * D / 4;
    const Vs = 2 * R * A;
    const CR = Math.max(+p.CR, 1.2);
    const Vc = Vs / (CR - 1);
    const w = 2 * Math.PI * p.N / 60;
    const mc = Math.max(+p.mc, 0);
    const kG = p.kG * L;
    const pin = p.pin * 1e5;
    const burns = p.model === 'wiebe' || p.model === 'otto';
    const Q = burns ? (p.load / 100) * Q_FULL * Vs * (pin / P_ATM) : 0;
    const vertical = p.orient === 'v';
    const c = {
      R, n, L, D, A, Vs, Vc, CR, w,
      mp: Math.max(+p.mp, 0), mc, lam: +p.lG, IG: mc * kG * kG, kGl: kG,
      gx: vertical ? -G0 : 0, gy: vertical ? 0 : -G0,
      pin, pex: P_EXH, gamma: +p.gamma, model: p.model, Q,
      th0: (360 - p.soc) * D2R, dth: Math.max(+p.dur, 1) * D2R,
      cbal: +p.cbal,
    };
    if (over) Object.assign(c, over);
    return c;
  }

  /* ------------------------------------------------------------ kinematics */
  function xOf(c, th) {
    const s = Math.sin(th);
    return c.R * (1 - Math.cos(th) + c.n - Math.sqrt(c.n * c.n - s * s));
  }
  function volume(c, th) { return c.Vc + c.A * xOf(c, th); }

  /* -------------------------------------------------- cylinder gas pressure */
  // Single-zone first-law model: dp/dθ = −γ p V′/V + (γ−1) Q′/V,
  // heat release from the Wiebe function x_b = 1 − exp[−a((θ−θ0)/Δθ)^(m+1)].
  function dpdth(c, th, p) {
    const s = Math.sin(th), co = Math.cos(th);
    const root = Math.sqrt(c.n * c.n - s * s);
    const V = c.Vc + c.A * c.R * (1 - co + c.n - root);
    const dV = c.A * c.R * (s + s * co / root);
    let dQ = 0;
    if (c.Q > 0) {
      const u = (th - c.th0) / c.dth;
      if (u > 0) {
        const um = Math.pow(u, WIEBE_M);
        dQ = c.Q * WIEBE_A * (WIEBE_M + 1) / c.dth * um * Math.exp(-WIEBE_A * um * u);
      }
    }
    return (-c.gamma * p * dV + (c.gamma - 1) * dQ) / V;
  }

  function pressureTrace(c, M, res) {
    const P = new Float64Array(M);
    const iB1 = Math.round(180 / res), iB2 = Math.round(540 / res), iT = Math.round(360 / res);
    if (c.model === 'none') { P.fill(P_ATM); return { P, pEVO: P_ATM }; }
    for (let i = 0; i < M; i++) P[i] = i < iB1 ? c.pin : c.pex;        // suction / exhaust strokes

    if (c.model === 'otto') {                                          // air-standard Otto cycle
      const Vb = c.Vc + c.Vs;
      const p2 = c.pin * Math.pow(c.CR, c.gamma);
      const p3 = p2 + (c.gamma - 1) * c.Q / c.Vc;                     // constant-volume heat addition
      for (let i = iB1; i < iB2; i++) {
        const V = volume(c, i * res * D2R);
        P[i] = i < iT ? c.pin * Math.pow(Vb / V, c.gamma) : p3 * Math.pow(c.Vc / V, c.gamma);
      }
      return { P, pEVO: p3 * Math.pow(1 / c.CR, c.gamma) };
    }
    // motoring & Wiebe: integrate the closed part (BDC → BDC) with classical RK4
    const sub = Math.max(1, Math.ceil(res / 0.25));
    const h = res * D2R / sub;
    let p = c.pin, th = iB1 * res * D2R;
    for (let i = iB1; i < iB2; i++) {
      for (let k = 0; k < sub; k++) {
        const k1 = dpdth(c, th, p);
        const k2 = dpdth(c, th + h / 2, p + h / 2 * k1);
        const k3 = dpdth(c, th + h / 2, p + h / 2 * k2);
        const k4 = dpdth(c, th + h, p + h * k3);
        p += h / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
        th += h;
      }
      if (i + 1 < iB2) P[i + 1] = p;
    }
    return { P, pEVO: p };
  }

  /* ------------------------------------------- dynamics at one crank angle */
  // Exact Newton–Euler solution of piston + connecting rod (rigid, with mass and
  // moment of inertia) at constant crank speed. Writes results into `o`.
  function point(c, th, pg, o) {
    const S = Math.sin(th), C = Math.cos(th), n = c.n, R = c.R, w = c.w, w2 = w * w;
    const root = Math.sqrt(n * n - S * S), r3 = root * root * root;

    // piston kinematics (exact)
    o.x = R * (1 - C + n - root);
    o.xth = R * (S + S * C / root);                                   // dx/dθ
    o.v = w * o.xth;
    o.a = w2 * R * (C + (n * n * (C * C - S * S) + S * S * S * S) / r3);
    o.vApx = w * R * (S + 2 * S * C / (2 * n));
    o.aApx = w2 * R * (C + (C * C - S * S) / n);
    // connecting rod
    o.phi = Math.asin(S / n);
    o.omc = w * C / root;
    o.alc = -w2 * S * (n * n - 1) / r3;

    // positions, velocities, accelerations of C (crank pin), P (gudgeon pin), G (rod CG)
    const Bx = R * C, By = R * S, Px = R * (C + root);
    const Bvx = -R * w * S, Bvy = R * w * C, Pvx = -o.v;
    const Bax = -R * w2 * C, Bay = -R * w2 * S, Pax = -o.a;
    const lam = c.lam;
    const Gx = Bx + lam * (Px - Bx), Gy = By * (1 - lam);
    const Gvx = Bvx + lam * (Pvx - Bvx), Gvy = Bvy * (1 - lam);
    const Gax = Bax + lam * (Pax - Bax), Gay = Bay * (1 - lam);
    const bd = -o.omc, bdd = -o.alc;                                  // rod line P→C makes angle π−φ with x

    const Fg = pg * c.A;                                              // net gas force on piston (toward crank)
    // Piston:  m_p a_P = gas + rod + wall + weight   →  Fx (rod on piston, +x = away from crank)
    const Fx = c.mp * Pax + Fg - c.mp * c.gx;
    // Rod:  I_G β̈ = (r_C − r_P) × F + (r_C − r_G) × m_c (a_G − g)
    const ux = Gax - c.gx, uy = Gay - c.gy;
    const dx = Bx - Px, dy = By;
    const cross = (Bx - Gx) * c.mc * uy - (By - Gy) * c.mc * ux;
    const Fy = (c.IG * bdd - cross + dy * Fx) / dx;
    const N = -Fy - c.mp * c.gy;                                      // cylinder-wall reaction on piston
    const FBx = c.mc * ux + Fx, FBy = c.mc * uy + Fy;                 // crank pin on rod
    const T = -Bx * FBy + By * FBx;                                   // torque of rod on crank about O

    o.Fg = Fg;
    o.Fi = c.mp * o.a;                                                // inertia force of piston
    o.Fp = Fx;                                                        // piston effort
    o.Fq = -(Fx * dx + Fy * dy) / c.L;                                // rod thrust at small end (+ compression)
    o.Fn = N;                                                         // side thrust
    o.Ft = T / R;                                                     // tangential force on crank pin
    o.Fr = FBx * C + FBy * S;                                         // radial force on crank pin (+ toward O)
    o.pin = Math.hypot(FBx, FBy);                                     // crank-pin load
    o.gud = Math.hypot(Fx, Fy);                                       // gudgeon-pin load
    o.T = T;
    o.Tg = Fg * o.xth;                                                // torque due to gas force alone

    // Independent check by the energy (virtual-power) method:
    // T ω = F_g v − d(KE)/dt + (power of gravity)
    const Pkin = c.mp * Pax * Pvx + c.mc * (Gax * Gvx + Gay * Gvy) + c.IG * bdd * bd;
    const Pgrav = c.mp * c.gx * Pvx + c.mc * (c.gx * Gvx + c.gy * Gvy);
    o.Te = w > 0 ? (Fg * o.v - Pkin + Pgrav) / w : T;

    // Textbook approximation (two-mass equivalent rod, approximate acceleration, no correction couple)
    const mR = c.mp + lam * c.mc, mRot = (1 - lam) * c.mc;
    o.Ttb = (Fg - mR * o.aApx - mR * c.gx) * o.xth;

    // Shaking force on the frame = −Σ m a of moving parts (+ counterweight at radius r, opposite the crank pin)
    const mcw = mRot + c.cbal * mR;
    o.shx = -(c.mp * Pax + c.mc * Gax + mcw * R * w2 * C);
    o.shy = -(c.mc * Gay + mcw * R * w2 * S);
    o.sh0x = -(c.mp * Pax + c.mc * Gax + mRot * R * w2 * C);           // only revolving mass balanced (c = 0)
    o.sh0y = -(c.mc * Gay + mRot * R * w2 * S);
    o.prim = mR * R * w2 * C;                                         // primary unbalanced force
    o.sec = mR * R * w2 * (C * C - S * S) / n;                        // secondary unbalanced force
    return o;
  }

  /* ------------------- textbook method: dynamically equivalent two-mass rod */
  // The rod is replaced by m1 at the gudgeon pin and m2 at the crank pin (same mass, same CG).
  // That system has the wrong moment of inertia, I2 = m_c l1 (l − l1), so a correction couple
  // T' = (I2 − I_G) α_c = m_c l1 (l − L) α_c is added (L = l1 + k_G²/l1). Its effect on the crank is
  // T_c = T' cosθ / √(n² − sin²θ). With the exact acceleration this method is exact.
  function equivalent(c, th, pg) {
    const S = Math.sin(th), C = Math.cos(th), n = c.n, R = c.R, w = c.w, w2 = w * w;
    const root = Math.sqrt(n * n - S * S), r3 = root * root * root;
    const phi = Math.asin(S / n);
    const x = R * (1 - C + n - root);
    const xth = R * (S + S * C / root);
    const v = w * xth;
    const a = w2 * R * (C + (n * n * (C * C - S * S) + S * S * S * S) / r3);
    const aApx = w2 * R * (C + (C * C - S * S) / n);
    const l1 = (1 - c.lam) * c.L;                 // CG distance from the small end
    const m1 = c.mc * c.lam, m2 = c.mc - m1;      // shares at gudgeon pin and crank pin
    const mR = c.mp + m1;
    const Fg = pg * c.A;
    const FI = mR * a;
    const WR = -mR * c.gx;                        // weight of reciprocating parts along the stroke (vertical engine)
    const FP = Fg - FI + WR;
    const FQ = FP / Math.cos(phi), FN = FP * Math.tan(phi);
    const FT = FQ * Math.sin(th + phi), FR = FQ * Math.cos(th + phi);
    const T1 = FT * R;
    const alc = -w2 * S * (n * n - 1) / r3;
    const I2 = c.mc * l1 * (c.L - l1);
    const Leq = l1 > 0 ? l1 + c.kGl * c.kGl / l1 : NaN;
    const Tprime = (I2 - c.IG) * alc;
    const Tc = Tprime * C / root;
    const Tw = m2 * (c.gx * (-R * S) + c.gy * (R * C));   // weight of the crank-pin share m2
    return { S, C, root, phi, x, v, a, aApx, l1, m1, m2, mR, Fg, FI, WR, FP, FQ, FN, FT, FR, T1, alc, I2, Leq, Tprime, Tc, Tw, T: T1 + Tc + Tw };
  }

  /* ---------------------- turning-moment diagram: loop areas (textbook table) */
  function tmdLoops(res) {
    const s = res.summary, M = s.M, h = s.res * D2R, Tm = s.Tmean, T = res.T;
    const d = (i) => T[((i % M) + M) % M] - Tm;
    let start = -1;
    for (let i = 0; i < M; i++) if (d(i) !== 0 && d(i) * d(i + 1) < 0) { start = i; break; }
    if (start < 0) return [];
    const loops = [];
    const f0 = d(start) / (d(start) - d(start + 1));
    let from = (start + f0) * s.res, area = 0.5 * d(start + 1) * (1 - f0) * h;
    for (let k = 1; k <= M; k++) {
      const i = start + k, a = d(i), b = d(i + 1);
      if (k < M && a * b < 0) {
        const f = a / (a - b);
        area += 0.5 * a * f * h;
        const to = (i + f) * s.res;
        loops.push({ from: from % 720, to: to % 720, area });
        from = to; area = 0.5 * b * (1 - f) * h;
      } else if (k < M) area += 0.5 * (a + b) * h;
      else { area += 0.5 * a * f0 * h; loops.push({ from: from % 720, to: (start + f0) * s.res % 720, area }); }
    }
    let E = 0;
    for (const L of loops) { E += L.area; L.E = E; }
    return loops;
  }

  const ARRAY_KEYS = ['x', 'v', 'a', 'vApx', 'aApx', 'phi', 'omc', 'alc', 'Fg', 'Fi', 'Fp', 'Fq', 'Fn', 'Ft', 'Fr',
    'pin', 'gud', 'T', 'Tg', 'Te', 'Ttb', 'shx', 'shy', 'sh0x', 'sh0y', 'prim', 'sec'];

  /* ----------------------------------------------------------- full cycle */
  function solve(p, opt) {
    opt = opt || {};
    const res = opt.res || 0.5;
    const light = !!opt.light;
    const M = Math.round(720 / res);
    const h = res * D2R;
    const c = setup(p, opt.over);
    const pt = opt.P ? { P: opt.P, pEVO: NaN } : pressureTrace(c, M, res);
    const P = pt.P;
    const T = new Float64Array(M), V = new Float64Array(M);
    const A = {};
    if (!light) for (const k of ARRAY_KEYS) A[k] = new Float64Array(M);
    const o = {};
    const s = {
      pinMax: 0, gudMax: 0, FnMax: 0, FqMax: -Infinity, FqMin: Infinity, shMax: 0, sh0Max: 0,
      Tmax: -Infinity, Tmin: Infinity, iTmax: 0, iTmin: 0, vMax: 0, aMax: -Infinity, aMin: Infinity,
      alcMax: 0, omcMax: 0, pmax: 0, iPmax: 0, NEerr: 0, primMax: 0, secMax: 0,
    };
    for (let i = 0; i < M; i++) {
      const th = i * h;
      point(c, th, P[i] - P_ATM, o);
      T[i] = o.T;
      V[i] = c.Vc + c.A * o.x;
      if (!light) for (const k of ARRAY_KEYS) A[k][i] = o[k];
      if (o.pin > s.pinMax) s.pinMax = o.pin;
      if (o.gud > s.gudMax) s.gudMax = o.gud;
      if (Math.abs(o.Fn) > s.FnMax) s.FnMax = Math.abs(o.Fn);
      if (o.Fq > s.FqMax) s.FqMax = o.Fq;
      if (o.Fq < s.FqMin) s.FqMin = o.Fq;
      const sh = Math.hypot(o.shx, o.shy), sh0 = Math.hypot(o.sh0x, o.sh0y);
      if (sh > s.shMax) s.shMax = sh;
      if (sh0 > s.sh0Max) s.sh0Max = sh0;
      if (o.T > s.Tmax) { s.Tmax = o.T; s.iTmax = i; }
      if (o.T < s.Tmin) { s.Tmin = o.T; s.iTmin = i; }
      if (Math.abs(o.v) > s.vMax) s.vMax = Math.abs(o.v);
      if (o.a > s.aMax) s.aMax = o.a;
      if (o.a < s.aMin) s.aMin = o.a;
      if (Math.abs(o.alc) > s.alcMax) s.alcMax = Math.abs(o.alc);
      if (Math.abs(o.omc) > s.omcMax) s.omcMax = Math.abs(o.omc);
      if (Math.abs(o.prim) > s.primMax) s.primMax = Math.abs(o.prim);
      if (Math.abs(o.sec) > s.secMax) s.secMax = Math.abs(o.sec);
      if (P[i] > s.pmax) { s.pmax = P[i]; s.iPmax = i; }
      const e = Math.abs(o.T - o.Te);
      if (e > s.NEerr) s.NEerr = e;
    }

    // cycle work: ∫T dθ (periodic trapezoid) and ∮p dV (trapezoid in V)
    let W = 0, Wpdv = 0, Wabs = 0;
    for (let i = 0; i < M; i++) {
      W += T[i] * h;
      Wabs += Math.abs(T[i]) * h;
      const j = (i + 1) % M;
      Wpdv += 0.5 * (P[i] + P[j]) * (V[j] - V[i]);
    }
    // inertia-only cycles do zero net work: remove floating-point round-off
    if (Math.abs(W) < 1e-10 * Wabs) W = 0;
    if (c.model === 'none') Wpdv = 0;                                 // constant pressure: ∮p dV = 0 exactly
    const Tmean = W / (4 * Math.PI);

    // fluctuation of energy E(θ) = ∫(T − T_mean) dθ
    const E = new Float64Array(M + 1);
    let Emax = 0, Emin = 0, iEmax = 0, iEmin = 0, Esum = 0;
    for (let i = 0; i < M; i++) {
      const j = (i + 1) % M;
      E[i + 1] = E[i] + 0.5 * (T[i] + T[j] - 2 * Tmean) * h;
      if (E[i + 1] > Emax) { Emax = E[i + 1]; iEmax = i + 1; }
      if (E[i + 1] < Emin) { Emin = E[i + 1]; iEmin = i + 1; }
    }
    for (let i = 0; i < M; i++) Esum += E[i];
    const Ebar = Esum / M;
    const dE = Emax - Emin;

    // flywheel:  ΔE = I ω² C_s
    const Cs = p.Cs / 100;
    const I = c.w > 0 && Cs > 0 ? dE / (c.w * c.w * Cs) : 0;
    const Rr = p.Dfw / 2000;
    const rho = +p.rho;
    const mrim = I / (Rr * Rr);
    const vr = c.w * Rr;
    const Arim = mrim / (2 * Math.PI * Rr * rho);
    const trim = Math.sqrt(Arim / p.bt), brim = p.bt * trim;

    // optimum balance fraction c (minimises the peak shaking force) — shaking force is linear in c
    let cOpt = 0, shOpt = Infinity;
    if (!light) {
      const mR = c.mp + c.lam * c.mc, k = mR * c.R * c.w * c.w;
      for (let q = 0; q <= 200; q++) {
        const cc = q / 200;
        let mx = 0;
        for (let i = 0; i < M; i += 2) {
          const th = i * h;
          const fx = A.sh0x[i] - cc * k * Math.cos(th), fy = A.sh0y[i] - cc * k * Math.sin(th);
          const f = fx * fx + fy * fy;
          if (f > mx) mx = f;
        }
        if (mx < shOpt) { shOpt = mx; cOpt = cc; }
      }
      shOpt = Math.sqrt(shOpt);
    }

    const sum = Object.assign(s, {
      M, res, W, Wpdv, Wabs, Tmean, Q: c.Q, P: Tmean * c.w, imep: c.Vs > 0 ? W / c.Vs : 0,
      eta: c.Q > 0 ? W / c.Q : NaN, etaOtto: 1 - Math.pow(c.CR, 1 - c.gamma),
      Vs: c.Vs, Vc: c.Vc, A: c.A, L: c.L, w: c.w, pEVO: pt.pEVO,
      psiPmax: s.iPmax * res, psiTmax: s.iTmax * res, psiTmin: s.iTmin * res,
      dE, Emax, Emin, psiEmax: (iEmax % M) * res, psiEmin: (iEmin % M) * res,
      CE: W !== 0 ? dE / Math.abs(W) : NaN,
      I, mrim, vr, sigma: rho * vr * vr, brim, trim, Rr,
      vMean: 4 * c.R * p.N / 60,
      cOpt, shOpt,
    });

    const out = { params: Object.assign({}, p), c, summary: sum, P, V, T };
    if (!light) {
      const psi = new Float64Array(M), omegaN = new Float64Array(M), Pbar = new Float64Array(M);
      const Ein = new Float64Array(M), Tin = new Float64Array(M);
      const wI = I * c.w * c.w;
      for (let i = 0; i < M; i++) {
        psi[i] = i * res;
        omegaN[i] = p.N * (1 + (wI > 0 ? (E[i] - Ebar) / wI : 0));
        Pbar[i] = P[i] / 1e5;
        Ein[i] = E[i];
        Tin[i] = T[i] - A.Tg[i];
      }
      Object.assign(out, A, { psi, Nfly: omegaN, pBar: Pbar, E: Ein, Tin });
      sum.Nmax = Math.max.apply(null, omegaN);
      sum.Nmin = Math.min.apply(null, omegaN);
    }
    return out;
  }

  /* ---------------------------------------------- parameter sensitivity */
  const SENS_KEYS = ['N', 'r', 'n', 'bore', 'mp', 'mc', 'CR', 'load', 'pin', 'Cs', 'Dfw'];
  const SENS_OUTS = ['mrim', 'dE', 'P', 'Tmax', 'pinMax', 'FnMax', 'sh0Max'];
  function sensitivity(p) {
    const out = {};
    const f = 0.01, den = Math.log((1 + f) / (1 - f));
    for (const k of SENS_KEYS) {
      out[k] = {};
      if (!(p[k] > 0)) { for (const q of SENS_OUTS) out[k][q] = NaN; continue; }
      const up = solve(Object.assign({}, p, { [k]: p[k] * (1 + f) }), { res: 1, light: true }).summary;
      const dn = solve(Object.assign({}, p, { [k]: p[k] * (1 - f) }), { res: 1, light: true }).summary;
      for (const q of SENS_OUTS) {
        const a = up[q], b = dn[q];
        out[k][q] = a > 0 && b > 0 ? Math.log(a / b) / den : NaN;
      }
    }
    return out;
  }

  /* ------------------------------------------------- design-space map */
  // x-axis: crank speed N (log), y-axis: obliquity ratio n. Pressure traces are cached per n
  // because, in the crank-angle domain, the gas pressure does not depend on speed.
  function designMap(p, nx, ny, Nlo, Nhi, nlo, nhi) {
    const res = 2, M = 360;
    const mrim = new Float32Array(nx * ny), pinMax = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      const n = nlo + (nhi - nlo) * j / (ny - 1);
      const pj = Object.assign({}, p, { n });
      const Pj = pressureTrace(setup(pj), M, res).P;
      for (let i = 0; i < nx; i++) {
        const N = Nlo * Math.pow(Nhi / Nlo, i / (nx - 1));
        const sm = solve(Object.assign({}, pj, { N }), { res, light: true, P: Pj }).summary;
        mrim[j * nx + i] = sm.mrim;
        pinMax[j * nx + i] = sm.pinMax;
      }
    }
    return { mrim, pinMax, nx, ny, Nlo, Nhi, nlo, nhi };
  }

  /* ------------------------------------------------------ verification */
  function relErr(a, b) { const d = Math.max(Math.abs(a), Math.abs(b), 1e-300); return Math.abs(a - b) / d; }

  // Classic textbook problem: horizontal engine, r = 300 mm, l = 1.2 m, D = 0.5 m, m_R = 250 kg,
  // N = 250 rpm, net pressure 0.35 N/mm² at θ = 60° from IDC. Solved two independent ways.
  function textbookBenchmark() {
    const r = 0.3, n = 4, D = 0.5, m = 250, N = 250, dp = 0.35e6, th = 60 * D2R;
    const w = 2 * Math.PI * N / 60, A = Math.PI * D * D / 4;
    // (i) the textbook (hand-calculation) chain with the approximate acceleration formula
    const FL = dp * A;
    const FI = m * w * w * r * (Math.cos(th) + Math.cos(2 * th) / n);
    const FP = FL - FI;
    const phi = Math.asin(Math.sin(th) / n);
    const FQ = FP / Math.cos(phi), FN = FP * Math.tan(phi), FT = FQ * Math.sin(th + phi), T = FT * r;
    // (ii) this engine's exact Newton–Euler solver (massless rod, weight neglected as in the textbook)
    const c = setup(Object.assign({}, DEFAULTS, { r: 300, n, bore: 500, mp: m, mc: 0, N, orient: 'h' }), { gx: 0, gy: 0 });
    const o = point(c, th, dp, {});
    return [
      { q: 'Inertia force F_I', hand: FI, exact: o.Fi, unit: 'N' },
      { q: 'Piston effort F_P', hand: FP, exact: o.Fp, unit: 'N' },
      { q: 'Thrust on side of cylinder F_N', hand: FN, exact: o.Fn, unit: 'N' },
      { q: 'Thrust in connecting rod F_Q', hand: FQ, exact: o.Fq, unit: 'N' },
      { q: 'Crank effort F_T', hand: FT, exact: o.Ft, unit: 'N' },
      { q: 'Turning moment T', hand: T, exact: o.T, unit: 'N m' },
    ];
  }

  // Air-standard Otto cycle: computed thermal efficiency must equal 1 − r_c^(1−γ)
  function ottoBenchmark() {
    const p = Object.assign({}, DEFAULTS, { model: 'otto', CR: 8, gamma: 1.4, pin: P_EXH / 1e5, load: 100 });
    const s = solve(p, { res: 0.25, light: true }).summary;
    return { num: s.W / s.Q, exact: 1 - Math.pow(8, -0.4) };
  }

  // Live self-consistency checks on the current design
  function selfChecks(res) {
    const s = res.summary, M = s.M;
    let Tabs = 0, Iint = 0, Iabs = 0, kin = 0;
    const h = s.res * D2R;
    for (let i = 0; i < M; i++) {
      Tabs = Math.max(Tabs, Math.abs(res.T[i]));
      Iint += res.Tin[i] * h;
      Iabs += Math.abs(res.Tin[i]) * h;
    }
    // finite-difference check of the closed-form velocity & acceleration
    const c = res.c, hh = 1e-4;
    let vErr = 0, aErr = 0;
    for (let k = 1; k < 36; k++) {
      const th = k * 10 * D2R;
      const o = point(c, th, 0, {});
      const xp = xOf(c, th + hh), xm = xOf(c, th - hh), x0 = xOf(c, th);
      const vfd = c.w * (xp - xm) / (2 * hh);
      const afd = c.w * c.w * (xp - 2 * x0 + xm) / (hh * hh);
      vErr = Math.max(vErr, Math.abs(vfd - o.v) / (c.R * c.w));
      aErr = Math.max(aErr, Math.abs(afd - o.a) / (c.R * c.w * c.w));
    }
    // textbook equivalent-system method (correction couple) vs exact Newton–Euler
    let eqErr = 0;
    for (let i = 0; i < M; i += 4) {
      const q = equivalent(c, i * h, res.P[i] - P_ATM);
      eqErr = Math.max(eqErr, Math.abs(q.T - res.T[i]));
    }
    return {
      eqVsNE: Tabs > 0 ? eqErr / Tabs : 0,
      neVsEnergy: Tabs > 0 ? s.NEerr / Tabs : 0,
      inertiaWork: Iabs > 0 ? Math.abs(Iint) / Iabs : 0,
      workPdv: Math.abs(s.W - s.Wpdv) / Math.max(Math.abs(s.W), Math.abs(s.Wpdv), 1e-9 * s.Wabs, 1e-12),
      vFD: vErr, aFD: aErr,
    };
  }

  const Engine = {
    G0, P_ATM, P_EXH, Q_FULL, WIEBE_A, WIEBE_M, D2R, R2D, DEFAULTS, ARRAY_KEYS, SENS_KEYS, SENS_OUTS,
    setup, xOf, volume, pressureTrace, point, equivalent, tmdLoops, solve, sensitivity, designMap,
    textbookBenchmark, ottoBenchmark, selfChecks, relErr,
  };
  root.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof self !== 'undefined' ? self : globalThis);
