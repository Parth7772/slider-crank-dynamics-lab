/*!
 * mechanism.js — textbook-style animated drawing of the slider-crank (SVG).
 * World frame: origin at crank centre O, +x along the line of stroke toward the piston.
 */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let UID = 0;
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const f = (v) => (Math.round(v * 10) / 10).toString();
  const pts = (arr) => arr.map((p) => f(p[0]) + ',' + f(p[1])).join(' ');

  class Mechanism {
    constructor(host, opts) {
      this.mini = !!(opts && opts.mini);
      const id = ++UID;
      this.svg = el('svg', { class: 'mech-svg', role: 'img', 'aria-label': 'Animated slider-crank mechanism', preserveAspectRatio: 'xMidYMid meet' }, host);
      const defs = el('defs', null, this.svg);
      const pat = el('pattern', { id: 'hatch' + id, width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      el('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#222', 'stroke-width': 1 }, pat);
      const mk = (mid, color) => {
        const m = el('marker', { id: mid, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
        el('path', { d: 'M0,1 L10,5 L0,9 z', fill: color }, m);
      };
      this.arrRed = 'arr' + id; mk(this.arrRed, '#a3142a');
      this.arrInk = 'ark' + id; mk(this.arrInk, '#111');
      this.hatch = 'url(#hatch' + id + ')';
      const g = (cls) => el('g', cls ? { class: cls } : null, this.svg);
      this.gStatic = g();
      this.gDisc = g();
      this.gMove = g();
      this.gDim = g('mech-dim');
      this.gForce = g('mech-force');
      this.gLab = g('mech-lab');
      this.ready = false;
    }

    setGeometry(c, p) {
      const R = c.R, L = c.L, D = c.D;
      const vertical = p.orient === 'v';
      const Lp = 0.75 * D;
      const cl = c.Vc / c.A;
      const sT = R + L, sB = L - R;
      const xH = sT + 0.55 * Lp + cl;
      const wt = 0.13 * D, ht = 0.2 * D;
      const x0 = sB - 0.45 * Lp - 0.06 * D;
      const Rd = Math.max(1.12 * R, Math.min(1.32 * R, x0 - 0.04 * L));
      const xmin = -Math.max(Rd, R) - 0.05 * L, xmax = xH + ht;
      const yext = Math.max(Rd, D / 2 + wt) ;
      const ydim = D / 2 + wt + 0.35 * D + 0.06 * L;      // dimension line below the cylinder
      const ytop = yext + 0.06 * L, ybot = Math.max(yext, this.mini ? 0 : ydim + 0.3 * D + 0.05 * L) + 0.06 * L;
      const xtot = xmax - xmin;
      const pad = this.mini ? 10 : 26;                    // room for the TDC / BDC text below the extension lines
      let k, W, H, map;
      if (!vertical) {
        k = (this.mini ? 600 : 900) / xtot;
        W = k * xtot + 2 * pad; H = k * (ytop + ybot) + 2 * pad;
        const ox = pad - k * xmin, oy = pad + k * ytop;
        map = (x, y) => [ox + k * x, oy - k * y];
      } else {
        k = (this.mini ? 330 : 470) / xtot;
        W = k * (ytop + ybot) + 2 * pad; H = k * xtot + 2 * pad;
        const ox = pad + k * ytop, oy = pad + k * xmax;
        map = (x, y) => [ox - k * y, oy - k * x];
      }
      this.svg.setAttribute('viewBox', '0 0 ' + f(W) + ' ' + f(H));
      this.svg.classList.toggle('vertical', vertical);
      Object.assign(this, { R, L, D, Lp, xH, wt, ht, x0, Rd, k, map, vertical, ydim, sT, sB, lam: c.lam, cbal: c.cbal, W, H });

      // ---------------- static parts: cylinder, head, line of stroke, ground at O
      const S = this.gStatic;
      S.textContent = '';
      const rect = (xa, xb, ya, yb, attrs) => {
        const a = map(xa, ya), b = map(xb, yb);
        return el('rect', Object.assign({ x: f(Math.min(a[0], b[0])), y: f(Math.min(a[1], b[1])), width: f(Math.abs(b[0] - a[0])), height: f(Math.abs(b[1] - a[1])) }, attrs), S);
      };
      const line = (xa, ya, xb, yb, attrs) => { const a = map(xa, ya), b = map(xb, yb); return el('line', Object.assign({ x1: f(a[0]), y1: f(a[1]), x2: f(b[0]), y2: f(b[1]) }, attrs), S); };
      // gas region is dynamic but lives behind the piston
      this.gas = el('polygon', { class: 'mech-gas' }, S);
      rect(x0, xH, D / 2, D / 2 + wt, { fill: this.hatch, stroke: 'none' });
      rect(x0, xH, -D / 2 - wt, -D / 2, { fill: this.hatch, stroke: 'none' });
      rect(xH, xH + ht, -D / 2 - wt, D / 2 + wt, { fill: this.hatch, stroke: 'none' });
      line(x0, D / 2, xH, D / 2, { class: 'mech-edge' });
      line(x0, -D / 2, xH, -D / 2, { class: 'mech-edge' });
      line(xH, -D / 2, xH, D / 2, { class: 'mech-edge' });
      line(xmin + 0.02 * L, 0, xH + ht * 0.5, 0, { class: 'mech-axis' });
      // ground bracket under O (screen-down, whatever the orientation)
      const O = map(0, 0), s = this.mini ? 10 : 14;
      el('polygon', { points: pts([[O[0], O[1]], [O[0] - s, O[1] + s * 1.5], [O[0] + s, O[1] + s * 1.5]]), class: 'mech-support' }, S);
      el('rect', { x: f(O[0] - s * 1.7), y: f(O[1] + s * 1.5), width: f(s * 3.4), height: f(s * 0.75), fill: this.hatch }, S);
      el('line', { x1: f(O[0] - s * 1.7), y1: f(O[1] + s * 1.5), x2: f(O[0] + s * 1.7), y2: f(O[1] + s * 1.5), class: 'mech-edge' }, S);

      // ---------------- disc (flywheel) + counterweight + crank-pin path
      const Dg = this.gDisc;
      Dg.textContent = '';
      this.disc = el('circle', { cx: f(O[0]), cy: f(O[1]), r: f(k * Rd), class: 'mech-disc' }, Dg);
      this.cw = el('path', { class: 'mech-cw' }, Dg);
      this.spokes = [0, 1, 2].map(() => el('line', { class: 'mech-spoke' }, Dg));
      el('circle', { cx: f(O[0]), cy: f(O[1]), r: f(k * R), class: 'mech-path' }, Dg);

      // ---------------- moving parts
      const M = this.gMove;
      M.textContent = '';
      this.piston = el('polygon', { class: 'mech-piston' }, M);
      this.rings = [0, 1, 2].map(() => el('line', { class: 'mech-ring' }, M));
      const lw = this.mini ? 9 : Math.max(12, Math.min(18, k * D * 0.16));
      this.rodO = el('line', { class: 'mech-link-o', 'stroke-width': f(lw) }, M);
      this.rodI = el('line', { class: 'mech-link-i', 'stroke-width': f(lw - 3.4) }, M);
      this.crO = el('line', { class: 'mech-link-o', 'stroke-width': f(lw + 4) }, M);
      this.crI = el('line', { class: 'mech-link-i', 'stroke-width': f(lw + 0.6) }, M);
      this.pinR = lw * 0.36;
      this.pO = el('circle', { r: f(this.pinR + 1), class: 'mech-pin' }, M);
      this.pC = el('circle', { r: f(this.pinR), class: 'mech-pin' }, M);
      this.pP = el('circle', { r: f(this.pinR), class: 'mech-pin' }, M);
      this.pG = el('circle', { r: '2.6', class: 'mech-cg' }, M);

      // ---------------- dimensions, angles, labels
      const Dm = this.gDim;
      Dm.textContent = '';
      this.thetaArc = el('path', { class: 'mech-arc' }, Dm);
      this.phiArc = el('path', { class: 'mech-arc' }, Dm);
      this.omegaArc = el('path', { class: 'mech-omega', 'marker-end': 'url(#' + this.arrInk + ')' }, Dm);
      if (!this.mini) {
        const yd = -ydim;
        this.dimX = el('line', { class: 'mech-dimline', 'marker-start': 'url(#' + this.arrInk + ')', 'marker-end': 'url(#' + this.arrInk + ')' }, Dm);
        this.dimS = el('line', { class: 'mech-dimline', 'marker-start': 'url(#' + this.arrInk + ')', 'marker-end': 'url(#' + this.arrInk + ')' }, Dm);
        const tk = (x, lab) => {
          const a = map(x, -D / 2 - wt - 0.05 * D), b = map(x, yd - 0.04 * L - 0.25 * D);
          el('line', { x1: f(a[0]), y1: f(a[1]), x2: f(b[0]), y2: f(b[1]), class: 'mech-ext' }, Dm);
          const t = map(x, yd - 0.04 * L - 0.25 * D);
          const tx = el('text', { x: f(t[0] + (vertical ? 5 : 0)), y: f(t[1] + (vertical ? 4 : 13)), class: 'mech-small', 'text-anchor': vertical ? 'start' : 'middle' }, Dm);
          tx.textContent = lab;
        };
        tk(sT, 'TDC'); tk(sB, 'BDC');
        this.extP = el('line', { class: 'mech-ext' }, Dm);
        this.ydimS = yd - 0.04 * L - 0.12 * D;
        const a = map(sB, this.ydimS), b = map(sT, this.ydimS);
        this.dimS.setAttribute('x1', f(a[0])); this.dimS.setAttribute('y1', f(a[1]));
        this.dimS.setAttribute('x2', f(b[0])); this.dimS.setAttribute('y2', f(b[1]));
      }
      const Lb = this.gLab;
      Lb.textContent = '';
      const lab = (txt, sub, cls) => {
        const t = el('text', { class: cls || 'mech-label' }, Lb);
        t.appendChild(document.createTextNode(txt));
        if (sub) { const ts = el('tspan', { class: 'mech-sub', dy: '4' }, t); ts.textContent = sub; }
        return t;
      };
      if (!this.mini) {
        this.lO = lab('O'); this.lC = lab('C'); this.lP = lab('P'); this.lG = lab('G', null, 'mech-label small');
        this.lTh = lab('θ'); this.lPhi = lab('φ'); this.lX = lab('x'); this.lW = lab('ω');
        this.lStroke = lab('2r');
        const a = map((sB + sT) / 2, this.ydimS);
        this.lStroke.setAttribute('x', f(a[0] + (vertical ? -8 : 0))); this.lStroke.setAttribute('y', f(a[1] + (vertical ? 5 : -6)));
        this.lStroke.setAttribute('text-anchor', vertical ? 'end' : 'middle');
      }
      // forces
      const Fg = this.gForce;
      Fg.textContent = '';
      this.arrows = {};
      if (!this.mini) {
        for (const key of ['Fp', 'Fn', 'Ft', 'Fr']) {
          const path = el('line', { class: 'mech-farrow', 'marker-end': 'url(#' + this.arrRed + ')' }, Fg);
          const t = el('text', { class: 'mech-flabel' }, Fg);
          t.appendChild(document.createTextNode('F'));
          const ts = el('tspan', { class: 'mech-sub', dy: '4' }, t);
          ts.textContent = key[1].toUpperCase();
          this.arrows[key] = { path, t };
        }
      }
      this.ready = true;
    }

    update(s) {
      if (!this.ready) return;
      const { map, R, L, D, Lp, xH, k } = this;
      const th = s.th, S = Math.sin(th), C = Math.cos(th);
      const root = Math.sqrt((L / R) * (L / R) - S * S);
      const sp = R * (C + root);                       // gudgeon-pin position
      const O = map(0, 0), Cp = map(R * C, R * S), P = map(sp, 0);
      const lam = this.lam;
      const G = map(R * C + lam * (sp - R * C), R * S * (1 - lam));
      // disc spokes + counterweight (opposite the crank pin, size ∝ balance fraction c)
      const Rd = this.Rd;
      for (let q = 0; q < 3; q++) {
        const a = th + Math.PI / 3 + q * 2 * Math.PI / 3;
        const p1 = map(0.18 * Rd * Math.cos(a), 0.18 * Rd * Math.sin(a)), p2 = map(0.92 * Rd * Math.cos(a), 0.92 * Rd * Math.sin(a));
        const sp_ = this.spokes[q];
        sp_.setAttribute('x1', f(p1[0])); sp_.setAttribute('y1', f(p1[1])); sp_.setAttribute('x2', f(p2[0])); sp_.setAttribute('y2', f(p2[1]));
      }
      const half = (25 + 50 * Math.max(0, Math.min(1, s.cbal != null ? s.cbal : this.cbal))) * Math.PI / 180;
      const rc = 0.86 * Math.min(R, Rd);
      const a1 = th + Math.PI - half, a2 = th + Math.PI + half;
      const c1 = map(rc * Math.cos(a1), rc * Math.sin(a1)), c2 = map(rc * Math.cos(a2), rc * Math.sin(a2));
      const sweep = this.vertical ? 0 : 0;
      this.cw.setAttribute('d', 'M' + f(O[0]) + ',' + f(O[1]) + ' L' + f(c1[0]) + ',' + f(c1[1]) + ' A' + f(k * rc) + ',' + f(k * rc) + ' 0 0 ' + sweep + ' ' + f(c2[0]) + ',' + f(c2[1]) + ' Z');

      // gas + piston
      const crown = sp + 0.55 * Lp, skirt = sp - 0.45 * Lp, h = D / 2;
      this.gas.setAttribute('points', pts([map(crown, h), map(xH, h), map(xH, -h), map(crown, -h)]));
      this.gas.style.fill = s.gasColor || 'rgba(163,20,42,0.1)';
      const hp = h * 0.985;
      this.piston.setAttribute('points', pts([map(skirt, hp), map(crown, hp), map(crown, -hp), map(skirt, -hp)]));
      for (let q = 0; q < 3; q++) {
        const xr = crown - (0.07 + q * 0.07) * Lp;
        const a = map(xr, hp), b = map(xr, -hp);
        const r = this.rings[q];
        r.setAttribute('x1', f(a[0])); r.setAttribute('y1', f(a[1])); r.setAttribute('x2', f(b[0])); r.setAttribute('y2', f(b[1]));
      }
      const setL = (ln, a, b) => { ln.setAttribute('x1', f(a[0])); ln.setAttribute('y1', f(a[1])); ln.setAttribute('x2', f(b[0])); ln.setAttribute('y2', f(b[1])); };
      setL(this.rodO, Cp, P); setL(this.rodI, Cp, P);
      setL(this.crO, O, Cp); setL(this.crI, O, Cp);
      const setC = (c, p) => { c.setAttribute('cx', f(p[0])); c.setAttribute('cy', f(p[1])); };
      setC(this.pO, O); setC(this.pC, Cp); setC(this.pP, P); setC(this.pG, G);

      // angle arcs: θ at O (from line of stroke to crank), φ at P (rod obliquity), ω arrow
      const thm = ((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const ra = 0.42 * R;
      const arc = (cx, cy, r, a0, a1) => {
        const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.12));
        let d = '';
        for (let q = 0; q <= n; q++) { const a = a0 + (a1 - a0) * q / n; const p = map(cx + r * Math.cos(a), cy + r * Math.sin(a)); d += (q ? 'L' : 'M') + f(p[0]) + ',' + f(p[1]); }
        return d;
      };
      this.thetaArc.setAttribute('d', thm > 0.02 ? arc(0, 0, ra, 0, thm) : '');
      const phi = Math.asin(S * R / L);
      const rp = 0.3 * R;
      this.phiArc.setAttribute('d', Math.abs(phi) > 0.01 ? arc(sp, 0, rp, Math.PI, Math.PI - phi) : '');
      const rw = Math.max(this.Rd, R) * 1.1;
      this.omegaArc.setAttribute('d', arc(0, 0, rw, Math.PI * 0.62, Math.PI * 0.95));

      if (!this.mini) {
        const at = (t, p, dx, dy) => { t.setAttribute('x', f(p[0] + dx)); t.setAttribute('y', f(p[1] + dy)); };
        // labels sit away from the links
        const away = (p, dirx, diry, d) => { const len = Math.hypot(dirx, diry) || 1; return [p[0] + dirx / len * d, p[1] + diry / len * d]; };
        const cdir = [Cp[0] - O[0], Cp[1] - O[1]];
        at(this.lO, away(O, -cdir[0] - 0.3, -cdir[1] - 0.6, 20), -5, 5);
        at(this.lC, away(Cp, cdir[0], cdir[1], 20), -5, 5);
        const pn = this.vertical ? [16, 0] : [0, -this.pinR - 14];
        at(this.lP, P, pn[0] - 5 - (this.vertical ? 0 : 14), pn[1] + 5);
        at(this.lG, G, 6, -6);
        const am = thm / 2, tl = map((ra + 0.18 * R) * Math.cos(am), (ra + 0.18 * R) * Math.sin(am));
        at(this.lTh, tl, -4, 5); this.lTh.style.opacity = thm > 0.25 ? 1 : 0;
        const pm = Math.PI - phi / 2, pl_ = map(sp + (rp + 0.16 * R) * Math.cos(pm), (rp + 0.16 * R) * Math.sin(pm));
        at(this.lPhi, pl_, -4, 5); this.lPhi.style.opacity = Math.abs(phi) > 0.05 ? 1 : 0;
        const wl = map(rw * 1.12 * Math.cos(Math.PI * 0.78), rw * 1.12 * Math.sin(Math.PI * 0.78));
        at(this.lW, wl, -5, 5);
        // displacement x from TDC
        const yd = -this.ydim;
        const a = map(this.sT, yd), b = map(sp, yd);
        const show = Math.abs(this.sT - sp) * k > 14;
        this.dimX.style.display = show ? '' : 'none';
        setL(this.dimX, a, b);
        const e1 = map(sp, -D / 2 - this.wt - 0.05 * D), e2 = map(sp, yd - 0.03 * L);
        setL(this.extP, e1, e2);
        const mid = map((this.sT + sp) / 2, yd);
        at(this.lX, mid, this.vertical ? -16 : -4, this.vertical ? 5 : -6);
        this.lX.style.opacity = show ? 1 : 0;

        // force arrows (common scale)
        const showF = s.showForces !== false && s.F && s.Fscale > 0;
        this.gForce.style.display = showF ? '' : 'none';
        if (showF) {
          const Lmax = this.vertical ? 105 : 120;
          const put = (key, origin, ux, uy, val) => {
            const A = this.arrows[key];
            const len = Math.min(1, Math.abs(val) / s.Fscale) * Lmax;
            if (len < 6) { A.path.style.display = 'none'; A.t.style.display = 'none'; return; }
            A.path.style.display = ''; A.t.style.display = '';
            const sg = Math.sign(val);
            // world direction → screen direction
            const o0 = map(0, 0), o1 = map(ux, uy);
            let dx = o1[0] - o0[0], dy = o1[1] - o0[1];
            const n = Math.hypot(dx, dy); dx = dx / n * sg; dy = dy / n * sg;
            const x2 = origin[0] + dx * len, y2 = origin[1] + dy * len;
            setL(A.path, origin, [x2, y2]);
            A.t.setAttribute('x', f(x2 + dx * 10 - 6)); A.t.setAttribute('y', f(y2 + dy * 10 + 5));
          };
          put('Fp', P, -1, 0, s.F.Fp);
          put('Fn', P, 0, 1, s.F.Fn);
          put('Ft', Cp, -S, C, s.F.Ft);
          put('Fr', Cp, -C, -S, s.F.Fr);
        }
      }
    }
  }
  root.Mechanism = Mechanism;
})(typeof self !== 'undefined' ? self : globalThis);
