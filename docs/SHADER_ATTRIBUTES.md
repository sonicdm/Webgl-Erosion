# Shader Attribute Documentation

This document describes the shader attribute names used in the codebase and how they should be handled in the Three.js port.

## GPGPU Pass Shaders

### Vertex Shader: `quad-vert.glsl`

**Input Attributes:**
- `vs_Pos` (vec4): Fullscreen quad position
  - Maps to: `[-1, -1]` to `[1, 1]` in clip space
  - Used for: All GPGPU simulation passes

**Output Varyings:**
- `fs_Pos` (vec2): Fragment position
  - Derived from: `vs_Pos.xy`
  - Used in: Fragment shaders to compute UV coordinates
  - UV calculation: `vec2 curuv = 0.5f*fs_Pos+0.5f;` (maps to [0, 1])

**Usage:**
- All simulation passes use this vertex shader
- Passes: Rain, Flow, WaterHeight, Sediment, Advection, MacCormack, MaxSlippage, ThermalFlux, ThermalApply, Evaporation, LavaFlow, LavaUpdate, LavaTerrain, Average

### Three.js Port Strategy

**Option B (Recommended)**: Keep `vs_Pos`/`fs_Pos` naming with custom attributes
- Create custom geometry with `vs_Pos` attribute name
- Use `RawShaderMaterial` to avoid Three.js attribute renaming
- Minimal shader changes required

**Implementation:**
```typescript
// Create fullscreen quad with vs_Pos attribute
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array([
  -1, -1, 0, 1,  // vs_Pos for vertex 0
   1, -1, 0, 1,  // vs_Pos for vertex 1
  -1,  1, 0, 1,  // vs_Pos for vertex 2
   1,  1, 0, 1,  // vs_Pos for vertex 3
]);
geometry.setAttribute('vs_Pos', new THREE.BufferAttribute(positions, 4));
```

## Render Pass Shaders

### Vertex Shader: `terrain-vert.glsl`

**Input Attributes:**
- `vs_Pos` (vec4): Vertex position
- `vs_Nor` (vec4): Vertex normal
- `vs_Col` (vec4): Vertex color
- `vs_Uv` (vec2): UV coordinates

**Output Varyings:**
- `fs_Pos` (vec3): World position
- `fs_Nor` (vec4): Normal
- `fs_Col` (vec4): Color
- `fs_Uv` (vec2): UV coordinates
- `fs_shadowPos` (vec4): Shadow map position

**Usage:**
- Terrain rendering
- Shadow map generation
- Scene depth pass

### Vertex Shader: `water-vert.glsl`

**Input Attributes:**
- Similar to `terrain-vert.glsl` (likely `vs_Pos`, `vs_Nor`, `vs_Col`, `vs_Uv`)

**Usage:**
- Water surface rendering

### Vertex Shader: `shadowmap-vert.glsl`

**Input Attributes:**
- Similar to `terrain-vert.glsl` (likely `vs_Pos`, `vs_Nor`, `vs_Col`, `vs_Uv`)

**Usage:**
- Shadow map generation

### Three.js Port Strategy for Render Passes

**Option A**: Use standard Three.js attribute names
- Update shaders to use `position`, `normal`, `color`, `uv`
- Use standard `BufferGeometry` attributes
- Requires shader modifications

**Option B**: Keep custom attribute names
- Use `RawShaderMaterial` with custom attribute names
- No shader changes required
- More work in geometry setup

**Recommendation**: For render passes, use Option A (standard names) since we're using built-in materials where possible. For GPGPU passes, use Option B to minimize changes.

## Fragment Shader Outputs

### Single Output Passes
- Use standard `out vec4` or `layout (location = 0) out vec4`
- Example: Rain, Flow, MaxSlippage, ThermalFlux, ThermalApply, Evaporation, LavaFlow, LavaUpdate, MacCormack (final subpass)

### MRT Passes
- Use `layout (location = N) out vec4` for multiple outputs
- **2-output MRT**:
  - Location 0: Primary output
  - Location 1: Secondary output
  - Examples: WaterHeight, LavaTerrain, Average

- **3-output MRT**:
  - Location 0: Primary output
  - Location 1: Secondary output
  - Location 2: Tertiary output
  - Examples: SedimentAdvection (both paths)

- **4-output MRT**:
  - Location 0: Primary output
  - Location 1: Secondary output
  - Location 2: Tertiary output
  - Location 3: Quaternary output
  - Example: Sediment

## Uniform Naming Conventions

Uniforms follow these patterns:
- Texture samplers: `readTerrain`, `readFlux`, `readVel`, `readSediment`, `readLava`, etc.
- Simulation parameters: `u_SimRes`, `u_timestep`, `u_pipelen`, `u_pipeAra`
- Physics constants: `Kc`, `Ks`, `Kd`, `u_LavaViscosityPreExp`, etc.
- Control parameters: `raindeg`, `evapod`, `unif_advectMultiplier`, etc.

## Three.js RawShaderMaterial Configuration

For GPGPU passes:
```typescript
const material = new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3,
  vertexShader: quadVertSource,
  fragmentShader: passFragSource,
  // No automatic attribute/uniform renaming
});
```

For render passes (if using custom shaders):
```typescript
const material = new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3,
  vertexShader: terrainVertSource,
  fragmentShader: terrainFragSource,
});
```

## Attribute Mapping Summary

| Shader Type | Attribute Name | Three.js Equivalent | Strategy |
|-------------|---------------|---------------------|----------|
| GPGPU (quad) | `vs_Pos` (vec4) | Custom `vs_Pos` | Option B: Keep name |
| Render (terrain) | `vs_Pos` (vec4) | `position` | Option A: Rename |
| Render (terrain) | `vs_Nor` (vec4) | `normal` | Option A: Rename |
| Render (terrain) | `vs_Col` (vec4) | `color` | Option A: Rename |
| Render (terrain) | `vs_Uv` (vec2) | `uv` | Option A: Rename |

