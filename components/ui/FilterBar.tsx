'use client';

import { useState } from 'react';
import Input from './Input';
import Button from './Button';

export interface FilterField {
  type: 'text' | 'date' | 'select';
  name: string;
  label: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface FilterBarProps {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onClear?: () => void;
  className?: string;
}

export default function FilterBar({
  fields,
  values,
  onChange,
  onClear,
  className = '',
}: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const hasFilters = Object.values(values).some((v) => v !== '');

  return (
    <div className={`bg-white rounded-xl border border-orange-100 p-4 ${className}`}>
      {/* Mobile toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 md:hidden w-full"
        aria-expanded={expanded}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Filtros
        {hasFilters && (
          <span className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">
            {Object.values(values).filter((v) => v !== '').length}
          </span>
        )}
        <svg
          className={`w-4 h-4 ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Filters grid */}
      <div className={`${expanded ? 'mt-4' : 'hidden'} md:block`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          {fields.map((field) => {
            if (field.type === 'select' && field.options) {
              return (
                <div key={field.name} className="w-full">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                  </label>
                  <select
                    value={values[field.name] || ''}
                    onChange={(e) => onChange(field.name, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="">{field.placeholder || 'Todos'}</option>
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            return (
              <Input
                key={field.name}
                label={field.label}
                name={field.name}
                type={field.type === 'date' ? 'date' : 'search'}
                placeholder={field.placeholder}
                value={values[field.name] || ''}
                onChange={(v) => onChange(field.name, v)}
              />
            );
          })}

          {onClear && hasFilters && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Limpar filtros
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
