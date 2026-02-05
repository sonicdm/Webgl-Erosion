# WebGPU Migration Changelog

## Phase 4 — Material Scaffolds

### 2026-01-29
- Added WebGPU material scaffolds for shadow, depth, background scattering, bilateral blur, and composite.
- Introduced scattering and water shader node controllers and aligned TerrainMaterialNode/WaterMaterialNode to use controllers.
- Files: `src/rendering/webgpu/materials/shadow/ShadowMapMaterialWebGPU.ts`, `src/rendering/webgpu/materials/depth/SceneDepthMaterialWebGPU.ts`, `src/rendering/webgpu/materials/postprocessing/BackgroundScatteringMaterialWebGPU.ts`, `src/rendering/webgpu/materials/postprocessing/BilateralBlurMaterialWebGPU.ts`, `src/rendering/webgpu/materials/postprocessing/CompositeMaterialWebGPU.ts`, `src/rendering/webgpu/shader-nodes/scattering/*`, `src/rendering/webgpu/shader-nodes/water/WaterShaderNodeController.ts`, `src/rendering/webgpu/materials/TerrainMaterialNode.ts`, `src/rendering/webgpu/materials/WaterMaterialNode.ts`.
- Added unit tests for material scaffolds and updated TerrainMaterialNode/WaterMaterialNode tests.
- Validation: npm run build (not run), npx tsc -p tsconfig.json --noEmit (not run), npm run test:ci (not run), MCP browser validation (not run).

## Phase 3 — Simulation + Seeding

### 2026-01-29
- Seeded WebGPU terrain textures from the generated heightmap so simulation starts from procedural terrain instead of a flat plane.
- Files: `src/simulation/WebGPUTexturePool.ts`, `src/main.ts`.
- Validation: npm run build (not run), npx tsc -p tsconfig.json --noEmit (not run), npm run test:ci (not run), MCP browser validation (not run).

## Phase 5 — Terrain Material Port

### 2026-01-29
- Added terrain sampling, palette, debug view, and shadow shader nodes with evaluation helpers and tests.
- Implemented TerrainBaseMaterialWebGPU and TerrainDebugMaterialWebGPU scaffolds with tests.
- Files: `src/rendering/webgpu/shader-nodes/terrain/*`, `src/rendering/webgpu/materials/terrain/TerrainBaseMaterialWebGPU.ts`, `src/rendering/webgpu/materials/terrain/TerrainDebugMaterialWebGPU.ts`.
- Validation: npm run build (not run), npx tsc -p tsconfig.json --noEmit (not run), npm run test:ci (not run), MCP browser validation (not run).
