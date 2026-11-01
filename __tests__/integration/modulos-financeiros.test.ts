import { createSqliteDb } from '../helpers/sqlite-db.cjs';
import { __setMockDb, __resetMocks } from '../../__mocks__/opennextjs-cloudflare';
import { callRoute, createRouteContext } from '../helpers/api-test-helper';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('test'),
  verifyToken: jest.fn().mockResolvedValue({ sub: 1, role: 'admin', roles: ['admin'], unidade_ids: [1, 2], unidade_atual: 1 }),
}));
import { GET as orcamentos } from '@/app/api/orcamentos-em-aberto/route';
import { GET as listar, POST as pagar } from '@/app/api/atendimentos/[id]/pagamentos/route';
import { PUT as cancelar } from '@/app/api/atendimentos/[id]/pagamentos/[pagamentoId]/route';

let db: ReturnType<typeof createSqliteDb>;
beforeEach(() => {
  db = createSqliteDb();
  __setMockDb(db.binding);
  db.sqlite.exec(`
    INSERT INTO unidades (id,nome) VALUES (1,'Unidade teste A'),(2,'Unidade teste B');
    INSERT INTO usuarios (id,nome,email,role) VALUES (1,'Operador teste','operador@example.test','admin');
    INSERT INTO clientes (id,nome) VALUES (1,'Cliente teste');
    INSERT INTO procedimentos (id,nome,valor,comissao_venda) VALUES (1,'Procedimento teste',100,10);
    INSERT INTO atendimentos (id,cliente_id,unidade_id,status,created_at) VALUES
      (1,1,1,'aguardando_pagamento','2026-01-01T12:00:00.000Z'),
      (2,1,2,'aguardando_pagamento','2026-01-01T12:00:00.000Z');
    INSERT INTO itens_atendimento (id,atendimento_id,procedimento_id,criado_por_id,valor,valor_original,valor_final)
      VALUES (1,1,1,1,100,100,100),(2,2,1,1,100,100,100);
  `);
});
afterEach(() => { __resetMocks(); db.sqlite.close(); });

async function receber(body: Record<string, unknown>) {
  return callRoute<{ id: number; observacoes: string }>(pagar, '/api/atendimentos/1/pagamentos',
    { method: 'POST', body }, createRouteContext({ id: '1' }));
}

test('orçamento consulta apenas a unidade selecionada e mantém o contrato público', async () => {
  const { status, data } = await callRoute<{ summary: { valor_total_aberto: number }; items: Array<{ atendimento_id: number }> }>(orcamentos, '/api/orcamentos-em-aberto');
  expect(status).toBe(200);
  expect(data.summary).toEqual({ valor_total_aberto: 100, orcamentos_abertos: 1, procedimentos_abertos: 1, sem_agendamento: 1, agendamento_sem_data: 0, agendado_com_data: 0 });
  expect(data.items.map(item => item.atendimento_id)).toEqual([1]);
});

test('pagamento composto persiste observações, alocações, comissão e pendência restante', async () => {
  const { status, data } = await receber({ valor_total: 60, observacoes: 'Pagamento parcial', formas: [{ metodo: 'pix', valor: 40 }, { metodo: 'dinheiro', valor: 20 }], alocacoes: [{ item_id: 1, valor: 60 }] });
  expect(status).toBe(201);
  expect(data.observacoes).toBe('Pagamento parcial');
  expect(db.sqlite.prepare('SELECT SUM(valor) total FROM pagamentos').get().total).toBe(60);
  expect(db.sqlite.prepare('SELECT SUM(valor_alocado) total FROM pagamentos_alocacoes').get().total).toBe(60);
  expect(db.sqlite.prepare('SELECT SUM(valor_comissao) total FROM comissoes').get().total).toBe(6);
  expect(db.sqlite.prepare('SELECT valor_pago FROM itens_atendimento WHERE id=1').get().valor_pago).toBe(60);
  const listing = await callRoute<{ summary: { valor_total_aberto: number } }>(orcamentos, '/api/orcamentos-em-aberto');
  expect(listing.data.summary.valor_total_aberto).toBe(40);
});

