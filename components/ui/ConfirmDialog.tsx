'use client';

import { cn } from '@/lib/utils';
import Button from './Button';
import { Trash2, AlertTriangle, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/_shadcn/alert-dialog';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

const typeIcons: Record<NonNullable<ConfirmDialogProps['type']>, LucideIcon> = {
  danger: Trash2,
  warning: AlertTriangle,
  info: Info,
};

const typeVariants: Record<NonNullable<ConfirmDialogProps['type']>, 'danger' | 'primary' | 'secondary'> = {
  danger: 'danger',
  warning: 'secondary',
  info: 'primary',
};

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  type = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const Icon = typeIcons[type];

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent size="default" className="overflow-hidden">
        <AlertDialogHeader>
          <AlertDialogMedia
            className={cn(
              type === 'danger' && 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-200',
              type === 'warning' && 'bg-warning-50 text-warning-700 dark:bg-warning-800/18 dark:text-warning-200',
              type === 'info' && 'bg-info-50 text-info-700 dark:bg-info-800/18 dark:text-info-200'
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mx-0 mb-0">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={typeVariants[type]}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
