import fs from 'fs';
import path from 'path';

describe('relatorios de impressao', () => {
  test('relatorio do cliente usa marca Sorria Leste e formata dentes legivelmente', () => {
    const pagePath = path.join(process.cwd(), 'app', 'clientes', '[id]', 'page.tsx');
    const source = fs.readFileSync(pagePath, 'utf-8');

    expect(source).toContain("formatarDentes(item.dentes) || '-'");
    expect(source).toContain('logo-sorria-leste-laranja-fundo-transparente.svg');
    expect(source).toContain('finalizarJanelaDeImpressao(janela)');
  });

  test('relatorio do atendimento tenta grouped e faz fallback para pagamentos simples', () => {
    const pagePath = path.join(process.cwd(), 'app', 'atendimentos', '[id]', 'page.tsx');
    const source = fs.readFileSync(pagePath, 'utf-8');

    expect(source).toContain('carregarPagamentosParaImpressao');
    expect(source).toContain('unitFetch(`/api/atendimentos/${atendimentoId}/pagamentos?grouped=1`)');
    expect(source).toContain('unitFetch(`/api/atendimentos/${atendimentoId}/pagamentos`)');
    expect(source).toContain("formatarDentes(item.dentes) || item.dente_unico || '-'");
    expect(source).toContain('finalizarJanelaDeImpressao(janela)');
  });
});
