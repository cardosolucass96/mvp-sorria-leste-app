import { Cliente } from '@/lib/types';
import { formatarCPF, formatarTelefone, formatarData, formatarDataHora } from '@/lib/utils/formatters';
import { getOrigemLabel } from '@/lib/constants/origens';

interface RenderConfig {
  [key: string]: unknown;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9._-]+)\s*\}\}/g;
const FILLABLE_PLACEHOLDER_KEYS = new Set([
  'escolha_protese',
  'observacoes_protese',
]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const TERMO_PLACEHOLDER_KEYS = [
  'cliente_nome',
  'cliente_id',
  'cliente_cpf',
  'cliente_cpf_raw',
  'cliente_telefone',
  'cliente_telefone_raw',
  'cliente_email',
  'cliente_endereco',
  'cliente_origem',
  'cliente_origem_label',
  'cliente_plano_odontologico',
  'cliente_sexo',
  'cliente_data_nascimento',
  'cliente_data_nascimento_iso',
  'cliente_cadastrado_em',
  'data_atual',
  'data_hora_atual',
  'data_hora_atual_iso',
  'ano_atual',
  'profissional_nome',
  'profissional_cro',
  'elemento_dentario_num',
  'elementos_dentarios',
  'implante_elementos_dentes',
  'implante_coroas',
  'implante_protocolo',
  'previsao_inicio',
  'valor_devolucao',
  'valor_devolucao_extenso',
  'data_pagamento_origem',
  'motivo_devolucao',
  'nome_favorecido',
  'cpf_favorecido',
  'banco_nome',
  'banco_agencia',
  'conta_favorecido',
  'data_consulta_inicial',
  'escolha_protese',
  'observacoes_protese',
] as const;

const SAMPLE_TERMO_OVERRIDES: Record<string, string> = {
  profissional_nome: 'Dra. Mariana Alves',
  profissional_cro: 'CRO-CE 12345',
  elemento_dentario_num: '26',
  elementos_dentarios: '11, 21 e 22',
  implante_elementos_dentes: '14 e 15',
  implante_coroas: '2 unidades',
  implante_protocolo: 'Arcada superior',
  previsao_inicio: '15/08/2026',
  valor_devolucao: '350,00',
  valor_devolucao_extenso: 'trezentos e cinquenta reais',
  data_pagamento_origem: '10/07/2026',
  motivo_devolucao: 'Cancelamento do procedimento antes do inicio da execucao clinica.',
  nome_favorecido: 'Maria de Souza',
  cpf_favorecido: '123.456.789-10',
  banco_nome: 'Banco do Brasil',
  banco_agencia: '1234-5',
  conta_favorecido: '98765-4',
  data_consulta_inicial: '12/07/2026',
  escolha_protese: 'Protese parcial removivel superior',
  observacoes_protese: 'Ajustar cor para tom A2 e manter acompanhamento trimestral.',
};

function formatarDataBanco(date: string | null | undefined): string {
  if (!date) return '';
  return formatarDataHora(date);
}

function normalizarValor(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

export function buildTermoContext(cliente: Cliente, overrides: RenderConfig = {}): Record<string, string> {
  const base: Record<string, string> = {
    cliente_nome: normalizarValor(cliente.nome),
    cliente_id: normalizarValor(cliente.id),
    cliente_cpf: normalizarValor(formatarCPF(cliente.cpf || '')),
    cliente_cpf_raw: normalizarValor(cliente.cpf),
    cliente_telefone: normalizarValor(formatarTelefone(cliente.telefone || '')),
    cliente_telefone_raw: normalizarValor(cliente.telefone),
    cliente_email: normalizarValor(cliente.email),
    cliente_endereco: normalizarValor(cliente.endereco),
    cliente_origem: normalizarValor(cliente.origem),
    cliente_origem_label: normalizarValor(getOrigemLabel(cliente.origem)),
    cliente_plano_odontologico: normalizarValor(cliente.plano_odontologico),
    cliente_sexo: normalizarValor(cliente.sexo ? cliente.sexo.toLowerCase() : ''),
    cliente_data_nascimento: normalizarValor(cliente.data_nascimento ? formatarData(cliente.data_nascimento) : ''),
    cliente_data_nascimento_iso: normalizarValor(cliente.data_nascimento),
    cliente_cadastrado_em: normalizarValor(formatarDataBanco(cliente.created_at)),
  };

  const agora = new Date();
  base.data_atual = agora.toLocaleDateString('pt-BR');
  base.data_hora_atual = agora.toLocaleString('pt-BR');
  base.data_hora_atual_iso = agora.toISOString();
  base.ano_atual = String(agora.getFullYear());

  Object.entries(overrides).forEach(([chave, valor]) => {
    const key = chave.trim().toLowerCase();
    if (!key) return;
    base[key] = normalizarValor(valor);
  });

  return base;
}

export function buildSampleTermoContext(overrides: RenderConfig = {}) {
  const clienteExemplo: Cliente = {
    id: 999,
    nome: 'Maria da Conceicao Andrade',
    cpf: '12345678910',
    telefone: '85998765432',
    email: 'maria.andrade@example.com',
    data_nascimento: '1988-05-14',
    endereco: 'Rua das Flores, 150 - Barra do Ceara, Fortaleza/CE',
    origem: 'indicacao',
    sexo: 'feminino',
    plano_odontologico: 'Clin',
    observacoes: null,
    created_at: '2026-07-01 09:30:00',
  };

  return buildTermoContext(clienteExemplo, {
    ...SAMPLE_TERMO_OVERRIDES,
    ...overrides,
  });
}

export function renderTermoTemplate(html: string, context: Record<string, string>) {
  const faltando = new Set<string>();
  const rendered = html.replace(PLACEHOLDER_RE, (_, token: string) => {
    const chave = token.trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(context, chave)) {
      faltando.add(chave);
      return '';
    }

    const value = context[chave] ?? '';
    if (!value) {
      if (FILLABLE_PLACEHOLDER_KEYS.has(chave)) {
        const variant = chave === 'observacoes_protese' ? 'long' : 'medium';
        return `<span class="termo-fill-line termo-fill-line--${variant}" data-placeholder="${escapeHtml(chave)}"></span>`;
      }
      return '';
    }

    return `<strong class="termo-variable">${escapeHtml(value)}</strong>`;
  });

  return {
    html: rendered,
    placeholdersNaoEncontrados: Array.from(faltando),
  };
}
