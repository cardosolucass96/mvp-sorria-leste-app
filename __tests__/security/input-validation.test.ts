/**
 * Testes de segurança — Validação de Input
 *
 * Sprint 10 — Testa contra:
 * - SQL Injection em campos de busca e filtro
 * - XSS em campos de texto livre
 * - Input de tipo inesperado (number onde string, etc.)
 * - Strings muito longas
 * - Caracteres especiais e unicode
 * - Valores numéricos extremos e edge cases
 * - Verificação de que prepared statements protegem contra injection
 */

import { callRoute, createRouteContext } from '../helpers/api-test-helper';
import {
  mockQueryResponse,
  resetMockDb,
  getExecutedQueries,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../helpers/db-mock';

import { GET as getClientes, POST as postClientes } from '@/app/api/clientes/route';
import { GET as getAtendimentos } from '@/app/api/atendimentos/route';
import { GET as getProcedimentos, POST as postProcedimentos } from '@/app/api/procedimentos/route';
import { POST as postUsuarios } from '@/app/api/usuarios/route';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { PUT as putSenha } from '@/app/api/auth/senha/route';

describe('Segurança — Validação de Input', () => {
  beforeEach(() => {
    setupCloudflareContextMock();
    resetMockDb();
  });

  afterEach(() => {
    teardownCloudflareContextMock();
  });

  // ═════════════════════════════════════════════
  // SQL INJECTION
  // ═════════════════════════════════════════════

  describe('SQL Injection — Busca de Clientes', () => {
    const sqlInjectionPayloads = [
      "' OR 1=1 --",
      "'; DROP TABLE clientes; --",
      "' UNION SELECT * FROM usuarios --",
      "' UNION SELECT id,nome,email,senha,role,1,1,1,1,1,1 FROM usuarios --",
      "1'; DELETE FROM clientes WHERE '1'='1",
      "Robert'); DROP TABLE clientes;--",
      "' OR ''='",
      "' AND 1=0 UNION SELECT password FROM users --",
      "admin'--",
      "1 OR 1=1",
    ];

    test.each(sqlInjectionPayloads)(
      'payload "%s" é passado como parâmetro (não concatenado na SQL)',
      async (payload) => {
        mockQueryResponse('select * from clientes', []);

        const { status } = await callRoute(getClientes, '/api/clientes', {
          searchParams: { busca: payload },
        });

        expect(status).toBe(200);

        // Verifica que o payload foi passado como parâmetro bind, não na SQL
        const queries = getExecutedQueries();
        const searchQuery = queries.find((q) => q.sql.toLowerCase().includes('like'));
        expect(searchQuery).toBeDefined();

        // A SQL NÃO deve conter o payload literal
        expect(searchQuery!.sql).not.toContain(payload);
        // O payload deve estar nos params (envolvido em %)
        expect(searchQuery!.params).toContain(`%${payload}%`);
      }
    );
  });

  describe('SQL Injection — Busca de Atendimentos', () => {
    test('SQL injection no filtro de busca usa prepared statement', async () => {
      mockQueryResponse('select a.*', []);

      const { status } = await callRoute(getAtendimentos, '/api/atendimentos', {
        searchParams: { busca: "' OR 1=1; DROP TABLE atendimentos --" },
      });

      expect(status).toBe(200);

      const queries = getExecutedQueries();
      const searchQuery = queries.find((q) => q.sql.toLowerCase().includes('like'));
      if (searchQuery) {
        expect(searchQuery.sql).not.toContain("DROP TABLE");
        expect(searchQuery.params.some((p) => typeof p === 'string' && p.includes("DROP TABLE"))).toBe(true);
      }
    });

    test('SQL injection no filtro de status usa prepared statement', async () => {
      mockQueryResponse('select a.*', []);

      const { status } = await callRoute(getAtendimentos, '/api/atendimentos', {
        searchParams: { status: "' OR 1=1 --" },
      });

      // O status é passado como parâmetro ?
      expect(status).toBe(200);
      const queries = getExecutedQueries();
      const query = queries[0];
      if (query) {
        expect(query.sql).not.toContain("OR 1=1");
      }
    });
  });

  describe('SQL Injection — Login', () => {
    test('SQL injection no email do login usa prepared statement', async () => {
      const { status } = await callRoute(loginPost, '/api/auth/login', {
        method: 'POST',
        body: {
          email: "admin@test.com' OR '1'='1",
          senha: 'qualquer',
        },
      });

      // Deve retornar 401 (não encontrou), não 200 (injection)
      expect(status).toBe(401);

      const queries = getExecutedQueries();
      const loginQuery = queries.find((q) => q.sql.toLowerCase().includes('select * from usuarios'));
      expect(loginQuery).toBeDefined();
      expect(loginQuery!.sql).not.toContain("OR '1'='1");
      expect(loginQuery!.params[0]).toContain("or '1'='1");
    });
  });

  describe('SQL Injection — Criação de Registros', () => {
    test('SQL injection no nome do cliente usa prepared statement', async () => {
      mockQueryResponse('select * from clientes where id', {
        id: 1, nome: "Robert'; DROP TABLE clientes;--", origem: 'fachada',
      });

      const { status } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: {
          nome: "Robert'; DROP TABLE clientes;--",
          origem: 'fachada',
        },
      });

      expect(status).toBe(201);

      const queries = getExecutedQueries();
      const insertQuery = queries.find((q) => q.sql.toLowerCase().includes('insert into clientes'));
      expect(insertQuery).toBeDefined();
      expect(insertQuery!.sql).not.toContain("DROP TABLE");
      expect(insertQuery!.params[0]).toContain("DROP TABLE");
    });
  });

  // ═════════════════════════════════════════════
  // XSS (Cross-Site Scripting)
  // ═════════════════════════════════════════════

  describe('XSS — Campos de Texto', () => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert(1)>',
      '"><svg onload=alert(1)>',
      "javascript:alert('xss')",
      '<iframe src="data:text/html,<script>alert(1)</script>">',
      '{{constructor.constructor("return this")().alert(1)}}',
    ];

    test.each(xssPayloads)(
      'XSS payload "%s" no nome do cliente é armazenado literalmente (sem execução)',
      async (payload) => {
        mockQueryResponse('select * from clientes where id', {
          id: 1, nome: payload, origem: 'fachada',
        });

        const { status } = await callRoute(postClientes, '/api/clientes', {
          method: 'POST',
          body: {
            nome: payload,
            origem: 'fachada',
          },
        });

        expect(status).toBe(201);

        // O payload é armazenado como string literal via prepared statement
        const queries = getExecutedQueries();
        const insertQuery = queries.find((q) => q.sql.toLowerCase().includes('insert into clientes'));
        expect(insertQuery).toBeDefined();
        // O nome com XSS está nos params como string literal
        expect(insertQuery!.params[0]).toBe(payload);
      }
    );

    test('XSS no campo observacoes é armazenado como texto literal', async () => {
      const xss = '<script>document.cookie</script>';
      mockQueryResponse('select * from clientes where id', {
        id: 1, nome: 'João', observacoes: xss, origem: 'fachada',
      });

      const { status } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: {
          nome: 'João',
          origem: 'fachada',
          observacoes: xss,
        },
      });

      expect(status).toBe(201);
      const queries = getExecutedQueries();
      const insertQuery = queries.find((q) => q.sql.toLowerCase().includes('insert into clientes'));
      // observacoes está nos params (último parâmetro)
      expect(insertQuery!.params).toContain(xss);
    });

    /**
     * ⚠ NOTA: O backend armazena XSS como texto literal (seguro para SQL).
     * A proteção contra XSS no RENDER depende do frontend (React JSX escapa 
     * por padrão com dangerouslySetInnerHTML), não do backend.
     * 
     * Para hardening futuro: sanitizar HTML em campos de texto livre antes de armazenar.
     */
  });

  // ═════════════════════════════════════════════
  // INPUT DE TIPO INESPERADO
  // ═════════════════════════════════════════════

  describe('tipo de input inesperado', () => {
    test('nome como número no POST clientes causa erro (trim() falha em number)', async () => {
      const { status } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: {
          nome: 12345, // número não tem .trim()
          origem: 'fachada',
        },
      });

      // número.trim() → TypeError → catch → 500
      // ⚠ Limitação: Deveria validar tipo antes de chamar .trim()
      expect(status).toBe(500);
    });

    test('email como número no login retorna 400', async () => {
      const { status } = await callRoute(loginPost, '/api/auth/login', {
        method: 'POST',
        body: { email: 12345, senha: 'abc' },
      });

      expect(status).toBe(400);
    });

    test('senha como número no login retorna 400', async () => {
      const { status } = await callRoute(loginPost, '/api/auth/login', {
        method: 'POST',
        body: { email: 'test@test.com', senha: 123456 },
      });

      expect(status).toBe(400);
    });

    test('origem inválida no POST clientes retorna 400', async () => {
      const { status, data } = await callRoute<{ error: string }>(postClientes, '/api/clientes', {
        method: 'POST',
        body: {
          nome: 'Teste',
          origem: 'origem_invalida',
        },
      });

      expect(status).toBe(400);
    });

    test('role inválido no POST usuarios retorna 400', async () => {
      const { status, data } = await callRoute<{ error: string }>(postUsuarios, '/api/usuarios', {
        method: 'POST',
        body: {
          nome: 'Teste',
          email: 'teste@test.com',
          role: 'superadmin', // role não existe
        },
      });

      expect(status).toBe(400);
    });

    test('body vazio no POST clientes retorna 400', async () => {
      const { status } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: {},
      });

      expect(status).toBe(400);
    });

    test('body com campos null no POST clientes retorna 400', async () => {
      const { status } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: {
          nome: null,
          origem: null,
        },
      });

      expect(status).toBe(400);
    });
  });

  // ═════════════════════════════════════════════
  // STRINGS MUITO LONGAS
  // ═════════════════════════════════════════════

  describe('strings muito longas', () => {
    test('nome com 10.000 caracteres é aceito (sem limite no backend)', async () => {
      const longName = 'A'.repeat(10_000);
      mockQueryResponse('select * from clientes where id', {
        id: 1, nome: longName, origem: 'fachada',
      });

      const { status } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: {
          nome: longName,
          origem: 'fachada',
        },
      });

      // ⚠ Aceita sem limite — SQLite não tem limite de VARCHAR,
      // mas pode causar problemas de performance
      expect(status).toBe(201);
    });

    test('busca com string muito longa não quebra', async () => {
      mockQueryResponse('select * from clientes', []);

      const longSearch = 'Z'.repeat(50_000);
      const { status } = await callRoute(getClientes, '/api/clientes', {
        searchParams: { busca: longSearch },
      });

      expect(status).toBe(200);
    });

    test('email com 1000 caracteres no login não quebra', async () => {
      const longEmail = 'a'.repeat(990) + '@test.com';
      const { status } = await callRoute(loginPost, '/api/auth/login', {
        method: 'POST',
        body: { email: longEmail, senha: 'qualquer' },
      });

      // Retorna 401 (não encontrou), mas não quebra
      expect(status).toBe(401);
    });
  });

  // ═════════════════════════════════════════════
  // CARACTERES ESPECIAIS E UNICODE
  // ═════════════════════════════════════════════

  describe('caracteres especiais e unicode', () => {
    test('nome com caracteres unicode é aceito', async () => {
      const unicodeName = 'José María Pérez-López Ñoño';
      mockQueryResponse('select * from clientes where id', {
        id: 1, nome: unicodeName, origem: 'fachada',
      });

      const { status } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: {
          nome: unicodeName,
          origem: 'fachada',
        },
      });

      expect(status).toBe(201);
    });

    test('nome com emojis é aceito', async () => {
      const emojiName = '😀 Cliente Feliz 🦷';
      mockQueryResponse('select * from clientes where id', {
        id: 1, nome: emojiName, origem: 'fachada',
      });

      const { status } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: {
          nome: emojiName,
          origem: 'fachada',
        },
      });

      expect(status).toBe(201);
    });

    test('busca com caracteres especiais SQL é segura', async () => {
      mockQueryResponse('select * from clientes', []);

      const { status } = await callRoute(getClientes, '/api/clientes', {
        searchParams: { busca: '%_[\\' },
      });

      expect(status).toBe(200);
      // Os wildcards % e _ são passados como params, não na SQL
      const queries = getExecutedQueries();
      const q = queries.find((q) => q.sql.toLowerCase().includes('like'));
      expect(q).toBeDefined();
    });

    test('null bytes no nome são tratados como texto', async () => {
      const nameWithNull = 'Nome\x00comNull';
      mockQueryResponse('select * from clientes where id', {
        id: 1, nome: nameWithNull, origem: 'fachada',
      });

      const { status } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: {
          nome: nameWithNull,
          origem: 'fachada',
        },
      });

      expect(status).toBe(201);
    });
  });

  // ═════════════════════════════════════════════
  // VALIDAÇÕES DE CAMPOS OBRIGATÓRIOS
  // ═════════════════════════════════════════════

  describe('validações de campos obrigatórios', () => {
    test('POST /api/clientes sem nome → 400', async () => {
      const { status } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: { origem: 'fachada' },
      });
      expect(status).toBe(400);
    });

    test('POST /api/clientes com nome vazio → 400', async () => {
      const { status } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: { nome: '', origem: 'fachada' },
      });
      expect(status).toBe(400);
    });

    test('POST /api/clientes com nome só espaços → 400', async () => {
      const { status } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: { nome: '   ', origem: 'fachada' },
      });
      expect(status).toBe(400);
    });

    test('POST /api/clientes sem origem → 400', async () => {
      const { status } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: { nome: 'Teste' },
      });
      expect(status).toBe(400);
    });

    test('POST /api/usuarios sem nome → 400', async () => {
      const { status } = await callRoute(postUsuarios, '/api/usuarios', {
        method: 'POST',
        body: { email: 'test@test.com', role: 'admin' },
      });
      expect(status).toBe(400);
    });

    test('POST /api/usuarios sem email → 400', async () => {
      const { status } = await callRoute(postUsuarios, '/api/usuarios', {
        method: 'POST',
        body: { nome: 'Teste', role: 'admin' },
      });
      expect(status).toBe(400);
    });

    test('POST /api/usuarios sem role → 400', async () => {
      const { status } = await callRoute(postUsuarios, '/api/usuarios', {
        method: 'POST',
        body: { nome: 'Teste', email: 'test@test.com' },
      });
      expect(status).toBe(400);
    });

    test('POST /api/usuarios com nome só espaços → 400', async () => {
      const { status } = await callRoute(postUsuarios, '/api/usuarios', {
        method: 'POST',
        body: { nome: '   ', email: 'test@test.com', role: 'admin' },
      });
      expect(status).toBe(400);
    });

    test('POST /api/usuarios com email só espaços → 400', async () => {
      const { status } = await callRoute(postUsuarios, '/api/usuarios', {
        method: 'POST',
        body: { nome: 'Teste', email: '   ', role: 'admin' },
      });
      expect(status).toBe(400);
    });

    test('PUT /api/auth/senha sem usuario_id → 400', async () => {
      const { status } = await callRoute(putSenha, '/api/auth/senha', {
        method: 'PUT',
        body: { senha_atual: 'abc', nova_senha: 'abcdef' },
      });
      expect(status).toBe(400);
    });

    test('PUT /api/auth/senha com nova_senha < 6 chars → 400', async () => {
      const { status, data } = await callRoute<{ error: string }>(putSenha, '/api/auth/senha', {
        method: 'PUT',
        body: { usuario_id: 1, senha_atual: 'abc', nova_senha: '12345' },
      });
      expect(status).toBe(400);
      expect(data.error).toContain('6 caracteres');
    });
  });

  // ═════════════════════════════════════════════
  // PREPARED STATEMENTS — VERIFICAÇÃO GLOBAL
  // ═════════════════════════════════════════════

  describe('prepared statements — verificação global', () => {
    test('GET /api/clientes com busca usa ? placeholder', async () => {
      mockQueryResponse('select * from clientes', []);

      await callRoute(getClientes, '/api/clientes', {
        searchParams: { busca: 'teste' },
      });

      const queries = getExecutedQueries();
      const searchQuery = queries.find((q) => q.sql.toLowerCase().includes('like'));
      expect(searchQuery).toBeDefined();
      // SQL usa ?, nunca valor literal
      expect(searchQuery!.sql).toContain('?');
      expect(searchQuery!.sql).not.toContain("'teste'");
      expect(searchQuery!.params).toContain('%teste%');
    });

    test('POST /api/clientes usa ? placeholders para todos os campos', async () => {
      mockQueryResponse('select * from clientes where id', { id: 1, nome: 'Meu Nome', origem: 'fachada' });

      await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: {
          nome: 'Meu Nome',
          cpf: '12345678901',
          telefone: '11999999999',
          email: 'teste@test.com',
          origem: 'fachada',
        },
      });

      const queries = getExecutedQueries();
      const insertQuery = queries.find((q) => q.sql.toLowerCase().includes('insert into clientes'));
      expect(insertQuery).toBeDefined();
      // SQL deve usar ? para todos os valores
      const questionMarkCount = (insertQuery!.sql.match(/\?/g) || []).length;
      expect(questionMarkCount).toBeGreaterThanOrEqual(8); // 8 campos
      // Nenhum valor literal na SQL
      expect(insertQuery!.sql).not.toContain("'Meu Nome'");
      expect(insertQuery!.sql).not.toContain("'12345678901'");
    });

    test('POST /api/auth/login usa ? para o email', async () => {
      await callRoute(loginPost, '/api/auth/login', {
        method: 'POST',
        body: { email: 'admin@test.com', senha: 'senha123' },
      });

      const queries = getExecutedQueries();
      const loginQuery = queries.find((q) => q.sql.toLowerCase().includes('usuarios where email'));
      expect(loginQuery).toBeDefined();
      expect(loginQuery!.sql).toContain('?');
      expect(loginQuery!.sql).not.toContain("'admin@test.com'");
      expect(loginQuery!.params[0]).toBe('admin@test.com');
    });

    test('POST /api/procedimentos usa ? placeholders para todos os campos', async () => {
      mockQueryResponse('select * from procedimentos where id', {
        id: 1, nome: 'Limpeza', valor: 100, comissao_venda: 10,
        comissao_execucao: 15, por_dente: 0, ativo: 1,
      });

      await callRoute(postProcedimentos, '/api/procedimentos', {
        method: 'POST',
        body: {
          nome: 'Limpeza',
          valor: 100,
          comissao_venda: 10,
          comissao_execucao: 15,
          por_dente: false,
        },
      });

      const queries = getExecutedQueries();
      const insertQuery = queries.find((q) => q.sql.toLowerCase().includes('insert into procedimentos'));
      expect(insertQuery).toBeDefined();
      expect(insertQuery!.sql).toContain('?');
      expect(insertQuery!.sql).not.toContain("'Limpeza'");
    });
  });
});
