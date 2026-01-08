/**
 * Hook for handling errors with toast notifications
 */
import { useCallback } from 'react';
import { useToast } from './use-toast';
import { handleError } from '@/lib/errorHandling';
import { Button } from '@/components/ui/button';

interface UseErrorHandlerOptions {
  /** Default title for error toasts */
  defaultTitle?: string;
  /** Context to include in error reports */
  context?: Record<string, unknown>;
}

export function useErrorHandler(options: UseErrorHandlerOptions = {}) {
  const { toast } = useToast();
  const { defaultTitle = 'Error', context = {} } = options;

  const showError = useCallback(
    (error: unknown, customTitle?: string, onRetry?: () => void) => {
      const { message, suggestion } = handleError(error, {
        context,
      });

      const action = onRetry
        ? <Button onClick={onRetry} size="sm" variant="outline">
            Retry
          </Button>
        : suggestion
        ? <div className="text-xs text-slate-400 mt-1">{suggestion}</div>
        : undefined;

      toast({
        title: customTitle || defaultTitle,
        description: message,
        variant: 'destructive',
        action,
        duration: 7000,
      });
    },
    [toast, defaultTitle, context]
  );

  const showSuccess = useCallback(
    (title: string, description?: string) => {
      toast({
        title,
        description,
        duration: 3000,
      });
    },
    [toast]
  );

  const withErrorHandling = useCallback(
    <T,>(
      asyncFn: () => Promise<T>,
      options?: {
        onSuccess?: (result: T) => void;
        onError?: (error: unknown) => void;
        errorTitle?: string;
        successTitle?: string;
        successDescription?: string;
      }
    ): Promise<T | undefined> => {
      return asyncFn()
        .then((result) => {
          if (options?.onSuccess) {
            options.onSuccess(result);
          }
          if (options?.successTitle) {
            showSuccess(options.successTitle, options.successDescription);
          }
          return result;
        })
        .catch((error) => {
          showError(error, options?.errorTitle);
          if (options?.onError) {
            options.onError(error);
          }
          return undefined;
        });
    },
    [showError, showSuccess]
  );

  return {
    showError,
    showSuccess,
    withErrorHandling,
  };
}
