import { readFileSync } from 'node:fs';
import { createSqliteDb } from '../helpers/sqlite-db.cjs';
import { __setMockDb, __resetMocks } from '../../__mocks__/opennextjs-cloudflare';
import { callRoute, createRouteContext } from '../helpers/api-test-helper';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('test'),
  verifyToken: jest.fn().mockResolvedValue({ sub: 1, role: 'admin', roles: ['admin'], unidade_ids: [1,2], unidade_atual: 1 }),
}));
import { POST as creditar } from '@/app/api/clientes/[id]/saldo/creditar/route';
import { POST as debitar } from '@/app/api/clientes/[id]/saldo/debitar/route';
import { POST as devolver } from '@/app/api/clientes/[id]/saldo/estornar-procedimento/route';
import { POST as transferir } from '@/app/api/clientes/[id]/saldo/transferir/route';
import { POST as pagar } from '@/app/api/atendimentos/[id]/pagamentos/route';
import { PUT as cancelar } from '@/app/api/atendimentos/[id]/pagamentos/[pagamentoId]/route';
import { POST as selecionarHoje } from '@/app/api/atendimentos/[id]/selecionar-hoje/route';
import { GET as orcamentos } from '@/app/api/orcamentos-em-aberto/route';
import { recalcularFinanceiroItem, somarAlocacoesAtivasDaEtapa } from '@/modules/financeiro/server/item-financeiro';
let db: ReturnType<typeof createSqliteDb>;
const migration = readFileSync('lib/migrations/financeiro/0001_creditos_rastreaveis.sql','utf8');
beforeEach(() => {
  db = createSqliteDb(); __setMockDb(db.binding); db.sqlite.exec(migration);
  db.sqlite.exec(`INSERT INTO unidades(id,nome) VALUES (1,'A'),(2,'B');
    INSERT INTO financeiro_configuracao VALUES (1,1);
    INSERT INTO usuarios(id,nome,email,role) VALUES (1,'Teste','teste@example.test','admin');
    INSERT INTO clientes(id,nome) VALUES (1,'Cliente A'),(2,'Cliente B');
    INSERT INTO procedimentos(id,nome,valor,comissao_venda) VALUES (1,'Teste',100,10);
    INSERT INTO atendimentos(id,cliente_id,unidade_id,status) VALUES (1,1,1,'aguardando_pagamento'),(2,2,2,'aguardando_pagamento');
    INSERT INTO itens_atendimento(id,atendimento_id,procedimento_id,criado_por_id,valor,valor_final)
      VALUES (1,1,1,1,100,100),(2,1,1,1,100,100),(3,2,1,1,100,100);`);
});
afterEach(() => { __resetMocks(); db.sqlite.close(); });
function post(handler: typeof creditar, body: Record<string, unknown>, cliente=1, key?: string) {
  return callRoute<Record<string, unknown>>(handler, `/api/clientes/${cliente}/saldo/teste`, { method:'POST',body,headers:key ? {'Idempotency-Key':key}:{} }, createRouteContext({id:String(cliente)}));
}
function receber(valor=100, item=1, key?: string) {
  return callRoute<{id:number;error?:string}>(pagar, '/api/atendimentos/1/pagamentos', { method:'POST',body:{valor,metodo:'pix',alocacoes:[{item_id:item,valor}]},headers:key ? {'Idempotency-Key':key}:{} }, createRouteContext({id:'1'}));
}
function cancel(id:number, key?:string) {
  return callRoute(cancelar, `/api/atendimentos/1/pagamentos/${id}`, { method:'PUT',body:{motivo:'Teste'},headers:key ? {'Idempotency-Key':key}:{} }, createRouteContext({id:'1',pagamentoId:String(id)}));
}
function one(sql:string) { return db.sqlite.prepare(sql).get(); }
function wallet(id=1) { return one(`SELECT saldo FROM saldo_clientes WHERE cliente_id=${id}`)?.saldo ?? 0; }
async function convertido() {
  const p = await receber(); expect(p.status).toBe(201);
  expect((await post(devolver,{item_atendimento_id:1})).status).toBe(200);
  return p.data.id;
}

