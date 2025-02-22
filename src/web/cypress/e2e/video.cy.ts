import { Video, VideoStatus, VideoQuality } from '../../src/types/video';
import 'cypress';

// Test video file path in fixtures
const TEST_VIDEO_FILE = 'cypress/fixtures/test-video.mp4';

// Mock video data for testing
const MOCK_VIDEO_DATA: Video = {
  id: 'test-video-1',
  userId: 'test-user-1',
  title: 'Test Video',
  description: 'Test video for e2e testing',
  status: VideoStatus.READY,
  metadata: {
    duration: 30,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    sizeBytes: 1024000,
    format: 'mp4'
  },
  variants: [
    {
      quality: VideoQuality.HD,
      url: 'https://cdn.example.com/videos/test-video-1-hd.mp4',
      metadata: {
        width: 1920,
        height: 1080,
        duration: 30,
        fps: 30,
        codec: 'h264',
        sizeBytes: 1024000,
        format: 'mp4'
      }
    },
    {
      quality: VideoQuality.SD,
      url: 'https://cdn.example.com/videos/test-video-1-sd.mp4',
      metadata: {
        width: 1280,
        height: 720,
        duration: 30,
        fps: 30,
        codec: 'h264',
        sizeBytes: 512000,
        format: 'mp4'
      }
    }
  ],
  annotations: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 1
};

describe('Video Upload and Processing', () => {
  beforeEach(() => {
    // Reset state and intercept API calls
    cy.clearCookies();
    cy.clearLocalStorage();
    
    // Mock authentication
    cy.intercept('POST', '/api/auth/login', { statusCode: 200, body: { token: 'test-token' } });
    
    // Mock video upload endpoint
    cy.intercept('POST', '/api/videos/upload', (req) => {
      req.reply({
        statusCode: 201,
        body: {
          ...MOCK_VIDEO_DATA,
          status: VideoStatus.UPLOADING
        }
      });
    });

    // Mock video processing status endpoint
    cy.intercept('GET', '/api/videos/*/status', (req) => {
      req.reply({
        statusCode: 200,
        body: {
          status: VideoStatus.READY,
          progress: 100
        }
      });
    });

    // Visit video upload page
    cy.visit('/videos/upload');
  });

  it('should validate file format restrictions', () => {
    // Attempt to upload invalid file format
    cy.get('[data-cy="video-upload-input"]').attachFile('invalid.txt');
    cy.get('[data-cy="error-message"]').should('contain', 'Invalid file format');

    // Upload valid video file
    cy.get('[data-cy="video-upload-input"]').attachFile(TEST_VIDEO_FILE);
    cy.get('[data-cy="error-message"]').should('not.exist');
  });

  it('should enforce file size limits', () => {
    // Mock large file upload
    const largeFile = { name: 'large.mp4', size: 200 * 1024 * 1024 }; // 200MB
    cy.get('[data-cy="video-upload-input"]').trigger('change', { force: true, files: [largeFile] });
    cy.get('[data-cy="error-message"]').should('contain', 'File size exceeds limit');
  });

  it('should show upload progress and processing status', () => {
    cy.get('[data-cy="video-upload-input"]').attachFile(TEST_VIDEO_FILE);
    
    // Verify upload progress
    cy.get('[data-cy="upload-progress"]').should('exist');
    cy.get('[data-cy="upload-progress"]').should('contain', '%');
    
    // Verify processing status
    cy.get('[data-cy="processing-status"]').should('contain', VideoStatus.PROCESSING);
    cy.get('[data-cy="processing-status"]').should('contain', VideoStatus.READY);
  });
});

