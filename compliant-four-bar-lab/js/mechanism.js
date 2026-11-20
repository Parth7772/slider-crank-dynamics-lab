/*!
 * mechanism.js — animated, to-scale SVG drawing of the compliant four-bar.
 * World frame: origin at the input pivot O2, +x along the frame link toward O4, +y up.
 * Flexure hinges are drawn as thin necks that bend with the motion, coloured by stress.
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
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // stress ratio σ/Se → colour (blue → purple → red); never yellow
  function stressColor(q) {
    const t = clamp(isFinite(q) ? q : 0, 0, 1);
    const A = [31, 95, 168], B = [106, 61, 154], C = [198, 40, 40];
    const [p, r, u] = t < 0.55 ? [A, B, t / 0.55] : [B, C, (t - 0.55) / 0.45];
    return 'rgb(' + p.map((v, k) => Math.round(v + (r[k] - v) * u)).join(',') + ')';
  }

  class Mechanism {
    constructor(host, opts) {
      this.mini = !!(opts && opts.mini);
      const id = ++UID;
      this.svg = el('svg', { class: 'mech-svg', role: 'img', 'aria-label': 'Animated compliant four-bar mechanism', preserveAspectRatio: 'xMidYMid meet' }, host);
      const defs = el('defs', null, this.svg);
      const pat = el('pattern', { id: 'hatch' + id, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#333', 'stroke-width': 1 }, pat);
      const mk = (mid, color) => {
        const m = el('marker', { id: mid, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
        el('path', { d: 'M0,1 L10,5 L0,9 z', fill: color }, m);
      };
      this.arrAcc = 'arra' + id; mk(this.arrAcc, '#0e6f7c');
      this.arrRed = 'arrr' + id; mk(this.arrRed, '#c62828');
      this.hatch = 'url(#hatch' + id + ')';
      const g = () => el('g', null, this.svg);
      this.gStatic = g(); this.gMove = g(); this.gLab = g();
      this.ready = false;
    }

    // R: a solved drive cycle (Engine.solve)
    setGeometry(R) {
      const c = R.c, N = R.N;
      this.c = c;
      let x0 = Math.min(0, c.r1), x1 = Math.max(0, c.r1), y0 = 0, y1 = 0;
      const grow = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
      for (let i = 0; i < N; i += 4) { grow(R.Ax[i], R.Ay[i]); grow(R.Bx[i], R.By[i]); grow(R.Px[i], R.Py[i]); }
      const k0 = window.Engine.kin(c, c.th0);
      this.ghost = k0;
      grow(k0.Ax, k0.Ay); grow(k0.Bx, k0.By);
      const W = this.mini ? 300 : 760, pad = this.mini ? 16 : 54, maxH = this.mini ? 200 : 440;
      const spanX = x1 - x0 || 1, spanY = y1 - y0 || 1;
      let k = (W - 2 * pad) / spanX;
      if (spanY * k + 2 * pad > maxH) k = (maxH - 2 * pad) / spanY;
      const H = Math.max(this.mini ? 120 : 240, spanY * k + 2 * pad);
      const ox = (W - spanX * k) / 2 - x0 * k, oy = (H - spanY * k) / 2 + y1 * k;
      this.X = (x) => ox + x * k; this.Y = (y) => oy - y * k;
      this.k = k;
      this.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      // drawing sizes (px)
      const L = Math.min(c.r2, c.r3, c.r4) * k;
      this.lw = clamp(c.w * k, this.mini ? 5 : 9, this.mini ? 9 : 17);
      this.gap = clamp(c.lh * k * 0.5, this.mini ? 4 : 7, Math.min(this.mini ? 8 : 15, 0.22 * L));
      this.nw = clamp(c.t * k * 3, this.mini ? 1.8 : 2.6, this.mini ? 3 : 4.5);
      this.drawStatic(R);
      this.ready = true;
    }

    drawStatic(R) {
      const c = this.c, X = this.X, Y = this.Y, gs = this.gStatic, mini = this.mini;
      gs.textContent = '';
      this.gMove.textContent = '';
      this.gLab.textContent = '';
      const N = R.N;
      // paths of A, B and of the coupler point P over the drive cycle
      const path = (xs, ys, cls) => {
        let d = '';
        for (let i = 0; i <= N; i += 2) d += (i ? 'L' : 'M') + f(X(xs[i])) + ',' + f(Y(ys[i]));
        el('path', { d, class: cls }, gs);
      };
      path(R.Ax, R.Ay, 'mech-arcpath'); path(R.Bx, R.By, 'mech-arcpath');
      path(R.Px, R.Py, 'mech-trace');
      // as-made (undeflected) position, dashed
      const g0 = this.ghost;
      el('polyline', { class: 'mech-ghost', points: [[0, 0], [g0.Ax, g0.Ay], [g0.Bx, g0.By], [c.r1, 0]].map((p) => f(X(p[0])) + ',' + f(Y(p[1]))).join(' ') }, gs);
      // frame line and ground anchors in the as-made direction of the adjacent link
      el('line', { x1: f(X(0)), y1: f(Y(0)), x2: f(X(c.r1)), y2: f(Y(0)), stroke: '#8a979d', 'stroke-width': 1, 'stroke-dasharray': '10 3 2 3' }, gs);
      this.anchor(gs, 0, 0, c.th0);
      this.anchor(gs, c.r1, 0, g0.t4);
      // moving parts
      const gm = this.gMove;
      this.halos = [0, 1, 2, 3].map((j) => el('circle', { r: f(this.gap * 1.05), 'fill-opacity': 0.22, 'stroke-width': 1.2, display: c.Kj[j] ? '' : 'none' }, gm));
      this.links = [0, 1, 2].map(() => ({ o: el('path', { class: 'mech-link', stroke: '#111', 'stroke-width': this.lw, fill: 'none' }, gm), i: el('path', { class: 'mech-link', stroke: '#fff', 'stroke-width': this.lw - 3, fill: 'none' }, gm) }));
      this.necks = [0, 1, 2, 3].map((j) => el('path', { fill: 'none', 'stroke-width': this.nw, 'stroke-linecap': 'round', stroke: '#1f5fa8', class: c.Kj[j] ? '' : 'pinj' }, gm));
      this.pins = [1, 2].map(() => el('circle', { r: mini ? 3 : 5, class: 'mech-pin' }, gm));
      this.dots = [0, 1, 2, 3].map(() => el('circle', { r: mini ? 1.2 : 1.9, fill: '#111' }, gm));
      this.bracket = el('path', { stroke: '#111', 'stroke-width': mini ? 1.4 : 2, fill: 'none' }, gm);
      const sz = clamp(8 * Math.cbrt(Math.max(c.mp * 1e3, 1)) / 2.2, mini ? 6 : 10, mini ? 12 : 22);
      this.pay = el('rect', { width: f(sz), height: f(sz), rx: 2, class: 'mech-payload' }, gm);
      this.paySz = sz;
      this.pDot = el('circle', { r: mini ? 1.6 : 2.4, fill: '#0e6f7c' }, gm);
      // input torque arrow at O2
      this.tq = el('path', { class: 'mech-tq', stroke: '#0e6f7c' }, gm);
      if (!mini) {
        this.thArc = el('path', { fill: 'none', stroke: '#111', 'stroke-width': 1 }, this.gLab);
        this.lab = {};
        for (const [key, txt] of [['O2', 'O₂'], ['O4', 'O₄'], ['A', 'A'], ['B', 'B'], ['P', 'P'], ['th', 'θ₂'], ['T', 'T']]) {
          this.lab[key] = el('text', { class: key === 'T' ? 'mech-tlabel' : 'mech-label', fill: key === 'T' ? '#0e6f7c' : '#111' }, this.gLab);
          this.lab[key].textContent = txt;
        }
        const t = (x, y, s) => { const e = el('text', { x: f(x), y: f(y), class: 'mech-small' }, this.gLab); e.textContent = s; };
        t((X(0) + X(c.r1)) / 2 - 16, Y(0) + 16, 'frame');
        this.lab.O2.setAttribute('x', f(X(0) - 26)); this.lab.O2.setAttribute('y', f(Y(0) + 4));
        this.lab.O4.setAttribute('x', f(X(c.r1) + 10)); this.lab.O4.setAttribute('y', f(Y(0) + 4));
      }
    }

    // hatched ground block behind a frame pivot, opposite to the as-made link direction
    anchor(g, x, y, dir) {
      const X = this.X, Y = this.Y, gap = this.gap, mini = this.mini;
      const ux = Math.cos(dir), uy = -Math.sin(dir);            // screen direction of the link
      const px = X(x), py = Y(y);
      const s0 = gap, s1 = gap + (mini ? 6 : 11);
      el('line', { x1: f(px - ux * s0), y1: f(py - uy * s0), x2: f(px - ux * s1), y2: f(py - uy * s1), stroke: '#111', 'stroke-width': this.lw * 0.8, 'stroke-linecap': 'butt' }, g);
      const bw = mini ? 16 : 30, bh = mini ? 7 : 12;
      const cx = px - ux * (s1 + bh / 2), cy = py - uy * (s1 + bh / 2);
      const ang = Math.atan2(uy, ux) * 180 / Math.PI + 90;
      el('rect', { x: f(cx - bw / 2), y: f(cy - bh / 2), width: bw, height: bh, fill: this.hatch, stroke: '#111', 'stroke-width': 1.2, transform: 'rotate(' + f(ang) + ' ' + f(cx) + ' ' + f(cy) + ')' }, g);
    }

    // st: { i, R, ratio: [σ/Se for each hinge], showTorque }
    update(st) {
      if (!this.ready) return;
      const R = st.R, i = st.i, c = this.c, X = this.X, Y = this.Y, gap = this.gap;
      const O2 = [X(0), Y(0)], O4 = [X(c.r1), Y(0)], A = [X(R.Ax[i]), Y(R.Ay[i])], B = [X(R.Bx[i]), Y(R.By[i])], P = [X(R.Px[i]), Y(R.Py[i])];
      const u = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
      const u2 = u(O2, A), u3 = u(A, B), u4 = u(O4, B);
      const pt = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s];
      const seg = (a, b) => 'M' + f(a[0]) + ',' + f(a[1]) + 'L' + f(b[0]) + ',' + f(b[1]);
      const flexA = c.Kj[1] > 0, flexB = c.Kj[2] > 0;
      const gA = flexA ? gap : 0, gB = flexB ? gap : 0;
      const d2 = seg(pt(O2, u2, gap), pt(A, u2, -gA));
      const d3 = seg(pt(A, u3, gA), pt(B, u3, -gB));
      const d4 = seg(pt(O4, u4, gap), pt(B, u4, -gB));
      [d2, d3, d4].forEach((d, k) => { this.links[k].o.setAttribute('d', d); this.links[k].i.setAttribute('d', d); });
      // necks: quadratic curves through the PRBM pivot, so the bend equals the relative rotation of the links
      const g0 = this.ghost;
      const ua2 = [Math.cos(c.th0), -Math.sin(c.th0)], ua4 = [Math.cos(g0.t4), -Math.sin(g0.t4)];
      const q = (a, ctrl, b) => 'M' + f(a[0]) + ',' + f(a[1]) + 'Q' + f(ctrl[0]) + ',' + f(ctrl[1]) + ' ' + f(b[0]) + ',' + f(b[1]);
      const nd = [
        q(pt(O2, ua2, -gap), O2, pt(O2, u2, gap)),
        flexA ? q(pt(A, u2, -gap), A, pt(A, u3, gap)) : '',
        flexB ? q(pt(B, u3, -gap), B, pt(B, u4, -gap)) : '',
        q(pt(O4, ua4, -gap), O4, pt(O4, u4, gap)),
      ];
      for (let j = 0; j < 4; j++) {
        this.necks[j].setAttribute('d', nd[j]);
        if (nd[j]) {
          const col = stressColor(st.ratio ? st.ratio[j] : 0);
          this.necks[j].setAttribute('stroke', col);
          this.halos[j].setAttribute('fill', col); this.halos[j].setAttribute('stroke', col);
        }
      }
      const piv = [O2, A, B, O4];
      for (let j = 0; j < 4; j++) {
        this.dots[j].setAttribute('cx', f(piv[j][0])); this.dots[j].setAttribute('cy', f(piv[j][1]));
        this.halos[j].setAttribute('cx', f(piv[j][0])); this.halos[j].setAttribute('cy', f(piv[j][1]));
      }
      this.pins[0].style.display = flexA ? 'none' : ''; this.pins[1].style.display = flexB ? 'none' : '';
      this.pins[0].setAttribute('cx', f(A[0])); this.pins[0].setAttribute('cy', f(A[1]));
      this.pins[1].setAttribute('cx', f(B[0])); this.pins[1].setAttribute('cy', f(B[1]));
      // payload on a bracket from the coupler line
      const foot = [A[0] + (B[0] - A[0]) * c.pu, A[1] + (B[1] - A[1]) * c.pu];
      const hasArm = Math.hypot(P[0] - foot[0], P[1] - foot[1]) > 1;
      this.bracket.setAttribute('d', hasArm ? seg(foot, P) : '');
      const s = this.paySz;
      this.pay.setAttribute('x', f(P[0] - s / 2)); this.pay.setAttribute('y', f(P[1] - s / 2));
      const ang = Math.atan2(u3[1], u3[0]) * 180 / Math.PI;
      this.pay.setAttribute('transform', 'rotate(' + f(ang) + ' ' + f(P[0]) + ' ' + f(P[1]) + ')');
      this.pDot.setAttribute('cx', f(P[0])); this.pDot.setAttribute('cy', f(P[1]));
      // torque arrow: arc about O2, direction = sign of T, length ∝ |T|
      const T = R.T[i], Tm = st.Tmax || 1, frac = clamp(Math.abs(T) / Tm, 0, 1);
      const rr = this.mini ? 12 : 30, sweep = (0.25 + 1.25 * frac);
      const a0 = Math.atan2(-u2[1], u2[0]) + 0.35;                  // start just past the input link (math angle)
      const a1 = a0 + (T >= 0 ? 1 : -1) * sweep;
      const P0 = [O2[0] + rr * Math.cos(a0), O2[1] - rr * Math.sin(a0)], P1 = [O2[0] + rr * Math.cos(a1), O2[1] - rr * Math.sin(a1)];
      const show = st.showTorque !== false && frac > 0.01;
      this.tq.setAttribute('d', show ? 'M' + f(P0[0]) + ',' + f(P0[1]) + 'A' + rr + ',' + rr + ' 0 ' + (sweep > Math.PI ? 1 : 0) + ' ' + (T >= 0 ? 0 : 1) + ' ' + f(P1[0]) + ',' + f(P1[1]) : '');
      this.tq.setAttribute('marker-end', 'url(#' + this.arrAcc + ')');
      this.tq.setAttribute('stroke-width', (this.mini ? 1.4 : 1.6 + 1.6 * frac).toFixed(2));
      if (this.mini) return;
      const L = this.lab;
      const place = (e, p, dx, dy) => { e.setAttribute('x', f(p[0] + dx)); e.setAttribute('y', f(p[1] + dy)); };
      const off = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s];
      // labels pushed away from the links
      const nA = [-(u2[0] + u3[0]), -(u2[1] + u3[1])], nB = [(u3[0] + u4[0]) * 0.5 + 0.0001, (u3[1] + u4[1]) * 0.5];
      const nrm = (v) => { const L2 = Math.hypot(v[0], v[1]) || 1; return [v[0] / L2, v[1] / L2]; };
      const la = off(A, nrm([nA[0] + 0.0001, nA[1] - 0.5]), 20), lb = off(B, nrm([nB[0], nB[1] - 0.6]), 20);
      place(L.A, la, -5, 5); place(L.B, lb, -5, 5);
      place(L.P, P, this.paySz / 2 + 6, -this.paySz / 2 - 2);
      place(L.T, [O2[0] + (rr + 12) * Math.cos(a1), O2[1] - (rr + 12) * Math.sin(a1)], -5, 5);
      L.T.style.display = show ? '' : 'none';
      // θ2 arc from the frame line
      const th = R.th2[i], ra = this.mini ? 0 : 46;
      const e = [O2[0] + ra * Math.cos(th), O2[1] - ra * Math.sin(th)];
      this.thArc.setAttribute('d', 'M' + f(O2[0] + ra) + ',' + f(O2[1]) + 'A' + ra + ',' + ra + ' 0 ' + (th > Math.PI ? 1 : 0) + ' 0 ' + f(e[0]) + ',' + f(e[1]));
      const tm = th / 2;
      place(L.th, [O2[0] + (ra + 10) * Math.cos(tm), O2[1] - (ra + 10) * Math.sin(tm)], 0, 5);
    }
  }

  root.Mechanism = Mechanism;
  root.stressColor = stressColor;
})(window);
