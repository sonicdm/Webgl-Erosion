# Engineering Fix Log

## Current Architecture Map

### Entrypoint
- **`src/main.ts`** (2501 lines) — single-file entrypoint. Vite-bundled. Contains `main()` async init, `tick()` animation loop, legacy `SimulatePerStep()` WebGL pipeline, event wiring, GUI setup, BVH management.

### Renderer
- **WebGPU (primary):** `WebGPURendererWrapper` wraps `three/webgpu` `WebGPURenderer`. Canvas element `#canvas`. Device extracted via `renderer.backend.device`. Scene compiled with `compileAsync()`.
- **WebGL2 (offscreen only):** `document.createElement('canvas').getContext('webgl2')` — used exclusively for heightmap load/export and `LegacyTexturePool`. NOT used for main view.
- **Render call:** `webgpuRendererWrapper.render(webgpuScene, camera.threeCamera)` at `main.ts:2158`.

### Scene
- **`webgpuScene`** (`THREE.Scene`) — contains:
  - `webgpuTerrainMesh` — `PlaneGeometry(1,1,256,256)` rotated to XZ, `TerrainMaterialNode` (TSL `MeshBasicNodeMaterial`). Vertex displacement along normal from heightmap. Frustum-culled, renderOrder 0.
  - `webgpuWaterMesh` — `PlaneGeometry(1,1,256,256)` rotated to XZ, `WaterMaterialNode` (TSL `NodeMaterial`). Transparent, depthWrite false, renderOrder 1. **Initially hidden** (`visible = false`), never set to `true` in current code.

### Camera
- **`src/Camera.ts`** (405 lines) — custom camera wrapping `THREE.PerspectiveCamera` (`this.threeCamera`) + `THREE.OrbitControls` (`this.threeControls`). gl-matrix vectors for legacy code + Three.js vectors synced each frame. WASD movement with acceleration physics. Configurable mouse buttons, damping, speeds.
- Initial position: `(-0.18, 0.3, 0.6)` looking at `(0,0,0)`.

### Controls
- **`IAppControls`** interface — flat object with all simulation/brush/rendering parameters.
- Created by `createControls()` factory, bound to dat-gui via `setupGUI()`.
- Event handling via capture-phase `window.addEventListener('pointerdown/up/move')` + `document.addEventListener('keydown/keyup')`.

### Terrain Material (WebGPU)
- **`TerrainMaterialNode`** (`src/rendering/webgpu/materials/TerrainMaterialNode.ts`, 155 lines)
  - Extends `MeshBasicNodeMaterial` — no lighting model, only `colorNode`.
  - Vertex displacement: `positionLocal + normalLocal * (heightmap.x / simres)`.
  - Color: `TerrainShaderNodeController` → sampling → palette → shadow → brush overlay.
  - Shader node hierarchy:
    - `TerrainSamplingNode` — samples 8 pool textures.
    - `TerrainPaletteNode` — height/slope-based coloring (forest/rock/snow/sand).
    - `TerrainShadowNode` — shadow mapping with bias.
    - `TerrainDebugViewNode` — 10 debug visualization modes.
  - **Missing vs legacy `terrain-frag.glsl`:** no shadow map pass input, no scene depth, no bilateral blur, no flow/sediment trace overlays.

### Water Material (WebGPU)
- **`WaterMaterialNode`** (`src/rendering/webgpu/materials/WaterMaterialNode.ts`, 51 lines)
  - Extends `NodeMaterial`. **STUB** — only basic color blending (`baseColor + foamColor * foamStrength`).
  - **Missing:** No vertex displacement (water surface height), no Fresnel, no specular highlights, no depth-based opacity, no sky reflection, no sediment coloring.
  - **Note:** `webgpuWaterMesh.visible = false` and never toggled on — water is invisible.

### Skybox / Background
- **WebGPU path: NONE.** No sky mesh, no background node, no scattering.
- Legacy path had: Rayleigh-Mie scattering pass (`flat` shader on fullscreen quad) + bilateral blur + composite.
- Scattering shader nodes exist (`src/rendering/webgpu/shader-nodes/scattering/`) but are not wired into the scene.

