import type { AppUser, D1PreparedStatement, Env, Identity } from './types';
import {
  hasReadScope,
  hasWriteScope,
  isForbiddenFollowupType,
  isMcpAdministrator,
  isMcpWriter,
  maskCpf,
  maskEmail,
  maskNullableText,
  maskPhone,
  parseOAuthProps,
} from './security';

type QueryResult<T> = { results: T[] };
type Primitive = string | number | null;
type InsertResult = { meta?: { last_row_id?: number } };

const ORIGENS_CLIENTE = new Set(['fachada', 'trafego_meta', 'trafego_google', 'organico', 'indicacao']);
const SEXOS_CLIENTE = new Set(['masculino', 'feminino', 'outro']);
const PLANOS_ODONTOLOGICOS = new Set(['Clin', 'Prime', 'OdontoArt']);
const ROLES_DENTISTA_AGENDA = new Set(['avaliador', 'executor', 'ortodontista']);
const CLINIC_UTC_OFFSET_MINUTES = -3 * 60;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATETIME_INPUT_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export interface CreateClientInput {
  nome: string;
  origem: string;
  telefone?: string | null;
  email?: string | null;
  cpf?: string | null;
  dataNascimento?: string | null;
  endereco?: string | null;
  sexo?: string | null;
  planoOdontologico?: string | null;
  observacoes?: string | null;
}

export interface CreateEvaluationAppointmentInput {
  unidadeId: number;
  clienteId: number;
  dataAgendada?: string | null;
  executorId?: number | null;
  criadoPorId?: number | null;
  observacoes?: string | null;
}

export interface CreateLeadEvaluationInput extends CreateClientInput {
  unidadeId: number;
  dataAgendada?: string | null;
  executorId?: number | null;
  criadoPorId: number;
  observacoesAgendamento?: string | null;
}

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

function roundMoney(value: number | null | undefined): number {
  return Number(Number(value ?? 0).toFixed(2));
}

function paymentGroupKey(paymentGroupId: number | null, paymentId: number): string {
  return paymentGroupId ? `grupo:${paymentGroupId}` : `pagamento:${paymentId}`;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function assertDateOnly(value: string | null): string | null {
  if (!value) return null;
  if (!DATE_ONLY_REGEX.test(value)) throw new Error('Data inválida.');
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error('Data inválida.');
  }
  return value;
}

