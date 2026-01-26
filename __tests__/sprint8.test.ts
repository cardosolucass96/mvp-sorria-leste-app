import fs from 'fs';
import path from 'path';

describe('Sprint 8 - Execução (Dentista Executor)', () => {
  describe('Arquivos do Projeto', () => {
    test('app/api/execucao/route.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'api', 'execucao', 'route.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/api/execucao/item/[id]/route.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'api', 'execucao', 'item', '[id]', 'route.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/execucao/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'execucao', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/execucao/[id]/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'execucao', '[id]', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('API de Execução - Estrutura', () => {
    test('API route deve ter método GET', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'execucao', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function GET');
    });

    test('API deve filtrar por executor_id', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'execucao', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('executor_id');
    });

    test('API deve filtrar atendimentos em status em_execucao', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'execucao', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('em_execucao');
    });

    test('API deve buscar atendimentos com procedimentos do executor ou sem executor', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'execucao', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('itens_atendimento');
      expect(content).toContain('executor_id IS NULL');
    });

    test('API deve retornar meusProcedimentos e disponiveis', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'execucao', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('meusProcedimentos');
      expect(content).toContain('disponiveis');
    });

    test('API de item individual deve existir e ter GET', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'execucao', 'item', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function GET');
      expect(content).toContain('cliente_nome');
    });
  });

  describe('Páginas de Execução', () => {
    test('página de listagem deve usar useAuth', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'execucao', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('useAuth');
    });

    test('página de listagem deve filtrar por executor_id', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'execucao', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('executor_id');
    });

    test('página de detalhes deve permitir marcar como concluído', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'execucao', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('concluido');
      expect(content).toContain('marcarComoConcluido');
    });

    test('página de detalhes deve permitir adicionar procedimento', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'execucao', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('Adicionar Procedimento');
      expect(content).toContain('adicionarProcedimento');
    });

    test('página deve alertar sobre volta para aguardando_pagamento', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'execucao', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('Aguardando Pagamento');
    });

    test('página deve mostrar seções de meus procedimentos e disponíveis', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'execucao', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('meusProcedimentos');
      expect(content).toContain('disponiveis');
    });

    test('página deve permitir iniciar execução', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'execucao', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('iniciarExecucao');
      expect(content).toContain('executando');
    });
  });

  describe('API de Atualização de Itens', () => {
    test('API deve registrar concluido_at ao marcar como concluído', () => {
      const content = fs.readFileSync(
        path.join(
          process.cwd(),
          'app',
          'api',
          'atendimentos',
          '[id]',
          'itens',
          '[itemId]',
          'route.ts'
        ),
        'utf-8'
      );
      expect(content).toContain('concluido_at');
      expect(content).toContain('CURRENT_TIMESTAMP');
    });

    test('API deve validar permissões para executar', () => {
      const content = fs.readFileSync(
        path.join(
          process.cwd(),
          'app',
          'api',
          'atendimentos',
          '[id]',
          'itens',
          '[itemId]',
          'route.ts'
        ),
        'utf-8'
      );
      expect(content).toContain('executor');
    });
  });

  describe('API de Adição de Itens', () => {
    test('API deve voltar status para aguardando_pagamento ao adicionar item em execução', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'atendimentos', '[id]', 'itens', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('em_execucao');
      expect(content).toContain('aguardando_pagamento');
    });

    test('API deve permitir adicionar items em status em_execucao', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'atendimentos', '[id]', 'itens', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('em_execucao');
    });

    test('API deve registrar criado_por_id', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'atendimentos', '[id]', 'itens', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('criado_por_id');
    });
  });

  describe('Menu Sidebar', () => {
    test('Sidebar deve ter item Execução para executor e admin', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'components', 'layout', 'Sidebar.tsx'),
        'utf-8'
      );
      expect(content).toContain('execucao');
      expect(content).toContain('executor');
    });
  });

  describe('Funcionalidades Implementadas', () => {
    test('sistema deve suportar transições de status para executar e concluir', () => {
      const content = fs.readFileSync(
        path.join(
          process.cwd(),
          'app',
          'api',
          'atendimentos',
          '[id]',
          'itens',
          '[itemId]',
          'route.ts'
        ),
        'utf-8'
      );
      expect(content).toContain('executando');
      expect(content).toContain('concluido');
    });

    test('sistema deve ter campo concluido_at em itens_atendimento', () => {
      const content = fs.readFileSync(path.join(process.cwd(), 'lib', 'schema.sql'), 'utf-8');
      expect(content).toContain('concluido_at');
    });

    test('sistema deve permitir múltiplos executores', () => {
      const content = fs.readFileSync(path.join(process.cwd(), 'lib', 'schema.sql'), 'utf-8');
      expect(content).toContain('executor_id');
    });
  });
});
