# Uniform Audit - Master Shader Uniforms

This document lists all uniforms required by each simulation pass shader, extracted from the master shader files.

## Water Passes

### Rain Pass (`rain-frag.glsl`)
- `readTerrain` (sampler2D) - Input texture
- `u_Time` (float) - Time for animation
- `raindeg` (float) - Rain degree from controls
- `u_SimRes` (float) - Simulation resolution
- **Brush uniforms:**
  - `u_MouseWorldPos` (vec4)
  - `u_MouseWorldDir` (vec3)
  - `u_BrushSize` (float)
  - `u_BrushStrength` (float)
  - `u_BrushType` (int)
  - `u_BrushPressed` (int)
  - `u_BrushPos` (vec2)
  - `u_BrushOperation` (int)
  - `u_RainErosion` (int)
  - `u_RainErosionStrength` (float)
  - `u_RainErosionDropSize` (float)
  - `u_FlattenTargetHeight` (float)
  - `u_SlopeStartPos` (vec2)
  - `u_SlopeEndPos` (vec2)
  - `u_SlopeActive` (int)
- **Source arrays:**
  - `u_SourceCount` (int)
  - `u_SourcePositions[16]` (vec2 array)
  - `u_SourceSizes[16]` (float array)
  - `u_SourceStrengths[16]` (float array)

### Flow Pass (`flow-frag.glsl`)
- `readTerrain` (sampler2D) - Input texture
- `readFlux` (sampler2D) - Previous flux
- `readSedi` (sampler2D) - Sediment texture
- `u_SimRes` (float) - Simulation resolution
- `u_PipeLen` (float) - Pipe length from controls
- `u_timestep` (float) - Time step from controls
- `u_PipeArea` (float) - Pipe area from controls

### Water Height Pass (`water-height-frag.glsl`)
- `readTerrain` (sampler2D) - Input texture
- `readFlux` (sampler2D) - Flux texture
- `readSedi` (sampler2D) - Sediment texture
- `readVel` (sampler2D) - Velocity texture
- `u_SimRes` (float) - Simulation resolution
- `u_PipeLen` (float) - Pipe length
- `u_timestep` (float) - Time step
- `u_PipeArea` (float) - Pipe area
- `u_VelMult` (float) - Velocity multiplier
- `u_Time` (float) - Time
- `u_VelAdvMag` (float) - Velocity advection magnitude

### Evaporation Pass (`evaporation-frag.glsl`)
- `terrain` (sampler2D) - Terrain texture
- `evapod` (float) - Evaporation rate (1.0 - evaporation factor)

## Sediment Passes

### Sediment Pass (`sediment-frag.glsl`)
- `readTerrain` (sampler2D) - Terrain texture
- `readVelocity` (sampler2D) - Velocity texture
- `readSediment` (sampler2D) - Sediment texture
- `readLava` (sampler2D) - Lava texture
- `u_SimRes` (float) - Simulation resolution
- `u_PipeLen` (float) - Pipe length
- `u_Ks` (float) - Sediment capacity constant
- `u_Kc` (float) - Sediment capacity constant
- `u_Kd` (float) - Deposition constant
- `u_timestep` (float) - Time step
- `u_Time` (float) - Time
- `u_RockErosionResistance` (float) - Rock erosion resistance

### Sediment Advection Pass (`sediment-advect-frag.glsl`)
- `vel` (sampler2D) - Velocity texture
- `sedi` (sampler2D) - Sediment texture
- `sediBlend` (sampler2D) - Sediment blend texture
- `terrain` (sampler2D) - Terrain texture
- `u_SimRes` (float) - Simulation resolution
- `u_timestep` (float) - Time step
- `unif_advectionSpeedScale` (float) - Advection speed scale
- `unif_advectMultiplier` (float) - Advection multiplier

### MacCormack Pass (`maccormack-frag.glsl`)
- `vel` (sampler2D) - Velocity texture
- `sedi` (sampler2D) - Sediment texture
- `sediadvecta` (sampler2D) - Advection A texture
- `sediadvectb` (sampler2D) - Advection B texture
- `u_SimRes` (float) - Simulation resolution
- `u_timestep` (float) - Time step
- `unif_advectionSpeedScale` (float) - Advection speed scale

