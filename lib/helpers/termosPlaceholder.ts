import { Cliente } from '@/lib/types';
import { formatarCPF, formatarTelefone, formatarData, formatarDataHora } from '@/lib/utils/formatters';
import { getOrigemLabel } from '@/lib/constants/origens';

interface RenderConfig {
  [key: string]: unknown;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9._-]+)\s*\}\}/g;

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

export function renderTermoTemplate(html: string, context: Record<string, string>) {
  const faltando = new Set<string>();
  const rendered = html.replace(PLACEHOLDER_RE, (_, token: string) => {
    const chave = token.trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(context, chave)) {
      faltando.add(chave);
      return '';
    }
    return context[chave] ?? '';
  });

  return {
    html: rendered,
    placeholdersNaoEncontrados: Array.from(faltando),
  };
}
