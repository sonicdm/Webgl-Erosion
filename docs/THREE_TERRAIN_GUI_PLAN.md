Goal: Restore full THREE.Terrain parameter controls (parity with research/THREE.Terrain/demo/index.js), wire them into generation, keep VTF/simres/ping-pong aligned, and make GPU readback/health checks explicit. Cursor should treat this as an implementation checklist.

Scope of changes (modules)
- Data model: src/app/dto/SimulationParams.ts
- GUI: src/gui/gui-setup.ts
- Terrain generation: src/three/simulation/io/TerrainReadbackService.ts
- Runtime regen/error display: src/three/integration.ts
- Ping-pong / simres resize: src/three/simulation/SimulationPassManager.ts and TerrainSync.ts

1) Extend SimulationParams (single source of truth)
  - Add fields (with defaults in createSimulationParams):
    - TerrainEasing: string = 'Linear'
    - TerrainSteps: number = 1
    - TerrainTurbulent: boolean = false
    - TerrainSize: number = 1024
    - TerrainWidthLengthRatio: number = 1.0  // ySize = size * ratio
    - TerrainSegments: number (default resolver: simres - 1; must be set in factory with simres available)
    - TerrainSmoothing: string = 'None'
    - TerrainEdgeType: 'Box'|'Radial' = 'Box'
    - TerrainEdgeDirection: 'Normal'|'Up'|'Down' = 'Normal'
    - TerrainEdgeCurve: 'Linear'|'EaseIn'|'EaseOut'|'EaseInOut' = 'Linear'
    - TerrainEdgeDistance: number = 256


2) GUI controls (dat.GUI) (src/gui/gui-setup.ts)
  - Create folder “THREE Terrain”.
  - Replace “Reset Terrain” with “Generate Terrain” button. No auto-regeneration on control change: user must click the button to regenerate. On any control change, mark status “pending changes” until button is pressed.
  - Controllers:
    - TerrainBaseType select = shader IDs 0–11 + THREE methods:
      [DiamondSquare, Perlin, Simplex, Worley, Cosine, Fault, Feature, ParticleDeposition, Value, Weierstrass, Brownian, CosineLayers, PerlinDiamond, PerlinLayers, SimplexLayers, Hill, HillIsland]
    - TerrainMask select from mask registry.
    - Basic subgroup (inline or default):
      - TerrainEasing select: ['Linear','EaseIn','EaseOut','EaseInOut','InEaseOut'].
      - TerrainSegments slider: 7–127 (int). On change: set SimulationResolution = segments+1; label “simres=... segments=...”.
      - TerrainSteps slider: 1–8 (int).
      - TerrainTurbulent: checkbox.
      - TerrainSize slider: 512–4096 step 256.
      - TerrainWidthLengthRatio slider: 0.2–2.0 step 0.05.
    - Advanced subfolder (new, collapsible, default closed):
      - TerrainSmoothing select: ['None','Conservative 0.5','Conservative 1','Conservative 10','Gaussian 0.5,7','Gaussian 1.0,7','Gaussian 1.5,7','Gaussian 1.0,5','Gaussian 1.0,11','GaussianBox','Mean 0','Mean 1','Mean 8','Median'].
      - EdgeType, EdgeDirection, EdgeCurve, EdgeDistance (0–512 step 32).
      - Any future advanced params (e.g., custom frequency, terrainRandom seed) go here to avoid crowding.
  - All controllers -> onChange: mark “pending” and update displayed values; do NOT regenerate. Only the “Generate Terrain” button calls threeRuntime.regenerateTerrain(controls).
  - Status line in GUI: show simres, segments, size, ratio, last error (if any).
  - Terrain type defaults: each BaseTerrainType (shader or THREE wrapper) exposes getDefaultParams() with recommended values (easing, steps, turbulent, size, ratio, smoothing, edges, frequency where applicable). GUI pulls from registry and applies on selection (unless a “custom lock” is enabled). Defaults live in the classes, not in GUI.

