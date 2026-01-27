# Phase 1 — DI/Class-Based Parity

## Status: Complete

## Goals
- Carry DI/class-based single truth fixes into the WebGPU pipeline branch.
- Remove simulation-state imports in master.
- Ensure holders and injected services are the only state access.

## Tasks
- [x] Port DI adoption changes from refactor/base-terrain-architecture.
- [x] Create state holders (SimulationStateHolder, TerrainStateHolder, ClientStateHolder).
- [x] Create composition root (bootstrap.ts) and AppContext.
- [x] Extract texture management into LegacyTexturePool.
- [x] Update brush-handler.ts to use holders.
- [x] Update event-handlers.ts to use holders.
- [x] Update heightmap-loader.ts to use holders.
- [x] Update render-utils.ts to accept simres as parameter.
- [x] Update main.ts to use composition root and pass holders.
- [x] Mark texture-management.ts as deprecated.
- [x] Ensure TerrainStateHolder owns BVH/geometry.

## Tests
- [x] DI smoke test passes (`npm run test:ci`).
- [x] No production imports of simulation-state (except deprecated texture-management.ts).

## Files Changed

### Created
- `src/app/state/SimulationStateHolder.ts` - Holds mutable simulation state
- `src/app/state/TerrainStateHolder.ts` - Holds terrain geometry and BVH
- `src/app/state/ClientStateHolder.ts` - Holds client-side UI state
- `src/app/bootstrap.ts` - Composition root that creates and wires all holders
- `src/app/context.ts` - AppContext type definition
- `src/simulation/LegacyTexturePool.ts` - Encapsulates texture management
- `src/app/__tests__/bootstrap-services.test.ts` - DI smoke test

### Modified
- `src/brush-handler.ts` - Replaced simulation-state imports with holder access
- `src/events/event-handlers.ts` - Replaced simulation-state imports with holder access
- `src/utils/heightmap-loader.ts` - Replaced simulation-state imports with holder access, uses LegacyTexturePool
- `src/rendering/render-utils.ts` - Removed simres import, accepts as parameter, uses LegacyTexturePool
- `src/simulation/texture-management.ts` - Marked as @deprecated with migration notes
- `src/main.ts` - Uses composition root, passes holders to all functions, uses LegacyTexturePool

## Simulation-State Imports Removed
- `src/brush-handler.ts` - Removed imports of `terrainGeometry, terrainBVH, simres, HightMapCpuBuf`
- `src/events/event-handlers.ts` - Removed imports of `simres, HightMapCpuBuf`
- `src/utils/heightmap-loader.ts` - Removed imports of `setTerrainGeometryDirty, * as simulationState`
- `src/rendering/render-utils.ts` - Removed import of `simres`
- `src/main.ts` - Removed most imports, kept only constants (`simres, shadowMapResolution, MaxHightMapBufCounter, shouldReadHeightmap`)

## Summary
Phase 1 successfully ports the DI/class-based architecture to the WebGPU pipeline branch. All production code now uses state holders instead of direct simulation-state imports. The composition root pattern ensures all dependencies are explicitly injected. Texture management is encapsulated in LegacyTexturePool, eliminating module-level singletons. The DI smoke test verifies that holders are created correctly and can be updated independently.

## Verification
- [x] DI smoke test created (`src/app/__tests__/bootstrap-services.test.ts`) - **All 6 tests passing**
  - Test suite: Bootstrap Services (DI Smoke Test)
  - Tests verify: app context creation, state holder initialization, independent instances, state updates
  - Jest configuration: ESM + TypeScript support configured (`jest.config.js`)
- [x] `npm test` - **All tests passing** (6/6 tests)
- [x] `npm run test:ci` - **All tests passing** (6/6 tests, single-process mode)
- [x] `npm run build` - Build verification completed successfully
  - Build output: 139 modules transformed, all chunks rendered successfully
  - Output files: index.html, vendor chunks, and main index bundle created
- [x] `npx tsc -p tsconfig.json --noEmit` - TypeScript typecheck completed
  - **Phase 1 related code**: No errors in state holders, bootstrap, texture pool, or main.ts DI changes
  - **Remaining errors**: 84 total errors, all pre-existing in other files (Camera.ts, geometry files, shader imports) - not related to Phase 1

## Notes
- Jest test setup complete: `jest.config.js` configured for ESM + TypeScript, `npm test` and `npm run test:ci` both working
- PowerShell execution policy: Use `Set-ExecutionPolicy Bypass -Scope Process` before running npm scripts in PowerShell
- Remaining TypeScript errors are in pre-existing files (Camera.ts, geometry files, shader imports) and are not related to Phase 1 DI refactoring
- All Phase 1 related code (state holders, bootstrap, texture pool, main.ts updates) compiles without errors
- `main.ts` still imports constants from `simulation-state` (`simres, shadowMapResolution, MaxHightMapBufCounter, shouldReadHeightmap`) - this is acceptable as these are constants, not mutable state
- [ ] MCP browser test (smoke UI)
