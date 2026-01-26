# Feature Parity Analysis: Base Terrain Architecture Branch vs Master

## Overview

This document identifies features present in `master` that need to be ported to `refactor/base-terrain-architecture` to achieve feature parity, with focus on the **Three.js renderer path** (preferred).

## Current Branch Status

### ✅ Completed
- BaseTerrainType and BaseMask architecture
- All 12 shader terrain types (0-11) implemented
- All 11 masks implemented
- DI adoption (state holders, services)
- Terrain generation with new architecture
- Basic Three.js runtime infrastructure
- GPGPU pass framework
- Simulation pass manager structure
- Combined height readback utility

### 🟡 Partially Complete
- **Simulation Pass Uniforms**: Framework exists but uniforms need to be fully populated
- **Terrain Rendering**: Basic terrain mesh exists but needs full material integration
- **Camera System**: CameraService exists but may need full integration

### ⚪ Not Started / Missing

## Missing Features (Priority Order)

### 1. **Rendering Pipeline** (Critical - Visual Output)

#### 1.1 Terrain Rendering
- **Status**: Basic mesh exists, but needs:
  - [ ] Full material integration (`MeshStandardMaterial`/`MeshPhysicalMaterial`)
  - [ ] Normal map generation from heightmap
  - [ ] Roughness map generation
  - [ ] Texture mapping (biome-based texturing)
  - [ ] Proper lighting integration
  - [ ] Shadow map support

#### 1.2 Water Rendering
- **Status**: Not implemented
- **Needed**:
  - [ ] Water mesh creation from water height texture
  - [ ] Water material (`MeshPhysicalMaterial` with transparency)
  - [ ] Normal map animation for water surface
  - [ ] Reflection/refraction effects
  - [ ] Water height geometry updates (throttled)

#### 1.3 Lava Rendering
- **Status**: Not implemented
- **Needed**:
  - [ ] Lava mesh creation from lava volume texture
  - [ ] Temperature-based emissive map generation
  - [ ] Color gradient shader (orange/yellow/red based on temperature)
  - [ ] Lava glow/emission effects
  - [ ] Integration with terrain rendering

#### 1.4 Post-Processing
- **Status**: Not implemented
- **Needed**:
  - [ ] Shadow maps (directional light shadows)
  - [ ] Scattering pass (atmospheric scattering)
  - [ ] Bilateral blur (optional, for soft shadows)
  - [ ] Combine pass (terrain + water + lava + effects)
  - [ ] EffectComposer integration

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

#### 2.2 Lava Simulation Passes
- **Status**: Passes exist but uniforms incomplete
- **Needed**:
  - [ ] Lava flow pass: Complete viscosity, temperature, flow uniforms
  - [ ] Lava update pass: Complete cooling, solidification uniforms
  - [ ] Lava-terrain pass: Complete thermal erosion, melting uniforms
  - [ ] Lava source arrays: Complete source injection uniforms

#### 2.3 Source Arrays
- **Status**: Framework exists
- **Needed**:
  - [ ] Water source array uniform integration
  - [ ] Lava source array uniform integration
  - [ ] Source injection logic in passes

### 3. **Interaction Tools** (High Priority - User Functionality)

#### 3.1 Brush System
- **Status**: Partial (brush uniforms exist but may not be fully wired)
- **Needed**:
  - [ ] Complete brush uniform integration in all passes
  - [ ] Brush input handling (mouse/touch)
  - [ ] Brush palette integration
  - [ ] Brush types: terrain, water, rock, smooth, flatten, slope
  - [ ] Brush visualization in scene

#### 3.2 Raycasting
- **Status**: BVH exists but may need integration
- **Needed**:
  - [ ] BVH raycast integration for brush positioning
  - [ ] Texture-based raycast fallback
  - [ ] Combined height raycast (terrain + sediment + lava)
  - [ ] Raycast accuracy validation

#### 3.3 Heightmap Import/Export
- **Status**: Not implemented
- **Needed**:
  - [ ] Heightmap import from image files
  - [ ] Heightmap export to image files
  - [ ] Heightmap format conversion
  - [ ] Heightmap validation

