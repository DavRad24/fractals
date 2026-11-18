/* mandelbrot.js - Demo 2: the iteration z -> z^2 + c, step by step. */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const C = (k) => Theme.get(k);
  const n3 = (v) => Fmt.num(v, 3);
  const n4 = (v) => Fmt.num(v, 4);
  const sub = Fmt.sub;
  const TAU = Math.PI * 2;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  Theme.init($('#theme'));

  /* ------------------------------------------------------------------ */
  /* State                                                                */
  /* ------------------------------------------------------------------ */
  const S = {
    mode: 'M', // 'M': vary c, z0 = 0 (Mandelbrot)   'J': vary z0, c fixed (Julia)
    c: { x: -0.1226, y: 0.7449 },
    z0: { x: 0, y: 0 },
    N: 30,
    k: 0,
    speed: 3,
    playing: false,
    lines: true,
    points: true,
    labels: true,
    moves: false,
    escCircle: true,
    cycle: true,
    shadow: true,
    shadowStyle: 'silhouette',
    matchN: false,
    depthMul: 1, // multiplier on the automatic iteration depth of the shadow
    explorer: false, // full-screen view of just the set, no panel
    palette: 'classic',
    density: 24, // colour bands (explorer)
    follow: false,
    sound: false,
  };

  let orbit = { pts: [], esc: -1 }; // the first N steps
  let longRun = { esc: -1, period: null, cycle: [] }; // what happens eventually
  let stepAnim = null; // { k, t0, dur }
  let playTimer = 0;

  /* ------------------------------------------------------------------ */
  /* Iteration maths                                                      */
  /* ------------------------------------------------------------------ */
  function computeOrbit() {
    const pts = [{ x: S.z0.x, y: S.z0.y }];
    let x = S.z0.x, y = S.z0.y;
    let esc = x * x + y * y > 4 ? 0 : -1;
    for (let n = 1; n <= S.N; n++) {
      const nx = x * x - y * y + S.c.x;
      y = 2 * x * y + S.c.y;
      x = nx;
      pts.push({ x, y });
      const r2 = x * x + y * y;
      if (esc < 0 && r2 > 4) esc = n;
      if (r2 > 1e16 || !isFinite(r2)) break; // astronomically large: stop
    }
    orbit = { pts, esc };
  }

  const LONG_RUN = 200000;
  const N_MAX = 5000;

  /** Long-run behaviour, independent of N: does it ever escape? does it settle into a cycle? */
  function computeLongRun() {
    let x = S.z0.x, y = S.z0.y;
    const cx = S.c.x, cy = S.c.y;
    if (x * x + y * y > 4) { longRun = { esc: 0, period: null, cycle: [] }; return; }
    const M = LONG_RUN; // ~0.5 ms, so it can run on every drag move
    for (let n = 1; n <= M; n++) {
      const nx = x * x - y * y + cx;
      y = 2 * x * y + cy;
      x = nx;
      if (x * x + y * y > 4) { longRun = { esc: n, period: null, cycle: [] }; return; }
    }
    const tail = [];
    for (let i = 0; i < 260; i++) {
      const nx = x * x - y * y + cx;
      y = 2 * x * y + cy;
      x = nx;
      tail.push({ x, y });
    }
    const L = tail.length - 1;
    let period = null;
    for (let p = 1; p <= 120; p++) {
      const a = tail[L], b = tail[L - p], b2 = tail[L - 2 * p];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-7 && Math.hypot(a.x - b2.x, a.y - b2.y) < 2e-7) { period = p; break; }
    }
    longRun = { esc: -1, period, cycle: period ? tail.slice(L - period + 1) : [] };
  }

  /** escape step for a single point (used by the pointer read-out) */
  function escapeTime(z, c, max) {
    let x = z.x, y = z.y;
    for (let n = 0; n <= max; n++) {
      if (x * x + y * y > 4) return n;
      const nx = x * x - y * y + c.x;
      y = 2 * x * y + c.y;
      x = nx;
    }
    return -1;
  }

  const maxK = () => orbit.pts.length - 1;

  /* ------------------------------------------------------------------ */
  /* Plane                                                                */
  /* ------------------------------------------------------------------ */
  const plane = new Plane($('#plane'), {
    cx: -0.55,
    cy: 0,
    span: 3.3,
    maxScale: 2e13, // ~1e11× zoom: about the limit of double precision
    onDraw: draw,
    onViewChange: () => shadow.invalidate(),
    onClick: (x, y) => {
      if (S.explorer) plane.zoomAt(plane.sx(x), plane.sy(y), 2); // explorer: click to zoom in
      else if (!paint.active) moveActive(x, y);
    },
    onHover: (x, y, dragging) => {
      readout(x, y);
      if (S.follow && !S.explorer && !dragging && !paint.active) moveActive(x, y, true);
    },
    onLeave: () => { $('#readout').textContent = ''; },
  });
  plane.bindZoomButtons($('#zin'), $('#zout'), $('#zhome'));

  plane.addDraggable({
    get: () => S.z0,
    set: (x, y) => { S.z0 = { x, y }; afterMove(false); },
    enabled: () => S.mode === 'J' && !paint.active && !S.explorer,
    radius: 9,
  });
  plane.addDraggable({
    get: () => S.c,
    set: (x, y) => { S.c = { x, y }; afterMove(true); },
    enabled: () => !paint.active && !S.explorer,
    radius: 9,
  });

  /** Click / follow-mouse moves the point that belongs to the current mode. */
  function moveActive(x, y) {
    if (S.mode === 'M') { S.c = { x, y }; afterMove(true); }
    else { S.z0 = { x, y }; afterMove(false); }
  }

  function afterMove(cChanged) {
    stepAnim = null;
    recompute();
    if (cChanged && S.mode === 'J') shadow.invalidate();
  }

  function recompute() {
    const wasAtEnd = S.k >= maxK();
    computeOrbit();
    computeLongRun();
    S.k = wasAtEnd ? maxK() : Math.min(S.k, maxK());
    scheduleUI();
    plane.requestDraw();
  }

  function readout(x, y) {
    const p = { x, y };
    const it = Math.max(1000, shadowIter());
    const e = S.mode === 'M' ? escapeTime({ x: 0, y: 0 }, p, it) : escapeTime(p, S.c, it);
    const what = S.mode === 'M' ? 'as c' : 'as z₀';
    const fate = e < 0 ? 'stays bounded (inside)' : e === 0 ? 'already outside |z| = 2' : `escapes after ${e} step${e === 1 ? '' : 's'}`;
    $('#readout').textContent = `${Fmt.cx(p, 3)}   ${what}: ${fate}`;
  }

  /* ------------------------------------------------------------------ */
  /* The shadow of the set (Mandelbrot or filled Julia), rendered progressively */
  /* ------------------------------------------------------------------ */
  /* Colour palettes: colour stops along one cycle (0..1, the end wraps back to the start). */
  const PALETTES = {
    classic: { name: 'Classic (blue & gold)', stops: [[0, [8, 14, 48]], [0.15, [26, 76, 190]], [0.4, [110, 210, 255]], [0.58, [255, 250, 232]], [0.78, [255, 168, 40]], [0.9, [150, 40, 70]], [1, [8, 14, 48]]] },
    ultra: { name: 'Ultra Fractal', stops: [[0, [0, 7, 100]], [0.16, [32, 107, 203]], [0.42, [237, 255, 255]], [0.6425, [255, 170, 0]], [0.8575, [0, 2, 0]], [1, [0, 7, 100]]] },
    fire: { name: 'Fire', stops: [[0, [0, 0, 0]], [0.2, [120, 0, 0]], [0.42, [235, 60, 0]], [0.62, [255, 190, 30]], [0.78, [255, 255, 210]], [0.9, [170, 40, 0]], [1, [0, 0, 0]]] },
    ice: { name: 'Ice', stops: [[0, [2, 8, 28]], [0.28, [16, 70, 140]], [0.52, [110, 195, 240]], [0.68, [245, 252, 255]], [0.84, [60, 130, 200]], [1, [2, 8, 28]]] },
    neon: { name: 'Neon', stops: [[0, [0, 0, 0]], [0.22, [80, 0, 150]], [0.45, [255, 0, 160]], [0.65, [0, 235, 255]], [0.8, [255, 255, 255]], [1, [0, 0, 0]]] },
    gold: { name: 'Gold', stops: [[0, [10, 6, 0]], [0.3, [120, 70, 10]], [0.55, [240, 190, 70]], [0.7, [255, 245, 200]], [0.85, [170, 110, 20]], [1, [10, 6, 0]]] },
    forest: { name: 'Forest', stops: [[0, [2, 12, 6]], [0.3, [20, 90, 40]], [0.52, [160, 210, 90]], [0.68, [250, 240, 190]], [0.84, [110, 70, 30]], [1, [2, 12, 6]]] },
    rainbow: { name: 'Rainbow', stops: [[0, [255, 40, 40]], [1 / 6, [255, 220, 0]], [2 / 6, [40, 220, 60]], [3 / 6, [0, 220, 255]], [4 / 6, [40, 60, 255]], [5 / 6, [220, 40, 255]], [1, [255, 40, 40]]] },
    grey: { name: 'Black & white', stops: [[0, [0, 0, 0]], [0.5, [255, 255, 255]], [1, [0, 0, 0]]] },
  };

  function buildLUT(stops) {
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 256;
      let s = 0;
      while (stops[s + 1][0] < t) s++;
      const [t0, c0] = stops[s], [t1, c1] = stops[s + 1];
      const u = (t - t0) / (t1 - t0);
      for (let ch = 0; ch < 3; ch++) lut[i * 3 + ch] = c0[ch] + (c1[ch] - c0[ch]) * u;
    }
    return lut;
  }
  let LUT = buildLUT(PALETTES[S.palette].stops);

  /** zoom relative to the home view */
  function zoomFactor() {
    return plane.scale / (Math.min(plane.w, plane.h) / plane.home.span);
  }

  /** iterations per pixel: grows with the zoom, times the user's depth multiplier */
  function shadowIter() {
    if (matchN()) return S.N;
    const zoom = Math.max(1, zoomFactor());
    return Math.max(20, Math.round(Math.min(200000, (250 + 110 * Math.log2(zoom)) * S.depthMul)));
  }

  /* shadePoint and renderBand must be self-contained: they are also copied into the Web Workers. */

  /** Compute the RGBA colour of one point of the shadow into data[o..o+3]. */
  function shadePoint(v, x, y, data, o, LUT) {
    let zx, zy, cx, cy;
    if (v.mode === 'J') { zx = x; zy = y; cx = v.cx; cy = v.cy; }
    else {
      zx = 0; zy = 0; cx = x; cy = y;
      if (!v.matchN) {
        // quick tests for the main cardioid and the period-2 disc
        const q = (x - 0.25) * (x - 0.25) + y * y;
        if (q * (q + (x - 0.25)) <= 0.25 * y * y || (x + 1) * (x + 1) + y * y <= 0.0625) {
          data[o] = v.inside[0]; data[o + 1] = v.inside[1]; data[o + 2] = v.inside[2]; data[o + 3] = v.inside[3];
          return;
        }
      }
    }
    const bail = v.style === 'color' && !v.matchN ? 1024 : 4;
    const iter = v.iter, eps = v.eps;
    let n = 0, x2 = zx * zx, y2 = zy * zy;
    // periodicity check (Brent): if the orbit returns to a saved point it is a cycle, so it never escapes
    let ox = zx, oy = zy, check = 8, cycle = false;
    while (n < iter && x2 + y2 <= bail) {
      zy = 2 * zx * zy + cy;
      zx = x2 - y2 + cx;
      x2 = zx * zx;
      y2 = zy * zy;
      n++;
      if (Math.abs(zx - ox) < eps && Math.abs(zy - oy) < eps) { cycle = true; break; }
      if (n === check) { ox = zx; oy = zy; check += check; }
    }
    if (cycle || x2 + y2 <= bail) {
      data[o] = v.inside[0]; data[o + 1] = v.inside[1]; data[o + 2] = v.inside[2]; data[o + 3] = v.inside[3];
      return;
    }
    if (v.style === 'color') {
      let nu = n;
      if (!v.matchN) nu = n + 1 - Math.log(Math.log(x2 + y2) * 0.5) / Math.LN2;
      const idx = ((Math.sqrt(Math.max(0, nu)) * v.density) | 0) & 255;
      data[o] = LUT[idx * 3];
      data[o + 1] = LUT[idx * 3 + 1];
      data[o + 2] = LUT[idx * 3 + 2];
      data[o + 3] = v.outAlpha;
    } else {
      // soft glow for points that took a long time to escape (shows the thin filaments)
      const g = v.matchN ? 0 : Math.min(1, n / 45);
      data[o] = v.inside[0];
      data[o + 1] = v.inside[1];
      data[o + 2] = v.inside[2];
      data[o + 3] = v.inside[3] * 0.55 * g * g;
    }
  }

  function viewParams(factor, style) {
    const W = Math.ceil(plane.w / factor), H = Math.ceil(plane.h / factor);
    const tl = plane.toWorld(0, 0);
    const dark = Theme.isDark();
    style = S.explorer ? 'color' : style || S.shadowStyle;
    let inside;
    if (S.explorer) inside = [0, 0, 0, 255];
    else if (style === 'color') inside = dark ? [4, 6, 16, 240] : [16, 20, 38, 230];
    else inside = dark ? [150, 172, 240, 92] : [45, 60, 120, 72];
    const px = factor / plane.scale;
    return {
      W, H,
      px,
      x0: tl.x,
      y1: tl.y,
      mode: S.mode,
      cx: S.c.x,
      cy: S.c.y,
      iter: shadowIter(),
      eps: Math.max(1e-16, Math.min(1e-12, px * 1e-3)),
      style,
      matchN: matchN(),
      inside: [...inside],
      outAlpha: S.explorer ? 255 : dark ? 205 : 190,
      density: S.explorer ? S.density : 24,
    };
  }

  /** "shadow uses only N steps" applies in the normal view, not in the explorer */
  function matchN() { return S.matchN && !S.explorer; }

  /** switch colour palette (also tells the workers) */
  function setPalette(key) {
    S.palette = key;
    LUT = buildLUT(PALETTES[key].stops);
    if (workers) for (const w of workers) w.postMessage({ LUT });
    shadow.invalidate();
  }

  /** Render rows r0..r1-1 of view v into data (data starts at row r0). */
  function renderBand(v, data, r0, r1, LUT) {
    const W = v.W;
    for (let j = r0; j < r1; j++) {
      const y = v.y1 - (j + 0.5) * v.px;
      let o = (j - r0) * W * 4;
      for (let i = 0; i < W; i++, o += 4) shadePoint(v, v.x0 + (i + 0.5) * v.px, y, data, o, LUT);
    }
  }

  const shade = (v, x, y, data, o) => shadePoint(v, x, y, data, o, LUT);

  /* A pool of Web Workers renders the sharp image in parallel on all CPU cores.
     (Built from a Blob so it also works when the page is opened straight from disk.) */
  let workers = null;
  try {
    const n = Math.max(2, Math.min(12, (navigator.hardwareConcurrency || 4) - 1));
    const src = `${shadePoint}\n${renderBand}\n
      let LUT = null;
      onmessage = (e) => {
        const m = e.data;
        if (m.LUT) { LUT = m.LUT; return; }
        const data = new Uint8ClampedArray(m.v.W * (m.r1 - m.r0) * 4);
        renderBand(m.v, data, m.r0, m.r1, LUT);
        postMessage({ gen: m.gen, r0: m.r0, r1: m.r1, data }, [data.buffer]);
      };`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(url);
      w.postMessage({ LUT });
      w.onmessage = (e) => { w.busy = false; shadow.onBand(e.data); shadow.dispatch(w); };
      w.onerror = () => { workers = null; shadow.invalidate(); };
      workers.push(w);
    }
  } catch (e) {
    workers = null; // fall back to rendering on the main thread
  }

  /** where an image rendered with view v lands on the current screen */
  function placeOf(v) {
    return [plane.sx(v.x0), plane.sy(v.y1), v.W * v.px * plane.scale, v.H * v.px * plane.scale];
  }

  const shadow = {
    lo: document.createElement('canvas'),
    hi: document.createElement('canvas'),
    loView: null,
    hiView: null,
    hiRow: 0,
    job: null,
    factor: 4,
    needLo: true,
    gen: 0,
    timer: 0,

    invalidate() {
      this.needLo = true;
      this.gen++;
      this.hiView = null;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.startHi(), 140);
      plane.requestDraw();
    },

    renderLo() {
      if (plane.w < 2) return;
      const t0 = performance.now();
      const v = viewParams(this.factor);
      v.iter = Math.min(v.iter, 700); // quick preview while moving; the sharp pass uses the full depth
      const img = new ImageData(v.W, v.H);
      renderBand(v, img.data, 0, v.H, LUT);
      this.lo.width = v.W;
      this.lo.height = v.H;
      this.lo.getContext('2d').putImageData(img, 0, 0);
      this.loView = v;
      this.needLo = false;
      const dt = performance.now() - t0;
      if (dt > 22 && this.factor < 8) this.factor++;
      else if (dt < 5 && this.factor > 2) this.factor--;
    },

    startHi() {
      if (plane.w < 2) return;
      const gen = this.gen;
      // with workers: render at the screen's real pixel density (sharper), unless that is huge
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const area = plane.w * plane.h;
      const factor = workers ? (area * dpr * dpr > 9e6 ? 1 : 1 / dpr) : area > 2.5e6 ? 1.5 : 1;
      const v = viewParams(factor);
      this.hi.width = v.W;
      this.hi.height = v.H;
      const hctx = this.hi.getContext('2d');
      this.hiView = v;
      this.hiRow = 0;

      if (workers) {
        const band = Math.max(2, Math.ceil(24000 / v.W)); // rows per job
        this.job = { gen, v, ctx: hctx, band, next: 0, done: new Uint8Array(Math.ceil(v.H / band)) };
        for (const w of workers) if (!w.busy) this.dispatch(w);
        return;
      }

      const img = hctx.createImageData(v.W, v.H);
      const tick = () => {
        if (gen !== this.gen) return;
        const t0 = performance.now();
        const start = this.hiRow;
        let row = start;
        while (row < v.H && performance.now() - t0 < 12) {
          const r1 = Math.min(v.H, row + 4);
          renderBand(v, img.data.subarray(row * v.W * 4), row, r1, LUT);
          row = r1;
        }
        hctx.putImageData(img, 0, 0, 0, start, v.W, row - start);
        this.hiRow = row;
        plane.requestDraw();
        if (row < v.H) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },

    /** give an idle worker the next band of rows of the current job */
    dispatch(w) {
      const J = this.job;
      if (!workers || !J || J.gen !== this.gen || J.next >= J.v.H) return;
      const r0 = J.next, r1 = Math.min(J.v.H, r0 + J.band);
      J.next = r1;
      w.busy = true;
      w.postMessage({ gen: J.gen, v: J.v, r0, r1 });
    },

    /** a worker finished a band: paint it and advance the "finished from the top" row */
    onBand(m) {
      const J = this.job;
      if (!J || m.gen !== J.gen || m.gen !== this.gen) return;
      J.ctx.putImageData(new ImageData(m.data, J.v.W, m.r1 - m.r0), 0, m.r0);
      J.done[m.r0 / J.band] = 1;
      let k = Math.floor(this.hiRow / J.band);
      while (k < J.done.length && J.done[k]) k++;
      this.hiRow = Math.min(J.v.H, k * J.band);
      plane.requestDraw();
    },

    drawTo(ctx) {
      if (this.needLo) this.renderLo();
      if (!this.loView) return;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      const hv = this.hiView;
      const hr = hv ? this.hiRow : 0;
      if (!hv || hr < hv.H) {
        const lv = this.loView;
        const [X, Y, Wd, Hd] = placeOf(lv);
        // skip the rows already covered by the sharp image
        const sy0 = hv ? Math.min(lv.H - 1, Math.floor((hr * hv.px) / lv.px)) : 0;
        ctx.drawImage(this.lo, 0, sy0, lv.W, lv.H - sy0, X, Y + (sy0 / lv.H) * Hd, Wd, (Hd * (lv.H - sy0)) / lv.H);
      }
      if (hv && hr > 0) {
        const [X, Y, Wd, Hd] = placeOf(hv);
        ctx.drawImage(this.hi, 0, 0, hv.W, hr, X, Y, Wd, (Hd * hr) / hv.H);
      }
      ctx.restore();
    },
  };

  /* ------------------------------------------------------------------ */
  /* "Paint the set point by point"                                       */
  /* ------------------------------------------------------------------ */
  const paint = {
    active: false,
    done: false,
    canvas: document.createElement('canvas'),
    levels: [32, 16, 8, 4],
    perFrame: [10, 45, 220, 1100],
    li: 0,
    idx: 0,
    cur: null,
    view: null,

    start() {
      stopPlay();
      const v = viewParams(1, 'color');
      v.matchN = false;
      this.view = v;
      this.canvas.width = v.W;
      this.canvas.height = v.H;
      this.g = this.canvas.getContext('2d');
      this.g.clearRect(0, 0, v.W, v.H);
      this.li = 0;
      this.idx = 0;
      this.active = true;
      this.done = false;
      this.px = new Uint8ClampedArray(4);
      updatePaintButton();
      requestAnimationFrame(() => this.tick());
    },
    stop() { this.active = false; this.done = true; this.cur = null; updatePaintButton(); plane.requestDraw(); },
    clear() { this.active = false; this.done = false; this.cur = null; updatePaintButton(); plane.requestDraw(); },

    tick() {
      if (!this.active) return;
      const v = this.view;
      let count = this.perFrame[this.li];
      while (count-- > 0) {
        const L = this.levels[this.li];
        const cols = Math.ceil(v.W / L), rows = Math.ceil(v.H / L);
        if (this.idx >= cols * rows) {
          this.li++;
          this.idx = 0;
          if (this.li >= this.levels.length) { this.stop(); return; }
          count = this.perFrame[this.li];
          continue;
        }
        const i = this.idx % cols, j = (this.idx / cols) | 0;
        this.idx++;
        const x = v.x0 + (i * L + L / 2) * v.px, y = v.y1 - (j * L + L / 2) * v.px;
        shade(v, x, y, this.px, 0);
        const a = this.px[3] / 255;
        this.g.fillStyle = `rgba(${this.px[0]},${this.px[1]},${this.px[2]},${a})`;
        this.g.clearRect(i * L, j * L, L, L);
        this.g.fillRect(i * L, j * L, L, L);
        this.cur = { x, y };
      }
      plane.requestDraw();
      requestAnimationFrame(() => this.tick());
    },

    drawTo(ctx) {
      const [X, Y, Wd, Hd] = placeOf(this.view);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.canvas, X, Y, Wd, Hd);
      ctx.restore();
    },

    /** the orbit of the point currently being tested */
    drawScan(ctx) {
      if (!this.cur) return;
      const v = this.view;
      let z = v.mode === 'M' ? { x: 0, y: 0 } : { ...this.cur };
      const c = v.mode === 'M' ? this.cur : { x: v.cx, y: v.cy };
      const pts = [z];
      for (let n = 0; n < 40 && z.x * z.x + z.y * z.y <= 4; n++) { z = Cx.add(Cx.sq(z), c); pts.push(z); }
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const X = Draw.clampS(plane.sx(p.x)), Y = Draw.clampS(plane.sy(p.y));
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      });
      ctx.stroke();
      ctx.restore();
      const [X, Y] = plane.toScreen(this.cur);
      ctx.save();
      ctx.strokeStyle = C('c');
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X - 14, Y); ctx.lineTo(X + 14, Y);
      ctx.moveTo(X, Y - 14); ctx.lineTo(X, Y + 14);
      ctx.stroke();
      ctx.restore();
    },
  };

  function updatePaintButton() {
    const b = $('#bPaint');
    if (paint.active) b.innerHTML = '&#9632; Stop painting';
    else if (paint.done) b.innerHTML = '&#10005; Clear the painting';
    else b.innerHTML = '&#127912; Paint the set point by point';
  }

  /* ------------------------------------------------------------------ */
  /* Drawing                                                              */
  /* ------------------------------------------------------------------ */
  function seg(ctx, x1, y1, x2, y2, color, width, alpha, dash) {
    x1 = Draw.clampS(x1); y1 = Draw.clampS(y1); x2 = Draw.clampS(x2); y2 = Draw.clampS(y2);
    ctx.save();
    ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = C('halo');
    ctx.lineWidth = width + 2.5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  function pathOf(ctx, pts, color, width, alpha, dash) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const X = Draw.clampS(plane.sx(p.x)), Y = Draw.clampS(plane.sy(p.y));
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    });
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }

  /** the curved "squaring" path from a to a²: length r -> r², angle θ -> 2θ */
  function squarePath(a, upto = 1) {
    const r = Cx.abs(a), th = Math.atan2(a.y, a.x);
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const s = (upto * i) / 40;
      pts.push(Cx.polar(Math.pow(r, 1 + s), th * (1 + s)));
    }
    return pts;
  }

  /** bottom-right box: zoom factor and calculation depth */
  let viewInfoText = '';
  function updateViewInfo() {
    const z = zoomFactor();
    let zs;
    if (z >= 1e4) {
      const e = Math.floor(Math.log10(z));
      zs = (z / 10 ** e).toFixed(1) + '·10' + Fmt.sup(e);
    } else zs = z < 10 ? z.toFixed(2) : String(Math.round(z));
    const atMax = plane.scale >= plane.opts.maxScale * 0.999;
    let t = `zoom ×${zs}${atMax ? ' (max)' : ''}   ·   depth ${shadowIter().toLocaleString('en')} steps`;
    if (matchN()) t += ' (= N)';
    else if (S.depthMul !== 1) t += ` (×${S.depthMul >= 1 ? S.depthMul : '1/' + 1 / S.depthMul})`;
    const hv = shadow.hiView;
    if ((S.explorer || (S.shadow && !paint.active && !paint.done)) && (!hv || shadow.hiRow < hv.H)) {
      t += `   ·   ${hv ? Math.floor((100 * shadow.hiRow) / hv.H) : 0}%`;
    }
    if (t !== viewInfoText) {
      viewInfoText = t;
      $('#vInfo').textContent = t;
      $('#dDown').disabled = $('#dUp').disabled = matchN();
    }
  }

  function draw(ctx) {
    updateViewInfo();
    if (S.explorer) { shadow.drawTo(ctx); return; } // just the set
    if (paint.active || paint.done) paint.drawTo(ctx);
    else if (S.shadow) shadow.drawTo(ctx);

    plane.drawGrid(ctx);

    if (S.escCircle) {
      plane.circle(ctx, 2, C('escape'), { dash: [8, 6], alpha: 0.75, width: 1.5 });
      // put the label on a part of the circle that is actually on screen
      for (const f of [-0.25, 0.25, -0.75, 0.75, 0, 1, -0.5, 0.5]) {
        const a = Math.PI * f;
        const X = plane.sx(2 * Math.cos(a)), Y = plane.sy(2 * Math.sin(a));
        if (X > 60 && X < plane.w - 110 && Y > 130 && Y < plane.h - 50) {
          Draw.label(ctx, '|z| = 2', X + 8, Y + (f < 0 ? 12 : -12), C('escape'), { font: '600 13px system-ui, sans-serif' });
          break;
        }
      }
    }

    if (paint.active) {
      paint.drawScan(ctx);
      return;
    }

    drawOrbit(ctx);

    // the cycle the orbit settles into
    if (S.cycle && longRun.esc < 0 && longRun.period && S.k >= Math.min(maxK(), 20)) {
      for (const p of longRun.cycle) {
        const [X, Y] = plane.toScreen(p);
        Draw.point(ctx, X, Y, 8.5, C('sum'), { hollow: true, lineWidth: 2.2, alpha: 0.9 });
      }
    }

    // handles
    if (S.mode === 'J') {
      const [X, Y] = plane.toScreen(S.z0);
      Draw.point(ctx, X, Y, 8, C('z'));
      Draw.label(ctx, 'z₀', X - 12, Y - 14, C('z'), { align: 'center', font: '700 16px system-ui, sans-serif' });
    }
    const [cX, cY] = plane.toScreen(S.c);
    Draw.point(ctx, cX, cY, 8, C('c'));
    // lower-left, so it doesn't collide with the "z₁" label (in Mandelbrot mode z₁ = c)
    Draw.label(ctx, 'c', cX - 13, cY + 15, C('c'), { align: 'right', font: '700 17px system-ui, sans-serif' });
  }

  function drawOrbit(ctx) {
    const pts = orbit.pts;
    let k = Math.min(S.k, maxK());
    let partial = null;
    if (stepAnim) {
      const t = (performance.now() - stepAnim.t0) / stepAnim.dur;
      if (t >= 1 || stepAnim.k !== k) stepAnim = null;
      else { partial = t; plane.requestDraw(); }
    }
    const kFull = partial === null ? k : k - 1; // last point drawn completely
    const orbCol = C('orbit'), escCol = C('escape'), curCol = C('cur');
    const isEsc = (i) => orbit.esc >= 0 && i >= orbit.esc;
    const P = (i) => plane.toScreen(pts[i]);

    // connecting segments
    if (S.lines) {
      for (let i = 0; i < kFull; i++) {
        const [x1, y1] = P(i), [x2, y2] = P(i + 1);
        const a = 0.3 + 0.7 * Math.pow((i + 1) / Math.max(1, kFull), 0.8);
        seg(ctx, x1, y1, x2, y2, isEsc(i + 1) ? escCol : orbCol, 2.2, a);
      }
    }

    // the step being explained: (k-1) -> k
    if (k >= 1) {
      const a = pts[k - 1], b = pts[k];
      if (S.moves) drawMoves(ctx, a, b, k, partial);
      else if (partial !== null) {
        const e = ease(partial);
        const m = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
        const [x1, y1] = plane.toScreen(a), [x2, y2] = plane.toScreen(m);
        if (S.lines) seg(ctx, x1, y1, x2, y2, isEsc(k) ? escCol : orbCol, 2.2, 1);
        Draw.point(ctx, x2, y2, 7, curCol, { ring: 3 });
      }
    }

    // points + labels
    const placed = [];
    for (let i = 0; i <= kFull; i++) {
      const [X, Y] = P(i);
      const last = i === kFull && partial === null;
      const col = last ? curCol : isEsc(i) ? escCol : orbCol;
      if (S.points || last || i === 0) Draw.point(ctx, X, Y, last ? 7 : i === 0 ? 5.5 : 4.5, col, last ? { ring: 3 } : {});
      if (S.labels && i < 80 && !(i === 0 && S.mode === 'J') && Math.abs(X) < 1e5 && placed.every(([u, w]) => Math.hypot(u - X, w - Y) > 20)) {
        Draw.label(ctx, 'z' + sub(i), X + 9, Y - 11, col, { font: `${last ? 700 : 600} 13px system-ui, sans-serif` });
        placed.push([X, Y]);
      }
    }
  }

  /** The two moves of one step: square (curved path), then shift by c (straight dashed arrow). */
  function drawMoves(ctx, a, b, k, partial) {
    const sq = Cx.sq(a);
    const prodCol = C('prod'), cCol = C('c');
    const [ox, oy] = plane.toScreen({ x: 0, y: 0 });
    const [cX, cY] = plane.toScreen(S.c);
    const [sX, sY] = plane.toScreen(sq);
    const [bX, bY] = plane.toScreen(b);
    const split = 0.55;
    const u1 = partial === null ? 1 : ease(Math.min(1, partial / split));
    const u2 = partial === null ? 1 : partial < split ? 0 : ease((partial - split) / (1 - split));

    // c as a vector from the origin (the shift we will apply)
    Draw.arrow(ctx, ox, oy, cX, cY, cCol, 1.5, { dash: [5, 5], alpha: 0.45 });

    // move 1: square
    pathOf(ctx, squarePath(a, u1), prodCol, 2.5, 0.95, [6, 4]);
    if (u1 >= 1) {
      Draw.point(ctx, sX, sY, 6, prodCol, { hollow: true, lineWidth: 2.5 });
      Draw.label(ctx, `z${sub(k - 1)}²`, sX + 10, sY + 14, prodCol, { font: '700 13px system-ui, sans-serif' });
    } else {
      const m = squarePath(a, u1).pop();
      const [mX, mY] = plane.toScreen(m);
      Draw.point(ctx, mX, mY, 6, prodCol);
    }

    // move 2: add c
    if (u2 > 0) {
      const ex = sX + (bX - sX) * u2, ey = sY + (bY - sY) * u2;
      Draw.arrow(ctx, Draw.clampS(sX), Draw.clampS(sY), Draw.clampS(ex), Draw.clampS(ey), cCol, 2.5, { dash: [6, 4] });
      if (u2 >= 1) {
        Draw.label(ctx, '+ c', (sX + bX) / 2 + 8, (sY + bY) / 2 - 8, cCol, { font: '700 13px system-ui, sans-serif' });
      }
      if (partial !== null) Draw.point(ctx, ex, ey, 7, C('cur'), { ring: 3 });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Stepping and playback                                                */
  /* ------------------------------------------------------------------ */
  function stepDur() {
    const per = 1000 / S.speed;
    return Math.min(S.moves ? 1100 : 650, per * 0.85);
  }

  function stepForward(animate = true) {
    if (S.k >= maxK()) return false;
    S.k++;
    stepAnim = animate && stepDur() > 60 ? { k: S.k, t0: performance.now(), dur: stepDur() } : null;
    playTone(orbit.pts[S.k], orbit.esc >= 0 && S.k >= orbit.esc);
    scheduleUI(true);
    plane.requestDraw();
    return true;
  }

  function setK(k) {
    stepAnim = null;
    S.k = Math.max(0, Math.min(maxK(), k));
    scheduleUI(true);
    plane.requestDraw();
  }

  function play() {
    if (paint.active) return;
    if (S.k >= maxK()) setK(0);
    S.playing = true;
    const tick = () => {
      if (!S.playing) return;
      if (!stepForward()) { stopPlay(); return; }
      playTimer = setTimeout(tick, 1000 / S.speed);
    };
    tick();
    scheduleUI();
  }

  function stopPlay() {
    S.playing = false;
    clearTimeout(playTimer);
    scheduleUI();
  }

  /* ------------------------------------------------------------------ */
  /* Sound: each step plays a note chosen by the angle of z               */
  /* ------------------------------------------------------------------ */
  let audio = null;
  const PENTA = [0, 2, 4, 7, 9];
  function playTone(z, escaped) {
    if (!S.sound || !z) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      let freq;
      if (escaped) {
        osc.type = 'sawtooth';
        freq = 90;
      } else {
        osc.type = 'triangle';
        const a = Cx.arg(z) / TAU; // 0..1
        const idx = Math.floor(a * 15); // 15 notes = 3 octaves of a pentatonic scale
        const semis = 12 * Math.floor(idx / 5) + PENTA[idx % 5];
        freq = 220 * Math.pow(2, semis / 12);
      }
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(escaped ? 0.08 : 0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.6, 0.9 / S.speed + 0.1));
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.7);
    } catch (e) { /* audio unavailable */ }
  }

  /* ------------------------------------------------------------------ */
  /* Panel                                                                */
  /* ------------------------------------------------------------------ */
  const PRESETS = [
    { name: 'c = 0', c: [0, 0], note: 'Nothing moves: 0² + 0 = 0. The orbit is stuck at a <b>fixed point</b>.' },
    { name: 'c = −1  (period 2)', c: [-1, 0], note: '0, −1, 0, −1, … bounces between two values forever: a cycle of period 2.' },
    { name: 'c = i  (lands on a cycle)', c: [0, 1], note: '0, i, −1+i, −i, −1+i, −i, … After one step it falls into a 2-cycle.' },
    { name: 'c = −2  (the left tip)', c: [-2, 0], note: '0, −2, 2, 2, 2, … This is the left-most point of the Mandelbrot set.' },
    { name: 'c = 1  (escapes fast)', c: [1, 0], note: '0, 1, 2, 5, 26, 677, … explodes. So c = 1 is <b>not</b> in the set.' },
    { name: 'c = −0.5 + 0.5i  (spirals in)', c: [-0.5, 0.5], note: 'Spirals into a single fixed point. Every c in the big heart-shaped region (the <i>main cardioid</i>) behaves like this.' },
    { name: 'c = −0.12 + 0.75i  (Douady rabbit)', c: [-0.1226, 0.7449], note: 'Period 3: the orbit hops between three points. Switch to <b>Julia</b> mode to see the rabbit!' },
    { name: 'c = −1.3  (period 4)', c: [-1.3, 0], note: 'Settles into a 4-cycle. Each bulb of the set has its own period.' },
    { name: 'c = −1.755  (a baby Mandelbrot)', c: [-1.7549, 0], note: 'Period 3 on the antenna. A tiny copy of the whole Mandelbrot set lives here. Zoom in on c!' },
    { name: 'c = 0.25  (the cusp)', c: [0.25, 0], N: 60, note: 'Creeps toward ½ forever, very slowly. Exactly on the edge of the set.' },
    { name: 'c = 0.26  (just past the cusp)', c: [0.26, 0], N: 40, note: 'Lingers near ½ for a long time, then escapes at step 30. Notice 30 × √0.01 = 3.0 ≈ π …' },
    { name: 'c = −0.75 + 0.1i  (seahorse valley)', c: [-0.75, 0.1], N: 50, note: 'Escapes at step 33, and 33 × 0.1 = 3.3. Now try the next preset …' },
    { name: 'c = −0.75 + 0.01i  (π appears!)', c: [-0.75, 0.01], N: 330, note: 'Escapes at step 315, and 315 × 0.01 = 3.15 ≈ π! The closer c gets to −0.75, the closer you get to π.' },
    { name: 'c = −0.8 + 0.156i  (spiral Julia)', c: [-0.8, 0.156], N: 60, note: 'Just outside the set (escapes after 252 steps). Its Julia set is full of spirals, so try Julia mode.' },
  ];

  function fillPresets() {
    const sel = $('#presets');
    sel.innerHTML = '<option value="">Interesting values of c …</option>' +
      PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
    sel.addEventListener('change', () => {
      const p = PRESETS[+sel.value];
      if (!p) { $('#presetNote').innerHTML = ''; return; }
      stopPlay();
      paint.clear();
      S.c = { x: p.c[0], y: p.c[1] };
      if (S.mode === 'M') S.z0 = { x: 0, y: 0 };
      if (p.N) setN(p.N, true);
      $('#presetNote').innerHTML = p.note;
      S.k = maxK(); // so recompute() keeps showing everything
      recompute();
      S.k = maxK();
      if (S.mode === 'J') shadow.invalidate();
      if (S.matchN) shadow.invalidate();
      scheduleUI(true);
    });
  }

  const RULES = {
    M: `<p class="big">z<sub>n+1</sub> = z<sub>n</sub>² + <span class="cc">c</span>, &nbsp;starting at z₀ = 0</p>
        <p class="small">Pick a number <span class="cc">c</span>. Square, add <span class="cc">c</span>, and repeat.
        If the points stay close forever, <span class="cc">c</span> belongs to the <b>Mandelbrot set</b>.
        If they run off to infinity, it doesn't.</p>`,
    J: `<p class="big">z<sub>n+1</sub> = z<sub>n</sub>² + <span class="cc">c</span>, &nbsp;starting at <span class="cz">z₀</span></p>
        <p class="small">Same rule, but now <span class="cc">c</span> stays fixed and we choose the start <span class="cz">z₀</span>.
        All starts that stay bounded make up the <b>filled Julia set</b> of <span class="cc">c</span>. Drag <span class="cc">c</span> and watch it change shape!</p>`,
  };
  const HINTS = {
    M: 'Drag <b class="cc">c</b>, or click anywhere to put it there. Drag the background to pan, scroll to zoom.',
    J: 'Drag <b class="cz">z₀</b> (or click) to choose the start, and drag <b class="cc">c</b> to reshape the Julia set.',
  };

  function setMode(m) {
    S.mode = m;
    stopPlay();
    paint.clear();
    document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('#rule').innerHTML = RULES[m];
    $('#hint').innerHTML = HINTS[m];
    $('#zRe').disabled = $('#zIm').disabled = m === 'M';
    $('#zRe').title = $('#zIm').title = m === 'M' ? 'For the Mandelbrot set we always start at z₀ = 0' : 'starting point z₀';
    if (m === 'M') S.z0 = { x: 0, y: 0 };
    else if (S.z0.x === 0 && S.z0.y === 0) S.z0 = { x: 0.35, y: 0.25 };
    S.k = maxK();
    recompute();
    S.k = maxK();
    shadow.invalidate();
    scheduleUI(true);
  }

  /* The N slider is logarithmic (0..1000 → 1..N_MAX): fine control for small N, still reaches 5000. */
  const sliderToN = (s) => Math.round(Math.exp((s / 1000) * Math.log(N_MAX)));
  const nToSlider = (n) => Math.round((1000 * Math.log(n)) / Math.log(N_MAX));

  function setN(n, silent) {
    S.N = Math.max(1, Math.min(N_MAX, Math.round(n)));
    $('#N').value = nToSlider(S.N);
    $('#NVal').textContent = S.N;
    if (!silent) {
      recompute();
      if (S.matchN) shadow.invalidate();
    }
  }

  /* ---------- UI refresh (batched to one per frame) ---------- */
  let uiPending = false, uiScroll = false, lastK = -1;
  function scheduleUI(scroll) {
    uiScroll = uiScroll || !!scroll;
    if (uiPending) return;
    uiPending = true;
    requestAnimationFrame(() => { uiPending = false; updateUI(); });
  }

  function setInput(id, v) {
    const el = $(id);
    if (document.activeElement !== el) el.value = String(+v.toFixed(4));
  }

  function updateUI() {
    setInput('#cRe', S.c.x);
    setInput('#cIm', S.c.y);
    setInput('#zRe', S.z0.x);
    setInput('#zIm', S.z0.y);
    $('#kOut').textContent = S.k;
    $('#NOut').textContent = S.N;
    $('#bPlay').innerHTML = S.playing ? '&#10074;&#10074;' : '&#9654;';
    $('#bBack').disabled = $('#bFirst').disabled = S.k <= 0;
    $('#bStep').disabled = $('#bLast').disabled = S.k >= maxK();
    updateVerdict();
    updateStepExplain();
    updateTable();
    drawChart();
    uiScroll = false;
  }

  function updateVerdict() {
    const el = $('#verdict');
    const who = S.mode === 'M' ? '<span class="cc">c</span>' : '<span class="cz">z₀</span>';
    const setName = S.mode === 'M' ? 'the Mandelbrot set' : 'the filled Julia set of c';
    let color, html;
    if (orbit.esc >= 0) {
      const e = orbit.esc;
      color = 'escape';
      html = `<div class="head cesc">🚀 Escapes at step ${e}</div>
        |z<sub>${e}</sub>| =${n3(Cx.abs(orbit.pts[e]))} &gt; 2. Once a point is farther than 2 from 0, squaring always wins
        and it runs off to infinity. So ${who} is <b>outside</b> ${setName}.`;
      if (S.k < e) html += `<div class="small muted" style="margin-top:4px">(Step forward to see it happen.)</div>`;
    } else if (longRun.esc > 0) {
      color = 'orbit';
      html = `<div class="head corbit">⏳ Still inside after ${S.N} steps …</div>
        but it does escape later, at step <b>${longRun.esc}</b>. Increase N to see it.
        So ${who} is just <b>outside</b> ${setName}, very close to its edge.`;
    } else {
      color = 'sum';
      let cyc;
      if (longRun.period === 1) cyc = 'In the long run it settles down on a single point (a <b>fixed point</b>).';
      else if (longRun.period) cyc = `In the long run it settles into a <b>cycle of period ${longRun.period}</b>: it visits ${longRun.period} points over and over${S.cycle ? ' (green rings)' : ''}.`;
      else cyc = 'It never settles into a short repeating cycle: it keeps wandering (or settles extremely slowly).';
      html = `<div class="head csum">🔒 Stays bounded</div>
        |z<sub>n</sub>| stays ≤ 2 for every step (checked for ${LONG_RUN.toLocaleString('en')} steps). So ${who} is <b>inside</b> ${setName}.
        <div class="small" style="margin-top:4px">${cyc}</div>`;
    }
    el.style.setProperty('--card-color', `var(--${color})`);
    el.innerHTML = html;
  }

  function updateStepExplain() {
    const el = $('#stepExplain');
    const k = S.k, pts = orbit.pts;
    if (k === 0) {
      el.innerHTML = `<p><b>Start:</b> z₀ = ${Fmt.cx(pts[0], 3)}.</p>
        <p class="small muted">Press <span class="kbd">&rarr;</span> or &#9654;| to take the first step. Tick
        <b>Square, then add c</b> to see each step split into its two moves.</p>`;
      return;
    }
    const a = pts[k - 1], b = pts[k], sq = Cx.sq(a);
    const rb = Cx.abs(b);
    const pad = '&nbsp;'.repeat(5);
    const z = (n) => `z<sub>${n}</sub>`;
    el.innerHTML = `
      <div class="eq">
        ${z(k - 1)} &nbsp;= ${Fmt.cx(a, 3)}<br>
        ${z(k - 1)}² = <span class="cprod">${Fmt.cx(sq, 3)}</span> &nbsp;<span class="muted">← square</span><br>
        ${z(k)} &nbsp;= ${z(k - 1)}² + <span class="cc">c</span> &nbsp;<span class="muted">← add c</span><br>
        ${pad}= <span class="cprod">${Fmt.cxp(sq, 3)}</span> + <span class="cc">${Fmt.cxp(S.c, 3)}</span><br>
        ${pad}= <b class="corbit">${Fmt.cx(b, 3)}</b><br>
        |${z(k)}| = ${n3(rb)} ${rb > 2 ? '<span class="cesc">&gt; 2, escaped!</span>' : '≤ 2'}
      </div>`;
  }

  function updateTable() {
    const tb = $('#tbody');
    const pts = orbit.pts;
    const k = Math.min(S.k, maxK());
    let html = '';
    // with a long orbit, show the first rows and the last 500 (keeps the page responsive)
    const head = 20, tail = 500;
    for (let i = 0; i <= k; i++) {
      if (k > head + tail + 50 && i === head) {
        html += `<tr><td>…</td><td colspan="3" class="muted" style="text-align:center">rows ${head}–${k - tail} hidden</td></tr>`;
        i = k - tail;
      }
      const p = pts[i];
      const r = Math.hypot(p.x, p.y);
      const cls = (orbit.esc >= 0 && i >= orbit.esc ? 'esc' : '') + (i === k ? ' cur' : '');
      html += `<tr class="${cls}" data-n="${i}"><td>${i}</td><td>${n4(p.x)}</td><td>${n4(p.y)}</td><td>${n4(r)}</td></tr>`;
    }
    if (k < S.N && k === maxK() && maxK() < S.N) {
      html += `<tr class="esc"><td>…</td><td colspan="3" style="text-align:center">numbers too big: off to ∞</td></tr>`;
    }
    tb.innerHTML = html;
    if (uiScroll || k !== lastK) {
      const wrap = $('#tableWrap');
      const row = tb.querySelector('tr.cur');
      if (row) wrap.scrollTop = row.offsetTop - wrap.clientHeight + row.offsetHeight * 2;
    }
    lastK = k;
  }

  $('#tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-n]');
    if (tr) { stopPlay(); setK(+tr.dataset.n); }
  });

  /* ---------- |z_n| chart ---------- */
  const chart = $('#chart');
  function drawChart() {
    const r = chart.getBoundingClientRect();
    if (r.width < 10) return;
    const dpr = window.devicePixelRatio || 1;
    chart.width = Math.round(r.width * dpr);
    chart.height = Math.round(r.height * dpr);
    const g = chart.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height;
    const L = 30, R = 10, T = 10, B = 20;
    const N = S.N;
    const YMAX = 3;
    const X = (n) => L + (n / Math.max(1, N)) * (W - L - R);
    const Y = (v) => H - B - (Math.min(v, YMAX) / YMAX) * (H - T - B);

    g.font = '11px system-ui, sans-serif';
    g.fillStyle = C('tick');
    g.strokeStyle = C('grid-strong');
    g.lineWidth = 1;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (const v of [0, 1, 2, 3]) {
      g.beginPath(); g.moveTo(L, Y(v) + 0.5); g.lineTo(W - R, Y(v) + 0.5); g.stroke();
      g.fillText(String(v), L - 6, Y(v));
    }
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText('0', X(0), H - B + 4);
    g.fillText(`n = ${N}`, X(N) - 14, H - B + 4);

    // escape line
    g.save();
    g.strokeStyle = C('escape');
    g.setLineDash([5, 4]);
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(L, Y(2)); g.lineTo(W - R, Y(2)); g.stroke();
    g.restore();

    const pts = orbit.pts;
    const k = Math.min(S.k, maxK());
    const line = (from, to, color, alpha, width) => {
      g.save();
      g.globalAlpha = alpha;
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineJoin = 'round';
      g.beginPath();
      for (let i = from; i <= to; i++) {
        const y = Y(Cx.abs(pts[i]));
        i === from ? g.moveTo(X(i), y) : g.lineTo(X(i), y);
      }
      g.stroke();
      g.restore();
    };
    if (pts.length > 1) line(0, pts.length - 1, C('muted'), 0.35, 1.2);
    if (k > 0) line(0, k, C('orbit'), 1, 2);
    if (N <= 120) {
      for (let i = 0; i <= k; i++) {
        g.fillStyle = orbit.esc >= 0 && i >= orbit.esc ? C('escape') : C('orbit');
        g.beginPath(); g.arc(X(i), Y(Cx.abs(pts[i])), i === k ? 4 : 2.5, 0, TAU); g.fill();
      }
    }
    // current step marker
    g.strokeStyle = C('text');
    g.globalAlpha = 0.4;
    g.beginPath(); g.moveTo(X(k) + 0.5, T); g.lineTo(X(k) + 0.5, H - B); g.stroke();
    g.globalAlpha = 1;
  }
  chart.addEventListener('click', (e) => {
    const r = chart.getBoundingClientRect();
    const n = Math.round(((e.clientX - r.left - 30) / (r.width - 40)) * S.N);
    stopPlay();
    setK(n);
  });

  /* ------------------------------------------------------------------ */
  /* Wiring                                                               */
  /* ------------------------------------------------------------------ */
  const numInput = (id, apply) => $(id).addEventListener('input', (e) => {
    const v = Fmt.parse(e.target.value);
    if (!isFinite(v)) return;
    apply(v);
  });
  numInput('#cRe', (v) => { S.c = { x: v, y: S.c.y }; afterMove(true); });
  numInput('#cIm', (v) => { S.c = { x: S.c.x, y: v }; afterMove(true); });
  numInput('#zRe', (v) => { S.z0 = { x: v, y: S.z0.y }; afterMove(false); });
  numInput('#zIm', (v) => { S.z0 = { x: S.z0.x, y: v }; afterMove(false); });

  document.querySelectorAll('#modeSeg button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  $('#bFirst').addEventListener('click', () => { stopPlay(); setK(0); });
  $('#bBack').addEventListener('click', () => { stopPlay(); setK(S.k - 1); });
  $('#bStep').addEventListener('click', () => { stopPlay(); stepForward(); });
  $('#bLast').addEventListener('click', () => { stopPlay(); setK(maxK()); });
  $('#bPlay').addEventListener('click', () => (S.playing ? stopPlay() : play()));

  $('#N').addEventListener('input', (e) => setN(sliderToN(+e.target.value)));
  $('#speed').addEventListener('input', (e) => {
    S.speed = +e.target.value;
    $('#speedVal').textContent = S.speed + '/s';
  });

  const bindCheck = (id, key, after) => {
    const el = $(id);
    el.checked = S[key];
    el.addEventListener('change', () => {
      S[key] = el.checked;
      after && after();
      scheduleUI();
      plane.requestDraw();
    });
  };
  bindCheck('#tLines', 'lines');
  bindCheck('#tPoints', 'points');
  bindCheck('#tLabels', 'labels');
  bindCheck('#tMoves', 'moves');
  bindCheck('#tCircle', 'escCircle');
  bindCheck('#tCycle', 'cycle');
  bindCheck('#tShadow', 'shadow', () => shadow.invalidate());
  bindCheck('#tFollow', 'follow');
  bindCheck('#tSound', 'sound', () => { if (S.sound) playTone({ x: 1, y: 0 }, false); });
  bindCheck('#tMatchN', 'matchN', () => { if (S.matchN) S.shadow = $('#tShadow').checked = true; shadow.invalidate(); });
  const setDepth = (f) => {
    S.depthMul = Math.max(1 / 8, Math.min(64, S.depthMul * f));
    shadow.invalidate();
  };
  $('#dDown').addEventListener('click', () => setDepth(0.5));
  $('#dUp').addEventListener('click', () => setDepth(2));
  $('#shadowStyle').addEventListener('change', (e) => {
    S.shadowStyle = e.target.value;
    S.shadow = $('#tShadow').checked = true;
    shadow.invalidate();
  });

  $('#bPaint').addEventListener('click', () => {
    if (paint.active) paint.stop();
    else if (paint.done) paint.clear();
    else paint.start();
  });

  /* ---------- Explorer: just the set, full width, with colour palettes ---------- */
  function setExplorer(on) {
    S.explorer = on;
    if (on) {
      stopPlay();
      if (paint.active) paint.stop();
    }
    document.body.classList.toggle('explorer', on);
    $('#explorerBtn').classList.toggle('active', on);
    $('#explorerBtn').innerHTML = on ? '&#10005; Back to the iteration' : '&#128301; Explorer';
    shadow.invalidate(); // (the canvas also resizes, which re-renders anyway)
    viewInfoText = '';
    plane.requestDraw();
  }
  $('#explorerBtn').addEventListener('click', () => setExplorer(!S.explorer));
  $('#exExit').addEventListener('click', () => setExplorer(false));
  $('#exFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  });
  const palSel = $('#palette');
  for (const [k, p] of Object.entries(PALETTES)) palSel.add(new Option(p.name, k));
  palSel.value = S.palette;
  palSel.addEventListener('change', (e) => setPalette(e.target.value));
  $('#density').addEventListener('input', (e) => { S.density = +e.target.value; shadow.invalidate(); });

  window.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && S.explorer) { setExplorer(false); e.preventDefault(); return; }
    if (e.key === 'e' || e.key === 'E') { setExplorer(!S.explorer); e.preventDefault(); return; }
    if (S.explorer) return; // the iteration keys do nothing in the explorer
    let handled = true;
    switch (e.key) {
      case 'ArrowRight': stopPlay(); stepForward(); break;
      case 'ArrowLeft': stopPlay(); setK(S.k - 1); break;
      case ' ': S.playing ? stopPlay() : play(); break;
      case 'Home': stopPlay(); setK(0); break;
      case 'End': stopPlay(); setK(maxK()); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });

  window.addEventListener('themechange', () => { shadow.invalidate(); scheduleUI(); });
  window.addEventListener('resize', () => scheduleUI());

  /* ------------------------------------------------------------------ */
  /* Start                                                                */
  /* ------------------------------------------------------------------ */
  fillPresets();
  setN(S.N, true);
  $('#speedVal').textContent = S.speed + '/s';
  $('#shadowStyle').value = S.shadowStyle;
  // allow mandelbrot.html#julia
  setMode(location.hash.toLowerCase() === '#julia' ? 'J' : 'M');
  $('#presets').value = '6';
  $('#presetNote').innerHTML = PRESETS[6].note;
})();
