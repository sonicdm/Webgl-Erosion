# Lava Simulation Fix Changelog

Running log of every change made, in order. Each entry includes what was changed, why, and which commit captured it.

---

## Current State (starting point)

ComputeNodePipeline.ts is at commit `6d1a313` (initial rough port, never fully working).
Other files have minor fixes from previous sessions:
- `settings.ts`: permanentLavaSource key merge fix
- `SimulatePerStepWebGPU.ts`: lavaEnabled gate removed (bare block scope)
- `gui-setup.ts`: Enable Lava checkbox removed
- `event-handlers.ts`: debug logging for key actions and lava sources
- `ComputePass.ts`: WGSL compile error reporting
- `TerrainMaterialNode.ts` + `TerrainDebugViewNode.ts`: LavaVolume/LavaLayering debug views

---

## Session 1 (previous agent — overhaul)

Major overhaul across 11 commits. Added 7 external WGSL shaders, new compute passes (thermal transfer, thermal erosion), exponential viscosity model, crust breakout, yield stress, water-lava interaction. **Result: lava stopped flowing entirely.**

Key issues introduced:
- Exponential viscosity `exp(alpha*(1-T))-1` too aggressive — killed flow at any temperature below 1.0
- Crust breakout check in flux shader halved flux exponentially each step
- Yield stress threshold too high (0.5) blocked all flow
- Temperature advection inFrac capped at 0.5 — lost 50% temp per cell hop
- Cooling rates not tuned for 180 steps/sec — lava cooled to rock in seconds
- All inline shaders extracted to external `.wgsl` files (correct, was a project rule)

---

## Session 2 (current — fixing flow)

### Change 1: Strip lava-flux.wgsl to match water flux
**File:** `src/rendering/webgpu/compute/shaders/lava-flux.wgsl`
**Why:** The overhaul added crust breakout check, yield stress, and viscosity damping to the total flux (not just acceleration). These additions killed flow. Stripped back to match the proven water flow shader exactly — same pipe model formula, just with separate lava+terrain height difference and a viscosity damping term.
**Removed:** Crust breakout early return, yield stress zero-out, temperature reads.

### Change 2: Disable extra passes to isolate flow
**File:** `src/simulation/SimulatePerStepWebGPU.ts`
**Why:** With 7 passes, couldn't tell which one was killing flow. Disabled thermal transfer, thermal erosion, cooling, and water interaction. Left only: source → flux → heightVel.
**Result:** Lava flowed like water — confirmed core pipe model works.

### Change 3: Re-enable cooling pass
**File:** `src/simulation/SimulatePerStepWebGPU.ts`
**Why:** Need cooling for viscosity, solidification, temperature decay.
**Result:** Flow stopped again — cooling pass was the culprit.

### Change 4: Fix viscosity model — exponential → linear
**File:** `src/rendering/webgpu/compute/shaders/lava-cooling.wgsl`
**Why:** Exponential viscosity `exp(4*(1-T))-1` gave visc=0.49 at T=0.9, visc=6.39 at T=0.5. With viscDamp applied to total flux every step, this compounded to near-zero flow. Changed to linear: `visc = alpha * (1-T)`.
**Result:** Still too slow.

### Change 5: Timestep-scale viscosity application (attempt 1)
**File:** `src/rendering/webgpu/compute/shaders/lava-flux.wgsl`
**Why:** viscDamp was multiplied into flux every step. At 180 steps/sec, even 0.99^180 = 0.16. Tried `pow(baseDamp, timestep)`.
**Result:** Still too slow — pow on accumulated flux still compounds.

### Change 6: Viscosity only dampens acceleration, not accumulated flux
**File:** `src/rendering/webgpu/compute/shaders/lava-flux.wgsl`
**Why:** The fundamental issue: multiplying viscDamp into the total flux (old + new) each step creates exponential decay of momentum. Water shader has NO damping on accumulated flux. Changed to: `flux = max(0, oldFlux + accel * viscDamp)` — viscosity only reduces how fast NEW flux builds, preserving existing momentum.
**Result:** Lava flows, but slowly.

### Change 7: Reduce cooling rates
**File:** `src/app/controls/controls-factory.ts`
**Why:** Cooling too fast at 180 steps/sec. Halved all rates.
**Changes:**
- `lavaCoolingRate`: 0.005 → 0.002
- `lavaProportionalCooling`: 0.005 → 0.002
- `lavaAmbientCoolingRate`: 0.002 → 0.001

### Change 8: Base viscosity for realistic lava speed
**File:** `src/rendering/webgpu/compute/shaders/lava-cooling.wgsl`
**Why:** Even hot basaltic lava flows at ~1/4 to 1/5 water speed. Added base viscosity of 0.6 so T=1.0 lava has viscDamp≈0.25. Changed to quadratic ramp: `visc = 0.6 + alpha * (1-T)^2`.
**Reference:** USGS data — typical lava 0.001-0.3 m/s vs rivers 0.5-1.5 m/s.

