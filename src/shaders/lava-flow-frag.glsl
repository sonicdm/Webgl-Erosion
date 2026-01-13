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

    // Convert temperature to Kelvin for Arrhenius equation
    float tempKelvin = lavaTemp + 273.15; // Celsius to Kelvin

    // Arrhenius viscosity law: η(T) = A * exp(E_a / (R * T))
    // Simplified for shader: viscosity = base_viscosity * exp(activation_energy / (gas_constant * temp_kelvin))
    float viscosity = u_LavaViscosityPreExp * exp(u_LavaActivationEnergy / (u_LavaGasConstant * tempKelvin));
    
    // Clamp viscosity to reasonable range (10^2 to 10^5 Pa·s for basalt)
    viscosity = clamp(viscosity, 100.0, 100000.0);

    // Effective pipe length increases with viscosity (higher viscosity = slower flow)
    // Real-world: Basaltic lava viscosity is 10-100 Pa·s (10,000-100,000x water's 0.001 Pa·s)
    // But real flow speeds are only 10-100x slower, not 10,000x slower
    // This is because flow speed depends on viscosity^0.5 to viscosity^0.33 (not linear)
    float viscosityRatio = viscosity / 0.001; // Ratio to water viscosity (10,000-100,000,000)
    
    // Power-based scaling (matches real-world flow speed relationship)
    // Flow speed ~ viscosity^(-0.5 to -0.33), so effectivePipeLen ~ viscosity^(0.15 to 0.25)
    float viscosityScaleFactor = pow(viscosityRatio, 0.2); // 0.2 power gives:
    // At 1200°C: viscosity ~100 Pa·s, ratio = 100,000, factor = 6.3x
    // At 1000°C: viscosity ~1,000 Pa·s, ratio = 1,000,000, factor = 10x  
    // At 800°C: viscosity ~100,000 Pa·s, ratio = 100,000,000, factor = 25x (clamp to 10x)
    viscosityScaleFactor = clamp(viscosityScaleFactor, 1.0, 10.0); // Cap at 10x slower
    float effectivePipeLen = pipelen * viscosityScaleFactor;

    // Calculate height differences for flow (terrain height + lava height)
    float Htopout = (curTerrain.x + lavaVolume) - (top.x + texture(readLava, curuv + vec2(0.0f, div)).x);
    float Hrightout = (curTerrain.x + lavaVolume) - (right.x + texture(readLava, curuv + vec2(div, 0.0f)).x);
    float Hbottomout = (curTerrain.x + lavaVolume) - (bottom.x + texture(readLava, curuv + vec2(0.0f, -div)).x);
    float Hleftout = (curTerrain.x + lavaVolume) - (left.x + texture(readLava, curuv + vec2(-div, 0.0f)).x);

    // Flow velocity based on gravity-driven flow: v = (ρ * g * h² * sin(θ)) / (3 * η)
    // Simplified for pipe model: flux = (height_diff * gravity * area) / (pipe_length * viscosity)
    // Apply damping to flux accumulation
    float damping = 0.95; // Slight damping for stability
    float ftopout = max(0.0f, curFlux.x * damping + (u_timestep * g * u_PipeArea * Htopout) / effectivePipeLen);
    float frightout = max(0.0f, curFlux.y * damping + (u_timestep * g * u_PipeArea * Hrightout) / effectivePipeLen);
    float fbottomout = max(0.0f, curFlux.z * damping + (u_timestep * g * u_PipeArea * Hbottomout) / effectivePipeLen);
    float fleftout = max(0.0f, curFlux.w * damping + (u_timestep * g * u_PipeArea * Hleftout) / effectivePipeLen);

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
