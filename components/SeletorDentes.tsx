'use client';

import { useState } from 'react';

interface SeletorDentesProps {
  dentesSelecionados: string[];
  onChange: (dentes: string[]) => void;
  disabled?: boolean;
}

// Mapa de dentes permanentes (notação FDI)
const DENTES_PERMANENTES = {
  'Quadrante Superior Direito (1)': ['18', '17', '16', '15', '14', '13', '12', '11'],
  'Quadrante Superior Esquerdo (2)': ['21', '22', '23', '24', '25', '26', '27', '28'],
  'Quadrante Inferior Esquerdo (3)': ['38', '37', '36', '35', '34', '33', '32', '31'],
  'Quadrante Inferior Direito (4)': ['48', '47', '46', '45', '44', '43', '42', '41'],
};

export default function SeletorDentes({ dentesSelecionados, onChange, disabled = false }: SeletorDentesProps) {
  const [expandido, setExpandido] = useState(false);

  const toggleDente = (dente: string) => {
    if (disabled) return;
    
    if (dentesSelecionados.includes(dente)) {
      onChange(dentesSelecionados.filter(d => d !== dente));
    } else {
      onChange([...dentesSelecionados, dente]);
    }
  };

  const selecionarQuadrante = (dentes: string[]) => {
    if (disabled) return;
    
    // Se todos os dentes do quadrante já estão selecionados, desmarcar
    const todosSelecionados = dentes.every(d => dentesSelecionados.includes(d));
    
    if (todosSelecionados) {
      onChange(dentesSelecionados.filter(d => !dentes.includes(d)));
    } else {
      // Adicionar apenas os que não estão selecionados
      const novos = dentes.filter(d => !dentesSelecionados.includes(d));
      onChange([...dentesSelecionados, ...novos]);
    }
  };

  const limparSelecao = () => {
    if (disabled) return;
    onChange([]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpandido(!expandido)}
          disabled={disabled}
          className="text-sm text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1"
        >
          {expandido ? '▼' : '▶'} Selecionar dentes
          {dentesSelecionados.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-primary-100 text-primary-800 rounded-full text-xs">
              {dentesSelecionados.length} {dentesSelecionados.length === 1 ? 'dente' : 'dentes'}
            </span>
          )}
        </button>
        
        {dentesSelecionados.length > 0 && (
          <button
            type="button"
            onClick={limparSelecao}
            disabled={disabled}
            className="text-xs text-muted hover:text-neutral-700"
          >
            Limpar
          </button>
        )}
      </div>

      {expandido && (
        <div className="border border-border rounded-lg p-4 bg-surface-secondary space-y-3">
          {Object.entries(DENTES_PERMANENTES).map(([quadrante, dentes]) => {
            const todosSelecionados = dentes.every(d => dentesSelecionados.includes(d));
            const algunsSelecionados = dentes.some(d => dentesSelecionados.includes(d)) && !todosSelecionados;
            
            return (
              <div key={quadrante} className="space-y-2">
                <button
                  type="button"
                  onClick={() => selecionarQuadrante(dentes)}
                  disabled={disabled}
                  className="text-xs font-medium text-neutral-600 hover:text-primary-600 flex items-center gap-1"
                >
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    ref={(input) => {
                      if (input) input.indeterminate = algunsSelecionados;
                    }}
                    onChange={() => {}}
                    className="rounded text-primary-600"
                  />
                  {quadrante}
                </button>
                
                <div className="grid grid-cols-8 gap-1.5">
                  {dentes.map(dente => {
                    const selecionado = dentesSelecionados.includes(dente);
                    return (
                      <button
                        key={dente}
                        type="button"
                        onClick={() => toggleDente(dente)}
                        disabled={disabled}
                        className={`
                          px-2 py-1.5 text-xs font-medium rounded transition-all
                          ${selecionado
                            ? 'bg-primary-600 text-white shadow-sm'
                            : 'bg-surface text-neutral-700 border border-neutral-300 hover:border-primary-400 hover:bg-primary-50'
                          }
                          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                      >
                        {dente}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dentesSelecionados.length > 0 && (
        <div className="text-xs text-neutral-600 bg-info-50 border border-info-200 rounded p-2">
          <strong>Dentes selecionados:</strong> {dentesSelecionados.sort((a, b) => Number(a) - Number(b)).join(', ')}
        </div>
      )}
    </div>
  );
}
