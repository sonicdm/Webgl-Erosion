/**
 * Enum for different loading phases
 */
export enum LoadPhase {
    DECODE = 'DECODE',
    GPU_UPLOAD = 'GPU_UPLOAD',
    READBACK = 'READBACK',
    GEOMETRY = 'GEOMETRY',
    BVH = 'BVH'
}

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: number, phase: LoadPhase | null) => void;

/**
 * Tracks loading progress across multiple phases.
 * Each phase can have sub-progress (0.0 to 1.0).
 */
export class LoadProgressTracker {
    private callback: ProgressCallback;
    private currentPhase: LoadPhase | null = null;
    private subPhaseProgress: number = 0.0;
    
    // Phase weights (how much of total progress each phase represents)
    private readonly phaseWeights: Record<LoadPhase, number> = {
        [LoadPhase.DECODE]: 0.1,      // 10%
        [LoadPhase.GPU_UPLOAD]: 0.2,  // 20%
        [LoadPhase.READBACK]: 0.1,    // 10%
        [LoadPhase.GEOMETRY]: 0.3,    // 30%
        [LoadPhase.BVH]: 0.3          // 30%
    };
    
    // Cumulative phase start positions (calculated from weights)
    private phaseStarts: Record<LoadPhase, number>;
    
    constructor(callback: ProgressCallback) {
        this.callback = callback;
        
        // Calculate cumulative phase start positions
        this.phaseStarts = {
            [LoadPhase.DECODE]: 0.0,
            [LoadPhase.GPU_UPLOAD]: this.phaseWeights[LoadPhase.DECODE],
            [LoadPhase.READBACK]: this.phaseWeights[LoadPhase.DECODE] + this.phaseWeights[LoadPhase.GPU_UPLOAD],
            [LoadPhase.GEOMETRY]: this.phaseWeights[LoadPhase.DECODE] + this.phaseWeights[LoadPhase.GPU_UPLOAD] + this.phaseWeights[LoadPhase.READBACK],
            [LoadPhase.BVH]: this.phaseWeights[LoadPhase.DECODE] + this.phaseWeights[LoadPhase.GPU_UPLOAD] + this.phaseWeights[LoadPhase.READBACK] + this.phaseWeights[LoadPhase.GEOMETRY]
        };
    }
    
    /**
     * Start a new phase
     */
    startPhase(phase: LoadPhase): void {
        this.currentPhase = phase;
        this.subPhaseProgress = 0.0;
        this.updateProgress();
    }
    
    /**
     * End the current phase
     */
    endPhase(phase: LoadPhase): void {
        if (this.currentPhase === phase) {
            this.subPhaseProgress = 1.0;
            this.updateProgress();
            this.currentPhase = null;
            this.subPhaseProgress = 0.0;
        }
    }
    
    /**
     * Update sub-phase progress (0.0 to 1.0)
     */
    updateSubPhaseProgress(progress: number): void {
        this.subPhaseProgress = Math.max(0.0, Math.min(1.0, progress));
        this.updateProgress();
    }
    
    /**
     * Calculate and report total progress
     */
    private updateProgress(): void {
        if (this.currentPhase === null) {
            // No active phase, report 0 progress
            this.callback(0.0, null);
            return;
        }
        
        const phaseStart = this.phaseStarts[this.currentPhase];
        const phaseWeight = this.phaseWeights[this.currentPhase];
        const totalProgress = phaseStart + (phaseWeight * this.subPhaseProgress);
        
        this.callback(totalProgress, this.currentPhase);
    }
}
