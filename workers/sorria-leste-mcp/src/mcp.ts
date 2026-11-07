import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  audit,
  assertUnit,
  attendanceFinancialDetail,
  attendanceOperationalDetail,
  clientFinancialProfile,
  clientOperationalHistory,
  clientOperationalProfile,
  clientStats,
  clientSummary,
  createClient,
  createEvaluationAppointment,
  dayAgenda,
  executionQueue,
  followupDetail,
  followupSummary,
  getDiscoveryIdentity,
  getIdentity,
  getWriteIdentity,
  listAppointments,
  listAttendances,
  listCategories,
  listDetailedFollowups,
  listFollowups,
  listPendingAppointments,
  listProcedures,
  listTeam,
  listTerms,
  listUnits,
  operationalSummary,
  operationalSummaryV2,
  queuePanel,
  searchClients,
  unitFinancialSummary,
} from './repository';
import { ExplorationError, exploreDatabase, describeDataset, queryDataset } from './exploration';
import { hasFinancialScope, hasWriteScope, parseOAuthProps, omitFinancialFields } from './security';
import type { Env, Identity } from './types';

export const MCP_VERSION = '0.4.0';

const PAGE = z.coerce.number().int().min(1).max(50).default(25);
const OFFSET = z.coerce.number().int().min(0).max(10_000).default(0);
const UNIT = z.coerce.number().int().positive();
const CLIENT = z.coerce.number().int().positive();
const ATTENDANCE = z.coerce.number().int().positive();
const USER = z.coerce.number().int().positive();
const CATEGORY_SLUG = z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/, 'Use o slug da categoria.');

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

const DATE = z.string().refine(isDateOnly, 'Use uma data válida no formato AAAA-MM-DD.');
const ROLE = z.enum(['admin', 'atendente', 'avaliador', 'executor', 'ortodontista']);
const AGENDAMENTO_STATUS = z.enum(['pendente', 'agendado', 'realizado', 'faltou', 'cancelado']);
const AGENDAMENTO_TIPO = z.enum(['avaliacao', 'procedimento']);
const ATENDIMENTO_STATUS = z.enum(['triagem', 'avaliacao', 'aguardando_liberacao', 'em_execucao', 'finalizado', 'encerrado']);
const FOLLOWUP_STATUS = z.enum(['aberta', 'concluida']);
const FOLLOWUP_TIPO = z.enum(['orcamento', 'sem_posicao', 'retorno', 'cobranca', 'outro']);
const ORIGEM_CLIENTE = z.enum(['fachada', 'trafego_meta', 'trafego_google', 'organico', 'indicacao']);
const SEXO_CLIENTE = z.enum(['masculino', 'feminino', 'outro']);
const PLANO_ODONTOLOGICO = z.enum(['Clin', 'Prime', 'OdontoArt']);
const OPTIONAL_TEXT = z.string().trim().max(300).optional();
const OPTIONAL_SHORT_TEXT = z.string().trim().max(120).optional();
const OPTIONAL_EMAIL = z.string().trim().email().max(160).optional();
const CLINIC_DATETIME = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use data e hora no formato YYYY-MM-DDTHH:mm.');

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function ensureDateRange(from: string, to: string): void {
  if (to < from) throw new Error('Período inválido.');
}

function result(payload: unknown, redactFinancial = true, compact = false): ToolResult {
  const serialized = redactFinancial ? omitFinancialFields(payload) : payload;
  return { content: [{ type: 'text', text: JSON.stringify(serialized, null, compact ? undefined : 2) }] };
}

function failure(message = 'Não foi possível executar esta consulta. Verifique o escopo, a unidade e os filtros informados.'): ToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

async function runDiscoveryTool<T>(
  env: Env,
  props: unknown,
  tool: string,
  unidadeId: number | null,
  action: (identity: Identity, setAuditUnit: (id: number | null) => void) => Promise<T>,
): Promise<ToolResult> {
  let identity: Identity | null = null;
  let auditUnitId = unidadeId;
  const setAuditUnit = (id: number | null) => {
    auditUnitId = id;
  };

  try {
    identity = await getDiscoveryIdentity(env, props);
    if (unidadeId !== null) assertUnit(identity, unidadeId);
    const payload = await action(identity, setAuditUnit);
    await audit(env, identity, tool, auditUnitId, true);
    return result(payload);
  } catch (error) {
    if (!(error instanceof ExplorationError)) console.error(`Falha na ferramenta MCP ${tool}`, error);
    await audit(env, identity, tool, auditUnitId, false);
    return failure(error instanceof ExplorationError ? error.message : undefined);
  }
}

