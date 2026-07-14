-- =====================================================
-- CORRECAO: Remover assinatura da clinica/profissional dos termos
-- =====================================================

UPDATE termos
SET conteudo_html = REPLACE(
  conteudo_html,
  '<p>(Assinatura e carimbo CRO do profissional)</p>',
  ''
),
updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE conteudo_html LIKE '%(Assinatura e carimbo CRO do profissional)%';
