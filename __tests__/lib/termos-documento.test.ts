/** @jest-environment jsdom */

import { buildTermoPrintableDocument, formatTermoHtmlContent } from '@/lib/helpers/termosDocumento';
import { buildSampleTermoContext, renderTermoTemplate } from '@/lib/helpers/termosPlaceholder';

describe('termosDocumento', () => {
  it('aplica hierarquia visual para titulos, secoes e assinaturas', () => {
    const htmlOriginal = `
      <p>TERMO DE CONSENTIMENTO INFORMADO</p>
      <p>INSTALACAO DE IMPLANTE OSSEOINTEGRADO</p>
      <p>Por este instrumento, eu {{cliente_nome}}, CPF {{cliente_cpf}}, TELEFONE {{cliente_telefone}}.</p>
      <p>DADOS BANCARIOS PARA DEVOLUCAO:</p>
      <p>DOS RISCOS: O paciente declara ciencia dos riscos descritos neste documento.</p>
      <p>___________________, _____ de _______________ de 20____.</p>
      <p>(Assinatura e CPF do(a) paciente/responsavel)</p>
    `;

    const { html } = renderTermoTemplate(htmlOriginal, buildSampleTermoContext());
    const formatted = formatTermoHtmlContent(html);

    expect(formatted).toContain('class="termo-eyebrow"');
    expect(formatted).toContain('class="termo-title"');
    expect(formatted).toContain('<h2 class="termo-section-title">DADOS BANCARIOS PARA DEVOLUCAO:</h2>');
    expect(formatted).toContain('termo-clause-label');
    expect(formatted).toContain('termo-date-line');
    expect(formatted).toContain('termo-signature-caption');
  });

  it('gera um documento completo para impressao', () => {
    const documentHtml = buildTermoPrintableDocument(
      'Termo Teste',
      '<p>TERMO DE CONSENTIMENTO INFORMADO</p><p>RESTAURACAO DENTARIA</p><p>Eu, {{cliente_nome}}.</p>'
    );

    expect(documentHtml).toContain('<!doctype html>');
    expect(documentHtml).toContain('<article class="termo-document">');
    expect(documentHtml).toContain('<title>Termo Teste</title>');
    expect(documentHtml).toContain('termo-title');
  });
});
