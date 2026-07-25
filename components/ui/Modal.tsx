'use client';

import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/_shadcn/dialog';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnOverlay?: boolean;
  closeOnEsc?: boolean;
  className?: string;
  bodyClassName?: string;
  bodyRef?: React.Ref<HTMLDivElement>;
  footerClassName?: string;
}

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  closeOnOverlay: _closeOnOverlay = true,
  closeOnEsc: _closeOnEsc = true,
  className = '',
  description,
  bodyClassName = '',
  bodyRef,
  footerClassName = '',
}: ModalProps) {
  void _closeOnOverlay;
  void _closeOnEsc;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={cn(
          sizeClasses[size],
          "max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0 bg-card text-card-foreground shadow-2xl ring-1 ring-border/70",
          className
        )}
        showCloseButton
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border bg-card/95">
          <DialogTitle className="text-lg font-semibold text-foreground">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Body */}
        <div ref={bodyRef} className={cn("px-6 py-4 overflow-y-auto flex-1 bg-card", bodyClassName)}>{children}</div>

        {/* Footer */}
        {footer && (
          <DialogFooter className={cn("mx-0 mb-0 px-6 py-4 border-t border-border flex justify-end gap-3 rounded-b-xl bg-muted/30", footerClassName)}>
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
