import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';

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
  avaliador_nome: string | null;
}

interface CountResult {
  count: number;
}

interface SumResult {
  total: number;
}

// GET /api/atendimentos - Lista todos os atendimentos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const clienteId = searchParams.get('cliente_id');
    const busca = searchParams.get('busca');
    
    let sql = `
      SELECT 
        a.*,
        c.nome as cliente_nome,
        c.cpf as cliente_cpf,
        c.telefone as cliente_telefone,
        u.nome as avaliador_nome
      FROM atendimentos a
      INNER JOIN clientes c ON a.cliente_id = c.id
      LEFT JOIN usuarios u ON a.avaliador_id = u.id
    `;
    
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    
    // Filtro por status
    if (status) {
      conditions.push('a.status = ?');
      params.push(status);
    }
    
    // Filtro por cliente
    if (clienteId) {
      conditions.push('a.cliente_id = ?');
      params.push(parseInt(clienteId));
    }
    
    // Busca por nome do cliente
    if (busca) {
      conditions.push('(c.nome LIKE ? OR c.cpf LIKE ?)');
      params.push(`%${busca}%`, `%${busca}%`);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' ORDER BY a.created_at DESC';
    
    const atendimentos = query<AtendimentoComCliente>(sql, params);
    
    return NextResponse.json(atendimentos);
  } catch (error) {
    console.error('Erro ao buscar atendimentos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar atendimentos' },
      { status: 500 }
    );
  }
}

// POST /api/atendimentos - Cria novo atendimento
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cliente_id, avaliador_id } = body;
    
    // Validações
    if (!cliente_id) {
      return NextResponse.json(
        { error: 'Cliente é obrigatório' },
        { status: 400 }
      );
    }
    
    // Verifica se cliente existe
    const cliente = queryOne<{ id: number }>(
      'SELECT id FROM clientes WHERE id = ?',
      [cliente_id]
    );
    
    if (!cliente) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      );
    }
    
    // Verifica se cliente já tem atendimento em aberto
    const atendimentoAberto = queryOne<CountResult>(
      `SELECT COUNT(*) as count FROM atendimentos 
       WHERE cliente_id = ? AND status != 'finalizado'`,
      [cliente_id]
    );
    
    if (atendimentoAberto && atendimentoAberto.count > 0) {
      return NextResponse.json(
        { error: 'Cliente já possui atendimento em aberto' },
        { status: 400 }
      );
    }
    
    // Verifica avaliador se fornecido
    if (avaliador_id) {
      const avaliador = queryOne<{ id: number; role: string }>(
        'SELECT id, role FROM usuarios WHERE id = ? AND ativo = 1',
        [avaliador_id]
      );
      
      if (!avaliador) {
        return NextResponse.json(
          { error: 'Avaliador não encontrado' },
          { status: 404 }
        );
      }
      
      if (avaliador.role !== 'avaliador' && avaliador.role !== 'admin') {
        return NextResponse.json(
          { error: 'Usuário selecionado não é avaliador' },
          { status: 400 }
        );
      }
    }
    
    // Cria atendimento com status inicial 'triagem'
    const result = execute(
      `INSERT INTO atendimentos (cliente_id, avaliador_id, status) 
       VALUES (?, ?, 'triagem')`,
      [cliente_id, avaliador_id || null]
    );
    
    // Busca atendimento criado com dados do cliente
    const novoAtendimento = queryOne<AtendimentoComCliente>(
      `SELECT 
        a.*,
        c.nome as cliente_nome,
        c.cpf as cliente_cpf,
        c.telefone as cliente_telefone,
        u.nome as avaliador_nome
      FROM atendimentos a
      INNER JOIN clientes c ON a.cliente_id = c.id
      LEFT JOIN usuarios u ON a.avaliador_id = u.id
      WHERE a.id = ?`,
      [result.lastInsertRowid]
    );
    
    return NextResponse.json(novoAtendimento, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar atendimento:', error);
    return NextResponse.json(
      { error: 'Erro ao criar atendimento' },
      { status: 500 }
    );
  }
}
