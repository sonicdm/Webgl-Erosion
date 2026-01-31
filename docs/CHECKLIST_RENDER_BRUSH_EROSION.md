# Render / Brush / Erosion Checklist

## Phase 0: Ground Truth
- [x] Trace entrypoint (`src/main.ts`)
- [x] Map renderer initialization (WebGPU primary, WebGL2 offscreen)
- [x] Map scene graph (terrain mesh, water mesh, no skybox)
- [x] Map camera system (custom Camera + PerspectiveCamera + OrbitControls)
- [x] Map simulation pipeline (10-pass compute, WebGPUTexturePool ping-pong)
- [x] Map pool-to-Three sync (`copyPoolToThreeTextures`)
- [x] Map brush system (capture-phase events, raycast, brush-handler)
- [x] Map BVH system (build on generation, refit on brush release / interval)
- [x] Create ENGINEERING_FIX_LOG.md with architecture map
- [x] Create this checklist

## Phase 1: Basic Rendering
- [ ] Terrain renders with correct vertex displacement
- [ ] Terrain has procedural coloring (palette by height/slope/rock)
- [ ] Camera orbits and moves correctly (OrbitControls + WASD)
- [ ] Directional light affects terrain appearance
- [ ] Shadow mapping works (requires shadow pass or TSL shadow)
- [ ] Debug terrain views functional (sediment, velocity, flux, etc.)
- [ ] Terrain generates on page load (WebGPU compute terrain generator)
- [ ] Resolution change works (resize textures, rebuild BVH)

## Phase 2: Brushes
- [ ] Brush preview circle renders on terrain surface
- [ ] Sand brush raises/lowers terrain
- [ ] Water brush adds/removes water
- [ ] Rock brush paints rock material
- [ ] Smooth brush smooths terrain
- [ ] Flatten brush flattens to target height (fresh raycast on activate)
- [ ] Slope brush creates slope between two points
- [ ] Brush invert modifier works (hold to toggle add/subtract)
- [ ] Brush size scroll adjustment works (modifier + scroll)
- [ ] Slope brush gets fresh raycast on activation (currently missing)

## Phase 3: Skybox / Background
- [ ] Background color or sky renders behind terrain
- [ ] Rayleigh-Mie atmospheric scattering (or simplified alternative)
- [ ] Sky integrates with water reflections (Phase 4 dependency)

## Phase 4: Water Rendering
- [ ] Water mesh visible when water exists
- [ ] Water vertex displacement from heightmap water channel
- [ ] Depth-based opacity (shallow = transparent, deep = opaque)
- [ ] Fresnel effect (glancing angles more reflective)
- [ ] Specular highlights from directional light
- [ ] Sky reflection on water surface
- [ ] Sediment coloring in water

## Phase 5: Erosion Simulation
- [ ] Rain adds water to terrain
- [ ] Water flows downhill via flux model
- [ ] Water height updates correctly (shallow water equations)
- [ ] Sediment erodes where water flows fast
- [ ] Sediment deposits where water slows
- [ ] Sediment advection transports material with flow
- [ ] MacCormack advection option works (3-pass correction)
- [ ] Max slippage calculation correct
- [ ] Thermal flux computed from height differences
- [ ] Thermal erosion smooths steep slopes
- [ ] Evaporation reduces water over time
- [ ] Average smoothing reduces ridge/ravine artifacts
- [ ] Rock brush material resists erosion
- [ ] Debug views: sediment, velocity, flux, terrainflux, maxslippage, rockMaterial

## Phase 6: Edge Protection
- [ ] Thermal erosion does not erode terrain edges
- [ ] Boundary cells clamped or excluded from stencil operations

## Phase 7: BVH Sync
- [ ] BVH built on initial terrain generation
- [ ] BVH refit after brush stroke release
- [ ] BVH refit during active erosion (periodic, non-blocking)
- [ ] No GC spikes from heightmap copies during refit
- [ ] Raycast accuracy maintained during erosion

---

## Status Summary

| Phase | Status | Issues Found |
|-------|--------|-------------|
| 0 | Complete | 7 issues documented |
| 1 | Not Started | — |
| 2 | Not Started | — |
| 3 | Not Started | — |
| 4 | Not Started | — |
| 5 | Not Started | — |
| 6 | Not Started | — |
| 7 | Not Started | — |
