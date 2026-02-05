# Phase 1: Legacy Base Types + THREE Parameters Integration

**Status**: ⏳ Pending  
**Started**: TBD  
**Completed**: TBD

## Overview

Implement THREE parameters into legacy base types (0-11) with type-specific defaults, create GUI controls, and wire parameter mapping.

## Tasks

### 1.1 Extend SimulationParams

**File**: `src/app/dto/SimulationParams.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Add `TerrainEasing: string` field (default: 'Linear')
- [ ] Add `TerrainSteps: number` field (default: 1)
- [ ] Add `TerrainTurbulent: boolean` field (default: false)
- [ ] Add `TerrainSize: number` field (default: 1024)
- [ ] Add `TerrainWidthLengthRatio: number` field (default: 1.0)
- [ ] Add `TerrainSegments: number` field (default: computed as simres - 1 in factory)
- [ ] Add `TerrainSmoothing: string` field (default: 'None')
- [ ] Add `TerrainEdgeType: 'Box' | 'Radial'` field (default: 'Box')
- [ ] Add `TerrainEdgeDirection: 'Normal' | 'Up' | 'Down'` field (default: 'Normal')
- [ ] Add `TerrainEdgeCurve: 'Linear' | 'EaseIn' | 'EaseOut' | 'EaseInOut'` field (default: 'Linear')
- [ ] Add `TerrainEdgeDistance: number` field (default: 256)
- [ ] Update `createSimulationParams()` to include defaults for all new fields

**Notes**:
- Defaults are fallback values; actual defaults come from `getDefaultParams()` per terrain type

---

### 1.2 Add getDefaultParams() to BaseTerrainType

**File**: `src/three/terrain/BaseTerrainType.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Add abstract method `getDefaultParams()` with return type:
  ```typescript
  {
    easing?: string;
    steps?: number;
    turbulent?: boolean;
    size?: number;
    ratio?: number;
    smoothing?: string;
    edges?: { type?: string; direction?: string; curve?: string; distance?: number };
    frequency?: number;
  }
  ```
- [ ] Add documentation comment noting that getDefaultParams() tables live in terrain classes (single source of truth)

**Notes**:
- This is the single source of truth for GUI defaults
- GUI pulls defaults from registry, which queries each terrain type's `getDefaultParams()` method

---

### 1.3 Implement Type-Specific Defaults for Legacy Base Types

**Files**: `src/three/terrain/types/*.ts` (all 12 shader-based terrain types)

**Status**: ⏳ Pending

**Tasks**:
- [ ] Implement `getDefaultParams()` in `OrdinaryFBMTerrainType.ts` (Type 0)
  - steps: 8, turbulent: false, easing: 'Linear', smoothing: 'None'
- [ ] Implement `getDefaultParams()` in `DomainWarpTerrainType.ts` (Type 1)
  - steps: 4, turbulent: true, easing: 'EaseOut', smoothing: 'None'
- [ ] Implement `getDefaultParams()` in `TerraceTerrainType.ts` (Type 2)
  - steps: 6, turbulent: false, easing: 'Linear', smoothing: 'Conservative 0.5'
- [ ] Implement `getDefaultParams()` in `VoronoiTerrainType.ts` (Type 3)
  - steps: 1, turbulent: false, easing: 'Linear', smoothing: 'Gaussian 0.5,7'
- [ ] Implement `getDefaultParams()` in `RidgeNoiseTerrainType.ts` (Type 4)
  - steps: 6, turbulent: false, easing: 'EaseIn', smoothing: 'None'
- [ ] Implement `getDefaultParams()` in `BillowNoiseTerrainType.ts` (Type 5)
  - steps: 5, turbulent: false, easing: 'EaseOut', smoothing: 'Mean 1'
- [ ] Implement `getDefaultParams()` in `TurbulenceTerrainType.ts` (Type 6)
  - steps: 7, turbulent: true, easing: 'EaseInOut', smoothing: 'None'
- [ ] Implement `getDefaultParams()` in `CratersTerrainType.ts` (Type 7)
  - steps: 4, turbulent: false, easing: 'EaseIn', smoothing: 'Gaussian 1.0,7'
- [ ] Implement `getDefaultParams()` in `DunesTerrainType.ts` (Type 8)
  - steps: 3, turbulent: false, easing: 'EaseOut', smoothing: 'Mean 1', ratio: 1.5
- [ ] Implement `getDefaultParams()` in `CanyonsTerrainType.ts` (Type 9)
  - steps: 5, turbulent: false, easing: 'EaseIn', smoothing: 'Conservative 1'
- [ ] Implement `getDefaultParams()` in `MountainsTerrainType.ts` (Type 10)
  - steps: 8, turbulent: false, easing: 'EaseInOut', smoothing: 'Gaussian 0.5,7'
- [ ] Implement `getDefaultParams()` in `BillowyRidgesTerrainType.ts` (Type 11)
  - steps: 6, turbulent: false, easing: 'EaseOut', smoothing: 'Mean 1'

**Notes**:
- Defaults are based on what each algorithm does best
- Edge defaults (all types): type: 'Box', direction: 'Normal', curve: 'Linear', distance: 256

---

