import { NextRequest } from 'next/server';
import { createSqliteDb } from '../helpers/sqlite-db.cjs';
import { __setMockDb, __setMockR2, __resetMocks } from '../../__mocks__/opennextjs-cloudflare';
import { callRoute, createRouteContext } from '../helpers/api-test-helper';
import { verifyToken } from '@/lib/auth/jwt';
import { GET as usuarios, POST as criarUsuario } from '@/app/api/usuarios/route';
import { GET as usuario, PUT as editarUsuario, DELETE as removerUsuario } from '@/app/api/usuarios/[id]/route';
import { GET as arquivo } from '@/app/api/arquivos/[...path]/route';
import { GET as anexosCliente, POST as enviarCliente } from '@/app/api/clientes/[id]/anexos/route';
import { POST as enviarExecucao, DELETE as removerExecucao } from '@/app/api/execucao/item/[id]/anexos/route';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('test'),
  verifyToken: jest.fn(),
}));
jest.mock('@/lib/auth', () => ({ hashPassword: jest.fn().mockResolvedValue('hash-de-teste') }));

let db: ReturnType<typeof createSqliteDb>;
const storage = {
  get: jest.fn().mockResolvedValue({ body: 'documento de teste', size: 18, httpMetadata: { contentType: 'text/plain' } }),
  put: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue(undefined),
};
function login(role = 'admin', id = 1, unidades = [1]) {
  jest.mocked(verifyToken).mockResolvedValue({ sub: id, role, roles: [role], unidade_ids: unidades, unidade_atual: unidades[0] } as Awaited<ReturnType<typeof verifyToken>>);
}
beforeEach(() => {
  db = createSqliteDb();
  __setMockDb(db.binding);
  __setMockR2(storage);
  jest.clearAllMocks();
  login();
  db.sqlite.exec(`
    INSERT INTO unidades(id,nome) VALUES (1,'Teste A'),(2,'Teste B');
    INSERT INTO usuarios(id,nome,email,role) VALUES
      (1,'Admin','admin@example.test','admin'),(2,'Atendente','atendente@example.test','atendente'),
      (3,'Executor','executor@example.test','executor'),(4,'Avaliador','avaliador@example.test','avaliador');
    INSERT INTO usuario_roles(usuario_id,role) VALUES (1,'admin'),(2,'atendente'),(3,'executor'),(4,'avaliador');
    INSERT INTO usuario_unidades(usuario_id,unidade_id) VALUES (1,1),(2,1),(3,1),(4,1);
    INSERT INTO clientes(id,nome) VALUES (1,'Paciente A'),(2,'Paciente B');
    INSERT INTO procedimentos(id,nome,valor) VALUES (1,'Procedimento',100);
    INSERT INTO atendimentos(id,cliente_id,unidade_id,avaliador_id) VALUES (1,1,1,4),(2,2,2,4);
    INSERT INTO itens_atendimento(id,atendimento_id,procedimento_id,criado_por_id,executor_id,valor)
      VALUES (1,1,1,4,3,100),(2,2,1,4,3,100);
    INSERT INTO anexos_cliente(id,cliente_id,usuario_id,nome_arquivo,tipo_arquivo,caminho,tamanho)
      VALUES (1,1,1,'a.txt','text/plain','clientes/1/a.txt',18),(2,2,1,'b.txt','text/plain','clientes/2/b.txt',18);
    INSERT INTO anexos_execucao(id,item_atendimento_id,usuario_id,nome_arquivo,tipo_arquivo,caminho,tamanho)
      VALUES (1,1,3,'a.txt','text/plain','execucao/1/a.txt',18),(2,2,3,'b.txt','text/plain','execucao/2/b.txt',18);
  `);
});
afterEach(() => { __resetMocks(); db.sqlite.close(); });

test.each(['atendente', 'avaliador', 'executor', 'ortodontista'])('%s não administra usuários pela API', async role => {
  login(role, 2);
  const ctx = createRouteContext({ id: '2' });
  expect((await callRoute(criarUsuario, '/api/usuarios', { method: 'POST', body: { nome: 'Outro', email: 'outro@example.test', role: 'admin' } })).status).toBe(403);
  expect((await callRoute(editarUsuario, '/api/usuarios/2', { method: 'PUT', body: { roles: ['admin'], role: 'admin', unidade_ids: [2] } }, ctx)).status).toBe(403);
  expect((await callRoute(removerUsuario, '/api/usuarios/2', { method: 'DELETE' }, ctx)).status).toBe(403);
  expect((await callRoute(usuario, '/api/usuarios/2', {}, ctx)).status).toBe(403);
  expect(db.sqlite.prepare('SELECT role,ativo FROM usuarios WHERE id=2').get()).toEqual({ role: 'atendente', ativo: 1 });
  expect(db.sqlite.prepare('SELECT COUNT(*) total FROM usuarios').get().total).toBe(4);
  expect((await callRoute(usuarios, '/api/usuarios?role=executor')).status).toBe(200);
});

test('rotas recusam sessão ausente antes de consultar arquivos ou gravar', async () => {
  jest.mocked(verifyToken).mockResolvedValue(null);
  expect((await callRoute(criarUsuario, '/api/usuarios', { method: 'POST', body: {} })).status).toBe(401);
  expect((await callRoute(arquivo, '/api/arquivos/clientes/1/a.txt', {}, createRouteContext({ path: ['clientes','1','a.txt'] }))).status).toBe(401);
  expect(storage.get).not.toHaveBeenCalled();
});

test('falha ao vincular unidade desfaz também a criação do usuário', async () => {
  const result = await callRoute(criarUsuario, '/api/usuarios', { method: 'POST', body: { nome: 'Novo', email: 'novo@example.test', role: 'atendente', unidade_ids: [999] } });
  expect(result.status).toBe(500);
  expect(db.sqlite.prepare("SELECT id FROM usuarios WHERE email='novo@example.test'").get()).toBeUndefined();
});

