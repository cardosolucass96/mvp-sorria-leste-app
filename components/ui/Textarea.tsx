'use client';

import { useId, forwardRef } from 'react';

export interface TextareaProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
  minLength?: number;
  className?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      name,
      value,
      onChange,
      placeholder,
      error,
      hint,
      required = false,
      disabled = false,
      rows = 4,
      maxLength,
      minLength,
      className = '',
    },
    ref
  ) => {
    const id = useId();
    const remaining = maxLength ? maxLength - value.length : null;
    const belowMin = minLength ? value.length < minLength && value.length > 0 : false;

    return (
      <div className={`w-full ${className}`}>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
        </label>

        <textarea
          ref={ref}
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          rows={rows}
          maxLength={maxLength}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`
            w-full px-3 py-2 border rounded-lg text-sm resize-y
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:border-transparent
            disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
            ${error
              ? 'border-red-300 focus:ring-red-400 text-red-900 placeholder-red-300'
              : 'border-gray-300 focus:ring-orange-500'
            }
          `.trim()}
        />

        <div className="flex justify-between mt-1">
          <div>
            {error && (
              <p id={`${id}-error`} className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            {!error && hint && (
              <p id={`${id}-hint`} className="text-sm text-gray-500">
                {hint}
              </p>
            )}
            {!error && !hint && belowMin && (
              <p className="text-sm text-amber-600">
                Mínimo {minLength} caracteres ({value.length}/{minLength})
              </p>
            )}
          </div>

          {maxLength != null && (
            <span
              className={`text-xs ${
                remaining !== null && remaining <= 20 ? 'text-red-500 font-medium' : 'text-gray-400'
              }`}
            >
              {value.length}/{maxLength}
            </span>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
export default Textarea;
