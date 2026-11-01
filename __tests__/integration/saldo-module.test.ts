import { NextRequest } from 'next/server';
import { createSqliteDb } from '../helpers/sqlite-db.cjs';
import { __setMockDb, __resetMocks } from '../../__mocks__/opennextjs-cloudflare';
import { callRoute, createRouteContext } from '../helpers/api-test-helper';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('test'),
  verifyToken: jest.fn().mockResolvedValue({ sub: 1, role: 'admin', roles: ['admin'], unidade_ids: [1, 2], unidade_atual: 1 }),
}));
import { verifyToken } from '@/lib/auth/jwt';
import { GET as saldo } from '@/app/api/clientes/[id]/saldo/route';
import { GET as movimentacoes } from '@/app/api/clientes/[id]/saldo/movimentacoes/route';
import { POST as creditar } from '@/app/api/clientes/[id]/saldo/creditar/route';
import { POST as debitar } from '@/app/api/clientes/[id]/saldo/debitar/route';
import { POST as estornar } from '@/app/api/clientes/[id]/saldo/estornar/route';
import { POST as transferir } from '@/app/api/clientes/[id]/saldo/transferir/route';
import { POST as estornarProcedimento } from '@/app/api/clientes/[id]/saldo/estornar-procedimento/route';

let db: ReturnType<typeof createSqliteDb>;
beforeEach(() => {
  (verifyToken as jest.Mock).mockResolvedValue({ sub: 1, role: 'admin', roles: ['admin'], unidade_ids: [1, 2], unidade_atual: 1 });
  db = createSqliteDb();
  __setMockDb(db.binding);
  db.sqlite.exec(`
    INSERT INTO unidades (id,nome) VALUES (1,'Unidade A'),(2,'Unidade B');
    INSERT INTO usuarios (id,nome,email,role) VALUES (1,'Operador teste','teste@example.test','admin');
    INSERT INTO clientes (id,nome) VALUES (1,'Cliente A'),(2,'Cliente B');
    INSERT INTO procedimentos (id,nome,valor) VALUES (1,'Procedimento teste',100);
    INSERT INTO atendimentos (id,cliente_id,unidade_id,status) VALUES (1,1,1,'aguardando_pagamento'),(2,2,2,'aguardando_pagamento');
    INSERT INTO itens_atendimento (id,atendimento_id,procedimento_id,criado_por_id,valor,valor_original,valor_final)
      VALUES (1,1,1,1,100,100,100),(2,2,1,1,100,100,100);
  `);
});
afterEach(() => { __resetMocks(); db.sqlite.close(); });

