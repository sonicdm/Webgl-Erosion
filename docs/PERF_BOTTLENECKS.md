# Performance bottlenecks (real causes)

**Target:** ≥160 fps at 1024 simres (frame &lt; 6.25 ms). Run with `?perf=1` to log input/sim/render breakdown every 60 frames.

The big change that coincided with the regression was **moving from Basic to Standard (PBR) materials**. That alone should not cause a 100 FPS drop—so the cause is likely a **bug or inefficiency** (our code or the Three.js WebGPU path), not “PBR is expensive” by itself.

**Three.js WebGPU renderer** has known perf issues (e.g. [three.js#31055](https://github.com/mrdoob/three.js/issues/31055)): UBO/state overhead, often 2–10× slower than WebGL in some scenarios. WebGPURenderer is still WIP. Worth checking whether our scene (one terrain + a few meshes, one directional light) triggers excessive UBO updates or pipeline switches per frame.

On a high-end GPU (e.g. RTX 5070 Ti) raw fill rate or compute is not the limit—something else is: **driver/API overhead** (e.g. 60+ `queue.submit()` per frame from simulation), **CPU-side work** per frame, or **Three.js WebGPU backend** doing redundant work (state thrash, UBO uploads). Profiling the frame in Chrome (Performance tab, or “GPU” in the flame graph) will show whether the cost is main-thread JS, GPU timeline, or sync points.

### Trace finding (Trace-20260205T171956)

Trace was captured **when FPS was bad** (bad state is reproducible). One frame: **EvaluateScript ~79 ms** on CrRendererMain; GPU work in that window is a few ms. **Conclusion:** bottleneck is **main-thread CPU**, not GPU. 79 ms/frame → ~12 FPS max.

### Instrumentation (good run, ?perf=1, log every 60 frames)

When FPS is good (e.g. consistently ~60 fps), frame is ~2–3 ms total:

| Segment    | Measured (ms) |
|-----------|----------------|
| **input** | 0.0–0.2        |
| **sim**   | 1.0–1.8        |
| **render**| 0.2–0.7        |

So the **79 ms only appears in the bad scenario**. To find the cause: capture a trace or run with `?perf=1` during the bad FPS and see which segment (input / sim / render) spikes.

**When perf shows ~1–1.5 ms/frame** but FPS is ~76 on a **165 Hz display**, frame time is ~13 ms and **~11 ms is unaccounted for**. The cause is **inside this project** (not GPU/driver or other external factors).

**Confirmed with tick-total:** Perf logs show **tick-total ~1.1–1.9 ms**, matching input+sim+render. So the **whole of tick() is ~1.2 ms**; the **~11 ms gap is after tick() returns**, before the next rAF runs. That implies the delay is either (1) in the **browser’s work** between our callback and the next rAF (e.g. compositor, layout, or the path that presents our WebGPU canvas), or (2) in **code we invoke** that schedules heavy work later (e.g. a microtask or another callback). We use sync `render()` (not `renderAsync()`), so Three.js is not calling `onSubmittedWorkDone()` in our render path.

**Next step:** Record a Chrome Performance trace over several frames and inspect the **gap between the end of our tick and the start of the next** (e.g. “Animation Frame Fired” → our tick → … ~11 ms … → next “Animation Frame Fired”). See whether that time is in Compositor, Layout, “Evaluate Script”, or GPU/WebGPU; that will point to the real bottleneck.

### Performance tooling (`?perf=1`)

Every 60 frames we log:

| Metric | Meaning |
|--------|--------|
| **input** | tick-start → tick-after-input (camera, raycast, brush, terrain load check). |
| **sim** | tick-after-input → tick-after-sim (sim steps). |
| **render** | tick-after-sim → tick-after-render (copy, materials, draw). |
| **tick-total** | tick-entry → tick-after-render (full measured tick). |
| **post-render** | tick-after-render → tick-before-rAF (stats.end, measures, log). Should be &lt;0.5 ms. |
| **inter-frame** | Time from previous tick-entry to this tick-entry (real time between rAF callbacks). |
| **gap** | inter-frame − tick-total. Time spent **outside** our tick (browser/compositor or deferred work). |
| **copy / materials / draw** | Breakdown inside render (SceneRenderer marks). |

**Stats overlay (MS vs FPS):** The on-screen stats panel “MS” value is the time between `stats.begin()` and `stats.end()` — i.e. **our tick only** (~1–2 ms). It does **not** include the gap. So seeing “2 MS” and “67 FPS” together is expected: our JS is 2 ms, but the real time between frames (what sets FPS) is inter-frame (~15 ms when spiky). The overlay MS matches **tick-total**; FPS is 1000 / inter-frame.

**Long-task observer:** When `?perf=1`, a `PerformanceObserver` for `longtask` (if supported) logs any main-thread task ≥50 ms. If the gap is one long task, you'll see a warning; if not, the gap is many small steps (e.g. compositor). Chrome may require "Experimental Web Platform features" or the Long Tasks API origin trial for `longtask` entries.

**Gap histogram:** Every 60 frames we log a histogram of gap (ms) over the last 60 frames: `0-2:n 2-5:n 5-10:n 10-15:n 15-20:n 20-∞:n` and **spikes(≥16ms): n/60** (frames with gap ≥ one 60 Hz frame). A high spike count means many frames are delayed by the browser/compositor.

**Observed (steady state):** inter-frame ~14–17 ms, gap ~10–15 ms, post-render &lt;0.2 ms. **No long-task warnings during steady state** — long tasks only appear during init and compile. So the gap is **not** one 50 ms+ main-thread task; it is either many small tasks or compositor/GPU work.

**Bimodal gap:** On some runs the histogram shows **two modes**: many frames with gap 0–5 ms (good) and ~20–26 frames per 60 with gap **≥20 ms** (inter-frame 23–39 ms). So about one in 2–3 frames gets a 20–40 ms stall. **Typical when present:** spikes(≥16ms) 21–24/60, 20-∞ 21–23. That suggests **periodic** behaviour: e.g. compositor or vsync at a lower effective rate, another tab/DevTools, power throttling, or Chrome’s frame scheduling. When you see high **spikes(≥16ms)** and many **20-∞** counts, capture a short Chrome Performance trace and check what runs in the long gaps (Compositor, GPU, Layout, or other). DevTools open/closed, incognito (no extensions), and a full browser restart do not change the spike count.

### Experiments to pinpoint the gap

Use query params to **skip work** and see if FPS or spike count improves. If it does, the skipped work is implicated.

| URL | What it does | If FPS/spikes improve |
|-----|----------------|------------------------|
| `?skipRender=2` | Draw to screen only every 2nd frame (sim still runs every frame). | Compositor/GPU is waiting for our draw; reducing draw rate may reduce gap. |
| `?copyEvery=2` | Copy pool→Three textures only every 2nd frame (terrain may stutter one frame behind). | Copy or the render that uses it is driving the gap. |
| `?perf=1&skipRender=2` | Perf log + skip render. | Compare spike count with and without skipRender. |
| `?terrainMaterial=basic` | Terrain uses MeshBasicNodeMaterial (solid green; no PBR, no terrain textures). | **Result: ~80 FPS** — terrain PBR ruled out as main bottleneck. |
| `?hideWater=1` | Water mesh not visible (still created). | Use with terrainMaterial=basic to test cost of water/lava draw. |
| `?hideLava=1` | Lava mesh not visible (still created). | Use with terrainMaterial=basic to test cost of water/lava draw. |

### Experiment results (proven)

- **skipRender=2:** Inter-frame is **1–3 ms** on skip frames and **20+ ms** on draw frames. Long gap happens **only when we submit a frame** — compositor/GPU waits on our draw.
- **copyEvery=2:** **Spikes drop from ~22/60 to 1–14/60**; **20-∞ from ~22 to 0–3**. Gap becomes steady ~10–15 ms (~66 fps) instead of bimodal. The **12× texture copy** is implicated.
- **Both:** Spikes stay ~29/60 because we still draw 30/60; each draw causes a long gap. **Draw** triggers the gap; **copy** makes it worse.

**Recommended workaround:** Use **`?copyEvery=2`** for better FPS. Terrain may be one sim frame behind.

### Concrete fix strategies

1. **Copy (proven):** Use **`?copyEvery=2`** for better FPS, or add a GUI option. Longer term: copy only textures the view needs, copy at lower res, or share pool textures with Three.js.
2. **Draw:** Each present triggers ~20 ms gap. Reduce draw cost (fewer passes, no bloom/shadows, lower res) or accept per-present cost.
3. **Other:** Try another browser; file Chrome bug with repro; optimize elsewhere.

## Likely contributors (not yet changed)

### 1. ~~Many `queue.submit()` per frame~~ **Done: batched**
- **Was:** One submit per compute pass → ~25+ submits per step, ~75+ per frame (SimulationSpeed 3).
- **Now:** One command encoder per step; single `queue.submit([encoder.finish()])` per step (~3 submits/frame from sim). **Did not fix FPS.** Shader compile time improved significantly (unrelated or side effect).

### 2. ~~Copy in a separate submit~~ **Done: merged into last sim step**
- **Was:** One extra `queue.submit()` per frame for the 12× pool→Three copy (sim submits + copy submit + render submit).
- **Now:** Copy is encoded in the **last** sim step’s command encoder, so one fewer submit per frame. **FPS remained mostly unchanged** — so the bottleneck is not the extra submit.
- **Implication:** The cost is either (a) the **copy work itself** (12× copyTextureToTexture, bandwidth), or (b) the **draw/present path** (Three.js WebGPU encode + submit + present). Experiments showed **draw** triggers the gap; **copy** made it worse. Merging only removed one submit; the same copy work still runs.

### 3. 12× full-res texture copy every frame (GPU bandwidth)
- **What:** `copyPoolToThreeTextures` still copies 12 textures (simres×simres RGBA32F) from pool to Three.js backend every frame. At simres 1024 that’s ~192 MB/frame. Now encoded in last sim step; render submit follows.
- **Next:** Copy fewer textures (only those needed this frame / no debug maps), lower-res copy, or have materials sample pool GPUTextures directly if the backend allows.

### 4. Draw / present path
- **Evidence:** With `?skipRender=2`, inter-frame is 1–3 ms when we skip draw and 20+ ms when we draw. So the **gap is tied to submitting a frame**.
- **Ruled out — terrain PBR:** With **`?terrainMaterial=basic`** (solid green quad, MeshBasicNodeMaterial, no terrain textures) FPS is still **~80**. So the bottleneck is **not** the terrain Standard material / lighting; the cost is elsewhere: **12× copy** (still runs for water/lava), **water + lava + sky** draw, **post-processing**, or **per-present** cost in the browser/Three.js WebGPU path.
- **Next:** (1) With `?terrainMaterial=basic`, hide water and lava (`?hideWater=1&hideLava=1`) to see if FPS improves. (2) Same with `?copyEvery=2` to see if copy is still the main cost when terrain is basic. (3) Chrome Performance trace over the gap (compositor vs GPU vs JS).

### 5. Heightmap readback (async; not on critical path)
- **What:** `readHeightmapFromWebGPU` is fire-and-forget (`.then()`), so it doesn’t block the frame. Chunked readback with `mapAsync` can still add GPU work and memory pressure; frequency is throttled by `shouldReadHeightmap`.

## Implemented mitigations (2026-02-06)

- **Lower default lava flow iterations:** `lavaFlowIterations` default reduced from `16` to `8`.
- **Iteration compensation:** Lava flow now scales per-iteration `timestep` against a `16`-iteration baseline (clamped), so reduced `lavaFlowIterations` keeps comparable transport throughput and avoids source pile-up.
- **Channel controls re-enabled in flux shader:** `lavaDepthBoost`, `lavaMomentum`, `lavaNoiseResist`, and `lavaCrustStrength` now contribute to directional flow / barriers (they were effectively no-op in the pipe-model flux path).
- **Temperature advection unit fix:** Lava heat mixing now converts incoming flux to height-volume before blending temperature, preventing over-aggressive thermal replacement that destabilized the flow/cooling cycle.
- **Selective pool→Three texture copy:** Only textures needed by the current view are copied each frame (core render maps always; velocity/flux/terrainFlux/maxSlippage only in matching debug modes). This reduces per-frame copy bandwidth in normal mode.
- **Post-processing bypass when bloom is off:** SceneRenderer now skips the post-processing pipeline entirely when `ppBloomStrength <= 0.001`, avoiding blur/composite GPU cost when bloom is disabled. Default bloom strength is now `0.0` for performance baseline.
- **Tighter lava-water pass condition:** Lava-water interaction now runs only when both lava is being simulated this step and water activity is present.
- **Compute binding micro-opt:** Compute texture bindings now reuse cached `GPUTextureView` objects instead of creating a new view for every pass dispatch.
- **SimulationSpeed time-scale model:** `SimulationSpeed` is now a time-scale multiplier (1×/2×/3×) applied to the base `timestep`, not a loop count. One simulation step runs per frame regardless of speed setting, with the timestep scaled up. At speed=3 this reduces dispatches from 96 to 32 per frame.

## What did *not* explain the slowness

- **Terrain PBR / Standard material** — With `?terrainMaterial=basic` (solid green, no PBR) FPS stays ~80. So terrain material complexity is not the main bottleneck.
- **Bloom** — Was implemented in 84c50c8 but never wired. Now wired.
- **Shadows** — Toggling shadows on/off makes no measurable FPS difference (so shadow pass is not the bottleneck, or WebGPU path handles it differently).
- Shadow map resolution/blur (reducing helped only ~10 FPS in testing).
- MSAA on/off (no measurable difference reported).
- Terrain source indicator loop count (compile-time only; no FPS impact).
- Detail normal FBM vs valueNoise (compile-time only).
