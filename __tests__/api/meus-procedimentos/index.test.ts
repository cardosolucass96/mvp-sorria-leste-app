/**
 * Sprint 9 — Testes de Meus Procedimentos
 *
 * Cobre: GET /api/meus-procedimentos?usuario_id=X
 *   - Requer usuario_id
 *   - Combina procedimentos como avaliador (criado_por_id) + executor (executor_id)
 *   - Ordenação por data mais recente (concluído_at || created_at)
 *   - Retorna dados completos (procedimento_nome, cliente_nome, etc.)
 *   - Resultados vazios
 */

import { callRoute } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
} from '../../helpers/db-mock';

import { GET as getMeusProcedimentos } from '@/app/api/meus-procedimentos/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// Dados de exemplo
const avaliacaoItem = {
  item_id: 1,
  atendimento_id: 4,
  procedimento_nome: 'Restauração',
  cliente_nome: 'Maria Silva',
  dentes: '12,13',
  quantidade: 1,
  status: 'concluido',
  tipo: 'avaliacao',
  created_at: '2024-06-10 09:00:00',
  concluido_at: '2024-06-15 10:00:00',
};

const execucaoItem = {
  item_id: 2,
  atendimento_id: 4,
  procedimento_nome: 'Canal',
  cliente_nome: 'Maria Silva',
  dentes: '36',
  quantidade: 1,
  status: 'executando',
  tipo: 'execucao',
  created_at: '2024-06-10 09:00:00',
  concluido_at: null,
};

const execucaoItemRecente = {
  item_id: 3,
  atendimento_id: 5,
  procedimento_nome: 'Limpeza',
  cliente_nome: 'João Santos',
  dentes: null,
  quantidade: 1,
  status: 'concluido',
  tipo: 'execucao',
  created_at: '2024-06-12 11:00:00',
  concluido_at: '2024-06-18 14:00:00',
};

// =============================================================================
// Validações
// =============================================================================

describe('GET /api/meus-procedimentos — validações', () => {
  it('rejeita sem usuario_id', async () => {
    const { status, data } = await callRoute<{ error: string }>(
      getMeusProcedimentos, '/api/meus-procedimentos'
    );

    expect(status).toBe(400);
    expect(data.error).toBe('usuario_id é obrigatório');
  });

  it('retorna 200 com array vazio quando sem resultados', async () => {
    mockQueryResponse('criado_por_id = ?', []);
    mockQueryResponse('executor_id = ?', []);

    const { status, data } = await callRoute<unknown[]>(
      getMeusProcedimentos, '/api/meus-procedimentos', {
        searchParams: { usuario_id: '3' },
      }
    );

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });
});

// =============================================================================
// Combina avaliações + execuções
// =============================================================================

describe('GET /api/meus-procedimentos — combinação de resultados', () => {
  it('retorna procedimentos de avaliação (criado_por_id)', async () => {
    mockQueryResponse('criado_por_id = ?', [avaliacaoItem]);
    mockQueryResponse('executor_id = ?', []);

    const { data } = await callRoute<Array<typeof avaliacaoItem>>(
      getMeusProcedimentos, '/api/meus-procedimentos', {
        searchParams: { usuario_id: '3' },
      }
    );

    expect(data).toHaveLength(1);
    expect(data[0].tipo).toBe('avaliacao');
    expect(data[0].procedimento_nome).toBe('Restauração');
  });

  it('retorna procedimentos de execução (executor_id)', async () => {
    mockQueryResponse('criado_por_id = ?', []);
    mockQueryResponse('executor_id = ?', [execucaoItem]);

    const { data } = await callRoute<Array<typeof execucaoItem>>(
      getMeusProcedimentos, '/api/meus-procedimentos', {
        searchParams: { usuario_id: '4' },
      }
    );

    expect(data).toHaveLength(1);
    expect(data[0].tipo).toBe('execucao');
    expect(data[0].procedimento_nome).toBe('Canal');
  });

  it('combina ambos quando usuário é avaliador E executor', async () => {
    mockQueryResponse('criado_por_id = ?', [avaliacaoItem]);
    mockQueryResponse('executor_id = ?', [execucaoItem, execucaoItemRecente]);

    const { data } = await callRoute<Array<{ tipo: string; item_id: number }>>(
      getMeusProcedimentos, '/api/meus-procedimentos', {
        searchParams: { usuario_id: '3' },
      }
    );

    expect(data).toHaveLength(3);
    // Deve conter ambos os tipos
    const tipos = data.map(d => d.tipo);
    expect(tipos).toContain('avaliacao');
    expect(tipos).toContain('execucao');
  });
});

// =============================================================================
// Ordenação
// =============================================================================

