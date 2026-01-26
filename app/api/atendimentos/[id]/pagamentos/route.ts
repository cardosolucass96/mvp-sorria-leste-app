import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';

interface Pagamento {
  id: number;
  atendimento_id: number;
  valor: number;
  metodo: string;
  parcelas: number;
  observacoes: string | null;
  created_at: string;
}

interface Atendimento {
  id: number;
  status: string;
}

// GET /api/atendimentos/[id]/pagamentos - Lista pagamentos do atendimento
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Verifica se atendimento existe
    const atendimento = queryOne<Atendimento>(
      'SELECT * FROM atendimentos WHERE id = ?',
      [parseInt(id)]
    );
    
    if (!atendimento) {
      return NextResponse.json(
        { error: 'Atendimento não encontrado' },
        { status: 404 }
      );
    }
    
    const pagamentos = query(
      `SELECT p.*, u.nome as recebido_por_nome 
       FROM pagamentos p
       LEFT JOIN usuarios u ON p.recebido_por_id = u.id
       WHERE p.atendimento_id = ? 
       ORDER BY p.created_at DESC`,
      [parseInt(id)]
    );
    
    return NextResponse.json(pagamentos);
  } catch (error) {
    console.error('Erro ao buscar pagamentos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar pagamentos' },
      { status: 500 }
    );
  }
}

// POST /api/atendimentos/[id]/pagamentos - Registra novo pagamento
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { valor, metodo, parcelas, observacoes } = body;
    
    // Verifica se atendimento existe
    const atendimento = queryOne<Atendimento>(
      'SELECT * FROM atendimentos WHERE id = ?',
      [parseInt(id)]
    );
    
    if (!atendimento) {
      return NextResponse.json(
        { error: 'Atendimento não encontrado' },
        { status: 404 }
      );
    }
    
    // Verifica se está em status que aceita pagamento
    if (!['aguardando_pagamento', 'em_execucao'].includes(atendimento.status)) {
      return NextResponse.json(
        { error: 'Não é possível registrar pagamento neste status' },
        { status: 400 }
      );
    }
    
    // Validações
    if (!valor || valor <= 0) {
      return NextResponse.json(
        { error: 'Valor do pagamento é obrigatório e deve ser maior que zero' },
        { status: 400 }
      );
    }
    
    if (!metodo) {
      return NextResponse.json(
        { error: 'Método de pagamento é obrigatório' },
        { status: 400 }
      );
    }
    
    const metodosValidos = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito'];
    if (!metodosValidos.includes(metodo)) {
      return NextResponse.json(
        { error: 'Método de pagamento inválido' },
        { status: 400 }
      );
    }
    
    // TODO: Pegar usuário logado do contexto de autenticação
    // Por enquanto, usando o primeiro usuário disponível
    const usuario = queryOne<{ id: number }>('SELECT id FROM usuarios LIMIT 1');
    const recebidoPorId = usuario?.id || 1;
    
    // Insere pagamento
    const result = execute(
      `INSERT INTO pagamentos (atendimento_id, recebido_por_id, valor, metodo, parcelas, observacoes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [parseInt(id), recebidoPorId, valor, metodo, parcelas || 1, observacoes || null]
    );
    
    // Retorna o pagamento criado
    const novoPagamento = queryOne<Pagamento>(
      'SELECT * FROM pagamentos WHERE id = ?',
      [result.lastInsertRowid]
    );
    
    return NextResponse.json(novoPagamento, { status: 201 });
  } catch (error) {
    console.error('Erro ao registrar pagamento:', error);
    return NextResponse.json(
      { error: 'Erro ao registrar pagamento' },
      { status: 500 }
    );
  }
}
