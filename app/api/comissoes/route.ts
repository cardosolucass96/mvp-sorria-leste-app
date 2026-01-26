import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface Comissao {
  id: number;
  atendimento_id: number;
  item_atendimento_id: number;
  usuario_id: number;
  usuario_nome: string;
  tipo: string;
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
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const usuarioId = searchParams.get('usuario_id');
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');
    const resumo = searchParams.get('resumo') === 'true';

    // Se pediu resumo, retorna agregado por usuário
    if (resumo) {
      let sqlResumo = `
        SELECT 
          c.usuario_id,
          u.nome as usuario_nome,
          SUM(CASE WHEN c.tipo = 'venda' THEN c.valor_comissao ELSE 0 END) as total_venda,
          SUM(CASE WHEN c.tipo = 'execucao' THEN c.valor_comissao ELSE 0 END) as total_execucao,
          SUM(c.valor_comissao) as total_geral,
          COUNT(*) as quantidade
        FROM comissoes c
        INNER JOIN usuarios u ON c.usuario_id = u.id
        WHERE 1=1
      `;
      const paramsResumo: unknown[] = [];

      if (usuarioId) {
        sqlResumo += ' AND c.usuario_id = ?';
        paramsResumo.push(parseInt(usuarioId));
      }

      if (dataInicio) {
        sqlResumo += ' AND c.created_at >= ?';
        paramsResumo.push(dataInicio);
      }

      if (dataFim) {
        sqlResumo += ' AND c.created_at <= ?';
        paramsResumo.push(dataFim + ' 23:59:59');
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
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (usuarioId) {
      sql += ' AND c.usuario_id = ?';
      params.push(parseInt(usuarioId));
    }

    if (dataInicio) {
      sql += ' AND c.created_at >= ?';
      params.push(dataInicio);
    }

    if (dataFim) {
      sql += ' AND c.created_at <= ?';
      params.push(dataFim + ' 23:59:59');
    }

    sql += ' ORDER BY c.created_at DESC';

    const comissoes = await query<Comissao>(sql, params);

    // Calcular totais
    const totalVenda = comissoes
      .filter(c => c.tipo === 'venda')
      .reduce((sum, c) => sum + c.valor_comissao, 0);
    
    const totalExecucao = comissoes
      .filter(c => c.tipo === 'execucao')
      .reduce((sum, c) => sum + c.valor_comissao, 0);

    return NextResponse.json({
      comissoes,
      totais: {
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
}
