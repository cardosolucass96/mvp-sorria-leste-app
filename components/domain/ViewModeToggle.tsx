/**
 * ViewModeToggle — toggle genérico entre modos de visualização.
 * Props: options: {key, label, icon}[], active, onChange.
 */

'use client';

export interface ViewModeOption {
  key: string;
  label: string;
  icon?: string;
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
    <div className={`inline-flex bg-neutral-100 rounded-lg p-1 ${className}`} role="tablist">
      {options.map((option) => {
        const isActive = option.key === active;
        return (
          <button
            key={option.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.key)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
              transition-all duration-200
              ${isActive
                ? 'bg-surface text-primary-700 shadow-sm'
                : 'text-muted hover:text-neutral-700'
              }
            `.trim()}
          >
            {option.icon && <span>{option.icon}</span>}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
