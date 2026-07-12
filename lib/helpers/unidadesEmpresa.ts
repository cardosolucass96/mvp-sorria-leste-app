import { execute, query } from '@/lib/db';

interface SQLiteColumn {
  name: string;
}

const CAMPOS_EMPRESA_UNIDADE = [
  { nome: 'razao_social', definicao: 'TEXT' },
  { nome: 'cnpj', definicao: 'TEXT' },
  { nome: 'email', definicao: 'TEXT' },
  { nome: 'responsavel', definicao: 'TEXT' },
  { nome: 'recibo_rodape', definicao: 'TEXT' },
];

let camposEmpresaGarantidos = false;

export async function garantirCamposEmpresaUnidades() {
  if (camposEmpresaGarantidos) return;

  const colunas = await query<SQLiteColumn>('PRAGMA table_info(unidades)');
  const existentes = new Set(colunas.map((coluna) => coluna.name));
  const adicionados: string[] = [];

  for (const campo of CAMPOS_EMPRESA_UNIDADE) {
    if (existentes.has(campo.nome)) continue;
    await execute(`ALTER TABLE unidades ADD COLUMN ${campo.nome} ${campo.definicao}`);
    adicionados.push(campo.nome);
  }

  if (adicionados.length > 0) {
    console.warn(`[MIGRATION] Campos empresariais de unidades adicionados: ${adicionados.join(', ')}.`);
  }

  camposEmpresaGarantidos = true;
}

export const UNIDADE_EMPRESA_SELECT = `
  id,
  nome,
  razao_social,
  cnpj,
  endereco,
  telefone,
  email,
  responsavel,
  recibo_rodape,
  ativo,
  created_at
`;
