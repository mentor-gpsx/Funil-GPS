/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          // Mirror tsconfig.json but allow .spec.ts under test runs.
          // strictPropertyInitialization OFF: class-validator DTOs and NestJS
          // injectables rely on constructor injection / runtime decoration,
          // not TS-visible initializers.
          module: 'commonjs',
          target: 'ES2022',
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: true,
          strictNullChecks: true,
          strictPropertyInitialization: false,
          noImplicitAny: false,
          resolveJsonModule: true,
          skipLibCheck: true,
          types: ['node', 'jest'],
        },
        diagnostics: {
          // Ignore TS strict-property-init in spec files (DTO classes).
          ignoreCodes: [2564],
        },
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/**/index.ts',
    '!src/**/*.module.ts',
    '!src/**/dto/**',
  ],
  coverageDirectory: 'coverage',
  testTimeout: 30000,
};
