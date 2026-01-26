# Phase 2: Generation Wiring & Guards

**Status**: ⏳ Pending  
**Started**: TBD  
**Completed**: TBD

## Overview

Extend TerrainGenerationOptions, wire new parameters into TerrainReadbackService, implement heightmap caching workflow, and add getDefaultParams() for THREE.Terrain wrapper types.

## Tasks

### 2.1 Extend TerrainGenerationOptions

**File**: `src/three/terrain/TerrainGenerationOptions.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Add `terrainEasing: string` field
- [ ] Add `terrainSize: number` field
- [ ] Add `terrainWidthLengthRatio: number` field
- [ ] Add `terrainSmoothing: string` field
- [ ] Add `terrainEdgeType: 'Box' | 'Radial'` field
- [ ] Add `terrainEdgeDirection: 'Normal' | 'Up' | 'Down'` field
- [ ] Add `terrainEdgeCurve: 'Linear' | 'EaseIn' | 'EaseOut' | 'EaseInOut'` field
- [ ] Add `terrainEdgeDistance: number` field

**Notes**:
- These fields are passed to all terrain types (legacy and THREE.Terrain)

---

### 2.2 Wire Parameters into TerrainReadbackService

**File**: `src/three/simulation/io/TerrainReadbackService.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Update `generateTerrain()` to:
  - [ ] Compute `segments = controls.TerrainSegments ?? (this.simres - 1)`
  - [ ] If `segments + 1 != simres`, log warning and set `segments = simres - 1`
  - [ ] Set `xSize = TerrainSize`, `ySize = TerrainSize * TerrainWidthLengthRatio`
  - [ ] Set `steps = TerrainSteps`, `turbulent = TerrainTurbulent`, `easing = getEasing(TerrainEasing)`
  - [ ] **Validate all parameters before passing to THREE.Terrain**: ensure no NaN, undefined, or invalid values
  - [ ] **Log all parameters** passed to THREE.Terrain() for debugging NaN issue
  - [ ] Apply edges: use `THREE.Terrain.Edges` or `RadialEdges` per `EdgeType/Direction/Distance/Curve`
  - [ ] Apply smoothing if `TerrainSmoothing != 'None'` (map names to THREE.Terrain smoothing functions)
  - [ ] If smoothing returns NaN/Inf, throw with smoothing name
  - [ ] Validate inputs: all finite, `segments > 1`, `size > 0`, `ratio > 0`, `steps >= 1`
  - [ ] Throw before calling THREE.Terrain on invalid
  - [ ] **After THREE.Terrain call, validate geometry**: check position attributes for NaN before proceeding

**Notes**:
- Validation prevents invalid terrain generation
- Smoothing errors should be caught and reported clearly

---

### 2.3 Implement getDefaultParams for THREE.Terrain Wrapper Types

**File**: `src/three/terrain/ThreeTerrainWrapper.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Implement `getDefaultParams()` for all THREE.Terrain method wrappers
- [ ] Use reasonable defaults based on each method's characteristics:
  - [ ] DiamondSquare: steps=4
  - [ ] Hill: steps=6
  - [ ] HillIsland: steps=6
  - [ ] PerlinDiamond: steps=5
  - [ ] (Add defaults for all 17 THREE.Terrain methods)
- [ ] Defaults should match research demo where applicable

**Notes**:
- Each THREE.Terrain method may have different ideal defaults
- Research demo values should be used as reference

---

### 2.4 Implement Heightmap Import Workflow

**File**: `src/three/simulation/io/TerrainReadbackService.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Add `cachedHeightmapImage: CanvasImageSource | null` field to store cached heightmap
- [ ] When loading external heightmap image:
  - [ ] Resample to current simres/segments (upscale/downscale as needed)
  - [ ] Investigate `THREE.Terrain.fromHeightmap` interpolation
  - [ ] If insufficient, perform explicit resampling to simres x simres before upload
  - [ ] **Force `TerrainBaseType = 'heightmap'`** automatically after successful import
  - [ ] **Cache the image** in `cachedHeightmapImage`
- [ ] Subsequent "Generate Terrain" uses cached heightmap with updated parameters
- [ ] **Clear cache** when:
  - [ ] `TerrainBaseType` changes away from 'heightmap' (detect in onChange handler)
  - [ ] User clicks "Clear Heightmap" button
- [ ] Add method `clearHeightmapCache()` to clear cached image
- [ ] Add method `getCachedHeightmap()` to retrieve cached image

**Notes**:
- Caching prevents re-importing the same heightmap
- Auto-setting base type provides better UX
- Cache clearing prevents stale data

---

## Test Results

### Manual Tests

- [ ] Test all THREE.Terrain types generate valid terrain (all 17 methods)
- [ ] Test heightmap import forces base type to 'heightmap'
- [ ] Test heightmap caching works correctly
- [ ] Test cache clearing on base type change
- [ ] Test cache clearing on "Clear Heightmap" action
- [ ] Test parameter validation catches invalid inputs
- [ ] Test smoothing error handling

### Issues Encountered

**Critical Issue - THREE.Terrain NaN Values**:

All THREE.Terrain types are generating NaN values in position attributes, causing:
- `THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.`
- HeightmapSource stats show: `minHeight: Infinity, maxHeight: -Infinity, firstSample: NaN`
- Error: `[Terrain Generation] Invalid heightmap (NaN/Inf). baseType=<Type>, type=<Type>`

**Error Stack**:
```
THREE.Terrain.js:359 (computeBoundingSphere)
THREE.Terrain.js:318 (terrain generation)
TerrainReadbackService.ts:203 (generateTerrain)
```

**Affected Types**: All THREE.Terrain methods (Simplex, Hill, HillIsland, PerlinDiamond, etc.)

**Root Cause Hypothesis**:
- THREE.Terrain may be receiving invalid parameters (NaN, undefined, or incorrect types)
- Options may not be properly mapped to THREE.Terrain method signatures
- Heightmap extraction may be reading from wrong geometry attribute (Z vs Y)
- THREE.Terrain may be generating geometry in wrong plane/orientation

**Investigation Steps**:
1. Log all parameters passed to THREE.Terrain() call
2. Verify options object structure matches THREE.Terrain expectations
3. Check if geometry extraction reads correct attribute (Z for XY-plane terrain)
4. Verify THREE.Terrain library version compatibility
5. Check if easing/steps/turbulent parameters are causing NaN in THREE.Terrain internals

**Known Issues**:
- All THREE.Terrain types are currently erroring (not just Hill/PerlinDiamond) - investigate root cause in TerrainReadbackService or ThreeTerrainWrapper
- **CRITICAL**: NaN values in position attributes - must fix before Phase 2 completion

---

## Files Modified

- `src/three/terrain/TerrainGenerationOptions.ts`
- `src/three/simulation/io/TerrainReadbackService.ts`
- `src/three/terrain/ThreeTerrainWrapper.ts`
- `src/gui/gui-setup.ts` (for cache clearing on base type change)
