#version 300 es
precision highp float;

uniform sampler2D readTerrain;//water and hight map R: hight map, G: water map, B: , A:
uniform sampler2D readVelocity;
uniform sampler2D readSediment;

uniform float u_SimRes;
uniform float u_PipeLen;
uniform float u_Ks;
uniform float u_Kc;
uniform float u_Kd;
uniform float u_timestep;
uniform float u_Time;
uniform float u_RockErosionResistance;

layout (location = 0) out vec4 writeTerrain;
layout (location = 1) out vec4 writeSediment;
layout (location = 2) out vec4 writeTerrainNormal;
layout (location = 3) out vec4 writeVelocity;





in vec2 fs_Pos;

#define OCTAVES 10

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
  float amplitude = .5;
  float frequency = 0.;
  //
  // Loop of octaves
  for (int i = 0; i < OCTAVES; i++) {
    value += amplitude * noise(st);//iqnoise(st,1.f,1.f);
    st *= 2.0;
    amplitude *= .47;
  }
  return value;
}
vec3 calnor(vec2 uv){
  float eps = 1.f/u_SimRes;
//  vec4 cur = texture(readTerrain,uv);
  vec4 r = texture(readTerrain,uv+vec2(eps,0.f));
  vec4 t = texture(readTerrain,uv+vec2(0.f,eps));
  vec4 b = texture(readTerrain,uv+vec2(0.f,-eps));
  vec4 l = texture(readTerrain,uv+vec2(-eps,0.f));

//  vec4 rs = texture(readSediment,uv+vec2(eps,0.f));
//  vec4 ts = texture(readSediment,uv+vec2(0.f,eps));
//  vec4 bs = texture(readSediment,uv+vec2(0.f,-eps));
//  vec4 ls = texture(readSediment,uv+vec2(-eps,0.f));


  //vec3 nor = vec3(l.x + l.y  - r.x - r.y , 2.0, t.x + t.y - b.x - b.y );
  //vec3 nor = vec3(l.x + ls.x - r.x - rs.x, 2.0, t.x + ts.x - b.x - bs.x);
  vec3 nor = vec3(l.x - r.x , 2.0, t.x - b.x);
  nor = normalize(nor);
  return nor;
}

