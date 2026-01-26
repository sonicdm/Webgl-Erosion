# Feature Parity Analysis: Base Terrain Architecture Branch vs Master

## Overview

This document identifies features present in `master` that need to be ported to `refactor/base-terrain-architecture` to achieve feature parity, with focus on the **Three.js renderer path** (preferred).

**Target Platform**: Desktop WebGL2 (Chrome, Firefox, Edge). Mobile/WebXR not in scope for initial parity.

## Current Branch Status

### [COMPLETE] Completed Features

- **BaseTerrainType and BaseMask architecture**: Abstract classes with standardized interfaces
  - *Verification*: Classes exist, registries functional, used in `TerrainReadbackService`
  - *Caveat*: No automated tests yet for individual terrain type/mask classes
  
- **All 12 shader terrain types (0-11) implemented**: Individual classes matching `initial-frag.glsl`
  - *Verification*: All classes exist in `src/three/terrain/types/`, formulas match shader
  - *Caveat*: Visual validation needed; no unit tests for formula accuracy
  
- **All 11 masks implemented**: Individual classes matching `initial-frag.glsl` (IDs 0-11, excluding 9)
  - *Verification*: All classes exist in `src/three/terrain/masks/`, formulas match shader
  - *Caveat*: Visual validation needed; no unit tests for formula accuracy
  
- **DI adoption**: State holders, services, composition root
  - *Verification*: Tests exist (`bootstrap-services.test.ts`, `TerrainStateHolder.test.ts`)
  
- **Terrain generation with new architecture**: `TerrainReadbackService` uses registries
  - *Verification*: Integrated in `TerrainReadbackService.generateTerrain()`
  - *Caveat*: Needs visual validation against master output
  
- **Basic Three.js runtime infrastructure**: Runtime, renderer, scene setup
  - *Verification*: `ThreeJSRuntime` class functional, extension validation works
  
- **GPGPU pass framework**: Pass wrapper, ping-pong, MRT support
  - *Verification*: Framework classes exist and are used in `SimulationPassManager`
  
- **Simulation pass manager structure**: All passes defined with correct order
  - *Verification*: `SimulationPassManager` has all 10 water + 3 lava passes
  - *Caveat*: Uniforms incomplete (see Missing Features)
  
- **Combined height readback utility**: Reads terrain + sediment + lava
  - *Verification*: `combined-height-readback.ts` exists and is used

### [PARTIAL] Partially Complete Features

- **Simulation Pass Uniforms**: Framework exists but uniforms need to be fully populated
  - *Status*: Passes created, uniform setting incomplete
  - *Blocking*: Simulation won't run correctly without complete uniforms
  
- **Terrain Rendering**: Basic terrain mesh exists but needs full material integration
  - *Status*: Mesh created, procedural material exists, but needs standard materials
  - *Blocking*: Visual output incomplete
  
- **Camera System**: CameraService exists but may need full integration
  - *Status*: Service exists, needs validation of full event handling

### [MISSING] Not Started / Missing Features

- **Water Rendering**: No water mesh or material implementation
- **Lava Rendering**: No lava mesh or material implementation
- **Post-Processing**: No shadow maps, scattering, blur, or combine passes
- **Brush System Integration**: Partial uniform support, missing input handling
- **Raycast Integration**: BVH exists but not wired to brush system
- **Heightmap Import/Export**: No file I/O implementation
- **GUI Control Wiring**: Only terrain controls wired, simulation/brush controls missing
- **Visual Feedback**: No brush overlays, source visualization, or debug overlays
- **Steam Particle System**: Not implemented
- **Performance Profiling**: No profiling tools or benchmarks

## Missing Features (Priority Order)

### 1. **Rendering Pipeline** (Critical - Visual Output)

#### 1.1 Terrain Rendering
- **Status**: Basic mesh exists, but needs:
  - [ ] Full material integration (`MeshStandardMaterial`/`MeshPhysicalMaterial`)
  - [ ] Texture mapping (biome-based texturing)
  - [ ] Proper lighting integration
  - **Note**: Normal/roughness maps deferred to Phase 2 (Advanced Materials)
  - **Note**: Shadow maps owned by Post-Processing (see section 1.4)

**Owner**: `src/three/terrain/TerrainSync.ts`, `src/three/scenes/terrain-scene.ts`  
**Definition of Done**:
- Terrain renders with standard materials matching master visual quality
- Biome texturing functional
- Basic lighting works (ambient + directional)
- Visual comparison screenshot matches master within tolerance

