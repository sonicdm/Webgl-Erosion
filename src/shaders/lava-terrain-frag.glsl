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
        }

        // ========== WATER EVAPORATION ==========
        // Hot lava evaporates water when in contact
        // Physics: Water absorbs heat and vaporizes
        // Latent heat of vaporization: ~2,260,000 J/kg for water
        float waterLatentHeatVaporization = 2260000.0; // J/kg
        float waterSpecificHeat = 4180.0; // J/(kg·K) for water
        float waterDensity = 1000.0; // kg/m³

        if (lavaVolume > 0.001 && waterVolume > 0.001 && lavaTemp > u_LavaWaterTemp) {
            // Calculate heat flux from lava to water
            float surfaceArea = sqrt(lavaVolume); // Contact area
            float heatFlux = u_LavaContactHeatTransfer * surfaceArea * (lavaTemp - u_LavaWaterTemp);
            float heatTransferred = heatFlux * u_timestep; // Total heat transferred this timestep
            
            // Calculate water mass
            float waterMass = waterVolume * waterDensity;
            
            // Energy to heat water from 10°C to 100°C (boiling point)
            float energyToHeat = waterMass * waterSpecificHeat * (100.0 - u_LavaWaterTemp);
            
            // Remaining energy goes to vaporization
            float energyForVaporization = max(0.0, heatTransferred - energyToHeat);
            
            // Calculate mass of water vaporized
            float massVaporized = energyForVaporization / max(waterLatentHeatVaporization, 1.0);
            
            // Convert mass to volume and reduce water
            float volumeVaporized = massVaporized / waterDensity;
            waterVolume = max(0.0, waterVolume - volumeVaporized);
        }

        // ========== SOLIDIFICATION (Filling Channels) ==========
        // Cooled lava solidifies into rock and fills channels
        if (lavaTemp < u_LavaSolidificationTemp) {
            // Temperature-dependent solidification rate
            // Cooler lava solidifies faster (more below solidification temp = faster solidification)
            float tempBelowSolidification = u_LavaSolidificationTemp - lavaTemp;
            float maxTempDiff = u_LavaSolidificationTemp - 800.0; // Max possible difference (800°C is minimum)
            float tempFactor = clamp(tempBelowSolidification / max(maxTempDiff, 1.0), 0.0, 1.0);
            
            // Base solidification rate (increased from 0.05 to 0.3 for faster solidification)
            float baseSolidificationRate = 0.3;
            // Cooler lava solidifies faster - scale by temperature difference
            float solidificationRate = baseSolidificationRate * (1.0 + tempFactor * 2.0); // Up to 3x faster when very cool
            float solidifiedVolume = min(newLavaVolume, solidificationRate * u_timestep);

            // Convert solidified lava to rock material
            if (solidifiedVolume > 0.0f) {
                // Calculate lava surface height (terrain height + remaining lava volume)
                float lavaSurfaceHeight = newTerrainHeight + (newLavaVolume - solidifiedVolume);
                
                // Solidified rock raises terrain height to match lava surface
                // This fills the channel carved by hot lava
                newTerrainHeight = max(newTerrainHeight, lavaSurfaceHeight);
                
                // Mark as rock material - increased scale factor from 0.1 to 1.0
                // Rock material is stored in B channel (0.0 to 1.0)
                // Use larger scale factor to ensure rock material is clearly visible
                float solidifiedRock = min(1.0, solidifiedVolume * 1.0); // Changed from 0.1 to 1.0
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
