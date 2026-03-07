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
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
        </label>

        <select
          ref={ref}
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`
            w-full px-3 py-2 border rounded-lg text-sm
            bg-white appearance-none cursor-pointer
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:border-transparent
            disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
            ${error
              ? 'border-red-300 focus:ring-red-400 text-red-900'
              : 'border-gray-300 focus:ring-orange-500'
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

        {error && (
          <p id={`${id}-error`} className="mt-1 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${id}-hint`} className="mt-1 text-sm text-gray-500">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
export default Select;
