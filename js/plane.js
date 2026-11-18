/* plane.js - shared helpers for the Fractals demos.
 * A classic script (not an ES module) so the pages also work when opened
 * directly from disk (file://).
 *
 * Exposes: Plane, Cx, Fmt, Draw, Theme
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Complex arithmetic on plain {x, y} objects                          */
  /* ------------------------------------------------------------------ */
  const TAU = Math.PI * 2;
  const Cx = {
    of: (x, y) => ({ x, y }),
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
    mul: (a, b) => ({ x: a.x * b.x - a.y * b.y, y: a.x * b.y + a.y * b.x }),
    sq: (a) => ({ x: a.x * a.x - a.y * a.y, y: 2 * a.x * a.y }),
    abs: (a) => Math.hypot(a.x, a.y),
    /** argument in [0, 2π) */
    arg: (a) => {
      if (a.x === 0 && a.y === 0) return 0;
      const t = Math.atan2(a.y, a.x);
      return t < 0 ? t + TAU : t;
    },
    polar: (r, t) => ({ x: r * Math.cos(t), y: r * Math.sin(t) }),
    /** z^p for real p, using the principal branch with arg in [0, 2π) */
    powReal: (a, p) => {
      const r = Math.hypot(a.x, a.y);
      if (r === 0) return { x: 0, y: 0 };
      const t = Cx.arg(a);
      return Cx.polar(Math.pow(r, p), t * p);
    },
  };

  /* ------------------------------------------------------------------ */
  /* Number formatting                                                    */
  /* ------------------------------------------------------------------ */
  const MINUS = '−';
  const Fmt = {
    num(v, d = 2) {
      if (!isFinite(v)) return v > 0 ? '∞' : MINUS + '∞';
      if (Math.abs(v) >= 1e6) return (v < 0 ? MINUS : '') + Math.abs(v).toExponential(2).replace('e+', '·10^');
      let s = v.toFixed(d);
      if (/^-0\.?0*$/.test(s)) s = s.slice(1); // no "-0.00"
      return s.replace('-', MINUS);
    },
    /** "a + bi" with real minus signs */
    cx(z, d = 2) {
      const re = Fmt.num(z.x, d);
      const imAbs = Fmt.num(Math.abs(z.y), d);
      const neg = z.y < 0 && imAbs !== Fmt.num(0, d);
      return `${re} ${neg ? MINUS : '+'} ${imAbs}i`;
    },
    /** parenthesised version for use inside formulas */
    cxp(z, d = 2) { return '(' + Fmt.cx(z, d) + ')'; },
    deg(t, d = 1) { return Fmt.num((t * 180) / Math.PI, d) + '°'; },
    rad(t, d = 2) { return Fmt.num(t, d) + ' rad'; },
    piFrac(t, d = 2) { return Fmt.num(t / Math.PI, d) + 'π'; },
    angle(t, unit, d) { return unit === 'rad' ? Fmt.rad(t, d ?? 2) : Fmt.deg(t, d ?? 1); },
    /** parse user input: accepts "1.5", "1,5", "−2" (unicode minus); NaN if invalid */
    parse(s) {
      const t = String(s).trim().replace(',', '.').replace(/[−–]/g, '-');
      return t === '' || t === '-' || t === '.' ? NaN : Number(t);
    },
    sub(n) { return String(n).replace(/\d/g, (c) => '₀₁₂₃₄₅₆₇₈₉'[c]); },
    sup(n) { return String(n).replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]); },
  };

  /* ------------------------------------------------------------------ */
  /* Theme                                                                */
  /* ------------------------------------------------------------------ */
  const Theme = {
    _cache: null,
    isDark() {
      const forced = document.documentElement.dataset.theme;
      if (forced) return forced === 'dark';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    },
    /** read a CSS custom property (cached until the theme changes) */
    get(name) {
      if (!this._cache) this._cache = {};
      if (!(name in this._cache)) {
        this._cache[name] = getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
      }
      return this._cache[name];
    },
    changed() {
      this._cache = null;
      window.dispatchEvent(new Event('themechange'));
    },
    init(button) {
      try {
        const saved = localStorage.getItem('fractals-theme');
        if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
      } catch (e) { /* storage unavailable: just follow the OS */ }
      const label = () => { if (button) button.textContent = Theme.isDark() ? '☀️ Light' : '🌙 Dark'; };
      label();
      if (button) {
        button.addEventListener('click', () => {
          const next = Theme.isDark() ? 'light' : 'dark';
          document.documentElement.dataset.theme = next;
          try { localStorage.setItem('fractals-theme', next); } catch (e) { /* ignore */ }
          label();
          Theme.changed();
        });
      }
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { label(); Theme.changed(); });
      }
    },
  };

  /* ------------------------------------------------------------------ */
  /* Drawing helpers (screen coordinates)                                 */
  /* ------------------------------------------------------------------ */
  const Draw = {
    /** Clamp huge coordinates so canvas paths don't glitch for escaping orbits. */
    clampS(v) { return Math.max(-1e5, Math.min(1e5, v)); },

    arrow(ctx, x1, y1, x2, y2, color, width = 2.5, opts = {}) {
      x1 = Draw.clampS(x1); y1 = Draw.clampS(y1); x2 = Draw.clampS(x2); y2 = Draw.clampS(y2);
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 0.5) return;
      const head = Math.min(opts.head ?? 7 + width * 2, len * 0.6);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const bx = x2 - Math.cos(ang) * head * 0.8;
      const by = y2 - Math.sin(ang) * head * 0.8;
      ctx.save();
      ctx.globalAlpha = opts.alpha ?? 1;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      if (opts.dash) ctx.setLineDash(opts.dash);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(ang - 0.42) * head, y2 - Math.sin(ang - 0.42) * head);
      ctx.lineTo(x2 - Math.cos(ang + 0.42) * head, y2 - Math.sin(ang + 0.42) * head);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },

    point(ctx, x, y, r, fill, opts = {}) {
      if (Math.abs(x) > 1e5 || Math.abs(y) > 1e5) return;
      ctx.save();
      ctx.globalAlpha = opts.alpha ?? 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      if (opts.hollow) {
        ctx.lineWidth = opts.lineWidth ?? 2;
        ctx.strokeStyle = fill;
        ctx.fillStyle = Theme.get('canvas-bg');
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = opts.ring ?? 2;
        ctx.strokeStyle = opts.ringColor ?? Theme.get('canvas-bg');
        if (ctx.lineWidth > 0) ctx.stroke();
      }
      ctx.restore();
    },

    /** text with a halo so it stays readable on top of grid / fractal */
    label(ctx, text, x, y, color, opts = {}) {
      if (Math.abs(x) > 1e5 || Math.abs(y) > 1e5) return;
      ctx.save();
      ctx.font = opts.font ?? '600 15px system-ui, "Segoe UI", sans-serif';
      ctx.textAlign = opts.align ?? 'left';
      ctx.textBaseline = opts.baseline ?? 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = Theme.get('halo');
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.restore();
    },

    /** arc in *math* orientation (counter-clockwise from +Re) around screen point (ox, oy) */
    mathArc(ctx, ox, oy, R, a0, a1, color, width = 2.5, opts = {}) {
      if (Math.abs(a1 - a0) < 1e-6) return;
      ctx.save();
      ctx.globalAlpha = opts.alpha ?? 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      if (opts.dash) ctx.setLineDash(opts.dash);
      ctx.beginPath();
      ctx.arc(ox, oy, R, -a0, -a1, a1 > a0);
      ctx.stroke();
      if (opts.fill) {
        ctx.globalAlpha = opts.fillAlpha ?? 0.12;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.arc(ox, oy, R, -a0, -a1, a1 > a0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
  };

  /* ------------------------------------------------------------------ */
  /* Plane: a pannable / zoomable complex plane on a <canvas>             */
  /* ------------------------------------------------------------------ */
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }

  class Plane {
    /**
     * opts: cx, cy, span (world units across the shorter side),
     *       onDraw(ctx), onViewChange(), onViewSettled(), onClick(x, y), onHover(x, y), onLeave()
     */
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.home = { cx: opts.cx ?? 0, cy: opts.cy ?? 0, span: opts.span ?? 6 };
      this.cx = this.home.cx;
      this.cy = this.home.cy;
      this.scale = 100; // pixels per world unit
      this.w = 0;
      this.h = 0;
      this.dpr = 1;
      this.draggables = [];
      this.opts = opts;
      this._init = false;
      this._raf = 0;
      this._drag = null;
      this._settleTimer = 0;
      canvas.style.touchAction = 'none';
      new ResizeObserver(() => this.resize()).observe(canvas);
      this._bindPointer();
      // measure now, but don't fire callbacks while the page script is still setting up
      this._silent = true;
      this.resize();
      this._silent = false;
    }

    /* coordinate transforms */
    sx(x) { return this.w / 2 + (x - this.cx) * this.scale; }
    sy(y) { return this.h / 2 - (y - this.cy) * this.scale; }
    toScreen(p) { return [this.sx(p.x), this.sy(p.y)]; }
    toWorld(sx, sy) { return { x: this.cx + (sx - this.w / 2) / this.scale, y: this.cy - (sy - this.h / 2) / this.scale }; }
    gridStep() { return niceStep(75 / this.scale); }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      this.dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.round(r.width * this.dpr);
      this.canvas.height = Math.round(r.height * this.dpr);
      this.w = r.width;
      this.h = r.height;
      if (!this._init) {
        this.scale = Math.min(this.w, this.h) / this.home.span;
        this._init = true;
      }
      this.viewChanged();
    }

    resetView() {
      this.cx = this.home.cx;
      this.cy = this.home.cy;
      this.scale = Math.min(this.w, this.h) / this.home.span;
      this.viewChanged();
    }

    clampScale(s) { return Math.max(4, Math.min(this.opts.maxScale || 5e7, s)); }

    zoomAt(sx, sy, f) {
      this.zoomTo(this.toWorld(sx, sy), sx, sy, this.scale * f);
    }

    /** set the zoom to `scale` and put world point p at screen point (sx, sy) */
    zoomTo(p, sx, sy, scale) {
      this.scale = this.clampScale(scale);
      this.cx = p.x - (sx - this.w / 2) / this.scale;
      this.cy = p.y + (sy - this.h / 2) / this.scale;
      this.viewChanged();
    }

    viewChanged() {
      if (!this._silent && this.opts.onViewChange) this.opts.onViewChange();
      this.requestDraw();
      clearTimeout(this._settleTimer);
      this._settleTimer = setTimeout(() => this.opts.onViewSettled && this.opts.onViewSettled(), 160);
    }

    requestDraw() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this.draw();
      });
    }

    draw() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      this.opts.onDraw && this.opts.onDraw(ctx);
    }

    /** Draggable: { get: () => {x,y}, set: (x, y) => void, radius?, enabled?: () => bool, onStart?, onEnd? } */
    addDraggable(d) { this.draggables.push(d); return d; }

    hitTest(sx, sy) {
      for (let i = this.draggables.length - 1; i >= 0; i--) {
        const d = this.draggables[i];
        if (d.enabled && !d.enabled()) continue;
        const p = d.get();
        if (Math.hypot(this.sx(p.x) - sx, this.sy(p.y) - sy) <= (d.radius ?? 10) + 8) return d;
      }
      return null;
    }

    _local(e) {
      const r = this.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }

    _bindPointer() {
      const c = this.canvas;
      // Fingers currently on the canvas (pointerId -> [sx, sy]). Two fingers = pinch to zoom.
      const pts = new Map();
      const twoFingers = () => {
        const [[ax, ay], [bx, by]] = [...pts.values()];
        return { mx: (ax + bx) / 2, my: (ay + by) / 2, dist: Math.hypot(bx - ax, by - ay) || 1 };
      };
      // The world point under the midpoint stays under the midpoint, so two fingers also pan.
      const startPinch = () => {
        const f = twoFingers();
        this._drag = { kind: 'pinch', d0: f.dist, s0: this.scale, p: this.toWorld(f.mx, f.my) };
      };
      c.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        const [sx, sy] = this._local(e);
        c.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, [sx, sy]);
        if (pts.size > 1) {
          // a second finger: stop dragging a point (if any) and pinch instead
          const d = this._drag;
          if (d && d.kind === 'point') d.item.onEnd && d.item.onEnd();
          if (pts.size === 2) startPinch();
          return;
        }
        const hit = this.hitTest(sx, sy);
        if (hit) {
          const p = hit.get();
          const m = this.toWorld(sx, sy);
          this._drag = { kind: 'point', item: hit, ox: p.x - m.x, oy: p.y - m.y };
          hit.onStart && hit.onStart();
          c.style.cursor = 'grabbing';
        } else {
          this._drag = { kind: 'pan', sx0: sx, sy0: sy, cx0: this.cx, cy0: this.cy, moved: false };
        }
      });
      c.addEventListener('pointermove', (e) => {
        const [sx, sy] = this._local(e);
        if (pts.has(e.pointerId)) pts.set(e.pointerId, [sx, sy]);
        const d = this._drag;
        if (d && d.kind === 'pinch') {
          if (pts.size < 2) return;
          const f = twoFingers();
          this.zoomTo(d.p, f.mx, f.my, d.s0 * f.dist / d.d0);
          return;
        }
        if (d && d.kind === 'point') {
          const m = this.toWorld(sx, sy);
          d.item.set(m.x + d.ox, m.y + d.oy);
          this.requestDraw();
        } else if (d && d.kind === 'pan') {
          const dx = sx - d.sx0, dy = sy - d.sy0;
          if (!d.moved && Math.hypot(dx, dy) > 4) { d.moved = true; c.style.cursor = 'grabbing'; }
          if (d.moved) {
            this.cx = d.cx0 - dx / this.scale;
            this.cy = d.cy0 + dy / this.scale;
            this.viewChanged();
          }
        } else {
          c.style.cursor = this.hitTest(sx, sy) ? 'grab' : 'crosshair';
        }
        const m = this.toWorld(sx, sy);
        this.opts.onHover && this.opts.onHover(m.x, m.y, !!d);
      });
      const end = (e, cancelled) => {
        pts.delete(e.pointerId);
        const d = this._drag;
        if (d && d.kind === 'pinch') {
          if (pts.size >= 2) { startPinch(); return; }
          if (pts.size === 1) {
            // one finger left: carry on panning with it (and don't treat lifting it as a tap)
            const [sx, sy] = [...pts.values()][0];
            this._drag = { kind: 'pan', sx0: sx, sy0: sy, cx0: this.cx, cy0: this.cy, moved: true };
            return;
          }
        }
        if (pts.size > 0) return;
        this._drag = null;
        c.style.cursor = 'crosshair';
        if (!d) return;
        if (d.kind === 'point') d.item.onEnd && d.item.onEnd();
        if (d.kind === 'pan' && !d.moved && !cancelled && this.opts.onClick) {
          const [sx, sy] = this._local(e);
          const m = this.toWorld(sx, sy);
          this.opts.onClick(m.x, m.y);
        }
      };
      c.addEventListener('pointerup', (e) => end(e, false));
      c.addEventListener('pointercancel', (e) => end(e, true));
      c.addEventListener('pointerleave', () => { if (!this._drag) this.opts.onLeave && this.opts.onLeave(); });
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        const [sx, sy] = this._local(e);
        const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
        this.zoomAt(sx, sy, Math.exp(-dy * 0.0015));
      }, { passive: false });
    }

    /** Hook up +, −, home buttons */
    bindZoomButtons(zin, zout, home) {
      zin && zin.addEventListener('click', () => this.zoomAt(this.w / 2, this.h / 2, 1.5));
      zout && zout.addEventListener('click', () => this.zoomAt(this.w / 2, this.h / 2, 1 / 1.5));
      home && home.addEventListener('click', () => this.resetView());
    }

    /* ---------- grid ---------- */
    drawGrid(ctx, opts = {}) {
      const { w, h } = this;
      const step = this.gridStep();
      const minor = step / 5;
      const tl = this.toWorld(0, 0);
      const br = this.toWorld(w, h);

      const lines = (st, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = Math.ceil(tl.x / st); i * st <= br.x; i++) {
          const X = Math.round(this.sx(i * st)) + 0.5;
          ctx.moveTo(X, 0); ctx.lineTo(X, h);
        }
        for (let i = Math.ceil(br.y / st); i * st <= tl.y; i++) {
          const Y = Math.round(this.sy(i * st)) + 0.5;
          ctx.moveTo(0, Y); ctx.lineTo(w, Y);
        }
        ctx.stroke();
      };
      if (opts.minor !== false && minor * this.scale > 9) lines(minor, Theme.get('grid'));
      lines(step, Theme.get('grid-strong'));

      // axes
      const ax = Math.round(this.sx(0)) + 0.5;
      const ay = Math.round(this.sy(0)) + 0.5;
      ctx.strokeStyle = Theme.get('axis');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ax >= 0 && ax <= w) { ctx.moveTo(ax, 0); ctx.lineTo(ax, h); }
      if (ay >= 0 && ay <= h) { ctx.moveTo(0, ay); ctx.lineTo(w, ay); }
      ctx.stroke();

      // tick labels
      const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
      const fmt = (v) => Fmt.num(v, dec);
      ctx.font = '12px system-ui, "Segoe UI", sans-serif';
      ctx.fillStyle = Theme.get('tick');
      const ly = Math.min(Math.max(ay + 5, 4), h - 18);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      // (when deeply zoomed the labels get long: skip any that would overlap the previous one)
      let lastEnd = -Infinity;
      for (let i = Math.ceil(tl.x / step); i * step <= br.x; i++) {
        if (i === 0) continue;
        const t = fmt(i * step), X = this.sx(i * step) + 3;
        if (X < lastEnd + 10) continue;
        ctx.fillText(t, X, ly);
        lastEnd = X + ctx.measureText(t).width;
      }
      const yl = [];
      for (let i = Math.ceil(br.y / step); i * step <= tl.y; i++) {
        if (i === 0) continue;
        const v = i * step;
        yl.push([v, Math.abs(v - 1) < 1e-12 ? 'i' : Math.abs(v + 1) < 1e-12 ? MINUS + 'i' : fmt(v) + 'i']);
      }
      const maxW = yl.reduce((m, [, t]) => Math.max(m, ctx.measureText(t).width), 0);
      const lx = Math.min(Math.max(ax + 5, 4), w - maxW - 6);
      ctx.textBaseline = 'bottom';
      for (const [v, t] of yl) ctx.fillText(t, lx, this.sy(v) - 2);
      if (ax >= 0 && ax <= w && ay >= 0 && ay <= h) {
        ctx.textBaseline = 'top';
        ctx.fillText('0', ax + 3, ay + 5);
      }

      // axis names
      ctx.font = '600 13px system-ui, "Segoe UI", sans-serif';
      ctx.fillStyle = Theme.get('axis');
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Re', w - 8, Math.min(Math.max(ay - 4, 16), h - 2));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Im', Math.min(Math.max(ax + 8, 4), w - 30), 8);
    }

    /** dashed circle centred at the origin with world radius r */
    circle(ctx, r, color, opts = {}) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = opts.width ?? 1.5;
      ctx.globalAlpha = opts.alpha ?? 1;
      if (opts.dash) ctx.setLineDash(opts.dash);
      ctx.beginPath();
      ctx.arc(this.sx(opts.cx ?? 0), this.sy(opts.cy ?? 0), Math.max(0, r * this.scale), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  global.Plane = Plane;
  global.Cx = Cx;
  global.Fmt = Fmt;
  global.Draw = Draw;
  global.Theme = Theme;
  global.niceStep = niceStep;
})(window);
