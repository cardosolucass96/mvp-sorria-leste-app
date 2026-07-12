import { METODO_PAGAMENTO_LABELS } from '@/lib/constants/status';
import type { FormaPagamentoComTaxa, FormaPagamentoOption, PagamentoFormaSnapshot } from '@/lib/types';

export interface SelectOptionGroup {
  label: string;
  options: Array<{ value: string; label: string }>;
}

export function getFormaPagamentoSnapshotLabel(input: Pick<
  PagamentoFormaSnapshot,
  'forma_pagamento_grupo_snapshot' | 'forma_pagamento_subgrupo_snapshot'
> & { metodo?: string | null } | {
  forma_pagamento_grupo_snapshot?: string | null;
  forma_pagamento_subgrupo_snapshot?: string | null;
  metodo?: string | null;
}) {
  const grupo = input.forma_pagamento_grupo_snapshot?.trim();
  const subgrupo = input.forma_pagamento_subgrupo_snapshot?.trim();

  if (grupo && subgrupo) {
    return `${grupo} - ${subgrupo}`;
  }

  if (grupo) {
    return grupo;
  }

  if (input.metodo) {
    return METODO_PAGAMENTO_LABELS[input.metodo as keyof typeof METODO_PAGAMENTO_LABELS] ?? input.metodo;
  }

  return '';
}

export function toFormaPagamentoOption(forma: FormaPagamentoComTaxa): FormaPagamentoOption {
  return {
    value: String(forma.id),
    label: forma.subgrupo || forma.grupo,
    forma_pagamento_id: forma.id,
    grupo: forma.grupo,
    subgrupo: forma.subgrupo,
    metodo_base: forma.metodo_base,
    taxa_percentual: forma.taxa_percentual,
    taxa_fixa: forma.taxa_fixa,
    ativo: forma.ativo,
  };
}

export function buildFormaPagamentoSelectOptions(
  formas: FormaPagamentoComTaxa[]
): Array<{ value: string; label: string } | SelectOptionGroup> {
  const grouped = new Map<string, FormaPagamentoOption[]>();
  const avulsas: Array<{ value: string; label: string }> = [];

  for (const forma of formas) {
    const option = toFormaPagamentoOption(forma);
    if (!forma.subgrupo) {
      avulsas.push({
        value: option.value,
        label: forma.grupo,
      });
      continue;
    }

    const list = grouped.get(forma.grupo) ?? [];
    list.push(option);
    grouped.set(forma.grupo, list);
  }

  const grupos = Array.from(grouped.entries()).map(([label, options]) => ({
    label,
    options: options.map((option) => ({
      value: option.value,
      label: option.label,
    })),
  }));

  return [...avulsas, ...grupos];
}
