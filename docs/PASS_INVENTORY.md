# Simulation Pass Inventory

This document provides a complete inventory of all simulation passes, their execution order, inputs, outputs, and dependencies.

## Pass Execution Order

All passes execute in `SimulatePerStep` function in `src/main.ts`. The order below matches the exact execution sequence.

### 0. Rain Precipitation
- **Shader**: `rain-frag.glsl`
- **Inputs**:
  - `read_terrain_tex` (TEXTURE0)
- **Outputs**:
  - `write_terrain_tex` (single output, COLOR_ATTACHMENT0)
- **Uniforms**:
  - `raindeg` (from controls.RainDegree)
- **Ping-pong swap**: `swapTerrainTextures()` after pass

### 1. Flow (Flux)
- **Shader**: `flow-frag.glsl`
- **Inputs**:
  - `read_terrain_tex` (TEXTURE0)
  - `read_flux_tex` (TEXTURE1)
  - `read_sediment_tex` (TEXTURE2)
- **Outputs**:
  - `write_flux_tex` (single output, COLOR_ATTACHMENT0)
- **Ping-pong swap**: `swapFluxTextures()` after pass

### 2. Water Height/Velocity
- **Shader**: `alterwaterhight-frag.glsl`
- **Inputs**:
  - `read_terrain_tex` (TEXTURE0)
  - `read_flux_tex` (TEXTURE1)
  - `read_sediment_tex` (TEXTURE2)
  - `read_vel_tex` (TEXTURE3)
- **Outputs**:
  - `write_terrain_tex` (COLOR_ATTACHMENT0)
  - `write_vel_tex` (COLOR_ATTACHMENT1)
  - **MRT**: 2 outputs
- **Ping-pong swaps**: `swapTerrainTextures()`, `swapVelTextures()` after pass

### 3. Sediment
- **Shader**: `sediment-frag.glsl`
- **Inputs**:
  - `read_terrain_tex` (TEXTURE0)
  - `read_vel_tex` (TEXTURE1, uniform: `readVelocity`)
  - `read_sediment_tex` (TEXTURE2, uniform: `readSediment`)
  - `read_lava_tex` (TEXTURE4, uniform: `readLava`)
- **Outputs**:
  - `write_terrain_tex` (COLOR_ATTACHMENT0)
  - `write_sediment_tex` (COLOR_ATTACHMENT1)
  - `terrain_nor` (COLOR_ATTACHMENT2) - terrain normal map
  - `write_vel_tex` (COLOR_ATTACHMENT3)
  - **MRT**: 4 outputs
- **Ping-pong swaps**: `swapSedimentTextures()`, `swapTerrainTextures()`, `swapVelTextures()` after pass

### 4. Sediment Advection (Conditional)

#### Path A: MacCormack Advection (if `controls.AdvectionMethod == 1`)

**4.1 First Subpass** (`sediadvect-frag.glsl`):
- **Inputs**:
  - `read_vel_tex` (TEXTURE0, uniform: `vel`)
  - `read_sediment_tex` (TEXTURE1, uniform: `sedi`)
  - `read_sediment_blend` (TEXTURE2, uniform: `sediBlend`)
  - `read_terrain_tex` (TEXTURE3, uniform: `terrain`)
- **Outputs**:
  - `sediment_advect_a` (COLOR_ATTACHMENT0)
  - `write_vel_tex` (COLOR_ATTACHMENT1)
  - `write_sediment_blend` (COLOR_ATTACHMENT2)
  - **MRT**: 3 outputs
- **Uniforms**:
  - `unif_advectMultiplier` = 1

**4.2 Second Subpass** (`sediadvect-frag.glsl`):
- **Inputs**:
  - `read_vel_tex` (TEXTURE0, uniform: `vel`)
  - `sediment_advect_a` (TEXTURE1, uniform: `sedi`) - uses output from 4.1
  - `read_sediment_blend` (TEXTURE2, uniform: `sediBlend`)
  - `read_terrain_tex` (TEXTURE3, uniform: `terrain`)
- **Outputs**:
  - `sediment_advect_b` (COLOR_ATTACHMENT0)
  - `write_vel_tex` (COLOR_ATTACHMENT1)
  - `write_sediment_blend` (COLOR_ATTACHMENT2)
  - **MRT**: 3 outputs
- **Uniforms**:
  - `unif_advectMultiplier` = -1

**4.3 Third Subpass** (`maccormack-frag.glsl`):
- **Inputs**:
  - `read_vel_tex` (TEXTURE0, uniform: `vel`)
  - `read_sediment_tex` (TEXTURE1, uniform: `sedi`)
  - `sediment_advect_a` (TEXTURE2, uniform: `sediadvecta`)
  - `sediment_advect_b` (TEXTURE3, uniform: `sediadvectb`)
- **Outputs**:
  - `write_sediment_tex` (single output, COLOR_ATTACHMENT0)

#### Path B: Simple Advection (if `controls.AdvectionMethod != 1`)

**4.1 Single Pass** (`sediadvect-frag.glsl`):
- **Inputs**:
  - `read_vel_tex` (TEXTURE0, uniform: `vel`)
  - `read_sediment_tex` (TEXTURE1, uniform: `sedi`)
  - `read_sediment_blend` (TEXTURE2, uniform: `sediBlend`)
  - `read_terrain_tex` (TEXTURE3, uniform: `terrain`)
- **Outputs**:
  - `write_sediment_tex` (COLOR_ATTACHMENT0)
  - `write_vel_tex` (COLOR_ATTACHMENT1)
  - `write_sediment_blend` (COLOR_ATTACHMENT2)
  - **MRT**: 3 outputs
