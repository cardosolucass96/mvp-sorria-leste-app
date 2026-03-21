import Spinner from './Spinner';

// Deterministic widths for skeleton lines (avoids Math.random in render)
const SKELETON_WIDTHS = [85, 72, 95, 60, 78, 90, 68, 82, 75, 88];

export interface LoadingStateProps {
  mode?: 'spinner' | 'skeleton';
  lines?: number;
  className?: string;
  text?: string;
}

function SpinnerWithText({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3" role="status">
      <Spinner size="lg" className="text-primary-500" />
      <span className="text-sm text-muted">{text || 'Carregando...'}</span>
    </div>
  );
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <div className="animate-pulse space-y-4 py-4" role="status" aria-label="Carregando conteúdo">
      {/* Title skeleton */}
      <div className="h-6 bg-neutral-200 rounded-lg w-1/3" />

      {/* Content lines */}
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div
            className="h-4 bg-neutral-200 rounded"
            style={{ width: `${SKELETON_WIDTHS[i % SKELETON_WIDTHS.length]}%` }}
          />
        </div>
      ))}

      {/* Table-like skeleton */}
      <div className="mt-6 space-y-3">
        <div className="h-10 bg-neutral-100 rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 bg-neutral-50 rounded-lg" />
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
}: LoadingStateProps) {
  return (
    <div className={className}>
      {mode === 'spinner' ? <SpinnerWithText text={text} /> : <Skeleton lines={lines} />}
    </div>
  );
}
