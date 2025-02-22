/**
 * Core validation library implementing schema validation, form validation, and data validation
 * with WCAG 2.1 compliance, internationalization support, and performance optimizations.
 * @version 1.0.0
 */

import * as yup from 'yup'; // v1.3.2
import i18next from 'i18next'; // v23.7.6
import { UserRole } from '../types/common';
import { LoginCredentials, SignupData } from '../types/auth';

// Constants for validation rules
const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PASSWORD_MIN_LENGTH = 8;
const VIDEO_MAX_SIZE = 104857600; // 100MB
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/mov', 'video/avi'];
const MAX_ANNOTATION_LENGTH = 1000;

// Schema cache for performance optimization
const schemaCache = new Map<string, yup.ObjectSchema<any>>();

/**
 * Creates Yup validation schema for login form with WCAG 2.1 compliant error messages
 */
export const createLoginSchema = (): yup.ObjectSchema<LoginCredentials> => {
  const cacheKey = 'loginSchema';
  if (schemaCache.has(cacheKey)) {
    return schemaCache.get(cacheKey)!;
  }

  const schema = yup.object().shape({
    email: yup
      .string()
      .required(i18next.t('validation:email.required'))
      .matches(EMAIL_REGEX, i18next.t('validation:email.invalid'))
      .email(i18next.t('validation:email.invalid'))
      .trim()
      .lowercase()
      .meta({ 'aria-required': true }),

    password: yup
      .string()
      .required(i18next.t('validation:password.required'))
      .min(PASSWORD_MIN_LENGTH, i18next.t('validation:password.tooShort'))
      .meta({ 'aria-required': true })
  });

  schemaCache.set(cacheKey, schema);
  return schema;
};

/**
 * Creates Yup validation schema for signup form with enhanced security rules
 */
export const createSignupSchema = (): yup.ObjectSchema<SignupData> => {
  const cacheKey = 'signupSchema';
  if (schemaCache.has(cacheKey)) {
    return schemaCache.get(cacheKey)!;
  }

  const schema = yup.object().shape({
    email: yup
      .string()
      .required(i18next.t('validation:email.required'))
      .matches(EMAIL_REGEX, i18next.t('validation:email.invalid'))
      .email(i18next.t('validation:email.invalid'))
      .trim()
      .lowercase()
      .meta({ 'aria-required': true }),

    password: yup
      .string()
      .required(i18next.t('validation:password.required'))
      .min(PASSWORD_MIN_LENGTH, i18next.t('validation:password.tooShort'))
      .matches(
        PASSWORD_REGEX,
        i18next.t('validation:password.complexity')
      )
      .meta({ 'aria-required': true }),

    firstName: yup
      .string()
      .required(i18next.t('validation:firstName.required'))
      .trim()
      .min(2, i18next.t('validation:firstName.tooShort'))
      .meta({ 'aria-required': true }),

    lastName: yup
      .string()
      .required(i18next.t('validation:lastName.required'))
      .trim()
      .min(2, i18next.t('validation:lastName.tooShort'))
      .meta({ 'aria-required': true }),

    role: yup
      .string()
      .required(i18next.t('validation:role.required'))
      .oneOf(
        [UserRole.ADMIN, UserRole.COACH, UserRole.ATHLETE],
        i18next.t('validation:role.invalid')
      )
      .meta({ 'aria-required': true })
  });

  schemaCache.set(cacheKey, schema);
  return schema;
};

/**
 * Creates Yup validation schema for video uploads with metadata validation
 */
export const createVideoUploadSchema = () => {
  const cacheKey = 'videoUploadSchema';
  if (schemaCache.has(cacheKey)) {
    return schemaCache.get(cacheKey)!;
  }

  const schema = yup.object().shape({
    file: yup
      .mixed()
      .required(i18next.t('validation:video.required'))
      .test(
        'fileSize',
        i18next.t('validation:video.tooLarge'),
        value => value && value.size <= VIDEO_MAX_SIZE
      )
      .test(
        'fileType',
        i18next.t('validation:video.invalidType'),
        value => value && ALLOWED_VIDEO_TYPES.includes(value.type)
      )
      .meta({ 'aria-required': true }),

    title: yup
      .string()
      .required(i18next.t('validation:video.titleRequired'))
      .trim()
      .min(3, i18next.t('validation:video.titleTooShort'))
      .max(100, i18next.t('validation:video.titleTooLong'))
      .meta({ 'aria-required': true }),

    description: yup
      .string()
      .optional()
      .trim()
      .max(500, i18next.t('validation:video.descriptionTooLong'))
  });

  schemaCache.set(cacheKey, schema);
  return schema;
};

/**
 * Creates Yup validation schema for video annotations with coordinate validation
 */
export const createAnnotationSchema = () => {
  const cacheKey = 'annotationSchema';
  if (schemaCache.has(cacheKey)) {
    return schemaCache.get(cacheKey)!;
  }

  const schema = yup.object().shape({
    timestamp: yup
      .number()
      .required(i18next.t('validation:annotation.timestampRequired'))
      .min(0, i18next.t('validation:annotation.invalidTimestamp'))
      .meta({ 'aria-required': true }),

    coordinates: yup.array().of(
      yup.object().shape({
        x: yup.number().required().min(0).max(100),
        y: yup.number().required().min(0).max(100)
      })
    ),

    text: yup
      .string()
      .optional()
      .max(
        MAX_ANNOTATION_LENGTH,
        i18next.t('validation:annotation.textTooLong')
      ),

    drawingTool: yup
      .string()
      .required()
      .oneOf(['pen', 'arrow', 'rectangle', 'circle']),

    color: yup
      .string()
      .required()
      .matches(/^#[0-9A-Fa-f]{6}$/, i18next.t('validation:annotation.invalidColor'))
  });

  schemaCache.set(cacheKey, schema);
  return schema;
};

/**
 * Generic form validation using Yup schema with performance optimization
 * @param schema - Yup validation schema
 * @param data - Form data to validate
 * @returns Validation result with WCAG-compliant error messages
 */
export const validateForm = async <T extends object>(
  schema: yup.ObjectSchema<T>,
  data: unknown
): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
  try {
    await schema.validate(data, { abortEarly: false });
    return { isValid: true, errors: {} };
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      const errors: Record<string, string> = {};
      
      error.inner.forEach((err) => {
        if (err.path) {
          errors[err.path] = err.message;
          
          // Add ARIA attributes for accessibility
          const element = document.querySelector(`[name="${err.path}"]`);
          if (element) {
            element.setAttribute('aria-invalid', 'true');
            element.setAttribute('aria-errormessage', `${err.path}-error`);
          }
        }
      });

      // Add live region for screen readers
      const liveRegion = document.getElementById('validation-live-region');
      if (liveRegion) {
        liveRegion.textContent = Object.values(errors).join('. ');
      }

      return { isValid: false, errors };
    }
    
    // Handle unexpected errors
    console.error('Validation error:', error);
    return {
      isValid: false,
      errors: { _general: i18next.t('validation:general.error') }
    };
  }
};

// Export pre-configured schemas for common use cases
export const loginSchema = createLoginSchema();
export const signupSchema = createSignupSchema();
export const videoUploadSchema = createVideoUploadSchema();
export const annotationSchema = createAnnotationSchema();