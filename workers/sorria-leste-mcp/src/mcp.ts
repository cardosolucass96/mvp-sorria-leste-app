import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  audit,
  assertUnit,
  attendanceOperationalDetail,
  clientOperationalHistory,
  clientOperationalProfile,
  clientStats,
  clientSummary,
  dayAgenda,
  executionQueue,
  followupSummary,
  getIdentity,
  listAppointments,
  listAttendances,
  listCategories,
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
} from './repository';
import { omitFinancialFields } from './security';
import type { Env, Identity } from './types';

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

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function ensureDateRange(from: string, to: string): void {
  if (to < from) throw new Error('Período inválido.');
}

function result(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(omitFinancialFields(payload), null, 2) }] };
}

function failure(): ToolResult {
  return {
    content: [{ type: 'text', text: 'Não foi possível executar esta consulta. Verifique o escopo, a unidade e os filtros informados.' }],
    isError: true,
  };
}

async function runReadTool<T>(
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
    identity = await getIdentity(env, props);
    if (unidadeId !== null) assertUnit(identity, unidadeId);
    const payload = await action(identity, setAuditUnit);
    await audit(env, identity, tool, auditUnitId, true);
    return result(payload);
  } catch (error) {
    console.error(`Falha na ferramenta MCP ${tool}`, error);
    await audit(env, identity, tool, auditUnitId, false);
    return failure();
  }
}

export function createServer(env: Env, props: unknown): McpServer {
  const server = new McpServer(
    {
      name: 'sorria-leste',
      version: '0.2.0',
    },
    {
      instructions: [
        'Servidor MCP operacional da Sorria Leste, somente leitura.',
        'Use filtros específicos e informe a unidade quando solicitado.',
        'Não há ferramentas financeiras, clínicas, anexos, prontuários, HTML completo de termos nem escrita.',
        'Dados pessoais de clientes são minimizados/mascarados e campos financeiros são removidos antes da resposta.',
      ].join(' '),
    },
  );

  server.tool('minhas_unidades', 'Lista as unidades que esta conexão pode consultar.', {}, async () =>
    runReadTool(env, props, 'minhas_unidades', null, (identity) => listUnits(env, identity)),
  );

  server.tool('buscar_clientes', 'Busca clientes por nome ou telefone. CPF, telefone e e-mail são mascarados.', {
    busca: z.string().trim().min(2).max(80),
    limite: PAGE,
    offset: OFFSET,
  }, async ({ busca, limite, offset }) =>
    runReadTool(env, props, 'buscar_clientes', null, () => searchClients(env, busca, limite, offset)),
  );

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

  return server;
}
