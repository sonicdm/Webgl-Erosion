# Phase 5 — Hybrid BVH + CPU Mesh

## Status: Pending

## Goals
- Fixed-resolution CPU raycast mesh (e.g., 256x256).
- BVH tiling and refit per tile.
- Throttled GPU -> CPU sync.
- Optional debug raycast overlay.

## Tasks
- [ ] Build CPU raycast mesh from height buffer.
- [ ] Split into tiles and build BVH per tile.
- [ ] Track dirty tiles from brush edits.
- [ ] Refit BVH for touched tiles only.
- [ ] Add debug raycast overlay toggle.

## Git Procedures
1) Branch from pipeline:
   ```powershell
   git checkout feature/webgpu-tsl-pipeline
   git pull
   git checkout -b feat/cpu-raycast-bvh
   ```
2) Commit raycast mesh, BVH tiling, and refit separately.
3) Merge back into `feature/webgpu-tsl-pipeline` after perf checks.

## Tests
- [ ] Raycast remains responsive under heavy sculpting.
- [ ] BVH refit latency <100ms typical.

## Verification
- [ ] `npm run test:ci`
- [ ] `npm run build`
- [ ] `npx tsc -p tsconfig.json --noEmit` (TS/TSX typecheck)
- [ ] MCP browser test (raycast overlay)