void main() {

  vec2 curuv = 0.5f*fs_Pos+0.5f;
  float div = 1.f/u_SimRes;
  float Kc = u_Kc;
  float Ks = u_Ks;
  float Kd = u_Kd;
  float alpha = 5.0;
  
  // Check if this is rock material (B channel > 0.5) and apply erosion resistance
  vec4 curTerrain = texture(readTerrain,curuv);
  bool isRock = curTerrain.z > 0.5;
  float rockFactor = isRock ? u_RockErosionResistance : 1.0;
  
  // Check neighboring cells for rock to boost erosion in non-rock areas between rock sections
  // This creates crevices/valleys between rock areas
  float neighborRockFactor = 1.0;
  float capacityBoost = 1.0; // Boost sediment capacity for soil between rock
  
  if (!isRock) {
    // Sample neighboring cells to see if any are rock
    vec4 topTerrain = texture(readTerrain, curuv + vec2(0.0, div));
    vec4 rightTerrain = texture(readTerrain, curuv + vec2(div, 0.0));
    vec4 bottomTerrain = texture(readTerrain, curuv + vec2(0.0, -div));
    vec4 leftTerrain = texture(readTerrain, curuv + vec2(-div, 0.0));
    
    int rockNeighbors = 0;
    
    // Check each neighbor for rock
    if (topTerrain.z > 0.5) rockNeighbors++;
    if (rightTerrain.z > 0.5) rockNeighbors++;
    if (bottomTerrain.z > 0.5) rockNeighbors++;
    if (leftTerrain.z > 0.5) rockNeighbors++;
    
    // MUCH stronger boost for soil between rock to create deep crevices
    // The more rock neighbors, the faster the soil should erode away
    if (rockNeighbors > 0) {
      // Very aggressive erosion boost - soil between rock should erode much faster
      neighborRockFactor = 1.0 + float(rockNeighbors) * 3.0; // 4x to 13x erosion rate
      // Also boost capacity significantly so more material can be picked up
      capacityBoost = 1.0 + float(rockNeighbors) * 2.0; // 3x to 9x capacity boost
    }
  }
  
  // Apply erosion resistance to rock - only reduce erosion (Ks), not capacity (Kc) or deposition (Kd)
  // Boost erosion in non-rock areas adjacent to rock to create crevices
  Ks *= rockFactor * neighborRockFactor; // Reduce for rock, boost for non-rock near rock
  Kc *= capacityBoost; // Boost capacity for soil between rock so it erodes faster

  vec3 nor = calnor(curuv);
  float slopeSin;
  slopeSin = abs(sqrt(1.0 - nor.y*nor.y));



//  vec4 topvel = texture(readVelocity,curuv+vec2(0.f,div));
//  vec4 rightvel = texture(readVelocity,curuv+vec2(div,0.f));
//  vec4 bottomvel = texture(readVelocity,curuv+vec2(0.f,-div));
//  vec4 leftvel = texture(readVelocity,curuv+vec2(-div,0.f));
  vec4 curvel = texture(readVelocity,curuv);
//
//  float sumlen = length(topvel) + length(rightvel) + length(bottomvel) + length(leftvel);
//  //velocity diffussion
//  vec4 newVel = (topvel + rightvel + bottomvel + leftvel + alpha * curvel)/(4.0 + alpha);
//
//  newVel = curvel;

  vec4 curSediment = texture(readSediment,curuv);
  // curTerrain already read above for rock check




  float velo = length(curvel.xy);
  float slopeMulti = 5.0 * pow(abs(slopeSin),4.0);
  float slope = max(0.1f, abs(slopeSin)) ;//max(0.05f,sqrt(1.f- nor.y * nor.y));
  float volC = 1.0 - exp(-curTerrain.y* (100.0));
  float sedicap = Kc*pow(slope,1.0)*pow(velo,1.0);// * pow(curTerrain.y,0.2) ;

//  float lmax = 0.0f;
//  float maxdepth = 0.8;
//  if(curTerrain.y > maxdepth){ // max river bed depth
//    lmax = 0.0f;
//  }else{
//    lmax = (max(maxdepth - curTerrain.y,0.0)/maxdepth);
//  }
//  sedicap *= (1.0 - exp(-1.0 * lmax));




  float cursedi = curSediment.x;
  float hight = curTerrain.x;
  float outsedi = curSediment.x;

  float water = curTerrain.y;
  
  // Track if erosion is happening (height decrease)
  float heightChange = 0.0;

  // Track original rock material value before erosion
  float originalRockMaterial = curTerrain.z;
  
  if(sedicap >cursedi){
    float changesedi = (sedicap -cursedi)*(Ks);
    //changesedi = min(changesedi, curTerrain.y);

      hight = hight - changesedi;
      heightChange = -changesedi; // Negative = erosion
      // water = water + (sedicap-cursedi)*Ks;
      outsedi = outsedi + changesedi;
      
      // When rock erodes, convert it to regular soil
      // Reduce rock material value proportionally to erosion amount
      if (isRock && changesedi > 0.0) {
        // Calculate how much rock should convert to soil based on erosion
        // More erosion = more rock converted to soil
        // Scale conversion rate with erosion amount - larger erosion = faster conversion
        float erosionAmount = changesedi;
        float conversionRate = min(erosionAmount * 0.1, 0.05); // Convert up to 5% per frame, scales with erosion
        originalRockMaterial = max(0.0, originalRockMaterial - conversionRate); // Reduce rock value, convert to soil
      }

  }else {
    float changesedi = (cursedi-sedicap)*Kd;
    //changesedi = min(changesedi, curTerrain.y);
    hight = hight + changesedi;
    heightChange = changesedi; // Positive = deposition
    //water = water - (cursedi-sedicap)*Kd;
    outsedi = outsedi - changesedi;
  }

  // Apply rock material spreading - rock fills in where terrain has eroded
  // Only spread when terrain has eroded down to the lowest PAINTED rock that is CONTIGUOUS
  // (directly touching/adjacent) to the neighboring terrain sections
  // IMPORTANT: Don't spread rock when water is present or flowing to prevent damming
  // Start with the eroded rock material value (rock converts to soil when it erodes)
  float finalRockMaterial = originalRockMaterial;
  float waterLevel = curTerrain.y; // Water height in this cell
  float waterVelocity = length(curvel.xy); // Water flow velocity
  
  // Check if this area is below the water surface by comparing total height (terrain + water)
  // to neighboring rock's total height
  float currentTotalHeight = hight + waterLevel; // Current terrain + water height
  
  // Only spread rock if:
  // 1. There's little or no water (water < 0.1) AND
  // 2. Water is not actively flowing (velocity < 0.5) AND
  // 3. Erosion is happening
  // This prevents rock from creating barriers that dam up water
  bool canSpreadRock = waterLevel < 0.1 && waterVelocity < 0.5;
  
  if (!isRock && heightChange < 0.0 && canSpreadRock) { // Only if erosion is happening AND water conditions allow
    // Sample neighboring cells for rock (these are the contiguous/adjacent cells)
    // Use the ORIGINAL terrain height (before this frame's erosion) to find the painted rock edge
    vec4 topTerrain = texture(readTerrain, curuv + vec2(0.0, div));
    vec4 rightTerrain = texture(readTerrain, curuv + vec2(div, 0.0));
    vec4 bottomTerrain = texture(readTerrain, curuv + vec2(0.0, -div));
    vec4 leftTerrain = texture(readTerrain, curuv + vec2(-div, 0.0));
    
    float lowestContiguousRockHeight = 999999.0; // Find the lowest contiguous painted rock edge
    float bestRockValue = 0.0;
    int contiguousRockCount = 0;
    
    // Find the lowest PAINTED edge of rock that is CONTIGUOUS (directly adjacent/touching)
    // to this terrain cell. Use the ORIGINAL height (curTerrain.x) of rock neighbors,
    // not the current height after erosion, to find where rock was originally painted.
    if (topTerrain.z > 0.5) {
      // This rock neighbor is contiguous - it's directly touching this cell
      // Use the rock's original height to find the painted edge
      if (topTerrain.x < lowestContiguousRockHeight) {
        lowestContiguousRockHeight = topTerrain.x;
        bestRockValue = topTerrain.z;
      }
      contiguousRockCount++;
    }
    if (rightTerrain.z > 0.5) {
      if (rightTerrain.x < lowestContiguousRockHeight) {
        lowestContiguousRockHeight = rightTerrain.x;
        bestRockValue = rightTerrain.z;
      }
      contiguousRockCount++;
    }
    if (bottomTerrain.z > 0.5) {
      if (bottomTerrain.x < lowestContiguousRockHeight) {
        lowestContiguousRockHeight = bottomTerrain.x;
        bestRockValue = bottomTerrain.z;
      }
      contiguousRockCount++;
    }
    if (leftTerrain.z > 0.5) {
      if (leftTerrain.x < lowestContiguousRockHeight) {
        lowestContiguousRockHeight = leftTerrain.x;
        bestRockValue = leftTerrain.z;
      }
      contiguousRockCount++;
    }
    
    // Only spread if:
    // 1. There are contiguous rock neighbors (rock sections directly touching this terrain)
    // 2. Current cell's ORIGINAL height (before erosion) was above the rock, and
    //    has now eroded significantly below the lowest CONTIGUOUS painted rock edge
    //    Compare original terrain height to rock height to see if it was originally above
    float originalTerrainHeight = curTerrain.x; // Original height before this frame's erosion
    
    // Only spread if original terrain was above rock and has eroded well below it
    if (contiguousRockCount > 0 && originalTerrainHeight > lowestContiguousRockHeight) {
      // Calculate how far the CURRENT height is below the lowest contiguous painted edge
      float depthBelowContiguousEdge = lowestContiguousRockHeight - hight;
      
      // Check if this area is below the water surface by comparing total height (terrain + water)
      // to neighboring rock's total height - if water would need to flow through here, don't spread rock
      float lowestRockTotalHeight = 999999.0;
      if (topTerrain.z > 0.5) {
        float rockTotalHeight = topTerrain.x + topTerrain.y; // Rock terrain + water
        if (rockTotalHeight < lowestRockTotalHeight) lowestRockTotalHeight = rockTotalHeight;
      }
      if (rightTerrain.z > 0.5) {
        float rockTotalHeight = rightTerrain.x + rightTerrain.y;
        if (rockTotalHeight < lowestRockTotalHeight) lowestRockTotalHeight = rockTotalHeight;
      }
      if (bottomTerrain.z > 0.5) {
        float rockTotalHeight = bottomTerrain.x + bottomTerrain.y;
        if (rockTotalHeight < lowestRockTotalHeight) lowestRockTotalHeight = rockTotalHeight;
      }
      if (leftTerrain.z > 0.5) {
        float rockTotalHeight = leftTerrain.x + leftTerrain.y;
        if (rockTotalHeight < lowestRockTotalHeight) lowestRockTotalHeight = rockTotalHeight;
      }
      
      // Don't spread rock if current area's total height (terrain + water) is below or near
      // the water surface level of neighboring rock - this would block water flow
      bool isBelowWaterSurface = currentTotalHeight < lowestRockTotalHeight + 0.3;
      
      // Only spread if we're significantly below the painted edge (at least 0.2 units)
      // AND not below the water surface (to allow water to flow through)
      if (depthBelowContiguousEdge >= 0.2 && !isBelowWaterSurface) {
        // Spread amount based on depth below contiguous painted edge and erosion rate
        float erosionAmount = abs(heightChange);
        
        // Very gradual spreading - scales with depth below the contiguous painted edge
        // Only count depth beyond the 0.2 threshold
        float effectiveDepth = depthBelowContiguousEdge - 0.2;
        float depthFactor = clamp(effectiveDepth * 2.0, 0.0, 1.0);
        float spreadFactor = min(erosionAmount * 0.5 * (1.0 + depthFactor * 0.2), 0.01); // Max 1% per frame, very slow
        
        // Use max to ensure rock value increases (doesn't decrease if already partially rock)
        finalRockMaterial = max(curTerrain.z, mix(curTerrain.z, 1.0, spreadFactor));
      }
    }
  }
  
  writeTerrainNormal = vec4(vec3(abs(slopeSin)),1.f);
  writeSediment = vec4(outsedi,0.0f,0.0f,1.0f);
  writeTerrain = vec4(hight,curTerrain.y,finalRockMaterial,curTerrain.w);
  writeVelocity = curvel;
}