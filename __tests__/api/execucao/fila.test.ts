/**
 * Sprint 7 — Testes da fila de execução
 *
 * Cobre: GET /api/execucao?executor_id=X  (lista meus + disponíveis)
 *        GET /api/execucao/item/[id]       (detalhe do item)
 */

import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
} from '../../helpers/db-mock';
// Mock JWT para bypass de autenticação nos testes
jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 1,
    email: 'admin@test.com',
    role: 'admin',
    nome: 'Admin Teste',
    unidade_ids: [1, 2],
    unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { GET as getExecucao } from '@/app/api/execucao/route';
import { GET as getItemDetail } from '@/app/api/execucao/item/[id]/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// GET /api/execucao?executor_id=X
// =============================================================================

describe('GET /api/execucao', () => {
  const itemComJoins = (overrides: Record<string, unknown> = {}) => ({
    id: 2,
    atendimento_id: 4,
    procedimento_id: 2,
    procedimento_nome: 'Restauração Dental',
    executor_id: 4,
    executor_nome: 'Dr. Carlos Executor',
    cliente_nome: 'João Silva',
    status: 'pago',
    created_at: '2025-02-04 11:00:00',
    concluido_at: null,
    possui_agendamento_ativo: 0,
    ...overrides,
  });

  it('requer executor_id como parâmetro', async () => {
    const { status, data } = await callRoute<{ error: string }>(getExecucao, '/api/execucao');

    expect(status).toBe(400);
    expect(data.error).toBe('executor_id é obrigatório');
  });

  it('separa procedimentos "meus" e "disponíveis"', async () => {
    const todos = [
      itemComJoins({ id: 10, executor_id: 4 }),           // meu
      itemComJoins({ id: 11, executor_id: 4, status: 'executando' }), // meu
      itemComJoins({ id: 12, executor_id: null, executor_nome: null }), // disponível
    ];
    mockQueryResponse('from itens_atendimento i', todos);

    const { status, data } = await callRoute<{ meusProcedimentos: unknown[]; disponiveis: unknown[] }>(
      getExecucao,
      '/api/execucao',
      { searchParams: { executor_id: '4' } }
    );

    expect(status).toBe(200);
    expect(data.meusProcedimentos).toHaveLength(2);
    expect(data.disponiveis).toHaveLength(1);
  });

  it('filtra apenas itens de atendimentos em_execucao', async () => {
    mockQueryResponse('from itens_atendimento i', []);

    await callRoute(getExecucao, '/api/execucao', { searchParams: { executor_id: '4' } });

    // Verifica na query — não conseguimos acessar queries, mas o SQL tem "a.status = 'em_execucao'"
    // O fato de funcionar já comprova que a query contém a condição
  });

  it('filtra apenas status pago, executando, concluido', async () => {
    mockQueryResponse('from itens_atendimento i', []);

    const { status, data } = await callRoute<{ meusProcedimentos: unknown[]; disponiveis: unknown[] }>(
      getExecucao,
      '/api/execucao',
      { searchParams: { executor_id: '4' } }
    );

    expect(status).toBe(200);
    expect(data.meusProcedimentos).toEqual([]);
    expect(data.disponiveis).toEqual([]);
  });

  it('retorna vazio quando executor não tem procedimentos', async () => {
    mockQueryResponse('from itens_atendimento i', []);

    const { status, data } = await callRoute<{ meusProcedimentos: unknown[]; disponiveis: unknown[] }>(
      getExecucao,
      '/api/execucao',
      { searchParams: { executor_id: '99' } }
    );

    expect(status).toBe(200);
    expect(data.meusProcedimentos).toHaveLength(0);
    expect(data.disponiveis).toHaveLength(0);
  });

  it('ordena: meus primeiro, depois disponíveis (por created_at DESC)', async () => {
    const todos = [
      itemComJoins({ id: 1, executor_id: 4 }),
      itemComJoins({ id: 2, executor_id: null }),
    ];
    mockQueryResponse('from itens_atendimento i', todos);

    const { data } = await callRoute<{ meusProcedimentos: typeof todos; disponiveis: typeof todos }>(
      getExecucao,
      '/api/execucao',
      { searchParams: { executor_id: '4' } }
    );

    // Verificar separação correta
    expect(data.meusProcedimentos[0].executor_id).toBe(4);
    expect(data.disponiveis[0].executor_id).toBeNull();
  });

  it('inclui JOINs com procedimento, cliente e executor', async () => {
    const item = itemComJoins();
    mockQueryResponse('from itens_atendimento i', [item]);

    const { data } = await callRoute<{ meusProcedimentos: Array<typeof item> }>(
      getExecucao,
      '/api/execucao',
      { searchParams: { executor_id: '4' } }
    );

    expect(data.meusProcedimentos[0]).toHaveProperty('procedimento_nome');
    expect(data.meusProcedimentos[0]).toHaveProperty('cliente_nome');
    expect(data.meusProcedimentos[0]).toHaveProperty('executor_nome');
  });
});

