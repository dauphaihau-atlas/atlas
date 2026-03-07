import { ErrorDisplay } from './ErrorDisplay';

interface RouteErrorProps {
  error: Error
  reset?: () => void
  onGoBack?: () => void
  showDetails?: boolean
}

/**
 * Route-level error UI. Uses ErrorDisplay for consistent styling and behavior.
 */
export function RouteError({
  error,
  reset,
  onGoBack,
  showDetails = false,
}: RouteErrorProps) {
  const message = error.message || 'An unexpected error occurred';
  return (
    <ErrorDisplay
      title="Something went wrong"
      message={message}
      stack={error.stack}
      showStack={showDetails}
      onRetry={reset}
      onGoBack={onGoBack}
    />
  );
}
