import { useState, useCallback, useRef } from 'react'; // v18.2.0
import * as yup from 'yup'; // v1.3.2
import { debounce } from 'lodash'; // v4.17.21
import { validateEmail, validatePassword } from '../utils/validation';
import { useNotification, NotificationType } from './useNotification';

// Constants for form validation
const VALIDATION_DEBOUNCE_MS = 300;
const ARIA_INVALID = 'aria-invalid';
const ARIA_ERRORMESSAGE = 'aria-errormessage';

// Types for form state management
export type FormValues = Record<string, any>;
export type FormErrors<T> = Partial<Record<keyof T, string>>;
export type TouchedFields<T> = Partial<Record<keyof T, boolean>>;
export type DirtyFields<T> = Partial<Record<keyof T, boolean>>;

// Interface for form options
interface FormOptions {
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  debounceMs?: number;
  shouldDisplayError?: (fieldName: string) => boolean;
}

// Default form options
const defaultOptions: FormOptions = {
  validateOnChange: true,
  validateOnBlur: true,
  debounceMs: VALIDATION_DEBOUNCE_MS,
  shouldDisplayError: () => true,
};

/**
 * Enhanced form management hook with comprehensive validation and accessibility support
 */
export const useForm = <T extends FormValues>(
  initialValues: T,
  validationSchema: yup.ObjectSchema<T>,
  onSubmit: (values: T) => Promise<void>,
  options: FormOptions = defaultOptions
) => {
  // Form state
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FormErrors<T>>({});
  const [touched, setTouched] = useState<TouchedFields<T>>({});
  const [dirty, setDirty] = useState<DirtyFields<T>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs for validation
  const validationTimer = useRef<NodeJS.Timeout>();
  const { showNotification } = useNotification();

  // Debounced validation function
  const debouncedValidate = useRef(
    debounce(async (fieldName: keyof T, value: any) => {
      try {
        await validationSchema.validateAt(fieldName as string, { [fieldName]: value });
        setErrors(prev => ({ ...prev, [fieldName]: undefined }));
      } catch (error) {
        if (error instanceof yup.ValidationError) {
          setErrors(prev => ({ ...prev, [fieldName]: error.message }));
          if (options.shouldDisplayError?.(fieldName as string)) {
            showNotification(error.message, NotificationType.ERROR);
          }
        }
      }
    }, options.debounceMs || VALIDATION_DEBOUNCE_MS)
  ).current;

  /**
   * Validates a specific field with enhanced validation support
   */
  const validateField = useCallback(async (fieldName: keyof T) => {
    const value = values[fieldName];

    // Special validation for common fields
    if (fieldName === 'email') {
      const result = await validateEmail(value);
      if (!result.isValid) {
        setErrors(prev => ({ ...prev, [fieldName]: result.errors[0] }));
        return false;
      }
    } else if (fieldName === 'password') {
      const result = await validatePassword(value);
      if (!result.isValid) {
        setErrors(prev => ({ ...prev, [fieldName]: result.errors[0] }));
        return false;
      }
    } else {
      try {
        await validationSchema.validateAt(fieldName as string, values);
        setErrors(prev => ({ ...prev, [fieldName]: undefined }));
        return true;
      } catch (error) {
        if (error instanceof yup.ValidationError) {
          setErrors(prev => ({ ...prev, [fieldName]: error.message }));
          return false;
        }
      }
    }
    return true;
  }, [values, validationSchema]);

  /**
   * Handles form field changes with validation
   */
  const handleChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = event.target;
    const fieldValue = type === 'checkbox' ? event.target.checked : value;

    setValues(prev => ({ ...prev, [name]: fieldValue }));
    setDirty(prev => ({ ...prev, [name]: true }));

    if (options.validateOnChange) {
      debouncedValidate(name as keyof T, fieldValue);
    }
  }, [options.validateOnChange, debouncedValidate]);

  /**
   * Handles field blur events with validation
   */
  const handleBlur = useCallback(async (event: React.FocusEvent<HTMLInputElement>) => {
    const { name } = event.target;
    setTouched(prev => ({ ...prev, [name]: true }));

    if (options.validateOnBlur) {
      await validateField(name as keyof T);
    }
  }, [options.validateOnBlur, validateField]);

  /**
   * Handles form submission with comprehensive validation
   */
  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const validatedValues = await validationSchema.validate(values, { abortEarly: false });
      await onSubmit(validatedValues);
      setErrors({});
    } catch (error) {
      if (error instanceof yup.ValidationError) {
        const validationErrors: FormErrors<T> = {};
        error.inner.forEach(err => {
          if (err.path) {
            validationErrors[err.path as keyof T] = err.message;
          }
        });
        setErrors(validationErrors);
        showNotification('Please fix the form errors', NotificationType.ERROR);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validationSchema, onSubmit]);

  /**
   * Resets form to initial state
   */
  const resetForm = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setDirty({});
    setIsSubmitting(false);
  }, [initialValues]);

  /**
   * Sets a field value programmatically
   */
  const setFieldValue = useCallback((fieldName: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [fieldName]: value }));
    setDirty(prev => ({ ...prev, [fieldName]: true }));
    if (options.validateOnChange) {
      debouncedValidate(fieldName, value);
    }
  }, [options.validateOnChange, debouncedValidate]);

  /**
   * Gets props for a form field with accessibility attributes
   */
  const getFieldProps = useCallback((fieldName: keyof T) => {
    const error = errors[fieldName];
    const errorId = `${fieldName as string}-error`;

    return {
      name: fieldName,
      value: values[fieldName],
      onChange: handleChange,
      onBlur: handleBlur,
      [ARIA_INVALID]: !!error,
      ...(error && { [ARIA_ERRORMESSAGE]: errorId }),
      'data-testid': `form-field-${fieldName}`,
    };
  }, [values, errors, handleChange, handleBlur]);

  return {
    values,
    errors,
    touched,
    dirty,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
    resetForm,
    validateField,
    setFieldValue,
    getFieldProps,
  };
};