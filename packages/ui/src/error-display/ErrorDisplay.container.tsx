import { useCallback } from 'react';
import { ErrorDisplay } from './ErrorDisplay';

interface ErrorDisplayContainerProps {
  error: Error | unknown
  resetError?: () => void
  onGoBack?: () => void
  showDetails?: boolean
}

export function ErrorDisplayContainer({
  error,
  resetError,
  onGoBack,
  showDetails = false,
}: ErrorDisplayContainerProps) {
  // Format error for display
  const errorMessage =
    error instanceof Error ? error.message : 'An unexpected error occurred';

  const errorStack = error instanceof Error ? error.stack : undefined;
  const errorName = error instanceof Error ? error.name : 'Error';

  // Handle retry action
  const handleRetry = useCallback(() => {
    if (resetError) {
      resetError();
    }
    else {
      // Fallback: reload page
      if (typeof window !== 'undefined') window.location.reload();
    }
  }, [resetError]);

  const handleGoBack = useCallback(() => {
    if (onGoBack) {
      onGoBack();
    }
    else if (typeof window !== 'undefined') {
      window.history.back();
    }
  }, [onGoBack]);

  return (
    <ErrorDisplay
      title={errorName}
      message={errorMessage}
      stack={errorStack}
      showStack={showDetails}
      onRetry={handleRetry}
      onGoBack={handleGoBack}
    />
  );
}
