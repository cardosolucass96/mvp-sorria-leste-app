export interface DividerProps {
  /** Texto opcional exibido no centro do divisor */
  label?: string;
  /** Orientação: horizontal (padrão) ou vertical */
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export default function Divider({
  label,
  orientation = 'horizontal',
  className = '',
}: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={`inline-block w-px bg-border self-stretch mx-2 ${className}`}
      />
    );
  }

  if (label) {
    return (
      <div role="separator" className={`flex items-center gap-3 my-4 ${className}`}>
        <div className="flex-1 h-px bg-border" />
        <span className="text-sm text-muted font-medium whitespace-nowrap">{label}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
    );
  }

  return (
    <hr
      role="separator"
      className={`border-0 h-px bg-border my-4 ${className}`}
    />
  );
}
