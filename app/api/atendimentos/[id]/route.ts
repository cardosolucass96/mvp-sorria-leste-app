import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query, execute } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { buscarEtapasComValor, roundMoney, somarAlocacoesAtivasDaEtapa } from '@/lib/helpers/pagamentoFlow';
import { PROXIMOS_STATUS, STATUS_ANTERIOR } from '@/lib/constants/status';

interface Atendimento {
  id: number;
  cliente_id: number;
  avaliador_id: number | null;
  status: string;
  created_at: string;
  finalizado_at: string | null;
}

interface AtendimentoComCliente extends Atendimento {
  cliente_nome: string;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  cliente_email: string | null;
  avaliador_nome: string | null;
}

interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  executor_id: number | null;
  criado_por_id: number | null;
  valor: number;
  valor_original: number | null;
  valor_final: number | null;
  desconto_valor: number;
  desconto_motivo: string | null;
  desconto_aplicado_por_id: number | null;
  desconto_aplicado_em: string | null;
  etapas_valores: string | null;
  valor_pago: number;
  status: string;
  created_at: string;
  concluido_at: string | null;
  procedimento_nome: string;
  executor_nome: string | null;
  group_id: string | null;
  dente_unico: string | null;
  por_dente: number;
  tem_etapas: number;
  etapa_label: string | null;
  etapas?: EtapaItem[];
}

interface EtapaItem {
  id: number;
  item_atendimento_id: number;
  dente: string;
  face: string;
  status: string;
  nome?: string;
  tipo?: 'face' | 'modelo';
  valor?: number | null;
  valor_pago?: number;
  saldo?: number;
  financeiro_status?: 'nao_pago' | 'parcial' | 'pago';
  destino_status?: string | null;
  data_agendada?: string | null;
  executor_destino_id?: number | null;
}

interface CountResult {
  count: number;
}

interface SumResult {
  total: number | null;
}

interface SQLiteColumn {
  name: string;
}

interface DestinoRow {
  item_atendimento_id: number;
  etapa_modelo_id: number | null;
  destino_status: string;
  data_agendada: string | null;
  executor_id: number | null;
}

let observacoesEncerramentoGarantida = false;

async function garantirColunaObservacoesEncerramento() {
  if (observacoesEncerramentoGarantida) return;

  const colunas = await query<SQLiteColumn>('PRAGMA table_info(atendimentos)');
  const temColuna = colunas.some((coluna) => coluna.name === 'observacoes_encerramento');

  if (!temColuna) {
    await execute('ALTER TABLE atendimentos ADD COLUMN observacoes_encerramento TEXT');
    console.warn('[MIGRATION] Coluna atendimentos.observacoes_encerramento foi adicionada automaticamente.');
  }

  observacoesEncerramentoGarantida = true;
}

