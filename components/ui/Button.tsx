'use client';

import { forwardRef } from 'react';
import Spinner from './Spinner';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline' | 'default' | 'destructive' | 'link';
  size?: 'sm' | 'md' | 'lg' | 'default' | 'xs' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md focus:ring-ring',
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md focus:ring-ring',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 focus:ring-ring',
  danger: 'bg-destructive text-white hover:bg-destructive/90 focus:ring-destructive',
  destructive: 'bg-destructive text-white hover:bg-destructive/90 focus:ring-destructive',
  success: 'bg-success-600 text-white hover:bg-success-700 focus:ring-success-400',
  ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground focus:ring-ring',
  outline: 'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground focus:ring-ring',
  link: 'text-primary underline-offset-4 hover:underline',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  xs: 'px-2 py-1 text-xs gap-1',
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  default: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
  icon: 'h-9 w-9 p-0',
  'icon-xs': 'h-6 w-6 p-0',
  'icon-sm': 'h-7 w-7 p-0',
  'icon-lg': 'h-10 w-10 p-0',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconRight,
      fullWidth = false,
      disabled,
      children,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading}
        className={`
          inline-flex items-center justify-center font-medium rounded-lg
          transition-all duration-200 cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-offset-2
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${fullWidth ? 'w-full' : ''}
          ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}
        `.trim()}
        {...props}
      >
        {loading ? (
          <Spinner size="sm" />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}

        {children}

        {iconRight && !loading && <span className="shrink-0">{iconRight}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
export { Button };

// Compat: shadcn components import buttonVariants from this path
import { cva } from 'class-variance-authority';
export const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md focus:ring-ring',
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md focus:ring-ring',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 focus:ring-ring',
        danger: 'bg-destructive text-white hover:bg-destructive/90 focus:ring-destructive',
        destructive: 'bg-destructive text-white hover:bg-destructive/90 focus:ring-destructive',
        success: 'bg-success-600 text-white hover:bg-success-700 focus:ring-success-400',
        outline: 'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground focus:ring-ring',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground focus:ring-ring',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'px-4 py-2 text-sm gap-2',
        xs: 'px-2 py-1 text-xs gap-1',
        sm: 'px-3 py-1.5 text-sm gap-1.5',
        md: 'px-4 py-2 text-sm gap-2',
        lg: 'px-6 py-3 text-base gap-2.5',
        icon: 'h-9 w-9 p-0',
        'icon-xs': 'h-6 w-6 p-0',
        'icon-sm': 'h-7 w-7 p-0',
        'icon-lg': 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
