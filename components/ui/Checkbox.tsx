'use client';

import { useId, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface CheckboxProps {
  label: string;
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, name, checked, onChange, disabled = false, hint, error, required = false, className = '' }, ref) => {
    const id = useId();
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;

    return (
      <div className={cn("flex flex-col gap-0.5", className)}>
        <div className="flex items-start gap-2">
          <input
            ref={ref}
            id={id}
            name={name}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            required={required}
            aria-invalid={!!error}
            aria-required={required}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            className={cn(
              "mt-0.5 size-4 rounded text-primary",
              "focus:ring-ring focus:ring-2",
              "disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
              error ? "border-error-300" : "border-input"
            )}
          />
          <div>
            <label htmlFor={id} className="text-sm text-foreground cursor-pointer select-none">
              {label}
              {required && <span className="text-error-500 ml-0.5" aria-hidden="true">*</span>}
            </label>
            {hint && !error && <p id={hintId} className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
          </div>
        </div>
        {error && <p id={errorId} className="text-xs text-error-600 ml-6" role="alert">{error}</p>}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
export default Checkbox;
