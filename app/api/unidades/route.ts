import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { withAuth, withRole } from '@/lib/auth/middleware';
import { garantirCamposEmpresaUnidades, UNIDADE_EMPRESA_SELECT } from '@/lib/helpers/unidadesEmpresa';

function normalizarCampoOpcional(valor: unknown) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

// GET /api/unidades - Lista unidades ativas
export const GET = withAuth(async () => {
  try {
    await garantirCamposEmpresaUnidades();
    const unidades = await query(
      `SELECT ${UNIDADE_EMPRESA_SELECT} FROM unidades WHERE ativo = 1 ORDER BY id`
    );
    return NextResponse.json(unidades);
  } catch (error) {
    console.error('Erro ao buscar unidades:', error);
    return NextResponse.json({ error: 'Erro ao buscar unidades' }, { status: 500 });
  }
});

// POST /api/unidades - Criar nova unidade (admin only)
export const POST = withRole(['admin'], async (request: NextRequest) => {
  try {
    await garantirCamposEmpresaUnidades();
    const { nome, razao_social, cnpj, endereco, telefone, email, responsavel, recibo_rodape } = await request.json();

    if (!nome || typeof nome !== 'string' || nome.trim().length === 0) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    const result = await execute(
      `INSERT INTO unidades (
        nome,
        razao_social,
        cnpj,
        endereco,
        telefone,
        email,
        responsavel,
        recibo_rodape
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome.trim(),
        normalizarCampoOpcional(razao_social),
        normalizarCampoOpcional(cnpj),
        normalizarCampoOpcional(endereco),
        normalizarCampoOpcional(telefone),
        normalizarCampoOpcional(email),
        normalizarCampoOpcional(responsavel),
        normalizarCampoOpcional(recibo_rodape),
      ]
    );

    const nova = await queryOne(
      `SELECT ${UNIDADE_EMPRESA_SELECT} FROM unidades WHERE id = ?`,
      [result.lastInsertRowid]
    );

    return NextResponse.json(nova, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar unidade:', error);
    return NextResponse.json({ error: 'Erro ao criar unidade' }, { status: 500 });
  }
});