function createUtcDateFromClinicParts(year: number, month: number, day: number, hour: number, minute: number): Date {
  const localUtcMillis = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(localUtcMillis - CLINIC_UTC_OFFSET_MINUTES * 60_000);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function getClinicDateTimeLocalValue(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values = { year: '0000', month: '00', day: '00', hour: '00', minute: '00' };
  for (const part of parts) {
    if (part.type in values) {
      values[part.type as keyof typeof values] = part.value;
    }
  }
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function clinicDateTimeInputToUtcIso(value: string | null): { normalized: string; utcIso: string } | null {
  if (!value) return null;
  const match = value.match(LOCAL_DATETIME_INPUT_REGEX);
  if (!match) throw new Error('dataAgendada inválida. Use YYYY-MM-DDTHH:mm.');

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (month < 1 || month > 12 || day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('dataAgendada inválida. Use YYYY-MM-DDTHH:mm.');
  }

  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day
  ) {
    throw new Error('dataAgendada inválida. Use YYYY-MM-DDTHH:mm.');
  }

  const normalized = `${yearText}-${monthText}-${dayText}T${pad(hour)}:${pad(minute)}`;
  return {
    normalized,
    utcIso: createUtcDateFromClinicParts(year, month, day, hour, minute).toISOString(),
  };
}

function lastInsertedId(result: InsertResult): number {
  const id = Number(result.meta?.last_row_id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Não foi possível recuperar o registro criado.');
  }
  return id;
}

async function loadReadableUnitIds(env: Env): Promise<number[]> {
  const unidades = await all<{ id: number }>(env.DB.prepare(
    'SELECT id FROM unidades WHERE ativo = 1 ORDER BY nome ASC',
  ));
  return unidades.map((unidade) => unidade.id);
}

async function loadWritableUnitIds(env: Env, user: AppUser): Promise<number[]> {
  if (user.role === 'admin') return loadReadableUnitIds(env);
  const unidades = await all<{ id: number }>(env.DB.prepare(`
    SELECT u.id
      FROM unidades u
      JOIN usuario_unidades uu ON uu.unidade_id = u.id
     WHERE uu.usuario_id = ? AND u.ativo = 1
     ORDER BY u.nome ASC
  `).bind(user.id));
  return unidades.map((unidade) => unidade.id);
}

async function assertActiveUnit(env: Env, unidadeId: number): Promise<void> {
  const unit = await env.DB.prepare('SELECT id FROM unidades WHERE id = ? AND ativo = 1')
    .bind(unidadeId)
    .first<{ id: number }>();
  if (!unit) throw new Error('Unidade não encontrada.');
}

async function validateEvaluationAppointmentDraft(
  env: Env,
  input: Pick<CreateEvaluationAppointmentInput, 'unidadeId' | 'dataAgendada' | 'executorId' | 'criadoPorId'>,
): Promise<void> {
  await assertActiveUnit(env, input.unidadeId);

  const parsedDate = clinicDateTimeInputToUtcIso(normalizeOptionalText(input.dataAgendada));
  if (parsedDate && parsedDate.normalized < getClinicDateTimeLocalValue()) {
    throw new Error('Não é possível agendar para uma data no passado.');
  }

  if (input.criadoPorId) {
    const creator = await env.DB.prepare(`SELECT u.id
      FROM usuarios u
      JOIN usuario_unidades uu ON uu.usuario_id = u.id
      WHERE u.id = ? AND uu.unidade_id = ? AND u.ativo = 1
      LIMIT 1`)
      .bind(input.criadoPorId, input.unidadeId)
      .first<{ id: number }>();
    if (!creator) throw new Error('Criador não encontrado ou não pertence à unidade informada.');
  }

  if (!input.executorId) return;

  const row = await env.DB.prepare(`SELECT u.id, u.role,
      GROUP_CONCAT(DISTINCT ur.role) AS roles_csv
    FROM usuarios u
    LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
    WHERE u.id = ? AND u.ativo = 1
    GROUP BY u.id`)
    .bind(input.executorId)
    .first<{ id: number; role: string; roles_csv: string | null }>();
  if (!row) throw new Error('Executor não encontrado.');

  const roles = splitCsv(row.roles_csv).length > 0 ? splitCsv(row.roles_csv) : [row.role];
  if (!roles.some((role) => ROLES_DENTISTA_AGENDA.has(role))) {
    throw new Error('Usuário selecionado não possui role de dentista.');
  }

  const executorUnit = await env.DB.prepare(
    'SELECT 1 AS ok FROM usuario_unidades WHERE usuario_id = ? AND unidade_id = ? LIMIT 1',
  ).bind(input.executorId, input.unidadeId).first<{ ok: number }>();
  if (!executorUnit) throw new Error('Executor não pertence à unidade informada.');
}

async function findDefaultEvaluator(
  env: Env,
  unidadeId: number,
): Promise<{ id: number; nome: string } | null> {
  return env.DB.prepare(`SELECT u.id, u.nome
    FROM usuarios u
    JOIN usuario_unidades uu ON uu.usuario_id = u.id
    LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
    WHERE uu.unidade_id = ?
      AND u.ativo = 1
      AND (u.role = 'avaliador' OR ur.role = 'avaliador')
    GROUP BY u.id, u.nome, u.role
    ORDER BY CASE WHEN u.role = 'avaliador' THEN 0 ELSE 1 END, u.id ASC
    LIMIT 1`)
    .bind(unidadeId)
    .first<{ id: number; nome: string }>();
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

  const unidadeIds = await loadReadableUnitIds(env);

  return { ...user, unidadeIds, scope: props.scope, clientId: props.clientId };
}

export async function getWriteIdentity(env: Env, propsInput: unknown): Promise<Identity> {
  const props = parseOAuthProps(propsInput);
  if (!props || !hasWriteScope(props.scope)) throw new Error('Acesso MCP sem escopo de escrita.');

  const user = await env.DB.prepare(
    'SELECT id, nome, email, role, ativo FROM usuarios WHERE id = ? AND email = ?',
  ).bind(props.userId, props.email.trim().toLowerCase()).first<AppUser>();

  if (!user || !isMcpWriter(user, env)) {
    throw new Error('Conta sem permissão de escrita MCP.');
  }

  const unidadeIds = await loadWritableUnitIds(env, user);
  if (unidadeIds.length === 0) {
    throw new Error('Conta sem unidade autorizada para escrita MCP.');
  }
  return { ...user, unidadeIds, scope: props.scope, clientId: props.clientId };
}

export async function getDiscoveryIdentity(env: Env, propsInput: unknown): Promise<Identity> {
  const props = parseOAuthProps(propsInput);
  if (!props) throw new Error('Acesso MCP sem credenciais.');
  if (hasReadScope(props.scope)) return getIdentity(env, propsInput);
  if (hasWriteScope(props.scope)) return getWriteIdentity(env, propsInput);
  throw new Error('Acesso MCP sem escopo operacional.');
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

export async function createClient(env: Env, input: CreateClientInput) {
  const nome = normalizeOptionalText(input.nome);
  if (!nome) throw new Error('Nome é obrigatório.');

  const origem = normalizeOptionalText(input.origem);
  if (!origem || !ORIGENS_CLIENTE.has(origem)) throw new Error('Origem inválida.');

  const cpf = normalizeOptionalText(input.cpf);
  const telefone = normalizeOptionalText(input.telefone);
  const email = normalizeOptionalText(input.email)?.toLowerCase() ?? null;
  const dataNascimento = assertDateOnly(normalizeOptionalText(input.dataNascimento));
  const endereco = normalizeOptionalText(input.endereco);
  const sexo = normalizeOptionalText(input.sexo);
  const planoOdontologico = normalizeOptionalText(input.planoOdontologico);
  const observacoes = normalizeOptionalText(input.observacoes);

  if (sexo && !SEXOS_CLIENTE.has(sexo)) throw new Error('Sexo inválido.');
  if (planoOdontologico && !PLANOS_ODONTOLOGICOS.has(planoOdontologico)) {
    throw new Error('Plano odontológico inválido.');
  }

  if (cpf) {
    const existing = await env.DB.prepare('SELECT id FROM clientes WHERE cpf = ?')
      .bind(cpf)
      .first<{ id: number }>();
    if (existing) throw new Error('CPF já cadastrado.');
  }

  const insert = await env.DB.prepare(`INSERT INTO clientes
      (nome, cpf, telefone, email, data_nascimento, endereco, origem, sexo, plano_odontologico, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      nome,
      cpf,
      telefone,
      email,
      dataNascimento,
      endereco,
      origem,
      sexo,
      planoOdontologico,
      observacoes,
    )
    .run();

  const id = lastInsertedId(insert);
  const client = await env.DB.prepare(
    'SELECT id, nome, telefone, email, cpf, origem, sexo, plano_odontologico, created_at FROM clientes WHERE id = ?',
  ).bind(id).first<{
    id: number;
    nome: string;
    telefone: string | null;
    email: string | null;
    cpf: string | null;
    origem: string;
    sexo: string | null;
    plano_odontologico: string | null;
    created_at: string;
  }>();

  if (!client) throw new Error('Cliente criado não foi encontrado.');
  return {
    id: client.id,
    nome: client.nome,
    telefone: maskPhone(client.telefone),
    email: maskEmail(client.email),
    cpf: maskCpf(client.cpf),
    origem: client.origem,
    sexo: client.sexo,
    plano_odontologico: client.plano_odontologico,
    cadastradoEm: client.created_at,
  };
}

export async function createEvaluationAppointment(
  env: Env,
  input: CreateEvaluationAppointmentInput,
) {
  await validateEvaluationAppointmentDraft(env, input);

  const cliente = await env.DB.prepare('SELECT id, nome, telefone FROM clientes WHERE id = ?')
    .bind(input.clienteId)
    .first<{ id: number; nome: string; telefone: string | null }>();
  if (!cliente) throw new Error('Cliente não encontrado.');

  const normalizedObservacoes = normalizeOptionalText(input.observacoes);
  const parsedDate = clinicDateTimeInputToUtcIso(normalizeOptionalText(input.dataAgendada));
  if (parsedDate && parsedDate.normalized < getClinicDateTimeLocalValue()) {
    throw new Error('Não é possível agendar para uma data no passado.');
  }

  let executor: { id: number; nome: string } | null = null;
  if (input.executorId) {
    const row = await env.DB.prepare(`SELECT u.id, u.nome, u.role,
        GROUP_CONCAT(DISTINCT ur.role) AS roles_csv
      FROM usuarios u
      LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
      WHERE u.id = ? AND u.ativo = 1
      GROUP BY u.id`)
      .bind(input.executorId)
      .first<{ id: number; nome: string; role: string; roles_csv: string | null }>();
    if (!row) throw new Error('Executor não encontrado.');

    const roles = splitCsv(row.roles_csv).length > 0 ? splitCsv(row.roles_csv) : [row.role];
    if (!roles.some((role) => ROLES_DENTISTA_AGENDA.has(role))) {
      throw new Error('Usuário selecionado não possui role de dentista.');
    }

    const executorUnit = await env.DB.prepare(
      'SELECT 1 AS ok FROM usuario_unidades WHERE usuario_id = ? AND unidade_id = ? LIMIT 1',
    ).bind(input.executorId, input.unidadeId).first<{ ok: number }>();
    if (!executorUnit) throw new Error('Executor não pertence à unidade informada.');
    executor = { id: row.id, nome: row.nome };
  } else {
    executor = await findDefaultEvaluator(env, input.unidadeId);
  }

  const status = parsedDate ? 'agendado' : 'pendente';
  const insert = await env.DB.prepare(`INSERT INTO agendamentos
      (cliente_id, executor_id, criado_por_id, tipo, status, data_agendada, observacoes, pago, valor_pago, unidade_id)
    VALUES (?, ?, ?, 'avaliacao', ?, ?, ?, 0, 0, ?)`)
    .bind(
      cliente.id,
      executor?.id ?? null,
      input.criadoPorId ?? null,
      status,
      parsedDate?.utcIso ?? null,
      normalizedObservacoes,
      input.unidadeId,
    )
    .run();

  const id = lastInsertedId(insert);
  const appointment = await env.DB.prepare(`SELECT a.id, a.unidade_id, a.cliente_id, a.executor_id, a.criado_por_id,
      a.tipo, a.status, a.data_agendada, a.observacoes, a.created_at,
      c.nome AS cliente_nome, c.telefone AS cliente_telefone, u.nome AS executor_nome,
      creator.nome AS criado_por_nome
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    LEFT JOIN usuarios u ON u.id = a.executor_id
    LEFT JOIN usuarios creator ON creator.id = a.criado_por_id
    WHERE a.id = ?`)
    .bind(id)
    .first<{
      id: number;
      unidade_id: number;
      cliente_id: number;
      executor_id: number | null;
      criado_por_id: number | null;
      tipo: string;
      status: string;
      data_agendada: string | null;
      observacoes: string | null;
      created_at: string;
      cliente_nome: string;
      cliente_telefone: string | null;
      executor_nome: string | null;
      criado_por_nome: string | null;
    }>();

  if (!appointment) throw new Error('Agendamento criado não foi encontrado.');
  return {
    id: appointment.id,
    unidadeId: appointment.unidade_id,
    cliente: {
      id: appointment.cliente_id,
      nome: appointment.cliente_nome,
      telefone: maskPhone(appointment.cliente_telefone),
    },
    executor: appointment.executor_id
      ? { id: appointment.executor_id, nome: appointment.executor_nome }
      : null,
    criadoPor: appointment.criado_por_id
      ? { id: appointment.criado_por_id, nome: appointment.criado_por_nome }
      : null,
    tipo: appointment.tipo,
    status: appointment.status,
    data_agendada: appointment.data_agendada,
    observacoes: maskNullableText(appointment.observacoes),
    criadoEm: appointment.created_at,
  };
}

export async function createLeadEvaluation(env: Env, input: CreateLeadEvaluationInput) {
  await validateEvaluationAppointmentDraft(env, {
    unidadeId: input.unidadeId,
    dataAgendada: input.dataAgendada,
    executorId: input.executorId,
    criadoPorId: input.criadoPorId,
  });

  const cliente = await createClient(env, input);
  const agendamento = await createEvaluationAppointment(env, {
    unidadeId: input.unidadeId,
    clienteId: cliente.id,
    dataAgendada: input.dataAgendada,
    executorId: input.executorId,
    criadoPorId: input.criadoPorId,
    observacoes: input.observacoesAgendamento,
  });

  return { cliente, agendamento };
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

function buildFollowupFilters(options: {
  unidadeId: number;
  status?: string;
  tipo?: string;
  responsavelUsuarioId?: number;
  clienteId?: number;
  from?: string;
  to?: string;
  search?: string;
  includeBilling?: boolean;
}) {
  const conditions = ['f.unidade_id = ?', 'f.excluida_em IS NULL'];
  const params: Primitive[] = [options.unidadeId];

  if (!options.includeBilling) {
    conditions.push("f.tipo <> 'cobranca'");
  }
  if (options.status) {
    conditions.push('f.status = ?');
    params.push(options.status);
  }
  if (options.tipo) {
    conditions.push('f.tipo = ?');
    params.push(options.tipo);
  }
  if (options.responsavelUsuarioId) {
    conditions.push('f.responsavel_usuario_id = ?');
    params.push(options.responsavelUsuarioId);
  }
  if (options.clienteId) {
    conditions.push('f.cliente_id = ?');
    params.push(options.clienteId);
  }
  if (options.from) {
    conditions.push('f.vencimento_em >= ?');
    params.push(startOfDay(options.from));
  }
  if (options.to) {
    conditions.push('f.vencimento_em <= ?');
    params.push(endOfDay(options.to));
  }
  if (options.search?.trim()) {
    const like = `%${options.search.trim()}%`;
    conditions.push("(c.nome LIKE ? OR f.titulo LIKE ? OR COALESCE(f.descricao, '') LIKE ?)");
    params.push(like, like, like);
  }

  return { conditions, params };
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

export async function attendanceFinancialDetail(env: Env, atendimentoId: number) {
  const atendimento = await env.DB.prepare(`SELECT a.id, a.unidade_id, a.status, a.tipo,
      a.created_at, a.finalizado_at,
      c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email, c.cpf AS cliente_cpf,
      cat.nome AS categoria_nome, cat.slug AS categoria_slug,
      un.nome AS unidade_nome
    FROM atendimentos a
    JOIN clientes c ON c.id = a.cliente_id
    LEFT JOIN categorias cat ON cat.id = a.categoria_id
    LEFT JOIN unidades un ON un.id = a.unidade_id
    WHERE a.id = ?`).bind(atendimentoId).first<{
      id: number;
      unidade_id: number;
      status: string;
      tipo: string;
      created_at: string;
      finalizado_at: string | null;
      cliente_id: number;
      cliente_nome: string;
      cliente_telefone: string | null;
      cliente_email: string | null;
      cliente_cpf: string | null;
      categoria_nome: string | null;
      categoria_slug: string | null;
      unidade_nome: string | null;
    }>();
  if (!atendimento) return null;

  const itens = await all<{
    id: number;
    procedimento_nome: string;
    etapa_label: string | null;
    executor_nome: string | null;
    status: string;
    quantidade: number;
    dentes: string | null;
    dente_unico: string | null;
    valor: number;
    valor_original: number | null;
    valor_final: number | null;
    valor_pago: number;
    desconto_valor: number | null;
    desconto_motivo: string | null;
    created_at: string;
    concluido_at: string | null;
  }>(env.DB.prepare(`SELECT
      i.id,
      p.nome AS procedimento_nome,
      i.etapa_label,
      ex.nome AS executor_nome,
      i.status,
      i.quantidade,
      i.dentes,
      i.dente_unico,
      i.valor,
      i.valor_original,
      i.valor_final,
      i.valor_pago,
      i.desconto_valor,
      i.desconto_motivo,
      i.created_at,
      i.concluido_at
    FROM itens_atendimento i
    JOIN procedimentos p ON p.id = i.procedimento_id
    LEFT JOIN usuarios ex ON ex.id = i.executor_id
    WHERE i.atendimento_id = ?
    ORDER BY i.created_at ASC, i.id ASC`).bind(atendimentoId));

  const pagamentos = await all<{
    id: number;
    pagamento_grupo_id: number | null;
    atendimento_id: number;
    forma_pagamento_id: number | null;
    valor: number;
    metodo: string;
    forma_pagamento_grupo_snapshot: string | null;
    forma_pagamento_subgrupo_snapshot: string | null;
    taxa_percentual_snapshot: number | null;
    taxa_fixa_snapshot: number | null;
    valor_taxa: number | null;
    valor_liquido: number | null;
    observacoes: string | null;
    cancelado: number;
    motivo_cancelamento: string | null;
    created_at: string;
    recebido_por_nome: string | null;
    grupo_valor_total: number | null;
    grupo_observacoes: string | null;
    grupo_cancelado: number | null;
    grupo_motivo_cancelamento: string | null;
    grupo_created_at: string | null;
  }>(env.DB.prepare(`SELECT
      pg.id,
      pg.pagamento_grupo_id,
      pg.atendimento_id,
      pg.forma_pagamento_id,
      pg.valor,
      pg.metodo,
      pg.forma_pagamento_grupo_snapshot,
      pg.forma_pagamento_subgrupo_snapshot,
      pg.taxa_percentual_snapshot,
      pg.taxa_fixa_snapshot,
      pg.valor_taxa,
      pg.valor_liquido,
      pg.observacoes,
      pg.cancelado,
      pg.motivo_cancelamento,
      pg.created_at,
      u.nome AS recebido_por_nome,
      grp.valor_total AS grupo_valor_total,
      grp.observacoes AS grupo_observacoes,
      grp.cancelado AS grupo_cancelado,
      grp.motivo_cancelamento AS grupo_motivo_cancelamento,
      grp.created_at AS grupo_created_at
    FROM pagamentos pg
    LEFT JOIN usuarios u ON u.id = pg.recebido_por_id
    LEFT JOIN pagamentos_grupos grp ON grp.id = pg.pagamento_grupo_id
    WHERE pg.atendimento_id = ?
    ORDER BY pg.created_at DESC, pg.id DESC`).bind(atendimentoId));

  const alocacoes = await all<{
    id: number;
    pagamento_id: number;
    item_atendimento_id: number | null;
    agendamento_id: number | null;
    etapa_modelo_id: number | null;
    valor_alocado: number;
    procedimento_nome: string;
    etapa_label: string | null;
    dentes: string | null;
    dente_unico: string | null;
    quantidade: number | null;
    data_agendada: string | null;
    agendamento_status: string | null;
  }>(env.DB.prepare(`SELECT
       pa.id,
       pa.pagamento_id,
       pa.item_atendimento_id,
       pa.agendamento_id,
       pa.etapa_modelo_id,
       pa.valor_alocado,
       COALESCE(p_item.nome, p_ag.nome, 'Procedimento') AS procedimento_nome,
       COALESCE(etapa.nome, i.etapa_label) AS etapa_label,
       i.dentes,
       i.dente_unico,
       i.quantidade,
       ag.data_agendada,
       ag.status AS agendamento_status
     FROM pagamentos_alocacoes pa
     INNER JOIN pagamentos pg ON pg.id = pa.pagamento_id
     LEFT JOIN itens_atendimento i ON i.id = pa.item_atendimento_id
     LEFT JOIN procedimentos p_item ON p_item.id = i.procedimento_id
     LEFT JOIN agendamentos ag ON ag.id = pa.agendamento_id
     LEFT JOIN procedimentos p_ag ON p_ag.id = ag.procedimento_id
     LEFT JOIN procedimento_etapas_modelo etapa ON etapa.id = COALESCE(pa.etapa_modelo_id, ag.etapa_modelo_id, i.etapa_modelo_id)
     WHERE pg.atendimento_id = ?
     ORDER BY pa.created_at ASC, pa.id ASC`).bind(atendimentoId));

  const alocacoesPorPagamento = new Map<number, typeof alocacoes>();
  for (const alocacao of alocacoes) {
    const current = alocacoesPorPagamento.get(alocacao.pagamento_id) ?? [];
    current.push(alocacao);
    alocacoesPorPagamento.set(alocacao.pagamento_id, current);
  }

  const pagamentosAgrupados = new Map<string, {
    id: string;
    pagamento_grupo_id: number | null;
    pagamento_representante_id: number;
    valor_total: number;
    valor_taxa_total: number;
    valor_liquido_total: number;
    observacoes: string | null;
    cancelado: boolean;
    motivo_cancelamento: string | null;
    created_at: string;
    recebido_por_nome: string | null;
    alocacoes: typeof alocacoes;
    formas: Array<{
      id: number;
      valor: number;
      metodo: string;
      forma_pagamento_id: number | null;
      forma_pagamento_grupo_snapshot: string | null;
      forma_pagamento_subgrupo_snapshot: string | null;
      taxa_percentual_snapshot: number | null;
      taxa_fixa_snapshot: number | null;
      valor_taxa: number | null;
      valor_liquido: number | null;
      observacoes: string | null;
      cancelado: boolean;
      motivo_cancelamento: string | null;
      created_at: string;
      alocacoes: typeof alocacoes;
    }>;
  }>();

  for (const pagamento of pagamentos) {
    const key = paymentGroupKey(pagamento.pagamento_grupo_id, pagamento.id);
    const current = pagamentosAgrupados.get(key) ?? {
      id: key,
      pagamento_grupo_id: pagamento.pagamento_grupo_id,
      pagamento_representante_id: pagamento.id,
      valor_total: roundMoney(pagamento.grupo_valor_total ?? pagamento.valor),
      valor_taxa_total: 0,
      valor_liquido_total: 0,
      observacoes: pagamento.grupo_observacoes ?? pagamento.observacoes,
      cancelado: Boolean(pagamento.grupo_cancelado ?? pagamento.cancelado),
      motivo_cancelamento: pagamento.grupo_motivo_cancelamento ?? pagamento.motivo_cancelamento,
      created_at: pagamento.grupo_created_at ?? pagamento.created_at,
      recebido_por_nome: pagamento.recebido_por_nome,
      alocacoes: [],
      formas: [],
    };

    const formaAlocacoes = alocacoesPorPagamento.get(pagamento.id) ?? [];
    current.alocacoes.push(...formaAlocacoes);
    current.valor_taxa_total = roundMoney(current.valor_taxa_total + Number(pagamento.valor_taxa ?? 0));
    current.valor_liquido_total = roundMoney(current.valor_liquido_total + Number(pagamento.valor_liquido ?? pagamento.valor));
    current.formas.push({
      id: pagamento.id,
      valor: roundMoney(pagamento.valor),
      metodo: pagamento.metodo,
      forma_pagamento_id: pagamento.forma_pagamento_id,
      forma_pagamento_grupo_snapshot: pagamento.forma_pagamento_grupo_snapshot,
      forma_pagamento_subgrupo_snapshot: pagamento.forma_pagamento_subgrupo_snapshot,
      taxa_percentual_snapshot: pagamento.taxa_percentual_snapshot,
      taxa_fixa_snapshot: pagamento.taxa_fixa_snapshot,
      valor_taxa: pagamento.valor_taxa,
      valor_liquido: pagamento.valor_liquido,
      observacoes: pagamento.observacoes,
      cancelado: Boolean(pagamento.cancelado),
      motivo_cancelamento: pagamento.motivo_cancelamento,
      created_at: pagamento.created_at,
      alocacoes: formaAlocacoes,
    });
    pagamentosAgrupados.set(key, current);
  }

  const itensNormalizados = itens.map((item) => {
    const valorCobrado = roundMoney(item.valor_final ?? item.valor);
    const valorPago = roundMoney(item.valor_pago);
    return {
      id: item.id,
      procedimento_nome: item.procedimento_nome,
      etapa_label: item.etapa_label,
      executor_nome: item.executor_nome,
      status: executionStatus(item.status),
      quantidade: item.quantidade,
      dentes: item.dentes,
      dente_unico: item.dente_unico,
      valor_orcado: roundMoney(item.valor_original ?? valorCobrado),
      valor_cobrado: valorCobrado,
      valor_pago: valorPago,
      valor_pendente: roundMoney(Math.max(valorCobrado - valorPago, 0)),
      desconto_valor: roundMoney(item.desconto_valor ?? 0),
      desconto_motivo: item.desconto_motivo,
      created_at: item.created_at,
      concluido_at: item.concluido_at,
    };
  });

  const resumo = {
    valor_total_itens: roundMoney(itensNormalizados.reduce((sum, item) => sum + item.valor_cobrado, 0)),
    valor_total_pago_itens: roundMoney(itensNormalizados.reduce((sum, item) => sum + item.valor_pago, 0)),
    valor_total_pendente_itens: roundMoney(itensNormalizados.reduce((sum, item) => sum + item.valor_pendente, 0)),
    valor_total_recebido_bruto: roundMoney(pagamentos.reduce((sum, item) => sum + (item.cancelado ? 0 : item.valor), 0)),
    valor_total_recebido_taxa: roundMoney(pagamentos.reduce((sum, item) => sum + (item.cancelado ? 0 : Number(item.valor_taxa ?? 0)), 0)),
    valor_total_recebido_liquido: roundMoney(pagamentos.reduce((sum, item) => sum + (item.cancelado ? 0 : Number(item.valor_liquido ?? item.valor)), 0)),
    valor_total_cancelado: roundMoney(pagamentos.reduce((sum, item) => sum + (item.cancelado ? item.valor : 0), 0)),
  };

  return {
    unidadeId: atendimento.unidade_id,
    atendimento: {
      id: atendimento.id,
      unidade_nome: atendimento.unidade_nome,
      status: attendanceStatus(atendimento.status),
      tipo: atendimento.tipo,
      categoria: atendimento.categoria_nome ? { nome: atendimento.categoria_nome, slug: atendimento.categoria_slug } : null,
      created_at: atendimento.created_at,
      finalizado_at: atendimento.finalizado_at,
      resumo,
    },
    cliente: {
      id: atendimento.cliente_id,
      nome: atendimento.cliente_nome,
      telefone: maskPhone(atendimento.cliente_telefone),
      email: maskEmail(atendimento.cliente_email),
      cpf: maskCpf(atendimento.cliente_cpf),
    },
    itens: itensNormalizados,
    pagamentos: Array.from(pagamentosAgrupados.values())
      .map((pagamento) => ({
        ...pagamento,
        formas: [...pagamento.formas].sort((left, right) => right.created_at.localeCompare(left.created_at)),
      }))
      .sort((left, right) => right.created_at.localeCompare(left.created_at)),
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
  const { conditions, params } = buildFollowupFilters({
    unidadeId,
    status,
    tipo,
    responsavelUsuarioId,
    clienteId,
    from,
    to,
    includeBilling: false,
  });
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

export async function listDetailedFollowups(
  env: Env,
  unidadeId: number,
  options: {
    status?: string;
    tipo?: string;
    responsavelUsuarioId?: number;
    clienteId?: number;
    from?: string;
    to?: string;
    search?: string;
    includeBilling?: boolean;
    allowFinancialText?: boolean;
    limit: number;
    offset: number;
  },
) {
  const { conditions, params } = buildFollowupFilters({
    unidadeId,
    status: options.status,
    tipo: options.tipo,
    responsavelUsuarioId: options.responsavelUsuarioId,
    clienteId: options.clienteId,
    from: options.from,
    to: options.to,
    search: options.search,
    includeBilling: options.includeBilling,
  });
  const where = conditions.join(' AND ');

  const summaryParams = [...params];
  const porTipoStatus = await all<{ tipo: string; status: string; total: number }>(
    env.DB.prepare(`SELECT f.tipo, f.status, COUNT(*) AS total
      FROM followup_tarefas f
      JOIN clientes c ON c.id = f.cliente_id
      WHERE ${where}
      GROUP BY f.tipo, f.status
      ORDER BY f.tipo ASC, f.status ASC`).bind(...summaryParams),
  );
  const urgency = await env.DB.prepare(`SELECT
      SUM(CASE WHEN f.status = 'aberta' THEN 1 ELSE 0 END) AS abertas,
      SUM(CASE WHEN f.status = 'aberta' AND f.vencimento_em < datetime('now', 'localtime') THEN 1 ELSE 0 END) AS atrasadas,
      SUM(CASE WHEN f.status = 'aberta' AND DATE(f.vencimento_em) = DATE('now', 'localtime') THEN 1 ELSE 0 END) AS vencem_hoje,
      SUM(CASE WHEN f.status = 'concluida' AND DATE(f.concluida_em) = DATE('now', 'localtime') THEN 1 ELSE 0 END) AS concluidas_hoje
    FROM followup_tarefas f
    JOIN clientes c ON c.id = f.cliente_id
    WHERE ${where}`).bind(...summaryParams).first<{
      abertas: number | null;
      atrasadas: number | null;
      vencem_hoje: number | null;
      concluidas_hoje: number | null;
    }>();

  const rows = await all<{
    id: number;
    unidade_id: number;
    tipo: string;
    status: string;
    titulo: string;
    descricao: string | null;
    vencimento_em: string;
    concluida_em: string | null;
    created_at: string;
    updated_at: string | null;
    cliente_id: number;
    cliente_nome: string;
    cliente_telefone: string | null;
    cliente_email: string | null;
    cliente_cpf: string | null;
    responsavel_usuario_id: number;
    responsavel_usuario_nome: string;
    criado_por_id: number;
    criado_por_nome: string;
    concluida_por_id: number | null;
    concluida_por_nome: string | null;
  }>(env.DB.prepare(`SELECT
      f.id,
      f.unidade_id,
      f.tipo,
      f.status,
      f.titulo,
      f.descricao,
      f.vencimento_em,
      f.concluida_em,
      f.created_at,
      f.updated_at,
      c.id AS cliente_id,
      c.nome AS cliente_nome,
      c.telefone AS cliente_telefone,
      c.email AS cliente_email,
      c.cpf AS cliente_cpf,
      ru.id AS responsavel_usuario_id,
      ru.nome AS responsavel_usuario_nome,
      cu.id AS criado_por_id,
      cu.nome AS criado_por_nome,
      uu.id AS concluida_por_id,
      uu.nome AS concluida_por_nome
    FROM followup_tarefas f
    JOIN clientes c ON c.id = f.cliente_id
    JOIN usuarios ru ON ru.id = f.responsavel_usuario_id
    JOIN usuarios cu ON cu.id = f.criado_por_id
    LEFT JOIN usuarios uu ON uu.id = f.concluida_por_id
    WHERE ${where}
    ORDER BY CASE WHEN f.status = 'aberta' THEN 0 ELSE 1 END, f.vencimento_em ASC, f.created_at ASC
    LIMIT ? OFFSET ?`).bind(...params, options.limit, options.offset));

  return {
    resumo: {
      porTipoStatus,
      urgencia: {
        abertas: urgency?.abertas ?? 0,
        atrasadas: urgency?.atrasadas ?? 0,
        vencem_hoje: urgency?.vencem_hoje ?? 0,
        concluidas_hoje: urgency?.concluidas_hoje ?? 0,
      },
    },
    items: rows.map((row) => ({
      id: row.id,
      unidade_id: row.unidade_id,
      tipo: row.tipo,
      status: row.status,
      titulo: maskNullableText(row.titulo, 160, { allowFinancialText: options.allowFinancialText }),
      descricao: maskNullableText(row.descricao, 320, { allowFinancialText: options.allowFinancialText }),
      vencimento_em: row.vencimento_em,
      concluida_em: row.concluida_em,
      created_at: row.created_at,
      updated_at: row.updated_at,
      cliente: {
        id: row.cliente_id,
        nome: row.cliente_nome,
        telefone: maskPhone(row.cliente_telefone),
        email: maskEmail(row.cliente_email),
        cpf: maskCpf(row.cliente_cpf),
      },
      responsavel: {
        id: row.responsavel_usuario_id,
        nome: row.responsavel_usuario_nome,
      },
      criado_por: {
        id: row.criado_por_id,
        nome: row.criado_por_nome,
      },
      concluida_por: row.concluida_por_id
        ? {
            id: row.concluida_por_id,
            nome: row.concluida_por_nome,
          }
        : null,
    })),
  };
}

export async function followupDetail(
  env: Env,
  followupId: number,
  allowFinancialText = false,
) {
  const row = await env.DB.prepare(`SELECT
      f.id,
      f.unidade_id,
      f.tipo,
      f.status,
      f.titulo,
      f.descricao,
      f.vencimento_em,
      f.concluida_em,
      f.created_at,
      f.updated_at,
      c.id AS cliente_id,
      c.nome AS cliente_nome,
      c.telefone AS cliente_telefone,
      c.email AS cliente_email,
      c.cpf AS cliente_cpf,
      ru.id AS responsavel_usuario_id,
      ru.nome AS responsavel_usuario_nome,
      cu.id AS criado_por_id,
      cu.nome AS criado_por_nome,
      uu.id AS concluida_por_id,
      uu.nome AS concluida_por_nome,
      un.nome AS unidade_nome
    FROM followup_tarefas f
    JOIN clientes c ON c.id = f.cliente_id
    JOIN usuarios ru ON ru.id = f.responsavel_usuario_id
    JOIN usuarios cu ON cu.id = f.criado_por_id
    LEFT JOIN usuarios uu ON uu.id = f.concluida_por_id
    LEFT JOIN unidades un ON un.id = f.unidade_id
    WHERE f.id = ? AND f.excluida_em IS NULL`).bind(followupId).first<{
      id: number;
      unidade_id: number;
      tipo: string;
      status: string;
      titulo: string;
      descricao: string | null;
      vencimento_em: string;
      concluida_em: string | null;
      created_at: string;
      updated_at: string | null;
      cliente_id: number;
      cliente_nome: string;
      cliente_telefone: string | null;
      cliente_email: string | null;
      cliente_cpf: string | null;
      responsavel_usuario_id: number;
      responsavel_usuario_nome: string;
      criado_por_id: number;
      criado_por_nome: string;
      concluida_por_id: number | null;
      concluida_por_nome: string | null;
      unidade_nome: string | null;
    }>();
  if (!row) return null;

  return {
    unidadeId: row.unidade_id,
    tipo: row.tipo,
    followup: {
      id: row.id,
      unidade_nome: row.unidade_nome,
      tipo: row.tipo,
      status: row.status,
      titulo: maskNullableText(row.titulo, 160, { allowFinancialText }),
      descricao: maskNullableText(row.descricao, 500, { allowFinancialText }),
      vencimento_em: row.vencimento_em,
      concluida_em: row.concluida_em,
      created_at: row.created_at,
      updated_at: row.updated_at,
      cliente: {
        id: row.cliente_id,
        nome: row.cliente_nome,
        telefone: maskPhone(row.cliente_telefone),
        email: maskEmail(row.cliente_email),
        cpf: maskCpf(row.cliente_cpf),
      },
      responsavel: {
        id: row.responsavel_usuario_id,
        nome: row.responsavel_usuario_nome,
      },
      criado_por: {
        id: row.criado_por_id,
        nome: row.criado_por_nome,
      },
      concluida_por: row.concluida_por_id
        ? {
            id: row.concluida_por_id,
            nome: row.concluida_por_nome,
          }
        : null,
    },
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

export async function clientFinancialProfile(env: Env, clienteId: number) {
  const client = await env.DB.prepare(
    `SELECT id, nome, telefone, email, cpf, origem, plano_odontologico, created_at
     FROM clientes WHERE id = ?`,
  ).bind(clienteId).first<{
    id: number;
    nome: string;
    telefone: string | null;
    email: string | null;
    cpf: string | null;
    origem: string;
    plano_odontologico: string | null;
    created_at: string;
  }>();
  if (!client) return null;

  const saldo = await env.DB.prepare(
    'SELECT saldo, updated_at FROM saldo_clientes WHERE cliente_id = ?',
  ).bind(clienteId).first<{ saldo: number; updated_at: string | null }>();
  const saldoCalculado = await env.DB.prepare(`SELECT
      COALESCE(SUM(i.valor_pago), 0) AS saldo_calculado
    FROM itens_atendimento i
    JOIN atendimentos a ON a.id = i.atendimento_id
    WHERE a.cliente_id = ? AND i.status != 'concluido' AND i.valor_pago > 0`).bind(clienteId).first<{ saldo_calculado: number | null }>();
  const valorPendente = await env.DB.prepare(`SELECT
      COALESCE(SUM(
        CASE
          WHEN (COALESCE(i.valor_final, i.valor) - COALESCE(i.valor_pago, 0)) > 0
            THEN (COALESCE(i.valor_final, i.valor) - COALESCE(i.valor_pago, 0))
          ELSE 0
        END
      ), 0) AS valor_pendente
    FROM itens_atendimento i
    JOIN atendimentos a ON a.id = i.atendimento_id
    WHERE a.cliente_id = ? AND a.status NOT IN ('encerrado')`).bind(clienteId).first<{ valor_pendente: number | null }>();

  const atendimentos = await all<{
    id: number;
    status: string;
    created_at: string;
    unidade_nome: string | null;
    total: number | null;
    total_pago: number | null;
  }>(env.DB.prepare(`SELECT
      a.id,
      a.status,
      a.created_at,
      u.nome AS unidade_nome,
      COALESCE(SUM(i.valor_final), SUM(i.valor), 0) AS total,
      COALESCE(SUM(i.valor_pago), 0) AS total_pago
    FROM atendimentos a
    LEFT JOIN unidades u ON u.id = a.unidade_id
    LEFT JOIN itens_atendimento i ON i.atendimento_id = a.id
    WHERE a.cliente_id = ?
    GROUP BY a.id
    ORDER BY a.created_at DESC
    LIMIT 15`).bind(clienteId));

  const pagamentos = await all<{
    id: number;
    pagamento_grupo_id: number | null;
    atendimento_id: number;
    valor: number;
    metodo: string;
    forma_pagamento_grupo_snapshot: string | null;
    forma_pagamento_subgrupo_snapshot: string | null;
    valor_taxa: number | null;
    valor_liquido: number | null;
    observacoes: string | null;
    cancelado: number;
    motivo_cancelamento: string | null;
    created_at: string;
    recebido_por_nome: string | null;
    unidade_id: number;
    unidade_nome: string | null;
  }>(env.DB.prepare(`SELECT
      pg.id,
      pg.pagamento_grupo_id,
      pg.atendimento_id,
      pg.valor,
      pg.metodo,
      pg.forma_pagamento_grupo_snapshot,
      pg.forma_pagamento_subgrupo_snapshot,
      pg.valor_taxa,
      pg.valor_liquido,
      pg.observacoes,
      pg.cancelado,
      pg.motivo_cancelamento,
      pg.created_at,
      u.nome AS recebido_por_nome,
      a.unidade_id,
      un.nome AS unidade_nome
    FROM pagamentos pg
    JOIN atendimentos a ON a.id = pg.atendimento_id
    LEFT JOIN usuarios u ON u.id = pg.recebido_por_id
    LEFT JOIN unidades un ON un.id = a.unidade_id
    WHERE a.cliente_id = ?
    ORDER BY pg.created_at DESC, pg.id DESC
    LIMIT 50`).bind(clienteId));

  const pagamentosAgrupados = new Map<string, {
    id: string;
    pagamento_grupo_id: number | null;
    pagamento_representante_id: number;
    atendimento_id: number;
    unidade_id: number;
    unidade_nome: string | null;
    valor_total: number;
    valor_taxa_total: number;
    valor_liquido_total: number;
    observacoes: string | null;
    cancelado: boolean;
    motivo_cancelamento: string | null;
    created_at: string;
    recebido_por_nome: string | null;
    formas: Array<{
      id: number;
      valor: number;
      metodo: string;
      forma_pagamento_grupo_snapshot: string | null;
      forma_pagamento_subgrupo_snapshot: string | null;
      valor_taxa: number | null;
      valor_liquido: number | null;
      observacoes: string | null;
      cancelado: boolean;
      motivo_cancelamento: string | null;
      created_at: string;
    }>;
  }>();

  for (const pagamento of pagamentos) {
    const key = paymentGroupKey(pagamento.pagamento_grupo_id, pagamento.id);
    const current = pagamentosAgrupados.get(key) ?? {
      id: key,
      pagamento_grupo_id: pagamento.pagamento_grupo_id,
      pagamento_representante_id: pagamento.id,
      atendimento_id: pagamento.atendimento_id,
      unidade_id: pagamento.unidade_id,
      unidade_nome: pagamento.unidade_nome,
      valor_total: 0,
      valor_taxa_total: 0,
      valor_liquido_total: 0,
      observacoes: pagamento.observacoes,
      cancelado: Boolean(pagamento.cancelado),
      motivo_cancelamento: pagamento.motivo_cancelamento,
      created_at: pagamento.created_at,
      recebido_por_nome: pagamento.recebido_por_nome,
      formas: [],
    };

    current.valor_total = roundMoney(current.valor_total + pagamento.valor);
    current.valor_taxa_total = roundMoney(current.valor_taxa_total + Number(pagamento.valor_taxa ?? 0));
    current.valor_liquido_total = roundMoney(current.valor_liquido_total + Number(pagamento.valor_liquido ?? pagamento.valor));
    current.formas.push({
      id: pagamento.id,
      valor: roundMoney(pagamento.valor),
      metodo: pagamento.metodo,
      forma_pagamento_grupo_snapshot: pagamento.forma_pagamento_grupo_snapshot,
      forma_pagamento_subgrupo_snapshot: pagamento.forma_pagamento_subgrupo_snapshot,
      valor_taxa: pagamento.valor_taxa,
      valor_liquido: pagamento.valor_liquido,
      observacoes: pagamento.observacoes,
      cancelado: Boolean(pagamento.cancelado),
      motivo_cancelamento: pagamento.motivo_cancelamento,
      created_at: pagamento.created_at,
    });
    pagamentosAgrupados.set(key, current);
  }

  const movimentacoes = await all<{
    id: number;
    tipo: string;
    valor: number;
    saldo_anterior: number;
    saldo_novo: number;
    pagamento_id: number | null;
    item_atendimento_id: number | null;
    atendimento_id: number | null;
    cliente_destino_id: number | null;
    observacoes: string | null;
    created_at: string;
  }>(env.DB.prepare(`SELECT
      id,
      tipo,
      valor,
      saldo_anterior,
      saldo_novo,
      pagamento_id,
      item_atendimento_id,
      atendimento_id,
      cliente_destino_id,
      observacoes,
      created_at
    FROM movimentacoes_saldo
    WHERE cliente_id = ?
    ORDER BY created_at DESC
    LIMIT 30`).bind(clienteId));

  const totalPagoHistorico = roundMoney(pagamentos.reduce((sum, item) => sum + (item.cancelado ? 0 : item.valor), 0));
  const totalCanceladoHistorico = roundMoney(pagamentos.reduce((sum, item) => sum + (item.cancelado ? item.valor : 0), 0));

  return {
    cliente: {
      id: client.id,
      nome: client.nome,
      telefone: maskPhone(client.telefone),
      email: maskEmail(client.email),
      cpf: maskCpf(client.cpf),
      origem: client.origem,
      plano_odontologico: client.plano_odontologico,
      cadastrado_em: client.created_at,
    },
    resumo: {
      saldo_atual: roundMoney(saldo?.saldo ?? 0),
      saldo_calculado: roundMoney(saldoCalculado?.saldo_calculado ?? 0),
      valor_pendente_aberto: roundMoney(valorPendente?.valor_pendente ?? 0),
      total_pago_historico: totalPagoHistorico,
      total_cancelado_historico: totalCanceladoHistorico,
      saldo_updated_at: saldo?.updated_at ?? null,
    },
    atendimentos_financeiros: atendimentos.map((item) => {
      const total = roundMoney(item.total ?? 0);
      const totalPago = roundMoney(item.total_pago ?? 0);
      return {
        id: item.id,
        status: attendanceStatus(item.status),
        created_at: item.created_at,
        unidade_nome: item.unidade_nome,
        total,
        total_pago: totalPago,
        total_pendente: roundMoney(Math.max(total - totalPago, 0)),
      };
    }),
    pagamentos_recentes: Array.from(pagamentosAgrupados.values())
      .map((pagamento) => ({
        ...pagamento,
        formas: [...pagamento.formas].sort((left, right) => right.created_at.localeCompare(left.created_at)),
      }))
      .sort((left, right) => right.created_at.localeCompare(left.created_at)),
    movimentacoes_saldo: movimentacoes.map((item) => ({
      ...item,
      valor: roundMoney(item.valor),
      saldo_anterior: roundMoney(item.saldo_anterior),
      saldo_novo: roundMoney(item.saldo_novo),
    })),
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

export async function unitFinancialSummary(env: Env, unidadeId: number, from: string, to: string) {
  const summary = await env.DB.prepare(`SELECT
      COUNT(*) AS quantidade_formas,
      COUNT(DISTINCT CASE
        WHEN pg.cancelado = 0 THEN CASE
          WHEN pg.pagamento_grupo_id IS NOT NULL THEN 'grupo:' || CAST(pg.pagamento_grupo_id AS TEXT)
          ELSE 'pagamento:' || CAST(pg.id AS TEXT)
        END
        ELSE NULL
      END) AS quantidade_recebimentos,
      COUNT(DISTINCT CASE WHEN pg.cancelado = 0 THEN pg.atendimento_id ELSE NULL END) AS quantidade_atendimentos,
      COUNT(DISTINCT CASE WHEN pg.cancelado = 0 THEN a.cliente_id ELSE NULL END) AS quantidade_clientes,
      SUM(CASE WHEN pg.cancelado = 0 THEN pg.valor ELSE 0 END) AS total_bruto,
      SUM(CASE WHEN pg.cancelado = 0 THEN COALESCE(pg.valor_taxa, 0) ELSE 0 END) AS total_taxas,
      SUM(CASE WHEN pg.cancelado = 0 THEN COALESCE(pg.valor_liquido, pg.valor) ELSE 0 END) AS total_liquido,
      SUM(CASE WHEN pg.cancelado = 1 THEN 1 ELSE 0 END) AS quantidade_cancelados,
      SUM(CASE WHEN pg.cancelado = 1 THEN pg.valor ELSE 0 END) AS valor_cancelado
    FROM pagamentos pg
    JOIN atendimentos a ON a.id = pg.atendimento_id
    WHERE a.unidade_id = ? AND DATE(pg.created_at) BETWEEN ? AND ?`).bind(unidadeId, from, to).first<{
      quantidade_formas: number | null;
      quantidade_recebimentos: number | null;
      quantidade_atendimentos: number | null;
      quantidade_clientes: number | null;
      total_bruto: number | null;
      total_taxas: number | null;
      total_liquido: number | null;
      quantidade_cancelados: number | null;
      valor_cancelado: number | null;
    }>();

  const porMetodo = await all<{
    metodo: string;
    forma_pagamento_grupo_snapshot: string | null;
    forma_pagamento_subgrupo_snapshot: string | null;
    quantidade_formas: number;
    quantidade_recebimentos: number;
    total_bruto: number;
    total_taxas: number;
    total_liquido: number;
  }>(env.DB.prepare(`SELECT
      pg.metodo,
      pg.forma_pagamento_grupo_snapshot,
      pg.forma_pagamento_subgrupo_snapshot,
      COUNT(*) AS quantidade_formas,
      COUNT(DISTINCT CASE
        WHEN pg.pagamento_grupo_id IS NOT NULL THEN 'grupo:' || CAST(pg.pagamento_grupo_id AS TEXT)
        ELSE 'pagamento:' || CAST(pg.id AS TEXT)
      END) AS quantidade_recebimentos,
      SUM(pg.valor) AS total_bruto,
      SUM(COALESCE(pg.valor_taxa, 0)) AS total_taxas,
      SUM(COALESCE(pg.valor_liquido, pg.valor)) AS total_liquido
    FROM pagamentos pg
    JOIN atendimentos a ON a.id = pg.atendimento_id
    WHERE a.unidade_id = ? AND DATE(pg.created_at) BETWEEN ? AND ? AND pg.cancelado = 0
    GROUP BY pg.metodo, pg.forma_pagamento_grupo_snapshot, pg.forma_pagamento_subgrupo_snapshot
    ORDER BY total_bruto DESC, pg.metodo ASC`).bind(unidadeId, from, to));

  const porRecebedor = await all<{
    recebido_por_id: number | null;
    recebido_por_nome: string | null;
    quantidade_formas: number;
    quantidade_recebimentos: number;
    total_bruto: number;
    total_liquido: number;
  }>(env.DB.prepare(`SELECT
      pg.recebido_por_id,
      u.nome AS recebido_por_nome,
      COUNT(*) AS quantidade_formas,
      COUNT(DISTINCT CASE
        WHEN pg.pagamento_grupo_id IS NOT NULL THEN 'grupo:' || CAST(pg.pagamento_grupo_id AS TEXT)
        ELSE 'pagamento:' || CAST(pg.id AS TEXT)
      END) AS quantidade_recebimentos,
      SUM(pg.valor) AS total_bruto,
      SUM(COALESCE(pg.valor_liquido, pg.valor)) AS total_liquido
    FROM pagamentos pg
    JOIN atendimentos a ON a.id = pg.atendimento_id
    LEFT JOIN usuarios u ON u.id = pg.recebido_por_id
    WHERE a.unidade_id = ? AND DATE(pg.created_at) BETWEEN ? AND ? AND pg.cancelado = 0
    GROUP BY pg.recebido_por_id, u.nome
    ORDER BY total_bruto DESC, recebido_por_nome ASC`).bind(unidadeId, from, to));

  const recentes = await all<{
    id: number;
    pagamento_grupo_id: number | null;
    atendimento_id: number;
    cliente_id: number;
    cliente_nome: string;
    valor: number;
    metodo: string;
    forma_pagamento_grupo_snapshot: string | null;
    forma_pagamento_subgrupo_snapshot: string | null;
    valor_taxa: number | null;
    valor_liquido: number | null;
    cancelado: number;
    motivo_cancelamento: string | null;
    created_at: string;
    recebido_por_nome: string | null;
  }>(env.DB.prepare(`SELECT
      pg.id,
      pg.pagamento_grupo_id,
      pg.atendimento_id,
      a.cliente_id,
      c.nome AS cliente_nome,
      pg.valor,
      pg.metodo,
      pg.forma_pagamento_grupo_snapshot,
      pg.forma_pagamento_subgrupo_snapshot,
      pg.valor_taxa,
      pg.valor_liquido,
      pg.cancelado,
      pg.motivo_cancelamento,
      pg.created_at,
      u.nome AS recebido_por_nome
    FROM pagamentos pg
    JOIN atendimentos a ON a.id = pg.atendimento_id
    JOIN clientes c ON c.id = a.cliente_id
    LEFT JOIN usuarios u ON u.id = pg.recebido_por_id
    WHERE a.unidade_id = ? AND DATE(pg.created_at) BETWEEN ? AND ?
    ORDER BY pg.created_at DESC, pg.id DESC
    LIMIT 25`).bind(unidadeId, from, to));

  const totalBruto = roundMoney(summary?.total_bruto ?? 0);
  const quantidadeRecebimentos = summary?.quantidade_recebimentos ?? 0;

  return {
    unidadeId,
    periodo: { inicio: from, fim: to },
    resumo: {
      quantidade_formas: summary?.quantidade_formas ?? 0,
      quantidade_recebimentos: quantidadeRecebimentos,
      quantidade_atendimentos: summary?.quantidade_atendimentos ?? 0,
      quantidade_clientes: summary?.quantidade_clientes ?? 0,
      total_bruto: totalBruto,
      total_taxas: roundMoney(summary?.total_taxas ?? 0),
      total_liquido: roundMoney(summary?.total_liquido ?? 0),
      quantidade_cancelados: summary?.quantidade_cancelados ?? 0,
      valor_cancelado: roundMoney(summary?.valor_cancelado ?? 0),
      ticket_medio_recebimento: quantidadeRecebimentos > 0
        ? roundMoney(totalBruto / quantidadeRecebimentos)
        : 0,
    },
    por_metodo: porMetodo.map((item) => ({
      ...item,
      total_bruto: roundMoney(item.total_bruto),
      total_taxas: roundMoney(item.total_taxas),
      total_liquido: roundMoney(item.total_liquido),
    })),
    por_recebedor: porRecebedor.map((item) => ({
      ...item,
      total_bruto: roundMoney(item.total_bruto),
      total_liquido: roundMoney(item.total_liquido),
    })),
    pagamentos_recentes: recentes.map((item) => ({
      id: paymentGroupKey(item.pagamento_grupo_id, item.id),
      pagamento_forma_id: item.id,
      pagamento_grupo_id: item.pagamento_grupo_id,
      atendimento_id: item.atendimento_id,
      cliente: {
        id: item.cliente_id,
        nome: item.cliente_nome,
      },
      valor: roundMoney(item.valor),
      metodo: item.metodo,
      forma_pagamento_grupo_snapshot: item.forma_pagamento_grupo_snapshot,
      forma_pagamento_subgrupo_snapshot: item.forma_pagamento_subgrupo_snapshot,
      valor_taxa: roundMoney(item.valor_taxa ?? 0),
      valor_liquido: roundMoney(item.valor_liquido ?? item.valor),
      cancelado: Boolean(item.cancelado),
      motivo_cancelamento: item.motivo_cancelamento,
      created_at: item.created_at,
      recebido_por_nome: item.recebido_por_nome,
    })),
  };
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

export async function audit(
  env: Env,
  identity: Pick<Identity, 'id' | 'clientId'> | null,
  tool: string,
  unidadeId: number | null,
  success: boolean,
) {
  try {
    await env.DB.prepare(`INSERT INTO mcp_audit_log
      (usuario_id, client_id, ferramenta, unidade_id, sucesso)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(identity?.id ?? null, identity?.clientId ?? null, tool, unidadeId, success ? 1 : 0)
      .run();
  } catch (error) {
    // Auditoria não pode revelar dados nem interromper uma ação MCP.
    console.error('Falha ao registrar auditoria MCP', error);
  }
}
