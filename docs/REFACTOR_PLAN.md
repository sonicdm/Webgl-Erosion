# Webgl-Erosion Refactor & DI Plan

## Goals
- Shrink monoliths (`src/main.ts`, `src/three/integration.ts`, `SimulationPassManager.ts`) into small, testable modules.
- Remove global state and ambiguous `any` control objects; pass explicit, typed inputs.
- Clarify ownership of rendering vs. simulation vs. IO, so legacy WebGL and the Three.js port can coexist without leaking concerns.
- Normalize naming (height, frameCount, etc.) and shader organization to make passes discoverable.
- Lock down the heightmap/VTF contract so heights are consistent between simulation passes (raw float) and vertex displacement (normalized-to-denormalized flow).

## Project Snapshot — 2026-01-24
- Monoliths: `src/main.ts` reduced from ~850+ lines to 530 lines (Workstream B complete). `src/three/integration.ts` (~50k) and `SimulationPassManager.ts` (~56k) remain single-class orchestrators.
- Tests: new unit tests cover heightmap utilities; `src/utils/__tests__/rendering.test.ts` is `describe.skip` and uses ad-hoc geometry checks.
- Shaders: still in a flat folder; debug/brush visuals live inside `terrain-procedural-frag.glsl`.
- Temp/backup files still present (`temp_*`), adding noise.
- Heightmap/VTF path partly cleaned (see progress below); other areas unchanged.

## Progress — 2026-01-23
- HeightmapSource now enforces the RAW contract (stored = worldHeight * simres) and exposes uniform block with stored min/max.
- Terrain height extraction stores raw heights and reuses `createHeightmapSourceFromHeights` helper for consistency.
- Added Jest coverage for height encoding, HeightmapSource uniform block, stored-height creation, geometry extraction, and upload path RGBA32F handling (`src/three/utils/__tests__/heightmap-source.test.ts`).
- Heightmap extraction logs are gated behind a DEBUG flag to keep tests and CI clean.
- Workstream A delivered: bootstrap/services/DTO/state holders under `src/app/*` plus Jest coverage (bootstrap services, context setup, DTO packers, state holders).

## Progress — 2026-01-24 (Workstream A Complete)
- **Composition Root**: Created `src/app/bootstrap.ts` with full service interfaces and implementations:
  - `IGLContext`, `IRendererFactory`, `IBrushState`, `ITerrainState`, `IHeightmapIO`, `IRaycaster`, `ISimulationStepRunner`, `ICameraService`
  - All services implemented and wired via `createApp()` composition root function
- **Typed DTOs**: Created complete DTO layer:
  - `SimulationParams` - typed simulation parameters with `createSimulationParams()` helper
  - `BrushInput` - typed brush input with `createBrushInput()` helper  
  - `SourceArrays` - water/lava source arrays with packing methods for shader uniforms
  - `RenderTargetsSnapshot` - render target snapshot DTO (optional, for debugging)
- **State Holders**: Created state holder classes replacing global state:
  - `SimulationStateHolder` - wraps simres, frameCount, pause, terrainGeometryDirty
  - `TerrainStateHolder` - wraps terrain geometry, BVH, heightmap CPU buffer, update counters
  - `ClientStateHolder` - wraps client dimensions and pointer position
- **Migration**: Updated files to optionally accept state holders (backward compatible):
  - `brush-handler.ts`, `event-handlers.ts`, `heightmap-loader.ts`, `render-utils.ts`, `texture-management.ts`, `three/integration.ts`
  - Added deprecation comments to `simulation-state.ts` and all importing files
  - `ThreeJSSimulationRuntime.executeSimulationStep()` now accepts `SimulationParams`
- **Barrel Exports**: Created `src/app/index.ts` for convenient imports
- All code compiles successfully with no linter errors; backward compatibility maintained throughout

## Progress — 2026-01-24 (Workstream B Complete)
- **Entry Point Split**: Reduced `src/main.ts` from ~850+ lines to 530 lines (38% reduction)
- **Module Extraction**:
  - `app/ui/gui.ts` - Created `setupAppGUI()` wrapper for DAT GUI setup with dependency injection
  - `app/input/brush-controls.ts` - Extracted brush input calculation (`calculateBrushInput()`, `normalizeMousePosition()`, `updateBrushInputFromControls()`)
  - `app/runtime/legacy-runner.ts` - Extracted entire legacy WebGL render loop (`tick()`, `SimulatePerStep()`, `SimulationStep()` and all associated logic, ~2300 lines)
  - `app/runtime/three-runner.ts` - Extracted Three.js runtime initialization and animation loop
  - `app/context.ts` - Created `createAppContextSetup()` with canvas/WebGL setup and resize handling
- **Additional Modules Created**:
  - `app/runtime/legacy-initialization.ts` - Extracted legacy WebGL pipeline initialization (extension validation, geometry creation, renderer setup, texture/framebuffer setup, shader creation)
  - `app/controls/controls-factory.ts` - Extracted controls object creation using factory function pattern (~170 lines)
  - `utils/terrain-random.ts` - Extracted terrain random parameter management
