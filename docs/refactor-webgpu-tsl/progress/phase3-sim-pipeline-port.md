# Phase 3 — Simulation Pipeline Port

## Status: In Progress

## Goals
- Port all simulation passes to WGSL compute shaders.
- Establish ping-pong heightmap targets in WebGPU.
- Adapt TerrainReadbackService to WebGPU targets.

## Completed
- [x] Port rain pass to ComputeNode.
- [x] Port flow pass to ComputeNode.
- [x] Port evaporation pass to ComputeNode.
- [x] Implement heightmap ping-pong targets in WebGPU path.
- [x] Update readback/health checks for WebGPU.

## Remaining Passes

### Pass 1: Water Height / Velocity (`alterwaterhight-frag.glsl`)
- **Complexity:** Medium — 2 output textures, flux-based shallow-water velocity
- **Algorithm:**
  - Read flux from 4 neighbors → compute net in/out flow
  - Update water height: `d2 = max(0, d1 + timestep*(fin-fout)/(pipeLen²))`
  - Velocity from flux divergence: `vel = (leftFlux.y - outFlux.w + outFlux.y - rightFlux.w) / (2 * avgWater * pipeLen)`
  - Semi-Lagrangian velocity advection inline (back-trace + blend with `u_VelAdvMag`)
  - Clamp velocity to zero when water < 0.01
- **Bindings:** readFlux, readTerrain, readVel (sampled) → writeTerrain, writeVel (storage) + uniforms
- **Uniforms:** `{ simRes, pipeLen, timestep, pipeArea, velMult, time, velAdvMag }` (7 floats)
- **Swaps:** `swapTerrainTextures()`, `swapVelTextures()`
- **Note:** Velocity advection (`veladvect-frag.glsl`) is kept inline here, matching the GLSL code

### Pass 2: Sediment Transport (`sediment-frag.glsl`)
- **Complexity:** High — 4 output textures, rock erosion resistance system
- **Algorithm:**
  - Normal from 4-neighbor height diffs → slope: `sqrt(1 - normal.y²)`
  - Sediment capacity: `Kc * slope * velocity`
  - Rock system: resistance factor from B channel, base surface tracking (W channel), neighbor rock crevice boost
  - Erosion (cap > sed): `changesedi = (cap - sed) * Ks * rockFactor`
  - Deposition (cap < sed): `changesedi = (sed - cap) * Kd`
  - Rock spreading (many conditions: no water, no flow, not recently rock, depth > 0.2)
  - Rock-to-soil conversion: 1% per frame max, 5% of erosion amount
- **Bindings:** readTerrain, readVelocity, readSediment (sampled) → writeTerrain, writeSediment, writeTerrainNormal, writeVelocity (storage) + uniforms
- **Uniforms:** `{ simRes, pipeLen, Ks, Kc, Kd, timestep, time, rockErosionResistance }` (8 floats)
- **Swaps:** `swapTerrainTextures()`, `swapSedimentTextures()`, `swapVelTextures()`
- **Note:** terrainNorTexture is single (no ping-pong), overwritten each frame

### Pass 3: Sediment Advection — Simple (`sediadvect-frag.glsl`)
- **Complexity:** Low-Medium — 3 outputs, semi-Lagrangian advection
- **Algorithm:**
  - Back-trace: `oldloc = uv - (vel/simRes * advectMult * 0.5) * timestep`
  - Sample sediment at old location
  - Blend EMA: `blend = (blend * 1660 + curSedi * water * 0.1) / 1661`
- **Bindings:** readVel, readSediment, readSedimentBlend, readTerrain (sampled) → writeSediment, writeVel, writeSedimentBlend (storage) + uniforms
- **Uniforms:** `{ simRes, timestep, advectMultiplier }` (3 floats)
- **Swaps:** `swapSedimentTextures()`, `swapSedimentBlendTextures()`, `swapVelTextures()`

### Pass 3b: MacCormack Correction (`maccormack-frag.glsl`)
- **Complexity:** Medium — 3 sub-passes
- **MacCormack scheme:**
  1. Forward advect → `sedimentAdvectA`
  2. Backward advect → `sedimentAdvectB`
  3. Correction: `result = advectA + 0.5*(current - advectB)`, clamped to 4-neighbor min/max
- **Bindings (step 3):** readVel, readSediment, sedimentAdvectA, sedimentAdvectB (sampled) → writeSediment (storage) + uniforms
- **Implementation:** Branch on `controls.AdvectionMethod`: MacCormack (1) = 3 dispatches, Simple (0) = 1 dispatch

### Pass 5: Max Slippage (`maxslippageheight-frag.glsl`)
- **Complexity:** Low — single output, 4-neighbor stencil
- **Algorithm:**
  - `avgDiff = avg(neighbor heights) - current height`
  - `result = max(talusScale - 10 * max(|avgDiff| - talusScale*0.01, 0), 0)`
