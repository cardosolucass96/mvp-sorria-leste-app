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
    bg: 'bg-info-50/90 dark:bg-info-800/18',
    border: 'border-info-200 dark:border-info-900/60',
    text: 'text-info-800 dark:text-info-200',
    Icon: Info,
  },
  success: {
    bg: 'bg-success-50/90 dark:bg-success-800/18',
    border: 'border-success-200 dark:border-success-900/60',
    text: 'text-success-800 dark:text-success-200',
    Icon: CheckCircle,
  },
  warning: {
    bg: 'bg-warning-50/90 dark:bg-warning-800/18',
    border: 'border-warning-200 dark:border-warning-900/60',
    text: 'text-warning-800 dark:text-warning-200',
    Icon: AlertTriangle,
  },
  error: {
    bg: 'bg-error-50/90 dark:bg-error-900/20',
    border: 'border-error-200 dark:border-error-900/60',
    text: 'text-error-800 dark:text-error-200',
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
          className="shrink-0 rounded p-0.5 text-current/70 transition-colors hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
          aria-label="Fechar alerta"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
