import { defineConfig } from 'cypress';

export default defineConfig({
  // E2E Testing Configuration
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    
    // Viewport configuration for desktop testing
    viewportWidth: 1280,
    viewportHeight: 720,
    
    // Video recording settings
    video: true,
    videoUploadOnPasses: false,
    videoCompression: 32,
    
    // Screenshot settings
    screenshotOnRunFailure: true,
    
    // Timeouts for various operations
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 30000,
    pageLoadTimeout: 60000,
    
    // Retry configuration
    retries: {
      runMode: 2,
      openMode: 0,
    },
    
    // Memory management for long test runs
    experimentalMemoryManagement: true,
    numTestsKeptInMemory: 10,
    
    // Enable Cypress Studio for test recording
    experimentalStudio: true,
    
    // Setup function for each test
    setupNodeEvents(on, config) {
      // Register tasks for video processing tests
      on('task', {
        validateVideoUpload: (filePath: string) => {
          // Custom video validation logic
          return null;
        },
        checkVideoProcessing: (videoId: string) => {
          // Check video processing status
          return null;
        }
      });

      // Configure code coverage collection
      if (config.env.coverage) {
        require('@cypress/code-coverage/task')(on, config);
      }

      // Configure performance metrics collection
      on('before:spec', () => {
        // Reset performance metrics before each spec
      });

      on('after:spec', (spec, results) => {
        // Save performance metrics after each spec
      });

      return config;
    }
  },

  // Component Testing Configuration
  component: {
    devServer: {
      framework: 'next',
      bundler: 'webpack',
    },
    supportFile: 'cypress/support/component.ts',
    specPattern: 'cypress/component/**/*.cy.ts',
    viewportWidth: 1280,
    viewportHeight: 720,
  },

  // Environment Configuration
  env: {
    // API configuration
    apiUrl: 'http://localhost:8000',
    
    // Code coverage configuration
    coverage: true,
    codeCoverage: {
      url: 'http://localhost:8000/__coverage__',
      exclude: [
        'cypress/**/*.*',
        '**/*.test.*',
        '**/*.spec.*'
      ]
    },
    
    // Video processing test configuration
    videoProcessing: {
      uploadTimeout: 30000,
      processingTimeout: 60000,
      retryInterval: 5000,
      fixtures: {
        uploadPath: 'cypress/fixtures/videos',
        validFormats: ['mp4', 'mov', 'avi'],
        maxFileSize: 100 * 1024 * 1024 // 100MB
      }
    },
    
    // Performance monitoring configuration
    performance: {
      collectMetrics: true,
      thresholds: {
        requestDuration: 5000, // 5 seconds
        renderingTime: 3000,   // 3 seconds
        firstContentfulPaint: 2000,
        timeToInteractive: 3500
      },
      reporting: {
        outputPath: 'cypress/performance',
        includeScreenshots: true
      }
    },
    
    // Test environment variables
    testUsers: {
      coach: {
        email: 'test.coach@example.com',
        password: 'test-password'
      },
      athlete: {
        email: 'test.athlete@example.com',
        password: 'test-password'
      }
    }
  },

  // Project Settings
  projectId: 'video-coaching-platform',
  
  // Reporter configuration
  reporter: 'cypress-multi-reporters',
  reporterOptions: {
    configFile: 'reporter-config.json'
  },
  
  // Screenshots configuration
  screenshotsFolder: 'cypress/screenshots',
  trashAssetsBeforeRuns: true,
  
  // Video configuration
  videosFolder: 'cypress/videos',
  
  // Viewport configuration for different devices
  viewportPresets: {
    mobile: {
      width: 375,
      height: 667
    },
    tablet: {
      width: 768,
      height: 1024
    },
    desktop: {
      width: 1280,
      height: 720
    }
  }
});