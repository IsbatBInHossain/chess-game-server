module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  roots: ['<rootDir>/server'],
  testTimeout: 30000,
  globalSetup: '<rootDir>/server/tests/globalSetup.js',
}
