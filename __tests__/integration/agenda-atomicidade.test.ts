import { createSqliteDb } from '../helpers/sqlite-db.cjs';
import { __setMockDb, __resetMocks } from '../../__mocks__/opennextjs-cloudflare';
import { callRoute, createRouteContext } from '../helpers/api-test-helper';
import { POST as selecionar } from '@/app/api/atendimentos/[id]/selecionar-hoje/route';
import { POST as chegou } from '@/app/api/agendamentos/[id]/chegou/route';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('test'),
  verifyToken: jest.fn().mockResolvedValue({ sub: 1, role: 'admin', roles: ['admin'], unidade_ids: [1], unidade_atual: 1 }),
}));
let db: ReturnType<typeof createSqliteDb>;
beforeEach(() => {
  db = createSqliteDb();
  __setMockDb(db.binding);
  db.sqlite.exec(`
    INSERT INTO unidades(id,nome) VALUES (1,'Teste');
    INSERT INTO usuarios(id,nome,email,role) VALUES (1,'Operador','operador@example.test','admin');
    INSERT INTO clientes(id,nome) VALUES (1,'Paciente');
    INSERT INTO procedimentos(id,nome,valor) VALUES (1,'Simples',100),(2,'Etapas',200);
    INSERT INTO procedimento_etapas_modelo(id,procedimento_id,nome,valor,ordem) VALUES (1,2,'Etapa 1',100,1),(2,2,'Etapa 2',100,2);
    INSERT INTO atendimentos(id,cliente_id,unidade_id,status,created_at) VALUES (1,1,1,'aguardando_pagamento','2020-01-01T12:00:00.000Z');
    INSERT INTO itens_atendimento(id,atendimento_id,procedimento_id,criado_por_id,valor,valor_pago,valor_original,valor_final)
      VALUES (1,1,1,1,100,100,100,100);
    INSERT INTO pagamentos(id,atendimento_id,recebido_por_id,valor,metodo) VALUES (1,1,1,100,'pix');
    INSERT INTO pagamentos_alocacoes(id,pagamento_id,item_atendimento_id,valor_alocado) VALUES (1,1,1,100);
    INSERT INTO itens_atendimento_destinos(atendimento_id,item_atendimento_id,destino_status) VALUES (1,1,'fazer_hoje');
  `);
});
afterEach(() => { __resetMocks(); db.sqlite.close(); });

function snapshot() {
  return Object.fromEntries(['atendimentos','itens_atendimento','itens_atendimento_destinos','agendamentos','pagamentos_alocacoes'].map(t => [t, db.sqlite.prepare(`SELECT * FROM ${t} ORDER BY id`).all()]));
}
function selecionarDestino(destino_status: string, acao_final = 'liberar_execucao') {
  return callRoute(selecionar, '/api/atendimentos/1/selecionar-hoje', { method: 'POST', body: { acao_final, destinos: [{ item_id: 1, destino_status }] } }, createRouteContext({ id: '1' }));
}

test('recusa de continuação preserva os destinos anteriores e todo o atendimento', async () => {
  const before = snapshot();
  expect((await selecionarDestino('fazer_hoje', 'finalizar_continuacao')).status).toBe(400);
  expect(snapshot()).toEqual(before);
});

test('item de outro atendimento é recusado antes de persistir destinos', async () => {
  const before = snapshot();
  const result = await callRoute(selecionar, '/api/atendimentos/1/selecionar-hoje', { method: 'POST', body: { destinos: [{ item_id: 999, destino_status: 'pago_sem_data' }] } }, createRouteContext({ id: '1' }));
  expect(result.status).toBe(400);
  expect(snapshot()).toEqual(before);
});

test('falha após criar agenda e mover pagamento reverte também exclusões e destinos', async () => {
  db.sqlite.exec("CREATE TRIGGER falha_exclusao BEFORE DELETE ON itens_atendimento BEGIN SELECT RAISE(ABORT,'falha injetada'); END;");
  const before = snapshot();
  expect((await selecionarDestino('pago_sem_data')).status).toBe(500);
  expect(snapshot()).toEqual(before);
});

