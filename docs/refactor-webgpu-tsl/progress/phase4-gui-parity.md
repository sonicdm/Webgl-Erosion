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

#### Class Implementation Details (Specific)

**1) BaseTerrainType (interface + common helpers)**
- File: `src/three/terrain/BaseTerrainType.ts`
- Keep it abstract, but add **small helper utilities** in a `TerrainTypeUtils`
  module to avoid copy/paste in each subclass:
  - `applyEasing(z: number, easing?: (t:number)=>number): number`
  - `applyEdges(zs: Float32Array, options: TerrainGenerationOptions, edges: EdgeOptions): void`
  - `applySmoothing(zs: Float32Array, options: TerrainGenerationOptions, smoothing: string): void`
- `generateHeightmap()` should *only* fill `zs`; all post-process steps (edges,
  smoothing, easing) should run in a **shared post-process pipeline** called by
  the generator wrapper, not repeated in every subclass.

**2) TerrainGenerationOptions (single payload)**
- File: `src/three/terrain/TerrainGenerationOptions.ts`
- Ensure it contains:
  - `xSegments`, `ySegments`, `xSize`, `ySize`
  - `terrainSteps`, `terrainTurbulent`, `easing`
  - `terrainSmoothing`, `terrainEdgeType`, `terrainEdgeDirection`,
    `terrainEdgeCurve`, `terrainEdgeDistance`
- Ensure this object is the *only* options input to all terrain types.

**3) Legacy Shader Types (0–11)**
- Files: `src/three/terrain/types/*.ts`
- Pattern for each class:
  1. Read `xSegments/ySegments` and compute `xl = xSegments + 1` once.
  2. Compute `scaleX = xSize / 1024.0`, `scaleY = ySize / 1024.0`.
  3. Compute base noise using `terrainSteps` for octave count.
  4. If `terrainTurbulent`, add domain warp (reuse existing warp helpers).
  5. Write raw heights into `zs` (no edges/smoothing here).
  6. Return; caller applies post-process pipeline.

**4) THREE.Terrain Wrapper Classes**
- File: `src/three/terrain/ThreeTerrainWrapper.ts`
- For each wrapper:
  - Build `threeTerrainOptions` using `xSegments`, `ySegments`, `xSize`, `ySize`,
    `steps`, `turbulent`, `frequency`, `easing`, `after`.
  - `after` should chain edges + smoothing **once** using a shared callback:
    - `after(vertices, options)` -> edges -> smoothing -> clamp.

**5) Terrain Type Registry**
- File: `src/three/terrain/terrain-type-registry.ts`
- Ensure registry resolves both:
  - numeric IDs (0–11) for legacy shader types
  - string names for THREE.Terrain methods
- Provide `getDefaultParams()` access for GUI.

**6) Terrain Masks**
- File: `src/three/terrain/mask-registry.ts` + `MaskApplicator`
- `MaskApplicator.applyMask()` must accept:
  - `zs` (Float32Array)
  - mask id
  - `TerrainGenerationOptions`
- Apply mask after generator output and before upload.

**7) Heightmap Pipeline (Single Post-Process)**
- Create a dedicated function:
  - `runTerrainPostProcessingPipeline(zs, options)`:
    - easing (per-sample, if needed)
    - edges (box/radial)
    - smoothing (conservative/gaussian/mean/median)
    - mask (if TerrainMask > 0)
- Call it in **one place** (TerrainReadbackService).

**8) Edge + Smoothing Mapping**
- Centralize GUI -> internal mappings in a helper:
  - File: `src/three/terrain/TerrainFilterMapper.ts`
  - Map GUI strings to actual THREE.Terrain filter names:
    - GaussianBox -> GaussianBoxBlur
    - Conservative -> SmoothConservative
    - Median -> SmoothMedian
  - Map edge direction to THREE.Terrain signature (boolean):
    - Up -> true, Down/Normal -> false.
  - Export a single function used by GUI + TerrainReadbackService.

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

### F) Source of Truth for Features (Local Reference)
- Use the local THREE.Terrain source under:
  - `E:\Scripts\Webgl-Erosion\research\THREE.Terrain`
- Primary reference files:
  - `research/THREE.Terrain/src/*.js` (core generators, filters, edges, smoothing)
  - `research/THREE.Terrain/demo/index.js` (demo defaults and UI behavior)
- When adding a feature, link it to:
  - the specific function in `src/` (e.g., filters.js for edges/smoothing)
  - and the demo usage in `demo/index.js` if applicable

### G) Error Surface Fields
- Ensure GUI lastError string includes:
  - baseType, steps, smoothing, edgeType/Direction/Curve/Distance, mask id
  - min/max/range after generation

### H) SimRes Lock Tooltip
- Add a UI hint explaining why `segments + 1 = simRes`.

### I) Mask Import Fallback
- If selected mask type has no mask data, disable Generate button and show tooltip.

## Pre-Merge Validation Checklist

- [ ] GUI param state updates correctly
- [ ] Param change does NOT auto-update terrain
- [ ] Generate Terrain triggers pipeline
- [ ] All types run without exception
- [ ] Easing/edges/smoothing applied only once
- [ ] Legacy filters map correctly
- [ ] `npm run test:ci`, `npm run build`, `npx tsc -p tsconfig.json --noEmit` pass

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