test('crédito usado sobrevive ao recálculo; devolução libera cobertura e comissão', async () => {
  expect((await post(creditar,{valor:100})).status).toBe(201);
  expect((await post(debitar,{item_atendimento_id:1,atendimento_id:1})).status).toBe(200);
  await recalcularFinanceiroItem(1);
  expect(one('SELECT valor_pago FROM itens_atendimento WHERE id=1').valor_pago).toBe(100);
  expect(one('SELECT SUM(valor_comissao) n FROM comissoes').n).toBe(10);
  expect((await post(devolver,{item_atendimento_id:1})).status).toBe(200);
  await recalcularFinanceiroItem(1);
  expect(one('SELECT valor_pago FROM itens_atendimento WHERE id=1').valor_pago).toBe(0);
  expect(wallet()).toBe(100);
  expect(one('SELECT COUNT(*) n FROM comissoes').n).toBe(0);
});

test('cancelar pagamento parcial mantém a cobertura feita com outro crédito', async () => {
  const p = await receber(60); expect(p.status).toBe(201);
  await post(creditar,{valor:40});
  expect((await post(debitar,{item_atendimento_id:1,atendimento_id:1})).status).toBe(200);
  expect((await cancel(p.data.id)).status).toBe(200);
  expect(one('SELECT valor_pago FROM itens_atendimento WHERE id=1').valor_pago).toBe(40);
  expect(one('SELECT SUM(valor_comissao) n FROM comissoes').n).toBe(4);
});

test('cancelamento reverte somente o crédito original intacto e preserva novo recebimento', async () => {
  const p = await convertido();
  await recalcularFinanceiroItem(1);
  expect(one('SELECT valor_pago FROM itens_atendimento WHERE id=1').valor_pago).toBe(0);
  expect((await receber(40)).status).toBe(201);
  expect((await cancel(p)).status).toBe(200);
  expect(wallet()).toBe(0);
  expect(one('SELECT valor_pago FROM itens_atendimento WHERE id=1').valor_pago).toBe(40);
  const orc = await callRoute<{items:Array<{atendimento_id:number;valor_aberto:number}>;summary:{valor_total_aberto:number}}>(orcamentos,'/api/orcamentos-em-aberto');
  expect(orc.data.summary.valor_total_aberto).toBe(160);
});

test('cancelamento de grupo reverte as duas origens e mantém crédito independente', async () => {
  const p = await callRoute<{id:number}>(pagar,'/api/atendimentos/1/pagamentos',{method:'POST',body:{valor_total:100,formas:[{metodo:'pix',valor:60},{metodo:'dinheiro',valor:40}],alocacoes:[{item_id:1,valor:100}]}},createRouteContext({id:'1'}));
  expect(p.status).toBe(201);
  await post(devolver,{item_atendimento_id:1}); await post(creditar,{valor:50});
  expect((await cancel(p.data.id)).status).toBe(200);
  expect(wallet()).toBe(50);
  expect(one('SELECT COUNT(*) n FROM pagamentos WHERE cancelado=1').n).toBe(2);
});

test('saldo suficiente de outra origem não permite cancelar crédito já usado', async () => {
  const p = await convertido();
  db.sqlite.exec('UPDATE itens_atendimento SET valor=30,valor_final=30 WHERE id=2');
  await post(debitar,{item_atendimento_id:2,atendimento_id:1}); await post(creditar,{valor:100});
  expect((await cancel(p)).status).toBe(409); expect(wallet()).toBe(170);
  expect(one(`SELECT cancelado FROM pagamentos WHERE id=${p}`).cancelado).toBe(0);
});

