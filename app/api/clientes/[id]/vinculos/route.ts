import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { VinculoCliente } from '@/lib/types';
import {
  ensureCanManagePatientRegistration,
  getAuthenticatedRequestUser,
  isRestrictedDentistPatientView,
} from '@/lib/auth/patientPrivacy';

// GET /api/clientes/[id]/vinculos — lista vínculos do cliente
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 401 });
    }
    if (isRestrictedDentistPatientView(user)) {
      return NextResponse.json({ error: 'Acesso não autorizado para este perfil' }, { status: 403 });
    }

    const { id } = await params;
    const clienteId = parseInt(id, 10);
    if (isNaN(clienteId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const vinculos = await query<VinculoCliente>(
      `SELECT
        v.id,
        v.cliente_id,
        v.cliente_vinculado_id,
        v.observacao,
        v.created_at,
        CASE WHEN v.cliente_id = ? THEN v.cliente_vinculado_id ELSE v.cliente_id END AS outro_cliente_id,
        CASE WHEN v.cliente_id = ? THEN c2.nome ELSE c1.nome END AS outro_cliente_nome,
        CASE WHEN v.cliente_id = ? THEN c2.cpf ELSE c1.cpf END AS outro_cliente_cpf,
        CASE WHEN v.cliente_id = ? THEN c2.telefone ELSE c1.telefone END AS outro_cliente_telefone
      FROM vinculos_clientes v
      JOIN clientes c1 ON c1.id = v.cliente_id
      JOIN clientes c2 ON c2.id = v.cliente_vinculado_id
      WHERE v.cliente_id = ? OR v.cliente_vinculado_id = ?
      ORDER BY v.created_at DESC`,
      [clienteId, clienteId, clienteId, clienteId, clienteId, clienteId]
    );

    return NextResponse.json(vinculos);
  } catch (err) {
    console.error('GET /vinculos error:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST /api/clientes/[id]/vinculos — cria um vínculo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 401 });
    }
    const unauthorized = ensureCanManagePatientRegistration(user);
    if (unauthorized) return unauthorized;

    const { id } = await params;
    const clienteId = parseInt(id, 10);
    if (isNaN(clienteId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const body = await request.json();
    const clienteVinculadoId = parseInt(body.cliente_vinculado_id, 10);
    const observacao = body.observacao?.trim() || null;

    if (isNaN(clienteVinculadoId)) {
      return NextResponse.json({ error: 'cliente_vinculado_id inválido' }, { status: 400 });
    }
    if (clienteId === clienteVinculadoId) {
      return NextResponse.json({ error: 'Não é possível vincular um cliente a si mesmo' }, { status: 400 });
    }

    // Verifica se ambos os clientes existem
    const [c1, c2] = await Promise.all([
      query<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [clienteId]),
      query<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [clienteVinculadoId]),
    ]);
    if (!c1.length) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    if (!c2.length) return NextResponse.json({ error: 'Cliente vinculado não encontrado' }, { status: 404 });

    // Verifica duplicata (em qualquer direção)
    const existente = await query<{ id: number }>(
      `SELECT id FROM vinculos_clientes
       WHERE (cliente_id = ? AND cliente_vinculado_id = ?)
          OR (cliente_id = ? AND cliente_vinculado_id = ?)`,
      [clienteId, clienteVinculadoId, clienteVinculadoId, clienteId]
    );
    if (existente.length) {
      return NextResponse.json({ error: 'Vínculo já existe entre estes clientes' }, { status: 409 });
    }

    const result = await execute(
      `INSERT INTO vinculos_clientes (cliente_id, cliente_vinculado_id, observacao) VALUES (?, ?, ?)`,
      [clienteId, clienteVinculadoId, observacao]
    );

    const [vinculo] = await query<VinculoCliente>(
      `SELECT
        v.id,
        v.cliente_id,
        v.cliente_vinculado_id,
        v.observacao,
        v.created_at,
        v.cliente_vinculado_id AS outro_cliente_id,
        c2.nome AS outro_cliente_nome,
        c2.cpf AS outro_cliente_cpf,
        c2.telefone AS outro_cliente_telefone
      FROM vinculos_clientes v
      JOIN clientes c2 ON c2.id = v.cliente_vinculado_id
      WHERE v.id = ?`,
      [result.lastInsertRowid]
    );

    return NextResponse.json(vinculo, { status: 201 });
  } catch (err) {
    console.error('POST /vinculos error:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
