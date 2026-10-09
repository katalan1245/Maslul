/** `npm test` runs the offline suites; `npm run test:live` hits the real services. */
module.exports = {
  projects: [
    {
      displayName: 'app',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/live/'],
      setupFiles: ['<rootDir>/jest.setup.js'],
      // Metro picks the @3x map icons by density; Jest needs the file named.
      moduleNameMapper: { '/assets/map/([a-z-]+)\\.png$': '<rootDir>/assets/map/$1@3x.png' },
    },
    {
      displayName: 'live',
      testEnvironment: 'node',
      transform: { '^.+\\.tsx?$': 'babel-jest' },
      testMatch: ['<rootDir>/__tests__/live/**/*.test.ts'],
    },
  ],
};
