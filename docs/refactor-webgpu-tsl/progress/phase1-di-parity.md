# Phase 1 — DI/Class-Based Parity

## Status: Pending

## Goals
- Carry DI/class-based single truth fixes into the WebGPU pipeline branch.
- Remove simulation-state imports in master.
- Ensure holders and injected services are the only state access.

## Tasks
- [ ] Port DI adoption changes from refactor/base-terrain-architecture.
- [ ] Verify Three runtime is fully dependency-injected.
- [ ] Ensure TerrainStateHolder owns BVH/geometry.
- [ ] Remove legacy-only services from master path.

## Tests
- [ ] DI smoke test passes (`npm run test:ci`).
- [ ] No production imports of simulation-state.
