/* complex.js - Demo 1: adding and multiplying complex numbers. */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const DEG = Math.PI / 180;
  const TAU = Math.PI * 2;
  const C = (k) => Theme.get(k);
  const n2 = (v) => Fmt.num(v, 2);
  const pn = (v) => (v < 0 ? `(${n2(v)})` : n2(v)); // parenthesise negatives inside formulas

  Theme.init($('#theme'));

  /* ------------------------------------------------------------------ */
  /* State                                                                */
  /* ------------------------------------------------------------------ */
  const S = {
    op: 'mul',
    z: { x: 1.5, y: 0.5 },
    w: { x: 0.5, y: 1 },
    view: 'vector',
    unit: 'deg',
    para: true,
    arcs: true,
    circles: false,
    tri: false,
    spiral: true,
    unitCircle: true,
    snap: true,
    n: 12,
    anim: null,
    algebraOpen: false,
  };

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const angle = (t, d) => Fmt.angle(t, S.unit, d);

  /* ------------------------------------------------------------------ */
  /* Plane + dragging                                                     */
  /* ------------------------------------------------------------------ */
  const plane = new Plane($('#plane'), {
    cx: 0.9,
    cy: 0.75,
    span: 4.6,
    onDraw: draw,
    onHover: (x, y) => {
      const p = { x, y };
      $('#readout').textContent = `pointer  ${Fmt.cx(p)}   |  r = ${n2(Cx.abs(p))},  θ = ${angle(Cx.arg(p))}`;
    },
    onLeave: () => { $('#readout').textContent = ''; },
  });
  plane.bindZoomButtons($('#zin'), $('#zout'), $('#zhome'));

  /** Snap to the fine grid, or to the unit circle in 15° steps (whichever is closer). */
  function snapPoint(x, y) {
    if (!S.snap) return { x, y };
    const st = plane.gridStep() / 5;
    const g = { x: Math.round(x / st) * st, y: Math.round(y / st) * st };
    const r = Math.hypot(x, y);
    if (Math.abs(r - 1) * plane.scale < 10) {
      const a = Math.round(Math.atan2(y, x) / (15 * DEG)) * 15 * DEG;
      const u = Cx.polar(1, a);
      if (Math.hypot(u.x - x, u.y - y) <= Math.hypot(g.x - x, g.y - y)) {
        // remove floating noise like 6.1e-17
        return { x: Math.abs(u.x) < 1e-12 ? 0 : u.x, y: Math.abs(u.y) < 1e-12 ? 0 : u.y };
      }
    }
    return g;
  }

  plane.addDraggable({
    get: () => S.w,
    set: (x, y) => { S.w = snapPoint(x, y); S.anim = null; update(); },
    enabled: () => S.op === 'add' || S.op === 'mul',
    radius: 9,
  });
  plane.addDraggable({
    get: () => S.z,
    set: (x, y) => { S.z = snapPoint(x, y); S.anim = null; update(); },
    radius: 9,
  });

  /* ------------------------------------------------------------------ */
  /* Drawing                                                              */
  /* ------------------------------------------------------------------ */
  function origin() { return [plane.sx(0), plane.sy(0)]; }

  /** Draw a complex number as arrow and/or point with a label. */
  function mark(ctx, p, color, name, o = {}) {
    const [ox, oy] = origin();
    const [x, y] = plane.toScreen(p);
    const arrow = o.arrow ?? S.view === 'vector';
    if (arrow) Draw.arrow(ctx, ox, oy, x, y, color, o.width ?? 3, { alpha: o.alpha ?? 1 });
    if (o.handle) Draw.point(ctx, x, y, 7.5, color, { alpha: o.alpha });
    else if (!arrow) Draw.point(ctx, x, y, o.r ?? 6, color, { alpha: o.alpha });
    if (name) {
      let dx = x - ox, dy = y - oy;
      const L = Math.hypot(dx, dy);
      if (L < 1) { dx = 0.7; dy = -0.7; } else { dx /= L; dy /= L; }
      Draw.label(ctx, name, x + dx * 20, y + dy * 20, color, { align: 'center', font: o.font });
    }
  }

  function poly(ctx, pts, color, alpha = 0.13) {
    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => { const [X, Y] = plane.toScreen(p); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  }

  function polyline(ctx, pts, color, width = 2, opts = {}) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.lineJoin = 'round';
    if (opts.dash) ctx.setLineDash(opts.dash);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const X = Draw.clampS(plane.sx(p.x)), Y = Draw.clampS(plane.sy(p.y));
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    });
    ctx.stroke();
    ctx.restore();
  }

  /** Arc around the origin whose radius grows slowly with angle, so angle sums past 360° stay readable. */
  function spiralArc(ctx, R0, a0, a1, color, width) {
    if (Math.abs(a1 - a0) < 1e-4) return;
    const [ox, oy] = origin();
    const R = (a) => R0 + 9 * (a / TAU);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 0.04));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      const X = ox + R(a) * Math.cos(a), Y = oy - R(a) * Math.sin(a);
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
    ctx.stroke();
    ctx.restore();
    return R;
  }

  function arcLabel(ctx, text, R, a, color) {
    const [ox, oy] = origin();
    Draw.label(ctx, text, ox + R * Math.cos(a), oy - R * Math.sin(a), color, {
      align: 'center',
      font: '600 13px system-ui, "Segoe UI", sans-serif',
    });
  }

  /** "Stacked" angle arcs: first angle in color1, then the second continuing from it in color2. */
  function stackedArcs(ctx, a1, c1, a2, c2, k, R0 = 58) {
    spiralArc(ctx, R0, 0, a1, c1, 4);
    spiralArc(ctx, R0, a1, a1 + a2 * k, c2, 4);
    const R = (a) => R0 + 9 * (a / TAU) + 17;
    if (a1 * R0 > 26) arcLabel(ctx, angle(a1, 0), R(a1 / 2), a1 / 2, c1);
    if (a2 * k * R0 > 26) arcLabel(ctx, angle(a2, 0), R(a1 + (a2 * k) / 2), a1 + (a2 * k) / 2, c2);
  }

  function draw(ctx) {
    plane.drawGrid(ctx);
    if (S.unitCircle) {
      plane.circle(ctx, 1, C('unit'), { dash: [6, 5] });
    }

    let t = null;
    if (S.anim) {
      const raw = (performance.now() - S.anim.t0) / S.anim.dur;
      if (raw >= 1) S.anim = null;
      else { t = raw; plane.requestDraw(); }
    }

    if (S.op === 'add') drawAdd(ctx, t);
    else if (S.op === 'mul') drawMul(ctx, t);
    else if (S.op === 'square') drawSquare(ctx, t);
    else drawPowers(ctx, t);
  }

  function drawAdd(ctx, t) {
    const z = S.z, w = S.w, s = Cx.add(z, w);
    const P = (p) => plane.toScreen(p);
    if (t === null) {
      if (S.para) {
        ctx.save();
        ctx.globalAlpha = 0.09;
        ctx.fillStyle = C('sum');
        ctx.beginPath();
        [{ x: 0, y: 0 }, z, s, w].forEach((p, i) => { const [X, Y] = P(p); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
        ctx.fill();
        ctx.restore();
        const [zx, zy] = P(z), [wx, wy] = P(w), [sx, sy] = P(s);
        Draw.arrow(ctx, zx, zy, sx, sy, C('w'), 2, { dash: [7, 5], alpha: 0.75 });
        Draw.arrow(ctx, wx, wy, sx, sy, C('z'), 2, { dash: [7, 5], alpha: 0.75 });
      }
      mark(ctx, s, C('sum'), 'z + w', { width: 3.5 });
    } else {
      // slide a copy of w along z until it sits tip-to-tail
      const e = ease(Math.min(1, t / 0.8));
      const off = { x: z.x * e, y: z.y * e };
      const [ax, ay] = P(off), [bx, by] = P(Cx.add(off, w));
      Draw.arrow(ctx, ax, ay, bx, by, C('w'), 3, { alpha: 0.9 });
      if (t > 0.8) mark(ctx, s, C('sum'), 'z + w', { width: 3.5, alpha: (t - 0.8) / 0.2 });
    }
    mark(ctx, w, C('w'), 'w', { handle: true });
    mark(ctx, z, C('z'), 'z', { handle: true });
  }

  /** Shared picture for z·w and z² (=z·z) */
  function drawProduct(ctx, t, z, w, isSquare) {
    const p = Cx.mul(z, w);
    const rz = Cx.abs(z), rw = Cx.abs(w), tz = Cx.arg(z), tw = Cx.arg(w);
    const [ox, oy] = origin();
    const k = t === null ? 1 : ease(t);
    const prodName = isSquare ? 'z²' : 'z · w';

    if (S.circles) {
      plane.circle(ctx, rz, C('z'), { dash: [2, 5], width: 2 });
      if (!isSquare) plane.circle(ctx, rw, C('w'), { dash: [2, 5], width: 2 });
      plane.circle(ctx, rz * rw, C('prod'), { dash: [2, 5], width: 2 });
    }

    if (S.tri && !isSquare) {
      poly(ctx, [{ x: 0, y: 0 }, { x: 1, y: 0 }, w], C('w'));
      poly(ctx, [{ x: 0, y: 0 }, z, p], C('prod'));
      const [X, Y] = plane.toScreen({ x: 1, y: 0 });
      Draw.point(ctx, X, Y, 4.5, C('axis'));
      Draw.label(ctx, '1', X + 2, Y + 14, C('axis'), { align: 'center' });
    }

    if (S.arcs) {
      Draw.mathArc(ctx, ox, oy, 24, 0, tz, C('z'), 2.5, { fill: true, fillAlpha: 0.15 });
      if (!isSquare) Draw.mathArc(ctx, ox, oy, 36, 0, tw, C('w'), 2.5, { fill: true, fillAlpha: 0.1 });
      stackedArcs(ctx, tz, C('z'), tw, isSquare ? C('prod') : C('w'), k);
    }

    if (t !== null) {
      // rotate-and-stretch z continuously until it becomes z·w
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const s = (k * i) / 60;
        pts.push(Cx.polar(rz * Math.pow(rw, s), tz + s * tw));
      }
      polyline(ctx, pts, C('prod'), 2, { dash: [6, 5], alpha: 0.8 });
      mark(ctx, pts[pts.length - 1], C('prod'), t > 0.95 ? prodName : '', { width: 3.5 });
    } else {
      mark(ctx, p, C('prod'), prodName, { width: 3.5 });
    }
    if (!isSquare) mark(ctx, w, C('w'), 'w', { handle: true });
    mark(ctx, z, C('z'), 'z', { handle: true });
  }

  function drawMul(ctx, t) { drawProduct(ctx, t, S.z, S.w, false); }
  function drawSquare(ctx, t) { drawProduct(ctx, t, S.z, S.z, true); }

  function drawPowers(ctx, t) {
    const z = S.z, n = S.n;
    const upto = t === null ? n : ease(t) * n;
    const r = Cx.abs(z), th = Cx.arg(z);
    const pw = (s) => Cx.polar(Math.pow(r, s), th * s);
    const [ox, oy] = origin();

    // continuous spiral z^s
    if (S.spiral && r > 0) {
      const pts = [];
      const steps = Math.ceil(upto * 40);
      for (let i = 0; i <= steps; i++) pts.push(pw((upto * i) / steps));
      polyline(ctx, pts, C('prod'), 2, { alpha: 0.55 });
    } else {
      const pts = [];
      for (let k = 0; k <= Math.floor(upto); k++) pts.push(pw(k));
      polyline(ctx, pts, C('prod'), 1.5, { dash: [5, 4], alpha: 0.6 });
    }

    const placed = [];
    for (let k = 0; k <= Math.floor(upto); k++) {
      const p = pw(k);
      const [X, Y] = plane.toScreen(p);
      if (S.view === 'vector' && k >= 2) Draw.arrow(ctx, ox, oy, X, Y, C('prod'), 1.5, { alpha: 0.35 });
      if (k !== 1) Draw.point(ctx, X, Y, 4.5, k === 0 ? C('axis') : C('prod'));
      const text = k === 0 ? '1' : k === 1 ? '' : 'z' + Fmt.sup(k);
      if (text && placed.every(([a, b]) => Math.hypot(a - X, b - Y) > 22)) {
        Draw.label(ctx, text, X + 10, Y - 11, k === 0 ? C('axis') : C('prod'), { font: '600 13px system-ui, sans-serif' });
        placed.push([X, Y]);
      }
    }
    mark(ctx, z, C('z'), 'z', { handle: true });
  }

  /* ------------------------------------------------------------------ */
  /* Panel: explanation                                                   */
  /* ------------------------------------------------------------------ */
  function angleSum(a, b) {
    let s = `${angle(a)} + ${angle(b)} = ${angle(a + b)}`;
    if (a + b >= TAU - 1e-9) s += ` <span class="muted">= ${angle(a + b - TAU)} after a full turn</span>`;
    return s;
  }

  function algebraBlock(inner) {
    return `<details${S.algebraOpen ? ' open' : ''}><summary>Show the algebra</summary>${inner}</details>`;
  }

  function insideOutside(r) {
    if (Math.abs(r - 1) < 0.005) return 'on the unit circle';
    return r < 1 ? 'inside the unit circle' : 'outside the unit circle';
  }

  function explainHTML() {
    const z = S.z, w = S.w;
    const rz = Cx.abs(z), rw = Cx.abs(w), tz = Cx.arg(z), tw = Cx.arg(w);
    switch (S.op) {
      case 'add': {
        const s = Cx.add(z, w);
        return `
          <p class="big">Add real parts, add imaginary parts.</p>
          <div class="eq"><span class="cz">${Fmt.cxp(z)}</span> + <span class="cw">${Fmt.cxp(w)}</span><br>
          = (${n2(z.x)} + ${pn(w.x)}) + (${n2(z.y)} + ${pn(w.y)})i<br>
          = <span class="csum">${Fmt.cx(s)}</span></div>
          <p>Picture it: slide <span class="cw">w</span> so that it starts at the tip of <span class="cz">z</span>
          (tip to tail). The sum is the diagonal of the parallelogram.</p>
          <p class="muted small">Lengths do <b>not</b> just add: |z + w| = ${n2(Cx.abs(s))}, but |z| + |w| = ${n2(rz + rw)}.
          Angles don't add either. That only happens when you <b>multiply</b>.</p>`;
      }
      case 'mul': {
        const p = Cx.mul(z, w);
        return `
          <p class="big">Lengths multiply, angles add.</p>
          <div class="eq">|z·w| = <span class="cz">|z|</span> × <span class="cw">|w|</span><br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= ${n2(rz)} × ${n2(rw)} = <span class="cprod">${n2(rz * rw)}</span><br>
          θ(z·w) = <span class="cz">θ<sub>z</sub></span> + <span class="cw">θ<sub>w</sub></span><br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= ${angleSum(tz, tw)}</div>
          <p>So multiplying by <span class="cw">w</span> <b>turns</b> by ${angle(tw)} and <b>stretches</b> by ${n2(rw)}.
          ${Math.abs(rw - 1) < 0.005 ? 'Here |w| = 1, so it is a pure rotation.' : ''}</p>
          ${S.tri ? '<p class="small">The triangle 0, 1, <span class="cw">w</span> is turned and scaled by <span class="cz">z</span> onto 0, <span class="cz">z</span>, <span class="cprod">z·w</span>, so the two triangles have the same shape.</p>' : ''}
          ${algebraBlock(`<div class="eq">(a + bi)(c + di) = ac + adi + bci + bd·i²<br>
          = (ac − bd) + (ad + bc)i &nbsp; <span class="muted">because i² = −1</span><br>
          = (${n2(z.x)}·${pn(w.x)} − ${pn(z.y)}·${pn(w.y)}) + (${n2(z.x)}·${pn(w.y)} + ${pn(z.y)}·${pn(w.x)})i<br>
          = <span class="cprod">${Fmt.cx(p)}</span></div>`)}`;
      }
      case 'square': {
        const p = Cx.sq(z);
        return `
          <p class="big">Squaring: square the length, double the angle.</p>
          <div class="eq">|z²| = |z|² = ${n2(rz)}² = <span class="cprod">${n2(rz * rz)}</span><br>
          θ(z²) = 2 × θ<sub>z</sub> = ${angleSum(tz, tz)}</div>
          <p><span class="cz">z</span> is ${insideOutside(rz)}, so <span class="cprod">z²</span> is
          ${Math.abs(rz - 1) < 0.005 ? 'also on it. It only turns.' : rz < 1 ? '<b>closer</b> to 0.' : '<b>farther</b> from 0.'}</p>
          <p class="muted small">This is the engine of the Mandelbrot set: z → z² + c. Points inside
          the unit circle get pulled in and points outside get flung out, and adding c shifts everything.</p>
          ${algebraBlock(`<div class="eq">(a + bi)² = a² + 2abi + b²i²<br>
          = (a² − b²) + 2ab·i<br>
          = (${n2(z.x)}² − ${pn(z.y)}²) + 2·${pn(z.x)}·${pn(z.y)}i<br>
          = <span class="cprod">${Fmt.cx(p)}</span></div>`)}`;
      }
      default: {
        const n = S.n;
        const rn = Math.pow(rz, n);
        let fate;
        if (Math.abs(rz - 1) < 0.005) fate = 'Here |z| = 1: the powers go round the circle forever.';
        else if (rz < 1) fate = 'Here |z| &lt; 1: the powers spiral <b>in</b> toward 0.';
        else fate = 'Here |z| &gt; 1: the powers spiral <b>out</b> to infinity.';
        return `
          <p class="big">Each power multiplies by z once more.</p>
          <div class="eq">|z<sup>${n}</sup>| = |z|<sup>${n}</sup> = ${n2(rz)}<sup>${n}</sup> = <span class="cprod">${Fmt.num(rn, 3)}</span><br>
          θ(z<sup>${n}</sup>) = ${n} × ${angle(tz)} = ${angle(n * tz)}${(() => {
            const turns = Math.floor((n * tz) / TAU + 1e-9);
            return turns > 0 ? ` <span class="muted">= ${angle(Math.max(0, n * tz - turns * TAU))} after ${turns} full turn${turns > 1 ? 's' : ''}</span>` : '';
          })()}</div>
          <p>Every step turns by the same angle and stretches by the same factor.
          The points sit on a <b>spiral</b>. ${fate}</p>`;
      }
    }
  }

  $('#explain').addEventListener('toggle', (e) => { if (e.target.tagName === 'DETAILS') S.algebraOpen = e.target.open; }, true);

  /* ------------------------------------------------------------------ */
  /* Panel: number cards                                                  */
  /* ------------------------------------------------------------------ */
  const fmtIn = (v) => String(+v.toFixed(3));

  function editCard(key, name, colorVar) {
    const el = document.createElement('div');
    el.className = 'card accent numcard';
    el.style.setProperty('--card-color', `var(--${colorVar})`);
    el.innerHTML = `
      <div class="name"><span><span class="dot" style="color:var(--${colorVar})"></span>${name}</span>
        <span class="mono" data-f="cart"></span></div>
      <span class="lbl">Cartesian</span>
      <div class="inputs">
        <label>Re <input class="num" data-f="re" type="text" inputmode="decimal" spellcheck="false"></label>
        <label>Im <input class="num" data-f="im" type="text" inputmode="decimal" spellcheck="false"></label>
      </div>
      <span class="lbl">Polar</span>
      <div class="inputs">
        <label>r&nbsp; <input class="num" data-f="r" type="text" inputmode="decimal" spellcheck="false"></label>
        <label>θ&nbsp; <input class="num" data-f="th" type="text" inputmode="decimal" spellcheck="false"></label>
      </div>`;
    const f = (k) => el.querySelector(`[data-f="${k}"]`);
    const onEdit = (e) => {
      const v = Fmt.parse(e.target.value);
      if (!isFinite(v)) return;
      const cur = S[key];
      const which = e.target.dataset.f;
      if (which === 're') S[key] = { x: v, y: cur.y };
      else if (which === 'im') S[key] = { x: cur.x, y: v };
      else {
        const r = which === 'r' ? Math.max(0, v) : Cx.abs(cur);
        const t = which === 'th' ? (S.unit === 'deg' ? v * DEG : v) : Cx.arg(cur);
        S[key] = Cx.polar(r, t);
      }
      S.anim = null;
      update();
    };
    el.querySelectorAll('input').forEach((i) => i.addEventListener('input', onEdit));
    return {
      el,
      update() {
        const p = S[key];
        f('cart').textContent = `${name} = ${Fmt.cx(p)}`;
        const set = (k, v) => { const i = f(k); if (document.activeElement !== i) i.value = fmtIn(v); };
        set('re', p.x);
        set('im', p.y);
        set('r', Cx.abs(p));
        const t = Cx.arg(p);
        set('th', S.unit === 'deg' ? t / DEG : t);
        f('th').title = S.unit === 'deg' ? 'angle in degrees' : 'angle in radians';
      },
    };
  }

  function resultCard(colorVar) {
    const el = document.createElement('div');
    el.className = 'card accent numcard';
    el.style.setProperty('--card-color', `var(--${colorVar})`);
    el.innerHTML = `
      <div class="name"><span><span class="dot" style="color:var(--${colorVar})"></span><span data-f="name"></span></span></div>
      <span class="lbl">Cartesian</span><span class="val" data-f="cart"></span>
      <span class="lbl">Polar</span><span class="val" data-f="pol"></span>`;
    const f = (k) => el.querySelector(`[data-f="${k}"]`);
    return {
      el,
      update(name, p) {
        f('name').textContent = name;
        f('cart').textContent = Fmt.cx(p);
        f('pol').textContent = `r = ${n2(Cx.abs(p))},  θ = ${angle(Cx.arg(p))}`;
      },
    };
  }

  const cardZ = editCard('z', 'z', 'z');
  const cardW = editCard('w', 'w', 'w');
  const cardR = resultCard('sum');
  $('#cards').append(cardZ.el, cardW.el, cardR.el);

  function updateCards() {
    cardZ.update();
    cardW.el.style.display = S.op === 'add' || S.op === 'mul' ? '' : 'none';
    if (S.op === 'add' || S.op === 'mul') cardW.update();
    let name, p, col;
    if (S.op === 'add') { name = 'z + w'; p = Cx.add(S.z, S.w); col = 'sum'; }
    else if (S.op === 'mul') { name = 'z · w'; p = Cx.mul(S.z, S.w); col = 'prod'; }
    else if (S.op === 'square') { name = 'z²'; p = Cx.sq(S.z); col = 'prod'; }
    else { name = `z${Fmt.sup(S.n)}`; p = Cx.powReal(S.z, S.n); col = 'prod'; }
    cardR.el.style.setProperty('--card-color', `var(--${col})`);
    cardR.el.querySelector('.dot').style.color = `var(--${col})`;
    cardR.update(name, p);
  }

  /* ------------------------------------------------------------------ */
  /* Presets                                                              */
  /* ------------------------------------------------------------------ */
  const P = (r, deg) => {
    const p = Cx.polar(r, deg * DEG);
    return { x: +p.x.toFixed(12), y: +p.y.toFixed(12) };
  };
  const spiralOn = () => { S.spiral = $('#tSpiral').checked = true; };
  const PRESETS = {
    add: [
      ['1 + 2i and 3 − i', () => { S.z = { x: 1, y: 2 }; S.w = { x: 3, y: -1 }; }],
      ['w = −z', () => { S.w = { x: -S.z.x, y: -S.z.y }; }],
      ['w = z̄ (mirror image)', () => { S.w = { x: S.z.x, y: -S.z.y }; }],
      ['w = 1 (shift right)', () => { S.w = { x: 1, y: 0 }; }],
    ],
    mul: [
      ['w = i  (¼ turn)', () => { S.w = { x: 0, y: 1 }; }],
      ['w = −1  (½ turn)', () => { S.w = { x: -1, y: 0 }; }],
      ['w = 2  (stretch)', () => { S.w = { x: 2, y: 0 }; }],
      ['w = ½  (shrink)', () => { S.w = { x: 0.5, y: 0 }; }],
      ['i · i = ?', () => { S.z = { x: 0, y: 1 }; S.w = { x: 0, y: 1 }; }],
      ['w = z̄', () => { S.w = { x: S.z.x, y: -S.z.y }; }],
      ['w = 1/z', () => { const r2 = S.z.x ** 2 + S.z.y ** 2 || 1; S.w = { x: S.z.x / r2, y: -S.z.y / r2 }; }],
    ],
    square: [
      ['z = i', () => { S.z = { x: 0, y: 1 }; }],
      ['on the circle, 30°', () => { S.z = P(1, 30); }],
      ['|z| = 0.8 (inside)', () => { S.z = P(0.8, 50); }],
      ['|z| = 1.2 (outside)', () => { S.z = P(1.2, 50); }],
    ],
    powers: [
      ['|z| = 0.9  (spiral in)', () => { S.z = P(0.9, 30); setN(24); spiralOn(); }],
      ['|z| = 1  (circle)', () => { S.z = P(1, 30); setN(12); spiralOn(); }],
      ['|z| = 1.1  (spiral out)', () => { S.z = P(1.1, 30); setN(24); spiralOn(); }],
      ['z = i', () => { S.z = { x: 0, y: 1 }; setN(8); }],
      ['60°: back to 1 after 6 steps', () => { S.z = P(1, 60); setN(6); }],
      ['⭐ 144° star', () => { S.z = P(1, 144); setN(5); S.spiral = $('#tSpiral').checked = false; }],
    ],
  };

  function renderPresets() {
    const box = $('#presets');
    box.innerHTML = '';
    for (const [label, fn] of PRESETS[S.op]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => { fn(); startAnim(); update(); });
      box.appendChild(b);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Controls                                                             */
  /* ------------------------------------------------------------------ */
  const HINTS = {
    add: '<b>Addition:</b> drag <span class="cz">z</span> and <span class="cw">w</span>. The <span class="csum">sum</span> is the far corner of the parallelogram.',
    mul: '<b>Multiplication:</b> drag <span class="cw">w</span> around the unit circle and <span class="cprod">z·w</span> rotates. Drag it in or out and <span class="cprod">z·w</span> stretches.',
    square: '<b>Squaring:</b> move <span class="cz">z</span> inside and outside the unit circle and watch <span class="cprod">z²</span>.',
    powers: '<b>Powers:</b> 1, z, z², z³, … Move <span class="cz">z</span> close to the unit circle.',
  };

  function setOp(op) {
    S.op = op;
    S.anim = null;
    document.querySelectorAll('#ops button').forEach((b) => b.classList.toggle('on', b.dataset.op === op));
    document.querySelectorAll('.toggles [data-ops]').forEach((l) => {
      l.style.display = l.dataset.ops.split(' ').includes(op) ? '' : 'none';
    });
    $('#powersSec').style.display = op === 'powers' ? '' : 'none';
    $('#swap').style.display = op === 'add' || op === 'mul' ? '' : 'none';
    $('#hint').innerHTML = HINTS[op];
    renderPresets();
    update();
  }

  function setN(n) {
    S.n = n;
    $('#nSlider').value = n;
    $('#nOut').textContent = n;
  }

  function startAnim() {
    const dur = S.op === 'powers' ? Math.min(7000, 350 * S.n) : 1800;
    S.anim = { t0: performance.now(), dur };
    plane.requestDraw();
  }

  function update() {
    $('#explain').innerHTML = explainHTML();
    updateCards();
    plane.requestDraw();
  }

  document.querySelectorAll('#ops button').forEach((b) => b.addEventListener('click', () => setOp(b.dataset.op)));
  document.querySelectorAll('#viewSeg button').forEach((b) => b.addEventListener('click', () => {
    S.view = b.dataset.view;
    document.querySelectorAll('#viewSeg button').forEach((x) => x.classList.toggle('on', x === b));
    plane.requestDraw();
  }));
  document.querySelectorAll('#unitSeg button').forEach((b) => b.addEventListener('click', () => {
    S.unit = b.dataset.unit;
    document.querySelectorAll('#unitSeg button').forEach((x) => x.classList.toggle('on', x === b));
    update();
  }));
  $('#viewSeg [data-view="vector"]').classList.add('on');
  $('#unitSeg [data-unit="deg"]').classList.add('on');

  const bindCheck = (id, key) => {
    const el = $(id);
    el.checked = S[key];
    el.addEventListener('change', () => { S[key] = el.checked; update(); });
  };
  bindCheck('#tPara', 'para');
  bindCheck('#tArcs', 'arcs');
  bindCheck('#tCircles', 'circles');
  bindCheck('#tTri', 'tri');
  bindCheck('#tSpiral', 'spiral');
  bindCheck('#tUnit', 'unitCircle');
  bindCheck('#tSnap', 'snap');

  $('#nSlider').addEventListener('input', (e) => { setN(+e.target.value); S.anim = null; update(); });
  $('#animate').addEventListener('click', startAnim);
  $('#swap').addEventListener('click', () => { [S.z, S.w] = [S.w, S.z]; S.anim = null; update(); });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    const ops = { 1: 'add', 2: 'mul', 3: 'square', 4: 'powers' };
    if (ops[e.key]) setOp(ops[e.key]);
    else if (e.key === 'a' || e.key === 'A') startAnim();
    else if ((e.key === 's' || e.key === 'S') && (S.op === 'add' || S.op === 'mul')) $('#swap').click();
  });
  window.addEventListener('themechange', () => plane.requestDraw());

  // Allow linking straight to an operation, e.g. complex.html#square
  const fromHash = location.hash.replace('#', '');
  setN(S.n);
  setOp(['add', 'mul', 'square', 'powers'].includes(fromHash) ? fromHash : 'add');
})();
