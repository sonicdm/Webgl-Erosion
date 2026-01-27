# Three.js Port Implementation Status

## Overview

This document tracks the implementation status of the Three.js port. The core infrastructure is in place, with remaining work focused on filling in uniform details and integration.

## Completed Phases

### Phase 0: Complete Pass Inventory and Dependency Graph ✅
- **Status**: Complete
- **Files**: 
  - `docs/PASS_INVENTORY.md` - Complete pass execution order
  - `docs/TEXTURE_INVENTORY.md` - All textures documented
  - `docs/SHADER_ATTRIBUTES.md` - Shader attribute documentation
  - `docs/DEPENDENCY_DIAGRAM.md` - Visual dependency graphs
- **Notes**: All passes, textures, and dependencies fully documented

### Phase 1: Three.js Bootstrap ✅
- **Status**: Complete
- **Files**:
  - `src/three/main.ts` - Three.js runtime with extension validation
  - `src/three/config.ts` - Runtime switching configuration
- **Features**:
  - WebGL2 extension validation (`EXT_color_buffer_float`, `OES_texture_float_linear`)
  - Fullscreen quad geometry creation
  - GPGPU camera setup
  - Basic terrain scene for testing
- **Notes**: Extension validation fails fast with clear error messages

### Phase 2: GPGPU Pass Framework ✅
- **Status**: Complete
- **Files**:
  - `src/three/gpgpu/GpgpuPass.ts` - Pass wrapper with uniform/texture management
  - `src/three/gpgpu/PingPongTarget.ts` - Ping-pong texture pair management
  - `src/three/gpgpu/MRTRenderTarget.ts` - Multiple render target support (2-4 outputs)
  - `src/three/gpgpu/PassRunner.ts` - Pass execution utility
- **Features**:
  - Automatic ping-pong swapping
  - MRT support for 2-4 outputs
  - Viewport management
  - Resource disposal

### Phase 2.5: Combined Height for Raycasting ✅
- **Status**: Complete
- **Files**:
  - `src/three/utils/combined-height-readback.ts` - Combined height calculation
- **Features**:
  - Reads terrain + sediment from `read_terrain_tex`
  - Reads lava volume from `read_lava_tex`
  - Combines: `terrain_height + sediment + lava_volume`
  - Matches `terrain-vert.glsl` calculation
  - Validates lava data (temperature range)

### Phase 3: Core Water Simulation Port 🟡
- **Status**: Framework Complete, Uniforms Need Filling
- **Files**:
  - `src/three/simulation/SimulationPassManager.ts` - All passes defined
- **Completed**:
  - All 10 water simulation passes created
  - Pass execution order matches `SimulatePerStep`
  - MRT outputs configured correctly
  - Ping-pong swaps at correct points
  - Conditional advection paths (MacCormack vs Simple)
- **Remaining**:
  - Complete uniform setting for all passes (many uniforms per pass)
  - Brush uniform integration
  - Water source array uniform integration
  - Validation against WebGL output

### Phase 4: Lava Simulation Port 🟡
- **Status**: Framework Complete, Uniforms Need Filling
- **Files**:
  - `src/three/simulation/SimulationPassManager.ts` - Lava passes integrated
- **Completed**:
  - All 3 lava passes created (flow, update, terrain)
  - MRT output for lava-terrain pass
  - Pass execution order correct
- **Remaining**:
  - Complete uniform setting (lava physics constants, source arrays, brush inputs)
  - Validation against WebGL output

### Phase 5: Rendering Pipeline Port ⚪
- **Status**: Not Started
- **Needed**:
  - Terrain rendering with `MeshStandardMaterial`/`MeshPhysicalMaterial`
  - Water rendering as separate mesh
  - Lava rendering with emissive map
  - Post-processing with `EffectComposer`
  - Shadow maps

### Phase 5.5: Steam Particle System ⚪
- **Status**: Not Started
- **Needed**:
  - Contact detection pass
  - GPU particle system
  - Particle rendering

### Phase 6: Interaction and Tools ⚪
- **Status**: Not Started
- **Needed**:
  - Brush input integration
  - Raycast integration (BVH and texture-based)
  - Heightmap import/export
  - GUI controls mapping

