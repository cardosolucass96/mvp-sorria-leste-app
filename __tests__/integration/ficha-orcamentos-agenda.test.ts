import { createSqliteDb } from '../helpers/sqlite-db.cjs';
import { __setMockDb, __resetMocks } from '../../__mocks__/opennextjs-cloudflare';
import { callRoute, createRouteContext } from '../helpers/api-test-helper';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('test'),
  verifyToken: jest.fn().mockResolvedValue({ sub: 1, role: 'admin', roles: ['admin'], unidade_ids: [1], unidade_atual: 1 }),
}));
import { GET } from '@/app/api/clientes/[id]/ficha/route';

let db: ReturnType<typeof createSqliteDb>;
beforeEach(() => {
  db = createSqliteDb();
  __setMockDb(db.binding);
  db.sqlite.exec(`
    INSERT INTO unidades(id,nome) VALUES (1,'Unidade teste');
    INSERT INTO usuarios(id,nome,email,role) VALUES (1,'Operador teste','teste@example.test','admin');
    INSERT INTO clientes(id,nome) VALUES (1,'Cliente teste'),(2,'Outro cliente');
    INSERT INTO procedimentos(id,nome,valor) VALUES (1,'Procedimento teste',750);
    INSERT INTO atendimentos(id,cliente_id,unidade_id,status) VALUES (1,1,1,'em_execucao'),(2,1,1,'finalizado'),(3,2,1,'em_execucao');
    INSERT INTO agendamentos(id,cliente_id,unidade_id,atendimento_origem_id,procedimento_id,tipo,status,valor,valor_pago) VALUES
      (10,1,1,1,1,'procedimento','pendente',750,0),
      (11,1,1,1,1,'procedimento','agendado',750,100),
      (12,1,1,1,1,'procedimento','cancelado',750,0),
      (13,2,1,3,1,'procedimento','pendente',750,0),
      (14,1,1,1,1,'procedimento','realizado',750,750);
    UPDATE agendamentos SET data_agendada='2026-11-10T12:00:00Z' WHERE id=11;
  `);
});
afterEach(() => { __resetMocks(); db.sqlite.close(); });

type Ficha = { procedimentos: { id: number }[]; procedimentos_agendados: { agendamento_id: number; valor: number; valor_pago: number; status: string; data_agendada: string | null }[] };
const consultar = () => callRoute<Ficha>(GET, '/api/clientes/1/ficha', {}, createRouteContext({ id: '1' }));

test('mantém orçamento sem pagamento na ficha, inclusive após cancelamento, sem incluir outro cliente', async () => {
  const { status, data } = await consultar();
  expect(status).toBe(200);
  expect(data.procedimentos).toEqual([]);
  expect(data.procedimentos_agendados.map(item => item.agendamento_id)).toEqual([14,12,11,10]);
  expect(data.procedimentos_agendados.find(item => item.agendamento_id === 10)).toMatchObject({valor:750,valor_pago:0,status:'pendente',data_agendada:null});
  expect(data.procedimentos_agendados.find(item => item.agendamento_id === 11)).toMatchObject({valor_pago:100,data_agendada:'2026-11-10T12:00:00Z'});
});

test('não duplica item preservado nem item recriado quando cliente comparece', async () => {
  db.sqlite.exec(`
    INSERT INTO itens_atendimento(id,atendimento_id,procedimento_id,criado_por_id,valor,origem_agendamento_id)
      VALUES (21,1,1,1,750,NULL),(22,2,1,1,750,14);
    UPDATE agendamentos SET item_atendimento_origem_id=21 WHERE id=10;
  `);
  const { status, data } = await consultar();
  expect(status).toBe(200);
  expect(data.procedimentos).toHaveLength(2);
  expect(data.procedimentos_agendados.map(item => item.agendamento_id)).toEqual([12,11]);
});
