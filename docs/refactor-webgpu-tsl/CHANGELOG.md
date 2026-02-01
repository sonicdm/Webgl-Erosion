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

### Files modified this session:
- `src/rendering/webgpu/compute/shaders/lava-flux.wgsl` — rewritten (stripped to water pattern + viscDamp on accel only + temperature-dependent yield stress)
- `src/rendering/webgpu/compute/shaders/lava-cooling.wgsl` — velocity-gated solidification, strong flow heat retention, reduced cooling rates
- `src/rendering/webgpu/compute/ComputeNodePipeline.ts` — cooling pass now binds lava velocity texture
- `src/simulation/SimulatePerStepWebGPU.ts` — all 7 lava passes active
- `src/app/controls/controls-factory.ts` — tuned defaults (cooling rates quartered, solidification threshold 0.20)
- `src/rendering/webgpu/materials/LavaMaterialNode.ts` — full lava rendering (5-stage color ramp, emissive, crust, Lambertian lighting)
