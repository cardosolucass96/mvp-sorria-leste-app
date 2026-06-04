/**
 * ViewModeToggle — toggle genérico entre modos de visualização.
 * Props: options: {key, label, icon}[], active, onChange.
 */

'use client';

import { cn } from '@/lib/utils';

export interface ViewModeOption {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

export interface ViewModeToggleProps {
  options: ViewModeOption[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export default function ViewModeToggle({
  options,
  active,
  onChange,
  className = '',
}: ViewModeToggleProps) {
  return (
    <div className={cn("inline-flex bg-muted rounded-lg p-1", className)} role="tablist">
      {options.map((option) => {
        const isActive = option.key === active;
        return (
          <button
            key={option.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.icon && <span>{option.icon}</span>}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
