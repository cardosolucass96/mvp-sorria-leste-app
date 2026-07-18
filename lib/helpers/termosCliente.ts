import { queryOne } from '@/lib/db';
import { garantirCamposEmpresaUnidades, UNIDADE_EMPRESA_SELECT } from '@/lib/helpers/unidadesEmpresa';
import { buildTermoContext, buildTermoDraft, normalizeLegacyTermoTemplateHtml, renderTermoTemplate } from '@/lib/helpers/termosPlaceholder';
import { garantirTermosSchema } from '@/lib/helpers/garantirTermosSchema';
import { Cliente, TermoDraft, TermoTemplate, Unidade } from '@/lib/types';

export interface TermoClienteRenderizado {
  cliente: Cliente;
  termo: TermoTemplate;
  unidade: Unidade | null;
  context: Record<string, string>;
  html: string;
  draft: TermoDraft;
  placeholdersNaoEncontrados: string[];
  templateNormalizado: string;
}

export async function carregarTermoRenderizadoParaCliente(params: {
  clienteId: string | number;
  slug: string;
  unidadeId: number;
  placeholders?: Record<string, unknown>;
}): Promise<TermoClienteRenderizado | null> {
  const { clienteId, slug, unidadeId, placeholders } = params;

  const cliente = await queryOne<Cliente>(
    'SELECT * FROM clientes WHERE id = ?',
    [clienteId]
  );

  if (!cliente) return null;

  await garantirTermosSchema();
  await garantirCamposEmpresaUnidades();

  const termo = await queryOne<TermoTemplate>(
    'SELECT id, slug, titulo, conteudo_html, ativo, permite_autentique, created_by, updated_by, created_at, updated_at FROM termos WHERE slug = ?',
    [slug]
  );

  if (!termo || termo.ativo !== 1) return null;

  const unidade = await queryOne<Unidade>(
    `SELECT ${UNIDADE_EMPRESA_SELECT} FROM unidades WHERE id = ?`,
    [unidadeId]
  );

  const context = buildTermoContext(cliente, placeholders, unidade);
  const templateNormalizado = normalizeLegacyTermoTemplateHtml(termo.conteudo_html);
  const { html, placeholdersNaoEncontrados } = renderTermoTemplate(templateNormalizado, context);
  const draft = buildTermoDraft(templateNormalizado, context);

  return {
    cliente,
    termo,
    unidade,
    context,
    html,
    draft,
    placeholdersNaoEncontrados,
    templateNormalizado,
  };
}
