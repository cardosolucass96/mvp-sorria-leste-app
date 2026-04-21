-- Adiciona override per-item dos valores das sessões (etapas) de um procedimento.
-- JSON format: {"<etapa_modelo_id>": <valor_number>, ...}
-- Quando existe, cada sessão usa o valor do override em vez do template.
-- Permite ao atendente editar o preço de cada sessão individualmente na fase de
-- aguardando_pagamento/avaliacao. Soma das sessões = item.valor.

ALTER TABLE itens_atendimento ADD COLUMN etapas_valores TEXT;