### 1.4 Map THREE Parameters to Legacy Shader Types

**Files**: `src/three/terrain/types/*.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Update `generateHeightmap()` in all 12 legacy types to use THREE parameters from options:
  - [ ] **steps**: Map to octave count in FBM-based types (0, 2, 7, 8, 9, 10). For non-FBM types, use steps to control iteration count or feature density
  - [ ] **turbulent**: For FBM types, if `turbulent=true`, add domain warping or turbulence. For already-turbulent types (1, 6), enhance the effect
  - [ ] **easing**: Apply easing function to height values as post-process (after base generation, before height scaling)
  - [ ] **xSize/ySize**: Use to scale world-space coordinates (`cpos`) when generating noise. Map `xSize`/`ySize` directly to coordinate scaling
  - [ ] **edges**: Apply edge falloff as post-process using `MaskApplicator` or new edge utility (radial/box falloff based on `edgeType`)
  - [ ] **smoothing**: Apply smoothing as post-process using existing smoothing utilities (Gaussian/Mean/Conservative) based on `smoothing` string

**Notes**:
- Parameters should be ignored safely if they don't apply to a particular type
- Maintain backward compatibility when advanced params are absent

---

### 1.5 Create THREE Terrain GUI Folder

**File**: `src/gui/gui-setup.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Create new dat.GUI folder "THREE Terrain"
- [ ] Add `TerrainBaseType` select: shader IDs 0-11 + THREE methods
- [ ] Add `TerrainMask` select: from mask registry
- [ ] Add `TerrainEasing` select: ['Linear', 'EaseIn', 'EaseOut', 'EaseInOut', 'InEaseOut']
- [ ] Add `TerrainSegments` slider: 7-127 (int) with debounce (300-500ms)
- [ ] Add `TerrainSteps` slider: 1-8 (int)
- [ ] Add `TerrainTurbulent` checkbox
- [ ] Add `TerrainSize` slider: 512-4096, step 256 with debounce (300-500ms)
- [ ] Add `TerrainWidthLengthRatio` slider: 0.2-2.0, step 0.05
- [ ] Add advanced subfolder (collapsible, default closed) with:
  - [ ] `TerrainSmoothing` select
  - [ ] `TerrainEdgeType` select
  - [ ] `TerrainEdgeDirection` select
  - [ ] `TerrainEdgeCurve` select
  - [ ] `TerrainEdgeDistance` slider
- [ ] Replace "Reset Terrain" with "Generate Terrain" button
- [ ] All controllers use `onChange` to mark "pending changes" (update displayed values only)
- [ ] Only "Generate Terrain" button calls `threeRuntime.regenerateTerrain(controls)`
- [ ] Add status line showing: simres, segments, size, ratio, last error (if any)
- [ ] On `TerrainBaseType` selection change:
  - [ ] Call `registry.get(selectedType).getDefaultParams()`
  - [ ] Apply defaults to GUI controls (unless "custom lock" checkbox is enabled)
  - [ ] Update status line to show "Using defaults for [Type Name]"
  - [ ] If "heightmap" selected and no heightmap loaded, auto-trigger import dialog
- [ ] Add debounce for `TerrainSegments`, `SimulationResolution`, `TerrainSize` (300-500ms)
- [ ] Status line shows "Pending: [parameter name]" during debounce period

**Notes**:
- Debounce prevents render target thrashing while sliding
- Heightmap auto-import provides smooth workflow

---

### 1.6 Segments/Simres Lock

**Files**: `src/gui/gui-setup.ts`, `src/three/integration.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Changing `TerrainSegments` forces `SimulationResolution = segments + 1`
- [ ] Changing `SimulationResolution` forces `TerrainSegments = simres - 1`
- [ ] Prevent divergence; log warning if mismatch detected

**Notes**:
- Ensures segments and simres stay in sync

---

## Test Results

### Manual Tests

- [ ] Test all 12 legacy base types generate valid terrain
- [ ] Test type-specific defaults are applied correctly
- [ ] Test GUI controls update correctly
- [ ] Test debounce prevents thrashing
- [ ] Test segments/simres lock works
- [ ] Test heightmap auto-import triggers correctly

### Issues Encountered

_None yet_

---

## Files Modified

- `src/app/dto/SimulationParams.ts`
- `src/three/terrain/BaseTerrainType.ts`
- `src/three/terrain/types/OrdinaryFBMTerrainType.ts`
- `src/three/terrain/types/DomainWarpTerrainType.ts`
- `src/three/terrain/types/TerraceTerrainType.ts`
- `src/three/terrain/types/VoronoiTerrainType.ts`
- `src/three/terrain/types/RidgeNoiseTerrainType.ts`
- `src/three/terrain/types/BillowNoiseTerrainType.ts`
- `src/three/terrain/types/TurbulenceTerrainType.ts`
- `src/three/terrain/types/CratersTerrainType.ts`
- `src/three/terrain/types/DunesTerrainType.ts`
- `src/three/terrain/types/CanyonsTerrainType.ts`
- `src/three/terrain/types/MountainsTerrainType.ts`
- `src/three/terrain/types/BillowyRidgesTerrainType.ts`
- `src/gui/gui-setup.ts`
- `src/three/integration.ts`
