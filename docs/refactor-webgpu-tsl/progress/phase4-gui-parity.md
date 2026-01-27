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

## Tests
- [ ] GUI changes update terrain only on Generate.
- [ ] Type defaults apply on selection.
