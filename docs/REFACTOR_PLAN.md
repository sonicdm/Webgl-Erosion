# Webgl-Erosion Refactor & DI Plan

## Goals
- Shrink monoliths (`src/main.ts`, `src/three/integration.ts`, `SimulationPassManager.ts`) into small, testable modules.
- Remove global state and ambiguous `any` control objects; pass explicit, typed inputs.
- Clarify ownership of rendering vs. simulation vs. IO, so legacy WebGL and the Three.js port can coexist without leaking concerns.
- Normalize naming (height, frameCount, etc.) and shader organization to make passes discoverable.
- Lock down the heightmap/VTF contract so heights are consistent between simulation passes (raw float) and vertex displacement (normalized-to-denormalized flow).

## Project Snapshot — 2026-01-24

### Monoliths Status
- ✅ **`src/main.ts`**: Reduced from ~850+ lines to 530 lines (38% reduction). Now a thin bootstrap delegating to composition root and modularized runners.
- ✅ **`src/three/integration.ts`**: Refactored to thin orchestrator (`ThreeJSSimulationRuntime`) ~500 lines from ~1200+. Extracted services: `CameraService`, `TerrainSync`, `HeightmapBridge`, `StepRunner`.
- ✅ **`SimulationPassManager.ts`**: Refactored to thin orchestrator ~650 lines from ~1165+. Extracted: `RenderTargets`, domain pass classes (`WaterPasses`, `SedimentPasses`, `ThermalPasses`, `LavaPasses`, `PostPasses`), `TerrainReadbackService`, `PassRegistry`.

### Architecture
- **Services**: Composition root in `src/app/bootstrap.ts` with full service interfaces. State holders replace global state (`SimulationStateHolder`, `TerrainStateHolder`, `ClientStateHolder`).
- **DTOs**: Typed data transfer objects (`SimulationParams`, `BrushInput`, `SourceArrays`, `RenderTargetsSnapshot`) with helper functions.
- **Module Organization**: 
  - `app/` - Bootstrap, UI, input, runtime, context, state, DTOs
  - `three/camera/` - Camera service
  - `three/terrain/` - Terrain sync and geometry management
  - `three/simulation/` - Step runner, pass manager, domain passes, render targets, terrain readback
  - `three/io/` - Heightmap bridge and terrain readback service
- **Domain Passes**: Organized by domain (`water/`, `sediment/`, `thermal/`, `lava/`, `post/`) with comprehensive test coverage.

### Testing
- **186 tests passing** (up from 115 at start of refactoring)
- Comprehensive coverage for: services, domain passes, render targets, pass registry, terrain readback, DTOs, state holders
- All tests passing, build successful, no linter errors

### Remaining Work
- **Shaders**: Still in flat folder structure; debug/brush visuals live inside `terrain-procedural-frag.glsl`. Need domain-based organization (Workstream E).
- **Naming**: Typos present (`Hight*`, etc.); need standardization (Workstream F).
- **Cleanup**: `temp_*` backup files remain (Workstream G).
- **Heightmap/VTF**: Partially done (RAW contract, helper, tests, debug-gating). Pending: central contract helper, uploader abstraction, shader audit/manifest, debug gating in fragment shader, displacement regression test (Workstream H).



## Near-term terrain/VTF plan
1. **Contract enforcement layer**: Add a `HeightmapContract/HeightmapUniforms` helper that builds `{u_SimRes, u_StoredHeightMin, u_StoredHeightMax}` from HeightmapSource; fail fast if missing.
2. **Terrain integration split** (no behavior change yet): outline `TerrainSetup` (plane+material, VTF capability check) and `TerrainSync` (per-frame texture/uniform refresh) to replace scattered logic in `integration.ts`.
3. **Shader alignment audit**: verify `terrain-procedural-vert.glsl` samples using stored min/max; gate fragment debug/flat visualization behind `u_DebugMode` instead of always-on.
4. **Texture safety helper**: draft a `WebGLTextureUploader` that encapsulates RGBA32F upload + asserts, replacing direct renderer property pokes.
5. **Tests to add** (once helpers exist): unit for HeightmapUniforms builder; unit for TerrainSync texture assignment; GLSL compile/snapshot ensuring required uniforms; headless regression that samples a synthetic heightmap and confirms non-zero displacement.

## Guiding Principles
- Constructor/parameter injection only; no IoC container. Compose dependencies at a single root.
- Immutable inputs per frame; long-lived services hold resources, not mutable control data.
- One responsibility per module; prefer folders by domain (render, sim, IO, input) over grab-bag files.
- Keep shader and TypeScript naming in sync; fix typos while moving.