3) Generation wiring (TerrainReadbackService)
  - Compute segments = controls.TerrainSegments ?? (this.simres - 1). If segments+1 != simres, log warn and set segments = simres-1 (prefer lock).
  - xSize = TerrainSize; ySize = TerrainSize * TerrainWidthLengthRatio.
  - steps = TerrainSteps; turbulent = TerrainTurbulent; easing = getEasing(TerrainEasing).
  - Apply edges: use THREE.Terrain.Edges / RadialEdges per EdgeType/Direction/Distance/Curve.
  - Apply smoothing if TerrainSmoothing != 'None' (map names to THREE.Terrain smoothing fns). If smoothing returns NaN/Inf, throw with smoothing name.
  - Validate inputs: all finite, segments>1, size>0, ratio>0, steps>=1. Throw before calling THREE.Terrain on invalid.
  - Heightmap import: when loading an external heightmap image, resample to current simres/segments (upscale/downscale as needed). Investigate THREE.Terrain.fromHeightmap interpolation; if insufficient, perform explicit resampling to simres x simres before upload.
  - Heightmap workflow: when a heightmap is loaded, automatically set TerrainBaseType = 'heightmap' (or equivalent enum) and cache the image. Subsequent “Generate Terrain” uses the cached heightmap with updated parameters—no need to re-import unless the user selects a new file. Clear the cache when TerrainBaseType changes away from 'heightmap' or when user clicks “Clear Heightmap”.

4) VTF, simres, ping-pong alignment
  - PlaneGeometry (TerrainSync) segments must equal simres-1. When GUI changes segments/simres, call SimulationPassManager.setSimRes(newSimres) and recreate plane geometry + materials accordingly.
  - Render targets (terrainPP, etc.) resized when simres changes.
  - Height decode scale uniform set to 1/simres after resize.
  - Expose a getter in pass manager that returns the current “write” height texture so materials bind the freshest texture each frame.

5) GPU readback & health checks (must-have)
  - After generateTerrain: read back a small patch (e.g., 4x4) from the active height texture (combined-height-readback) and compute min/max.
  - After each sim step (debug mode): optional throttled readback every N frames.
  - If min/max non-finite or (max-min < 1e-5): set simHealthy=false; throw in regenerateTerrain; do NOT log success.
  - Log readback stats: {frame?, width, height, decodeScale, min, max, range}.
  - Implement a tiny “readback service”/utility to encapsulate min/max and optional patch dump; reuse in both generation and parity test.

6) Error surfacing (integration.ts + GUI)
  - Red banner text should include: baseType, easing, segments, simres, size, ratio, min, max, range.
  - Clear banner on successful regeneration.
  - GUI status line mirrors banner when error.

7) Validation / regression steps
  - Manual: regenerate with base types Hill, HillIsland, PerlinDiamond → heightmap min/max finite; no NaN in logs.
  - Change TerrainSize=2048, ratio=0.5 → terrainPP resized, plane segments updated (simres = segments+1), displacement visible.
  - Toggle TerrainTurbulent & Steps → heightmap range changes (not flat).
  - Mask select changes output (log mask id).
  - Run headless test (add later): generateTerrain with Hill at simres=64, assert min/max finite and range>0.001.

8) Heightmap parity (sim ⇄ render) — required outcome
  - Binding rules:
    - u_Heightmap / u_Sediment on the render material must always point to passManager.getTerrainTexture()/getSedimentTexture() (the current ping-pong write target) every frame.
    - Do not fall back to CPU heightmap when UseSimHeightmap=true.
  - Decode contract:
    - Stored height = worldHeight * simres; shader uses u_HeightDecodeScale = 1/simres. Verify this is updated on simres change.
 - Parity validation (add a debug mode + test):
    - Add a “height debug pass” material that outputs sampled height (normalized to [0,1]) to color.
    - Procedure: (a) read 4×4 block from terrain texture (GPU readback), (b) render one frame with height debug material, (c) read corresponding 4×4 pixels from framebuffer, (d) compare values within epsilon (e.g., 1e-4). If mismatch, fail.
    - Script: npm run validate:height-parity (headless/offscreen) that runs the above and exits non-zero on mismatch.
  - Live update verification:
    - After one simulation step that writes a known delta (e.g., single texel +0.01), rerun the height parity check and assert framebuffer values changed by the same delta within epsilon.
    - Log before/after min/max of terrain texture and rendered debug pass; if either is flat or unchanged, mark simHealthy=false and throw.

