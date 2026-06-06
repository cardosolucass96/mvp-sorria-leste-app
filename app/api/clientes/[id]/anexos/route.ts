import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute, getR2Bucket } from '@/lib/db';

interface AnexoCliente {
  id: number;
  cliente_id: number;
  usuario_id: number;
  nome_arquivo: string;
  tipo_arquivo: string;
  caminho: string;
  tamanho: number;
  descricao: string | null;
  created_at: string;
  usuario_nome?: string;
}

// Tipos de arquivo permitidos (imagens, vídeos e documentos)
const TIPOS_PERMITIDOS = [
  // Imagens
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Vídeos
  'video/mp4',
  'video/webm',
  'video/quicktime',
  // Documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// Tamanho máximo: 50MB para vídeos, 10MB para outros
const MAX_SIZE_VIDEO = 50 * 1024 * 1024;
const MAX_SIZE_OTHER = 10 * 1024 * 1024;

// GET /api/clientes/[id]/anexos — lista anexos do cliente
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id, 10);
    if (isNaN(clienteId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const anexos = await query<AnexoCliente>(
      `SELECT a.*, u.nome as usuario_nome
       FROM anexos_cliente a
       INNER JOIN usuarios u ON a.usuario_id = u.id
       WHERE a.cliente_id = ?
       ORDER BY a.created_at DESC`,
      [clienteId]
    );

    return NextResponse.json(anexos);
  } catch (error) {
    console.error('Erro ao buscar anexos do cliente:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar anexos' },
      { status: 500 }
    );
  }
}

// POST /api/clientes/[id]/anexos — upload de anexo para R2
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id, 10);
    if (isNaN(clienteId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('arquivo') as File | null;
    const usuarioIdRaw = formData.get('usuario_id') as string | null;
    const descricao = (formData.get('descricao') as string | null)?.trim() || null;
    const titulo = (formData.get('titulo') as string | null)?.trim() || file?.name;

    if (!file) {
      return NextResponse.json({ error: 'Arquivo é obrigatório' }, { status: 400 });
    }
    if (!usuarioIdRaw) {
      return NextResponse.json({ error: 'Usuário é obrigatório' }, { status: 400 });
    }
    const usuarioId = parseInt(usuarioIdRaw, 10);
    if (isNaN(usuarioId)) {
      return NextResponse.json({ error: 'usuario_id inválido' }, { status: 400 });
    }

    // Valida tipo
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de arquivo não permitido. Use: JPG, PNG, GIF, WebP, MP4, WebM, MOV, PDF ou DOC/DOCX' },
        { status: 400 }
      );
    }

    // Valida tamanho
    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? MAX_SIZE_VIDEO : MAX_SIZE_OTHER;
    if (file.size > maxSize) {
      const maxMB = maxSize / (1024 * 1024);
      return NextResponse.json(
        { error: `Arquivo muito grande. Máximo: ${maxMB}MB` },
        { status: 400 }
      );
    }

    // Garante que o cliente existe
    const cliente = await queryOne<{ id: number }>(
      'SELECT id FROM clientes WHERE id = ?',
      [clienteId]
    );
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    // Gera chave única no R2
    const timestamp = Date.now();
    const ext = file.name.split('.').pop() || 'bin';
    const r2Key = `clientes/${clienteId}/${timestamp}.${ext}`;

    const r2 = getR2Bucket();
    const arrayBuffer = await file.arrayBuffer();

    await r2.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        originalName: file.name,
        uploadedBy: usuarioIdRaw,
      },
    });

    const result = await execute(
      `INSERT INTO anexos_cliente
        (cliente_id, usuario_id, nome_arquivo, tipo_arquivo, caminho, tamanho, descricao)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [clienteId, usuarioId, titulo, file.type, r2Key, file.size, descricao]
    );

    return NextResponse.json(
      {
        id: result.lastInsertRowid,
        caminho: r2Key,
        message: 'Arquivo enviado com sucesso',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erro ao fazer upload do anexo do cliente:', error);
    return NextResponse.json(
      { error: 'Erro ao fazer upload do arquivo' },
      { status: 500 }
    );
  }
}

// PUT /api/clientes/[id]/anexos — atualiza titulo/descricao do anexo
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id, 10);
    if (isNaN(clienteId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const body = await request.json();
    const anexoId = parseInt(String(body.anexo_id), 10);
    const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : '';
    const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : '';

    if (isNaN(anexoId)) {
      return NextResponse.json({ error: 'anexo_id inválido' }, { status: 400 });
    }

    const anexo = await queryOne<{ id: number; cliente_id: number; nome_arquivo: string }>(
      'SELECT id, cliente_id, nome_arquivo FROM anexos_cliente WHERE id = ?',
      [anexoId]
    );

    if (!anexo) {
      return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 });
    }

    if (anexo.cliente_id !== clienteId) {
      return NextResponse.json(
        { error: 'Anexo não pertence a este cliente' },
        { status: 403 }
      );
    }

    await execute(
      'UPDATE anexos_cliente SET nome_arquivo = ?, descricao = ? WHERE id = ?',
      [titulo || anexo.nome_arquivo, descricao || null, anexoId]
    );

    return NextResponse.json({ message: 'Anexo atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar anexo do cliente:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar anexo' },
      { status: 500 }
    );
  }
}

// DELETE /api/clientes/[id]/anexos?anexo_id=X — remove anexo
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id, 10);
    if (isNaN(clienteId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const anexoIdRaw = searchParams.get('anexo_id');
    if (!anexoIdRaw) {
      return NextResponse.json({ error: 'ID do anexo é obrigatório' }, { status: 400 });
    }
    const anexoId = parseInt(anexoIdRaw, 10);
    if (isNaN(anexoId)) {
      return NextResponse.json({ error: 'anexo_id inválido' }, { status: 400 });
    }

    const anexo = await queryOne<{ caminho: string; cliente_id: number }>(
      'SELECT caminho, cliente_id FROM anexos_cliente WHERE id = ?',
      [anexoId]
    );

    if (!anexo) {
      return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 });
    }

    if (anexo.cliente_id !== clienteId) {
      return NextResponse.json(
        { error: 'Anexo não pertence a este cliente' },
        { status: 403 }
      );
    }

    // Remove do R2 (não falha se o arquivo não existir)
    if (anexo.caminho) {
      try {
        const r2 = getR2Bucket();
        await r2.delete(anexo.caminho);
      } catch (r2Error) {
        console.warn('Erro ao remover arquivo do R2:', r2Error);
      }
    }

    await execute('DELETE FROM anexos_cliente WHERE id = ?', [anexoId]);

    return NextResponse.json({ message: 'Anexo removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover anexo do cliente:', error);
    return NextResponse.json(
      { error: 'Erro ao remover anexo' },
      { status: 500 }
    );
  }
}
