/**
 * Base class for compute shader passes.
 * Handles compute pipeline creation, workgroup dispatch, and resource binding.
 */
export class ComputePass {
    protected device: GPUDevice;
    protected computePipeline: GPUComputePipeline | null = null;
    protected bindGroup: GPUBindGroup | null = null;

    constructor(device: GPUDevice) {
        this.device = device;
    }

    getDevice(): GPUDevice {
        return this.device;
    }

    /**
     * Create a compute pipeline from WGSL shader code.
     * @param shaderCode WGSL source
     * @param entryPoint Entry point function name
     * @param bindGroupLayout Optional explicit bind group layout. If provided, the pipeline
     *   will use this layout instead of 'auto'. Required to match bind groups created with
     *   the same layout object.
     */
    protected createComputePipeline(
        shaderCode: string,
        entryPoint: string = 'main',
        bindGroupLayout?: GPUBindGroupLayout
    ): GPUComputePipeline {
        const shaderModule = this.device.createShaderModule({
            code: shaderCode,
        });

        // Check for WGSL compile errors asynchronously
        shaderModule.getCompilationInfo().then((info) => {
            for (const msg of info.messages) {
                const prefix = `[WGSL ${msg.type}]`;
                const loc = msg.lineNum > 0 ? ` (line ${msg.lineNum}:${msg.linePos})` : '';
                if (msg.type === 'error') {
                    console.error(`${prefix}${loc} ${msg.message}`);
                } else {
                    console.warn(`${prefix}${loc} ${msg.message}`);
                }
            }
        });

        const layout = bindGroupLayout
            ? this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] })
            : 'auto';

        return this.device.createComputePipeline({
            layout,
            compute: {
                module: shaderModule,
                entryPoint: entryPoint,
            },
        });
    }

    /**
     * Create a bind group for textures and uniforms.
     */
    protected createBindGroup(
        layout: GPUBindGroupLayout,
        resources: GPUBindGroupEntry[]
    ): GPUBindGroup {
        return this.device.createBindGroup({
            layout: layout,
            entries: resources,
        });
    }

    /**
     * Create a bind group layout for compute shader bindings.
     */
    protected createBindGroupLayout(entries: GPUBindGroupLayoutEntry[]): GPUBindGroupLayout {
        return this.device.createBindGroupLayout({
            entries: entries,
        });
    }

    /**
     * Dispatch compute workgroups.
     * @param workgroupCountX - Number of workgroups in X dimension
     * @param workgroupCountY - Number of workgroups in Y dimension
     * @param workgroupCountZ - Number of workgroups in Z dimension (default: 1)
     */
    protected dispatch(
        encoder: GPUComputePassEncoder,
        workgroupCountX: number,
        workgroupCountY: number,
        workgroupCountZ: number = 1
    ): void {
        if (!this.computePipeline) {
            throw new Error('Compute pipeline not initialized. Call createPipeline() first.');
        }

        encoder.setPipeline(this.computePipeline);
        if (this.bindGroup) {
            encoder.setBindGroup(0, this.bindGroup);
        }
        encoder.dispatchWorkgroups(workgroupCountX, workgroupCountY, workgroupCountZ);
    }

    /**
     * Calculate workgroup count for a 2D texture.
     * @param textureSize - Size of the texture (width/height, assumed square)
     * @param workgroupSize - Size of each workgroup (default: 8x8)
     * @returns [workgroupCountX, workgroupCountY]
     */
    protected calculateWorkgroupCount2D(
        textureSize: number,
        workgroupSize: number = 8
    ): [number, number] {
        const workgroupCountX = Math.ceil(textureSize / workgroupSize);
        const workgroupCountY = Math.ceil(textureSize / workgroupSize);
        return [workgroupCountX, workgroupCountY];
    }

    /**
     * Dispose of resources.
     */
    dispose(): void {
        this.computePipeline = null;
        this.bindGroup = null;
    }
}
