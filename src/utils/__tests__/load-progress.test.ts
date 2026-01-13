import { LoadProgressTracker, LoadPhase } from '../load-progress';

describe('LoadProgressTracker', () => {
    let tracker: LoadProgressTracker;
    let progressUpdates: Array<{ progress: number; phase: LoadPhase | null }>;

    beforeEach(() => {
        progressUpdates = [];
        tracker = new LoadProgressTracker((progress, phase) => {
            progressUpdates.push({ progress, phase });
        });
    });

    test('should initialize with zero progress', () => {
        const progress = tracker.getProgress();
        expect(progress.progress).toBe(0.0);
        expect(progress.currentPhase).toBeNull();
    });

    test('should track phase progress correctly', () => {
        tracker.startPhase(LoadPhase.DECODE);
        expect(tracker.getProgress().progress).toBe(0.2);
        expect(tracker.getProgress().currentPhase).toBe(LoadPhase.DECODE);
        expect(progressUpdates.length).toBeGreaterThan(0);
        expect(progressUpdates[progressUpdates.length - 1].progress).toBe(0.2);
    });

    test('should progress through all phases', () => {
        tracker.startPhase(LoadPhase.DECODE);
        expect(tracker.getProgress().progress).toBe(0.2);

        tracker.startPhase(LoadPhase.GPU_UPLOAD);
        expect(tracker.getProgress().progress).toBe(0.4);

        tracker.startPhase(LoadPhase.READBACK);
        expect(tracker.getProgress().progress).toBe(0.6);

        tracker.startPhase(LoadPhase.GEOMETRY);
        expect(tracker.getProgress().progress).toBe(0.75);

        tracker.startPhase(LoadPhase.BVH);
        expect(tracker.getProgress().progress).toBe(1.0);
    });

    test('should track phase timings', () => {
        tracker.startPhase(LoadPhase.DECODE);
        
        // Simulate some work
        const startTime = performance.now();
        while (performance.now() - startTime < 1) {
            // Busy wait for ~1ms
        }
        tracker.endPhase(LoadPhase.DECODE);

        const timing = tracker.getPhaseTiming(LoadPhase.DECODE);
        expect(timing).toBeDefined();
        expect(timing?.startTime).toBeDefined();
        expect(timing?.endTime).toBeDefined();
        expect(timing?.duration).toBeDefined();
        if (timing?.duration) {
            expect(timing.duration).toBeGreaterThanOrEqual(0);
        }
    });

    test('should calculate total duration', () => {
        tracker.startPhase(LoadPhase.DECODE);
        tracker.endPhase(LoadPhase.DECODE);
        tracker.startPhase(LoadPhase.GPU_UPLOAD);
        tracker.endPhase(LoadPhase.GPU_UPLOAD);

        const totalDuration = tracker.getTotalDuration();
        expect(totalDuration).toBeGreaterThanOrEqual(0);
    });

    test('should end previous phase when starting new phase', () => {
        tracker.startPhase(LoadPhase.DECODE);
        const decodeTiming = tracker.getPhaseTiming(LoadPhase.DECODE);
        expect(decodeTiming?.endTime).toBeUndefined();

        tracker.startPhase(LoadPhase.GPU_UPLOAD);
        const decodeTimingAfter = tracker.getPhaseTiming(LoadPhase.DECODE);
        expect(decodeTimingAfter?.endTime).toBeDefined();
    });

    test('should call progress update callback', () => {
        expect(progressUpdates.length).toBe(0);
        tracker.startPhase(LoadPhase.DECODE);
        expect(progressUpdates.length).toBeGreaterThan(0);
        expect(progressUpdates[0].progress).toBe(0.2);
        expect(progressUpdates[0].phase).toBe(LoadPhase.DECODE);
    });

    test('should return all timings', () => {
        tracker.startPhase(LoadPhase.DECODE);
        tracker.endPhase(LoadPhase.DECODE);
        tracker.startPhase(LoadPhase.GPU_UPLOAD);
        tracker.endPhase(LoadPhase.GPU_UPLOAD);

        const allTimings = tracker.getAllTimings();
        expect(allTimings.length).toBe(2);
        expect(allTimings.some(t => t.phase === LoadPhase.DECODE)).toBe(true);
        expect(allTimings.some(t => t.phase === LoadPhase.GPU_UPLOAD)).toBe(true);
    });
});

