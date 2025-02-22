/**
 * @fileoverview Centralized route definitions for the Video Coaching Platform web application.
 * @version 1.0.0
 */

/**
 * Type definitions for route parameters
 */
type RouteParams = Record<string, string>;

/**
 * Authentication related route constants
 */
export const AUTH_ROUTES = {
  LOGIN: '/login',
  SIGNUP: '/signup',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password/:token',
  VERIFY_EMAIL: '/verify-email/:token',
  MFA_SETUP: '/mfa-setup',
  MFA_VERIFY: '/mfa-verify'
} as const;

/**
 * Dashboard navigation route constants
 */
export const DASHBOARD_ROUTES = {
  HOME: '/dashboard',
  EXPLORE: '/dashboard/explore',
  PROFILE: '/dashboard/profile',
  SETTINGS: '/dashboard/settings',
  NOTIFICATIONS: '/dashboard/notifications',
  ANALYTICS: '/dashboard/analytics'
} as const;

/**
 * Video management route constants
 */
export const VIDEO_ROUTES = {
  LIST: '/dashboard/videos',
  UPLOAD: '/dashboard/videos/upload',
  VIEW: '/dashboard/videos/:id',
  ANNOTATE: '/dashboard/videos/:id/annotate',
  REVIEW: '/dashboard/videos/:id/review',
  ANALYTICS: '/dashboard/videos/:id/analytics',
  COMMENTS: '/dashboard/videos/:id/comments',
  SHARE: '/dashboard/videos/:id/share'
} as const;

/**
 * Coach profile and management route constants
 */
export const COACH_ROUTES = {
  LIST: '/dashboard/coaches',
  PROFILE: '/dashboard/coaches/:id',
  PROGRAMS: '/dashboard/coaches/:id/programs',
  PROGRAM_CREATE: '/dashboard/coaches/:id/programs/create',
  PROGRAM_EDIT: '/dashboard/coaches/:id/programs/:programId/edit',
  STUDENTS: '/dashboard/coaches/:id/students',
  EARNINGS: '/dashboard/coaches/:id/earnings',
  SCHEDULE: '/dashboard/coaches/:id/schedule'
} as const;

/**
 * Chat and messaging route constants
 */
export const CHAT_ROUTES = {
  LIST: '/dashboard/chat',
  THREAD: '/dashboard/chat/:id',
  GROUP_CREATE: '/dashboard/chat/group/create',
  GROUP_MANAGE: '/dashboard/chat/group/:id/manage',
  MEDIA: '/dashboard/chat/:id/media',
  SEARCH: '/dashboard/chat/search'
} as const;

/**
 * Payment and subscription route constants
 */
export const PAYMENT_ROUTES = {
  OVERVIEW: '/dashboard/payments',
  SUBSCRIPTION: '/dashboard/payments/subscription',
  HISTORY: '/dashboard/payments/history',
  METHODS: '/dashboard/payments/methods',
  ADD_METHOD: '/dashboard/payments/methods/add',
  INVOICES: '/dashboard/payments/invoices',
  PAYOUT_SETUP: '/dashboard/payments/payout/setup',
  PAYOUT_HISTORY: '/dashboard/payments/payout/history'
} as const;

/**
 * Type-safe utility function for generating dynamic route paths
 * @param route - The route pattern containing parameter placeholders
 * @param params - Object containing parameter values to replace in the route
 * @returns Compiled route with parameters replaced
 * @throws Error if required parameters are missing or invalid
 */
export const generatePath = (route: string, params: RouteParams): string => {
  if (!route.startsWith('/')) {
    throw new Error('Route must start with a forward slash');
  }

  const paramPlaceholders = route.match(/:[a-zA-Z]+/g) || [];
  const requiredParams = paramPlaceholders.map(p => p.slice(1));

  // Validate all required parameters are provided
  const missingParams = requiredParams.filter(param => !(param in params));
  if (missingParams.length > 0) {
    throw new Error(`Missing required parameters: ${missingParams.join(', ')}`);
  }

  // Replace parameters in route
  return requiredParams.reduce((path, param) => {
    const value = params[param];
    if (!value) return path;
    return path.replace(`:${param}`, encodeURIComponent(value));
  }, route);
};

/**
 * Validates if a given route string matches the application's route patterns
 * @param route - Route string to validate
 * @returns Boolean indicating if route is valid
 */
export const isValidRoute = (route: string): boolean => {
  if (!route.startsWith('/')) return false;

  // Combine all route patterns for validation
  const allRoutes = [
    ...Object.values(AUTH_ROUTES),
    ...Object.values(DASHBOARD_ROUTES),
    ...Object.values(VIDEO_ROUTES),
    ...Object.values(COACH_ROUTES),
    ...Object.values(CHAT_ROUTES),
    ...Object.values(PAYMENT_ROUTES)
  ];

  // Convert route patterns to regex for matching
  const routePattern = route.replace(/:[a-zA-Z]+/g, '[^/]+');
  const routeRegex = new RegExp(`^${routePattern}$`);

  return allRoutes.some(definedRoute => {
    const definedPattern = definedRoute.replace(/:[a-zA-Z]+/g, '[^/]+');
    const definedRegex = new RegExp(`^${definedPattern}$`);
    return definedRegex.test(route);
  });
};

/**
 * Type definitions for route constants
 */
export type AuthRoutes = typeof AUTH_ROUTES;
export type DashboardRoutes = typeof DASHBOARD_ROUTES;
export type VideoRoutes = typeof VIDEO_ROUTES;
export type CoachRoutes = typeof COACH_ROUTES;
export type ChatRoutes = typeof CHAT_ROUTES;
export type PaymentRoutes = typeof PAYMENT_ROUTES;