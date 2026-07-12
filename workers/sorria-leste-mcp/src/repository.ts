import type { AppUser, D1PreparedStatement, Env, Identity, OAuthProps } from './types';
import { hasReadScope, isForbiddenFollowupType, isMcpAdministrator, maskCpf, maskEmail, maskNullableText, maskPhone, parseOAuthProps } from './security';

type QueryResult<T> = { results: T[] };
type Primitive = string | number | null;

async function all<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>() as QueryResult<T>;
  return result.results ?? [];
}

function splitCsv(value: string | null): string[] {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

function startOfDay(date: string): string {
  return `${date} 00:00:00`;
}

function endOfDay(date: string): string {
  return `${date} 23:59:59`;
}

function safeDestinoStatus(status: string | null): string | null {
  if (!status) return null;
  if (status.includes('pago')) return 'sem_data';
  return status;
}

function executionStatus(status: string): string {
  if (status === 'executando') return 'em_execucao';
  if (status === 'pago') return 'disponivel_para_execucao';
  return status;
}

function attendanceStatus(status: string): string {
  if (status === 'aguardando_pagamento') return 'aguardando_liberacao';
  return status;
}

function dbAttendanceStatus(status: string | undefined): string | undefined {
  if (status === 'aguardando_liberacao') return 'aguardando_pagamento';
  return status;
}

export async function getIdentity(env: Env, propsInput: unknown): Promise<Identity> {
  const props = parseOAuthProps(propsInput);
  if (!props || !hasReadScope(props.scope)) throw new Error('Acesso MCP sem escopo de leitura.');

  const user = await env.DB.prepare(
    'SELECT id, nome, email, role, ativo FROM usuarios WHERE id = ? AND email = ?',
  ).bind(props.userId, props.email.trim().toLowerCase()).first<AppUser>();

  if (!user || !isMcpAdministrator(user, env)) {
    throw new Error('Conta sem permissão MCP.');
  }

  const unidades = await all<{ id: number }>(env.DB.prepare(
    'SELECT id FROM unidades WHERE ativo = 1 ORDER BY nome ASC',
  ));

  return { ...user, unidadeIds: unidades.map((unidade) => unidade.id), scope: props.scope, clientId: props.clientId };
}

export function assertUnit(identity: Identity, unidadeId: number): void {
  if (!identity.unidadeIds.includes(unidadeId)) {
    throw new Error('Unidade não autorizada para esta conexão MCP.');
  }
}

export async function listUnits(env: Env, identity: Identity) {
  if (identity.unidadeIds.length === 0) return [];
  const placeholders = identity.unidadeIds.map(() => '?').join(', ');
  return all<{ id: number; nome: string; endereco: string | null; telefone: string | null }>(
    env.DB.prepare(`SELECT id, nome, endereco, telefone FROM unidades WHERE id IN (${placeholders}) ORDER BY nome ASC`)
      .bind(...identity.unidadeIds),
  );
}

export async function searchClients(env: Env, query: string, limit: number, offset: number) {
  const normalized = `%${query.trim().toLowerCase()}%`;
  const rows = await all<{ id: number; nome: string; telefone: string | null; email: string | null; cpf: string | null }>(
    env.DB.prepare(`SELECT id, nome, telefone, email, cpf
      FROM clientes
      WHERE LOWER(nome) LIKE ? OR LOWER(COALESCE(telefone, '')) LIKE ?
      ORDER BY nome ASC LIMIT ? OFFSET ?`).bind(normalized, normalized, limit, offset),
  );
  return rows.map((row) => ({
    id: row.id,
    nome: row.nome,
    telefone: maskPhone(row.telefone),
    email: maskEmail(row.email),
    cpf: maskCpf(row.cpf),
  }));
}

export async function clientSummary(env: Env, clientId: number) {
  const client = await env.DB.prepare(
    'SELECT id, nome, telefone, email, cpf, origem, created_at FROM clientes WHERE id = ?',
  ).bind(clientId).first<{
    id: number; nome: string; telefone: string | null; email: string | null; cpf: string | null; origem: string; created_at: string;
  }>();
  if (!client) return null;

  const atendimentos = await all<{ id: number; status: string; created_at: string; unidade_nome: string | null }>(
    env.DB.prepare(`SELECT a.id, a.status, a.created_at, u.nome AS unidade_nome
      FROM atendimentos a LEFT JOIN unidades u ON u.id = a.unidade_id
      WHERE a.cliente_id = ? ORDER BY a.created_at DESC LIMIT 20`).bind(clientId),
  );
  return {
    id: client.id,
    nome: client.nome,
    telefone: maskPhone(client.telefone),
    email: maskEmail(client.email),
    cpf: maskCpf(client.cpf),
    origem: client.origem,
    cadastradoEm: client.created_at,
    atendimentos: atendimentos.map((item) => ({ ...item, status: attendanceStatus(item.status) })),
  };
}

export async function listAppointments(env: Env, unidadeId: number, from: string, to: string, status: string | undefined, limit: number, offset: number) {
  const conditions = ['a.unidade_id = ?', 'a.data_agendada >= ?', 'a.data_agendada <= ?'];
  const params: Array<string | number> = [unidadeId, from, to];
  if (status) {
    conditions.push('a.status = ?');
    params.push(status);
  }
  params.push(limit, offset);
  const rows = await all<{
    id: number; data_agendada: string | null; status: string; cliente_nome: string; cliente_telefone: string | null; procedimento_nome: string | null; executor_nome: string | null;
  }>(env.DB.prepare(`SELECT a.id, a.data_agendada, a.status, c.nome AS cliente_nome,
      c.telefone AS cliente_telefone, p.nome AS procedimento_nome, u.nome AS executor_nome
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    LEFT JOIN procedimentos p ON p.id = a.procedimento_id
    LEFT JOIN usuarios u ON u.id = a.executor_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY a.data_agendada ASC, a.id ASC LIMIT ? OFFSET ?`).bind(...params),
  );
  return rows.map((row) => ({ ...row, cliente_telefone: maskPhone(row.cliente_telefone) }));
}

export async function listAttendances(env: Env, unidadeId: number, status: string | undefined, limit: number, offset: number) {
  const conditions = ['a.unidade_id = ?'];
  const params: Array<string | number> = [unidadeId];
  const dbStatus = dbAttendanceStatus(status);
  if (dbStatus) {
    conditions.push('a.status = ?');
    params.push(dbStatus);
  }
  params.push(limit, offset);
  const rows = await all<{
    id: number; status: string; created_at: string; cliente_nome: string; avaliador_nome: string | null; categoria_nome: string | null;
  }>(env.DB.prepare(`SELECT a.id, a.status, a.created_at, c.nome AS cliente_nome,
      u.nome AS avaliador_nome, cat.nome AS categoria_nome
    FROM atendimentos a
    JOIN clientes c ON c.id = a.cliente_id
    LEFT JOIN usuarios u ON u.id = a.avaliador_id
    LEFT JOIN categorias cat ON cat.id = a.categoria_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).bind(...params));
  return rows.map((row) => ({ ...row, status: attendanceStatus(row.status) }));
}

export async function operationalSummary(env: Env, unidadeId: number, from: string, to: string) {
  const byStatus = await all<{ status: string; total: number }>(env.DB.prepare(
    `SELECT CASE WHEN status = 'aguardando_pagamento' THEN 'aguardando_liberacao' ELSE status END AS status,
        COUNT(*) AS total FROM atendimentos
     WHERE unidade_id = ? AND DATE(created_at) BETWEEN ? AND ?
     GROUP BY CASE WHEN status = 'aguardando_pagamento' THEN 'aguardando_liberacao' ELSE status END
     ORDER BY status`,
  ).bind(unidadeId, from, to));
  const appointments = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM agendamentos
     WHERE unidade_id = ? AND DATE(COALESCE(data_agendada, created_at)) BETWEEN ? AND ?`,
  ).bind(unidadeId, from, to).first<{ total: number }>();
  return { periodo: { inicio: from, fim: to }, atendimentosPorStatus: byStatus, agendamentos: appointments?.total ?? 0 };
}

export async function listProcedures(env: Env, query: string | undefined, limit: number, offset: number) {
  const params: Array<string | number> = [];
  let where = 'WHERE p.ativo = 1';
  if (query?.trim()) {
    where += ' AND LOWER(p.nome) LIKE ?';
    params.push(`%${query.trim().toLowerCase()}%`);
  }
  params.push(limit, offset);
  const procedures = await all<{
    id: number; nome: string; descricao: string | null; por_dente: number; tem_etapas: number; tem_face: number; categoria_nome: string | null; categoria_slug: string | null;
  }>(
    env.DB.prepare(`SELECT p.id, p.nome, p.descricao, p.por_dente, p.tem_etapas, p.tem_face,
        c.nome AS categoria_nome, c.slug AS categoria_slug
      FROM procedimentos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      ${where} ORDER BY p.nome ASC LIMIT ? OFFSET ?`).bind(...params),
  );
  const etapas = procedures.length > 0
    ? await all<{ procedimento_id: number; id: number; nome: string; ordem: number }>(
      env.DB.prepare(`SELECT id, procedimento_id, nome, ordem
        FROM procedimento_etapas_modelo
        WHERE procedimento_id IN (${procedures.map(() => '?').join(', ')})
        ORDER BY procedimento_id ASC, ordem ASC, id ASC`)
        .bind(...procedures.map((procedure) => procedure.id)),
    )
    : [];
  const etapasPorProcedimento = new Map<number, Array<{ id: number; nome: string; ordem: number }>>();
  for (const etapa of etapas) {
    const current = etapasPorProcedimento.get(etapa.procedimento_id) ?? [];
    current.push({ id: etapa.id, nome: etapa.nome, ordem: etapa.ordem });
    etapasPorProcedimento.set(etapa.procedimento_id, current);
  }
  return procedures.map((procedure) => ({
    id: procedure.id,
    nome: procedure.nome,
    descricao: maskNullableText(procedure.descricao),
    categoria: procedure.categoria_nome ? { nome: procedure.categoria_nome, slug: procedure.categoria_slug } : null,
    por_dente: procedure.por_dente,
    tem_etapas: procedure.tem_etapas,
    tem_face: procedure.tem_face,
    etapas: etapasPorProcedimento.get(procedure.id) ?? [],
  }));
}

export async function listCategories(env: Env, activeOnly: boolean) {
  const where = activeOnly ? 'WHERE c.ativo = 1' : '';
  const rows = await all<{
    id: number; nome: string; slug: string; cor: string; icone: string; ativo: number; ordem: number; pula_avaliacao: number; roles_csv: string | null;
  }>(env.DB.prepare(`SELECT c.id, c.nome, c.slug, c.cor, c.icone, c.ativo, c.ordem, c.pula_avaliacao,
      (SELECT GROUP_CONCAT(role) FROM categoria_roles WHERE categoria_id = c.id) AS roles_csv
    FROM categorias c ${where}
    ORDER BY c.ordem ASC, c.nome ASC`));
  return rows.map(({ roles_csv, ...row }) => ({ ...row, roles: splitCsv(roles_csv) }));
}

export async function listTeam(env: Env, unidadeId: number | undefined, role: string | undefined, limit: number, offset: number) {
  const conditions = ['u.ativo = 1'];
  const params: Primitive[] = [];
  if (unidadeId) {
    conditions.push(`EXISTS (
      SELECT 1 FROM usuario_unidades uu_filter
      WHERE uu_filter.usuario_id = u.id AND uu_filter.unidade_id = ?
    )`);
    params.push(unidadeId);
  }
  if (role) {
    conditions.push(`(
      u.role = ? OR EXISTS (
        SELECT 1 FROM usuario_roles ur_filter
        WHERE ur_filter.usuario_id = u.id AND ur_filter.role = ?
      )
    )`);
    params.push(role, role);
  }
  params.push(limit, offset);
  const rows = await all<{
    id: number; nome: string; role: string; roles_csv: string | null; unidades_csv: string | null;
  }>(env.DB.prepare(`SELECT u.id, u.nome, u.role,
      GROUP_CONCAT(DISTINCT ur.role) AS roles_csv,
      GROUP_CONCAT(DISTINCT un.nome) AS unidades_csv
    FROM usuarios u
    LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
    LEFT JOIN usuario_unidades uu ON uu.usuario_id = u.id
    LEFT JOIN unidades un ON un.id = uu.unidade_id AND un.ativo = 1
    WHERE ${conditions.join(' AND ')}
    GROUP BY u.id
    ORDER BY u.nome ASC LIMIT ? OFFSET ?`).bind(...params));
  return rows.map((row) => ({
    id: row.id,
    nome: row.nome,
    role_primaria: row.role,
    roles: splitCsv(row.roles_csv).length > 0 ? splitCsv(row.roles_csv) : [row.role],
    unidades: splitCsv(row.unidades_csv),
  }));
}

export async function dayAgenda(env: Env, unidadeId: number, date: string, limit: number, offset: number) {
  const rows = await all<{
    id: number; data_agendada: string | null; status: string; tipo: string; cliente_id: number; cliente_nome: string; cliente_telefone: string | null; procedimento_nome: string | null; executor_nome: string | null;
  }>(env.DB.prepare(`SELECT a.id, a.data_agendada, a.status, a.tipo, c.id AS cliente_id,
      c.nome AS cliente_nome, c.telefone AS cliente_telefone,
      p.nome AS procedimento_nome, u.nome AS executor_nome
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    LEFT JOIN procedimentos p ON p.id = a.procedimento_id
    LEFT JOIN usuarios u ON u.id = a.executor_id
    WHERE a.unidade_id = ? AND a.data_agendada BETWEEN ? AND ?
    ORDER BY a.data_agendada ASC, a.id ASC LIMIT ? OFFSET ?`)
    .bind(unidadeId, startOfDay(date), endOfDay(date), limit, offset));
  const resumo = await all<{ status: string; total: number }>(env.DB.prepare(
    `SELECT status, COUNT(*) AS total FROM agendamentos
     WHERE unidade_id = ? AND data_agendada BETWEEN ? AND ?
     GROUP BY status ORDER BY status`,
  ).bind(unidadeId, startOfDay(date), endOfDay(date)));
  return {
    unidadeId,
    data: date,
    resumoPorStatus: resumo,
    itens: rows.map((row) => ({ ...row, cliente_telefone: maskPhone(row.cliente_telefone) })),
  };
}

export async function listPendingAppointments(
  env: Env,
  unidadeId: number,
  status: string | undefined,
  tipo: string | undefined,
  from: string | undefined,
  to: string | undefined,
  limit: number,
  offset: number,
) {
  const conditions = ['a.unidade_id = ?'];
  const params: Primitive[] = [unidadeId];
  if (status) {
    conditions.push('a.status = ?');
    params.push(status);
  } else {
    conditions.push("(a.status = 'pendente' OR a.data_agendada IS NULL)");
  }
  if (tipo) {
    conditions.push('a.tipo = ?');
    params.push(tipo);
  }
  if (from) {
    conditions.push('DATE(COALESCE(a.data_agendada, a.created_at)) >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('DATE(COALESCE(a.data_agendada, a.created_at)) <= ?');
    params.push(to);
  }
  params.push(limit, offset);
  const rows = await all<{
    id: number; status: string; tipo: string; data_agendada: string | null; created_at: string; cliente_id: number; cliente_nome: string; cliente_telefone: string | null; procedimento_nome: string | null; executor_nome: string | null;
  }>(env.DB.prepare(`SELECT a.id, a.status, a.tipo, a.data_agendada, a.created_at,
      c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
      p.nome AS procedimento_nome, u.nome AS executor_nome
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    LEFT JOIN procedimentos p ON p.id = a.procedimento_id
    LEFT JOIN usuarios u ON u.id = a.executor_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY COALESCE(a.data_agendada, a.created_at) ASC, a.id ASC LIMIT ? OFFSET ?`).bind(...params));
  return rows.map((row) => ({ ...row, cliente_telefone: maskPhone(row.cliente_telefone) }));
}

async function getCategoryBySlug(env: Env, slug: string) {
  return env.DB.prepare(
    'SELECT id, nome, slug, cor, icone, ordem, pula_avaliacao FROM categorias WHERE slug = ? AND ativo = 1',
  ).bind(slug).first<{ id: number; nome: string; slug: string; cor: string; icone: string; ordem: number; pula_avaliacao: number }>();
}

export async function queuePanel(env: Env, unidadeId: number, categoriaSlug: string, limit: number, offset: number) {
  const categoria = await getCategoryBySlug(env, categoriaSlug);
  if (!categoria) return { categoria: null, pacientes: [] };
  const rows = await all<{
    item_id: number; atendimento_id: number; cliente_id: number; cliente_nome: string; procedimento_nome: string; etapa_label: string | null; executor_nome: string | null; status: string; entrou_na_fila_em: string;
  }>(env.DB.prepare(`SELECT i.id AS item_id, i.atendimento_id, c.id AS cliente_id, c.nome AS cliente_nome,
      p.nome AS procedimento_nome, i.etapa_label, u.nome AS executor_nome, i.status, i.created_at AS entrou_na_fila_em
    FROM itens_atendimento i
    JOIN atendimentos a ON a.id = i.atendimento_id
    JOIN clientes c ON c.id = a.cliente_id
    JOIN procedimentos p ON p.id = i.procedimento_id
    LEFT JOIN usuarios u ON u.id = i.executor_id
    WHERE a.status = 'em_execucao'
      AND a.unidade_id = ?
      AND a.categoria_id = ?
      AND i.status IN ('pago', 'executando')
    ORDER BY i.created_at ASC, c.nome ASC LIMIT ? OFFSET ?`)
    .bind(unidadeId, categoria.id, limit, offset));

  const byAttendance = new Map<number, {
    atendimento_id: number; cliente_id: number; cliente_nome: string; entrou_na_fila_em: string; doutores: Set<string>; procedimentos: Set<string>; quantidade_procedimentos: number; possui_procedimento_em_execucao: boolean;
  }>();
  for (const row of rows) {
    const procedimentoLabel = row.etapa_label ? `${row.procedimento_nome} - ${row.etapa_label}` : row.procedimento_nome;
    const current = byAttendance.get(row.atendimento_id);
    if (current) {
      if (row.entrou_na_fila_em < current.entrou_na_fila_em) current.entrou_na_fila_em = row.entrou_na_fila_em;
      if (row.executor_nome) current.doutores.add(row.executor_nome);
      current.procedimentos.add(procedimentoLabel);
      current.quantidade_procedimentos += 1;
      current.possui_procedimento_em_execucao ||= row.status === 'executando';
      continue;
    }
    byAttendance.set(row.atendimento_id, {
      atendimento_id: row.atendimento_id,
      cliente_id: row.cliente_id,
      cliente_nome: row.cliente_nome,
      entrou_na_fila_em: row.entrou_na_fila_em,
      doutores: new Set(row.executor_nome ? [row.executor_nome] : []),
      procedimentos: new Set([procedimentoLabel]),
      quantidade_procedimentos: 1,
      possui_procedimento_em_execucao: row.status === 'executando',
    });
  }

  return {
    categoria,
    pacientes: Array.from(byAttendance.values()).map((patient) => ({
      atendimento_id: patient.atendimento_id,
      cliente_id: patient.cliente_id,
      cliente_nome: patient.cliente_nome,
      entrou_na_fila_em: patient.entrou_na_fila_em,
      doutores: Array.from(patient.doutores).sort((left, right) => left.localeCompare(right)),
      procedimentos: Array.from(patient.procedimentos).sort((left, right) => left.localeCompare(right)),
      quantidade_procedimentos: patient.quantidade_procedimentos,
      possui_procedimento_em_execucao: patient.possui_procedimento_em_execucao,
    })),
    atualizado_em: new Date().toISOString(),
  };
}

export async function executionQueue(env: Env, unidadeId: number, categoriaSlug: string, executorId: number | undefined, limit: number, offset: number) {
  const categoria = await getCategoryBySlug(env, categoriaSlug);
  if (!categoria) return { categoria: null, itens: [] };
  const conditions = ["a.status = 'em_execucao'", 'a.unidade_id = ?', 'a.categoria_id = ?', "i.status IN ('pago', 'executando')"];
  const params: Primitive[] = [unidadeId, categoria.id];
  if (executorId) {
    conditions.push('(i.executor_id = ? OR i.executor_id IS NULL)');
    params.push(executorId);
  }
  params.push(limit, offset);
  const rows = await all<{
    id: number; atendimento_id: number; procedimento_id: number; procedimento_nome: string; etapa_label: string | null; tem_etapas: number; executor_id: number | null; executor_nome: string | null; cliente_id: number; cliente_nome: string; status: string; created_at: string; concluido_at: string | null; dente_unico: string | null;
  }>(env.DB.prepare(`SELECT i.id, i.atendimento_id, i.procedimento_id, p.nome AS procedimento_nome,
      i.etapa_label, p.tem_etapas, i.executor_id, e.nome AS executor_nome,
      c.id AS cliente_id, c.nome AS cliente_nome, i.status, i.created_at, i.concluido_at,
      COALESCE(i.dente_unico, json_extract(i.dentes, '$[0].dente')) AS dente_unico
    FROM itens_atendimento i
    JOIN atendimentos a ON i.atendimento_id = a.id
    JOIN clientes c ON a.cliente_id = c.id
    JOIN procedimentos p ON i.procedimento_id = p.id
    LEFT JOIN usuarios e ON i.executor_id = e.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY CASE WHEN i.executor_id = ? THEN 0 ELSE 1 END, i.created_at DESC LIMIT ? OFFSET ?`)
    .bind(...(executorId ? [...params.slice(0, -2), executorId, ...params.slice(-2)] : [...params.slice(0, -2), -1, ...params.slice(-2)])));
  const normalized = rows.map((row) => {
    const { status: rawStatus, ...rest } = row;
    return { ...rest, status_operacional: executionStatus(rawStatus) };
  });
  if (!executorId) return { categoria, itens: normalized };
  return {
    categoria,
    meusProcedimentos: normalized.filter((row) => row.executor_id === executorId),
    disponiveis: normalized.filter((row) => row.executor_id === null),
  };
}

export async function attendanceOperationalDetail(env: Env, atendimentoId: number) {
  const atendimento = await env.DB.prepare(`SELECT a.id, a.unidade_id, a.status, a.tipo, a.agendamento_id,
      a.created_at, a.liberado_em, a.finalizado_at,
      c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email, c.cpf AS cliente_cpf,
      cat.nome AS categoria_nome, cat.slug AS categoria_slug,
      av.nome AS avaliador_nome, lp.nome AS liberado_por_nome, un.nome AS unidade_nome
    FROM atendimentos a
    JOIN clientes c ON c.id = a.cliente_id
    LEFT JOIN categorias cat ON cat.id = a.categoria_id
    LEFT JOIN usuarios av ON av.id = a.avaliador_id
    LEFT JOIN usuarios lp ON lp.id = a.liberado_por_id
    LEFT JOIN unidades un ON un.id = a.unidade_id
    WHERE a.id = ?`).bind(atendimentoId).first<{
      id: number; unidade_id: number; status: string; tipo: string; agendamento_id: number | null; created_at: string; liberado_em: string | null; finalizado_at: string | null; cliente_id: number; cliente_nome: string; cliente_telefone: string | null; cliente_email: string | null; cliente_cpf: string | null; categoria_nome: string | null; categoria_slug: string | null; avaliador_nome: string | null; liberado_por_nome: string | null; unidade_nome: string | null;
    }>();
  if (!atendimento) return null;

  const itens = await all<{
    id: number; procedimento_nome: string; etapa_label: string | null; executor_nome: string | null; criado_por_nome: string | null; quantidade: number; dente_unico: string | null; status: string; adicionado_em_execucao: number; created_at: string; concluido_at: string | null;
  }>(env.DB.prepare(`SELECT i.id, p.nome AS procedimento_nome, i.etapa_label,
      ex.nome AS executor_nome, cr.nome AS criado_por_nome, i.quantidade, i.dente_unico,
      i.status, i.adicionado_em_execucao, i.created_at, i.concluido_at
    FROM itens_atendimento i
    JOIN procedimentos p ON p.id = i.procedimento_id
    LEFT JOIN usuarios ex ON ex.id = i.executor_id
    LEFT JOIN usuarios cr ON cr.id = i.criado_por_id
    WHERE i.atendimento_id = ?
    ORDER BY i.created_at ASC, i.id ASC`).bind(atendimentoId));
  const destinos = await all<{ item_atendimento_id: number; destino_status: string; data_agendada: string | null; executor_nome: string | null }>(
    env.DB.prepare(`SELECT d.item_atendimento_id, d.destino_status, d.data_agendada, u.nome AS executor_nome
      FROM itens_atendimento_destinos d
      LEFT JOIN usuarios u ON u.id = d.executor_id
      WHERE d.atendimento_id = ?
      ORDER BY d.updated_at DESC`).bind(atendimentoId),
  );
  const agendamentos = await all<{
    id: number; tipo: string; status: string; data_agendada: string | null; procedimento_nome: string | null; executor_nome: string | null; created_at: string;
  }>(env.DB.prepare(`SELECT a.id, a.tipo, a.status, a.data_agendada,
      p.nome AS procedimento_nome, u.nome AS executor_nome, a.created_at
    FROM agendamentos a
    LEFT JOIN procedimentos p ON p.id = a.procedimento_id
    LEFT JOIN usuarios u ON u.id = a.executor_id
    WHERE a.atendimento_origem_id = ? OR a.atendimento_sessao_id = ? OR a.id = ?
    ORDER BY COALESCE(a.data_agendada, a.created_at) DESC`).bind(atendimentoId, atendimentoId, atendimento.agendamento_id ?? -1));

  return {
    unidadeId: atendimento.unidade_id,
    atendimento: {
      id: atendimento.id,
      unidade_nome: atendimento.unidade_nome,
      status: attendanceStatus(atendimento.status),
      tipo: atendimento.tipo,
      categoria: atendimento.categoria_nome ? { nome: atendimento.categoria_nome, slug: atendimento.categoria_slug } : null,
      avaliador_nome: atendimento.avaliador_nome,
      liberado_por_nome: atendimento.liberado_por_nome,
      created_at: atendimento.created_at,
      liberado_em: atendimento.liberado_em,
      finalizado_at: atendimento.finalizado_at,
    },
    cliente: {
      id: atendimento.cliente_id,
      nome: atendimento.cliente_nome,
      telefone: maskPhone(atendimento.cliente_telefone),
      email: maskEmail(atendimento.cliente_email),
      cpf: maskCpf(atendimento.cliente_cpf),
    },
    itens: itens.map((item) => {
      const { status: rawStatus, ...rest } = item;
      return { ...rest, status_operacional: executionStatus(rawStatus) };
    }),
    destinos: destinos.map((destino) => ({ ...destino, destino_status: safeDestinoStatus(destino.destino_status) })),
    agendamentos,
  };
}

export async function listFollowups(
  env: Env,
  unidadeId: number,
  status: string | undefined,
  tipo: string | undefined,
  responsavelUsuarioId: number | undefined,
  clienteId: number | undefined,
  from: string | undefined,
  to: string | undefined,
  limit: number,
  offset: number,
) {
  if (isForbiddenFollowupType(tipo)) return { rejeitado: true, motivo: 'Tipo não exposto pelo MCP operacional.' };
  const conditions = ['f.unidade_id = ?', 'f.excluida_em IS NULL', "f.tipo <> 'cobranca'"];
  const params: Primitive[] = [unidadeId];
  if (status) {
    conditions.push('f.status = ?');
    params.push(status);
  }
  if (tipo) {
    conditions.push('f.tipo = ?');
    params.push(tipo);
  }
  if (responsavelUsuarioId) {
    conditions.push('f.responsavel_usuario_id = ?');
    params.push(responsavelUsuarioId);
  }
  if (clienteId) {
    conditions.push('f.cliente_id = ?');
    params.push(clienteId);
  }
  if (from) {
    conditions.push('f.vencimento_em >= ?');
    params.push(startOfDay(from));
  }
  if (to) {
    conditions.push('f.vencimento_em <= ?');
    params.push(endOfDay(to));
  }
  params.push(limit, offset);
  const rows = await all<{
    id: number; tipo: string; status: string; titulo: string; vencimento_em: string; concluida_em: string | null; cliente_id: number; cliente_nome: string; cliente_telefone: string | null; responsavel_usuario_nome: string; criado_por_nome: string;
  }>(env.DB.prepare(`SELECT f.id, f.tipo, f.status, f.titulo, f.vencimento_em, f.concluida_em,
      c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
      ru.nome AS responsavel_usuario_nome, cu.nome AS criado_por_nome
    FROM followup_tarefas f
    JOIN clientes c ON c.id = f.cliente_id
    JOIN usuarios ru ON ru.id = f.responsavel_usuario_id
    JOIN usuarios cu ON cu.id = f.criado_por_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY CASE WHEN f.status = 'aberta' THEN 0 ELSE 1 END, f.vencimento_em ASC, f.created_at ASC
    LIMIT ? OFFSET ?`).bind(...params));
  return {
    rejeitado: false,
    items: rows.map((row) => ({
      ...row,
      titulo: maskNullableText(row.titulo, 120),
      cliente_telefone: maskPhone(row.cliente_telefone),
    })),
  };
}

export async function followupSummary(env: Env, unidadeId: number, from: string | undefined, to: string | undefined) {
  const conditions = ['unidade_id = ?', 'excluida_em IS NULL', "tipo <> 'cobranca'"];
  const params: Primitive[] = [unidadeId];
  if (from) {
    conditions.push('vencimento_em >= ?');
    params.push(startOfDay(from));
  }
  if (to) {
    conditions.push('vencimento_em <= ?');
    params.push(endOfDay(to));
  }
  const where = conditions.join(' AND ');
  const porTipoStatus = await all<{ tipo: string; status: string; total: number }>(
    env.DB.prepare(`SELECT tipo, status, COUNT(*) AS total
      FROM followup_tarefas
      WHERE ${where}
      GROUP BY tipo, status
      ORDER BY tipo ASC, status ASC`).bind(...params),
  );
  const urgencia = await env.DB.prepare(`SELECT
      SUM(CASE WHEN status = 'aberta' THEN 1 ELSE 0 END) AS abertas,
      SUM(CASE WHEN status = 'aberta' AND vencimento_em < datetime('now', 'localtime') THEN 1 ELSE 0 END) AS atrasadas,
      SUM(CASE WHEN status = 'aberta' AND DATE(vencimento_em) = DATE('now', 'localtime') THEN 1 ELSE 0 END) AS vencem_hoje,
      SUM(CASE WHEN status = 'concluida' AND DATE(concluida_em) = DATE('now', 'localtime') THEN 1 ELSE 0 END) AS concluidas_hoje
    FROM followup_tarefas
    WHERE ${where}`).bind(...params).first<{ abertas: number | null; atrasadas: number | null; vencem_hoje: number | null; concluidas_hoje: number | null }>();
  return {
    porTipoStatus,
    urgencia: {
      abertas: urgencia?.abertas ?? 0,
      atrasadas: urgencia?.atrasadas ?? 0,
      vencem_hoje: urgencia?.vencem_hoje ?? 0,
      concluidas_hoje: urgencia?.concluidas_hoje ?? 0,
    },
  };
}

export async function clientOperationalProfile(env: Env, clienteId: number) {
  const client = await env.DB.prepare(
    `SELECT id, nome, telefone, email, cpf, origem, sexo, plano_odontologico, created_at
     FROM clientes WHERE id = ?`,
  ).bind(clienteId).first<{
    id: number; nome: string; telefone: string | null; email: string | null; cpf: string | null; origem: string; sexo: string | null; plano_odontologico: string | null; created_at: string;
  }>();
  if (!client) return null;
  const atendimentos = await all<{ id: number; status: string; created_at: string; unidade_nome: string | null; categoria_nome: string | null }>(
    env.DB.prepare(`SELECT a.id, a.status, a.created_at, u.nome AS unidade_nome, c.nome AS categoria_nome
      FROM atendimentos a
      LEFT JOIN unidades u ON u.id = a.unidade_id
      LEFT JOIN categorias c ON c.id = a.categoria_id
      WHERE a.cliente_id = ?
      ORDER BY a.created_at DESC LIMIT 10`).bind(clienteId),
  );
  const proximosAgendamentos = await all<{ id: number; tipo: string; status: string; data_agendada: string | null; procedimento_nome: string | null; executor_nome: string | null }>(
    env.DB.prepare(`SELECT a.id, a.tipo, a.status, a.data_agendada, p.nome AS procedimento_nome, u.nome AS executor_nome
      FROM agendamentos a
      LEFT JOIN procedimentos p ON p.id = a.procedimento_id
      LEFT JOIN usuarios u ON u.id = a.executor_id
      WHERE a.cliente_id = ? AND a.status NOT IN ('cancelado', 'realizado') AND (a.data_agendada IS NULL OR DATE(a.data_agendada) >= DATE('now', 'localtime'))
      ORDER BY COALESCE(a.data_agendada, a.created_at) ASC LIMIT 10`).bind(clienteId),
  );
  const followups = await all<{ id: number; tipo: string; status: string; titulo: string; vencimento_em: string; responsavel_usuario_nome: string }>(
    env.DB.prepare(`SELECT f.id, f.tipo, f.status, f.titulo, f.vencimento_em, u.nome AS responsavel_usuario_nome
      FROM followup_tarefas f
      JOIN usuarios u ON u.id = f.responsavel_usuario_id
      WHERE f.cliente_id = ? AND f.status = 'aberta' AND f.excluida_em IS NULL AND f.tipo <> 'cobranca'
      ORDER BY f.vencimento_em ASC LIMIT 10`).bind(clienteId),
  );
  const vinculos = await all<{ id: number; cliente_vinculado_id: number; cliente_vinculado_nome: string; observacao: string | null; created_at: string }>(
    env.DB.prepare(`SELECT v.id, v.cliente_vinculado_id, c.nome AS cliente_vinculado_nome, v.observacao, v.created_at
      FROM vinculos_clientes v
      JOIN clientes c ON c.id = v.cliente_vinculado_id
      WHERE v.cliente_id = ?
      ORDER BY v.created_at DESC LIMIT 10`).bind(clienteId),
  );
  return {
    cliente: {
      id: client.id,
      nome: client.nome,
      telefone: maskPhone(client.telefone),
      email: maskEmail(client.email),
      cpf: maskCpf(client.cpf),
      origem: client.origem,
      sexo: client.sexo,
      plano_odontologico: client.plano_odontologico,
      cadastrado_em: client.created_at,
    },
    atendimentosRecentes: atendimentos.map((item) => ({ ...item, status: attendanceStatus(item.status) })),
    proximosAgendamentos,
    followupsAbertos: followups.map((row) => ({ ...row, titulo: maskNullableText(row.titulo, 120) })),
    vinculos: vinculos.map((row) => ({ ...row, observacao: maskNullableText(row.observacao, 100) })),
  };
}

export async function clientOperationalHistory(env: Env, clienteId: number, limit: number) {
  const atendimentos = await all<{ id: number; data: string; status: string; unidade_nome: string | null; categoria_nome: string | null }>(
    env.DB.prepare(`SELECT a.id, a.created_at AS data, a.status, u.nome AS unidade_nome, c.nome AS categoria_nome
      FROM atendimentos a
      LEFT JOIN unidades u ON u.id = a.unidade_id
      LEFT JOIN categorias c ON c.id = a.categoria_id
      WHERE a.cliente_id = ?
      ORDER BY a.created_at DESC LIMIT ?`).bind(clienteId, limit),
  );
  const agendamentos = await all<{ id: number; data: string; status: string; tipo: string; procedimento_nome: string | null; executor_nome: string | null }>(
    env.DB.prepare(`SELECT a.id, COALESCE(a.data_agendada, a.created_at) AS data, a.status, a.tipo,
      p.nome AS procedimento_nome, u.nome AS executor_nome
      FROM agendamentos a
      LEFT JOIN procedimentos p ON p.id = a.procedimento_id
      LEFT JOIN usuarios u ON u.id = a.executor_id
      WHERE a.cliente_id = ?
      ORDER BY COALESCE(a.data_agendada, a.created_at) DESC LIMIT ?`).bind(clienteId, limit),
  );
  const followups = await all<{ id: number; data: string; status: string; tipo: string; titulo: string }>(
    env.DB.prepare(`SELECT id, COALESCE(concluida_em, vencimento_em, created_at) AS data, status, tipo, titulo
      FROM followup_tarefas
      WHERE cliente_id = ? AND excluida_em IS NULL AND tipo <> 'cobranca'
      ORDER BY COALESCE(concluida_em, vencimento_em, created_at) DESC LIMIT ?`).bind(clienteId, limit),
  );
  return [
    ...atendimentos.map((item) => ({ evento: 'atendimento', ...item, status: attendanceStatus(item.status) })),
    ...agendamentos.map((item) => ({ evento: 'agendamento', ...item })),
    ...followups.map((item) => ({ evento: 'followup', ...item, titulo: maskNullableText(item.titulo, 120) })),
  ].sort((left, right) => right.data.localeCompare(left.data)).slice(0, limit);
}

export async function clientStats(env: Env, from: string, to: string) {
  const params = [from, to];
  const total = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM clientes WHERE DATE(created_at) BETWEEN ? AND ?',
  ).bind(...params).first<{ total: number }>();
  const porOrigem = await all<{ origem: string; total: number }>(env.DB.prepare(
    'SELECT origem, COUNT(*) AS total FROM clientes WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY origem ORDER BY total DESC',
  ).bind(...params));
  const porSexo = await all<{ sexo: string | null; total: number }>(env.DB.prepare(
    'SELECT sexo, COUNT(*) AS total FROM clientes WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY sexo ORDER BY total DESC',
  ).bind(...params));
  const porPlano = await all<{ plano_odontologico: string | null; total: number }>(env.DB.prepare(
    'SELECT plano_odontologico, COUNT(*) AS total FROM clientes WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY plano_odontologico ORDER BY total DESC',
  ).bind(...params));
  return { periodo: { inicio: from, fim: to }, total: total?.total ?? 0, porOrigem, porSexo, porPlano };
}

export async function listTerms(env: Env, activeOnly: boolean) {
  const where = activeOnly ? 'WHERE ativo = 1' : '';
  return all<{ id: number; slug: string; titulo: string; ativo: number; updated_at: string }>(
    env.DB.prepare(`SELECT id, slug, titulo, ativo, updated_at
      FROM termos ${where}
      ORDER BY titulo ASC`),
  );
}

export async function operationalSummaryV2(env: Env, unidadeId: number, from: string, to: string) {
  const atendimentosPorStatus = await all<{ status: string; total: number }>(env.DB.prepare(
    `SELECT CASE WHEN status = 'aguardando_pagamento' THEN 'aguardando_liberacao' ELSE status END AS status,
        COUNT(*) AS total FROM atendimentos
     WHERE unidade_id = ? AND DATE(created_at) BETWEEN ? AND ?
     GROUP BY CASE WHEN status = 'aguardando_pagamento' THEN 'aguardando_liberacao' ELSE status END
     ORDER BY status`,
  ).bind(unidadeId, from, to));
  const atendimentosPorCategoria = await all<{ categoria_nome: string | null; categoria_slug: string | null; total: number }>(env.DB.prepare(
    `SELECT c.nome AS categoria_nome, c.slug AS categoria_slug, COUNT(a.id) AS total
     FROM atendimentos a
     LEFT JOIN categorias c ON c.id = a.categoria_id
     WHERE a.unidade_id = ? AND DATE(a.created_at) BETWEEN ? AND ?
     GROUP BY c.id ORDER BY total DESC`,
  ).bind(unidadeId, from, to));
  const agendaPorStatus = await all<{ status: string; total: number }>(env.DB.prepare(
    `SELECT status, COUNT(*) AS total FROM agendamentos
     WHERE unidade_id = ? AND DATE(COALESCE(data_agendada, created_at)) BETWEEN ? AND ?
     GROUP BY status ORDER BY status`,
  ).bind(unidadeId, from, to));
  const faltasCancelamentos = await all<{ status: string; total: number }>(env.DB.prepare(
    `SELECT status, COUNT(*) AS total FROM agendamentos
     WHERE unidade_id = ? AND status IN ('faltou', 'cancelado') AND DATE(COALESCE(data_agendada, created_at)) BETWEEN ? AND ?
     GROUP BY status ORDER BY status`,
  ).bind(unidadeId, from, to));
  const filaAtual = await all<{ categoria_nome: string | null; categoria_slug: string | null; total: number }>(env.DB.prepare(
    `SELECT c.nome AS categoria_nome, c.slug AS categoria_slug, COUNT(i.id) AS total
     FROM itens_atendimento i
     JOIN atendimentos a ON a.id = i.atendimento_id
     LEFT JOIN categorias c ON c.id = a.categoria_id
     WHERE a.unidade_id = ? AND a.status = 'em_execucao' AND i.status IN ('pago', 'executando')
     GROUP BY c.id ORDER BY total DESC`,
  ).bind(unidadeId));
  const followups = await followupSummary(env, unidadeId, from, to);
  return {
    periodo: { inicio: from, fim: to },
    atendimentosPorStatus,
    atendimentosPorCategoria,
    agendaPorStatus,
    faltasCancelamentos,
    filaAtual,
    followups,
  };
}

export async function audit(env: Env, identity: Identity | null, tool: string, unidadeId: number | null, success: boolean) {
  try {
    await env.DB.prepare(`INSERT INTO mcp_audit_log
      (usuario_id, client_id, ferramenta, unidade_id, sucesso)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(identity?.id ?? null, identity?.clientId ?? null, tool, unidadeId, success ? 1 : 0)
      .run();
  } catch (error) {
    // Auditoria não pode revelar dados nem interromper uma consulta de leitura.
    console.error('Falha ao registrar auditoria MCP', error);
  }
}
