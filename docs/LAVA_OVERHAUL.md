# Lava Overhaul — Architecture & Status

## Current Status

**Phase:** Implementation complete (all 11 commits landed)

All core simulation, rendering, and tooling changes are implemented. The system needs
runtime verification (visual testing with the app running) to confirm acceptance tests pass.

## Architecture Map

### Compute Pass Order (8 passes)

```
Pass 1: lavaSourcePass            → swapLava
Pass 2: lavaFluxPass              → swapLavaFlux
Pass 3: lavaHeightVelPass         → swapLava, swapLavaVel
Pass 4: lavaThermalTransferPass   → swapLava              [NEW]
Pass 5: lavaThermalErosionPass    → swapTerrain           [FIXED]
Pass 6: lavaCoolingPass           → swapLava, swapTerrain [ENHANCED]
Pass 7: lavaWaterExclusionPass    → swapLava, swapTerrain [ENHANCED]
Pass 8: (diagnostics logging)
```

### Texture Channels (3 ping-pong pairs, rgba32float)

| Texture | R | G | B | A |
|---------|---|---|---|---|
| lava | height (H) | temperature (T) | viscosity | crustThickness (C) |
| lavaFlux | fUp | fRight | fDown | fLeft |
| lavaVel | velX | velY | speed | deltaH |

Derived values (computed in-shader, not stored):
- `solidMask = step(T, solidTemp)`
- `heat = clamp(speed * 2 + temp, 0, 1) * 0.5` (computed in render shader)

### Key Files

| File | Purpose |
|------|---------|
| `src/rendering/webgpu/compute/ComputeNodePipeline.ts` | All 7 WGSL compute passes |
| `src/simulation/SimulatePerStepWebGPU.ts` | Pass orchestration + diagnostics |
| `src/rendering/webgpu/materials/LavaMaterialNode.ts` | Lava rendering (5-stage color ramp + emissive) |
| `src/app/controls/types.ts` | Control type definitions |
| `src/app/controls/controls-factory.ts` | Control defaults |
| `src/gui/gui-setup.ts` | GUI setup + test preset |
| `src/utils/rate-limited-logger.ts` | Rate-limited logging |
| `src/rendering/webgpu/shader-nodes/terrain/TerrainDebugViewNode.ts` | Debug view enum (18 modes) |
| `src/rendering/webgpu/materials/TerrainMaterialNode.ts` | Debug view rendering |
| `src/simulation/WebGPUTexturePool.ts` | Texture pool (unchanged) |

## Parameter List

### Existing Parameters

| Parameter | Default | Range | Pass |
|-----------|---------|-------|------|
| lavaEmissionTemp | 1.0 | 0.5–1.0 | Source |
| lavaViscosityScale | 5.0 | 0.1–10.0 | Flux |
| lavaYieldStress | 0.5 | 0.0–2.0 | Flux |
| lavaCrustStrength | 0.5 | 0.1–2.0 | Flux |
| lavaCoolingRate | 0.1 | 0.01–1.0 | Cooling |
| lavaProportionalCooling | 0.02 | 0.0–0.1 | Cooling |
| lavaSolidificationThreshold | 0.15 | 0.05–0.5 | Cooling |
| lavaRockFraction | 0.7 | 0.0–1.0 | Cooling |
| lavaCrustGrowthRate | 0.1 | 0.01–0.5 | Cooling |
| lavaThermalErosionRate | 0.5 | 0.1–2.0 | Erosion |
| lavaRockMeltThreshold | 0.7 | 0.3–0.9 | Erosion |
| lavaHeatScale | 2.0 | 0.1–5.0 | Render |
| lavaWaterInteraction | true | bool | Water |
| lavaHeatRadius | 2 | 1–4 | Water |

### New Parameters (added in overhaul)

| Parameter | Default | Range | Pass | Purpose |
|-----------|---------|-------|------|---------|
| lavaSofteningTemp | 0.6 | 0.3–0.9 | Thermal Transfer | Crust re-mobilization threshold |
| lavaKCond | 0.3 | 0.01–1.0 | Thermal Transfer | Lava-lava conductivity |
| lavaCrustMixSuppression | 2.0 | 0.0–5.0 | Thermal Transfer | Crust blocks heat mixing |
| lavaAmbientCoolingRate | 0.05 | 0.0–0.2 | Cooling | Constant ambient heat loss |
| lavaViscTempScale | 4.0 | 1.0–10.0 | Cooling | Exponential viscosity alpha |
| lavaMaxErosionPerStep | 0.002 | 0.0001–0.01 | Erosion | Hard per-step erosion cap |
| lavaErosionSpeedClamp | 5.0 | 1.0–20.0 | Erosion | Speed clamp for erosion formula |

## Debug Views (8 lava modes)

