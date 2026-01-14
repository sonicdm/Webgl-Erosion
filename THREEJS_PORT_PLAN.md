# Three.js Port Plan

## Project-Wide Goals

- Preserve simulation behavior (water, sediment, thermal, lava) with WebGL2 float MRT outputs.
- Match current visual output (terrain, water, lava, shadows, scattering, blur, combine).
- Keep interactive tools (brush palette, sim controls, brushes, raycast, heightmap import/export, GUI) working.
- Make the port incremental so the existing WebGL pipeline can stay as a fallback.
- Add steam particles for lava/water interaction.

## Non-Goals (Initial Port)

- WebGPU rewrite.
- New simulation features beyond parity.
- Mobile support for 4096x4096 simulation.

## Constraints and Requirements

- WebGL2 required: float textures, MRT, draw buffers.
- Extensions: `EXT_color_buffer_float`, `OES_texture_float_linear`.
- GLSL 300 es shaders must be preserved or minimally adapted.

## Methodology and Strategy

### Porting Strategy

- Build a parallel Three.js runtime (new entry point) while keeping the current WebGL path intact.
- Preserve shader code and pass order; only adapt binding and attribute names.
- Create a small GPGPU pass framework that mirrors the existing ping-pong pipeline.
- Prefer built-in Three.js rendering paths for scene visuals.
- Keep the simulation fully GPU-driven; only read back combined height data for interaction/raycasting.
- Do the Three.js port in a new branch to avoid breaking the existing WebGL build.

### Rendering Simplification Track (Preferred)

**Goal**: minimize custom rendering code while improving raycast accuracy.

**Decisions**
- Render terrain with `MeshStandardMaterial`/`MeshPhysicalMaterial` and a CPU-updated geometry.
- Avoid vertex displacement in render shaders so the render mesh and raycast mesh match.
- Use `three-mesh-bvh` raycasting on the same geometry used for rendering.
- Keep custom shaders only for GPGPU simulation passes and a small number of texture-combine passes.
- Use Three.js lighting, shadows, fog, and `EffectComposer` passes where possible.

**Implications**
- A combined height buffer (terrain + sediment + lava) must be read back to CPU to update geometry.
- Water and lava can be separate meshes with standard materials (emissive for lava), updated at a lower rate.
- Advanced scattering or custom shading becomes optional rather than required for MVP parity.
- Simulation stays on GPU (MRT ping-pong passes); the simplification applies to rendering only.
- Steam particles are GPU-updated but isolated to a small, dedicated particle system.

### Best Practices

- **Single source of truth**: keep a clear pass graph and a texture map; avoid hidden dependencies between passes.
- **Explicit state**: set all uniforms and texture bindings every pass; do not rely on previous GL state.
- **Resource ownership**: centralize render target creation and disposal to avoid leaks.
- **Precision checks**: validate float texture and MRT support at startup with an actionable error.
- **Stable readbacks**: read GPU data on a fixed cadence; avoid readbacks every frame.
- **Profiling**: measure GPU time per pass and memory footprint at 512/1024/2048/4096.
- **Determinism**: keep random seeds controllable for reproducible tests and visual baselines.

### Technical Notes

- Use `WebGLMultipleRenderTargets` for MRT passes (sediment/terrain/velocity and lava-terrain).
- Use `FloatType`, `RGBAFormat`, `NearestFilter` or `LinearFilter` as needed.
- Disable `renderer.autoClear` and control clears per pass.
- Keep `#version 300 es` in shaders; use `RawShaderMaterial` to avoid Three.js shader rewrites.
- Prefer `MeshStandardMaterial`/`MeshPhysicalMaterial` for final rendering.

## Reference Map (Current Pipeline)

- Main simulation loop and pass order live in `src/main.ts`.
- Ping-pong textures and formats live in `src/simulation/texture-management.ts`.
- Shader sources live in `src/shaders/*.glsl`.
- Shader wiring lives in `src/rendering/shader-factory.ts`.
- Render helpers live in `src/rendering/render-utils.ts`.

## Risks and Mitigations

- **MRT + float support varies**: detect at startup and fail fast with a clear error.
- **Memory pressure at 4096**: consider half-float or reduce texture count for the MVP.
- **Shader attribute mismatch**: standardize on `position` and `uv` to simplify.
- **Readback cost**: throttle combined-height readbacks as already implemented.

## Suggested File Layout (New)

- `src/three/main.ts` - Three.js runtime entry point.
- `src/three/gpgpu/` - pass runner, ping-pong targets, render target helpers.
- `src/three/materials/` - RawShaderMaterial wrappers for each pass.
- `src/three/scenes/` - terrain, water, post-process scenes.

## Phase Plan

### Phase 0: Inventory and Pass Graph

**Tasks**
- Enumerate all simulation passes and MRT outputs in `src/main.ts`.
- Enumerate textures and formats in `src/simulation/texture-management.ts`.
- Document a pass dependency graph (inputs, outputs, swaps).

