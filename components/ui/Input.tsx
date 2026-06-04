'use client';

import { useId, forwardRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { maskCPF, maskTelefone, maskMoeda } from '@/lib/utils/masks';

export interface InputProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'datetime-local' | 'tel' | 'search';
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
  min?: number | string;
  max?: number | string;
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
      <div className={cn("w-full", className)}>
        <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1">
          {label}
          {required && <span className="text-error-500 ml-0.5" aria-hidden="true">*</span>}
        </label>

        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
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
            aria-required={required || undefined}
            min={min}
            max={max}
            step={step}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            className={cn(
              "w-full px-3 py-2 border rounded-lg text-sm",
              "transition-colors duration-200",
              "focus:outline-none focus:ring-2 focus:border-transparent",
              "disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed",
              icon && "pl-10",
              error
                ? "border-error-300 focus:ring-error-400 text-error-900 placeholder-error-300"
                : "border-input text-foreground placeholder:text-neutral-500 focus:ring-ring"
            )}
          />
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
);

Input.displayName = 'Input';
export default Input;

export { Input };
