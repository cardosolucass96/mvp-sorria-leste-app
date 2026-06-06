import { NextRequest, NextResponse } from 'next/server';
import { query, execute, batch } from '@/lib/db';
import { garantirSchemaProcedimentosComissaoAcrescimo } from '@/lib/helpers/garantirComissaoSchema';

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
  comissao_venda: number;
  comissao_acrescimo: number;
  comissao_execucao: number;
  por_dente: number;
  tem_face: number;
  tem_etapas: number;
  ativo: number;
  created_at: string;
}

interface EtapaModelo {
  nome: string;
  valor: number | null;
  comissao_venda: number;
  comissao_acrescimo: number;
  comissao_execucao: number;
  ordem: number;
}

// GET /api/procedimentos - Lista todos os procedimentos
export async function GET(request: NextRequest) {
  try {
    await garantirSchemaProcedimentosComissaoAcrescimo();

    const { searchParams } = new URL(request.url);
    const busca = searchParams.get('busca') || '';
    const incluirInativos = searchParams.get('inativos') === 'true';

    let sql = 'SELECT * FROM procedimentos';
    const params: (string | number)[] = [];
    const conditions: string[] = [];

    if (busca) {
      conditions.push('nome LIKE ?');
      params.push(`%${busca}%`);
    }

    if (!incluirInativos) {
      conditions.push('ativo = 1');
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY nome ASC';

    const procedimentos = await query<Procedimento>(sql, params);

    return NextResponse.json(procedimentos);
  } catch (error) {
    console.error('Erro ao buscar procedimentos:', error);
    return NextResponse.json({ error: 'Erro ao buscar procedimentos' }, { status: 500 });
  }
}

// POST /api/procedimentos - Cria novo procedimento
export async function POST(request: NextRequest) {
  try {
    await garantirSchemaProcedimentosComissaoAcrescimo();

    const body = await request.json();
    const { nome, valor, comissao_venda, comissao_acrescimo, comissao_execucao, por_dente, tem_face, tem_etapas, etapas, categoria_id } = body;

    if (!nome || nome.trim() === '') {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    if (valor === undefined || valor < 0) {
      return NextResponse.json({ error: 'Valor deve ser maior ou igual a zero' }, { status: 400 });
    }

    if (comissao_venda !== undefined && (comissao_venda < 0 || comissao_venda > 100)) {
      return NextResponse.json({ error: 'Comissão de venda deve estar entre 0 e 100' }, { status: 400 });
    }

    if (comissao_acrescimo !== undefined && (comissao_acrescimo < 0 || comissao_acrescimo > 100)) {
      return NextResponse.json({ error: 'Comissão de acréscimo deve estar entre 0 e 100' }, { status: 400 });
    }

    if (comissao_execucao !== undefined && (comissao_execucao < 0 || comissao_execucao > 100)) {
      return NextResponse.json({ error: 'Comissão de execução deve estar entre 0 e 100' }, { status: 400 });
    }

    const porDenteFlag = por_dente ? 1 : 0;
    const temFaceFlag = porDenteFlag ? (tem_face ? 1 : 0) : 0;

    const result = await execute(
      `INSERT INTO procedimentos (nome, valor, comissao_venda, comissao_acrescimo, comissao_execucao, por_dente, tem_face, tem_etapas, categoria_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome.trim(),
        valor,
        comissao_venda ?? 4,
        comissao_acrescimo ?? 10,
        comissao_execucao ?? 0,
        porDenteFlag,
        temFaceFlag,
        tem_etapas ? 1 : 0,
        categoria_id ?? null,
      ]
    );

    const procedimentoId = result.lastInsertRowid;

    // Salva etapas se houver
    if (tem_etapas && Array.isArray(etapas) && etapas.length > 0) {
      await batch(
        etapas.map((e: EtapaModelo, idx: number) => ({
          sql: `INSERT INTO procedimento_etapas_modelo (procedimento_id, nome, valor, comissao_venda, comissao_acrescimo, comissao_execucao, ordem)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [procedimentoId, e.nome, e.valor ?? null, e.comissao_venda ?? 4, e.comissao_acrescimo ?? 10, e.comissao_execucao ?? 0, idx],
        }))
      );
    }

    const novoProcedimento = (await query<Procedimento>(
      'SELECT * FROM procedimentos WHERE id = ?',
      [procedimentoId]
    ))[0];

    return NextResponse.json(novoProcedimento, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar procedimento:', error);
    return NextResponse.json({ error: 'Erro ao criar procedimento' }, { status: 500 });
  }
}