### Simulation Pipeline
- **Compute shaders:** `ComputeNodePipeline.ts` (1916 lines) — all erosion passes implemented as inline WGSL compute shaders. Pattern: create pipeline + bind group layout → pack uniforms → dispatch 8x8 workgroups.
- **Orchestration:** `SimulatePerStepWebGPU.ts` (180 lines) — calls all 10 passes in order: rain → flow → waterHeight → sediment → sedimentAdvection → maxSlippage → thermalFlux → thermalApply → evaporation → average.
- **Runner:** `WebGPUSimulationRunner` wraps `SimulatePerStepWebGPU` with closures for controls/timer/brush.
- **Texture pool:** `WebGPUTexturePool` — ping-pong `GPUTexture` pairs for all simulation channels (terrain, flux, vel, sediment, etc.). `rgba32float` format.
- **Pool → Three.js sync:** `copyPoolToThreeTextures()` — GPU-to-GPU `copyTextureToTexture()` from pool to `DataTexture` objects. Called each frame in tick.

### Brush System
- `brush-handler.ts` — `updateBrushState()` manages flatten target height, slope start/end, modifier inversion.
- Brush applies via rain pass compute shader (brush uniforms passed to WGSL).
- Raycast for brush position: `rayCast()` (CPU heightmap stepping) or `rayCastBVH()` (three-mesh-bvh). Selection via `controls.raycastMethod`.
- **Issue:** Slope brush does NOT get a fresh raycast on activation (unlike flatten which does).

### BVH System
- Built on terrain generation via `TerrainGeometryUpdater.update()` → `updateTerrainGeometry()` + `MeshBVH()`.
- Refit during simulation via `requestIdleCallback` after brush release or periodic interval.
- **Issue:** Geometry update copies entire heightmap (`new Float32Array(...)`) — GC pressure.

---

## Identified Issues (Phase 0 Findings)

### P0-1: Water mesh invisible
- `webgpuWaterMesh.visible = false` at `main.ts:1001`, never set to `true`.
- `WaterMaterialNode` is a stub — no vertex displacement, no water surface rendering.

### P0-2: No skybox/background in WebGPU path
- Legacy had Rayleigh-Mie scattering on fullscreen quad. WebGPU scene has no background.
- Scattering shader nodes exist but not integrated.

### P0-3: No shadow map in WebGPU path
- `TerrainMaterialNode` has shadow node but no shadow map texture input.
- Legacy path rendered shadow map as a separate pass. No equivalent in WebGPU.

### P0-4: No post-processing pipeline
- Legacy had: shadow map → scene depth → terrain+water → scattering → bilateral blur → composite (6 passes).
- WebGPU has: single `render(scene, camera)` call.

### P0-5: Terrain material uses MeshBasicNodeMaterial
- No lighting model. Terrain relies entirely on procedural palette + shadow factor.
- Legacy `terrain-frag.glsl` had directional light + ambient + shadow PCF.

### P0-6: Brush/slope raycast inconsistency
- Flatten brush gets fresh raycast on Alt+click (`brush-handler.ts`), slope brush does not.

### P0-7: WebGL2 shaders still receive uniforms per frame
- `main.ts:1710-1877` sets uniforms on legacy WebGL shaders (lambert, water, flow, etc.) every frame even though WebGL is offscreen-only. Wasted CPU work.

---

## Fix Log

### Phase 0: Ground Truth (Complete)
- Read entire `main.ts` (2501 lines) and all supporting files.
- Mapped architecture: WebGPU primary renderer, offscreen WebGL2 for load/export.
- Identified 7 issues spanning rendering, materials, post-processing, and brushes.
- Created this log and checklist.

### Phase 1: Basic Rendering (Complete)
- **Fix 1a:** TS compilation error — `type PoolSyncTextures` inline import requires TS 4.5+ but project uses 4.3.4. Split to separate `import type` statement. (`main.ts:46-51`)
- **Fix 1b:** Wired `TerrainDebugViewNode` into `TerrainMaterialNode.buildGraph()`. Added `debugModeUniform` and `updateUniforms()` method. When `debugMode > 0`, debug color replaces palette color. (`TerrainMaterialNode.ts`)
- **Fix 1c:** Added per-frame `terrainMat.updateUniforms({ snowRange, forestRange, terrainPalette, debugMode })` call in main tick loop. Previously only brush position was updated per-frame; now all dat-gui-controlled terrain appearance parameters sync live. (`main.ts:2147-2170`)
- **Fix 1d:** Guarded legacy WebGL shader uniform setup (`main.ts:1710-1878`) with `if (!webgpuRendererWrapper)`. Eliminates ~170 lines of wasted CPU work per frame when using WebGPU renderer.

