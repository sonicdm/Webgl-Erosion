/**
 * Progress tracking for terrain loading pipeline
 * Tracks phases: decode, GPU upload, readback, geometry, BVH
 */

export enum LoadPhase {
    DECODE = 'decode',
    GPU_UPLOAD = 'gpu_upload',
    READBACK = 'readback',
    GEOMETRY = 'geometry',
    BVH = 'bvh'
}

export interface PhaseTiming {
    phase: LoadPhase;
    startTime: number;
    endTime?: number;
    duration?: number;
}

export interface LoadProgress {
    currentPhase: LoadPhase | null;
    progress: number; // 0.0 to 1.0
    phaseTimings: Map<LoadPhase, PhaseTiming>;
    totalStartTime: number;
}

// Phase progress fractions (cumulative)
const PHASE_PROGRESS: Record<LoadPhase, number> = {
    [LoadPhase.DECODE]: 0.2,
    [LoadPhase.GPU_UPLOAD]: 0.4,
    [LoadPhase.READBACK]: 0.6,
    [LoadPhase.GEOMETRY]: 0.75,
    [LoadPhase.BVH]: 1.0
};

export class LoadProgressTracker {
    private progress: LoadProgress;
    private onProgressUpdate?: (progress: number, phase: LoadPhase | null) => void;

    constructor(onProgressUpdate?: (progress: number, phase: LoadPhase | null) => void) {
        this.progress = {
            currentPhase: null,
            progress: 0.0,
            phaseTimings: new Map(),
            totalStartTime: performance.now()
        };
        this.onProgressUpdate = onProgressUpdate;
    }

    startPhase(phase: LoadPhase): void {
        // End previous phase if any
        if (this.progress.currentPhase) {
            this.endPhase(this.progress.currentPhase);
        }

        this.progress.currentPhase = phase;
        const timing: PhaseTiming = {
            phase,
            startTime: performance.now()
        };
        this.progress.phaseTimings.set(phase, timing);
        
        // Calculate the START of this phase (end of previous phase, or 0.0 if first phase)
        const phases = Object.values(LoadPhase);
        const currentPhaseIndex = phases.indexOf(phase);
        const phaseStartProgress = currentPhaseIndex > 0 
            ? PHASE_PROGRESS[phases[currentPhaseIndex - 1] as LoadPhase]
            : 0.0;
        const phaseEndProgress = PHASE_PROGRESS[phase];
        
        // Start at the beginning of this phase, not the end
        this.progress.progress = phaseStartProgress;
        console.log(`[Progress] Phase started: ${phase}, progress: ${(phaseStartProgress * 100).toFixed(1)}% -> ${(phaseEndProgress * 100).toFixed(1)}%`);
        
        if (this.onProgressUpdate) {
            this.onProgressUpdate(this.progress.progress, this.progress.currentPhase);
        }
    }

    endPhase(phase: LoadPhase): void {
        const timing = this.progress.phaseTimings.get(phase);
        if (timing && !timing.endTime) {
            timing.endTime = performance.now();
            timing.duration = timing.endTime - timing.startTime;
            this.progress.phaseTimings.set(phase, timing);
            console.log(`[Progress] Phase ended: ${phase}, duration: ${timing.duration.toFixed(2)}ms`);
        }
    }

    updateProgress(): void {
        if (!this.progress.currentPhase) {
            this.progress.progress = 0.0;
        } else {
            this.progress.progress = PHASE_PROGRESS[this.progress.currentPhase];
        }

        console.log(`[Progress] Update: ${(this.progress.progress * 100).toFixed(1)}%, phase: ${this.progress.currentPhase || 'none'}`);
        if (this.onProgressUpdate) {
            this.onProgressUpdate(this.progress.progress, this.progress.currentPhase);
        }
    }

    /**
     * Updates progress within the current phase (0.0 to 1.0).
     * Interpolates between the current phase's start and end progress values.
     * @param phaseProgress - Progress within current phase (0.0 to 1.0)
     */
    updateSubPhaseProgress(phaseProgress: number): void {
        if (!this.progress.currentPhase) {
            return;
        }

        // Clamp phaseProgress to [0, 1]
        phaseProgress = Math.max(0.0, Math.min(1.0, phaseProgress));

        // Get the current phase's progress boundaries
        const currentPhaseProgress = PHASE_PROGRESS[this.progress.currentPhase];
        
        // Find the previous phase's progress (or 0.0 if this is the first phase)
        const phases = Object.values(LoadPhase);
        const currentPhaseIndex = phases.indexOf(this.progress.currentPhase);
        const previousPhaseProgress = currentPhaseIndex > 0 
            ? PHASE_PROGRESS[phases[currentPhaseIndex - 1] as LoadPhase]
            : 0.0;

        // Interpolate between previous and current phase progress
        const phaseRange = currentPhaseProgress - previousPhaseProgress;
        this.progress.progress = previousPhaseProgress + (phaseRange * phaseProgress);

        console.log(`[Progress] Sub-phase update: ${(this.progress.progress * 100).toFixed(1)}% (phase: ${this.progress.currentPhase}, sub-progress: ${(phaseProgress * 100).toFixed(1)}%)`);
        if (this.onProgressUpdate) {
            this.onProgressUpdate(this.progress.progress, this.progress.currentPhase);
        }
    }

    getProgress(): LoadProgress {
        return { ...this.progress };
    }

    getPhaseTiming(phase: LoadPhase): PhaseTiming | undefined {
        return this.progress.phaseTimings.get(phase);
    }

    getAllTimings(): PhaseTiming[] {
        return Array.from(this.progress.phaseTimings.values());
    }

    getTotalDuration(): number {
        if (this.progress.phaseTimings.size === 0) {
            return 0;
        }
        const lastPhase = Array.from(this.progress.phaseTimings.values())
            .reduce((latest, timing) => {
                const endTime = timing.endTime || performance.now();
                return endTime > (latest.endTime || 0) ? timing : latest;
            });
        return (lastPhase.endTime || performance.now()) - this.progress.totalStartTime;
    }
}

