import { Cliente, TermoCampoDraft, TermoCampoSource, TermoCampoTipo, TermoDraft, Unidade } from '@/lib/types';
import { formatarCPF, formatarTelefone, formatarCNPJ, formatarData, formatarDataHora, formatarAgoraDaClinica, formatarDateNaClinica } from '@/lib/utils/formatters';
import { getOrigemLabel } from '@/lib/constants/origens';

interface RenderConfig {
  [key: string]: unknown;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9._-]+)\s*\}\}/g;
const LEGACY_UNIDADE_ENDERECO_RE = /Avenida Presidente Castelo Branco,?\s*(?:n[ºo]\s*)?5185\s*b(?:,?\s*Barra do Ceará,?\s*Fortaleza\/CE)?/gi;

type TermoUnitContext = Pick<Unidade, 'nome' | 'razao_social' | 'cnpj' | 'endereco' | 'telefone' | 'email' | 'responsavel' | 'recibo_rodape'> | null;
type PlaceholderMetadata = {
  label: string;
  tipo: TermoCampoTipo;
  source: TermoCampoSource;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const TERMO_PLACEHOLDER_KEYS = [
  'unidade_nome',
  'unidade_razao_social',
  'unidade_cnpj',
  'unidade_cnpj_raw',
  'unidade_endereco',
  'unidade_telefone',
  'unidade_telefone_raw',
  'unidade_email',
  'unidade_responsavel',
  'unidade_recibo_rodape',
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

export const TERMO_PLACEHOLDER_METADATA: Record<string, PlaceholderMetadata> = {
  unidade_nome: { label: 'Nome da unidade', tipo: 'text', source: 'unidade' },
  unidade_razao_social: { label: 'Razão social da unidade', tipo: 'text', source: 'unidade' },
  unidade_cnpj: { label: 'CNPJ da unidade', tipo: 'cpf', source: 'unidade' },
  unidade_cnpj_raw: { label: 'CNPJ da unidade (sem máscara)', tipo: 'cpf', source: 'unidade' },
  unidade_endereco: { label: 'Endereço da unidade', tipo: 'textarea', source: 'unidade' },
  unidade_telefone: { label: 'Telefone da unidade', tipo: 'tel', source: 'unidade' },
  unidade_telefone_raw: { label: 'Telefone da unidade (sem máscara)', tipo: 'tel', source: 'unidade' },
  unidade_email: { label: 'Email da unidade', tipo: 'email', source: 'unidade' },
  unidade_responsavel: { label: 'Responsável da unidade', tipo: 'text', source: 'unidade' },
  unidade_recibo_rodape: { label: 'Rodapé do recibo da unidade', tipo: 'textarea', source: 'unidade' },
  cliente_nome: { label: 'Nome do paciente', tipo: 'text', source: 'cliente' },
  cliente_id: { label: 'ID do paciente', tipo: 'text', source: 'cliente' },
  cliente_cpf: { label: 'CPF do paciente', tipo: 'cpf', source: 'cliente' },
  cliente_cpf_raw: { label: 'CPF do paciente (sem máscara)', tipo: 'cpf', source: 'cliente' },
  cliente_telefone: { label: 'Telefone do paciente', tipo: 'tel', source: 'cliente' },
  cliente_telefone_raw: { label: 'Telefone do paciente (sem máscara)', tipo: 'tel', source: 'cliente' },
  cliente_email: { label: 'Email do paciente', tipo: 'email', source: 'cliente' },
  cliente_endereco: { label: 'Endereço do paciente', tipo: 'textarea', source: 'cliente' },
  cliente_origem: { label: 'Origem do paciente', tipo: 'text', source: 'cliente' },
  cliente_origem_label: { label: 'Origem do paciente (descrição)', tipo: 'text', source: 'cliente' },
  cliente_plano_odontologico: { label: 'Plano odontológico', tipo: 'text', source: 'cliente' },
  cliente_sexo: { label: 'Sexo do paciente', tipo: 'text', source: 'cliente' },
  cliente_data_nascimento: { label: 'Data de nascimento', tipo: 'date', source: 'cliente' },
  cliente_data_nascimento_iso: { label: 'Data de nascimento (ISO)', tipo: 'date', source: 'cliente' },
  cliente_cadastrado_em: { label: 'Data de cadastro do paciente', tipo: 'date', source: 'cliente' },
  data_atual: { label: 'Data atual', tipo: 'date', source: 'manual' },
  data_hora_atual: { label: 'Data e hora atuais', tipo: 'date', source: 'manual' },
  data_hora_atual_iso: { label: 'Data e hora atuais (ISO)', tipo: 'date', source: 'manual' },
  ano_atual: { label: 'Ano atual', tipo: 'date', source: 'manual' },
  profissional_nome: { label: 'Nome do profissional', tipo: 'text', source: 'manual' },
  profissional_cro: { label: 'CRO do profissional', tipo: 'text', source: 'manual' },
  elemento_dentario_num: { label: 'Elemento dentário', tipo: 'text', source: 'manual' },
  elementos_dentarios: { label: 'Elementos dentários', tipo: 'text', source: 'manual' },
  implante_elementos_dentes: { label: 'Dentes do implante', tipo: 'text', source: 'manual' },
  implante_coroas: { label: 'Quantidade de coroas', tipo: 'text', source: 'manual' },
  implante_protocolo: { label: 'Protocolo do implante', tipo: 'text', source: 'manual' },
  previsao_inicio: { label: 'Previsão de início', tipo: 'date', source: 'manual' },
  valor_devolucao: { label: 'Valor da devolução', tipo: 'text', source: 'manual' },
  valor_devolucao_extenso: { label: 'Valor da devolução por extenso', tipo: 'text', source: 'manual' },
  data_pagamento_origem: { label: 'Data do pagamento de origem', tipo: 'date', source: 'manual' },
  motivo_devolucao: { label: 'Motivo da devolução', tipo: 'textarea', source: 'manual' },
  nome_favorecido: { label: 'Nome do favorecido', tipo: 'text', source: 'manual' },
  cpf_favorecido: { label: 'CPF do favorecido', tipo: 'cpf', source: 'manual' },
  banco_nome: { label: 'Banco', tipo: 'text', source: 'manual' },
  banco_agencia: { label: 'Agência', tipo: 'text', source: 'manual' },
  conta_favorecido: { label: 'Conta do favorecido', tipo: 'text', source: 'manual' },
  data_consulta_inicial: { label: 'Data da consulta inicial', tipo: 'date', source: 'manual' },
  escolha_protese: { label: 'Escolha da prótese', tipo: 'text', source: 'manual' },
  observacoes_protese: { label: 'Observações da prótese', tipo: 'textarea', source: 'manual' },
};

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

function inferPlaceholderType(key: string): TermoCampoTipo {
  if (/observ|motivo|descricao|endereco|rodape/i.test(key)) return 'textarea';
  if (/email/i.test(key)) return 'email';
  if (/telefone/i.test(key)) return 'tel';
  if (/cpf|cnpj/i.test(key)) return 'cpf';
  if (/data|ano/i.test(key)) return 'date';
  return 'text';
}

function inferPlaceholderSource(key: string): TermoCampoSource {
  if (key.startsWith('cliente_')) return 'cliente';
  if (key.startsWith('unidade_')) return 'unidade';
  return 'manual';
}

function buildFallbackLabel(key: string) {
  return key
    .split(/[_.-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getPlaceholderMetadata(key: string): PlaceholderMetadata {
  return TERMO_PLACEHOLDER_METADATA[key] || {
    label: buildFallbackLabel(key),
    tipo: inferPlaceholderType(key),
    source: inferPlaceholderSource(key),
  };
}

function getPlaceholderLineVariant(key: string) {
  if (/observ|motivo|endereco|descricao/i.test(key)) return 'long';
  if (/data|ano|cro|cpf|id|num|valor|telefone/i.test(key)) return 'short';
  return 'medium';
}

function renderPlaceholderFillLine(key: string) {
  const variant = getPlaceholderLineVariant(key);
  return `<span class="termo-fill-line termo-fill-line--${variant}" data-placeholder="${escapeHtml(key)}"></span>`;
}

export function normalizeLegacyTermoTemplateHtml(html: string): string {
  if (!html) return '';
  return html.replace(LEGACY_UNIDADE_ENDERECO_RE, '{{unidade_endereco}}');
}

export function buildTermoContext(cliente: Cliente, overrides: RenderConfig = {}, unidade: TermoUnitContext = null): Record<string, string> {
  const base: Record<string, string> = {
    unidade_nome: normalizarValor(unidade?.nome),
    unidade_razao_social: normalizarValor(unidade?.razao_social),
    unidade_cnpj: unidade?.cnpj ? normalizarValor(formatarCNPJ(unidade.cnpj)) : '',
    unidade_cnpj_raw: normalizarValor(unidade?.cnpj),
    unidade_endereco: normalizarValor(unidade?.endereco),
    unidade_telefone: unidade?.telefone ? normalizarValor(formatarTelefone(unidade.telefone)) : '',
    unidade_telefone_raw: normalizarValor(unidade?.telefone),
    unidade_email: normalizarValor(unidade?.email),
    unidade_responsavel: normalizarValor(unidade?.responsavel),
    unidade_recibo_rodape: normalizarValor(unidade?.recibo_rodape),
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
  base.data_atual = formatarDateNaClinica(agora, { day: '2-digit', month: '2-digit', year: 'numeric' });
  base.data_hora_atual = formatarAgoraDaClinica(agora);
  base.data_hora_atual_iso = agora.toISOString();
  base.ano_atual = formatarDateNaClinica(agora, { year: 'numeric' });

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

  const unidadeExemplo: TermoUnitContext = {
    nome: 'Barra do Ceará',
    razao_social: 'Clínica Odontológica Sorria Leste Ltda.',
    cnpj: '46261849000110',
    endereco: 'Avenida Presidente Castelo Branco, 5185 B, Barra do Ceará, Fortaleza/CE',
    telefone: '85991234567',
    email: 'barra@sorrialeste.com',
    responsavel: 'Alanna Regina Bezerra Nobre',
    recibo_rodape: 'Clínica Sorria Leste - Barra do Ceará',
  };

  return buildTermoContext(clienteExemplo, {
    ...SAMPLE_TERMO_OVERRIDES,
    ...overrides,
  }, unidadeExemplo);
}

export function extractTermoPlaceholderKeys(html: string) {
  if (!html) return [];

  const unique = new Set<string>();
  const keys: string[] = [];

  for (const match of html.matchAll(PLACEHOLDER_RE)) {
    const key = String(match[1] || '').trim().toLowerCase();
    if (!key || unique.has(key)) continue;
    unique.add(key);
    keys.push(key);
  }

  return keys;
}

export function buildTermoDraft(html: string, context: Record<string, string>): TermoDraft {
  const placeholdersUsados = extractTermoPlaceholderKeys(html);
  const campos: TermoCampoDraft[] = placeholdersUsados.map((key) => {
    const metadata = getPlaceholderMetadata(key);
    return {
      key,
      label: metadata.label,
      tipo: metadata.tipo,
      value: normalizarValor(context[key]),
      required: true,
      source: metadata.source,
    };
  });

  return {
    campos,
    pendentes: campos.filter((campo) => !campo.value.trim()).map((campo) => campo.key),
    placeholdersUsados,
  };
}

export function renderTermoTemplate(html: string, context: Record<string, string>) {
  const faltando = new Set<string>();
  const rendered = html.replace(PLACEHOLDER_RE, (_, token: string) => {
    const chave = token.trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(context, chave)) {
      faltando.add(chave);
      return renderPlaceholderFillLine(chave);
    }

    const value = context[chave] ?? '';
    if (!value) return renderPlaceholderFillLine(chave);

    return `<strong class="termo-variable">${escapeHtml(value)}</strong>`;
  });

  return {
    html: rendered,
    placeholdersNaoEncontrados: Array.from(faltando),
  };
}
