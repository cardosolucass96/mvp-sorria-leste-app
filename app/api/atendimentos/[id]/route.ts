import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query, execute } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';

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
  etapas_valores: string | null;
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
}

interface CountResult {
  count: number;
}

interface SumResult {
  total: number | null;
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
    // - Demais procedimentos: usa etapas_procedimento (faces por dente)
    let itensComEtapas: ItemAtendimento[] = itens;
    if (itens.length > 0) {
      const itensFace = itens.filter(i => !i.tem_etapas);
      const itensModelo = itens.filter(i => i.tem_etapas);

      // Face-level etapas (restauração, por dente+face)
      let faceEtapas: EtapaItem[] = [];
      if (itensFace.length > 0) {
        const placeholders = itensFace.map(() => '?').join(',');
        faceEtapas = await query<EtapaItem>(
          `SELECT id, item_atendimento_id, dente, face, status
           FROM etapas_procedimento
           WHERE item_atendimento_id IN (${placeholders}) AND status = 'pendente'`,
          itensFace.map(i => i.id)
        );
      }

      // Session-level etapas (canal, implante, etc — usa modelo do procedimento)
      const modeloEtapasMap = new Map<number, EtapaItem[]>();
      for (const item of itensModelo) {
        const modelos = await query<{ id: number; nome: string; valor: number | null; ordem: number }>(
          `SELECT id, nome, valor, ordem FROM procedimento_etapas_modelo WHERE procedimento_id = ? ORDER BY ordem ASC`,
          [item.procedimento_id]
        );
        // Aplica override per-item: se item.etapas_valores tem a etapa, usa o valor override.
        // Caso contrário, usa valor do template (pode ser null = proporcional).
        let overrides: Record<string, number> = {};
        if (item.etapas_valores) {
          try {
            overrides = JSON.parse(item.etapas_valores) as Record<string, number>;
          } catch {
            overrides = {};
          }
        }
        // ID virtual único por item: evita colisão quando dois itens usam o mesmo procedimento
        modeloEtapasMap.set(item.id, modelos.map(m => ({
          id: item.id * 100000 + m.id,
          item_atendimento_id: item.id,
          dente: '',
          face: '' as 'V',
          status: 'pendente',
          nome: m.nome,
          tipo: 'modelo' as const,
          valor: overrides[String(m.id)] ?? m.valor,
        })));
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

      itensComEtapas = itens.map(item => ({
        ...item,
        etapas: item.tem_etapas
          ? (modeloEtapasMap.get(item.id) ?? [])
          : faceEtapas.filter(e => e.item_atendimento_id === item.id),
        progresso_etapas: progressoMap.get(item.id) ?? null,
      }));
    }

    // Calcula totais
    const totalResult = await queryOne<SumResult>(
      'SELECT SUM(valor) as total FROM itens_atendimento WHERE atendimento_id = ?',
      [parseInt(id)]
    );

    // total_pago = soma dos pagamentos não cancelados (modelo simplificado sem distribuição por item)
    const totalPagoResult = await queryOne<SumResult>(
      'SELECT COALESCE(SUM(valor), 0) as total FROM pagamentos WHERE atendimento_id = ? AND cancelado = 0',
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
        if (observacoes_encerramento !== undefined) {
          updates.push('observacoes_encerramento = ?');
          updateParams.push(observacoes_encerramento);
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

// DELETE /api/atendimentos/[id] - Exclui atendimento
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

    if (['finalizado', 'encerrado'].includes(atendimento.status)) {
      return NextResponse.json(
        { error: 'Atendimentos finalizados não podem ser excluídos' },
        { status: 400 }
      );
    }

    const temPagamento = await queryOne<CountResult>(
      'SELECT COUNT(*) as count FROM pagamentos WHERE atendimento_id = ?',
      [atendimentoId]
    );

    if (temPagamento && temPagamento.count > 0) {
      return NextResponse.json(
        { error: 'Atendimento com pagamentos registrados não pode ser excluído' },
        { status: 400 }
      );
    }

    // Cascade manual (FK sem ON DELETE CASCADE no SQLite)
    const itens = await query<{ id: number }>(
      'SELECT id FROM itens_atendimento WHERE atendimento_id = ?',
      [atendimentoId]
    );

    for (const item of itens) {
      await execute('DELETE FROM prontuarios WHERE item_atendimento_id = ?', [item.id]);
      await execute('DELETE FROM notas_execucao WHERE item_atendimento_id = ?', [item.id]);
      await execute('DELETE FROM anexos_execucao WHERE item_atendimento_id = ?', [item.id]);
      await execute('DELETE FROM comissoes WHERE item_atendimento_id = ?', [item.id]);
    }

    await execute('DELETE FROM itens_atendimento WHERE atendimento_id = ?', [atendimentoId]);

    // Cascade: delete agendamentos originated from this atendimento
    await execute('DELETE FROM agendamentos WHERE atendimento_origem_id = ?', [atendimentoId]);

    // Revert agendamentos that point to this atendimento as session (don't delete, preserve history)
    await execute(
      `UPDATE agendamentos SET
        atendimento_sessao_id = NULL,
        status = 'agendado',
        updated_at = datetime('now','localtime')
      WHERE atendimento_sessao_id = ?`,
      [atendimentoId]
    );

    await execute('DELETE FROM atendimentos WHERE id = ?', [atendimentoId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir atendimento:', error);
    return NextResponse.json({ error: 'Erro ao excluir atendimento' }, { status: 500 });
  }
});

// Função para validar transições de status
async function validarTransicao(
  atendimento: Atendimento,
  novoStatus: string,
  atendimentoId: number
): Promise<{ valido: boolean; mensagem: string }> {
  const statusAtual = atendimento.status;
  
  // Transições permitidas (finalizado só via /finalizar endpoint)
  const transicoesPermitidas: Record<string, string[]> = {
    triagem: ['avaliacao'],
    avaliacao: ['aguardando_pagamento'],
    aguardando_pagamento: ['em_execucao'],
    em_execucao: ['aguardando_pagamento'],
    finalizado: ['encerrado'],
    encerrado: [],
  };
  
  // Verifica se a transição é permitida
  if (!transicoesPermitidas[statusAtual]?.includes(novoStatus)) {
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
  
  // Aguardando Pagamento → Em Execução: precisa ter ao menos 1 pagamento ativo
  if (statusAtual === 'aguardando_pagamento' && novoStatus === 'em_execucao') {
    const pagamentoAtivo = await queryOne<CountResult>(
      'SELECT COUNT(*) as count FROM pagamentos WHERE atendimento_id = ? AND cancelado = 0',
      [atendimentoId]
    );

    if (!pagamentoAtivo || pagamentoAtivo.count === 0) {
      return {
        valido: false,
        mensagem: 'É necessário registrar ao menos um pagamento para liberar o atendimento',
      };
    }
  }
  
  // NOTA: Em Execução → Finalizado é validado pelo endpoint dedicado
  // /api/atendimentos/[id]/finalizar (Sprint 7) que verifica:
  //   - todos procedimentos concluídos
  //   - pagamento completo
  
  return { valido: true, mensagem: '' };
}
