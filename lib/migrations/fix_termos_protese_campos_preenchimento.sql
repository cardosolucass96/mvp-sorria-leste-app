-- =====================================================
-- CORRECAO: Separar campos de preenchimento dos termos de protese
-- =====================================================

UPDATE termos
SET conteudo_html = REPLACE(
  conteudo_html,
  '<p>Escolha do paciente: {{escolha_protese}}    Observações: {{observacoes_protese}}</p>',
  '<p>Escolha do paciente: {{escolha_protese}}</p><p>Observações: {{observacoes_protese}}</p>'
),
updated_at = datetime('now', 'localtime')
WHERE slug IN ('protese-com-extracao', 'protese-sem-extracao');
