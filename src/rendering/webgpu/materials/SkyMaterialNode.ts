import { Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { clamp, dot, float, max, mix, normalize, positionLocal, pow, uniform, vec3 } from 'three/tsl';

/**
 * Sky material using Three.js NodeMaterial (TSL).
 * Renders a gradient sky with a sun disc. Applied to a large inverted sphere.
 * Sun position is driven by the same lightDir controls as terrain/water.
 */
export class SkyMaterialNode extends MeshBasicNodeMaterial {
    private lightDirUniform: any;

    constructor(lightDir?: [number, number, number]) {
        super();
        this.lightDirUniform = uniform(new Vector3(
            lightDir?.[0] ?? 0.4,
            lightDir?.[1] ?? 0.8,
            lightDir?.[2] ?? 0.0
        ));

        this.side = 1; // BackSide — render inside of sphere
        this.depthWrite = false;

        this.buildGraph();
    }

    updateUniforms(params: { lightDir?: [number, number, number] }): void {
        if (params.lightDir !== undefined) {
            this.lightDirUniform.value.set(params.lightDir[0], params.lightDir[1], params.lightDir[2]);
        }
    }

    private buildGraph(): void {
        // Normalized direction from center of sphere to vertex (view ray)
        const rd = normalize(positionLocal);
        const rdY = clamp(rd.y, -0.1, 1);

        // Sky gradient: horizon haze → blue zenith
        const horizonColor = vec3(0.7, 0.75, 0.8);   // pale blue-gray at horizon
        const zenithColor = vec3(0.25, 0.45, 0.85);   // deeper blue at top
        const belowColor = vec3(0.35, 0.38, 0.42);    // dark gray below horizon
        // Use smoothstep-like ramp for smooth horizon transition
        const skyT = clamp(rdY.mul(2.0), 0, 1);
        const groundT = clamp(rdY.negate().mul(5.0), 0, 1);
        const skyGradient = mix(horizonColor, zenithColor, pow(skyT, float(0.7)));
        const skyColor = mix(skyGradient, belowColor, groundT);

        // Sun disc
        const sunDir = normalize(this.lightDirUniform);
        const sunDot = max(dot(rd, sunDir), float(0));
        // Sharp sun disc with soft corona
        const sunDisc = pow(sunDot, float(800));      // tight bright center
        const sunCorona = pow(sunDot, float(32)).mul(0.3); // soft glow around sun
        const sunColor = vec3(1.0, 0.95, 0.8);        // warm white
        const coronaColor = vec3(1.0, 0.85, 0.6);     // warm orange glow

        const finalColor = skyColor
            .add(sunColor.mul(sunDisc))
            .add(coronaColor.mul(sunCorona));

        this.colorNode = finalColor;
    }
}
