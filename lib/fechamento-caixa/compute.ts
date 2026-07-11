import type {
  FechamentoCaixaAjusteResumo,
  FechamentoCaixaAvaliacaoPagaDia,
  FechamentoCaixaDentista,
  FechamentoCaixaDraft,
  FechamentoCaixaLancamentoManual,
  FechamentoCaixaProcedimento,
  FechamentoCaixaVisao,
} from './types';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function roundMoney(value: number): number {
  return Number((value || 0).toFixed(2));
}

function toKey(id: number | string): string {
  return String(id);
}

function createAjuste(
  tipo: FechamentoCaixaAjusteResumo['tipo'],
  label: string,
  motivo: string,
  antes?: number | string | boolean | null,
  depois?: number | string | boolean | null
): FechamentoCaixaAjusteResumo {
  return { tipo, label, motivo, antes, depois };
}

export function createEmptyFechamentoCaixaDraft(): FechamentoCaixaDraft {
  return {
    profissionais: {},
    procedimentos: {},
    lancamentos_manuais: [],
  };
}

export function countFechamentoCaixaAdjustments(draft: FechamentoCaixaDraft | null | undefined): number {
  if (!draft) return 0;

  let total = 0;

  Object.values(draft.profissionais).forEach((entry) => {
    if (entry.included === false) total += 1;
    if (entry.valor_diaria_override != null) total += 1;
    if (entry.comissao_avaliacao_override != null) total += 1;
  });

  Object.values(draft.procedimentos).forEach((entry) => {
    if (entry.included === false) total += 1;
    if (entry.valor_override != null) total += 1;
  });

  total += draft.lancamentos_manuais.length;
  return total;
}

