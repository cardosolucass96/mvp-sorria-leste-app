export interface BadgeProps {
  children: React.ReactNode;
  color?: 'gray' | 'orange' | 'amber' | 'green' | 'red' | 'blue' | 'purple' | 'yellow';
  size?: 'sm' | 'md';
  className?: string;
}

const colorClasses: Record<NonNullable<BadgeProps['color']>, string> = {
  gray: 'bg-neutral-100 text-neutral-800',
  orange: 'bg-primary-100 text-primary-800',
  amber: 'bg-warning-100 text-warning-800',
  green: 'bg-success-100 text-success-800',
  red: 'bg-error-100 text-error-800',
  blue: 'bg-info-100 text-info-800',
  purple: 'bg-purple-100 text-purple-800',
  yellow: 'bg-warning-100 text-warning-800',
};

const sizeClasses: Record<NonNullable<BadgeProps['size']>, string> = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
};

export default function Badge({
  children,
  color = 'gray',
  size = 'md',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center font-semibold rounded-full whitespace-nowrap
        ${colorClasses[color]}
        ${sizeClasses[size]}
        ${className}
      `.trim()}
    >
      {children}
    </span>
  );
}