#### 1.2 Water Rendering
- **Status**: Not implemented
- **Needed**:
  - [ ] Water mesh creation from water height texture
  - [ ] Water material (`MeshPhysicalMaterial` with transparency)
  - [ ] Normal map animation for water surface
  - [ ] Reflection/refraction effects
  - [ ] Water height geometry updates (throttled)

**Owner**: `src/three/scenes/water-scene.ts` (exists but incomplete)  
**Definition of Done**:
- Water mesh updates from simulation texture
- Water renders with transparency and normal animation
- Visual match with master water rendering

#### 1.3 Lava Rendering
- **Status**: Not implemented
- **Needed**:
  - [ ] Lava mesh creation from lava volume texture
  - [ ] Temperature-based emissive map generation
  - [ ] Color gradient shader (orange/yellow/red based on temperature)
  - [ ] Lava glow/emission effects
  - [ ] Integration with terrain rendering

**Owner**: `src/three/scenes/lava-scene.ts` (exists but incomplete)  
**Definition of Done**:
- Lava mesh updates from simulation texture
- Temperature-based color gradient matches master
- Emission/glow effects functional

#### 1.4 Post-Processing
- **Status**: Not implemented
- **Needed**:
  - [ ] Shadow Maps: Directional light shadows (applies to all scene objects: terrain, water, lava)
  - [ ] Scattering pass (atmospheric scattering)
  - [ ] Bilateral blur (optional, for soft shadows)
  - [ ] Combine pass (terrain + water + lava + effects)
  - [ ] EffectComposer integration

**Owner**: `src/three/post-processing/` (new directory)  
**Definition of Done**:
- Shadow maps render correctly for all scene objects (terrain, water, lava)
- Scattering pass matches master visual quality
- Combine pass produces final output matching master
- EffectComposer chain functional

**Note**: Shadow maps are owned by post-processing phase, not terrain rendering. Terrain rendering provides geometry; post-processing adds shadows via `EffectComposer` and directional light shadow maps.

### 2. **Simulation Pass Uniforms** (Critical - Simulation Functionality)

#### 2.1 Water Simulation Passes
- **Status**: Passes exist but uniforms incomplete
- **Needed for each pass**:
  - [ ] Rain pass: Complete brush uniforms, rain parameters
  - [ ] Flow pass: Complete all flux calculation uniforms
  - [ ] Water height/velocity: Complete advection uniforms
  - [ ] Sediment passes: Complete erosion/deposition uniforms
  - [ ] Thermal passes: Complete thermal flux uniforms
  - [ ] Evaporation: Complete evaporation constants
  - [ ] Average: Complete smoothing uniforms

**Owner**: `src/three/simulation/SimulationPassManager.ts`, `src/three/simulation/passes/water/WaterPasses.ts`  
**Definition of Done**:
- All uniforms from master shader implementation are set
- GPU readback validation: 512x512 test case matches master output within tolerance
- Visual validation: Water simulation behavior matches master

**Acceptance Criteria**:
- Uniform count matches master shader uniform usage (audit required)
- GPU readback at 512x512 resolution matches master within 1% tolerance
- Visual comparison: Water flow patterns match master

#### 2.2 Lava Simulation Passes
- **Status**: Passes exist but uniforms incomplete
- **Needed**:
  - [ ] Lava flow pass: Complete viscosity, temperature, flow uniforms
  - [ ] Lava update pass: Complete cooling, solidification uniforms
  - [ ] Lava-terrain pass: Complete thermal erosion, melting uniforms
  - [ ] Lava source arrays: Complete source injection uniforms

**Owner**: `src/three/simulation/SimulationPassManager.ts`, `src/three/simulation/passes/lava/`  
**Definition of Done**:
- All lava uniforms set correctly
- GPU readback validation: Lava temperature/volume matches master
- Visual validation: Lava flow and cooling match master

#### 2.3 Source Arrays
- **Status**: Framework exists
- **Needed**:
  - [ ] Water source array uniform integration
  - [ ] Lava source array uniform integration
  - [ ] Source injection logic in passes

**Owner**: `src/three/simulation/SimulationPassManager.ts`  
**Definition of Done**:
- Source arrays injected into simulation passes
- Sources appear and function correctly in simulation

