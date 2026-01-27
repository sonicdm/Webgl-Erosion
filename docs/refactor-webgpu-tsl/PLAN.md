# Master Refactor Plan (WebGPU + TSL, DI-First)

This plan defines a single render pipeline based on WebGPU + TSL while preserving
all DI/class-based single source of truth fixes. Legacy WebGL/VTF stays in a
frozen branch.

## Scope
- One renderer: WebGPURenderer.
- One shading system: TSL/NodeMaterial.
- GPU-first simulation + visuals.
- CPU BVH for interaction (raycast, brushes).
- DI/Class-based architecture with explicit dependencies.
- No legacy WebGL pipeline in master (legacy branch only).

## Principles (DI/Class Single Truth)
- Constructor injection only; no hidden globals.
- Composition root builds all services and state holders.
- State holders are the single source of mutable state.
- No production imports of simulation-state in master.
- Render targets owned by injectable pools/services.
- Typed DTOs at boundaries; no ambiguous any controls.

## Planned Features (must be preserved)
See the hybrid plan for full detail:
../three-terrain-gui-implementation/hybrid-gpu-heightmap-cpu-bvh-plan.md

Key feature blocks:
- Terrain GUI parity (all new terrain params + defaults).
- Terrain generation wiring (size/ratio/steps/easing/edges/smoothing).
- Ping-pong freshness (bind write targets every frame).
- Health checks + parity validation.
- Error surfacing (banner + status line).
- Hybrid BVH (CPU raycast mesh, tiled BVH refit).

## Phases

### Phase 0 — Legacy Freeze
1) Create legacy branch (legacy-webgl).
2) Tag stable build.
3) Lock legacy for hotfix-only.

### Phase 1 — DI/Class-Based Parity
- Carry over DI/Refactor plan work from the feature branch.
- No simulation-state imports; holders only.
- Terrain/BVH ownership via TerrainStateHolder.

Acceptance:
- DI smoke test passes (npm run test:ci).
- No production imports of simulation-state.

### Phase 2 — WebGPU + TSL Foundation
- Upgrade three to WebGPU-capable version.
- Replace WebGLRenderer with WebGPURenderer.
- Add WebGPU capability checks + fallback message.
- Introduce NodeMaterial base patterns (terrain/water).
- Establish ComputeNode pipeline shell.

Acceptance:
- WebGPURenderer renders a basic scene.
- NodeMaterial renders with WebGPU backend.

### Phase 3 — Simulation Pipeline Port
- Port rain/flow/evaporation/sediment/thermal/lava to ComputeNode.
- Heightmap ping-pong targets in WebGPU path.
- TerrainReadbackService adapts to WebGPU targets.

Acceptance:
- One complete sim step produces non-flat heightmap.
- Readback health checks pass.

### Phase 4 — Terrain Generation + GUI Parity
- Full GUI controls and defaults.
- Generate Terrain button only.
- Segments/simRes lock.
- Heightmap import workflow.
- Status line + error banner.

Acceptance:
- GUI changes update heightmap correctly on Generate.
- Type defaults applied on selection.

### Phase 5 — Hybrid BVH + CPU Mesh
- Fixed-resolution raycast mesh (256x256).
- BVH tiling and refit per tile.
- Throttled GPU -> CPU sync.
- Optional debug raycast overlay.

Acceptance:
- Brush raycast remains responsive under sculpting.
- BVH refit latency <100ms typical.

### Phase 6 — Validation + Tooling
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
- Update README for new GUI, controls, workflows.

## Definition of Done
- WebGPU + TSL pipeline is the only render path in master.
- DI/Class single truth constraints enforced.
- Terrain GUI parity complete and documented.
- CPU BVH interaction mesh stable with refit.
- All tests and validation scripts pass.
