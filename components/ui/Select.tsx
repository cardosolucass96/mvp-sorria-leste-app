'use client';

import { useId, forwardRef } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
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
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
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
    },
    ref
  ) => {
    const id = useId();

    return (
      <div className={`w-full ${className}`}>
        <label htmlFor={id} className="block text-sm font-medium text-neutral-700 mb-1">
          {label}
          {required && <span className="text-error-500 ml-0.5" aria-hidden="true">*</span>}
        </label>

        <div className="relative">
          <select
            ref={ref}
            id={id}
            name={name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            required={required}
            aria-required={required || undefined}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            className={`
              w-full px-3 py-2 pr-10 border rounded-lg text-sm
              bg-surface appearance-none cursor-pointer
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:border-transparent
              disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed
              ${error
                ? 'border-error-300 focus:ring-error-400 text-error-900'
                : 'border-neutral-300 focus:ring-primary-500'
              }
            `.trim()}
          >
            <option value="">{placeholder}</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400" aria-hidden="true">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>

        {error && (
          <p id={`${id}-error`} className="mt-1 text-sm text-error-600" role="alert">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${id}-hint`} className="mt-1 text-sm text-neutral-500">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
export default Select;