### 3. **Interaction Tools** (High Priority - User Functionality)

#### 3.1 Brush System
- **Status**: Partial (brush uniforms exist but may not be fully wired)
- **Needed**:
  - [ ] Complete brush uniform integration in all passes
  - [ ] Brush input handling (mouse/touch)
  - [ ] Brush palette integration
  - [ ] Brush types: terrain, water, rock, smooth, flatten, slope
  - [ ] Brush visualization in scene

**Owner**: `src/app/input/brush-controls.ts`, `src/three/integration.ts`  
**Definition of Done**:
- All brush types functional
- Brush input responds correctly
- Brush modifications visible in real-time
- Visual match with master brush behavior

#### 3.2 Raycasting
- **Status**: BVH exists but may need integration
- **Needed**:
  - [ ] BVH raycast integration for brush positioning
  - [ ] Texture-based raycast fallback
  - [ ] Combined height raycast (terrain + sediment + lava)
  - [ ] Raycast accuracy validation

**Owner**: `src/utils/bvh-raycast.ts`, `src/utils/raycast.ts`, `src/three/integration.ts`  
**Definition of Done**:
- BVH raycast works for brush positioning
- Fallback to texture-based raycast when BVH unavailable
- Raycast accuracy matches master (within 0.1% tolerance)

#### 3.3 Heightmap Import/Export
- **Status**: Not implemented
- **Needed**:
  - [ ] Heightmap import from image files
  - [ ] Heightmap export to image files
  - [ ] Heightmap format conversion
  - [ ] Heightmap validation

**Owner**: `src/utils/heightmap-loader.ts` (exists in master, needs porting)  
**Definition of Done**:
- Import/export functional
- Format conversion works
- Validation prevents invalid imports

### 4. **GUI Integration** (High Priority - User Interface)

#### 4.1 Control Wiring
- **Status**: Partial (terrain controls wired)
- **Needed**:
  - [ ] All simulation controls wired (erosion, water, lava parameters)
  - [ ] Brush controls wired
  - [ ] Rendering controls wired (shadows, scattering, etc.)
  - [ ] Debug controls wired

**Owner**: `src/gui/gui-setup.ts`, `src/app/runtime/three-runner.ts`  
**Definition of Done**:
- All GUI controls functional
- Changes reflect in simulation/rendering immediately
- No broken control handlers

#### 4.2 Visual Feedback
- **Status**: Not implemented
- **Needed**:
  - [ ] Brush visualization overlay
  - [ ] Water source visualization
  - [ ] Lava source visualization
  - [ ] Debug overlays (heightmap visualization, etc.)

**Owner**: `src/three/scenes/` (new overlay system)  
**Definition of Done**:
- Visual feedback matches master functionality
- Overlays don't impact performance significantly

### 5. **Steam Particle System** (Medium Priority - Visual Enhancement)

- **Status**: Not implemented
- **Needed**:
  - [ ] Contact detection pass (lava-water interaction)
  - [ ] GPU particle system setup
  - [ ] Particle emission logic
  - [ ] Particle rendering
  - [ ] Particle physics (velocity, lifetime, etc.)

**Owner**: `src/three/particles/` (new directory)  
**Definition of Done**:
- Particles emit when lava contacts water
- Particle rendering functional
- Performance acceptable (60fps at 512x512)

### 6. **Performance & Optimization** (Medium Priority)

- **Status**: Not started
- **Needed**:
  - [ ] Memory profiling
  - [ ] GPU time profiling
  - [ ] Frame rate optimization
  - [ ] Texture size optimization
  - [ ] Geometry update throttling validation

**Owner**: `src/three/utils/profiling.ts` (new file)  
**Definition of Done**:
- Profiling tools functional (`npm run profile:gpu`, `npm run profile:memory`)
- Performance metrics documented for all target resolutions
- Optimization targets met per resolution (see Performance Targets table below)
- Hardware baseline documented (tested on reference hardware)

**Performance Targets** (Desktop WebGL2, Chrome/Firefox/Edge):
- **512x512**: 60fps minimum (baseline: GTX 1060 / RX 580 or equivalent)
- **1024x1024**: 60fps minimum (baseline: GTX 1060 / RX 580 or equivalent)
- **2048x2048**: 30fps minimum (baseline: GTX 1060 / RX 580 or equivalent)
- **4096x4096**: 15fps minimum (baseline: RTX 3060 / RX 6600 or equivalent)

