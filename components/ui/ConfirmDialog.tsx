'use client';

import Modal from './Modal';
import Button from './Button';

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

const typeIcons: Record<NonNullable<ConfirmDialogProps['type']>, string> = {
  danger: '🗑️',
  warning: '⚠️',
  info: 'ℹ️',
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
        <span className="text-3xl shrink-0" aria-hidden="true">
          {typeIcons[type]}
        </span>
        <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
      </div>
    </Modal>
  );
}
