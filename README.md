## Terrain Erosion Sandbox — WebGPU / Three.js TSL

![](screenshot/tt.PNG)
![](screenshot/mtnn.PNG)

## Controls

### Brush System
- **Brush Types** (Press number keys 1-7 or use brush palette):
  - `1` - **Terrain Brush** ⛰️: Modify terrain height (elevate or lower)
  - `2` - **Water Brush** 💧: Add or remove water
  - `3` - **Rock Brush** 🪨: Place erosion-resistant rock material
  - `4` - **Smooth Brush** ✨: Smooth terrain surface
  - `5` - **Flatten Brush** 📐: Flatten terrain to a target height
  - `6` - **Slope Brush** 📉: Create a slope between two points
  - `7` - **Lava Brush** 🌋: Add or remove lava at high temperature (1200°C)

- **Brush Operations**:
  - **Left Click**: Add mode (elevate terrain, add water, place rock, etc.)
  - **Shift + Click**: Subtract mode (lower terrain, remove water, remove rock, etc.)
  - **Alt + Click**: Secondary operation (varies by brush type - see below)

- **Brush Modifiers**:
  - **Ctrl + Scroll**: Adjust brush size
  - **Shift**: Invert operation (Add ↔ Subtract)
  - **Alt**: Secondary operation (see brush-specific instructions below)

- **Flatten Brush** 📐:
  - **Left Click**: Flatten terrain to target height
  - **Alt + Click**: Set target height to clicked location's height
  - Use the slider in the brush palette to manually set target height (0-500)

- **Slope Brush** 📉:
  - **Left Click (first)**: Set start point of slope
  - **Alt + Click + Drag**: Paint to the start point of slope

### Water Sources
- Press `r` to place a permanent water source at cursor location
- Press `Shift + r` to remove the nearest permanent water source
- Press `p` to remove all permanent water sources
- Red circle marks the location of permanent water sources
- Size and strength match the brush size and strength when placed

### Lava Sources
- Press `l` to place a permanent lava source at cursor location
- Press `Shift + l` to remove the nearest permanent lava source
- Press `p` to remove all permanent sources (both water and lava)
- Orange/red glow marks the location of permanent lava sources
- Size and strength match the brush size and strength when placed

### Camera Controls
- **Right Mouse Button**: Rotate camera
- **Middle Mouse Button**: Pan camera
- **Scroll Wheel**: Zoom in/out
- **WASD**: Move camera (W=forward, S=backward, A=left, D=right)
- **Space**: Move camera up

### Simulation Controls
- **Start/Resume Button**: Start or resume the erosion simulation
- **Pause Button**: Pause the simulation
- **Reset Button**: Reset simulation and generate new random terrain
- **Water Transparency Slider**: Control water alpha/transparency
- **Kc Slider**: Erosion capacity constant - Controls how much sediment the water can carry. Higher values = water can carry more sediment = more potential erosion. Formula: `Sediment Capacity = Kc × Slope × Velocity`
- **Ks Slider**: Erosion dissolving constant - Controls how fast terrain erodes when water has capacity to carry more sediment. Higher values = faster erosion. Formula: `Erosion Amount = (Capacity - Current Sediment) × Ks`
- **Kd Slider**: Erosion deposition constant - Controls how fast sediment is deposited when water is overloaded. Higher values = faster deposition (creates deltas/floodplains). Formula: `Deposition Amount = (Current Sediment - Capacity) × Kd`

**Erosion Parameter Tips:**
- **Increase Kc** for more aggressive erosion (water carries more material)
- **Increase Ks** for faster erosion (terrain erodes quicker)
- **Increase Kd** for faster deposition (sediment drops out faster, creating deltas/floodplains)

- **ErosionMode**: Erosion algorithm mode
  - **RiverMode (0)**: Standard hydraulic erosion - best for river valleys and canyons
  - **MountainMode (1)**: Optimized for mountain terrain - creates more dramatic peaks
  - **PolygonalMode (2)**: Creates polygonal/geometric erosion patterns

- **VelocityAdvectionMag** (0.0-0.5): Controls water momentum/persistence. Higher values create more meandering rivers, better deltas, and more persistent flow patterns. Enables momentum transfer between frames.