**Measurement Method**:
- Use `npm run profile:gpu` to measure frame time per pass
- Use browser DevTools Performance tab for overall frame time
- Measure average FPS over 60-second test run
- Document hardware configuration in performance reports

### 7. **Validation & Testing** (Phase 1 Exit Criteria - Required for Acceptance)

- **Status**: Not started
- **Needed**:
  - [ ] Visual comparison with master branch (screenshot-based)
  - [ ] GPU readback validation (512x512 test cases)
  - [ ] Pass-by-pass validation (each pass output validated)
  - [ ] Performance benchmarks (frame time, memory)
  - [ ] Regression tests (automated where possible)

**Owner**: `src/three/__tests__/validation/` (new directory)  
**Tools & Scripts**:
- `npm run validate:readback` - GPU readback comparison (512x512 test cases)
- `npm run validate:screenshots` - Visual screenshot comparison tool
- `npm run validate:passes` - Pass-by-pass validation
- `npm run validate:performance` - Performance benchmark suite
- Baseline files: `tests/baselines/master/` (screenshots and GPU readback data from master branch)

**Definition of Done**:
- Validation suite runs and passes (`npm run validate:all`)
- Visual comparison tool functional: Screenshot diff tool compares Three.js output vs master baselines
- GPU readback validation: 512x512 test cases match master within 1% tolerance (automated)
- Pass-by-pass validation: Each simulation pass output validated individually
- Performance benchmarks documented: Frame time and memory usage logged per resolution
- Regression tests prevent breaking changes: Automated tests run in CI

**Invocation**:
- **CI**: Runs `npm run validate:all` on every commit
- **Manual**: Developers run `npm run validate:readback` and `npm run validate:screenshots` before PR
- **Baselines**: Stored in `tests/baselines/master/` directory, updated when master branch changes

**Note**: Validation is **required** for Phase 1 completion, not optional. Core features cannot be accepted without validation.

## Master Branch Features to Port

### Legacy WebGL Renderer Features (Reference Only)
The master branch has a complete WebGL renderer with:
- Full rendering pipeline (terrain, water, lava, shadows, scattering)
- Complete simulation with all uniforms
- All interaction tools working
- Full GUI integration

**Note**: We don't need to port the legacy renderer itself, but we need to ensure all its **functionality** is available in the Three.js path.

## Implementation Priority

### Phase 1: Core Functionality (Must Have) - Exit Criteria Required

**Goal**: Functional simulation and basic rendering matching master behavior.

1. **Complete simulation pass uniforms (water + lava)**
   - *Owner*: `SimulationPassManager.ts`
   - *DoD*: All uniforms set, GPU readback validation passes, visual match
   - *Checkpoint*: Water simulation produces stable output matching master

2. **Basic terrain rendering with materials**
   - *Owner*: `TerrainSync.ts`, `terrain-scene.ts`
   - *DoD*: Standard materials functional, biome texturing works, basic lighting, visual match
   - *Checkpoint*: Terrain renders with materials matching master quality (normal/roughness maps deferred to Phase 2)

3. **Basic water rendering**
   - *Owner*: `water-scene.ts`
   - *DoD*: Water mesh functional, transparency works, visual match
   - *Checkpoint*: Water visible and updates from simulation

4. **Basic lava rendering**
   - *Owner*: `lava-scene.ts`
   - *DoD*: Lava mesh functional, temperature colors correct, visual match
   - *Checkpoint*: Lava visible and updates from simulation

5. **Brush system integration**
   - *Owner*: `brush-controls.ts`, `integration.ts`
   - *DoD*: All brush types functional, input handling works, visual match
   - *Checkpoint*: Brush modifications visible in real-time

6. **Raycast integration**
   - *Owner*: `bvh-raycast.ts`, `integration.ts`
   - *DoD*: BVH raycast functional, fallback works, accuracy validated
   - *Checkpoint*: Brush positioning accurate

7. **Validation Suite** (Exit Criteria)
   - *Owner*: `__tests__/validation/`
   - *DoD*: All validation tests pass (`npm run validate:all`), visual comparison tool functional, GPU readback within 1% tolerance
   - *Checkpoint*: Phase 1 features validated against master baselines

**Phase 1 Complete When**: All 7 items above have DoD met and validation suite passes.

