#version 300 es
precision highp float;

uniform sampler2D readTerrain; // terrain: R: height, G: water, B: rock, A: base rock
uniform sampler2D readLava; // lava: R: volume, G: temperature, B: unused, A: unused

uniform float u_SimRes;
uniform float u_timestep;

// Physics constants for thermal erosion and solidification
uniform float u_LavaContactHeatTransfer; // Contact heat transfer coefficient (default: 200.0 W/(m²·K))
uniform float u_LavaMeltThreshold; // Terrain melting temperature (default: 1200.0 °C)
uniform float u_LavaLatentHeatFusion; // Latent heat of fusion (default: 400000.0 J/kg)
uniform float u_LavaSolidificationTemp; // Temperature threshold for solidification (default: 800.0 °C)
uniform float u_LavaDensity; // Density (default: 2700.0 kg/m³)
uniform float u_LavaWaterTemp; // Water temperature (default: 10.0 °C)

layout (location = 0) out vec4 writeTerrain;
layout (location = 1) out vec4 writeLava; // Also write updated lava (solidified part removed)

in vec2 fs_Pos;

void main() {
    vec2 curuv = 0.5f * fs_Pos + 0.5f;
    float div = 1.0f / u_SimRes;

    vec4 curTerrain = texture(readTerrain, curuv);
    vec4 curLava = texture(readLava, curuv);

    // Extract terrain and lava data
    float terrainHeight = curTerrain.x;
    float waterVolume = curTerrain.y;
    float rockMaterial = curTerrain.z;
    float baseRockSurfaceHeight = curTerrain.w;

    float lavaVolume = curLava.x;
    float lavaTemp = curLava.y; // Temperature in Celsius

    float newTerrainHeight = terrainHeight;
    float newRockMaterial = rockMaterial;
    float newLavaVolume = lavaVolume;
    float newLavaTemp = lavaTemp;

    // Only process if lava is present
    if (lavaVolume > 0.001) {
        // ========== MELTING (Carving Channels) ==========
        // Hot lava melts terrain through thermal erosion
        // Heat flux: Q = h_contact * A * (T_lava - T_melt)
        // Melting rate: dm/dt = Q / L_f
        if (lavaTemp > u_LavaMeltThreshold) {
            // Calculate heat flux
            float surfaceArea = sqrt(lavaVolume); // Simplified surface area
            float heatFlux = u_LavaContactHeatTransfer * surfaceArea * (lavaTemp - u_LavaMeltThreshold);
            
            // Calculate melting rate
            float mass = lavaVolume * u_LavaDensity;
            float meltingRate = heatFlux / max(u_LavaLatentHeatFusion, 0.001);
            float massMelted = meltingRate * u_timestep;
            
            // Convert mass to height reduction (simplified: assume density similar to terrain)
            float heightReduction = massMelted / (u_LavaDensity * 1.0); // 1.0 = unit area
            heightReduction = clamp(heightReduction, 0.0, terrainHeight); // Don't go below zero
            
            // Reduce terrain height (carve channel)
            newTerrainHeight = terrainHeight - heightReduction;
            
            // Mark melted area as rock material
            // The melted terrain becomes rock (like obsidian or cooled lava rock)
            float rockFromMelting = min(1.0, heightReduction * 10.0); // Scale based on amount melted
            newRockMaterial = max(rockMaterial, rockFromMelting);
            
            // Also update base rock surface height if this is new rock
            if (rockFromMelting > 0.1) {
                baseRockSurfaceHeight = max(baseRockSurfaceHeight, newTerrainHeight);
            }
        }

        // ========== WATER EVAPORATION ==========
        // Hot lava evaporates water when in contact
        // Physics: Water absorbs heat and vaporizes
        // Latent heat of vaporization: ~2,260,000 J/kg for water
        float waterLatentHeatVaporization = 2260000.0; // J/kg
        float waterSpecificHeat = 4180.0; // J/(kg·K) for water
        float waterDensity = 1000.0; // kg/m³

        // Check for water in current cell first (water on top of lava)
        // Then check neighbors for adjacent water
        // Primary check: water in same cell as lava (water flowing over lava)
        bool waterDirectlyOnLava = waterVolume > 0.0001 && lavaVolume > 0.0001;
        
        // Secondary check: water in neighbors (lava adjacent to water)
        vec4 topTerrain = texture(readTerrain, curuv + vec2(0.0f, div));
        vec4 rightTerrain = texture(readTerrain, curuv + vec2(div, 0.0f));
        vec4 bottomTerrain = texture(readTerrain, curuv + vec2(0.0f, -div));
        vec4 leftTerrain = texture(readTerrain, curuv + vec2(-div, 0.0f));
        
        float neighborWater = max(
            max(topTerrain.y, rightTerrain.y),
            max(bottomTerrain.y, leftTerrain.y)
        );
        
        // Use direct water volume if present, otherwise use effective (neighbor) volume
        float effectiveWaterVolume = waterDirectlyOnLava ? waterVolume : max(waterVolume, neighborWater * 0.5);
        
        // When lava is adjacent to water (neighbor water > current water), boost evaporation
        bool hasAdjacentWater = neighborWater > waterVolume * 1.5; // Significant water in neighbors

        // Make evaporation more aggressive for hot lava
        float evaporationMultiplier = 1.0;
        if (lavaTemp > 1100.0) {
            evaporationMultiplier = 3.0; // 3x faster for very hot lava
        } else if (lavaTemp > 1000.0) {
            evaporationMultiplier = 2.0; // 2x faster for hot lava
        }

        // Lower temperature threshold - water should evaporate even at lower temps
        // Real water boils at 100°C, but hot lava (800°C+) should cause rapid evaporation
        float evaporationTempThreshold = max(100.0, u_LavaWaterTemp); // At least 100°C
        
        // Make evaporation work when water is directly on top of lava
        if ((lavaVolume > 0.0001 && effectiveWaterVolume > 0.0001 && lavaTemp > evaporationTempThreshold) || 
            (waterDirectlyOnLava && lavaTemp > 100.0)) { // Evaporate even at lower temp if directly on top
            
            // When water is directly on top of lava, use the actual water volume (not effective)
            float actualWaterVolume = waterDirectlyOnLava ? waterVolume : effectiveWaterVolume;
            
            // Calculate heat flux from lava to water
            // Use improved surface area calculation (same as cooling)
            float baseSurfaceArea = sqrt(max(lavaVolume, 0.0001f));
            float thinFlowMultiplier = lavaVolume < 0.1 ? (0.1 / max(lavaVolume, 0.001f)) : 1.0;
            thinFlowMultiplier = clamp(thinFlowMultiplier, 1.0, 5.0);
            float surfaceArea = baseSurfaceArea * thinFlowMultiplier;
            
            // Increase surface area for evaporation when water is on top
            // Water on top means full contact surface
            float evaporationSurfaceArea = waterDirectlyOnLava ? max(lavaVolume, 0.1) : surfaceArea;
            
            // Calculate heat flux - use higher heat transfer for direct contact
            float contactHeatTransfer = waterDirectlyOnLava ? u_LavaContactHeatTransfer * 8.0 : u_LavaContactHeatTransfer;
            float heatFlux = contactHeatTransfer * evaporationSurfaceArea * (lavaTemp - u_LavaWaterTemp);
            float heatTransferred = heatFlux * u_timestep; // Total heat transferred this timestep
            
            // Use actual water volume for mass calculation
            float waterMass = actualWaterVolume * waterDensity;
            
            // Energy to heat water from 10°C to 100°C (boiling point)
            float energyToHeat = waterMass * waterSpecificHeat * (100.0 - u_LavaWaterTemp);
            
            // Remaining energy goes to vaporization
            float energyForVaporization = max(0.0, heatTransferred - energyToHeat);
            
            // Calculate mass of water vaporized
            float massVaporized = energyForVaporization / max(waterLatentHeatVaporization, 1.0);
            
            // Convert mass to volume and reduce water
            float volumeVaporized = massVaporized / waterDensity;
            
            // Boost evaporation when water is in adjacent cells
            float adjacentWaterBoost = 1.0;
            if (hasAdjacentWater) {
                // When lava is adjacent to water, evaporation should be very aggressive
                // Even though we can't directly reduce neighbor water, we can make
                // the current cell's water (if any) evaporate faster, and the neighbor
                // cells will handle their own evaporation when lava flows into them
                adjacentWaterBoost = 3.0; // 3x boost for adjacent water
            }
            
            // Make evaporation more aggressive for water directly on top, but not insanely so
            float topWaterBoost = waterDirectlyOnLava ? 3.0 : 1.0; // 3x boost for water on top (was 20x - too aggressive)
            volumeVaporized *= 2.0 * evaporationMultiplier * adjacentWaterBoost * topWaterBoost; // Reduced from 15.0 to 2.0
            
            // Reduce water from current cell
            // Note: Neighbor water will be reduced when lava flows into those cells
            waterVolume = max(0.0, waterVolume - volumeVaporized);
        }

        // ========== SOLIDIFICATION (Filling Channels) ==========
        // Cooled lava solidifies into rock and fills channels
        // Only solidify if temperature is significantly below solidification temp to prevent sudden spikes
        // Use a threshold to prevent all lava from solidifying when temp is raised
        // More stable solidification with larger buffer and adaptive rate
        // Increase threshold buffer to prevent sudden changes when slider moves
        float solidificationThreshold = u_LavaSolidificationTemp - 10.0; // Start solidifying slightly below target
        // Only solidify when the remaining lava layer is thin enough; this prevents
        // thick flowing lava from freezing in place before it has a chance to move.
        float solidificationVolumeThreshold = 0.05; // thin sheet/edge
        if (lavaTemp < solidificationThreshold &&
            newLavaVolume > 0.001 &&
            newLavaVolume < solidificationVolumeThreshold) {
            // Make solidification rate more gradual and adaptive
            // Cooler lava solidifies faster, but cap the rate to prevent spikes
            float tempBelowSolidification = solidificationThreshold - lavaTemp;
            float maxTempDiff = solidificationThreshold - 600.0; // Allow wider range (600-800°C)
            float tempFactor = clamp(tempBelowSolidification / max(maxTempDiff, 1.0), 0.0, 1.0);
            
            // Base rate - keep it gradual
            float baseSolidificationRate = 0.08; // Gradual solidification rate
            // Scale by temperature difference, but cap the multiplier
            float rateMultiplier = 1.0 + tempFactor * 1.2;
            float solidificationRate = baseSolidificationRate * rateMultiplier;
            
            // Cap solidification rate to prevent sudden spikes
            solidificationRate = min(solidificationRate, 0.25);
            float poolFactor = 1.0 + sqrt(newLavaVolume) * 0.08;
            float waterSolidifyBoost = waterDirectlyOnLava ? 5.0 : (hasAdjacentWater ? 2.0 : 1.0);
            solidificationRate *= poolFactor * waterSolidifyBoost;
            
            float solidifiedVolume = min(newLavaVolume, solidificationRate * u_timestep);

            // Convert solidified lava to rock material
            if (solidifiedVolume > 0.0f) {
                // Solidification happens from the TOP of the lava pool downward
                // Before: terrain at terrainHeight, lava volume = newLavaVolume, surface at terrainHeight + newLavaVolume
                // After: remaining lava = newLavaVolume - solidifiedVolume, surface at terrainHeight + (newLavaVolume - solidifiedVolume)
                // New terrain should be raised to where the remaining liquid lava surface is
                // This means terrain rises by solidifiedVolume (the top layer that solidified)
                float lavaSurfaceBefore = newTerrainHeight + newLavaVolume; // Top of lava pool before solidification
                float remainingLavaVolume = newLavaVolume - solidifiedVolume;
                float lavaSurfaceAfter = newTerrainHeight + remainingLavaVolume; // Top of remaining liquid lava
                
                // Terrain should rise to match the new lava surface level
                // Solidified volume raises terrain by that amount (from top down)
                // Use a blend factor to prevent sudden spikes
                float heightBlendFactor = 1.0; // Fill to full lava depth
                float targetHeight = newTerrainHeight + solidifiedVolume * heightBlendFactor;
                newTerrainHeight = max(newTerrainHeight, targetHeight);
                baseRockSurfaceHeight = max(baseRockSurfaceHeight, newTerrainHeight);
                
                // Mark as rock material
                // Rock material is stored in B channel (0.0 to 1.0)
                float solidifiedRock = min(1.0, solidifiedVolume * 1.0);
                newRockMaterial = max(rockMaterial, solidifiedRock);
                
                // Ensure rock material reaches meaningful level (at least 0.5 if significant volume)
                if (solidifiedVolume > 0.01) {
                    newRockMaterial = max(newRockMaterial, 0.5); // Ensure visible rock
                }

                // Remove solidified volume from liquid lava
                newLavaVolume -= solidifiedVolume;
            }
        }
    }

    // Output terrain with updated height and rock material
    // Preserve water (G channel) and base rock surface height (A channel)
    writeTerrain = vec4(newTerrainHeight, waterVolume, newRockMaterial, baseRockSurfaceHeight);
    
    // Output updated lava (with solidified parts removed)
    writeLava = vec4(newLavaVolume, newLavaTemp, 0.0, 0.0);
}