- **AdvectionMethod**: Sediment transport algorithm
  - **Semilagrangian (0)**: Basic advection - faster but more numerical diffusion
  - **MacCormack (1)**: Higher quality advection - less numerical diffusion, better sediment transport detail

- **VelocityMultiplier** (1.0-5.0): Multiplies water flow velocity. Higher values = faster water flow = faster erosion. Use to speed up or slow down the entire erosion process.

- **EvaporationConstant** (0.0001-0.08): Controls how fast water evaporates. Higher values = water disappears faster. Lower values = water persists longer, creating more erosion over time.

- **SimulationSpeed**: Number of simulation steps per frame
  - **Fast (3)**: 3 steps per frame - fastest erosion but may be less stable
  - **Medium (2)**: 2 steps per frame - balanced
  - **Slow (1)**: 1 step per frame - most stable, smoothest results

- **SimulationResolution**: Grid resolution for the simulation (256, 512, 1024, 2048, 4096)
  - Higher resolution = more detail and accuracy but slower performance
  - Lower resolution = faster performance but less detail
  - Changing resolution resets the terrain

- **Debug Views Dropdown**: Switch between different visualization modes
  - **noDebugView (0)**: Normal terrain rendering
  - **sediment (1)**: Visualize sediment concentration
  - **velocity (2)**: Visualize water velocity vectors
  - **velocityHeatmap (9)**: Color-coded velocity magnitude (blue→green→red)
  - **terrain (3)**: Height map visualization
  - **flux (4)**: Water flux visualization
  - **terrainflux (5)**: Terrain flux visualization
  - **maxslippage (6)**: Maximum slippage angle visualization
  - **flowMap (7)**: Flow direction map
  - **spikeDiffusion (8)**: Spike diffusion visualization
  - **rockMaterial (10)**: Rock material visualization
  - **lavaVolume (11)**: Lava volume visualization (red intensity)
  - **lavaTemperature (12)**: Lava temperature gradient (blue=800°C to red=1200°C)
  - **lavaTempVolume (13)**: Combined lava temperature and volume
  - **waterLavaContact (14)**: Water-lava contact zones (magenta=contact, blue=water, red=lava)
  - **rockLayering (15)**: Rock material with sediment layering (yellow/orange=sediment on rock, gray=rock)

### Rain Erosion
- **RainErosion** (toggle): Enables rain-based erosion that drops water randomly across the terrain
- **RainErosionStrength** (0.1-3.0): Intensity of rain drops. Higher = more water per drop
- **RainErosionDropSize** (0.1-3.0): Size of rain drop areas. Higher = larger drop zones

### Thermal Erosion
- **thermalTalusAngleScale** (1.0-10.0): Controls the talus angle (angle of repose). Higher values = steeper slopes can exist before material slides down. Lower values = material slides down gentler slopes, creating more stable terrain.
- **thermalErosionScale** (0.0-5.0): Overall strength of thermal erosion. Higher = more material slides down slopes. Set to 0.0 to disable thermal erosion.

### Rock Material System
- **rockErosionResistance** (0.0-1.0): How resistant rock is to erosion
  - **0.0**: Rock erodes at the same rate as normal terrain
  - **1.0**: Rock doesn't erode (maximum resistance)
  - **Default (0.8)**: Rock erodes much slower than soil, creating erosion-resistant features

### Lava Simulation
- **Physics-Based Lava Flow**: Lava simulation with temperature-dependent viscosity using Arrhenius viscosity law
- **Flow Speed**: Lava flows 2-10x slower than water (relative to water simulation, not real-world ratios)
- **Temperature System**: Lava temperature ranges from 800°C (solidification) to 1200°C (initial)
- **Cooling**: Lava cools in air (~1-2 minutes from 1200°C to 800°C) and much faster in water (10x multiplier)
- **Water Interaction**: 
  - Hot lava rapidly cools when in contact with water
  - Water evaporates when in contact with hot lava (5x evaporation rate)
  - Water erosion is prevented under hot lava (lava protects terrain)
