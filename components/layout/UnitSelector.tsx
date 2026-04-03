'use client';

import { Building2, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function UnitSelector() {
  const { user, currentUnidade, availableUnidades, unidadeNomes, switchUnit, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fechar ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user || !currentUnidade) return null;

  // Admin vê todas as unidades; outros vêem só as suas
  const unidadesVisiveis = isAdmin
    ? Object.keys(unidadeNomes).map(Number)
    : availableUnidades;

  const nomeAtual = unidadeNomes[currentUnidade] || `Unidade ${currentUnidade}`;

  // Se tem apenas 1 unidade, mostra texto estático
  if (unidadesVisiveis.length <= 1) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400">
        <Building2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{nomeAtual}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                   bg-neutral-700 border-2 border-neutral-600 text-white hover:bg-neutral-600 transition-all"
        title={`Unidade atual: ${nomeAtual}`}
        aria-label={`Trocar unidade. Atual: ${nomeAtual}`}
        aria-expanded={open}
      >
        <Building2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline max-w-[120px] truncate">{nomeAtual}</span>
        <ChevronDown className={`w-3 h-3 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-neutral-800 border border-neutral-700
                        rounded-lg shadow-lg z-50 min-w-[200px] py-1">
          {unidadesVisiveis.map((uid) => (
            <button
              key={uid}
              onClick={() => { switchUnit(uid); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                uid === currentUnidade
                  ? 'bg-neutral-700 text-white font-medium'
                  : 'text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 shrink-0" />
                {unidadeNomes[uid] || `Unidade ${uid}`}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
