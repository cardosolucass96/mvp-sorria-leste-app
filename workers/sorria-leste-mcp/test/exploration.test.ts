import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/mcp';
import { compileExplorationSql, describeDataset, exploreDatabase, queryDataset } from '../src/exploration';
import type { D1Database, Env, Identity } from '../src/types';

const identity: Identity = { id: 1, nome: 'Admin', email: 'admin@example.test', role: 'admin', ativo: 1, unidadeIds: [1], scope: ['sorria.read'], clientId: 'test' };
const financial: Identity = { ...identity, scope: [...identity.scope, 'sorria.finance.read'] };
let db: DatabaseSync;
let env: Env;
function statement(sql: string, params: Array<string | number | null> = []) {
  return {
    bind: (...values: Array<string | number | null>) => statement(sql, values),
    first: async () => db.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    run: async () => ({ meta: db.prepare(sql).run(...params) }),
  };
}
beforeEach(() => {
  db = new DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true });
  db.exec(readFileSync(new URL('../../../lib/schema.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../../../lib/migrations/add_mcp_audit.sql', import.meta.url), 'utf8'));
  db.exec(`
    INSERT INTO unidades(id,nome) VALUES (1,'Autorizada'),(2,'Outra');
    INSERT INTO usuarios(id,nome,email,role,senha) VALUES (1,'Admin','admin@example.test','admin','segredo'),(2,'Outro','outro@example.test','executor','segredo2');
    INSERT INTO usuario_unidades(usuario_id,unidade_id) VALUES (1,1),(2,2);
    INSERT INTO usuario_roles(usuario_id,role) VALUES (1,'admin'),(2,'executor');
    INSERT INTO categorias(id,nome,slug) VALUES (1,'Execução','geral');
    INSERT INTO clientes(id,nome,cpf,telefone,email,observacoes) VALUES (1,'Permitido','12345678900','85999991234','paciente@example.test','conteudo clinico'),(2,'Outra unidade','99999999999','85999995678','fora@example.test','privado'),(3,'Sem vínculo',NULL,NULL,NULL,NULL);
    INSERT INTO procedimentos(id,nome,valor,categoria_id) VALUES (1,'Procedimento',150,1);
    INSERT INTO atendimentos(id,cliente_id,unidade_id,categoria_id,status) VALUES (1,1,1,1,'em_execucao'),(2,2,2,1,'em_execucao');
    INSERT INTO itens_atendimento(id,atendimento_id,procedimento_id,executor_id,criado_por_id,valor,status) VALUES (1,1,1,1,1,150,'pago'),(2,2,1,2,2,999,'pago');
    INSERT INTO agendamentos(id,cliente_id,unidade_id,tipo,status,procedimento_id) VALUES (1,1,1,'procedimento','agendado',1),(2,2,2,'procedimento','agendado',1);
    INSERT INTO followup_tarefas(id,cliente_id,unidade_id,responsavel_usuario_id,criado_por_id,tipo,titulo,vencimento_em) VALUES (1,1,1,1,1,'retorno','operacional','2026-11-07'),(2,1,1,1,1,'cobranca','financeiro','2026-11-07');
    INSERT INTO pagamentos(id,atendimento_id,recebido_por_id,valor,metodo) VALUES (1,1,1,150,'pix'),(2,2,2,999,'pix');
  `);
  env = { DB: { prepare: statement } as unknown as D1Database, MCP_ALLOWED_EMAILS: identity.email } as Env;
});
afterEach(() => db.close());
function query(sql: string, extra = {}, who = identity) { return queryDataset(env, who, { sql, ...extra }); }
function lines(result: Awaited<ReturnType<typeof queryDataset>>) { return result.linhas as Array<Record<string, unknown>>; }