test('transferência preserva origem e bloqueia cancelamento', async () => {
  const p = await convertido();
  expect((await post(transferir,{cliente_destino_id:2,valor:10})).status).toBe(200);
  expect((await cancel(p)).status).toBe(409); expect(wallet()).toBe(90); expect(wallet(2)).toBe(10);
  expect(one('SELECT pagamento_origem_id FROM financeiro_creditos WHERE cliente_id=2').pagamento_origem_id).toBe(p);
});

test('FIFO usa primeiro crédito independente antigo e permite reverter origem intacta', async () => {
  await post(creditar,{valor:50}); const p = await convertido();
  db.sqlite.exec('UPDATE itens_atendimento SET valor=20,valor_final=20 WHERE id=2');
  await post(debitar,{item_atendimento_id:2,atendimento_id:1});
  expect((await cancel(p)).status).toBe(200); expect(wallet()).toBe(30);
});

test('bloqueia crédito legado sem origem comprovável', async () => {
  db.sqlite.exec(`INSERT INTO pagamentos(id,atendimento_id,recebido_por_id,valor,metodo) VALUES (1,1,1,100,'pix');
    INSERT INTO pagamentos_alocacoes(pagamento_id,item_atendimento_id,valor_alocado) VALUES (1,1,100);
    INSERT INTO saldo_clientes(cliente_id,saldo) VALUES (1,100);
    INSERT INTO movimentacoes_saldo(cliente_id,tipo,valor,saldo_anterior,saldo_novo,item_atendimento_id) VALUES (1,'estorno',100,0,100,1);`);
  expect((await cancel(1)).status).toBe(409); expect(wallet()).toBe(100);
});

test('repetição com a mesma chave devolve o mesmo recebimento sem duplicar', async () => {
  const p = await receber(100,1,'repetida'); expect(p.status).toBe(201);
  const again = await receber(100,1,'repetida'); expect(again).toEqual(p);
  expect((await receber(50,1,'repetida')).status).toBe(409);
  expect(one('SELECT COUNT(*) n FROM pagamentos').n).toBe(1);
});

test('duas tentativas simultâneas de usar saldo gravam apenas uma quitação', async () => {
  await post(creditar,{valor:100});
  const results = await Promise.all([post(debitar,{item_atendimento_id:1,atendimento_id:1}),post(debitar,{item_atendimento_id:1,atendimento_id:1})]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  expect(wallet()).toBe(0); expect(one('SELECT COUNT(*) n FROM financeiro_coberturas').n).toBe(1);
});

test('transferências simultâneas não gastam o mesmo saldo duas vezes', async () => {
  await post(creditar,{valor:100});
  const results = await Promise.all([post(transferir,{cliente_destino_id:2,valor:80}),post(transferir,{cliente_destino_id:2,valor:80})]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]); expect(wallet()).toBe(20); expect(wallet(2)).toBe(80);
});

test('recebimentos simultâneos não ultrapassam o valor restante', async () => {
  const results = await Promise.all([receber(),receber()]);
  expect(results.map(r=>r.status).sort()).toEqual([201,409]);
  expect(one('SELECT SUM(valor) n FROM pagamentos').n).toBe(100);
});

test('falha na cobertura desfaz saldo, extrato, consumo, comissão e operação', async () => {
  await post(creditar,{valor:100});
  db.sqlite.exec("CREATE TRIGGER falha BEFORE INSERT ON financeiro_coberturas BEGIN SELECT RAISE(ABORT,'teste'); END;");
  const log=jest.spyOn(console,'error').mockImplementation(()=>{});
  try { expect((await post(debitar,{item_atendimento_id:1,atendimento_id:1},1,'tentativa')).status).toBe(500); } finally { log.mockRestore(); }
  expect(wallet()).toBe(100); expect(one('SELECT COUNT(*) n FROM financeiro_consumos').n).toBe(0);
  expect(one('SELECT COUNT(*) n FROM movimentacoes_saldo').n).toBe(1);
  expect(one('SELECT COUNT(*) n FROM financeiro_operacoes').n).toBe(1);
  db.sqlite.exec('DROP TRIGGER falha');
  expect((await post(debitar,{item_atendimento_id:1,atendimento_id:1},1,'tentativa')).status).toBe(200);
});

