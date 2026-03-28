import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';

interface Agendamento {
  id: number;
  cliente_id: number;
  status: string;
  data_agendada: string | null;
}

// PUT /api/agendamentos/[id] - Atualiza agendamento (status, data_agendada, motivo_cancelamento)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const agendamento = await queryOne<Agendamento>(
      'SELECT id, cliente_id, status, data_agendada FROM agendamentos WHERE id = ?',
      [id]
    );

    if (!agendamento) {
      return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });
    }

    const updates: string[] = [];
    const updateParams: (string | number | null)[] = [];

    if (body.status !== undefined) {
      updates.push('status = ?');
      updateParams.push(body.status);
    }

    if (body.data_agendada !== undefined) {
      updates.push('data_agendada = ?');
      updateParams.push(body.data_agendada);

      // Setting a date automatically sets status to 'agendado' if currently 'pendente' or 'faltou'
      if (!body.status && ['pendente', 'faltou'].includes(agendamento.status)) {
        updates.push('status = ?');
        updateParams.push('agendado');
      }
    }

    if (body.motivo_cancelamento !== undefined) {
      updates.push('motivo_cancelamento = ?');
      updateParams.push(body.motivo_cancelamento);
    }

    if (body.observacoes !== undefined) {
      updates.push('observacoes = ?');
      updateParams.push(body.observacoes);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    updates.push("updated_at = datetime('now', 'localtime')");
    updateParams.push(parseInt(id));

    await execute(
      `UPDATE agendamentos SET ${updates.join(', ')} WHERE id = ?`,
      updateParams
    );

    const updated = await queryOne(
      'SELECT * FROM agendamentos WHERE id = ?',
      [id]
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Erro ao atualizar agendamento:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar agendamento' },
      { status: 500 }
    );
  }
}