- **Thermal Erosion**: Hot lava (above 1200°C) melts terrain, carving channels
- **Solidification**: Cooled lava (below 800°C) solidifies into rock material, filling channels
- **Visual Effects**: Lava glows with temperature-based color gradient (orange/yellow/red) and intensity

#### Lava Physics Parameters
- **LavaViscosityPreExp** (1e-6 to 1e-4): Pre-exponential factor for Arrhenius viscosity law
- **LavaActivationEnergy** (100000-300000 J/mol): Activation energy for viscosity calculation
- **LavaDensity** (2000-3000 kg/m³): Lava density (default: 2700 kg/m³)
- **LavaSpecificHeat** (800-1500 J/(kg·K)): Specific heat capacity (default: 1200 J/(kg·K))
- **LavaAirHeatTransfer** (10-50 W/(m²·K)): Heat transfer coefficient for air cooling (default: 200 W/(m²·K))
- **LavaWaterHeatTransfer** (1000-5000 W/(m²·K)): Heat transfer coefficient for water cooling (default: 2000 W/(m²·K))
- **LavaAmbientTemp** (0-30°C): Ambient air temperature (default: 20°C)
- **LavaWaterTemp** (0-20°C): Water temperature (default: 10°C)
- **LavaContactHeatTransfer** (100-500 W/(m²·K)): Heat transfer for terrain melting (default: 200 W/(m²·K))
- **LavaMeltThreshold** (1000-1400°C): Temperature at which lava melts terrain (default: 1200°C)
- **LavaLatentHeatFusion** (200000-600000 J/kg): Latent heat of fusion for melting (default: 400000 J/kg)
- **LavaSolidificationTemp** (700-1000°C): Temperature at which lava solidifies (default: 800°C)
- **LavaInitialTemp** (1000-1300°C): Initial temperature of new lava (default: 1200°C)
- **LavaGlowIntensity** (0.5-5.0): Visual glow intensity multiplier (default: 2.0)

### Terrain Generation
- **Import Height Map**: Load external PNG height maps
- **Clear Height Map**: Return to procedural terrain generation
- **TerrainScale** (0.1-4.0): Controls the scale/frequency of procedural noise. Higher = more detail, smaller features. Lower = larger, smoother features.
- **TerrainHeight** (1.0-5.0): Controls the overall height multiplier of the terrain. Higher = taller mountains.
- **TerrainBaseType**: Procedural generation algorithm
  - **ordinaryFBM (0)**: Standard Fractal Brownian Motion - smooth, natural-looking terrain
  - **domainWarp (1)**: Domain warping - creates more complex, twisted patterns
  - **terrace (2)**: Terrace/step-like terrain - creates flat plateaus with steep edges
  - **Voronoi (3)**: Voronoi cells - creates cellular/polygonal patterns
  - **ridgeNoise (4)**: Ridge noise - creates sharp ridges and valleys
  - **billowNoise (5)**: Puffy, cloud-like terrain with rounded peaks
  - **turbulence (6)**: Chaotic, turbulent patterns
  - **craters (7)**: Cratered terrain with impact basins
  - **dunes (8)**: Sand dune patterns with wave-like ridges
  - **canyons (9)**: Deep valley/canyon formations
  - **mountains (10)**: Dramatic peaks with sharper features
  - **billowyRidges (11)**: Hybrid of billow and ridge noise
- **TerrainMask**: Applies a mask to shape the terrain
  - **OFF (0)**: No mask applied
  - **Sphere (1)**: Circular gradient from center - creates dome/island shape
  - **Slope (2)**: Diagonal gradient - creates a slope from one corner to another
  - **Square (3)**: Square gradient from center - creates a square plateau
  - **Ring (4)**: Donut/ring shape - creates a circular ridge
  - **RadialGradient (5)**: Smooth radial falloff from center
  - **Corner (6)**: Highest in bottom-left corner, fades to other corners
  - **Diagonal (7)**: Diagonal stripe pattern
  - **Cross (8)**: Cross pattern from center
  - **Craters (10)**: Adds impact crater basins
  - **Dunes (11)**: Adds wind-aligned dune ridges
