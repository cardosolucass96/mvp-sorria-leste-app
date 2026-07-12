import fs from 'fs';
import path from 'path';

describe('relatorios de impressao', () => {
  test('relatorio do cliente usa marca Sorria Leste e formata dentes legivelmente', () => {
    const pagePath = path.join(process.cwd(), 'app', 'clientes', '[id]', 'page.tsx');
    const source = fs.readFileSync(pagePath, 'utf-8');

    expect(source).toContain("formatarDentes(item.dentes) || '-'");
    expect(source).toContain('selectedPagamentos');
    expect(source).toContain('toggleSelecionarPagamento');
    expect(source).toContain('selecionarTodosPagamentos');
    expect(source).toContain('imprimirPagamentosSelecionados');
    expect(source).toContain('Relatório de Pagamentos');
    expect(source).toContain('Pagamentos selecionados');
    expect(source).toContain('Motivo do cancelamento:');
    expect(source).toContain('logo-sorria-leste-laranja-fundo-transparente.svg');
    expect(source).toContain('finalizarJanelaDeImpressao(janela)');
  });

  test('relatorio do atendimento tenta grouped e faz fallback para pagamentos simples', () => {
    const pagePath = path.join(process.cwd(), 'app', 'atendimentos', '[id]', 'page.tsx');
    const source = fs.readFileSync(pagePath, 'utf-8');

    expect(source).toContain('carregarPagamentosParaImpressao');
    expect(source).toContain('renderizarTabelaPagamentosImpressao');
    expect(source).toContain('abrirRelatorioDeImpressao');
    expect(source).toContain('imprimirRecibos');
    expect(source).toContain('Recibos de Pagamento');
    expect(source).toContain('Imprimir recibos');
    expect(source).toContain('unitFetch(`/api/atendimentos/${atendimentoId}/pagamentos?grouped=1`)');
    expect(source).toContain('unitFetch(`/api/atendimentos/${atendimentoId}/pagamentos`)');
    expect(source).toContain("formatarDentes(item.dentes) || item.dente_unico || '-'");
    expect(source).toContain('finalizarJanelaDeImpressao(janela)');
  });
});