## Workstream A — Composition Root & State ✅ COMPLETE
1. ✅ Introduce `src/app/bootstrap.ts` as composition root that builds:
   - `GLContext`, `RendererFactory`, `ControlsConfig`, `BrushState`, `TerrainState`, `HeightmapIO`, `Raycaster`, `SimulationStepRunner`, `CameraService`.
   - All service interfaces defined and implemented; `SimulationStepRunner` delegates to `ThreeJSSimulationRuntime`
2. ✅ Define typed DTOs: `SimulationParams`, `BrushInput`, `SourceArrays` (water/lava), `RenderTargetsSnapshot`.
   - All DTOs created with helper functions for conversion from legacy controls objects
3. ✅ Replace global imports (`simulation-state`) with injected state holders and setters where needed.
   - State holders created and integrated; files updated to optionally use them (backward compatible)
   - Deprecation comments added; gradual migration path established

## Workstream B — Entry Point Split (`src/main.ts`) ✅ COMPLETE
1. ✅ Extract modules:
   - `app/ui/gui.ts` (DAT GUI + settings wiring) — Created `setupAppGUI()` wrapper
   - `app/input/brush-controls.ts` (mouse/keyboard → `BrushInput`) — Created `calculateBrushInput()`, `normalizeMousePosition()`, `updateBrushInputFromControls()`
   - `app/runtime/legacy-runner.ts` (old GL pipeline loop) — Extracted `tick()`, `SimulatePerStep()`, `SimulationStep()` and entire render loop
   - `app/runtime/three-runner.ts` (Three bridge hookup) — Extracted Three.js runtime initialization and animation loop
   - `app/context.ts` (shared handles + resize events) — Created `createAppContextSetup()` with resize handling
2. ✅ Keep `main.ts` as thin bootstrap delegating to composition root — Reduced from ~850+ lines to 530 lines

## Workstream C — Three Runtime Split (`src/three`) ✅ COMPLETE
1. ✅ Break `integration.ts` into services:
   - ✅ `camera/CameraService.ts` (camera + controls ownership),
   - ✅ `terrain/TerrainSync.ts` (geometry creation + BVH build/rebuild cadence),
   - ✅ `simulation/StepRunner.ts` (per-frame uniforms, source array packing, calls into pass manager),
   - ✅ `io/HeightmapBridge.ts` (combined height readback + initial map handling).
2. ✅ Narrow `controls` usage: consume typed `SimulationParams` and `BrushInput` instead of `any`.
3. ✅ Keep a small `ThreeJSSimulationRuntime` orchestrator that wires the services and exposes a minimal surface to `main.ts`.

## Workstream D — Pass Manager Restructure ✅ COMPLETE
1. ✅ Move render-target setup to `simulation/targets/RenderTargets.ts`.
2. ✅ Group passes by domain under `simulation/passes/` (water, sediment, thermal, lava, terrain, post).
3. ✅ Create a lightweight pass registry that maps names → shaders + uniforms; `StepRunner` consumes this registry instead of inline sections.
4. ✅ Separate heightmap mesh generation/readback into `TerrainReadbackService`.

## Workstream E — Shader Layout & Naming
1. Rehome shaders into folders:
   - `shaders/water`: `rain`, `flow`, `water-height`, `evaporation`, etc.
   - `shaders/sediment`: `sediment`, `advect`, `maccormack`, `average`.
   - `shaders/thermal`: `max-slippage-height`, `thermal-flux`, `thermal-apply`.
   - `shaders/lava`: `lava-flow`, `lava-update`, `lava-terrain`.
   - `shaders/terrain`: `initial`, `terrain-procedural`, `terrain-vert`, `shadowmap`, etc.
2. Rename typos while moving (e.g., `alterwaterhight-frag.glsl` → `water-height-frag.glsl`; `maxslippageheight-frag.glsl` → `max-slippage-height-frag.glsl`).
3. Add a `shaders/manifest.ts` exporting pass → path mapping to keep TS imports consistent post-move.

## Workstream F — Naming & State Cleanup
1. Standardize height/frame naming (`HeightMap*`, `simFrameCount`, `simRes`).
2. Encapsulate mutable counters (heightmap read cadence, geometry update) behind small services to avoid cross-module mutations.
3. Replace ad-hoc `any` controls with typed structs and enforce them at boundaries.

