#version 300 es
precision highp float;

uniform sampler2D readTerrain; // R: height, G: water, B: rock, A: base rock surface
uniform sampler2D readLava;    // R: lava volume, G: temperature (normalized 0-1, 800-1200°C range)
uniform sampler2D readLavaFlux;

uniform float u_SimRes;
uniform float u_PipeLen;
uniform float u_timestep;
uniform float u_PipeArea;

// Lava physics parameters
uniform float u_LavaViscosityPreExp;      // Pre-exponential factor A (default: 1e-5)
uniform float u_LavaActivationEnergy;     // Activation energy E_a (default: 200000 J/mol)
uniform float u_LavaDensity;               // Density (default: 2700 kg/m³)
uniform float u_LavaGasConstant;          // Gas constant R = 8.314 J/(mol·K)

layout (location = 0) out vec4 writeLavaFlux;

in vec2 fs_Pos;

void main() {
    vec2 curuv = 0.5f * fs_Pos + 0.5f;
    float div = 1.0f / u_SimRes;
    float g = 0.80; // Use same gravity constant as water for consistency
    float pipelen = u_PipeLen;

    vec4 top = texture(readTerrain, curuv + vec2(0.0f, div));
    vec4 right = texture(readTerrain, curuv + vec2(div, 0.0f));
    vec4 bottom = texture(readTerrain, curuv + vec2(0.0f, -div));
    vec4 left = texture(readTerrain, curuv + vec2(-div, 0.0f));

    vec4 curTerrain = texture(readTerrain, curuv);
    vec4 curLava = texture(readLava, curuv);
    vec4 curFlux = texture(readLavaFlux, curuv);

    float lavaVolume = curLava.x;
    float lavaTemp = curLava.y; // Temperature in Celsius (800-1200°C range)

    // Remove minimum volume threshold - let very thin flows still flow (they'll naturally pool in depressions)
    // The flux system will naturally handle pooling when there's no downhill path

    // Convert temperature to Kelvin for Arrhenius equation
    float tempKelvin = lavaTemp + 273.15; // Celsius to Kelvin

    // Arrhenius viscosity law: η(T) = A * exp(E_a / (R * T))
    // Simplified for shader: viscosity = base_viscosity * exp(activation_energy / (gas_constant * temp_kelvin))
    float viscosity = u_LavaViscosityPreExp * exp(u_LavaActivationEnergy / (u_LavaGasConstant * tempKelvin));
    
    // Clamp viscosity to reasonable range (10^2 to 10^5 Pa·s for basalt)
    viscosity = clamp(viscosity, 100.0, 100000.0);

    // Effective pipe length increases with viscosity (higher viscosity = slower flow)
    // Real-world: Basaltic lava viscosity is 10-100 Pa·s (10,000-100,000x water's 0.001 Pa·s)
    // But real flow speeds are only 2-10x slower, not 10,000x slower
    // This is because flow speed depends on viscosity^0.5 to viscosity^0.33 (not linear)
    float viscosityRatio = viscosity / 0.001; // Ratio to water viscosity (10,000-100,000,000)
    
    // Power-based scaling (matches real-world flow speed relationship)
    // Flow speed ~ viscosity^(-0.5 to -0.33), so effectivePipeLen ~ viscosity^(0.15 to 0.25)
    // Use a moderate power (0.18) to balance between too slow and too fast
    // This makes hot lava (1200°C) flow 4-5x slower than water, and cool lava (800°C) flow 10-12x slower
    float viscosityScaleFactor = pow(viscosityRatio, 0.18); // 0.18 power gives:
    // At 1200°C: viscosity ~100 Pa·s, ratio = 100,000, factor = 4.2x
    // At 1000°C: viscosity ~1,000 Pa·s, ratio = 1,000,000, factor = 5.5x  
    // At 800°C: viscosity ~100,000 Pa·s, ratio = 100,000,000, factor = 10.5x
    viscosityScaleFactor = clamp(viscosityScaleFactor, 1.0, 12.0); // Cap at 12x slower
    float effectivePipeLen = pipelen * viscosityScaleFactor;

    // Calculate height differences for flow (terrain height + lava height)
    // Check if neighbors have solidified rock (no active lava but rock material present)
    // Allow fresh lava to flow over solidified rock by treating it as having zero lava height
    
    // Top neighbor
    vec4 topLava = texture(readLava, curuv + vec2(0.0f, div));
    float topLavaVolume = topLava.x;
    float topRockVal = top.z; // Rock material in terrain B channel
    bool topIsSolidifiedRock = topRockVal > 0.1 && topLavaVolume < 0.001;
    float topEffectiveLava = topIsSolidifiedRock ? 0.0 : topLavaVolume;
    
    // Right neighbor
    vec4 rightLava = texture(readLava, curuv + vec2(div, 0.0f));
    float rightLavaVolume = rightLava.x;
    float rightRockVal = right.z;
    bool rightIsSolidifiedRock = rightRockVal > 0.1 && rightLavaVolume < 0.001;
    float rightEffectiveLava = rightIsSolidifiedRock ? 0.0 : rightLavaVolume;
    
    // Bottom neighbor
    vec4 bottomLava = texture(readLava, curuv + vec2(0.0f, -div));
    float bottomLavaVolume = bottomLava.x;
    float bottomRockVal = bottom.z;
    bool bottomIsSolidifiedRock = bottomRockVal > 0.1 && bottomLavaVolume < 0.001;
    float bottomEffectiveLava = bottomIsSolidifiedRock ? 0.0 : bottomLavaVolume;
    
    // Left neighbor
    vec4 leftLava = texture(readLava, curuv + vec2(-div, 0.0f));
    float leftLavaVolume = leftLava.x;
    float leftRockVal = left.z;
    bool leftIsSolidifiedRock = leftRockVal > 0.1 && leftLavaVolume < 0.001;
    float leftEffectiveLava = leftIsSolidifiedRock ? 0.0 : leftLavaVolume;
    
    // Use effective lava volume in height calculations
    // Calculate raw height differences (can be negative if uphill)
    float Htopout_raw = (curTerrain.x + lavaVolume) - (top.x + topEffectiveLava);
    float Hrightout_raw = (curTerrain.x + lavaVolume) - (right.x + rightEffectiveLava);
    float Hbottomout_raw = (curTerrain.x + lavaVolume) - (bottom.x + bottomEffectiveLava);
    float Hleftout_raw = (curTerrain.x + lavaVolume) - (left.x + leftEffectiveLava);
    
    // Check if flow is uphill (negative height difference)
    // If uphill, completely prevent flow in that direction
    bool topIsUphill = Htopout_raw <= 0.0f;
    bool rightIsUphill = Hrightout_raw <= 0.0f;
    bool bottomIsUphill = Hbottomout_raw <= 0.0f;
    bool leftIsUphill = Hleftout_raw <= 0.0f;
    
    // Clamp height differences to non-negative (only allow downhill flow)
    // This prevents lava from flowing uphill
    float Htopout = max(0.0f, Htopout_raw);
    float Hrightout = max(0.0f, Hrightout_raw);
    float Hbottomout = max(0.0f, Hbottomout_raw);
    float Hleftout = max(0.0f, Hleftout_raw);

    // Flow velocity based on gravity-driven flow: v = (ρ * g * h² * sin(θ)) / (3 * η)
    // Simplified for pipe model: flux = (height_diff * gravity * area) / (pipe_length * viscosity)
    // Remove damping to match water flow behavior (water uses damping = 1.0, which is no damping)
    float damping = 1.0; // No damping, match water flow behavior
    
    // Declare flux variables
    float ftopout;
    float frightout;
    float fbottomout;
    float fleftout;
    
    // Normal flow calculation - match water flow behavior exactly
    // Water allows some flux accumulation even when height differences are small
    // This is important for pooling - when lava reaches a depression, flux should decay naturally
    // but still allow volume to accumulate from inflow
    // Match water's flux calculation exactly (water doesn't check for uphill, it just uses max(0, ...))
    ftopout = max(0.0f, curFlux.x * damping + (u_timestep * g * u_PipeArea * Htopout) / effectivePipeLen);
    frightout = max(0.0f, curFlux.y * damping + (u_timestep * g * u_PipeArea * Hrightout) / effectivePipeLen);
    fbottomout = max(0.0f, curFlux.z * damping + (u_timestep * g * u_PipeArea * Hbottomout) / effectivePipeLen);
    fleftout = max(0.0f, curFlux.w * damping + (u_timestep * g * u_PipeArea * Hleftout) / effectivePipeLen);

    float lavaOut = u_timestep * (ftopout + frightout + fbottomout + fleftout);
    
    // Rescale outflow flux so that outflow doesn't exceed current lava volume
    float k = min(1.0f, (lavaVolume * u_PipeLen * u_PipeLen) / max(lavaOut, 0.0001f));
    
    ftopout *= k;
    frightout *= k;
    fbottomout *= k;
    fleftout *= k;

    // Boundary conditions - prevent flow off edges
    if(curuv.x <= div) fleftout = 0.0f;
    if(curuv.x >= 1.0f - 2.0f * div) frightout = 0.0f;
    if(curuv.y <= div) ftopout = 0.0f;
    if(curuv.y >= 1.0f - 2.0f * div) fbottomout = 0.0f;

    writeLavaFlux = vec4(ftopout, frightout, fbottomout, fleftout);
}
