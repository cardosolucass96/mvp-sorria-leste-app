'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Info, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';

export interface AlertProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

const typeConfig = {
  info: {
    bg: 'bg-info-500/10',
    border: 'border-info-500/20',
    text: 'text-info-600 dark:text-info-400',
    Icon: Info,
  },
  success: {
    bg: 'bg-success-500/10',
    border: 'border-success-500/20',
    text: 'text-success-600 dark:text-success-400',
    Icon: CheckCircle,
  },
  warning: {
    bg: 'bg-warning-500/10',
    border: 'border-warning-500/20',
    text: 'text-warning-600 dark:text-warning-400',
    Icon: AlertTriangle,
  },
  error: {
    bg: 'bg-error-500/10',
    border: 'border-error-500/20',
    text: 'text-error-600 dark:text-error-400',
    Icon: XCircle,
  },
} as const;

export default function Alert({
  type = 'info',
  title,
  children,
  dismissible = false,
  onDismiss,
  className = '',
}: AlertProps) {
  const [visible, setVisible] = useState(true);
  const { bg, border, text, Icon } = typeConfig[type];

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div
      role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
      aria-live={type === 'error' || type === 'warning' ? 'assertive' : 'polite'}
      className={cn("flex gap-3 p-4 rounded-lg border", bg, border, text, className)}
    >
      <Icon className="shrink-0 w-5 h-5 mt-0.5" aria-hidden="true" />

      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold text-sm mb-0.5">{title}</p>}
        <div className="text-sm">{children}</div>
      </div>

      {dismissible && (
        <button
          onClick={handleDismiss}
          className="shrink-0 p-0.5 rounded hover:bg-black/5 transition-colors"
          aria-label="Fechar alerta"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
