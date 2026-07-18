import { NextRequest, NextResponse } from 'next/server';
import { query, execute, batch } from '@/lib/db';
import { Cliente } from '@/lib/types';
import {
  applyPatientPrivacyToClientes,
  ensureCanManagePatientRegistration,
  getAuthenticatedRequestUser,
  isRestrictedDentistPatientView,
} from '@/lib/auth/patientPrivacy';

const PAGE_SIZE = 50;

// GET /api/clientes - Listar clientes com busca e paginação
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 401 });
    }
    const restrictedDentistView = isRestrictedDentistPatientView(user);

    const { searchParams } = new URL(request.url);
    const busca  = searchParams.get('busca') || '';
    const page   = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit  = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || String(PAGE_SIZE), 10)));
    const offset = (page - 1) * limit;
    const ordem  = searchParams.get('ordem') === 'recente' ? 'created_at DESC' : 'nome';

    let clientes: Cliente[];
    let total: number;

    if (busca) {
      const like = `%${busca.toLowerCase()}%`;
      const searchWhere = restrictedDentistView
        ? 'LOWER(nome) LIKE ?'
        : 'LOWER(nome) LIKE ? OR LOWER(cpf) LIKE ? OR LOWER(telefone) LIKE ? OR LOWER(email) LIKE ?';
      const searchParams = restrictedDentistView ? [like] : [like, like, like, like];
      const [countResult, dataResult] = await batch([
        {
          sql: `SELECT COUNT(*) as total FROM clientes
                WHERE ${searchWhere}`,
          params: searchParams,
        },
        {
          sql: `SELECT * FROM clientes
                WHERE ${searchWhere}
                ORDER BY ${ordem} LIMIT ? OFFSET ?`,
          params: [...searchParams, limit, offset],
        },
      ]);
      total    = (countResult.results[0] as { total: number }).total;
      clientes = dataResult.results as Cliente[];
    } else {
      const [countResult, dataResult] = await batch([
        { sql: 'SELECT COUNT(*) as total FROM clientes' },
        { sql: `SELECT * FROM clientes ORDER BY ${ordem} LIMIT ? OFFSET ?`, params: [limit, offset] },
      ]);
      total    = (countResult.results[0] as { total: number }).total;
      clientes = dataResult.results as Cliente[];
    }

    return NextResponse.json({
      clientes: applyPatientPrivacyToClientes(clientes, user),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    });
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
    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 401 });
    }
    const unauthorized = ensureCanManagePatientRegistration(user);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const { nome, cpf, telefone, email, data_nascimento, endereco, origem, sexo, plano_odontologico, observacoes } = body;

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

    const sexosValidos = ['masculino', 'feminino', 'outro'];
    const sexoValido = sexo && sexosValidos.includes(sexo) ? sexo : null;
    const planosValidos = ['Clin', 'Prime', 'OdontoArt'];
    const planoValido = plano_odontologico && planosValidos.includes(plano_odontologico) ? plano_odontologico : null;

    const result = await execute(
      `INSERT INTO clientes (nome, cpf, telefone, email, data_nascimento, endereco, origem, sexo, plano_odontologico, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome.trim(),
        cpf?.trim() || null,
        telefone?.trim() || null,
        email?.trim().toLowerCase() || null,
        data_nascimento || null,
        endereco?.trim() || null,
        origem,
        sexoValido,
        planoValido,
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