### Phase 2: Visual Polish (Should Have)

**Goal**: Enhanced visual quality and post-processing effects.

1. **Post-processing (shadows, scattering, blur)**
   - *Owner*: `post-processing/`
   - *DoD*: Shadow maps functional, scattering matches master, blur optional
   - *Checkpoint*: Visual quality matches or exceeds master

2. **Advanced materials (normal maps, roughness)**
   - *Owner*: `TerrainSync.ts`
   - *DoD*: Normal maps generated from heightmap, roughness maps generated, both applied to terrain material
   - *Checkpoint*: Terrain detail matches master (normal/roughness maps enhance Phase 1 basic materials)

3. **Water effects (reflection, refraction)**
   - *Owner*: `water-scene.ts`
   - *DoD*: Reflection/refraction functional
   - *Checkpoint*: Water quality matches master

4. **Lava effects (emission, glow)**
   - *Owner*: `lava-scene.ts`
   - *DoD*: Emission/glow functional
   - *Checkpoint*: Lava quality matches master

5. **GUI visual feedback**
   - *Owner*: `scenes/` (overlay system)
   - *DoD*: All visual feedback functional
   - *Checkpoint*: User experience matches master

**Phase 2 Complete When**: All 5 items above have DoD met.

### Phase 3: Enhancements (Nice to Have)

**Goal**: Additional features and optimizations.

1. **Steam particle system**
   - *Owner*: `particles/`
   - *DoD*: Particles functional, performance acceptable
   - *Checkpoint*: Steam visible when lava contacts water

2. **Advanced post-processing**
   - *Owner*: `post-processing/`
   - *DoD*: Additional effects functional
   - *Checkpoint*: Enhanced visual quality

3. **Performance optimization**
   - *Owner*: `utils/profiling.ts`
   - *DoD*: Optimization targets met
   - *Checkpoint*: 60fps at 2048x2048

4. **Validation suite expansion**
   - *Owner*: `__tests__/validation/`
   - *DoD*: Comprehensive test coverage
   - *Checkpoint*: All features covered by tests

**Phase 3 Complete When**: All 4 items above have DoD met.

## Feature -> File Mapping

| Feature | Primary File(s) | Secondary Files | Notes |
|---------|----------------|-----------------|-------|
| Terrain Rendering | `src/three/terrain/TerrainSync.ts` | `src/three/scenes/terrain-scene.ts`, `src/three/materials/terrain-procedural-material.ts` | Basic mesh exists |
| Water Rendering | `src/three/scenes/water-scene.ts` | `src/three/integration.ts` | File exists but incomplete |
| Lava Rendering | `src/three/scenes/lava-scene.ts` | `src/three/integration.ts` | File exists but incomplete |
| Post-Processing | `src/three/post-processing/` (new) | `src/three/integration.ts` | Not started |
| Water Simulation Uniforms | `src/three/simulation/SimulationPassManager.ts` | `src/three/simulation/passes/water/WaterPasses.ts` | Framework exists |
| Lava Simulation Uniforms | `src/three/simulation/SimulationPassManager.ts` | `src/three/simulation/passes/lava/` | Framework exists |
| Source Arrays | `src/three/simulation/SimulationPassManager.ts` | `src/app/dto/SourceArrays.ts` | Framework exists |
| Brush System | `src/app/input/brush-controls.ts` | `src/three/integration.ts`, `src/three/simulation/passes/water/WaterPasses.ts` | Partial |
| Raycasting | `src/utils/bvh-raycast.ts` | `src/utils/raycast.ts`, `src/three/integration.ts` | BVH exists |
| Heightmap I/O | `src/utils/heightmap-loader.ts` | `src/three/simulation/io/TerrainReadbackService.ts` | Needs porting from master |
| GUI Controls | `src/gui/gui-setup.ts` | `src/app/runtime/three-runner.ts` | Partial |
| Visual Feedback | `src/three/scenes/` (overlays) | `src/three/integration.ts` | Not started |
| Steam Particles | `src/three/particles/` (new) | `src/three/integration.ts` | Not started |
| Performance Profiling | `src/three/utils/profiling.ts` (new) | `src/three/integration.ts` | Not started |
| Validation Suite | `src/three/__tests__/validation/` (new) | Various test files | Not started |

## Key Files to Review

