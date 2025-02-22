import Joi from 'joi'; // v17.11.0
import sanitizeHtml from 'sanitize-html'; // v2.11.0
import fileType from 'file-type'; // v16.5.4
import { ApiError } from '../errors/api.error';
import { PaginationParams, AnnotationType } from '../types';

// Global constants for validation rules
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
const MAX_ANNOTATION_LENGTH = 1000;
const MAX_VALIDATION_ATTEMPTS = 5;
const VALIDATION_TIMEOUT = 5000;

// Validation schemas
const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).required(),
  limit: Joi.number().integer().min(1).max(100).required(),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional()
});

const emailSchema = Joi.string()
  .email({ minDomainSegments: 2, tlds: { allow: true } })
  .required();

const annotationSchema = Joi.object({
  type: Joi.string().valid(...Object.values(AnnotationType)).required(),
  timestamp: Joi.number().min(0).required(),
  content: Joi.alternatives().conditional('type', {
    switch: [
      {
        is: AnnotationType.TEXT,
        then: Joi.string().max(MAX_ANNOTATION_LENGTH).required()
      },
      {
        is: AnnotationType.DRAWING,
        then: Joi.object({
          coordinates: Joi.array().items(
            Joi.object({
              x: Joi.number().required(),
              y: Joi.number().required()
            })
          ).required(),
          style: Joi.object({
            color: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).required(),
            thickness: Joi.number().min(1).max(20).required()
          }).required()
        })
      },
      {
        is: AnnotationType.VOICE,
        then: Joi.object({
          duration: Joi.number().min(1).required(),
          format: Joi.string().valid('mp3', 'wav').required()
        })
      }
    ]
  }).required()
});

/**
 * Validates pagination parameters for API requests
 * @param params - Pagination parameters to validate
 * @returns true if validation passes, throws ApiError if fails
 */
export const validatePaginationParams = (params: PaginationParams): boolean => {
  try {
    const { error } = paginationSchema.validate(params, { abortEarly: false });
    if (error) {
      throw ApiError.badRequest('Invalid pagination parameters', {
        details: error.details.map(detail => ({
          field: detail.context?.key,
          message: detail.message
        }))
      });
    }
    return true;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.badRequest('Pagination validation failed');
  }
};

/**
 * Validates video file uploads with enhanced security checks
 * @param file - Uploaded file to validate
 * @returns true if validation passes, throws ApiError if fails
 */
export const validateVideoUpload = async (file: Express.Multer.File): Promise<boolean> => {
  try {
    // Check file existence and size
    if (!file || !file.buffer) {
      throw ApiError.badRequest('No file provided');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw ApiError.badRequest('File size exceeds maximum allowed size');
    }

    // Validate file type
    const fileTypeResult = await fileType.fromBuffer(file.buffer);
    if (!fileTypeResult || !ALLOWED_VIDEO_TYPES.includes(fileTypeResult.mime)) {
      throw ApiError.badRequest('Invalid file type');
    }

    // Additional video integrity checks could be added here
    // Such as codec validation, frame analysis, etc.

    return true;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.badRequest('Video validation failed');
  }
};

/**
 * Validates video annotation data with content-specific checks
 * @param annotationData - Annotation data to validate
 * @returns true if validation passes, throws ApiError if fails
 */
export const validateAnnotation = (annotationData: any): boolean => {
  try {
    const { error } = annotationSchema.validate(annotationData, { abortEarly: false });
    if (error) {
      throw ApiError.badRequest('Invalid annotation data', {
        details: error.details.map(detail => ({
          field: detail.context?.key,
          message: detail.message
        }))
      });
    }

    // Additional type-specific validation
    if (annotationData.type === AnnotationType.TEXT) {
      annotationData.content = sanitizeHtml(annotationData.content, {
        allowedTags: [],
        allowedAttributes: {}
      });
    }

    return true;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.badRequest('Annotation validation failed');
  }
};

/**
 * Validates email format with enhanced security checks
 * @param email - Email address to validate
 * @returns true if validation passes, throws ApiError if fails
 */
export const validateEmail = (email: string): boolean => {
  try {
    const { error } = emailSchema.validate(email);
    if (error) {
      throw ApiError.badRequest('Invalid email format');
    }

    // Additional email validation checks
    const [localPart, domain] = email.split('@');
    
    // Check local part length
    if (localPart.length > 64) {
      throw ApiError.badRequest('Email local part too long');
    }

    // Check domain length
    if (domain.length > 255) {
      throw ApiError.badRequest('Email domain too long');
    }

    // Check for common disposable email domains
    const disposableDomains = ['tempmail.com', 'throwaway.com'];
    if (disposableDomains.some(d => domain.toLowerCase().includes(d))) {
      throw ApiError.badRequest('Disposable email addresses not allowed');
    }

    return true;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.badRequest('Email validation failed');
  }
};