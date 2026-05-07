module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'api/**/*.js',
    'services/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },
  testTimeout: 30000,
  verbose: false,
  clearMocks: true,
  resetMocks: true,
  testPathIgnorePatterns: [
    '/node_modules/',
    '/build/'
  ]
};
