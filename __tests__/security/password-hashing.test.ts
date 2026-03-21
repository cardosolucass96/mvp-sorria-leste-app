/**
 * Testes de segurança — Hash de Senhas (PBKDF2)
 *
 * Sprint 10 — Foco em cenários de segurança avançados:
 * - Formato e entropia do hash
 * - Verificação de iterações (brute-force resistance)
 * - Salt único por hash
 * - Migração de senhas legado
 * - Edge cases de segurança (unicode, injection, comprimento extremo)
 * - Senhas armazenadas no cadastro de usuários
 */

import { hashPassword, verifyPassword, needsMigration } from '@/lib/auth/password';
import { callRoute } from '../helpers/api-test-helper';
import {
  mockQueryResponse,
  resetMockDb,
  getExecutedQueries,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../helpers/db-mock';

import { POST as loginPost } from '@/app/api/auth/login/route';
import { PUT as senhaput } from '@/app/api/auth/senha/route';

describe('Segurança — Hash de Senhas (PBKDF2)', () => {
  // ─── Formato e Estrutura ──────────────────────

  describe('formato do hash', () => {
    test('hash segue formato pbkdf2:<iterations>:<salt_hex>:<hash_hex>', async () => {
      const hash = await hashPassword('teste123');
      const parts = hash.split(':');

      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe('pbkdf2');
      expect(parseInt(parts[1], 10)).toBeGreaterThan(0);
      // Salt é hex (só caracteres hex)
      expect(parts[2]).toMatch(/^[a-f0-9]+$/);
      // Hash é hex
      expect(parts[3]).toMatch(/^[a-f0-9]+$/);
    });

    test('usa pelo menos 100.000 iterações (resistência a brute force)', async () => {
      const hash = await hashPassword('qualquer');
      const iterations = parseInt(hash.split(':')[1], 10);

      expect(iterations).toBeGreaterThanOrEqual(100_000);
    });

    test('salt tem pelo menos 128 bits (16 bytes = 32 hex chars)', async () => {
      const hash = await hashPassword('qualquer');
      const saltHex = hash.split(':')[2];

      // 16 bytes = 32 hex chars
      expect(saltHex.length).toBeGreaterThanOrEqual(32);
    });

    test('hash derivado tem pelo menos 256 bits (32 bytes = 64 hex chars)', async () => {
      const hash = await hashPassword('qualquer');
      const hashHex = hash.split(':')[3];

      // 32 bytes = 64 hex chars
      expect(hashHex.length).toBeGreaterThanOrEqual(64);
    });
  });

  // ─── Unicidade e Entropia ─────────────────────

  describe('unicidade do salt', () => {
    test('mesma senha gera hashes completamente diferentes', async () => {
      const hashes = await Promise.all(
        Array.from({ length: 5 }, () => hashPassword('MesmaSenha123'))
      );

      // Todos hashes devem ser únicos
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(5);
    });

    test('salts são únicos para cada hash gerado', async () => {
      const hashes = await Promise.all(
        Array.from({ length: 5 }, () => hashPassword('MesmaSenha123'))
      );

      const salts = hashes.map((h) => h.split(':')[2]);
      const uniqueSalts = new Set(salts);
      expect(uniqueSalts.size).toBe(5);
    });

    test('hash derivado é diferente para cada salt (mesmo com mesma senha)', async () => {
      const hashes = await Promise.all(
        Array.from({ length: 5 }, () => hashPassword('MesmaSenha123'))
      );

      const derivedHashes = hashes.map((h) => h.split(':')[3]);
      const uniqueDeriveds = new Set(derivedHashes);
      expect(uniqueDeriveds.size).toBe(5);
    });
  });

  // ─── Verificação Correta ──────────────────────

  describe('verificação de senha', () => {
    test('senha correta é aceita', async () => {
      const hash = await hashPassword('SenhaCorreta!');
      expect(await verifyPassword('SenhaCorreta!', hash)).toBe(true);
    });

    test('senha incorreta é rejeitada', async () => {
      const hash = await hashPassword('SenhaCorreta!');
      expect(await verifyPassword('SenhaErrada!', hash)).toBe(false);
    });

    test('senha com 1 caractere diferente é rejeitada', async () => {
      const hash = await hashPassword('SenhaOriginal');
      expect(await verifyPassword('SenhaOriginaa', hash)).toBe(false);
      expect(await verifyPassword('senhaOriginal', hash)).toBe(false); // case-sensitive
      expect(await verifyPassword('SenhaOriginal ', hash)).toBe(false); // trailing space
      expect(await verifyPassword(' SenhaOriginal', hash)).toBe(false); // leading space
    });

    test('verificação é case-sensitive', async () => {
      const hash = await hashPassword('MinhaS3nha');
      expect(await verifyPassword('MinhaS3nha', hash)).toBe(true);
      expect(await verifyPassword('minhas3nha', hash)).toBe(false);
      expect(await verifyPassword('MINHAS3NHA', hash)).toBe(false);
    });
  });

  // ─── Tipos Especiais de Senha ─────────────────

  describe('senhas com caracteres especiais', () => {
    test('caracteres unicode (acentos)', async () => {
      const senha = 'Çãféçaõ@123';
      const hash = await hashPassword(senha);
      expect(await verifyPassword(senha, hash)).toBe(true);
      expect(await verifyPassword('Cafecao@123', hash)).toBe(false);
    });

    test('emojis na senha', async () => {
      const senha = 'Senha🔐Segura🛡️';
      const hash = await hashPassword(senha);
      expect(await verifyPassword(senha, hash)).toBe(true);
    });

    test('caracteres de controle e whitespace', async () => {
      const senha = 'senha\tcom\ntabs';
      const hash = await hashPassword(senha);
      expect(await verifyPassword(senha, hash)).toBe(true);
      expect(await verifyPassword('senhacomtabs', hash)).toBe(false);
    });

    test('caracteres SQL injection na senha (não afeta hash)', async () => {
      const senha = "' OR 1=1; DROP TABLE usuarios; --";
      const hash = await hashPassword(senha);
      expect(await verifyPassword(senha, hash)).toBe(true);
      // Hash trata como bytes, não como SQL
      expect(hash.startsWith('pbkdf2:')).toBe(true);
    });

    test('string vazia como senha', async () => {
      const hash = await hashPassword('');
      expect(await verifyPassword('', hash)).toBe(true);
      expect(await verifyPassword(' ', hash)).toBe(false);
    });

    test('senha muito longa (10.000 caracteres)', async () => {
      const senha = 'A'.repeat(10_000);
      const hash = await hashPassword(senha);
      expect(await verifyPassword(senha, hash)).toBe(true);
      expect(await verifyPassword('A'.repeat(9_999), hash)).toBe(false);
    });
  });

  // ─── Hash Malformado ──────────────────────────

  describe('hashes malformados', () => {
    test('hash com formato errado (2 partes) retorna false', async () => {
      expect(await verifyPassword('teste', 'pbkdf2:100000')).toBe(false);
    });

    test('hash com formato errado (3 partes) retorna false', async () => {
      expect(await verifyPassword('teste', 'pbkdf2:100000:aabb')).toBe(false);
    });

    test('hash com 5 partes retorna false', async () => {
      expect(await verifyPassword('teste', 'pbkdf2:100000:aabb:ccdd:extra')).toBe(false);
    });

    test('hash com iterações não numéricas lança erro (crypto rejeita NaN)', async () => {
      // crypto.subtle.deriveBits rejeita iterations=NaN com TypeError
      await expect(verifyPassword('teste', 'pbkdf2:abc:aabb:ccdd')).rejects.toThrow();
    });

    test('string vazia como hash → compara texto plano', async () => {
      // '' não começa com 'pbkdf2:', então é tratado como texto plano legado
      expect(await verifyPassword('', '')).toBe(true);
      expect(await verifyPassword('abc', '')).toBe(false);
    });
  });

  // ─── Migração de Senhas Legado ────────────────

  describe('migração de senhas texto plano', () => {
    test('needsMigration retorna true para texto plano', () => {
      expect(needsMigration('Sorria@123')).toBe(true);
      expect(needsMigration('qualquer_senha')).toBe(true);
      expect(needsMigration('')).toBe(true);
      expect(needsMigration('123456')).toBe(true);
    });

    test('needsMigration retorna false para hash PBKDF2', async () => {
      const hash = await hashPassword('teste');
      expect(needsMigration(hash)).toBe(false);
    });

    test('verifyPassword aceita texto plano legado (compatibilidade)', async () => {
      // Texto plano legado: comparação direta
      expect(await verifyPassword('Sorria@123', 'Sorria@123')).toBe(true);
    });

    test('verifyPassword rejeita texto plano errado', async () => {
      expect(await verifyPassword('SenhaErrada', 'Sorria@123')).toBe(false);
    });
  });

  // ─── Integração com Login (migração automática) ─

  describe('migração automática no login', () => {
    beforeEach(() => {
      setupCloudflareContextMock();
      resetMockDb();
    });

    afterEach(() => {
      teardownCloudflareContextMock();
    });

    test('login com senha texto plano dispara UPDATE com hash', async () => {
      mockQueryResponse('select * from usuarios where email', {
        id: 1,
        nome: 'Admin',
        email: 'admin@sorrialeste.com',
        senha: 'Sorria@123', // texto plano legado
        role: 'admin',
        ativo: 1,
        created_at: '2025-01-01',
      });

      const { status } = await callRoute(loginPost, '/api/auth/login', {
        method: 'POST',
        body: { email: 'admin@sorrialeste.com', senha: 'Sorria@123' },
      });

      expect(status).toBe(200);

      // UPDATE deve ter sido executado com hash
      const queries = getExecutedQueries();
      const updateQuery = queries.find((q) => q.sql.toLowerCase().includes('update usuarios set senha'));
      expect(updateQuery).toBeDefined();
      // O novo valor deve ser um hash pbkdf2
      expect(typeof updateQuery!.params[0]).toBe('string');
      expect((updateQuery!.params[0] as string).startsWith('pbkdf2:')).toBe(true);
    });

    test('login com senha já hasheada NÃO dispara UPDATE', async () => {
      const hashedPw = await hashPassword('MinhaS3nha!');
      mockQueryResponse('select * from usuarios where email', {
        id: 2,
        nome: 'Maria',
        email: 'maria@sorrialeste.com',
        senha: hashedPw,
        role: 'atendente',
        ativo: 1,
        created_at: '2025-01-01',
      });

      const { status } = await callRoute(loginPost, '/api/auth/login', {
        method: 'POST',
        body: { email: 'maria@sorrialeste.com', senha: 'MinhaS3nha!' },
      });

      expect(status).toBe(200);

      // NÃO deve ter UPDATE de senha
      const queries = getExecutedQueries();
      const updateQuery = queries.find((q) => q.sql.toLowerCase().includes('update usuarios set senha'));
      expect(updateQuery).toBeUndefined();
    });
  });

  // ─── Integração com Troca de Senha ────────────

  describe('troca de senha usa hash', () => {
    beforeEach(() => {
      setupCloudflareContextMock();
      resetMockDb();
    });

    afterEach(() => {
      teardownCloudflareContextMock();
    });

    test('PUT /api/auth/senha armazena nova senha com hash PBKDF2', async () => {
      const hashedAtual = await hashPassword('SenhaAtual1');
      mockQueryResponse('select id, senha from usuarios', {
        id: 1,
        senha: hashedAtual,
      });

      const { status } = await callRoute(senhaput, '/api/auth/senha', {
        method: 'PUT',
        body: {
          usuario_id: 1,
          senha_atual: 'SenhaAtual1',
          nova_senha: 'NovaSenha2!',
        },
      });

      expect(status).toBe(200);

      // Verifica que a nova senha foi gravada com hash
      const queries = getExecutedQueries();
      const updateQuery = queries.find((q) => q.sql.toLowerCase().includes('update usuarios set senha'));
      expect(updateQuery).toBeDefined();
      expect((updateQuery!.params[0] as string).startsWith('pbkdf2:')).toBe(true);
    });

    test('nova senha gravada é verificável depois', async () => {
      const hashedAtual = await hashPassword('SenhaVelha');
      mockQueryResponse('select id, senha from usuarios', {
        id: 1,
        senha: hashedAtual,
      });

      await callRoute(senhaput, '/api/auth/senha', {
        method: 'PUT',
        body: {
          usuario_id: 1,
          senha_atual: 'SenhaVelha',
          nova_senha: 'SenhaNova123',
        },
      });

      const queries = getExecutedQueries();
      const updateQuery = queries.find((q) => q.sql.toLowerCase().includes('update usuarios set senha'));
      const novoHash = updateQuery!.params[0] as string;

      // Hash salvo deve validar corretamente
      expect(await verifyPassword('SenhaNova123', novoHash)).toBe(true);
      expect(await verifyPassword('SenhaVelha', novoHash)).toBe(false);
    });
  });
});
