import { describe, it, expect } from '@jest/globals'; // v29.7.0
import {
  validateEmail,
  validatePassword,
  validateVideoUpload,
  validateAnnotation
} from '../../src/utils/validation';

describe('Email Validation', () => {
  it('should validate correct email formats', async () => {
    const validEmails = [
      'test@example.com',
      'user.name@domain.co.uk',
      'user+tag@example.com',
      'first.last@subdomain.example.com'
    ];

    for (const email of validEmails) {
      const result = await validateEmail(email);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('should reject invalid email formats', async () => {
    const invalidEmails = [
      'test@',
      '@example.com',
      'test@.com',
      'test@com',
      'test..test@example.com',
      'test@example..com'
    ];

    for (const email of invalidEmails) {
      const result = await validateEmail(email);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('should validate email length constraints', async () => {
    const longLocalPart = 'a'.repeat(65) + '@example.com';
    const longDomain = 'test@' + 'a'.repeat(255) + '.com';
    
    const localPartResult = await validateEmail(longLocalPart);
    expect(localPartResult.isValid).toBe(false);
    expect(localPartResult.errors).toContain('validation.email.localPartTooLong');

    const domainResult = await validateEmail(longDomain);
    expect(domainResult.isValid).toBe(false);
    expect(domainResult.errors).toContain('validation.email.tooLong');
  });

  it('should detect common email typos', async () => {
    const emailsWithTypos = [
      'test@@example.com',
      'test@example..com',
      'test.@example.com',
      'test@example.c'
    ];

    for (const email of emailsWithTypos) {
      const result = await validateEmail(email);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe('Password Validation', () => {
  it('should validate strong passwords', async () => {
    const strongPasswords = [
      'StrongP@ss123',
      'C0mplex!Pass',
      'Secure123#Pass',
      'P@ssw0rd123'
    ];

    for (const password of strongPasswords) {
      const result = await validatePassword(password);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('should reject weak passwords', async () => {
    const weakPasswords = [
      'password123',
      'abc123',
      'qwerty',
      '12345678',
      'Password'
    ];

    for (const password of weakPasswords) {
      const result = await validatePassword(password);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('should validate password complexity requirements', async () => {
    const testCases = [
      { password: 'nouppercasepass1!', expectedError: 'validation.password.upperCase' },
      { password: 'NOLOWERCASEPASS1!', expectedError: 'validation.password.lowerCase' },
      { password: 'NoSpecialChars123', expectedError: 'validation.password.specialChar' },
      { password: 'NoNumbers!Pass', expectedError: 'validation.password.number' }
    ];

    for (const { password, expectedError } of testCases) {
      const result = await validatePassword(password);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(expectedError);
    }
  });

  it('should detect repeated characters', async () => {
    const result = await validatePassword('Pass1111!word');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('validation.password.repeatedChars');
  });
});

describe('Video Upload Validation', () => {
  it('should validate correct video files', async () => {
    const validVideo = new File(
      ['dummy video content'],
      'test.mp4',
      { type: 'video/mp4' }
    );
    Object.defineProperty(validVideo, 'size', { value: 1024 * 1024 }); // 1MB

    const result = await validateVideoUpload(validVideo);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject oversized videos', async () => {
    const largeVideo = new File(
      ['dummy video content'],
      'large.mp4',
      { type: 'video/mp4' }
    );
    Object.defineProperty(largeVideo, 'size', { value: 101 * 1024 * 1024 }); // 101MB

    const result = await validateVideoUpload(largeVideo);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('validation.video.tooLarge');
  });

  it('should validate video format types', async () => {
    const invalidVideo = new File(
      ['dummy video content'],
      'test.wmv',
      { type: 'video/x-ms-wmv' }
    );

    const result = await validateVideoUpload(invalidVideo);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('validation.video.invalidType');
  });

  it('should handle corrupted video files', async () => {
    const corruptedVideo = new File(
      ['corrupted content'],
      'corrupted.mp4',
      { type: 'video/mp4' }
    );

    const result = await validateVideoUpload(corruptedVideo);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('validation.video.corrupted');
  });
});

describe('Annotation Validation', () => {
  it('should validate correct annotation data', () => {
    const validAnnotation = {
      timestamp: 10.5,
      text: 'Valid annotation',
      coordinates: [{ x: 100, y: 100 }, { x: 200, y: 200 }],
      strokeWidth: 2,
      color: '#FF0000',
      type: 'freehand' as const
    };

    const result = validateAnnotation(validAnnotation);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate coordinate boundaries', () => {
    const invalidCoordinates = {
      timestamp: 10.5,
      coordinates: [{ x: -1, y: 100 }, { x: 200, y: 200 }],
      type: 'line' as const
    };

    const result = validateAnnotation(invalidCoordinates);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('validation.annotation.invalidCoordinates');
  });

  it('should validate text length constraints', () => {
    const longText = 'a'.repeat(501);
    const invalidAnnotation = {
      timestamp: 10.5,
      text: longText,
      coordinates: [{ x: 100, y: 100 }],
      type: 'arrow' as const
    };

    const result = validateAnnotation(invalidAnnotation);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('validation.annotation.invalidTextLength');
  });

  it('should validate stroke width range', () => {
    const invalidStrokeWidth = {
      timestamp: 10.5,
      coordinates: [{ x: 100, y: 100 }],
      strokeWidth: 25,
      type: 'rectangle' as const
    };

    const result = validateAnnotation(invalidStrokeWidth);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('validation.annotation.invalidStrokeWidth');
  });

  it('should validate color format', () => {
    const invalidColor = {
      timestamp: 10.5,
      coordinates: [{ x: 100, y: 100 }],
      color: 'invalid',
      type: 'freehand' as const
    };

    const result = validateAnnotation(invalidColor);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('validation.annotation.invalidColor');
  });
});