### Average Pass (`average-frag.glsl`)
- `readTerrain` (sampler2D) - Terrain texture
- `readSedi` (sampler2D) - Sediment texture
- `u_SimRes` (float) - Simulation resolution
- `unif_ErosionMode` (int) - Erosion mode
- `unif_rainMode` (int) - Rain mode

## Thermal Passes

### Max Slippage Pass (`max-slippage-height-frag.glsl`)
- `readTerrain` (sampler2D) - Terrain texture
- `u_SimRes` (float) - Simulation resolution
- `u_PipeLen` (float) - Pipe length
- `u_timestep` (float) - Time step
- `u_PipeArea` (float) - Pipe area
- `unif_thermalErosionScale` (float) - Thermal erosion scale
- `unif_TalusScale` (float) - Talus scale
- `unif_rainMode` (int) - Rain mode

### Thermal Flux Pass (`thermal-flux-frag.glsl`)
- `readTerrain` (sampler2D) - Terrain texture
- `readMaxSlippage` (sampler2D) - Max slippage texture
- `u_SimRes` (float) - Simulation resolution
- `u_PipeLen` (float) - Pipe length
- `u_timestep` (float) - Time step
- `u_PipeArea` (float) - Pipe area
- `unif_thermalRate` (float) - Thermal rate

### Thermal Apply Pass (`thermal-apply-frag.glsl`)
- `readTerrainFlux` (sampler2D) - Terrain flux texture
- `readTerrain` (sampler2D) - Terrain texture
- `u_SimRes` (float) - Simulation resolution
- `u_PipeLen` (float) - Pipe length
- `u_timestep` (float) - Time step
- `u_PipeArea` (float) - Pipe area
- `unif_thermalErosionScale` (float) - Thermal erosion scale

## Lava Passes

### Lava Flow Pass (`lava-flow-frag.glsl`)
- `readTerrain` (sampler2D) - Terrain texture
- `readLava` (sampler2D) - Lava texture
- `readLavaFlux` (sampler2D) - Previous lava flux
- `u_SimRes` (float) - Simulation resolution
- `u_PipeLen` (float) - Pipe length
- `u_timestep` (float) - Time step
- `u_PipeArea` (float) - Pipe area
- `u_LavaViscosityPreExp` (float) - Viscosity pre-exponential factor
- `u_LavaActivationEnergy` (float) - Activation energy
- `u_LavaDensity` (float) - Lava density
- `u_LavaGasConstant` (float) - Gas constant
- `u_LavaSolidificationTemp` (float) - Solidification temperature
- `u_LavaInitialTemp` (float) - Initial temperature
- **Source arrays:**
  - `u_LavaSourceCount` (int)
  - `u_LavaSourcePositions[16]` (vec2 array)
  - `u_LavaSourceSizes[16]` (float array)

### Lava Update Pass (`lava-update-frag.glsl`)
- `readTerrain` (sampler2D) - Terrain texture
- `readLava` (sampler2D) - Lava texture
- `readLavaFlux` (sampler2D) - Lava flux texture
- `u_SimRes` (float) - Simulation resolution
- `u_PipeLen` (float) - Pipe length
- `u_timestep` (float) - Time step
- `u_PipeArea` (float) - Pipe area
- `u_LavaAirHeatTransfer` (float) - Air heat transfer coefficient
- `u_LavaWaterHeatTransfer` (float) - Water heat transfer coefficient
- `u_LavaAmbientTemp` (float) - Ambient temperature
- `u_LavaWaterTemp` (float) - Water temperature
- `u_LavaDensity` (float) - Lava density
- `u_LavaSpecificHeat` (float) - Specific heat capacity
- `u_LavaInitialTemp` (float) - Initial temperature
- `u_LavaSolidificationTemp` (float) - Solidification temperature
- `u_Time` (float) - Time
- **Source arrays:**
  - `u_LavaSourceCount` (int)
  - `u_LavaSourcePositions[16]` (vec2 array)
  - `u_LavaSourceSizes[16]` (float array)
  - `u_LavaSourceStrengths[16]` (float array)
- **Brush uniforms (for brush type 7):**
  - `u_MouseWorldPos` (vec4)
  - `u_MouseWorldDir` (vec3)
  - `u_BrushSize` (float)
  - `u_BrushStrength` (float)
  - `u_BrushType` (int)
  - `u_BrushPressed` (int)
  - `u_BrushPos` (vec2)
  - `u_BrushOperation` (int)

