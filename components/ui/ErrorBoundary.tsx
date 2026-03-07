'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — captura erros de renderização nos componentes filhos.
 * Exibe uma UI de fallback ao invés de crashar toda a aplicação.
 */
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-6 text-center" role="alert">
          <div className="inline-flex flex-col items-center gap-3 max-w-md mx-auto">
            <span className="text-4xl">⚠️</span>
            <h2 className="text-lg font-semibold text-gray-900">Algo deu errado</h2>
            <p className="text-sm text-gray-600">
              Ocorreu um erro inesperado. Tente recarregar a página.
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="btn btn-primary"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
