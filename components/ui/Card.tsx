import { cn } from '@/lib/utils';

export interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'outlined' | 'elevated';
  noPadding?: boolean;
  borderColor?: string;
  className?: string;
  onClick?: () => void;
}

const variantClasses: Record<NonNullable<CardProps['variant']>, string> = {
  default: 'bg-background shadow-md border border-border',
  outlined: 'bg-background border-2 border-border',
  elevated: 'bg-background shadow-lg border border-border',
};

export default function Card({
  children,
  variant = 'default',
  noPadding = false,
  borderColor,
  className = '',
  onClick,
}: CardProps) {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      onClick={onClick}
      className={cn(
        "rounded-xl transition-all duration-200",
        variantClasses[variant],
        !noPadding && "p-6",
        borderColor && `border-l-4 ${borderColor}`,
        onClick && "cursor-pointer hover:shadow-lg hover:-translate-y-0.5 w-full text-left",
        className
      )}
    >
      {children}
    </Tag>
  );
}

// Sub-components for structured Card composition
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 p-6 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("text-lg font-semibold leading-none tracking-tight text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...props} />;
}