**Done when**
- A pass graph and texture map document exists.

### Phase 1: Three.js Bootstrap

**Tasks**
- Create a Three.js entry point (suggest `src/three/main.ts`) and wire it into Vite.
- Initialize `THREE.WebGLRenderer` with WebGL2 context.
- Create a fullscreen quad scene and an orthographic camera for GPGPU passes.
- Create a basic terrain scene with a plane mesh to verify rendering.

**Done when**
- A blank terrain renders through Three.js with a working animation loop.

### Phase 2: GPGPU Pass Framework

**Tasks**
- Implement a minimal pass runner:
  - `GpgpuPass` (material + inputs + outputs)
  - `PingPongTarget` (two `WebGLRenderTarget`s and a swap)
  - `MRTRenderTarget` (for passes that write 2-4 outputs)
- Use `RawShaderMaterial` with `glslVersion: THREE.GLSL3`.
- Decide on attribute names:
  - Option A: update shaders to use `position` and `uv`.
  - Option B: keep `vs_Pos` and `vs_Uv` by defining custom geometry attributes.

**Done when**
- A simple pass (write a constant color) runs into a float render target and can be sampled by another pass.

### Phase 2.5: Combined Height Output (Raycast-Friendly)

**Tasks**
- Add a lightweight combine pass that outputs `combinedHeight = terrain + sediment + lava`.
- Read back the combined height buffer for CPU geometry updates (reuse existing throttling).
- Update the render terrain geometry from the combined height buffer.

**Done when**
- Rendered terrain and BVH raycast geometry match height exactly.

### Phase 3: Core Water Simulation Port

**Tasks**
- Port the following passes in order:
  - Rain precipitation
  - Flow (flux)
  - Water height and velocity
  - Sediment + terrain (MRT outputs)
  - Sediment advection (MacCormack and semi-Lagrangian)
  - Max slippage
  - Thermal flux and apply
  - Evaporation
  - Average smoothing
- Validate each pass by comparing GPU readbacks against the existing WebGL path for a small resolution.

**Done when**
- Water simulation produces stable terrain and sediment output comparable to current behavior.

### Phase 4: Lava Simulation Port

**Tasks**
- Port lava flow, lava update, lava-terrain interaction passes.
- Port lava source arrays and brush inputs.
- Validate temperature and volume behavior with simple scenarios.

**Done when**
- Lava flows, cools, melts, and solidifies similarly to the current pipeline.

### Phase 5: Rendering Pipeline Port

**Tasks**
- Render terrain with built-in materials:
  - `MeshStandardMaterial` or `MeshPhysicalMaterial`.
  - Optional `normalMap`/`roughnessMap` generated from existing textures.
- Render water with built-in materials:
  - `MeshPhysicalMaterial` + normal map animation.
  - Optional water height geometry update at lower frequency.
- Render lava as a separate mesh or overlay:
  - Use an emissive map generated by a small color-map pass.
  - Avoid per-pixel custom shading in the main scene.
- Use Three.js shadow maps and `EffectComposer` for post passes where possible.
- Only reintroduce custom scatter/blur passes if visuals require it.

**Done when**
- Visual output is close to the current build using mostly built-in rendering features.

### Phase 5.5: Steam Particle System (Lava/Water Interaction)

**Tasks**
- Add a contact mask pass (water/lava contact) to drive particle emission.
- Implement a GPU-updated particle system (position, velocity, lifetime) using ping-pong textures or `GPUComputationRenderer`.
- Render particles as instanced billboards or points with `PointsMaterial`/`SpriteMaterial`.
- Use the reference particle system in `research/webgpu_particles.html` as a visual guide (smoke-like motion and fade).

**Done when**
- Steam particles spawn only at active water/lava contact and fade out smoothly without large CPU costs.

### Phase 6: Interaction and Tools

**Tasks**
- Wire brush input and raycast.
  - Use `renderer.readRenderTargetPixels` for heightmap CPU buffer.
  - Preserve BVH raycast path where possible.
- Port heightmap import/export to Three.js render targets.
- Ensure GUI controls still map to uniforms and pass parameters.
- Keep brush palette UI and simulation controls parity (same options, shortcuts, and behaviors).

**Done when**
- Brush palette, sim controls, brush editing, and heightmap import/export behave the same as current.

### Phase 7: Performance and Validation

**Tasks**
- Measure memory usage for 1024, 2048, 4096 sim resolutions.
- Reduce texture count or precision where possible if needed.
- Add optional toggles for expensive passes (scattering, blur).
- Verify extension support and error reporting.

**Done when**
- The port runs at acceptable frame time at 1024 and 2048 on target hardware.

## Milestones

1. Three.js boot + single pass render target
2. Water sim parity at 512/1024
3. Lava sim parity at 512/1024
4. Visual pipeline parity (terrain, water, lava)
5. Tools parity (brushes, import/export, raycast)