### Lava Terrain Pass (`lava-terrain-frag.glsl`)
- `readTerrain` (sampler2D) - Terrain texture
- `readLava` (sampler2D) - Lava texture
- `readLavaFlux` (sampler2D) - Lava flux texture
- `u_SimRes` (float) - Simulation resolution
- `u_timestep` (float) - Time step
- `u_LavaContactHeatTransfer` (float) - Contact heat transfer
- `u_LavaMeltThreshold` (float) - Melt threshold
- `u_LavaLatentHeatFusion` (float) - Latent heat of fusion
- `u_LavaSolidificationTemp` (float) - Solidification temperature
- `u_LavaInitialTemp` (float) - Initial temperature
- `u_LavaDensity` (float) - Lava density
- `u_LavaWaterTemp` (float) - Water temperature
- **Source arrays:**
  - `u_LavaSourceCount` (int)
  - `u_LavaSourcePositions[16]` (vec2 array)
  - `u_LavaSourceSizes[16]` (float array)

## Uniform Source Mapping

### From SimulationParams DTO:
- `u_PipeLen` → `controls.pipelen`
- `u_timestep` → `controls.timestep`
- `u_PipeArea` → `controls.pipeAra`
- `raindeg` → `controls.RainDegree`
- `evapod` → `controls.evapod` (or computed as 1.0 - evaporation rate)
- `u_Ks` → `controls.Ks`
- `u_Kc` → `controls.Kc`
- `u_Kd` → `controls.Kd`
- `u_RockErosionResistance` → `controls.RockErosionResistance`
- `u_VelMult` → `controls.VelMult`
- `u_VelAdvMag` → `controls.VelAdvMag`
- `unif_advectionSpeedScale` → `controls.advectionSpeedScale`
- `unif_advectMultiplier` → `controls.advectMultiplier`
- `unif_thermalErosionScale` → `controls.thermalErosionScale`
- `unif_TalusScale` → `controls.TalusScale`
- `unif_thermalRate` → `controls.thermalRate`
- `unif_ErosionMode` → `controls.ErosionMode`
- `unif_rainMode` → `controls.rainMode`
- `u_RainErosion` → `controls.RainErosion`
- `u_RainErosionStrength` → `controls.RainErosionStrength`
- `u_RainErosionDropSize` → `controls.RainErosionDropSize`
- Lava physics parameters from `controls` (see LavaPasses for full list)

### From BrushInput DTO:
- `u_MouseWorldPos` → `brushInput.mouseWorldPos`
- `u_MouseWorldDir` → `brushInput.mouseWorldDir`
- `u_BrushPos` → `brushInput.brushPos`
- `u_BrushSize` → `brushInput.brushSize`
- `u_BrushType` → `brushInput.brushType`
- `u_BrushStrength` → `brushInput.brushStrength`
- `u_BrushPressed` → `brushInput.brushPressed`
- `u_BrushOperation` → `brushInput.brushOperation`
- `u_FlattenTargetHeight` → `brushInput.flattenTargetHeight`
- `u_SlopeStartPos` → `brushInput.slopeStartPos`
- `u_SlopeEndPos` → `brushInput.slopeEndPos`
- `u_SlopeActive` → `brushInput.slopeActive`

### From SourceArrays DTO:
- `u_SourceCount` → `sourceArrays.water.count`
- `u_SourcePositions[16]` → `sourceArrays.water.positions`
- `u_SourceSizes[16]` → `sourceArrays.water.sizes`
- `u_SourceStrengths[16]` → `sourceArrays.water.strengths`
- `u_LavaSourceCount` → `sourceArrays.lava.count`
- `u_LavaSourcePositions[16]` → `sourceArrays.lava.positions`
- `u_LavaSourceSizes[16]` → `sourceArrays.lava.sizes`
- `u_LavaSourceStrengths[16]` → `sourceArrays.lava.strengths`

### Computed/Constants:
- `u_SimRes` → `simres` (from SimulationPassManager)
- `u_Time` → `timer` (from StepRunner)
- `u_Time` → `timer` (from StepRunner)
