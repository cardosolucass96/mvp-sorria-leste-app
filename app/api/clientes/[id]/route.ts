import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { Cliente } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/clientes/[id] - Buscar cliente por ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const cliente = queryOne<Cliente>(
      'SELECT * FROM clientes WHERE id = ?',
      [id]
    );

    if (!cliente) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(cliente);
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar cliente' },
      { status: 500 }
    );
  }
}

// PUT /api/clientes/[id] - Atualizar cliente
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { nome, cpf, telefone, email, data_nascimento, endereco, origem, observacoes } = body;

    // Verifica se cliente existe
    const existing = queryOne<Cliente>(
      'SELECT * FROM clientes WHERE id = ?',
      [id]
    );

    if (!existing) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      );
    }

    // Validação de nome
    if (nome !== undefined && (!nome || nome.trim() === '')) {
      return NextResponse.json(
        { error: 'Nome não pode ser vazio' },
        { status: 400 }
      );
    }

    // Validação de origem
    if (origem !== undefined) {
      const origensValidas = ['fachada', 'trafego_meta', 'trafego_google', 'organico', 'indicacao'];
      if (!origem || !origensValidas.includes(origem)) {
        return NextResponse.json(
          { error: 'Origem é obrigatória' },
          { status: 400 }
        );
      }
    }

    // Verifica duplicidade de CPF
    if (cpf && cpf !== existing.cpf) {
      const cpfExists = query<Cliente>(
        'SELECT id FROM clientes WHERE cpf = ? AND id != ?',
        [cpf.trim(), id]
      );

      if (cpfExists.length > 0) {
        return NextResponse.json(
          { error: 'CPF já cadastrado' },
          { status: 409 }
        );
      }
    }

    // Atualiza
    execute(
      `UPDATE clientes SET 
        nome = COALESCE(?, nome),
        cpf = ?,
        telefone = ?,
        email = ?,
        data_nascimento = ?,
        endereco = ?,
        origem = COALESCE(?, origem),
        observacoes = ?
      WHERE id = ?`,
      [
        nome?.trim() || null,
        cpf?.trim() || null,
        telefone?.trim() || null,
        email?.trim().toLowerCase() || null,
        data_nascimento || null,
        endereco?.trim() || null,
        origem || null,
        observacoes?.trim() || null,
        id
      ]
    );

    const updated = queryOne<Cliente>(
      'SELECT * FROM clientes WHERE id = ?',
      [id]
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar cliente' },
      { status: 500 }
    );
  }
}

// DELETE /api/clientes/[id] - Excluir cliente
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    const existing = queryOne<Cliente>(
      'SELECT * FROM clientes WHERE id = ?',
      [id]
    );

    if (!existing) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      );
    }

    // Verifica se tem atendimentos vinculados
    const atendimentos = query<{ count: number }>(
      'SELECT COUNT(*) as count FROM atendimentos WHERE cliente_id = ?',
      [id]
    );

    if (atendimentos[0].count > 0) {
      return NextResponse.json(
        { error: 'Não é possível excluir cliente com atendimentos vinculados' },
        { status: 409 }
      );
    }

    execute('DELETE FROM clientes WHERE id = ?', [id]);

    return NextResponse.json({ message: 'Cliente excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir cliente:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir cliente' },
      { status: 500 }
    );
  }
}
