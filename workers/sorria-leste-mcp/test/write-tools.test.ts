import { describe, expect, it } from 'vitest';
import {
  assertUnit,
  createClient,
  createEvaluationAppointment,
  getWriteIdentity,
} from '../src/repository';
import { handleSdrApi } from '../src/sdr-api';
import type { D1Database, D1PreparedStatement, Env } from '../src/types';

interface MockUser {
  id: number;
  nome: string;
  email: string;
  role: string;
  ativo: number;
}

interface MockUnit {
  id: number;
  nome: string;
  ativo: number;
  endereco?: string | null;
  telefone?: string | null;
}

interface MockClient {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  origem: string;
  sexo: string | null;
  plano_odontologico: string | null;
  observacoes: string | null;
  created_at: string;
}

interface MockAppointment {
  id: number;
  cliente_id: number;
  executor_id: number | null;
  criado_por_id: number | null;
  tipo: string;
  status: string;
  data_agendada: string | null;
  observacoes: string | null;
  pago: number;
  valor_pago: number;
  unidade_id: number;
  created_at: string;
}

interface MockData {
  users: MockUser[];
  userRoles: Array<{ usuario_id: number; role: string }>;
  userUnits: Array<{ usuario_id: number; unidade_id: number }>;
  units: MockUnit[];
  clients: MockClient[];
  appointments: MockAppointment[];
  nextClientId: number;
  nextAppointmentId: number;
}

class MockStatement implements D1PreparedStatement {
  private params: unknown[] = [];

