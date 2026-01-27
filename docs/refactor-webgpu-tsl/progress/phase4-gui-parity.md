# Phase 4 — Terrain Generation + GUI Parity

## Status: Pending

## Goals
- Full GUI parity for terrain parameters and defaults.
- Generate Terrain button only (no auto-regenerate).
- Segments/simRes lock and heightmap import workflow.
- Status line + error banner.

## Tasks
- [ ] Add TerrainSegments control + simRes lock.
- [ ] Add TerrainSize, ratio, steps, easing, smoothing, edges.
- [ ] Add Generate Terrain button gating.
- [ ] Apply type defaults via getDefaultParams().
- [ ] Implement heightmap auto-import and caching.
- [ ] Add status line and error banner.

## Git Procedures
1) Branch from pipeline:
   ```powershell
   git checkout feature/webgpu-tsl-pipeline
   git pull
   git checkout -b feat/gui-port
   ```
2) Commit GUI changes separately from terrain generation wiring.
3) Merge back into `feature/webgpu-tsl-pipeline` after MCP browser tests.

## Tests
- [ ] GUI changes update terrain only on Generate.
- [ ] Type defaults apply on selection.

## Verification
- [ ] `npm run test:ci`
- [ ] `npm run build`
- [ ] `npx tsc -p tsconfig.json --noEmit` (TS/TSX typecheck)
- [ ] MCP browser test (GUI flow + screenshots)
