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
- Status: Pending
- Notes: WebGPURenderer base, NodeMaterial scaffolding.

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

## Detailed Progress Files

- progress/phase0-legacy-freeze.md
- progress/phase1-di-parity.md
- progress/phase2-webgpu-tsl-foundation.md
- progress/phase3-sim-pipeline-port.md
- progress/phase4-gui-parity.md
- progress/phase5-hybrid-bvh.md
- progress/phase6-validation-tooling.md
- progress/phase7-cleanup-docs.md
