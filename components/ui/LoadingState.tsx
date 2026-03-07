export interface LoadingStateProps {
  mode?: 'spinner' | 'skeleton';
  lines?: number;
  className?: string;
  text?: string;
  message?: string;
}

function Spinner({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3" role="status">
      <svg
        className="animate-spin h-8 w-8 text-orange-500"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="text-sm text-gray-500">{text || 'Carregando...'}</span>
    </div>
  );
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <div className="animate-pulse space-y-4 py-4" role="status" aria-label="Carregando conteúdo">
      {/* Title skeleton */}
      <div className="h-6 bg-gray-200 rounded-lg w-1/3" />

      {/* Content lines */}
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div
            className="h-4 bg-gray-200 rounded"
            style={{ width: `${60 + Math.random() * 35}%` }}
          />
        </div>
      ))}

      {/* Table-like skeleton */}
      <div className="mt-6 space-y-3">
        <div className="h-10 bg-gray-100 rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-50 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function LoadingState({
  mode = 'spinner',
  lines = 5,
  className = '',
  text,
  message,
}: LoadingStateProps) {
  return (
    <div className={className}>
      {mode === 'spinner' ? <Spinner text={text ?? message} /> : <Skeleton lines={lines} />}
    </div>
  );
}
