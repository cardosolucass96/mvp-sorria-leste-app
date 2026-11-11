import { createSqliteDb } from '../helpers/sqlite-db.cjs';
import { __resetMocks, __setMockDb } from '../../__mocks__/opennextjs-cloudflare';
import { listarVendasPorCategoria } from '@/lib/financeiro/vendas-por-categoria';

test('atribui cada item à sua categoria no primeiro pagamento válido da unidade', async () => {
  const { sqlite, binding } = createSqliteDb();
  __setMockDb(binding);

  try {
    sqlite.exec(`
      INSERT INTO unidades(id,nome) VALUES (1,'Unidade A'),(2,'Unidade B');
      INSERT INTO usuarios(id,nome,email,role) VALUES (1,'Teste','teste@example.test','admin');
      INSERT INTO clientes(id,nome) VALUES (1,'Cliente A'),(2,'Cliente B');
      INSERT INTO procedimentos(id,nome,valor,categoria_catalogo,ativo) VALUES
        (1,'Limpeza',100,'prevencao-periodontia',1),(2,'Canal',220,'endodontia',0),(3,'Ajuste',35,NULL,1);
      INSERT INTO atendimentos(id,cliente_id,unidade_id) VALUES (1,1,1),(2,2,2);
      INSERT INTO itens_atendimento(id,atendimento_id,procedimento_id,criado_por_id,valor,valor_final) VALUES
        (1,1,1,1,100,80),(2,1,2,1,220,200),(3,1,1,1,100,100),(4,2,1,1,100,100);
      INSERT INTO agendamentos(id,cliente_id,procedimento_id,unidade_id,valor,item_atendimento_origem_id) VALUES
        (1,1,3,1,35,NULL),(2,1,1,1,50,1);
      INSERT INTO pagamentos(id,atendimento_id,recebido_por_id,valor,metodo,cancelado,created_at) VALUES
        (1,1,1,50,'pix',0,'2026-11-11T10:00:00.000Z'),
        (2,1,1,35,'pix',0,'2026-11-11T11:00:00.000Z'),
        (3,1,1,50,'pix',0,'2026-11-11T12:00:00.000Z'),
        (4,1,1,100,'pix',0,'2026-11-11T02:59:59.000Z'),
        (5,1,1,25,'pix',1,'2026-11-10T10:00:00.000Z'),
        (6,2,1,100,'pix',0,'2026-11-11T12:00:00.000Z');
      INSERT INTO pagamentos_alocacoes(pagamento_id,item_atendimento_id,agendamento_id,valor_alocado) VALUES
        (1,1,NULL,30),(1,2,NULL,20),(2,NULL,1,35),(3,NULL,2,50),(4,3,NULL,100),(5,2,NULL,25),(6,4,NULL,100);
    `);

    await expect(listarVendasPorCategoria(1, '2026-11-11', '2026-11-11')).resolves.toEqual([
      { categoria_catalogo: 'endodontia', quantidade: 1, valor_vendido: 200 },
      { categoria_catalogo: 'prevencao-periodontia', quantidade: 1, valor_vendido: 80 },
      { categoria_catalogo: null, quantidade: 1, valor_vendido: 35 },
    ]);
  } finally {
    __resetMocks();
    sqlite.close();
  }
});
