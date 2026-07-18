/** @jest-environment jsdom */

import { buildTermoAutentiqueDocument, buildTermoPrintableDocument, formatTermoHtmlContent } from '@/lib/helpers/termosDocumento';
import { buildSampleTermoContext, buildTermoDraft, extractTermoPlaceholderKeys, normalizeLegacyTermoTemplateHtml, renderTermoTemplate } from '@/lib/helpers/termosPlaceholder';

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
    expect(formatted).toContain('<strong class="termo-variable">Maria da Conceicao Andrade</strong>');
    expect(formatted).toContain('<strong class="termo-variable">123.456.789-10</strong>');
    expect(formatted).toContain('<strong class="termo-variable">(85) 99876-5432</strong>');
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
    expect(documentHtml).toContain('@media screen');
    expect(documentHtml).toContain('padding: 15mm 16mm 18mm;');
  });

  it('gera um documento completo para upload no Autentique com layout dedicado', () => {
    const documentHtml = buildTermoAutentiqueDocument(
      'Termo Teste',
      '<p>REQUERIMENTO PARA DEVOLUCAO DE VALORES</p><p>CLINICA SORRIA LESTE</p><p>Eu, {{cliente_nome}}.</p>'
    );

    expect(documentHtml).toContain('<!doctype html>');
    expect(documentHtml).toContain('<article class="termo-document">');
    expect(documentHtml).toContain('<title>Termo Teste</title>');
    expect(documentHtml).toContain('padding: 16mm 17mm 19mm;');
    expect(documentHtml).not.toContain('box-shadow: 0 18px 40px');
  });

  it('remove linhas em aberto de data e assinatura na versao digital', () => {
    const documentHtml = buildTermoAutentiqueDocument(
      'Termo Digital',
      `
        <p>___________________, _____ de _______________ de 20____.</p>
        <p>(Assinatura e CPF do(a) paciente/responsavel)</p>
        <p>___________________, _____ de _______________ de 20____.</p>
        <p>(Assinatura do Socio-Administrador)</p>
      `
    );

    expect(documentHtml).toContain('Documento preparado para assinatura eletrônica em');
    expect(documentHtml).toContain('Assinatura eletrônica do(a) paciente/responsável via Autentique.');
    expect(documentHtml).toContain('Assinatura interna da clínica registrada fora deste fluxo digital.');
    expect(documentHtml).not.toContain('20____');
    expect(documentHtml).not.toContain('___________________');
  });

  it('mantem linha de preenchimento para campos manuais de protese quando vazios', () => {
    const { html } = renderTermoTemplate(
      '<p>Escolha do paciente: {{escolha_protese}}</p><p>Observações: {{observacoes_protese}}</p>',
      buildSampleTermoContext({
        escolha_protese: '',
        observacoes_protese: '',
      })
    );
    const formatted = formatTermoHtmlContent(html);

    expect(formatted).toContain('termo-fill-line termo-fill-line--medium');
    expect(formatted).toContain('termo-fill-line termo-fill-line--long');
    expect(formatted).toContain('Escolha do paciente:');
    expect(formatted).toContain('Observações:');
  });

  it('substitui qualquer placeholder vazio ou desconhecido por linha de preenchimento', () => {
    const { html, placeholdersNaoEncontrados } = renderTermoTemplate(
      '<p>Paciente: {{cliente_nome}}</p><p>CPF: {{cliente_cpf}}</p><p>Campo extra: {{campo_livre}}</p>',
      buildSampleTermoContext({
        cliente_nome: '',
        cliente_cpf: '',
      })
    );
    const formatted = formatTermoHtmlContent(html);

    expect(formatted).toContain('termo-fill-line termo-fill-line--medium');
    expect(formatted).toContain('termo-fill-line termo-fill-line--short');
    expect(formatted).toContain('data-placeholder="campo_livre"');
    expect(placeholdersNaoEncontrados).toContain('campo_livre');
  });

  it('normaliza enderecos legados para o placeholder da unidade', () => {
    const template = '<p>Atendimento na Clínica Sorria Leste, situada na Avenida Presidente Castelo Branco, nº 5185 B, Barra do Ceará, Fortaleza/CE.</p>';
    const normalized = normalizeLegacyTermoTemplateHtml(template);
    const { html } = renderTermoTemplate(normalized, buildSampleTermoContext());

    expect(normalized).toContain('{{unidade_endereco}}');
    expect(html).toContain('<strong class="termo-variable">Avenida Presidente Castelo Branco, 5185 B, Barra do Ceará, Fortaleza/CE</strong>');
  });

  it('expõe placeholders de unidade no contexto do termo', () => {
    const { html } = renderTermoTemplate(
      '<p>Unidade: {{unidade_nome}}</p><p>Contato: {{unidade_telefone}}</p><p>CNPJ: {{unidade_cnpj}}</p>',
      buildSampleTermoContext()
    );

    expect(html).toContain('<strong class="termo-variable">Barra do Ceará</strong>');
    expect(html).toContain('<strong class="termo-variable">(85) 99123-4567</strong>');
    expect(html).toContain('<strong class="termo-variable">46.261.849/0001-10</strong>');
  });

  it('extrai placeholders usados em ordem de aparição sem duplicar', () => {
    const placeholders = extractTermoPlaceholderKeys(
      '<p>{{cliente_nome}}</p><p>{{cliente_cpf}}</p><p>{{cliente_nome}}</p><p>{{campo_livre}}</p>'
    );

    expect(placeholders).toEqual(['cliente_nome', 'cliente_cpf', 'campo_livre']);
  });

  it('gera draft do termo com origem e pendências', () => {
    const draft = buildTermoDraft(
      '<p>{{cliente_nome}}</p><p>{{cliente_email}}</p><p>{{campo_livre}}</p>',
      buildSampleTermoContext({
        cliente_nome: 'Paciente Teste',
        cliente_email: '',
      })
    );

    expect(draft.campos).toEqual([
      expect.objectContaining({
        key: 'cliente_nome',
        value: 'Paciente Teste',
        source: 'cliente',
      }),
      expect.objectContaining({
        key: 'cliente_email',
        value: '',
        source: 'cliente',
      }),
      expect.objectContaining({
        key: 'campo_livre',
        value: '',
        source: 'manual',
      }),
    ]);
    expect(draft.pendentes).toEqual(['cliente_email', 'campo_livre']);
  });
});
