import type { Config } from 'jest';
// @ts-jest version: ^29.1.1
// jest version: ^29.7.0

const config: Config = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',
  
  // Set Node.js as the test environment
  testEnvironment: 'node',
  
  // Define test roots for all microservices
  roots: [
    '<rootDir>/api-gateway/test',
    '<rootDir>/chat-service/test',
    '<rootDir>/coach-service/test',
    '<rootDir>/payment-service/test',
    '<rootDir>/user-service/test',
    '<rootDir>/video-service/tests'
  ],

  // Configure module path aliases to match tsconfig paths
  moduleNameMapper: {
    '@shared/(.*)': '<rootDir>/shared/$1',
    '@api-gateway/(.*)': '<rootDir>/api-gateway/src/$1',
    '@chat-service/(.*)': '<rootDir>/chat-service/src/$1',
    '@coach-service/(.*)': '<rootDir>/coach-service/src/$1',
    '@payment-service/(.*)': '<rootDir>/payment-service/src/$1',
    '@user-service/(.*)': '<rootDir>/user-service/src/$1',
    '@video-service/(.*)': '<rootDir>/video-service/src/$1'
  },

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx)',
    '**/?(*.)+(spec|test).+(ts|tsx)'
  ],

  // TypeScript transformation
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },

  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'json', 'html'],
  
  // Strict coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // File extensions to consider
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // TypeScript configuration
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json'
    }
  },

  // Test timeout and other settings
  testTimeout: 10000,
  verbose: true,
  detectOpenHandles: true,
  forceExit: true
};

export default config;