test('falha ao alterar perfil desfaz cadastro, unidades e exclusão dos perfis anteriores', async () => {
  db.sqlite.exec("CREATE TRIGGER falha_perfil BEFORE INSERT ON usuario_roles WHEN NEW.role='executor' BEGIN SELECT RAISE(ABORT,'falha injetada'); END;");
  const result = await callRoute(editarUsuario, '/api/usuarios/2', { method: 'PUT', body: { nome: 'Mudou', role: 'executor', roles: ['executor'], unidade_ids: [2] } }, createRouteContext({ id: '2' }));
  expect(result.status).toBe(500);
  expect(db.sqlite.prepare('SELECT nome,role FROM usuarios WHERE id=2').get()).toEqual({ nome: 'Atendente', role: 'atendente' });
  expect(db.sqlite.prepare('SELECT unidade_id FROM usuario_unidades WHERE usuario_id=2').all()).toEqual([{ unidade_id: 1 }]);
  expect(db.sqlite.prepare('SELECT role FROM usuario_roles WHERE usuario_id=2').all()).toEqual([{ role: 'atendente' }]);
});

test('admin cria usuário com todas as unidades e perfis no mesmo lote', async () => {
  const result = await callRoute<{ id: number; roles: string[] }>(criarUsuario, '/api/usuarios', { method: 'POST', body: { nome: 'Novo', email: 'novo@example.test', roles: ['avaliador', 'executor'], unidade_ids: [1,2] } });
  expect(result.status).toBe(201);
  expect(result.data.id).toBeGreaterThan(4);
  expect(db.sqlite.prepare('SELECT role FROM usuario_roles WHERE usuario_id=? ORDER BY role').all(result.data.id)).toEqual([{ role: 'avaliador' }, { role: 'executor' }]);
});

test.each(['clientes', 'execucao'])('profissional não acessa arquivo %s de outra unidade', async tipo => {
  login('executor', 3);
  const result = await callRoute(arquivo, `/api/arquivos/${tipo}/2/b.txt`, {}, createRouteContext({ path: [tipo,'2','b.txt'] }));
  expect(result.status).toBe(403);
  expect(storage.get).not.toHaveBeenCalled();
});

test('arquivo autorizado tem cache privado e arquivo não registrado não chega ao R2', async () => {
  login('executor', 3);
  const result = await callRoute(arquivo, '/api/arquivos/clientes/1/a.txt', {}, createRouteContext({ path: ['clientes','1','a.txt'] }));
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toBe('private, no-store');
  storage.get.mockClear();
  expect((await callRoute(arquivo, '/api/arquivos/segredo', {}, createRouteContext({ path: ['segredo'] }))).status).toBe(404);
  expect(storage.get).not.toHaveBeenCalled();
});

test('dentista consulta anexos da sua unidade e não altera documentos de cadastro', async () => {
  login('avaliador', 4);
  expect((await callRoute(anexosCliente, '/api/clientes/1/anexos', {}, createRouteContext({ id: '1' }))).status).toBe(200);
  expect((await callRoute(anexosCliente, '/api/clientes/2/anexos', {}, createRouteContext({ id: '2' }))).status).toBe(403);
  expect((await callRoute(enviarCliente, '/api/clientes/1/anexos', { method: 'POST', body: {} }, createRouteContext({ id: '1' }))).status).toBe(403);
});

test('upload clínico registra o autor da sessão e ignora usuário forjado no formulário', async () => {
  login('executor', 3);
  const form = new FormData();
  form.append('arquivo', new File(['foto'], 'foto.png', { type: 'image/png' }));
  form.append('usuario_id', '1');
  const response = await enviarExecucao(new NextRequest('http://localhost/api/execucao/item/1/anexos', { method: 'POST', body: form }), createRouteContext({ id: '1' }));
  expect(response.status).toBe(201);
  expect(db.sqlite.prepare('SELECT usuario_id FROM anexos_execucao ORDER BY id DESC LIMIT 1').get().usuario_id).toBe(3);
});

test('remoção de anexo de outra unidade é recusada sem apagar objeto ou registro', async () => {
  login('executor', 3);
  expect((await callRoute(removerExecucao, '/api/execucao/item/2/anexos?anexo_id=2', { method: 'DELETE' }, createRouteContext({ id: '2' }))).status).toBe(403);
  expect(storage.delete).not.toHaveBeenCalled();
  expect(db.sqlite.prepare('SELECT id FROM anexos_execucao WHERE id=2').get()).toBeDefined();
});

test('falha ao excluir metadados preserva o arquivo ainda referenciado', async () => {
  db.sqlite.exec("CREATE TRIGGER falha_anexo BEFORE DELETE ON anexos_execucao BEGIN SELECT RAISE(ABORT,'falha injetada'); END;");
  const result = await callRoute(removerExecucao, '/api/execucao/item/1/anexos?anexo_id=1', { method: 'DELETE' }, createRouteContext({ id: '1' }));
  expect(result.status).toBe(500);
  expect(storage.delete).not.toHaveBeenCalled();
  expect(db.sqlite.prepare('SELECT id FROM anexos_execucao WHERE id=1').get()).toBeDefined();
});

test('profissional sem vínculo com o procedimento não altera seus anexos', async () => {
  login('executor', 2);
  const result = await callRoute(removerExecucao, '/api/execucao/item/1/anexos?anexo_id=1', { method: 'DELETE' }, createRouteContext({ id: '1' }));
  expect(result.status).toBe(403);
  expect(storage.delete).not.toHaveBeenCalled();
});
