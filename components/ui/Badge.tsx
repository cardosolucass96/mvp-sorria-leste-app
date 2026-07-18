import { cn } from '@/lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  color?: 'gray' | 'orange' | 'amber' | 'green' | 'red' | 'blue' | 'purple' | 'evaluation' | 'yellow';
  size?: 'sm' | 'md';
  className?: string;
}

const colorClasses: Record<NonNullable<BadgeProps['color']>, string> = {
  gray: 'border border-border bg-muted/65 text-foreground',
  orange: 'border border-primary/30 bg-primary/10 text-primary dark:border-primary/55 dark:bg-primary/18 dark:text-primary-100',
  amber: 'border border-warning-200 dark:border-warning-300/55 bg-warning-50 dark:bg-warning-800/35 text-warning-800 dark:text-warning-50',
  green: 'border border-success-200 dark:border-success-300/55 bg-success-50 dark:bg-success-800/35 text-success-800 dark:text-success-50',
  red: 'border border-error-200 dark:border-error-300/55 bg-error-50 dark:bg-error-900/35 text-error-800 dark:text-error-50',
  blue: 'border border-info-200 dark:border-info-300/55 bg-info-50 dark:bg-info-800/35 text-info-800 dark:text-info-50',
  purple: 'border border-evaluation-200 dark:border-evaluation-100/45 bg-evaluation-50 dark:bg-evaluation-800/35 text-evaluation-800 dark:text-evaluation-50',
  evaluation: 'border border-evaluation-200 dark:border-evaluation-100/45 bg-evaluation-50 dark:bg-evaluation-800/35 text-evaluation-800 dark:text-evaluation-50',
  yellow: 'border border-warning-200 dark:border-warning-300/55 bg-warning-50 dark:bg-warning-800/35 text-warning-800 dark:text-warning-50',
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
