# WebGPU Renderer Migration

## Goal
Move the whole renderer to WebGPU so that when WebGPU is available we use WebGPURenderer for the main view instead of WebGL. Simulation already runs on WebGPU; display currently copies terrain to WebGL and renders with WebGL. After migration: no WebGL for main view, no copy to WebGL; we copy pool textures to Three.js textures (GPU-side) and render with WebGPURenderer.

## Status
- **Done**: Single device from WebGPURendererWrapper; main view uses WebGPURenderer; WebGL from offscreen for load/export; skip `copyWebGPUTerrainToWebGL` when WebGPU active. Pool → Three.js texture copy each frame (`copyPoolToThreeTextures`). Terrain mesh with TerrainMaterialNode (heightmap, normal, sediment, vel, flux, etc. from pool). Water mesh with WaterMaterialNode.

## Approach
1. **Single device** ✅: Initialize WebGPURendererWrapper first; get device from it; use that device for ComputeNodePipeline and WebGPUTexturePool so compute and render share one device.
2. **Copy pool → Three textures** ✅: Each frame before render, `copyPoolToThreeTextures(backend, pool, sync, simres)` copies pool GPUTextures into backend GPUTextures of Three.js DataTextures (rgba32float). See `src/utils/webgpu-pool-to-three-texture-copy.ts`.
3. **WebGPU render path** ✅: Scene with terrain mesh (TerrainMaterialNode) and water mesh (WaterMaterialNode). Each frame: copy pool → Three textures, then `webgpuRenderer.render(scene, camera.threeCamera)`.
4. **When WebGPU available** ✅: Use WebGPURenderer for main view; skip WebGL render passes and `copyWebGPUTerrainToWebGL`. WebGL from offscreen canvas only for heightmap load/export and legacy texture pool.

## Key files
- `src/main.ts`: init order (WebGPURendererWrapper first, device from it), offscreen WebGL, tick branch for WebGPU render path (empty scene for now).
- New or existing: utility to copy pool texture to a Three.js texture (needs backend ref to get GPUTexture).
- TerrainMaterialNode / WaterMaterialNode: receive textures we update each frame from pool.

## Edge erosion note
Thermal erosion applying at map edges may be a boundary-condition issue in the thermal flux/apply shaders (e.g. missing or wrong handling at simres boundaries). To be addressed separately.