type SaldoHandler = (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;

function post(handler: SaldoHandler, clienteId: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return callRoute<Record<string, unknown>>(handler, `/api/clientes/${clienteId}/saldo/teste`, { method: 'POST', body, headers }, createRouteContext({ id: String(clienteId) }));
}

test('crédito, uso, devolução de procedimento, transferência e devolução de saldo mantêm o extrato', async () => {
  expect((await post(creditar, 1, { valor: 250 })).data).toEqual({ saldo: 250 });
  expect((await post(debitar, 1, { item_atendimento_id: 1, atendimento_id: 1 })).data.saldo).toBe(150);
  expect(db.sqlite.prepare('SELECT valor_pago FROM itens_atendimento WHERE id=1').get().valor_pago).toBe(100);
  expect((await post(estornarProcedimento, 1, { item_atendimento_id: 1 })).data).toEqual({ saldo_novo: 250, valor_creditado: 100 });
  expect((await post(transferir, 1, { cliente_destino_id: 2, valor: 75 })).data).toEqual({ saldo_origem: 175, saldo_destino: 75 });
  expect((await post(estornar, 2, { valor: 25 })).data).toEqual({ saldo: 50 });
  const summary = await callRoute<{ saldo: number; saldo_calculado: number }>(saldo, '/api/clientes/1/saldo', {}, createRouteContext({ id: '1' }));
  expect(summary.status).toBe(200);
  expect(summary.data.saldo).toBe(175);
  expect(summary.data.saldo_calculado).toBe(0);
  const history = await callRoute<Array<{ tipo: string }>>(movimentacoes, '/api/clientes/1/saldo/movimentacoes', {}, createRouteContext({ id: '1' }));
  expect(history.data.map(row => row.tipo).sort()).toEqual(['credito', 'debito', 'estorno', 'transferencia_saida']);
  expect(db.sqlite.prepare('SELECT saldo FROM saldo_clientes WHERE cliente_id=2').get().saldo).toBe(50);
});

test('saldo continua compartilhado entre unidades autorizadas', async () => {
  await post(creditar, 1, { valor: 123 });
  for (const unit of [1, 2]) {
    const result = await callRoute<{ saldo: number }>(saldo, '/api/clientes/1/saldo', { headers: { 'X-Unidade-Id': String(unit) } }, createRouteContext({ id: '1' }));
    expect(result.data.saldo).toBe(123);
  }
});

test('transferência acima do saldo não altera as duas contas nem o extrato', async () => {
  await post(creditar, 1, { valor: 10 });
  expect((await post(transferir, 1, { cliente_destino_id: 2, valor: 11 })).status).toBe(400);
  expect(db.sqlite.prepare('SELECT saldo FROM saldo_clientes WHERE cliente_id=1').get().saldo).toBe(10);
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM movimentacoes_saldo').get().n).toBe(1);
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM saldo_clientes WHERE cliente_id=2').get().n).toBe(0);
});

test('estorno de procedimento concluído é recusado sem produzir crédito', async () => {
  db.sqlite.exec("UPDATE itens_atendimento SET status='concluido',valor_pago=100 WHERE id=1");
  expect((await post(estornarProcedimento, 1, { item_atendimento_id: 1 })).status).toBe(400);
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM movimentacoes_saldo').get().n).toBe(0);
});

test('falha de persistência no extrato desfaz também a alteração no saldo', async () => {
  await post(creditar, 1, { valor: 10 });
  db.sqlite.exec("CREATE TRIGGER falha_extrato BEFORE INSERT ON movimentacoes_saldo BEGIN SELECT RAISE(ABORT,'falha simulada'); END;");
  const logging = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect((await post(creditar, 1, { valor: 5 })).status).toBe(500);
    expect(db.sqlite.prepare('SELECT saldo FROM saldo_clientes WHERE cliente_id=1').get().saldo).toBe(10);
    expect(db.sqlite.prepare('SELECT COUNT(*) n FROM movimentacoes_saldo').get().n).toBe(1);
  } finally { logging.mockRestore(); }
});


test.each([
  ['creditar', creditar], ['debitar', debitar], ['estornar', estornar],
  ['transferir', transferir], ['estornar procedimento', estornarProcedimento],
  ['consultar', saldo], ['extrato', movimentacoes],
] as const)('%s exige autenticação e perfil administrativo/atendimento', async (_name, handler) => {
  (verifyToken as jest.Mock).mockResolvedValue(null);
  expect((await post(handler, 1, { valor: 1 })).status).toBe(401);
  (verifyToken as jest.Mock).mockResolvedValue({ sub: 1, role: 'executor', roles: ['executor'], unidade_atual: 1 });
  expect((await post(handler, 1, { valor: 1 })).status).toBe(403);
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM movimentacoes_saldo').get().n).toBe(0);
});

test('atendente pode movimentar saldo sem transformar o saldo global em saldo por unidade', async () => {
  (verifyToken as jest.Mock).mockResolvedValue({ sub: 1, role: 'atendente', roles: ['atendente'], unidade_ids: [1], unidade_atual: 1 });
  expect((await post(creditar, 1, { valor: 10 })).status).toBe(201);
  expect((await post(transferir, 1, { cliente_destino_id: 2, valor: 10 })).status).toBe(200);
  expect(db.sqlite.prepare('SELECT saldo FROM saldo_clientes WHERE cliente_id=2').get().saldo).toBe(10);
});

test('saldo do cliente B não quita procedimento do cliente A', async () => {
  await post(creditar, 2, { valor: 200 });
  expect((await post(debitar, 2, { item_atendimento_id: 1, atendimento_id: 1 })).status).toBe(403);
  expect(db.sqlite.prepare('SELECT saldo FROM saldo_clientes WHERE cliente_id=2').get().saldo).toBe(200);
  expect(db.sqlite.prepare('SELECT valor_pago FROM itens_atendimento WHERE id=1').get().valor_pago).toBe(0);
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM movimentacoes_saldo').get().n).toBe(1);
});

