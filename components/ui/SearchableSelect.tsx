'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SelectOption } from './Select';

interface SearchableSelectProps {
  label: string;
  name: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

function normalizarTexto(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function SearchableSelect({
  label,
  name,
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  error,
  hint,
  required = false,
  disabled = false,
  className = '',
  searchPlaceholder = 'Buscar...',
  emptyMessage = 'Nenhuma opcao encontrada',
}: SearchableSelectProps) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const termo = normalizarTexto(search);
    return options.filter((option) => normalizarTexto(option.label).includes(termo));
  }, [options, search]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    const timeout = window.setTimeout(() => searchInputRef.current?.focus(), 0);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(timeout);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('w-full', className)}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-error-500" aria-hidden="true">*</span>}
      </label>

      <div className="relative">
        <input id={id} name={name} value={value} readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />

        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            'flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2 text-left text-sm transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:border-transparent',
            'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
            error
              ? 'border-error-300 text-error-900 focus:ring-error-400'
              : 'border-input text-foreground focus:ring-ring'
          )}
          onClick={() => {
            if (!disabled) {
              setOpen((current) => !current);
            }
          }}
        >
          <span className={selectedOption ? 'text-foreground' : 'text-muted-foreground'}>
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-input bg-background shadow-lg">
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setOpen(false);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-transparent focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto p-1" role="listbox">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => {
                  const selected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                        selected
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <span className="flex-1">{option.label}</span>
                      {selected && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-sm text-muted-foreground">{emptyMessage}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-error-600" role="alert">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
