'use client';

import Modal from './Modal';
import Button from './Button';
import { Trash2, AlertTriangle, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
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
        </>
      }
    >
      <div className="flex gap-4 items-start">
        {(() => { const Icon = typeIcons[type]; return <Icon className="w-6 h-6 shrink-0 text-neutral-500 mt-0.5" aria-hidden="true" />; })()}
        <p className="text-sm text-neutral-600 leading-relaxed">{message}</p>
      </div>
    </Modal>
  );
}
