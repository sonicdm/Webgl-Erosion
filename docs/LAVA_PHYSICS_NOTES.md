# Lava Physics Notes

Practical reference for the lava simulation model used in this project.
All values are qualitative or approximate — this is a visual sim, not a volcanology tool.

## Lava Rheology (Viscosity vs Temperature)

Lava viscosity depends exponentially on temperature. Basaltic lava (low silica) flows freely at ~1200°C with viscosity ~100 Pa·s. As it cools toward ~700°C, viscosity increases by orders of magnitude (10^4–10^7 Pa·s) and flow effectively stops.

**Practical model:**
```
viscosity = baseVisc * exp(alpha * (T_ref - T))
```
- `T_ref = 1.0` (emission temperature, normalized)
- `alpha = 4.0` (controls steepness; higher = sharper cutoff near solidification)
- At T=1.0: visc=1 (free flow)
- At T=0.5: visc≈7.4 (sluggish)
- At T=0.0: visc≈55 (frozen), capped at 1000 to avoid numerical issues

Real lava composition (silica content) shifts the curve — rhyolitic lava is orders of magnitude more viscous at the same temperature. We approximate this with `baseVisc` and `alpha` parameters rather than tracking composition explicitly.

## Cooling Mechanisms

### Radiative cooling (dominant at surface)
Stefan-Boltzmann: power ∝ T^4. Exposed lava surface radiates intensely. Thin lava cools faster (higher surface-area-to-volume ratio).

### Conductive cooling
Heat conducts into underlying rock/cooler lava. Rate ∝ temperature gradient. Crust acts as insulator (rock has low thermal conductivity ~1-2 W/m·K).

### Convective cooling
Wind and rain cool the surface. In our sim, approximated as a constant "ambient cooling rate" term.

### Crust formation
Surface cools first → forms a solid crust within minutes. Crust insulates the interior, dramatically slowing further cooling. Crust thickness grows as sqrt(time) in theory; we use a linear rate modulated by `(1 - T)` for simplicity.

**Practical model:**
```
// Ambient + surface area cooling
temp -= ambientCoolingRate * dt
temp -= coolingRate * surfaceAreaFactor * crustInsulation * dt

// Crust growth when T < 0.8
crustThickness += crustGrowthRate * (1 - T) * dt
crustThickness = min(crustThickness, height * 0.5)

// Insulation factor
crustInsulation = 1.0 / (1.0 + crustThickness * 5.0)
```

## Pillow / Lobate Flows

When lava enters water or flows over cooled lava, the surface quenches instantly but interior stays fluid. This creates pillow-shaped lobes: new lava breaks through the crust and forms a new pillow on top.

**Grid sim approximation:**
- Track crust fraction per cell
- New incoming hot lava (deltaH > 0) mixes with existing lava, but mixing is suppressed by crust
- Crust acts as a barrier: `mixFactor = clamp(1 - C * suppressionScale, 0, 1)`
- Even with full crust, conduction slowly transfers heat between layers
- When reheated above softening temperature, crust thins and flow resumes

This doesn't produce true 3D pillow shapes but captures the key behavior: hot lava advancing as distinct lobes over cooled substrate, with limited mixing and slow conduction.

## Water–Lava Interaction

### Quenching
Contact with water causes rapid cooling of the lava surface → instant crust formation. The "quench crust" is thicker and forms faster than air-cooled crust.

### Steam generation
Water flashes to steam (1600x volume expansion). In our sim, water is simply removed (evaporated) at the contact zone. We don't model steam pressure.

### Mutual exclusion
Lava (density ~2700 kg/m³) is much denser than water (~1000 kg/m³). They cannot occupy the same volume. Lava displaces water by density priority. Water can only overtop lava if hydraulically higher — but this is rare and the overtopping water flash-evaporates on contact.

### Barrier behavior
Solidified lava creates permanent terrain. Water is redirected around lava dams rather than flowing through. In the sim, this happens naturally because solidified lava becomes terrain height.

**Practical model:**
```
// Capacity constraint (mutual exclusion)
if (lavaHeight + water > CELL_CAPACITY):
    water -= excess  // lava takes priority

// Direct contact: quench + evaporate
if (lava > 0.001 && water > 0.001):
    contactAmount = min(water, lava * 0.1) * 0.5
    water -= contactAmount
    temperature -= contactAmount * quenchFactor
    crustThickness += contactAmount * crustBoostFactor
```

## Thermal Erosion of Terrain

Hot lava can melt and erode underlying rock, but this is a slow process. Basaltic lava at 1200°C can erode ~1-10 cm/day into rock substrate under sustained contact. Key factors:

- **Temperature:** Higher T = more erosion. Below rock melt threshold (~700°C for basalt), erosion is negligible.
- **Contact time:** Erosion is cumulative. Fast-flowing lava has less contact time per cell.
- **Substrate resistance:** Hard rock (high rock fraction) resists erosion. Sediment erodes more easily.
- **Speed:** Turbulent flow increases heat transfer to substrate, but the effect is bounded.

**Critical constraint:** Erosion must be bounded per time step. Without a hard cap, numerical instability (large speed × large rate) can flatten terrain instantly.

**Practical model:**
```
clampedSpeed = min(speed, erosionSpeedClamp)
erosionRate = thermalErosionRate * temperature * clampedSpeed * dt

// Rock resistance
if (rock > 0.1):
    if (temp > rockMeltThreshold): erosionRate *= (1 - rockStrength * 0.7)
    else: erosionRate *= (1 - rockStrength * 0.95)

// Hard per-step cap
erosionRate = min(erosionRate, maxErosionPerStep)
```

## Simulation Approximations Used in This Project

| Real Physics | Sim Approximation |
|---|---|
| 3D fluid dynamics | 2D heightfield + pipe model (4-directional flux) |
| Continuous viscosity field | Single viscosity per cell, exponential in temperature |
| Radiative T^4 cooling | Linear cooling rate with surface-area factor |
| Crust as separate solid layer | Crust fraction (0-1) modifying viscosity + insulation |
| Pillow lava 3D lobes | Crust-suppressed mixing + conduction between layers |
| Steam explosions | Instant water removal + lava quench cooling |
| Rock melting chemistry | Temperature threshold + resistance factor |
| Composition-dependent rheology | Single `baseVisc` + `alpha` parameters (future: tint channel) |
