import { DirectionalLight, AmbientLight, Scene, MathUtils, VSMShadowMap, WebGPURenderer, Vector3 } from 'three';

/**
 * Manages scene lighting for PBR materials (terrain uses MeshStandardNodeMaterial).
 *
 * Encapsulates DirectionalLight (sun) + AmbientLight (sky fill) and provides
 * a typed API for per-frame updates driven by GUI controls.
 *
 * Shadow mapping uses VSMShadowMap (Variance Shadow Maps) with gaussian
 * blur for soft shadows. Texel-grid snapping prevents shadow swimming
 * when the light direction changes.
 *
 * Sun color shifts warm-orange at low elevation angles (sunset/sunrise) and
 * stays slightly warm-white at high elevation (noon).
 */
export class SceneLighting {
    readonly directionalLight: DirectionalLight;
    readonly ambientLight: AmbientLight;

    /** GUI-controlled multiplier on auto-computed sun intensity. */
    sunIntensityMultiplier: number = 1.0;
    /** GUI-controlled multiplier on ambient light intensity. */
    ambientIntensityMultiplier: number = 1.0;

    /** Place light far enough for good shadow depth precision. */
    private static readonly LIGHT_DISTANCE = 2.0;

    /** Pre-allocated for zero-alloc shadow stabilization. */
    private readonly _shadowOrigin = new Vector3();

    /** When false, no shadow pass — use for perf testing (often +50–80 FPS). */
    private _shadowsEnabled: boolean;
    private _renderer: WebGPURenderer | undefined;

    constructor(scene: Scene, renderer?: WebGPURenderer, options?: { shadowsEnabled?: boolean }) {
        this._renderer = renderer;
        this._shadowsEnabled = options?.shadowsEnabled !== false;
        this.directionalLight = new DirectionalLight(0xffffff, 2.5);
        this.directionalLight.position.set(0.4, 0.8, 0.0);

        this.directionalLight.castShadow = this._shadowsEnabled;
        if (this._shadowsEnabled) {
            this.directionalLight.shadow.mapSize.set(4096, 4096);
            this.directionalLight.shadow.bias = -0.0001;
            this.directionalLight.shadow.normalBias = 0.01;
            this.directionalLight.shadow.radius = 8;
            (this.directionalLight.shadow as any).blurSamples = 25;
            const cam = this.directionalLight.shadow.camera;
            cam.left = -0.8;
            cam.right = 0.8;
            cam.top = 0.8;
            cam.bottom = -0.8;
            cam.near = 0.01;
            cam.far = 3.0;
        }

        this.directionalLight.target.position.set(0, 0, 0);
        scene.add(this.directionalLight.target);

        this.ambientLight = new AmbientLight(0xffffff, 1.0);

        scene.add(this.directionalLight);
        scene.add(this.ambientLight);

        if (renderer) {
            renderer.shadowMap.enabled = this._shadowsEnabled;
            if (this._shadowsEnabled) renderer.shadowMap.type = VSMShadowMap;
        }
    }

    setShadowsEnabled(enabled: boolean): void {
        if (this._shadowsEnabled === enabled) return;
        this._shadowsEnabled = enabled;
        this.directionalLight.castShadow = enabled;
        if (this._renderer) {
            this._renderer.shadowMap.enabled = enabled;
            if (enabled) this._renderer.shadowMap.type = VSMShadowMap;
        }
    }

    /**
     * Update light position and derived sun color/intensity each frame.
     * Call from the render loop with the current GUI light-direction values.
     */
    update(lightX: number, lightY: number, lightZ: number): void {
        // Normalize direction and place light at a fixed distance
        // for better shadow depth precision (avoids near-plane clipping artifacts).
        const mag = Math.sqrt(lightX * lightX + lightY * lightY + lightZ * lightZ) || 1;
        const nx = lightX / mag;
        const ny = lightY / mag;
        const nz = lightZ / mag;

        this.directionalLight.position.set(
            nx * SceneLighting.LIGHT_DISTANCE,
            ny * SceneLighting.LIGHT_DISTANCE,
            nz * SceneLighting.LIGHT_DISTANCE,
        );

        if (this._shadowsEnabled) this.stabilizeShadowCamera();

        // Elevation: Y component of normalised direction (0 = horizon, 1 = zenith)
        const elevation = Math.max(ny, 0);

        // Noon (elevation ~1): warm white (1.0, 0.97, 0.92)
        // Sunset (elevation ~0): deep orange (1.0, 0.45, 0.15)
        const t = MathUtils.smoothstep(elevation, 0.0, 0.6);
        this.directionalLight.color.setRGB(
            1.0,
            MathUtils.lerp(0.45, 0.97, t),
            MathUtils.lerp(0.15, 0.92, t),
        );
        // Intensity: compensate for PBR 1/π diffuse factor (~3× manual Lambert)
        this.directionalLight.intensity = MathUtils.lerp(1.2, 2.5, t) * this.sunIntensityMultiplier;

        // Ambient fills shadows — outdoor sky fill is substantial (~30-40% of sun)
        // Noon: cool blue-grey sky; Sunset: warm orange-pink fill
        this.ambientLight.intensity = 1.0 * this.ambientIntensityMultiplier;
        this.ambientLight.color.setRGB(
            MathUtils.lerp(0.45, 0.35, t),
            MathUtils.lerp(0.30, 0.38, t),
            MathUtils.lerp(0.20, 0.48, t),
        );
    }

    /**
     * Snap shadow camera to whole-texel boundaries so the shadow map
     * doesn't swim when the light direction changes slightly.
     *
     * Algorithm:
     * 1. Place shadow camera at light position, looking at target.
     * 2. Project scene centre into shadow-view space.
     * 3. Compute sub-texel remainder.
     * 4. Offset light position along camera's local axes to cancel it.
     */
    private stabilizeShadowCamera(): void {
        const light = this.directionalLight;
        const shadow = light.shadow;
        const cam = shadow.camera;

        // Mimic Three.js shadow setup: position cam at light, look at target
        cam.position.copy(light.position);
        cam.lookAt(light.target.position);
        cam.updateMatrixWorld(true);
        cam.updateProjectionMatrix();

        // World-space size of one shadow texel
        const frustumWidth = cam.right - cam.left;
        const frustumHeight = cam.top - cam.bottom;
        const texelW = frustumWidth / shadow.mapSize.x;
        const texelH = frustumHeight / shadow.mapSize.y;

        // Transform scene centre (origin) into shadow-view space
        const originInView = this._shadowOrigin.set(0, 0, 0).applyMatrix4(cam.matrixWorldInverse);

        // Sub-texel remainder: how far the origin is from the nearest texel grid line
        const snappedX = Math.floor(originInView.x / texelW) * texelW;
        const snappedY = Math.floor(originInView.y / texelH) * texelH;
        const shiftX = snappedX - originInView.x;
        const shiftY = snappedY - originInView.y;

        // Convert view-space offset back to world space using camera's local axes
        // matrixWorld columns: [0..2]=localX, [4..6]=localY, [8..10]=localZ
        const m = cam.matrixWorld.elements;
        light.position.x -= m[0] * shiftX + m[4] * shiftY;
        light.position.y -= m[1] * shiftX + m[5] * shiftY;
        light.position.z -= m[2] * shiftX + m[6] * shiftY;
    }
}
