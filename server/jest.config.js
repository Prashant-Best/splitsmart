// Two projects: fast pure unit tests, and integration tests that run the real API against an
// in-memory MongoDB replica set (transactions need a replica set).
const transform = {
  '^.+\\.ts$': [
    '@swc/jest',
    { jsc: { target: 'es2023', parser: { syntax: 'typescript' } }, module: { type: 'commonjs' } },
  ],
};

/** @type {import('jest').Config} */
module.exports = {
  testTimeout: 60_000,
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts'],
  coverageReporters: ['text-summary', 'lcov'],
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/unit'],
      transform,
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/integration'],
      transform,
      globalSetup: '<rootDir>/tests/helpers/globalSetup.ts',
      globalTeardown: '<rootDir>/tests/helpers/globalTeardown.ts',
      setupFiles: ['<rootDir>/tests/helpers/env.ts'],
    },
  ],
};
