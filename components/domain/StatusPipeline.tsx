/**
 * StatusPipeline — pipeline visual horizontal das etapas do atendimento.
 * Mostra cada estágio com sua cor e destaca o estágio atual.
 * Responsivo: horizontal desktop, vertical mobile.
 */

import { cn } from '@/lib/utils';
import { CheckCircle } from 'lucide-react';
import { STATUS_CONFIG, STATUS_ORDER } from '@/lib/constants/status';
import type { AtendimentoStatus, AtendimentoTipo } from '@/lib/types';

export interface StatusPipelineProps {
  currentStatus: AtendimentoStatus;
  tipo?: AtendimentoTipo;
  className?: string;
}

const SESSAO_SKIPPED: AtendimentoStatus[] = ['triagem', 'avaliacao'];

export default function StatusPipeline({ currentStatus, tipo, className = '' }: StatusPipelineProps) {
  const steps = tipo === 'sessao'
    ? STATUS_ORDER.filter((s) => !SESSAO_SKIPPED.includes(s))
    : STATUS_ORDER;
  const currentIndex = steps.indexOf(currentStatus);

  return (
    <div className={cn("w-full", className)}>
      {/* Desktop: horizontal */}
      <div className="hidden sm:flex items-center gap-1">
        {steps.map((status, index) => {
          const config = STATUS_CONFIG[status];
          const isCurrent = status === currentStatus;
          const isPast = index < currentIndex;
          const isFuture = index > currentIndex;
          const Icon = config.icon;

          return (
            <div key={status} className="flex items-center flex-1 min-w-0">
              {/* Etapa */}
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium w-full transition-all duration-200",
                  isCurrent && `${config.bgCor} ${config.cor} ring-2 ring-offset-1 ring-current`,
                  isPast && "bg-success-500/10 text-success-600 dark:text-success-400",
                  isFuture && "bg-muted text-muted-foreground"
                )}
              >
                {isPast
                  ? <CheckCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  : <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                }
                <span className="truncate">{config.label}</span>
              </div>

              {/* Conector */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "w-4 h-0.5 shrink-0 mx-0.5",
                    index < currentIndex ? "bg-success-500/40" : "bg-muted"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical */}
      <div className="sm:hidden space-y-2">
        {steps.map((status, index) => {
          const config = STATUS_CONFIG[status];
          const isCurrent = status === currentStatus;
          const isPast = index < currentIndex;
          const isFuture = index > currentIndex;
          const Icon = config.icon;

          return (
            <div key={status} className="flex items-center gap-3">
              {/* Indicador vertical */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center",
                    isCurrent && `${config.bgCor} ${config.cor} ring-2 ring-current`,
                    isPast && "bg-success-500/10 text-success-600 dark:text-success-400",
                    isFuture && "bg-muted text-muted-foreground"
                  )}
                >
                  {isPast
                    ? <CheckCircle className="w-3 h-3" aria-hidden="true" />
                    : <Icon className="w-3 h-3" aria-hidden="true" />
                  }
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn("w-0.5 h-4", index < currentIndex ? "bg-success-500/40" : "bg-muted")}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  "text-sm font-medium",
                  isCurrent ? config.cor : isPast ? "text-success-600 dark:text-success-400" : "text-muted-foreground"
                )}
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
