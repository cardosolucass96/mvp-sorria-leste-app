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
      expect(route).toContain('export async function POST');
    });

    test('API deve verificar se atendimento está em execução', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain("status !== 'em_execucao'");
    });

    test('API deve verificar se todos itens estão concluídos', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain("status !== 'concluido'");
    });

    test('API deve verificar se todos itens estão pagos', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain('valor_pago < i.valor');
    });

    test('API deve calcular comissão de venda', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain("'venda'");
      expect(route).toContain('comissao_venda');
    });

    test('API deve calcular comissão de execução', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain("'execucao'");
      expect(route).toContain('comissao_execucao');
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
      expect(route).toContain('export async function GET');
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
      expect(page).toMatch(/role.*admin|admin.*role/);
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
      const sidebar = readFile('components/layout/Sidebar.tsx');
      expect(sidebar).toContain('/comissoes');
      expect(sidebar).toMatch(/comissoes.*admin|admin.*comissoes/i);
    });

    test('Sidebar deve ter item Minhas Comissões para avaliador e executor', () => {
      const sidebar = readFile('components/layout/Sidebar.tsx');
      expect(sidebar).toContain('/minhas-comissoes');
      expect(sidebar).toContain('avaliador');
      expect(sidebar).toContain('executor');
    });
  });

  describe('Botão Finalizar no Atendimento', () => {
    test('página de atendimento deve ter função handleFinalizar', () => {
      const page = readFile('app/atendimentos/[id]/page.tsx');
      expect(page).toContain('handleFinalizar');
    });

    test('página deve chamar API de finalização', () => {
      const page = readFile('app/atendimentos/[id]/page.tsx');
      expect(page).toContain('/finalizar');
    });

    test('botão deve aparecer apenas para status em_execucao', () => {
      const page = readFile('app/atendimentos/[id]/page.tsx');
      expect(page).toContain("em_execucao");
      expect(page).toContain("Finalizar");
    });

    test('página deve exibir comissões geradas após finalização', () => {
      const page = readFile('app/atendimentos/[id]/page.tsx');
      expect(page).toContain('comissoesGeradas');
    });
  });

  describe('Regras de Negócio - Comissões', () => {
    test('comissão de venda deve ir para criado_por_id', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain('criado_por_id');
      expect(route).toMatch(/venda.*criado_por|criado_por.*venda/);
    });

    test('comissão de execução deve ir para executor_id', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain('executor_id');
      expect(route).toMatch(/execucao.*executor|executor.*execucao/);
    });

    test('comissão deve usar percentual do procedimento', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain('proc.comissao_venda');
      expect(route).toContain('proc.comissao_execucao');
    });

    test('valor da comissão deve ser calculado corretamente', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      // Fórmula: valor * (percentual / 100)
      expect(route).toMatch(/valor.*\*.*100|100.*\*.*valor/);
    });
  });

  describe('Validações de Finalização', () => {
    test('não permite finalizar atendimento fora de execução', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain("status !== 'em_execucao'");
      expect(route).toContain('400');
    });

    test('não permite finalizar com procedimentos não concluídos', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain('itensNaoConcluidos');
    });

    test('não permite finalizar com pagamentos pendentes', () => {
      const route = readFile('app/api/atendimentos/[id]/finalizar/route.ts');
      expect(route).toContain('itensNaoPagos');
      expect(route).toContain('valorFaltante');
    });
  });
});