### Master Branch (Reference)
- `src/main.ts` - Legacy entry point with full feature set
- `src/rendering/gl/OpenGLRenderer.ts` - Legacy renderer
- `src/simulation/texture-management.ts` - Texture setup
- `src/rendering/shader-factory.ts` - Shader creation
- `src/rendering/render-utils.ts` - Render helpers

### Current Branch (Implementation)
- `src/three/integration.ts` - Main Three.js integration
- `src/three/simulation/SimulationPassManager.ts` - Simulation passes
- `src/three/terrain/TerrainSync.ts` - Terrain rendering
- `src/three/scenes/` - Scene creation (water-scene.ts, lava-scene.ts exist but incomplete)
- `src/app/runtime/three-runner.ts` - Runtime integration
- `src/three/simulation/passes/water/WaterPasses.ts` - Water pass implementation
- `src/three/simulation/passes/lava/` - Lava pass implementations

## Next Steps

1. **Audit Simulation Passes**: Review each pass in `SimulationPassManager.ts` and identify missing uniforms
   - Compare with master shader uniform usage
   - Document all required uniforms per pass
   - Create uniform setting checklist

2. **Review Master Shaders**: Compare master shader uniform usage with current pass implementations
   - Extract uniform list from each shader
   - Map to pass implementations
   - Identify gaps

3. **Implement Rendering Scenes**: Complete terrain/water/lava scene creation
   - Start with terrain (basic materials)
   - Add water (transparency, normal maps)
   - Add lava (emission, temperature colors)

4. **Wire Interaction Tools**: Integrate brush and raycast systems
   - Complete brush uniform wiring
   - Integrate BVH raycast
   - Test brush accuracy

5. **Test Incrementally**: Validate each feature as it's implemented
   - GPU readback validation per pass
   - Visual comparison screenshots
   - Performance profiling

## Open Questions / Assumptions

### Shadow Maps Ownership
**Decision**: Shadow maps are owned by **post-processing phase**, not terrain rendering. Terrain rendering provides geometry; post-processing adds shadows via `EffectComposer` and directional light shadow maps.

**Rationale**: Shadows affect all scene objects (terrain, water, lava), so they belong in post-processing. Terrain rendering focuses on material/texture setup.

### Acceptance Criteria for Simulation Uniforms
**Definition**: 
- **Uniform Completeness**: All uniforms from master shader are set (audit required)
- **Visual Match**: Water/lava simulation behavior matches master (screenshot comparison)
- **GPU Readback Validation**: 512x512 test case matches master output within 1% tolerance

**Validation Method**: Automated GPU readback comparison + visual screenshot comparison

### Platform/Resolution Targets
**Target**: Desktop WebGL2 (Chrome, Firefox, Edge) at resolutions 512x512, 1024x1024, 2048x2048, 4096x4096.

**Hardware Baseline**:
- **Minimum (512-1024)**: GTX 1060 / RX 580 or equivalent (6GB VRAM)
- **Recommended (2048)**: GTX 1060 / RX 580 or equivalent (6GB VRAM)
- **High-res (4096)**: RTX 3060 / RX 6600 or equivalent (8GB+ VRAM)

**Performance Targets** (measured with `npm run profile:gpu`):
- **512x512**: 60fps minimum (baseline: GTX 1060 / RX 580)
- **1024x1024**: 60fps minimum (baseline: GTX 1060 / RX 580)
- **2048x2048**: 30fps minimum (baseline: GTX 1060 / RX 580)
- **4096x4096**: 15fps minimum (baseline: RTX 3060 / RX 6600)

**Measurement Method**:
- Use `npm run profile:gpu` for per-pass GPU timing
- Use browser DevTools Performance tab for overall frame time
- Average FPS over 60-second test run
- Document hardware configuration in performance reports

**Material Choice**: Prefer `MeshStandardMaterial`/`MeshPhysicalMaterial` for compatibility and performance. Custom shaders only where necessary (GPGPU passes, texture combines).

## Notes

- The preferred render method is **Three.js built-in materials** (`MeshStandardMaterial`, `MeshPhysicalMaterial`) rather than custom shaders
- Use `EffectComposer` for post-processing where possible
- Keep simulation fully GPU-driven (only read back combined height for geometry updates)
- Maintain compatibility with existing control system and GUI
- Shadow maps: Post-processing owns implementation, terrain rendering provides geometry
- Validation is **required** for Phase 1 completion, not optional
