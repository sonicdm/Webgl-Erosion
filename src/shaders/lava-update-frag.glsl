#version 300 es
precision highp float;

uniform sampler2D readTerrain; // R: height, G: water, B: rock, A: base rock surface
uniform sampler2D readLava;     // R: lava volume, G: temperature (normalized 0-1, 800-1200°C range)
uniform sampler2D readLavaFlux; // R: top, G: right, B: bottom, A: left

uniform float u_SimRes;
uniform float u_PipeLen;
uniform float u_timestep;
uniform float u_PipeArea;

// Lava physics parameters
uniform float u_LavaAirHeatTransfer;     // Heat transfer coefficient for air (default: 30.0 W/(m²·K))
uniform float u_LavaWaterHeatTransfer;   // Heat transfer coefficient for water (default: 2000.0 W/(m²·K))
uniform float u_LavaAmbientTemp;         // Ambient air temperature (default: 20.0 °C)
uniform float u_LavaWaterTemp;            // Water temperature (default: 10.0 °C)
uniform float u_LavaDensity;              // Density (default: 2700 kg/m³)
uniform float u_LavaSpecificHeat;        // Specific heat capacity (default: 1200 J/(kg·K))
uniform float u_LavaInitialTemp;         // Initial temperature for new lava (default: 1200.0 °C)
uniform float u_Time;                    // Time for source variation

// Lava sources (similar to water sources)
uniform int u_LavaSourceCount;
uniform vec2 u_LavaSourcePositions[16];
uniform float u_LavaSourceSizes[16];
uniform float u_LavaSourceStrengths[16];

// Lava brush (brush type 7)
uniform vec4 u_MouseWorldPos;
uniform vec3 u_MouseWorldDir;
uniform float u_BrushSize;
uniform float u_BrushStrength;
uniform int u_BrushType;
uniform int u_BrushPressed;
uniform vec2 u_BrushPos;
uniform int u_BrushOperation;

layout (location = 0) out vec4 writeLava;

in vec2 fs_Pos;

// Noise functions for source variation
#define OCTAVES 6

float random (in vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233)))*43758.5453123);
}