test('seleção bem-sucedida conserva valores e vincula pagamento ao agendamento recém-criado', async () => {
  expect((await selecionarDestino('pago_sem_data')).status).toBe(200);
  const agendamento = db.sqlite.prepare('SELECT * FROM agendamentos').get();
  expect(agendamento).toMatchObject({ valor: 100, valor_pago: 100, pago: 1, status: 'pendente' });
  expect(db.sqlite.prepare('SELECT item_atendimento_id,agendamento_id,valor_alocado FROM pagamentos_alocacoes').get()).toEqual({ item_atendimento_id: null, agendamento_id: agendamento.id, valor_alocado: 100 });
  expect(db.sqlite.prepare('SELECT id FROM itens_atendimento').all()).toEqual([]);
});

test('divisão legada de etapas mantém cada alocação vinculada ao item ou agenda correto', async () => {
  db.sqlite.exec(`UPDATE itens_atendimento SET procedimento_id=2,valor=200,valor_original=200,valor_final=200 WHERE id=1;
    UPDATE pagamentos_alocacoes SET etapa_modelo_id=1 WHERE id=1;`);
  const result = await callRoute(selecionar, '/api/atendimentos/1/selecionar-hoje', { method: 'POST', body: { destinos: [
    { item_id: 1, etapa_modelo_id: 1, destino_status: 'fazer_hoje' },
    { item_id: 1, etapa_modelo_id: 2, destino_status: 'nao_pago_sem_data' },
  ] } }, createRouteContext({ id: '1' }));
  expect(result.status).toBe(200);
  const item = db.sqlite.prepare('SELECT id,etapa_modelo_id,valor_pago FROM itens_atendimento').get();
  expect(item).toMatchObject({ etapa_modelo_id: 1, valor_pago: 100 });
  expect(db.sqlite.prepare('SELECT item_atendimento_id FROM pagamentos_alocacoes').get().item_atendimento_id).toBe(item.id);
  expect(db.sqlite.prepare('SELECT etapa_modelo_id,valor_pago FROM agendamentos').get()).toEqual({ etapa_modelo_id: 2, valor_pago: 0 });
});

function agendar(tipo: 'avaliacao' | 'procedimento', vinculado = false) {
  db.sqlite.prepare(`INSERT INTO agendamentos(id,cliente_id,unidade_id,tipo,status,procedimento_id,item_atendimento_origem_id,atendimento_origem_id,valor,valor_pago)
    VALUES (1,1,1,?,'agendado',?,?,?,100,100)`).run(tipo, tipo === 'procedimento' ? 1 : null, vinculado ? 1 : null, vinculado ? 1 : null);
}
function registrarChegada() {
  return callRoute<{ id: number }>(chegou, '/api/agendamentos/1/chegou', { method: 'POST', body: { agendamento_ids: [1] } }, createRouteContext({ id: '1' }));
}

test.each(['avaliacao', 'procedimento'] as const)('falha ao concluir chegada de %s desfaz atendimento e itens novos', async tipo => {
  agendar(tipo);
  db.sqlite.exec("CREATE TRIGGER falha_chegada BEFORE UPDATE OF status ON agendamentos WHEN NEW.status='realizado' BEGIN SELECT RAISE(ABORT,'falha injetada'); END;");
  const before = snapshot();
  expect((await registrarChegada()).status).toBe(500);
  expect(snapshot()).toEqual(before);
});

test.each(['avaliacao', 'procedimento'] as const)('chegada de %s mantém o vínculo com o atendimento criado no lote', async tipo => {
  agendar(tipo);
  const result = await registrarChegada();
  expect(result.status).toBe(201);
  expect(result.data.id).toBeGreaterThan(1);
  expect(db.sqlite.prepare('SELECT atendimento_sessao_id,status FROM agendamentos').get()).toEqual({ atendimento_sessao_id: result.data.id, status: 'realizado' });
  if (tipo === 'procedimento') expect(db.sqlite.prepare('SELECT atendimento_id,valor_pago FROM itens_atendimento WHERE origem_agendamento_id=1').get()).toEqual({ atendimento_id: result.data.id, valor_pago: 100 });
});

test('falha na chegada vinculada preserva o encerramento e os destinos anteriores', async () => {
  db.sqlite.exec("UPDATE atendimentos SET status='encerrado',finalizado_at='2020-01-01T15:00:00.000Z' WHERE id=1;");
  agendar('procedimento', true);
  db.sqlite.exec("CREATE TRIGGER falha_chegada BEFORE UPDATE OF status ON agendamentos WHEN NEW.status='realizado' BEGIN SELECT RAISE(ABORT,'falha injetada'); END;");
  const before = snapshot();
  expect((await registrarChegada()).status).toBe(500);
  expect(snapshot()).toEqual(before);
});
