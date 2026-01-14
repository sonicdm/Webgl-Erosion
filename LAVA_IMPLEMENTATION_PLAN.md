# Comprehensive Lava System Implementation Plan

## Overview

This document consolidates all lava simulation features, implementation details, architecture, and known issues for the WebGL Erosion project. The lava system implements physics-based flow with temperature-dependent viscosity, thermal erosion, water interaction, and solidification.

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Physics Implementation](#physics-implementation)
4. [Shader Details](#shader-details)
5. [Texture Structure](#texture-structure)
6. [User Interface](#user-interface)
7. [Known Issues](#known-issues)
8. [File Structure](#file-structure)

---

## Features

### Core Functionality

- **Physics-Based Lava Flow**: Temperature-dependent viscosity using Arrhenius viscosity law
- **Flow Speed**: Lava flows 2-10x slower than water (relative to water simulation, not real-world ratios)
- **Temperature System**: Lava temperature ranges from 800°C (solidification) to 1200°C (initial)
- **Cooling System**: 
  - Air cooling: ~1-2 minutes from 1200°C to 800°C
  - Water cooling: 10x faster than air cooling
- **Water Interaction**: 
  - Hot lava rapidly cools when in contact with water
  - Water evaporates when in contact with hot lava (10x evaporation rate)
  - Water erosion is prevented under hot lava (lava protects terrain)
- **Thermal Erosion**: Hot lava (above 1200°C) melts terrain, carving channels
- **Solidification**: Cooled lava (below 800°C) solidifies into rock material, filling channels
- **Visual Effects**: 
  - Temperature-based color gradient (orange/yellow/red)
  - Glow intensity based on temperature
  - Animated flow patterns using FBM noise
  - Color overflow effects (inspired by Three.js lava shader)
  - Steam effects for water evaporation

### User Controls

- **Lava Brush** (Brush Type 7): Add or remove lava at high temperature (1200°C)
  - Press `7` or select from brush palette
  - Left Click: Add lava
  - Shift + Click: Remove lava
- **Lava Sources**: Permanent lava sources (similar to water sources)
  - Press `l` to place a permanent lava source at cursor location
  - Press `Shift + l` to remove the nearest permanent lava source
  - Press `p` to remove all permanent sources (both water and lava)
  - Orange/red glow marks the location of permanent lava sources
  - Size and strength match the brush size and strength when placed

### Debug Views

- **lavaVolume (11)**: Lava volume visualization (red intensity)
- **lavaTemperature (12)**: Lava temperature gradient (blue=800°C to red=1200°C)
- **lavaTempVolume (13)**: Combined lava temperature and volume
- **waterLavaContact (14)**: Water-lava contact zones (magenta=contact, blue=water, red=lava)
- **rockLayering (15)**: Rock material with sediment layering (yellow/orange=sediment on rock, gray=rock)

---

## Architecture

### Simulation Flow

The lava simulation consists of three main passes executed sequentially each frame:

```
1. Lava Flow Calculation
   Input: terrain map + lava map
   Output: lava flux map
   
2. Lava Volume Update
   Input: lava map + lava flux map
   Output: lava map (with temperature updates)
   
3. Lava-Terrain Interaction
   Input: terrain map + lava map
   Output: terrain map (with melting/solidification) + lava map (with solidified parts removed)
```

### Texture Pairs (Ping-Pong Buffers)

- `read_lava_tex` / `write_lava_tex`: Lava information map
  - **R channel**: Lava volume
  - **G channel**: Lava temperature (normalized 800-1200°C range)
  
- `read_lava_flux_tex` / `write_lava_flux_tex`: Lava flux information
  - **R channel**: Flux toward up direction (fT)
  - **G channel**: Flux toward right direction (fR)
  - **B channel**: Flux toward bottom direction (fB)
  - **A channel**: Flux toward left direction (fL)

### Integration Points

- **Main Simulation Loop**: Lava passes are integrated into `SimulatePerStep()` in `src/main.ts`
- **Texture Management**: Lava textures are created and managed in `src/simulation/texture-management.ts`
- **Shader Factory**: Lava shaders are created in `src/rendering/shader-factory.ts`
- **Event Handlers**: Lava source placement handled in `src/events/event-handlers.ts`
- **GUI Setup**: Lava physics parameters added to GUI in `src/gui/gui-setup.ts`

---

## Physics Implementation

### Arrhenius Viscosity Law

Lava viscosity depends on temperature using the Arrhenius equation:

```
η(T) = A * exp(E_a / (R * T))
```

Where:
- `A` = Pre-exponential factor (`LavaViscosityPreExp`, default: 1e-5)
- `E_a` = Activation energy (`LavaActivationEnergy`, default: 200000 J/mol)
- `R` = Gas constant (8.314 J/(mol·K))
- `T` = Temperature in Kelvin (Celsius + 273.15)

**Flow Speed Scaling**: To keep lava flow speeds in the same ballpark as water (2-10x slower), the effective pipe length is modified:

```
effectivePipeLen = pipelen * pow(viscosityRatio, 0.18)
viscosityScaleFactor = clamp(pow(viscosityRatio, 0.18), 1.0, 12.0)
```

This ensures lava flows 2-12x slower than water, not orders of magnitude slower.

### Newton's Law of Cooling

Temperature cooling follows Newton's law of cooling:

```
dT/dt = -(h * A * (T - T_ambient)) / (m * c_p)
```

Where:
- `h` = Heat transfer coefficient (air or water)
- `A` = Surface area (accounts for thin flows with up to 10x multiplier)
- `T` = Current temperature
- `T_ambient` = Ambient temperature (air or water)
- `m` = Mass (volume * density)
- `c_p` = Specific heat capacity

**Cooling Multipliers**:
- Air cooling: `LavaAirHeatTransfer` (default: 200 W/(m²·K)) with 2x multiplier for ambient cooling
- Water cooling: `LavaWaterHeatTransfer` (default: 2000 W/(m²·K)) with 10x multiplier
- Flowing lava: Up to 5x faster cooling based on flow speed
- Thin flows (edges): Up to 10x faster cooling for very thin flows (< 0.005 volume)

### Thermal Erosion (Melting)

Hot lava melts terrain through thermal erosion:

```
Heat flux: Q = h_contact * A * (T_lava - T_melt)
Melting rate: dm/dt = Q / L_f
```

Where:
- `h_contact` = Contact heat transfer coefficient (`LavaContactHeatTransfer`, default: 200 W/(m²·K))
- `T_melt` = Melting threshold (`LavaMeltThreshold`, default: 1200°C)
- `L_f` = Latent heat of fusion (`LavaLatentHeatFusion`, default: 400000 J/kg)

Melted terrain is marked as rock material.

### Water Evaporation

Hot lava evaporates water when in contact:

```
1. Heat water to boiling point: Q1 = m_water * c_water * (100 - T_water)
2. Vaporize water: Q2 = m_water * L_v
3. Total energy needed: Q_total = Q1 + Q2
4. Energy available: Q_available = h_water * A * (T_lava - T_water) * dt
5. Water vaporized: m_vaporized = min(Q_available / Q_total, m_water) * 10.0
```

Where:
- `L_v` = Latent heat of vaporization (2,260,000 J/kg)
- Multiplier of 10.0 for visible effect
- 20x boost when water is directly on top of lava

### Solidification

Cooled lava solidifies into rock material:

```
Solidification rate = baseRate * (1.0 + tempFactor * (solidificationTemp - lavaTemp) / 100.0)
```

Where:
- `baseRate` = 0.1 (base solidification rate)
- `tempFactor` = 1.0 (temperature factor)
- `solidificationTemp` = 800°C (solidification temperature)
- Rate capped at 0.2 maximum

Solidified lava:
- Converts to rock material (scale factor 1.0, value 0.5-1.0)
- Raises terrain height to fill channels
- Removed from liquid lava volume

---

## Shader Details

### 1. Lava Flow Shader (`src/shaders/lava-flow-frag.glsl`)

**Purpose**: Calculate lava flux based on terrain height, lava volume, and temperature-dependent viscosity.

**Inputs**:
- `readTerrain`: Terrain texture (height, water, rock, base rock surface)
- `readLava`: Lava texture (volume, temperature)
- `readLavaFlux`: Previous frame's lava flux

**Outputs**:
- `writeLavaFlux`: New lava flux (4 directions)

**Key Logic**:
1. Sample terrain and lava data for current cell and neighbors
2. Calculate height differences (terrain + lava volume)
3. Convert temperature to Kelvin
4. Calculate viscosity using Arrhenius law
5. Calculate viscosity ratio (relative to water)
6. Scale effective pipe length based on viscosity
7. Calculate flux for each direction: `flux = (height_diff * gravity * area) / (effectivePipeLen)`
8. Allow fresh lava to flow over solidified rock (treat as zero lava height)
9. Clamp height differences to prevent uphill flow
10. Reset flux to 0.0 if height difference is non-positive

**Uniforms**:
- `u_LavaViscosityPreExp`: Pre-exponential factor
- `u_LavaActivationEnergy`: Activation energy
- `u_LavaDensity`: Lava density
- `u_LavaGasConstant`: Gas constant (8.314)

### 2. Lava Update Shader (`src/shaders/lava-update-frag.glsl`)

**Purpose**: Update lava volume based on flux and apply temperature cooling.

**Inputs**:
- `readTerrain`: Terrain texture
- `readLava`: Current lava texture
- `readLavaFlux`: Lava flux texture

**Outputs**:
- `writeLava`: Updated lava texture (volume, temperature)

**Key Logic**:
1. Calculate volume change from flux (inflow - outflow)
2. Update lava volume: `newVolume = currentVolume + deltaVolume`
3. Mix temperatures when fresh lava flows into existing lava
4. Check for water contact (current pixel and neighbors)
5. Calculate surface area (accounts for thin flows)
6. Apply Newton's law of cooling (air or water)
7. Apply cooling boost for flowing lava (based on flow speed)
8. Apply cooling boost for thin flows (edges of pools)
9. Handle lava brush (brush type 7)
10. Handle lava sources with FBM noise variation

**Uniforms**:
- `u_LavaAirHeatTransfer`: Air heat transfer coefficient
- `u_LavaWaterHeatTransfer`: Water heat transfer coefficient
- `u_LavaAmbientTemp`: Ambient air temperature
- `u_LavaWaterTemp`: Water temperature
- `u_LavaDensity`: Lava density
- `u_LavaSpecificHeat`: Specific heat capacity
- `u_LavaInitialTemp`: Initial temperature for new lava
- `u_Time`: Time for source variation
- `u_LavaSourceCount`: Number of lava sources
- `u_LavaSourcePositions[]`: Lava source positions
- `u_LavaSourceSizes[]`: Lava source sizes
- `u_LavaSourceStrengths[]`: Lava source strengths
- Brush uniforms (mouse position, brush size, strength, type, etc.)

### 3. Lava-Terrain Interaction Shader (`src/shaders/lava-terrain-frag.glsl`)

**Purpose**: Handle lava interaction with terrain (melting, water evaporation, solidification).

**Inputs**:
- `readTerrain`: Terrain texture
- `readLava`: Lava texture

**Outputs**:
- `writeTerrain`: Updated terrain texture (height, rock material)
- `writeLava`: Updated lava texture (with solidified parts removed)

**Key Logic**:
1. **Melting (Thermal Erosion)**:
   - If lava temp > melt threshold (1200°C)
   - Calculate heat flux
   - Calculate melting rate
   - Reduce terrain height
   - Mark melted areas as rock material

2. **Water Evaporation**:
   - Check for water contact (current pixel and neighbors)
   - Calculate heat transfer from lava to water
   - Calculate energy to heat water to boiling
   - Calculate energy for vaporization
   - Reduce water volume (20x boost when water directly on top)

3. **Solidification**:
   - If lava temp < solidification temp (800°C)
   - Calculate temperature-dependent solidification rate
   - Convert solidified volume to rock material
   - Raise terrain height (only solidified volume, not liquid lava)
   - Remove solidified volume from liquid lava

**Uniforms**:
- `u_LavaContactHeatTransfer`: Contact heat transfer coefficient
- `u_LavaMeltThreshold`: Melting threshold temperature
- `u_LavaLatentHeatFusion`: Latent heat of fusion
- `u_LavaSolidificationTemp`: Solidification temperature
- `u_LavaDensity`: Lava density
- `u_LavaWaterTemp`: Water temperature

### 4. Terrain Rendering Shader (`src/shaders/terrain-frag.glsl`)

**Lava Rendering Logic**:
1. Sample lava texture (if enabled)
2. Validate lava data (volume 0-10.0, temp 0-2000°C)
3. Calculate temperature-normalized value (0-1 range)
4. Generate animated flow patterns using FBM noise
5. Multi-stage color gradient (yellow-orange to deep red)
6. Apply flow pattern variation
7. Self-multiplication effect (color * color - 0.1)
8. Volume-based brightness
9. Color overflow effects (channels exceeding 1.0 bleed into others)
10. Make lava fully opaque (replace surface color)
11. Add emissive glow based on temperature

**Steam Effect**:
- Triggered when lava + water + hot temp (> 800°C)
- Uses FBM noise for density variation
- Time-based animation
- Color gradients (white to light gray)
- Alpha blending

**Uniforms**:
- `lavamap`: Lava texture sampler
- `u_LavaGlowIntensity`: Glow intensity multiplier
- `u_Time`: Time for animation
- `u_LavaSolidificationTemp`: Solidification temperature
- `u_LavaEnabled`: Flag to enable/disable lava rendering

### 5. Terrain Vertex Shader (`src/shaders/terrain-vert.glsl`)

**Lava Pooling**:
- Samples `lavamap` texture
- Extracts lava volume from R channel
- Validates lava data (volume 0-10.0, temp 0-2000°C)
- Adds lava volume to height calculation: `(yval + sval + wval + lval)/u_SimRes`
- This allows lava to pool like water

**Resolved Issue**: Ghosting was caused by the scene depth pass using `terrain-vert.glsl` without binding `lavamap` (and other terrain textures). The sampler defaulted to unit 0, inflating depth in the scatter pass. Binding the correct textures for the depth pass fixes it.

---

## Texture Structure

### Lava Textures

**`read_lava_tex` / `write_lava_tex`**:
- Format: RGBA32F
- Size: `simres × simres`
- Channels:
  - **R**: Lava volume (0.0 to ~10.0)
  - **G**: Lava temperature in Celsius (800-1200°C range, but can go lower for solidification)
  - **B**: Unused (0.0)
  - **A**: Unused (0.0)

**`read_lava_flux_tex` / `write_lava_flux_tex`**:
- Format: RGBA32F
- Size: `simres × simres`
- Channels:
  - **R**: Flux toward up direction (fT)
  - **G**: Flux toward right direction (fR)
  - **B**: Flux toward bottom direction (fB)
  - **A**: Flux toward left direction (fL)

### Texture Initialization

Lava textures are initialized to zero in `cleanUpTextures()` function using the `clean` shader:
- `Render2Texture(renderer, gl_context, camera, clean, read_lava_tex, square, noiseterrain)`
- `Render2Texture(renderer, gl_context, camera, clean, write_lava_tex, square, noiseterrain)`
- `Render2Texture(renderer, gl_context, camera, clean, read_lava_flux_tex, square, noiseterrain)`
- `Render2Texture(renderer, gl_context, camera, clean, write_lava_flux_tex, square, noiseterrain)`

### Texture Binding

- Lava textures are bound to TEXTURE11 for vertex shader (to avoid conflict with TEXTURE10 used for heightmap)
- Scene depth pass (`sceneDepthShader`) uses `terrain-vert.glsl`; bind `read_terrain_tex` (0), `read_sediment_tex` (1), and `read_lava_tex` (2) before rendering
- Lava textures are created in `setupFramebufferandtextures()` in `src/simulation/texture-management.ts`
- Texture swapping handled by `swapLavaTextures()` and `swapLavaFluxTextures()`

---

## User Interface

### GUI Parameters

All lava physics parameters are in the "Lava Physics Parameters" folder in the GUI:

1. **LavaViscosityPreExp** (1e-6 to 1e-4): Pre-exponential factor for Arrhenius viscosity law
2. **LavaActivationEnergy** (100000-300000 J/mol): Activation energy for viscosity calculation
3. **LavaDensity** (2000-3000 kg/m³): Lava density (default: 2700 kg/m³)
4. **LavaSpecificHeat** (800-1500 J/(kg·K)): Specific heat capacity (default: 1200 J/(kg·K))
5. **LavaAirHeatTransfer** (50-500 W/(m²·K)): Heat transfer coefficient for air cooling (default: 200 W/(m²·K))
6. **LavaWaterHeatTransfer** (1000-5000 W/(m²·K)): Heat transfer coefficient for water cooling (default: 2000 W/(m²·K))
7. **LavaAmbientTemp** (0-30°C): Ambient air temperature (default: 20°C)
8. **LavaWaterTemp** (0-20°C): Water temperature (default: 10°C)
9. **LavaContactHeatTransfer** (100-500 W/(m²·K)): Heat transfer for terrain melting (default: 200 W/(m²·K))
10. **LavaMeltThreshold** (1000-1400°C): Temperature at which lava melts terrain (default: 1200°C)
11. **LavaLatentHeatFusion** (200000-600000 J/kg): Latent heat of fusion for melting (default: 400000 J/kg)
12. **LavaSolidificationTemp** (700-1000°C): Temperature at which lava solidifies (default: 800°C)
13. **LavaInitialTemp** (1000-1300°C): Initial temperature of new lava (default: 1200°C)
14. **LavaGlowIntensity** (0.5-5.0): Visual glow intensity multiplier (default: 2.0)

### Brush Type

- **LavaBrush**: Brush type 7
- Added to brush palette UI
- Uses same brush system as other brushes (size, strength, operation modes)

---

## Known Issues

### Resolved: Terrain Ghosting with Lava Pooling

**Problem**: Adding lava volume to the vertex shader height calculation produced floating silhouettes/ghosting.

**Root Cause**: The scene depth pass uses `terrain-vert.glsl` (which samples `hightmap`, `sedimap`, and `lavamap`) but these textures were never bound for the depth pass. `lavamap` defaulted to texture unit 0 (heightmap), inflating vertex height only in the depth/scatter pass and creating ghosting.

**Fix**: Bind `read_terrain_tex` (unit 0), `read_sediment_tex` (unit 1), and `read_lava_tex` (unit 2) before rendering the scene depth pass in `src/main.ts`.

**Status**: Fixed. Lava pooling works without ghosting once the depth pass bindings match the terrain pass.

**Earlier attempts (not root cause)**:
1. Initializing lava textures to zero in `cleanUpTextures()`
2. Adding validation checks in `terrain-vert.glsl`
3. Switching texture units/unbinding
4. Commenting out lava passes and fragment sampling

### Other Issues

1. **Lava source flow speed**: May need adjustment to match brush speed
2. **Edge cooling**: Edges of lava pools may not cool as fast as desired
3. **Volume pooling**: Lava volume may not pool correctly (similar to water pooling issue)

---

## File Structure

### Shader Files

- `src/shaders/lava-flow-frag.glsl`: Lava flux calculation
- `src/shaders/lava-update-frag.glsl`: Lava volume and temperature update
- `src/shaders/lava-terrain-frag.glsl`: Lava-terrain interaction (melting, evaporation, solidification)
- `src/shaders/terrain-frag.glsl`: Terrain rendering (includes lava rendering logic)
- `src/shaders/terrain-vert.glsl`: Terrain vertex shader (includes lava pooling logic)
- `src/shaders/sediment-frag.glsl`: Sediment erosion (includes lava protection logic)

### Source Files

- `src/main.ts`: Main simulation loop, lava pass integration, texture binding
- `src/simulation/texture-management.ts`: Lava texture creation and management
- `src/rendering/shader-factory.ts`: Lava shader program creation
- `src/events/event-handlers.ts`: Lava source placement/removal
- `src/gui/gui-setup.ts`: Lava physics parameters GUI
- `src/utils/lava-sources.ts`: Lava source management (similar to water-sources.ts)
- `src/controls-config.ts`: Lava source key bindings
- `src/settings.ts`: Lava source settings persistence

### Documentation Files

- `README.md`: User-facing documentation (includes lava features)
- `detail.md`: Technical documentation (includes lava simulation details)

---

## Implementation Notes

### Simulation Pass Order

Lava simulation passes are executed in this order (when enabled):

1. **Lava Flow Calculation**: After terrain flux swap, before final average
2. **Lava Volume Update**: After lava flow, swaps lava flux textures
3. **Lava-Terrain Interaction**: After lava volume update, swaps both terrain and lava textures

### Texture Swapping

- `swapLavaTextures()`: Swaps `read_lava_tex` and `write_lava_tex`
- `swapLavaFluxTextures()`: Swaps `read_lava_flux_tex` and `write_lava_flux_tex`
- Called after each respective simulation pass

### Brush Integration

Lava brush (type 7) is integrated into the `lavaUpdate` shader:
- Uses same brush system as other brushes
- Adds lava volume at initial temperature (1200°C)
- Brush uniforms passed in `SimulatePerStep()` function

### Source Integration

Lava sources are similar to water sources:
- Maximum 16 sources (defined by `MAX_LAVA_SOURCES`)
- Stored in arrays: `lavaSources` (position, size, strength)
- FBM noise variation for bubbling effect
- Source arrays populated in `tick()` function and passed to `SimulatePerStep()`

---

## Future Improvements

1. **Optimize cooling rates**: Fine-tune cooling rates for better visual results
2. **Improve volume pooling**: Ensure lava pools correctly like water
3. **Enhanced visual effects**: Improve steam effects, glow, and color gradients
4. **Performance optimization**: Optimize shader calculations if needed

---

## References

- Arrhenius viscosity law for temperature-dependent viscosity
- Newton's law of cooling for temperature changes
- Thermal erosion equations for terrain melting
- Latent heat of vaporization for water evaporation
- Three.js lava shader example for visual effects inspiration

---

## Summary

The lava system is a comprehensive physics-based simulation with three main shader passes, temperature-dependent viscosity, thermal erosion, water interaction, and solidification. The ghosting issue is resolved by binding lava/terrain textures for the scene depth pass, so lava pooling now works. Lava simulation and rendering are re-enabled in code.


