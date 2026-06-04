import { NextRequest, NextResponse } from 'next/server';
import { queryOne, batch } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SaldoCliente {
  saldo: number;
}

// POST /api/clientes/[id]/saldo/transferir - Transfere saldo entre clientes
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const clienteOrigemId = parseInt(id);

    const clienteOrigem = await queryOne<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [clienteOrigemId]);
    if (!clienteOrigem) {
      return NextResponse.json({ error: 'Cliente de origem não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { cliente_destino_id, valor, observacoes } = body;

    if (!cliente_destino_id) {
      return NextResponse.json({ error: 'cliente_destino_id é obrigatório' }, { status: 400 });
    }

    if (!valor || typeof valor !== 'number' || valor <= 0) {
      return NextResponse.json({ error: 'Valor deve ser maior que zero' }, { status: 400 });
    }

    if (clienteOrigemId === cliente_destino_id) {
      return NextResponse.json({ error: 'Cliente de origem e destino devem ser diferentes' }, { status: 400 });
    }

    const clienteDestino = await queryOne<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [cliente_destino_id]);
    if (!clienteDestino) {
      return NextResponse.json({ error: 'Cliente de destino não encontrado' }, { status: 404 });
    }

    // Verificar saldo de origem
    const saldoOrigem = await queryOne<SaldoCliente>(
      'SELECT saldo FROM saldo_clientes WHERE cliente_id = ?',
      [clienteOrigemId]
    );
    const saldoOrigemAnterior = saldoOrigem?.saldo ?? 0;

    if (valor > saldoOrigemAnterior) {
      return NextResponse.json(
        { error: 'Saldo insuficiente', saldo: saldoOrigemAnterior },
        { status: 400 }
      );
    }

    // Buscar saldo de destino
    const saldoDestino = await queryOne<SaldoCliente>(
      'SELECT saldo FROM saldo_clientes WHERE cliente_id = ?',
      [cliente_destino_id]
    );
    const saldoDestinoAnterior = saldoDestino?.saldo ?? 0;

    const saldoOrigemNovo = saldoOrigemAnterior - valor;
    const saldoDestinoNovo = saldoDestinoAnterior + valor;

    await batch([
      // Decrementar saldo da origem
      {
        sql: `INSERT INTO saldo_clientes (cliente_id, saldo, updated_at)
              VALUES (?, ?, datetime('now', 'localtime'))
              ON CONFLICT(cliente_id) DO UPDATE SET
                saldo = ?, updated_at = datetime('now', 'localtime')`,
        params: [clienteOrigemId, saldoOrigemNovo, saldoOrigemNovo],
      },
      // Incrementar saldo do destino (upsert)
      {
        sql: `INSERT INTO saldo_clientes (cliente_id, saldo, updated_at)
              VALUES (?, ?, datetime('now', 'localtime'))
              ON CONFLICT(cliente_id) DO UPDATE SET
                saldo = saldo + excluded.saldo,
                updated_at = datetime('now', 'localtime')`,
        params: [cliente_destino_id, valor],
      },
      // Movimentação de saída (origem)
      {
        sql: `INSERT INTO movimentacoes_saldo
              (cliente_id, tipo, valor, saldo_anterior, saldo_novo, cliente_destino_id, observacoes)
              VALUES (?, 'transferencia_saida', ?, ?, ?, ?, ?)`,
        params: [clienteOrigemId, valor, saldoOrigemAnterior, saldoOrigemNovo, cliente_destino_id, observacoes ?? null],
      },
      // Movimentação de entrada (destino)
      {
        sql: `INSERT INTO movimentacoes_saldo
              (cliente_id, tipo, valor, saldo_anterior, saldo_novo, cliente_destino_id, observacoes)
              VALUES (?, 'transferencia_entrada', ?, ?, ?, ?, ?)`,
        params: [cliente_destino_id, valor, saldoDestinoAnterior, saldoDestinoNovo, clienteOrigemId, observacoes ?? null],
      },
    ]);

    return NextResponse.json({
      saldo_origem: saldoOrigemNovo,
      saldo_destino: saldoDestinoNovo,
    });
  } catch (error) {
    console.error('Erro ao transferir saldo:', error);
    return NextResponse.json({ error: 'Erro ao transferir saldo' }, { status: 500 });
  }
}
