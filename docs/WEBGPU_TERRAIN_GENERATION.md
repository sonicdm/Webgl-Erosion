# WebGPU Terrain Generation Pipeline

## Status: In Progress

Terrain generation has been ported from GLSL fragment shaders to WebGPU compute shaders. 26 generator types run on the GPU via WGSL with full GUI parameter control.

---

## What Was Done

### Phase 1: TypeScript Terrain Module (`src/terrain/`)
- Class-based generator/mask/filter system with interfaces and registry pattern
- 25 generator classes, 16 masks, 6 filters, easing functions, noise utilities
- `HeightmapCache` for storing imported heightmaps at native resolution
- `GPUTerrainGeneratorParams` interface mirroring WGSL uniform struct

### Phase 2: WGSL Compute Shader (`terrain-generate.wgsl`)
- Ported all 12 original noise algorithms from `initial-frag.glsl`
- Added 14 THREE.Terrain generator ports (Perlin, Simplex, Diamond-Square, Fault, Hill, etc.)
- Imported heightmap support via `textureLoad` with bilinear interpolation
- 8 mask functions matching the legacy GLSL masks

### Phase 3: GPU Pipeline (`TerrainGeneratorCompute.ts`)
- Manages compute pipeline lifecycle (init, generate, dispose)
- Packs 32-field uniform buffer with proper i32/f32 alignment via `Int32Array` overlay
- Handles heightmap texture upload from cache
- Dispatches 8x8 workgroups across simulation resolution

### Phase 4: GUI Integration
- "Advanced Generator" subfolder with: Frequency, Amplitude, Octaves, Lacunarity, Persistence, Seed, Offset X/Y
- "Generator Specific" subfolder: Ridge Offset/Gain, Terrace Count, Domain Warp, Crater Density, Canyon Depth
- "Heightmap" subfolder: Amplitude, Invert
- All 26 generator types in TerrainBaseType dropdown

### Phase 5: main.ts Integration
- `terrainGeneratorCompute` initialized alongside `ComputeNodePipeline`
- `setTerrainRandom()` randomizes both legacy and WebGPU generators
- Dirty block: WebGPU path generates → clears aux → readback → seeds WebGL textures
- Legacy GLSL path preserved as fallback

### Phase 6: Generator Fixes & Per-Type Defaults
- **Voronoi**: Replaced `iqVoronoi` (smooth-weighted, flat output) with FBM-style layered voronoi using octaves/lacunarity/persistence. Produces distinct cell-based terrain.
- **Fault**: Rewrote to match THREE.Terrain.Fault — uses `freq * 80` iterations (default 200) with constant displacement and smooth cosine transitions instead of 32 iterations with 0.65 decay.
- **Weierstrass**: Ported faithful to THREE.Terrain — seed-derived random coefficients (r11-r24, dir1/dir2), exp(sin²) approach, UV scaled to vertex-index range.
- **Cosine**: Added seed-based phase offset so different seeds produce different terrain.
- **Hill/HillIsland**: Increased count from `octaves*8` (64) to `freq²*40` (default 160), closer to THREE.Terrain's 250 features.
- **Particles**: Replaced per-pixel particle simulation (broken in parallel compute) with noise-based approximation using clustered hill deposits over FBM base.
- **Per-generator defaults**: `GENERATOR_CONTROL_DEFAULTS` in `types.ts` maps each generator type ID to optimal parameter values (frequency, octaves, lacunarity, persistence, and type-specific params).
- **GUI auto-apply**: Selecting a terrain type in the dropdown immediately applies that type's default parameters and updates all Advanced Generator GUI controllers.

### Bug Fixes Applied
| Fix | Impact |
|-----|--------|
| `ComputeNodeHelpers` `sampleType: 'unfilterable-float'` | Eliminated 250+ validation errors/frame. `rgba32float` is unfilterable in WebGPU. |
| `ComputePass` explicit pipeline layouts | Fixed bind group layout mismatch. Pipelines now created with explicit layouts matching bind groups. |
| `terrain-generate.wgsl` sampler removal | `textureLoad` + manual bilinear instead of `textureSampleLevel`. |
| `TerrainGeneratorCompute` `packUniformData` | Fixed `d[i++]` → `d[30]`/`d[31]` for padding fields. |
| `main.ts` stale references | Fixed `setHightMapBufIsFresh()`/`setTerrainGeometryDirty()` → `appContext.simulationState.*`. |

