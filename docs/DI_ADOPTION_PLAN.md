# Dependency Injection Adoption Plan

## Goals
- Eliminate reliance on `simulation-state` globals; route all mutable sim/terrain/client state through holders and services.
- Ensure every runtime (legacy WebGL + Three.js) is constructed from the composition root with explicit, typed dependencies.
- Make GPU resource lifecycles (textures/framebuffers) injectable to support testing and multi-runtime safety.
- Reduce module-level singletons; prefer small factories/services with clear ownership.

## Scope & Non-Goals
- **In scope:** state holders, runtime wiring, texture management, brush/event plumbing, terrain/BVH sharing, minimal test additions.
- **Out of scope (for now):** gameplay/UX changes, shader logic changes, perf tuning beyond DI fallout.

## Current Snapshot (2026-01-26)
- State holders exist (`SimulationStateHolder`, `TerrainStateHolder`, `ClientStateHolder`) but many call sites still import `simulation-state`.
- Three runtime constructs its own services (`CameraService`, `TerrainSync`, `HeightmapBridge`, `StepRunner`, `SourceArrays`) instead of receiving them.
- `TerrainSync` still writes BVH/geometry into `simulation-state` for brush access.
- `simulation/texture-management.ts` keeps WebGL handles as module singletons plus a mutable `gl_context`.
- Legacy init/runner size textures and loaders from global `simres` instead of injected holders.

## Risks / Watchouts
- Hidden coupling between brush/event handlers and BVH/heightmap buffers; must replace with holder access without breaking legacy UI.
- Texture module singleton teardown could break if not re-wired in legacy runner; add smoke test.
- Test flakiness if DI wiring isn’t exercised; add at least one DI smoke test.

## Workstreams (ordered)
1) **State Holder Wiring**
   - Replace `simulation-state` imports in `main.ts`, `brush-handler.ts`, `events/event-handlers.ts`, `utils/heightmap-loader.ts`, `legacy-*` with injected holders from `AppContext`.
   - Remove dual writes to globals; keep a thin compatibility shim only if unavoidable.
2) **Three Runtime Construction**
   - Refactor `ThreeJSSimulationRuntime` to accept pre-built `CameraService`, `TerrainSync`, `HeightmapBridge`, `StepRunner`, and a shared `SourceArrays` in ctor.
   - Add a `createThreeRuntime(appContext, services)` helper near `app/runtime/three-runner.ts` to keep call sites simple.
3) **Terrain/BVH Ownership**
   - Pass `TerrainStateHolder` into `TerrainSync`; publish geometry/BVH updates via holder setters instead of `simulation-state`.
   - Brush/event layers consume holder accessors only.
4) **Texture Management Injection**
   - Encapsulate `simulation/texture-management` globals into a `RenderTargetsPool` (or similar) class that takes `{ gl, simulationState }`.
   - Update legacy init/runner to receive an instance; drop module-level `gl_context` and re-exported texture handles.
5) **Resolution & IO Consistency**
   - Legacy init uses holder `simres` for texture sizing and heightmap loader construction.
   - Ensure `createHeightMapLoader` accepts state holder or simres parameter (no globals).
6) **Testing & Guardrails**
   - Add DI smoke test: build `createApp(...)` with stubs; assert no module import of `simulation-state` after rewiring.
   - Add small legacy texture-pool instantiation test (WebGL2 mocked) to ensure resource creation honors injected simres.

## Definition of Done
- No production code imports `simulation-state` except a legacy compatibility shim marked for removal.
- `ThreeJSSimulationRuntime` constructor is side-effect free; all dependencies injected.
- Brush/event/heightmap loader paths read/write through holders only.
- Texture management lives behind an injectable class; module-level WebGL singletons removed.
- Tests run with `npm run test:ci` pass; new DI smoke test present.

