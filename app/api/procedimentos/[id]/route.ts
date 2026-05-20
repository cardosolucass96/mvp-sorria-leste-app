import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query, execute, batch } from '@/lib/db';

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
  comissao_venda: number;
  comissao_execucao: number;
  por_dente: number;
  tem_etapas: number;
  ativo: number;
  created_at: string;
}

interface EtapaModelo {
  id: number;
  procedimento_id: number;
  nome: string;
  valor: number | null;
  comissao_venda: number;
  comissao_execucao: number;
  ordem: number;
}

// GET /api/procedimentos/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const procedimento = await queryOne<Procedimento>(
      'SELECT * FROM procedimentos WHERE id = ?',
      [parseInt(id)]
    );

    if (!procedimento) {
      return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 });
    }

    const etapas = await query<EtapaModelo>(
      'SELECT * FROM procedimento_etapas_modelo WHERE procedimento_id = ? ORDER BY ordem ASC',
      [parseInt(id)]
    );

    return NextResponse.json({ ...procedimento, etapas });
  } catch (error) {
    console.error('Erro ao buscar procedimento:', error);
    return NextResponse.json({ error: 'Erro ao buscar procedimento' }, { status: 500 });
  }
}

// PUT /api/procedimentos/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const procId = parseInt(id);
    const body = await request.json();
    const { nome, valor, comissao_venda, comissao_execucao, ativo, por_dente, tem_etapas, etapas, categoria_id } = body;

    const existe = await queryOne<Procedimento>(
      'SELECT * FROM procedimentos WHERE id = ?',
      [procId]
    );

    if (!existe) {
      return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 });
    }

    if (nome !== undefined && nome.trim() === '') {
      return NextResponse.json({ error: 'Nome não pode ser vazio' }, { status: 400 });
    }
    if (valor !== undefined && valor < 0) {
      return NextResponse.json({ error: 'Valor deve ser maior ou igual a zero' }, { status: 400 });
    }
    if (comissao_venda !== undefined && (comissao_venda < 0 || comissao_venda > 100)) {
      return NextResponse.json({ error: 'Comissão de venda deve estar entre 0 e 100' }, { status: 400 });
    }
    if (comissao_execucao !== undefined && (comissao_execucao < 0 || comissao_execucao > 100)) {
      return NextResponse.json({ error: 'Comissão de execução deve estar entre 0 e 100' }, { status: 400 });
    }

    const updates: string[] = [];
    const updateParams: (string | number)[] = [];

    if (nome !== undefined) { updates.push('nome = ?'); updateParams.push(nome.trim()); }
    if (valor !== undefined) { updates.push('valor = ?'); updateParams.push(valor); }
    if (comissao_venda !== undefined) { updates.push('comissao_venda = ?'); updateParams.push(comissao_venda); }
    if (comissao_execucao !== undefined) { updates.push('comissao_execucao = ?'); updateParams.push(comissao_execucao); }
    if (ativo !== undefined) { updates.push('ativo = ?'); updateParams.push(ativo ? 1 : 0); }
    if (por_dente !== undefined) { updates.push('por_dente = ?'); updateParams.push(por_dente ? 1 : 0); }
    if (tem_etapas !== undefined) { updates.push('tem_etapas = ?'); updateParams.push(tem_etapas ? 1 : 0); }
    if (categoria_id !== undefined) {
      updates.push('categoria_id = ?');
      updateParams.push(categoria_id === null ? null as unknown as number : categoria_id);
    }

    if (updates.length === 0 && etapas === undefined) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    if (updates.length > 0) {
      updateParams.push(procId);
      await execute(`UPDATE procedimentos SET ${updates.join(', ')} WHERE id = ?`, updateParams);
    }

    // Atualiza etapas: apaga todas e reinserere (simples e sem risco de conflito de ordem)
    if (etapas !== undefined) {
      await execute('DELETE FROM procedimento_etapas_modelo WHERE procedimento_id = ?', [procId]);

      if (Array.isArray(etapas) && etapas.length > 0) {
        await batch(
          etapas.map((e: EtapaModelo, idx: number) => ({
            sql: `INSERT INTO procedimento_etapas_modelo (procedimento_id, nome, valor, comissao_venda, comissao_execucao, ordem)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            params: [procId, e.nome, e.valor ?? null, e.comissao_venda ?? 0, e.comissao_execucao ?? 0, idx],
          }))
        );
      }
    }

    const atualizado = await queryOne<Procedimento>(
      'SELECT * FROM procedimentos WHERE id = ?',
      [procId]
    );

    const etapasAtualizadas = await query<EtapaModelo>(
      'SELECT * FROM procedimento_etapas_modelo WHERE procedimento_id = ? ORDER BY ordem ASC',
      [procId]
    );

    return NextResponse.json({ ...atualizado, etapas: etapasAtualizadas });
  } catch (error) {
    console.error('Erro ao atualizar procedimento:', error);
    return NextResponse.json({ error: 'Erro ao atualizar procedimento' }, { status: 500 });
  }
}

// DELETE /api/procedimentos/[id] - soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existe = await queryOne<Procedimento>(
      'SELECT * FROM procedimentos WHERE id = ?',
      [parseInt(id)]
    );

    if (!existe) {
      return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 });
    }

    await execute('UPDATE procedimentos SET ativo = 0 WHERE id = ?', [parseInt(id)]);

    return NextResponse.json({ message: 'Procedimento desativado com sucesso' });
  } catch (error) {
    console.error('Erro ao desativar procedimento:', error);
    return NextResponse.json({ error: 'Erro ao desativar procedimento' }, { status: 500 });
  }
}
