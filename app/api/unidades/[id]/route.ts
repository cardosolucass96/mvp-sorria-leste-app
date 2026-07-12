import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { withRole } from '@/lib/auth/middleware';
import { garantirCamposEmpresaUnidades, UNIDADE_EMPRESA_SELECT } from '@/lib/helpers/unidadesEmpresa';

function normalizarCampoOpcional(valor: unknown) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

// PUT /api/unidades/[id] - Atualizar unidade (admin only)
export const PUT = withRole(['admin'], async (request: NextRequest, context) => {
  try {
    await garantirCamposEmpresaUnidades();
    const { id } = await context.params!;
    const unidadeId = parseInt(id as string);
    const body = await request.json();
    const { nome, razao_social, cnpj, endereco, telefone, email, responsavel, recibo_rodape, ativo } = body;

    const existing = await queryOne(
      'SELECT id FROM unidades WHERE id = ?',
      [unidadeId]
    );

    if (!existing) {
      return NextResponse.json({ error: 'Unidade não encontrada' }, { status: 404 });
    }

    if (nome !== undefined && (!nome || typeof nome !== 'string' || nome.trim().length === 0)) {
      return NextResponse.json({ error: 'Nome não pode ser vazio' }, { status: 400 });
    }

    const updates: string[] = [];
    const values: Array<string | number | null> = [];
    const addCampoTexto = (campo: string, valor: unknown) => {
      if (valor === undefined) return;
      updates.push(`${campo} = ?`);
      values.push(normalizarCampoOpcional(valor));
    };

    if (nome !== undefined) {
      updates.push('nome = ?');
      values.push(nome.trim());
    }
    addCampoTexto('razao_social', razao_social);
    addCampoTexto('cnpj', cnpj);
    addCampoTexto('endereco', endereco);
    addCampoTexto('telefone', telefone);
    addCampoTexto('email', email);
    addCampoTexto('responsavel', responsavel);
    addCampoTexto('recibo_rodape', recibo_rodape);
    if (ativo !== undefined) {
      updates.push('ativo = ?');
      values.push(ativo ? 1 : 0);
    }

    if (updates.length > 0) {
      await execute(
        `UPDATE unidades SET ${updates.join(', ')} WHERE id = ?`,
        [...values, unidadeId]
      );
    }

    const updated = await queryOne(
      `SELECT ${UNIDADE_EMPRESA_SELECT} FROM unidades WHERE id = ?`,
      [unidadeId]
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Erro ao atualizar unidade:', error);
    return NextResponse.json({ error: 'Erro ao atualizar unidade' }, { status: 500 });
  }
});