9) Workstreams / phases
  Phase 1 — Data + GUI plumbing
    - Extend SimulationParams with new fields + defaults + unions for type safety.
    - GUI folder “THREE Terrain” with controls sourced from registries (terrain types, masks).
    - Lock segments to simres-1: changing segments forces simres=segments+1; changing simres forces segments=simres-1 (no divergence path).
    - Debounce heavy changes (simres/size) to avoid RT thrash.

  Phase 2 — Generation wiring & guards
    - Wire new params into TerrainReadbackService: size, ratio, segments, steps, turbulent, easing, edges, smoothing.
    - Validate inputs (finite, >0) before calling THREE.Terrain; throw with parameter dump on invalid.
    - Apply smoothing (optional) and edges with safety guards (skip/throw if functions missing).
    - Ensure render targets and plane geometry are recreated on simres change; set u_HeightDecodeScale = 1/simres.

  Phase 3 — Binding + ping-pong freshness
    - Expose passManager getter for current write textures.
    - In render loop, rebind u_Heightmap/u_Sediment every frame to the current write target.
    - Ensure UseSimHeightmap=true path never falls back to CPU texture when sim texture exists.

  Phase 4 — GPU readback health + parity tests
    - Add readback min/max check after generation and (optionally) every N frames; set simHealthy flag.
    - Add height-debug material and parity test comparing GPU texture vs rendered output (4×4 patch, epsilon 1e-4).
    - Add npm script `validate:height-parity`; skip gracefully if WebGL2/offscreen unavailable, otherwise fail on mismatch.

  Phase 5 — Error surfacing & UX polish
    - Banner + GUI status line include baseType, easing, segments, simres, size, ratio, min, max, range.
    - Clear on success; block “ready” logs when simHealthy=false.
    - Optional: overlay “Simulation invalid (NaN/flat)” in viewport when unhealthy.

Class/file touch list (keep consistent)
- src/app/dto/SimulationParams.ts (new fields/defaults)
- src/three/terrain/TerrainGenerationOptions.ts (extend options)
- src/three/terrain/BaseTerrainType.ts (+ getDefaultParams signature)
- src/three/terrain/ThreeTerrainWrapper.ts (pass through advanced options, defaults)
- src/three/terrain/terrain-type-registry.ts (ensure registry exposes defaults)
- src/gui/gui-setup.ts (controls, pending state, generate button)
- src/three/simulation/io/TerrainReadbackService.ts (advanced params, heightmap caching, resampling)
- src/three/simulation/SimulationPassManager.ts (simres resize, write-texture getter)
- src/three/terrain/TerrainSync.ts (segments lock, heightmap binding to materials)
- src/three/integration.ts (generate button handling, banner/status, simHealthy gating)
- src/three/utils/heightmap-readback or similar (new min/max utility)
- tests/headless parity script + debug material asset

10) Legacy base types (shader 0–11) integration with THREE.Terrain params
  - Goal: Allow legacy shader terrain types to honor the same advanced params (easing/steps/turbulent/edges/size/ratio) even though they don’t use THREE.Terrain directly.
  - Plan:
    - Extend BaseTerrainType.generateHeightmap signature to accept an options object that includes: easing, steps, turbulent, edgeType/direction/curve/distance, xSize, ySize, smoothing flag.
    - For shader-backed types, map:
      - easing/steps/turbulent: drive octave count/frequency or noise parameters where meaningful; otherwise ignore safely.
      - xSize/ySize: influence world-space scaling used when baking to heightmap (e.g., amplitude or frequency scale).
      - edges: if provided, apply a post-process edge falloff similar to THREE.Terrain.Edges (can reuse MaskApplicator or add a simple radial/box falloff).
      - smoothing: optional post-process smoothing using existing smoothing utilities (Gaussian/Mean) guarded for performance.
    - Ensure ThreeTerrainWrapper passes through all new options unchanged to the underlying THREE.Terrain methods.
    - Defaults: legacy behavior remains unchanged when advanced params are absent.
    - Documentation: update BaseTerrainType interface comments to list supported advanced params and which are no-ops for certain types.
