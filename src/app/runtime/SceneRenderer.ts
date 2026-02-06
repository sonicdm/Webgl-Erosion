import type { vec2 } from 'gl-matrix';
import type { Scene, Mesh } from 'three';
import { Fog, Color } from 'three';
import { PostProcessing } from 'three/webgpu';
import { pass, uniform, luminance, smoothstep } from 'three/tsl';
import { gaussianBlur } from 'three/examples/jsm/tsl/display/GaussianBlurNode.js';
import type Camera from '../../Camera';
import type { IAppControls } from '../controls/types';
import type { WebGPURendererWrapper } from '../../rendering/webgpu/WebGPURendererWrapper';
import type { WebGPUTexturePool } from '../../simulation/WebGPUTexturePool';
import type { SceneLighting } from '../../rendering/webgpu/SceneLighting';
import type { SkyMaterialNode } from '../../rendering/webgpu/materials/SkyMaterialNode';
import type { TerrainMaterialNode } from '../../rendering/webgpu/materials/TerrainMaterialNode';
import type { WaterMaterialNode } from '../../rendering/webgpu/materials/WaterMaterialNode';
import type { LavaMaterialNode } from '../../rendering/webgpu/materials/LavaMaterialNode';
import type { PoolSyncTextures } from '../../utils/webgpu-pool-to-three-texture-copy';
import { copyPoolToThreeTextures } from '../../utils/webgpu-pool-to-three-texture-copy';
import { waterSources } from '../../utils/water-sources';
import { lavaSources } from '../../utils/lava-sources';

export interface SceneRendererDeps {
    getTerrainMesh: () => Mesh | null;
    getWaterMesh: () => Mesh | null;
    getLavaMesh: () => Mesh | null;
    getSkyMaterial: () => SkyMaterialNode | null;
    getSceneLighting: () => SceneLighting | null;
    getPoolSyncTextures: () => PoolSyncTextures | null;
    getTexturePool: () => WebGPUTexturePool | null;
    getSimres: () => number;
}

export interface RenderParams {
    camera: Camera;
    controls: IAppControls;
    brushPos: vec2;
    timer: number;
}

/**
 * Per-frame rendering: texture sync, shader compilation, material uniform updates, render.
 */
export class SceneRenderer {
    private sceneCompileStarted = false;
    private sceneCompileDone = false;
    private postProcessing: PostProcessing | null = null;
    private _thresholdUniform: any = null;
    private _strengthUniform: any = null;
    private fog: Fog | null = null;
    private postProcessingNeedsRebuild = true;
    private _lastWidth = 0;
    private _lastHeight = 0;

    constructor(
        private rendererWrapper: WebGPURendererWrapper,
        private scene: Scene,
        private deps: SceneRendererDeps,
    ) {}

    /** Reset after resolution change recreates materials. */
    resetCompilationState(): void {
        this.sceneCompileStarted = false;
        this.sceneCompileDone = false;
        this.postProcessingNeedsRebuild = true;
        this.postProcessing = null;
        this._thresholdUniform = null;
        this._strengthUniform = null;
    }

    private initPostProcessing(camera: any): void {
        const renderer = this.rendererWrapper.getRenderer();
        if (!renderer) return;
        const scenePass = pass(this.scene, camera);
        scenePass.setMRT(null);
        const scenePassColor = scenePass.getTextureNode('output');

        // Soft threshold: extract pixels brighter than threshold
        this._thresholdUniform = uniform(0.85);
        this._strengthUniform = uniform(0.35);
        const lum = luminance(scenePassColor.rgb);
        const brightMask = smoothstep(this._thresholdUniform, this._thresholdUniform.add(0.1), lum);
        const bright = scenePassColor.mul(brightMask);

        // Single separable gaussian blur at half resolution (2 passes vs BloomNode's 12+)
        const blurred = gaussianBlur(bright, null, 3);
        (blurred as any).resolution.set(0.5, 0.5);

        // Additive composite: scene + blurred brights * strength
        this.postProcessing = new PostProcessing(renderer as any);
        (this.postProcessing as any).outputNode = scenePassColor.add(
            blurred.mul(this._strengthUniform),
        );
        this.postProcessingNeedsRebuild = false;
    }

    render(params: RenderParams): void {
        const { camera, controls, brushPos, timer } = params;
        const texturePool = this.deps.getTexturePool();
        const poolSync = this.deps.getPoolSyncTextures();
        if (!texturePool || !poolSync) return;

        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w !== this._lastWidth || h !== this._lastHeight) {
            this._lastWidth = w;
            this._lastHeight = h;
            this.rendererWrapper.setSize(w, h);
        }
        const rendererThree = this.rendererWrapper.getRenderer() as any;
        const backend = rendererThree?.backend;