test('falha ao cancelar pagamento desfaz também a reversão do crédito', async () => {
  const p=await convertido();
  db.sqlite.exec("CREATE TRIGGER falha BEFORE UPDATE ON pagamentos BEGIN SELECT RAISE(ABORT,'teste'); END;");
  const log=jest.spyOn(console,'error').mockImplementation(()=>{});
  try { expect((await cancel(p)).status).toBe(500); } finally { log.mockRestore(); }
  expect(wallet()).toBe(100); expect(one('SELECT COUNT(*) n FROM financeiro_consumos').n).toBe(0);
  expect(one(`SELECT cancelado FROM pagamentos WHERE id=${p}`).cancelado).toBe(0);
});

test('cobertura de crédito por sessão resiste ao recálculo e é liberada na devolução', async () => {
  db.sqlite.exec(`UPDATE procedimentos SET tem_etapas=1 WHERE id=1;
    INSERT INTO procedimento_etapas_modelo(id,procedimento_id,nome,valor,ordem) VALUES (1,1,'Etapa A',40,1),(2,1,'Etapa B',60,2);`);
  await post(creditar,{valor:100}); expect((await post(debitar,{item_atendimento_id:1,atendimento_id:1})).status).toBe(200);
  expect(await somarAlocacoesAtivasDaEtapa(1,1)).toBe(40); expect(await somarAlocacoesAtivasDaEtapa(1,2)).toBe(60);
  await post(devolver,{item_atendimento_id:1}); expect(await somarAlocacoesAtivasDaEtapa(1,1)).toBe(0);
});

test.each(['finalizado','encerrado'])('recebe pendência em atendimento %s sem reabrir nem alterar data', async status => {
  db.sqlite.prepare("UPDATE atendimentos SET status=?,created_at='2026-01-01T12:00:00Z',finalizado_at='2026-01-01T13:00:00Z' WHERE id=1").run(status);
  expect((await receber()).status).toBe(201);
  expect(one('SELECT status,created_at,finalizado_at FROM atendimentos WHERE id=1')).toEqual({status,created_at:'2026-01-01T12:00:00Z',finalizado_at:'2026-01-01T13:00:00Z'});
});

test('desligar adesão por unidade não restaura escritor antigo para conta já rastreada', async () => {
  const p=await convertido(); db.sqlite.exec('UPDATE financeiro_configuracao SET creditos_rastreaveis=0');
  expect((await cancel(p)).status).toBe(200); expect(wallet()).toBe(0);
});

test('pagamento alocado não pode produzir um segundo crédito pela rota manual', async () => {
  const p=await receber();
  expect((await post(creditar,{valor:100,pagamento_id:p.data.id})).status).toBe(409);
  expect(wallet()).toBe(0);
});

test('migração aditiva pode ser reaplicada sem duplicar registros nem ativar outra unidade', () => {
  db.sqlite.exec(migration);
  expect(one('SELECT COUNT(*) n FROM financeiro_configuracao').n).toBe(1);
  expect(one('SELECT COUNT(*) n FROM financeiro_versao').n).toBe(1);
});


test('crédito ligado a pagamento sem alocações é revertido automaticamente', async () => {
  db.sqlite.exec("INSERT INTO pagamentos(id,atendimento_id,recebido_por_id,valor,metodo) VALUES (1,1,1,100,'pix')");
  expect((await post(creditar,{valor:100,pagamento_id:1})).status).toBe(201);
  expect((await cancel(1)).status).toBe(200); expect(wallet()).toBe(0);
});

test('recebimento de um centavo é alocado integralmente', async () => {
  db.sqlite.exec('UPDATE itens_atendimento SET valor=0.01,valor_final=0.01 WHERE id=1');
  expect((await receber(0.01)).status).toBe(201);
  expect(one('SELECT valor_alocado FROM pagamentos_alocacoes').valor_alocado).toBe(0.01);
});

