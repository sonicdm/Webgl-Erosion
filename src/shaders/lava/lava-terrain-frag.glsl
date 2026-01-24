#version 300 es
precision highp float;

uniform sampler2D readTerrain; // terrain: R: height, G: water, B: rock, A: base rock
uniform sampler2D readLava; // lava: R: volume, G: temperature, B: unused, A: unused
uniform sampler2D readLavaFlux; // lava flux: R top, G right, B bottom, A left

uniform float u_SimRes;
uniform float u_timestep;

// Physics constants for thermal erosion and solidification
uniform float u_LavaContactHeatTransfer; // Contact heat transfer coefficient (default: 200.0 W/(m²·K))
uniform float u_LavaMeltThreshold; // Terrain melting temperature (default: 1200.0 °C)
uniform float u_LavaLatentHeatFusion; // Latent heat of fusion (default: 400000.0 J/kg)
uniform float u_LavaSolidificationTemp; // Temperature threshold for solidification (default: 800.0 °C)
uniform float u_LavaInitialTemp; // Initial temperature for new lava (default: 1200.0 °C)
uniform float u_LavaDensity; // Density (default: 2700.0 kg/m³)
uniform float u_LavaWaterTemp; // Water temperature (default: 10.0 °C)
uniform int u_LavaSourceCount;
uniform vec2 u_LavaSourcePositions[16];
uniform float u_LavaSourceSizes[16];

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
    vec4 curFlux = texture(readLavaFlux, curuv);
    float flowSpeed = (abs(curFlux.x) + abs(curFlux.y) + abs(curFlux.z) + abs(curFlux.w))
        / max(lavaVolume, 0.001f);

    bool isAtSource = false;
    int sourceCount = min(u_LavaSourceCount, 16);
    for (int i = 0; i < sourceCount; i++) {
        vec2 sourcePos = u_LavaSourcePositions[i];
        float sourceSize = u_LavaSourceSizes[i];
        float distToSource = distance(sourcePos, curuv);
        float sourceRadius = 0.015 * sourceSize;
        if (distToSource < sourceRadius) {
            isAtSource = true;
            break;
        }
    }

    float newTerrainHeight = terrainHeight;
    float newRockMaterial = rockMaterial;
    float newLavaVolume = lavaVolume;
    float newLavaTemp = lavaTemp;

    // Only process if lava is present
    if (lavaVolume > 0.001) {
        // ========== MELTING (Carving Channels) ==========
        // Physics-driven melt: heat flux -> mass melted -> height reduction
        // IMPORTANT: Melted material is incorporated into the lava flow, making it thicker
        float tempExcess = max(lavaTemp - u_LavaMeltThreshold, 0.0);
        if (tempExcess > 0.0) {
            float surfaceArea = sqrt(max(lavaVolume, 0.0001f)); // contact area
            float heatFlux = u_LavaContactHeatTransfer * surfaceArea * tempExcess;
            float massMelted = (heatFlux * u_timestep) / max(u_LavaLatentHeatFusion, 0.001);
            // Convert mass to height reduction: assume terrain density similar to lava density
            // Height reduction = mass / (density * area), where area = 1.0 (unit cell)
            float heightReduction = massMelted / max(u_LavaDensity, 1.0);
            // Rock melts slower; scale by remaining soil fraction
            heightReduction *= (1.0 - clamp(rockMaterial, 0.0, 1.0));
            // Scale up to make erosion more visible (heat transfer might be too conservative)
            heightReduction *= 10.0; // Scale factor to make erosion visible
            float dh = clamp(heightReduction, 0.0, terrainHeight);
            newTerrainHeight = terrainHeight - dh;
            
            // INCORPORATE MELTED MATERIAL INTO LAVA VOLUME
            // When lava thermally erodes terrain, the melted material becomes part of the flow
            // This makes the lava thicker as it erodes, which is physically accurate
            // Assume melted material has similar density to lava (or slightly less due to mixing)
            float incorporatedVolume = dh * 0.8; // 80% of melted volume becomes lava (some loss to vaporization)
            newLavaVolume += incorporatedVolume;
            
            // Melted material becomes rock/obsidian (for the channel walls)
            float rockFromMelting = min(1.0, dh * 10.0);
            newRockMaterial = max(newRockMaterial, rockFromMelting);
            baseRockSurfaceHeight = max(baseRockSurfaceHeight, newTerrainHeight);
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
        // Use relative temperature thresholds based on the actual temperature range
        float tempRange = u_LavaInitialTemp - u_LavaSolidificationTemp;
        float veryHotThreshold = u_LavaSolidificationTemp + tempRange * 0.75; // 75% of range (e.g., 1100°C if 800-1200°C)
        float hotThreshold = u_LavaSolidificationTemp + tempRange * 0.5;      // 50% of range (e.g., 1000°C if 800-1200°C)
        
        float evaporationMultiplier = 1.0;
        if (lavaTemp > veryHotThreshold) {
            evaporationMultiplier = 3.0; // 3x faster for very hot lava
        } else if (lavaTemp > hotThreshold) {
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
        // Cooled lava solidifies into rock and creates piles
        // CRITICAL: Don't solidify if hot lava is flowing in - this prevents impassable barriers
        // Check neighbors for hot incoming lava
        vec4 topLava = texture(readLava, curuv + vec2(0.0f, div));
        vec4 rightLava = texture(readLava, curuv + vec2(div, 0.0f));
        vec4 bottomLava = texture(readLava, curuv + vec2(0.0f, -div));
        vec4 leftLava = texture(readLava, curuv + vec2(-div, 0.0f));
        
        // Detect edge cells (same logic as cooling shader)
        // Matches NRC finding: upper crustal zone develops first at edges
        // Matches SPH paper: edges solidify due to higher cooling rates
        // Strong edge = neighbor has no lava or very little (<30% of current)
        // Weak edge = neighbor has some lava but less than current
        float edgeFactor = 0.0;
        int emptyNeighborCount = 0;
        int lowNeighborCount = 0;
        for (int i = 0; i < 4; i++) {
            float neighborVol = (i == 0) ? topLava.x : ((i == 1) ? rightLava.x : ((i == 2) ? bottomLava.x : leftLava.x));
            if (neighborVol < 0.001) {
                emptyNeighborCount++; // Completely empty neighbor = strong edge
            } else if (neighborVol < newLavaVolume * 0.3) {
                lowNeighborCount++; // Low volume neighbor = weak edge
            }
        }
        // Edge factor: 0.0 = interior, 0.5 = weak edge, 1.0 = strong edge
        // Strong edges (empty neighbors) contribute more to edge factor
        edgeFactor = clamp((float(emptyNeighborCount) * 0.6 + float(lowNeighborCount) * 0.3) / 2.0, 0.0, 1.0);
        
        // Check if any neighbor has hot lava that could flow in
        bool hasHotNeighbor = false;
        float hotNeighborThreshold = u_LavaSolidificationTemp + 50.0; // Hot enough to prevent solidification
        if (topLava.x > 0.001 && topLava.y > hotNeighborThreshold) hasHotNeighbor = true;
        if (rightLava.x > 0.001 && rightLava.y > hotNeighborThreshold) hasHotNeighbor = true;
        if (bottomLava.x > 0.001 && bottomLava.y > hotNeighborThreshold) hasHotNeighbor = true;
        if (leftLava.x > 0.001 && leftLava.y > hotNeighborThreshold) hasHotNeighbor = true;
        
        // Also check flux to see if hot lava is actively flowing in
        vec4 curFlux = texture(readLavaFlux, curuv);
        vec4 topFlux = texture(readLavaFlux, curuv + vec2(0.0f, div));
        vec4 rightFlux = texture(readLavaFlux, curuv + vec2(div, 0.0f));
        vec4 bottomFlux = texture(readLavaFlux, curuv + vec2(0.0f, -div));
        vec4 leftFlux = texture(readLavaFlux, curuv + vec2(-div, 0.0f));
        
        // Calculate incoming flux (flux coming INTO this cell)
        float incomingFlux = abs(topFlux.z) + abs(rightFlux.w) + abs(bottomFlux.x) + abs(leftFlux.y);
        bool hasIncomingFlow = incomingFlux > 0.001;
        
        float solidificationThreshold = u_LavaSolidificationTemp - 5.0; // Small buffer before solidifying
        // CRITICAL: Don't solidify if hot lava is nearby or flowing in - prevents impassable barriers
        // Interior cells (low edgeFactor) should only solidify if very cold and not flowing
        // This allows interior to stay liquid and flow even when edges are solid
        // Matches NRC finding: convection in core keeps interior liquid longer
        bool isInterior = edgeFactor < 0.3;
        if (lavaTemp < solidificationThreshold &&
            newLavaVolume > 0.001 &&
            !isAtSource &&
            flowSpeed < 0.1 &&
            !hasHotNeighbor && // Don't solidify if hot neighbor could flow in
            !hasIncomingFlow && // Don't solidify if lava is actively flowing in
            (!isInterior || (isInterior && lavaTemp < solidificationThreshold - 50.0))) { // Interior needs to be much colder
            // Make solidification rate adaptive - thicker pools solidify slower (top layer only)
            // This allows multiple layers to build up over time, creating piles
            float tempBelowSolidification = solidificationThreshold - lavaTemp;
            float maxTempDiff = solidificationThreshold - 600.0; // Allow wider range (600-800°C)
            float tempFactor = clamp(tempBelowSolidification / max(maxTempDiff, 1.0), 0.0, 1.0);
            
            // Base rate - solidification from top down
            // For thicker pools, only solidify the top layer each frame to build up piles
            float baseSolidificationRate = 0.15; // Increased from 0.09 for faster pile building
            float rateMultiplier = 1.0 + tempFactor * 1.5;
            float solidificationRate = baseSolidificationRate * rateMultiplier;
            
            // For thicker pools, limit solidification to top layer only
            // This allows multiple layers to solidify over time, creating visible piles
            float topLayerThickness = 0.1; // Solidify top 0.1 units per frame for thick pools
            if (newLavaVolume > topLayerThickness) {
                // Thick pool: only solidify top layer, allowing rest to flow or cool further
                solidificationRate = min(solidificationRate, topLayerThickness / u_timestep);
            }
            
            // Edge-first solidification: edges solidify faster, interior slower
            // This creates levees that channelize flow, not barriers that block it
            // Matches NRC finding: crust forms at edges first, interior stays liquid
            // Matches SPH paper: edges solidify due to higher cooling rates
            float edgeSolidificationMultiplier = 1.0 + edgeFactor * 3.0; // 1x to 4x for edges
            float interiorSolidificationMultiplier = 1.0 - edgeFactor * 0.8; // 1x to 0.2x for interior
            float effectiveSolidificationMultiplier = mix(interiorSolidificationMultiplier, edgeSolidificationMultiplier, edgeFactor);
            
            float waterSolidifyBoost = waterDirectlyOnLava ? 5.0 : (hasAdjacentWater ? 2.0 : 1.0);
            solidificationRate *= effectiveSolidificationMultiplier * waterSolidifyBoost;
            
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
                
                // Edge-first levee formation: edges build up MORE height to create visible channeling
                // Strong edges (edgeFactor > 0.5) should build up 1.5-2x more height to form prominent levees
                // This matches real lava flow: edges solidify and build up, creating natural channels
                float leveeHeightMultiplier = 1.0 + edgeFactor * 1.0; // 1x to 2x for strong edges
                float heightToAdd = solidifiedVolume * leveeHeightMultiplier;
                
                // Terrain should rise to match the new lava surface level
                // Edges rise more to create visible levees that channelize flow
                float targetHeight = newTerrainHeight + heightToAdd;
                newTerrainHeight = max(newTerrainHeight, targetHeight);
                baseRockSurfaceHeight = max(baseRockSurfaceHeight, newTerrainHeight);
                
                // Make rock material more visible for thicker piles
                // Scale rock material with solidified volume to show pile thickness
                if (solidifiedVolume > 0.02) {
                    newRockMaterial = max(newRockMaterial, 0.8); // Strong rock signal for visible piles
                }
                
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

        // Additional top-down solidification for deeper lava pools (already handled above, but keep for very cold pools)
        // This is now redundant since we allow solidification for all volumes above

        // Catch-up: if lava is very cold and only a tiny amount remains, turn it fully to rock.
        if (lavaTemp < u_LavaSolidificationTemp - 150.0 &&
            newLavaVolume > 0.0 && newLavaVolume < 0.005 &&
            !isAtSource) {
            newTerrainHeight += newLavaVolume;
            baseRockSurfaceHeight = max(baseRockSurfaceHeight, newTerrainHeight);
            newRockMaterial = max(newRockMaterial, min(1.0, newLavaVolume + 0.2));
            newLavaVolume = 0.0;
        }
    }

    // Output terrain with updated height and rock material
    // Preserve water (G channel) and base rock surface height (A channel)
    writeTerrain = vec4(newTerrainHeight, waterVolume, newRockMaterial, baseRockSurfaceHeight);
    
    // Output updated lava (with solidified parts removed)
    writeLava = vec4(newLavaVolume, newLavaTemp, 0.0, 0.0);
}
