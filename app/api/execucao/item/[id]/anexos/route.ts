import { NextRequest, NextResponse } from 'next/server';
import { query, execute, getR2Bucket } from '@/lib/db';

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

// GET /api/execucao/item/[id]/anexos - Lista anexos do item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const anexos = await query<Anexo>(
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

// POST /api/execucao/item/[id]/anexos - Faz upload de anexo para R2
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

    // Validar tipo de arquivo
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de arquivo não permitido. Use: JPG, PNG, GIF, WebP, MP4, WebM, MOV, PDF ou DOC/DOCX' },
        { status: 400 }
      );
    }

    // Validar tamanho
    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? MAX_SIZE_VIDEO : MAX_SIZE_OTHER;
    if (file.size > maxSize) {
      const maxMB = maxSize / (1024 * 1024);
      return NextResponse.json(
        { error: `Arquivo muito grande. Máximo: ${maxMB}MB` },
        { status: 400 }
      );
    }

    // Gerar chave única para o R2
    const timestamp = Date.now();
    const ext = file.name.split('.').pop() || 'bin';
    const r2Key = `execucao/${id}/${timestamp}.${ext}`;

    // Upload para R2
    const r2 = getR2Bucket();
    const arrayBuffer = await file.arrayBuffer();
    
    await r2.put(r2Key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        originalName: file.name,
        uploadedBy: usuario_id,
      },
    });

    // Registrar no banco (caminho = chave R2)
    const result = await execute(
      `INSERT INTO anexos_execucao 
        (item_atendimento_id, usuario_id, nome_arquivo, tipo_arquivo, caminho, tamanho, descricao)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(id),
        parseInt(usuario_id),
        file.name,
        file.type,
        r2Key,
        file.size,
        descricao || null
      ]
    );

    return NextResponse.json(
      { 
        id: result.lastInsertRowid, 
        caminho: r2Key,
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

    // Buscar caminho do arquivo
    const anexo = await query<{ caminho: string }>(
      'SELECT caminho FROM anexos_execucao WHERE id = ?',
      [parseInt(anexoId)]
    );

    if (anexo.length > 0 && anexo[0].caminho) {
      // Remover do R2
      try {
        const r2 = getR2Bucket();
        await r2.delete(anexo[0].caminho);
      } catch (r2Error) {
        console.warn('Erro ao remover arquivo do R2:', r2Error);
        // Continua mesmo se falhar no R2
      }
    }

    // Remover do banco
    await execute('DELETE FROM anexos_execucao WHERE id = ?', [parseInt(anexoId)]);

    return NextResponse.json({ message: 'Anexo removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover anexo:', error);
    return NextResponse.json(
      { error: 'Erro ao remover anexo' },
      { status: 500 }
    );
  }
}