// GET /api/atendimentos/[id] - Busca atendimento por ID com detalhes
export const GET = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const params = await context.params!;
    const id = params.id as string;

    // Busca atendimento com dados do cliente (verificando unidade)
    const atendimento = await queryOne<AtendimentoComCliente>(
      `SELECT
        a.*,
        c.nome as cliente_nome,
        c.cpf as cliente_cpf,
        c.telefone as cliente_telefone,
        c.email as cliente_email,
        u.nome as avaliador_nome,
        u2.nome as liberado_por_nome
      FROM atendimentos a
      INNER JOIN clientes c ON a.cliente_id = c.id
      LEFT JOIN usuarios u ON a.avaliador_id = u.id
      LEFT JOIN usuarios u2 ON a.liberado_por_id = u2.id
      WHERE a.id = ? AND a.unidade_id = ?`,
      [parseInt(id), context.unidadeId]
    );
    
    if (!atendimento) {
      return NextResponse.json(
        { error: 'Atendimento não encontrado' },
        { status: 404 }
      );
    }
    
    // Busca itens do atendimento
    const itens = await query<ItemAtendimento>(
      `SELECT
        i.*,
        i.group_id,
        CASE
          WHEN i.group_id IS NOT NULL
          THEN json_extract(i.dentes, '$[0].dente')
          ELSE NULL
        END as dente_unico,
        p.nome as procedimento_nome,
        p.por_dente,
        p.tem_etapas,
        u.nome as executor_nome,
        c.nome as criado_por_nome
      FROM itens_atendimento i
      INNER JOIN procedimentos p ON i.procedimento_id = p.id
      LEFT JOIN usuarios u ON i.executor_id = u.id
      LEFT JOIN usuarios c ON i.criado_por_id = c.id
      WHERE i.atendimento_id = ?
      ORDER BY i.group_id NULLS LAST, i.created_at ASC`,
      [parseInt(id)]
    );
    
    // Busca etapas pendentes para os itens
    // - Procedimentos com tem_etapas=1: usa procedimento_etapas_modelo (sessões)
    // - Demais procedimentos: sem etapas (face-per-dente removida do MVP)
    let itensComEtapas: ItemAtendimento[] = itens;
    if (itens.length > 0) {
      const itensModelo = itens.filter(i => i.tem_etapas);
      const destinos = await query<DestinoRow>(
        `SELECT item_atendimento_id, etapa_modelo_id, destino_status, data_agendada, executor_id
         FROM itens_atendimento_destinos
         WHERE atendimento_id = ?`,
        [parseInt(id)]
      );
      const destinoMap = new Map(destinos.map((destino) => [
        `${destino.item_atendimento_id}:${destino.etapa_modelo_id ?? 'item'}`,
        destino,
      ]));

      // Session-level etapas (canal, implante, etc — usa modelo do procedimento)
      const modeloEtapasMap = new Map<number, EtapaItem[]>();
      for (const item of itensModelo) {
        const modelos = await buscarEtapasComValor(item);
        // ID virtual único por item: evita colisão quando dois itens usam o mesmo procedimento
        const etapas: EtapaItem[] = [];
        for (const m of modelos) {
          const valorPagoEtapa = await somarAlocacoesAtivasDaEtapa(item.id, m.id);
          const valorEtapa = roundMoney(m.valor ?? 0);
          const saldo = roundMoney(Math.max(0, valorEtapa - valorPagoEtapa));
          const destino = destinoMap.get(`${item.id}:${m.id}`);
          etapas.push({
            id: item.id * 100000 + m.id,
            item_atendimento_id: item.id,
            dente: '',
            face: '' as 'V',
            status: 'pendente',
            nome: m.nome,
            tipo: 'modelo' as const,
            valor: valorEtapa,
            valor_pago: valorPagoEtapa,
            saldo,
            financeiro_status: valorPagoEtapa <= 0 ? 'nao_pago' : valorPagoEtapa >= valorEtapa ? 'pago' : 'parcial',
            destino_status: destino?.destino_status ?? null,
            data_agendada: destino?.data_agendada ?? null,
            executor_destino_id: destino?.executor_id ?? null,
          });
        }
        modeloEtapasMap.set(item.id, etapas);
      }

      // Para itens com tem_etapas=1, busca progresso geral (etapas concluídas em outros atendimentos do mesmo cliente+procedimento)
      const progressoMap = new Map<number, { nome: string; status: string }[]>();
      if (itensModelo.length > 0) {
        // Pega o cliente_id do atendimento
        const clienteId = atendimento.cliente_id;
        // Para cada procedimento com etapas, busca quais etapas_modelo já foram concluídas
        const procIds = [...new Set(itensModelo.map(i => i.procedimento_id))];
        for (const procId of procIds) {
          const etapasModelo = await query<{ id: number; nome: string; ordem: number }>(
            `SELECT id, nome, ordem FROM procedimento_etapas_modelo WHERE procedimento_id = ? ORDER BY ordem ASC`,
            [procId]
          );
          // Busca quais etapas já foram concluídas para este cliente+procedimento
          // Suporta tanto etapa_modelo_id (itens novos) quanto etapa_label (itens legados)
          const concluidas = await query<{ etapa_modelo_id: number | null; etapa_label: string | null }>(
            `SELECT DISTINCT i.etapa_modelo_id, i.etapa_label
             FROM itens_atendimento i
             INNER JOIN atendimentos a ON i.atendimento_id = a.id
             WHERE a.cliente_id = ? AND i.procedimento_id = ? AND i.status = 'concluido'`,
            [clienteId, procId]
          );
          const concluidasIdSet = new Set(concluidas.filter(c => c.etapa_modelo_id).map(c => c.etapa_modelo_id));
          const concluidasLabelSet = new Set(concluidas.filter(c => c.etapa_label).map(c => c.etapa_label));
          const progresso = etapasModelo.map(e => ({
            nome: e.nome,
            status: concluidasIdSet.has(e.id) || concluidasLabelSet.has(e.nome) ? 'concluido' : 'pendente',
          }));
          // Mapeia para todos os itens deste procedimento neste atendimento
          for (const item of itensModelo.filter(i => i.procedimento_id === procId)) {
            progressoMap.set(item.id, progresso);
          }
        }
      }

      itensComEtapas = itens.map(item => {
        const destinoItem = destinoMap.get(`${item.id}:item`);
        return {
          ...item,
          valor_final: item.valor_final ?? item.valor,
          etapas: item.tem_etapas ? (modeloEtapasMap.get(item.id) ?? []) : [],
          progresso_etapas: progressoMap.get(item.id) ?? null,
          destino_status: destinoItem?.destino_status ?? null,
          destino_data_agendada: destinoItem?.data_agendada ?? null,
          destino_executor_id: destinoItem?.executor_id ?? null,
          saldo: roundMoney(Math.max(0, (item.valor_final ?? item.valor) - item.valor_pago)),
          financeiro_status: item.valor_pago <= 0
            ? 'nao_pago'
            : item.valor_pago >= (item.valor_final ?? item.valor)
              ? 'pago'
              : 'parcial',
        };
      });
    }

    // Calcula totais
    const totalResult = await queryOne<SumResult>(
      'SELECT SUM(COALESCE(valor_final, valor)) as total FROM itens_atendimento WHERE atendimento_id = ?',
      [parseInt(id)]
    );

    // total_pago = quanto os itens deste atendimento já têm quitado.
    // Usa valor_pago dos itens para cobrir sessões/agendamentos pré-pagos,
    // mesmo quando não houve novo registro em pagamentos neste atendimento.
    const totalPagoResult = await queryOne<SumResult>(
      'SELECT COALESCE(SUM(valor_pago), 0) as total FROM itens_atendimento WHERE atendimento_id = ?',
      [parseInt(id)]
    );
    
    return NextResponse.json({
      ...atendimento,
      itens: itensComEtapas,
      total: totalResult?.total || 0,
      total_pago: totalPagoResult?.total || 0,
    });
  } catch (error) {
    console.error('Erro ao buscar atendimento:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar atendimento' },
      { status: 500 }
    );
  }
});

