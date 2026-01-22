# Three.js Port Implementation

This directory contains the Three.js port of the WebGL erosion simulation.

## Structure

- `main.ts` - Three.js runtime entry point and bootstrap
- `config.ts` - Configuration for switching between WebGL and Three.js runtimes
- `integration.ts` - Main integration class that ties everything together
- `gpgpu/` - GPGPU pass framework
  - `GpgpuPass.ts` - Individual pass wrapper
  - `PingPongTarget.ts` - Ping-pong texture management
  - `MRTRenderTarget.ts` - Multiple render target support
  - `PassRunner.ts` - Pass execution utility
- `simulation/` - Simulation pass management
  - `SimulationPassManager.ts` - Orchestrates all simulation passes
- `materials/` - Material wrappers (if needed)
- `utils/` - Utility functions
  - `combined-height-readback.ts` - Combined height calculation for raycasting

## Usage

To use the Three.js runtime instead of the WebGL pipeline:

1. Set `USE_THREEJS_RUNTIME` to `true` in `src/three/config.ts`
2. Import and initialize the runtime in your main entry point
3. The runtime will validate WebGL2 extensions and fail fast if missing

## Current Status

### Completed
- Phase 0: Complete pass inventory and dependency documentation
- Phase 1: Three.js bootstrap with extension validation
- Phase 2: GPGPU pass framework (PingPongTarget, MRTRenderTarget, GpgpuPass, PassRunner)
- Phase 2.5: Combined height readback utility
- Phase 3: Simulation pass manager structure (all passes defined, uniform setting needs completion)
- Phase 4: Lava simulation passes integrated in pass manager

### In Progress
- Phase 3: Complete uniform setting for all water simulation passes
- Phase 4: Complete uniform setting for lava simulation passes
- Phase 5: Rendering pipeline (terrain, water, lava with built-in materials)
- Phase 6: Interaction tools (brushes, raycast, heightmap import/export)
- Phase 7: Performance profiling and optimization

## Next Steps

1. Complete uniform setting in `SimulationPassManager` for all passes
2. Implement rendering scenes for terrain, water, and lava
3. Integrate with existing brush and raycast systems
4. Add performance profiling
5. Validate against WebGL pipeline output

## Notes

- All shaders use `#version 300 es` and are loaded via Vite's `?raw` import
- The fullscreen quad uses custom `vs_Pos` attribute to match existing shaders
- MRT passes support 2-4 outputs as needed
- Ping-pong swapping is handled automatically by `PingPongTarget`

