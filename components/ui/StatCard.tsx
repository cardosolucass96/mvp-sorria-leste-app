import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color?: string;
  iconColor?: string;
  href?: string;
  description?: string;
  className?: string;
}

export default function StatCard({
  icon,
  label,
  value,
  color = 'border-primary/40',
  iconColor = 'text-muted-foreground',
  href,
  description,
  className = '',
}: StatCardProps) {
  const content = (
    <div
      className={cn(
        "bg-card rounded-xl shadow-sm border border-border p-4 border-l-4",
        color,
        href && "hover:shadow-md transition-all duration-200",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("shrink-0 mt-0.5", iconColor)} aria-hidden="true">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }

  return content;
}
