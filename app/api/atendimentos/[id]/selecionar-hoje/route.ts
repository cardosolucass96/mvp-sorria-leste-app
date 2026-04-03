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

interface EtapaRow {
  id: number;
}

interface EtapaAgendar {
  etapa_id: number;
  item_id: number;
  data_agendada?: string | null;
  tipo?: 'face' | 'modelo';
  valor?: number | null;
  pago_override?: 0 | 1; // quando definido, usa este valor em vez de inferir pelo status do item
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
        itens_agendar: Array<{ item_id: number; data_agendada?: string | null }>;
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

      for (const { item_id, data_agendada } of itens_agendar) {
        const item = await queryOne<ItemRow>(
          'SELECT id, procedimento_id, executor_id, status FROM itens_atendimento WHERE id = ? AND atendimento_id = ?',
          [item_id, id]
        );

        if (!item) continue;

        const statusAgendamento = data_agendada ? 'agendado' : 'pendente';
        const pagoFlag = item.status === 'pago' ? 1 : 0;
        await execute(
          `INSERT INTO agendamentos
            (cliente_id, atendimento_origem_id, procedimento_id, executor_id, data_agendada, status, pago, unidade_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            atendimento.cliente_id,
            atendimento.id,
            item.procedimento_id,
            item.executor_id ?? null,
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

        // Remove item com cascata de etapas/prontuários
        const etapas = await query<EtapaRow>(
          'SELECT id FROM etapas_procedimento WHERE item_atendimento_id = ?',
          [item.id]
        );

        for (const etapa of etapas) {
          await execute('DELETE FROM prontuarios_etapa WHERE etapa_id = ?', [etapa.id]);
        }

        await execute('DELETE FROM etapas_procedimento WHERE item_atendimento_id = ?', [item.id]);
        await execute('DELETE FROM itens_atendimento WHERE id = ?', [item.id]);
      }

      // ── Etapas individuais adiadas ──
      // Face (restauração): 1 agendamento por item — agrupa todas as faces adiadas
      // Modelo (canal, multi-sessão): 1 agendamento por etapa — cada etapa é uma sessão independente

      if (etapas_agendar.length > 0) {
        // Separa por tipo
        const faceEtapas = etapas_agendar.filter(e => (e.tipo ?? 'face') === 'face');
        const modeloEtapas = etapas_agendar.filter(e => e.tipo === 'modelo');

        // ── Face: agrupa por item_id (1 agendamento por item com etapas adiadas) ──
        if (faceEtapas.length > 0) {
          const porItem = new Map<number, { etapa_ids: number[]; data_agendada: string | null }>();
          for (const { etapa_id, item_id, data_agendada } of faceEtapas) {
            if (!porItem.has(item_id)) {
              porItem.set(item_id, { etapa_ids: [], data_agendada: data_agendada ?? null });
            }
            porItem.get(item_id)!.etapa_ids.push(etapa_id);
          }

          for (const [item_id, { etapa_ids, data_agendada }] of porItem) {
            const item = await queryOne<ItemRow>(
              'SELECT id, procedimento_id, executor_id, status FROM itens_atendimento WHERE id = ? AND atendimento_id = ?',
              [item_id, id]
            );
            if (!item) continue;

            const statusAgendamento = data_agendada ? 'agendado' : 'pendente';
            const pagoFlagFace = item.status === 'pago' ? 1 : 0;
            await execute(
              `INSERT INTO agendamentos
                (cliente_id, atendimento_origem_id, procedimento_id, executor_id, data_agendada, status, pago, unidade_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [atendimento.cliente_id, atendimento.id, item.procedimento_id, item.executor_id ?? null, data_agendada, statusAgendamento, pagoFlagFace, atendimento.unidade_id]
            );

            for (const etapa_id of etapa_ids) {
              await execute('DELETE FROM prontuarios_etapa WHERE etapa_id = ?', [etapa_id]);
              await execute('DELETE FROM etapas_procedimento WHERE id = ? AND item_atendimento_id = ?', [etapa_id, item_id]);
            }
          }
        }

        // ── Modelo: 1 agendamento por etapa — cada sessão é independente ──
        if (modeloEtapas.length > 0) {
          // Rastreia etapas adiadas por item para calcular valor e label das feitas hoje
          const etapasDeferidas = new Map<number, { procedimento_id: number; etapa_modelo_ids: Set<number> }>();

          for (const { etapa_id, item_id, data_agendada, pago_override } of modeloEtapas) {
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
            await execute(
              `INSERT INTO agendamentos
                (cliente_id, atendimento_origem_id, procedimento_id, executor_id, data_agendada, status, etapa_modelo_id, pago, unidade_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                atendimento.cliente_id,
                atendimento.id,
                item.procedimento_id,
                item.executor_id ?? null,
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
            const etapasHoje = todasEtapas.filter(e => !etapa_modelo_ids.has(e.id));

            if (etapasHoje.length > 0 && etapasHoje.length < todasEtapas.length) {
              const label = etapasHoje.map(e => e.nome).join(', ');
              const todosTemValor = etapasHoje.every(e => e.valor != null);

              if (todosTemValor) {
                // Seta o valor exato das etapas feitas hoje (não subtrai — evita dependência do valor base)
                const valorHoje = etapasHoje.reduce((sum, e) => sum + (e.valor ?? 0), 0);
                await execute(
                  "UPDATE itens_atendimento SET valor = ?, etapa_label = ?, status = 'pago' WHERE id = ? AND status = 'pendente'",
                  [valorHoje, label, item_id]
                );
              } else {
                await execute(
                  "UPDATE itens_atendimento SET etapa_label = ?, status = 'pago' WHERE id = ? AND status = 'pendente'",
                  [label, item_id]
                );
              }
            }
          }
        }
      }

      const agendamentosCriados =
        itens_agendar.length +
        (etapas_agendar.filter(e => (e.tipo ?? 'face') === 'face').length > 0
          ? new Set(etapas_agendar.filter(e => (e.tipo ?? 'face') === 'face').map(e => e.item_id)).size
          : 0) +
        etapas_agendar.filter(e => e.tipo === 'modelo').length;

      return NextResponse.json({ agendamentos_criados: agendamentosCriados });
    } catch (error) {
      console.error('Erro ao selecionar procedimentos:', error);
      const msg = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `Erro ao processar seleção: ${msg}` }, { status: 500 });
    }
  }
);
