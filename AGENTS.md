# Agent Instructions — WebGPU + TSL Refactor

This repository is migrating to a single WebGPU + TSL render pipeline.
Legacy WebGL/VTF and GLSL assets remain in a frozen legacy branch only.

## Project Goals
- One renderer: WebGPURenderer.
- One shading system: TSL/NodeMaterial.
- GPU-first simulation + visuals.
- CPU BVH for interaction (raycast, brushes).
- DI/Class-based single source of truth across services.

## Non‑Goals
- No new legacy WebGL/VTF features in master.
- No GLSL shader work in master (legacy branch only).
- No simulation-state globals in production code.

## Branching
- Active work branch: `feature/webgpu-tsl-pipeline`.
- Legacy branch: `legacy-webgl` (frozen, hotfix-only).
- Feature branches from pipeline branch:
  - `feat/tsl-materials`
  - `feat/compute-pass-erosion`
  - `feat/cpu-raycast-bvh`
  - `feat/gui-port`

## Architecture Rules
- Constructor injection only; no hidden globals.
- All mutable state in holders:
  - `SimulationStateHolder`, `TerrainStateHolder`, `ClientStateHolder`.
- Render targets owned by injectable services.
- Terrain/BVH ownership lives in `TerrainStateHolder`.
- Heightmap decode/encode contract is a single source of truth.

## Docs to Maintain
- `docs/refactor-webgpu-tsl/PLAN.md`
- `docs/refactor-webgpu-tsl/PROGRESS.md`
- `docs/refactor-webgpu-tsl/TESTING.md`
- `docs/refactor-webgpu-tsl/GIT_STRATEGY.md`

## Testing
- Use `npm run test:ci` (single-process).
- Add/maintain headless validation: height parity + readback checks.
- Use MCP browser tools for UI automation and screenshots.

