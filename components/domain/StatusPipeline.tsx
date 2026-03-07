/**
 * StatusPipeline — pipeline visual horizontal das etapas do atendimento.
 * Mostra cada estágio com sua cor e destaca o estágio atual.
 * Responsivo: horizontal desktop, vertical mobile.
 */

import { STATUS_CONFIG, STATUS_ORDER } from '@/lib/constants/status';
import type { AtendimentoStatus } from '@/lib/types';

export interface StatusPipelineProps {
  currentStatus: AtendimentoStatus;
  className?: string;
}

export default function StatusPipeline({ currentStatus, className = '' }: StatusPipelineProps) {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);

  return (
    <div className={`w-full ${className}`}>
      {/* Desktop: horizontal */}
      <div className="hidden sm:flex items-center gap-1">
        {STATUS_ORDER.map((status, index) => {
          const config = STATUS_CONFIG[status];
          const isCurrent = status === currentStatus;
          const isPast = index < currentIndex;
          const isFuture = index > currentIndex;

          return (
            <div key={status} className="flex items-center flex-1 min-w-0">
              {/* Etapa */}
              <div
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium w-full
                  transition-all duration-200
                  ${isCurrent ? `${config.bgCor} ${config.cor} ring-2 ring-offset-1 ring-current` : ''}
                  ${isPast ? 'bg-green-50 text-green-700' : ''}
                  ${isFuture ? 'bg-gray-50 text-gray-400' : ''}
                `}
              >
                <span className="text-sm shrink-0">{isPast ? '✅' : config.icon}</span>
                <span className="truncate">{config.label}</span>
              </div>

              {/* Conector */}
              {index < STATUS_ORDER.length - 1 && (
                <div
                  className={`
                    w-4 h-0.5 shrink-0 mx-0.5
                    ${index < currentIndex ? 'bg-green-300' : 'bg-gray-200'}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical */}
      <div className="sm:hidden space-y-2">
        {STATUS_ORDER.map((status, index) => {
          const config = STATUS_CONFIG[status];
          const isCurrent = status === currentStatus;
          const isPast = index < currentIndex;
          const isFuture = index > currentIndex;

          return (
            <div key={status} className="flex items-center gap-3">
              {/* Indicador vertical */}
              <div className="flex flex-col items-center">
                <div
                  className={`
                    w-6 h-6 rounded-full flex items-center justify-center text-xs
                    ${isCurrent ? `${config.bgCor} ${config.cor} ring-2 ring-current` : ''}
                    ${isPast ? 'bg-green-100 text-green-700' : ''}
                    ${isFuture ? 'bg-gray-100 text-gray-400' : ''}
                  `}
                >
                  {isPast ? '✓' : config.icon}
                </div>
                {index < STATUS_ORDER.length - 1 && (
                  <div
                    className={`w-0.5 h-4 ${index < currentIndex ? 'bg-green-300' : 'bg-gray-200'}`}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-sm font-medium ${
                  isCurrent ? config.cor : isPast ? 'text-green-700' : 'text-gray-400'
                }`}
              >
                {config.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