---

## Architecture

```
controls (GUI)
    ↓
TerrainGeneratorCompute.updateParams()
    ↓
packUniformData() → Float32Array[32] (128 bytes)
    ↓
GPU uniform buffer → terrain-generate.wgsl compute shader
    ↓
textureStore → readTerrainTexture + writeTerrainTexture
    ↓
readback → heightMapCpuBuf (for BVH)
    ↓
copy → WebGL textures (for legacy rendering)
```

---

## Current State (What Works)

- All 26 generator types selectable in GUI with per-type default parameters
- Selecting a terrain type auto-applies optimal defaults (frequency, octaves, etc.)
- Advanced noise parameters exposed and update GPU uniforms on Reset
- Terrain generated via WebGPU compute → written to texture pool
- Readback to CPU for BVH raycasting
- WebGL legacy rendering receives data via CPU buffer upload
- Imported heightmap caching with resolution scaling
- Simulation compute passes (rain, flow, evaporation) use correct bind group layouts

---

## What Remains (Future Work)

### Immediate (Before Erosion Work)
- **Visual verification**: Confirm each generator type produces expected terrain visually. Voronoi, Fault, Weierstrass, Cosine, Hill, and Particles have been rewritten — need visual sign-off.
- **Tune per-type defaults**: `GENERATOR_CONTROL_DEFAULTS` in `types.ts` can be refined based on visual testing. Each entry can override frequency, octaves, lacunarity, persistence, and type-specific params.
- **Parameter reactivity**: Ensure changing GUI params triggers regeneration (currently requires Reset)
- **Remove legacy GLSL path**: Once WebGPU rendering is complete, remove `initial-frag.glsl` and `noiseterrain` shader

### Performance Optimizations
- **Reuse command encoders**: Currently creates new encoder per generate call. Could batch with simulation passes.
- **Avoid per-frame bind group creation**: Cache bind groups when textures haven't changed
- **Staging buffer pool**: Reuse readback staging buffers instead of create/destroy per readback
- **Skip WebGL copy**: Once rendering moves to WebGPU, the CPU→WebGL upload path is unnecessary
- **Lazy regeneration**: Only regenerate when params actually change, not on every Reset

### Architectural
- **Remove `cleanUpTextures()` WebGL path**: Currently clears legacy textures via 17x `Render2Texture` calls even when using WebGPU. Should use `clearAuxiliaryTextures()` exclusively.
- **Move terrain random state to controls**: `terrainRandom` object is separate from `controls` object. Unify so all state flows through one path.
- **GPU-side heightmap scaling**: Currently heightmap cache scales on CPU before upload. Could do bilinear scaling in the WGSL shader directly (already implemented for the textureLoad path).

---

## Key Files

| File | Role |
|------|------|
| `src/rendering/webgpu/compute/shaders/terrain-generate.wgsl` | All noise/generation algorithms (WGSL) |
| `src/rendering/webgpu/compute/TerrainGeneratorCompute.ts` | GPU pipeline manager |
| `src/terrain/types.ts` | `GPUTerrainGeneratorParams`, `TERRAIN_GENERATOR_TYPES`, `GENERATOR_CONTROL_DEFAULTS` |
| `src/gui/gui-setup.ts` | GUI controls for all parameters |
| `src/main.ts` | Bootstrap, Reset, dirty block integration |
| `src/simulation/WebGPUTexturePool.ts` | Texture management + `clearAuxiliaryTextures()` |
| `src/rendering/webgpu/compute/ComputePass.ts` | Base class with explicit layout support |
| `src/rendering/webgpu/compute/ComputeNodePipeline.ts` | Simulation passes (rain/flow/evaporation) |
| `src/terrain/HeightmapCache.ts` | Imported heightmap caching |

## Uniform Buffer Layout (128 bytes)

32 fields, vec4-aligned. Integer fields (`generatorType`, `maskType`, `octaves`, `useHeightmap`, `heightmapInvert`) written via `Int32Array` overlay on shared `ArrayBuffer`.

---

## Ideal Outcome

Terrain generation is a solved problem before erosion work begins. Users select any of 26+ generator types, tweak noise parameters in real-time, import heightmaps, and hit Reset to see results. The erosion simulation then operates on the generated terrain without fighting the generation pipeline. No GLSL/WebGL dependencies remain in the generation path.
