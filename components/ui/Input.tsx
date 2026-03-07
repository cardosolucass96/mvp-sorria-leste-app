'use client';

import { useId, forwardRef, useCallback } from 'react';
import { maskCPF, maskTelefone, maskMoeda } from '@/lib/utils/masks';

export interface InputProps {
  label: string;
  name?: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'tel' | 'search';
  placeholder?: string;
  value: string | number;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  mask?: 'cpf' | 'telefone' | 'moeda';
  icon?: React.ReactNode;
  autoFocus?: boolean;
  className?: string;
  min?: number;
  max?: number;
  step?: string | number;
}

const maskFns: Record<string, (v: string) => string> = {
  cpf: maskCPF,
  telefone: maskTelefone,
  moeda: maskMoeda,
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      name,
      type = 'text',
      placeholder,
      value,
      onChange,
      error,
      hint,
      required = false,
      disabled = false,
      mask,
      icon,
      autoFocus,
      className = '',
      min,
      max,
      step,
    },
    ref
  ) => {
    const id = useId();

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value;
        if (mask && maskFns[mask]) {
          val = maskFns[mask](val);
        }
        onChange(val);
      },
      [onChange, mask]
    );

    return (
      <div className={`w-full ${className}`}>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
        </label>

        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              {icon}
            </span>
          )}

          <input
            ref={ref}
            id={id}
            name={name}
            type={mask ? 'text' : type}
            placeholder={placeholder}
            value={value}
            onChange={handleChange}
            disabled={disabled}
            autoFocus={autoFocus}
            required={required}
            min={min}
            max={max}
            step={step}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            className={`
              w-full px-3 py-2 border rounded-lg text-sm
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:border-transparent
              disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
              ${icon ? 'pl-10' : ''}
              ${error
                ? 'border-red-300 focus:ring-red-400 text-red-900 placeholder-red-300'
                : 'border-gray-300 focus:ring-orange-500'
              }
            `.trim()}
          />
        </div>

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

Input.displayName = 'Input';
export default Input;
