#version 300 es
precision highp float;


in vec2 fs_Pos;
uniform float u_Time;
uniform float u_TerrainScale;
uniform float u_TerrainHeight;
uniform int u_terrainBaseType;
uniform int u_TerrainMask;
uniform vec2 u_TerrainSeedOffset;
uniform vec2 u_DuneDir;
uniform float u_CraterDensity;
uniform float u_CanyonDepth;
uniform sampler2D u_HeightMap; // Optional height map texture
uniform int u_UseHeightMap; // 0 = procedural, 1 = use height map

layout (location = 0) out vec4 initial;
layout (location = 1) out vec4 initial2;

//voroni=========================================================================

vec3 hash3( vec2 p ){
    vec3 q = vec3( dot(p,vec2(127.1,311.7)),
				   dot(p,vec2(269.5,183.3)),
				   dot(p,vec2(419.2,371.9)) );
	return fract(sin(q)*43758.5453);
}

float iqnoise( in vec2 x, float u, float v ){
    vec2 p = floor(x);
    vec2 f = fract(x);

	float k = 1.0+63.0*pow(1.0-v,4.0);

	float va = 0.0;
	float wt = 0.0;
    for( int j=-2; j<=2; j++ )
    for( int i=-2; i<=2; i++ )
    {
        vec2 g = vec2( float(i),float(j) );
		vec3 o = hash3( p + g )*vec3(u,u,1.0);
		vec2 r = g - f + o.xy;
		float d = dot(r,r);
		float ww = pow( 1.0-smoothstep(0.0,1.414,sqrt(d)), k );
		va += o.z*ww;
		wt += ww;
    }

    return va/wt;
}
//voroni=========================================================================



//smooth========================================================================
vec2 random2(vec2 st){
    st = vec2( dot(st,vec2(127.1,311.7)),
              dot(st,vec2(269.5,183.3)) );
    return -1.0 + 2.0*fract(sin(st)*43758.5453123);
}

// Value Noise by Inigo Quilez - iq/2013
// https://www.shadertoy.com/view/lsf3WH
float noise2(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    vec2 u = f*f*(3.0-2.0*f);

    return mix( mix( dot( random2(i + vec2(0.0,0.0) ), f - vec2(0.0,0.0) ),
                     dot( random2(i + vec2(1.0,0.0) ), f - vec2(1.0,0.0) ), u.x),
                mix( dot( random2(i + vec2(0.0,1.0) ), f - vec2(0.0,1.0) ),
                     dot( random2(i + vec2(1.0,1.0) ), f - vec2(1.0,1.0) ), u.x), u.y);
}


//smooth========================================================================

#define OCTAVES 8  // Reduced from 12 for faster generation (can be increased for more detail)

float random (in vec2 st) {
    return fract(sin(dot(st.xy,
                         vec2(12.9898,78.233)))*
        43758.5453123);
}


float noise (in vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    // Four corners in 2D of a tile
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
            (c - a)* u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
}


float fbm (in vec2 st) {
    // Initial values
    float value = 0.0;
    float amplitude = 0.5;
    //
    // Loop of octaves - optimized
    for (int i = 0; i < OCTAVES; i++) {
        value += amplitude * noise(st);
        st *= 2.0;
        amplitude *= 0.47;
    }
    return value;
}

