'use client';

import { useEffect } from 'react';
import { toast as sonnerToast } from 'sonner';
import { Toaster } from '@/components/ui/_shadcn/sonner';

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (typeof Element !== 'undefined' && typeof Element.prototype.setPointerCapture !== 'function') {
  Element.prototype.setPointerCapture = () => {};
}

if (typeof Element !== 'undefined' && typeof Element.prototype.releasePointerCapture !== 'function') {
  Element.prototype.releasePointerCapture = () => {};
}

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

function ToastA11yBridge() {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const applyToastSemantics = () => {
      document.querySelectorAll<HTMLElement>('[data-sonner-toast]').forEach((toastEl) => {
        const type = toastEl.dataset.type;
        const isAssertive = type === 'error' || type === 'warning';
        toastEl.setAttribute('role', isAssertive ? 'alert' : 'status');
        toastEl.setAttribute('aria-live', isAssertive ? 'assertive' : 'polite');
      });
    };

    applyToastSemantics();

    const observer = new MutationObserver(applyToastSemantics);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-type'],
    });

    return () => observer.disconnect();
  }, []);

  return null;
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

// ─── Provider ───────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ToastA11yBridge />
      <Toaster
        closeButton
        expand
        richColors
        position="top-right"
        toastOptions={{
          classNames: {
            toast: 'shadow-lg',
            title: 'font-medium',
            description: 'text-sm',
          },
          closeButtonAriaLabel: 'Fechar notificação',
        }}
      />
    </>
  );
}
