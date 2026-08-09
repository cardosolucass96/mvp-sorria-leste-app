import { describe, expect, it } from 'vitest';
import { handleBiApi } from '../src/bi-api';
import type { D1Database, D1PreparedStatement, Env } from '../src/types';

class MockStatement implements D1PreparedStatement {
  params: unknown[] = [];

  constructor(readonly sql: string) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.params = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    return null;
  }

  async all<T = unknown>(): Promise<{ results?: T[] }> {
    return { results: [] };
  }

  async run<T = Record<string, unknown>>(): Promise<{ results?: T[]; success?: boolean; meta?: { last_row_id?: number; changes?: number } }> {
    return { success: true, meta: { changes: 0 } };
  }

  async raw<T = unknown>(): Promise<T[]> {
    return [];
  }
}

class MockD1 implements D1Database {
  readonly statements: MockStatement[] = [];

  prepare(query: string): D1PreparedStatement {
    const statement = new MockStatement(query);
    this.statements.push(statement);
    return statement;
  }

  async batch<T = unknown>(): Promise<Array<{ results?: T[] }>> {
    return [
      { results: [{ origem: 'trafego_meta', total: 2 }, { origem: 'fachada', total: 1 }] as T[] },
      { results: [{ origem: 'trafego_meta', total: 350.5 }, { origem: 'organico', total: 90 }] as T[] },
      {
        results: [
          { origem: 'trafego_meta', quantidade: 2, total: 350.5 },
          { origem: 'fachada', quantidade: 1, total: 0 },
          { origem: 'organico', quantidade: 1, total: 90 },
        ] as T[],
      },
      { results: [{ origem: 'trafego_meta', total: 100 }, { origem: 'fachada', total: 50 }] as T[] },
    ];
  }

  async exec(): Promise<{ count: number; duration: number }> {
    return { count: 0, duration: 0 };
  }
}

function createEnv(db = new MockD1()): { env: Env; db: MockD1 } {
  return {
    db,
    env: {
      DB: db,
      OAUTH_KV: {},
      MCP_ALLOWED_EMAILS: '',
      MCP_WRITE_ALLOWED_EMAILS: '',
      SDR_API_KEY: 'sdr-secret',
      BI_API_KEY: 'bi-secret',
      SDR_DEFAULT_UNIT_ID: '3',
      SDR_CREATED_BY_USER_ID: '58',
      OAUTH_PROVIDER: {},
    } as Env,
  };
}

describe('API de BI', () => {
  it('retorna métricas consolidadas por origem e respeita o dia de Fortaleza', async () => {
    const { env, db } = createEnv();
    const response = await handleBiApi(new Request('https://mcp.test/api/bi/relatorio-diario', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer bi-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ unidadeId: 3, data: '2026-08-05' }),
    }), env);
    const payload = await response.json() as {
      ok: boolean;
      janelaUtc: { inicioUtc: string; fimUtc: string };
      totais: {
        atendimentosCriados: number;
        valorItensCriados: number;
        procedimentosAvaliados: number;
        valorProcedimentosAvaliados: number;
        recebidoBruto: number;
      };
      porOrigem: Array<{
        origem: string;
        atendimentosCriados: number;
        valorItensCriados: number;
        procedimentosAvaliados: number;
        valorProcedimentosAvaliados: number;
        recebidoBruto: number;
      }>;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.janelaUtc).toEqual({
      inicioUtc: '2026-08-05T03:00:00.000Z',
      fimUtc: '2026-08-06T03:00:00.000Z',
    });
    expect(payload.totais).toEqual({
      atendimentosCriados: 3,
      valorItensCriados: 440.5,
      procedimentosAvaliados: 4,
      valorProcedimentosAvaliados: 440.5,
      recebidoBruto: 150,
    });
    expect(payload.porOrigem).toEqual([
      {
        origem: 'trafego_meta',
        atendimentosCriados: 2,
        valorItensCriados: 350.5,
        procedimentosAvaliados: 2,
        valorProcedimentosAvaliados: 350.5,
        recebidoBruto: 100,
      },
      {
        origem: 'fachada',
        atendimentosCriados: 1,
        valorItensCriados: 0,
        procedimentosAvaliados: 1,
        valorProcedimentosAvaliados: 0,
        recebidoBruto: 50,
      },
      {
        origem: 'organico',
        atendimentosCriados: 0,
        valorItensCriados: 90,
        procedimentosAvaliados: 1,
        valorProcedimentosAvaliados: 90,
        recebidoBruto: 0,
      },
    ]);
    expect(db.statements).toHaveLength(4);
    for (const statement of db.statements) {
      expect(statement.params).toEqual([3, '2026-08-05T03:00:00.000Z', '2026-08-06T03:00:00.000Z']);
    }
    expect(db.statements[0].sql).toContain("replace(TRIM(a.created_at), ' ', 'T') || 'Z'");
    expect(db.statements[1].sql).toContain("replace(TRIM(i.created_at), ' ', 'T') || 'Z'");
  });

  it('rejeita a requisição sem a chave própria de BI', async () => {
    const { env, db } = createEnv();
    const response = await handleBiApi(new Request('https://mcp.test/api/bi/relatorio-diario', {
      method: 'POST',
      body: JSON.stringify({ unidadeId: 3, data: '2026-08-05' }),
    }), env);

    expect(response.status).toBe(401);
    expect(db.statements).toHaveLength(0);
  });

  it('rejeita datas impossíveis antes de consultar o banco', async () => {
    const { env, db } = createEnv();
    const response = await handleBiApi(new Request('https://mcp.test/api/bi/relatorio-diario', {
      method: 'POST',
      headers: { Authorization: 'Bearer bi-secret' },
      body: JSON.stringify({ unidadeId: 3, data: '2026-02-31' }),
    }), env);

    expect(response.status).toBe(400);
    expect(db.statements).toHaveLength(0);
  });
});
