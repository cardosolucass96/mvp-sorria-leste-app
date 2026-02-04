import { NextRequest, NextResponse } from 'next/server';
import { getR2Bucket } from '@/lib/db';

// GET /api/arquivos/[...path] - Serve arquivos do R2
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const r2Key = path.join('/');

    const r2 = getR2Bucket();
    const object = await r2.get(r2Key);

    if (!object) {
      return NextResponse.json(
        { error: 'Arquivo não encontrado' },
        { status: 404 }
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Content-Length', object.size.toString());
    headers.set('Cache-Control', 'public, max-age=31536000'); // 1 ano
    
    // Para download, adicionar Content-Disposition
    const { searchParams } = new URL(request.url);
    if (searchParams.get('download') === 'true') {
      const originalName = object.customMetadata?.originalName || r2Key.split('/').pop() || 'arquivo';
      headers.set('Content-Disposition', `attachment; filename="${originalName}"`);
    }

    return new NextResponse(object.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Erro ao buscar arquivo:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar arquivo' },
      { status: 500 }
    );
  }
}
