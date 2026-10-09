/** `npm test` runs the offline suites; `npm run test:live` hits the real services. */
module.exports = {
  projects: [
    {
      displayName: 'app',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/live/'],
      setupFiles: ['<rootDir>/jest.setup.js'],
    },
    {
      displayName: 'live',
      testEnvironment: 'node',
      transform: { '^.+\\.tsx?$': 'babel-jest' },
      testMatch: ['<rootDir>/__tests__/live/**/*.test.ts'],
    },
  ],
};
