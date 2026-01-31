# Fix Plan: Brushes & Raycasting

## Problem

Brushes do nothing when clicking on terrain. The brush overlay circle may display, but clicking with any brush type (terrain, water, rock, smooth, flatten, slope) has zero effect on the simulation.

BVH raycasting is inaccurate — the brush position doesn't match where the user clicks.

## Root Cause Analysis

### Bug 1: WGSL Uniform Buffer Alignment Mismatch (CRITICAL)

The rain compute shader (`RAIN_COMPUTE_SHADER` in `ComputeNodePipeline.ts`) declares a WGSL struct with `vec4<f32>`, `vec3<f32>`, and `vec2<f32>` members that require specific alignment:

| Type | WGSL Alignment |
|------|---------------|
| `f32` / `i32` | 4 bytes |
| `vec2<f32>` | 8 bytes |
| `vec3<f32>` | 16 bytes |
| `vec4<f32>` | 16 bytes |

The CPU-side packing uses a plain `Float32Array` with no padding, causing every field after `u_SimRes` to be at the wrong byte offset. The GPU reads garbage for brush position, brush type, and every other uniform.

**WGSL struct layout (what the GPU expects):**
```
offset  0: u_Time (f32)
offset  4: raindeg (f32)
offset  8: u_SimRes (f32)
offset 12: [4 bytes padding — vec4 requires 16-byte alignment]
offset 16: u_MouseWorldPos (vec4<f32>, 16 bytes)
offset 32: u_MouseWorldDir (vec3<f32>, 12 bytes)
offset 44: u_BrushSize (f32)
offset 48: u_BrushStrength (f32)
offset 52: u_BrushType (i32)
offset 56: u_BrushPressed (i32)
offset 60: [4 bytes padding — vec2 requires 8-byte alignment]
offset 64: u_BrushPos (vec2<f32>, 8 bytes)
offset 72: u_BrushOperation (i32)
offset 76: u_RainErosion (i32)
offset 80: u_RainErosionStrength (f32)
offset 84: u_RainErosionDropSize (f32)
offset 88: u_FlattenTargetHeight (f32)
offset 92: [4 bytes padding — vec2 requires 8-byte alignment]
offset 96: u_SlopeStartPos (vec2<f32>, 8 bytes)
offset104: u_SlopeEndPos (vec2<f32>, 8 bytes)
offset112: u_SlopeActive (i32)
offset116: u_SourceCount (i32)
offset120: _padding (f32)
offset124: [4 bytes — struct padded to 128 = multiple of 16]
Total: 128 bytes
```

**CPU-side packing (what we actually write):**
```
byte  0: time           → GPU reads as u_Time ✓
byte  4: rainDegree     → GPU reads as raindeg ✓
byte  8: simRes         → GPU reads as u_SimRes ✓
byte 12: mouseWorldPos[0] → GPU expects PADDING here ✗
byte 16: mouseWorldPos[1] → GPU reads as mouseWorldPos.x (WRONG — it's Y!) ✗
... everything shifted by 4 bytes from here ...
```

Every field after `u_SimRes` is at the wrong offset on the GPU.

### Bug 2: i32 Fields Written as Float (CRITICAL)

Six fields in the WGSL struct are `i32`:
- `u_BrushType`
- `u_BrushPressed`
- `u_BrushOperation`
- `u_RainErosion`
- `u_SlopeActive`
- `u_SourceCount`

These are written into a `Float32Array`, which stores them as IEEE 754 floats. When the GPU reads the raw bytes as `i32`:
- JavaScript `1` → Float32Array stores `1.0` → bytes `0x3F800000` → GPU reads i32 `1065353216`
- The WGSL check `u_BrushPressed == 1` evaluates to `1065353216 == 1` → **false**

This means the entire brush block in the compute shader is NEVER entered:
```wgsl
if (uniforms.u_BrushType != 0 && uniforms.u_BrushPressed == 1) {
    // This NEVER executes because u_BrushPressed == 1 is always false
}
```

### Why Other Passes Work Fine

