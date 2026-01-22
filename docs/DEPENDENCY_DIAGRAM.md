# Simulation Dependency Diagram

This document provides visual representations of the simulation pass dependencies and data flow.

## Pass Execution Flow

```
┌─────────────┐
│    Rain     │ → terrain
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    Flow     │ → flux
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│  WaterHeight     │ → terrain, velocity
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│    Sediment      │ → terrain, sediment, terrain_nor, velocity
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│   Advection      │ → sediment, velocity, sediment_blend
│  (conditional)   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  MaxSlippage     │ → maxslippage
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  ThermalFlux     │ → terrain_flux
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  ThermalApply    │ → terrain
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Evaporation     │ → terrain
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│   LavaFlow       │ → lava_flux
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│   LavaUpdate     │ → lava
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  LavaTerrain     │ → terrain, lava
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│    Average       │ → terrain, terrain_nor
└──────────────────┘
```

## Texture Dependency Graph

### Terrain Texture Flow
```
Rain → terrain
  ↓
WaterHeight → terrain
  ↓
Sediment → terrain
  ↓
ThermalApply → terrain
  ↓
Evaporation → terrain
  ↓
LavaTerrain → terrain
  ↓
Average → terrain
```

### Velocity Texture Flow
```
WaterHeight → velocity
  ↓
Sediment → velocity
  ↓
Advection → velocity
```

### Sediment Texture Flow
```
Sediment → sediment
  ↓
Advection → sediment
  ↓
Average (reads sediment)
```

### Lava Texture Flow
```
LavaFlow → lava_flux
  ↓
LavaUpdate → lava
  ↓
LavaTerrain → lava
```

## Ping-Pong Texture Relationships

```
Terrain:     read_terrain_tex  ←→  write_terrain_tex
Flux:        read_flux_tex     ←→  write_flux_tex
Velocity:    read_vel_tex      ←→  write_vel_tex
Sediment:    read_sediment_tex ←→  write_sediment_tex
SedBlend:    read_sediment_blend ←→ write_sediment_blend
MaxSlippage: read_maxslippage_tex ←→ write_maxslippage_tex
TerrainFlux: read_terrain_flux_tex ←→ write_terrain_flux_tex
Lava:        read_lava_tex     ←→  write_lava_tex
LavaFlux:    read_lava_flux_tex ←→ write_lava_flux_tex
```

## MRT Output Dependencies

### 4-Output MRT: Sediment Pass
```
Inputs:  terrain, velocity, sediment, lava
Outputs: [terrain, sediment, terrain_nor, velocity]
         └─┬─────┘  └─┬─────┘  └───┬────┘  └───┬────┘
           │          │            │           │
           ▼          ▼            ▼           ▼
      (ping-pong) (ping-pong)  (direct)  (ping-pong)
```

### 3-Output MRT: Advection Passes
```
MacCormack Subpass 1:
Inputs:  velocity, sediment, sediment_blend, terrain
Outputs: [sediment_advect_a, velocity, sediment_blend]
         └──────┬──────────┘  └───┬────┘  └──────┬──────┘
                │                 │             │
                ▼                 ▼             ▼
            (intermediate)   (ping-pong)   (ping-pong)

MacCormack Subpass 2:
Inputs:  velocity, sediment_advect_a, sediment_blend, terrain
Outputs: [sediment_advect_b, velocity, sediment_blend]
         └──────┬──────────┘  └───┬────┘  └──────┬──────┘
                │                 │             │
                ▼                 ▼             ▼
            (intermediate)   (ping-pong)   (ping-pong)

Simple Advection:
Inputs:  velocity, sediment, sediment_blend, terrain
Outputs: [sediment, velocity, sediment_blend]
         └───┬────┘  └───┬────┘  └──────┬──────┘
             │          │              │
             ▼          ▼              ▼
        (ping-pong) (ping-pong)   (ping-pong)
```

### 2-Output MRT: WaterHeight, LavaTerrain, Average
```
WaterHeight:
Inputs:  terrain, flux, sediment, velocity
Outputs: [terrain, velocity]
         └───┬────┘  └───┬────┘
             │          │
             ▼          ▼
        (ping-pong) (ping-pong)

LavaTerrain:
Inputs:  terrain, lava, lava_flux
Outputs: [terrain, lava]
         └───┬────┘  └───┬────┘
             │          │
             ▼          ▼
        (ping-pong) (ping-pong)

Average:
Inputs:  terrain, sediment
Outputs: [terrain, terrain_nor]
         └───┬────┘  └──────┬──────┘
             │             │
             ▼             ▼
        (ping-pong)    (direct)
```

## Cross-Pass Dependencies

### Thermal Erosion Chain
```
Terrain → MaxSlippage → terrain_flux → ThermalApply → terrain
```

### Lava Simulation Chain
```
Terrain + Lava → LavaFlow → lava_flux
  ↓
LavaUpdate → lava
  ↓
LavaTerrain → terrain + lava
```

### Sediment Advection Chain (MacCormack)
```
Sediment + Velocity → AdvectA → sediment_advect_a
  ↓
AdvectB → sediment_advect_b
  ↓
MacCormack → sediment
```

## Critical Readback Points

### For Raycasting/Geometry Updates
- **Primary**: `read_terrain_tex` (contains terrain + sediment)
- **Secondary**: `read_lava_tex` (contains lava volume)
- **Combined**: `terrain_height + sediment + lava_volume` (computed in CPU or vertex shader)

### For Rendering
- **Terrain**: `read_terrain_tex` + `read_sediment_tex` + `read_lava_tex`
- **Water**: `read_terrain_tex` (G channel for water volume)
- **Lava**: `read_lava_tex` (volume + temperature)
- **Normals**: `terrain_nor`

