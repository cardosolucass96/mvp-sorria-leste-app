'use client';

import { useState } from 'react';

export type FaceNome = 'V' | 'L' | 'M' | 'D' | 'O';

export interface DenteFaceInput {
  dente: string;
  faces: FaceNome[];
}

const FACES: { nome: FaceNome; label: string }[] = [
  { nome: 'V', label: 'Vestibular' },
  { nome: 'L', label: 'Lingual/Palatina' },
  { nome: 'M', label: 'Mesial' },
  { nome: 'D', label: 'Distal' },
  { nome: 'O', label: 'Oclusal/Incisal' },
];

const DENTES_PERMANENTES: Record<string, string[]> = {
  'Quadrante Superior Direito (1)': ['18', '17', '16', '15', '14', '13', '12', '11'],
  'Quadrante Superior Esquerdo (2)': ['21', '22', '23', '24', '25', '26', '27', '28'],
  'Quadrante Inferior Esquerdo (3)': ['38', '37', '36', '35', '34', '33', '32', '31'],
  'Quadrante Inferior Direito (4)': ['48', '47', '46', '45', '44', '43', '42', '41'],
};

interface SeletorDentesProps {
  valor: DenteFaceInput[];
  onChange: (valor: DenteFaceInput[]) => void;
  disabled?: boolean;
}

export default function SeletorDentes({ valor, onChange, disabled = false }: SeletorDentesProps) {
  const [expandido, setExpandido] = useState(false);

  const dentesSelecionados = valor.map(d => d.dente);

  const toggleDente = (dente: string) => {
    if (disabled) return;
    if (dentesSelecionados.includes(dente)) {
      onChange(valor.filter(d => d.dente !== dente));
    } else {
      onChange([...valor, { dente, faces: [] }]);
    }
  };

  const selecionarQuadrante = (dentes: string[]) => {
    if (disabled) return;
    const todosSelecionados = dentes.every(d => dentesSelecionados.includes(d));
    if (todosSelecionados) {
      onChange(valor.filter(d => !dentes.includes(d.dente)));
    } else {
      const novos = dentes.filter(d => !dentesSelecionados.includes(d));
      onChange([...valor, ...novos.map(d => ({ dente: d, faces: [] as FaceNome[] }))]);
    }
  };

  const toggleFace = (dente: string, face: FaceNome) => {
    if (disabled) return;
    onChange(
      valor.map(d => {
        if (d.dente !== dente) return d;
        const faces = d.faces.includes(face)
          ? d.faces.filter(f => f !== face)
          : [...d.faces, face];
        return { ...d, faces };
      })
    );
  };

  const limpar = () => {
    if (disabled) return;
    onChange([]);
  };

  return (
    <div className="space-y-3">
      {/* Seletor de dentes */}
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
              onClick={limpar}
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
              const algunsSelecionados =
                dentes.some(d => dentesSelecionados.includes(d)) && !todosSelecionados;
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
                      ref={input => { if (input) input.indeterminate = algunsSelecionados; }}
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
                          className={`px-2 py-1.5 text-xs font-medium rounded transition-all
                            ${selecionado
                              ? 'bg-primary-600 text-white shadow-sm'
                              : 'bg-surface text-neutral-700 border border-neutral-300 hover:border-primary-400 hover:bg-primary-50'
                            }
                            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
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
      </div>

      {/* Seletor de faces por dente */}
      {valor.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">
            Faces a tratar por dente
          </p>
          <div className="space-y-1.5">
            {[...valor]
              .sort((a, b) => Number(a.dente) - Number(b.dente))
              .map(item => (
                <div
                  key={item.dente}
                  className="flex items-center gap-3 bg-surface-secondary rounded-lg px-3 py-2"
                >
                  <span className="text-sm font-bold text-primary-700 w-8 shrink-0">
                    {item.dente}
                  </span>
                  <div className="flex gap-1.5 flex-wrap flex-1">
                    {FACES.map(face => {
                      const ativa = item.faces.includes(face.nome);
                      return (
                        <button
                          key={face.nome}
                          type="button"
                          onClick={() => toggleFace(item.dente, face.nome)}
                          disabled={disabled}
                          title={face.label}
                          className={`px-2 py-1 text-xs font-semibold rounded transition-all
                            ${ativa
                              ? 'bg-info-600 text-white'
                              : 'bg-surface text-neutral-600 border border-neutral-300 hover:border-info-400 hover:bg-info-50'
                            }
                            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {face.nome}
                        </button>
                      );
                    })}
                  </div>
                  {item.faces.length === 0 && (
                    <span className="text-xs text-warning-600 shrink-0">Selecione ao menos 1 face</span>
                  )}
                </div>
              ))}
          </div>
          <p className="text-xs text-muted">
            V = Vestibular · L = Lingual/Palatina · M = Mesial · D = Distal · O = Oclusal/Incisal
          </p>
        </div>
      )}
    </div>
  );
}