  constructor(private readonly data: MockData, private readonly sql: string) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.params = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    const rows = this.selectRows();
    return (rows[0] ?? null) as T | null;
  }

  async all<T = unknown>(): Promise<{ results?: T[] }> {
    return { results: this.selectRows() as T[] };
  }

  async run<T = Record<string, unknown>>(): Promise<{ results?: T[]; success?: boolean; meta?: { last_row_id?: number; changes?: number } }> {
    const normalized = this.normalizedSql();
    if (normalized.startsWith('insert into clientes')) {
      const id = this.data.nextClientId++;
      this.data.clients.push({
        id,
        nome: String(this.params[0]),
        cpf: this.nullableString(this.params[1]),
        telefone: this.nullableString(this.params[2]),
        email: this.nullableString(this.params[3]),
        data_nascimento: this.nullableString(this.params[4]),
        endereco: this.nullableString(this.params[5]),
        origem: String(this.params[6]),
        sexo: this.nullableString(this.params[7]),
        plano_odontologico: this.nullableString(this.params[8]),
        observacoes: this.nullableString(this.params[9]),
        created_at: '2026-07-25T10:00:00.000Z',
      });
      return { success: true, meta: { last_row_id: id, changes: 1 } };
    }

    if (normalized.startsWith('insert into agendamentos')) {
      const id = this.data.nextAppointmentId++;
      this.data.appointments.push({
        id,
        cliente_id: Number(this.params[0]),
        executor_id: this.params[1] == null ? null : Number(this.params[1]),
        criado_por_id: this.params[2] == null ? null : Number(this.params[2]),
        tipo: 'avaliacao',
        status: String(this.params[3]),
        data_agendada: this.nullableString(this.params[4]),
        observacoes: this.nullableString(this.params[5]),
        pago: 0,
        valor_pago: 0,
        unidade_id: Number(this.params[6]),
        created_at: '2026-07-25T10:05:00.000Z',
      });
      return { success: true, meta: { last_row_id: id, changes: 1 } };
    }

    return { success: true, meta: { changes: 0 } };
  }

  async raw<T = unknown>(): Promise<T[]> {
    return [];
  }

  private normalizedSql(): string {
    return this.sql.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private nullableString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  private selectRows(): unknown[] {
    const sql = this.normalizedSql();

    if (sql.includes('from usuarios where id = ? and email = ?')) {
      const [id, email] = this.params;
      return this.data.users.filter((user) =>
        user.id === Number(id) && user.email === String(email));
    }

    if (sql.includes('from unidades u join usuario_unidades')) {
      const userId = Number(this.params[0]);
      const unitIds = new Set(this.data.userUnits
        .filter((row) => row.usuario_id === userId)
        .map((row) => row.unidade_id));
      return this.data.units
        .filter((unit) => unit.ativo === 1 && unitIds.has(unit.id))
        .sort((left, right) => left.nome.localeCompare(right.nome))
        .map((unit) => ({ id: unit.id }));
    }

    if (sql.includes('select id from unidades where ativo = 1')) {
      return this.data.units
        .filter((unit) => unit.ativo === 1)
        .sort((left, right) => left.nome.localeCompare(right.nome))
        .map((unit) => ({ id: unit.id }));
    }

    if (sql.includes('from unidades where id = ? and ativo = 1')) {
      const id = Number(this.params[0]);
      return this.data.units
        .filter((unit) => unit.id === id && unit.ativo === 1)
        .map((unit) => ({ id: unit.id }));
    }

    if (sql.includes('select id from clientes where cpf = ?')) {
      const cpf = String(this.params[0]);
      return this.data.clients.filter((client) => client.cpf === cpf).map((client) => ({ id: client.id }));
    }

    if (sql.includes('from clientes where id = ?')) {
      const id = Number(this.params[0]);
      return this.data.clients.filter((client) => client.id === id);
    }

    if (sql.includes('from usuarios u') && sql.includes('group_concat(distinct ur.role)')) {
      const id = Number(this.params[0]);
      return this.data.users
        .filter((user) => user.id === id && user.ativo === 1)
        .map((user) => ({
          id: user.id,
          nome: user.nome,
          role: user.role,
          roles_csv: this.data.userRoles
            .filter((row) => row.usuario_id === user.id)
            .map((row) => row.role)
            .join(',') || null,
        }));
    }

    if (sql.includes('from usuarios u') && sql.includes("and (u.role = 'avaliador' or ur.role = 'avaliador')")) {
      const unitId = Number(this.params[0]);
      const userIds = new Set(this.data.userUnits
        .filter((row) => row.unidade_id === unitId)
        .map((row) => row.usuario_id));
      return this.data.users
        .filter((user) => user.ativo === 1 && userIds.has(user.id))
        .filter((user) => user.role === 'avaliador' || this.data.userRoles.some((row) =>
          row.usuario_id === user.id && row.role === 'avaliador'))
        .sort((left, right) => {
          const leftPrimary = left.role === 'avaliador' ? 0 : 1;
          const rightPrimary = right.role === 'avaliador' ? 0 : 1;
          return leftPrimary - rightPrimary || left.id - right.id;
        })
        .slice(0, 1)
        .map((user) => ({ id: user.id, nome: user.nome }));
    }

    if (sql.includes('from usuarios u') && sql.includes('join usuario_unidades uu on uu.usuario_id = u.id')
      && sql.includes('where u.id = ?')) {
      const [userId, unitId] = this.params.map(Number);
      return this.data.users
        .filter((user) => user.id === userId && user.ativo === 1)
        .filter((user) => this.data.userUnits.some((row) =>
          row.usuario_id === user.id && row.unidade_id === unitId))
        .map((user) => ({ id: user.id }));
    }

    if (sql.includes('from usuario_unidades where usuario_id = ? and unidade_id = ?')) {
      const [userId, unitId] = this.params.map(Number);
      return this.data.userUnits.some((row) => row.usuario_id === userId && row.unidade_id === unitId)
        ? [{ ok: 1 }]
        : [];
    }

    if (sql.includes('from agendamentos a') && sql.includes('where a.id = ?')) {
      const id = Number(this.params[0]);
      return this.data.appointments
        .filter((appointment) => appointment.id === id)
        .map((appointment) => {
          const client = this.data.clients.find((item) => item.id === appointment.cliente_id);
          const executor = this.data.users.find((user) => user.id === appointment.executor_id);
          const creator = this.data.users.find((user) => user.id === appointment.criado_por_id);
          return {
            id: appointment.id,
            unidade_id: appointment.unidade_id,
            cliente_id: appointment.cliente_id,
            executor_id: appointment.executor_id,
            criado_por_id: appointment.criado_por_id,
            tipo: appointment.tipo,
            status: appointment.status,
            data_agendada: appointment.data_agendada,
            observacoes: appointment.observacoes,
            created_at: appointment.created_at,
            cliente_nome: client?.nome ?? '',
            cliente_telefone: client?.telefone ?? null,
            executor_nome: executor?.nome ?? null,
            criado_por_nome: creator?.nome ?? null,
          };
        });
    }

    return [];
  }
}