function sortDentistas(dentistas: FechamentoCaixaDentista[]) {
  dentistas.sort((a, b) => {
    if (a.included !== b.included) return a.included ? -1 : 1;
    if (b.total_dia !== a.total_dia) return b.total_dia - a.total_dia;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

function sortProcedimentos(procedimentos: FechamentoCaixaProcedimento[]) {
  procedimentos.sort((a, b) => {
    if (a.included !== b.included) return a.included ? -1 : 1;
    const dateA = a.concluido_at ? new Date(a.concluido_at.replace(' ', 'T')).getTime() : 0;
    const dateB = b.concluido_at ? new Date(b.concluido_at.replace(' ', 'T')).getTime() : 0;
    return dateB - dateA;
  });
}

function sortAvaliacoesPagas(avaliacoes: FechamentoCaixaAvaliacaoPagaDia[]) {
  avaliacoes.sort((a, b) => {
    if (a.included !== b.included) return a.included ? -1 : 1;
    const dateA = a.pago_em ? new Date(a.pago_em.replace(' ', 'T')).getTime() : 0;
    const dateB = b.pago_em ? new Date(b.pago_em.replace(' ', 'T')).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA;
    return a.procedimento_label.localeCompare(b.procedimento_label, 'pt-BR');
  });
}

export function applyFechamentoCaixaDraft(
  base: FechamentoCaixaVisao,
  draft: FechamentoCaixaDraft | null | undefined
): FechamentoCaixaVisao {
  const safeDraft = draft ?? createEmptyFechamentoCaixaDraft();
  const result = clone(base);
  result.avaliacoes_pagas_dia = Array.isArray(result.avaliacoes_pagas_dia)
    ? result.avaliacoes_pagas_dia
    : [];
  result.pagamentos_recebidos_dia = Array.isArray(result.pagamentos_recebidos_dia)
    ? result.pagamentos_recebidos_dia
    : [];
  const excludedUsers = new Set<number>();

  result.dentistas.forEach((dentista) => {
    dentista.ajustes = [];
    dentista.lancamentos_manuais = [];
    dentista.manualmente_editado = false;
    dentista.ajuste_count = 0;
    dentista.comissao_execucao = 0;

    dentista.procedimentos_executados.forEach((procedimento) => {
      procedimento.ajustes = [];
      procedimento.manualmente_editado = false;
    });
  });

  result.avaliacoes_pagas_dia.forEach((avaliacao) => {
    avaliacao.ajustes = [];
    avaliacao.manualmente_editado = false;
  });

  result.lancamentos_manuais_gerais = [];

  result.dentistas.forEach((dentista) => {
    const entry = safeDraft.profissionais[toKey(dentista.usuario_id)];
    if (!entry) return;

    if (entry.included === false) {
      dentista.included = false;
      dentista.ajustes.push(
        createAjuste(
          'profissional_excluido',
          'Profissional excluído do fechamento',
          entry.included_motivo || 'Sem motivo informado',
          true,
          false
        )
      );
      excludedUsers.add(dentista.usuario_id);
    }

    if (entry.valor_diaria_override != null) {
      const before = dentista.valor_diaria;
      dentista.valor_diaria = roundMoney(entry.valor_diaria_override);
      dentista.ajustes.push(
        createAjuste(
          'diaria_override',
          'Diária ajustada manualmente',
          entry.valor_diaria_motivo || 'Sem motivo informado',
          before,
          dentista.valor_diaria
        )
      );
    }

    if (entry.comissao_avaliacao_override != null) {
      const before = dentista.comissao_avaliacao;
      dentista.comissao_avaliacao = roundMoney(entry.comissao_avaliacao_override);
      dentista.ajustes.push(
        createAjuste(
          'comissao_avaliacao_override',
          'Comissão de avaliação ajustada manualmente',
          entry.comissao_avaliacao_motivo || 'Sem motivo informado',
          before,
          dentista.comissao_avaliacao
        )
      );
    }

  });

  result.dentistas.forEach((dentista) => {
    dentista.procedimentos_executados.forEach((procedimento) => {
      const entry = safeDraft.procedimentos[procedimento.key];
      if (!entry) return;

      if (entry.included === false) {
        procedimento.included = false;
        procedimento.ajustes.push(
          createAjuste(
            'procedimento_excluido',
            'Procedimento excluído do fechamento',
            entry.included_motivo || 'Sem motivo informado',
            true,
            false
          )
        );
      }

      if (entry.valor_override != null) {
        const before = procedimento.valor;
        procedimento.valor = roundMoney(entry.valor_override);
        procedimento.ranking_avaliadores = procedimento.ranking_avaliadores.map((item) => ({
          ...item,
          valor_gerado: procedimento.valor,
        }));
        procedimento.ranking_executores = procedimento.ranking_executores.map((item) => ({
          ...item,
          valor_gerado: procedimento.valor,
        }));
        procedimento.ajustes.push(
          createAjuste(
            'procedimento_valor_override',
            'Valor do procedimento ajustado manualmente',
            entry.valor_motivo || 'Sem motivo informado',
            before,
            procedimento.valor
          )
        );
      }
    });
  });

  result.avaliacoes_pagas_dia.forEach((avaliacao) => {
    const entry = safeDraft.procedimentos[avaliacao.key];
    if (!entry) return;

    if (entry.included === false) {
      avaliacao.included = false;
      avaliacao.ajustes.push(
        createAjuste(
          'procedimento_excluido',
          'Procedimento excluído do fechamento',
          entry.included_motivo || 'Sem motivo informado',
          true,
          false
        )
      );
    }

    if (entry.valor_override != null) {
      const before = avaliacao.valor_base;
      avaliacao.valor_base = roundMoney(entry.valor_override);
      avaliacao.valor_comissao = roundMoney(avaliacao.valor_base * (avaliacao.percentual / 100));
      avaliacao.ajustes.push(
        createAjuste(
          'procedimento_valor_override',
          'Valor do procedimento ajustado manualmente',
          entry.valor_motivo || 'Sem motivo informado',
          before,
          avaliacao.valor_base
        )
      );
    }
  });

  safeDraft.lancamentos_manuais.forEach((lancamento) => {
    const normalized: FechamentoCaixaLancamentoManual = {
      ...lancamento,
      valor: roundMoney(lancamento.valor),
    };

    if (normalized.escopo === 'profissional' && normalized.usuario_id != null) {
      const dentista = result.dentistas.find((item) => item.usuario_id === normalized.usuario_id);
      if (!dentista) return;
      dentista.lancamentos_manuais.push(normalized);
      dentista.ajustes.push(
        createAjuste(
          'lancamento_manual',
          `Lançamento manual: ${normalized.descricao}`,
          normalized.motivo,
          null,
          normalized.valor
        )
      );
      return;
    }

    result.lancamentos_manuais_gerais.push(normalized);
  });

  result.dentistas.forEach((dentista) => {
    const avaliacoesPagas = result.avaliacoes_pagas_dia.filter((item) => item.usuario_id === dentista.usuario_id);

    dentista.procedimentos_executados.forEach((procedimento) => {
      procedimento.manualmente_editado = procedimento.ajustes.length > 0;
    });
    avaliacoesPagas.forEach((avaliacao) => {
      avaliacao.manualmente_editado = avaliacao.ajustes.length > 0;
    });
    dentista.comissao_avaliacao = roundMoney(
      avaliacoesPagas
        .filter((avaliacao) => avaliacao.included)
        .reduce((sum, avaliacao) => sum + avaliacao.valor_comissao, 0)
    );

    dentista.ajuste_count =
      dentista.ajustes.length
      + dentista.procedimentos_executados.reduce((sum, item) => sum + item.ajustes.length, 0)
      + avaliacoesPagas.reduce((sum, item) => sum + item.ajustes.length, 0);
    dentista.manualmente_editado = dentista.ajuste_count > 0;
    dentista.total_dia = roundMoney(
      dentista.valor_diaria
      + dentista.comissao_avaliacao
      + dentista.lancamentos_manuais.reduce((sum, item) => sum + item.valor, 0)
    );
    sortProcedimentos(dentista.procedimentos_executados);
  });

  const visibleDentistas = result.dentistas.filter((dentista) => dentista.included);
  const visibleProcedimentos = visibleDentistas.flatMap((dentista) =>
    dentista.procedimentos_executados.filter((procedimento) => procedimento.included)
  );
  const visibleAvaliacoesPagas = result.avaliacoes_pagas_dia.filter((avaliacao) =>
    avaliacao.included && !excludedUsers.has(avaliacao.usuario_id)
  );
  const activeGeneralAdjustments = result.lancamentos_manuais_gerais.reduce((sum, item) => sum + item.valor, 0);

  result.resumo.procedimentos_executados = visibleProcedimentos.length;
  result.resumo.total_diarias = roundMoney(visibleDentistas.reduce((sum, dentista) => sum + dentista.valor_diaria, 0));
  result.resumo.total_comissao_avaliacao = roundMoney(
    visibleAvaliacoesPagas.reduce((sum, avaliacao) => sum + avaliacao.valor_comissao, 0)
  );
  result.resumo.total_comissao_execucao = 0;
  result.resumo.ajustes_manuais = roundMoney(
    activeGeneralAdjustments
    + visibleDentistas.reduce(
      (sum, dentista) => sum + dentista.lancamentos_manuais.reduce((inner, item) => inner + item.valor, 0),
      0
    )
  );
  result.resumo.total_final = roundMoney(
    result.resumo.faturamento_dia
    - result.resumo.total_diarias
    - result.resumo.total_comissao_avaliacao
    + result.resumo.ajustes_manuais
  );

  const procedimentosMap = new Map<string, { nome: string; quantidade: number; valor_total: number }>();
  visibleProcedimentos.forEach((procedimento) => {
    const current = procedimentosMap.get(procedimento.procedimento_nome) ?? {
      nome: procedimento.procedimento_nome,
      quantidade: 0,
      valor_total: 0,
    };
    current.quantidade += 1;
    current.valor_total = roundMoney(current.valor_total + procedimento.valor);
    procedimentosMap.set(procedimento.procedimento_nome, current);
  });
  result.graficos.procedimentos_por_quantidade = Array.from(procedimentosMap.values())
    .sort((a, b) => {
      if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
      if (b.valor_total !== a.valor_total) return b.valor_total - a.valor_total;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });

  const rankingAvaliadoresMap = new Map<string, { usuario_id: number; nome: string; valor_gerado: number; quantidade: number }>();
  const rankingExecutoresMap = new Map<string, { usuario_id: number; nome: string; valor_gerado: number; quantidade: number }>();

  visibleAvaliacoesPagas.forEach((avaliacao) => {
    const dentista = result.dentistas.find((item) => item.usuario_id === avaliacao.usuario_id);
    if (!dentista) return;
    const key = toKey(avaliacao.usuario_id);
    const current = rankingAvaliadoresMap.get(key) ?? {
      usuario_id: avaliacao.usuario_id,
      nome: dentista.nome,
      valor_gerado: 0,
      quantidade: 0,
    };
    current.valor_gerado = roundMoney(current.valor_gerado + avaliacao.valor_base);
    current.quantidade += 1;
    rankingAvaliadoresMap.set(key, current);
  });

  visibleProcedimentos.forEach((procedimento) => {
    procedimento.ranking_executores
      .filter((item) => !excludedUsers.has(item.usuario_id))
      .forEach((item) => {
        const key = toKey(item.usuario_id);
        const current = rankingExecutoresMap.get(key) ?? {
          usuario_id: item.usuario_id,
          nome: item.nome,
          valor_gerado: 0,
          quantidade: 0,
        };
        current.valor_gerado = roundMoney(current.valor_gerado + item.valor_gerado);
        current.quantidade += 1;
        rankingExecutoresMap.set(key, current);
      });
  });

  result.graficos.ranking_avaliadores = Array.from(rankingAvaliadoresMap.values()).sort((a, b) => {
    if (b.valor_gerado !== a.valor_gerado) return b.valor_gerado - a.valor_gerado;
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  result.graficos.ranking_executores = Array.from(rankingExecutoresMap.values()).sort((a, b) => {
    if (b.valor_gerado !== a.valor_gerado) return b.valor_gerado - a.valor_gerado;
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  result.ajustes_count = countFechamentoCaixaAdjustments(safeDraft);
  result.editado_manual = result.ajustes_count > 0;
  sortAvaliacoesPagas(result.avaliacoes_pagas_dia);
  sortDentistas(result.dentistas);
  return result;
}