describe('exploração SQL com banco real', () => {
  it('cruza dados, aceita parâmetros e retorna somente a unidade autorizada', async () => {
    const result=await query('SELECT a.id,c.nome,COUNT(i.id) AS total FROM atendimentos a JOIN clientes c ON c.id=a.cliente_id LEFT JOIN itens_atendimento i ON i.atendimento_id=a.id WHERE a.status=? GROUP BY a.id,c.nome ORDER BY a.id',{parametros:['em_execucao']});
    expect(lines(result)).toEqual([{id:1,nome:'Permitido',total:1}]);
  });
  it('isola unidades com CTE, UNION e subconsulta', async () => {
    expect(lines(await query('WITH encontrados AS (SELECT id FROM clientes) SELECT id FROM encontrados UNION SELECT cliente_id AS id FROM (SELECT * FROM agendamentos) a ORDER BY id'))).toEqual([{id:1}]);
  });
  it('mascara contatos na fonte mesmo com aliases e filtros', async () => {
    expect(lines(await query('SELECT cpf AS documento,telefone AS contato,email FROM clientes'))).toEqual([{documento:'***.***.***-00',contato:'***1234',email:'p***@example.test'}]);
    expect(lines(await query("SELECT COUNT(*) AS total FROM clientes WHERE telefone='85999991234'"))).toEqual([{total:0}]);
  });
  it('esconde credenciais e texto clínico', async () => {
    expect((await describeDataset(env,identity,'usuarios')).colunas.map(c=>c.nome)).not.toContain('senha');
    await expect(query('SELECT senha AS inocente FROM usuarios')).rejects.toThrow();
    await expect(query('SELECT observacoes AS inocente FROM clientes')).rejects.toThrow();
    await expect(describeDataset(env,identity,'prontuarios')).rejects.toThrow();
  });
  it('financeiro não pode escapar por aliases ou filtros', async () => {
    expect(exploreDatabase(identity).tabelas.some(t=>t.nome==='pagamentos')).toBe(false);
    await expect(query('SELECT valor AS inocente FROM itens_atendimento')).rejects.toThrow();
    await expect(query('SELECT id FROM itens_atendimento WHERE valor>10')).rejects.toThrow();
    expect(lines(await query('SELECT id FROM followup_tarefas'))).toEqual([{id:1}]);
    expect(lines(await query('SELECT valor AS inocente FROM pagamentos',{},financial))).toEqual([{inocente:150}]);
    expect(lines(await query('SELECT COUNT(*) AS total FROM followup_tarefas',{},financial))).toEqual([{total:2}]);
  });
  it('todas as projeções executam no schema real', async () => {
    for (const who of [identity,financial]) for (const table of exploreDatabase(who).tabelas) {
      try { expect((await query(`SELECT * FROM ${table.nome} LIMIT 1`,{},who)).quantidade).toBeLessThanOrEqual(1); }
      catch(error) { throw new Error(`${table.nome}: ${String(error)}`); }
    }
  });
  it('pagina com limite e valida seleção de unidade', async () => {
    const who={...identity,unidadeIds:[1,2]};
    const first=await query('SELECT id FROM atendimentos ORDER BY id',{limite:1},who);
    expect(lines(first)).toEqual([{id:1}]);expect(first.proximo_offset).toBe(1);
    expect(lines(await query('SELECT id FROM atendimentos ORDER BY id',{limite:1,offset:1},who))).toEqual([{id:2}]);
    expect(lines(await query('SELECT id FROM atendimentos',{unidadeId:2},who))).toEqual([{id:2}]);
    await expect(query('SELECT * FROM atendimentos',{unidadeId:2})).rejects.toThrow('Unidade não autorizada');
    expect(lines(await query('SELECT id FROM atendimentos',{}, {...identity,unidadeIds:[]}))).toEqual([]);
  });
  it('EXPLAIN não grava nem retorna dados dos pacientes', async () => {
    const before=db.prepare('SELECT * FROM atendimentos').all();
    const result=await queryDataset(env,identity,{sql:'SELECT id FROM atendimentos WHERE id=?',parametros:[1]},true);
    expect((result.plano as unknown[]).length).toBeGreaterThan(0);expect(result.linhas).toBeUndefined();
    expect(db.prepare('SELECT * FROM atendimentos').all()).toEqual(before);
  });
  it('aceita CASE, datas e ponto e vírgula dentro de texto', async () => {
    expect(lines(await query("SELECT CASE WHEN id=1 THEN 'x; DELETE FROM clientes' ELSE 'y' END AS resultado,date(created_at) AS dia FROM atendimentos;"))[0].resultado).toBe('x; DELETE FROM clientes');
  });
  it('preserva texto entre aspas e parâmetros sem executar seu conteúdo', async () => {
    const text="x'; DELETE FROM clientes; --";
    expect(lines(await query('SELECT ? AS texto',{parametros:[text]}))).toEqual([{texto:text}]);
    expect(lines(await query("SELECT 'x''; DELETE FROM clientes; --' AS texto"))).toEqual([{texto:text}]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM clientes').get()?.n).toBe(3);
  });
  it('recusa parâmetros e limites inválidos sem executar SQL', async () => {
    await expect(query('SELECT ? AS valor',{parametros:[]})).rejects.toThrow('Parâmetros inválidos');
    await expect(query('SELECT id FROM clientes',{limite:201})).rejects.toThrow('Paginação inválida');
    await expect(query('SELECT id FROM clientes',{offset:10001})).rejects.toThrow('Paginação inválida');
    expect(()=>compileExplorationSql(identity,' '.repeat(8001))).toThrow();
  });
  it('bloqueia resposta excessiva', async () => {
    db.prepare('UPDATE clientes SET nome=? WHERE id=1').run('x'.repeat(65000));
    await expect(query('SELECT nome FROM clientes')).rejects.toThrow('Uma linha excede');
  });
  it.each([
    'DELETE FROM clientes',"UPDATE clientes SET nome='x'","INSERT INTO clientes(nome) VALUES('x')",'DROP TABLE clientes',
    'PRAGMA query_only=OFF',"ATTACH DATABASE 'x' AS outra",'SELECT 1; DELETE FROM clientes','SELECT 1; SELECT 2',
    'SELECT * FROM main.clientes','SELECT * FROM temp.clientes','SELECT * FROM sqlite_master','SELECT * FROM prontuarios','SELECT * FROM pagamentos', 'SELECT "valor" FROM itens_atendimento',
    "SELECT * FROM pragma_table_info('usuarios')","SELECT load_extension('x')",'SELECT randomblob(10000000)',
    'SELECT * FROM atendimentos a CROSS JOIN atendimentos b','SELECT * FROM atendimentos a, atendimentos b', 'SELECT * FROM atendimentos a JOIN atendimentos b ON 1=1', 'SELECT * FROM atendimentos a JOIN atendimentos b ON a.id=b.id OR 1=1',
    'WITH clientes AS (SELECT 1) SELECT * FROM clientes','WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x) SELECT * FROM x',
    'WITH x AS (SELECT * FROM x) SELECT * FROM x','WITH x AS (SELECT * FROM y), y AS (SELECT * FROM x) SELECT * FROM x',
    'WITH x AS (SELECT * FROM main.clientes) SELECT * FROM x','SELECT * FROM (SELECT * FROM usuarios) u JOIN main.usuarios r ON r.id=u.id',
  ])('rejeita SQL fora da política: %s',sql=>{
    expect(()=>compileExplorationSql(identity,sql)).toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM clientes').get()?.n).toBe(3);
  });
});

async function connect(scope:string[]) {
  const server=createServer(env,{userId:1,email:identity.email,scope,clientId:'test'});
  const client=new Client({name:'test',version:'1.0'});
  const [ct,st]=InMemoryTransport.createLinkedPair();
  await server.connect(st);await client.connect(ct);return {client,server};
}
describe('contrato MCP',()=>{
  it('análise publica exploração e não publica escrita',async()=>{
    const {client,server}=await connect(['sorria.read']);
    try {
      const {tools}=await client.listTools();
      expect(tools.some(t=>t.name==='criar_cliente')).toBe(false);
      expect(tools.some(t=>t.name==='criar_agendamento_avaliacao')).toBe(false);
      for(const name of ['explorar_banco','descrever_tabela','consultar_sql','explicar_consulta']) expect(tools.find(t=>t.name===name)?.annotations?.readOnlyHint).toBe(true);
      expect((await client.callTool({name:'consultar_sql',arguments:{sql:'SELECT id FROM atendimentos',unidadeId:1}})).isError).not.toBe(true);
      expect(db.prepare("SELECT sucesso FROM mcp_audit_log WHERE ferramenta='consultar_sql'").get()?.sucesso).toBe(1);
    }finally{await client.close();await server.close();}
  });
  it('percorre descoberta, esquema, plano e consulta pelo protocolo MCP',async()=>{
    const {client,server}=await connect(['sorria.read']);
    const call=async(name:string,args:Record<string,unknown>)=>{
      const result=await client.callTool({name,arguments:args});
      expect(result.isError).not.toBe(true);
      const blocks=result.content as Array<{type:string;text:string}>;
      expect(new TextEncoder().encode(blocks[0].text).byteLength).toBeLessThanOrEqual(64000);
      return JSON.parse(blocks[0].text);
    };
    try {
      const catalog=await call('explorar_banco',{});
      expect(catalog.tabelas.some((t:{nome:string})=>t.nome==='atendimentos')).toBe(true);
      const schema=await call('descrever_tabela',{tabela:'atendimentos'});
      expect(schema.colunas.some((c:{nome:string})=>c.nome==='status')).toBe(true);
      const args={sql:'SELECT id FROM atendimentos WHERE status=? ORDER BY id',parametros:['em_execucao'],unidadeId:1};
      expect((await call('explicar_consulta',args)).plano.length).toBeGreaterThan(0);
      expect((await call('consultar_sql',args)).linhas).toEqual([{id:1}]);
    }finally{await client.close();await server.close();}
  });
  it('audita recusa e bloqueia chamada direta de escrita',async()=>{
    const {client,server}=await connect(['sorria.read']);
    try {
      expect((await client.callTool({name:'consultar_sql',arguments:{sql:'DELETE FROM clientes'}})).isError).toBe(true);
      expect(db.prepare("SELECT sucesso FROM mcp_audit_log WHERE ferramenta='consultar_sql'").get()?.sucesso).toBe(0);
      expect((await client.callTool({name:'criar_cliente',arguments:{nome:'x',origem:'fachada'}})).isError).toBe(true);
      expect(db.prepare('SELECT COUNT(*) AS n FROM clientes').get()?.n).toBe(3);
    }finally{await client.close();await server.close();}
  });
  it('mantém SDR autorizado e não permite SQL com apenas sorria.write',async()=>{
    const {client,server}=await connect(['sorria.write']);
    try {
      expect((await client.listTools()).tools.some(t=>t.name==='criar_cliente')).toBe(true);
      expect((await client.callTool({name:'consultar_sql',arguments:{sql:'SELECT id FROM clientes'}})).isError).toBe(true);
    }finally{await client.close();await server.close();}
  });
});