test('cancelar uma forma cancela o grupo, recompõe orçamento e remove comissão', async () => {
  const payment = await receber({ valor_total: 100, formas: [{ metodo: 'pix', valor: 60 }, { metodo: 'dinheiro', valor: 40 }], alocacoes: [{ item_id: 1, valor: 100 }] });
  expect(payment.status).toBe(201);
  const result = await callRoute(cancelar, `/api/atendimentos/1/pagamentos/${payment.data.id}`, { method: 'PUT', body: { motivo: 'Teste de cancelamento' } }, createRouteContext({ id: '1', pagamentoId: String(payment.data.id) }));
  expect(result.status).toBe(200);
  expect(db.sqlite.prepare('SELECT COUNT(*) total FROM pagamentos WHERE cancelado=1').get().total).toBe(2);
  expect(db.sqlite.prepare('SELECT valor_pago FROM itens_atendimento WHERE id=1').get().valor_pago).toBe(0);
  expect(db.sqlite.prepare('SELECT COUNT(*) total FROM comissoes').get().total).toBe(0);
});

test('listagem ordena instantes UTC de formatos legados e usa ID como desempate', async () => {
  db.sqlite.exec(`INSERT INTO pagamentos (id,atendimento_id,recebido_por_id,valor,metodo,created_at) VALUES
    (10,1,1,10,'pix','2026-01-01T11:00:00.000Z'),
    (11,1,1,10,'pix','2026-01-01 12:00:00'),
    (12,1,1,10,'pix','2026-01-01T12:00:00Z');`);
  const { status, data } = await callRoute<Array<{ id: number }>>(listar, '/api/atendimentos/1/pagamentos', {}, createRouteContext({ id: '1' }));
  expect(status).toBe(200);
  expect(data.map(row => row.id)).toEqual([12, 11, 10]);
});

test('pagamento simples de outra unidade é recusado sem gravar', async () => {
  const { status } = await callRoute(pagar, '/api/atendimentos/2/pagamentos', { method: 'POST', body: { valor: 100, metodo: 'pix', alocacoes: [{ item_id: 2, valor: 100 }] } }, createRouteContext({ id: '2' }));
  expect(status).toBe(403);
  expect(db.sqlite.prepare('SELECT COUNT(*) total FROM pagamentos').get().total).toBe(0);
});

test.each([0, -10])('recusa valor inválido %s sem modificar o banco', async valor => {
  expect((await receber({ valor, metodo: 'pix', alocacoes: [{ item_id: 1, valor }] })).status).toBe(400);
  expect(db.sqlite.prepare('SELECT COUNT(*) total FROM pagamentos').get().total).toBe(0);
});

test('recusa método desconhecido sem gravar', async () => {
  expect((await receber({ valor: 100, metodo: 'invalido', alocacoes: [{ item_id: 1, valor: 100 }] })).status).toBe(400);
  expect(db.sqlite.prepare('SELECT COUNT(*) total FROM pagamentos').get().total).toBe(0);
});

test('quitação atualiza apenas o item selecionado e o retira das pendências', async () => {
  const payment = await receber({ valor: 100, metodo: 'pix', alocacoes: [{ item_id: 1, valor: 100 }] });
  expect(payment.status).toBe(201);
  expect(db.sqlite.prepare('SELECT valor_pago,status FROM itens_atendimento WHERE id=1').get()).toEqual({ valor_pago: 100, status: 'pago' });
  expect(db.sqlite.prepare('SELECT valor_pago FROM itens_atendimento WHERE id=2').get().valor_pago).toBe(0);
  const result = await callRoute<{ items: unknown[] }>(orcamentos, '/api/orcamentos-em-aberto');
  expect(result.data.items).toEqual([]);
});

test('recusa atendimento inexistente', async () => {
  const result = await callRoute(pagar, '/api/atendimentos/999/pagamentos', { method: 'POST', body: { valor: 100, metodo: 'pix', alocacoes: [{ item_id: 1, valor: 100 }] } }, createRouteContext({ id: '999' }));
  expect(result.status).toBe(404);
});

test('extração preserva a recusa atual de pagamento durante triagem', async () => {
  db.sqlite.exec("UPDATE atendimentos SET status='triagem' WHERE id=1");
  expect((await receber({ valor: 100, metodo: 'pix', alocacoes: [{ item_id: 1, valor: 100 }] })).status).toBe(400);
  expect(db.sqlite.prepare('SELECT COUNT(*) total FROM pagamentos').get().total).toBe(0);
});
