-- =====================================================
-- SEED DE ATENDIMENTOS - SORRIA LESTE MVP (D1)
-- Execute: wrangler d1 execute sorria-leste-db --remote --file=lib/seed-atendimentos.sql
-- =====================================================

-- Atendimentos em diferentes status
-- Status: triagem, avaliacao, aguardando_pagamento, em_execucao, finalizado

-- Atendimentos finalizados (para dashboard ter dados)
INSERT INTO atendimentos (cliente_id, avaliador_id, liberado_por_id, status, created_at, liberado_em, finalizado_at) VALUES 
  (1, 6, 1, 'finalizado', datetime('now', '-30 days'), datetime('now', '-28 days'), datetime('now', '-20 days')),
  (2, 7, 1, 'finalizado', datetime('now', '-25 days'), datetime('now', '-23 days'), datetime('now', '-15 days')),
  (3, 6, 1, 'finalizado', datetime('now', '-20 days'), datetime('now', '-18 days'), datetime('now', '-10 days')),
  (4, 8, 1, 'finalizado', datetime('now', '-15 days'), datetime('now', '-13 days'), datetime('now', '-5 days')),
  (5, 6, 1, 'finalizado', datetime('now', '-10 days'), datetime('now', '-8 days'), datetime('now', '-2 days'));

-- Atendimentos em execução
INSERT INTO atendimentos (cliente_id, avaliador_id, liberado_por_id, status, created_at, liberado_em) VALUES 
  (6, 7, 1, 'em_execucao', datetime('now', '-7 days'), datetime('now', '-5 days')),
  (7, 6, 1, 'em_execucao', datetime('now', '-5 days'), datetime('now', '-3 days'));

-- Atendimentos aguardando pagamento
INSERT INTO atendimentos (cliente_id, avaliador_id, status, created_at) VALUES 
  (8, 8, 'aguardando_pagamento', datetime('now', '-3 days')),
  (9, 7, 'aguardando_pagamento', datetime('now', '-2 days'));

-- Atendimentos em avaliação
INSERT INTO atendimentos (cliente_id, avaliador_id, status, created_at) VALUES 
  (10, 6, 'avaliacao', datetime('now', '-1 day'));

-- Itens dos atendimentos finalizados (procedimentos realizados)
-- Atendimento 1 (cliente José - finalizado)
INSERT INTO itens_atendimento (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_pago, status, concluido_at) VALUES 
  (1, 4, 9, 6, 150, 150, 'concluido', datetime('now', '-20 days')),
  (1, 7, 9, 6, 200, 200, 'concluido', datetime('now', '-20 days'));

-- Atendimento 2 (cliente Maria - finalizado)
INSERT INTO itens_atendimento (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_pago, status, concluido_at) VALUES 
  (2, 2, 10, 7, 120, 120, 'concluido', datetime('now', '-15 days')),
  (2, 16, 10, 7, 1200, 1200, 'concluido', datetime('now', '-15 days'));

-- Atendimento 3 (cliente Pedro - finalizado)
INSERT INTO itens_atendimento (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_pago, status, concluido_at) VALUES 
  (3, 10, 11, 6, 250, 250, 'concluido', datetime('now', '-10 days')),
  (3, 4, 11, 6, 150, 150, 'concluido', datetime('now', '-10 days'));

-- Atendimento 4 (cliente Ana - finalizado)
INSERT INTO itens_atendimento (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_pago, status, concluido_at) VALUES 
  (4, 13, 12, 8, 600, 600, 'concluido', datetime('now', '-5 days'));

-- Atendimento 5 (cliente Carlos - finalizado)
INSERT INTO itens_atendimento (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_pago, status, concluido_at) VALUES 
  (5, 8, 9, 6, 350, 350, 'concluido', datetime('now', '-2 days')),
  (5, 4, 9, 6, 150, 150, 'concluido', datetime('now', '-2 days'));

-- Itens em execução
INSERT INTO itens_atendimento (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_pago, status) VALUES 
  (6, 11, 10, 7, 600, 600, 'executando'),
  (7, 21, 11, 6, 3500, 3500, 'executando');