class MockD1 implements D1Database {
  constructor(private readonly data: MockData) {}

  prepare(query: string): D1PreparedStatement {
    return new MockStatement(this.data, query);
  }

  async batch<T = unknown>(): Promise<Array<{ results?: T[] }>> {
    return [];
  }

  async exec(): Promise<{ count: number; duration: number }> {
    return { count: 0, duration: 0 };
  }
}

function createEnv(overrides: Partial<MockData> = {}) {
  const data: MockData = {
    users: [
      { id: 7, nome: 'SDR IA', email: 'sdr@sorria.com', role: 'atendente', ativo: 1 },
      { id: 8, nome: 'Dr Avaliador', email: 'avaliador@sorria.com', role: 'avaliador', ativo: 1 },
      { id: 9, nome: 'Admin', email: 'admin@sorria.com', role: 'admin', ativo: 1 },
      { id: 10, nome: 'Recepção', email: 'recepcao@sorria.com', role: 'atendente', ativo: 1 },
    ],
    userRoles: [
      { usuario_id: 7, role: 'atendente' },
      { usuario_id: 8, role: 'avaliador' },
      { usuario_id: 9, role: 'admin' },
      { usuario_id: 10, role: 'atendente' },
    ],
    userUnits: [
      { usuario_id: 7, unidade_id: 1 },
      { usuario_id: 8, unidade_id: 1 },
      { usuario_id: 9, unidade_id: 1 },
      { usuario_id: 9, unidade_id: 2 },
      { usuario_id: 10, unidade_id: 1 },
    ],
    units: [
      { id: 1, nome: 'Sorria Leste', ativo: 1 },
      { id: 2, nome: 'Sorria Sul', ativo: 1 },
    ],
    clients: [{
      id: 1,
      nome: 'Cliente Existente',
      cpf: '11122233344',
      telefone: '(85) 99999-1234',
      email: 'existente@sorria.com',
      data_nascimento: null,
      endereco: null,
      origem: 'fachada',
      sexo: null,
      plano_odontologico: null,
      observacoes: null,
      created_at: '2026-07-20T10:00:00.000Z',
    }],
    appointments: [],
    nextClientId: 2,
    nextAppointmentId: 20,
    ...overrides,
  };

  const env = {
    DB: new MockD1(data),
    OAUTH_KV: {},
    MCP_ALLOWED_EMAILS: 'admin@sorria.com',
    MCP_WRITE_ALLOWED_EMAILS: 'sdr@sorria.com,admin@sorria.com',
    SDR_API_KEY: 'test-secret-key',
    SDR_DEFAULT_UNIT_ID: '1',
    SDR_CREATED_BY_USER_ID: '7',
    OAUTH_PROVIDER: {},
  } as Env;

  return { env, data };
}

