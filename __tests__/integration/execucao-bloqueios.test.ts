import { createSqliteDb } from '../helpers/sqlite-db.cjs';
import { __setMockDb, __resetMocks } from '../../__mocks__/opennextjs-cloudflare';
import { callRoute, createRouteContext } from '../helpers/api-test-helper';
import { validarExecutorClinico } from '@/app/api/atendimentos/_helpers';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('test'),
  verifyToken: jest.fn().mockResolvedValue({ sub: 1, role: 'executor', roles: ['executor'], unidade_ids: [1], unidade_atual: 1 }),
}));
import { GET as fila } from '@/app/api/fila/[slug]/route';
import { GET as detalhe } from '@/app/api/execucao/item/[id]/route';
import { GET as prontuario } from '@/app/api/execucao/item/[id]/prontuario/route';
import { PUT as atualizar } from '@/app/api/atendimentos/[id]/itens/[itemId]/route';

let db: ReturnType<typeof createSqliteDb>;
beforeEach(() => {
  db = createSqliteDb();
  __setMockDb(db.binding);
  db.sqlite.exec(`
    INSERT INTO unidades(id,nome) VALUES (1,'Teste A'),(2,'Teste B');
    INSERT INTO usuarios(id,nome,email,role) VALUES (1,'Dentista teste','dentista@example.test','executor'),(2,'Recepção teste','recepcao@example.test','admin');
    INSERT INTO categorias(id,nome,slug) VALUES (1,'Geral','geral');
    INSERT INTO categoria_roles(categoria_id,role) VALUES (1,'executor'),(1,'admin');
    INSERT INTO clientes(id,nome) VALUES (1,'Cliente fictício');
    INSERT INTO procedimentos(id,nome,valor) VALUES (1,'Procedimento teste',100);
    INSERT INTO atendimentos(id,cliente_id,unidade_id,categoria_id,status) VALUES (1,1,1,1,'em_execucao'),(2,1,2,1,'em_execucao');
    INSERT INTO itens_atendimento(id,atendimento_id,procedimento_id,executor_id,criado_por_id,valor,status) VALUES
      (1,1,1,1,1,100,'executando'),(2,1,1,1,1,100,'pago'),(3,1,1,1,1,100,'pago'),
      (4,1,1,1,1,100,'pago'),(5,2,1,1,1,100,'pago'),(6,1,1,1,1,100,'pago'),(7,1,1,1,1,100,'pago');
    INSERT INTO agendamentos(id,cliente_id,unidade_id,item_atendimento_origem_id,tipo,status,data_agendada) VALUES
      (1,1,1,2,'procedimento','agendado',datetime('now','-10 days')),
      (2,1,1,3,'procedimento','agendado',datetime('now','+10 days')),
      (3,1,1,4,'procedimento','pendente',NULL),
      (4,1,2,5,'procedimento','agendado',datetime('now','-10 days')),
      (5,1,1,6,'procedimento','agendado',date('now','-3 hours')),
      (6,1,1,7,'procedimento','agendado',datetime('now','-3 hours','start of day','+3 hours'));
  `);
});
afterEach(() => { __resetMocks(); db.sqlite.close(); });

test('fila separa vencidos, preserva reservas futuras/sem data/hoje e isola unidade', async () => {
  const result = await callRoute<{ meusProcedimentos: { id: number }[]; pendenciasAgendamento: { id: number }[] }>(fila,
    '/api/fila/geral', { searchParams: { executor_id: '1' } }, createRouteContext({ slug: 'geral' }));
  expect(result.status).toBe(200);
  expect(result.data.meusProcedimentos.map(item => item.id)).toEqual([1]);
  expect(result.data.pendenciasAgendamento.map(item => item.id)).toEqual([2]);
  expect(db.sqlite.prepare('SELECT status FROM agendamentos WHERE id=1').get().status).toBe('agendado');
});

test('detalhe informa vencimento mantendo o bloqueio de agendamento', async () => {
  const result = await callRoute<{ possui_agendamento_vencido: number; possui_agendamento_ativo: number }>(detalhe,
    '/api/execucao/item/2', {}, createRouteContext({ id: '2' }));
  expect(result.status).toBe(200);
  expect(result.data.possui_agendamento_vencido).toBe(1);
  expect(result.data.possui_agendamento_ativo).toBe(1);
});

test('admin precisa também de perfil clínico, mesmo quando a categoria aceita admin', async () => {
  expect(await validarExecutorClinico(2, 1)).toBe('invalid');
  db.sqlite.exec("INSERT INTO usuario_roles(usuario_id,role) VALUES (2,'executor')");
  expect(await validarExecutorClinico(2, 1)).toBe('ok');
  db.sqlite.exec('UPDATE usuarios SET ativo=0 WHERE id=2');
  expect(await validarExecutorClinico(2, 1)).toBe('not_found');
});

test('prontuário antigo é identificado e permite conclusão sem duplicar evolução', async () => {
  db.sqlite.exec(`
    INSERT INTO prontuarios(id,item_atendimento_id,usuario_id,descricao) VALUES (77,1,1,'Descrição fictícia de teste');
    INSERT INTO prontuario_evolucoes(id,uuid,atendimento_id,usuario_id,descricao,legacy_prontuario_id) VALUES (62,'legacy-prontuario-77',1,1,'Descrição fictícia de teste',77);
    INSERT INTO prontuario_evolucao_itens(evolucao_id,item_atendimento_id) VALUES (62,1);
  `);
  const result = await callRoute<{ prontuario: { legacy_prontuario_id: number } }>(prontuario,
    '/api/execucao/item/1/prontuario', {}, createRouteContext({ id: '1' }));
  expect(result.status).toBe(200);
  expect(result.data.prontuario.legacy_prontuario_id).toBe(77);
  const update = await callRoute(atualizar, '/api/atendimentos/1/itens/1',
    { method: 'PUT', body: { status: 'concluido' } }, createRouteContext({ id: '1', itemId: '1' }));
  expect(update.status).toBe(200);
  expect(db.sqlite.prepare('SELECT status FROM itens_atendimento WHERE id=1').get().status).toBe('concluido');
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM prontuario_evolucao_itens WHERE item_atendimento_id=1').get().n).toBe(1);
});

test('conclusão individual não ignora agendamento ativo', async () => {
  db.sqlite.exec("UPDATE itens_atendimento SET status='executando' WHERE id=2");
  const result = await callRoute(atualizar, '/api/atendimentos/1/itens/2',
    { method: 'PUT', body: { status: 'concluido' } }, createRouteContext({ id: '1', itemId: '2' }));
  expect(result.status).toBe(400);
  expect(db.sqlite.prepare('SELECT status FROM itens_atendimento WHERE id=2').get().status).toBe('executando');
});
