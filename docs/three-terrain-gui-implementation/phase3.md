# Phase 3: Binding + Ping-Pong Freshness

**Status**: ⏳ Pending  
**Started**: TBD  
**Completed**: TBD

## Overview

Expose write texture getters, update material binding to use current write textures every frame, handle simres changes, and make decode contract explicit.

## Tasks

### 3.1 Expose Write Texture Getters

**File**: `src/three/simulation/SimulationPassManager.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Add `getTerrainTexture(): THREE.Texture` method (returns current write target from terrainPP)
- [ ] Add `getSedimentTexture(): THREE.Texture` method (returns current write target from sedimentPP)
- [ ] Ensure getters return the current write target (not read target)

**Notes**:
- These getters provide access to the freshest simulation textures
- Used by material binding to ensure textures are up-to-date

---

### 3.2 Update Material Binding

**File**: `src/three/integration.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] In `render()` method:
  - [ ] Rebind `u_Heightmap` every frame to `passManager.getTerrainTexture()`
  - [ ] Rebind `u_Sediment` every frame to `passManager.getSedimentTexture()`
  - [ ] Ensure `UseSimHeightmap=true` path never falls back to CPU texture when sim texture exists

**File**: `src/three/terrain/TerrainSync.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] In `updateMaterialUniforms()` method:
  - [ ] Bind current write textures from pass manager
  - [ ] **Decode Contract**: Update `u_HeightDecodeScale = 1/simres` on simres change
  - [ ] Document decode contract in code comments:
    - Stored height = `worldHeight * simres`
    - Shader uses `u_HeightDecodeScale = 1/simres` to decode
  - [ ] Ensure contract is maintained when simres changes

**Notes**:
- Decode contract must be explicit and validated
- Material uniforms must be updated every frame for real-time terraforming

---

### 3.3 Handle Simres Changes

**Files**: `src/three/simulation/SimulationPassManager.ts`, `src/three/terrain/TerrainSync.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] When simres changes, call `setSimRes(newSimres)` on pass manager
- [ ] Recreate render targets (terrainPP, sedimentPP, etc.) on simres change
- [ ] Update `PlaneGeometry` segments to `simres - 1` in `TerrainSync`
- [ ] Set `u_HeightDecodeScale = 1/simres` after resize
- [ ] Ensure all textures are properly recreated and bound

**Notes**:
- Simres changes require full render target recreation
- Geometry segments must match simres exactly

---

## Test Results

### Manual Tests

- [ ] Test material textures update every frame
- [ ] Test decode contract holds across different simres values
- [ ] Test simres changes recreate render targets correctly
- [ ] Test geometry segments update with simres
- [ ] Test `u_HeightDecodeScale` updates correctly
- [ ] Test UseSimHeightmap path doesn't fall back to CPU texture

### Issues Encountered

_None yet_

---

## Files Modified

- `src/three/simulation/SimulationPassManager.ts`
- `src/three/integration.ts`
- `src/three/terrain/TerrainSync.ts`
