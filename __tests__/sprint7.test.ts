/**
 * Testes automatizados - Sprint 7
 * 
 * Verifica:
 * - Sistema de pagamentos a nível de procedimento
 * - Distribuição de valores entre procedimentos
 * - Cálculo de valor_pago e status dos itens
 * - Validação de liberação para execução
 * - Vínculo entre pagamentos e procedimentos
 */

import { query, queryOne, execute } from '../lib/db';

interface Atendimento {
  id: number;
  cliente_id: number;
  status: string;
}

interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  valor: number;
  valor_pago: number;
  status: string;
}

interface Pagamento {
  id: number;
  atendimento_id: number;
  valor: number;
  metodo: string;
}

interface PagamentoItem {
  id: number;
  pagamento_id: number;
  item_atendimento_id: number;
  valor_aplicado: number;
}

describe('Sprint 7 - Sistema de Pagamentos por Procedimento', () => {
  
  let testClienteId: number;
  let testAtendimentoId: number;
  let testProcedimento1Id: number;
  let testProcedimento2Id: number;
  let testProcedimento3Id: number;
  let testItem1Id: number;
  let testItem2Id: number;
  let testItem3Id: number;
  let testUsuarioId: number;

  // Setup: Criar dados de teste
  beforeAll(() => {
    // Cliente de teste
    const clienteResult = execute(
      `INSERT INTO clientes (nome, cpf, telefone, origem) VALUES (?, ?, ?, ?)`,
      ['Paciente Teste Pagamento', '111.222.333-44', '(11) 98765-4321', 'fachada']
    );
    testClienteId = Number(clienteResult.lastInsertRowid);

    // Usuário de teste
    const usuarioResult = execute(
      `INSERT INTO usuarios (nome, email, role) VALUES (?, ?, ?)`,
      ['Atendente Teste', 'atendente.teste@email.com', 'atendente']
    );
    testUsuarioId = Number(usuarioResult.lastInsertRowid);

    // Procedimentos de teste
    const proc1 = execute(
      `INSERT INTO procedimentos (nome, valor, comissao_venda, comissao_execucao) 
       VALUES (?, ?, ?, ?)`,
      ['Limpeza', 150.00, 10, 20]
    );
    testProcedimento1Id = Number(proc1.lastInsertRowid);

    const proc2 = execute(
      `INSERT INTO procedimentos (nome, valor, comissao_venda, comissao_execucao) 
       VALUES (?, ?, ?, ?)`,
      ['Restauração', 300.00, 10, 20]
    );
    testProcedimento2Id = Number(proc2.lastInsertRowid);

    const proc3 = execute(
      `INSERT INTO procedimentos (nome, valor, comissao_venda, comissao_execucao) 
       VALUES (?, ?, ?, ?)`,
      ['Clareamento', 500.00, 10, 20]
    );
    testProcedimento3Id = Number(proc3.lastInsertRowid);

    // Atendimento de teste
    const atendimentoResult = execute(
      `INSERT INTO atendimentos (cliente_id, status) VALUES (?, ?)`,
      [testClienteId, 'aguardando_pagamento']
    );
    testAtendimentoId = Number(atendimentoResult.lastInsertRowid);

    // Itens do atendimento
    const item1 = execute(
      `INSERT INTO itens_atendimento (atendimento_id, procedimento_id, criado_por_id, valor) 
       VALUES (?, ?, ?, ?)`,
      [testAtendimentoId, testProcedimento1Id, testUsuarioId, 150.00]
    );
    testItem1Id = Number(item1.lastInsertRowid);

    const item2 = execute(
      `INSERT INTO itens_atendimento (atendimento_id, procedimento_id, criado_por_id, valor) 
       VALUES (?, ?, ?, ?)`,
      [testAtendimentoId, testProcedimento2Id, testUsuarioId, 300.00]
    );
    testItem2Id = Number(item2.lastInsertRowid);

    const item3 = execute(
      `INSERT INTO itens_atendimento (atendimento_id, procedimento_id, criado_por_id, valor) 
       VALUES (?, ?, ?, ?)`,
      [testAtendimentoId, testProcedimento3Id, testUsuarioId, 500.00]
    );
    testItem3Id = Number(item3.lastInsertRowid);
  });

  // Cleanup
  afterAll(() => {
    execute('DELETE FROM pagamentos_itens WHERE pagamento_id IN (SELECT id FROM pagamentos WHERE atendimento_id = ?)', [testAtendimentoId]);
    execute('DELETE FROM pagamentos WHERE atendimento_id = ?', [testAtendimentoId]);
    execute('DELETE FROM itens_atendimento WHERE atendimento_id = ?', [testAtendimentoId]);
    execute('DELETE FROM atendimentos WHERE id = ?', [testAtendimentoId]);
    execute('DELETE FROM procedimentos WHERE id IN (?, ?, ?)', [testProcedimento1Id, testProcedimento2Id, testProcedimento3Id]);
    execute('DELETE FROM clientes WHERE id = ?', [testClienteId]);
    execute('DELETE FROM usuarios WHERE id = ?', [testUsuarioId]);
  });

  // ============================================
  // TESTES DA ESTRUTURA
  // ============================================
  describe('Estrutura do Banco de Dados', () => {
    
    test('tabela "pagamentos_itens" deve existir', () => {
      const tables = query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pagamentos_itens'"
      );
      expect(tables).toHaveLength(1);
    });

    test('coluna "valor_pago" deve existir em itens_atendimento', () => {
      const columns = query(
        "PRAGMA table_info(itens_atendimento)"
      );
      const valorPagoColumn = columns.find((col: any) => col.name === 'valor_pago');
      expect(valorPagoColumn).toBeDefined();
      expect(valorPagoColumn.type).toBe('REAL');
    });

    test('itens devem iniciar com valor_pago = 0', () => {
      const item = queryOne<ItemAtendimento>(
        'SELECT * FROM itens_atendimento WHERE id = ?',
        [testItem1Id]
      );
      expect(item?.valor_pago).toBe(0);
      expect(item?.status).toBe('pendente');
    });

  });

  // ============================================
  // TESTES DE PAGAMENTO PARCIAL
  // ============================================
  describe('Pagamento Parcial de Procedimentos', () => {

    test('deve registrar pagamento parcial em um procedimento', () => {
      // Pagar 100 de um procedimento de 150
      const pagamento = execute(
        `INSERT INTO pagamentos (atendimento_id, recebido_por_id, valor, metodo) 
         VALUES (?, ?, ?, ?)`,
        [testAtendimentoId, testUsuarioId, 100.00, 'pix']
      );
      const pagamentoId = Number(pagamento.lastInsertRowid);

      // Vincular ao item
      execute(
        `INSERT INTO pagamentos_itens (pagamento_id, item_atendimento_id, valor_aplicado) 
         VALUES (?, ?, ?)`,
        [pagamentoId, testItem1Id, 100.00]
      );

      // Atualizar valor_pago
      execute(
        `UPDATE itens_atendimento SET valor_pago = valor_pago + ? WHERE id = ?`,
        [100.00, testItem1Id]
      );

      const item = queryOne<ItemAtendimento>(
        'SELECT * FROM itens_atendimento WHERE id = ?',
        [testItem1Id]
      );

      expect(item?.valor_pago).toBe(100);
      expect(item?.status).toBe('pendente'); // Ainda não pago completamente
    });

    test('deve calcular saldo devedor corretamente', () => {
      const item = queryOne<ItemAtendimento>(
        'SELECT * FROM itens_atendimento WHERE id = ?',
        [testItem1Id]
      );

      const saldoDevedor = (item?.valor || 0) - (item?.valor_pago || 0);
      expect(saldoDevedor).toBe(50); // 150 - 100 = 50
    });

  });

  // ============================================
  // TESTES DE PAGAMENTO COMPLETO
  // ============================================
  describe('Pagamento Completo de Procedimentos', () => {

    test('deve completar pagamento de um procedimento', () => {
      // Pagar os 50 restantes
      const pagamento = execute(
        `INSERT INTO pagamentos (atendimento_id, recebido_por_id, valor, metodo) 
         VALUES (?, ?, ?, ?)`,
        [testAtendimentoId, testUsuarioId, 50.00, 'dinheiro']
      );
      const pagamentoId = Number(pagamento.lastInsertRowid);

      execute(
        `INSERT INTO pagamentos_itens (pagamento_id, item_atendimento_id, valor_aplicado) 
         VALUES (?, ?, ?)`,
        [pagamentoId, testItem1Id, 50.00]
      );

      execute(
        `UPDATE itens_atendimento 
         SET valor_pago = valor_pago + ?,
             status = CASE WHEN valor_pago + ? >= valor THEN 'pago' ELSE status END
         WHERE id = ?`,
        [50.00, 50.00, testItem1Id]
      );

      const item = queryOne<ItemAtendimento>(
        'SELECT * FROM itens_atendimento WHERE id = ?',
        [testItem1Id]
      );

      expect(item?.valor_pago).toBe(150);
      expect(item?.status).toBe('pago');
    });

    test('deve listar procedimentos totalmente pagos', () => {
      const itensPagos = query<ItemAtendimento>(
        `SELECT * FROM itens_atendimento 
         WHERE atendimento_id = ? AND status = 'pago'`,
        [testAtendimentoId]
      );

      expect(itensPagos.length).toBeGreaterThanOrEqual(1);
      itensPagos.forEach(item => {
        expect(item.valor_pago).toBeGreaterThanOrEqual(item.valor);
      });
    });

  });

  // ============================================
  // TESTES DE DISTRIBUIÇÃO DE PAGAMENTO
  // ============================================
  describe('Distribuição de Pagamento entre Múltiplos Procedimentos', () => {

    test('deve distribuir um pagamento entre 2 procedimentos', () => {
      // Pagar 500 distribuídos: 300 no item2 e 200 no item3
      const pagamento = execute(
        `INSERT INTO pagamentos (atendimento_id, recebido_por_id, valor, metodo) 
         VALUES (?, ?, ?, ?)`,
        [testAtendimentoId, testUsuarioId, 500.00, 'cartao_credito']
      );
      const pagamentoId = Number(pagamento.lastInsertRowid);

      // Aplicar 300 no item 2
      execute(
        `INSERT INTO pagamentos_itens (pagamento_id, item_atendimento_id, valor_aplicado) 
         VALUES (?, ?, ?)`,
        [pagamentoId, testItem2Id, 300.00]
      );

      execute(
        `UPDATE itens_atendimento 
         SET valor_pago = valor_pago + ?,
             status = CASE WHEN valor_pago + ? >= valor THEN 'pago' ELSE status END
         WHERE id = ?`,
        [300.00, 300.00, testItem2Id]
      );

      // Aplicar 200 no item 3
      execute(
        `INSERT INTO pagamentos_itens (pagamento_id, item_atendimento_id, valor_aplicado) 
         VALUES (?, ?, ?)`,
        [pagamentoId, testItem3Id, 200.00]
      );

      execute(
        `UPDATE itens_atendimento 
         SET valor_pago = valor_pago + ?,
             status = CASE WHEN valor_pago + ? >= valor THEN 'pago' ELSE status END
         WHERE id = ?`,
        [200.00, 200.00, testItem3Id]
      );

      // Verificar item 2 (totalmente pago)
      const item2 = queryOne<ItemAtendimento>(
        'SELECT * FROM itens_atendimento WHERE id = ?',
        [testItem2Id]
      );
      expect(item2?.valor_pago).toBe(300);
      expect(item2?.status).toBe('pago');

      // Verificar item 3 (parcialmente pago)
      const item3 = queryOne<ItemAtendimento>(
        'SELECT * FROM itens_atendimento WHERE id = ?',
        [testItem3Id]
      );
      expect(item3?.valor_pago).toBe(200);
      expect(item3?.status).toBe('pendente'); // 200 de 500
    });

    test('deve validar soma dos valores aplicados', () => {
      const pagamento = queryOne<Pagamento>(
        `SELECT * FROM pagamentos WHERE atendimento_id = ? 
         ORDER BY id DESC LIMIT 1`,
        [testAtendimentoId]
      );

      const itensVinculados = query<PagamentoItem>(
        'SELECT * FROM pagamentos_itens WHERE pagamento_id = ?',
        [pagamento?.id]
      );

      const totalAplicado = itensVinculados.reduce((sum, item) => sum + item.valor_aplicado, 0);
      expect(totalAplicado).toBe(pagamento?.valor);
    });

  });

  // ============================================
  // TESTES DE CÁLCULO DE TOTAIS
  // ============================================
  describe('Cálculo de Totais do Atendimento', () => {

    test('deve calcular total do atendimento corretamente', () => {
      const result = queryOne<{ total: number }>(
        'SELECT SUM(valor) as total FROM itens_atendimento WHERE atendimento_id = ?',
        [testAtendimentoId]
      );

      expect(result?.total).toBe(950); // 150 + 300 + 500
    });

    test('deve calcular total pago do atendimento', () => {
      const result = queryOne<{ total_pago: number }>(
        'SELECT SUM(valor_pago) as total_pago FROM itens_atendimento WHERE atendimento_id = ?',
        [testAtendimentoId]
      );

      expect(result?.total_pago).toBe(650); // 150 + 300 + 200
    });

    test('deve calcular saldo devedor do atendimento', () => {
      const totais = queryOne<{ total: number; total_pago: number }>(
        `SELECT 
          SUM(valor) as total,
          SUM(valor_pago) as total_pago 
         FROM itens_atendimento WHERE atendimento_id = ?`,
        [testAtendimentoId]
      );

      const saldoDevedor = (totais?.total || 0) - (totais?.total_pago || 0);
      expect(saldoDevedor).toBe(300); // 950 - 650 = 300
    });

    test('deve listar apenas procedimentos com saldo devedor', () => {
      const itensPendentes = query<ItemAtendimento>(
        `SELECT * FROM itens_atendimento 
         WHERE atendimento_id = ? AND valor > valor_pago`,
        [testAtendimentoId]
      );

      expect(itensPendentes.length).toBe(1); // Apenas item3 tem saldo
      expect(itensPendentes[0].id).toBe(testItem3Id);
    });

  });

  // ============================================
  // TESTES DE VALIDAÇÃO DE LIBERAÇÃO
  // ============================================
  describe('Validação para Liberação de Execução', () => {

    test('deve ter pelo menos 1 procedimento totalmente pago', () => {
      const itensPagos = query<ItemAtendimento>(
        `SELECT * FROM itens_atendimento 
         WHERE atendimento_id = ? AND status = 'pago'`,
        [testAtendimentoId]
      );

      expect(itensPagos.length).toBeGreaterThanOrEqual(1);
    });

    test('não deve liberar atendimento sem procedimentos pagos', () => {
      // Criar novo atendimento sem pagamentos
      const novoCliente = execute(
        `INSERT INTO clientes (nome, origem) VALUES (?, ?)`,
        ['Teste Sem Pagamento', 'organico']
      );
      const novoClienteId = Number(novoCliente.lastInsertRowid);

      const novoAtend = execute(
        `INSERT INTO atendimentos (cliente_id, status) VALUES (?, ?)`,
        [novoClienteId, 'aguardando_pagamento']
      );
      const novoAtendId = Number(novoAtend.lastInsertRowid);

      execute(
        `INSERT INTO itens_atendimento (atendimento_id, procedimento_id, criado_por_id, valor) 
         VALUES (?, ?, ?, ?)`,
        [novoAtendId, testProcedimento1Id, testUsuarioId, 150.00]
      );

      const itensPagos = query(
        `SELECT * FROM itens_atendimento 
         WHERE atendimento_id = ? AND status = 'pago'`,
        [novoAtendId]
      );

      expect(itensPagos.length).toBe(0);

      // Cleanup
      execute('DELETE FROM itens_atendimento WHERE atendimento_id = ?', [novoAtendId]);
      execute('DELETE FROM atendimentos WHERE id = ?', [novoAtendId]);
      execute('DELETE FROM clientes WHERE id = ?', [novoClienteId]);
    });

  });

  // ============================================
  // TESTES DE RASTREABILIDADE
  // ============================================
  describe('Rastreabilidade de Pagamentos', () => {

    test('deve vincular pagamentos aos procedimentos específicos', () => {
      const pagamentos = query<Pagamento>(
        'SELECT * FROM pagamentos WHERE atendimento_id = ?',
        [testAtendimentoId]
      );

      expect(pagamentos.length).toBeGreaterThan(0);

      pagamentos.forEach(pagamento => {
        const vinculos = query<PagamentoItem>(
          'SELECT * FROM pagamentos_itens WHERE pagamento_id = ?',
          [pagamento.id]
        );
        
        expect(vinculos.length).toBeGreaterThan(0);
      });
    });

    test('deve recuperar histórico de pagamentos de um procedimento', () => {
      const historico = query<any>(
        `SELECT 
          pi.valor_aplicado,
          p.metodo,
          p.created_at,
          u.nome as recebido_por
         FROM pagamentos_itens pi
         JOIN pagamentos p ON pi.pagamento_id = p.id
         LEFT JOIN usuarios u ON p.recebido_por_id = u.id
         WHERE pi.item_atendimento_id = ?
         ORDER BY p.created_at`,
        [testItem1Id]
      );

      expect(historico.length).toBe(2); // 2 pagamentos no item1
      expect(historico[0].valor_aplicado).toBe(100);
      expect(historico[1].valor_aplicado).toBe(50);
    });

    test('deve listar todos os procedimentos de um pagamento', () => {
      // Pegar o último pagamento que foi distribuído
      const pagamento = queryOne<Pagamento>(
        `SELECT * FROM pagamentos WHERE atendimento_id = ? 
         AND valor = 500
         ORDER BY id DESC LIMIT 1`,
        [testAtendimentoId]
      );

      const procedimentos = query<any>(
        `SELECT 
          ia.id,
          pr.nome as procedimento_nome,
          pi.valor_aplicado
         FROM pagamentos_itens pi
         JOIN itens_atendimento ia ON pi.item_atendimento_id = ia.id
         JOIN procedimentos pr ON ia.procedimento_id = pr.id
         WHERE pi.pagamento_id = ?`,
        [pagamento?.id]
      );

      expect(procedimentos.length).toBe(2); // Distribuído entre 2 procedimentos
      const totalDistribuido = procedimentos.reduce((sum: number, p: any) => sum + p.valor_aplicado, 0);
      expect(totalDistribuido).toBe(500);
    });

  });

  // ============================================
  // TESTES DE INTEGRIDADE
  // ============================================
  describe('Integridade dos Dados', () => {

    test('valor_pago nunca deve ser maior que valor', () => {
      const itensInvalidos = query(
        `SELECT * FROM itens_atendimento 
         WHERE atendimento_id = ? AND valor_pago > valor`,
        [testAtendimentoId]
      );

      expect(itensInvalidos.length).toBe(0);
    });

    test('soma de pagamentos_itens deve ser igual ao valor do pagamento', () => {
      const pagamentos = query<Pagamento>(
        'SELECT * FROM pagamentos WHERE atendimento_id = ?',
        [testAtendimentoId]
      );

      pagamentos.forEach(pagamento => {
        const itens = query<PagamentoItem>(
          'SELECT * FROM pagamentos_itens WHERE pagamento_id = ?',
          [pagamento.id]
        );

        const somaItens = itens.reduce((sum, item) => sum + item.valor_aplicado, 0);
        
        // Permitir diferença de 0.01 por arredondamento
        expect(Math.abs(somaItens - pagamento.valor)).toBeLessThan(0.02);
      });
    });

    test('status "pago" deve ser consistente com valor_pago >= valor', () => {
      const itens = query<ItemAtendimento>(
        'SELECT * FROM itens_atendimento WHERE atendimento_id = ?',
        [testAtendimentoId]
      );

      itens.forEach(item => {
        if (item.status === 'pago') {
          expect(item.valor_pago).toBeGreaterThanOrEqual(item.valor);
        }
        if (item.valor_pago >= item.valor) {
          expect(item.status).toBe('pago');
        }
      });
    });

  });

});
