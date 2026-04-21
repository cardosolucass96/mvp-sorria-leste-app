import { cn } from '@/lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  color?: 'gray' | 'orange' | 'amber' | 'green' | 'red' | 'blue' | 'purple' | 'evaluation' | 'yellow';
  size?: 'sm' | 'md';
  className?: string;
}

const colorClasses: Record<NonNullable<BadgeProps['color']>, string> = {
  gray: 'bg-muted text-foreground',
  orange: 'bg-primary/10 text-primary',
  amber: 'bg-warning-500/10 text-warning-600 dark:text-warning-400',
  green: 'bg-success-500/10 text-success-600 dark:text-success-400',
  red: 'bg-error-500/10 text-error-600 dark:text-error-400',
  blue: 'bg-info-500/10 text-info-600 dark:text-info-400',
  purple: 'bg-evaluation-500/10 text-evaluation-600 dark:text-evaluation-400',
  evaluation: 'bg-evaluation-500/10 text-evaluation-600 dark:text-evaluation-400',
  yellow: 'bg-warning-500/10 text-warning-600 dark:text-warning-400',
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
      className={cn(
        "inline-flex items-center font-semibold rounded-full whitespace-nowrap",
        colorClasses[color],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </span>
  );
}