### Change 9: Fix lava detachment — UV clamping
**File:** `src/rendering/webgpu/materials/LavaMaterialNode.ts`
**Why:** Lava mesh floated above terrain. Terrain material uses `safeUv` with half-texel clamping; lava used raw `uv()`. Different sampling at mesh edges caused mismatch. Also reduced z-fight offset from 0.0004 to 0.0002.
**Changes:** Added `safeUv` clamping matching terrain material. Dropped `waterLevel` from displacement (lava displaces water, doesn't float on it).

### Change 10: Add yield stress (Bingham fluid model)
**File:** `src/rendering/webgpu/compute/shaders/lava-flux.wgsl`
**Why:** Lava was sheeting out paper-thin like water on flat ground. Real lava is a Bingham plastic — has internal strength, won't flow unless driving stress exceeds yield stress. Added per-direction yield check: if height difference < yieldThreshold, zero that direction's flux. Threshold scales with viscosity: `yieldThreshold = yieldStress * (1 + viscosity)`.
**File:** `src/app/controls/controls-factory.ts`
**Why:** Old yieldStress=0.01 too low to prevent sheeting.
**Changes:** `lavaYieldStress`: 0.01 → 0.2

### Change 11: Restore proper lava material — temperature color ramp + emissive glow
**File:** `src/rendering/webgpu/materials/LavaMaterialNode.ts`
**Why:** Diagnostic orange material was in place (just `R=temperature, G=temperature*0.5, B=0`). Needed proper lava rendering matching real-world appearance.
**Changes:**
- **5-stage temperature color ramp** using `smoothstep` interpolation between stages:
  - T > 0.90: white/yellow `(1.0, 0.85, 0.35)` — incandescent (>1150°C)
  - T 0.70–0.90: bright orange `(1.0, 0.45, 0.05)` — (1000–1150°C)
  - T 0.45–0.70: cherry red `(0.8, 0.15, 0.02)` — (650–1000°C)
  - T 0.35–0.45: dark red/brown `(0.3, 0.05, 0.02)` — (500–650°C)
  - T < 0.35: black basalt `(0.05, 0.04, 0.03)` — solid
- **Crust darkening**: thick crust → dark insulating skin. `crustFactor = clamp(crustThickness*8, 0, 1)`. Crust melts through at high T (`smoothstep(0.5, 0.8, T)`), revealing glowing interior beneath.
- **Emissive glow**: `emissiveIntensity = ((T-0.3)/0.7)^2 * 1.5`. Added on top of Lambertian lighting so hot lava glows even in shadow. Crust blocks 70% of emission.
- **Surface normal estimation** from height gradient (4-neighbor finite difference on terrain+lava height) for proper Lambertian shading of the lava surface.
- **Speed-based frictional heat glow** from lavaVelocityMap: fast-flowing lava gets subtle additional brightness.
- Kept `safeUv` clamping, full displacement, and 0.0002 z-fight offset from Change 9.

### Change 12: Re-enable all disabled compute passes
**File:** `src/simulation/SimulatePerStepWebGPU.ts`
**Why:** Core flow is working (source → flux → heightVel → cooling). Time to bring back the remaining physics passes that were disabled in Change 2. All three shaders already have proper safeguards from the overhaul (speed clamp, per-step erosion cap, timestep scaling).
**Changes:**
- **9d. Thermal Transfer** (after heightVel, before erosion): lava-lava heat conduction, incoming lava mixing (suppressed by crust), 4-neighbor lateral conduction, re-mobilization when reheated above softening temp. Reads `lavaKCond`, `lavaCrustMixSuppression`, `lavaSofteningTemp` from controls. Swaps lava textures after.
- **9e. Thermal Erosion** (after thermal transfer, before cooling): hot flowing lava erodes terrain. Already has speed clamp (`lavaErosionSpeedClamp`), per-step cap (`lavaMaxErosionPerStep`), rock resistance below melt threshold, timestep scaling. Swaps terrain textures after.
- **9g. Water-Lava Interaction** (after cooling, conditional on `lavaWaterInteraction` toggle): mutual exclusion (lava denser, takes priority), flow blocking (thick lava displaces water), quench cooling on contact, rapid crust formation, heat-radius evaporation. Guarded by `controls.lavaWaterInteraction` boolean so it can be toggled. Swaps lava + terrain textures after.

### Current pass order (all 7 active):
```
1. lavaSourcePass              → swapLava
2. lavaFluxPass                → swapLavaFlux
3. lavaHeightVelPass           → swapLava, swapLavaVel
4. lavaThermalTransferPass     → swapLava
5. lavaThermalErosionPass      → swapTerrain
6. lavaCoolingPass             → swapLava, swapTerrain
7. lavaWaterInteractionPass    → swapLava, swapTerrain (if lavaWaterInteraction=true)
```

### Change 13: Aggressive solidification — no lingering cooled lava state
**File:** `src/rendering/webgpu/compute/shaders/lava-cooling.wgsl`
**File:** `src/app/controls/controls-factory.ts`
**Why:** Lava was cooling to high viscosity (T=0.3, visc=2.56) but staying as "lava" because solidification threshold was 0.05. This created pixel-thin barriers of immobile lava that new hot lava couldn't push past. Real lava solidifies into rock — there should be no "cooled but still lava" state.
**Changes:**
- Raised `lavaSolidificationThreshold`: 0.05 → 0.35 — lava starts solidifying into rock much sooner
- Changed solidification rate from `solidRate * 0.3` to `sqrt(solidFrac) * 2.0` — aggressive conversion even just below threshold
- Added cleanup: any lava < 0.001 height is fully converted to terrain/rock (no negligible lava remnants)
- `sqrt(solidFrac)` curve means even lava barely below threshold (T=0.34 when threshold=0.35) solidifies at ~17% rate, not the previous near-zero rate
**Result:** Cooled lava front converts to terrain rock. New hot lava sees higher terrain and flows over it.

### Change 14: Fix yield stress — hot lava has no yield stress
**File:** `src/rendering/webgpu/compute/shaders/lava-flux.wgsl`
**Why:** Yield threshold was `yieldStress * (1 + viscosity)`. With base viscosity 0.6, even T=1.0 lava had yieldThreshold = 0.2 * 1.6 = 0.32 — requiring huge height differences to flow. Hot basaltic lava is Newtonian (no yield stress). Yield stress only develops as crystals form during cooling.
**Changes:**
- Changed from `yieldStress * (1 + viscosity_val)` to `yieldStress * max(0, viscosity_val - 0.6)`
- At T=1.0 (visc=0.6): yield threshold = 0 — hot lava flows freely like Newtonian fluid
- At T=0.5 (visc=1.6): yield threshold = 0.2 * 1.0 = 0.2 — moderate resistance
- At T=0.0 (visc=4.6): yield threshold = 0.2 * 4.0 = 0.8 — strong resistance (but this lava is already solidifying into rock via Change 13)
**Physics basis:** Basaltic lava at eruption temp (~1200°C) has near-zero yield stress. Crystal fraction increases below ~1100°C, developing Bingham behavior.

### Change 15: Velocity-gated solidification + flow heat retention
**File:** `src/rendering/webgpu/compute/shaders/lava-cooling.wgsl`
**File:** `src/rendering/webgpu/compute/ComputeNodePipeline.ts`
**File:** `src/app/controls/controls-factory.ts`
**Why:** Change 13's aggressive solidification (threshold 0.35, `sqrt*2.0` rate) caused lava to solidify at the source before it could flow, building rock spires. The fundamental issue: flowing lava shouldn't solidify. In reality, flowing lava retains heat from shear heating and mixing; only stalled lava at the margins and front solidifies.
**Changes:**
- **Added velocity texture** (binding 5) to cooling pass — shader now reads `speed` from lava velocity map
- **Speed gate on solidification**: `speedGate = 1/(1 + speed*10)` — flowing lava solidifies ~10x slower
- **Flow heat retention**: cooling rate reduced by `1/(1 + speed*2)` — moving lava retains heat
- **Crust flow suppression**: crust only grows on slow/stalled lava (`1/(1 + speed*5)`). Fast lava shears crust apart.
- **Solidification rate**: changed from `sqrt(solidFrac) * dt * 2.0` to `solidFrac * dt * 0.5 * speedGate` — much gentler
- **Solidification threshold**: 0.35 → 0.20 — with speed gate, don't need such high threshold
- **Pipeline update**: `ComputeNodePipeline.lavaCoolingPass` bind group now includes `readLavaVelTexture` at binding 5
**Physics basis:** Shear heating in flowing lava keeps it liquid. Hawaiian pāhoehoe channels stay molten for kilometers because the flow maintains temperature. Only margins and stalled fronts solidify into rock.

### Change 16: Stronger flow heat retention + lower cooling rates
**File:** `src/rendering/webgpu/compute/shaders/lava-cooling.wgsl`
**File:** `src/app/controls/controls-factory.ts`
**Why:** Lava was still solidifying too fast near the source, building terrain under the active flow. The speed gate on solidification wasn't enough because the cooling itself was too fast — lava reached the solidification threshold (T=0.20) before reaching the flow margins. At 180 steps/sec, even small cooling rates compound rapidly.
**Root causes:**
1. `flowHeatRetention = 1/(1+speed*2)` — at speed=1, only 33% cooling reduction. Not enough.
2. `surfaceAreaFactor` up to 3.0 — thin leading edge cooled 3x faster than bulk
3. Cooling rates (0.002) × 180 steps/sec = 0.36 temp/sec — lava cooled from 1.0→0.20 in ~2 seconds
**Changes:**
- **Flow cooling suppression**: `1/(1+speed*2)` → `1/(1+speed*20)` — at speed=1, 95% of cooling is suppressed (was 66%)
- **Surface area factor cap**: 3.0 → 2.0, min lava height 0.01 → 0.05 — prevents blow-up at thin leading edge
- **Cooling rates halved again**:
  - `lavaCoolingRate`: 0.002 → 0.0005
  - `lavaProportionalCooling`: 0.002 → 0.0005
  - `lavaAmbientCoolingRate`: 0.001 → 0.0003
- Effective cooling at speed=0: ~0.0003 + 0.0005*surfaceArea ≈ 0.0008 per step × 180 = 0.144 temp/sec (T=1→0.20 in ~5.5 sec)
- Effective cooling at speed=1: ~0.04 per step × 180 = 0.007 temp/sec (essentially no cooling while flowing)
**Physics basis:** Real basaltic lava flows maintain 1000-1100°C for hours in active channels. Cooling is dominated by radiation from the surface, which is negligible compared to the thermal mass of the flow itself. Only stalled/ponded lava cools appreciably.

---

## Session 3 — Paper-grounded overhaul (Griffiths 2000, Tomita 2024, Sallermann 2025, Jákó thesis)

### Change 17: Reduce cooling rates 10x for simulation speed
**Files:** `src/app/controls/controls-factory.ts`, `src/gui/gui-setup.ts`
**Why:** At 180 steps/sec, previous cooling rates (0.0005/step) gave 0.09/sec cooling — lava solidified in ~9 seconds. Real basaltic lava (Griffiths 2000) cools over minutes to hours in active channels. The cooling was "running up to the source" (user report).
**Changes:**
- `lavaCoolingRate`: 0.0005 → 0.00005 (10x reduction)
- `lavaProportionalCooling`: 0.0005 → 0.00005 (10x reduction)
- `lavaAmbientCoolingRate`: 0.0003 → 0.00003 (10x reduction)
- GUI slider ranges updated to match new scale:
  - Cooling Rate: `(0.01, 1.0)` → `(0.00001, 0.01)`
  - Proportional Cooling: `(0.0, 0.1)` → `(0.0, 0.01)`
  - Ambient Cooling: `(0.0, 0.2)` → `(0.0, 0.01)`
**Effective cooling rates:**
- At speed=0 (stalled): ~0.00003 + 0.00005*surfaceArea ≈ 0.00008/step × 180 = 0.014/sec → lava cools T=1.0→0.20 in ~55 seconds
- At speed=1 (flowing): 95% suppressed by flowCoolFactor → effectively no cooling while flowing
**Physics basis:** Griffiths 2000 §3.2: "advance rate is controlled by the balance between supply rate and cooling rate." Cooling-limited advance means lava should travel significant distance before solidifying.

### Change 18: Lateral cooling asymmetry for self-channeling
**File:** `src/rendering/webgpu/compute/shaders/lava-cooling.wgsl`
**Why:** Lava spread uniformly because every cell cooled at the same rate. Griffiths 2000 describes self-channeling: edges of a flow are more exposed (more surface area relative to volume), so they cool faster and form crust levees that confine the hotter, faster core.
**Changes:**
- Sample 4 neighbor lava heights in the cooling pass
- Count "exposed sides" — neighbors with lavaHeight < 30% of this cell's height
- Compute `exposureMultiplier = 1.0 + exposedSides * 0.4` (range: 1.0 center to 2.6 fully exposed edge)
- Apply multiplier to both ambient and surface-area cooling rates
- Apply multiplier to crust growth rate
**Expected behavior:**
- Central channel stays hotter (lower exposure, slower cooling)
- Edges cool faster → form thicker crust → act as levees
- Naturally produces channelized flow morphology
**Physics basis:** Griffiths 2000 §2: "the edges of the flow, being thinner and more exposed, cool fastest, forming solid levees that confine the flow into a channel."

### Change 19: Crust as structural flow barrier (levees)
**File:** `src/rendering/webgpu/compute/shaders/lava-flux.wgsl`
**Why:** Crust affected viscosity via yield stress but didn't directly block flow. Tomita 2024 shows solidification-driven morphology requires cooled crust to physically redirect flow. Neighbor lava data was already being sampled (for height differences) but the `.a` (crust) channel was unused.
**Changes:**
- Added per-direction crust barrier: `barrier = yieldThreshold + neighborCrust * crustStrength`
- Flux into a heavily crusted neighbor is zeroed unless the pressure head exceeds the combined yield + crust barrier
- Uses existing `u_CrustStrength` uniform (was already defined but unused in flux shader)
- No new bindings — neighbor lava `.a` channel already loaded
**Expected behavior:**
- Crusted flow margins physically block new flow from spreading sideways
- Hot lava routes around crusted deposits, flowing through uncrusted channels
- Combined with M2's lateral exposure cooling, creates full levee cycle: cool edges → form crust → block flow → channelize
**Physics basis:** Tomita 2024 §3: "solidification at the flow margin creates raised levees... subsequent flows are confined between these levees."

### Change 20: Enhanced thermal transfer — substrate conduction + re-mobilization viscosity
**Files:** `src/rendering/webgpu/compute/shaders/lava-thermal-transfer.wgsl`, `src/rendering/webgpu/compute/ComputeNodePipeline.ts`
**Why:** The thermal transfer pass didn't account for hot lava flowing over recently solidified rock. Griffiths 2000 and Tomita 2024 describe layered flow behavior where the substrate acts as a heat sink.
**Changes:**
- Added `readTerrain` texture at binding 4 to thermal transfer pass (pipeline + shader)
- **Substrate conduction**: when lava sits on rock (terrain.b > 0.05), heat conducts downward proportional to rock fraction and temperature difference. Crust partially insulates (min 20% conduction).
- **Enhanced re-mobilization**: when reheated lava melts crust, also actively reduce viscosity toward the temperature-appropriate value (`mix` toward target viscosity). Previously only crust was melted, leaving high viscosity from the cooled state.
**Physics basis:** Griffiths 2000 §4: hot lava flowing over cooled substrate loses heat by conduction into the underlying deposit. Tomita 2024 §4: re-mobilization of partly solidified lava when overrun by fresh hot flow.

### Change 21: Crust crack rendering — glowing fissures
**File:** `src/rendering/webgpu/materials/LavaMaterialNode.ts`
**Why:** Crusted lava looked uniformly dark. Real lava crust has glowing fissures where the hot interior shows through thermal stress fractures. This is a key visual feature that communicates the temperature state beneath the crust.
**Changes:**
- Added multi-octave procedural noise (GPU hash function at two scales: 200x and 80x UV)
- Combined with `min()` to create irregular web-like crack patterns
- **Crack conditions**: crust must exist (`crustThickness > 0.01`) AND underlying temp must be hot (`T > 0.35`)
- **Crack width**: thinner crust = wider cracks (more fissures), base width 12%
- Cracks punch through crust darkening to show hot baseColor underneath
- Crack emissive glow: 1.5x normal emissive intensity at crack locations
- Added TSL imports: `fract`, `sin`, `min`
**Visual effect:**
- Dark crusted lava shows orange/red glowing crack network
- Cracks fade as lava cools below T=0.35 (no hot interior to show)
- Cracks disappear as crust melts through at T>0.8 (no crust to crack)
- Produces the characteristic "lava with glowing cracks" appearance

### Change 22: Flow-aligned procedural surface detail
**File:** `src/rendering/webgpu/materials/LavaMaterialNode.ts`
**Why:** Lava surface was perfectly smooth. Real lava has flow banding (pahoehoe ropy texture, aa jagged surface) depending on speed and viscosity.
**Changes:**
- Added anisotropic noise using velocity direction: UV coordinates stretched along flow direction
- Speed-dependent stretching: fast flow = elongated streaks, slow flow = subtle ripples
- Subtle color modulation (0.92-1.08 range) — not overwhelming, just adds surface texture
- Applied to lit surface color only (not emissive, to avoid glow artifacts)
- Uses existing velocity map sampling (no additional texture reads)
**Visual effect:**
- Moving lava shows directional flow lines/streaks
- Stationary lava has subtle random surface variation
- Effect strengthens with flow speed

### Change 23: Water-lava interaction polish + enable by default
**Files:** `src/rendering/webgpu/compute/shaders/lava-water-interaction.wgsl`, `src/app/controls/controls-factory.ts`
**Why:** Water-lava interaction was disabled by default and too aggressive when enabled — quench cooling (5.0 multiplier) instantly froze lava on contact, making it unusable.
**Changes:**
- **Quench cooling reduced**: 5.0 → 1.5 — forms quench crust (insulates core) rather than freezing entire flow
- **Crust formation increased**: 2.0 → 3.0 — quench contact makes thick crust (pillow basalt behavior)
- **Flash evaporation**: hot lava (T > 0.7) now aggressively vaporizes nearby water
- **Flow blocking strengthened**: threshold lowered (0.05 → 0.02), rate increased (0.3 → 0.5) — thinner lava still displaces water
- **Solidification rate reduced**: 0.05 → 0.03 per step — less instant rock conversion
- **Heat radius**: now temperature-squared scaling (radiative — hot lava evaporates more distant water), T < 0.4 lava doesn't contribute
- **Enabled by default**: `lavaWaterInteraction: true` — was false
**Physics basis:** Real lava-water interaction forms pillow basalt (quench crust with hot interior), not instant solid rock. Steam explosions and flash evaporation dominate the near-field.

### Change 24: Updated test preset + thermal erosion debug view
**Files:** `src/gui/gui-setup.ts`, `src/rendering/webgpu/materials/TerrainMaterialNode.ts`, `src/rendering/webgpu/shader-nodes/terrain/TerrainDebugViewNode.ts`
**Why:** Test preset had stale cooling rates (0.03 — 600x higher than new defaults). Also added thermal erosion rate visualization that was requested in the spec.
**Changes:**
- **Test preset**: All values updated to match current paper-grounded defaults (cooling rates 10x lower, viscosity scale 5.0, solidification threshold 0.20, etc.)
- **Thermal erosion debug view** (mode 19 — `thermalErosionRate`):
  - Shows estimated erosion intensity as `temperature * speed` heatmap
  - Blue→green→red color ramp: blue = low erosion, red = high erosion
  - Derived from existing lava temp + velocity channels (no new textures)
  - Added to TerrainDebugMode enum as `ThermalErosionRate = 19`
  - Added to GUI dropdown, wired into TerrainMaterialNode select chain

### Change 25: Tuning — reduce erosion, fix cooling/solidification balance, fix source backup
**Files:** `src/app/controls/controls-factory.ts`, `src/gui/gui-setup.ts`, `src/rendering/webgpu/compute/shaders/lava-cooling.wgsl`
**Why:** User feedback: "thermal erosion is pretty aggressive", "the source is eventually backing up", "stuff is flowing uphill after removing a source", "source never seems to fully go away/cool". Root causes:
1. Thermal erosion at 180 steps/sec with maxErosionPerStep=0.002 → 0.36 height/sec removal → carved deep channels
2. Solidification rate (0.5 multiplier) converted stalled lava to terrain too fast → rock deposits blocked drainage at source
3. Cooling rates (0.00008/step total) too slow → ~55 seconds to reach solidification → lava stayed bright hot indefinitely
4. "Flowing uphill" = thermal erosion carved depressions, lava pooled in carved channels

**Changes:**
- **Thermal erosion defaults reduced ~6x:**
  - `lavaThermalErosionRate`: 0.3 → 0.05
  - `lavaMaxErosionPerStep`: 0.002 → 0.0003 (max erosion/sec now 0.054 vs 0.36)
  - `lavaErosionSpeedClamp`: 5.0 → 3.0
- **Cooling rates increased ~3x** (lava now cools to solidification in ~18 sec, not 55):
  - `lavaCoolingRate`: 0.00005 → 0.00015
  - `lavaProportionalCooling`: 0.00005 → 0.0001
  - `lavaAmbientCoolingRate`: 0.00003 → 0.0001
- **Solidification rate reduced 5x** in lava-cooling.wgsl:
  - `solidRate` multiplier: 0.5 → 0.1 (prevents rapid terrain buildup that blocks drainage)
- **GUI slider range fix:** Thermal Erosion range (0.1, 2.0) → (0.01, 1.0) to accommodate new default 0.05
- **Test preset updated** with all new values

**Net effect:** Lava cools faster (visible cooling in ~15-20 sec) but solidifies to terrain much slower. Erosion is gentle rather than channel-carving. Source area drains properly without rock deposit buildup.

### Change 26: Hot lava overtopping + mounding artifact fix
**Files:** `src/rendering/webgpu/compute/shaders/lava-flux.wgsl`, `src/rendering/webgpu/compute/shaders/lava-cooling.wgsl`
**Why:** User feedback: "still mounding a bit if the cooling rate slider is touched at all", "lava is not overtopping cooler lava". Two root causes:
1. Crust barrier in flux shader blocked ALL flow into crusted cells — even hot lava couldn't push past cooled margins
2. Thin-film cleanup (lavaHeight < 0.001) was adding remnants to terrain height, creating visible square bumps on solidified surfaces over thousands of steps

**Changes:**
- **Thermal override for crust barrier** (`lava-flux.wgsl`):
  - Added `thermalOverride = clamp(T * 2.0 - 0.5, 0, 1)` — scales from 0 at T<0.25 to 1 at T>0.75
  - `effectiveCrustStr = crustStrength * (1 - thermalOverride)` — hot lava ignores neighbor crust
  - Hot lava (T > 0.75): zero crust barrier, flows freely over/into crusted cells
  - Cool lava (T < 0.25): full crust barrier, respects levees
  - This preserves levee formation for cooled margins while allowing fresh hot lava to overtop
- **Removed thin-film terrain addition** (`lava-cooling.wgsl`):
  - Cleanup section no longer adds `lavaHeight < 0.001` remnants to terrain
  - These micro-deposits accumulated into visible mounding artifacts (square bumps on solidified surface)
  - Thin films are simply discarded — only the proper solidification path (T < threshold) adds terrain

**Physics basis:** Real lava at eruption temperature (~1200°C) has enough thermal energy to melt through thin crust barriers. Only cooled, viscous lava is redirected by levees (Tomita 2024 §3). Thin residual films evaporate/degas rather than forming solid deposits.

### Change 27: Shift color ramp warmer — orange/yellow appear earlier
**File:** `src/rendering/webgpu/materials/LavaMaterialNode.ts`
**Why:** User feedback: "it should be a little more orange at higher temps, it's taking a long time to get to that really recognizable yellow/orange goodness." Reference: Fagradalsfjall eruption footage — active channels are vivid orange-yellow, not red.
**Changes:**
- Shifted all smoothstep thresholds down so warmer colors appear at lower temperatures:
  - black → dark red: `(0.30, 0.40)` → `(0.25, 0.35)`
  - dark red → red: `(0.40, 0.50)` → `(0.35, 0.45)`
  - red → orange: `(0.55, 0.75)` → `(0.45, 0.60)` (biggest shift — orange now dominant at T=0.6+)
  - orange → yellow: `(0.80, 0.95)` → `(0.65, 0.85)` (yellow visible at T=0.75+, not just T=0.9+)
- Base colors unchanged — still the same 5-stage ramp (black, dark red, red, orange, yellow)
**Visual effect:** Lava at T=0.6 is now orange (was red). Lava at T=0.8 is now yellow-orange (was just entering orange). Source lava at T=1.0 is bright yellow-white. More time spent in the visually appealing orange-yellow range before cooling to red/black.

### Change 28: Live color ramp controls + GUI cleanup
**Files:** `src/rendering/webgpu/materials/LavaMaterialNode.ts`, `src/app/controls/controls-factory.ts`, `src/gui/gui-setup.ts`, `src/main.ts`
**Why:** Color ramp shift (Change 27) didn't have the desired effect — user wanted interactive control. Also, the flat list of 20+ lava parameters was hard to navigate.
**Changes:**
- **Live color ramp uniforms** (`LavaMaterialNode.ts`):
  - Added `orangeTempUniform` and `yellowTempUniform` as TSL uniforms
  - Smoothstep thresholds now derived from these uniforms: t1/t2 offset from orangeTemp, t3 from orangeTemp, t4 from yellowTemp
  - `updateUniforms()` extended to accept `orangeTemp` and `yellowTemp`
  - Changes are instant — no graph rebuild needed
- **New controls**: `lavaOrangeTemp` (default 0.45, range 0.2-0.7), `lavaYellowTemp` (default 0.65, range 0.4-0.9)
- **Per-frame update** (`main.ts`): passes `orangeTemp` and `yellowTemp` from controls to lava material each frame
- **GUI reorganized into subfolders**:
  - **Flow**: Viscosity, Yield Stress, Visc-Temp Curve, Source Temp
  - **Cooling**: Surface Cooling, Thin-Edge Cooling, Ambient Cooling, Solidify Temp, Rock Fraction, Conductivity
  - **Crust**: Barrier Strength, Growth Rate, Re-melt Temp, Insulation
  - **Erosion**: Erosion Rate, Max Per Step, Speed Clamp, Rock Melt Temp
  - **Color Ramp**: Orange Starts, Yellow Starts
  - **Water**: Enabled, Heat Radius, Heat Scale
  - **Reset Defaults** button (renamed from "Apply Test Preset")
- Test preset updated with `lavaOrangeTemp: 0.45`, `lavaYellowTemp: 0.65`

### Files modified across sessions 2+3:
- `src/rendering/webgpu/compute/shaders/lava-flux.wgsl` — viscDamp on accel only + yield stress + crust barrier
- `src/rendering/webgpu/compute/shaders/lava-cooling.wgsl` — lateral exposure, flow heat retention, velocity-gated solidification
- `src/rendering/webgpu/compute/shaders/lava-thermal-transfer.wgsl` — substrate conduction + enhanced re-mobilization
- `src/rendering/webgpu/compute/shaders/lava-water-interaction.wgsl` — reduced quench, flash evaporation, stronger blocking
- `src/rendering/webgpu/compute/ComputeNodePipeline.ts` — cooling pass velocity binding, thermal transfer terrain binding
- `src/simulation/SimulatePerStepWebGPU.ts` — all 7 lava passes active
- `src/app/controls/controls-factory.ts` — paper-grounded defaults (cooling 10x slower, water interaction enabled)
- `src/rendering/webgpu/materials/LavaMaterialNode.ts` — 5-stage color ramp, crust cracks, flow detail, emissive
- `src/rendering/webgpu/materials/TerrainMaterialNode.ts` — thermal erosion rate debug view (mode 19)
- `src/rendering/webgpu/shader-nodes/terrain/TerrainDebugViewNode.ts` — ThermalErosionRate enum
- `src/gui/gui-setup.ts` — updated slider ranges, test preset, debug dropdown

---

## Change 29: Temperature controls → human-readable °C

**Problem**: All temperature-related lava controls used internal 0-1 normalized values. Users couldn't tell what "Solidification Threshold: 0.20" means in real terms. The color ramp controls (`lavaOrangeTemp`, `lavaYellowTemp`) had almost no visible effect because the GUI range (0.2-0.7) mapped to tiny shader-space differences.

**Solution**: Convert all temperature controls to display in °C (Celsius), using the mapping `T_normalized = T_celsius / 1200` (basaltic lava max ~1200°C). The `/1200` conversion happens at the boundary where controls are consumed — in `SimulatePerStepWebGPU.ts` (5 locations) and `main.ts` (2 locations for color ramp uniforms). Shaders continue to operate in 0-1 normalized space internally.

**Changes**:
- `controls-factory.ts`: Defaults now in °C:
  - `lavaSolidificationThreshold`: 0.20 → 240°C
  - `lavaEmissionTemp`: 1.0 → 1200°C
  - `lavaRockMeltThreshold`: 0.7 → 840°C
  - `lavaSofteningTemp`: 0.6 → 720°C
  - `lavaOrangeTemp`: 0.45 → 540°C
  - `lavaYellowTemp`: 0.65 → 780°C
- `gui-setup.ts`: All temperature sliders now show °C with step(10):
  - Source °C (600-1200), Solidify °C (60-600), Re-melt °C (360-1080)
  - Rock Melt °C (360-1080), Orange °C (240-840), Yellow °C (480-1080)
  - Reset Defaults button updated to °C values
- `SimulatePerStepWebGPU.ts`: Added `/1200` conversion at 5 consumption points:
  - `emissionTemp`, `softeningTemp`, `rockMeltThreshold`, `solidificationThreshold` (×2)
- `main.ts`: Added `/1200` conversion for `orangeTemp` and `yellowTemp` passed to lava material, updated fallback values from 0-1 to °C

**Effect**: Temperature sliders now show meaningful physical values. Moving "Orange °C" from 540 to 400 visibly shifts the color ramp. The color ramp controls now have full dynamic range instead of being nearly inert.

---

## Change 30: Fix emissive blowout + add Emissive Glow slider

**Problem**: Lava rendered as near-white because the emissive term (1.5× base color) plus Lambertian lighting pushed values far above 1.0. At T=1.0: colYellow(1.0,0.85,0.35) × lamb + colYellow × 1.5 ≈ (2.0, 1.7, 0.7) — display clips to (1.0, 1.0, 0.7) = washed-out white. No amount of color ramp adjustment could fix it. An initial attempt at Reinhard tone mapping (color/(1+color)) compressed mid-tones too aggressively, making lava the same color as terrain.

**Solution**:
1. Reduced emissive multiplier from 1.5 → 0.35 (now uniform-driven)
2. Reduced colYellow brightness: (1.0, 0.85, 0.35) → (1.0, 0.75, 0.3) — less G/B headroom consumed, so emissive doesn't clip
3. Reduced crack emissive multiplier: 1.5 → 1.2
4. Reduced speed heat glow: 0.3/0.15 → 0.15/0.06
5. Removed Reinhard tone mapping (too aggressive for this use case)
6. Added `lavaEmissiveStrength` as a live GUI slider (0.0–1.5, default 0.35)

**Math at T=1.0 with new values** (lamb=0.7):
- emissive = (1.0, 0.75, 0.3) × 0.35 = (0.35, 0.26, 0.105)
- lit = (0.7, 0.525, 0.21) + (0.35, 0.26, 0.105) = (1.05, 0.785, 0.315)
- Only R clips slightly → warm yellow-orange, not white

**Files**: `LavaMaterialNode.ts`, `controls-factory.ts`, `gui-setup.ts`, `main.ts`
**New control**: Emissive Glow slider in Lava > Color Ramp (0.0–1.5, step 0.05)

---

## Change 31: Animated turbulence + wider color ramp transitions

**Problem**: Lava surface was static and flat — no convection turbulence. Color ramp had narrow smoothstep bands (0.10-0.15 wide) creating visible discrete banding between orange and yellow instead of smooth gradients. Real lava has constantly moving hot/cool patches from convective overturning, and colors blend smoothly across broad temperature ranges.

**Solution**:
1. **Animated multi-octave turbulence** — 3 noise layers scrolling at different speeds/directions:
   - Fine detail (scale 40, speed 0.03) — small convection cells
   - Medium (scale 18, speed 0.02) — larger convection patterns
   - Coarse (scale 8, speed 0.008) — slow large-scale drift
   - Combined noise perturbs temperature before color ramp lookup (±0.15 range)
   - Perturbation scales with temperature: hot lava = active turbulence, cool = static
2. **Wide overlapping smoothstep bands** (0.20-0.30 wide) replace narrow ones:
   - t1: 0.10→0.30 (black→dark red)
   - t2: 0.20→orangeT (dark red→red)
   - t3: orangeT-0.10→orangeT+0.20 (red→orange)
   - t4: orangeT+0.05→yellowT+0.15 (orange→yellow)
   - Bands overlap significantly so colors blend naturally
3. **Time uniform** added to LavaMaterialNode, passed from main.ts each frame
4. **Animated cracks** — crack noise now scrolls slowly to simulate thermal fracturing
5. **Flow detail** — stronger modulation (0.06-0.15 range vs old 0.02-0.08), time-animated

**Files**: `LavaMaterialNode.ts`, `main.ts`
**New uniform**: `time` (integer frame counter, passed each tick)

---

## Session 4 — Flow model replacement + Voronoi rendering

### Change 32: Voronoi cellular noise (replacing hash noise)
**File:** `src/rendering/webgpu/materials/LavaMaterialNode.ts`
**Why:** The hash-based turbulence from Change 31 produced per-pixel grain (static/noise) because `fract(sin(dot(uv*scale, ...)))` was evaluated at per-pixel UV coordinates. Sin-wave patterns (attempted as a fix) created periodic contour/Fresnel-lens artifacts. Neither approach produced the desired cellular crust plate look of real lava.
**Changes:**
- Replaced all hash-based and sin-wave noise with **grid-based Voronoi cellular noise**
- 9-cell neighborhood search (JS loop unrolls to TSL shader nodes at build time)
- Hash is per-CELL (integer grid coords), not per-pixel — produces smooth distance fields, no grain
- d1/d2 tracking: d1 = distance to nearest cell point, d2 = second nearest
- Edge detection: `d2 - d1` ≈ 0 at cell boundaries (seams), large in plate interiors
- Animated drift: cell points orbit slowly, speed scales with temperature (`animSpeed = smoothstep(0.15, 0.5, T)`)
- Hot lava: active drifting convection cells. Cool lava: frozen/static crust plates
- gridScale=50 for ~50 cells across the simulation grid
- Added TSL imports: `floor`, `fract`

### Change 33: Instantaneous viscous flow — replacing momentum-based pipe model
**File:** `src/rendering/webgpu/compute/shaders/lava-flux.wgsl`
**File:** `src/rendering/webgpu/compute/shaders/lava-height-vel.wgsl`
**Why:** The pipe model (`flux_new = flux_old + acceleration`) is the Saint-Venant shallow water equations — designed for inviscid flow with inertia/momentum. This is fundamentally wrong for lava, which is viscosity-dominated with negligible inertia. Every fix attempted created new problems:
- No damping → momentum oscillates → standing waves, ripples, spires
- Add flux damping → exponential decay kills all flow at 180 steps/sec
- Gate solidifying cells → leading edge freezes → nothing flows past it
- Temperature-gated damping → still compounds to kill flow at margins

The root cause of spires: when lava solidifies (`terrain += X, lava -= X`), surface height stays constant, so head pressure doesn't change, and accumulated flux from neighbors keeps feeding the solidifying cell.

**Solution:** Replace accumulated flux with **instantaneous height-gradient flow**:
```
// OLD (momentum): flux = old_flux + accel * viscDamp
// NEW (viscous):  flux = heightDiff * flowCoeff * viscDamp
```
No flux memory between steps. Each step computes flow purely from current height differences and current viscosity. This matches how actual lava simulation codes work (SCIARA, MAGFLOW — cellular automata with instantaneous redistribution).

**Changes to lava-flux.wgsl:**
- Removed: reading previous flux texture (`readLavaFlux` binding kept for pipeline compatibility but unused)
- Removed: all accumulated flux damping, cold-block, inflow gating
- Added: `flowCoeff = g * pipeArea / pipeLen` — instantaneous flow rate proportional to height gradient
- Kept: yield stress (Bingham plastic), crust barrier with thermal override, conservation factor, boundary conditions
- The `readLavaFlux` binding is still declared (bind group layout unchanged) but the values are not read

**Changes to lava-height-vel.wgsl:**
- Reverted inflow gate (`solidGate`) that was rejecting incoming flux for cold cells
- Back to simple `fin = topFlux.b + rightFlux.a + bottomFlux.r + leftFlux.g`

**Expected behavior:**
- No standing waves or ripples (no momentum to oscillate)
- No spires (no accumulated flux to feed solidifying cells)
- Lava spreads as viscous creep proportional to slope
- Hot lava flows steadily downhill, cool lava slows to a stop
- Yield stress + crust barrier still create levees and channelization

**Physics basis:** Lava flow is Reynolds number << 1 (Stokes flow regime). Inertial terms are negligible compared to viscous dissipation. The pipe model's momentum accumulation has no physical basis for lava.

### Change 34: Simplified Voronoi rendering — direct plate darkening
**File:** `src/rendering/webgpu/materials/LavaMaterialNode.ts`
**Why:** The temperature-shift approach (Change 32's initial implementation) was too convoluted: shift temperature BEFORE color ramp lookup to create contrast. This produced wireframe-like thin bright lines on uniformly pale backgrounds because the shift wasn't large enough to push plate centers into visually distinct color bands. The edgeFactor smoothstep threshold (0.06) was too tight, making seams razor-thin.
**Changes:**
- **Removed**: Voronoi-driven temperature shift (`shiftStrength`, `plateShift`, `surfaceT`)
- **Added**: Direct plate brightness modulation after color ramp:
  - Color ramp computed from actual temperature T (no shifting)
  - `plateBrightness = mix(darkenAmount, 1.0, edgeFactor)` — plate interiors darkened, edges full brightness
  - `darkenAmount` scales with cooling: hot lava plates at 35% brightness, cool lava plates at 15%
  - Creates clear contrast: dark plates with bright glowing seams at ANY temperature
- **Wider seams**: edgeFactor smoothstep threshold 0.06 → 0.12 (visible bands, not thin wireframe)
- **Simplified emissive**: removed `hotGlow` term (was adding glow to plate interiors, reducing contrast). Only edge glow remains.
- **Removed**: crust crack rendering, flow-aligned detail (will be re-implemented with speed-dependent approach)

### Change 35: Parameter adjustments
**File:** `src/app/controls/controls-factory.ts`
**Changes:**
- `lavaViscosityScale`: reverted from 8.0 to 5.0 (had been changed back and forth; 5.0 gives viscDamp≈0.25 at T=1.0 which is ~4x slower than water)

### Change 36: Speed-dependent surface rendering
**File:** `src/rendering/webgpu/materials/LavaMaterialNode.ts`
**Why:** Voronoi cellular pattern was applied uniformly to all lava regardless of flow state. Real lava has completely different surface appearance based on whether it's flowing or stalled:
- **Flowing channels**: smooth bright surface with elongated ropy bands/streaks aligned with flow direction
- **Stalled/cooling pools**: dark crust plates with glowing seams (Voronoi pattern)
- **Lobes/toes at front**: black crust shells that rupture to show bright interior

**Changes:**
- **Flow-aligned streaks** for flowing lava:
  - Sample velocity map (vel.xy direction, vel.z speed) early in the shader
  - Compute perpendicular-to-flow axis for cross-flow banding
  - Two-scale sin bands (120x and 55x) create irregular ropy texture
  - Wavy distortion along flow axis (sin at 60x scale, time-animated) for fold patterns
  - Subtle darkening: 0.80-1.0 range (flowing channels are brighter overall)
- **Speed-based blend**: `flowBlend = smoothstep(0.05, 0.3, speed)`
  - speed≈0: pure Voronoi plates (darken 0.15-0.35 range)
  - speed>0.3: pure flow streaks (darken 0.80-1.0 range)
  - Smooth transition in between
- **Emissive glow fades with flow**: Voronoi edge glow multiplied by `(1-flowBlend)` — seams only glow on stalled lava
- **Speed heat glow**: flowing lava gets subtle brightness boost from shear heating
- Velocity map sampling moved from end-of-shader additive to main pattern computation

**Visual effect:**
- Central hot channel: bright, smooth, with subtle longitudinal streaks
- Margins/stalled areas: dark plates with orange/red seam glow
- Transition zone: gradual blend from streaks to plates as flow slows

---

## Session 5 — Fixing terrain mounding, cooling timescale, and flow model

### Change 37: Remove timestep from cooling/water-interaction + increase cooling rates (match water pattern)
**Files:** `lava-cooling.wgsl`, `lava-water-interaction.wgsl`, `controls-factory.ts`, `gui-setup.ts`
**Why:** Water erosion uses raw per-step rates (Ks=0.02, Kd=0.006) NOT multiplied by timestep. Lava cooling WAS multiplied by timestep, making it inconsistent. At timestep=0.05, effective cooling was 0.00015 × 0.05 = 0.0000075/step — taking ~12 minutes to cool. Should be on the same timescale as water (a few seconds).
**Changes:**
- **lava-cooling.wgsl**: Removed `uniforms.u_timestep *` from 6 locations:
  - Ambient cooling (line 81)
  - Surface area cooling (line 87)
  - Crust growth (line 103)
  - Crust melt (line 108)
  - Crust shear (line 112)
  - Solidification rate (line 125)
- **lava-water-interaction.wgsl**: Removed `uniforms.u_Timestep *` from 5 locations:
  - Water displacement (line 49)
  - Quench cooling (line 63)
  - Quench crust formation (line 67)
  - Flash evaporation (line 72)
  - Heat radius evaporation (line 110)
- **controls-factory.ts**: Increased defaults to raw per-step values:
  - `lavaCoolingRate`: 0.00015 → 0.002
  - `lavaProportionalCooling`: 0.0001 → 0.001
  - `lavaAmbientCoolingRate`: 0.0001 → 0.001
  - `lavaCrustGrowthRate`: 0.02 → 0.005
- **gui-setup.ts**: Updated slider ranges and test preset to match new scale

### Change 38: Reduce solidification rate + add per-step cap
**Files:** `lava-cooling.wgsl`, `lava-water-interaction.wgsl`
**Why:** Solidification converts lavaHeight → terrainHeight every step. With continuous source injection, this creates a perpetual loop: source adds lava → lava cools → solidifies into terrain → source adds more → terrain keeps growing (visible as weird tall shapes/spires). The mechanic is correct (edges cool → form rock levees), it's just too fast.
**Changes:**
- **lava-cooling.wgsl**: Solidification rate reduced 10x (0.1 → 0.01) + hard cap of 0.0001/step (max terrain growth 0.018/sec at 180 steps/sec)
- **lava-water-interaction.wgsl**: Quench solidification rate reduced 10x (0.03 → 0.003) + same 0.0001/step cap

### Change 39: Replace momentum-based pipe model with pure viscous flow
**File:** `lava-flux.wgsl`
**Why:** The water flux model (`flux_new = old_flux + accel`) is a momentum-based pipe model (Saint-Venant shallow water equations). This is physically incompatible with lava. Water uses inertial flow where flux accumulates over time. Lava is a viscous creeping flow (Re << 1) — velocity should be proportional to driving force / viscosity, with NO momentum carry-over. The previous approach (`viscDamp` on acceleration only) just slowed how fast lava reached water speed. Over many steps, lava eventually flowed just as fast as water because old flux was preserved at 100%.
**Changes:**
- Removed reading of previous flux values (`curFlux.r/g/b/a` no longer used in flux computation)
- Flux computed fresh each step: `flux = flowCoeff * heightDiff * viscFactor`
- `viscFactor = 1/(1 + viscosity * ViscosityScale)` — same formula, now applied to total flux not just acceleration
- `readLavaFlux` binding kept for pipeline compatibility but previous values ignored
- Yield stress, crust barrier, conservation factor, boundary conditions all unchanged
**Expected behavior:**
- No standing waves or ripples (no momentum to oscillate)
- No spires from accumulated flux feeding solidifying cells
- Hot lava (T=1.0): viscFactor ≈ 0.25 → flows at ~1/4 water speed
- Cool lava (T=0.5): viscFactor ≈ 0.11 → ~1/9 water speed
- Cold lava (T=0.0): viscFactor ≈ 0.04 → nearly stopped