### Phase 2: Brushes (Complete)
- **Fix 2a:** Extracted `freshRaycastFromEvent()` helper in `brush-handler.ts` — performs a fresh camera-to-terrain raycast from pointer event coordinates, avoiding stale `posTemp` from the last `tick()` frame.
- **Fix 2b:** Added fresh raycast at top of `handleBrushMouseDown()` for ALL brush types. On every brush activation, `controls.posTemp` is updated with the fresh click position before any brush-specific logic runs. This fixes sand, water, rock, smooth, flatten, and slope brushes.
- **Fix 2c:** Slope brush Alt+click (start point) now uses the freshly-updated `posTemp` instead of the stale last-frame value. Previously only the flatten brush had a fresh raycast on activation.

### Phase 3: Scene Background (Complete)
- **Fix 3a:** Set `webgpuScene.background = new Color(0.2, 0.25, 0.3)` — matching legacy clear color. Added `Color` to `three` import. (`main.ts`)

### Phase 4: Water Rendering (Complete)
- **Fix 4a:** Rewrote `WaterMaterialNode` from stub to full `MeshBasicNodeMaterial` implementation. Added vertex displacement (`terrainHeight + sediment + waterLevel`) / simres, depth-based exponential opacity, blue water color with sediment tinting, and simple Fresnel approximation. (`WaterMaterialNode.ts`)
- **Fix 4b:** Updated water mesh construction in `main.ts` to pass `heightmap` and `sedimentMap` textures, set `visible = true`.
- **Fix 4c:** Hoisted `webgpuWaterMesh` to `let` declaration outside try block (matching `webgpuTerrainMesh` pattern) so tick loop can access it.
- **Fix 4d:** Added per-frame `waterMat.updateUniforms({ waterTransparency })` in tick loop, syncing `controls.WaterTransparency` GUI slider to water material.

### Phase 5: Erosion Simulation Pipeline (Verified Complete)
- All 10 simulation passes already implemented in `ComputeNodePipeline.ts` and wired in `SimulatePerStepWebGPU.ts`.
- `WebGPUSimulationRunner.step()` invoked per frame in tick loop.
- All 7 swap methods present in `WebGPUTexturePool.ts`.
- Only lava pass remains TODO (separate feature, not blocking).

### Phase 6: Edge Protection (Complete)
- **Fix 6a:** Added boundary protection to `THERMAL_FLUX_COMPUTE_SHADER` — zeroes all thermal flux at edge cells (within 1-2 texels of border). Prevents thermal erosion from acting on out-of-bounds `textureLoad` reads that return `(0,0,0,0)`.
- **Fix 6b:** Added boundary protection to `THERMAL_APPLY_COMPUTE_SHADER` — skips height modification (`safeDelta = 0`) at edge cells.
- **Fix 6c:** Added boundary protection to `MAX_SLIPPAGE_COMPUTE_SHADER` — forces max slippage to `talusScale` at edges, preventing artificially low values from out-of-bounds neighbor reads.
- **Fix 6d:** Added boundary protection to `AVERAGE_COMPUTE_SHADER` — skips smoothing at edge cells, preserving original height. Prevents 8-neighbor stencil from treating out-of-bounds zeros as height differences.
- **Root cause:** Legacy GLSL shaders used `texture()` with clamp-to-edge addressing (edge texels repeated for out-of-bounds UVs). WGSL `textureLoad` returns `(0,0,0,0)` for out-of-bounds coordinates, creating phantom height differences at terrain edges.

### Phase 7: BVH Sync Strategy (Complete)
- **Assessment:** BVH sync is already well-designed — `requestIdleCallback` defers refit to idle time, triggers on brush release and periodic interval, uses fast refit (~50ms) instead of full rebuild (~2-5s).
- **Fix 7a:** Eliminated per-update `new Float32Array(heightMapCpuBuf)` allocation. Pre-allocated `reusableHeightmapCopy` buffer that persists across frames and is only reallocated on resolution change. Uses `.set()` to copy data, avoiding GC pressure from repeated large array allocations during active erosion.
