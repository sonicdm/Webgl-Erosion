# Progress Log

This is the rolling progress tracker for the WebGPU + TSL refactor.
Detailed phase/workstream logs live in `docs/refactor-webgpu-tsl/progress/`.

## Status Legend
- Pending
- In Progress
- Complete
- Blocked

## Phase Status

### Phase 0 — Legacy Freeze
- Status: Complete
- Notes: Legacy branch `legacy-webgl` created and tagged as `v1.0.0-legacy`. Maintenance policy documented.

### Phase 1 — DI/Class-Based Parity
- Status: Complete
- Notes: DI/class-based architecture ported to WebGPU pipeline. All state holders created, composition root established, LegacyTexturePool extracted. All production code uses holders instead of simulation-state imports.

### Phase 2 — WebGPU + TSL Foundation
- Status: Complete ✅
- Notes: Three.js upgraded to r171, WebGPURendererWrapper created, capability checks implemented, NodeMaterial scaffolding established, ComputeNodePipeline skeleton created. All following TDD approach. **Acceptance criteria met**: WebGPURenderer renders a basic scene (red cube visible), NodeMaterial renders with WebGPU backend. Browser validation confirms functional rendering. Refactored all WebGL classes to use state holder instead of global `gl`.

### Phase 3 — Simulation Pipeline Port
- Status: Complete
- Notes: All simulation compute passes ported to WGSL: rain, flow, water height, sediment, sediment advection (simple + MacCormack), max slippage, thermal flux, thermal apply, evaporation, average smoothing. Wired in SimulatePerStepWebGPU with correct uniforms and texture swaps. Lava pass remains TODO.

### Phase 4 — Terrain Generation + GUI Parity
- Status: In Progress
- Notes: WebGPU main view: single device, pool→Three.js copy each frame, TerrainMaterialNode/WaterMaterialNode, main loop uses WebGPURenderer. **Fix (Jan 30):** Resolved `Uniform "null" not declared` — TerrainMaterialNode now always creates a valid `simresUniform` (never null) so WGSLNodeBuilder never receives type null. **Cleanup (Jan 30):** Removed WebGL render/sim fallback from `main.ts`; heightmap import/export now uses WebGPU readback only; readback cadence scales with resolution. **Troubleshooting:** Grey/white terrain: ensure copy runs (console: `[WebGPU] Pool → Three.js texture copy active, 8 textures`). Backend textures are created on first compile; skip log on first frames is normal. **Testing:** WebGPU path requires a browser with WebGPU (Chrome with GPU); MCP/headless often reports "No available adapters" and app exits before main loop.

### Phase 5 — Hybrid BVH + CPU Mesh
- Status: In Progress
- Notes: Raycast/BVH UV orientation aligned with PlaneGeometry (V flip) to fix brush alignment; BVH geometry sampling now matches render UVs. Fixed-resolution raycast mesh + tiled BVH refit ongoing.

### Phase 6 — Validation + Tooling
- Status: Pending
- Notes: parity + readback tests and scripts.

### Phase 7 — Cleanup & Docs
- Status: Pending
- Notes: update README and remove legacy docs from master.

## Completed Items
- Phase 0 — Legacy Freeze (January 26, 2026)
  - Created `legacy-webgl` branch from master
  - Tagged baseline as `v1.0.0-legacy`
  - Documented maintenance policy in `LEGACY_MAINTENANCE.md`
- Phase 1 — DI/Class-Based Parity (January 26, 2026)
  - Created state holders (SimulationStateHolder, TerrainStateHolder, ClientStateHolder)
  - Created composition root (bootstrap.ts) and AppContext
  - Extracted LegacyTexturePool for texture management
  - Updated all production files to use holders instead of simulation-state imports
  - Added DI smoke test
  - Marked texture-management.ts as deprecated