        // Async shader compilation — skip rendering until done
        if (!this.sceneCompileStarted) {
            this.sceneCompileStarted = true;
            const compileStart = performance.now();
            const loadingText = document.getElementById('loading-text');
            if (loadingText) loadingText.textContent = 'Compiling shaders...';
            rendererThree?.compileAsync?.(this.scene, camera.threeCamera)?.then?.(() => {
                this.sceneCompileDone = true;
                console.log(`[Init Timing] compileAsync: ${(performance.now() - compileStart).toFixed(0)}ms`);
                requestAnimationFrame(() => {
                    const overlay = document.getElementById('terrain-loading-overlay');
                    if (overlay) overlay.classList.remove('visible');
                });
            })?.catch?.(() => {
                this.sceneCompileDone = true;
                const overlay = document.getElementById('terrain-loading-overlay');
                if (overlay) overlay.classList.remove('visible');
            });
        }

        // Copy pool textures once compilation is done
        if (this.sceneCompileDone && backend?.device) {
            copyPoolToThreeTextures(backend, texturePool, poolSync, this.deps.getSimres());
        }

        if (!this.sceneCompileDone) return;

        // --- Material uniform updates ---
        const terrainMesh = this.deps.getTerrainMesh();
        if (terrainMesh?.material) {
            const terrainMat = terrainMesh.material as unknown as TerrainMaterialNode;
            const brushPosValid = brushPos[0] >= 0 && brushPos[0] <= 1 && brushPos[1] >= 0 && brushPos[1] <= 1;
            terrainMat.updateBrush(
                [brushPos[0], brushPos[1]],
                brushPosValid ? controls.brushSize : 0,
                controls.brushType,
            );
            terrainMat.updateUniforms({
                terrainPalette: controls.TerrainPlatte,
                maxHeight: (controls?.TerrainHeight ?? 2) * 120,
                debugMode: controls.TerrainDebug,
                showFlowTrace: controls.ShowFlowTrace,
                showSedimentTrace: controls.SedimentTrace,
                grassLine: controls.GrassLine,
                rockLine: controls.RockLine,
                snowLine: controls.SnowLine,
                slopeRockAmount: controls.SlopeRockAmount,
                detailIntensity: controls.terrainDetailIntensity,
                detailNormalStrength: controls.terrainDetailNormalStrength,
                detailRoughnessVar: controls.terrainDetailRoughnessVar,
                detailScale: controls.terrainDetailScale,
            });
            terrainMat.updateSources(waterSources.map(s => ({
                position: [s.position[0], s.position[1]] as [number, number],
                size: s.size,
            })));
            terrainMat.updateLavaSources(lavaSources.map(s => ({
                position: [s.position[0], s.position[1]] as [number, number],
                size: s.size,
            })));
        }

        // Scene lighting
        this.deps.getSceneLighting()?.update(
            controls.lightPosX ?? 0.4,
            controls.lightPosY ?? 0.8,
            controls.lightPosZ ?? 0.0,
        );

        // Water
        const waterMesh = this.deps.getWaterMesh();
        if (waterMesh?.material) {
            const waterMat = waterMesh.material as unknown as WaterMaterialNode;
            waterMat.updateUniforms({
                waterTransparency: controls.WaterTransparency,
                lightDir: [controls.lightPosX ?? 0.4, controls.lightPosY ?? 0.8, controls.lightPosZ ?? 0.0],
            });
        }

        // Lava
        const lavaMesh = this.deps.getLavaMesh();
        if (lavaMesh?.material) {
            const lavaMat = lavaMesh.material as unknown as LavaMaterialNode;
            lavaMat.updateUniforms({
                lightDir: [controls.lightPosX ?? 0.4, controls.lightPosY ?? 0.8, controls.lightPosZ ?? 0.0],
                orangeTemp: (controls.lavaOrangeTemp ?? 540) / 1200,
                yellowTemp: (controls.lavaYellowTemp ?? 780) / 1200,
                emissiveStrength: controls.lavaEmissiveStrength ?? 0.35,
                time: timer,
                debugMode: controls.TerrainDebug,
            });
            const brushPosValid = brushPos[0] >= 0 && brushPos[0] <= 1 && brushPos[1] >= 0 && brushPos[1] <= 1;
            lavaMat.updateBrush(
                [brushPos[0], brushPos[1]],
                brushPosValid ? controls.brushSize : 0,
                controls.brushType,
            );
        }

        // Sky
        const skyMat = this.deps.getSkyMaterial();
        if (skyMat) {
            skyMat.updateUniforms({
                lightDir: [controls.lightPosX ?? 0.4, controls.lightPosY ?? 0.8, controls.lightPosZ ?? 0.0],
            });
        }

        // --- Render (appearance controls disabled for perf test) ---
        this.rendererWrapper.render(this.scene, camera.threeCamera);
    }
}