async function runReadTool<T>(
  env: Env,
  props: unknown,
  tool: string,
  unidadeId: number | null,
  action: (identity: Identity, setAuditUnit: (id: number | null) => void) => Promise<T>,
  options: { redactFinancial?: boolean; requiresFinancialScope?: boolean; compact?: boolean } = {},
): Promise<ToolResult> {
  let identity: Identity | null = null;
  let auditUnitId = unidadeId;
  const setAuditUnit = (id: number | null) => {
    auditUnitId = id;
  };

  try {
    identity = await getIdentity(env, props);
    if (unidadeId !== null) assertUnit(identity, unidadeId);
    if (options.requiresFinancialScope && !hasFinancialScope(identity.scope)) {
      throw new Error('Escopo financeiro não autorizado para esta conexão MCP.');
    }
    const payload = await action(identity, setAuditUnit);
    await audit(env, identity, tool, auditUnitId, true);
    return result(payload, options.redactFinancial ?? true, options.compact ?? false);
  } catch (error) {
    if (!(error instanceof ExplorationError)) console.error(`Falha na ferramenta MCP ${tool}`, error);
    await audit(env, identity, tool, auditUnitId, false);
    return failure(error instanceof ExplorationError ? error.message : undefined);
  }
}

async function runWriteTool<T>(
  env: Env,
  props: unknown,
  tool: string,
  unidadeId: number | null,
  action: (identity: Identity) => Promise<T>,
): Promise<ToolResult> {
  let identity: Identity | null = null;
  try {
    identity = await getWriteIdentity(env, props);
    if (unidadeId !== null) assertUnit(identity, unidadeId);
    const payload = await action(identity);
    await audit(env, identity, tool, unidadeId, true);
    return result(payload);
  } catch (error) {
    console.error(`Falha na ferramenta MCP ${tool}`, error);
    await audit(env, identity, tool, unidadeId, false);
    return failure('Não foi possível executar esta escrita. Verifique o escopo, a unidade e os dados informados.');
  }
}

function assertFinancialScope(identity: Identity): void {
  if (!hasFinancialScope(identity.scope)) {
    throw new Error('Escopo financeiro não autorizado para esta conexão MCP.');
  }
}

