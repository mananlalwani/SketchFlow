/**
 * Centralized error handling with user-friendly messages
 */
import { reportError } from './errorReporting';
import type { ErrorContext } from './errorReporting';

export type ErrorInput = Error | string | null | undefined;

export class NetworkError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Convert technical errors into user-friendly messages
 */
export function getUserFriendlyErrorMessage(error: ErrorInput): string {
  if (error instanceof NetworkError) {
    if (error.statusCode === 404) {
      return 'The requested resource was not found.';
    }
    if (error.statusCode === 403) {
      return 'You do not have permission to access this resource.';
    }
    if (error.statusCode === 401) {
      return 'Please sign in to continue.';
    }
    if (error.statusCode && error.statusCode >= 500) {
      return 'Server error. Please try again later.';
    }
    return 'Network error. Please check your internet connection and try again.';
  }

  if (error instanceof AuthenticationError) {
    return 'Authentication failed. Please sign in again.';
  }

  if (error instanceof ValidationError) {
    return error.message; // Validation errors are already user-friendly
  }

  if (error instanceof StorageError) {
    return 'Failed to save data locally. Your browser storage may be full.';
  }

  if (error instanceof Error) {
    // Check for common error patterns
    if (error.message.includes('fetch')) {
      return 'Network error. Please check your internet connection.';
    }
    if (error.message.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }
    if (error.message.includes('quota')) {
      return 'Storage quota exceeded. Please clear some space.';
    }

    // Generic error message
    return 'An unexpected error occurred. Please try again.';
  }

  return 'An unknown error occurred. Please try again.';
}

/**
 * Get an action suggestion based on the error type
 */
export function getErrorActionSuggestion(error: ErrorInput): string | null {
  if (error instanceof NetworkError) {
    if (error.statusCode && error.statusCode >= 500) {
      return 'Wait a moment and try again';
    }
    return 'Check your connection and retry';
  }

  if (error instanceof AuthenticationError) {
    return 'Sign in to continue';
  }

  if (error instanceof StorageError) {
    return 'Your work is safe in the cloud';
  }

  return 'Retry the action';
}

interface ErrorHandlerOptions {
  /** Show toast notification */
  showToast?: boolean;
  /** Toast variant */
  toastVariant?: 'default' | 'destructive';
  /** Custom user message */
  userMessage?: string;
  /** Context for error reporting */
  context?: ErrorContext;
  /** Callback for retry action */
  onRetry?: () => void;
}

export interface ErrorHandlingResult {
  message: string;
  suggestion: string | null;
}

/**
 * Central error handler that reports errors and optionally shows user feedback
 */
export function handleError(
  error: ErrorInput,
  options: ErrorHandlerOptions = {},
): ErrorHandlingResult {
  const { context = {}, userMessage } = options;

  // Report error for tracking
  reportError(error instanceof Error ? error : new Error(error ?? 'Unknown error'), context);

  // Get user-friendly messages
  const message = userMessage || getUserFriendlyErrorMessage(error);
  const suggestion = getErrorActionSuggestion(error);

  return { message, suggestion };
}

/**
 * Parse HTTP error responses
 */
export async function parseHttpError(response: Response): Promise<NetworkError> {
  let message = response.statusText;

  try {
    const data = await response.json();
    if (data.error) {
      message = data.error;
    } else if (data.message) {
      message = data.message;
    }
  } catch {
    // Couldn't parse JSON, use status text
  }

  return new NetworkError(message, response.status);
}
