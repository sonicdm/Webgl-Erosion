# Lava Overhaul — Architecture & Status

## Current Status

**Phase:** Implementation in progress (Commit 1 of 11)

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
Pass 8: (probes + logging)
```

### Texture Channels (3 ping-pong pairs, rgba32float)

| Texture | R | G | B | A |
|---------|---|---|---|---|
| lava | height (H) | temperature (T) | viscosity | crustThickness (C) |
| lavaFlux | fUp | fRight | fDown | fLeft |
| lavaVel | velX | velY | speed | deltaH |

Derived values (computed in-shader, not stored):
- `solidMask = step(T, solidTemp)`
- `heat = clamp(speed * heatScale, 0, 1)` (computed in render shader)

### Key Files

| File | Purpose |
|------|---------|
| `src/rendering/webgpu/compute/ComputeNodePipeline.ts` | All WGSL compute passes |
| `src/simulation/SimulatePerStepWebGPU.ts` | Pass orchestration |
| `src/rendering/webgpu/materials/LavaMaterialNode.ts` | Lava rendering (PBR + emissive) |
| `src/app/controls/types.ts` | Control type definitions |
| `src/app/controls/controls-factory.ts` | Control defaults |
| `src/gui/gui-setup.ts` | GUI setup |
| `src/utils/rate-limited-logger.ts` | Rate-limited logging |
| `src/simulation/WebGPUTexturePool.ts` | Texture pool (unchanged) |

## Parameter List

### Existing Parameters (with tuned defaults)

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

### New Parameters

| Parameter | Default | Range | Pass | Purpose |
|-----------|---------|-------|------|---------|
| lavaSofteningTemp | 0.6 | 0.3–0.9 | Thermal Transfer | Crust re-mobilization threshold |
| lavaKCond | 0.3 | 0.01–1.0 | Thermal Transfer | Lava-lava conductivity |
| lavaCrustMixSuppression | 2.0 | 0.0–5.0 | Thermal Transfer | Crust blocks heat mixing |
| lavaAmbientCoolingRate | 0.05 | 0.0–0.2 | Cooling | Constant heat loss |
| lavaViscTempScale | 4.0 | 1.0–10.0 | Cooling | Exponential viscosity alpha |
| lavaMaxErosionPerStep | 0.002 | 0.0001–0.01 | Erosion | Hard erosion cap |
| lavaErosionSpeedClamp | 5.0 | 1.0–20.0 | Erosion | Speed clamp for erosion |

## Validation Checklist

- [ ] Lava flows downhill, pools in basins, does not teleport
- [ ] Hot lava flows faster than cool lava (exponential viscosity)
- [ ] Temperature decays over time; crust forms on cooling
- [ ] Hot lava over cool lava: substrate warms, top cools
- [ ] Crust suppresses mixing but conduction still occurs
- [ ] Re-mobilization when reheated above softening temp
- [ ] Water and lava cannot occupy same cell volume
- [ ] Water-lava contact: quench crust + evaporation
- [ ] Thermal erosion bounded — no catastrophic terrain destruction
- [ ] Color ramp: white→orange→red→dark red→black with temperature
- [ ] Emissive glow on hot lava, dark crust with glowing cracks
- [ ] Material is PBR (MeshStandardNodeMaterial), responds to lighting
- [ ] All debug views show meaningful data
- [ ] Logger rate-limited, no console flooding

## Commit Log

### Commit 1 — docs: lava physics notes + overhaul architecture doc
- **What changed:** Created LAVA_PHYSICS_NOTES.md and LAVA_OVERHAUL.md
- **Verification:** Documentation only, no code changes
- **Known issues:** All simulation/rendering changes still pending

## Known Issues

- Thermal erosion is currently unbounded (Commit 3 fix)
- Viscosity model is quadratic instead of exponential (Commit 4 fix)
- No lava-lava thermal transfer pass (Commit 6)
- Water-lava exclusion is weak (Commit 7)
- LavaMaterialNode uses MeshBasicNodeMaterial instead of PBR (Commit 8)
- Debug views 11-15 defined in enum but not wired in build() (Commit 9)
