import * as yup from 'yup'; // v1.3.2
import i18next from 'i18next'; // v23.7.6
import { UserRole } from '../types/common';
import { LoginCredentials, SignupData } from '../types/auth';

/**
 * Interface for validation results with detailed error information
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Constants for validation rules
 */
const VALIDATION_CONSTANTS = {
  EMAIL: {
    MIN_LENGTH: 5,
    MAX_LENGTH: 254,
    PATTERN: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  },
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 32,
    SPECIAL_CHARS: '!@#$%^&*(),.?":{}|<>',
    PATTERNS_TO_AVOID: [
      '123456', 'password', 'qwerty', 'admin'
    ]
  },
  VIDEO: {
    MAX_SIZE_MB: 100,
    MAX_DURATION_MINUTES: 30,
    ALLOWED_TYPES: ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
    MIN_RESOLUTION: { width: 640, height: 480 },
    MAX_RESOLUTION: { width: 3840, height: 2160 }
  },
  ANNOTATION: {
    TEXT_MIN_LENGTH: 1,
    TEXT_MAX_LENGTH: 500,
    STROKE_WIDTH_RANGE: { min: 1, max: 20 }
  }
};

/**
 * Schema for email validation using yup
 */
const emailSchema = yup.string()
  .required(i18next.t('validation.email.required'))
  .min(
    VALIDATION_CONSTANTS.EMAIL.MIN_LENGTH,
    i18next.t('validation.email.tooShort')
  )
  .max(
    VALIDATION_CONSTANTS.EMAIL.MAX_LENGTH,
    i18next.t('validation.email.tooLong')
  )
  .matches(
    VALIDATION_CONSTANTS.EMAIL.PATTERN,
    i18next.t('validation.email.invalid')
  );

/**
 * Schema for password validation using yup
 */
const passwordSchema = yup.string()
  .required(i18next.t('validation.password.required'))
  .min(
    VALIDATION_CONSTANTS.PASSWORD.MIN_LENGTH,
    i18next.t('validation.password.tooShort')
  )
  .max(
    VALIDATION_CONSTANTS.PASSWORD.MAX_LENGTH,
    i18next.t('validation.password.tooLong')
  )
  .matches(/[A-Z]/, i18next.t('validation.password.upperCase'))
  .matches(/[a-z]/, i18next.t('validation.password.lowerCase'))
  .matches(/[0-9]/, i18next.t('validation.password.number'))
  .matches(
    new RegExp(`[${VALIDATION_CONSTANTS.PASSWORD.SPECIAL_CHARS}]`),
    i18next.t('validation.password.specialChar')
  );

/**
 * Validates email format with comprehensive pattern matching and domain verification
 * @param email - Email address to validate
 * @returns ValidationResult with detailed error messages
 */
export const validateEmail = async (email: string): Promise<ValidationResult> => {
  const errors: string[] = [];
  
  try {
    await emailSchema.validate(email);
    
    // Additional checks for common typos
    if (email.includes('..')) {
      errors.push(i18next.t('validation.email.consecutiveDots'));
    }
    
    if (email.split('@').length > 2) {
      errors.push(i18next.t('validation.email.multipleAt'));
    }
    
    const [localPart, domain] = email.split('@');
    if (localPart.length > 64) {
      errors.push(i18next.t('validation.email.localPartTooLong'));
    }
    
    if (domain && !domain.includes('.')) {
      errors.push(i18next.t('validation.email.invalidDomain'));
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      errors.push(error.message);
    } else {
      errors.push(i18next.t('validation.email.unknown'));
    }
    
    return {
      isValid: false,
      errors
    };
  }
};

/**
 * Enhanced password validation with comprehensive security checks
 * @param password - Password to validate
 * @returns ValidationResult with detailed error messages
 */
