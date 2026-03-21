'use client';

import { ReactNode } from 'react';

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export default function FormField({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  className = '',
  children,
}: FormFieldProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-neutral-700"
      >
        {label}
        {required && <span className="text-error-500 ml-0.5" aria-hidden="true">*</span>}
      </label>

      {children}

      {error && (
        <p className="text-sm text-error-600" role="alert" id={htmlFor ? `${htmlFor}-error` : undefined}>
          {error}
        </p>
      )}

      {hint && !error && (
        <p className="text-sm text-muted" id={htmlFor ? `${htmlFor}-hint` : undefined}>
          {hint}
        </p>
      )}
    </div>
  );
}