- **TerrainPlatte**: Color scheme/biome
  - **Normal Alpine Mountain (0)**: Standard mountain colors
  - **Desert (1)**: Desert color palette
  - **Jungle (2)**: Jungle/forest color palette

## [**PLAY LIVE** (Chrome Recommended)]( https://sonicdm.github.io/webgl-erosion-enhanced/)

## [**Demo Video showing sandbox feature**](https://youtu.be/Qly5emyyR_s)

## Deployment

This project is automatically deployed to GitHub Pages via GitHub Actions. The workflow:
- Triggers on pushes to the `master` branch
- Builds the project using Vite
- Deploys to `sonicdm.github.io/webgl-erosion-enhanced`

To deploy manually, you can also trigger the workflow from the Actions tab in GitHub.

![](screenshot/dd.PNG)

![](screenshot/cliff2.PNG)

![](screenshot/td1.png)

![](screenshot/scatter1.PNG)

## Requirements

- A browser with **WebGPU** support (Chrome 113+, Edge 113+, Firefox Nightly with flag)
- GPU with `float32-filterable` feature (most discrete GPUs from 2016+; GTX 1060 or equivalent and above recommended)
- macOS: WebGPU is supported in recent Safari Technology Preview and Chrome; earlier versions may not work

## Enhanced Version Updates (Since Fork)

## update 02/2026 (Latest):
- **Lava Channeling & Flow Mechanics**
  - Upgraded lava flux from 4-neighbor cardinal to 8-neighbor (cardinal + diagonal) flow model
  - Exponential depth boost (`pow(2.0, terrainDiff * strength)`) — lava strongly prefers existing channels
  - Cubed noise resistance (`pow(noiseVal, power)`) — micro-terrain roughness creates path selectivity
  - Momentum bias — velocity dot-product alignment encourages straight-line flow over random spread
  - Multi-octave noise texture generated at startup (scales 12, 6, 3 cells) for channeling variation

- **Three-Layer Solidification System**
  - Mobile Lava → Cool Lava → Basalt phase transition chain replaces direct lava-to-terrain conversion
  - Cool lava acts as an intermediate insulating crust that resists further flow
  - Basalt is permanent volcanic rock — never converts to terrain, accumulates over eruptions
  - Speed-gated solidification: fast-moving lava resists crusting
  - Noise-modulated crusting for natural irregular crust patterns
  - Hysteresis re-melting: hot lava (T > 0.6) can re-melt cool lava back to mobile

- **Thermal Erosion with Basalt**
  - Hot lava erodes basalt at 50% of terrain erosion rate before falling through to terrain
  - Erosion resistance ordering: cool lava (easiest) < terrain < basalt < rock (hardest)
  - Surface height stacking: terrain + basalt + coolLava + water + mobileLava

- **New GUI Controls**
  - Channeling subfolder: Depth Boost, Momentum, Noise Power
  - Solidification subfolder: Cooling Rate, Basalt Rate, Re-Melt Rate, Basalt Melt, Noise Variation

## update 01/2026:
- **WebGPU Migration**
  - Replaced the entire WebGL rendering pipeline with a single WebGPU pipeline using Three.js `WebGPURenderer`
  - All simulation passes (water increment, flux, velocity, erosion, sediment advection, thermal erosion, evaporation) ported from GLSL fragment shaders to WGSL compute shaders
  - Terrain generation (FBM, domain warp, terrace, voronoi, ridge, billow, etc.) now runs as a WebGPU compute pass
  - Capability detection with adapter/device caching; graceful fallback messaging when WebGPU is unavailable

- **Three.js TSL (Three Shading Language) Materials**
  - Terrain, water, and sky materials rewritten as TSL node graphs (`MeshBasicNodeMaterial` with `colorNode`/`positionNode`)
  - Vertex displacement from heightmap, 4-neighbor central-difference normals, palette selection, shadow mapping, and all debug visualizations built as composable TSL nodes
  - Water material: depth-based transparency, animated normals, Fresnel reflection, soft specular (4-neighbor central-difference normals to eliminate stripe artifacts)
  - Dependency-injected shader node architecture (`TerrainShaderNodeController` composing `TerrainSamplingNode`, `TerrainPaletteNode`, `TerrainDebugViewNode`, `TerrainShadowNode`)

