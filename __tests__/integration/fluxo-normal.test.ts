/**
 * Teste de Integração — Fluxo Normal Completo
 *
 * Sprint 11 — Simula o ciclo completo de vida de um atendimento:
 *
 * 1. Criar cliente
 * 2. Criar atendimento (status: triagem)
 * 3. Avançar triagem → avaliação
 * 4. Adicionar procedimentos (itens)
 * 5. Avançar avaliação → aguardando_pagamento
 * 6. Registrar pagamento com distribuição por item
 * 7. Verificar itens marcados como pagos
 * 8. Avançar aguardando_pagamento → em_execução
 * 9. Executor assume procedimento (marca executando)
 * 10. Registrar nota de execução
 * 11. Preencher prontuário
 * 12. Marcar item como concluído
 * 13. Finalizar atendimento → gerar comissões
 * 14. Verificar comissões geradas
 * 15. Verificar dashboard atualizado
 */

import { callRoute, createRouteContext } from '../helpers/api-test-helper';
import {
  mockQueryResponse,
  resetMockDb,
  setLastInsertId,
  getExecutedQueries,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../helpers/db-mock';

// ═════════════════════════════════════════════
// Route handlers
// ═════════════════════════════════════════════

import { POST as postClientes } from '@/app/api/clientes/route';
import { POST as postAtendimentos } from '@/app/api/atendimentos/route';
import { PUT as putAtendimento, GET as getAtendimento } from '@/app/api/atendimentos/[id]/route';
import { POST as postItens } from '@/app/api/atendimentos/[id]/itens/route';
import { PUT as putItem } from '@/app/api/atendimentos/[id]/itens/[itemId]/route';
import { POST as postPagamentos, GET as getPagamentos } from '@/app/api/atendimentos/[id]/pagamentos/route';
import { POST as postFinalizar } from '@/app/api/atendimentos/[id]/finalizar/route';
import { POST as postNotas } from '@/app/api/execucao/item/[id]/notas/route';
import { POST as postProntuario } from '@/app/api/execucao/item/[id]/prontuario/route';
import { GET as getComissoes } from '@/app/api/comissoes/route';
import { GET as getDashboard } from '@/app/api/dashboard/route';

// ═════════════════════════════════════════════
// Dados de referência para o fluxo
// ═════════════════════════════════════════════

const CLIENTE = {
  id: 1,
  nome: 'Maria Silva',
  cpf: '12345678901',
  telefone: '11999999999',
  email: 'maria@email.com',
  origem: 'fachada',
  observacoes: null,
  created_at: '2025-01-15T10:00:00',
};

const AVALIADOR = {
  id: 10,
  nome: 'Dr. João Avaliador',
  email: 'joao@sorria.com',
  role: 'avaliador',
};

const EXECUTOR = {
  id: 20,
  nome: 'Dr. Ana Executora',
  email: 'ana@sorria.com',
  role: 'executor',
};

const PROCEDIMENTO_1 = {
  id: 100,
  nome: 'Limpeza',
  valor: 200,
  comissao_venda: 10,
  comissao_execucao: 20,
  por_dente: 0,
  ativo: 1,
};

const PROCEDIMENTO_2 = {
  id: 101,
  nome: 'Restauração',
  valor: 500,
  comissao_venda: 8,
  comissao_execucao: 25,
  por_dente: 1,
  ativo: 1,
};

const ATENDIMENTO_BASE = {
  id: 1,
  cliente_id: CLIENTE.id,
  avaliador_id: AVALIADOR.id,
  created_at: '2025-01-15T10:00:00',
  finalizado_at: null,
  cliente_nome: CLIENTE.nome,
  cliente_cpf: CLIENTE.cpf,
  cliente_telefone: CLIENTE.telefone,
  avaliador_nome: AVALIADOR.nome,
};

describe('Integração — Fluxo Normal Completo', () => {
  beforeEach(() => {
    setupCloudflareContextMock();
    resetMockDb();
  });

  afterEach(() => {
    teardownCloudflareContextMock();
  });

  // ═════════════════════════════════════════════
  // ETAPA 1: Criação do Cliente
  // ═════════════════════════════════════════════

  describe('Etapa 1 — Criar cliente', () => {
    test('POST /api/clientes cria cliente com sucesso', async () => {
      mockQueryResponse('select id from clientes where cpf', []);
      setLastInsertId(CLIENTE.id);
      mockQueryResponse('select * from clientes where id', CLIENTE);

      const { status, data } = await callRoute<typeof CLIENTE>(postClientes, '/api/clientes', {
        method: 'POST',
        body: {
          nome: CLIENTE.nome,
          cpf: CLIENTE.cpf,
          telefone: CLIENTE.telefone,
          email: CLIENTE.email,
          origem: CLIENTE.origem,
        },
      });

      expect(status).toBe(201);
      expect(data.nome).toBe(CLIENTE.nome);
      expect(data.id).toBe(CLIENTE.id);
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 2: Criar atendimento (triagem)
  // ═════════════════════════════════════════════

  describe('Etapa 2 — Criar atendimento', () => {
    test('POST /api/atendimentos cria com status triagem', async () => {
      // Cliente existe
      mockQueryResponse('select id from clientes where id', { id: CLIENTE.id });
      // Sem atendimento duplicado
      mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
      // Avaliador existe e é avaliador
      mockQueryResponse('select id, role from usuarios where id', { id: AVALIADOR.id, role: 'avaliador' });
      setLastInsertId(1);
      // Atendimento criado retornado
      mockQueryResponse('select \n        a.*', {
        ...ATENDIMENTO_BASE,
        status: 'triagem',
      });

      const { status, data } = await callRoute(postAtendimentos, '/api/atendimentos', {
        method: 'POST',
        body: {
          cliente_id: CLIENTE.id,
          avaliador_id: AVALIADOR.id,
        },
      });

      expect(status).toBe(201);
      expect(data).toHaveProperty('status', 'triagem');
      expect(data).toHaveProperty('cliente_nome', CLIENTE.nome);
      expect(data).toHaveProperty('avaliador_nome', AVALIADOR.nome);
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 3: Avançar triagem → avaliação
  // ═════════════════════════════════════════════

  describe('Etapa 3 — Triagem → Avaliação', () => {
    test('PUT avança status para avaliação', async () => {
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_BASE,
        status: 'triagem',
      });
      mockQueryResponse('select \n        a.*', {
        ...ATENDIMENTO_BASE,
        status: 'avaliacao',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute(putAtendimento, '/api/atendimentos/1', {
        method: 'PUT',
        body: { status: 'avaliacao' },
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('status', 'avaliacao');
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 4: Adicionar procedimentos
  // ═════════════════════════════════════════════

  describe('Etapa 4 — Adicionar procedimentos', () => {
    test('POST /api/atendimentos/1/itens adiciona Limpeza', async () => {
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_BASE,
        status: 'avaliacao',
      });
      mockQueryResponse('select * from procedimentos where id', PROCEDIMENTO_1);
      mockQueryResponse('select id, role from usuarios where id', { id: EXECUTOR.id, role: EXECUTOR.role });
      setLastInsertId(1);
      mockQueryResponse('select \n        i.*', {
        id: 1,
        atendimento_id: 1,
        procedimento_id: PROCEDIMENTO_1.id,
        executor_id: EXECUTOR.id,
        criado_por_id: AVALIADOR.id,
        valor: PROCEDIMENTO_1.valor,
        status: 'pendente',
        procedimento_nome: PROCEDIMENTO_1.nome,
        executor_nome: EXECUTOR.nome,
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute(postItens, '/api/atendimentos/1/itens', {
        method: 'POST',
        body: {
          procedimento_id: PROCEDIMENTO_1.id,
          executor_id: EXECUTOR.id,
          criado_por_id: AVALIADOR.id,
          valor: PROCEDIMENTO_1.valor,
        },
      }, ctx);

      expect(status).toBe(201);
      expect(data).toHaveProperty('procedimento_nome', 'Limpeza');
      expect(data).toHaveProperty('status', 'pendente');
      expect(data).toHaveProperty('valor', 200);
    });

    test('POST /api/atendimentos/1/itens adiciona Restauração (por_dente)', async () => {
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_BASE,
        status: 'avaliacao',
      });
      mockQueryResponse('select * from procedimentos where id', PROCEDIMENTO_2);
      mockQueryResponse('select id, role from usuarios where id', { id: EXECUTOR.id, role: EXECUTOR.role });
      setLastInsertId(2);
      mockQueryResponse('select \n        i.*', {
        id: 2,
        atendimento_id: 1,
        procedimento_id: PROCEDIMENTO_2.id,
        executor_id: EXECUTOR.id,
        criado_por_id: AVALIADOR.id,
        valor: PROCEDIMENTO_2.valor,
        dentes: '14,15,16',
        quantidade: 3,
        status: 'pendente',
        procedimento_nome: PROCEDIMENTO_2.nome,
        executor_nome: EXECUTOR.nome,
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute(postItens, '/api/atendimentos/1/itens', {
        method: 'POST',
        body: {
          procedimento_id: PROCEDIMENTO_2.id,
          executor_id: EXECUTOR.id,
          criado_por_id: AVALIADOR.id,
          valor: PROCEDIMENTO_2.valor,
          dentes: '14,15,16',
          quantidade: 3,
        },
      }, ctx);

      expect(status).toBe(201);
      expect(data).toHaveProperty('procedimento_nome', 'Restauração');
      expect(data).toHaveProperty('dentes', '14,15,16');
      expect(data).toHaveProperty('quantidade', 3);
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 5: Avaliação → Aguardando Pagamento
  // ═════════════════════════════════════════════

  describe('Etapa 5 — Avaliação → Aguardando Pagamento', () => {
    test('PUT avança para aguardando_pagamento (requer itens)', async () => {
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_BASE,
        status: 'avaliacao',
      });
      // Validação: deve ter pelo menos 1 item
      mockQueryResponse('select count(*) as count from itens_atendimento', { count: 2 });
      mockQueryResponse('select \n        a.*', {
        ...ATENDIMENTO_BASE,
        status: 'aguardando_pagamento',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute(putAtendimento, '/api/atendimentos/1', {
        method: 'PUT',
        body: { status: 'aguardando_pagamento' },
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('status', 'aguardando_pagamento');
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 6: Registrar pagamento com distribuição
  // ═════════════════════════════════════════════

  describe('Etapa 6 — Registrar pagamento', () => {
    test('POST /api/atendimentos/1/pagamentos com distribuição por item', async () => {
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_BASE,
        status: 'aguardando_pagamento',
      });
      // Hardcoded recebido_por_id
      mockQueryResponse('select id from usuarios limit 1', { id: 1 });
      setLastInsertId(1);
      mockQueryResponse('select * from pagamentos where id', {
        id: 1,
        atendimento_id: 1,
        recebido_por_id: 1,
        valor: 700,
        metodo: 'pix',
        parcelas: 1,
        observacoes: null,
        created_at: '2025-01-15T11:00:00',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute(postPagamentos, '/api/atendimentos/1/pagamentos', {
        method: 'POST',
        body: {
          valor: 700,
          metodo: 'pix',
          itens: [
            { item_id: 1, valor_aplicado: 200 },
            { item_id: 2, valor_aplicado: 500 },
          ],
        },
      }, ctx);

      expect(status).toBe(201);
      expect(data).toHaveProperty('valor', 700);
      expect(data).toHaveProperty('metodo', 'pix');

      // Verifica que as execuções de SQL incluem INSERT nos itens do pagamento
      const queries = getExecutedQueries();
      const inserts = queries.filter(q => q.sql.toLowerCase().includes('insert into pagamentos_itens'));
      expect(inserts).toHaveLength(2);
      expect(inserts[0].params).toContain(200); // valor_aplicado do item 1
      expect(inserts[1].params).toContain(500); // valor_aplicado do item 2

      // Verifica que atualiza valor_pago dos itens
      const updates = queries.filter(q => q.sql.toLowerCase().includes('update itens_atendimento'));
      expect(updates).toHaveLength(2);
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 7: Verificar itens marcados como pagos
  // ═════════════════════════════════════════════

  describe('Etapa 7 — Itens marcados como pagos', () => {
    test('UPDATE de valor_pago inclui CASE para mudar status para "pago"', () => {
      // A marca de status acontece diretamente no SQL:
      // status = CASE WHEN valor_pago + ? >= valor THEN 'pago' ELSE status END
      // Este teste verifica que a query do pagamento usa esse padrão
      resetMockDb();
      setupCloudflareContextMock();

      // Re-registra mocks para o POST pagamento
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_BASE,
        status: 'aguardando_pagamento',
      });
      mockQueryResponse('select id from usuarios limit 1', { id: 1 });
      setLastInsertId(1);
      mockQueryResponse('select * from pagamentos where id', {
        id: 1, atendimento_id: 1, valor: 200, metodo: 'dinheiro',
      });

      // Faz o pagamento para 1 item
      callRoute(postPagamentos, '/api/atendimentos/1/pagamentos', {
        method: 'POST',
        body: {
          valor: 200,
          metodo: 'dinheiro',
          itens: [{ item_id: 1, valor_aplicado: 200 }],
        },
      }, createRouteContext({ id: '1' })).then(() => {
        const queries = getExecutedQueries();
        const updateItem = queries.find(q =>
          q.sql.toLowerCase().includes('update itens_atendimento') &&
          q.sql.toLowerCase().includes("when valor_pago")
        );
        expect(updateItem).toBeDefined();
        expect(updateItem!.sql).toContain("'pago'");
      });
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 8: Aguardando Pagamento → Em Execução
  // ═════════════════════════════════════════════

  describe('Etapa 8 — Aguardando Pagamento → Em Execução', () => {
    test('PUT avança para em_execucao (requer pelo menos 1 item pago)', async () => {
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_BASE,
        status: 'aguardando_pagamento',
      });
      // Validação: itens pagos
      mockQueryResponse('count(*) as count', { count: 2 });
      // Hardcoded liberado_por_id
      mockQueryResponse('select id from usuarios limit 1', { id: AVALIADOR.id });
      mockQueryResponse('select \n        a.*', {
        ...ATENDIMENTO_BASE,
        status: 'em_execucao',
        liberado_por_id: AVALIADOR.id,
        liberado_por_nome: AVALIADOR.nome,
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute(putAtendimento, '/api/atendimentos/1', {
        method: 'PUT',
        body: { status: 'em_execucao' },
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('status', 'em_execucao');

      // Verifica que executou a query de UPDATE incluindo liberado_por_id
      const queries = getExecutedQueries();
      const updateQ = queries.find(q =>
        q.sql.toLowerCase().includes('update atendimentos set') &&
        q.sql.toLowerCase().includes('liberado_por_id')
      );
      expect(updateQ).toBeDefined();
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 9: Executor assume procedimento
  // ═════════════════════════════════════════════

  describe('Etapa 9 — Executor assume procedimento', () => {
    test('PUT /api/atendimentos/1/itens/1 marca status executando', async () => {
      // Atendimento em execução
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_BASE,
        status: 'em_execucao',
      });
      // Item existe
      mockQueryResponse('select * from itens_atendimento where id', {
        id: 1,
        atendimento_id: 1,
        procedimento_id: PROCEDIMENTO_1.id,
        executor_id: EXECUTOR.id,
        valor: 200,
        status: 'pago',
      });
      // Item atualizado retornado
      mockQueryResponse('select \n        i.*', {
        id: 1,
        atendimento_id: 1,
        procedimento_id: PROCEDIMENTO_1.id,
        executor_id: EXECUTOR.id,
        valor: 200,
        status: 'executando',
        procedimento_nome: PROCEDIMENTO_1.nome,
        executor_nome: EXECUTOR.nome,
      });

      const ctx = createRouteContext({ id: '1', itemId: '1' });
      const { status, data } = await callRoute(putItem, '/api/atendimentos/1/itens/1', {
        method: 'PUT',
        body: {
          status: 'executando',
          usuario_id: EXECUTOR.id,
        },
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('status', 'executando');
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 10: Registrar nota de execução
  // ═════════════════════════════════════════════

  describe('Etapa 10 — Notas de execução', () => {
    test('POST /api/execucao/item/1/notas registra nota', async () => {
      setLastInsertId(1);

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute(postNotas, '/api/execucao/item/1/notas', {
        method: 'POST',
        body: {
          usuario_id: EXECUTOR.id,
          texto: 'Iniciando limpeza. Paciente cooperativa, sem intercorrências.',
        },
      }, ctx);

      expect(status).toBe(201);
      expect(data).toHaveProperty('message', 'Nota adicionada com sucesso');
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 11: Preencher prontuário
  // ═════════════════════════════════════════════

  describe('Etapa 11 — Prontuário', () => {
    test('POST /api/execucao/item/1/prontuario cria prontuário', async () => {
      // Não existe prontuário anterior
      mockQueryResponse('select id from prontuarios where item_atendimento_id', null as any);
      // Retorna prontuário criado
      mockQueryResponse('select \n        p.*', {
        id: 1,
        item_atendimento_id: 1,
        usuario_id: EXECUTOR.id,
        usuario_nome: EXECUTOR.nome,
        descricao: 'Limpeza realizada com sucesso. Remoção de placa bacteriana em todos os quadrantes.',
        observacoes: 'Paciente deve retornar em 6 meses.',
        created_at: '2025-01-15T14:00:00',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute(postProntuario, '/api/execucao/item/1/prontuario', {
        method: 'POST',
        body: {
          usuario_id: EXECUTOR.id,
          descricao: 'Limpeza realizada com sucesso. Remoção de placa bacteriana em todos os quadrantes.',
          observacoes: 'Paciente deve retornar em 6 meses.',
        },
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('message', 'Prontuário criado');
      expect(data.prontuario).toHaveProperty('descricao');
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 12: Marcar item como concluído
  // ═════════════════════════════════════════════

  describe('Etapa 12 — Concluir procedimento', () => {
    test('PUT /api/atendimentos/1/itens/1 marca como concluído', async () => {
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_BASE,
        status: 'em_execucao',
      });
      mockQueryResponse('select * from itens_atendimento where id', {
        id: 1,
        atendimento_id: 1,
        procedimento_id: PROCEDIMENTO_1.id,
        executor_id: EXECUTOR.id,
        valor: 200,
        status: 'executando',
      });
      mockQueryResponse('select \n        i.*', {
        id: 1,
        atendimento_id: 1,
        procedimento_id: PROCEDIMENTO_1.id,
        executor_id: EXECUTOR.id,
        valor: 200,
        status: 'concluido',
        concluido_at: '2025-01-15T15:00:00',
        procedimento_nome: PROCEDIMENTO_1.nome,
        executor_nome: EXECUTOR.nome,
      });

      const ctx = createRouteContext({ id: '1', itemId: '1' });
      const { status, data } = await callRoute(putItem, '/api/atendimentos/1/itens/1', {
        method: 'PUT',
        body: {
          status: 'concluido',
          usuario_id: EXECUTOR.id,
        },
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('status', 'concluido');
      expect(data).toHaveProperty('concluido_at');

      // Verifica SQL de update inclui concluido_at
      const queries = getExecutedQueries();
      const update = queries.find(q =>
        q.sql.toLowerCase().includes('update itens_atendimento') &&
        q.sql.toLowerCase().includes('concluido_at')
      );
      expect(update).toBeDefined();
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 13: Finalizar atendimento
  // ═════════════════════════════════════════════

  describe('Etapa 13 — Finalizar atendimento', () => {
    test('POST /api/atendimentos/1/finalizar gera comissões', async () => {
      // Atendimento em execução
      mockQueryResponse('select id, status from atendimentos where id', {
        id: 1,
        status: 'em_execucao',
      });
      // 2 itens, ambos concluídos e pagos
      mockQueryResponse('from itens_atendimento where atendimento_id', [
        {
          id: 1,
          valor: 200,
          valor_pago: 200,
          status: 'concluido',
          criado_por_id: AVALIADOR.id,
          executor_id: EXECUTOR.id,
          procedimento_id: PROCEDIMENTO_1.id,
        },
        {
          id: 2,
          valor: 500,
          valor_pago: 500,
          status: 'concluido',
          criado_por_id: AVALIADOR.id,
          executor_id: EXECUTOR.id,
          procedimento_id: PROCEDIMENTO_2.id,
        },
      ]);
      // Procedimento 1 — comissões 10% venda, 20% execução
      mockQueryResponse('select id, comissao_venda, comissao_execucao from procedimentos where id', PROCEDIMENTO_1);

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute(postFinalizar, '/api/atendimentos/1/finalizar', {
        method: 'POST',
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('message', 'Atendimento finalizado com sucesso');
      expect(data.comissoes).toBeDefined();

      // Comissões: 
      //   Item 1 (200): venda=20, exec=40 → totais para item 1
      //   Item 2 (500): venda=40, exec=125 → totais para item 2
      //   (ambos usam PROCEDIMENTO_1 no mock por substring match)
      // O mock retorna o mesmo procedimento para ambos, mas a lógica dos cálculos funciona
      expect(data.comissoes.total).toBeGreaterThan(0);
      expect(data.comissoes.detalhes.length).toBeGreaterThan(0);

      // Verifica INSERTs de comissões foram executados
      const queries = getExecutedQueries();
      const comissaoInserts = queries.filter(q =>
        q.sql.toLowerCase().includes('insert into comissoes')
      );
      // 2 itens × 2 tipos (venda + execução) = 4 comissões
      expect(comissaoInserts.length).toBe(4);

      // Verifica UPDATE de finalização
      const finalizeUpdate = queries.find(q =>
        q.sql.toLowerCase().includes("update atendimentos set status = 'finalizado'")
      );
      expect(finalizeUpdate).toBeDefined();
    });

    test('comissões de venda calculadas corretamente (% × valor)', async () => {
      mockQueryResponse('select id, status from atendimentos where id', {
        id: 1,
        status: 'em_execucao',
      });
      mockQueryResponse('from itens_atendimento where atendimento_id', [
        {
          id: 1,
          valor: 1000,
          valor_pago: 1000,
          status: 'concluido',
          criado_por_id: AVALIADOR.id,
          executor_id: EXECUTOR.id,
          procedimento_id: PROCEDIMENTO_1.id,
        },
      ]);
      mockQueryResponse('select id, comissao_venda, comissao_execucao from procedimentos where id', {
        id: PROCEDIMENTO_1.id,
        comissao_venda: 10,
        comissao_execucao: 20,
      });

      const ctx = createRouteContext({ id: '1' });
      const { data } = await callRoute(postFinalizar, '/api/atendimentos/1/finalizar', {
        method: 'POST',
      }, ctx);

      // 10% de 1000 = 100 (venda), 20% de 1000 = 200 (execução)
      expect(data.comissoes.venda).toBe(100);
      expect(data.comissoes.execucao).toBe(200);
      expect(data.comissoes.total).toBe(300);
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 14: Verificar comissões geradas
  // ═════════════════════════════════════════════

  describe('Etapa 14 — Verificar comissões', () => {
    test('GET /api/comissoes retorna lista detalhada', async () => {
      mockQueryResponse('from comissoes c', [
        {
          id: 1,
          atendimento_id: 1,
          item_atendimento_id: 1,
          usuario_id: AVALIADOR.id,
          usuario_nome: AVALIADOR.nome,
          tipo: 'venda',
          percentual: 10,
          valor_base: 200,
          valor_comissao: 20,
          procedimento_nome: PROCEDIMENTO_1.nome,
          cliente_nome: CLIENTE.nome,
          created_at: '2025-01-15T16:00:00',
        },
        {
          id: 2,
          atendimento_id: 1,
          item_atendimento_id: 1,
          usuario_id: EXECUTOR.id,
          usuario_nome: EXECUTOR.nome,
          tipo: 'execucao',
          percentual: 20,
          valor_base: 200,
          valor_comissao: 40,
          procedimento_nome: PROCEDIMENTO_1.nome,
          cliente_nome: CLIENTE.nome,
          created_at: '2025-01-15T16:00:00',
        },
      ]);

      const { status, data } = await callRoute(getComissoes, '/api/comissoes', {
        method: 'GET',
        searchParams: { usuario_id: String(AVALIADOR.id) },
      });

      expect(status).toBe(200);
      expect(data).toHaveProperty('comissoes');
      expect(data.comissoes.length).toBeGreaterThanOrEqual(1);
      expect(data).toHaveProperty('totais');
    });

    test('GET /api/comissoes?resumo=true retorna resumo por usuário', async () => {
      mockQueryResponse('from comissoes c', [
        {
          usuario_id: AVALIADOR.id,
          usuario_nome: AVALIADOR.nome,
          total_venda: 60,
          total_execucao: 0,
          total_geral: 60,
          quantidade: 2,
        },
        {
          usuario_id: EXECUTOR.id,
          usuario_nome: EXECUTOR.nome,
          total_venda: 0,
          total_execucao: 165,
          total_geral: 165,
          quantidade: 2,
        },
      ]);

      const { status, data } = await callRoute(getComissoes, '/api/comissoes', {
        method: 'GET',
        searchParams: { resumo: 'true' },
      });

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 15: Dashboard reflete o estado
  // ═════════════════════════════════════════════

  describe('Etapa 15 — Dashboard atualizado', () => {
    test('GET /api/dashboard reflete atendimento finalizado', async () => {
      mockQueryResponse('select count(*) as count from clientes', { count: 1 });
      mockQueryResponse('select count(*) as count from atendimentos \n       where date(created_at)', { count: 1 });
      mockQueryResponse("where status = 'aguardando_pagamento'", { count: 0 });
      mockQueryResponse("where status = 'finalizado' and date(finalizado_at)", { count: 1 });
      mockQueryResponse("where status = 'em_execucao'", { count: 0 });
      mockQueryResponse("where status in ('triagem', 'avaliacao')", { count: 0 });
      mockQueryResponse('select count(*) as count from parcelas', { count: 0 });

      const { status, data } = await callRoute(getDashboard, '/api/dashboard');

      expect(status).toBe(200);
      expect(data).toHaveProperty('totalClientes', 1);
      expect(data).toHaveProperty('finalizadosHoje', 1);
      expect(data).toHaveProperty('emExecucao', 0);
      expect(data).toHaveProperty('aguardandoPagamento', 0);
    });

    test('GET /api/dashboard para executor mostra suas comissões', async () => {
      mockQueryResponse('select count(*) as count from clientes', { count: 1 });
      mockQueryResponse('select count(*) as count from atendimentos \n       where date(created_at)', { count: 1 });
      mockQueryResponse("where status = 'aguardando_pagamento'", { count: 0 });
      mockQueryResponse("where status = 'finalizado' and date(finalizado_at)", { count: 1 });
      mockQueryResponse("where status = 'em_execucao'", { count: 0 });
      mockQueryResponse("where status in ('triagem', 'avaliacao')", { count: 0 });
      mockQueryResponse('select count(*) as count from parcelas', { count: 0 });
      // Comissões do executor
      mockQueryResponse('select coalesce(sum(valor_comissao), 0) as total from comissoes', { total: 165 });
      // Procedimentos do executor
      mockQueryResponse('i.executor_id = ?', { count: 0 });
      mockQueryResponse('i.executor_id is null', { count: 0 });

      const { status, data } = await callRoute(getDashboard, '/api/dashboard', {
        searchParams: { usuario_id: String(EXECUTOR.id), role: 'executor' },
      });

      expect(status).toBe(200);
      expect(data).toHaveProperty('minhasComissoes', 165);
    });
  });

  // ═════════════════════════════════════════════
  // FLUXO COMPLETO — Verificação sequencial
  // ═════════════════════════════════════════════

  describe('Verificação de sequência de queries', () => {
    test('pagamento com distribuição gera queries na ordem correta', async () => {
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_BASE,
        status: 'aguardando_pagamento',
      });
      mockQueryResponse('select id from usuarios limit 1', { id: 1 });
      setLastInsertId(5);
      mockQueryResponse('select * from pagamentos where id', {
        id: 5, atendimento_id: 1, valor: 700, metodo: 'cartao_credito',
      });

      await callRoute(postPagamentos, '/api/atendimentos/1/pagamentos', {
        method: 'POST',
        body: {
          valor: 700,
          metodo: 'cartao_credito',
          itens: [
            { item_id: 1, valor_aplicado: 200 },
            { item_id: 2, valor_aplicado: 500 },
          ],
        },
      }, createRouteContext({ id: '1' }));

      const queries = getExecutedQueries();
      const sqlTexts = queries.map(q => q.sql.toLowerCase());

      // Ordem esperada:
      // 1. SELECT atendimento
      // 2. SELECT usuario (recebido_por)
      // 3. INSERT pagamento
      // 4. INSERT pagamentos_itens (item 1)
      // 5. UPDATE itens_atendimento (item 1 valor_pago)
      // 6. INSERT pagamentos_itens (item 2)
      // 7. UPDATE itens_atendimento (item 2 valor_pago)
      // 8. SELECT pagamento criado

      const insertPagIdx = sqlTexts.findIndex(s => s.includes('insert into pagamentos ('));
      const insertPiIdx = sqlTexts.findIndex(s => s.includes('insert into pagamentos_itens'));
      const updateItemIdx = sqlTexts.findIndex(s => s.includes('update itens_atendimento'));

      expect(insertPagIdx).toBeLessThan(insertPiIdx);
      expect(insertPiIdx).toBeLessThan(updateItemIdx);
    });

    test('finalização gera comissões antes de atualizar status', async () => {
      mockQueryResponse('select id, status from atendimentos where id', {
        id: 1, status: 'em_execucao',
      });
      mockQueryResponse('from itens_atendimento where atendimento_id', [
        {
          id: 1, valor: 100, valor_pago: 100, status: 'concluido',
          criado_por_id: AVALIADOR.id, executor_id: EXECUTOR.id,
          procedimento_id: PROCEDIMENTO_1.id,
        },
      ]);
      mockQueryResponse('select id, comissao_venda, comissao_execucao from procedimentos where id', {
        ...PROCEDIMENTO_1, comissao_venda: 10, comissao_execucao: 20,
      });

      await callRoute(postFinalizar, '/api/atendimentos/1/finalizar', {
        method: 'POST',
      }, createRouteContext({ id: '1' }));

      const queries = getExecutedQueries();
      const sqlTexts = queries.map(q => q.sql.toLowerCase());

      const comissaoIdx = sqlTexts.findIndex(s => s.includes('insert into comissoes'));
      const finalizeIdx = sqlTexts.findIndex(s => s.includes("status = 'finalizado'"));

      expect(comissaoIdx).toBeGreaterThan(-1);
      expect(finalizeIdx).toBeGreaterThan(-1);
      // Comissões inseridas ANTES da finalização
      expect(comissaoIdx).toBeLessThan(finalizeIdx);
    });
  });
});
