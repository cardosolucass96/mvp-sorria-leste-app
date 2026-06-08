import { cn } from '@/lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  color?: 'gray' | 'orange' | 'amber' | 'green' | 'red' | 'blue' | 'purple' | 'evaluation' | 'yellow';
  size?: 'sm' | 'md';
  className?: string;
}

const colorClasses: Record<NonNullable<BadgeProps['color']>, string> = {
  gray: 'border border-border bg-muted/65 text-foreground',
  orange: 'border border-primary/15 bg-primary/10 text-primary',
  amber: 'border border-warning-200 dark:border-warning-800/50 bg-warning-50 dark:bg-warning-800/18 text-warning-800 dark:text-warning-200',
  green: 'border border-success-200 dark:border-success-800/50 bg-success-50 dark:bg-success-800/18 text-success-800 dark:text-success-200',
  red: 'border border-error-200 dark:border-error-900/60 bg-error-50 dark:bg-error-900/20 text-error-800 dark:text-error-200',
  blue: 'border border-info-200 dark:border-info-800/50 bg-info-50 dark:bg-info-800/18 text-info-800 dark:text-info-200',
  purple: 'border border-evaluation-200 dark:border-evaluation-900/60 bg-evaluation-50 dark:bg-evaluation-900/20 text-evaluation-800 dark:text-evaluation-200',
  evaluation: 'border border-evaluation-200 dark:border-evaluation-900/60 bg-evaluation-50 dark:bg-evaluation-900/20 text-evaluation-800 dark:text-evaluation-200',
  yellow: 'border border-warning-200 dark:border-warning-800/50 bg-warning-50 dark:bg-warning-800/18 text-warning-800 dark:text-warning-200',
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