describe('Video Playback and Quality', () => {
  beforeEach(() => {
    // Mock video data endpoint
    cy.intercept('GET', '/api/videos/*', {
      statusCode: 200,
      body: MOCK_VIDEO_DATA
    });

    // Visit video player page
    cy.visit(`/videos/${MOCK_VIDEO_DATA.id}`);
  });

  it('should handle basic playback controls', () => {
    // Test play/pause
    cy.get('[data-cy="video-player"]').should('exist');
    cy.get('[data-cy="play-button"]').click();
    cy.get('[data-cy="video-player"]').should('have.prop', 'paused', false);
    cy.get('[data-cy="pause-button"]').click();
    cy.get('[data-cy="video-player"]').should('have.prop', 'paused', true);
  });

  it('should support quality switching', () => {
    // Test quality selection
    cy.get('[data-cy="quality-selector"]').click();
    cy.get('[data-cy="quality-option-hd"]').click();
    cy.get('[data-cy="video-player"]').should('have.attr', 'src').and('include', 'hd.mp4');
    
    cy.get('[data-cy="quality-selector"]').click();
    cy.get('[data-cy="quality-option-sd"]').click();
    cy.get('[data-cy="video-player"]').should('have.attr', 'src').and('include', 'sd.mp4');
  });

  it('should support slow-motion playback', () => {
    cy.get('[data-cy="playback-speed"]').click();
    cy.get('[data-cy="speed-option-0.5"]').click();
    cy.get('[data-cy="video-player"]').should('have.prop', 'playbackRate', 0.5);
  });
});

describe('Annotation Tools', () => {
  beforeEach(() => {
    cy.visit(`/videos/${MOCK_VIDEO_DATA.id}/annotate`);
  });

  it('should support drawing tools', () => {
    // Test drawing tool selection
    cy.get('[data-cy="drawing-tool-pen"]').click();
    cy.get('[data-cy="annotation-canvas"]').should('have.class', 'pen-active');
    
    // Test drawing on canvas
    cy.get('[data-cy="annotation-canvas"]')
      .trigger('mousedown', 50, 50)
      .trigger('mousemove', 100, 100)
      .trigger('mouseup');
    
    // Verify annotation was created
    cy.get('[data-cy="annotation-list"]').should('contain', 'Drawing');
  });

  it('should handle undo/redo operations', () => {
    // Create annotation
    cy.get('[data-cy="drawing-tool-pen"]').click();
    cy.get('[data-cy="annotation-canvas"]')
      .trigger('mousedown', 50, 50)
      .trigger('mousemove', 100, 100)
      .trigger('mouseup');
    
    // Test undo
    cy.get('[data-cy="undo-button"]').click();
    cy.get('[data-cy="annotation-list"]').should('be.empty');
    
    // Test redo
    cy.get('[data-cy="redo-button"]').click();
    cy.get('[data-cy="annotation-list"]').should('not.be.empty');
  });
});

describe('Voice-over Recording', () => {
  beforeEach(() => {
    // Mock MediaRecorder API
    cy.window().then((win) => {
      cy.stub(win.navigator.mediaDevices, 'getUserMedia').resolves(new MediaStream());
    });
    
    cy.visit(`/videos/${MOCK_VIDEO_DATA.id}/voiceover`);
  });

  it('should handle voice recording workflow', () => {
    // Start recording
    cy.get('[data-cy="record-button"]').click();
    cy.get('[data-cy="recording-indicator"]').should('be.visible');
    
    // Pause recording
    cy.get('[data-cy="pause-recording"]').click();
    cy.get('[data-cy="recording-indicator"]').should('have.class', 'paused');
    
    // Resume and stop recording
    cy.get('[data-cy="resume-recording"]').click();
    cy.get('[data-cy="stop-recording"]').click();
    
    // Verify recording was saved
    cy.get('[data-cy="voice-over-list"]').should('contain', 'Voice-over');
  });

  it('should maintain video sync with voice-over', () => {
    // Start recording at specific timestamp
    cy.get('[data-cy="video-player"]').invoke('currentTime', 5);
    cy.get('[data-cy="record-button"]').click();
    
    // Record for 3 seconds
    cy.wait(3000);
    cy.get('[data-cy="stop-recording"]').click();
    
    // Verify voice-over timestamp
    cy.get('[data-cy="voice-over-list"]').should('contain', '0:05');
  });
});