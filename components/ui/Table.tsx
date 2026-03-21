'use client';

import React from 'react';

// ─── Types ──────────────────────────────────────────────────────

export interface TableColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  render?: (item: T, index: number) => React.ReactNode;
  sortable?: boolean;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: string;
  onRowClick?: (item: T) => void;
  keyExtractor: (item: T) => string | number;
  stickyHeader?: boolean;
  caption?: string;
  className?: string;
}

// ─── Skeleton ───────────────────────────────────────────────────

function SkeletonRow({ cols, rowIndex = 0 }: { cols: number; rowIndex?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-neutral-200 rounded animate-pulse" style={{ width: `${50 + ((rowIndex * 17 + i * 13) % 40)}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Component ──────────────────────────────────────────────────

export default function Table<T>({
  columns,
  data,
  loading = false,
  emptyMessage = 'Nenhum registro encontrado',
  emptyIcon = '📭',
  onRowClick,
  keyExtractor,
  stickyHeader = false,
  caption,
  className = '',
}: TableProps<T>) {
  const alignClass = (align?: string) =>
    align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';

  return (
    <div className={`overflow-x-auto rounded-xl border border-border-light ${className}`}>
      <table className="w-full text-sm" aria-busy={loading || undefined}>
        {caption && <caption className="sr-only">{caption}</caption>}

        <thead className="bg-primary-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`
                  px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-900
                  ${alignClass(col.align)}
                  ${stickyHeader ? 'sticky top-0 bg-primary-50 z-10' : ''}
                `}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-neutral-100 bg-surface">
          {loading ? (
            <>
              <SkeletonRow cols={columns.length} rowIndex={0} />
              <SkeletonRow cols={columns.length} rowIndex={1} />
              <SkeletonRow cols={columns.length} rowIndex={2} />
            </>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center">
                <div className="flex flex-col items-center gap-2 text-muted">
                  <span className="text-3xl" aria-hidden="true">{emptyIcon}</span>
                  <p className="text-sm">{emptyMessage}</p>
                </div>
              </td>
            </tr>
          ) : (
            data.map((item, index) => (
              <tr
                key={keyExtractor(item)}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(item); } } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'row' : undefined}
                className={`
                  transition-colors
                  ${onRowClick ? 'cursor-pointer hover:bg-primary-50/50 focus:bg-primary-50/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500' : ''}
                  ${index % 2 === 1 ? 'bg-neutral-50/30' : ''}
                `}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 ${alignClass(col.align)}`}>
                    {col.render
                      ? col.render(item, index)
                      : String((item as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
