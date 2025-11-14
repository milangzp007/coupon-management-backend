module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.spec.ts',
    '!**/*.interface.ts',
    '!**/*.dto.ts',
    '!**/main.ts',
    '!**/entities/**',
    '!**/config/**',
    '!**/notification/**', // Exclude notification service from coverage
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/$1',
  },
  maxWorkers: 1, // Fix for Node v16 compatibility
  coverageThreshold: {
    // Service-level coverage thresholds (realistic based on current coverage)
    './src/modules/coupon/coupon.service.ts': {
      branches: 55,
      functions: 55,
      lines: 65,
      statements: 65,
    },
    './src/modules/admin/admin.service.ts': {
      branches: 50,
      functions: 90,
      lines: 80,
      statements: 80,
    },
    './src/modules/user/user.service.ts': {
      branches: 65,
      functions: 75,
      lines: 90,
      statements: 90,
    },
    './src/modules/auth/auth.service.ts': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './src/modules/order/order.service.ts': {
      branches: 80,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};

