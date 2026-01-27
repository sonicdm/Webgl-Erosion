# Texture Inventory

This document provides a complete inventory of all textures used in the simulation, their formats, ping-pong relationships, and usage.

## Texture Format Specifications

All simulation textures use the following format:
- **Internal Format**: `RGBA32F` (32-bit float per channel)
- **Pixel Format**: `RGBA`
- **Pixel Type**: `FLOAT`
- **Min Filter**: `LINEAR`
- **Mag Filter**: `LINEAR`
- **Wrap S**: `CLAMP_TO_EDGE`
- **Wrap T**: `CLAMP_TO_EDGE`
- **Dimensions**: `simres x simres` (square, resolution-dependent)

All textures are created in `src/simulation/texture-management.ts` using `LE_create_texture()` function.

## Simulation Textures

### Terrain Textures (Ping-Pong)
- **`read_terrain_tex`** / **`write_terrain_tex`**
  - Stores: Base terrain height (R channel), water volume (G channel), other data (B, A)
  - Swapped by: `swapTerrainTextures()`
  - Used by: All passes that read/write terrain height
  - **Note**: After sediment pass, terrain includes deposited sediment

### Flux Textures (Ping-Pong)
- **`read_flux_tex`** / **`write_flux_tex`**
  - Stores: Water flux data (flow direction and magnitude)
  - Swapped by: `swapFluxTextures()`
  - Used by: Flow pass, WaterHeight pass

### Velocity Textures (Ping-Pong)
- **`read_vel_tex`** / **`write_vel_tex`**
  - Stores: Water velocity (XY channels)
  - Swapped by: `swapVelTextures()`
  - Used by: WaterHeight, Sediment, Advection passes

### Sediment Textures (Ping-Pong)
- **`read_sediment_tex`** / **`write_sediment_tex`**
  - Stores: Sediment amount (R channel)
  - Swapped by: `swapSedimentTextures()`
  - Used by: Flow, WaterHeight, Sediment, Advection, Average passes

### Sediment Blend Textures (Ping-Pong)
- **`read_sediment_blend`** / **`write_sediment_blend`**
  - Stores: Blended sediment data for advection
  - Swapped by: `swapSedimentBlendTextures()`
  - Used by: Advection passes

### Terrain Normal Texture (Single, Updated)
- **`terrain_nor`**
  - Stores: Terrain normal map (XYZ channels)
  - Updated by: Sediment pass (COLOR_ATTACHMENT2), Average pass (COLOR_ATTACHMENT1)
  - Used by: Rendering (terrain shading)
  - **Note**: Not ping-pong, directly updated

### Max Slippage Textures (Ping-Pong)
- **`read_maxslippage_tex`** / **`write_maxslippage_tex`**
  - Stores: Maximum slippage angle data for thermal erosion
  - Swapped by: `swapMaxSlippageTextures()`
  - Used by: MaxSlippage pass, ThermalTerrainFlux pass

### Terrain Flux Textures (Ping-Pong, Thermal)
- **`read_terrain_flux_tex`** / **`write_terrain_flux_tex`**
  - Stores: Thermal terrain flux data
  - Swapped by: `swapTerrainFluxTextures()`
  - Used by: ThermalTerrainFlux pass, ThermalApply pass

### Lava Textures (Ping-Pong)
- **`read_lava_tex`** / **`write_lava_tex`**
  - Stores: Lava volume (R channel), temperature (G channel), other data (B, A)
  - Swapped by: `swapLavaTextures()`
  - Used by: Sediment, LavaFlow, LavaUpdate, LavaTerrain passes

### Lava Flux Textures (Ping-Pong)
- **`read_lava_flux_tex`** / **`write_lava_flux_tex`**
  - Stores: Lava flow flux data
  - Swapped by: `swapLavaFluxTextures()`
  - Used by: LavaFlow, LavaUpdate, LavaTerrain passes

### Sediment Advection Intermediate Textures (Single, No Ping-Pong)
- **`sediment_advect_a`**
  - Stores: Intermediate result from first MacCormack subpass
  - Used by: MacCormack advection path only
  - **Note**: Not ping-pong, used as intermediate storage

