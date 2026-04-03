'use client';

import React from 'react';
import { Inbox, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────

export interface TableColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  render?: (item: T, index: number) => React.ReactNode;
  /** Se definido, o header vira botão e chama onSort com este valor */
  sortField?: string;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onRowClick?: (item: T) => void;
  keyExtractor: (item: T) => string | number;
  stickyHeader?: boolean;
  caption?: string;
  className?: string;
  /** Campo atualmente ordenado */
  sortKey?: string;
  /** Direção atual */
  sortDir?: 'asc' | 'desc';
  /** Callback ao clicar no header — alterna asc/desc se for o mesmo campo */
  onSort?: (field: string, dir: 'asc' | 'desc') => void;
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
  emptyIcon = <Inbox className="w-8 h-8 text-neutral-300" />,
  onRowClick,
  keyExtractor,
  stickyHeader = false,
  caption,
  className = '',
  sortKey,
  sortDir,
  onSort,
}: TableProps<T>) {
  const alignClass = (align?: string) =>
    align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';

  const handleSort = (field: string) => {
    if (!onSort) return;
    const nextDir = sortKey === field && sortDir === 'asc' ? 'desc' : 'asc';
    onSort(field, nextDir);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortKey !== field) return <ChevronsUpDown className="w-3.5 h-3.5 text-primary-400" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3.5 h-3.5 text-primary-700" />
      : <ChevronDown className="w-3.5 h-3.5 text-primary-700" />;
  };

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
                {col.sortField && onSort ? (
                  <button
                    type="button"
                    onClick={() => handleSort(col.sortField!)}
                    className="inline-flex items-center gap-1 hover:text-primary-700 transition-colors"
                  >
                    {col.label}
                    <SortIcon field={col.sortField} />
                  </button>
                ) : (
                  col.label
                )}
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
                  <div aria-hidden="true">{emptyIcon}</div>
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