The other simulation passes (flow, waterHeight, sediment, etc.) only use `f32` scalars in their uniform structs — no `vec2/3/4`, no `i32`. Their `Float32Array` packing happens to be correct because all members are 4-byte aligned with no padding gaps.

### BVH Raycast Accuracy

The BVH mesh uses `raycastMeshResolution` (default 256) vertices while the heightmap may be 512 or 1024. This lower resolution means the BVH is an approximation. The existing code already falls back to heightmap raycast when BVH error exceeds 0.02 UV units. This is acceptable — BVH provides fast hit/miss testing and the heightmap raycast provides precision.

## Fix

### Step 1: Fix Rain Pass Uniform Buffer Packing

Replace the `Float32Array` packing in `rainPass()` with `ArrayBuffer` + `DataView`:

```typescript
const RAIN_UNIFORM_BYTE_SIZE = 128;
const buf = new ArrayBuffer(RAIN_UNIFORM_BYTE_SIZE);
const view = new DataView(buf);
const LE = true;

// f32 fields
view.setFloat32(0, uniforms.time, LE);
view.setFloat32(4, uniforms.rainDegree, LE);
view.setFloat32(8, uniforms.simRes, LE);
// byte 12: padding for vec4 alignment

// vec4
view.setFloat32(16, uniforms.mouseWorldPos[0], LE);
view.setFloat32(20, uniforms.mouseWorldPos[1], LE);
view.setFloat32(24, uniforms.mouseWorldPos[2], LE);
view.setFloat32(28, uniforms.mouseWorldPos[3], LE);

// vec3
view.setFloat32(32, uniforms.mouseWorldDir[0], LE);
view.setFloat32(36, uniforms.mouseWorldDir[1], LE);
view.setFloat32(40, uniforms.mouseWorldDir[2], LE);

// f32
view.setFloat32(44, uniforms.brushSize, LE);
view.setFloat32(48, uniforms.brushStrength, LE);

// i32 fields — MUST use setInt32, not setFloat32
view.setInt32(52, uniforms.brushType, LE);
view.setInt32(56, uniforms.brushPressed, LE);

// byte 60: padding for vec2 alignment
// vec2
view.setFloat32(64, uniforms.brushPos[0], LE);
view.setFloat32(68, uniforms.brushPos[1], LE);

// i32
view.setInt32(72, uniforms.brushOperation, LE);
view.setInt32(76, uniforms.rainErosion, LE);

// f32
view.setFloat32(80, uniforms.rainErosionStrength, LE);
view.setFloat32(84, uniforms.rainErosionDropSize, LE);
view.setFloat32(88, uniforms.flattenTargetHeight, LE);

// byte 92: padding for vec2 alignment
// vec2
view.setFloat32(96, uniforms.slopeStartPos[0], LE);
view.setFloat32(100, uniforms.slopeStartPos[1], LE);
view.setFloat32(104, uniforms.slopeEndPos[0], LE);
view.setFloat32(108, uniforms.slopeEndPos[1], LE);

// i32
view.setInt32(112, uniforms.slopeActive, LE);
view.setInt32(116, uniforms.sourceCount, LE);

// padding
view.setFloat32(120, 0.0, LE);
```

### Step 2: Verify Brush Overlay

The brush overlay circle in `TerrainMaterialNode` uses separate TSL uniforms (not the compute shader), so it should already work independently. Verify it tracks the cursor correctly after the fix.

### Step 3: Test All 6 Brush Types

1. Terrain (type 1) — raise/lower terrain
2. Water (type 2) — add/remove water
3. Rock (type 3) — paint/erase rock material
4. Smooth (type 4) — smooth terrain
5. Flatten (type 5) — flatten to target height
6. Slope (type 6) — create slope between two points

## Files to Modify

| File | Change |
|------|--------|
| `src/rendering/webgpu/compute/ComputeNodePipeline.ts` | Replace Float32Array packing in `rainPass()` with DataView + correct alignment |

## Verification

- TypeScript compiles: `npx tsc --noEmit --skipLibCheck`
- Visual: Click terrain with terrain brush → terrain should raise/lower
- Visual: Click terrain with water brush → water should appear
- Visual: Brush overlay circle should track cursor position accurately
