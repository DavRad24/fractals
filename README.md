# Fractals: classroom demos

Interactive browser demos for a high-school talk on complex numbers and the Mandelbrot set.

**To run:** double-click `index.html`. It runs in any modern browser, with no install, no internet and no build step.
To present, press F11 for full screen. The ☀/🌙 button switches between light and dark themes (light is usually better on a projector).

## ① Complex arithmetic (`complex.html`)

- Drag **z** and **w**, or type values in Cartesian (Re, Im) or polar (r, θ) form.
- **z + w**: parallelogram rule. *Animate* slides w to the tip of z.
- **z · w**: angle arcs show θz + θw stacking up, with optional length circles and similar triangles.
  *Animate* turns and stretches z into z·w. Presets include w = i, −1, 2, ½, z̄ and 1/z, plus "i · i = ?".
- **z²**: square the length, double the angle. Inside the unit circle points shrink, outside they grow.
- **zⁿ**: powers lie on a spiral. Presets show spiral in, circle, spiral out, back to 1 after 6 steps, and a star.
- Snap to the grid and to the unit circle in 15° steps (toggle). Degrees or radians. Arrows or points.
- Keys: `1`–`4` switch operation, `A` animates, `S` swaps z and w.

## ② Mandelbrot iteration (`mandelbrot.html`)

- Drag **c**, click anywhere, or type it. The orbit z₀, z₁, z₂, … of z → z² + c is drawn with optional connecting lines and labels.
- Step controls: start, back, play/pause, step, show all. Max steps N goes up to 500 and playback speed is adjustable.
  Keys: `←` `→` `Space` `Home` `End`.
- **Table** of every zₙ (click a row to jump there) and a **|zₙ| chart** with the escape line at 2.
- **Worked step**: the arithmetic for the current step (square, then add c).
- **Square, then add c**: splits each step into the curved squaring move and the straight shift by c, animated while stepping.
- **Verdict**: escapes at step n, or stays bounded. It checks 8000 steps regardless of N and reports the cycle period (marked with green rings).
- **Shadow** of the Mandelbrot set: a soft silhouette or coloured by escape speed. It re-renders as you pan and zoom (scroll wheel).
- **Viewer**: the shadow is rendered in parallel on all CPU cores (Web Workers) at full screen sharpness, and zooms to about 10¹¹×
  (the limit of double precision). The box at the bottom right shows the zoom, the iteration depth (− / + to halve or double it)
  and the render progress.
- **🔭 Explorer** (button in the header, or key `E`; `Esc` to leave): just the set, full width, no panel or grid.
  Choose a colour palette (Classic, Ultra Fractal, Fire, Ice, Neon, Gold, Forest, Rainbow, Black & white) and the colour band density.
  Click to zoom in ×2, drag to pan, scroll to zoom. *Full screen* hides the browser too. In Julia mode it explores the Julia set of c.
- **Shadow uses only N steps**: slide N from 1 upward and the set appears in stages (disc → oval → pear → …).
- **Julia mode**: fix c and drag the start z₀. The shadow becomes the filled Julia set of c and reshapes as you drag c.
- **Follow the mouse**: the orbit follows the pointer without clicking.
- **Orbit sound**: each step plays a note chosen by the angle of zₙ, so a period-3 orbit plays a 3-note tune.
- **Paint the set point by point**: shows how the picture is computed, from coarse to fine, with the orbit of each tested point.
- Presets include fixed points, 2-, 3- and 4-cycles, the cusp, a "baby Mandelbrot", and **π hidden in the set**:
  c = −0.75 + 0.01i escapes after 315 steps, and 315 × 0.01 ≈ π.

Link straight to a mode with `complex.html#square` or `mandelbrot.html#julia`.

## Files

```
index.html        landing page with a lesson outline
complex.html      demo ①   js/complex.js
mandelbrot.html   demo ②   js/mandelbrot.js
js/plane.js       shared pan/zoom complex plane, drawing and formatting helpers
css/style.css     shared styles (light and dark)
```