float fbm4(in vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
        value += amplitude * noise(st);
        st *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

float hash12(vec2 st) {
    return random(st);
}

vec2 hash22(vec2 st) {
    return random2(st) * 0.5 + 0.5;
}

float voroni(in vec2 ss){
    float qq = iqnoise(ss * 2.0, 2.0f, 2.0f);
    return qq;
}

float teR(float h) {
    float W = 0.04; // width of terracing bands
    float k = floor(h / W);
    float f = (h - k*W) / W;
    float s = min(100.0 * f, 1.0);
    return (k+s) * W;
}

float domainwarp(vec2 p){
    return fbm(p+fbm(p+fbm(p)));
}

float test(vec2 p){
    return abs(pow(2.0,-length(p - vec2(0.5))*2.0));
}

float circle_mask(vec2 p){
    return max(0.5 - distance(p, vec2(0.5)), 0.0) ;
}

float square_mask(vec2 p){
    vec2 center = vec2(0.5);
    vec2 d = abs(p - center);
    float size = 0.4;
    return max(0.0, 1.0 - max(d.x, d.y) / size);
}

float ring_mask(vec2 p){
    float dist = distance(p, vec2(0.5));
    float inner = 0.2;
    float outer = 0.4;
    return smoothstep(outer, inner, dist) * smoothstep(inner - 0.1, inner, dist);
}

float radial_gradient_mask(vec2 p){
    float dist = distance(p, vec2(0.5));
    return 1.0 - smoothstep(0.0, 0.7, dist);
}

float corner_mask(vec2 p){
    return (1.0 - p.x) * (1.0 - p.y);
}

float diagonal_mask(vec2 p){
    return abs(p.x - p.y);
}

float cross_mask(vec2 p){
    vec2 center = vec2(0.5);
    vec2 d = abs(p - center);
    float width = 0.15;
    return max(smoothstep(width, 0.0, d.x), smoothstep(width, 0.0, d.y));
}

float ridgenoise(float p) {
    return 0.8 * (0.3 - abs(0.3 - p));
}

// Ridged noise - creates sharp mountain ridges
float ridged_noise(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float maxValue = 0.0;
    
    for (int i = 0; i < 8; i++) {
        float n = noise(p * frequency);
        n = abs(n);
        n = 1.0 - n; // Invert to create ridges
        n = n * n; // Square to sharpen ridges
        value += n * amplitude;
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return value / maxValue;
}

float ridged_mf(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float weight = 1.0;

    for (int i = 0; i < 6; i++) {
        float n = noise(p * frequency);
        n = abs(n * 2.0 - 1.0);
        n = 1.0 - n;
        n = n * n;
        n *= weight;
        weight = clamp(n * 2.0, 0.0, 1.0);
        value += n * amplitude;
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

// Billow noise - creates puffy, cloud-like terrain using absolute value of noise
float billow_noise(vec2 p) {
    vec2 warp = vec2(fbm4(p * 0.35 + 3.1), fbm4(p * 0.35 + 9.2));
    p += (warp - 0.5) * 1.2;

    float value = 0.0;
    float amplitude = 0.5;
    float maxValue = 0.0;

    for (int i = 0; i < 6; i++) {
        float n = noise(p);
        n = abs(n * 2.0 - 1.0);
        n = n * n;
        value += n * amplitude;
        maxValue += amplitude;
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value / maxValue;
}

// Turbulence - chaotic variation using absolute value of noise
float turbulence(vec2 p) {
    vec2 warp = vec2(fbm4(p * 0.25 + 11.7), fbm4(p * 0.25 + 21.3));
    p += (warp - 0.5) * 1.8;

    float value = 0.0;
    float amplitude = 0.5;
    float maxValue = 0.0;

    for (int i = 0; i < 7; i++) {
        float n = noise(p);
        n = abs(n * 2.0 - 1.0);
        value += n * amplitude;
        maxValue += amplitude;
        p *= 2.0;
        amplitude *= 0.55;
    }
    return value / maxValue;
}

float crater_mask(vec2 p) {
    vec2 cell = floor(p);
    float bowl = 0.0;
    float rim = 0.0;

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 c = cell + vec2(float(x), float(y));
            vec2 rnd = hash22(c);
            vec2 center = c + rnd;
            float radius = mix(0.2, 0.45, hash12(c + vec2(2.3, 5.7)));
            float d = distance(p, center);

            float depth = 1.0 - smoothstep(0.0, radius, d);
            depth = depth * depth;
            bowl = max(bowl, depth);

            float rimWidth = radius * 0.25;
            float rimBand = smoothstep(radius - rimWidth, radius, d) *
                (1.0 - smoothstep(radius, radius + rimWidth, d));
            rim = max(rim, rimBand);
        }
    }

    float micro = (noise(p * 6.0) - 0.5) * 0.06;
    float mask = 1.0 - bowl * 0.6 + rim * 0.25 + micro;
    return clamp(mask, 0.2, 1.4);
}

float dune_mask(vec2 p) {
    vec2 dir = normalize(u_DuneDir);
    float warp = (fbm4(p * 0.2 + 4.0) - 0.5) * 1.6;
    float t = dot(p, dir) * 1.8 + warp;

    float phase = fract(t);
    float rampUp = smoothstep(0.0, 0.7, phase);
    float rampDown = 1.0 - smoothstep(0.7, 1.0, phase);
    float ridge = rampUp * rampDown;
    ridge = pow(ridge, 0.7);

    float ripple = (noise(p * 6.0 + 17.0) - 0.5) * 0.08;
    float mask = 1.0 + (ridge - 0.35) * 0.6 + ripple;
    return clamp(mask, 0.6, 1.35);
}

// Canyon mask - carves drainage canyons into existing terrain
float canyon_mask(vec2 p) {
    float scaleNorm = clamp(u_TerrainScale / 4.0, 0.0, 1.0);
    float scaleFactor = mix(0.7, 1.25, scaleNorm);
    float width = mix(0.18, 0.07, scaleNorm);

    vec2 warp = vec2(fbm4(p * 0.08 + 2.0), fbm4(p * 0.08 + 8.0));
    vec2 q = p * scaleFactor + (warp - 0.5) * 3.0;

    // Create more contiguous river network by combining rivers
    float river1 = fbm4(q * 0.08);
    float river2 = fbm4(q * 0.11 + vec2(17.0, 9.0));
    
    // Use smooth minimum to create more contiguous canyons
    // This creates better connections between river branches
    float dist1 = abs(river1 - 0.5);
    float dist2 = abs(river2 - 0.52);
    
    // Smooth minimum for better connectivity
    float k = 0.15; // Smoothing factor
    float h = clamp(0.5 + 0.5 * (dist2 - dist1) / k, 0.0, 1.0);
    float dist = mix(dist2, dist1, h) - k * h * (1.0 - h);
    
    // Alternative: use max to ensure canyons connect (creates wider network)
    // float dist = min(dist1, dist2) * 0.7; // Make them connect better

    float profile = max(0.0, 1.0 - dist / width);
    profile = clamp(profile, 0.0, 1.0);

    float heightFactor = mix(0.6, 1.3, clamp(u_TerrainHeight / 5.0, 0.0, 1.0));
    float depth = u_CanyonDepth * heightFactor;
    
    // Reduce maximum depth - never go below 0.3 (30% of terrain height)
    // This leaves room for erosion to work
    float minMask = 0.3;
    float maxDepth = 1.0 - minMask; // Maximum depth is 70% of terrain
    depth = min(depth, maxDepth);
    
    float mask = 1.0 - profile * depth;
    return clamp(mask, minMask, 1.0); // Ensure mask never goes below minMask
}


// Mountains - dramatic peaks using ridged multifractal with clustered ranges
float mountains(vec2 p) {
    vec2 warp = vec2(fbm4(p * 0.25 + 10.0), fbm4(p * 0.25 + 31.0));
    vec2 q = p + (warp - 0.5) * 1.8;

    float base = ridged_mf(q * 1.0);
    float macro = fbm4(q * 0.12);
    base *= mix(0.5, 1.0, macro);
    float detail = fbm4(q * 6.0) * 0.15;
    return clamp(base + detail, 0.0, 1.2);
}

// Billowy ridges - combination of billow and ridged noise
float billowy_ridges(vec2 p) {
    float billow = billow_noise(p * 1.4);
    float ridge = ridged_mf(p * 1.1);
    float detail = fbm4(p * 6.0) * 0.1;
    return clamp(mix(billow, ridge, 0.65) + detail, 0.0, 1.3);
}

//nice one 5.3f*uv+vec2(178.f,27.f);

// 6.f*vec2(uv.x,uv.y)+vec2(121.f,41.f);
void main() {

  vec2 rdp1 = vec2(0.2,0.5);
  vec2 rdp2 = vec2(0.1,0.8);
  vec2 uv = 0.5f*fs_Pos+vec2(0.5f);

    float terrain_hight;
    float rainfall = .0f;
    
    // Check if we should use the imported height map
    if(u_UseHeightMap == 1){
        // Sample from the height map texture
        vec4 heightMapSample = texture(u_HeightMap, uv);
        terrain_hight = heightMapSample.x; // R channel contains terrain height
        // Optionally preserve water and rock from height map if they exist
        // rainfall = heightMapSample.y; // G channel for water (currently 0.0)
        // rock material = heightMapSample.z; // B channel for rock (currently 0.0)
    } else {
        // Procedural generation (original code)
        float c_mask = circle_mask(uv);
        vec2 cpos = 1.5 * uv * u_TerrainScale;
        cpos = cpos + vec2(1.f*sin(u_Time / 3.0) + 2.1,1.0 * cos(u_Time/17.0)+3.6);
        cpos += u_TerrainSeedOffset;

        float base_height = pow(fbm(cpos * 2.0) * 1.1, 3.0);
        terrain_hight = base_height;

        if(u_terrainBaseType == 2){
            terrain_hight = teR(base_height / 1.2);
        }else if(u_terrainBaseType == 1){
            terrain_hight = domainwarp(cpos * 2.0);
        }else if(u_terrainBaseType == 3){
            terrain_hight = voroni(cpos * 2.0) / 3.0;
        }else if(u_terrainBaseType == 4){
            terrain_hight = ridgenoise(pow(fbm(cpos * 1.5), 2.0));
        }else if(u_terrainBaseType == 5){
            terrain_hight = billow_noise(cpos * 1.6);
        }else if(u_terrainBaseType == 6){
            terrain_hight = turbulence(cpos * 1.5);
        }else if(u_terrainBaseType == 7){
            float crater_base = pow(fbm(cpos * 1.2), 2.2);
            float crater_density = clamp(u_CraterDensity, 0.6, 1.8);
            terrain_hight = crater_base * crater_mask(cpos * 1.1 * crater_density);
        }else if(u_terrainBaseType == 8){
            float dune_base = fbm(cpos * 0.6) * 0.35 + 0.65;
            terrain_hight = dune_base * dune_mask(cpos * 1.2);
        }else if(u_terrainBaseType == 9){
            float canyon = canyon_mask(cpos * 1.1);
            float centerDist = distance(uv, vec2(0.5));
            float centerBias = 1.0 - smoothstep(0.25, 0.6, centerDist);
            float centerPull = mix(0.25, 1.0, centerBias);
            float plateau = fbm(cpos * 0.5) * 0.6 + 0.35;
            float ridge = ridged_mf(cpos * 0.9) * 0.22;
            float carve = (1.0 - canyon) * 1.15 * centerPull;
            terrain_hight = clamp(plateau + ridge - carve, 0.0, 1.2);
        }else if(u_terrainBaseType == 10){
            terrain_hight = mountains(cpos * 1.4);
        }else if(u_terrainBaseType == 11){
            terrain_hight = billowy_ridges(cpos * 1.3);
        }

        terrain_hight *= u_TerrainHeight*120.0;
        if(u_TerrainMask == 1){
            // Sphere mask - circular gradient from center
            terrain_hight *= 2.0 * pow(c_mask, 1.0);
        }else if(u_TerrainMask == 2){
            // Slope mask - diagonal gradient
            terrain_hight *= (uv.x + uv.y) * 1.0;
        }else if(u_TerrainMask == 3){
            // Square mask - square gradient from center
            float sq_mask = square_mask(uv);
            terrain_hight *= 2.0 * pow(sq_mask, 1.0);
        }else if(u_TerrainMask == 4){
            // Ring mask - donut shape
            float ring = ring_mask(uv);
            terrain_hight *= 2.0 * ring;
        }else if(u_TerrainMask == 5){
            // Radial gradient - smooth falloff from center
            float radial = radial_gradient_mask(uv);
            terrain_hight *= 2.0 * radial;
        }else if(u_TerrainMask == 6){
            // Corner mask - highest in bottom-left corner
            float corner = corner_mask(uv);
            terrain_hight *= 2.0 * corner;
        }else if(u_TerrainMask == 7){
            // Diagonal mask - diagonal stripe pattern
            float diag = diagonal_mask(uv);
            terrain_hight *= 1.0 + diag * 0.5;
        }else if(u_TerrainMask == 8){
            // Cross mask - cross pattern from center
            float cross = cross_mask(uv);
            terrain_hight *= 1.0 + cross * 0.5;
        }else if(u_TerrainMask == 10){
            // Crater mask - adds impact basins
            float crater_density = clamp(u_CraterDensity, 0.6, 1.8);
            float crater = crater_mask(cpos * 1.1 * crater_density);
            terrain_hight *= crater;
        }else if(u_TerrainMask == 11){
            // Dune mask - adds wind-aligned ridges
            float dune = dune_mask(cpos * 1.2);
            terrain_hight *= dune;
        }
        //terrain_hight = test(uv) * 500.0;
    }

//    if(uv.x > 0.5)
//    terrain_hight = (40.0 * (uv.x - 0.5));
//    else
//    terrain_hight = 0.0;

  //if(uv.x>0.6||uv.x<0.5||uv.y>0.6||uv.y<0.5) rainfall = 0.f;
    initial = vec4(terrain_hight,rainfall,0.0,1.f);
    initial2= vec4(terrain_hight,rainfall,0.0,1.f);
}
