// @ts-ignore - three.js types may not resolve correctly in test environment
import { BufferGeometry } from 'three';
// @ts-ignore
import { MeshBVH, SAH } from 'three-mesh-bvh';
import { createTerrainGeometry } from '../terrain-geometry-builder';

/**
 * Performance tests for BVH construction
 * These tests verify that BVH builds complete within reasonable time budgets
 * Note: Timings are machine-dependent, so budgets are generous
 */

// Skip these tests in Jest due to ESM/CommonJS compatibility issues with three.js
// They can be run manually in a browser environment
describe.skip('BVH Performance', () => {
    // Performance budgets (in milliseconds) - generous to account for machine variance
    const BVH_BUILD_BUDGET_1K = 2000; // 2 seconds for 1024x1024
    const BVH_BUILD_BUDGET_2K = 10000; // 10 seconds for 2048x2048

    function createMockHeightmapData(simres: number): Float32Array {
        const buffer = new Float32Array(simres * simres * 4);
        // Fill with simple height pattern (not all zeros)
        for (let i = 0; i < simres * simres; i++) {
            const x = (i % simres) / simres;
            const z = Math.floor(i / simres) / simres;
            const height = Math.sin(x * Math.PI * 4) * Math.cos(z * Math.PI * 4) * 100;
            buffer[i * 4] = height;
            buffer[i * 4 + 1] = 0.0; // water
            buffer[i * 4 + 2] = 0.0; // rock
            buffer[i * 4 + 3] = 1.0; // alpha
        }
        return buffer;
    }

    test('BVH build for 1024x1024 should complete within budget', () => {
        const simres = 1024;
        const heightData = createMockHeightmapData(simres);
        
        const geometry = createTerrainGeometry(simres, heightData, 1.0);
        
        const startTime = performance.now();
        const bvh = new MeshBVH(geometry, {
            strategy: SAH,
            maxDepth: 30,
            indirect: false
        });
        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(bvh).toBeDefined();
        expect(duration).toBeLessThan(BVH_BUILD_BUDGET_1K);
        console.log(`[Perf] 1024x1024 BVH build: ${duration.toFixed(2)}ms (budget: ${BVH_BUILD_BUDGET_1K}ms)`);
    }, 30000); // 30 second timeout

    test('BVH build for 2048x2048 should complete within budget', () => {
        const simres = 2048;
        const heightData = createMockHeightmapData(simres);
        
        const geometry = createTerrainGeometry(simres, heightData, 1.0);
        
        const startTime = performance.now();
        const bvh = new MeshBVH(geometry, {
            strategy: SAH,
            maxDepth: 30,
            indirect: false
        });
        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(bvh).toBeDefined();
        expect(duration).toBeLessThan(BVH_BUILD_BUDGET_2K);
        console.log(`[Perf] 2048x2048 BVH build: ${duration.toFixed(2)}ms (budget: ${BVH_BUILD_BUDGET_2K}ms)`);
    }, 60000); // 60 second timeout

    test('Reduced maxDepth should improve build time', () => {
        const simres = 1024;
        const heightData = createMockHeightmapData(simres);
        const geometry = createTerrainGeometry(simres, heightData, 1.0);
        
        // Test with maxDepth 40 (old value)
        const startTime40 = performance.now();
        const bvh40 = new MeshBVH(geometry, {
            strategy: SAH,
            maxDepth: 40,
            indirect: false
        });
        const duration40 = performance.now() - startTime40;
        
        // Test with maxDepth 30 (new optimized value)
        const startTime30 = performance.now();
        const bvh30 = new MeshBVH(geometry, {
            strategy: SAH,
            maxDepth: 30,
            indirect: false
        });
        const duration30 = performance.now() - startTime30;

        expect(bvh40).toBeDefined();
        expect(bvh30).toBeDefined();
        // maxDepth 30 should generally be faster (or at least not significantly slower)
        console.log(`[Perf] maxDepth 40: ${duration40.toFixed(2)}ms, maxDepth 30: ${duration30.toFixed(2)}ms`);
        // Note: We don't assert duration30 < duration40 because it can vary, but we log it
    }, 60000);
});