export const validatePassword = async (password: string): Promise<ValidationResult> => {
  const errors: string[] = [];
  
  try {
    await passwordSchema.validate(password);
    
    // Check for repeated characters
    const repeatedChars = /(.)\1{3,}/;
    if (repeatedChars.test(password)) {
      errors.push(i18next.t('validation.password.repeatedChars'));
    }
    
    // Check for common patterns
    for (const pattern of VALIDATION_CONSTANTS.PASSWORD.PATTERNS_TO_AVOID) {
      if (password.toLowerCase().includes(pattern)) {
        errors.push(i18next.t('validation.password.commonPattern'));
        break;
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      errors.push(error.message);
    } else {
      errors.push(i18next.t('validation.password.unknown'));
    }
    
    return {
      isValid: false,
      errors
    };
  }
};

/**
 * Comprehensive video file validation before upload
 * @param file - Video file to validate
 * @returns ValidationResult with errors and warnings
 */
export const validateVideoUpload = async (file: File): Promise<ValidationResult> => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check file existence and size
  if (!file) {
    errors.push(i18next.t('validation.video.required'));
    return { isValid: false, errors, warnings };
  }
  
  if (file.size > VALIDATION_CONSTANTS.VIDEO.MAX_SIZE_MB * 1024 * 1024) {
    errors.push(i18next.t('validation.video.tooLarge'));
  }
  
  // Validate file type
  if (!VALIDATION_CONSTANTS.VIDEO.ALLOWED_TYPES.includes(file.type)) {
    errors.push(i18next.t('validation.video.invalidType'));
  }
  
  try {
    // Create video element for metadata validation
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
      video.src = URL.createObjectURL(file);
    });
    
    // Validate duration
    if (video.duration > VALIDATION_CONSTANTS.VIDEO.MAX_DURATION_MINUTES * 60) {
      errors.push(i18next.t('validation.video.tooLong'));
    }
    
    // Validate resolution
    if (
      video.videoWidth < VALIDATION_CONSTANTS.VIDEO.MIN_RESOLUTION.width ||
      video.videoHeight < VALIDATION_CONSTANTS.VIDEO.MIN_RESOLUTION.height
    ) {
      errors.push(i18next.t('validation.video.lowResolution'));
    }
    
    if (
      video.videoWidth > VALIDATION_CONSTANTS.VIDEO.MAX_RESOLUTION.width ||
      video.videoHeight > VALIDATION_CONSTANTS.VIDEO.MAX_RESOLUTION.height
    ) {
      warnings.push(i18next.t('validation.video.highResolution'));
    }
    
    URL.revokeObjectURL(video.src);
  } catch (error) {
    errors.push(i18next.t('validation.video.corrupted'));
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Validates video annotation data with boundary and content checks
 * @param annotationData - Annotation data to validate
 * @returns ValidationResult with detailed error messages
 */
export const validateAnnotation = (annotationData: {
  timestamp: number;
  text?: string;
  coordinates: { x: number; y: number }[];
  strokeWidth?: number;
  color?: string;
  type: 'freehand' | 'line' | 'arrow' | 'rectangle';
}): ValidationResult => {
  const errors: string[] = [];
  
  // Validate timestamp
  if (typeof annotationData.timestamp !== 'number' || annotationData.timestamp < 0) {
    errors.push(i18next.t('validation.annotation.invalidTimestamp'));
  }
  
  // Validate text length if present
  if (annotationData.text !== undefined) {
    if (
      annotationData.text.length < VALIDATION_CONSTANTS.ANNOTATION.TEXT_MIN_LENGTH ||
      annotationData.text.length > VALIDATION_CONSTANTS.ANNOTATION.TEXT_MAX_LENGTH
    ) {
      errors.push(i18next.t('validation.annotation.invalidTextLength'));
    }
  }
  
  // Validate coordinates
  if (!Array.isArray(annotationData.coordinates) || annotationData.coordinates.length === 0) {
    errors.push(i18next.t('validation.annotation.missingCoordinates'));
  } else {
    for (const coord of annotationData.coordinates) {
      if (
        typeof coord.x !== 'number' ||
        typeof coord.y !== 'number' ||
        coord.x < 0 ||
        coord.y < 0
      ) {
        errors.push(i18next.t('validation.annotation.invalidCoordinates'));
        break;
      }
    }
  }
  
  // Validate stroke width if present
  if (annotationData.strokeWidth !== undefined) {
    if (
      annotationData.strokeWidth < VALIDATION_CONSTANTS.ANNOTATION.STROKE_WIDTH_RANGE.min ||
      annotationData.strokeWidth > VALIDATION_CONSTANTS.ANNOTATION.STROKE_WIDTH_RANGE.max
    ) {
      errors.push(i18next.t('validation.annotation.invalidStrokeWidth'));
    }
  }
  
  // Validate color if present
  if (annotationData.color !== undefined) {
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (!colorRegex.test(annotationData.color)) {
      errors.push(i18next.t('validation.annotation.invalidColor'));
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};