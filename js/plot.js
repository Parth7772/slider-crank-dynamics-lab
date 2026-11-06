/*!
 * plot.js — tiny dependency-free canvas plotting in a "matplotlib / LaTeX paper" style.
 * Line plots with a synchronised crank-angle cursor, heat maps with contours, and bar charts.
 */
(function (root) {
  'use strict';

  const FM = '"KaTeX_Main","Latin Modern Roman","CMU Serif","Times New Roman",serif';
  const FI = '"KaTeX_Math","Latin Modern Math","Times New Roman",serif';
  const MINUS = '−';
  const COL = {
    blue: '#1f77b4', orange: '#ff7f0e', green: '#2ca02c', red: '#d62728', purple: '#9467bd',
    brown: '#8c564b', pink: '#e377c2', gray: '#7f7f7f', olive: '#bcbd22', cyan: '#17becf', ink: '#111111',
    crimson: '#a3142a',
  };

  /* --------------------------------------------------------- rich text */
  // "$F_P$ [kN]" → math letters italic, _x / _{xy} subscripts, ^x superscripts.
  // Multi-letter subscripts ("T_{mean}") are set upright, as \mathrm would.
  const isLetter = (ch) => /[A-Za-zα-ωϑϕ]/.test(ch);
  const richCache = new Map();
  function parseRich(s) {
    if (richCache.has(s)) return richCache.get(s);
    const runs = [];
    let math = false, i = 0;
    const push = (t, it, lvl) => {
      const last = runs[runs.length - 1];
      if (last && last.it === it && last.lvl === lvl) last.t += t; else runs.push({ t, it, lvl });
    };
    while (i < s.length) {
      const ch = s[i];
      if (ch === '$') { math = !math; i++; continue; }
      if (math && (ch === '_' || ch === '^')) {
        const lvl = ch === '_' ? -1 : 1;
        i++;
        let grp;
        if (s[i] === '{') { const j = s.indexOf('}', i); grp = s.slice(i + 1, j); i = j + 1; } else { grp = s[i]; i++; }
        const roman = grp.replace(/[^A-Za-z]/g, '').length > 1;
        for (const g of grp) push(g, !roman && isLetter(g), lvl);
        continue;
      }
      push(ch, math && isLetter(ch), 0);
      i++;
    }
    richCache.set(s, runs);
    return runs;
  }
  function fontFor(run, size) {
    const s = run.lvl ? size * 0.72 : size;
    return (run.it ? 'italic ' : '') + s.toFixed(1) + 'px ' + (run.it ? FI : FM);
  }
  function richWidth(ctx, runs, size) {
    let w = 0;
    for (const r of runs) { ctx.font = fontFor(r, size); w += ctx.measureText(r.t).width; }
    return w;
  }
  function drawRich(ctx, s, x, y, size, align, color) {
    const runs = typeof s === 'string' ? parseRich(s) : s;
    const w = richWidth(ctx, runs, size);
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    if (color) ctx.fillStyle = color;
    for (const r of runs) {
      ctx.font = fontFor(r, size);
      const dy = r.lvl === -1 ? size * 0.24 : r.lvl === 1 ? -size * 0.38 : 0;
      ctx.fillText(r.t, cx, y + dy);
      cx += ctx.measureText(r.t).width;
    }
    return w;
  }
  function richHTML(s) {
    let html = '';
    for (const r of parseRich(s)) {
      let t = r.t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      if (r.it) t = '<i class="mi">' + t + '</i>';
      if (r.lvl === -1) t = '<sub>' + t + '</sub>'; else if (r.lvl === 1) t = '<sup>' + t + '</sup>';
      html += t;
    }
    return html;
  }

  /* ------------------------------------------------------------- ticks */
  function niceStep(raw) {
    if (!(raw > 0) || !isFinite(raw)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }
  function linTicks(lo, hi, target) {
    const step = niceStep((hi - lo) / (target || 6));
    const out = [];
    for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-9; t += step) out.push(Math.abs(t) < step * 1e-9 ? 0 : t);
    return { ticks: out, step };
  }
  function logTicks(lo, hi) {
    const out = [];
    const d0 = Math.floor(Math.log10(lo)), d1 = Math.ceil(Math.log10(hi));
    const mult = d1 - d0 <= 2 ? [1, 2, 5] : [1];
    for (let d = d0; d <= d1; d++) for (const m of mult) { const v = m * Math.pow(10, d); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); }
    return out;
  }
  function fmtTick(v, step) {
    const dec = Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9)));
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', MINUS);
  }
  function fmtLog(v) {
    if (v >= 1e4 || v < 1e-2) { const e = Math.round(Math.log10(v)); if (Math.abs(v - Math.pow(10, e)) < 1e-9 * v) return '10$^{' + String(e).replace('-', MINUS) + '}$'; }
    return String(+v.toPrecision(3));
  }
  function fmtVal(v, sig) {
    if (!isFinite(v)) return '—';
    sig = sig || 4;
    const a = Math.abs(v);
    let s;
    if (a !== 0 && (a >= 1e6 || a < 1e-3)) s = v.toExponential(sig - 1).replace('e', '×10^').replace('+', '');
    else s = (+v.toPrecision(sig)).toLocaleString('en-US', { maximumFractionDigits: Math.max(0, sig - 1 - Math.floor(Math.log10(a || 1))) });
    return s.replace('-', MINUS);
  }

  function mk(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function setupCanvas(cv, w, h, dpr) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
  }
  const DPR = () => Math.min(root.devicePixelRatio || 1, 2.5);

  /* ============================================================== Plot */
  class Plot {
    constructor(el, o) {
      this.el = el;
      this.o = Object.assign({
        h: 230, m: { l: 60, r: 16, t: 16, b: 42 }, xlabel: '', ylabel: '', legend: 'ur', cursor: 'vline',
        xlim: null, ylim: null, xticks: null, xlog: false, equal: false, bands: null, zero: true,
        hlines: [], marks: [], tipTitle: null, onPick: null, mapIndex: null, unmapIndex: null, legendCols: 1,
      }, o);
      el.classList.add('plot');
      el.style.height = this.o.h + 'px';
      this.cv = mk('canvas', 'plot-base');
      this.ov = mk('canvas', 'plot-over');
      this.tip = mk('div', 'plot-tip');
      el.append(this.cv, this.ov, this.tip);
      this.series = [];
      this.cursorI = null; this.hoverI = null; this.visible = true; this.W = 0;
      new ResizeObserver(() => this.resize()).observe(el);
      this.ov.addEventListener('pointermove', (e) => this.onMove(e));
      this.ov.addEventListener('pointerleave', () => { this.hoverI = null; this.tip.classList.remove('on'); this.drawOverlay(); });
      this.ov.addEventListener('click', (e) => { this.onMove(e); if (this.hoverI != null && this.o.onPick) this.o.onPick(this.o.unmapIndex ? this.o.unmapIndex(this.hoverI) : this.hoverI); });
      if ('IntersectionObserver' in root) {
        new IntersectionObserver((es) => {
          this.visible = es[es.length - 1].isIntersecting;
          if (this.visible) { if (this.dirty) this.draw(); else this.drawOverlay(); }
        }, { rootMargin: '200px' }).observe(el);
      }
    }
    resize() {
      const w = this.el.clientWidth, h = this.el.clientHeight;
      if (!w || !h) return;
      this.dpr = DPR();
      setupCanvas(this.cv, w, h, this.dpr); setupCanvas(this.ov, w, h, this.dpr);
      this.W = w; this.H = h;
      this.draw();
    }
    setData(series, opts) {
      this.series = series.filter(Boolean);
      if (opts) Object.assign(this.o, opts);
      this.draw();
    }
    limits() {
      const o = this.o;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const s of this.series) {
        if (s.noLim) continue;
        const n = s.n != null ? s.n : s.x.length;
        for (let i = 0; i < n; i++) {
          const x = s.x[i], y = s.y[i];
          if (!isFinite(x) || !isFinite(y)) continue;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (s.fill && isFinite(s.fill.base)) { y0 = Math.min(y0, s.fill.base); y1 = Math.max(y1, s.fill.base); }
      }
      for (const h of o.hlines) { if (isFinite(h.y)) { y0 = Math.min(y0, h.y); y1 = Math.max(y1, h.y); } }
      if (!isFinite(x0)) { x0 = 0; x1 = 1; y0 = 0; y1 = 1; }
      if (o.includeZero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
      if (o.xlim) { x0 = o.xlim[0]; x1 = o.xlim[1]; }
      else if (!o.xlog) { const px = (x1 - x0) * 0.04 || 1; x0 -= px; x1 += px; }
      if (o.ylim) { y0 = o.ylim[0]; y1 = o.ylim[1]; }
      else if (o.ylog) { y0 /= 1.25; y1 *= 1.25; }
      else {
        const span = (y1 - y0) || Math.abs(y1) * 0.1 || 1;
        y0 -= span * (o.padBot != null ? o.padBot : 0.07);
        y1 += span * (o.padTop != null ? o.padTop : o.bands ? 0.16 : 0.07);
      }
      if (o.equal) {
        const m = o.m, aw = this.W - m.l - m.r, ah = this.H - m.t - m.b;
        const sx = (x1 - x0) / aw, sy = (y1 - y0) / ah;
        if (sx > sy) { const c = (y0 + y1) / 2, hh = sx * ah / 2; y0 = c - hh; y1 = c + hh; }
        else { const c = (x0 + x1) / 2, hw = sy * aw / 2; x0 = c - hw; x1 = c + hw; }
      }
      if (x1 === x0) x1 = x0 + 1;
      if (y1 === y0) { y1 = y0 + 1; y0 -= 1; }
      return { x0, x1, y0, y1 };
    }
    draw() {
      if (!this.W) return;
      if (!this.visible) { this.dirty = true; return; }   // redraw lazily when scrolled into view
      this.dirty = false;
      const o = this.o, ctx = this.cv.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);
      const L = this.lim = this.limits();
      const m = o.m, pl = m.l, pr = this.W - m.r, pt = m.t, pb = this.H - m.b;
      this.box = { pl, pr, pt, pb };
      const lx0 = Math.log10(L.x0), lx1 = Math.log10(L.x1), ly0 = Math.log10(L.y0), ly1 = Math.log10(L.y1);
      const X = this.X = o.xlog ? (x) => pl + (Math.log10(x) - lx0) / (lx1 - lx0) * (pr - pl) : (x) => pl + (x - L.x0) / (L.x1 - L.x0) * (pr - pl);
      const Y = this.Y = o.ylog ? (y) => pb - (Math.log10(y) - ly0) / (ly1 - ly0) * (pb - pt) : (y) => pb - (y - L.y0) / (L.y1 - L.y0) * (pb - pt);

      // stroke bands (e.g. suction / compression / power / exhaust)
      if (o.bands) {
        for (const b of o.bands) {
          const a = Math.max(X(b.x0), pl), c = Math.min(X(b.x1), pr);
          if (c <= a) continue;
          if (b.fill) { ctx.fillStyle = b.fill; ctx.fillRect(a, pt, c - a, pb - pt); }
          if (b.label && c - a > 46) drawRich(ctx, b.label, (a + c) / 2, pt + 13, 10.5, 'center', '#6b6b6b');
        }
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(pl, pt, pr - pl, pb - pt); ctx.clip();
      if (o.zero && !o.ylog && L.y0 < 0 && L.y1 > 0) {
        ctx.strokeStyle = '#b8b8b8'; ctx.lineWidth = 0.8; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(pl, Y(0)); ctx.lineTo(pr, Y(0)); ctx.stroke(); ctx.setLineDash([]);
      }
      // fills between a series and a constant base (turning-moment diagram)
      for (const s of this.series) {
        if (!s.fill) continue;
        const n = s.n != null ? s.n : s.x.length, yb = Y(s.fill.base);
        const path = new Path2D();
        path.moveTo(X(s.x[0]), yb);
        for (let i = 0; i < n; i++) path.lineTo(X(s.x[i]), Y(s.y[i]));
        path.lineTo(X(s.x[n - 1]), yb); path.closePath();
        ctx.save(); ctx.beginPath(); ctx.rect(pl, pt, pr - pl, yb - pt); ctx.clip();
        ctx.fillStyle = s.fill.pos; ctx.fill(path); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(pl, yb, pr - pl, pb - yb); ctx.clip();
        ctx.fillStyle = s.fill.neg; ctx.fill(path); ctx.restore();
      }
      for (const h of o.hlines) {
        ctx.strokeStyle = h.color || '#111'; ctx.lineWidth = h.lw || 1; ctx.setLineDash(h.dash || []);
        ctx.beginPath(); ctx.moveTo(pl, Y(h.y)); ctx.lineTo(pr, Y(h.y)); ctx.stroke(); ctx.setLineDash([]);
        if (h.label) drawRich(ctx, h.label, h.align === 'left' ? pl + 6 : pr - 6, Y(h.y) - 5, 11.5, h.align === 'left' ? 'left' : 'right', h.color || '#111');
      }
      for (const s of this.series) {
        if (s.hidden) continue;
        const n = s.n != null ? s.n : s.x.length;
        ctx.strokeStyle = s.color || COL.ink; ctx.lineWidth = s.lw || 1.6; ctx.setLineDash(s.dash || []);
        ctx.globalAlpha = s.alpha == null ? 1 : s.alpha;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i < n; i++) {
          const x = s.x[i], y = s.y[i];
          if (!isFinite(x) || !isFinite(y) || (o.ylog && y <= 0)) { pen = false; continue; }
          const px = X(x), py = Y(y);
          if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
        }
        if (s.closed) ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1; ctx.setLineDash([]);
      }
      for (const mk of o.marks) {
        if (!isFinite(mk.x) || !isFinite(mk.y)) continue;
        const px = X(mk.x), py = Y(mk.y);
        ctx.fillStyle = mk.color || '#111'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
        if (mk.shape === 'star') drawStar(ctx, px, py, mk.r || 7); else { ctx.beginPath(); ctx.arc(px, py, mk.r || 3.5, 0, 7); ctx.fill(); ctx.stroke(); }
        if (mk.label) drawRich(ctx, mk.label, px + (mk.dx || 7), py + (mk.dy || -6), 11.5, mk.align || 'left', mk.color || '#111');
      }
      ctx.restore();

      // frame and inward ticks on all four sides
      ctx.strokeStyle = '#111'; ctx.lineWidth = 0.9;
      ctx.strokeRect(Math.round(pl) + 0.5, Math.round(pt) + 0.5, Math.round(pr - pl), Math.round(pb - pt));
      ctx.fillStyle = '#111';
      const xt = o.xticks ? { ticks: o.xticks, step: o.xticks[1] - o.xticks[0] } : o.xlog ? { ticks: logTicks(L.x0, L.x1), step: 1 } : linTicks(L.x0, L.x1, Math.max(3, Math.round((pr - pl) / 80)));
      for (const t of xt.ticks) {
        const px = Math.round(X(t)) + 0.5;
        if (px < pl - 0.5 || px > pr + 0.5) continue;
        ctx.beginPath(); ctx.moveTo(px, pb); ctx.lineTo(px, pb - 4); ctx.moveTo(px, pt); ctx.lineTo(px, pt + 4); ctx.stroke();
        drawRich(ctx, o.xlog ? fmtLog(t) : fmtTick(t, xt.step), px, pb + 15, 11.5, 'center', '#111');
      }
      // y ticks with matplotlib-like offset factor for big numbers
      let yt = o.ylog ? { ticks: logTicks(L.y0, L.y1), step: 1 } : linTicks(L.y0, L.y1, Math.max(3, Math.round((pb - pt) / 42)));
      const amax = Math.max(Math.abs(L.y0), Math.abs(L.y1));
      let ex = 0;
      if (!o.ylog && (amax >= 1e5 || (amax > 0 && amax < 1e-2))) ex = Math.floor(Math.log10(amax) / 3) * 3;
      const sc = Math.pow(10, ex);
      for (const t of yt.ticks) {
        const py = Math.round(Y(t)) + 0.5;
        if (py < pt - 0.5 || py > pb + 0.5) continue;
        ctx.beginPath(); ctx.moveTo(pl, py); ctx.lineTo(pl + 4, py); ctx.moveTo(pr, py); ctx.lineTo(pr - 4, py); ctx.stroke();
        drawRich(ctx, o.ylog ? fmtLog(t) : fmtTick(t / sc, yt.step / sc), pl - 6, py + 4, 11.5, 'right', '#111');
      }
      if (ex) drawRich(ctx, '×10$^{' + String(ex).replace('-', MINUS) + '}$', pl, pt - 4, 11, 'left', '#111');
      if (o.xlabel) drawRich(ctx, o.xlabel, (pl + pr) / 2, this.H - 7, 13, 'center', '#111');
      if (o.ylabel) {
        ctx.save(); ctx.translate(13, (pt + pb) / 2); ctx.rotate(-Math.PI / 2);
        drawRich(ctx, o.ylabel, 0, 0, 13, 'center', '#111'); ctx.restore();
      }
      if (o.legend) this.drawLegend(ctx);
      this.drawOverlay();
    }
    drawLegend(ctx) {
      const items = this.series.filter((s) => s.label && !s.hidden);
      if (!items.length) return;
      const fs = 11.5, lh = 16, sw = 22, pad = 6;
      const cols = Math.min(this.o.legendCols, items.length);
      const rows = Math.ceil(items.length / cols);
      const colW = [];
      items.forEach((s, k) => { const c = k % cols; colW[c] = Math.max(colW[c] || 0, sw + 6 + richWidth(ctx, parseRich(s.label), fs)); });
      const w = colW.reduce((a, b) => a + b, 0) + pad * 2 + (cols - 1) * 12, h = rows * lh + pad * 2 - 2;
      const { pl, pr, pt, pb } = this.box;
      const pos = this.o.legend;
      const x = pos.includes('l') ? pl + 8 : pr - w - 8;
      const y = pos.includes('b') ? pb - h - 8 : pt + (this.o.bands ? 22 : 8);
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.strokeStyle = '#cfcfcf'; ctx.lineWidth = 0.8;
      roundRect(ctx, x, y, w, h, 3); ctx.fill(); ctx.stroke();
      items.forEach((s, k) => {
        const c = k % cols, r = Math.floor(k / cols);
        let cx = x + pad; for (let q = 0; q < c; q++) cx += colW[q] + 12;
        const cy = y + pad + r * lh + lh / 2 - 1;
        ctx.strokeStyle = s.color; ctx.lineWidth = s.lw || 1.6; ctx.setLineDash(s.dash || []); ctx.globalAlpha = s.alpha == null ? 1 : Math.max(s.alpha, 0.6);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + sw, cy); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        drawRich(ctx, s.label, cx + sw + 6, cy + 4, fs, 'left', '#111');
      });
      ctx.restore();
    }
    setCursor(gi) { this.cursorI = gi; if (this.visible) this.drawOverlay(); }
    li(gi) { return this.o.mapIndex ? this.o.mapIndex(gi) : gi; }
    drawOverlay() {
      if (!this.W || !this.lim) return;
      const ctx = this.ov.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);
      if (this.hoverI != null) this.mark(ctx, this.hoverI, '#9a9a9a', false);
      if (this.cursorI != null) this.mark(ctx, this.li(this.cursorI), COL.crimson, true);
    }
    mark(ctx, i, color, strong) {
      const { pl, pr, pt, pb } = this.box;
      const ser = this.series.filter((s) => s.cursor !== false && !s.hidden && i < (s.n != null ? s.n : s.x.length));
      if (!ser.length) return;
      ctx.save(); ctx.beginPath(); ctx.rect(pl - 4, pt - 4, pr - pl + 8, pb - pt + 8); ctx.clip();
      if (this.o.cursor === 'vline') {
        const px = this.X(ser[0].x[i]);
        ctx.strokeStyle = color; ctx.lineWidth = strong ? 1.1 : 0.8; ctx.setLineDash(strong ? [] : [3, 3]);
        ctx.beginPath(); ctx.moveTo(px, pt); ctx.lineTo(px, pb); ctx.stroke(); ctx.setLineDash([]);
      }
      for (const s of ser) {
        const x = s.x[i], y = s.y[i];
        if (!isFinite(x) || !isFinite(y)) continue;
        ctx.fillStyle = strong ? s.color : '#fff'; ctx.strokeStyle = strong ? '#fff' : s.color; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(this.X(x), this.Y(y), strong ? 3.6 : 3, 0, 7); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    onMove(e) {
      if (!this.lim || !this.series.length) return;
      const r = this.ov.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const { pl, pr, pt, pb } = this.box;
      if (mx < pl - 6 || mx > pr + 6 || my < pt - 6 || my > pb + 6) { this.hoverI = null; this.tip.classList.remove('on'); this.drawOverlay(); return; }
      let best = null;
      if (this.o.cursor === 'vline') {
        const s = this.series.find((q) => q.cursor !== false) || this.series[0];
        const n = s.n != null ? s.n : s.x.length;
        let bd = Infinity;
        for (let i = 0; i < n; i++) { const d = Math.abs(this.X(s.x[i]) - mx); if (d < bd) { bd = d; best = i; } }
      } else {
        let bd = Infinity;
        for (const s of this.series) {
          if (s.cursor === false || s.hidden) continue;
          const n = s.n != null ? s.n : s.x.length;
          for (let i = 0; i < n; i++) {
            const dx = this.X(s.x[i]) - mx, dy = this.Y(s.y[i]) - my, d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = i; }
          }
        }
        if (bd > 900) best = null;
      }
      this.hoverI = best;
      this.drawOverlay();
      if (best == null) { this.tip.classList.remove('on'); return; }
      let html = this.o.tipTitle ? '<div class="tt-h">' + this.o.tipTitle(best) + '</div>' : '';
      for (const s of this.series) {
        if (s.noTip || !s.label || s.hidden || best >= (s.n != null ? s.n : s.x.length)) continue;
        const val = s.fmt ? s.fmt(s.y[best], s.x[best]) : fmtVal(s.y[best]);
        html += '<div><i class="sw" style="background:' + s.color + '"></i>' + richHTML(s.label) + ' <b>' + val + '</b></div>';
      }
      this.tip.innerHTML = html;
      this.tip.classList.add('on');
      const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
      let tx = mx + 14, ty = my - th - 10;
      if (tx + tw > this.W - 4) tx = mx - tw - 14;
      if (ty < 2) ty = my + 14;
      this.tip.style.transform = 'translate(' + Math.round(tx) + 'px,' + Math.round(ty) + 'px)';
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawStar(ctx, x, y, R) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? R * 0.45 : R;
      ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  /* ----------------------------------------------------------- colormaps */
  const CMAPS = {
    viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
    coolwarm: ['#3b4cc0', '#5977e3', '#7b9ff9', '#9ebeff', '#c0d4f5', '#dddcdc', '#f2cbb7', '#f7ac8e', '#ee8468', '#d65244', '#b40426'],
  };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const CM_RGB = {};
  for (const k in CMAPS) CM_RGB[k] = CMAPS[k].map(hex);
  function cmap(name, t) {
    const L = CM_RGB[name];
    t = Math.max(0, Math.min(1, isFinite(t) ? t : 0)) * (L.length - 1);
    const i = Math.min(Math.floor(t), L.length - 2), f = t - i;
    const a = L[i], b = L[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  // marching squares → list of segments [x0,y0,x1,y1] in grid coordinates
  function contourSegments(z, nx, ny, lev) {
    const seg = [];
    const lerp = (a, b) => (lev - a) / (b - a);
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = z[j * nx + i], b = z[j * nx + i + 1], c = z[(j + 1) * nx + i + 1], d = z[(j + 1) * nx + i];
        if (!isFinite(a + b + c + d)) continue;
        const k = (a > lev ? 1 : 0) | (b > lev ? 2 : 0) | (c > lev ? 4 : 0) | (d > lev ? 8 : 0);
        if (k === 0 || k === 15) continue;
        const B = [i + lerp(a, b), j], R = [i + 1, j + lerp(b, c)], T = [i + lerp(d, c), j + 1], Lf = [i, j + lerp(a, d)];
        const add = (p, q) => seg.push(p[0], p[1], q[0], q[1]);
        switch (k) {
          case 1: case 14: add(Lf, B); break;
          case 2: case 13: add(B, R); break;
          case 3: case 12: add(Lf, R); break;
          case 4: case 11: add(R, T); break;
          case 5: add(Lf, T); add(B, R); break;
          case 6: case 9: add(B, T); break;
          case 7: case 8: add(Lf, T); break;
          case 10: add(Lf, B); add(R, T); break;
        }
      }
    }
    return seg;
  }

  /* =========================================================== HeatMap */
  class HeatMap {
    constructor(el, o) {
      this.el = el;
      this.o = Object.assign({ h: 300, m: { l: 52, r: 74, t: 14, b: 42 }, cmap: 'viridis', xlabel: '', ylabel: '', clabel: '', diverging: false, logc: false, xlog: true, fmt: null }, o);
      el.classList.add('plot');
      el.style.height = this.o.h + 'px';
      this.cv = mk('canvas', 'plot-base'); this.ov = mk('canvas', 'plot-over'); this.tip = mk('div', 'plot-tip');
      el.append(this.cv, this.ov, this.tip);
      this.data = null; this.W = 0;
      new ResizeObserver(() => this.resize()).observe(el);
      this.ov.addEventListener('pointermove', (e) => this.onMove(e));
      this.ov.addEventListener('pointerleave', () => this.tip.classList.remove('on'));
      this.ov.addEventListener('click', (e) => this.onClick(e));
    }
    resize() {
      const w = this.el.clientWidth, h = this.el.clientHeight;
      if (!w || !h) return;
      this.dpr = DPR(); setupCanvas(this.cv, w, h, this.dpr); setupCanvas(this.ov, w, h, this.dpr);
      this.W = w; this.H = h; this.draw();
    }
    setData(d, marker) { this.data = d; this.marker = marker; this.draw(); }
    draw() {
      const ctx = this.cv.getContext('2d');
      if (!this.W) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);
      const d = this.data, o = this.o;
      const m = o.m, pl = m.l, pr = this.W - m.r, pt = m.t, pb = this.H - m.b;
      this.box = { pl, pr, pt, pb };
      if (!d) {
        ctx.fillStyle = '#f4f4f4'; ctx.fillRect(pl, pt, pr - pl, pb - pt);
        drawRich(ctx, 'computing…', (pl + pr) / 2, (pt + pb) / 2, 13, 'center', '#888');
        return;
      }
      const { z, nx, ny } = d;
      let zmin = Infinity, zmax = -Infinity;
      for (const v of z) if (isFinite(v)) { if (v < zmin) zmin = v; if (v > zmax) zmax = v; }
      if (o.diverging) {
        // symmetric colour range, clipped at the 92nd percentile so one extreme corner cannot wash out the map
        const abs = Array.from(z, (v) => Math.abs(v)).filter(isFinite).sort((p, q) => p - q);
        const a = abs[Math.floor(0.92 * (abs.length - 1))] || Math.max(Math.abs(zmin), Math.abs(zmax)) || 1;
        zmin = -a; zmax = a;
      }
      const useLog = o.logc && zmin > 0 && zmax / zmin > 20;
      const tr = useLog ? (v) => Math.log10(v) : (v) => v;
      const t0 = tr(zmin), t1 = tr(zmax);
      this.cnorm = (v) => (tr(v) - t0) / ((t1 - t0) || 1);
      // image: one texel per grid node, bilinearly smoothed when scaled up
      const off = document.createElement('canvas'); off.width = nx; off.height = ny;
      const oc = off.getContext('2d'), img = oc.createImageData(nx, ny);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const c = cmap(o.cmap, this.cnorm(z[j * nx + i]));
        const k = ((ny - 1 - j) * nx + i) * 4;
        img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
      }
      oc.putImageData(img, 0, 0);
      const cw = (pr - pl) / (nx - 1), ch = (pb - pt) / (ny - 1);
      ctx.save(); ctx.beginPath(); ctx.rect(pl, pt, pr - pl, pb - pt); ctx.clip();
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(off, pl - cw / 2, pt - ch / 2, pr - pl + cw, pb - pt + ch);
      // contours
      const levels = useLog ? logTicks(zmin, zmax) : linTicks(zmin, zmax, 8).ticks;
      const gx = (i) => pl + i * cw, gy = (j) => pb - j * ch;
      ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(20,20,20,0.55)';
      for (const lev of levels) {
        if (lev <= zmin || lev >= zmax) continue;
        const s = contourSegments(z, nx, ny, lev);
        ctx.setLineDash(o.diverging && lev < 0 ? [3, 2] : []);
        ctx.beginPath();
        for (let k = 0; k < s.length; k += 4) { ctx.moveTo(gx(s[k]), gy(s[k + 1])); ctx.lineTo(gx(s[k + 2]), gy(s[k + 3])); }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
      // axes
      this.X = (x) => pl + (Math.log10(x) - Math.log10(d.x0)) / (Math.log10(d.x1) - Math.log10(d.x0)) * (pr - pl);
      this.Y = (y) => pb - (y - d.y0) / (d.y1 - d.y0) * (pb - pt);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 0.9; ctx.fillStyle = '#111';
      ctx.strokeRect(Math.round(pl) + 0.5, Math.round(pt) + 0.5, Math.round(pr - pl), Math.round(pb - pt));
      for (const t of logTicks(d.x0, d.x1)) {
        const px = Math.round(this.X(t)) + 0.5;
        ctx.beginPath(); ctx.moveTo(px, pb); ctx.lineTo(px, pb - 4); ctx.moveTo(px, pt); ctx.lineTo(px, pt + 4); ctx.stroke();
        drawRich(ctx, fmtLog(t), px, pb + 15, 11.5, 'center', '#111');
      }
      const yt = linTicks(d.y0, d.y1, 5);
      for (const t of yt.ticks) {
        const py = Math.round(this.Y(t)) + 0.5;
        ctx.beginPath(); ctx.moveTo(pl, py); ctx.lineTo(pl + 4, py); ctx.moveTo(pr, py); ctx.lineTo(pr - 4, py); ctx.stroke();
        drawRich(ctx, fmtTick(t, yt.step), pl - 6, py + 4, 11.5, 'right', '#111');
      }
      drawRich(ctx, o.xlabel, (pl + pr) / 2, this.H - 7, 13, 'center', '#111');
      ctx.save(); ctx.translate(13, (pt + pb) / 2); ctx.rotate(-Math.PI / 2); drawRich(ctx, o.ylabel, 0, 0, 13, 'center', '#111'); ctx.restore();
      // colour bar
      const bx = pr + 12, bw = 11;
      for (let k = 0; k < pb - pt; k++) {
        const c = cmap(o.cmap, 1 - k / (pb - pt));
        ctx.fillStyle = 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
        ctx.fillRect(bx, pt + k, bw, 1.5);
      }
      ctx.strokeStyle = '#111'; ctx.strokeRect(bx + 0.5, pt + 0.5, bw, pb - pt);
      const cy = (v) => pb - this.cnorm(v) * (pb - pt);
      const ct = useLog ? logTicks(zmin, zmax) : linTicks(zmin, zmax, 6).ticks;
      const cst = useLog ? 1 : linTicks(zmin, zmax, 6).step;
      for (const t of ct) {
        const py = cy(t);
        if (py < pt - 0.5 || py > pb + 0.5) continue;
        ctx.beginPath(); ctx.moveTo(bx + bw, py); ctx.lineTo(bx + bw + 3, py); ctx.stroke();
        drawRich(ctx, useLog ? fmtLog(t) : fmtTick(t, cst), bx + bw + 5, py + 4, 11, 'left', '#111');
      }
      ctx.save(); ctx.translate(this.W - 6, (pt + pb) / 2); ctx.rotate(-Math.PI / 2); drawRich(ctx, o.clabel, 0, 0, 12, 'center', '#111'); ctx.restore();
      // current design marker
      if (this.marker) {
        ctx.fillStyle = '#111'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3;
        drawStar(ctx, this.X(this.marker.x), this.Y(this.marker.y), 8);
      }
    }
    pick(e) {
      const d = this.data; if (!d || !this.box) return null;
      const r = this.ov.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const { pl, pr, pt, pb } = this.box;
      if (mx < pl || mx > pr || my < pt || my > pb) return null;
      const fx = (mx - pl) / (pr - pl), fy = (pb - my) / (pb - pt);
      const x = d.x0 * Math.pow(d.x1 / d.x0, fx), y = d.y0 + (d.y1 - d.y0) * fy;
      const i = Math.round(fx * (d.nx - 1)), j = Math.round(fy * (d.ny - 1));
      return { x, y, v: d.z[j * d.nx + i], mx, my };
    }
    onMove(e) {
      const p = this.pick(e);
      if (!p) { this.tip.classList.remove('on'); return; }
      this.tip.innerHTML = '<div>' + richHTML('$N$') + ' <b>' + fmtVal(p.x, 4) + '</b> rpm</div><div>' + richHTML('$n$') + ' <b>' + p.y.toFixed(2) + '</b></div><div>' + richHTML(this.o.tipLabel || '') + ' <b>' + (this.o.fmt ? this.o.fmt(p.v) : fmtVal(p.v)) + '</b></div><div class="tt-f">click to apply</div>';
      this.tip.classList.add('on');
      const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
      let tx = p.mx + 14, ty = p.my - th - 10;
      if (tx + tw > this.W - 4) tx = p.mx - tw - 14;
      if (ty < 2) ty = p.my + 14;
      this.tip.style.transform = 'translate(' + Math.round(tx) + 'px,' + Math.round(ty) + 'px)';
    }
    onClick(e) { const p = this.pick(e); if (p && this.o.onPick) this.o.onPick(p.x, p.y); }
  }

  /* ============================================================ Bars */
  class Bars {
    constructor(el, o) {
      this.el = el;
      this.o = Object.assign({ h: 300, m: { l: 150, r: 56, t: 10, b: 40 }, xlabel: '' }, o);
      el.classList.add('plot');
      el.style.height = this.o.h + 'px';
      this.cv = mk('canvas', 'plot-base'); el.append(this.cv);
      this.items = []; this.W = 0;
      new ResizeObserver(() => this.resize()).observe(el);
    }
    resize() {
      const w = this.el.clientWidth, h = this.el.clientHeight;
      if (!w || !h) return;
      this.dpr = DPR(); setupCanvas(this.cv, w, h, this.dpr); this.W = w; this.H = h; this.draw();
    }
    setData(items) { this.items = items; this.draw(); }
    draw() {
      if (!this.W) return;
      const ctx = this.cv.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.W, this.H);
      const it = this.items.filter((q) => isFinite(q.v));
      const m = this.o.m, pl = m.l, pr = this.W - m.r, pt = m.t, pb = this.H - m.b;
      let a = 0; for (const q of it) a = Math.max(a, Math.abs(q.v));
      a = a > 0 ? a * 1.12 : 1;
      const X = (v) => pl + (v + a) / (2 * a) * (pr - pl);
      const bh = (pb - pt) / Math.max(it.length, 1);
      const xt = linTicks(-a, a, 6);
      ctx.strokeStyle = '#e6e6e6'; ctx.lineWidth = 0.8;
      for (const t of xt.ticks) { const px = Math.round(X(t)) + 0.5; ctx.beginPath(); ctx.moveTo(px, pt); ctx.lineTo(px, pb); ctx.stroke(); }
      it.forEach((q, k) => {
        const y = pt + k * bh + bh * 0.18, h = bh * 0.64;
        const x0 = X(0), x1 = X(q.v);
        ctx.fillStyle = q.v >= 0 ? 'rgba(214,39,40,0.82)' : 'rgba(31,119,180,0.82)';
        ctx.fillRect(Math.min(x0, x1), y, Math.abs(x1 - x0), h);
        ctx.strokeStyle = '#111'; ctx.lineWidth = 0.6; ctx.strokeRect(Math.min(x0, x1), y, Math.abs(x1 - x0), h);
        drawRich(ctx, q.label, pl - 8, y + h / 2 + 4, 12.5, 'right', '#111');
        const s = Math.abs(q.v) < 0.005 ? '0.00' : (q.v >= 0 ? '+' : MINUS) + Math.abs(q.v).toFixed(2);
        drawRich(ctx, s, q.v >= 0 ? x1 + 5 : x1 - 5, y + h / 2 + 4, 11.5, q.v >= 0 ? 'left' : 'right', '#333');
      });
      ctx.strokeStyle = '#111'; ctx.lineWidth = 0.9;
      ctx.strokeRect(Math.round(pl) + 0.5, Math.round(pt) + 0.5, Math.round(pr - pl), Math.round(pb - pt));
      const x0 = Math.round(X(0)) + 0.5; ctx.beginPath(); ctx.moveTo(x0, pt); ctx.lineTo(x0, pb); ctx.stroke();
      for (const t of xt.ticks) {
        const px = Math.round(X(t)) + 0.5;
        ctx.beginPath(); ctx.moveTo(px, pb); ctx.lineTo(px, pb - 4); ctx.stroke();
        drawRich(ctx, fmtTick(t, xt.step), px, pb + 15, 11.5, 'center', '#111');
      }
      drawRich(ctx, this.o.xlabel, (pl + pr) / 2, this.H - 7, 13, 'center', '#111');
    }
  }

  root.Plotter = { Plot, HeatMap, Bars, COL, cmap, drawRich, richHTML, fmtVal, parseRich, FM, FI };
})(typeof self !== 'undefined' ? self : globalThis);
