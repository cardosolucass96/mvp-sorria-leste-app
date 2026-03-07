/**
 * Opções de origem de clientes — fonte única para frontend e backend.
 */

import type { OrigemCliente } from '@/lib/types';

export interface OrigemOption {
  value: OrigemCliente;
  label: string;
}

export const ORIGENS_OPTIONS: OrigemOption[] = [
  { value: 'fachada', label: 'Fachada' },
  { value: 'trafego_meta', label: 'Tráfego Meta (Facebook/Instagram)' },
  { value: 'trafego_google', label: 'Tráfego Google' },
  { value: 'organico', label: 'Orgânico' },
  { value: 'indicacao', label: 'Indicação' },
];

/** Array simples de valores válidos (para validação no backend) */
export const ORIGENS_VALIDAS: OrigemCliente[] = ORIGENS_OPTIONS.map((o) => o.value);

/** Retorna label de uma origem. Seguro para origem desconhecida. */
export function getOrigemLabel(origem: string): string {
  const option = ORIGENS_OPTIONS.find((o) => o.value === origem);
  return option?.label ?? origem;
}