// PUT /api/atendimentos/[id] - Atualiza atendimento (muda status)
export const PUT = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const params = await context.params!;
    const id = params.id as string;
    const body = await request.json();
    const { status, avaliador_id, motivo_saida, observacoes_encerramento } = body;
    
    // Verifica se existe (e pertence à unidade)
    const atendimento = await queryOne<Atendimento>(
      'SELECT * FROM atendimentos WHERE id = ? AND unidade_id = ?',
      [parseInt(id), context.unidadeId]
    );

    if (!atendimento) {
      return NextResponse.json(
        { error: 'Atendimento não encontrado' },
        { status: 404 }
      );
    }

    // Se está mudando status, valida as regras de transição
    if (status && status !== atendimento.status) {
      const validacao = await validarTransicao(atendimento, status, parseInt(id));
      if (!validacao.valido) {
        return NextResponse.json(
          { error: validacao.mensagem },
          { status: 400 }
        );
      }
    }
    
    // Monta query de update
    const updates: string[] = [];
    const updateParams: (string | number | null)[] = [];
    
    if (status) {
      updates.push('status = ?');
      updateParams.push(status);
      
      // Se liberando para execução, marca quem liberou e quando
      if (status === 'em_execucao' && atendimento.status === 'aguardando_pagamento') {
        updates.push('liberado_por_id = ?');
        updateParams.push(context.user.sub);
        updates.push('liberado_em = datetime(\'now\', \'localtime\')');
      }

      // Ao voltar de execução para pagamento, limpa o contexto de liberação anterior.
      if (status === 'aguardando_pagamento' && atendimento.status === 'em_execucao') {
        updates.push('liberado_por_id = ?');
        updateParams.push(null);
        updates.push('liberado_em = ?');
        updateParams.push(null);
      }
      
      // Se finalizando, marca a data e motivo de saída (se fornecido)
      if (status === 'finalizado') {
        updates.push('finalizado_at = CURRENT_TIMESTAMP');
        if (motivo_saida) {
          updates.push('motivo_saida = ?');
          updateParams.push(motivo_saida);
        }
      }

      // Encerramento pelo atendente: salva observações
      if (status === 'encerrado') {
        if (motivo_saida) {
          updates.push('motivo_saida = ?');
          updateParams.push(motivo_saida);
        }

        const observacoesNormalizadas =
          typeof observacoes_encerramento === 'string'
            ? observacoes_encerramento.trim()
            : observacoes_encerramento;

        if (observacoesNormalizadas) {
          await garantirColunaObservacoesEncerramento();
          updates.push('observacoes_encerramento = ?');
          updateParams.push(observacoesNormalizadas);
        }
      }
    }
    
    if (avaliador_id !== undefined) {
      updates.push('avaliador_id = ?');
      updateParams.push(avaliador_id || null);
    }
    
    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum campo para atualizar' },
        { status: 400 }
      );
    }
    
    updateParams.push(parseInt(id));
    
    await execute(
      `UPDATE atendimentos SET ${updates.join(', ')} WHERE id = ?`,
      updateParams
    );

    if (status === 'aguardando_pagamento' && atendimento.status === 'em_execucao') {
      // Procedimentos "em andamento" voltam para "pago" quando o atendimento sai da execução.
      // Itens já concluídos permanecem concluídos para preservar o histórico clínico.
      await execute(
        `UPDATE itens_atendimento
         SET status = 'pago'
         WHERE atendimento_id = ? AND status = 'executando'`,
        [parseInt(id)]
      );
    }
    
    // Retorna atendimento atualizado
    const atualizado = await queryOne<AtendimentoComCliente>(
      `SELECT 
        a.*,
        c.nome as cliente_nome,
        c.cpf as cliente_cpf,
        c.telefone as cliente_telefone,
        u.nome as avaliador_nome,
        u2.nome as liberado_por_nome
      FROM atendimentos a
      INNER JOIN clientes c ON a.cliente_id = c.id
      LEFT JOIN usuarios u ON a.avaliador_id = u.id
      LEFT JOIN usuarios u2 ON a.liberado_por_id = u2.id
      WHERE a.id = ?`,
      [parseInt(id)]
    );
    
    return NextResponse.json(atualizado);
  } catch (error) {
    console.error('Erro ao atualizar atendimento:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar atendimento' },
      { status: 500 }
    );
  }
});

