## Terrain erosion sandbox in WebGl

![](screenshot/tt.PNG)
![](screenshot/mtnn.PNG)

## Controls

### Brush System
- **Brush Types** (Press number keys 1-6 or use brush palette):
  - `1` - **Terrain Brush** ⛰️: Modify terrain height (elevate or lower)
  - `2` - **Water Brush** 💧: Add or remove water
  - `3` - **Rock Brush** 🪨: Place erosion-resistant rock material
  - `4` - **Smooth Brush** ✨: Smooth terrain surface
  - `5` - **Flatten Brush** 📐: Flatten terrain to a target height
  - `6` - **Slope Brush** 📉: Create a slope between two points

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
- **Evaporation Degree Slider**: Control evaporation amount per simulation step
- **Kc Slider**: Erosion capacity constant
- **Ks Slider**: Erosion dissolving constant
- **Kd Slider**: Erosion deposition constant
- **Debug Views Dropdown**: Switch between different visualization modes

### Terrain Generation
- **Import Height Map**: Load external PNG height maps
- **Clear Height Map**: Return to procedural terrain generation
- **Terrain Parameters**: Adjust base type, scale, height, and mask settings

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

## Note : MacOS currently unsupported, Recommended GPU is GTX 1060 and above

## Enhanced Version Updates (Since Fork)

## update 01/2025 : 
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

## update 12/8/2021 : 
- Algorithm update/fix : added basic(semi-lagrangian) advection for velocity field generation, you can change magnitude of it under "Erosion Parameters" -> "VelocityAdvectionMag", this means that momentum is possible for water, we can have larger/better scale meandering/delta effects
## update 10/1/2021 : 
- Algorithm update/fix : now erosion detail will be more accurate as I've choosen to disregard small water body's contribution to sediment advection, it used to create noises in sediment result because when water volume goes below numerical limitation of the sim, velocity will be contributing the same to advection regardless of water size...
## update 9/24/2021 : 
- Added option to change simulation resolution
## update 7/11/2021 : 
- permanent water source is added, you can pressed ```r``` to place it, see controls for details 
- added heatmeap for velocity magnitude in debug view, mapping color goes from blue to green then to red as the velocity size increases
- added MacCormack advection scheme for sediment advection, resulting in less numerical diffusion (referencing : ShaderX7 Advanced Rendering Techniques - starting page 207), you can find and toggle it on/off under ```erosionParameters``` in gui



### some screenshots
- flow map and results after adding velocity advection, this will make sure water have momentum transfered from previous frame, making it more persistent and easier to form ravine/valley  
![](screenshot/velocityadvection.PNG)
![](screenshot/velocityadvection1.PNG)
- velocity advection also enables better delta/flood plain : 
![](screenshot/delta0.PNG)
![](screenshot/delta1.PNG)

- permanent water in a river vally
![](screenshot/riv.PNG)
- river vally dries up after some erosion
![](screenshot/vally.PNG)
- alluvial fan (or at least a similar one) formed at the mountain exit
![](screenshot/delta.PNG)


![](screenshot/tr2.PNG)



### sediments advection in action 
![](screenshot/sedi.gif)



### see [**detail.md**](detail.md) for implementation details




### Future Plans:
- ~~Image(height map) I/O~~ ✅ **Completed** - Height map import/export functionality added
- ~~muti-layered(rock/sand/etc) erosion~~ ✅ **Partially Completed** - Rock material system with erosion resistance implemented
- PBR (Physically Based Rendering)
- Adaptive simulation utilizing quadtree(or just tiles) for sim optimization
- Depth upsampling/downsampling for volumetric rendering optimization
- Better GUI & Visualization (ongoing improvements)
- Terrain features like instanced tree placements
- Other postprocessing effects (ray marched cloud for example, since ray marched Mie scattering is done, cloud should be fairly simple to work based on it)
- Biomes
- Eventual goal : Erosion based games, "FROM DUST" would be a good example

### limitations are there however for grid based method
- mass conservation of sediment is not guranteed 


### Reference
- [Fast Hydraulic Erosion Simulation and Visualization on GPU](http://www-ljk.imag.fr/Publications/Basilic/com.lmc.publi.PUBLI_Inproceedings@117681e94b6_fff75c/FastErosion_PG07.pdf)
- [Interactive Terrain Modeling Using Hydraulic Erosion](https://cgg.mff.cuni.cz/~jaroslav/papers/2008-sca-erosim/2008-sca-erosiom-fin.pdf)
- [Volumetric Lights for Unity 5](https://github.com/SlightlyMad/VolumetricLights)
- ShaderX7 Advanced Rendering Techniques : starting page 207