- **Type System Improvements**:
  - Created unified `Controls` type (intersection of `GUIControls & EventHandlerControls & HeightmapLoaderControls`) to fix type compatibility issues across modules
  - Fixed TypeScript errors in `Camera.ts` (OrbitControls import, removed unused `Spherical` import)
  - Fixed TypeScript errors in `settings.ts` (removed non-existent `removePermanentLavaSource` property)
- **Code Cleanup**:
  - Removed ~50+ unused imports from `main.ts`
  - Removed unused module-level variables (`speed`, `enableBilateralBlur`)
  - Cleaned up helper functions and comments
- **Testing**: All 115 tests passing, build succeeds, no linter errors
- **Result**: `main.ts` is now a thin bootstrap that delegates to composition root and modularized runners

## Current Issue Snapshot (Three terrain flat/yellow)
- Symptom: Terrain renders flat and yellow → likely VTF displacement reads ~0 height and fragment shader shows debug/low-height color.
- Risks: missing `u_StoredHeightMin/Max` wiring in the vertex shader/material, fallback min/max from geometry still active, or texture uploaded/normalized incorrectly despite RGBA32F intent.

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

**Additional work completed:**
- `app/runtime/legacy-initialization.ts` — Extracted legacy WebGL pipeline initialization (extension validation, geometry creation, renderer setup, texture/framebuffer setup, shader creation)
- `app/controls/controls-factory.ts` — Extracted controls object creation with factory function pattern
- `utils/terrain-random.ts` — Extracted terrain random parameter management
- Unified `Controls` type — Fixed type compatibility issues by creating intersection type combining all module requirements
- Cleaned up unused imports and variables — Removed ~50+ unused imports from `main.ts`
- All tests passing (115 tests), build succeeds, no linter errors

## Workstream C — Three Runtime Split (`src/three`)
1. Break `integration.ts` into services:
   - `camera/CameraService.ts` (camera + controls ownership),
   - `terrain/TerrainSync.ts` (geometry creation + BVH build/rebuild cadence),
   - `simulation/StepRunner.ts` (per-frame uniforms, source array packing, calls into pass manager),
   - `io/HeightmapBridge.ts` (combined height readback + initial map handling).
2. Narrow `controls` usage: consume typed `SimulationParams` and `BrushInput` instead of `any`.
3. Keep a small `ThreeIntegration.ts` orchestrator that wires the services and exposes a minimal surface to `main.ts`.

## Workstream D — Pass Manager Restructure
1. Move render-target setup to `simulation/targets/RenderTargets.ts`.
2. Group passes by domain under `simulation/passes/` (water, sediment, thermal, lava, terrain, post).
3. Create a lightweight pass registry that maps names → shaders + uniforms; `StepRunner` consumes this registry instead of inline sections.
4. Separate heightmap mesh generation/readback into `TerrainReadbackService`.

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
3) Workstream C (Three services) — isolates camera/BVH/step logic.
4) Workstream H (heightmap/VTF stabilization) — lock the encoding/denorm path before broader refactors.
5) Workstream D (pass manager) — organizes GPGPU responsibilities.
6) Workstream E (shader move/rename) — align TS imports via manifest.
7) Workstream F/G in parallel once surfaces are stable.

## Validation
- Add unit tests for DTO validators and `SourceArrays` packing.
- Add a thin integration test that builds the pass registry and executes a dry run on a headless WebGL2 mock.
- Add a headless check that uploads a synthetic heightmap through `HeightmapSource` → render target → CPU readback and compares min/max to the source range (catches normalization issues).
- Manual smoke: launch legacy path and Three path separately; verify controls still map (brush, water/lava sources, BVH raycast toggle).

## Status by Workstream (as of 2026-01-24)
- **A (composition root)**: ✅ COMPLETE — Bootstrap/services/DTO/state holders in `src/app/*`; tests added for services, context setup, DTO packers, state holders.
- **B (entry split)**: ✅ COMPLETE — `main.ts` reduced from ~850+ lines to 530 lines; all modules extracted (`app/ui/gui.ts`, `app/input/brush-controls.ts`, `app/runtime/legacy-runner.ts`, `app/runtime/three-runner.ts`, `app/context.ts`); additional modules created (`legacy-initialization.ts`, `controls-factory.ts`, `terrain-random.ts`); unified Controls type; all tests passing.
- **C (Three runtime split)**: Not started; `integration.ts` still one class; no `TerrainSetup/TerrainSync` extraction. `executeSimulationStep()` now accepts `SimulationParams`.
- **D (pass manager restructure)**: Not started; `SimulationPassManager` unchanged structurally.
- **E (shader layout/naming)**: Not started; flat folder, debug logic inline.
- **F (naming/state cleanup)**: Not started; typos (`Hight*`, etc.) still present. State holders provide foundation for cleanup.
- **G (cleanup/hygiene)**: Not started; `temp_*` files remain.
- **H (heightmap/VTF)**: Partially done (RAW contract, helper, tests, debug-gating). Pending: central contract helper, uploader abstraction, shader audit/manifest, debug gating in fragment shader, displacement regression test.