- **In-Shader Source Indicators**
  - Water source positions packed into a 16x1 RGBA32F `DataTexture` (R=u, G=v, B=size, A=active), sampled per-fragment
  - Subtle red glow overlay that conforms to terrain displacement in real time

- **Performance**
  - Async shader compilation (`compileAsync`) with loading screen
  - TSL node count optimizations: algebraic simplification of additive blends (`mix(a, a+c, t)` to `a + c*t`) to prevent exponential node traversal in unrolled loops
  - Chunked GPU readback for brush raycasting; HMR-safe device cleanup
  - Adaptive flow trace and sediment trace overlays toggled via uniforms (no graph rebuild)

- **Debug Visualizations**
  - All 7 debug views restored under WebGPU: sediment, velocity, terrain heightmap, flux, terrain flux, flow map, rock material
  - Flow trace overlay (yellow tint where water has flowed) and 3-band sediment trace overlay

## update 01/2025:
- **Terrain Mask System**
  - Added 6 new terrain masks: Square, Ring, RadialGradient, Corner, Diagonal, Cross
  - Total of 9 terrain mask options now available (OFF, Sphere, Slope, Square, Ring, RadialGradient, Corner, Diagonal, Cross)
  - Each mask applies different height gradients to shape terrain generation

- **Documentation Improvements**
  - Added comprehensive parameter documentation for all erosion parameters (ErosionMode, VelocityAdvectionMag, AdvectionMethod, VelocityMultiplier, EvaporationConstant, SimulationSpeed, SimulationResolution)
  - Documented Rain Erosion system (RainErosion, RainErosionStrength, RainErosionDropSize)
  - Documented Thermal Erosion system (thermalTalusAngleScale, thermalErosionScale)
  - Documented Rock Material System (rockErosionResistance)
  - Added detailed explanations for all Terrain Generation parameters including all mask types
  - Documented all Debug Views and visualization modes
  - Improved user guidance with parameter ranges, formulas, and usage tips

## update 01/2025:
- **Deployment & Build System**
  - Added automated deployment via GitHub Actions to `sonicdm.github.io/webgl-erosion-enhanced`
  - Project now automatically builds and deploys on pushes to master branch
  - Migrated from Webpack to Vite for faster builds and better development experience
  - Optimized bundle splitting with separate vendor chunks for Three.js, gl-matrix, and UI libraries

- **Raycasting Improvements**
  - Implemented BVH (Bounding Volume Hierarchy) raycasting using three-mesh-bvh for improved accuracy and performance
  - Added adaptive raycasting with binary search refinement for precise terrain intersection
  - Improved brush interaction accuracy with better height sampling using bilinear interpolation
  - Added toggle between heightmap and BVH raycast methods for A/B testing

- **Brush System Enhancements**
  - Added comprehensive brush palette UI with quick access to brush types (Terrain, Water, Rock, Smooth, Flatten, Slope)
  - Improved brush size granularity with better slider controls
  - Enhanced slope brush behavior with two-point slope creation
  - Added keyboard shortcuts (1-6) for quick brush type switching
  - Fixed brush operation modes and improved brush palette synchronization

- **Rock Material System**
  - Implemented rock material with erosion resistance properties
  - Added visual blending between rock and terrain materials
  - Improved rock erosion with faster water flow and material conservation
  - Enhanced water visibility on rock surfaces
  - Added sediment deposition on rock with base surface tracking

- **Terrain Import/Export**
  - Added height map import functionality - load external height maps as PNG images
  - Added clear height map option to return to procedural generation
  - Height maps are properly integrated into the erosion simulation

- **Multiple Water Sources**
  - Implemented system for placing multiple permanent water sources
  - Each water source can be individually configured with size and strength

- **Code Architecture**
  - Major refactoring: broke down monolithic main.ts into manageable modules
  - Separated concerns: brush handling, settings, controls, rendering, simulation state
  - Improved code organization with dedicated modules for geometry, shaders, and utilities
  - Added configurable controls system with pointer events support

