import { Request, Response, NextFunction, RequestHandler } from 'express'; // ^4.18.2
import Joi from 'joi'; // ^17.11.0
import sanitizeHtml from 'sanitize-html'; // ^2.11.0
import { RateLimiterMemory } from 'rate-limiter-flexible'; // ^3.0.0
import { validatePaginationParams, validateVideoUpload, validateAnnotation } from '../utils/validation';
import { ApiError } from '../errors/api.error';

// Rate limiter configurations
const validationRateLimiter = new RateLimiterMemory({
  points: 100, // Number of validation attempts
  duration: 60, // Per minute
});

const videoUploadRateLimiter = new RateLimiterMemory({
  points: 10, // Number of uploads
  duration: 3600, // Per hour
});

const annotationRateLimiter = new RateLimiterMemory({
  points: 50, // Number of annotations
  duration: 60, // Per minute
});

// Validation options interface
interface ValidationOptions {
  rateLimit?: boolean;
  sanitize?: boolean;
  maxAttempts?: number;
}

/**
 * Creates a middleware function for validating request data against a Joi schema
 * @param schema - Joi validation schema
 * @param source - Request property to validate ('body' | 'query' | 'params')
 * @param options - Validation options for rate limiting and sanitization
 */
export const validateSchema = (
  schema: Joi.Schema,
  source: 'body' | 'query' | 'params' = 'body',
  options: ValidationOptions = { rateLimit: true, sanitize: true }
): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Rate limiting check
      if (options.rateLimit) {
        try {
          await validationRateLimiter.consume(req.ip);
        } catch (error) {
          throw ApiError.tooManyRequests('Too many validation attempts');
        }
      }

      // Get data to validate based on source
      const dataToValidate = req[source];

      // Sanitize input if enabled
      let sanitizedData = dataToValidate;
      if (options.sanitize) {
        sanitizedData = sanitizeInput(dataToValidate);
      }

      // Validate against schema
      const { error, value } = schema.validate(sanitizedData, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const details = error.details.map(detail => ({
          field: detail.context?.key,
          message: detail.message
        }));
        throw ApiError.badRequest('Validation failed', { details });
      }

      // Update request with validated and sanitized data
      req[source] = value;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware for validating video file uploads with security checks
 */
export const validateVideoUploadRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check upload rate limit
    await videoUploadRateLimiter.consume(req.ip);

    // Basic file presence check
    if (!req.file) {
      throw ApiError.badRequest('No video file provided');
    }

    // Validate video file
    await validateVideoUpload(req.file);
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(ApiError.badRequest('Video upload validation failed'));
    }
  }
};

/**
 * Middleware for validating video annotations with content moderation
 */
export const validateAnnotationRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check annotation rate limit
    await annotationRateLimiter.consume(req.ip);

    // Sanitize annotation content
    const sanitizedAnnotation = sanitizeAnnotationContent(req.body);

    // Validate annotation
    validateAnnotation(sanitizedAnnotation);

    // Update request with sanitized data
    req.body = sanitizedAnnotation;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(ApiError.badRequest('Annotation validation failed'));
    }
  }
};

/**
 * Helper function to sanitize input data
 */
const sanitizeInput = (data: any): any => {
  if (typeof data !== 'object') {
    return data;
  }

  const sanitized: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeHtml(value, {
        allowedTags: [],
        allowedAttributes: {}
      });
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeInput(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Helper function to sanitize annotation content
 */
const sanitizeAnnotationContent = (annotation: any): any => {
  const sanitized = { ...annotation };
  
  if (annotation.type === 'text' && annotation.content) {
    sanitized.content = sanitizeHtml(annotation.content, {
      allowedTags: [],
      allowedAttributes: {}
    });
  }

  if (annotation.type === 'drawing' && annotation.style?.color) {
    // Ensure color is a valid hex code
    sanitized.style.color = sanitized.style.color.match(/^#[0-9a-fA-F]{6}$/)
      ? sanitized.style.color
      : '#000000';
  }

  return sanitized;
};

/**
 * Middleware for validating pagination parameters
 */
export const validatePaginationRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    validatePaginationParams(req.query);
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(ApiError.badRequest('Pagination validation failed'));
    }
  }
};