- **`sediment_advect_b`**
  - Stores: Intermediate result from second MacCormack subpass
  - Used by: MacCormack advection path only
  - **Note**: Not ping-pong, used as intermediate storage

## Screen-Space Textures (Rendering)

These textures use the same format but with screen resolution (`window.innerWidth x window.innerHeight`):

- **`shadowMap_tex`**: Shadow map (resolution: `shadowMapResolution x shadowMapResolution`)
- **`scene_depth_tex`**: Scene depth buffer
- **`bilateral_filter_horizontal_tex`**: Bilateral blur horizontal pass
- **`bilateral_filter_vertical_tex`**: Bilateral blur vertical pass
- **`color_pass_tex`**: Color pass output
- **`color_pass_reflection_tex`**: Reflection pass output
- **`scatter_pass_tex`**: Scattering pass output

## Height Map Texture (Import/Export)

- **`heightmap_tex`**: External height map for import (nullable)
  - Set via: `setHeightMapTexture()`
  - Retrieved via: `getHeightMapTexture()`
  - Used by: Initial terrain generation

## Ping-Pong Relationships

### Active Ping-Pong Pairs:
1. **Terrain**: `read_terrain_tex` ↔ `write_terrain_tex`
2. **Flux**: `read_flux_tex` ↔ `write_flux_tex`
3. **Velocity**: `read_vel_tex` ↔ `write_vel_tex`
4. **Sediment**: `read_sediment_tex` ↔ `write_sediment_tex`
5. **Sediment Blend**: `read_sediment_blend` ↔ `write_sediment_blend`
6. **Max Slippage**: `read_maxslippage_tex` ↔ `write_maxslippage_tex`
7. **Terrain Flux**: `read_terrain_flux_tex` ↔ `write_terrain_flux_tex`
8. **Lava**: `read_lava_tex` ↔ `write_lava_tex`
9. **Lava Flux**: `read_lava_flux_tex` ↔ `write_lava_flux_tex`

### Non-Ping-Pong Textures:
- **`terrain_nor`**: Directly updated (not ping-pong)
- **`sediment_advect_a`**: Intermediate storage (MacCormack only)
- **`sediment_advect_b`**: Intermediate storage (MacCormack only)

## Texture Memory Calculation

For a simulation resolution of `simres`:
- **Per texture**: `simres × simres × 4 channels × 4 bytes = simres² × 16 bytes`
- **Total simulation textures**: 22 textures (11 ping-pong pairs)
- **Memory at 4096×4096**: `4096² × 16 × 22 = 5,899,345,920 bytes ≈ 5.5 GB`
- **Memory at 2048×2048**: `2048² × 16 × 22 = 1,474,836,480 bytes ≈ 1.4 GB`
- **Memory at 1024×1024**: `1024² × 16 × 22 = 368,709,120 bytes ≈ 351 MB`
- **Memory at 512×512**: `512² × 16 × 22 = 92,177,408 bytes ≈ 88 MB`

## Texture Usage by Pass

| Pass | Reads | Writes | Swaps After |
|------|-------|--------|-------------|
| Rain | terrain | terrain | terrain |
| Flow | terrain, flux, sediment | flux | flux |
| WaterHeight | terrain, flux, sediment, vel | terrain, vel | terrain, vel |
| Sediment | terrain, vel, sediment, lava | terrain, sediment, terrain_nor, vel | terrain, sediment, vel |
| Advection (MacCormack) | vel, sediment, sediment_blend, terrain | sediment_advect_a/b, vel, sediment_blend → sediment | sediment_blend, sediment, vel |
| Advection (Simple) | vel, sediment, sediment_blend, terrain | sediment, vel, sediment_blend | sediment_blend, sediment, vel |
| MaxSlippage | terrain | maxslippage | maxslippage |
| ThermalFlux | terrain, maxslippage | terrain_flux | terrain_flux |
| ThermalApply | terrain_flux, terrain | terrain | terrain |
| Evaporation | terrain | terrain | terrain |
| LavaFlow | terrain, lava, lava_flux | lava_flux | lava_flux |
| LavaUpdate | terrain, lava, lava_flux | lava | lava |
| LavaTerrain | terrain, lava, lava_flux | terrain, lava | terrain, lava |
| Average | terrain, sediment | terrain, terrain_nor | terrain |