- **Uniforms**:
  - `unif_advectMultiplier` = 1

**Ping-pong swaps after advection** (both paths):
- `swapSedimentBlendTextures()`
- `swapSedimentTextures()`
- `swapVelTextures()`

### 5. Max Slippage
- **Shader**: `maxslippageheight-frag.glsl`
- **Inputs**:
  - `read_terrain_tex` (TEXTURE0)
- **Outputs**:
  - `write_maxslippage_tex` (single output, COLOR_ATTACHMENT0)
- **Ping-pong swap**: `swapMaxSlippageTextures()` after pass

### 6. Thermal Terrain Flux
- **Shader**: `thermalterrainflux-frag.glsl`
- **Inputs**:
  - `read_terrain_tex` (TEXTURE0)
  - `read_maxslippage_tex` (TEXTURE1)
- **Outputs**:
  - `write_terrain_flux_tex` (single output, COLOR_ATTACHMENT0)
- **Ping-pong swap**: `swapTerrainFluxTextures()` after pass

### 7. Thermal Apply
- **Shader**: `thermalapply-frag.glsl`
- **Inputs**:
  - `read_terrain_flux_tex` (TEXTURE0)
  - `read_terrain_tex` (TEXTURE1)
- **Outputs**:
  - `write_terrain_tex` (single output, COLOR_ATTACHMENT0)
- **Ping-pong swap**: `swapTerrainTextures()` after pass

### 8. Evaporation
- **Shader**: `eva-frag.glsl`
- **Inputs**:
  - `read_terrain_tex` (TEXTURE0, uniform: `terrain`)
- **Outputs**:
  - `write_terrain_tex` (single output, COLOR_ATTACHMENT0)
- **Uniforms**:
  - `evapod` (from controls.EvaporationConstant)
- **Ping-pong swap**: `swapTerrainTextures()` after pass

### 9. Lava Flow
- **Shader**: `lava-flow-frag.glsl`
- **Inputs**:
  - `read_terrain_tex` (TEXTURE0)
  - `read_lava_tex` (TEXTURE1)
  - `read_lava_flux_tex` (TEXTURE2)
- **Outputs**:
  - `write_lava_flux_tex` (single output, COLOR_ATTACHMENT0)
- **Uniforms**: Many lava physics constants (see shader for full list)
- **Ping-pong swap**: `swapLavaFluxTextures()` after pass
- **Note**: All textures are unbound before this pass to avoid feedback loops

### 10. Lava Update
- **Shader**: `lava-update-frag.glsl`
- **Inputs**:
  - `read_terrain_tex` (TEXTURE0)
  - `read_lava_tex` (TEXTURE1)
  - `read_lava_flux_tex` (TEXTURE2)
- **Outputs**:
  - `write_lava_tex` (single output, COLOR_ATTACHMENT0)
- **Uniforms**: Heat transfer constants, source arrays, brush inputs
- **Ping-pong swap**: `swapLavaTextures()` after pass

### 11. Lava-Terrain Interaction
- **Shader**: `lava-terrain-frag.glsl`
- **Inputs**:
  - `read_terrain_tex` (TEXTURE0)
  - `read_lava_tex` (TEXTURE1)
  - `read_lava_flux_tex` (TEXTURE2)
- **Outputs**:
  - `write_terrain_tex` (COLOR_ATTACHMENT0)
  - `write_lava_tex` (COLOR_ATTACHMENT1)
  - **MRT**: 2 outputs
- **Uniforms**: Thermal constants, source arrays
- **Ping-pong swaps**: `swapTerrainTextures()`, `swapLavaTextures()` after pass

### 12. Average Smoothing
- **Shader**: `average-frag.glsl`
- **Inputs**:
  - `read_terrain_tex` (TEXTURE0)
  - `read_sediment_tex` (TEXTURE1)
- **Outputs**:
  - `write_terrain_tex` (COLOR_ATTACHMENT0)
  - `terrain_nor` (COLOR_ATTACHMENT1) - updates terrain normal map
  - **MRT**: 2 outputs
- **Ping-pong swap**: `swapTerrainTextures()` after pass

## Pass Dependency Graph

```
Rain → Flow → WaterHeight → Sediment → Advection → MaxSlippage → ThermalFlux → ThermalApply → Evaporation → LavaFlow → LavaUpdate → LavaTerrain → Average
```

### Key Dependencies:
- **Flow** depends on: Rain (terrain)
- **WaterHeight** depends on: Flow (flux), Sediment (terrain)
- **Sediment** depends on: WaterHeight (terrain, velocity), Lava (for interaction)
- **Advection** depends on: Sediment (sediment, velocity)
- **MaxSlippage** depends on: Sediment (terrain)
- **ThermalFlux** depends on: MaxSlippage (terrain, maxslippage)
- **ThermalApply** depends on: ThermalFlux (terrain_flux, terrain)
- **Evaporation** depends on: ThermalApply (terrain)
- **LavaFlow** depends on: Evaporation (terrain), Lava (lava, lava_flux)
- **LavaUpdate** depends on: LavaFlow (terrain, lava, lava_flux)
- **LavaTerrain** depends on: LavaUpdate (terrain, lava, lava_flux)
- **Average** depends on: LavaTerrain (terrain), Sediment (sediment)

## MRT Passes Summary

- **2-output MRT**: WaterHeight, LavaTerrain, Average
- **3-output MRT**: SedimentAdvection (both paths)
- **4-output MRT**: Sediment

## Conditional Execution

- **Sediment Advection**: Path selection based on `controls.AdvectionMethod`
  - `AdvectionMethod == 1`: MacCormack (3 subpasses)
  - `AdvectionMethod != 1`: Simple (1 pass)