### Phase 7: Performance and Validation ⚪
- **Status**: Not Started
- **Needed**:
  - Memory profiling
  - GPU time profiling
  - Performance comparison with WebGL
  - Optimization

## Integration Points

### Main Integration
- **File**: `src/three/integration.ts`
- **Class**: `ThreeJSSimulationRuntime`
- **Purpose**: Main entry point that ties runtime, simulation, and rendering together

### Current Integration Status
- ✅ Runtime initialization
- ✅ Simulation pass manager initialization
- ✅ Combined height readback
- ⚪ Rendering integration
- ⚪ Interaction integration
- ⚪ Main entry point wiring

## Key Implementation Details

### Shader Loading
- All shaders loaded via Vite's `?raw` import
- Example: `import rainFrag from '../../shaders/rain-frag.glsl?raw';`
- Preserves `#version 300 es` and all shader code

### Texture Formats
- All simulation textures: `RGBA32F`, `LinearFilter`, `ClampToEdge`
- Created via `PingPongTarget` or `MRTRenderTarget`
- Automatic format validation

### Attribute Handling
- GPGPU passes: Use custom `vs_Pos` attribute (Option B)
- Render passes: Can use standard Three.js attributes (Option A)
- Fullscreen quad geometry created with `vs_Pos` attribute

### MRT Support
- 2-output MRT: WaterHeight, LavaTerrain, Average
- 3-output MRT: SedimentAdvection
- 4-output MRT: Sediment
- All handled by `MRTRenderTarget` class

## Next Steps for Completion

1. **Complete Uniform Setting** (High Priority)
   - Add all uniforms to each pass in `SimulationPassManager`
   - Integrate with existing control system
   - Add brush uniforms
   - Add source array uniforms

2. **Rendering Pipeline** (High Priority)
   - Create terrain scene with standard materials
   - Create water scene
   - Create lava scene
   - Integrate with main runtime

3. **Interaction Tools** (Medium Priority)
   - Wire brush system
   - Integrate raycast
   - Port heightmap import/export

4. **Validation** (Medium Priority)
   - Compare GPU readbacks at 512x512
   - Validate each pass individually
   - Performance profiling

5. **Polish** (Low Priority)
   - Steam particles
   - Performance optimization
   - Documentation updates

## Testing Strategy

1. **Unit Tests**: Test each pass individually with known inputs
2. **Integration Tests**: Test pass chains
3. **Visual Tests**: Compare Three.js output vs WebGL output
4. **Performance Tests**: Measure frame times and memory usage

## Known Limitations

1. **Uniform Setting**: Many uniforms need to be set per pass - this is tedious but straightforward
2. **Rendering**: Needs full implementation of terrain/water/lava scenes
3. **Integration**: Needs wiring into main entry point
4. **Validation**: No automated validation yet

## Files Created

### Core Framework
- `src/three/main.ts` - Runtime bootstrap
- `src/three/config.ts` - Configuration
- `src/three/integration.ts` - Main integration
- `src/three/README.md` - Usage documentation

### GPGPU Framework
- `src/three/gpgpu/GpgpuPass.ts`
- `src/three/gpgpu/PingPongTarget.ts`
- `src/three/gpgpu/MRTRenderTarget.ts`
- `src/three/gpgpu/PassRunner.ts`

### Simulation
- `src/three/simulation/SimulationPassManager.ts`

### Utilities
- `src/three/utils/combined-height-readback.ts`

### Documentation
- `docs/PASS_INVENTORY.md`
- `docs/TEXTURE_INVENTORY.md`
- `docs/SHADER_ATTRIBUTES.md`
- `docs/DEPENDENCY_DIAGRAM.md`
- `docs/THREEJS_IMPLEMENTATION_STATUS.md` (this file)

## Summary

The core infrastructure for the Three.js port is **complete and functional**. The framework supports:
- All simulation passes (water, sediment, thermal, lava)
- Ping-pong texture management
- MRT outputs (2-4 outputs)
- Combined height readback
- Extension validation

**Remaining work** is primarily:
- Filling in uniform details (mechanical but necessary)
- Implementing rendering scenes
- Integrating with existing systems
- Validation and testing

The architecture is sound and ready for incremental completion of the remaining details.

