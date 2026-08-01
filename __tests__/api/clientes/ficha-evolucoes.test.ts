import { GET as buscarFichaCliente } from '@/app/api/clientes/[id]/ficha/route';
import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  mockQueryResponse,
  getExecutedQueries,
  resetMockDb,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../../helpers/db-mock';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
  jest.clearAllMocks();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('GET /api/clientes/[id]/ficha - evoluções clínicas', () => {
  it('retorna uma evolução agrupada uma vez e preserva evolução individual', async () => {
    mockQueryResponse('select id from clientes where id', { id: 5 });
    mockQueryResponse('from prontuario_evolucoes pe', [
      {
        evolucao_id: 8,
        atendimento_id: 50,
        prontuario_id: null,
        prontuario_descricao: 'Evolução clínica compartilhada entre procedimentos.',
        prontuario_observacoes: 'Sem intercorrências',
        prontuario_data: '2026-07-25T12:00:00.000Z',
        prontuario_updated_at: '2026-07-25T12:00:00.000Z',
        prontuario_autor: 'Ana Atendente',
        item_id: 10,
        concluido_at: '2026-07-25T12:00:00.000Z',
        dentes: '11',
        quantidade: 1,
        item_observacoes: null,
        procedimento_nome: 'Restauração',
        etapa_label: null,
        executor_nome: 'Dra. Ana',
      },
      {
        evolucao_id: 8,
        atendimento_id: 50,
        prontuario_id: null,
        prontuario_descricao: 'Evolução clínica compartilhada entre procedimentos.',
        prontuario_observacoes: 'Sem intercorrências',
        prontuario_data: '2026-07-25T12:00:00.000Z',
        prontuario_updated_at: '2026-07-25T12:00:00.000Z',
        prontuario_autor: 'Ana Atendente',
        item_id: 11,
        concluido_at: '2026-07-25T12:05:00.000Z',
        dentes: null,
        quantidade: 1,
        item_observacoes: 'Paciente tolerou bem',
        procedimento_nome: 'Profilaxia',
        etapa_label: null,
        executor_nome: 'Dra. Ana',
      },
      {
        evolucao_id: 9,
        atendimento_id: 51,
        prontuario_id: 21,
        prontuario_descricao: 'Evolução individual legada.',
        prontuario_observacoes: null,
        prontuario_data: '2026-07-25T13:00:00.000Z',
        prontuario_updated_at: '2026-07-25T13:00:00.000Z',
        prontuario_autor: 'Dr. Bruno',
        item_id: 12,
        concluido_at: '2026-07-25T13:00:00.000Z',
        dentes: null,
        quantidade: 1,
        item_observacoes: null,
        procedimento_nome: 'Consulta',
        etapa_label: null,
        executor_nome: 'Dr. Bruno',
      },
    ]);

    const { status, data } = await callRoute<{
      prontuarios: Array<{
        evolucao_id: number;
        procedimento_nome: string;
        item_id: number;
        quantidade: number;
        executor_nome: string | null;
        prontuario_autor: string;
        itens: Array<{ item_id: number; procedimento_nome: string }>;
      }>;
    }>(
      buscarFichaCliente,
      '/api/clientes/5/ficha',
      {},
      createRouteContext({ id: '5' })
    );

    expect(status).toBe(200);
    expect(data.prontuarios).toHaveLength(2);
    expect(data.prontuarios[0]).toMatchObject({
      evolucao_id: 8,
      procedimento_nome: '2 procedimentos',
      item_id: 10,
      quantidade: 2,
      executor_nome: 'Dra. Ana',
      prontuario_autor: 'Ana Atendente',
    });
    expect(data.prontuarios[0].itens.map((item) => item.procedimento_nome)).toEqual([
      'Restauração',
      'Profilaxia',
    ]);
    expect(data.prontuarios[1]).toMatchObject({
      evolucao_id: 9,
      procedimento_nome: 'Consulta',
      item_id: 12,
      quantidade: 1,
    });

    const queries = getExecutedQueries().map((query) => query.sql.toLowerCase());
    expect(queries.some((sql) => sql.includes('sum(coalesce(i.valor_final, i.valor))'))).toBe(true);
    expect(queries.some((sql) => sql.includes('coalesce(i.valor_final, i.valor) as valor'))).toBe(true);
  });
});
