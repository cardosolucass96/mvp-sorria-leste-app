import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { Cliente } from '@/lib/types';

// GET /api/clientes - Listar clientes com busca opcional
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const busca = searchParams.get('busca');

    let clientes: Cliente[];

    if (busca) {
      // Busca por nome, CPF, telefone ou email
      clientes = await query<Cliente>(
        `SELECT * FROM clientes 
         WHERE nome LIKE ? OR cpf LIKE ? OR telefone LIKE ? OR email LIKE ?
         ORDER BY nome`,
        [`%${busca}%`, `%${busca}%`, `%${busca}%`, `%${busca}%`]
      );
    } else {
      clientes = await query<Cliente>('SELECT * FROM clientes ORDER BY nome');
    }

    return NextResponse.json(clientes);
  } catch (error) {
    console.error('Erro ao buscar clientes:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar clientes' },
      { status: 500 }
    );
  }
}

// POST /api/clientes - Criar novo cliente
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nome, cpf, telefone, email, data_nascimento, endereco, origem, observacoes } = body;

    // Validações
    if (!nome || nome.trim() === '') {
      return NextResponse.json(
        { error: 'Nome é obrigatório' },
        { status: 400 }
      );
    }

    const origensValidas = ['fachada', 'trafego_meta', 'trafego_google', 'organico', 'indicacao'];
    if (!origem || !origensValidas.includes(origem)) {
      return NextResponse.json(
        { error: 'Origem é obrigatória' },
        { status: 400 }
      );
    }

    // Verifica se CPF já existe (se informado)
    if (cpf) {
      const existing = await query<Cliente>(
        'SELECT id FROM clientes WHERE cpf = ?',
        [cpf.trim()]
      );

      if (existing.length > 0) {
        return NextResponse.json(
          { error: 'CPF já cadastrado' },
          { status: 409 }
        );
      }
    }

    const result = await execute(
      `INSERT INTO clientes (nome, cpf, telefone, email, data_nascimento, endereco, origem, observacoes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome.trim(),
        cpf?.trim() || null,
        telefone?.trim() || null,
        email?.trim().toLowerCase() || null,
        data_nascimento || null,
        endereco?.trim() || null,
        origem,
        observacoes?.trim() || null,
      ]
    );

    const novoCliente = await query<Cliente>(
      'SELECT * FROM clientes WHERE id = ?',
      [result.lastInsertRowid]
    );

    return NextResponse.json(novoCliente[0], { status: 201 });
  } catch (error) {
    console.error('Erro ao criar cliente:', error);
    return NextResponse.json(
      { error: 'Erro ao criar cliente' },
      { status: 500 }
    );
  }
}