test('cancelamento concorrente com uso de crédito produz apenas um resultado financeiro', async () => {
  const p=await convertido();
  const [c,u]=await Promise.all([cancel(p),post(debitar,{item_atendimento_id:2,atendimento_id:1})]);
  expect([c.status,u.status].sort()).toEqual([200,409]);
  expect(wallet()).toBe(0);
  expect(one(`SELECT cancelado FROM pagamentos WHERE id=${p}`).cancelado).toBe(c.status===200 ? 1 : 0);
  expect(one('SELECT valor_pago FROM itens_atendimento WHERE id=2').valor_pago).toBe(u.status===200 ? 100 : 0);
});

test('agenda vinculada acompanha crédito, devolução e recálculo por sessão', async () => {
  db.sqlite.exec(`UPDATE procedimentos SET tem_etapas=1 WHERE id=1;
    INSERT INTO procedimento_etapas_modelo(id,procedimento_id,nome,valor) VALUES (1,1,'A',40),(2,1,'B',60);
    INSERT INTO agendamentos(id,cliente_id,unidade_id,procedimento_id,tipo,atendimento_origem_id,item_atendimento_origem_id,etapa_modelo_id,valor)
    VALUES (1,1,1,1,'procedimento',1,1,1,40),(2,1,1,1,'procedimento',1,1,2,60);`);
  await post(creditar,{valor:100}); await post(debitar,{item_atendimento_id:1,atendimento_id:1});
  expect(one('SELECT valor_pago,pago FROM agendamentos WHERE id=1')).toEqual({valor_pago:40,pago:1});
  expect(one('SELECT valor_pago,pago FROM agendamentos WHERE id=2')).toEqual({valor_pago:60,pago:1});
  await post(devolver,{item_atendimento_id:1}); await recalcularFinanceiroItem(1);
  expect(one('SELECT SUM(valor_pago) total FROM agendamentos').total).toBe(0);
});

test('sessão individual usa seu valor completo sem repartir novamente pelo modelo', async () => {
  db.sqlite.exec(`UPDATE procedimentos SET tem_etapas=1 WHERE id=1;
    INSERT INTO procedimento_etapas_modelo(id,procedimento_id,nome,valor) VALUES (1,1,'A',40),(2,1,'B',60);
    UPDATE itens_atendimento SET etapa_modelo_id=1,valor=40,valor_final=40 WHERE id=1;`);
  await post(creditar,{valor:40}); expect((await post(debitar,{item_atendimento_id:1,atendimento_id:1})).status).toBe(200);
  expect(await somarAlocacoesAtivasDaEtapa(1,1)).toBe(40);
});

test('divisão antiga de sessões é bloqueada antes de modificar destinos ou origem financeira', async () => {
  db.sqlite.exec(`UPDATE procedimentos SET tem_etapas=1 WHERE id=1;
    INSERT INTO procedimento_etapas_modelo(id,procedimento_id,nome,valor) VALUES (1,1,'A',40),(2,1,'B',60);`);
  await post(creditar,{valor:100}); await post(debitar,{item_atendimento_id:1,atendimento_id:1});
  db.sqlite.exec("INSERT INTO itens_atendimento_destinos(atendimento_id,item_atendimento_id,etapa_modelo_id,destino_status) VALUES (1,1,1,'agendar')");
  const result=await callRoute(selecionarHoje,'/api/atendimentos/1/selecionar-hoje',{method:'POST',body:{destinos:[{item_id:1,etapa_modelo_id:1,destino_status:'fazer_hoje'}]}},createRouteContext({id:'1'}));
  expect(result.status).toBe(409);
  expect(one('SELECT destino_status FROM itens_atendimento_destinos WHERE item_atendimento_id=1').destino_status).toBe('agendar');
  expect(await somarAlocacoesAtivasDaEtapa(1,1)).toBe(40);
});
