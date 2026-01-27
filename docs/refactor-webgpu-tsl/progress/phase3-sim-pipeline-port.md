# Phase 3 — Simulation Pipeline Port

## Status: Pending

## Goals
- Port simulation passes to ComputeNode.
- Establish ping-pong heightmap targets in WebGPU.
- Adapt TerrainReadbackService to WebGPU targets.

## Tasks
- [ ] Port rain pass to ComputeNode.
- [ ] Port flow pass to ComputeNode.
- [ ] Port evaporation pass to ComputeNode.
- [ ] Port sediment passes to ComputeNode.
- [ ] Port thermal passes to ComputeNode.
- [ ] Port lava passes to ComputeNode.
- [ ] Implement heightmap ping-pong targets in WebGPU path.
- [ ] Update readback/health checks for WebGPU.

## Git Procedures
1) Branch from pipeline:
   ```powershell
   git checkout feature/webgpu-tsl-pipeline
   git pull
   git checkout -b feat/compute-pass-erosion
   ```
2) Commit per domain (rain/flow/evap/sediment/thermal/lava).
3) Merge back into `feature/webgpu-tsl-pipeline` after tests pass.

## Tests
- [ ] One sim step produces non-flat heightmap.
- [ ] Readback health checks pass.

## Verification
- [ ] `npm run test:ci`
- [ ] `npm run build`
- [ ] `npx tsc -p tsconfig.json --noEmit` (TS/TSX typecheck)
- [ ] MCP browser test (sim step visual)
