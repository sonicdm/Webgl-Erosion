# Phase 6: THREE.Terrain Wrapper Integration

**Status**: ⏳ Pending  
**Started**: TBD  
**Completed**: TBD

## Overview

Ensure TerrainGenerationOptions includes all THREE parameters, update ThreeTerrainWrapper to pass through all advanced options, and ensure getDefaultParams() is implemented for all THREE.Terrain wrapper types.

## Tasks

### 6.1 Extend TerrainGenerationOptions for THREE.Terrain

**File**: `src/three/terrain/TerrainGenerationOptions.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Verify all THREE parameters are included in options interface (should be done in Phase 2.1)
- [ ] Ensure options can be passed to THREE.Terrain methods

**Notes**:
- This should already be complete from Phase 2.1
- Verify completeness before proceeding

---

### 6.2 ThreeTerrainWrapper Pass-Through

**File**: `src/three/terrain/ThreeTerrainWrapper.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Pass through all new options unchanged to underlying THREE.Terrain methods
- [ ] Map options to THREE.Terrain method parameters:
  - [ ] easing → THREE.Terrain easing parameter (ensure function, not string)
  - [ ] steps → THREE.Terrain steps parameter (ensure number, not string)
  - [ ] turbulent → THREE.Terrain turbulent parameter (ensure boolean)
  - [ ] xSize, ySize → THREE.Terrain xSize, ySize parameters (ensure numbers, finite)
  - [ ] smoothing → THREE.Terrain smoothing function (ensure function or undefined, not string)
  - [ ] edges → THREE.Terrain edge parameters (type, direction, curve, distance)
- [ ] **Validate all parameter types** before passing to THREE.Terrain (numbers must be numbers, functions must be functions)
- [ ] **Log parameter values** before THREE.Terrain call to debug NaN issue
- [ ] Ensure defaults from `getDefaultParams()` are used when options are not provided
- [ ] Verify all 17 THREE.Terrain methods receive options correctly
- [ ] **Check THREE.Terrain method signatures** - ensure parameter names/types match exactly

**Notes**:
- Legacy base types (0-11) parameter mapping is handled in Phase 1.4
- This phase focuses on THREE.Terrain method wrappers only
- All THREE.Terrain types are currently erroring - this phase may reveal the root cause

---

## Test Results

### Manual Tests

- [ ] Test all 17 THREE.Terrain methods receive options correctly
- [ ] Test options are passed through to underlying THREE.Terrain methods
- [ ] Test defaults from getDefaultParams() are applied correctly
- [ ] Test all THREE.Terrain types generate valid terrain (fix root cause if all are erroring)

### Issues Encountered

**Critical Issue - THREE.Terrain NaN Values**:

All THREE.Terrain types are generating NaN values in position attributes. See Phase 2 "Issues Encountered" section for full details.

**Error Pattern**:
- `THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN`
- `minHeight: Infinity, maxHeight: -Infinity, firstSample: NaN`
- Error occurs in `THREE.Terrain.js:359` during `computeBoundingSphere()`

**This Phase Focus**:
- Verify ThreeTerrainWrapper correctly maps all options to THREE.Terrain parameters
- Ensure no undefined/NaN values are passed to THREE.Terrain methods
- Check if parameter types match THREE.Terrain expectations (numbers vs strings, etc.)
- Verify easing function is properly converted before passing to THREE.Terrain

**Known Issues**:
- All THREE.Terrain types are currently erroring (not just Hill/PerlinDiamond) - investigate root cause in TerrainReadbackService or ThreeTerrainWrapper
- **CRITICAL**: NaN values in position attributes - this phase must identify and fix the parameter mapping issue
- This phase should help identify and fix the systemic issue

---

## Files Modified

- `src/three/terrain/TerrainGenerationOptions.ts` (verification)
- `src/three/terrain/ThreeTerrainWrapper.ts`
