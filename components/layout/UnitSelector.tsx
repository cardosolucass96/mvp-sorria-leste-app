'use client';

import { Building2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/_shadcn/dropdown-menu';

export default function UnitSelector() {
  const { user, currentUnidade, availableUnidades, unidadeNomes, switchUnit, isAdmin } = useAuth();

  if (!user || !currentUnidade) return null;

  const unidadesVisiveis = isAdmin
    ? Object.keys(unidadeNomes).map(Number)
    : availableUnidades;

  const nomeAtual = unidadeNomes[currentUnidade] || `Unidade ${currentUnidade}`;

  // Single unit — static text
  if (unidadesVisiveis.length <= 1) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
        <Building2 className="size-3.5" />
        <span className="hidden sm:inline">{nomeAtual}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-accent transition-colors cursor-pointer outline-none"
        title={`Unidade atual: ${nomeAtual}`}
        aria-label={`Trocar unidade. Atual: ${nomeAtual}`}
      >
        <Building2 className="size-3.5" />
        <span className="hidden sm:inline max-w-[120px] truncate">{nomeAtual}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="min-w-[200px]">
        {unidadesVisiveis.map((uid) => (
          <DropdownMenuItem
            key={uid}
            onClick={() => switchUnit(uid)}
            className={cn(
              uid === currentUnidade && 'bg-accent font-medium'
            )}
          >
            <Building2 className="size-4" />
            {unidadeNomes[uid] || `Unidade ${uid}`}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
