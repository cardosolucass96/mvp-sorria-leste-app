import type {
  StatusFinanceiroProcedimento,
  StatusOrcamento,
} from './types';

export class V2DomainError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'regra_dominio_invalida',
  ) {
    super(message);
    this.name = 'V2DomainError';
  }
}

export function requireInteger(value: unknown, field: string, minimum = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new V2DomainError(`${field} deve ser um número inteiro maior ou igual a ${minimum}.`);
  }
  return parsed;
}

export function requirePositiveInteger(value: unknown, field: string): number {
  return requireInteger(value, field, 1);
}

export function optionalPositiveInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  return requirePositiveInteger(value, field);
}

export function requireText(value: unknown, field: string, maxLength = 2_000): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new V2DomainError(`${field} é obrigatório.`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new V2DomainError(`${field} deve ter no máximo ${maxLength} caracteres.`);
  }
  return text;
}

export function optionalText(value: unknown, field: string, maxLength = 2_000): string | null {
  if (value === null || value === undefined || value === '') return null;
  return requireText(value, field, maxLength);
}

export function requireClinicDateTime(value: unknown): string {
  const text = requireText(value, 'data_agendada', 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(text)) {
    throw new V2DomainError('data_agendada deve conter data e hora válidas no formato ISO.');
  }
  if (Number.isNaN(Date.parse(text))) {
    throw new V2DomainError('data_agendada é inválida.');
  }
  return text;
}

export function sumCentavos(values: number[]): number {
  return values.reduce((total, value) => total + requireInteger(value, 'valor_centavos'), 0);
}

export function calcularValorFinalCentavos(
  valorTabelaCentavos: number,
  descontoCentavos: number,
): number {
  const tabela = requireInteger(valorTabelaCentavos, 'valor_tabela_centavos');
  const desconto = requireInteger(descontoCentavos, 'desconto_centavos');
  if (desconto > tabela) {
    throw new V2DomainError('O desconto não pode ser maior que o valor de tabela.');
  }
  return tabela - desconto;
}

export function calcularComissaoCentavos(baseCentavos: number, taxaBps: number): number {
  const base = requireInteger(baseCentavos, 'base_centavos');
  const taxa = requireInteger(taxaBps, 'taxa_bps');
  return Math.round((base * taxa) / 10_000);
}

export function deriveFinancialStatus(
  valorFinalCentavos: number,
  valorRecebidoCentavos: number,
  teveAlocacao = valorRecebidoCentavos > 0,
): StatusFinanceiroProcedimento {
  const valorFinal = requireInteger(valorFinalCentavos, 'valor_final_centavos');
  const recebido = requireInteger(valorRecebidoCentavos, 'valor_recebido_centavos');
  if (recebido === 0) return teveAlocacao ? 'estornado' : 'nao_pago';
  if (recebido < valorFinal) return 'parcial';
  return 'quitado';
}

export function deriveBudgetStatus(statuses: string[]): StatusOrcamento {
  if (statuses.length === 0) return 'rascunho';
  const active = statuses.filter((status) => status !== 'cancelado');
  if (active.length === 0) return 'cancelado';
  if (active.every((status) => status === 'aceito')) return 'aceito';
  if (active.every((status) => status === 'recusado')) return 'recusado';
  if (active.some((status) => status === 'aceito')) return 'parcialmente_aceito';
  return 'apresentado';
}

export function assertEvaluationCanFinish(hasBudgetItems: boolean, reason: unknown): string | null {
  if (hasBudgetItems) return null;
  return requireText(reason, 'motivo_sem_orcamento', 500);
}

export function assertProcedureCanBeEdited(statusComercial: string, valorRecebidoCentavos: number): void {
  if (statusComercial !== 'proposto' || valorRecebidoCentavos > 0) {
    throw new V2DomainError(
      'Procedimentos aceitos ou com recebimento não podem ser alterados. Use um ajuste auditado.',
      409,
      'procedimento_bloqueado',
    );
  }
}

export function assertCanExecute(options: {
  statusComercial: string;
  statusFinanceiro: string;
  hasAdminRelease: boolean;
  origem: string;
}): void {
  if (options.origem === 'acrescimo_execucao') return;
  if (options.statusComercial !== 'aceito') {
    throw new V2DomainError('O procedimento precisa estar aceito antes da execução.', 409, 'procedimento_nao_aceito');
  }
  if (options.statusFinanceiro !== 'quitado' && !options.hasAdminRelease) {
    throw new V2DomainError(
      'A execução exige quitação integral ou liberação administrativa ativa.',
      409,
      'execucao_sem_quitacao',
    );
  }
}