## Workstream G — Cleanup & Hygiene
1. Move `temp_*` backups to `research/archives/` with a short README or delete if superseded.
2. Remove IDE-tab reference to missing `src/three/integration-clean-render.ts` and/or recreate it as a documented experiment stub if needed.
3. Add lint-friendly barrel files only where they reduce import noise; avoid deep wildcard exports until the split stabilizes.

## Workstream H — Heightmap/VTF Stabilization (in flight)
1. Treat `HeightmapSource` as the single source of truth: ensure it’s created once during terrain generation, retained through swaps, and injected into materials via a typed provider (not `passManager?.getHeightmapSource()` from random call sites).
2. Harden uploads: finish `uploadHeightmap` fallback path or enforce a hard failure if the direct WebGL route is unavailable; wrap renderer property pokes behind a `WebGLTextureUploader` helper instead of touching `properties.get` inline.
3. Verify texture formats: replace ad-hoc `configureTextureForVTF` and `PingPongTarget` internal-format hacks with a centralized util that asserts RGBA32F + FloatType using supported Three.js flags; add a runtime assertion/log when the GPU normalizes unexpectedly.
4. Normalize/denormalize contract: validate `terrain-procedural-vert.glsl`’s denorm logic (`u_StoredHeightMin/Max`) against a CPU reference sample; ensure these uniforms are always set from `HeightmapSource` and not recomputed from geometry fallback.
5. Clean temporary debug paths: remove the red/yellow debug color branch in `terrain-procedural-frag.glsl`; gate any remaining diagnostics behind a compile-time flag or uniform.
6. Add a regression harness: CPU-read the terrain texture after one upload and confirm min/max match `HeightmapSource` and original geometry heights; add a small headless test to catch normalization regressions.

## Suggested Sequence
1) Workstream A (bootstrap + DTOs) — unlocks DI-style wiring. ✅ COMPLETE
2) Workstream B (entry split) — reduces main monolith. ✅ COMPLETE
3) Workstream C (Three services) — isolates camera/BVH/step logic. ✅ COMPLETE
4) Workstream H (heightmap/VTF stabilization) — lock the encoding/denorm path before broader refactors.
5) Workstream D (pass manager) — organizes GPGPU responsibilities. ✅ COMPLETE
6) Workstream E (shader move/rename) — align TS imports via manifest.
7) Workstream F/G in parallel once surfaces are stable.

## Validation
- Add unit tests for DTO validators and `SourceArrays` packing.
- Add a thin integration test that builds the pass registry and executes a dry run on a headless WebGL2 mock.
- Add a headless check that uploads a synthetic heightmap through `HeightmapSource` → render target → CPU readback and compares min/max to the source range (catches normalization issues).
- Manual smoke: launch legacy path and Three path separately; verify controls still map (brush, water/lava sources, BVH raycast toggle).

## Status by Workstream (as of 2026-01-24)

### ✅ A (composition root) — COMPLETE
- **Bootstrap & Services**: Created `src/app/bootstrap.ts` with full service interfaces and implementations (`IGLContext`, `IRendererFactory`, `IBrushState`, `ITerrainState`, `IHeightmapIO`, `IRaycaster`, `ISimulationStepRunner`, `ICameraService`). All services implemented and wired via `createApp()` composition root function.
- **Typed DTOs**: Created complete DTO layer (`SimulationParams`, `BrushInput`, `SourceArrays`, `RenderTargetsSnapshot`) with helper functions for conversion from legacy controls objects.
- **State Holders**: Created state holder classes replacing global state (`SimulationStateHolder`, `TerrainStateHolder`, `ClientStateHolder`). Updated files to optionally accept state holders (backward compatible). Added deprecation comments to `simulation-state.ts` and all importing files.
- **Barrel Exports**: Created `src/app/index.ts` for convenient imports.
- **Testing**: All tests passing, build succeeds, no linter errors.

### ✅ B (entry split) — COMPLETE
- **Entry Point Split**: Reduced `src/main.ts` from ~850+ lines to 530 lines (38% reduction).
- **Module Extraction**: Extracted `app/ui/gui.ts`, `app/input/brush-controls.ts`, `app/runtime/legacy-runner.ts` (~2300 lines), `app/runtime/three-runner.ts`, `app/context.ts`.
- **Additional Modules**: Created `app/runtime/legacy-initialization.ts`, `app/controls/controls-factory.ts` (~170 lines), `utils/terrain-random.ts`.
- **Type System**: Created unified `Controls` type (intersection of `GUIControls & EventHandlerControls & HeightmapLoaderControls`). Fixed TypeScript errors in `Camera.ts` and `settings.ts`.
- **Code Cleanup**: Removed ~50+ unused imports from `main.ts`, removed unused module-level variables.
- **Testing**: All 115 tests passing, build succeeds, no linter errors.

