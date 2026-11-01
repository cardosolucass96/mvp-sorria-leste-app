import { NextRequest, NextResponse } from 'next/server';
import { getR2Bucket } from '@/lib/db';
import { withAuth } from '@/lib/auth/middleware';
import { checkStoredAttachmentAccess } from '@/lib/auth/attachmentAccess';

// GET /api/arquivos/[...path] - Serve arquivos do R2
export const GET = withAuth(async (request: NextRequest, context) => {
  try {
    const { path } = await context.params!;
    if (!Array.isArray(path) || path.some(segment => !segment || segment === '.' || segment === '..')) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }
    const r2Key = path.join('/');
    const forbidden = await checkStoredAttachmentAccess(context.user, r2Key);
    if (forbidden) return forbidden;

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
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    
    // Para download, adicionar Content-Disposition
    const { searchParams } = new URL(request.url);
    if (searchParams.get('download') === 'true') {
      const originalName = object.customMetadata?.originalName || r2Key.split('/').pop() || 'arquivo';
      headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);
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
});
