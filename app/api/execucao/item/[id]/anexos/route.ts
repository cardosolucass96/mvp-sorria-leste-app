import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

interface Anexo {
  id: number;
  item_atendimento_id: number;
  usuario_id: number;
  nome_arquivo: string;
  tipo_arquivo: string;
  caminho: string;
  tamanho: number;
  descricao: string | null;
  created_at: string;
  usuario_nome?: string;
}

// GET /api/execucao/item/[id]/anexos - Lista anexos do item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const anexos = query<Anexo>(
      `SELECT a.*, u.nome as usuario_nome
       FROM anexos_execucao a
       INNER JOIN usuarios u ON a.usuario_id = u.id
       WHERE a.item_atendimento_id = ?
       ORDER BY a.created_at DESC`,
      [parseInt(id)]
    );

    return NextResponse.json(anexos);
  } catch (error) {
    console.error('Erro ao buscar anexos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar anexos' },
      { status: 500 }
    );
  }
}

// POST /api/execucao/item/[id]/anexos - Faz upload de anexo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    
    const file = formData.get('arquivo') as File;
    const usuario_id = formData.get('usuario_id') as string;
    const descricao = formData.get('descricao') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'Arquivo é obrigatório' },
        { status: 400 }
      );
    }

    if (!usuario_id) {
      return NextResponse.json(
        { error: 'Usuário é obrigatório' },
        { status: 400 }
      );
    }

    // Validar tipo de arquivo (imagens e PDFs)
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!tiposPermitidos.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de arquivo não permitido. Use: JPG, PNG, GIF, WebP ou PDF' },
        { status: 400 }
      );
    }

    // Limitar tamanho (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Máximo: 10MB' },
        { status: 400 }
      );
    }

    // Criar diretório de uploads se não existir
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'execucao', id);
    await mkdir(uploadsDir, { recursive: true });

    // Gerar nome único para o arquivo
    const timestamp = Date.now();
    const ext = path.extname(file.name);
    const nomeArquivo = `${timestamp}${ext}`;
    const caminhoCompleto = path.join(uploadsDir, nomeArquivo);
    const caminhoRelativo = `/uploads/execucao/${id}/${nomeArquivo}`;

    // Salvar arquivo
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(caminhoCompleto, buffer);

    // Registrar no banco
    const result = execute(
      `INSERT INTO anexos_execucao 
        (item_atendimento_id, usuario_id, nome_arquivo, tipo_arquivo, caminho, tamanho, descricao)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(id),
        parseInt(usuario_id),
        file.name,
        file.type,
        caminhoRelativo,
        file.size,
        descricao || null
      ]
    );

    return NextResponse.json(
      { 
        id: result.lastInsertRowid, 
        caminho: caminhoRelativo,
        message: 'Arquivo enviado com sucesso' 
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erro ao fazer upload:', error);
    return NextResponse.json(
      { error: 'Erro ao fazer upload do arquivo' },
      { status: 500 }
    );
  }
}

// DELETE /api/execucao/item/[id]/anexos?anexo_id=X - Remove anexo
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const anexoId = searchParams.get('anexo_id');

    if (!anexoId) {
      return NextResponse.json(
        { error: 'ID do anexo é obrigatório' },
        { status: 400 }
      );
    }

    execute('DELETE FROM anexos_execucao WHERE id = ?', [parseInt(anexoId)]);

    return NextResponse.json({ message: 'Anexo removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover anexo:', error);
    return NextResponse.json(
      { error: 'Erro ao remover anexo' },
      { status: 500 }
    );
  }
}
