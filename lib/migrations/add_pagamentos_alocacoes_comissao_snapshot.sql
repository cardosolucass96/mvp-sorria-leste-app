ALTER TABLE pagamentos_alocacoes ADD COLUMN criado_por_id INTEGER REFERENCES usuarios(id);
ALTER TABLE pagamentos_alocacoes ADD COLUMN origem_comissao TEXT CHECK (origem_comissao IN ('avaliacao', 'acrescimo'));
ALTER TABLE pagamentos_alocacoes ADD COLUMN percentual_comissao REAL;

UPDATE pagamentos_alocacoes
SET criado_por_id = (
      SELECT i.criado_por_id
      FROM itens_atendimento i
      WHERE i.id = pagamentos_alocacoes.item_atendimento_id
    ),
    origem_comissao = (
      SELECT CASE WHEN i.adicionado_em_execucao = 1 THEN 'acrescimo' ELSE 'avaliacao' END
      FROM itens_atendimento i
      WHERE i.id = pagamentos_alocacoes.item_atendimento_id
    ),
    percentual_comissao = (
      SELECT CASE
               WHEN i.adicionado_em_execucao = 1 THEN p.comissao_acrescimo
               ELSE p.comissao_venda
             END
      FROM itens_atendimento i
      INNER JOIN procedimentos p ON p.id = i.procedimento_id
      WHERE i.id = pagamentos_alocacoes.item_atendimento_id
    )
WHERE item_atendimento_id IS NOT NULL;
