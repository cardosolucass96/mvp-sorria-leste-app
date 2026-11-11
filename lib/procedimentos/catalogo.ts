export const CATEGORIAS_CATALOGO = [
  { value: 'prevencao-periodontia', label: 'Prevenção e periodontia' },
  { value: 'restauracoes', label: 'Restaurações' },
  { value: 'endodontia', label: 'Endodontia' },
  { value: 'cirurgia-extracoes', label: 'Cirurgia e extrações' },
  { value: 'implantes-enxertos', label: 'Implantes e enxertos' },
  { value: 'proteses-reabilitacao', label: 'Próteses e reabilitação' },
  { value: 'ortodontia', label: 'Ortodontia' },
  { value: 'estetica-dentaria', label: 'Estética dentária' },
  { value: 'harmonizacao-facial', label: 'Harmonização facial' },
  { value: 'exames', label: 'Exames' },
  { value: 'planos-pacotes', label: 'Planos e pacotes' },
];

export const CATEGORIA_NAO_CLASSIFICADA = { value: 'sem-categoria', label: 'A classificar' };

export const OPCOES_CATEGORIA_CATALOGO = [...CATEGORIAS_CATALOGO, CATEGORIA_NAO_CLASSIFICADA];
const ORDEM_CATEGORIAS = new Map(OPCOES_CATEGORIA_CATALOGO.map(({ label }, index) => [label, index]));

export function isCategoriaCatalogo(value: unknown): value is string {
  return CATEGORIAS_CATALOGO.some((categoria) => categoria.value === value);
}

export function nomeCategoriaCatalogo(value?: string | null) {
  return CATEGORIAS_CATALOGO.find((categoria) => categoria.value === value)?.label
    ?? CATEGORIA_NAO_CLASSIFICADA.label;
}

export interface ProcedimentoCatalogo {
  id: number;
  nome: string;
  categoria_catalogo?: string | null;
}

export function opcoesProcedimentos<T extends ProcedimentoCatalogo>(
  procedimentos: T[],
  label: (procedimento: T) => string = (procedimento) => procedimento.nome
) {
  return procedimentos
    .map((procedimento) => ({
      value: String(procedimento.id),
      label: label(procedimento),
      group: nomeCategoriaCatalogo(procedimento.categoria_catalogo),
    }))
    .sort((a, b) => (ORDEM_CATEGORIAS.get(a.group) ?? 0) - (ORDEM_CATEGORIAS.get(b.group) ?? 0));
}
