/**
 * Core API client library for the Video Coaching Platform
 * Provides centralized interface for making HTTP requests with comprehensive error handling
 * @version 1.0.0
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios'; // ^1.6.0
import { API_ROUTES, API_TIMEOUT, REQUEST_CONFIG, HTTP_STATUS } from '../constants/api';
import { ApiResponse, ApiError, HttpStatusCode } from '../types/common';

/**
 * Configuration interface for API client initialization
 */
interface ApiClientConfig extends AxiosRequestConfig {
  enableRetry?: boolean;
  maxRetries?: number;
  csrfEnabled?: boolean;
  rateLimitWindowMs?: number;
}

/**
 * Enhanced request configuration with additional options
 */
interface RequestConfig extends AxiosRequestConfig {
  skipRetry?: boolean;
  skipRateLimit?: boolean;
}

/**
 * Core API client class for handling HTTP requests with comprehensive error handling
 */
export class ApiClient {
  private axiosInstance: AxiosInstance;
  private retryCount: number = 0;
  private currentDelay: number = 1000;
  private rateLimitMap: Map<string, { count: number; timestamp: number }> = new Map();
  private readonly maxRetries: number;
  private readonly rateLimitWindowMs: number;

  constructor(baseURL: string, config: ApiClientConfig = {}) {
    const {
      enableRetry = true,
      maxRetries = 3,
      csrfEnabled = true,
      rateLimitWindowMs = 60000,
      ...axiosConfig
    } = config;

    this.maxRetries = maxRetries;
    this.rateLimitWindowMs = rateLimitWindowMs;

    this.axiosInstance = axios.create({
      baseURL,
      timeout: API_TIMEOUT,
      ...REQUEST_CONFIG,
      ...axiosConfig
    });

    this.setupInterceptors(csrfEnabled);
  }

  /**
   * Configure request/response interceptors for the API client
   */
  private setupInterceptors(csrfEnabled: boolean): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Add CSRF token if enabled
        if (csrfEnabled && typeof window !== 'undefined') {
          const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
          if (csrfToken) {
            config.headers['X-CSRF-Token'] = csrfToken;
          }
        }

        // Add authorization header if token exists
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => {
        return {
          success: true,
          data: response.data,
          error: null,
          statusCode: response.status
        } as ApiResponse<unknown>;
      },
      (error) => this.handleError(error)
    );
  }

  /**
   * Check rate limit for the given endpoint
   */
  private checkRateLimit(endpoint: string): boolean {
    const now = Date.now();
    const rateLimit = this.rateLimitMap.get(endpoint);

    if (!rateLimit) {
      this.rateLimitMap.set(endpoint, { count: 1, timestamp: now });
      return true;
    }

    if (now - rateLimit.timestamp > this.rateLimitWindowMs) {
      this.rateLimitMap.set(endpoint, { count: 1, timestamp: now });
      return true;
    }

    if (rateLimit.count >= 100) { // Rate limit of 100 requests per window
      return false;
    }

    rateLimit.count++;
    return true;
  }

  /**
   * Make a GET request with comprehensive error handling and retry logic
   */
  public async get<T>(url: string, config: RequestConfig = {}): Promise<ApiResponse<T>> {
    if (!config.skipRateLimit && !this.checkRateLimit(url)) {
      throw new Error('Rate limit exceeded');
    }

    try {
      const response = await this.axiosInstance.get<T>(url, config);
      return response as ApiResponse<T>;
    } catch (error) {
      return this.handleError(error as AxiosError);
    }
  }

  /**
   * Make a POST request with data validation and retry logic
   */
  public async post<T, R>(url: string, data: T, config: RequestConfig = {}): Promise<ApiResponse<R>> {
    if (!config.skipRateLimit && !this.checkRateLimit(url)) {
      throw new Error('Rate limit exceeded');
    }

    try {
      const response = await this.axiosInstance.post<R>(url, data, config);
      return response as ApiResponse<R>;
    } catch (error) {
      return this.handleError(error as AxiosError);
    }
  }

  /**
   * Make a PUT request with data validation and retry logic
   */
  public async put<T, R>(url: string, data: T, config: RequestConfig = {}): Promise<ApiResponse<R>> {
    if (!config.skipRateLimit && !this.checkRateLimit(url)) {
      throw new Error('Rate limit exceeded');
    }

    try {
      const response = await this.axiosInstance.put<R>(url, data, config);
      return response as ApiResponse<R>;
    } catch (error) {
      return this.handleError(error as AxiosError);
    }
  }

  /**
   * Make a DELETE request with retry logic
   */
  public async delete<T>(url: string, config: RequestConfig = {}): Promise<ApiResponse<T>> {
    if (!config.skipRateLimit && !this.checkRateLimit(url)) {
      throw new Error('Rate limit exceeded');
    }

    try {
      const response = await this.axiosInstance.delete<T>(url, config);
      return response as ApiResponse<T>;
    } catch (error) {
      return this.handleError(error as AxiosError);
    }
  }

  /**
   * Sophisticated error handling with retry logic and exponential backoff
   */
  private async handleError(error: AxiosError): Promise<never> {
    const isRetryable = (status?: number): boolean => {
      return status ? [408, 429, 500, 502, 503, 504].includes(status) : true;
    };

    const axiosError = error as AxiosError<ApiError>;
    const status = axiosError.response?.status;
    const shouldRetry = !axiosError.config?.skipRetry && 
                       this.retryCount < this.maxRetries && 
                       isRetryable(status);

    if (shouldRetry) {
      this.retryCount++;
      this.currentDelay *= 2; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, this.currentDelay));
      
      return this.axiosInstance.request(axiosError.config!);
    }

    // Reset retry count and delay
    this.retryCount = 0;
    this.currentDelay = 1000;

    const errorResponse: ApiResponse<never> = {
      success: false,
      data: null as never,
      error: {
        code: status?.toString() || '500',
        message: axiosError.response?.data?.message || 'An unexpected error occurred',
        details: axiosError.response?.data?.details || {},
        stack: process.env.NODE_ENV === 'development' ? axiosError.stack : undefined
      },
      metadata: {},
      statusCode: status || HttpStatusCode.INTERNAL_SERVER_ERROR
    };

    throw errorResponse;
  }
}

// Export singleton instance with default configuration
export const apiClient = new ApiClient(process.env.NEXT_PUBLIC_API_URL || '', {
  enableRetry: true,
  maxRetries: 3,
  csrfEnabled: true,
  rateLimitWindowMs: 60000
});