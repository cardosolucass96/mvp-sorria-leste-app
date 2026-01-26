import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
  comissao_venda: number;
  comissao_execucao: number;
  ativo: number;
  created_at: string;
}

// GET /api/procedimentos - Lista todos os procedimentos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const busca = searchParams.get('busca') || '';
    const incluirInativos = searchParams.get('inativos') === 'true';
    
    let sql = 'SELECT * FROM procedimentos';
    const params: (string | number)[] = [];
    const conditions: string[] = [];
    
    // Filtro de busca
    if (busca) {
      conditions.push('nome LIKE ?');
      params.push(`%${busca}%`);
    }
    
    // Filtro de ativos (por padrão só mostra ativos)
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
    return NextResponse.json(
      { error: 'Erro ao buscar procedimentos' },
      { status: 500 }
    );
  }
}

// POST /api/procedimentos - Cria novo procedimento
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nome, valor, comissao_venda, comissao_execucao } = body;
    
    // Validações
    if (!nome || nome.trim() === '') {
      return NextResponse.json(
        { error: 'Nome é obrigatório' },
        { status: 400 }
      );
    }
    
    if (valor === undefined || valor < 0) {
      return NextResponse.json(
        { error: 'Valor deve ser maior ou igual a zero' },
        { status: 400 }
      );
    }
    
    if (comissao_venda !== undefined && (comissao_venda < 0 || comissao_venda > 100)) {
      return NextResponse.json(
        { error: 'Comissão de venda deve estar entre 0 e 100' },
        { status: 400 }
      );
    }
    
    if (comissao_execucao !== undefined && (comissao_execucao < 0 || comissao_execucao > 100)) {
      return NextResponse.json(
        { error: 'Comissão de execução deve estar entre 0 e 100' },
        { status: 400 }
      );
    }
    
    const result = await execute(
      `INSERT INTO procedimentos (nome, valor, comissao_venda, comissao_execucao) 
       VALUES (?, ?, ?, ?)`,
      [
        nome.trim(),
        valor,
        comissao_venda ?? 0,
        comissao_execucao ?? 0
      ]
    );
    
    const novoProcedimento = (await query<Procedimento>(
      'SELECT * FROM procedimentos WHERE id = ?',
      [result.lastInsertRowid]
    ))[0];
    
    return NextResponse.json(novoProcedimento, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar procedimento:', error);
    return NextResponse.json(
      { error: 'Erro ao criar procedimento' },
      { status: 500 }
    );
  }
}
