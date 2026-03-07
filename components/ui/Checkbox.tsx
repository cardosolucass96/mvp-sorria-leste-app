'use client';

import { useId, forwardRef } from 'react';

export interface CheckboxProps {
  label: string;
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
  className?: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, name, checked, onChange, disabled = false, hint, className = '' }, ref) => {
    const id = useId();

    return (
      <div className={`flex items-start gap-2 ${className}`}>
        <input
          ref={ref}
          id={id}
          name={name}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className={`
            mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-500
            focus:ring-orange-500 focus:ring-2
            disabled:opacity-50 disabled:cursor-not-allowed
            cursor-pointer
          `.trim()}
        />
        <div>
          <label htmlFor={id} className="text-sm text-gray-700 cursor-pointer select-none">
            {label}
          </label>
          {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        </div>
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
export default Checkbox;
