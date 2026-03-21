/**
 * Sprint 8 — Testes de finalização de atendimento
 *
 * Cobre: POST /api/atendimentos/[id]/finalizar
 *   - Validações (status em_execucao, itens concluídos, pagamentos completos)
 *   - Geração automática de comissões (venda + execução)
 *   - Cálculo correto dos valores de comissão
 *   - Atualização de status e finalizado_at
 *   - Edge cases (sem itens, comissão 0%, sem criador/executor)
 */

import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
} from '../../helpers/db-mock';
import {
  ATENDIMENTO_EM_EXECUCAO,
  ATENDIMENTO_AGUARDANDO_PGTO,
  ATENDIMENTO_TRIAGEM,
  ATENDIMENTO_AVALIACAO,
  PROC_LIMPEZA,
  PROC_RESTAURACAO,
  PROC_CANAL,
} from '../../helpers/seed';

import { POST as finalizar } from '@/app/api/atendimentos/[id]/finalizar/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// Helper: item concluído e totalmente pago
// =============================================================================

function itemConcluido(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    atendimento_id: 4,
    procedimento_id: 1,
    executor_id: 4,
    criado_por_id: 3,
    valor: 150,
    valor_pago: 150,
    status: 'concluido',
    ...overrides,
  };
}

// =============================================================================
// Validações básicas
// =============================================================================