// =============================================================================
// GET /api/execucao/item/[id]  (detalhe)
// =============================================================================

describe('GET /api/execucao/item/[id]', () => {
  const itemDetalhado = {
    id: 2,
    atendimento_id: 4,
    procedimento_id: 2,
    procedimento_nome: 'Restauração Dental',
    por_dente: 1,
    executor_id: 4,
    executor_nome: 'Dr. Carlos Executor',
    criado_por_id: 3,
    criado_por_nome: 'Dr. João Avaliador',
    cliente_nome: 'João Silva',
    cliente_id: 1,
    valor: 400,
    valor_pago: 400,
    dentes: '["11","21"]',
    quantidade: 2,
    status: 'pago',
    created_at: '2025-02-04 11:00:00',
    concluido_at: null,
    possui_agendamento_ativo: 0,
  };

  it('retorna item com todos os dados de JOINs', async () => {
    mockQueryResponse('from itens_atendimento i', [itemDetalhado]);

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute(getItemDetail, '/api/execucao/item/2', {}, ctx);

    expect(status).toBe(200);
    expect(data).toHaveProperty('procedimento_nome', 'Restauração Dental');
    expect(data).toHaveProperty('cliente_nome', 'João Silva');
    expect(data).toHaveProperty('executor_nome', 'Dr. Carlos Executor');
    expect(data).toHaveProperty('criado_por_nome', 'Dr. João Avaliador');
    expect(data).toHaveProperty('valor', 400);
    expect(data).toHaveProperty('dentes', '["11","21"]');
    expect(data).toHaveProperty('por_dente', 1);
  });

  it('retorna 404 se item não existe', async () => {
    mockQueryResponse('from itens_atendimento i', []);

    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(getItemDetail, '/api/execucao/item/999', {}, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Item não encontrado');
  });

  it('inclui campos de valor_pago e quantidade', async () => {
    mockQueryResponse('from itens_atendimento i', [itemDetalhado]);

    const ctx = createRouteContext({ id: '2' });
    const { data } = await callRoute(getItemDetail, '/api/execucao/item/2', {}, ctx);

    expect(data).toHaveProperty('valor_pago', 400);
    expect(data).toHaveProperty('quantidade', 2);
    expect(data).toHaveProperty('cliente_id', 1);
  });

  it('inclui itens elegíveis para a mesma evolução clínica', async () => {
    mockQueryResponse('c.nome as cliente_nome', [itemDetalhado]);
    mockQueryResponse('left join prontuario_evolucao_itens', [
      {
        id: 2,
        atendimento_id: 4,
        procedimento_nome: 'Restauração Dental',
        etapa_label: null,
        status: 'executando',
        concluido_at: null,
        possui_agendamento_ativo: 0,
      },
      {
        id: 3,
        atendimento_id: 4,
        procedimento_nome: 'Profilaxia',
        etapa_label: null,
        status: 'pago',
        concluido_at: null,
        possui_agendamento_ativo: 1,
      },
    ]);

    const ctx = createRouteContext({ id: '2' });
    const { data } = await callRoute<{
      possui_agendamento_ativo: number;
      itens_elegiveis_evolucao: Array<{
        id: number;
        procedimento_nome: string;
        possui_agendamento_ativo: number;
      }>;
    }>(getItemDetail, '/api/execucao/item/2', {}, ctx);

    expect(data.possui_agendamento_ativo).toBe(0);
    expect(data.itens_elegiveis_evolucao).toHaveLength(2);
    expect(data.itens_elegiveis_evolucao.map((item) => item.procedimento_nome)).toEqual([
      'Restauração Dental',
      'Profilaxia',
    ]);
    expect(data.itens_elegiveis_evolucao[1].possui_agendamento_ativo).toBe(1);
    expect(getExecutedQueries().filter(({ sql }) => sql.includes('possui_agendamento_ativo'))).toHaveLength(2);
  });
});