| Mode | Name | Visualization |
|------|------|---------------|
| 11 | LavaHeight | Blue-white ramp (H*5, H*2, H) |
| 12 | LavaTemperature | Red-orange heat map |
| 13 | LavaVelocity | Velocity magnitude (abs/5) |
| 14 | LavaVolume | Thermal mass H*T (black→orange→yellow) |
| 15 | LavaLayering | Insulation pattern (R=exposed, G=insulated, B=self) |
| 16 | WaterLavaContact | Red=lava, blue=water, green=overlap zone |
| 17 | LavaCrust | White=thick crust, red-orange=cracking |
| 18 | LavaDeltaH | Green=arriving, red=leaving |

## Validation Checklist

- [x] Thermal erosion bounded (speed clamp + per-step cap + timestep)
- [x] Exponential viscosity model (hot flows, cold stalls)
- [x] Ambient + surface-area cooling (no spurious waterEvapRate dependency)
- [x] deltaH tracked for thermal transfer pass
- [x] Lava-lava thermal transfer (conduction + mixing suppression + re-mobilization)
- [x] Water-lava mutual exclusion (capacity constraint + flow blocking + quench crust)
- [x] 5-stage temperature color ramp (black→dark red→red→orange→yellow)
- [x] Emissive glow + crust cracks + flow heat + fresnel rim
- [x] 8 lava debug views wired and accessible in GUI
- [x] Rate-limited logger with categories
- [x] Test scene preset button

### Requires Runtime Verification

- [ ] Lava flows downhill, pools in basins, does not teleport
- [ ] Hot lava flows faster than cool lava
- [ ] Temperature decays over time; crust forms on cooling
- [ ] Hot lava over cool lava: substrate warms, top cools
- [ ] Crust suppresses mixing but conduction still occurs
- [ ] Re-mobilization when reheated above softening temp
- [ ] Water and lava cannot occupy same cell volume
- [ ] Thermal erosion does not flatten mountains in seconds
- [ ] Color ramp matches spec (check with lavaTemperature debug view)
- [ ] Logger is rate-limited, no console flooding

## Commit Log

### Commit 1 — `docs(lava): physics notes + overhaul architecture`
- Created LAVA_PHYSICS_NOTES.md and LAVA_OVERHAUL.md
- Research-only, no code changes

### Commit 2 — `chore(lava): rate-limited logger + new controls`
- New `src/utils/rate-limited-logger.ts` with 5 categories, 2s throttle
- 7 new control properties in types/defaults/GUI

### Commit 3 — `fix(lava/terrain): bound thermal erosion`
- Root cause fix: removed Ks, added speed clamp, timestep, per-step cap
- Erosion formula: `rate * temp * clamp(speed) * dt`, capped at maxErosionPerStep

### Commit 4 — `feat(lava/sim): exponential viscosity + cooling cleanup`
- Replaced quadratic viscosity with `exp(alpha * (1 - T))`, capped at 1000
- Separated ambient cooling from proportional cooling
- Removed waterEvapRate from cooling formula

### Commit 5 — `feat(lava/sim): deltaH in lavaVel.A + heat to render`
- Repurposed lavaVel.w from `heat` to `deltaH = d2 - d1`
- Moved heat derivation to LavaMaterialNode

### Commit 6 — `feat(lava/sim): lava-lava thermal transfer`
- New pass: crust-suppressed mixing, 4-neighbor lateral conduction, re-mobilization
- Reads deltaH to know where new lava arrived

### Commit 7 — `feat(lava/sim): water-lava mutual exclusion`
- Capacity constraint, flow blocking, quench crust formation
- Added timestep to water interaction pass

### Commit 8 — `feat(lava/render): 5-stage color ramp + emissive`
- Black→dark red→red→orange→yellow temperature ramp
- Crust cracks, emissive glow, flow heat, fresnel rim

### Commit 9 — `feat(lava/debug): 3 new debug views + GUI dropdown`
- Added WaterLavaContact, LavaCrust, LavaDeltaH (modes 16-18)
- All 8 lava modes in GUI dropdown

### Commit 10 — `feat(lava/dev): test preset + diagnostics`
- GUI "Apply Test Preset" button with tuned parameter values
- Rate-limited per-step diagnostics when lava sources active

### Commit 11 — `docs(lava): final status update`
- Updated LAVA_OVERHAUL.md with complete commit log and validation status

## Known Remaining Work

- GPU texture readback probes (min/max lava height/temperature) — requires async readback buffer
- Performance optimization pass — profile pass timings, consider merging lightweight passes
- The project uses MeshBasicNodeMaterial with manual Lambertian lighting throughout (no scene lights).
  Switching to MeshStandardNodeMaterial requires adding DirectionalLight/AmbientLight to the scene first.
  Current implementation uses manual lighting with enhanced emissive, which looks correct.