- Phase 2 — WebGPU + TSL Foundation (January 27, 2026)
  - Upgraded Three.js from ^0.159.0 to ^0.171.0 (r171)
  - Created WebGPU capability check service with tests (TDD)
  - Created WebGPURendererWrapper with tests (TDD)
  - Updated main.ts with WebGPU capability check and conditional renderer creation
  - Created TerrainMaterialNode and WaterMaterialNode scaffolding with tests (TDD)
  - Created ComputeNodePipeline skeleton with tests (TDD)
  - **Acceptance criteria met**: WebGPURenderer renders basic scene, NodeMaterial renders with WebGPU backend
  - Browser validation confirmed functional rendering (red cube visible in canvas)
  - Refactored all WebGL classes to use state holder (`appContext.simulationState.glContext`) instead of global `gl`
  - Eliminated global `gl` dependency: Drawable, Square, Plane, OpenGLRenderer, ShaderProgram, uniform helpers all use DI pattern
- Shader Migration — Phases 4–5 (January 29, 2026)
  - Added WebGPU material scaffolds and terrain TSL nodes/materials with unit tests (Phase 4–5 redo)
- Monolith refactor (DI structure) — January 29, 2026
  - Added `src/app/runtime/types.ts`: ISimulationRunner, ITexturePool (sim-only), IRenderLoop
  - Added `src/app/services/TerrainGeometryUpdater.ts`: only writer to TerrainStateHolder.setTerrainGeometry / setTerrainBVH
  - Added `src/app/services/TerrainSceneService.ts`: loadScene, reset, setTerrainRandom as stable actions for createControls
  - Wired TerrainSceneService into main: actions use service.loadScene(), service.reset(getControls()), service.setTerrainRandom(getControls()); removed standalone loadScene, Reset, setTerrainRandom, createSeededRandom from main
- Tests + MCP verification — January 30, 2026
  - CI: `npm run test:ci` — 23 suites, 112 tests passing
  - MCP (user-browser-devtools): navigated to http://localhost:8080 (200 OK), full-page screenshot saved, visible text "Generating Terrain..." confirms app loads and terrain flow runs
- WebGPU-only runtime enforcement — January 30, 2026
  - Removed WebGL render/sim fallback from `src/main.ts`
  - Heightmap import/export uses WebGPU readback path (chunked staging)
  - Readback throttling now scales with simulation resolution
- Raycast alignment + pool sync buffers — January 30, 2026
  - Raycast/BVH world→UV mapping now matches PlaneGeometry V orientation
  - BVH geometry UV sampling flipped to match render-space heightmap
  - Pool→Three sync textures reuse a shared zero buffer to reduce CPU allocations
- WebGPU limits + heightmap import orientation — January 30, 2026
  - Request maxBufferSize from adapter to prevent 2048+ upload failures
  - WebGPURenderer now uses the shared device from capability check
  - Heightmap cache flips X on import to fix mirrored heightmaps
- Phase 3 — Simulation Pipeline Port (January 29, 2026)
  - Ported water height (alterwaterhight-frag.glsl), sediment (sediment-frag.glsl), sediment advection simple + MacCormack (sediadvect/maccormack), max slippage (maxslippageheight-frag.glsl), thermal flux/apply (thermalterrainflux/thermalapply-frag.glsl), average smoothing (average-frag.glsl) to WGSL compute in ComputeNodePipeline
  - Wired all passes in SimulatePerStepWebGPU with correct controls (VelocityMultiplier, thermalTalusAngleScale, ErosionMode, etc.) and texture swaps
  - Brush state flows to rainPass; water height includes velocity advection inline

## Detailed Progress Files

- progress/phase0-legacy-freeze.md
- progress/phase1-di-parity.md
- progress/phase2-webgpu-tsl-foundation.md
- progress/phase3-sim-pipeline-port.md
- progress/phase4-gui-parity.md
- progress/phase5-hybrid-bvh.md
- progress/phase6-validation-tooling.md
- progress/phase7-cleanup-docs.md
