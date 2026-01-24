export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        skipLibCheck: true,
        module: 'commonjs',
        isolatedModules: false,
      },
      isolatedModules: false,
      diagnostics: {
        ignoreCodes: [2693], // Ignore "only refers to a type" errors for three.js
      },
    }],
    '^.+\\.glsl(\\?raw)?$': '<rootDir>/jest.glsl-transformer.cjs',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'glsl'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{1,2}/.*)\\.glsl\\?raw$': '$1.glsl',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(three|three-mesh-bvh)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
