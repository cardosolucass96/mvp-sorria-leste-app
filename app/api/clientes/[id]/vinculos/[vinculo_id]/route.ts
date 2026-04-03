import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

// DELETE /api/clientes/[id]/vinculos/[vinculo_id] — remove um vínculo
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; vinculo_id: string }> }
) {
  try {
    const { id, vinculo_id } = await params;
    const clienteId = parseInt(id, 10);
    const vinculoId = parseInt(vinculo_id, 10);

    if (isNaN(clienteId) || isNaN(vinculoId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    // Garante que o vínculo pertence a este cliente
    const existente = await query<{ id: number }>(
      `SELECT id FROM vinculos_clientes
       WHERE id = ? AND (cliente_id = ? OR cliente_vinculado_id = ?)`,
      [vinculoId, clienteId, clienteId]
    );
    if (!existente.length) {
      return NextResponse.json({ error: 'Vínculo não encontrado' }, { status: 404 });
    }

    await execute('DELETE FROM vinculos_clientes WHERE id = ?', [vinculoId]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /vinculos/[vinculo_id] error:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
