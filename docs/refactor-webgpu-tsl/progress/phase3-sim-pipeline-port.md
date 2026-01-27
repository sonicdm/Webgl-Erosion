# Phase 3 — Simulation Pipeline Port

## Status: In Progress

## Goals
- Port simulation passes to ComputeNode.
- Establish ping-pong heightmap targets in WebGPU.
- Adapt TerrainReadbackService to WebGPU targets.

## Tasks
- [x] Port rain pass to ComputeNode.
- [x] Port flow pass to ComputeNode.
- [x] Port evaporation pass to ComputeNode.
- [ ] Port sediment passes to ComputeNode. (Deferred - MRT requires multiple compute passes)
- [ ] Port thermal passes to ComputeNode. (Deferred - MRT requires multiple compute passes)
- [ ] Port lava passes to ComputeNode. (Deferred - complex physics)
- [x] Implement heightmap ping-pong targets in WebGPU path.
- [x] Update readback/health checks for WebGPU.

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
- [x] One sim step produces non-flat heightmap. (Rain + Flow + Evaporation passes working)
- [x] Readback health checks pass. (WebGPU readback implemented)

## Verification
- [x] `npm run test:ci` (Passes - infrastructure tests complete)
- [x] `npm run build` (Builds successfully)
- [x] `npx tsc -p tsconfig.json --noEmit` (TS/TSX typecheck passes)
- [x] MCP browser test (Simulation runs, terrain renders via WebGL2 bridge)

## Implementation Notes
- Core simulation passes (rain, flow, evaporation) are fully implemented and working
- WebGPU texture pool with ping-pong swapping is complete
- WebGPU readback service is implemented
- MRT passes (sediment, thermal, water height, average) are deferred - WebGPU compute shaders don't support MRT natively, requiring multiple passes or different architecture
- WebGL2 fallback removed - WebGPU is now required for simulation
- Rendering still uses WebGL2 (Phase 4+ will port rendering to WebGPU)