describe('GET /api/meus-procedimentos — ordenação', () => {
  it('ordena por data mais recente (concluido_at > created_at)', async () => {
    // Item 1: concluido_at = 2024-06-15 (usado para ordenação)
    // Item 2: concluido_at = null, created_at = 2024-06-10 (usa created)
    // Item 3: concluido_at = 2024-06-18 (mais recente)
    mockQueryResponse('criado_por_id = ?', [avaliacaoItem]);
    mockQueryResponse('executor_id = ?', [execucaoItem, execucaoItemRecente]);

    const { data } = await callRoute<Array<{ item_id: number; concluido_at: string | null }>>(
      getMeusProcedimentos, '/api/meus-procedimentos', {
        searchParams: { usuario_id: '3' },
      }
    );

    expect(data).toHaveLength(3);
    // Ordem: item 3 (18/06), item 1 (15/06), item 2 (10/06)
    expect(data[0].item_id).toBe(3); // concluido_at = 2024-06-18
    expect(data[1].item_id).toBe(1); // concluido_at = 2024-06-15
    expect(data[2].item_id).toBe(2); // created_at = 2024-06-10
  });

  it('cada query individual é ordenada por created_at DESC', async () => {
    mockQueryResponse('criado_por_id = ?', []);
    mockQueryResponse('executor_id = ?', []);

    await callRoute(getMeusProcedimentos, '/api/meus-procedimentos', {
      searchParams: { usuario_id: '3' },
    });

    const queries = getExecutedQueries();
    const avaliacaoQuery = queries.find(q => q.sql.includes('criado_por_id = ?'));
    const execucaoQuery = queries.find(q => q.sql.includes('executor_id = ?'));
    expect(avaliacaoQuery!.sql).toContain('ORDER BY ia.created_at DESC');
    expect(execucaoQuery!.sql).toContain('ORDER BY ia.created_at DESC');
  });
});

// =============================================================================
// Dados completos do retorno
// =============================================================================

describe('GET /api/meus-procedimentos — dados completos', () => {
  it('retorna todos os campos necessários para exibição', async () => {
    mockQueryResponse('criado_por_id = ?', [avaliacaoItem]);
    mockQueryResponse('executor_id = ?', []);

    const { data } = await callRoute<Array<Record<string, unknown>>>(
      getMeusProcedimentos, '/api/meus-procedimentos', {
        searchParams: { usuario_id: '3' },
      }
    );

    const item = data[0];
    expect(item).toHaveProperty('item_id');
    expect(item).toHaveProperty('atendimento_id');
    expect(item).toHaveProperty('procedimento_nome');
    expect(item).toHaveProperty('cliente_nome');
    expect(item).toHaveProperty('dentes');
    expect(item).toHaveProperty('quantidade');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('tipo');
    expect(item).toHaveProperty('created_at');
    expect(item).toHaveProperty('concluido_at');
  });

  it('queries usam JOINs corretos (procedimentos, atendimentos, clientes)', async () => {
    mockQueryResponse('criado_por_id = ?', []);
    mockQueryResponse('executor_id = ?', []);

    await callRoute(getMeusProcedimentos, '/api/meus-procedimentos', {
      searchParams: { usuario_id: '3' },
    });

    const queries = getExecutedQueries();
    for (const q of queries) {
      if (q.sql.includes('criado_por_id') || q.sql.includes('executor_id')) {
        expect(q.sql).toContain('JOIN procedimentos p');
        expect(q.sql).toContain('JOIN atendimentos a');
        expect(q.sql).toContain('JOIN clientes c');
      }
    }
  });

  it('avaliação marca tipo como "avaliacao"', async () => {
    mockQueryResponse('criado_por_id = ?', [avaliacaoItem]);
    mockQueryResponse('executor_id = ?', []);

    const { data } = await callRoute<Array<{ tipo: string }>>(
      getMeusProcedimentos, '/api/meus-procedimentos', {
        searchParams: { usuario_id: '3' },
      }
    );

    expect(data[0].tipo).toBe('avaliacao');

    // Verifica que a query seleciona 'avaliacao' como tipo literal
    const queries = getExecutedQueries();
    const avalQuery = queries.find(q => q.sql.includes('criado_por_id'));
    expect(avalQuery!.sql).toContain("'avaliacao' as tipo");
  });

  it('execução marca tipo como "execucao"', async () => {
    mockQueryResponse('criado_por_id = ?', []);
    mockQueryResponse('executor_id = ?', [execucaoItem]);

    const { data } = await callRoute<Array<{ tipo: string }>>(
      getMeusProcedimentos, '/api/meus-procedimentos', {
        searchParams: { usuario_id: '3' },
      }
    );

    expect(data[0].tipo).toBe('execucao');

    const queries = getExecutedQueries();
    const execQuery = queries.find(q => q.sql.includes('executor_id'));
    expect(execQuery!.sql).toContain("'execucao' as tipo");
  });

  it('dentes pode ser null (para procedimentos não-dentários)', async () => {
    const itemSemDentes = { ...execucaoItemRecente, dentes: null };
    mockQueryResponse('criado_por_id = ?', []);
    mockQueryResponse('executor_id = ?', [itemSemDentes]);

    const { data } = await callRoute<Array<{ dentes: string | null }>>(
      getMeusProcedimentos, '/api/meus-procedimentos', {
        searchParams: { usuario_id: '4' },
      }
    );

    expect(data[0].dentes).toBeNull();
  });
});
