import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';

interface AtendimentoRow {
  id: number;
  cliente_id: number;
  agendamento_id: number | null;
  unidade_id: number;
  status: string;
}

interface ItemRow {
  id: number;
  procedimento_id: number;
  executor_id: number | null;
  status: string;
}

interface EtapaAgendar {
  etapa_id: number;
  item_id: number;
  data_agendada?: string | null;
  valor?: number | null;
  pago_override?: 0 | 1; // quando definido, usa este valor em vez de inferir pelo status do item
  executor_id?: number | null; // opcional — sobrescreve o executor padrão do item
}

// POST /api/atendimentos/[id]/selecionar-hoje
// Confirma quais procedimentos serão feitos hoje e agenda os demais
export const POST = withUnit(
  async (
    request: NextRequest,
    context: UnitAuthenticatedContext
  ) => {
    try {
      const params = await context.params;
      const id = parseInt(params!.id as string);

      const body = await request.json();
      const {
        itens_hoje,
        itens_agendar,
        etapas_agendar = [],
      }: {
        itens_hoje: number[];
        itens_agendar: Array<{ item_id: number; data_agendada?: string | null; executor_id?: number | null }>;
        etapas_agendar?: EtapaAgendar[];
      } = body;

      if (!Array.isArray(itens_hoje) || !Array.isArray(itens_agendar)) {
        return NextResponse.json(
          { error: 'itens_hoje e itens_agendar são obrigatórios' },
          { status: 400 }
        );
      }

      // Valida atendimento e verifica unidade
      const atendimento = await queryOne<AtendimentoRow>(
        'SELECT id, cliente_id, agendamento_id, unidade_id, status FROM atendimentos WHERE id = ? AND unidade_id = ?',
        [id, context.unidadeId]
      );

      if (!atendimento) {
        return NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 });
      }

      if (atendimento.status !== 'aguardando_pagamento') {
        return NextResponse.json(
          { error: 'Atendimento não está em aguardando_pagamento' },
          { status: 400 }
        );
      }

      if (itens_agendar.length === 0 && etapas_agendar.length === 0) {
        return NextResponse.json({ agendamentos_criados: 0 });
      }

      // ── Itens inteiros adiados (procedimento sem etapas selecionado para outra data) ──

      for (const { item_id, data_agendada, executor_id: executorOverride } of itens_agendar) {
        const item = await queryOne<ItemRow>(
          'SELECT id, procedimento_id, executor_id, status FROM itens_atendimento WHERE id = ? AND atendimento_id = ?',
          [item_id, id]
        );

        if (!item) continue;

        const statusAgendamento = data_agendada ? 'agendado' : 'pendente';
        const pagoFlag = item.status === 'pago' ? 1 : 0;
        const executorFinal = executorOverride !== undefined ? executorOverride : item.executor_id;
        await execute(
          `INSERT INTO agendamentos
            (cliente_id, atendimento_origem_id, procedimento_id, executor_id, data_agendada, status, pago, unidade_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            atendimento.cliente_id,
            atendimento.id,
            item.procedimento_id,
            executorFinal ?? null,
            data_agendada ?? null,
            statusAgendamento,
            pagoFlag,
            atendimento.unidade_id,
          ]
        );

        // Anula referências FK antes de deletar o item
        await execute(
          'UPDATE agendamentos SET item_atendimento_origem_id = NULL WHERE item_atendimento_origem_id = ?',
          [item.id]
        );

        await execute('DELETE FROM itens_atendimento WHERE id = ?', [item.id]);
      }

      // ── Etapas individuais adiadas (sessões multi-encontro de canal/implante) ──
      // 1 agendamento por etapa — cada sessão é independente
      if (etapas_agendar.length > 0) {
        // Rastreia etapas adiadas por item para calcular valor e label das feitas hoje
        const etapasDeferidas = new Map<number, { procedimento_id: number; etapa_modelo_ids: Set<number> }>();

        for (const { etapa_id, item_id, data_agendada, pago_override, executor_id: executorOverride } of etapas_agendar) {
          const item = await queryOne<ItemRow>(
            'SELECT id, procedimento_id, executor_id, status FROM itens_atendimento WHERE id = ? AND atendimento_id = ?',
            [item_id, id]
          );
          if (!item) continue;

          // Decodifica o ID virtual: etapa_id = item_id * 100000 + etapa_modelo.id
          const etapaModeloId = etapa_id - item_id * 100000;

          const statusAgendamento = data_agendada ? 'agendado' : 'pendente';
          const pagoFlagModelo = pago_override !== undefined && pago_override !== null
            ? pago_override
            : (item.status === 'pago' ? 1 : 0);
          const executorFinalModelo = executorOverride !== undefined ? executorOverride : item.executor_id;
          await execute(
            `INSERT INTO agendamentos
              (cliente_id, atendimento_origem_id, procedimento_id, executor_id, data_agendada, status, etapa_modelo_id, pago, unidade_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              atendimento.cliente_id,
              atendimento.id,
              item.procedimento_id,
              executorFinalModelo ?? null,
              data_agendada ?? null,
              statusAgendamento,
              etapaModeloId,
              pagoFlagModelo,
              atendimento.unidade_id,
            ]
          );

          if (!etapasDeferidas.has(item_id)) {
            etapasDeferidas.set(item_id, { procedimento_id: item.procedimento_id, etapa_modelo_ids: new Set() });
          }
          etapasDeferidas.get(item_id)!.etapa_modelo_ids.add(etapaModeloId);
        }

        // Para cada item afetado: seta valor = soma das etapas feitas hoje e grava etapa_label
        for (const [item_id, { procedimento_id, etapa_modelo_ids }] of etapasDeferidas) {
          const todasEtapas = await query<{ id: number; nome: string; valor: number | null }>(
            'SELECT id, nome, valor FROM procedimento_etapas_modelo WHERE procedimento_id = ? ORDER BY ordem ASC',
            [procedimento_id]
          );

          // Aplica override per-item se houver
          const itemOverride = await queryOne<{ etapas_valores: string | null }>(
            'SELECT etapas_valores FROM itens_atendimento WHERE id = ?',
            [item_id]
          );
          let overrides: Record<string, number> = {};
          if (itemOverride?.etapas_valores) {
            try {
              overrides = JSON.parse(itemOverride.etapas_valores) as Record<string, number>;
            } catch {
              overrides = {};
            }
          }
          const etapasComValor = todasEtapas.map(e => ({
            id: e.id,
            nome: e.nome,
            valor: overrides[String(e.id)] ?? e.valor,
          }));
          const etapasHoje = etapasComValor.filter(e => !etapa_modelo_ids.has(e.id));

          if (etapasHoje.length > 0 && etapasHoje.length < etapasComValor.length) {
            const label = etapasHoje.map(e => e.nome).join(', ');
            const todosTemValor = etapasHoje.every(e => e.valor != null);

            if (todosTemValor) {
              // Seta o valor exato das etapas feitas hoje (não subtrai — evita dependência do valor base).
              // valor_original também é resetado para a nova baseline: mudar a seleção de sessões
              // invalida qualquer desconto aplicado anteriormente (o atendente reaplica se quiser).
              const valorHoje = etapasHoje.reduce((sum, e) => sum + (e.valor ?? 0), 0);
              await execute(
                "UPDATE itens_atendimento SET valor = ?, valor_original = ?, etapa_label = ? WHERE id = ?",
                [valorHoje, valorHoje, label, item_id]
              );
            } else {
              await execute(
                "UPDATE itens_atendimento SET etapa_label = ? WHERE id = ?",
                [label, item_id]
              );
            }
          }
        }
      }

      const agendamentosCriados = itens_agendar.length + etapas_agendar.length;

      return NextResponse.json({ agendamentos_criados: agendamentosCriados });
    } catch (error) {
      console.error('Erro ao selecionar procedimentos:', error);
      const msg = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `Erro ao processar seleção: ${msg}` }, { status: 500 });
    }
  }
);
