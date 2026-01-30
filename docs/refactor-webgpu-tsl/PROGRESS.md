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
- Status: Pending
- Notes: ComputeNode passes for rain/flow/evap/sediment/thermal/lava.

### Phase 4 — Terrain Generation + GUI Parity
- Status: Pending
- Notes: Full GUI controls, defaults, Generate button, status line, error banner.

### Phase 5 — Hybrid BVH + CPU Mesh
- Status: Pending
- Notes: Fixed-resolution raycast mesh + tiled BVH refit.

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

## Detailed Progress Files

- progress/phase0-legacy-freeze.md
- progress/phase1-di-parity.md
- progress/phase2-webgpu-tsl-foundation.md
- progress/phase3-sim-pipeline-port.md
- progress/phase4-gui-parity.md
- progress/phase5-hybrid-bvh.md
- progress/phase6-validation-tooling.md
- progress/phase7-cleanup-docs.md
