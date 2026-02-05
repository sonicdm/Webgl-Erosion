# Three Terrain GUI Implementation Tracking

This folder tracks the detailed implementation progress of the THREE.Terrain GUI feature implementation.

## Overview

Restore full THREE.Terrain parameter controls with GUI, wire them into terrain generation, ensure VTF/simres/ping-pong alignment, and add GPU readback health checks with heightmap parity validation.

## Progress Summary

- **Phase 1**: Legacy Base Types + THREE Parameters Integration - ⏳ Pending
- **Phase 2**: Generation Wiring & Guards - ⏳ Pending
- **Phase 3**: Binding + Ping-Pong Freshness - ⏳ Pending
- **Phase 4**: GPU Readback Health + Parity Tests - ⏳ Pending
- **Phase 5**: Error Surfacing & UX Polish - ⏳ Pending
- **Phase 6**: THREE.Terrain Wrapper Integration - ⏳ Pending

## Status Legend

- ⏳ Pending
- 🔄 In Progress
- ✅ Complete
- ⚠️ Blocked
- ❌ Failed

## Phase Files

- [Phase 1: Legacy Base Types + THREE Parameters Integration](./phase1.md)
- [Phase 2: Generation Wiring & Guards](./phase2.md)
- [Phase 3: Binding + Ping-Pong Freshness](./phase3.md)
- [Phase 4: GPU Readback Health + Parity Tests](./phase4.md)
- [Phase 5: Error Surfacing & UX Polish](./phase5.md)
- [Phase 6: THREE.Terrain Wrapper Integration](./phase6.md)

## Related Documents

- [THREE_TERRAIN_GUI_PLAN.md](../THREE_TERRAIN_GUI_PLAN.md) - Original plan document
- [FEATURE_PARITY_ANALYSIS.md](../FEATURE_PARITY_ANALYSIS.md) - Feature parity analysis

## Notes

- All THREE.Terrain types are currently erroring (not just Hill/PerlinDiamond) - investigate root cause in TerrainReadbackService or ThreeTerrainWrapper
- Acceptance criteria requires testing all 17 THREE.Terrain method types
- Default parameter tables live in terrain classes (single source of truth)
