-- =====================================================
-- CORRECAO: Restaurar linha de assinatura do profissional nos termos
-- =====================================================

UPDATE termos
SET conteudo_html = REPLACE(
  conteudo_html,
  '<p>CONFIRMO que li o referido termo juntamente com o(a) paciente, e todas as suas dúvidas foram esclarecidas.</p>',
  '<p>CONFIRMO que li o referido termo juntamente com o(a) paciente, e todas as suas dúvidas foram esclarecidas.</p><p>(Assinatura e carimbo CRO do profissional)</p>'
),
updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE conteudo_html NOT LIKE '%(Assinatura e carimbo CRO do profissional)%';