export function createServer(env: Env, props: unknown): McpServer {
  const server = new McpServer(
    {
      name: 'sorria-leste',
      version: MCP_VERSION,
    },
    {
      instructions: [
        'Servidor MCP operacional da Sorria Leste.',
        'Para investigar livremente: explorar_banco → descrever_tabela → explicar_consulta → consultar_sql. Use apenas tabelas/colunas anunciadas; a camada SQL já filtra unidades e mascara contatos. SQL de escrita e conteúdo clínico não são permitidos.',
        'Use filtros específicos e informe a unidade quando solicitado.',
        'Ferramentas financeiras exigem o escopo separado sorria.finance.read.',
        'O escopo sorria.write libera apenas cadastro de cliente e agendamento de avaliação.',
        'Não há escrita de procedimentos, pagamentos, follow-ups, anexos, prontuários, notas clínicas nem HTML completo de termos.',
        'Dados pessoais de clientes são minimizados/mascarados; no escopo operacional os campos financeiros continuam ocultos.',
      ].join(' '),
    },
  );

  server.tool('minhas_unidades', 'Lista as unidades que esta conexão pode consultar.', {}, async () =>
    runDiscoveryTool(env, props, 'minhas_unidades', null, (identity) => listUnits(env, identity)),
  );

  server.tool('buscar_clientes', 'Busca clientes por nome ou telefone. CPF, telefone e e-mail são mascarados.', {
    busca: z.string().trim().min(2).max(80),
    limite: PAGE,
    offset: OFFSET,
  }, async ({ busca, limite, offset }) =>
    runDiscoveryTool(env, props, 'buscar_clientes', null, () => searchClients(env, busca, limite, offset)),
  );

  if (hasWriteScope(parseOAuthProps(props)?.scope ?? [])) {
    server.tool('criar_cliente', 'Cria um cliente/lead com dados cadastrais mínimos. Requer sorria.write.', {
      nome: z.string().trim().min(1).max(120),
      origem: ORIGEM_CLIENTE,
      telefone: OPTIONAL_SHORT_TEXT,
      email: OPTIONAL_EMAIL,
      cpf: OPTIONAL_SHORT_TEXT,
      dataNascimento: DATE.optional(),
      endereco: OPTIONAL_TEXT,
      sexo: SEXO_CLIENTE.optional(),
      planoOdontologico: PLANO_ODONTOLOGICO.optional(),
      observacoes: OPTIONAL_TEXT,
    }, async (input) =>
      runWriteTool(env, props, 'criar_cliente', null, () => createClient(env, input)),
    );

    server.tool('criar_agendamento_avaliacao', 'Cria apenas agendamento de avaliação para um cliente. Requer sorria.write.', {
      unidadeId: UNIT,
      clienteId: CLIENT,
      dataAgendada: CLINIC_DATETIME.optional(),
      executorId: USER.optional(),
      observacoes: OPTIONAL_TEXT,
    }, async ({ unidadeId, clienteId, dataAgendada, executorId, observacoes }) =>
      runWriteTool(env, props, 'criar_agendamento_avaliacao', unidadeId, (identity) =>
        createEvaluationAppointment(env, {
          unidadeId,
          clienteId,
          dataAgendada,
          executorId,
          criadoPorId: identity.id,
          observacoes,
        })),
    );

  }

  server.tool('obter_cliente_resumo', 'Retorna cadastro minimizado e histórico operacional básico; não inclui prontuários, notas ou anexos.', {
    clienteId: CLIENT,
  }, async ({ clienteId }) =>
    runReadTool(env, props, 'obter_cliente_resumo', null, async () => {
      const summary = await clientSummary(env, clienteId);
      return summary ?? { encontrado: false };
    }),
  );

  server.tool('listar_agendamentos', 'Lista agenda de uma unidade por período e status.', {
    unidadeId: UNIT,
    dataInicio: DATE,
    dataFim: DATE,
    status: AGENDAMENTO_STATUS.optional(),
    limite: PAGE,
    offset: OFFSET,
  }, async ({ unidadeId, dataInicio, dataFim, status, limite, offset }) =>
    runReadTool(env, props, 'listar_agendamentos', unidadeId, async () => {
      ensureDateRange(dataInicio, dataFim);
      return listAppointments(env, unidadeId, dataInicio, dataFim, status, limite, offset);
    }),
  );

  server.tool('listar_atendimentos', 'Lista atendimentos de uma unidade com status operacional; não inclui valores, pagamentos ou informações clínicas.', {
    unidadeId: UNIT,
    status: ATENDIMENTO_STATUS.optional(),
    limite: PAGE,
    offset: OFFSET,
  }, async ({ unidadeId, status, limite, offset }) =>
    runReadTool(env, props, 'listar_atendimentos', unidadeId, () =>
      listAttendances(env, unidadeId, status, limite, offset)),
  );

  server.tool('resumo_operacional', 'Resumo simples de atendimentos e agendamentos de uma unidade. Não inclui faturamento.', {
    unidadeId: UNIT,
    dataInicio: DATE,
    dataFim: DATE,
  }, async ({ unidadeId, dataInicio, dataFim }) =>
    runReadTool(env, props, 'resumo_operacional', unidadeId, async () => {
      ensureDateRange(dataInicio, dataFim);
      return operationalSummary(env, unidadeId, dataInicio, dataFim);
    }),
  );

  server.tool('listar_procedimentos', 'Lista procedimentos ativos do catálogo sem preços, comissões ou qualquer dado financeiro.', {
    busca: z.string().trim().min(2).max(80).optional(),
    limite: PAGE,
    offset: OFFSET,
  }, async ({ busca, limite, offset }) =>
    runReadTool(env, props, 'listar_procedimentos', null, () => listProcedures(env, busca, limite, offset)),
  );

  server.tool('listar_categorias', 'Lista categorias operacionais, slugs, ordem, roles permitidas e flag de pular avaliação.', {
    somenteAtivas: z.boolean().default(true),
  }, async ({ somenteAtivas }) =>
    runReadTool(env, props, 'listar_categorias', null, () => listCategories(env, somenteAtivas)),
  );

  server.tool('listar_equipe', 'Lista usuários ativos por unidade e/ou role. Não retorna e-mail por padrão.', {
    unidadeId: UNIT.optional(),
    role: ROLE.optional(),
    limite: PAGE,
    offset: OFFSET,
  }, async ({ unidadeId, role, limite, offset }) =>
    runReadTool(env, props, 'listar_equipe', unidadeId ?? null, () => listTeam(env, unidadeId, role, limite, offset)),
  );

  server.tool('agenda_do_dia', 'Mostra a agenda de uma unidade em uma data, com resumo por status e telefones mascarados.', {
    unidadeId: UNIT,
    data: DATE,
    limite: PAGE,
    offset: OFFSET,
  }, async ({ unidadeId, data, limite, offset }) =>
    runReadTool(env, props, 'agenda_do_dia', unidadeId, () => dayAgenda(env, unidadeId, data, limite, offset)),
  );

  server.tool('listar_agendamentos_pendentes', 'Lista agendamentos pendentes ou sem data, com filtros operacionais.', {
    unidadeId: UNIT,
    status: AGENDAMENTO_STATUS.optional(),
    tipo: AGENDAMENTO_TIPO.optional(),
    dataInicio: DATE.optional(),
    dataFim: DATE.optional(),
    limite: PAGE,
    offset: OFFSET,
  }, async ({ unidadeId, status, tipo, dataInicio, dataFim, limite, offset }) =>
    runReadTool(env, props, 'listar_agendamentos_pendentes', unidadeId, async () => {
      if (dataInicio && dataFim) ensureDateRange(dataInicio, dataFim);
      return listPendingAppointments(env, unidadeId, status, tipo, dataInicio, dataFim, limite, offset);
    }),
  );

  server.tool('painel_fila', 'Visão agrupada da fila por categoria, semelhante ao painel TV.', {
    unidadeId: UNIT,
    categoriaSlug: CATEGORY_SLUG,
    limite: PAGE,
    offset: OFFSET,
  }, async ({ unidadeId, categoriaSlug, limite, offset }) =>
    runReadTool(env, props, 'painel_fila', unidadeId, () => queuePanel(env, unidadeId, categoriaSlug, limite, offset)),
  );

  server.tool('listar_fila_execucao', 'Lista itens individuais da fila de execução por categoria e, opcionalmente, executor.', {
    unidadeId: UNIT,
    categoriaSlug: CATEGORY_SLUG,
    executorId: USER.optional(),
    limite: PAGE,
    offset: OFFSET,
  }, async ({ unidadeId, categoriaSlug, executorId, limite, offset }) =>
    runReadTool(env, props, 'listar_fila_execucao', unidadeId, () =>
      executionQueue(env, unidadeId, categoriaSlug, executorId, limite, offset)),
  );

  server.tool('detalhar_atendimento_operacional', 'Ficha operacional do atendimento. Não retorna valores, pagamentos, prontuários, notas ou anexos.', {
    atendimentoId: ATTENDANCE,
  }, async ({ atendimentoId }) =>
    runReadTool(env, props, 'detalhar_atendimento_operacional', null, async (identity, setAuditUnit) => {
      const detail = await attendanceOperationalDetail(env, atendimentoId);
      if (!detail) return { encontrado: false };
      setAuditUnit(detail.unidadeId);
      assertUnit(identity, detail.unidadeId);
      return detail;
    }),
  );

  server.tool('detalhar_atendimento_financeiro', 'Ficha financeira do atendimento com itens, totais, pagamentos, taxas, formas e alocações.', {
    atendimentoId: ATTENDANCE,
  }, async ({ atendimentoId }) =>
    runReadTool(env, props, 'detalhar_atendimento_financeiro', null, async (identity, setAuditUnit) => {
      assertFinancialScope(identity);
      const detail = await attendanceFinancialDetail(env, atendimentoId);
      if (!detail) return { encontrado: false };
      setAuditUnit(detail.unidadeId);
      assertUnit(identity, detail.unidadeId);
      return detail;
    }, { redactFinancial: false, requiresFinancialScope: true }),
  );

  server.tool('listar_followups', 'Lista follow-ups operacionais por unidade. Follow-ups de cobrança são rejeitados/omitidos.', {
    unidadeId: UNIT,
    status: FOLLOWUP_STATUS.optional(),
    tipo: FOLLOWUP_TIPO.optional(),
    responsavelUsuarioId: USER.optional(),
    clienteId: CLIENT.optional(),
    dataInicio: DATE.optional(),
    dataFim: DATE.optional(),
    limite: PAGE,
    offset: OFFSET,
  }, async ({ unidadeId, status, tipo, responsavelUsuarioId, clienteId, dataInicio, dataFim, limite, offset }) =>
    runReadTool(env, props, 'listar_followups', unidadeId, async () => {
      if (dataInicio && dataFim) ensureDateRange(dataInicio, dataFim);
      return listFollowups(env, unidadeId, status, tipo, responsavelUsuarioId, clienteId, dataInicio, dataFim, limite, offset);
    }),
  );

  server.tool('listar_followups_completos', 'Lista follow-ups com mais contexto: descrição, cliente, responsável, criador e conclusão. Cobrança exige escopo financeiro.', {
    unidadeId: UNIT,
    status: FOLLOWUP_STATUS.optional(),
    tipo: FOLLOWUP_TIPO.optional(),
    responsavelUsuarioId: USER.optional(),
    clienteId: CLIENT.optional(),
    busca: z.string().trim().min(2).max(120).optional(),
    incluirCobranca: z.boolean().default(false),
    dataInicio: DATE.optional(),
    dataFim: DATE.optional(),
    limite: PAGE,
    offset: OFFSET,
  }, async ({ unidadeId, status, tipo, responsavelUsuarioId, clienteId, busca, incluirCobranca, dataInicio, dataFim, limite, offset }) =>
    runReadTool(env, props, 'listar_followups_completos', unidadeId, async (identity) => {
      if (dataInicio && dataFim) ensureDateRange(dataInicio, dataFim);
      if ((incluirCobranca || tipo === 'cobranca') && !hasFinancialScope(identity.scope)) {
        throw new Error('Escopo financeiro não autorizado para follow-ups de cobrança.');
      }
      return listDetailedFollowups(env, unidadeId, {
        status,
        tipo,
        responsavelUsuarioId,
        clienteId,
        from: dataInicio,
        to: dataFim,
        search: busca,
        includeBilling: incluirCobranca || tipo === 'cobranca',
        allowFinancialText: incluirCobranca || tipo === 'cobranca',
        limit: limite,
        offset,
      });
    }, { redactFinancial: !(incluirCobranca || tipo === 'cobranca') }),
  );

  server.tool('detalhar_followup', 'Retorna o follow-up completo por ID. Se for cobrança, exige escopo financeiro.', {
    followupId: z.coerce.number().int().positive(),
  }, async ({ followupId }) =>
    runReadTool(env, props, 'detalhar_followup', null, async (identity, setAuditUnit) => {
      const operationalDetail = await followupDetail(env, followupId, false);
      if (!operationalDetail) return { encontrado: false };
      setAuditUnit(operationalDetail.unidadeId);
      assertUnit(identity, operationalDetail.unidadeId);

      if (operationalDetail.tipo === 'cobranca') {
        assertFinancialScope(identity);
        return followupDetail(env, followupId, true);
      }

      return operationalDetail;
    }, { redactFinancial: false }),
  );

  server.tool('resumo_followups', 'Contadores de follow-ups abertos, atrasados, vencendo hoje e concluídos por tipo; exclui cobrança.', {
    unidadeId: UNIT,
    dataInicio: DATE.optional(),
    dataFim: DATE.optional(),
  }, async ({ unidadeId, dataInicio, dataFim }) =>
    runReadTool(env, props, 'resumo_followups', unidadeId, async () => {
      if (dataInicio && dataFim) ensureDateRange(dataInicio, dataFim);
      return followupSummary(env, unidadeId, dataInicio, dataFim);
    }),
  );

  server.tool('perfil_cliente_operacional', 'Perfil administrativo do cliente com PII mascarada e dados operacionais recentes.', {
    clienteId: CLIENT,
  }, async ({ clienteId }) =>
    runReadTool(env, props, 'perfil_cliente_operacional', null, async () => {
      const profile = await clientOperationalProfile(env, clienteId);
      return profile ?? { encontrado: false };
    }),
  );

  server.tool('perfil_cliente_financeiro', 'Perfil financeiro do cliente com saldo, pendências, atendimentos financeiros, pagamentos recentes e movimentações.', {
    clienteId: CLIENT,
  }, async ({ clienteId }) =>
    runReadTool(env, props, 'perfil_cliente_financeiro', null, async (identity) => {
      assertFinancialScope(identity);
      const profile = await clientFinancialProfile(env, clienteId);
      return profile ?? { encontrado: false };
    }, { redactFinancial: false, requiresFinancialScope: true }),
  );

  server.tool('historico_cliente_operacional', 'Timeline resumida de atendimentos, agendamentos e follow-ups não financeiros do cliente.', {
    clienteId: CLIENT,
    limite: PAGE,
  }, async ({ clienteId, limite }) =>
    runReadTool(env, props, 'historico_cliente_operacional', null, () =>
      clientOperationalHistory(env, clienteId, limite)),
  );

  server.tool('estatisticas_clientes', 'Estatísticas agregadas de novos clientes por origem, sexo e plano odontológico.', {
    dataInicio: DATE,
    dataFim: DATE,
  }, async ({ dataInicio, dataFim }) =>
    runReadTool(env, props, 'estatisticas_clientes', null, async () => {
      ensureDateRange(dataInicio, dataFim);
      return clientStats(env, dataInicio, dataFim);
    }),
  );

  server.tool('listar_termos', 'Lista slugs, títulos e atualização de termos. Não retorna HTML completo.', {
    somenteAtivos: z.boolean().default(true),
  }, async ({ somenteAtivos }) =>
    runReadTool(env, props, 'listar_termos', null, () => listTerms(env, somenteAtivos)),
  );

  server.tool('resumo_operacional_v2', 'Consolidado operacional por unidade/período: atendimentos, agenda, fila e follow-ups sem financeiro.', {
    unidadeId: UNIT,
    dataInicio: DATE,
    dataFim: DATE,
  }, async ({ unidadeId, dataInicio, dataFim }) =>
    runReadTool(env, props, 'resumo_operacional_v2', unidadeId, async () => {
      ensureDateRange(dataInicio, dataFim);
      return operationalSummaryV2(env, unidadeId, dataInicio, dataFim);
    }),
  );

  server.tool('resumo_financeiro_unidade', 'Consolidado financeiro da unidade por período, com totais, taxas, recebimentos por método, por recebedor e pagamentos recentes.', {
    unidadeId: UNIT,
    dataInicio: DATE,
    dataFim: DATE,
  }, async ({ unidadeId, dataInicio, dataFim }) =>
    runReadTool(env, props, 'resumo_financeiro_unidade', unidadeId, async (identity) => {
      assertFinancialScope(identity);
      ensureDateRange(dataInicio, dataFim);
      return unitFinancialSummary(env, unidadeId, dataInicio, dataFim);
    }, { redactFinancial: false, requiresFinancialScope: true }),
  );

  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  server.registerTool('explorar_banco', {
    description: 'Descobre o catálogo SQL permitido, campos, relacionamentos, unidades e limites da conexão. Comece por aqui para investigar dados.',
    inputSchema: {}, annotations,
  }, async () => runReadTool(env, props, 'explorar_banco', null, async identity => exploreDatabase(identity), { redactFinancial: false, compact: true }));

  server.registerTool('descrever_tabela', {
    description: 'Descreve os campos autorizados de uma tabela, tipos atuais do banco e relacionamentos; não revela colunas privadas.',
    inputSchema: { tabela: z.string().min(1).max(80) }, annotations,
  }, async ({ tabela }) => runReadTool(env, props, 'descrever_tabela', null, identity => describeDataset(env, identity, tabela), { redactFinancial: false, compact: true }));

  const querySchema = {
    sql: z.string().min(1).max(8000),
    parametros: z.array(z.union([z.string().max(2000), z.number().finite(), z.null()])).max(50).default([]),
    unidadeId: UNIT.optional(),
    limite: z.number().int().min(1).max(200).default(100),
    offset: z.number().int().min(0).max(10000).default(0),
  };
  for (const explain of [true, false]) {
    const name = explain ? 'explicar_consulta' : 'consultar_sql';
    server.registerTool(name, {
      description: explain
        ? 'EXPLAIN QUERY PLAN de um SELECT validado, sem executar a leitura de dados. Avalie o plano antes de consultas grandes.'
        : 'Executa um único SELECT SQLite no catálogo protegido. Permite JOIN com ON/USING, agregações e CTEs não recursivas. Parâmetros ?, unidade automática, contatos mascarados e financeiro conforme escopo. Use ORDER BY ao paginar.',
      inputSchema: querySchema, annotations,
    }, async input => runReadTool(env, props, name, input.unidadeId ?? null,
      identity => queryDataset(env, identity, input, explain), { redactFinancial: false, compact: true }));
  }

  return server;
}
