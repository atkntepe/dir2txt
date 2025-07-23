export default {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'lib/**/*.js',
    'bin/**/*.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '**/test/**/*.test.js',
    '**/tests/**/*.test.js'
  ],
  verbose: true,
  transform: {}
};