// DELETE /api/atendimentos/[id] - Arquiva/desconsidera atendimento
export const DELETE = withUnit(async (_request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const params = await context.params!;
    const id = params.id as string;
    const atendimentoId = parseInt(id);

    const atendimento = await queryOne<Atendimento>(
      'SELECT * FROM atendimentos WHERE id = ? AND unidade_id = ?',
      [atendimentoId, context.unidadeId]
    );

    if (!atendimento) {
      return NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 });
    }

    if (atendimento.status === 'encerrado') {
      return NextResponse.json(
        { error: 'Atendimento já está encerrado/arquivado' },
        { status: 400 }
      );
    }

    await garantirColunaObservacoesEncerramento();

    await execute(
      `UPDATE atendimentos
       SET status = 'encerrado',
           motivo_saida = COALESCE(motivo_saida, 'sem_tratamento'),
           observacoes_encerramento = COALESCE(
             NULLIF(observacoes_encerramento, ''),
             'Atendimento desconsiderado/arquivado manualmente.'
           ),
           finalizado_at = COALESCE(finalizado_at, datetime('now', 'localtime'))
       WHERE id = ?`,
      [atendimentoId]
    );

    return NextResponse.json({ success: true, archived: true });
  } catch (error) {
    console.error('Erro ao arquivar atendimento:', error);
    return NextResponse.json({ error: 'Erro ao arquivar atendimento' }, { status: 500 });
  }
});

