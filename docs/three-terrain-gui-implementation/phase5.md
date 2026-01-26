# Phase 5: Error Surfacing & UX Polish

**Status**: ⏳ Pending  
**Started**: TBD  
**Completed**: TBD

## Overview

Enhance error banner, add GUI status line, implement optional viewport overlay (gated on simHealthy), update README with layperson-friendly descriptions, and add acceptance criteria tests.

## Tasks

### 5.1 Enhance Error Banner

**File**: `src/three/integration.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Update error banner in `regenerateTerrain()` to include:
  - [ ] baseType
  - [ ] easing
  - [ ] segments
  - [ ] simres
  - [ ] size
  - [ ] ratio
  - [ ] min
  - [ ] max
  - [ ] range
- [ ] Clear banner on successful regeneration

**Notes**:
- Detailed error information helps debugging
- Banner should be visible and informative

---

### 5.2 Add GUI Status Line

**File**: `src/gui/gui-setup.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Add status line in "THREE Terrain" folder showing:
  - [ ] simres
  - [ ] segments
  - [ ] size
  - [ ] ratio
  - [ ] last error (if any) - mirrors banner when error
- [ ] Update status line on control changes
- [ ] Update status line after regeneration
- [ ] Show "Pending: [parameter name]" during debounce period

**Notes**:
- Status line provides real-time feedback
- Mirrors error banner for consistency

---

### 5.3 Optional Viewport Overlay

**File**: `src/three/integration.ts` or new overlay component

**Status**: ⏳ Pending

**Tasks**:
- [ ] **Gated on simHealthy**: Overlay "Simulation invalid (NaN/flat)" in viewport **only when `simHealthy = false`**
- [ ] Render as semi-transparent banner in top-left corner
- [ ] Hide overlay when `simHealthy = true` (don't show when simulation is valid)

**Notes**:
- Overlay provides visual feedback when simulation is unhealthy
- Must be gated to avoid false positives

---

### 5.4 Update README Documentation

**File**: `README.md`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Update "Terrain Generation" section with layperson-friendly descriptions
- [ ] Document new "THREE Terrain" GUI folder
- [ ] Document Generate Terrain button (replaces Reset Terrain)
- [ ] Document all new parameters with visual/functional explanations:
  - [ ] TerrainEasing (what it does visually)
  - [ ] TerrainSteps (detail level, not "octaves")
  - [ ] TerrainTurbulent (warped vs clean patterns)
  - [ ] TerrainSize (world-space size)
  - [ ] TerrainWidthLengthRatio (rectangular terrains)
  - [ ] TerrainSegments (mesh resolution)
  - [ ] Advanced parameters (smoothing, edges)
- [ ] Document type-specific defaults feature
- [ ] **Document getDefaultParams() location**: Note that default parameter tables live in terrain classes (single source of truth)
- [ ] Document workflow (no auto-regeneration, must click Generate Terrain)
- [ ] Update terrain type descriptions to mention which parameters work best with each type

**Notes**:
- README should be accessible to non-technical users
- Focus on what parameters do visually, not just technical specs

---

### 5.5 Add Acceptance Criteria Tests

**Status**: ⏳ Pending

**Tasks**:
- [ ] **Base Type Validation** (All THREE.Terrain Types):
  - [ ] Test all 17 THREE.Terrain method types generate valid terrain
  - [ ] Critical test cases: Hill, HillIsland, PerlinDiamond must pass
  - [ ] Each type should produce valid, non-flat terrain
  - [ ] If any THREE.Terrain type fails, investigate root cause (likely affects all types)
- [ ] **Resize Test**:
  - [ ] Change `TerrainSize=2048`, `ratio=0.5`
  - [ ] Verify terrainPP resized, plane segments updated (simres = segments+1), displacement visible
  - [ ] Verify render targets are recreated correctly
  - [ ] Verify geometry segments match simres
- [ ] **Parameter Toggle Test**:
  - [ ] Toggle `TerrainTurbulent` & `Steps`
  - [ ] Verify heightmap range changes (not flat)
  - [ ] Verify parameters actually affect terrain generation
- [ ] **Mask Change Test**:
  - [ ] Mask select changes output (log mask id)
  - [ ] Verify mask is applied correctly and logged
- [ ] **Headless Tests**:
  - [ ] Test multiple THREE.Terrain types (Hill, HillIsland, PerlinDiamond, DiamondSquare, Perlin) at simres=64
  - [ ] Assert min/max finite and range > 0.001 for each type
  - [ ] Run `npm run validate:height-parity` - should pass

**Notes**:
- Acceptance criteria must be comprehensive
- All THREE.Terrain types must be tested (not just specific ones)

---

## Test Results

### Manual Tests

- [ ] Test error banner shows detailed information
- [ ] Test status line updates correctly
- [ ] Test viewport overlay shows/hides based on simHealthy
- [ ] Test all acceptance criteria pass

### Issues Encountered

_None yet_

**Known Issues**:
- All THREE.Terrain types are currently erroring - investigate root cause

---

## Files Modified

- `src/three/integration.ts`
- `src/gui/gui-setup.ts`
- `README.md`
