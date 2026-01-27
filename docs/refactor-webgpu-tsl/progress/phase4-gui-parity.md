# Phase 4 — Terrain Generation + GUI Parity

## Status: Pending

## Goals
- Full GUI parity for terrain parameters and defaults.
- Generate Terrain button only (no auto-regenerate).
- Segments/simRes lock and heightmap import workflow.
- Status line + error banner.
- Full THREE.Terrain feature parity (methods, masks, smoothing, edges).
- Legacy terrain shader parity via BaseTerrainType + generateHeightmap options.

## Tasks
- [ ] Add TerrainSegments control + simRes lock.
- [ ] Add TerrainSize, ratio, steps, easing, smoothing, edges.
- [ ] Add Generate Terrain button gating.
- [ ] Apply type defaults via getDefaultParams().
- [ ] Implement heightmap auto-import and caching.
- [ ] Add status line and error banner.

## Requirements (Expanded)

### A) GUI Controls (THREE Terrain folder)
- TerrainBaseType list includes:
  - Legacy shader IDs 0–11 (OrdinaryFBM, DomainWarp, Terrace, Voronoi, RidgeNoise,
    BillowNoise, Turbulence, Craters, Dunes, Canyons, Mountains, BillowyRidges).
  - THREE.Terrain methods (DiamondSquare, Perlin, Simplex, Worley, Cosine, Fault,
    Feature, ParticleDeposition, Value, Weierstrass, Brownian, CosineLayers,
    PerlinDiamond, PerlinLayers, SimplexLayers, Hill, HillIsland).
- TerrainMask list is sourced from the mask registry (all masks).
- Basic controls:
  - TerrainEasing, TerrainSteps, TerrainTurbulent
  - TerrainSize, TerrainWidthLengthRatio, TerrainSegments
- Advanced controls:
  - TerrainSmoothing (Conservative/Gaussian/Mean/Median + variants)
  - TerrainEdgeType, TerrainEdgeDirection, TerrainEdgeCurve, TerrainEdgeDistance
- Generate Terrain button is the only regeneration trigger.
- Status line includes simres, segments, size, ratio, last error.
- Heightmap auto-import if heightmap type selected and no heightmap loaded.
- Custom lock toggle to prevent type defaults from auto-applying.

### B) BaseTerrainType + Terrain Type Classes
- BaseTerrainType exposes getDefaultParams() and generateHeightmap(options).
- All 12 legacy shader types implement getDefaultParams().
- All legacy shader types consume:
  - steps (octaves/iterations), turbulent (warp), easing (post-process),
    xSize/ySize scaling, edges, smoothing.
- ThreeTerrainWrapper types implement getDefaultParams() and pass through all
  advanced options to THREE.Terrain methods.

### C) Terrain Mask Classes
- Mask registry provides display names and IDs.
- Mask applicator supports applying masks to generated heightmaps for both
  legacy types and THREE.Terrain methods.
- GUI selection uses registry values (no hard-coded arrays).

### D) TerrainReadbackService Wiring
- Validate inputs (finite, >0).
- Map TerrainSize/ratio -> xSize/ySize.
- Apply easing, steps, turbulent.
- Apply edges and smoothing using THREE.Terrain filter signatures.
- Heightmap import caching + resampling to simRes.

### E) Three.Terrain Parity
- Ensure all THREE.Terrain generation options are exposed and passed through.
- Ensure smoothing names map to actual THREE.Terrain functions
  (e.g., GaussianBoxBlur, SmoothConservative, SmoothMedian).
- Ensure edge direction mapping matches THREE.Terrain expectations.

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
- [ ] All 17 THREE.Terrain methods generate without error.
- [ ] All 12 legacy shader types generate with new params wired.

## Verification
- [ ] `npm run test:ci`
- [ ] `npm run build`
- [ ] `npx tsc -p tsconfig.json --noEmit` (TS/TSX typecheck)
- [ ] MCP browser test (GUI flow + screenshots)