// Função para validar transições de status
async function validarTransicao(
  atendimento: Atendimento,
  novoStatus: string,
  atendimentoId: number
): Promise<{ valido: boolean; mensagem: string }> {
  const statusAtual = atendimento.status;
  
  const proximoStatus = PROXIMOS_STATUS[statusAtual as keyof typeof PROXIMOS_STATUS];
  const statusAnterior = STATUS_ANTERIOR[statusAtual as keyof typeof STATUS_ANTERIOR];
  const transicoesPermitidas = [
    proximoStatus,
    statusAnterior,
    statusAtual === 'finalizado' ? 'encerrado' : null,
  ].filter((value): value is string => Boolean(value));
  
  // Verifica se a transição é permitida
  if (!transicoesPermitidas.includes(novoStatus)) {
    return {
      valido: false,
      mensagem: `Não é possível mudar de "${statusAtual}" para "${novoStatus}"`,
    };
  }
  
  // Validações específicas por transição
  
  // Avaliação → Aguardando Pagamento: precisa ter pelo menos 1 procedimento
  if (statusAtual === 'avaliacao' && novoStatus === 'aguardando_pagamento') {
    const itens = await queryOne<CountResult>(
      'SELECT COUNT(*) as count FROM itens_atendimento WHERE atendimento_id = ?',
      [atendimentoId]
    );
    
    if (!itens || itens.count === 0) {
      return {
        valido: false,
        mensagem: 'É necessário adicionar pelo menos um procedimento',
      };
    }
  }
  
  // Aguardando Pagamento → Em Execução: os itens que ficaram neste atendimento
  // precisam estar financeiramente cobertos (inclusive pré-pagos vindos da agenda).
  if (statusAtual === 'aguardando_pagamento' && novoStatus === 'em_execucao') {
    const itensRestantes = await queryOne<CountResult>(
      'SELECT COUNT(*) as count FROM itens_atendimento WHERE atendimento_id = ?',
      [atendimentoId]
    );
    if (!itensRestantes || itensRestantes.count === 0) {
      return {
        valido: false,
        mensagem: 'Defina ao menos um procedimento para hoje antes de liberar a execução',
      };
    }

    const itensSemCobertura = await queryOne<CountResult>(
      `SELECT COUNT(*) as count
       FROM itens_atendimento
       WHERE atendimento_id = ?
         AND valor_pago + 0.001 < COALESCE(valor_final, valor)`,
      [atendimentoId]
    );

    if (itensSemCobertura && itensSemCobertura.count > 0) {
      return {
        valido: false,
        mensagem: 'Ainda existem procedimentos de hoje sem cobertura financeira suficiente',
      };
    }
  }
  
  // NOTA: Em Execução → Finalizado é validado pelo endpoint dedicado
  // /api/atendimentos/[id]/finalizar (Sprint 7) que verifica:
  //   - todos procedimentos concluídos
  //   - pagamento completo
  
  return { valido: true, mensagem: '' };
}