- **Bindings:** readTerrain (sampled) → writeMaxSlippage (storage) + uniforms
- **Uniforms:** `{ simRes, talusScale }` (2 floats)
- **Swaps:** `swapMaxSlippageTextures()`

### Pass 6: Thermal Flux (`thermalterrainflux-frag.glsl`)
- **Complexity:** Low-Medium — 4-neighbor stencil with slippage constraint
- **Algorithm:**
  - `diff = curHeight - neighborHeight - avg(curSlippage, neighborSlippage)/2` per direction
  - `newFlow = max(0, diff) * 1.2`
  - Scale if total outflow > terrain height
- **Bindings:** readTerrain, readMaxSlippage (sampled) → writeTerrainFlux (storage) + uniforms
- **Uniforms:** `{ simRes, pipeLen, timestep, pipeArea, thermalRate }` (5 floats)
- **Swaps:** `swapTerrainFluxTextures()`

### Pass 7: Thermal Apply (`thermalapply-frag.glsl`)
- **Complexity:** Low — flux integration
- **Algorithm:**
  - `inputFlux = (top.z, right.w, bottom.x, left.y)` from neighbors
  - `vol = sum(input) - sum(output)`
  - `height += min(50, timestep * thermalScale) * vol`
- **Bindings:** readTerrainFlux, readTerrain (sampled) → writeTerrain (storage) + uniforms
- **Uniforms:** `{ simRes, pipeLen, timestep, pipeArea, thermalErosionScale }` (5 floats)
- **Swaps:** `swapTerrainTextures()`

### Pass 8: Average Smoothing (`average-frag.glsl`)
- **Complexity:** Medium — 8-neighbor stencil, adaptive threshold
- **Algorithm:**
  - 8 neighbors (diagonal weight 0.707), compute height diffs
  - Threshold: Mountain(1)=`avgDiff/2`, Polygonal(2)=`pow(avgDiff,3)`, Default(0)=0.1
  - Smooth if opposite diffs both > threshold AND same sign
  - Weighted average with center weight 8.0
- **Bindings:** readTerrain (sampled) → writeTerrain, writeAvg (storage) + uniforms
- **Uniforms:** `{ simRes, erosionMode }` (2 values: f32 + i32)
- **Swaps:** `swapTerrainTextures()`

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/rendering/webgpu/compute/ComputeNodePipeline.ts` | Add WGSL shader strings + implement all TODO pass methods |
| `src/simulation/SimulatePerStepWebGPU.ts` | Uncomment/wire passes 2-7, 10 with correct uniforms and texture swaps |
| `src/simulation/WebGPUTexturePool.ts` | Verify all swap methods exist |
| `docs/refactor-webgpu-tsl/PROGRESS.md` | Update Phase 3 status |

## Implementation Order

1. **Water Height Pass** — enables water movement beyond rain/flow
2. **Sediment Pass** — core erosion engine (largest shader)
3. **Sediment Advection (Simple)** — sediment transport
4. **MacCormack Advection** — higher-quality advection option
5. **Max Slippage** — prerequisite for thermal erosion
6. **Thermal Flux + Apply** — secondary erosion system
7. **Average Smoothing** — ridge/ravine cleanup
8. **Update Docs** — mark Phase 3 complete

## Architecture Notes

### MRT in Compute Shaders
Fragment shaders use `layout(location=N)` for MRT. Compute shaders use separate `texture_storage_2d<rgba32float, write>` bindings per output. No special MRT handling needed — just more bindings.

### Pattern Per Pass
```
1. Create pipeline + bind group layout (cached, lazy init)
2. Pack uniform data into Float32Array
3. Create/update uniform buffer
4. Create bind group with current frame's textures
5. Encode + dispatch compute pass (8x8 workgroups)
6. Submit command buffer
```

### Inline WGSL
Keep WGSL inline in `ComputeNodePipeline.ts` for consistency with existing rain/flow/evap passes.

---

## Verification

- [x] `npm run test:ci` (Passes - infrastructure tests complete)
- [x] `npm run build` (Builds successfully)
- [x] `npx tsc -p tsconfig.json --noEmit` (TS/TSX typecheck passes)
- [x] MCP browser test (Simulation runs, terrain renders via WebGL2 bridge)
- [ ] Water flows downhill and pools in valleys
- [ ] Terrain erodes where water flows fast
- [ ] Sediment deposits where water slows
- [ ] Thermal erosion smooths steep cliffs
- [ ] Rock brush resists erosion
- [ ] Debug views (sediment, velocity, flux, terrainflux, maxslippage, rockMaterial) all functional
