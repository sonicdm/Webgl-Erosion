# Master Refactor Plan (WebGPU + TSL, DI-First)

This is the master plan for a clean, single render pipeline based on WebGPU + TSL,
while preserving all DI/Class-based single source of truth fixes already done in
this branch. Legacy/old paths are frozen in a separate branch/release.

This plan is phased and includes structure guidelines, testing requirements, and
all planned features from this branch.

## Scope

- One renderer: WebGPURenderer.
- One shading system: TSL/NodeMaterial.
- GPU-first simulation + visuals.
- CPU BVH for interaction (raycast, brushes).
- DI/Class-based architecture with explicit dependencies.
- No legacy WebGL pipeline in master (freeze in legacy branch).

## Principles (DI/Class-Based Single Truth)

- Constructor injection only; no hidden globals.
- Composition root builds all services and state holders.
- State holders are the single source of mutable state:
  - SimulationStateHolder
  - TerrainStateHolder
  - ClientStateHolder
- No production imports of simulation-state (only deprecated compat in legacy).
- Render targets are owned by injectable pools (no module-level WebGL handles).
- Services are small, typed, and replace ambiguous any controls at boundaries.

## Source-of-Truth Contracts

- Heightmap contract: stored height is scaled; decode scale lives in a single
  uniform (u_HeightDecodeScale), derived from simRes.
- Terrain size and UV mapping are centralized in a TerrainUVMapping helper.
- Render targets are accessed only through pass manager/target pool services.
- BVH geometry ownership is TerrainStateHolder only.

## Target Architecture

GPU Path (simulation + visuals):
- WebGPURenderer + TSL materials.
- ComputeNode-based simulation passes.
- Heightmap ping-pong render targets.
- GPU normal map for lighting/slope blending.

CPU Path (interaction):
- Fixed-resolution raycast mesh (e.g., 256x256).
- BVH per tile, refit only affected tiles.
- Throttled GPU -> CPU readback to keep CPU mesh in sync.

## Planned Features (must be preserved)

These features are required and were already planned/partially implemented
in this branch. They must be carried into master:

### Terrain GUI Parity
- Full terrain parameter controls:
  - TerrainEasing, TerrainSteps, TerrainTurbulent
  - TerrainSize, TerrainWidthLengthRatio, TerrainSegments
  - TerrainSmoothing
  - TerrainEdgeType/Direction/Curve/Distance
- Type-specific defaults via getDefaultParams() for:
  - 12 legacy shader types
  - 17 THREE.Terrain wrapper types
- Generate Terrain button (no auto-regenerate on change).
- Status line: simres, segments, size, ratio, last error.
- Heightmap auto-import if heightmap type selected.
- Segments/simres lock (segments + 1 = simres).

### Terrain Generation Wiring
- Full parameter wiring into TerrainReadbackService:
  - size, ratio, segments, steps, turbulent, easing, edges, smoothing
- Validation for inputs (finite, >0).
- Heightmap import caching and resampling to simRes.
- Edge and smoothing mapping compatible with THREE.Terrain filter signatures.

### Ping-Pong Freshness
- Always bind freshest textures from pass manager each frame:
  - u_Heightmap, u_Sediment
- Expose getTerrainTexture/getSedimentTexture for write targets.
- Update u_HeightDecodeScale on simRes change.

### Health Checks and Parity
- Readback min/max after generation and in debug cadence.
- Health flag (simHealthy) gates success logs.
- Height parity validator:
  - GPU texture vs debug render pass (4x4 patch)
- Headless script: validate:height-parity.

### Error Surfacing
- Error banner includes baseType, easing, segments, simres, size, ratio,
  min/max/range.
- Status line mirrors banner errors.

### Hybrid BVH (Interaction)
- CPU raycast mesh at fixed resolution.
- BVH per tile, refit only affected tiles.
- Optional debug raycast overlay.

## Phase Plan

### Phase 0 — Legacy Freeze
1) Create a legacy branch/release (e.g., legacy-webgl).
2) Tag current stable build.
3) Lock legacy for hotfix-only.

### Phase 1 — DI/Class-Based Parity in Master
Carry over the DI/Refactor work from this branch:
- State holder wiring (no simulation-state imports).
- Three runtime services injected via composition root.
- Terrain/BVH ownership in TerrainStateHolder only.
- LegacyTexturePool remains only in legacy branch.
- Remove module-level WebGL state singletons.

Acceptance:
- DI smoke test passes (npm run test:ci).
- No production imports of simulation-state.

### Phase 2 — WebGPU + TSL Foundation
- Upgrade three to WebGPU-capable version.
- Replace WebGLRenderer with WebGPURenderer.
- Add WebGPU capability checks and fallback messaging.
- Introduce TSL/NodeMaterial base patterns:
  - TerrainMaterialNode
  - WaterMaterialNode
- Establish compute pipeline shell:
  - ComputeNode for simulation passes.

Acceptance:
- WebGPURenderer renders a basic scene.
- NodeMaterial renders with WebGPU backend.

### Phase 3 — Simulation Pipeline Port
Port simulation passes to compute nodes:
- Rain, flow, evaporation, sediment, thermal, lava.
- Ping-pong heightmap targets.
- TerrainReadbackService adapts to WebGPU targets.

Acceptance:
- One complete sim step produces non-flat heightmap.
- Readback health checks pass.

### Phase 4 — Terrain Generation + GUI Parity
Implement full GUI controls and defaults:
- Terrain parameters and defaults.
- Generate Terrain button only.
- Segments/simRes lock.
- Heightmap import workflow.
- Status line + error banner.

Acceptance:
- GUI changes update heightmap correctly on Generate.
- Type defaults applied on selection.

### Phase 5 — Hybrid BVH + CPU Mesh
Implement CPU interaction mesh and BVH refit:
- Fixed-resolution raycast mesh (256x256).
- BVH tiling and refit per tile.
- Throttled GPU -> CPU sync.
- Optional debug raycast overlay.

Acceptance:
- Brush raycast remains responsive under heavy sculpting.
- BVH refit latency remains low (<100ms typical).

### Phase 6 — Validation + Tooling
Add/port tests and scripts:
- DI smoke test.
- Heightmap upload/readback regression.
- Height parity validator.
- Raycast correctness tests (CPU vs GPU).
- Performance smoke tests.

Acceptance:
- npm run test:ci passes.
- validate:height-parity passes.

### Phase 7 — Cleanup & Docs
- Remove old WebGL/VTF docs from master.
- Document WebGPU + TSL pipeline.
- Update README for new GUI, controls, and workflows.

## Testing Matrix

Unit:
- DI smoke test
- TerrainUVMapping helper tests
- BVH refit tile selection tests
- Heightmap encode/decode tests

Integration:
- Generate terrain with Hill/HillIsland/PerlinDiamond
- Change size/ratio and ensure targets/mesh sync
- Toggle turbulent/steps -> height range changes
- Validate masks affect output

Headless/Validation:
- validate:height-parity
- readback health check
- raycast vs heightmap consistency

Performance:
- BVH refit under brush strokes
- GPU readback cadence stability

## Structure Guidelines

- app/ for composition root, runtime, state holders.
- three/ for renderer, materials, and GPU pipelines.
- shaders/ only for legacy GLSL (frozen in legacy branch).
- utils/ for shared helpers; no global state.
- services created via factories in bootstrap only.

## Definition of Done

- WebGPU + TSL pipeline is the only render path in master.
- All DI/Class single truth constraints enforced.
- Terrain GUI parity complete and documented.
- CPU BVH interaction mesh stable with refit.
- All tests and validation scripts pass.