- **Performance & Quality**
  - Optimized heightmap readback frequency based on brush activity
  - Improved raycast accuracy with full-resolution height reads
  - Better terrain geometry building with proper bilinear interpolation matching

## update 12/8/2021:
- Algorithm update/fix: added basic (semi-lagrangian) advection for velocity field generation, you can change magnitude of it under "Erosion Parameters" -> "VelocityAdvectionMag", this means that momentum is possible for water, we can have larger/better scale meandering/delta effects
## update 10/1/2021:
- Algorithm update/fix: now erosion detail will be more accurate as I've chosen to disregard small water body's contribution to sediment advection, it used to create noises in sediment result because when water volume goes below numerical limitation of the sim, velocity will be contributing the same to advection regardless of water size...
## update 9/24/2021:
- Added option to change simulation resolution
## update 7/11/2021:
- permanent water source is added, you can press ```r``` to place it, see controls for details 
- added heatmap for velocity magnitude in debug view, mapping color goes from blue to green then to red as the velocity size increases
- added MacCormack advection scheme for sediment advection, resulting in less numerical diffusion (referencing : ShaderX7 Advanced Rendering Techniques - starting page 207), you can find and toggle it on/off under ```erosionParameters``` in gui



### Some Screenshots
- flow map and results after adding velocity advection, this will make sure water has momentum transferred from previous frame, making it more persistent and easier to form ravine/valley  
![](screenshot/velocityadvection.PNG)
![](screenshot/velocityadvection1.PNG)
- velocity advection also enables better delta/flood plain : 
![](screenshot/delta0.PNG)
![](screenshot/delta1.PNG)

- permanent water in a river valley
![](screenshot/riv.PNG)
- river valley dries up after some erosion
![](screenshot/vally.PNG)
- alluvial fan (or at least a similar one) formed at the mountain exit
![](screenshot/delta.PNG)


![](screenshot/tr2.PNG)



### Sediment Advection in Action 
![](screenshot/sedi.gif)



### see [**detail.md**](detail.md) for implementation details




### Future Plans:
- ~~Image (height map) I/O~~ ✅ **Completed** - Height map import/export functionality added
- ~~Multi-layered (rock/sand/etc) erosion~~ ✅ **Partially Completed** - Rock material system with erosion resistance implemented
- ~~WebGPU pipeline~~ ✅ **Completed** - Full WebGPU migration with WGSL compute shaders and TSL materials
- PBR (Physically Based Rendering)
- Adaptive simulation utilizing quadtree (or just tiles) for sim optimization
- Ocean plane with animated waves and edge blending
- Better GUI & Visualization (ongoing improvements)
- Terrain features like instanced tree placements
- Other postprocessing effects (ray marched cloud for example, since ray marched Mie scattering is done, cloud should be fairly simple to work based on it)
- Biomes
- Eventual goal: Erosion based games, "FROM DUST" would be a good example

### Limitations are there however for grid based method
- mass conservation of sediment is not guaranteed 


### Reference
- [Fast Hydraulic Erosion Simulation and Visualization on GPU](http://www-ljk.imag.fr/Publications/Basilic/com.lmc.publi.PUBLI_Inproceedings@117681e94b6_fff75c/FastErosion_PG07.pdf) — primary hydraulic erosion algorithm
- [Interactive Terrain Modeling Using Hydraulic Erosion](https://cgg.mff.cuni.cz/~jaroslav/papers/2008-sca-erosim/2008-sca-erosiom-fin.pdf) — thermal erosion pipe model
- ShaderX7 Advanced Rendering Techniques, p. 207 — MacCormack advection scheme
- [Three.js WebGPU Renderer](https://threejs.org/docs/#api/en/renderers/WebGPURenderer) — WebGPU rendering backend
- [Three.js TSL (Three Shading Language)](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language) — node-based shader graph system
- [WebGPU Specification](https://www.w3.org/TR/webgpu/) — W3C WebGPU API
- [WGSL Specification](https://www.w3.org/TR/WGSL/) — WebGPU Shading Language
- [Volumetric Lights for Unity 5](https://github.com/SlightlyMad/VolumetricLights) — depth-aware bilateral blur for volumetric scattering
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) — BVH accelerated raycasting for terrain interaction
