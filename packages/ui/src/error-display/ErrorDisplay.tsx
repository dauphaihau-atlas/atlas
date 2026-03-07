export interface ErrorDisplayProps {
  title?: string
  message: string
  details?: string
  onRetry?: () => void
  onGoBack?: () => void
  showStack?: boolean
  stack?: string
}

export function ErrorDisplay({
  title = 'Something went wrong',
  message,
  details,
  onRetry,
  onGoBack,
  showStack = false,
  stack,
}: ErrorDisplayProps) {
  return (
    <div className="flex min-h-[900px] items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-900">{title}</h3>
            <p className="mt-2 text-sm text-red-800">{message}</p>
            {details && <p className="mt-2 text-xs text-red-700">{details}</p>}
          </div>
        </div>

        {showStack && stack && (
          <details className="mt-4 rounded border border-red-300 bg-red-100 p-3">
            <summary className="cursor-pointer text-xs font-medium text-red-900">
              Stack trace
            </summary>
            <pre className="mt-2 max-h-48 overflow-x-auto overflow-y-auto whitespace-pre font-mono text-sm text-red-800">
              {stack}
            </pre>
          </details>
        )}

        <div className="mt-6 flex gap-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Try again
            </button>
          )}
          {onGoBack && (
            <button
              onClick={onGoBack}
              className="rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Go back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