describe('MCP write V1 repository tools', () => {
  it('carrega identidade de escrita com unidades do atendente autorizado', async () => {
    const { env } = createEnv();
    const identity = await getWriteIdentity(env, {
      userId: 7,
      email: 'sdr@sorria.com',
      clientId: 'codex',
      scope: ['sorria.write'],
    });

    expect(identity.role).toBe('atendente');
    expect(identity.unidadeIds).toEqual([1]);
    expect(() => assertUnit(identity, 2)).toThrow('Unidade não autorizada');
  });

  it('cria cliente com normalização e retorno mascarado', async () => {
    const { env, data } = createEnv();
    const created = await createClient(env, {
      nome: '  Ana Teste  ',
      origem: 'trafego_meta',
      telefone: ' (85) 99999-0000 ',
      email: ' ANA@EXAMPLE.COM ',
      cpf: ' 12345678900 ',
      dataNascimento: '1990-01-31',
      endereco: ' Rua A ',
      sexo: 'feminino',
      planoOdontologico: 'Prime',
      observacoes: ' lead vindo do SDR ',
    });

    expect(created).toMatchObject({
      id: 2,
      nome: 'Ana Teste',
      telefone: '***0000',
      email: 'a***@example.com',
      cpf: '***.***.***-00',
      origem: 'trafego_meta',
    });
    expect(data.clients[1]).toMatchObject({
      nome: 'Ana Teste',
      email: 'ana@example.com',
      cpf: '12345678900',
      observacoes: 'lead vindo do SDR',
    });
  });

  it('rejeita cliente inválido ou duplicado', async () => {
    const { env } = createEnv();
    await expect(createClient(env, { nome: ' ', origem: 'fachada' })).rejects.toThrow('Nome é obrigatório');
    await expect(createClient(env, { nome: 'Novo', origem: 'panfleto' })).rejects.toThrow('Origem inválida');
    await expect(createClient(env, { nome: 'Duplicado', origem: 'fachada', cpf: '11122233344' }))
      .rejects.toThrow('CPF já cadastrado');
    await expect(createClient(env, { nome: 'Data Ruim', origem: 'fachada', dataNascimento: '1990-02-31' }))
      .rejects.toThrow('Data inválida');
  });

  it('cria agendamento de avaliação com data local convertida para UTC', async () => {
    const { env, data } = createEnv();
    const appointment = await createEvaluationAppointment(env, {
      unidadeId: 1,
      clienteId: 1,
      dataAgendada: '2099-08-10T14:30',
      executorId: 8,
      criadoPorId: 7,
      observacoes: 'Primeira avaliação',
    });

    expect(appointment).toMatchObject({
      id: 20,
      unidadeId: 1,
      tipo: 'avaliacao',
      status: 'agendado',
      data_agendada: '2099-08-10T17:30:00.000Z',
      cliente: { id: 1, nome: 'Cliente Existente', telefone: '***1234' },
      executor: { id: 8, nome: 'Dr Avaliador' },
      criadoPor: { id: 7, nome: 'SDR IA' },
    });
    expect(data.appointments[0]).toMatchObject({
      cliente_id: 1,
      executor_id: 8,
      criado_por_id: 7,
      tipo: 'avaliacao',
      status: 'agendado',
      unidade_id: 1,
    });
  });

  it('cria avaliação pendente quando não há data', async () => {
    const { env } = createEnv();
    const appointment = await createEvaluationAppointment(env, {
      unidadeId: 1,
      clienteId: 1,
    });

    expect(appointment.status).toBe('pendente');
    expect(appointment.data_agendada).toBeNull();
    expect(appointment.executor).toEqual({ id: 8, nome: 'Dr Avaliador' });
  });

  it('rejeita agendamento inválido', async () => {
    const { env } = createEnv();

    await expect(createEvaluationAppointment(env, { unidadeId: 1, clienteId: 999 }))
      .rejects.toThrow('Cliente não encontrado');
    await expect(createEvaluationAppointment(env, { unidadeId: 1, clienteId: 1, dataAgendada: '2020-01-01T10:00' }))
      .rejects.toThrow('data no passado');
    await expect(createEvaluationAppointment(env, { unidadeId: 1, clienteId: 1, dataAgendada: '2099-02-31T10:00' }))
      .rejects.toThrow('dataAgendada inválida');
    await expect(createEvaluationAppointment(env, { unidadeId: 1, clienteId: 1, executorId: 10 }))
      .rejects.toThrow('role de dentista');
  });

  it('cria lead e avaliação pelo endpoint HTTP com API key', async () => {
    const { env, data } = createEnv();
    const response = await handleSdrApi(new Request('https://mcp.test/api/sdr/lead-avaliacao', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-secret-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nome: 'Lead n8n',
        origem: 'trafego_google',
        telefone: '(85) 98888-7777',
        email: 'lead@n8n.test',
        dataAgendada: '2099-09-10T11:15',
        observacoes: 'captado pelo fluxo',
        observacoesAgendamento: 'confirmado pelo SDR',
      }),
    }), env);

    const payload = await response.json() as {
      ok: boolean;
      cliente: { id: number; telefone: string | null; email: string | null };
      agendamento: {
        id: number;
        unidadeId: number;
        status: string;
        data_agendada: string | null;
        executor: { id: number; nome: string } | null;
        criadoPor: { id: number; nome: string } | null;
      };
    };

    expect(response.status).toBe(201);
    expect(payload.ok).toBe(true);
    expect(payload.cliente).toMatchObject({ id: 2, telefone: '***7777', email: 'l***@n8n.test' });
    expect(payload.agendamento).toMatchObject({
      id: 20,
      unidadeId: 1,
      status: 'agendado',
      data_agendada: '2099-09-10T14:15:00.000Z',
      executor: { id: 8, nome: 'Dr Avaliador' },
      criadoPor: { id: 7, nome: 'SDR IA' },
    });
    expect(data.clients).toHaveLength(2);
    expect(data.clients[1]?.telefone).toBe('(85) 98888-7777');
    expect(data.appointments).toHaveLength(1);
    expect(data.appointments[0]).toMatchObject({
      unidade_id: 1,
      executor_id: 8,
      criado_por_id: 7,
    });
  });

  it('não cria cliente quando o usuário da IA não pertence à unidade solicitada', async () => {
    const { env, data } = createEnv();
    const response = await handleSdrApi(new Request('https://mcp.test/api/sdr/lead-avaliacao', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-secret-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nome: 'Lead de outra unidade',
        origem: 'trafego_meta',
        unidadeId: 2,
      }),
    }), env);
    const payload = await response.json() as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      error: 'Criador não encontrado ou não pertence à unidade informada.',
    });
    expect(data.clients).toHaveLength(1);
    expect(data.appointments).toHaveLength(0);
  });

  it('aceita observações de até 2.000 caracteres no endpoint HTTP', async () => {
    const { env, data } = createEnv();
    const observacoes = 'A'.repeat(2_000);
    const response = await handleSdrApi(new Request('https://mcp.test/api/sdr/lead-avaliacao', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-secret-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nome: 'Lead com resumo longo',
        origem: 'trafego_meta',
        unidadeId: 1,
        observacoes,
      }),
    }), env);

    expect(response.status).toBe(201);
    expect(data.clients[1]?.observacoes).toBe(observacoes);
  });

  it('rejeita observações acima de 2.000 caracteres no endpoint HTTP', async () => {
    const { env } = createEnv();
    const response = await handleSdrApi(new Request('https://mcp.test/api/sdr/lead-avaliacao', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-secret-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nome: 'Lead com resumo grande demais',
        origem: 'trafego_meta',
        unidadeId: 1,
        observacoes: 'A'.repeat(2_001),
      }),
    }), env);
    const payload = await response.json() as {
      ok: boolean;
      issues: Array<{ path: string }>;
    };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.issues).toContainEqual(expect.objectContaining({ path: 'observacoes' }));
  });

  it('bloqueia endpoint HTTP sem API key válida', async () => {
    const { env } = createEnv();
    const response = await handleSdrApi(new Request('https://mcp.test/api/sdr/lead-avaliacao', {
      method: 'POST',
      headers: { 'X-API-Key': 'wrong-key' },
      body: '{}',
    }), env);

    expect(response.status).toBe(401);
  });

  it('retorna 400 para payload inválido do endpoint HTTP', async () => {
    const { env } = createEnv();
    const response = await handleSdrApi(new Request('https://mcp.test/api/sdr/lead-avaliacao', {
      method: 'POST',
      headers: { 'X-API-Key': 'test-secret-key' },
      body: JSON.stringify({ nome: 'Sem origem', unidadeId: 1 }),
    }), env);
    const payload = await response.json() as { ok: boolean; error: string; issues: unknown[] };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe('Dados inválidos.');
    expect(payload.issues.length).toBeGreaterThan(0);
  });

  it('retorna 400 para JSON malformado do endpoint HTTP', async () => {
    const { env } = createEnv();
    const response = await handleSdrApi(new Request('https://mcp.test/api/sdr/lead-avaliacao', {
      method: 'POST',
      headers: { 'X-API-Key': 'test-secret-key' },
      body: '{',
    }), env);

    expect(response.status).toBe(400);
  });
});
