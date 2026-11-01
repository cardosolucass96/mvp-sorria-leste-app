/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  displayName: 'components',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/components/**/*.test.tsx'],
  moduleNameMapper: {
    '^server-only$': '<rootDir>/__mocks__/server-only.ts',
    '^@/(.*)$': '<rootDir>/$1',
    '^@opennextjs/cloudflare$': '<rootDir>/__mocks__/opennextjs-cloudflare.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  modulePathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/.open-next/',
    '<rootDir>/tmp/',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
