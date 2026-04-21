'use client';

import { cn } from '@/lib/utils';
import Button from './Button';
import { Trash2, AlertTriangle, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
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

const typeVariants: Record<NonNullable<ConfirmDialogProps['type']>, 'danger' | 'primary'> = {
  danger: 'danger',
  warning: 'primary',
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
      <AlertDialogContent size="default">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="flex gap-3 items-start">
              <Icon className="size-5 shrink-0 text-muted-foreground mt-0.5" aria-hidden="true" />
              <span>{message}</span>
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
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
