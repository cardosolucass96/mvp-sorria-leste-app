import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { garantirSchemaComissoesOrigem } from '@/lib/helpers/garantirComissaoSchema';
import {
  clinicDateTimeInputToUtcIso,
  clinicDateTimeInputToUtcIsoEndOfDay,
  getSqlUtcInstantExpression,
} from '@/lib/time';

interface Comissao {
  id: number;
  atendimento_id: number;
  item_atendimento_id: number;
  usuario_id: number;
  usuario_nome: string;
  tipo: string;
  origem: 'avaliacao' | 'acrescimo' | 'execucao';
  percentual: number;
  valor_base: number;
  valor_comissao: number;
  procedimento_nome: string;
  cliente_nome: string;
  created_at: string;
}

interface ResumoComissao {
  usuario_id: number;
  usuario_nome: string;
  total_avaliacao: number;
  total_acrescimo: number;
  total_venda: number;
  total_execucao: number;
  total_geral: number;
  quantidade: number;
}

// GET /api/comissoes - Lista comissões
// Parâmetros opcionais:
// - usuario_id: filtra por usuário específico
// - data_inicio: filtra a partir de uma data
// - data_fim: filtra até uma data
// - resumo: se "true", retorna resumo por usuário
export const GET = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    await garantirSchemaComissoesOrigem();

    const { searchParams } = new URL(request.url);
    const usuarioId = searchParams.get('usuario_id');
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');
    const resumo = searchParams.get('resumo') === 'true';
    const origemExpr = "COALESCE(c.origem, CASE WHEN c.tipo = 'execucao' THEN 'execucao' ELSE 'avaliacao' END)";
    const comissaoCreatedAtExpr = getSqlUtcInstantExpression('c.created_at');
    const dataInicioUtc = clinicDateTimeInputToUtcIso(dataInicio);
    const dataFimUtc = clinicDateTimeInputToUtcIsoEndOfDay(dataFim);

    // Se pediu resumo, retorna agregado por usuário
    if (resumo) {
      let sqlResumo = `
        SELECT
          c.usuario_id,
          u.nome as usuario_nome,
          SUM(CASE WHEN c.tipo = 'venda' AND ${origemExpr} = 'avaliacao' THEN c.valor_comissao ELSE 0 END) as total_avaliacao,
          SUM(CASE WHEN c.tipo = 'venda' AND ${origemExpr} = 'acrescimo' THEN c.valor_comissao ELSE 0 END) as total_acrescimo,
          SUM(CASE WHEN c.tipo = 'venda' THEN c.valor_comissao ELSE 0 END) as total_venda,
          SUM(CASE WHEN c.tipo = 'execucao' THEN c.valor_comissao ELSE 0 END) as total_execucao,
          SUM(c.valor_comissao) as total_geral,
          COUNT(*) as quantidade
        FROM comissoes c
        INNER JOIN usuarios u ON c.usuario_id = u.id
        INNER JOIN atendimentos a ON c.atendimento_id = a.id
        WHERE a.unidade_id = ?
      `;
      const paramsResumo: unknown[] = [context.unidadeId];

      if (usuarioId) {
        sqlResumo += ' AND c.usuario_id = ?';
        paramsResumo.push(parseInt(usuarioId));
      }

      if (dataInicioUtc) {
        sqlResumo += ` AND ${comissaoCreatedAtExpr} >= ?`;
        paramsResumo.push(dataInicioUtc);
      }

      if (dataFimUtc) {
        sqlResumo += ` AND ${comissaoCreatedAtExpr} <= ?`;
        paramsResumo.push(dataFimUtc);
      }

      sqlResumo += ' GROUP BY c.usuario_id, u.nome ORDER BY total_geral DESC';

      const resumoComissoes = await query<ResumoComissao>(sqlResumo, paramsResumo);
      return NextResponse.json(resumoComissoes);
    }

    // Lista detalhada
    let sql = `
      SELECT 
        c.id,
        c.atendimento_id,
        c.item_atendimento_id,
        c.usuario_id,
        u.nome as usuario_nome,
        c.tipo,
        ${origemExpr} as origem,
        c.percentual,
        c.valor_base,
        c.valor_comissao,
        p.nome as procedimento_nome,
        cl.nome as cliente_nome,
        c.created_at
      FROM comissoes c
      INNER JOIN usuarios u ON c.usuario_id = u.id
      INNER JOIN itens_atendimento i ON c.item_atendimento_id = i.id
      INNER JOIN procedimentos p ON i.procedimento_id = p.id
      INNER JOIN atendimentos a ON c.atendimento_id = a.id
      INNER JOIN clientes cl ON a.cliente_id = cl.id
      WHERE a.unidade_id = ?
    `;
    const params: unknown[] = [context.unidadeId];

    if (usuarioId) {
      sql += ' AND c.usuario_id = ?';
      params.push(parseInt(usuarioId));
    }

    if (dataInicioUtc) {
      sql += ` AND ${comissaoCreatedAtExpr} >= ?`;
      params.push(dataInicioUtc);
    }

    if (dataFimUtc) {
      sql += ` AND ${comissaoCreatedAtExpr} <= ?`;
      params.push(dataFimUtc);
    }

    sql += ` ORDER BY ${comissaoCreatedAtExpr} DESC`;

    const comissoes = await query<Comissao>(sql, params);

    // Calcular totais
    const totalAvaliacao = comissoes
      .filter(c => c.origem === 'avaliacao')
      .reduce((sum, c) => sum + c.valor_comissao, 0);

    const totalAcrescimo = comissoes
      .filter(c => c.origem === 'acrescimo')
      .reduce((sum, c) => sum + c.valor_comissao, 0);

    const totalVenda = totalAvaliacao + totalAcrescimo;

    const totalExecucao = comissoes
      .filter(c => c.tipo === 'execucao')
      .reduce((sum, c) => sum + c.valor_comissao, 0);

    return NextResponse.json({
      comissoes,
      totais: {
        avaliacao: totalAvaliacao,
        acrescimo: totalAcrescimo,
        venda: totalVenda,
        execucao: totalExecucao,
        geral: totalVenda + totalExecucao
      }
    });
  } catch (error) {
    console.error('Erro ao buscar comissões:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar comissões' },
      { status: 500 }
    );
  }
});