test('uso de saldo exige unidade do procedimento e permite escolher a unidade correta', async () => {
  await post(creditar, 2, { valor: 100 });
  expect((await post(debitar, 2, { item_atendimento_id: 2, atendimento_id: 2 })).status).toBe(403);
  expect((await post(debitar, 2, { item_atendimento_id: 2, atendimento_id: 2 }, { 'X-Unidade-Id': '2' })).status).toBe(200);
  expect(db.sqlite.prepare('SELECT valor_pago FROM itens_atendimento WHERE id=2').get().valor_pago).toBe(100);
});

test('devolução de procedimento exige cliente e unidade corretos', async () => {
  db.sqlite.exec('UPDATE itens_atendimento SET valor_pago=100 WHERE id=2');
  expect((await post(estornarProcedimento, 1, { item_atendimento_id: 2 }, { 'X-Unidade-Id': '2' })).status).toBe(403);
  expect((await post(estornarProcedimento, 2, { item_atendimento_id: 2 })).status).toBe(403);
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM movimentacoes_saldo').get().n).toBe(0);
  expect((await post(estornarProcedimento, 2, { item_atendimento_id: 2 }, { 'X-Unidade-Id': '2' })).status).toBe(200);
});

test('crédito com pagamento de origem exige pagamento ativo do cliente e unidade', async () => {
  db.sqlite.exec("INSERT INTO pagamentos (id,atendimento_id,recebido_por_id,valor,metodo) VALUES (1,2,1,100,'pix')");
  expect((await post(creditar, 1, { valor: 10, pagamento_id: 1 }, { 'X-Unidade-Id': '2' })).status).toBe(403);
  expect((await post(creditar, 2, { valor: 10, pagamento_id: 1 })).status).toBe(403);
  expect((await post(creditar, 2, { valor: 10, pagamento_id: 99 })).status).toBe(404);
  db.sqlite.exec('UPDATE pagamentos SET cancelado=1 WHERE id=1');
  expect((await post(creditar, 2, { valor: 10, pagamento_id: 1 }, { 'X-Unidade-Id': '2' })).status).toBe(400);
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM movimentacoes_saldo').get().n).toBe(0);
  db.sqlite.exec('UPDATE pagamentos SET cancelado=0 WHERE id=1');
  expect((await post(creditar, 2, { valor: 10, pagamento_id: 1 }, { 'X-Unidade-Id': '2' })).status).toBe(201);
});

test.each([0, -1, 0.001, 1e100, '10', null])('rejeita valor inválido %s sem lançar crédito', async valor => {
  expect((await post(creditar, 1, { valor })).status).toBe(400);
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM movimentacoes_saldo').get().n).toBe(0);
});

test('rejeita transferência para o próprio cliente mesmo quando ID vem como texto', async () => {
  await post(creditar, 1, { valor: 10 });
  expect((await post(transferir, 1, { cliente_destino_id: '1', valor: 10 })).status).toBe(400);
  expect(db.sqlite.prepare('SELECT saldo FROM saldo_clientes WHERE cliente_id=1').get().saldo).toBe(10);
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM movimentacoes_saldo').get().n).toBe(1);
});

test('operações usam centavos sem acumular resíduo no saldo persistido', async () => {
  await post(creditar, 1, { valor: 0.1 });
  await post(creditar, 1, { valor: 0.2 });
  expect(db.sqlite.prepare('SELECT saldo FROM saldo_clientes WHERE cliente_id=1').get().saldo).toBe(0.3);
  expect((await post(estornar, 1, { valor: 0.3 })).data.saldo).toBe(0);
});

test.each(['executando', 'concluido'])('uso de saldo não altera estado clínico %s', async status => {
  await post(creditar, 1, { valor: 100 });
  db.sqlite.prepare('UPDATE itens_atendimento SET status=? WHERE id=1').run(status);
  expect((await post(debitar, 1, { item_atendimento_id: 1, atendimento_id: 1 })).status).toBe(200);
  expect(db.sqlite.prepare('SELECT status,valor_pago FROM itens_atendimento WHERE id=1').get()).toEqual({ status, valor_pago: 100 });
});


test.each(['null', '[]', '{"valor":1e999}', '{invalido'])('JSON inválido para operação de crédito retorna 400: %s', async body => {
  const response = await creditar(new NextRequest('http://localhost/api/clientes/1/saldo/creditar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  }), createRouteContext({ id: '1' }));
  expect(response.status).toBe(400);
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM movimentacoes_saldo').get().n).toBe(0);
});
