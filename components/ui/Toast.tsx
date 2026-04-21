'use client';

import { toast as sonnerToast } from 'sonner';

// ─── Types (backward-compatible) ───────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastContextType {
  toasts: Toast[];
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
  };
  dismiss: (id: string) => void;
}

// ─── Hook (wraps Sonner) ───────────────────────────────────────

export function useToast(): ToastContextType {
  return {
    toasts: [],
    toast: {
      success: (message: string, duration?: number) =>
        sonnerToast.success(message, { duration: duration ?? 4000 }),
      error: (message: string, duration?: number) =>
        sonnerToast.error(message, { duration: duration ?? Infinity }),
      warning: (message: string, duration?: number) =>
        sonnerToast.warning(message, { duration: duration ?? 4000 }),
      info: (message: string, duration?: number) =>
        sonnerToast.info(message, { duration: duration ?? 4000 }),
    },
    dismiss: (id: string) => sonnerToast.dismiss(id),
  };
}

// ─── Provider (no-op — Sonner uses <Toaster /> in layout) ──────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
