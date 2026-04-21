-- Migration: marca itens adicionados pelo executor durante a execução
-- Esses itens seguem direto para a fila do executor (status='pago', valor_pago=0)
-- Quando o atendimento é concluído, se houver itens com adicionado_em_execucao=1 ainda
-- não pagos, o atendimento volta para 'aguardando_pagamento' em vez de 'finalizado'.

ALTER TABLE itens_atendimento ADD COLUMN adicionado_em_execucao INTEGER NOT NULL DEFAULT 0;