## Suggested Execution Order
1) Wire holders into brush/event/heightmap + remove global writes.
2) Refactor Three runtime ctor + inject services from composition root.
3) Move BVH/geometry storage into `TerrainStateHolder`.
4) Extract texture pool class and update legacy runner/init.
5) Add tests and delete any leftover global usage.

## Progress log

### Workstream 1 — State holder wiring (2026-01-25)
- **Files changed:** `app/constants.ts` (new), `app/controls/controls-factory.ts`, `main.ts`, `brush-handler.ts`, `events/event-handlers.ts`, `utils/heightmap-loader.ts`, `app/runtime/legacy-initialization.ts`, `utils/terrain-random.ts`, `app/runtime/legacy-runner.ts`, `three/main.ts`
- **simulation-state imports removed:** 4 (brush-handler, event-handlers, legacy-initialization, three/main); main reduced to dual-write shim (setGlContext, setPauseGeneration, setSimFrameCount, setTerrainGeometryDirty); heightmap-loader removed `* as simulationState`, kept setTerrainGeometryDirty fallback; terrain-random kept setTerrainGeometryDirty for compat
- **Summary:** Added `DEFAULT_SIMRES` and `initialSimres` in `createControls`; main and createApp use it instead of `simres` from simulation-state. BrushContext and EventHandlerDependencies require `simulationState` and `terrainState`; brush-handler and event-handlers use holders only. Fixed heightmap-loader export bug (`simulationState?.simres ?? (Number(controls.SimulationResolution) || simres)`). Legacy-init and main’s createHeightMapLoader receive holder `simres` and `simulationState`. Legacy-runner syncs holder (terrainGeometry, terrainBVH, heightMapCpuBuf, simres) from simulation-state for BrushContext and getTerrainGeometry. setTerrainRandom accepts optional `simulationStateHolder`.

### Workstream 2 — Three runtime construction (2026-01-25)
- **Files changed:** `app/runtime/create-three-runtime.ts` (new), `three/integration.ts`, `three/terrain/TerrainSync.ts`, `main.ts`, `app/index.ts`
- **Summary:** `ThreeJSSimulationRuntime` now accepts `ThreeRuntimeDeps`; no internal construction of services. `createThreeRuntime(appContext, canvas, glContext)` builds and injects all deps; main uses it instead of `new ThreeJSSimulationRuntime`. `TerrainSync` has optional 5th param `terrainStateHolder`; when provided, dual-writes geometry/BVH to holder and simulation-state.

### Workstream 3 — Terrain/BVH ownership (2026-01-25)
- **Files changed:** `three/terrain/TerrainSync.ts`, `three/integration.ts`, `app/runtime/create-three-runtime.ts`, `three/terrain/__tests__/TerrainSync.test.ts`
- **simulation-state imports removed:** TerrainSync (setTerrainGeometry, setTerrainBVH, setTerrainBVHBuildInProgress, terrainBVHBuildInProgress); integration (terrainBVH, terrainGeometry, setTerrain*)
- **Summary:** `TerrainSync` requires `TerrainStateHolder` and writes only to it. `integration.ts` `calculateBrushState` reads `terrainBVH`/`terrainGeometry` from `this.terrainStateHolder`. `ThreeRuntimeDeps` includes `terrainStateHolder`; `createThreeRuntime` passes it. TerrainSync.test updated to pass a `TerrainStateHolder` and simulation-state mock removed.