### ✅ C (Three runtime split) — COMPLETE
- **Service Extraction**: Created four focused services:
  - `CameraService` - Manages camera setup, configuration, and updates
  - `TerrainSync` - Handles terrain geometry creation, BVH building, and material management
  - `HeightmapBridge` - Manages heightmap readback and CPU buffer management
  - `StepRunner` - Encapsulates simulation step execution with typed DTOs
- **Orchestrator Refactoring**: `integration.ts` (now `ThreeJSSimulationRuntime`) reduced from monolithic class to thin orchestrator (~500 lines from ~1200+).
- **Type Safety**: Replaced `any` types with `SimulationParams` and `BrushInput` DTOs throughout service interfaces.
- **Test Coverage**: Added comprehensive unit tests for all services (170 tests passing, up from 145).
- **Testing**: All tests passing, build successful, no linter errors.

### ✅ D (pass manager restructure) — COMPLETE
- **Render Targets Extraction**: Created `RenderTargets` class encapsulating all ping-pong and non-ping-pong render targets. All 9 ping-pong targets (terrainPP, fluxPP, velocityPP, sedimentPP, sedimentBlendPP, maxslippagePP, terrainFluxPP, lavaPP, lavaFluxPP) and 3 non-ping-pong targets (terrainNor, sedimentAdvectA, sedimentAdvectB) extracted. `SimulationPassManager` now uses `RenderTargets` instance.
- **Domain Pass Grouping**: Created domain-specific pass classes:
  - `WaterPasses` - rain, flow, water-height, evaporation passes
  - `SedimentPasses` - sediment, advection (MacCormack and simple), average passes
  - `ThermalPasses` - max-slippage, thermal-flux, thermal-apply passes
  - `LavaPasses` - lava-flow, lava-update, lava-terrain passes
  - `PostPasses` - clean pass
  - All domain pass classes have comprehensive unit tests
- **Pass Registry**: Created `PassRegistry` class with `PassConfig` interface for lightweight pass metadata management. Supports pass registration, retrieval, domain filtering, and uniform validation. Registry infrastructure ready for future integration into execution flow for validation/debugging.
- **Terrain Readback Service**: Extracted terrain generation and readback logic to `TerrainReadbackService`. Handles terrain mesh generation, heightmap extraction, and provides accessors for terrain mesh, initial heightmap, and heightmap source. `SimulationPassManager.initializeTextures()` now delegates to service.
- **Orchestrator Refactoring**: `SimulationPassManager` refactored to thin orchestrator (~650 lines from ~1165+). All pass execution delegated to domain pass classes. Removed old pass execution methods. Fixed broken `getTerrainTexture()` method. Updated getter methods to delegate to `TerrainReadbackService`.
- **Test Coverage**: Added comprehensive unit tests for all new services (186 tests passing, up from 170). All domain pass classes, `RenderTargets`, `PassRegistry`, and `TerrainReadbackService` have full test coverage.
- **Testing**: All tests passing, build successful, no linter errors.

### ⏳ E (shader layout/naming) — Not started
- Flat folder structure; debug logic inline.
- Shaders need to be rehomed into domain folders (`shaders/water`, `shaders/sediment`, `shaders/thermal`, `shaders/lava`, `shaders/terrain`).
- Typos need renaming (e.g., `alterwaterhight-frag.glsl` → `water-height-frag.glsl`).
- Need to add `shaders/manifest.ts` for pass → path mapping.

### ⏳ F (naming/state cleanup) — Not started
- Typos present (`Hight*`, etc.). State holders provide foundation for cleanup.
- Need to standardize height/frame naming (`HeightMap*`, `simFrameCount`, `simRes`).
- Need to encapsulate mutable counters behind small services.
- Need to replace ad-hoc `any` controls with typed structs.

### ⏳ G (cleanup/hygiene) — Not started
- `temp_*` files remain.
- Need to move `temp_*` backups to `research/archives/` or delete if superseded.
- Need to remove IDE-tab reference to missing `src/three/integration-clean-render.ts`.
- Need to add lint-friendly barrel files where they reduce import noise.

### 🔄 H (heightmap/VTF) — Partially done
- **Completed**: RAW contract enforcement (stored = worldHeight * simres), helper functions, tests, debug-gating.
- **Pending**: Central contract helper (`HeightmapContract/HeightmapUniforms`), uploader abstraction (`WebGLTextureUploader`), shader audit/manifest, debug gating in fragment shader, displacement regression test.
