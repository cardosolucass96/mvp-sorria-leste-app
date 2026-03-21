'use client';

import { useState } from 'react';

export interface AlertProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

const typeConfig: Record<
  NonNullable<AlertProps['type']>,
  { bg: string; border: string; text: string; icon: string }
> = {
  info: {
    bg: 'bg-info-50',
    border: 'border-info-200',
    text: 'text-info-800',
    icon: 'ℹ️',
  },
  success: {
    bg: 'bg-success-50',
    border: 'border-success-200',
    text: 'text-success-800',
    icon: '✅',
  },
  warning: {
    bg: 'bg-warning-50',
    border: 'border-warning-200',
    text: 'text-warning-800',
    icon: '⚠️',
  },
  error: {
    bg: 'bg-error-50',
    border: 'border-error-200',
    text: 'text-error-800',
    icon: '❌',
  },
};

export default function Alert({
  type = 'info',
  title,
  children,
  dismissible = false,
  onDismiss,
  className = '',
}: AlertProps) {
  const [visible, setVisible] = useState(true);
  const config = typeConfig[type];

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div
      role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
      aria-live={type === 'error' || type === 'warning' ? 'assertive' : 'polite'}
      className={`
        flex gap-3 p-4 rounded-lg border
        ${config.bg} ${config.border} ${config.text}
        ${className}
      `.trim()}
    >
      <span className="shrink-0 text-base" aria-hidden="true">
        {config.icon}
      </span>

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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
