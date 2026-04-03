/**
 * Testes da Sprint 9 - Finalização e Comissões
 * 
 * Esta sprint implementa:
 * - Finalização de atendimentos com validações
 * - Cálculo automático de comissões (venda e execução)
 * - Páginas de visualização de comissões
 */

import fs from 'fs';
import path from 'path';

// Helper para ler arquivos
function readFile(filePath: string): string {
  const fullPath = path.join(process.cwd(), filePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

// Helper para verificar se arquivo existe
function fileExists(filePath: string): boolean {
  const fullPath = path.join(process.cwd(), filePath);
  return fs.existsSync(fullPath);
}

describe('Sprint 9 - Finalização e Comissões', () => {
  describe('Arquivos do Projeto', () => {
    test('app/api/atendimentos/[id]/finalizar/route.ts deve existir', () => {
      expect(fileExists('app/api/atendimentos/[id]/finalizar/route.ts')).toBe(true);
    });

    test('app/api/comissoes/route.ts deve existir', () => {
      expect(fileExists('app/api/comissoes/route.ts')).toBe(true);
    });

    test('app/comissoes/page.tsx deve existir', () => {
      expect(fileExists('app/comissoes/page.tsx')).toBe(true);
    });

    test('app/minhas-comissoes/page.tsx deve existir', () => {
      expect(fileExists('app/minhas-comissoes/page.tsx')).toBe(true);
    });
  });

  describe('Schema do Banco - Tabela Comissões', () => {
    test('schema deve ter tabela comissoes', () => {
      const schema = readFile('lib/schema.sql');
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS comissoes');
    });

    test('tabela comissoes deve ter campo tipo (venda/execucao)', () => {
      const schema = readFile('lib/schema.sql');
      expect(schema).toMatch(/tipo TEXT NOT NULL CHECK.*venda.*execucao/);
    });

    test('tabela comissoes deve ter campo percentual', () => {
      const schema = readFile('lib/schema.sql');
      expect(schema).toContain('percentual REAL NOT NULL');
    });

    test('tabela comissoes deve ter campo valor_base', () => {
      const schema = readFile('lib/schema.sql');
      expect(schema).toContain('valor_base REAL NOT NULL');
    });

    test('tabela comissoes deve ter campo valor_comissao', () => {
      const schema = readFile('lib/schema.sql');
      expect(schema).toContain('valor_comissao REAL NOT NULL');
    });

    test('tabela comissoes deve ter FK para usuario', () => {
      const schema = readFile('lib/schema.sql');
      expect(schema).toMatch(/FOREIGN KEY \(usuario_id\) REFERENCES usuarios/);
    });

    test('tabela comissoes deve ter FK para atendimento', () => {
      const schema = readFile('lib/schema.sql');
      expect(schema).toMatch(/FOREIGN KEY \(atendimento_id\) REFERENCES atendimentos/);
    });

    test('tabela comissoes deve ter índice por usuario', () => {
      const schema = readFile('lib/schema.sql');
      expect(schema).toContain('idx_comissoes_usuario');
    });
  });

  describe('API de Finalização - Estrutura', () => {
    test('API finalizar deve ter método POST', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toMatch(/export (async function|const) POST/);
    });

    test('API deve verificar se atendimento está em execução', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain("status !== 'em_execucao'");
    });

    test('API deve aceitar motivo_saida', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain('motivo_saida');
    });

    test('API deve aceitar apenas sem_tratamento neste endpoint', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain("sem_tratamento");
    });

    test('API deve retornar 400 para motivo diferente de sem_tratamento', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain('400');
      expect(route).toContain('Use o fluxo normal');
    });

    test('API deve atualizar status para finalizado', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain("status = 'finalizado'");
    });

    test('API deve registrar finalizado_at', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain('finalizado_at');
    });
  });

  describe('API de Comissões - Estrutura', () => {
    test('API comissões deve ter método GET', () => {
      const route = readFile('app/api/comissoes/route.ts');
      expect(route).toMatch(/export (async function|const) GET/);
    });

    test('API deve filtrar por usuario_id', () => {
      const route = readFile('app/api/comissoes/route.ts');
      expect(route).toContain('usuario_id');
    });

    test('API deve filtrar por data_inicio', () => {
      const route = readFile('app/api/comissoes/route.ts');
      expect(route).toContain('data_inicio');
    });

    test('API deve filtrar por data_fim', () => {
      const route = readFile('app/api/comissoes/route.ts');
      expect(route).toContain('data_fim');
    });

    test('API deve suportar modo resumo', () => {
      const route = readFile('app/api/comissoes/route.ts');
      expect(route).toContain('resumo');
      expect(route).toContain('GROUP BY');
    });

    test('API deve retornar totais de comissão', () => {
      const route = readFile('app/api/comissoes/route.ts');
      expect(route).toContain('totais');
      expect(route).toContain('totalVenda');
      expect(route).toContain('totalExecucao');
    });
  });

  describe('Página de Comissões (Admin)', () => {
    test('página deve verificar permissão de admin', () => {
      const page = readFile('app/comissoes/page.tsx');
      expect(page).toMatch(/role.*admin|admin.*role|isAdmin/);
    });

    test('página deve ter modo resumo e detalhes', () => {
      const page = readFile('app/comissoes/page.tsx');
      expect(page).toContain('resumo');
      expect(page).toContain('detalhes');
    });

    test('página deve mostrar comissões de venda e execução', () => {
      const page = readFile('app/comissoes/page.tsx');
      expect(page).toContain('Venda');
      expect(page).toContain('Execução');
    });

    test('página deve ter filtros de data', () => {
      const page = readFile('app/comissoes/page.tsx');
      expect(page).toContain('filtroDataInicio');
      expect(page).toContain('filtroDataFim');
    });
  });

  describe('Página Minhas Comissões', () => {
    test('página deve filtrar por usuário logado', () => {
      const page = readFile('app/minhas-comissoes/page.tsx');
      expect(page).toContain('user?.id');
    });

    test('página deve mostrar totais de comissão', () => {
      const page = readFile('app/minhas-comissoes/page.tsx');
      expect(page).toContain('totais');
    });

    test('página deve ter filtros de data', () => {
      const page = readFile('app/minhas-comissoes/page.tsx');
      expect(page).toContain('filtroDataInicio');
      expect(page).toContain('filtroDataFim');
    });
  });

  describe('Menu Sidebar', () => {
    test('Sidebar deve ter item Comissões para admin', () => {
      // Após Sprint 3, MENU_ITEMS vivem em lib/constants/navigation.ts
      const nav = readFile('lib/constants/navigation.ts');
      expect(nav).toContain('/comissoes');
      expect(nav).toMatch(/comissoes.*admin|admin.*comissoes/i);
    });

    test('Sidebar deve ter item Meus Procedimentos para avaliador e executor', () => {
      const nav = readFile('lib/constants/navigation.ts');
      expect(nav).toContain('/meus-procedimentos');
      expect(nav).toContain('avaliador');
      expect(nav).toContain('executor');
    });
  });

  describe('Botão Encerrar no Atendimento', () => {
    test('página de atendimento deve ter link para encerrar', () => {
      const page = readFile('app/atendimentos/[id]/page.tsx');
      // Novo fluxo: "Revisar e Encerrar" via link
      const hasEncerrar = page.includes('encerrar') || page.includes('Encerrar');
      expect(hasEncerrar).toBe(true);
    });

    test('página deve ter link para encerrar', () => {
      const page = readFile('app/atendimentos/[id]/page.tsx');
      expect(page).toContain('/encerrar');
    });

    test('página deve mostrar status em_execucao', () => {
      const page = readFile('app/atendimentos/[id]/page.tsx');
      expect(page).toContain("em_execucao");
    });

    test('página deve mostrar status do atendimento', () => {
      const page = readFile('app/atendimentos/[id]/page.tsx');
      expect(page).toContain('STATUS_CONFIG');
    });
  });

  describe('Regras de Negócio - Finalização', () => {
    test('finalizar deve aceitar motivo_saida como parâmetro', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain('motivo_saida');
    });

    test('finalizar deve definir tipos de motivo de saída', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain('MotivoSaida');
      expect(route).toContain('sem_tratamento');
      expect(route).toContain('tratamento_completo');
    });

    test('finalizar deve atualizar status e timestamp', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain("status = 'finalizado'");
      expect(route).toContain('finalizado_at');
    });

    test('finalizar deve retornar sucesso', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain('success');
      expect(route).toContain('Atendimento finalizado com sucesso');
    });
  });

  describe('Validações de Finalização', () => {
    test('não permite finalizar atendimento fora de execução', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain("status !== 'em_execucao'");
      expect(route).toContain('400');
    });

    test('não permite finalizar com motivo diferente de sem_tratamento', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain("motivo_saida !== 'sem_tratamento'");
    });

    test('retorna 404 para atendimento inexistente', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain('Atendimento não encontrado');
      expect(route).toContain('404');
    });
  });
});
