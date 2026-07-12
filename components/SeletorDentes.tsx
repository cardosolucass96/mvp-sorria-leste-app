'use client';

import { useState } from 'react';
import Checkbox from '@/components/ui/Checkbox';
import { getFaceDisplay, type FaceNome } from '@/lib/utils/denteFaces';

export type { FaceNome } from '@/lib/utils/denteFaces';

export interface DenteFaceInput {
  dente: string;
  faces: FaceNome[];
}

const FACES: FaceNome[] = ['V', 'L', 'M', 'D', 'O'];

const DENTES_PERMANENTES: Record<string, string[]> = {
  'Quadrante Superior Direito (1)': ['18', '17', '16', '15', '14', '13', '12', '11'],
  'Quadrante Superior Esquerdo (2)': ['21', '22', '23', '24', '25', '26', '27', '28'],
  'Quadrante Inferior Esquerdo (3)': ['38', '37', '36', '35', '34', '33', '32', '31'],
  'Quadrante Inferior Direito (4)': ['48', '47', '46', '45', '44', '43', '42', '41'],
};

const DENTES_DECIDUOS: Record<string, string[]> = {
  'Quadrante Superior Direito Decíduo (5)': ['55', '54', '53', '52', '51'],
  'Quadrante Superior Esquerdo Decíduo (6)': ['61', '62', '63', '64', '65'],
  'Quadrante Inferior Esquerdo Decíduo (7)': ['75', '74', '73', '72', '71'],
  'Quadrante Inferior Direito Decíduo (8)': ['85', '84', '83', '82', '81'],
};

const TODOS_DENTES_DECIDUOS = Object.values(DENTES_DECIDUOS).flat();

interface SeletorDentesProps {
  valor: DenteFaceInput[];
  onChange: (valor: DenteFaceInput[]) => void;
  disabled?: boolean;
  /** Quando false (default), oculta a seleção de faces por dente — usado para procedimentos por_dente que não usam faces (ex: canal). */
  mostrarFaces?: boolean;
  /** Abre o seletor de dentes automaticamente ao montar. */
  expandidoInicial?: boolean;
}

export default function SeletorDentes({
  valor,
  onChange,
  disabled = false,
  mostrarFaces = false,
  expandidoInicial = false,
}: SeletorDentesProps) {
  const [expandido, setExpandido] = useState(expandidoInicial);
  const [mostrarDeciduosManual, setMostrarDeciduosManual] = useState(
    valor.some((item) => TODOS_DENTES_DECIDUOS.includes(item.dente))
  );

  const dentesSelecionados = valor.map(d => d.dente);
  const mostrarDeciduos = mostrarDeciduosManual ||
    valor.some((item) => TODOS_DENTES_DECIDUOS.includes(item.dente));

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

  const toggleMostrarDeciduos = (checked: boolean) => {
    if (disabled) return;
    setMostrarDeciduosManual(checked);
    if (!checked) {
      onChange(valor.filter((item) => !TODOS_DENTES_DECIDUOS.includes(item.dente)));
    }
  };

  const renderGrupoDentes = (grupos: Record<string, string[]>) => (
    Object.entries(grupos).map(([quadrante, dentes]) => {
      const todosSelecionados = dentes.every(d => dentesSelecionados.includes(d));
      const algunsSelecionados =
        dentes.some(d => dentesSelecionados.includes(d)) && !todosSelecionados;
      return (
        <div key={quadrante} className="space-y-2">
          <button
            type="button"
            onClick={() => selecionarQuadrante(dentes)}
            disabled={disabled}
            className="text-xs font-medium text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <input
              type="checkbox"
              checked={todosSelecionados}
              ref={input => { if (input) input.indeterminate = algunsSelecionados; }}
              onChange={() => {}}
              className="rounded text-primary"
            />
            {quadrante}
          </button>
          <div className={`grid gap-1.5 ${dentes.length === 5 ? 'grid-cols-5 max-w-[21rem]' : 'grid-cols-8'}`}>
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
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-background text-foreground border border-input hover:border-primary/40 hover:bg-muted'
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
    })
  );

  return (
    <div className="space-y-3">
      {/* Seletor de dentes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setExpandido(!expandido)}
            disabled={disabled}
            className="text-sm text-primary hover:text-primary font-medium flex items-center gap-1"
          >
            {expandido ? '▼' : '▶'} Selecionar dentes
            {dentesSelecionados.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs">
                {dentesSelecionados.length} {dentesSelecionados.length === 1 ? 'dente' : 'dentes'}
              </span>
            )}
          </button>
          {dentesSelecionados.length > 0 && (
            <button
              type="button"
              onClick={limpar}
              disabled={disabled}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Limpar
            </button>
          )}
        </div>

        {expandido && (
          <div className="border border-border rounded-lg p-4 bg-muted space-y-3">
            {renderGrupoDentes(DENTES_PERMANENTES)}

            <div className="pt-2 border-t border-border">
              <Checkbox
                label="Mostrar dentes decíduos (de leite)"
                checked={mostrarDeciduos}
                onChange={toggleMostrarDeciduos}
                disabled={disabled}
                hint="Exibe os quadrantes 5 a 8 para seleção de dentes infantis"
              />
            </div>

            {mostrarDeciduos && (
              <div className="space-y-3">
                {renderGrupoDentes(DENTES_DECIDUOS)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Seletor de faces por dente */}
      {mostrarFaces && valor.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Faces a tratar por dente
          </p>
          <div className="space-y-1.5">
            {[...valor]
              .sort((a, b) => Number(a.dente) - Number(b.dente))
              .map(item => (
                <div
                  key={item.dente}
                  className="flex items-center gap-3 bg-muted rounded-lg px-3 py-2"
                >
                  <span className="text-sm font-bold text-primary w-8 shrink-0">
                    {item.dente}
                  </span>
                  <div className="flex gap-1.5 flex-wrap flex-1">
                    {FACES.map(face => {
                      const ativa = item.faces.includes(face);
                      const faceDisplay = getFaceDisplay(face, item.dente);
                      return (
                        <button
                          key={face}
                          type="button"
                          onClick={() => toggleFace(item.dente, face)}
                          disabled={disabled}
                          title={faceDisplay.label}
                          className={`px-2 py-1 text-xs font-semibold rounded transition-all
                            ${ativa
                              ? 'bg-info-600 text-white'
                              : 'bg-background text-muted-foreground border border-input hover:border-info-500/40 hover:bg-info-500/10'
                            }
                            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {faceDisplay.sigla}
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
          <div className="text-xs text-muted-foreground space-y-1">
            <p>V = Vestibular · M = Mesial · D = Distal</p>
            <p>Superiores: P = Palatina · Inferiores: L = Lingual · Anteriores: I = Incisal · Posteriores: O = Oclusal</p>
          </div>
        </div>
      )}
    </div>
  );
}