float noise (in vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    
    vec2 u = f * f * (3.0 - 2.0 * f);
    
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm (in vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    
    for (int i = 0; i < OCTAVES; i++) {
        value += amplitude * noise(st);
        st *= 2.0;
        amplitude *= 0.53;
    }
    return value;
}

void main() {
    vec2 curuv = 0.5f * fs_Pos + 0.5f;
    float div = 1.0f / u_SimRes;

    vec4 curTerrain = texture(readTerrain, curuv);
    vec4 curLava = texture(readLava, curuv);
    vec4 curFlux = texture(readLavaFlux, curuv);

    // Get neighbor fluxes
    vec4 topflux = texture(readLavaFlux, curuv + vec2(0.0f, div));
    vec4 rightflux = texture(readLavaFlux, curuv + vec2(div, 0.0f));
    vec4 bottomflux = texture(readLavaFlux, curuv + vec2(0.0f, -div));
    vec4 leftflux = texture(readLavaFlux, curuv + vec2(-div, 0.0f));

    // Outflow flux
    float ftopout = curFlux.x;
    float frightout = curFlux.y;
    float fbottomout = curFlux.z;
    float fleftout = curFlux.w;

    // Inflow flux (from neighbors)
    vec4 inputflux = vec4(topflux.z, rightflux.w, bottomflux.x, leftflux.y);
    float fout = ftopout + frightout + fbottomout + fleftout;
    float fin = inputflux.x + inputflux.y + inputflux.z + inputflux.w;

    // Update lava volume based on flux
    float deltavol = u_timestep * (fin - fout) / (u_PipeLen * u_PipeLen);

    float lavaVolume = max(0.0f, curLava.x + deltavol);
    float lavaTemp = curLava.y; // Temperature in Celsius (800-1200°C range)

    // Check for water contact (water in terrain G channel)
    // Improved water contact: if water is present above threshold, apply full water cooling
    // This ensures even small amounts of water cause rapid cooling
    float waterVolume = curTerrain.y;
    // Lower threshold to catch even tiny amounts of water
    // Also check neighbors to catch water that's adjacent to lava
    float waterThreshold = 0.0001f; // Very low threshold to catch any water
    float waterContact = 0.0f;
    
    // Check current pixel and neighbors for water
    vec4 topTerrain = texture(readTerrain, curuv + vec2(0.0f, div));
    vec4 rightTerrain = texture(readTerrain, curuv + vec2(div, 0.0f));
    vec4 bottomTerrain = texture(readTerrain, curuv + vec2(0.0f, -div));
    vec4 leftTerrain = texture(readTerrain, curuv + vec2(-div, 0.0f));
    
    // If water is present at current location or any neighbor, apply water cooling
    // This handles cases where water and lava are adjacent
    if (waterVolume > waterThreshold || 
        topTerrain.y > waterThreshold || 
        rightTerrain.y > waterThreshold || 
        bottomTerrain.y > waterThreshold || 
        leftTerrain.y > waterThreshold) {
        waterContact = 1.0f;
    }
    
    // Also check if water volume is significant at current location (stronger cooling)
    if (waterVolume > 0.001f) {
        waterContact = 1.0f; // Full water cooling
    }

    // Heat transfer physics (Newton's law of cooling)
    // dT/dt = -(h * A * (T - T_ambient)) / (m * c_p)
    // Only cool if there's lava present
    if (lavaVolume > 0.0001f) {
        // Improved surface area calculation
        // Thin lava flows have more surface area relative to volume
        // For very thin flows, surface area should be larger
        float baseSurfaceArea = sqrt(max(lavaVolume, 0.0001f));
        // Thin flows (< 0.1 volume) have proportionally more surface area
        float thinFlowMultiplier = lavaVolume < 0.1 ? (0.1 / max(lavaVolume, 0.001f)) : 1.0;
        thinFlowMultiplier = clamp(thinFlowMultiplier, 1.0, 5.0); // Cap at 5x for very thin flows
        float surfaceArea = baseSurfaceArea * thinFlowMultiplier;
        
        // Mass
        float mass = lavaVolume * u_LavaDensity;
        
        // Effective heat transfer coefficient (mix between air and water)
        float h_effective = mix(u_LavaAirHeatTransfer, u_LavaWaterHeatTransfer, waterContact);
        float T_ambient_effective = mix(u_LavaAmbientTemp, u_LavaWaterTemp, waterContact);
        
        // Newton's law of cooling
        if (mass > 0.0f) {
            float coolingRate = (h_effective * surfaceArea * (lavaTemp - T_ambient_effective)) / (mass * u_LavaSpecificHeat);
            
            // Make water cooling more aggressive - water should cool lava much faster
            // When water is present, multiply cooling rate significantly
            if (waterContact > 0.5f) {
                coolingRate *= 10.0f; // 10x faster cooling when water is present
            }
            
            lavaTemp -= coolingRate * u_timestep;
        }
        
        // Clamp temperature to valid range (800-1200°C)
        lavaTemp = clamp(lavaTemp, 800.0, 1200.0);
    } else {
        // No lava, reset temperature
        lavaTemp = u_LavaInitialTemp;
    }

    // Lava sources - add lava at source positions (with bubbling variation like water sources)
    for(int i = 0; i < u_LavaSourceCount; i++) {
        vec2 sourcePos = u_LavaSourcePositions[i];
        float sourceSize = u_LavaSourceSizes[i];
        float sourceStrength = u_LavaSourceStrengths[i];
        
        float distToSource = distance(sourcePos, curuv);
        float sourceRadius = 0.01 * sourceSize;
        
        if (distToSource < sourceRadius) {
            float density = (sourceRadius - distToSource) / sourceRadius;
            density = max(0.0f, density);
            
            float sourceAmount = 0.0006 * sourceStrength;
            float sourceLava = sourceAmount * density * 280.0;
            
            // Add time-based variation for bubbling effect (similar to water sources)
            // Use FBM noise with time to create natural variation
            // This creates the "bubbling up" effect
            float timeVariation = fbm(curuv * 200.0 + vec2(sin(u_Time * 5.0), cos(u_Time * 15.0)));
            sourceLava *= (0.5 + 0.5 * timeVariation); // Vary between 0.5x and 1.0x
            
            lavaVolume += sourceLava * u_timestep;
            
            // New lava from sources starts at high temperature
            // Mix temperature: if adding significant lava, set to initial temp
            if (sourceLava * u_timestep > 0.001f) {
                float mixFactor = min(1.0f, (sourceLava * u_timestep) / max(lavaVolume, 0.001f));
                lavaTemp = mix(lavaTemp, u_LavaInitialTemp, mixFactor);
            }
        }
    }

    // ========== LAVA BRUSH (Brush Type 7) ==========
    // Add/remove lava with brush
    // Use same pattern as rain shader: check if brush is active and type matches
    if (u_BrushPressed == 1 && u_BrushType == 7) {
        vec2 pointOnPlane = u_BrushPos;
        float pdis2fragment = distance(pointOnPlane, curuv);
        float brushRadius = 0.01 * u_BrushSize;
        
        if (pdis2fragment < brushRadius) {
            float dens = (brushRadius - pdis2fragment * 0.5) / brushRadius;
            dens = max(0.0f, dens);
            
            // Match water brush pattern: amount * dens * multiplier
            // Water brush uses: amount * dens * 200.0 where amount = 0.0006 * u_BrushStrength
            // Increase multiplier significantly to make lava brush more visible
            // Lava is thicker/denser than water, so needs more volume to be visible
            float brushAmount = 0.0006 * u_BrushStrength * dens * 500.0;
            
            if (u_BrushOperation == 0) {
                // Add lava at high temperature (apply directly, no timestep multiplication)
                lavaVolume += brushAmount;
                // Set temperature to initial temp when adding lava
                if (brushAmount > 0.001f) {
                    float mixFactor = min(1.0f, brushAmount / max(lavaVolume, 0.001f));
                    lavaTemp = mix(lavaTemp, u_LavaInitialTemp, mixFactor);
                }
            } else {
                // Remove lava (subtract mode)
                lavaVolume = max(0.0f, lavaVolume - brushAmount);
            }
        }
    }

    // Clamp lava volume to reasonable range
    lavaVolume = max(0.0f, lavaVolume);

    writeLava = vec4(lavaVolume, lavaTemp, 0.0, 0.0);
}
