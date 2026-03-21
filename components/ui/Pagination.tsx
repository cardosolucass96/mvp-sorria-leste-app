'use client';

import Button from './Button';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Número máximo de páginas visíveis ao redor da atual */
  siblingCount?: number;
}

function getPageRange(current: number, total: number, siblings: number): (number | 'ellipsis')[] {
  const range: (number | 'ellipsis')[] = [];

  if (total <= 1) return [1];

  // Sempre incluir primeira página
  range.push(1);

  const start = Math.max(2, current - siblings);
  const end = Math.min(total - 1, current + siblings);

  if (start > 2) {
    range.push('ellipsis');
  }

  for (let i = start; i <= end; i++) {
    range.push(i);
  }

  if (end < total - 1) {
    range.push('ellipsis');
  }

  // Sempre incluir última página
  if (total > 1) {
    range.push(total);
  }

  return range;
}

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  className = '',
  siblingCount = 1,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageRange(page, totalPages, siblingCount);

  return (
    <nav aria-label="Paginação" className={`flex items-center justify-center gap-1 ${className}`}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Página anterior"
      >
        ← Anterior
      </Button>

      <div className="flex items-center gap-1">
        {pages.map((p, idx) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-muted select-none" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              disabled={p === page}
              aria-label={`Página ${p}`}
              aria-current={p === page ? 'page' : undefined}
              className={`min-w-[2rem] h-8 rounded-md text-sm font-medium transition-colors duration-150
                ${p === page
                  ? 'bg-primary-500 text-white cursor-default'
                  : 'text-neutral-700 hover:bg-neutral-100 cursor-pointer'
                }`}
            >
              {p}
            </button>
          )
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Próxima página"
      >
        Próxima →
      </Button>
    </nav>
  );
}
