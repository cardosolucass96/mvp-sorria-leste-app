import React, { ReactElement } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';

/**
 * Providers wrapper: inclui ToastProvider e futuros providers.
 */
function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  );
}

/**
 * Renderiza um componente com todos os providers (Toast, Auth, etc.).
 * Substitui o render do testing-library.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
): RenderResult {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { renderWithProviders as render };