### Workstream 4 — Texture management injection (LegacyTexturePool) (2026-01-25)
- **Files changed:** `simulation/LegacyTexturePool.ts` (new), `simulation/texture-management.ts` (deprecated), `app/context.ts`, `app/bootstrap.ts`, `app/runtime/legacy-initialization.ts`, `app/runtime/legacy-runner.ts`, `utils/heightmap-loader.ts`, `rendering/render-utils.ts`, `main.ts`, `app/__tests__/context-setup.test.ts`, `app/runtime/__tests__/legacy-runner.test.ts`, `three/terrain/__tests__/TerrainSync.test.ts`
- **texture-management imports removed:** `app/context.ts`, `app/runtime/legacy-initialization.ts`, `app/runtime/legacy-runner.ts`, `utils/heightmap-loader.ts`, `rendering/render-utils.ts` (main had none). `texture-management` marked @deprecated; legacy path uses `LegacyTexturePool` only.
- **Summary:** `LegacyTexturePool(gl, simres, shadowMapResolution)` holds all framebuffers, renderbuffers, textures, `setup`, `resizeTextures4Simulation`, `resizeScreenTextures`, `setHeightMapTexture`/`getHeightMapTexture`, and all `swap*`. Main creates pool in legacy path, sets `appContext.legacyTexturePool` for resize handler, passes pool to `initializeLegacyPipeline` and `createLegacyRunner`. `LegacyRunnerConfig` includes `pool`; `createHeightMapLoader` and `Render2Texture` take pool (or `HeightmapLoaderPool`/`Render2TexturePool`). `app/context` calls `appContext.legacyTexturePool?.resizeScreenTextures()`. Tests updated for `pool` and `terrainStateHolder`.

### Workstream 5 — Resolution and IO consistency (2026-01-25)
- **Files changed:** `utils/heightmap-loader.ts`
- **simulation-state imports removed:** 1 (setTerrainGeometryDirty).
- **Summary:** `createHeightMapLoader` now requires `simulationState: SimulationStateHolder`; removed `setTerrainGeometryDirty` fallback and simulation-state import. Load/clear set `simulationState.terrainGeometryDirty = true`. Exports use `simulationState.simres` for resolution. Legacy init already uses `appContext.simulationState.simres` for createHeightMapLoader and pool; controls-factory `SimulationResolution` from `initialSimres` (WS1).

### Workstream 6 — legacy-runner off simulation-state (2026-01-25)
- **Files changed:** `app/runtime/legacy-runner.ts`, `main.ts`, `utils/terrain-random.ts`
- **simulation-state imports removed:** legacy-runner 0 (already removed in prior session); main 4 (setGlContext, setPauseGeneration, setSimFrameCount, setTerrainGeometryDirty); terrain-random 1 (setTerrainGeometryDirty).
- **Summary:** legacy-runner uses only `appContext.simulationState`, `appContext.terrainStateHolder`, and injected pool. Main’s dual-write shim removed: no more setGlContext, setPauseGeneration, setSimFrameCount. terrain-random’s setTerrainGeometryDirty fallback removed; callers pass holder.

### Workstream 7 — Testing and Definition of Done (2026-01-25)
- **Files changed:** `app/__tests__/bootstrap-services.test.ts`, `simulation/__tests__/LegacyTexturePool.test.ts`, `docs/DI_ADOPTION_PLAN.md`
- **New tests:** DI smoke in `bootstrap-services.test.ts` (createApp returns holder-based state); `LegacyTexturePool.test.ts` (instantiate with WebGL2 mock, setup and resizeTextures4Simulation do not throw; key getters non-null).
- **Definition of Done:** checked below. `simulation-state` remains only in `simulation/texture-management.ts` (deprecated) and `simulation/simulation-state.ts` itself.
- **Summary:** DI smoke test and LegacyTexturePool test added; `npm run test:ci` passes; DoD checklist complete.

## Definition of Done (final)

- [x] No production import of `simulation-state` except deprecated `texture-management` compat (main, brush, events, heightmap-loader, legacy-runner, terrain-random, TerrainSync, integration: none).
- [x] `ThreeJSSimulationRuntime` ctor side-effect free; all deps injected via `createThreeRuntime`.
- [x] Brush/event/heightmap paths use holders only.
- [x] Texture management behind injectable `LegacyTexturePool`; module-level WebGL in legacy path removed.
- [x] `npm run test:ci` passes; DI smoke and LegacyTexturePool tests present.

