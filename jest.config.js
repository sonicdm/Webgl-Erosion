export default {
    preset: 'ts-jest/presets/default',
    testEnvironment: 'node',
    setupFiles: ['<rootDir>/jest-setup.js'],
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        // Handle GLSL shader imports (if any)
        '\\.(glsl|vert|frag)$': '<rootDir>/src/test-utils/glsl-mock.js',
        // Mock three/tsl and three/webgpu so Jest does not load ESM from node_modules
        '^three/tsl$': '<rootDir>/src/test-utils/three-tsl-mock.js',
        '^three/webgpu$': '<rootDir>/src/test-utils/three-webgpu-mock.js',
    },
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
        }],
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/__tests__/**',
    ],
};
