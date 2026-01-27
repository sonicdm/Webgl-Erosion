# Phase 4: GPU Readback Health + Parity Tests

**Status**: ⏳ Pending  
**Started**: TBD  
**Completed**: TBD

## Overview

Create readback utility, add health checks, implement height parity validation with decode contract assertion, and create headless validation script.

## Tasks

### 4.1 Create Readback Utility

**New File**: `src/three/utils/heightmap-readback.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Create utility class/service
- [ ] Implement `readHeightmapMinMax(texture: THREE.Texture, simres: number, patchSize?: number): Promise<{ min: number; max: number; range: number; stats: {...} }>`
- [ ] Reads small patch (default 4x4) from active height texture
- [ ] Computes min/max/range
- [ ] Returns stats: `{ frame?, width, height, decodeScale, min, max, range }`
- [ ] Handles FloatType texture readback correctly

**Notes**:
- FloatType textures require special handling for readback
- Small patch size (4x4) is sufficient for health checks

---

### 4.2 Add Health Checks

**File**: `src/three/simulation/io/TerrainReadbackService.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] After `generateTerrain()`:
  - [ ] Call readback utility on active height texture (combined-height-readback)
  - [ ] If min/max non-finite or `(max - min < 1e-5)`: set `simHealthy = false`, throw in `regenerateTerrain`, do NOT log success
  - [ ] Log readback stats

**File**: `src/three/integration.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Add optional throttled readback every N frames in debug mode
- [ ] Store `simHealthy` flag
- [ ] Gate "ready" logs when `simHealthy = false`

**Notes**:
- Health checks prevent invalid terrain from being used
- Throttled readback in debug mode helps catch issues during simulation

---

### 4.3 Height Parity Validation

**New File**: `src/three/utils/height-parity-validator.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Create height debug material that outputs sampled height (normalized to [0,1]) to color
- [ ] Implement parity test procedure:
  1. Read 4×4 block from terrain texture (GPU readback)
  2. Render one frame with height debug material
  3. Read corresponding 4×4 pixels from framebuffer
  4. Compare values within epsilon (1e-4). If mismatch, fail.
- [ ] **Decode Contract Validation**:
  - [ ] Parity test must assert the decode contract: `stored height = worldHeight * simres`, `u_HeightDecodeScale = 1/simres`
  - [ ] Verify that GPU texture values match decoded world height values within epsilon
  - [ ] Test with different simres values to ensure contract holds across resolutions

**Notes**:
- Parity test validates that GPU texture and rendered output match
- Decode contract must be validated explicitly

---

### 4.4 Create Headless Validation Script

**New File**: `scripts/validate-height-parity.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] Create headless/offscreen validation script
- [ ] Runs parity check and exits non-zero on mismatch
- [ ] Skip gracefully if WebGL2/offscreen unavailable
- [ ] Add npm script `validate:height-parity` to `package.json`

**Notes**:
- Headless script enables CI/CD validation
- Graceful skip prevents failures in environments without WebGL2

---

### 4.5 Live Update Verification

**File**: `src/three/utils/height-parity-validator.ts`

**Status**: ⏳ Pending

**Tasks**:
- [ ] After one simulation step that writes known delta (e.g., single texel +0.01):
  - [ ] Rerun height parity check
  - [ ] Assert framebuffer values changed by same delta within epsilon
  - [ ] Log before/after min/max of terrain texture and rendered debug pass
  - [ ] If either is flat or unchanged, mark `simHealthy = false` and throw

**Notes**:
- Live update verification ensures simulation is actually updating terrain

---

## Test Results

### Manual Tests

- [ ] Test readback utility returns correct min/max/range
- [ ] Test health checks catch invalid terrain (NaN, flat)
- [ ] Test parity validation passes for valid terrain
- [ ] Test parity validation fails for mismatched terrain
- [ ] Test decode contract validation across different simres values
- [ ] Test headless script runs successfully
- [ ] Test live update verification detects changes

### Headless Tests

- [ ] Run `npm run validate:height-parity` - should pass
- [ ] Test with multiple THREE.Terrain types (Hill, HillIsland, PerlinDiamond, DiamondSquare, Perlin) at simres=64
- [ ] Assert min/max finite and range > 0.001 for each type

### Issues Encountered

_None yet_

---

## Files Modified

- `src/three/utils/heightmap-readback.ts` (new)
- `src/three/utils/height-parity-validator.ts` (new)
- `src/three/simulation/io/TerrainReadbackService.ts`
- `src/three/integration.ts`
- `scripts/validate-height-parity.ts` (new)
- `package.json`