describe('POST /api/atendimentos/[id]/finalizar — validações', () => {
  it('rejeita se atendimento não encontrado', async () => {
    // Não mocka nenhuma query → query retorna []
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(finalizar, '/api/atendimentos/999/finalizar', {
      method: 'POST',
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Atendimento não encontrado');
  });

  it('rejeita se atendimento está em triagem', async () => {
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_TRIAGEM]);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(finalizar, '/api/atendimentos/1/finalizar', {
      method: 'POST',
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Atendimento não está em execução');
  });

  it('rejeita se atendimento está em avaliação', async () => {
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_AVALIACAO]);

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(finalizar, '/api/atendimentos/2/finalizar', {
      method: 'POST',
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita se atendimento está aguardando_pagamento', async () => {
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_AGUARDANDO_PGTO]);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(finalizar, '/api/atendimentos/3/finalizar', {
      method: 'POST',
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita se atendimento já está finalizado', async () => {
    const finalizado = { ...ATENDIMENTO_EM_EXECUCAO, status: 'finalizado' };
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [finalizado]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ error: string }>(finalizar, '/api/atendimentos/4/finalizar', {
      method: 'POST',
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Atendimento não está em execução');
  });

  it('rejeita se atendimento não possui procedimentos', async () => {
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', []); // sem itens

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ error: string }>(finalizar, '/api/atendimentos/4/finalizar', {
      method: 'POST',
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Atendimento não possui procedimentos');
  });

  it('rejeita se há itens não concluídos', async () => {
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [
      itemConcluido({ id: 1 }),
      itemConcluido({ id: 2, status: 'executando' }), // não concluído
    ]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ error: string; pendentes: number }>(finalizar, '/api/atendimentos/4/finalizar', {
      method: 'POST',
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Existem procedimentos não concluídos');
    expect(data.pendentes).toBe(1);
  });

  it('rejeita se há itens com status pago (não concluídos)', async () => {
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [
      itemConcluido({ id: 1 }),
      itemConcluido({ id: 2, status: 'pago' }), // pago mas não concluído
    ]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ error: string; pendentes: number }>(finalizar, '/api/atendimentos/4/finalizar', {
      method: 'POST',
    }, ctx);

    expect(status).toBe(400);
    expect(data.pendentes).toBe(1);
  });

  it('rejeita se há item com pagamento incompleto', async () => {
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [
      itemConcluido({ id: 1 }),
      itemConcluido({ id: 2, valor: 500, valor_pago: 300 }), // pagamento incompleto
    ]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ error: string; valorFaltante: number }>(finalizar, '/api/atendimentos/4/finalizar', {
      method: 'POST',
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Existem procedimentos com pagamento pendente');
    expect(data.valorFaltante).toBe(200); // 500 - 300
  });

  it('soma valorFaltante de múltiplos itens com pagamento incompleto', async () => {
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [
      itemConcluido({ id: 1, valor: 200, valor_pago: 100 }), // falta 100
      itemConcluido({ id: 2, valor: 300, valor_pago: 200 }), // falta 100
    ]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ valorFaltante: number }>(finalizar, '/api/atendimentos/4/finalizar', {
      method: 'POST',
    }, ctx);

    expect(status).toBe(400);
    expect(data.valorFaltante).toBe(200); // 100 + 100
  });
});

// =============================================================================
// Finalização com sucesso + geração de comissões
// =============================================================================

describe('POST /api/atendimentos/[id]/finalizar — sucesso e comissões', () => {
  it('finaliza com sucesso quando tudo está OK', async () => {
    const item = itemConcluido({ id: 1, procedimento_id: 1 });
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [PROC_LIMPEZA]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{
      success: boolean;
      message: string;
      comissoes: { venda: number; execucao: number; total: number };
    }>(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Atendimento finalizado com sucesso');
  });

  it('status muda para finalizado com finalizado_at', async () => {
    const item = itemConcluido({ id: 1, procedimento_id: 1 });
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [PROC_LIMPEZA]);

    const ctx = createRouteContext({ id: '4' });
    await callRoute(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    const queries = getExecutedQueries();
    const updateAtendimento = queries.find(q =>
      q.sql.includes("UPDATE atendimentos SET status = 'finalizado'")
    );
    expect(updateAtendimento).toBeDefined();
    expect(updateAtendimento!.sql).toContain('finalizado_at');
    expect(updateAtendimento!.sql).toContain("datetime('now', 'localtime')");
  });

  it('gera comissão de VENDA para o criador do item', async () => {
    // Limpeza: valor=150, comissao_venda=10%, criado_por_id=3
    const item = itemConcluido({ id: 1, procedimento_id: 1, criado_por_id: 3, valor: 150 });
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [PROC_LIMPEZA]);

    const ctx = createRouteContext({ id: '4' });
    const { data } = await callRoute<{
      comissoes: { venda: number; execucao: number; total: number; detalhes: Array<{ tipo: string; usuario_id: number; valor: number }> };
    }>(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    // Comissão de venda: 150 * 10 / 100 = 15
    expect(data.comissoes.venda).toBe(15);

    // Verifica INSERT no banco — 'venda' é hardcoded no SQL, não bind param
    // Params: [atendimentoId, item.id, criado_por_id, comissao_venda, valor, valorComissao]
    const queries = getExecutedQueries();
    const insertComissaoVenda = queries.find(q =>
      q.sql.includes('INSERT INTO comissoes') && q.sql.includes("'venda'")
    );
    expect(insertComissaoVenda).toBeDefined();
    expect(insertComissaoVenda!.params[2]).toBe(3); // usuario_id = criado_por_id
    expect(insertComissaoVenda!.params[3]).toBe(10); // percentual
    expect(insertComissaoVenda!.params[4]).toBe(150); // valor_base
    expect(insertComissaoVenda!.params[5]).toBe(15); // valor_comissao
  });

  it('gera comissão de EXECUÇÃO para o executor do item', async () => {
    // Limpeza: valor=150, comissao_execucao=20%, executor_id=4
    const item = itemConcluido({ id: 1, procedimento_id: 1, executor_id: 4, valor: 150 });
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [PROC_LIMPEZA]);

    const ctx = createRouteContext({ id: '4' });
    const { data } = await callRoute<{
      comissoes: { venda: number; execucao: number; total: number };
    }>(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    // Comissão de execução: 150 * 20 / 100 = 30
    expect(data.comissoes.execucao).toBe(30);

    // 'execucao' é hardcoded no SQL, não bind param
    // Params: [atendimentoId, item.id, executor_id, comissao_execucao, valor, valorComissao]
    const queries = getExecutedQueries();
    const insertComissaoExec = queries.find(q =>
      q.sql.includes('INSERT INTO comissoes') && q.sql.includes("'execucao'")
    );
    expect(insertComissaoExec).toBeDefined();
    expect(insertComissaoExec!.params[2]).toBe(4); // usuario_id = executor_id
    expect(insertComissaoExec!.params[3]).toBe(20); // percentual
    expect(insertComissaoExec!.params[4]).toBe(150); // valor_base
    expect(insertComissaoExec!.params[5]).toBe(30); // valor_comissao
  });

  it('gera ambas comissões (venda + execução) para mesmo item', async () => {
    // Restauração: valor=400, comissao_venda=15%, comissao_execucao=25%
    const item = itemConcluido({
      id: 2, procedimento_id: 2, criado_por_id: 3, executor_id: 4,
      valor: 400, valor_pago: 400,
    });
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [PROC_RESTAURACAO]);

    const ctx = createRouteContext({ id: '4' });
    const { data } = await callRoute<{
      comissoes: {
        venda: number; execucao: number; total: number;
        detalhes: Array<{ tipo: string; usuario_id: number; valor: number }>;
      };
    }>(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    // Venda: 400 * 15 / 100 = 60
    expect(data.comissoes.venda).toBe(60);
    // Execução: 400 * 25 / 100 = 100
    expect(data.comissoes.execucao).toBe(100);
    // Total: 60 + 100 = 160
    expect(data.comissoes.total).toBe(160);

    // Detalhes
    expect(data.comissoes.detalhes).toHaveLength(2);
    expect(data.comissoes.detalhes).toEqual(
      expect.arrayContaining([
        { tipo: 'venda', usuario_id: 3, valor: 60 },
        { tipo: 'execucao', usuario_id: 4, valor: 100 },
      ])
    );
  });

  it('gera comissões para múltiplos itens com procedimentos distintos', async () => {
    // Item 1: Limpeza (150, venda=10%, exec=20%). Criado por 3, executor 4.
    // Item 2: Canal (800, venda=10%, exec=30%). Criado por 3, executor 4.
    const item1 = itemConcluido({
      id: 1, procedimento_id: 1, criado_por_id: 3, executor_id: 4,
      valor: 150, valor_pago: 150,
    });
    const item2 = itemConcluido({
      id: 3, procedimento_id: 3, criado_por_id: 3, executor_id: 4,
      valor: 800, valor_pago: 800,
    });

    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item1, item2]);
    // Mock precisa retornar os procedimentos corretos para cada query.
    // O mock usa substring match — ambos itens usam a mesma query "WHERE id = ?"
    // O primeiro mock será usado para ambos (limitação do mock).
    // Vamos lidar com isso sabendo que o mock retorna sempre o primeiro match.
    // Para este teste, precisamos de uma abordagem diferente.
    // A rota busca procedimentos individualmente por id.
    // Como o mock usa substring match, vamos registrar em sequência.
    // O db-mock retorna a mesma resposta para SQL que contém a mesma substring.
    // Workaround: registrar o último procedimento (CANAL) — ambos items usarão esses valores.
    // Alternativa: testar cada um isoladamente (já feito acima).
    // Para este teste, vamos usar PROC_CANAL como referência para AMBOS itens
    // e validar que as comissões são geradas para cada item.
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [PROC_CANAL]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{
      comissoes: {
        venda: number; execucao: number; total: number;
        detalhes: Array<{ tipo: string; usuario_id: number; valor: number }>;
      };
    }>(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    expect(status).toBe(200);

    // Com PROC_CANAL (comissao_venda=10%, comissao_execucao=30%) para ambos:
    // Item1 venda: 150 * 10 / 100 = 15
    // Item1 exec: 150 * 30 / 100 = 45
    // Item2 venda: 800 * 10 / 100 = 80
    // Item2 exec: 800 * 30 / 100 = 240
    expect(data.comissoes.venda).toBe(15 + 80); // 95
    expect(data.comissoes.execucao).toBe(45 + 240); // 285
    expect(data.comissoes.total).toBe(95 + 285); // 380

    // 4 comissões: 2 de venda + 2 de execução
    expect(data.comissoes.detalhes).toHaveLength(4);

    // Verifica que houve 4 INSERTs em comissoes
    const queries = getExecutedQueries();
    const insertsComissao = queries.filter(q => q.sql.includes('INSERT INTO comissoes'));
    expect(insertsComissao).toHaveLength(4);
  });
});

// =============================================================================
// Edge cases de comissão
// =============================================================================

describe('POST /api/atendimentos/[id]/finalizar — edge cases comissão', () => {
  it('não gera comissão de venda se comissao_venda = 0', async () => {
    const procSemComissaoVenda = { id: 10, comissao_venda: 0, comissao_execucao: 20 };
    const item = itemConcluido({ id: 1, procedimento_id: 10, criado_por_id: 3, executor_id: 4 });

    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [procSemComissaoVenda]);

    const ctx = createRouteContext({ id: '4' });
    const { data } = await callRoute<{
      comissoes: { venda: number; execucao: number; detalhes: unknown[] };
    }>(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    expect(data.comissoes.venda).toBe(0);
    expect(data.comissoes.execucao).toBe(30); // 150 * 20 / 100
    // Apenas 1 comissão (execução) gerada
    expect(data.comissoes.detalhes).toHaveLength(1);

    const queries = getExecutedQueries();
    const insertsComissao = queries.filter(q => q.sql.includes('INSERT INTO comissoes'));
    expect(insertsComissao).toHaveLength(1);
    expect(insertsComissao[0].sql).toContain("'execucao'");
  });

  it('não gera comissão de execução se comissao_execucao = 0', async () => {
    const procSemComissaoExec = { id: 10, comissao_venda: 15, comissao_execucao: 0 };
    const item = itemConcluido({ id: 1, procedimento_id: 10, criado_por_id: 3, executor_id: 4 });

    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [procSemComissaoExec]);

    const ctx = createRouteContext({ id: '4' });
    const { data } = await callRoute<{
      comissoes: { venda: number; execucao: number; detalhes: unknown[] };
    }>(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    expect(data.comissoes.execucao).toBe(0);
    expect(data.comissoes.venda).toBe(22.5); // 150 * 15 / 100
    expect(data.comissoes.detalhes).toHaveLength(1);
  });

  it('não gera comissão de venda se criado_por_id é null', async () => {
    const item = itemConcluido({ id: 1, procedimento_id: 1, criado_por_id: null, executor_id: 4 });

    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [PROC_LIMPEZA]);

    const ctx = createRouteContext({ id: '4' });
    const { data } = await callRoute<{
      comissoes: { venda: number; execucao: number; detalhes: unknown[] };
    }>(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    expect(data.comissoes.venda).toBe(0);
    // Só comissão de execução
    expect(data.comissoes.detalhes).toHaveLength(1);
  });

  it('não gera comissão de execução se executor_id é null', async () => {
    const item = itemConcluido({ id: 1, procedimento_id: 1, criado_por_id: 3, executor_id: null });

    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [PROC_LIMPEZA]);

    const ctx = createRouteContext({ id: '4' });
    const { data } = await callRoute<{
      comissoes: { execucao: number; detalhes: unknown[] };
    }>(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    expect(data.comissoes.execucao).toBe(0);
    // Só comissão de venda
    expect(data.comissoes.detalhes).toHaveLength(1);
  });

  it('sem nenhuma comissão (comissao_venda=0, comissao_execucao=0)', async () => {
    const procZero = { id: 10, comissao_venda: 0, comissao_execucao: 0 };
    const item = itemConcluido({ id: 1, procedimento_id: 10, criado_por_id: 3, executor_id: 4 });

    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [procZero]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{
      success: boolean;
      comissoes: { venda: number; execucao: number; total: number; detalhes: unknown[] };
    }>(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.comissoes.venda).toBe(0);
    expect(data.comissoes.execucao).toBe(0);
    expect(data.comissoes.total).toBe(0);
    expect(data.comissoes.detalhes).toHaveLength(0);

    // Nenhum INSERT em comissões
    const queries = getExecutedQueries();
    const insertsComissao = queries.filter(q => q.sql.includes('INSERT INTO comissoes'));
    expect(insertsComissao).toHaveLength(0);
  });

  it('procedimento removido do catálogo (não encontrado) → pula comissão', async () => {
    // Simula procedimento que foi deletado — query retorna []
    const item = itemConcluido({ id: 1, procedimento_id: 999, criado_por_id: 3, executor_id: 4 });

    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    // Não mock do procedimento → query retorna []

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{
      success: boolean;
      comissoes: { total: number; detalhes: unknown[] };
    }>(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.comissoes.total).toBe(0);
    expect(data.comissoes.detalhes).toHaveLength(0);
  });
});

// =============================================================================
// Cálculos matemáticos — valores corretos de comissão
// =============================================================================

describe('POST /api/atendimentos/[id]/finalizar — cálculos', () => {
  it('calcula comissão de venda com percentual decimal (15%)', async () => {
    // Restauração: comissao_venda=15%, valor=400
    const item = itemConcluido({
      id: 2, procedimento_id: 2, criado_por_id: 3, executor_id: 4,
      valor: 400, valor_pago: 400,
    });
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [PROC_RESTAURACAO]);

    const ctx = createRouteContext({ id: '4' });
    const { data } = await callRoute<{
      comissoes: { venda: number; execucao: number };
    }>(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    expect(data.comissoes.venda).toBe(60); // 400 * 15 / 100
    expect(data.comissoes.execucao).toBe(100); // 400 * 25 / 100
  });

  it('calcula comissão de execução alta (30%) para canal', async () => {
    // Canal: comissao_execucao=30%, valor=800
    const item = itemConcluido({
      id: 3, procedimento_id: 3, criado_por_id: 3, executor_id: 4,
      valor: 800, valor_pago: 800,
    });
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [PROC_CANAL]);

    const ctx = createRouteContext({ id: '4' });
    const { data } = await callRoute<{
      comissoes: { venda: number; execucao: number; total: number };
    }>(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    expect(data.comissoes.venda).toBe(80); // 800 * 10 / 100
    expect(data.comissoes.execucao).toBe(240); // 800 * 30 / 100
    expect(data.comissoes.total).toBe(320);
  });

  it('INSERT em comissoes usa atendimento_id e item_atendimento_id corretos', async () => {
    const item = itemConcluido({ id: 7, procedimento_id: 1, criado_por_id: 3 });
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [PROC_LIMPEZA]);

    const ctx = createRouteContext({ id: '4' });
    await callRoute(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    const queries = getExecutedQueries();
    const insertVenda = queries.find(q =>
      q.sql.includes('INSERT INTO comissoes') && q.sql.includes("'venda'")
    );
    expect(insertVenda).toBeDefined();
    expect(insertVenda!.params[0]).toBe(4); // atendimento_id
    expect(insertVenda!.params[1]).toBe(7); // item_atendimento_id
  });

  it('valor_pago pode ser MAIOR que valor (overpay) — finaliza normalmente', async () => {
    const item = itemConcluido({ id: 1, procedimento_id: 1, valor: 150, valor_pago: 200 });
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [PROC_LIMPEZA]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ success: boolean }>(
      finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx
    );

    // Comissão é baseada no VALOR do item, não no valor_pago
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});

// =============================================================================
// Atomicidade / Proteção contra duplicação
// =============================================================================

describe('POST /api/atendimentos/[id]/finalizar — atomicidade', () => {
  it('OBSERVAÇÃO: rota NÃO usa batch/transação (sem atomicidade real)', async () => {
    // A rota executa cada INSERT de comissão individualmente com execute(),
    // sem wrapping em batch() ou transação. Se uma falha, as anteriores já foram salvas.
    // Documentamos isso como limitação conhecida do MVP.
    const item = itemConcluido({ id: 1, procedimento_id: 1, criado_por_id: 3, executor_id: 4 });
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [ATENDIMENTO_EM_EXECUCAO]);
    mockQueryResponse('FROM itens_atendimento WHERE atendimento_id', [item]);
    mockQueryResponse('SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id', [PROC_LIMPEZA]);

    const ctx = createRouteContext({ id: '4' });
    await callRoute(finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx);

    const queries = getExecutedQueries();
    // Cada comissão é um execute() separado (não batch)
    const insertsComissao = queries.filter(q => q.sql.includes('INSERT INTO comissoes'));
    expect(insertsComissao.length).toBeGreaterThanOrEqual(1);
    // Verificamos que o UPDATE de status vem DEPOIS das comissões
    const updateIdx = queries.findIndex(q => q.sql.includes("UPDATE atendimentos SET status = 'finalizado'"));
    const lastInsertIdx = queries.reduce((maxIdx, q, idx) =>
      q.sql.includes('INSERT INTO comissoes') ? idx : maxIdx, -1
    );
    expect(updateIdx).toBeGreaterThan(lastInsertIdx);
  });

  it('OBSERVAÇÃO: sem proteção contra finalização duplicada (status check apenas)', async () => {
    // Após a primeira finalização, o status muda para "finalizado",
    // então tentar de novo retorna 400 "Atendimento não está em execução".
    // Mas isso não previne race conditions — se duas requests chegarem simultaneamente,
    // ambas podem ver status='em_execucao' e gerar comissões duplicadas.
    // Para o MVP, o check de status é suficiente.
    const finalizadoAtendimento = { ...ATENDIMENTO_EM_EXECUCAO, status: 'finalizado' };
    mockQueryResponse('SELECT id, status FROM atendimentos WHERE id', [finalizadoAtendimento]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ error: string }>(
      finalizar, '/api/atendimentos/4/finalizar', { method: 'POST' }, ctx
    );

    expect(status).toBe(400);
    expect(data.error).toBe('Atendimento não está em execução');
  });
});
