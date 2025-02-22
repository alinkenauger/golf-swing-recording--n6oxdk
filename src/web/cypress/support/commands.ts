/**
 * Custom Cypress commands for end-to-end testing of the Video Coaching Platform.
 * Provides enhanced commands for authentication, video interactions, and UI operations.
 * @version 1.0.0
 */

import { User, AuthMethod, AuthState } from '../../src/types/auth';
import { VideoProcessingStatus, UserRole } from '../../src/types/common';

// @ts-ignore
import 'cypress'; // v13.0.0

// Type definitions for custom commands
declare global {
  namespace Cypress {
    interface Chainable {
      login(credentials: LoginCredentials): Chainable<void>;
      uploadVideo(filePath: string, options?: UploadOptions): Chainable<void>;
      annotateVideo(videoId: string, annotationData: AnnotationData, voiceOverData?: VoiceOverData): Chainable<void>;
      setAuthToken(token: string, refreshToken: string, options?: TokenOptions): Chainable<void>;
    }
  }
}

// Configuration constants
const API_URL = Cypress.env('NEXT_PUBLIC_API_URL');
const LOCAL_STORAGE_KEY = 'videocoach_auth';
const REFRESH_TOKEN_KEY = 'videocoach_refresh';

// Interface definitions
interface LoginCredentials {
  email: string;
  password: string;
  authMethod: AuthMethod;
  rememberMe?: boolean;
}

interface UploadOptions {
  title?: string;
  description?: string;
  visibility?: 'public' | 'private';
  maxWaitTime?: number;
}

interface AnnotationData {
  type: 'drawing' | 'text' | 'arrow';
  color: string;
  timestamp: number;
  data: Record<string, unknown>;
}

interface VoiceOverData {
  audioBlob: Blob;
  startTime: number;
  duration: number;
}

interface TokenOptions {
  expiration?: number;
  autoRefresh?: boolean;
  preserveSession?: boolean;
}

/**
 * Enhanced login command supporting multiple authentication methods
 */
Cypress.Commands.add('login', (credentials: LoginCredentials) => {
  // Intercept auth-related API requests
  cy.intercept('POST', `${API_URL}/auth/login`).as('loginRequest');
  cy.intercept('POST', `${API_URL}/auth/refresh`).as('tokenRefresh');

  // Visit login page
  cy.visit('/login');

  // Handle different auth methods
  switch (credentials.authMethod) {
    case AuthMethod.EMAIL_PASSWORD:
      cy.get('[data-cy=email-input]').type(credentials.email);
      cy.get('[data-cy=password-input]').type(credentials.password);
      if (credentials.rememberMe) {
        cy.get('[data-cy=remember-me]').click();
      }
      cy.get('[data-cy=login-submit]').click();
      break;

    case AuthMethod.GOOGLE:
      cy.get('[data-cy=google-login]').click();
      // Handle OAuth popup and flow
      cy.window().then(win => {
        cy.stub(win, 'open').callsFake(() => {
          // Simulate OAuth callback
          cy.get('@loginRequest').reply({
            statusCode: 200,
            body: {
              token: 'mock-token',
              refreshToken: 'mock-refresh-token',
              user: { id: '1', email: credentials.email, role: UserRole.ATHLETE }
            }
          });
        });
      });
      break;

    // Add other auth methods as needed
  }

  // Wait for login response and verify
  cy.wait('@loginRequest').then((interception) => {
    expect(interception.response?.statusCode).to.equal(200);
    const { token, refreshToken, user } = interception.response?.body;

    // Store auth data
    cy.setAuthToken(token, refreshToken, { autoRefresh: true });
    
    // Verify user role and redirect
    expect(user.role).to.be.oneOf(Object.values(UserRole));
  });
});

/**
 * Enhanced video upload command with progress tracking
 */
Cypress.Commands.add('uploadVideo', (filePath: string, options: UploadOptions = {}) => {
  // Intercept upload endpoints
  cy.intercept('POST', `${API_URL}/videos/upload`).as('videoUpload');
  cy.intercept('GET', `${API_URL}/videos/*/status`).as('processingStatus');

  // Attach file and submit
  cy.get('[data-cy=video-upload-input]').attachFile(filePath);

  if (options.title) {
    cy.get('[data-cy=video-title-input]').type(options.title);
  }
  if (options.description) {
    cy.get('[data-cy=video-description-input]').type(options.description);
  }

  cy.get('[data-cy=upload-submit]').click();

  // Wait for upload completion
  cy.wait('@videoUpload').then((interception) => {
    expect(interception.response?.statusCode).to.equal(200);
    const videoId = interception.response?.body.videoId;

    // Monitor processing status
    const maxWaitTime = options.maxWaitTime || 30000;
    const checkStatus = () => {
      cy.request(`${API_URL}/videos/${videoId}/status`).then((response) => {
        if (response.body.status === VideoProcessingStatus.READY) {
          return;
        } else if (response.body.status === VideoProcessingStatus.FAILED) {
          throw new Error('Video processing failed');
        }
        cy.wait(1000);
        checkStatus();
      });
    };

    cy.wrap(null, { timeout: maxWaitTime }).then(() => checkStatus());
  });
});

/**
 * Enhanced video annotation command with comprehensive testing capabilities
 */
Cypress.Commands.add('annotateVideo', (videoId: string, annotationData: AnnotationData, voiceOverData?: VoiceOverData) => {
  // Intercept annotation endpoints
  cy.intercept('POST', `${API_URL}/videos/${videoId}/annotations`).as('saveAnnotation');
  cy.intercept('POST', `${API_URL}/videos/${videoId}/voiceover`).as('saveVoiceOver');

  // Navigate to annotation workspace
  cy.visit(`/videos/${videoId}/annotate`);

  // Wait for video to load
  cy.get('[data-cy=video-player]').should('be.visible');
  cy.get('[data-cy=video-loaded]').should('exist');

  // Add annotations
  cy.get(`[data-cy=annotation-tool-${annotationData.type}]`).click();
  cy.get('[data-cy=annotation-color-picker]').invoke('val', annotationData.color);
  cy.get('[data-cy=annotation-canvas]').trigger('mousedown', { which: 1 })
    .trigger('mousemove', { clientX: 100, clientY: 100 })
    .trigger('mouseup');

  // Add voice-over if provided
  if (voiceOverData) {
    cy.get('[data-cy=voice-record-start]').click();
    cy.wait(voiceOverData.duration);
    cy.get('[data-cy=voice-record-stop]').click();
  }

  // Save and verify
  cy.get('[data-cy=save-annotations]').click();
  cy.wait(['@saveAnnotation', '@saveVoiceOver']).then((interceptions) => {
    interceptions.forEach(interception => {
      expect(interception.response?.statusCode).to.equal(200);
    });
  });
});

/**
 * Enhanced auth token management command with refresh token support
 */
Cypress.Commands.add('setAuthToken', (token: string, refreshToken: string, options: TokenOptions = {}) => {
  const authState: AuthState = {
    isAuthenticated: true,
    token,
    refreshToken,
    expiresAt: options.expiration || Date.now() + 3600000,
    user: null
  };

  // Store tokens
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(authState));
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);

  // Set up token refresh if enabled
  if (options.autoRefresh) {
    cy.intercept('POST', `${API_URL}/auth/refresh`, (req) => {
      req.reply({
        statusCode: 200,
        body: {
          token: 'refreshed-token',
          refreshToken: 'new-refresh-token'
        }
      });
    });
  }

  // Add auth header to all requests
  cy.on('window:before:load', (win) => {
    win.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(authState));
  });
});

// Export commands for TypeScript support
export {};