-- Itens aguardando pagamento
INSERT INTO itens_atendimento (atendimento_id, procedimento_id, criado_por_id, valor, valor_pago, status) VALUES 
  (8, 15, 8, 1000, 0, 'pendente'),
  (8, 4, 8, 150, 0, 'pendente'),
  (9, 17, 7, 2000, 500, 'pendente');

-- Itens em avaliação
INSERT INTO itens_atendimento (atendimento_id, procedimento_id, criado_por_id, valor, valor_pago, status) VALUES 
  (10, 2, 6, 120, 0, 'pendente');

-- Pagamentos realizados (atendimentos finalizados)
INSERT INTO pagamentos (atendimento_id, recebido_por_id, valor, metodo, parcelas, created_at) VALUES 
  (1, 3, 350, 'pix', 1, datetime('now', '-28 days')),
  (2, 4, 1320, 'cartao_credito', 3, datetime('now', '-23 days')),
  (3, 3, 400, 'dinheiro', 1, datetime('now', '-18 days')),
  (4, 5, 600, 'cartao_debito', 1, datetime('now', '-13 days')),
  (5, 3, 500, 'pix', 1, datetime('now', '-8 days'));

-- Pagamentos em execução
INSERT INTO pagamentos (atendimento_id, recebido_por_id, valor, metodo, parcelas, created_at) VALUES 
  (6, 4, 600, 'cartao_credito', 2, datetime('now', '-5 days')),
  (7, 3, 3500, 'cartao_credito', 10, datetime('now', '-3 days'));

-- Pagamento parcial
INSERT INTO pagamentos (atendimento_id, recebido_por_id, valor, metodo, parcelas, created_at) VALUES 
  (9, 5, 500, 'dinheiro', 1, datetime('now', '-1 day'));

-- Comissões dos atendimentos finalizados
-- Comissões de venda (avaliadores)
INSERT INTO comissoes (atendimento_id, item_atendimento_id, usuario_id, tipo, percentual, valor_base, valor_comissao, created_at) VALUES 
  (1, 1, 6, 'venda', 10, 150, 15, datetime('now', '-20 days')),
  (1, 2, 6, 'venda', 10, 200, 20, datetime('now', '-20 days')),
  (2, 3, 7, 'venda', 5, 120, 6, datetime('now', '-15 days')),
  (2, 4, 7, 'venda', 15, 1200, 180, datetime('now', '-15 days')),
  (3, 5, 6, 'venda', 10, 250, 25, datetime('now', '-10 days')),
  (3, 6, 6, 'venda', 10, 150, 15, datetime('now', '-10 days')),
  (4, 7, 8, 'venda', 10, 600, 60, datetime('now', '-5 days')),
  (5, 8, 6, 'venda', 10, 350, 35, datetime('now', '-2 days')),
  (5, 9, 6, 'venda', 10, 150, 15, datetime('now', '-2 days'));

-- Comissões de execução (executores)
INSERT INTO comissoes (atendimento_id, item_atendimento_id, usuario_id, tipo, percentual, valor_base, valor_comissao, created_at) VALUES 
  (1, 1, 9, 'execucao', 30, 150, 45, datetime('now', '-20 days')),
  (1, 2, 9, 'execucao', 35, 200, 70, datetime('now', '-20 days')),
  (2, 3, 10, 'execucao', 20, 120, 24, datetime('now', '-15 days')),
  (2, 4, 10, 'execucao', 30, 1200, 360, datetime('now', '-15 days')),
  (3, 5, 11, 'execucao', 40, 250, 100, datetime('now', '-10 days')),
  (3, 6, 11, 'execucao', 30, 150, 45, datetime('now', '-10 days')),
  (4, 7, 12, 'execucao', 40, 600, 240, datetime('now', '-5 days')),
  (5, 8, 9, 'execucao', 35, 350, 122.5, datetime('now', '-2 days')),
  (5, 9, 9, 'execucao', 30, 150, 45, datetime('now', '-2 days'));