### 4. **GUI Integration** (High Priority - User Interface)

#### 4.1 Control Wiring
- **Status**: Partial (terrain controls wired)
- **Needed**:
  - [ ] All simulation controls wired (erosion, water, lava parameters)
  - [ ] Brush controls wired
  - [ ] Rendering controls wired (shadows, scattering, etc.)
  - [ ] Debug controls wired

#### 4.2 Visual Feedback
- **Status**: Not implemented
- **Needed**:
  - [ ] Brush visualization overlay
  - [ ] Water source visualization
  - [ ] Lava source visualization
  - [ ] Debug overlays (heightmap visualization, etc.)

### 5. **Steam Particle System** (Medium Priority - Visual Enhancement)

- **Status**: Not implemented
- **Needed**:
  - [ ] Contact detection pass (lava-water interaction)
  - [ ] GPU particle system setup
  - [ ] Particle emission logic
  - [ ] Particle rendering
  - [ ] Particle physics (velocity, lifetime, etc.)

### 6. **Performance & Optimization** (Medium Priority)

- **Status**: Not started
- **Needed**:
  - [ ] Memory profiling
  - [ ] GPU time profiling
  - [ ] Frame rate optimization
  - [ ] Texture size optimization
  - [ ] Geometry update throttling validation

### 7. **Validation & Testing** (Medium Priority)

- **Status**: Not started
- **Needed**:
  - [ ] Visual comparison with master branch
  - [ ] GPU readback validation (512x512 test cases)
  - [ ] Pass-by-pass validation
  - [ ] Performance benchmarks
  - [ ] Regression tests

## Master Branch Features to Port

### Legacy WebGL Renderer Features (Reference Only)
The master branch has a complete WebGL renderer with:
- Full rendering pipeline (terrain, water, lava, shadows, scattering)
- Complete simulation with all uniforms
- All interaction tools working
- Full GUI integration

**Note**: We don't need to port the legacy renderer itself, but we need to ensure all its **functionality** is available in the Three.js path.

## Implementation Priority

### Phase 1: Core Functionality (Must Have)
1. Complete simulation pass uniforms (water + lava)
2. Basic terrain rendering with materials
3. Basic water rendering
4. Basic lava rendering
5. Brush system integration
6. Raycast integration

### Phase 2: Visual Polish (Should Have)
1. Post-processing (shadows, scattering, blur)
2. Advanced materials (normal maps, roughness)
3. Water effects (reflection, refraction)
4. Lava effects (emission, glow)
5. GUI visual feedback

### Phase 3: Enhancements (Nice to Have)
1. Steam particle system
2. Advanced post-processing
3. Performance optimization
4. Validation suite

## Key Files to Review

### Master Branch (Reference)
- `src/main.ts` - Legacy entry point with full feature set
- `src/rendering/gl/OpenGLRenderer.ts` - Legacy renderer
- `src/simulation/texture-management.ts` - Texture setup
- `src/rendering/shader-factory.ts` - Shader creation

### Current Branch (Implementation)
- `src/three/integration.ts` - Main Three.js integration
- `src/three/simulation/SimulationPassManager.ts` - Simulation passes
- `src/three/terrain/TerrainSync.ts` - Terrain rendering
- `src/three/scenes/` - Scene creation (water-scene.ts, lava-scene.ts exist but may be incomplete)
- `src/app/runtime/three-runner.ts` - Runtime integration

## Next Steps

1. **Audit Simulation Passes**: Review each pass in `SimulationPassManager.ts` and identify missing uniforms
2. **Review Master Shaders**: Compare master shader uniform usage with current pass implementations
3. **Implement Rendering Scenes**: Complete terrain/water/lava scene creation
4. **Wire Interaction Tools**: Integrate brush and raycast systems
5. **Test Incrementally**: Validate each feature as it's implemented

## Notes

- The preferred render method is **Three.js built-in materials** (`MeshStandardMaterial`, `MeshPhysicalMaterial`) rather than custom shaders
- Use `EffectComposer` for post-processing where possible
- Keep simulation fully GPU-driven (only read back combined height for geometry updates)
- Maintain compatibility with existing control system and GUI
